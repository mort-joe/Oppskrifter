-- Auth + RLS setup for Shopping-list-app (single-user app)
-- Run this in Supabase SQL Editor.

begin;

-- 1) Add owner column to recipes (if missing)
alter table public.recipes
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.recipes
  add column if not exists shared_root_recipe_id bigint references public.recipes(id) on delete set null,
  add column if not exists shared_root_name text,
  add column if not exists shared_version_number integer;

-- Optional but recommended index
create index if not exists recipes_user_id_idx on public.recipes(user_id);
create index if not exists recipes_shared_root_recipe_id_idx on public.recipes(shared_root_recipe_id);
create index if not exists recipes_shared_version_number_idx on public.recipes(shared_version_number);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_people integer not null default 4,
  updated_at timestamptz not null default now()
);

-- 1b) Add shopping category to ingredients for deterministic sorting in app
alter table public.ingredients
  add column if not exists shopping_category text not null default 'annet';

create index if not exists ingredients_shopping_category_idx on public.ingredients(shopping_category);

with normalized as (
  select
    id,
    lower(
      replace(
        replace(
          replace(name, 'æ', 'ae'),
          'ø', 'o'
        ),
        'å', 'a'
      )
    ) as normalized_name
  from public.ingredients
)
update public.ingredients i
set shopping_category = case
  when n.normalized_name like any (array[
    '%brokkoli%', '%gulrot%', '%potet%', '%lok%', '%purre%', '%salat%', '%tomat%', '%agurk%', '%paprika%', '%spinat%', '%blomkal%', '%hvitlok%', '%ingefaer%', '%squash%', '%avokado%', '%sopp%', '%rukkola%', '%chili%'
  ]) then 'gronnsaker'
  when n.normalized_name like any (array[
    '%eple%', '%banan%', '%appelsin%', '%pare%', '%druer%', '%sitron%', '%lime%', '%melon%', '%ananas%', '%kiwi%', '%mango%', '%jordbaer%', '%bringebaer%', '%blabaer%'
  ]) then 'frukt'
  when n.normalized_name like any (array[
    '%kjott%', '%biff%', '%svin%', '%kylling%', '%karbonade%', '%kjottdeig%', '%kotelett%', '%pylse%', '%bacon%', '%skinke%', '%lam%', '%rein%', '%kalv%', '%filet%'
  ]) then 'kjott'
  when n.normalized_name like any (array[
    '%fisk%', '%laks%', '%torsk%', '%sei%', '%makrell%', '%sild%', '%reker%', '%scampi%', '%tunfisk%', '%kveite%', '%orret%', '%dorade%'
  ]) then 'fisk'
  when n.normalized_name like any (array[
    '%yoghurt%', '%romme%', '%creme fraiche%', '%smoreost%', '%kefir%', '%skyr%', '%ost%', '%kebabdressing%'
  ]) then 'kjolevarer'
  when n.normalized_name like any (array[
    '%pasta%', '%spagetti%', '%penne%', '%fusilli%', '%lasagne%', '%tagliatelle%', '%makaroni%', '%nudler%', '%risnudler%', '%lefse%', '%lefser%', '%tray%', '%tortilla%'
  ]) then 'pasta'
  when n.normalized_name like any (array[
    '%hvetemel%', '%sammalt mel%', '%speltmel%', '%rugmel%', '%byggmel%', '%maismel%', '%rismel%', '%potetmel%', '%kokosmel%', '%mandelmel%', '%gjaer%', '%bakepulver%', '%sukker%', '%vaniljesukker%', '%sirup%', '%kakao%', '%havregryn%', '%smor%', '%egg%', '%brod%', '%rundstykke%', '%lompe%'
  ]) then 'bakevarer'
  when n.normalized_name like any (array[
    '%frossen%', '%fryst%', '%fryse%', '%is%', '%fryste%', '%frossne%', '%rosenkal%'
  ]) then 'frosenvarer'
  when n.normalized_name like any (array[
    '%melk%', '%flote%', '%yoghurt%', '%romme%', '%creme fraiche%', '%smoreost%', '%kefir%', '%skyr%'
  ]) then 'melkeprodukter'
  when n.normalized_name like any (array[
    '%mineralvann%', '%brus%', '%cola%', '%fanta%', '%sprite%', '%pepsi%', '%sitronbrus%', '%sodavann%', '%tonic%'
  ]) then 'mineralvann'
  else coalesce(i.shopping_category, 'annet')
end
from normalized n
where i.id = n.id;

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

-- 2) Enable RLS on recipe-related tables
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_categories enable row level security;
alter table public.recipe_tags enable row level security;
alter table public.ingredients enable row level security;
alter table public.user_settings enable row level security;

-- 3) Recipes policies (user owns own rows)
drop policy if exists "recipes_select_own" on public.recipes;
create policy "recipes_select_own"
  on public.recipes
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "recipes_select_all_authenticated" on public.recipes;
create policy "recipes_select_all_authenticated"
  on public.recipes
  for select
  to authenticated
  using (true);

drop policy if exists "recipes_insert_own" on public.recipes;
create policy "recipes_insert_own"
  on public.recipes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "recipes_update_own" on public.recipes;
create policy "recipes_update_own"
  on public.recipes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "recipes_delete_own" on public.recipes;
create policy "recipes_delete_own"
  on public.recipes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- 4) Child table policies based on parent recipe ownership
