-- One-time data fix: merge the duplicate recipe category "Supper" into "Suppe"
-- Applied once in the original database. Do NOT re-run this file as part of
-- normal setup; see supabase/one_time_data_fixes/README.md.

begin;

-- 1c) Merge duplicate recipe category: "Supper" -> "Suppe"
with ensured_suppe as (
  insert into public.categories(name)
  select 'Suppe'
  where not exists (
    select 1
    from public.categories c
    where lower(trim(c.name)) = 'suppe'
  )
  returning id
),
suppe_target as (
  select id from ensured_suppe
  union all
  select c.id
  from public.categories c
  where lower(trim(c.name)) = 'suppe'
  limit 1
),
supper_sources as (
  select c.id
  from public.categories c
  where lower(trim(c.name)) = 'supper'
)
insert into public.recipe_categories(recipe_id, category_id)
select distinct rc.recipe_id, st.id
from public.recipe_categories rc
join supper_sources ss on ss.id = rc.category_id
cross join suppe_target st
where not exists (
  select 1
  from public.recipe_categories rc2
  where rc2.recipe_id = rc.recipe_id
    and rc2.category_id = st.id
);

delete from public.recipe_categories rc
using public.categories c
where rc.category_id = c.id
  and lower(trim(c.name)) = 'supper';

delete from public.categories c
where lower(trim(c.name)) = 'supper';

commit;
