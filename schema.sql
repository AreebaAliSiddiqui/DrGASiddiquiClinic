-- Run this once in your Supabase project's SQL editor (or any Postgres database).
-- Project: Alshifa Health Care Clinic — booking automation

create extension if not exists "pgcrypto";

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  order_ref text unique not null,           -- our own reference, sent to EasyPaisa as orderId
  easypaisa_txn_id text,                     -- transaction id EasyPaisa gives back
  name text not null,
  phone text not null,                       -- contact number (WhatsApp/general)
  easypaisa_account text not null,           -- the EasyPaisa mobile account number being charged
  email text,
  age int,
  concern text not null,
  booking_type text not null check (booking_type in ('online','clinic')),
  appointment_date date not null,
  time_slot text not null check (time_slot in ('morning','afternoon','evening')),
  deposit_amount numeric not null default 1000,
  status text not null default 'pending'     -- pending -> confirmed | failed | expired
    check (status in ('pending','confirmed','failed','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null            -- pending bookings older than this no longer hold the slot
);

-- Speeds up the "how many people already hold this date+slot" check
create index if not exists idx_bookings_slot
  on bookings (appointment_date, time_slot, status);

-- Speeds up status polling from the frontend
create index if not exists idx_bookings_order_ref
  on bookings (order_ref);
