// The three numbers the growth push is judged on, week by week — plus the
// signals that explain them. Read-only: PostHog (key in ~/.config/kyts/
// posthog.json) and the prices table.
//
//   npm run kpis                 last 8 weeks
//   npm run kpis -- --weeks 12
//
// Targets (set 2026-09-29, see RESUME_HERE "Growth push"): by the 8-week
// checkpoint, a normal week should reach
//   · ≥ 8 contributors other than the owner      (baseline 3–4)
//   · ≥ 40 Estonian stations with a price < 24 h  (baseline ~17; median day)
//   · ≥ 250 sessions                              (baseline ~130–150)
// If steady posting does not move them, that is the answer too.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fetchAll } from './_lib/db.mjs';

const OWNER = '3eac34e5-0db4-4d64-a1e8-e5391f83db4a'; // = KYTS_ADMIN_UID in App.tsx
const TARGETS = { contributors: 8, fresh24: 40, sessions: 250 };

const weeksArg = process.argv.indexOf('--weeks');
const WEEKS = weeksArg > -1 ? Number(process.argv[weeksArg + 1]) : 8;

const DAY = 864e5;
const mondayOf = (t) => {
  const d = new Date(t);
  const m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * DAY;
  return new Date(m).toISOString().slice(0, 10);
};
const thisMonday = mondayOf(Date.now());
const firstMonday = new Date(Date.parse(thisMonday) - (WEEKS - 1) * 7 * DAY).toISOString().slice(0, 10);
const weeks = Array.from({ length: WEEKS }, (_, i) => new Date(Date.parse(firstMonday) + i * 7 * DAY).toISOString().slice(0, 10));
const row = () => ({ sessions: 0, fb: 0, shares: 0, sharedOpens: 0, installShown: 0, installValueShown: 0, installAccepted: 0,
  prices: 0, owner: 0, anon: 0, contributors: new Set(), fresh24: [] });
const W = Object.fromEntries(weeks.map((w) => [w, row()]));

// ── PostHog ───────────────────────────────────────────────────────────────
const cfg = JSON.parse(readFileSync(`${homedir()}/.config/kyts/posthog.json`, 'utf8'));
async function hogql(query) {
  const res = await fetch(`${cfg.host.replace(/\/$/, '')}/api/projects/${cfg.project_id}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.personal_api_key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).results;
}
const since = `toDateTime('${firstMonday}')`;
for (const [wk, n] of await hogql(`select toStartOfWeek(timestamp, 1) as wk, count(distinct properties.$session_id)
    from events where timestamp >= ${since} group by wk`)) if (W[String(wk).slice(0, 10)]) W[String(wk).slice(0, 10)].sessions = n;
for (const [wk, n] of await hogql(`select toStartOfWeek(timestamp, 1) as wk, count(distinct properties.$session_id)
    from events where timestamp >= ${since}
      and coalesce(properties.$initial_referring_domain, properties.$referring_domain, '') like '%facebook%'
    group by wk`)) if (W[String(wk).slice(0, 10)]) W[String(wk).slice(0, 10)].fb = n;
for (const [wk, event, ctx, outcome, ref, accepted, n] of await hogql(`select toStartOfWeek(timestamp, 1) as wk, event,
      properties.context, properties.outcome, properties.ref, properties.accepted, count()
    from events where timestamp >= ${since}
      and event in ('share_clicked', 'deep_link_opened', 'install_prompt_shown', 'install_prompt_result')
    group by wk, event, properties.context, properties.outcome, properties.ref, properties.accepted`)) {
  const w = W[String(wk).slice(0, 10)];
  if (!w) continue;
  if (event === 'share_clicked' && (outcome === 'native' || outcome === 'copied')) w.shares += n;
  if (event === 'deep_link_opened' && ref === 'share') w.sharedOpens += n;
  if (event === 'install_prompt_shown') { w.installShown += n; if (ctx === 'value') w.installValueShown += n; }
  if (event === 'install_prompt_result' && (accepted === true || accepted === 'true')) w.installAccepted += n;
}

// ── Prices ────────────────────────────────────────────────────────────────
const ee = new Set((await fetchAll('stations', 'id', (q) => q.eq('active', true).eq('country', 'EE'))).map((s) => s.id));
const pr = await fetchAll('prices', 'station_id, user_id, reported_at',
  (q) => q.gte('reported_at', new Date(Date.parse(firstMonday) - DAY).toISOString()));
for (const p of pr) {
  const w = W[mondayOf(p.reported_at)];
  if (!w) continue;
  w.prices++;
  if (p.user_id === OWNER) w.owner++;
  else if (!p.user_id) w.anon++;
  else w.contributors.add(p.user_id);
}
// Estonian stations with a price in the 24 h before the end of each day; the
// week's figure is the median day, which one busy Friday cannot inflate.
const eeTimes = pr.filter((p) => ee.has(p.station_id)).map((p) => [p.station_id, Date.parse(p.reported_at)]);
for (const w of weeks) {
  for (let d = 1; d <= 7; d++) {
    const end = Date.parse(w) + d * DAY;
    if (end > Date.now() + DAY) break;
    const s = new Set();
    for (const [id, t] of eeTimes) if (t <= end && t > end - DAY) s.add(id);
    W[w].fresh24.push(s.size);
  }
}
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// ── Report ────────────────────────────────────────────────────────────────
const cols = ['week', 'sessions', 'fb', 'contrib*', 'fresh24', 'prices', 'owner', 'anon', 'shares', 'sharedOpen', 'install(value)', 'accepted'];
console.log(cols.map((c, i) => (i ? c.padStart(i === 10 ? 16 : 11) : c.padEnd(12))).join(''));
for (const w of weeks) {
  const r = W[w];
  const cells = [r.sessions, r.fb, r.contributors.size, median(r.fresh24) ?? '—', r.prices, r.owner, r.anon, r.shares, r.sharedOpens,
    `${r.installShown}(${r.installValueShown})`, r.installAccepted];
  const label = w === thisMonday ? `${w}~` : w;
  console.log(label.padEnd(12) + cells.map((c, i) => String(c).padStart(i === 9 ? 16 : 11)).join(''));
}
console.log('\n* contributors other than the owner.  ~ = week in progress.  fresh24 = median day of EE stations priced < 24 h.');
const last = weeks[weeks.length - 2];
if (last) {
  const r = W[last];
  const mark = (ok) => (ok ? '✓' : '✗');
  console.log(`\nLast full week (${last}) vs targets:`);
  console.log(`  ${mark(r.contributors.size >= TARGETS.contributors)} contributors besides the owner  ${r.contributors.size} / ${TARGETS.contributors}`);
  console.log(`  ${mark((median(r.fresh24) ?? 0) >= TARGETS.fresh24)} EE stations fresh < 24 h (median)  ${median(r.fresh24)} / ${TARGETS.fresh24}`);
  console.log(`  ${mark(r.sessions >= TARGETS.sessions)} sessions                           ${r.sessions} / ${TARGETS.sessions}`);
}
