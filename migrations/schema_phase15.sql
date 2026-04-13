-- Phase 15: Leaderboard views
-- Three time-windowed rankings of contributors.
-- Score = prices_count + 0.3 * upvotes_received

create or replace view v_leaderboard_7d as
select
  p.user_id,
  coalesce(u.raw_user_meta_data->>'display_name', 'Anonüümne') as display_name,
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
  coalesce(u.raw_user_meta_data->>'display_name', 'Anonüümne') as display_name,
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
  coalesce(u.raw_user_meta_data->>'display_name', 'Anonüümne') as display_name,
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
