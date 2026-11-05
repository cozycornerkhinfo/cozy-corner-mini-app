-- Cozy Corner hybrid ordering: Mini App + Telegram AI bot.
-- Run this migration in the Supabase SQL editor before deploying the functions.

create extension if not exists pgcrypto;

alter table public.orders
  add column if not exists order_source text not null default 'mini_app',
  add column if not exists telegram_chat_id bigint;

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);

create table if not exists public.telegram_sessions (
  telegram_chat_id bigint primary key,
  messages jsonb not null default '[]'::jsonb,
  pending_order jsonb,
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.telegram_sessions enable row level security;

-- Product reads are served by the Edge Function using the server key.
-- No public insert/read policy is granted for orders or Telegram sessions.
-- Never place the Supabase service-role key in the Mini App frontend.
