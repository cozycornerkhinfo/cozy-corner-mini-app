create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  note text,
  currency text not null default 'USD',
  items jsonb not null,
  total numeric(10,2) not null,
  telegram_user jsonb,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.orders enable row level security;

-- Add carefully scoped policies in a later setup step.
-- Do not expose service_role keys in the Mini App frontend.
