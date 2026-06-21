// api/available-slots.js
// GET /api/available-slots?date=2026-06-25
// Returns remaining capacity per time window, so the frontend can grey out
// full slots before the patient even starts filling the form.

const { supabase, RULES } = require('../lib/db');

module.exports = async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required, e.g. ?date=2026-06-25' });

  // Release expired holds first so they don't count against capacity.
  await supabase
    .from('bookings')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString());

  const { data, error } = await supabase
    .from('bookings')
    .select('time_slot')
    .eq('appointment_date', date)
    .in('status', ['pending', 'confirmed']);

  if (error) return res.status(500).json({ error: error.message });

  const counts = { morning: 0, afternoon: 0, evening: 0 };
  for (const row of data) counts[row.time_slot] = (counts[row.time_slot] || 0) + 1;

  const result = {};
  for (const slot of ['morning', 'afternoon', 'evening']) {
    result[slot] = {
      remaining: Math.max(0, RULES.SLOT_CAPACITY - counts[slot]),
      full: counts[slot] >= RULES.SLOT_CAPACITY,
    };
  }

  res.status(200).json(result);
};
