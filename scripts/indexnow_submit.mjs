// Tell Bing / Yandex / Seznam / Naver about Kyts's indexable pages via IndexNow
// (https://www.indexnow.org). No account: ownership is proven by the key file
// public/<key>.txt, which must stay deployed. Google does not take IndexNow —
// it reads /sitemap.xml, submitted once in Search Console.
//
//   node scripts/indexnow_submit.mjs          submit what the live sitemap lists
//
// Re-run when a county first becomes indexable. Submitting the same URLs again
// is harmless, but IndexNow asks not to spam unchanged pages.

const KEY = 'a5d2215c5ea421aa4437f5cf0baf8e23';
const HOST = 'kyts.ee';

const xml = await (await fetch('https://kyts.ee/sitemap.xml')).text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urls.length) throw new Error('sitemap listed no URLs — refusing to submit an empty set');

const keyCheck = await fetch(`https://${HOST}/${KEY}.txt`);
if ((await keyCheck.text()).trim() !== KEY) throw new Error('key file not live yet — deploy first');

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
});
console.log(`IndexNow: HTTP ${res.status} for ${urls.length} URL(s)`);
for (const u of urls) console.log('  ' + u);
// 200 = accepted, 202 = accepted, key validation pending. Anything else is a failure.
if (res.status !== 200 && res.status !== 202) { console.log(await res.text()); process.exit(1); }
