// Dynamic sitemap: the homepage plus every landing page that is currently
// INDEXABLE (enough fresh prices). A page below the bar still renders for a
// shared link but is noindex, and listing it here would contradict that.
// lastmod is the page's freshest price, which is the truthful answer to "when
// did this page's content last change".

import { buildCityPage, buildCountyPage, CITY_SLUGS, listCounties, supabaseAdmin } from './_lib/landing.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

type NodeRes = {
  status: (code: number) => NodeRes;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
};

export default async function handler(_req: unknown, res: NodeRes) {
  const urls: Array<{ loc: string; lastmod?: string }> = [{ loc: 'https://kyts.ee/' }];
  try {
    const sb = supabaseAdmin();
    const counties = await listCounties(sb);
    const pages = await Promise.all([
      ...CITY_SLUGS.map((s) => buildCityPage(sb, s)),
      ...counties.map((c) => buildCountyPage(sb, c.slug)),
    ]);
    for (const p of pages) {
      if (p.status === 200 && p.indexable) urls.push({ loc: p.canonical, lastmod: p.freshest ?? undefined });
    }
  } catch (e) {
    // Degrade to the homepage alone rather than 500 — a failing sitemap fetch
    // is reported in Search Console, a short one is not an error.
    console.error('sitemap build failed', e);
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=600');
  return res.status(200).send(body);
}
