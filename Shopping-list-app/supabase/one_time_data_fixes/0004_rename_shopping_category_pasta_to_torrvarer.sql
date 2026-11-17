-- One-time data fix: rename the legacy shopping category "pasta" to "tørrvarer"
-- Applied once in the original database. Do NOT re-run this file as part of
-- normal setup; see supabase/one_time_data_fixes/README.md.

begin;

-- Rename legacy category name if it exists, before inserting the new set.
update public.shopping_categories
set name = 'tørrvarer'
where lower(trim(name)) = 'pasta'
  and not exists (
    select 1
    from public.shopping_categories sc
    where lower(trim(sc.name)) = 'tørrvarer'
  );

delete from public.shopping_categories
where lower(trim(name)) = 'pasta'
  and exists (
    select 1
    from public.shopping_categories sc
    where lower(trim(sc.name)) = 'tørrvarer'
  );

update public.ingredients
set shopping_category = 'tørrvarer'
where lower(trim(shopping_category)) = 'pasta';

commit;
