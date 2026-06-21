// api/booking-status.js
// GET /api/booking-status?orderRef=AHC-...
// The frontend calls this every few seconds after submitting the form.
// While status is "pending" and not yet expired, we actively re-check with
// EasyPaisa (the customer may have just approved the request on their phone).
// Once it flips to "confirmed", we send the emails — exactly once, guarded
// by only doing it on the transition (status was pending, now success).

const { supabase, RULES } = require('../lib/db');
const { inquireTransactionStatus } = require('../lib/easypaisa');
const { sendPatientConfirmation, sendDoctorNotification } = require('../lib/email');

module.exports = async (req, res) => {
  const { orderRef } = req.query;
  if (!orderRef) return res.status(400).json({ error: 'orderRef is required.' });

  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('order_ref', orderRef)
    .single();

  if (error || !booking) return res.status(404).json({ error: 'Booking not found.' });

  if (booking.status !== 'pending') {
    // Already settled (confirmed/failed/expired) — just report it.
    return res.status(200).json({ status: booking.status });
  }

  if (new Date(booking.expires_at) < new Date()) {
    await supabase.from('bookings').update({ status: 'expired' }).eq('order_ref', orderRef);
    return res.status(200).json({ status: 'expired' });
  }

  // Still pending and still within the hold window — ask EasyPaisa for the
  // real status (the patient may have just approved it in their app).
  const result = await inquireTransactionStatus(orderRef);

  if (result === 'success') {
    const { data: updated } = await supabase
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('order_ref', orderRef)
      .eq('status', 'pending') // guards against double-sending if two polls land at once
      .select()
      .single();

    if (updated) {
      await Promise.all([
        sendPatientConfirmation(updated),
        sendDoctorNotification(updated),
      ]);
    }
    return res.status(200).json({ status: 'confirmed' });
  }

  if (result === 'failed') {
    await supabase.from('bookings').update({ status: 'failed' }).eq('order_ref', orderRef);
    return res.status(200).json({ status: 'failed' });
  }

  return res.status(200).json({ status: 'pending' });
};
