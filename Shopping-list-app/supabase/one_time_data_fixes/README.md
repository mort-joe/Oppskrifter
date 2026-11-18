# One-time data fixes

These scripts change *data*, not schema. Each was written for a specific
clean-up of the original database and is meant to be run **once**, in order,
in the Supabase SQL Editor:

| File | What it does |
| --- | --- |
| `0001_backfill_ingredient_shopping_categories.sql` | Guesses `shopping_category` for existing ingredients from their names. Overwrites categories chosen in the admin panel, so never re-run it on a database that is in use. |
| `0002_merge_supper_into_suppe.sql` | Merges the recipe category "Supper" into "Suppe". |
| `0003_merge_soyasaus2_into_soyasaus.sql` | Merges the ingredient "Soyasaus2" into "Soyasaus". |
| `0004_rename_shopping_category_pasta_to_torrvarer.sql` | Renames the shopping category "pasta" to "tørrvarer". |

`supabase/auth_setup.sql` (schema, indexes and RLS policies) is the file that
is safe to run repeatedly, and the one the app's error messages refer to.
