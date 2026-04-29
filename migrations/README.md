# Migrations

Historical record of SQL changes applied manually in the Supabase SQL editor.
Each `schema_phaseN*.sql` was run once at the time it was added; Supabase is
the source of truth for current DB state, not these files.

Run order: `schema.sql` (initial), then `schema_phase3`, `8`, `9`, `10`, …, `57`.

When adding a new migration: create `schema_phase{N+1}_<short_name>.sql`, run
it in Supabase, then commit the file.

Note on numbering: phase 39 was briefly double-booked between
`schema_phase39_market_insights.sql` and the first push of the velocity-check
migration. The latter was renamed to `schema_phase43_price_velocity.sql` to
restore monotonic ordering. Numbers are documentary — Supabase tracks DB
state, not filenames — but the convention keeps the chain scannable.
