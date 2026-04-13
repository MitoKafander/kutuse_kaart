import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

// Weekly cron: refreshes ev_prices from two sources.
//
// 1) Hardcoded OPERATOR_TARIFFS table — keyed on ev_chargers.operator.
//    Covers the major Estonian CPOs. Update quarterly:
//    - visit each source_url, confirm the ad-hoc (no-subscription) price,
//    - bump price_per_kwh and verified_at.
//
// 2) Fallback: parse ev_chargers.usage_cost_raw (free-text from OCM) for
//    any charger whose operator is not in the tariff table.
//
// Rows are written with source = 'operator_static' | 'ocm_parsed' and are
// refreshed (delete + re-insert) on every run.

type Tariff = {
  match: (operator: string) => boolean;
  price_per_kwh: number;
  tariff_name: string;
  source_url: string;
  verified_at: string; // YYYY-MM-DD
};

const OPERATOR_TARIFFS: Tariff[] = [
  {
    match: op => /enefit/i.test(op),
    price_per_kwh: 0.29,
    tariff_name: 'Enefit Volt avalik',
    source_url: 'https://enefit.ee/et/era/avalik-laadimine',
    verified_at: '2026-04-13',
  },
  {
    match: op => /eleport/i.test(op),
    price_per_kwh: 0.33,
    tariff_name: 'Eleport avalik',
    source_url: 'https://eleport.ee/hinnakiri',
    verified_at: '2026-04-13',
  },
  {
    match: op => /alexela/i.test(op),
    price_per_kwh: 0.31,
    tariff_name: 'Alexela Electric avalik',
    source_url: 'https://www.alexela.ee/et/era/elektriauto-laadimine',
    verified_at: '2026-04-13',
  },
  {
    match: op => /ionity/i.test(op),
    price_per_kwh: 0.69,
    tariff_name: 'Ionity ad-hoc',
    source_url: 'https://ionity.eu/network/pricing',
    verified_at: '2026-04-13',
  },
  {
    match: op => /virta/i.test(op),
    price_per_kwh: 0.35,
    tariff_name: 'Virta avalik',
    source_url: 'https://www.virta.global/price-list',
    verified_at: '2026-04-13',
  },
];

function parsePricePerKwh(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(/(\d+[.,]\d{1,4})\s*(?:€|EUR|eur)?\s*\/?\s*kwh/i)
    || text.match(/€\s*(\d+[.,]\d{1,4})\s*\/?\s*kwh/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return isFinite(v) && v > 0 && v < 2 ? v : null;
}

export default async function handler(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return new Response('Missing Supabase env', { status: 500 });

  const supabase = createClient(url, serviceKey);

  const { data: chargers, error: cErr } = await supabase
    .from('ev_chargers')
    .select('id, operator, usage_cost_raw');
  if (cErr) return new Response(`ev_chargers read: ${cErr.message}`, { status: 500 });

  await supabase.from('ev_prices').delete().in('source', ['operator_static', 'ocm_parsed']);

  const now = new Date().toISOString();
  const rows: any[] = [];
  let staticCount = 0;
  let parsedCount = 0;

  for (const c of chargers ?? []) {
    const op = c.operator || '';
    const tariff = op ? OPERATOR_TARIFFS.find(t => t.match(op)) : undefined;
    if (tariff) {
      rows.push({
        charger_id: c.id,
        connector_type: null,
        price_per_kwh: tariff.price_per_kwh,
        tariff_name: tariff.tariff_name,
        source: 'operator_static',
        reported_at: now,
      });
      staticCount++;
      continue;
    }
    const parsed = parsePricePerKwh(c.usage_cost_raw);
    if (parsed) {
      rows.push({
        charger_id: c.id,
        connector_type: null,
        price_per_kwh: parsed,
        tariff_name: 'OCM text',
        source: 'ocm_parsed',
        reported_at: now,
      });
      parsedCount++;
    }
  }

  if (rows.length) {
    const { error: iErr } = await supabase.from('ev_prices').insert(rows);
    if (iErr) return new Response(`ev_prices insert: ${iErr.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({
    chargers: chargers?.length ?? 0,
    operator_static: staticCount,
    ocm_parsed: parsedCount,
  }), { headers: { 'Content-Type': 'application/json' } });
}
