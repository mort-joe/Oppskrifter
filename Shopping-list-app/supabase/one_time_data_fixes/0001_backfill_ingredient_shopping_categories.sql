-- One-time data fix: guess shopping_category for existing ingredients from their names
-- Applied once in the original database. Do NOT re-run this file as part of
-- normal setup; see supabase/one_time_data_fixes/README.md.

begin;

-- Overwrites shopping_category for every ingredient whose name matches a
-- pattern, including categories an administrator has chosen in the dashboard.
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
  ]) then 'tørrvarer'
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

commit;
