# Migrations

Historical record of SQL changes applied manually in the Supabase SQL editor.
Each `schema_phaseN*.sql` was run once at the time it was added; Supabase is
the source of truth for current DB state, not these files.

Run order: `schema.sql` (initial), then `schema_phase3`, `8`, `9`, `10`, …, `17`.

When adding a new migration: create `schema_phase{N+1}_<short_name>.sql`, run
it in Supabase, then commit the file.
