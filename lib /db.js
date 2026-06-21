// lib/db.js
// Thin wrapper around the Supabase client, plus the booking rules
// (deposit amount, how many patients per slot, how long a pending
// booking holds the slot before it's released).
//
// All of these are easy to tune — change the numbers below or move
// them to environment variables in Vercel if you want to adjust
// pricing/capacity without redeploying code.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // server-side only — never expose this key to the browser
);

const RULES = {
  DEPOSIT_PKR: Number(process.env.DEPOSIT_AMOUNT_PKR || 1000),
  SLOT_CAPACITY: Number(process.env.DAILY_SLOT_CAPACITY || 4), // patients allowed per date+time-window
  HOLD_MINUTES: Number(process.env.PENDING_HOLD_MINUTES || 5), // how long an unpaid request blocks the slot
};

module.exports = { supabase, RULES };
