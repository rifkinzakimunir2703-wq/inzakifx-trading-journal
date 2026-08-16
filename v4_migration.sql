-- InzakiFX V4 migration: Prop Firm Accounts + Payouts
alter table public.trades add column if not exists account_id uuid;
create table if not exists public.prop_accounts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 firm text not null, account_name text not null, account_size numeric not null default 0,
 purchase_fee numeric not null default 0, status text not null default 'Phase 1',
 target_pct numeric not null default 6, max_dd_pct numeric not null default 4,
 daily_loss_pct numeric not null default 2, consistency_pct numeric not null default 20,
 start_date date, notes text, created_at timestamptz not null default now()
);
create table if not exists public.payouts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 account_id uuid not null references public.prop_accounts(id) on delete cascade,
 amount numeric not null default 0, payout_date date not null default current_date,
 status text not null default 'Paid', note text, created_at timestamptz not null default now()
);
alter table public.prop_accounts enable row level security;
alter table public.payouts enable row level security;
alter table public.trades enable row level security;
drop policy if exists "prop_accounts_select" on public.prop_accounts;
drop policy if exists "prop_accounts_insert" on public.prop_accounts;
drop policy if exists "prop_accounts_update" on public.prop_accounts;
drop policy if exists "prop_accounts_delete" on public.prop_accounts;
create policy "prop_accounts_select" on public.prop_accounts for select to authenticated using (auth.uid()=user_id);
create policy "prop_accounts_insert" on public.prop_accounts for insert to authenticated with check (auth.uid()=user_id);
create policy "prop_accounts_update" on public.prop_accounts for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "prop_accounts_delete" on public.prop_accounts for delete to authenticated using (auth.uid()=user_id);
drop policy if exists "payouts_select" on public.payouts;
drop policy if exists "payouts_insert" on public.payouts;
drop policy if exists "payouts_update" on public.payouts;
drop policy if exists "payouts_delete" on public.payouts;
create policy "payouts_select" on public.payouts for select to authenticated using (auth.uid()=user_id);
create policy "payouts_insert" on public.payouts for insert to authenticated with check (auth.uid()=user_id);
create policy "payouts_update" on public.payouts for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "payouts_delete" on public.payouts for delete to authenticated using (auth.uid()=user_id);
