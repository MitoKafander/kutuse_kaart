// /linn/:slug and /maakond/:slug — see api/_lib/landing.ts for why these are
// standalone pages rendered live rather than the design doc's hybrid.
//
// vercel.json rewrites the pretty URLs here with ?kind=&slug=, so the address
// bar keeps the pretty path and this is the only thing that answers them.

import { buildCityPage, buildCountyPage, render404, renderHtml, supabaseAdmin } from './_lib/landing.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

type NodeReq = { method?: string; query?: Record<string, string | string[] | undefined> };
type NodeRes = {
  status: (code: number) => NodeRes;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function handler(req: NodeReq, res: NodeRes) {
  const kind = one(req.query?.kind);
  const raw = one(req.query?.slug);
  const slug = raw.toLowerCase().replace(/\/+$/, '');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  // A valid place in the wrong case gets ONE canonical URL, not a second 200.
  if (raw && raw !== slug) {
    res.setHeader('Location', `/${kind === 'city' ? 'linn' : 'maakond'}/${slug}`);
    return res.status(301).send('');
  }

  try {
    const sb = supabaseAdmin();
    const page = kind === 'city' ? await buildCityPage(sb, slug)
      : kind === 'county' ? await buildCountyPage(sb, slug)
      : ({ status: 404 } as const);
    if (page.status === 404) {
      // A real 404, never a soft-200 thin page for an arbitrary slug.
      res.setHeader('Cache-Control', 'public, s-maxage=3600');
      return res.status(404).send(render404());
    }
    // Ten minutes at the edge: the page's own promise is "last 7 days", so
    // this bounds staleness far inside it while keeping the DB off the hot path.
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=600');
    return res.status(200).send(renderHtml(page));
  } catch (e) {
    console.error('landing render failed', e);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).send(render404().replace('Lehte ei leitud', 'Midagi läks valesti'));
  }
}
