# Kyts — RESUME HERE

Operational quick-start for a fresh/parallel session. Depth lives in `CHANGELOG.md` and workspace memory (`memory/project_kutuse_kaart.md`); this is just enough to get going.

## Reconnect / access
- **Repo:** `/Users/mitokafander/Documents/AI Projects/kytuse_kaart/` · GitHub `MitoKafander/kutuse_kaart` (repo still named *kutuse_kaart*; the app is **Kyts**).
- **Deploy:** push to `origin/main` → Vercel auto-deploys to **https://kyts.ee**. No staging. Mikk's MO is "ship and roll back if it breaks" — commit + push when the build is green. Rollback: `git revert <sha> && git push`, or one click in the Vercel dashboard.
- **Stack:** React/TS/Vite PWA · Supabase (project `sdtwolcoibcobpzgfqxx`) · Gemini 2.5 Flash (AI totem scan + market-insight text) · Vercel serverless (`api/`).
- **Secrets:** local `.env` holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `CRON_SECRET`, Sentry. ⚠️ `EIA_API_KEY` lives **only in Vercel env**, not local — local market-insight runs skip EIA.
- **DB read-only diagnostics:** service-role key in `.env` + `@supabase/supabase-js`; copy the paging loop in `scripts/diagnose_point_spam.js`. PostgREST caps every response at 1000 rows — always page.
- **Build / verify:** `npm run build` · `npx tsc --noEmit -p tsconfig.app.json` (frontend) · `npx tsc --noEmit -p api/tsconfig.json` (serverless). ESLint baseline = 0 errors / ~151 `no-explicit-any` warnings (deliberate).
- **Migrations:** run by hand in the Supabase SQL editor (not the MCP). Latest applied = phase 60.

## Verified state (2026-06-22, commit `490a88a`, deployed to prod)
- **Statistics page hardened** (`src/components/StatisticsDrawer.tsx`): robust pooled trend endpoints (no more n=1 swings), 14-day brand ranking, 24h "cheapest now" fallback with stale-marking, market-relative biggest-drops.
- **Market signal made honest** (`api/_lib/marketInsight/computeSignal.ts`, `api/generate-market-insight.ts`): confidence cap 90→70; **diesel `proxyReliable:false`** → emits "no timing edge", never a confident buy/wait (its US NY-Harbor proxy backtested ~0 vs EE diesel); gasoline RBOB signal kept; overall confidence follows the actionable leg.
- Signal changes apply on the **next cron firing** (06:00 / 15:00 UTC), not immediately.

## Next steps (loose priority)
1. **Check feedback** when asked: `SELECT * FROM v_open_feedback;` (service-role / SQL editor). Never seed prices from feedback; anonymous feedback can't receive replies. Detail in memory `project_kyts_feedback_triage`.
2. **Diesel timing stays OFF** unless Mikk subscribes to a gasoil feed (~$20-30/mo Twelve Data Grow / EODHD — he declined for now). If he does: wire the feed in `api/_lib/marketInsight/fetchMarketData.ts`, flip `proxyReliable: true` in `api/generate-market-insight.ts`, then **validate it correlates** with EE diesel before trusting it.
3. Progressive TS typing pass (the 151 `any`s) — only worth doing alongside `supabase gen types typescript`.

## Gotchas (the time-costing ones)
- **PostgREST 1000-row cap:** any `.limit(N>1000)` silently truncates. Use the `fetchAllRows` helper (App.tsx) / paging in scripts.
- **Yahoo & Stooq are dead for serverless fetches:** Yahoo 429s (needs cookie+crumb), Stooq returns a JS bot-challenge page. Use proper APIs (EIA, Frankfurter) only — don't re-attempt scraping them.
- **Price inserts have DB guards** (phases 31/43/50/51): proximity (1 km), velocity (130 km/h), static band (€0.30–4.00), per-fuel ±35% median band. Rejections surface as SQLSTATE 23514 → friendly Estonian copy. Don't "fix" a rejected insert by loosening these without checking the data first.
- **Overlapping-window stats lie:** the diesel "mean-reversion" that looked real (r=−0.53) was a measurement artifact; a bias-free split-half test put it at −0.05. Validate any autocorrelation with disjoint windows.
- **Read-only analysis scripts are throwaway:** the DB-audit scripts this session were written under `scripts/` and deleted after use — recreate from the `diagnose_point_spam.js` pattern when needed.
