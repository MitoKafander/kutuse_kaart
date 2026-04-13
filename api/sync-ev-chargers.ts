import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

// Daily cron: pulls Estonia EV chargers from Open Charge Map,
// upserts ev_chargers rows, and parses €/kWh from UsageCost when present.

const OCM_URL = 'https://api.openchargemap.io/v3/poi?countrycode=EE&maxresults=5000&compact=true&verbose=false';

type OcmPoi = {
  ID: number;
  AddressInfo?: { Title?: string; Latitude: number; Longitude: number };
  OperatorInfo?: { Title?: string } | null;
  UsageCost?: string | null;
  Connections?: Array<{
    ConnectionType?: { Title?: string } | null;
    PowerKW?: number | null;
    Quantity?: number | null;
  }>;
  DateLastStatusUpdate?: string;
};

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

  const ocmKey = process.env.OCM_API_KEY;
  const res = await fetch(OCM_URL, {
    headers: ocmKey ? { 'X-API-Key': ocmKey } : {},
  });
  if (!res.ok) return new Response(`OCM ${res.status}`, { status: 502 });
  const pois = await res.json() as OcmPoi[];

  const chargerRows = pois
    .filter(p => p.AddressInfo && typeof p.AddressInfo.Latitude === 'number')
    .map(p => {
      const conns = (p.Connections || [])
        .filter(c => c.ConnectionType?.Title)
        .map(c => ({
          type: c.ConnectionType!.Title,
          kw: c.PowerKW ?? null,
          count: c.Quantity ?? 1,
        }));
      const maxKw = conns.reduce((m, c) => (c.kw && c.kw > m ? c.kw : m), 0);
      return {
        id: `ocm:${p.ID}`,
        operator: p.OperatorInfo?.Title ?? null,
        name: p.AddressInfo!.Title ?? null,
        latitude: p.AddressInfo!.Latitude,
        longitude: p.AddressInfo!.Longitude,
        connectors: conns,
        max_kw: maxKw || null,
        source: 'ocm' as const,
        source_url: `https://openchargemap.org/site/poi/details/${p.ID}`,
        usage_cost_raw: p.UsageCost ?? null,
        updated_at: new Date().toISOString(),
      };
    });

  const priceRows: any[] = [];
  for (const p of pois) {
    const pricePerKwh = parsePricePerKwh(p.UsageCost);
    if (!pricePerKwh) continue;
    const dcConn = (p.Connections || []).find(c => {
      const t = c.ConnectionType?.Title || '';
      return /CCS|CHAdeMO/i.test(t);
    });
    priceRows.push({
      charger_id: `ocm:${p.ID}`,
      connector_type: dcConn ? 'CCS' : 'AC',
      price_per_kwh: pricePerKwh,
      tariff_name: 'Public',
      source: 'ocm',
      reported_at: new Date().toISOString(),
    });
  }

  const { error: cErr } = await supabase.from('ev_chargers').upsert(chargerRows, { onConflict: 'id' });
  if (cErr) return new Response(`ev_chargers: ${cErr.message}`, { status: 500 });

  if (priceRows.length) {
    await supabase.from('ev_prices').insert(priceRows);
  }

  return new Response(JSON.stringify({ chargers: chargerRows.length, prices: priceRows.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
