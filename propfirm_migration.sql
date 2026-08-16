-- InzakiFX Prop Firm Mode migration
-- Run this ONCE in Supabase SQL Editor.
alter table public.profiles
add column if not exists prop_settings jsonb not null default
'{"account":5000,"targetPct":6,"maxDDPct":4,"dailyLossPct":2,"consistencyPct":20,"buffer":100}'::jsonb;
