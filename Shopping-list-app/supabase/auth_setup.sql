-- Schema + RLS setup for Shopping-list-app (multi-user: every signed-in user
-- owns their own recipes and shopping state; categories, tags and ingredients
-- are shared catalogs).
--
-- Run this in the Supabase SQL Editor. It is safe to run again: it only
-- creates what is missing and (re)creates policies. One-time data fixes live
-- in supabase/one_time_data_fixes/ and must not be re-run.

begin;

-- 1) Add owner column to recipes (if missing)
alter table public.recipes
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.recipes
  add column if not exists shared_root_recipe_id bigint references public.recipes(id) on delete set null,
  add column if not exists shared_root_name text,
  add column if not exists shared_version_number integer,
  add column if not exists instructions text not null default '';

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

-- 2) Enable RLS on recipe-related tables
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_categories enable row level security;
alter table public.recipe_tags enable row level security;
alter table public.ingredients enable row level security;
alter table public.user_settings enable row level security;

-- 3) Recipes policies (user owns own rows)
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

-- categories (global, shared catalog)
alter table public.categories enable row level security;

drop policy if exists "categories_select_all_authenticated" on public.categories;
create policy "categories_select_all_authenticated"
  on public.categories
  for select
  to authenticated
  using (true);

drop policy if exists "categories_insert_all_authenticated" on public.categories;
create policy "categories_insert_all_authenticated"
  on public.categories
  for insert
  to authenticated
  with check (true);

-- tags (global, shared catalog)
alter table public.tags enable row level security;

drop policy if exists "tags_select_all_authenticated" on public.tags;
create policy "tags_select_all_authenticated"
  on public.tags
  for select
  to authenticated
  using (true);

drop policy if exists "tags_insert_all_authenticated" on public.tags;
create policy "tags_insert_all_authenticated"
  on public.tags
  for insert
  to authenticated
  with check (true);

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

-- 6) Shopping category administration table (for Dashboard category editing/sorting)
create table if not exists public.shopping_categories (
  id bigserial primary key,
  name text not null unique,
  sort_order integer not null,
  created_at timestamptz not null default now()
);

create unique index if not exists shopping_categories_sort_order_key
  on public.shopping_categories(sort_order);

alter table public.shopping_categories enable row level security;

drop policy if exists "shopping_categories_select_all_authenticated" on public.shopping_categories;
create policy "shopping_categories_select_all_authenticated"
  on public.shopping_categories
  for select
  to authenticated
  using (true);

insert into public.shopping_categories(name, sort_order)
select seed.name, seed.sort_order
from (
  values
    ('gronnsaker', 1),
    ('frukt', 2),
    ('kjott', 3),
    ('fisk', 4),
    ('kjolevarer', 5),
    ('tørrvarer', 6),
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

-- 7) Per-user shopping state (shopping list, menu plan, activity timestamp)
create table if not exists public.shopping_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb,
  updated_at timestamptz not null default now()
);

alter table public.shopping_state enable row level security;

drop policy if exists "shopping_state_select_own" on public.shopping_state;
create policy "shopping_state_select_own"
  on public.shopping_state
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "shopping_state_insert_own" on public.shopping_state;
create policy "shopping_state_insert_own"
  on public.shopping_state
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "shopping_state_update_own" on public.shopping_state;
create policy "shopping_state_update_own"
  on public.shopping_state
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 8) Remove policies that earlier versions of this script created.
-- The "*_select_own"/"*_select_owner" policies were redundant: the
-- "*_select_all_authenticated" policy on the same table already grants a
-- superset (permissive policies are combined with OR), so access is unchanged.
-- The update/delete policies on the shared catalogs let any signed-in user
-- rename or delete data for everyone; the app only reads these tables (and
-- inserts into categories/tags/ingredients) with the anon key, while the admin
-- API uses the service role, which bypasses RLS.
drop policy if exists "recipes_select_own" on public.recipes;
drop policy if exists "recipe_ingredients_select_owner" on public.recipe_ingredients;
drop policy if exists "recipe_categories_select_owner" on public.recipe_categories;
drop policy if exists "recipe_tags_select_owner" on public.recipe_tags;
drop policy if exists "categories_update_all_authenticated" on public.categories;
drop policy if exists "tags_update_all_authenticated" on public.tags;
drop policy if exists "shopping_categories_insert_all_authenticated" on public.shopping_categories;
drop policy if exists "shopping_categories_update_all_authenticated" on public.shopping_categories;
drop policy if exists "shopping_categories_delete_all_authenticated" on public.shopping_categories;

commit;

-- IMPORTANT:
-- 1) Create users in Supabase Authentication -> Users (or via the admin panel).
-- 2) Use that email/password in app login.
-- 3) Disable "Enable email signups" in Authentication -> Providers -> Email.
--    The app has no sign-up page, and every signed-in user gets the
--    "authenticated" role that the policies above grant access to.
