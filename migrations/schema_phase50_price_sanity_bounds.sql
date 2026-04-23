-- Phase 50: prevent camera-scan misreads from poisoning trends/aggregates.
--
-- Three rows in prices were obvious OCR failures from camera scans (€3.25
-- and €1.253 on 2026-04-06 from one user during early testing; €5.40 on
-- 2026-04-15 from an anonymous scan). They were dragging the
-- StatisticsDrawer trend tile to ~▼ 130¢ for Bensiin 95 — a sparse
-- earliest-day mean amplified the outlier.
--
-- Cleanup the known bad rows, then add a wide CHECK so future bad scans
-- get rejected at insert. Bounds picked to leave >2x crisis-spike headroom
-- above current observed ceilings (Diisel max 2.299) and well below any
-- plausible LPG floor (real min 0.799), while still catching obvious
-- decimal-point typos.

delete from prices
where id in (
  '24853bd6-a72a-45b4-9264-a8b01efbb9f6',
  '37539e37-c993-4633-99a1-b54dcb2e8ab4',
  '5eee3f1e-f26e-4ba1-956b-eda0501e6cf3'
);

alter table prices
  add constraint prices_price_sanity_bounds
  check (price between 0.30 and 4.00);
