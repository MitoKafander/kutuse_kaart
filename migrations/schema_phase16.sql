-- Phase 16: Editable display name + OCM usage_cost passthrough
-- Adds user-editable display name (stored in user_profiles) and a raw
-- usage_cost_raw column on ev_chargers so /api/sync-ev-prices can parse
-- OCM tariff text for operators we don't cover with the static table.

alter table user_profiles add column if not exists display_name text;

alter table ev_chargers add column if not exists usage_cost_raw text;

-- Leaderboard views: prefer user_profiles.display_name, fall back to auth metadata, then Anonüümne.

create or replace view v_leaderboard_7d as
select
  p.user_id,
  coalesce(
    (select display_name from user_profiles where id = p.user_id),
    u.raw_user_meta_data->>'display_name',
    'Anonüümne'
  ) as display_name,
  count(distinct p.id) as prices_count,
  coalesce((
    select count(*) from votes v
    where v.vote_type = 'up'
      and v.price_id in (select id from prices where user_id = p.user_id and reported_at > now() - interval '7 days')
      and v.created_at > now() - interval '7 days'
  ), 0) as upvotes_received
from prices p
left join auth.users u on u.id = p.user_id
where p.reported_at > now() - interval '7 days'
  and p.user_id is not null
group by p.user_id, u.raw_user_meta_data
order by prices_count desc
limit 100;

create or replace view v_leaderboard_30d as
select
  p.user_id,
  coalesce(
    (select display_name from user_profiles where id = p.user_id),
    u.raw_user_meta_data->>'display_name',
    'Anonüümne'
  ) as display_name,
  count(distinct p.id) as prices_count,
  coalesce((
    select count(*) from votes v
    where v.vote_type = 'up'
      and v.price_id in (select id from prices where user_id = p.user_id and reported_at > now() - interval '30 days')
      and v.created_at > now() - interval '30 days'
  ), 0) as upvotes_received
from prices p
left join auth.users u on u.id = p.user_id
where p.reported_at > now() - interval '30 days'
  and p.user_id is not null
group by p.user_id, u.raw_user_meta_data
order by prices_count desc
limit 100;

create or replace view v_leaderboard_all as
select
  p.user_id,
  coalesce(
    (select display_name from user_profiles where id = p.user_id),
    u.raw_user_meta_data->>'display_name',
    'Anonüümne'
  ) as display_name,
  count(distinct p.id) as prices_count,
  coalesce((
    select count(*) from votes v
    where v.vote_type = 'up'
      and v.price_id in (select id from prices where user_id = p.user_id)
  ), 0) as upvotes_received
from prices p
left join auth.users u on u.id = p.user_id
where p.user_id is not null
group by p.user_id, u.raw_user_meta_data
order by prices_count desc
limit 100;

grant select on v_leaderboard_7d to anon, authenticated;
grant select on v_leaderboard_30d to anon, authenticated;
grant select on v_leaderboard_all to anon, authenticated;
