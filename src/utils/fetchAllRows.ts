import { supabase } from '../supabase';

// Page a Supabase select past PostgREST's `db-max-rows` cap. The Supabase
// platform silently truncates any single response to 1000 rows regardless of
// `.limit()` — which previously dropped older `prices` rows from the client and
// made Avastuskaart "lose" completed valds the moment the table grew past 1k.
// Strategy: the first page asks for `count: 'exact'` so the rest can fan out in
// parallel without a separate HEAD round-trip, and short-circuits if the table
// fits in one page. Order is preserved across pages by the caller-supplied
// `apply` callback (must be a stable, non-volatile expression for pagination
// to be deterministic). Hard cap protects against runaway loops if `count`
// somehow disagrees with reality.
export async function fetchAllRows<T = any>(
  table: string,
  apply: (q: any) => any = (q) => q,
): Promise<{ data: T[] | null; error: any }> {
  const PAGE = 1000;
  const SAFETY_CAP = 100_000;
  const first = await apply(supabase.from(table).select('*', { count: 'exact' })).range(0, PAGE - 1);
  if (first.error) return { data: null, error: first.error };
  const head = (first.data ?? []) as T[];
  const total = Math.min(first.count ?? head.length, SAFETY_CAP);
  if (head.length < PAGE || head.length >= total) return { data: head, error: null };
  const requests: Promise<any>[] = [];
  for (let from = PAGE; from < total; from += PAGE) {
    const to = Math.min(from + PAGE - 1, total - 1);
    requests.push(apply(supabase.from(table).select('*')).range(from, to));
  }
  const rest = await Promise.all(requests);
  // Dedupe by id: parallel pages can both observe the same row when a write
  // lands between requests (a new row at offset 0 shifts existing rows down,
  // so the last row of page N reappears as the first row of page N+1).
  const seen = new Set<any>();
  const all: T[] = [];
  for (const row of head) {
    const id = (row as any)?.id;
    if (id != null && seen.has(id)) continue;
    if (id != null) seen.add(id);
    all.push(row);
  }
  for (const r of rest) {
    if (r.error) return { data: null, error: r.error };
    for (const row of (r.data ?? []) as T[]) {
      const id = (row as any)?.id;
      if (id != null && seen.has(id)) continue;
      if (id != null) seen.add(id);
      all.push(row);
    }
  }
  return { data: all, error: null };
}
