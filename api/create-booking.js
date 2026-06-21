// api/create-booking.js
// POST /api/create-booking
// Body: { name, phone, easypaisaAccount, email, age, concern, bookingType, date, timeSlot }
//
// 1. Re-checks the slot isn't full (race-condition safe enough for a small
//    clinic's volume — for very high traffic you'd want a DB-level lock too).
// 2. Creates a "pending" booking row that temporarily holds the slot.
// 3. Sends the payment request to the patient's EasyPaisa app.
// 4. Returns the booking id so the frontend can poll /api/booking-status.

const crypto = require('crypto');
const { supabase, RULES } = require('../lib/db');
const { initiateMATransaction } = require('../lib/easypaisa');

function generateOrderRef() {
  return `AHC-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    name, phone, easypaisaAccount, email, age, concern,
    bookingType, date, timeSlot,
  } = req.body || {};

  if (!name || !phone || !easypaisaAccount || !concern || !bookingType || !date || !timeSlot) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  if (!['online', 'clinic'].includes(bookingType)) {
    return res.status(400).json({ error: 'Invalid booking type.' });
  }
  if (!['morning', 'afternoon', 'evening'].includes(timeSlot)) {
    return res.status(400).json({ error: 'Invalid time slot.' });
  }

  // Release any stale holds before checking capacity.
  await supabase
    .from('bookings')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString());

  const { count, error: countErr } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('appointment_date', date)
    .eq('time_slot', timeSlot)
    .in('status', ['pending', 'confirmed']);

  if (countErr) return res.status(500).json({ error: countErr.message });
  if (count >= RULES.SLOT_CAPACITY) {
    return res.status(409).json({ error: 'That slot just filled up — please pick another time.' });
  }

  const orderRef = generateOrderRef();
  const expiresAt = new Date(Date.now() + RULES.HOLD_MINUTES * 60_000).toISOString();

  const { data: booking, error: insertErr } = await supabase
    .from('bookings')
    .insert({
      order_ref: orderRef,
      name,
      phone,
      easypaisa_account: easypaisaAccount,
      email,
      age: age || null,
      concern,
      booking_type: bookingType,
      appointment_date: date,
      time_slot: timeSlot,
      deposit_amount: RULES.DEPOSIT_PKR,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (insertErr) return res.status(500).json({ error: insertErr.message });

  // Kick off the EasyPaisa payment request to the patient's phone.
  let easypaisaResult;
  try {
    easypaisaResult = await initiateMATransaction({
      orderRef,
      amount: RULES.DEPOSIT_PKR,
      mobileAccountNo: easypaisaAccount,
      email,
    });
  } catch (err) {
    await supabase.from('bookings').update({ status: 'failed' }).eq('order_ref', orderRef);
    return res.status(502).json({ error: 'Could not reach EasyPaisa right now. Please try again.' });
  }

  if (!easypaisaResult.accepted) {
    await supabase.from('bookings').update({ status: 'failed' }).eq('order_ref', orderRef);
    return res.status(402).json({ error: 'EasyPaisa rejected the request — check the mobile account number and try again.' });
  }

  res.status(200).json({
    bookingId: booking.id,
    orderRef,
    depositAmount: RULES.DEPOSIT_PKR,
    holdMinutes: RULES.HOLD_MINUTES,
  });
};
