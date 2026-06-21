// lib/email.js
// Sends the automatic confirmation email once a deposit is verified paid.
// Uses Resend (resend.com) — free tier covers a clinic's volume easily,
// and setup is just one API key. Swap this file out if you'd rather use
// SendGrid/Postmark/etc — the rest of the system doesn't care.

const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.NOTIFY_FROM_EMAIL || 'Alshifa Health Care <booking@alshifahealthcare.pk>';
const DOCTOR_EMAIL = process.env.DOCTOR_NOTIFY_EMAIL || 'ghufranali36@gmail.com';
const CLINIC_WHATSAPP = 'https://wa.me/c/923032126899';

function formatSlot(date, slot) {
  const label = { morning: 'Morning (9 AM – 12 PM)', afternoon: 'Afternoon (12 PM – 4 PM)', evening: 'Evening (4 PM – 7 PM)' };
  return `${date} — ${label[slot] || slot}`;
}

async function sendPatientConfirmation(booking) {
  if (!booking.email) return; // email is optional on the form — skip silently if not provided
  await resend.emails.send({
    from: FROM,
    to: booking.email,
    subject: 'Your appointment is confirmed — Alshifa Health Care Clinic',
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color:#222;">
        <h2 style="color:#b8942d;">Appointment Confirmed ✅</h2>
        <p>Dear ${booking.name},</p>
        <p>Your deposit of <strong>Rs. ${booking.deposit_amount}</strong> has been received and your appointment
        with <strong>Dr GA Siddiqui</strong> is now booked.</p>
        <p><strong>Date & Time:</strong> ${formatSlot(booking.appointment_date, booking.time_slot)}<br/>
        <strong>Type:</strong> ${booking.booking_type === 'clinic' ? 'In-person clinic visit' : 'Online consultation'}<br/>
        <strong>Reference:</strong> ${booking.order_ref}</p>
        <p>If you have any questions before your visit, message us directly:
        <a href="${CLINIC_WHATSAPP}">WhatsApp the clinic</a></p>
        <p>— Alshifa Health Care Clinic, Mirpurkhas</p>
      </div>
    `,
  });
}

async function sendDoctorNotification(booking) {
  await resend.emails.send({
    from: FROM,
    to: DOCTOR_EMAIL,
    subject: `New paid booking: ${booking.name} — ${formatSlot(booking.appointment_date, booking.time_slot)}`,
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color:#222;">
        <h2>New Confirmed Booking</h2>
        <p><strong>Name:</strong> ${booking.name}<br/>
        <strong>Phone:</strong> ${booking.phone}<br/>
        <strong>Age:</strong> ${booking.age || '—'}<br/>
        <strong>Type:</strong> ${booking.booking_type}<br/>
        <strong>Slot:</strong> ${formatSlot(booking.appointment_date, booking.time_slot)}<br/>
        <strong>Deposit paid:</strong> Rs. ${booking.deposit_amount} (Ref: ${booking.order_ref})</p>
        <p><strong>Concern:</strong><br/>${booking.concern}</p>
      </div>
    `,
  });
}

module.exports = { sendPatientConfirmation, sendDoctorNotification };
