-- Server-side aggregate for the market-insight cron. Replaces a row-pulling
-- pattern (`select price ... limit 5000`) that PostgREST silently caps at 1000
-- rows once the EE submission rate grows past that ceiling — at which point
-- the cron's "today vs prev7 vs prev30" averages would start biasing toward
-- whichever 1000 rows PostgREST happened to return first. The aggregate keeps
-- the math correct regardless of table size and ships only one row per call.
--
-- Window semantics match the caller: half-open [from, to). When `p_to` is
-- null, the window has no upper bound (used for the "today" / last-2-days
-- slice in the cron).
--
-- SECURITY INVOKER (default) — RLS on `prices` and `stations` is wide-open
-- SELECT, and the cron uses the service-role key anyway. No EXECUTE grant to
-- public; only roles that already have read on prices/stations.

create or replace function get_kyts_fuel_window_avg(
  p_fuel_type text,
  p_from      timestamptz,
  p_to        timestamptz default null
) returns table (
  mean         numeric,
  sample_count bigint
)
language sql
stable
as $$
  select avg(p.price)::numeric  as mean,
         count(*)::bigint        as sample_count
  from prices p
  join stations s on s.id = p.station_id
  where p.fuel_type = p_fuel_type
    and s.country   = 'EE'
    and p.reported_at >= p_from
    and (p_to is null or p.reported_at < p_to);
$$;

grant execute on function get_kyts_fuel_window_avg(text, timestamptz, timestamptz)
  to anon, authenticated, service_role;
