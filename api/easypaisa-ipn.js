// api/easypaisa-ipn.js
// EasyPaisa's "Instant Payment Notification" — if your merchant pack
// includes a configurable IPN/webhook URL, point it at:
//   https://<your-domain>/api/easypaisa-ipn
// This makes confirmation near-instant instead of waiting for the next
// poll from /api/booking-status (which still works fine as a backup —
// this endpoint is optional, not required, for the system to function).
//
// ⚠️ Confirm the exact payload shape and any signature/hash EasyPaisa sends
// with your integration manager, and verify it below before trusting it —
// never mark a booking paid from an unverified webhook call.

const { supabase } = require('../lib/db');
const { sendPatientConfirmation, sendDoctorNotification } = require('../lib/email');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { orderRefNum, status } = req.body || {};
  if (!orderRefNum) return res.status(400).end();

  // TODO: verify EasyPaisa's signature/hash on this payload here before
  // trusting it (field name and algorithm — confirm with your merchant pack).

  if (status === 'Success' || status === 'PAID') {
    const { data: updated } = await supabase
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('order_ref', orderRefNum)
      .eq('status', 'pending')
      .select()
      .single();

    if (updated) {
      await Promise.all([
        sendPatientConfirmation(updated),
        sendDoctorNotification(updated),
      ]);
    }
  } else {
    await supabase
      .from('bookings')
      .update({ status: 'failed' })
      .eq('order_ref', orderRefNum)
      .eq('status', 'pending');
  }

  res.status(200).end(); // EasyPaisa just needs a 200 to know it was received
};