-- recipe_ingredients
drop policy if exists "recipe_ingredients_select_owner" on public.recipe_ingredients;
create policy "recipe_ingredients_select_owner"
  on public.recipe_ingredients
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.user_id = auth.uid()
    )
  );

drop policy if exists "recipe_ingredients_select_all_authenticated" on public.recipe_ingredients;
create policy "recipe_ingredients_select_all_authenticated"
  on public.recipe_ingredients
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_ingredients.recipe_id
    )
  );

drop policy if exists "recipe_ingredients_insert_owner" on public.recipe_ingredients;
create policy "recipe_ingredients_insert_owner"
  on public.recipe_ingredients
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.user_id = auth.uid()
    )
  );

drop policy if exists "recipe_ingredients_update_owner" on public.recipe_ingredients;
create policy "recipe_ingredients_update_owner"
  on public.recipe_ingredients
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.user_id = auth.uid()
    )
  );

drop policy if exists "recipe_ingredients_delete_owner" on public.recipe_ingredients;
create policy "recipe_ingredients_delete_owner"
  on public.recipe_ingredients
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.user_id = auth.uid()
    )
  );

-- recipe_categories
drop policy if exists "recipe_categories_select_owner" on public.recipe_categories;
create policy "recipe_categories_select_owner"
  on public.recipe_categories
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_categories.recipe_id
        and r.user_id = auth.uid()
    )
  );

drop policy if exists "recipe_categories_select_all_authenticated" on public.recipe_categories;
create policy "recipe_categories_select_all_authenticated"
  on public.recipe_categories
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_categories.recipe_id
    )
  );

drop policy if exists "recipe_categories_insert_owner" on public.recipe_categories;
create policy "recipe_categories_insert_owner"
  on public.recipe_categories
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_categories.recipe_id
        and r.user_id = auth.uid()
    )
  );

drop policy if exists "recipe_categories_update_owner" on public.recipe_categories;
create policy "recipe_categories_update_owner"
  on public.recipe_categories
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_categories.recipe_id
        and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_categories.recipe_id
        and r.user_id = auth.uid()
    )
  );

drop policy if exists "recipe_categories_delete_owner" on public.recipe_categories;
create policy "recipe_categories_delete_owner"
  on public.recipe_categories
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_categories.recipe_id
        and r.user_id = auth.uid()
    )
  );

-- recipe_tags
drop policy if exists "recipe_tags_select_owner" on public.recipe_tags;
create policy "recipe_tags_select_owner"
  on public.recipe_tags
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_tags.recipe_id
        and r.user_id = auth.uid()
    )
  );

drop policy if exists "recipe_tags_select_all_authenticated" on public.recipe_tags;
create policy "recipe_tags_select_all_authenticated"
  on public.recipe_tags
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_tags.recipe_id
    )
  );

drop policy if exists "recipe_tags_insert_owner" on public.recipe_tags;
create policy "recipe_tags_insert_owner"
  on public.recipe_tags
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_tags.recipe_id
        and r.user_id = auth.uid()
    )
  );

drop policy if exists "recipe_tags_update_owner" on public.recipe_tags;
create policy "recipe_tags_update_owner"
  on public.recipe_tags
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_tags.recipe_id
        and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_tags.recipe_id
        and r.user_id = auth.uid()
    )
  );

drop policy if exists "recipe_tags_delete_owner" on public.recipe_tags;
create policy "recipe_tags_delete_owner"
  on public.recipe_tags
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_tags.recipe_id
        and r.user_id = auth.uid()
    )
  );

-- ingredients (global, shared ingredient catalog)
drop policy if exists "ingredients_select_all_authenticated" on public.ingredients;
create policy "ingredients_select_all_authenticated"
  on public.ingredients
  for select
  to authenticated
  using (true);

drop policy if exists "ingredients_insert_all_authenticated" on public.ingredients;
create policy "ingredients_insert_all_authenticated"
  on public.ingredients
  for insert
  to authenticated
  with check (true);

drop policy if exists "user_settings_select_all_authenticated" on public.user_settings;
create policy "user_settings_select_all_authenticated"
  on public.user_settings
  for select
  to authenticated
  using (true);

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own"
  on public.user_settings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own"
  on public.user_settings
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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

-- 6) Shopping category administration table (for Dashboard category editing/sorting)
create table if not exists public.shopping_categories (
  id bigserial primary key,
  name text not null unique,
  sort_order integer not null,
  created_at timestamptz not null default now()
);

create unique index if not exists shopping_categories_sort_order_key
  on public.shopping_categories(sort_order);

insert into public.shopping_categories(name, sort_order)
select seed.name, seed.sort_order
from (
  values
    ('gronnsaker', 1),
    ('frukt', 2),
    ('kjott', 3),
    ('fisk', 4),
    ('kjolevarer', 5),
    ('pasta', 6),
    ('bakevarer', 7),
    ('frosenvarer', 8),
    ('melkeprodukter', 9),
    ('mineralvann', 10),
    ('annet', 11)
) as seed(name, sort_order)
where not exists (
  select 1
  from public.shopping_categories sc
  where lower(trim(sc.name)) = seed.name
);

commit;

-- IMPORTANT:
-- 1) Create one user in Supabase Authentication -> Users.
-- 2) Use that email/password in app login.
-- 3) Optionally disable "Enable email signups" if you only want one fixed user.
