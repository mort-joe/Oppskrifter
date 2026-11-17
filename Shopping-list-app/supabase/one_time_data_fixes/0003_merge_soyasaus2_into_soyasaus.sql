-- One-time data fix: merge the duplicate ingredient "Soyasaus2" into "Soyasaus"
-- Applied once in the original database. Do NOT re-run this file as part of
-- normal setup; see supabase/one_time_data_fixes/README.md.

begin;

-- 5) Ingredient maintenance: merge duplicate "Soyasaus2" into "Soyasaus"
with canonical as (
  select i.id
  from public.ingredients i
  where lower(trim(i.name)) = 'soyasaus'
  order by i.id
  limit 1
),
duplicates as (
  select i.id
  from public.ingredients i
  where lower(trim(i.name)) = 'soyasaus2'
),
ensure_canonical as (
  insert into public.ingredients(name, shopping_category)
  select 'Soyasaus', 'annet'
  where not exists (select 1 from canonical)
    and exists (select 1 from duplicates)
  returning id
),
target as (
  select id from canonical
  union all
  select id from ensure_canonical
  limit 1
)
update public.recipe_ingredients ri
set ingredient_id = t.id
from duplicates d
cross join target t
where ri.ingredient_id = d.id;

delete from public.ingredients i
where lower(trim(i.name)) = 'soyasaus2';

commit;
