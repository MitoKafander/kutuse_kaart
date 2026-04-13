-- Phase 13: Loyalty card discounts per brand (flat cents off, per user)

create table if not exists user_loyalty_discounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand text not null,
  discount_cents numeric(5,2) not null check (discount_cents >= 0 and discount_cents <= 50),
  created_at timestamptz default now(),
  unique(user_id, brand)
);

alter table user_loyalty_discounts enable row level security;

create policy "Users can read own loyalty discounts"
  on user_loyalty_discounts for select
  using (auth.uid() = user_id);

create policy "Users can insert own loyalty discounts"
  on user_loyalty_discounts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own loyalty discounts"
  on user_loyalty_discounts for update
  using (auth.uid() = user_id);

create policy "Users can delete own loyalty discounts"
  on user_loyalty_discounts for delete
  using (auth.uid() = user_id);

-- Global flag on user_profiles controlling whether net prices are shown by default
alter table user_profiles
  add column if not exists apply_loyalty boolean default true;
