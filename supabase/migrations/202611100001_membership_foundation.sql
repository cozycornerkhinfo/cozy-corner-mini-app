-- Cozy Corner Membership & Loyalty foundation
-- All privileged writes are expected to go through trusted Supabase Edge Functions.

create extension if not exists pgcrypto;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  member_code text not null unique default ('CC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  full_name text not null,
  phone_e164 text not null unique,
  telegram_user_id bigint unique,
  status text not null default 'active' check (status in ('active', 'blocked', 'deleted')),
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  leaderboard_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tier_rules (
  id uuid primary key default gen_random_uuid(),
  tier_key text not null unique,
  display_name text not null,
  min_lifetime_net_spend numeric(12,2) not null default 0 check (min_lifetime_net_spend >= 0),
  benefits_description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.tier_rules (tier_key, display_name, min_lifetime_net_spend, benefits_description, sort_order)
values
  ('bronze', 'Bronze', 0, 'Member-only updates and offers', 1),
  ('silver', 'Silver', 500, 'Silver member benefits', 2),
  ('gold', 'Gold', 1000, 'Gold member benefits', 3),
  ('vip', 'VIP', 2000, 'VIP experiences and special offers', 4)
on conflict (tier_key) do nothing;

create table if not exists public.sales_transactions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  source text not null default 'pos',
  source_order_id text,
  kind text not null check (kind in ('purchase', 'refund')),
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null,
  status text not null default 'posted' check (status in ('posted', 'void')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (source, source_order_id, kind)
);

create index if not exists sales_transactions_member_date_idx
  on public.sales_transactions (member_id, occurred_at desc) where status = 'posted';

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  reward_type text not null,
  title text not null,
  points_cost integer check (points_cost is null or points_cost >= 0),
  discount_value numeric(12,2),
  status text not null default 'available' check (status in ('available', 'redeemed', 'expired', 'cancelled')),
  expires_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.member_preferences (
  member_id uuid primary key references public.members(id) on delete cascade,
  telegram_notifications boolean not null default true,
  web_notifications boolean not null default true,
  leaderboard_visibility boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  audience jsonb not null default '{"type":"all"}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  member_id uuid not null references public.members(id) on delete cascade,
  channel text not null check (channel in ('telegram', 'web')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed', 'skipped')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists notification_log_campaign_idx
  on public.notification_log (campaign_id, status);

-- Customer reads are scoped to their own authenticated member record.
-- No customer-facing insert/update policy is provided for financial or loyalty data.
alter table public.members enable row level security;
alter table public.tier_rules enable row level security;
alter table public.sales_transactions enable row level security;
alter table public.rewards enable row level security;
alter table public.member_preferences enable row level security;
alter table public.campaigns enable row level security;
alter table public.notification_log enable row level security;

drop policy if exists "members_read_own_profile" on public.members;
create policy "members_read_own_profile" on public.members
  for select to authenticated using (auth_user_id = auth.uid());

drop policy if exists "active_tiers_readable" on public.tier_rules;
create policy "active_tiers_readable" on public.tier_rules
  for select to authenticated using (is_active = true);

drop policy if exists "members_read_own_transactions" on public.sales_transactions;
create policy "members_read_own_transactions" on public.sales_transactions
  for select to authenticated using (
    exists (select 1 from public.members m where m.id = member_id and m.auth_user_id = auth.uid())
  );

drop policy if exists "members_read_own_rewards" on public.rewards;
create policy "members_read_own_rewards" on public.rewards
  for select to authenticated using (
    exists (select 1 from public.members m where m.id = member_id and m.auth_user_id = auth.uid())
  );

drop policy if exists "members_read_own_preferences" on public.member_preferences;
create policy "members_read_own_preferences" on public.member_preferences
  for select to authenticated using (
    exists (select 1 from public.members m where m.id = member_id and m.auth_user_id = auth.uid())
  );

drop policy if exists "members_read_own_notifications" on public.notification_log;
create policy "members_read_own_notifications" on public.notification_log
  for select to authenticated using (
    exists (select 1 from public.members m where m.id = member_id and m.auth_user_id = auth.uid())
  );

-- Campaigns are admin-only; no authenticated customer policy is intentionally added.
