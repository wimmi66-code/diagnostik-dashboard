-- =====================================================================
--  Ergänzung Jahrgangsspiegel: Klassenleitung, Maßnahmen, Schwerpunkte
--  Einmalig im SQL Editor ausführen (zusätzlich zu schema.sql).
-- =====================================================================
create table if not exists public.spiegel_notiz (
  id             bigint generated always as identity primary key,
  schuljahr      text not null,                 -- '2026/27'
  halbjahr       int  not null check (halbjahr in (1,2)),
  stufe          int  not null,
  klasse         text not null default '',      -- '' = Eintrag für den ganzen Jahrgang
  klassenleitung text,
  text           text,                          -- Maßnahme (Klasse) bzw. Schwerpunkt (Jahrgang)
  geaendert_am   timestamptz not null default now(),
  geaendert_von  uuid default auth.uid(),
  unique (schuljahr, halbjahr, stufe, klasse)
);

alter table public.spiegel_notiz enable row level security;

drop policy if exists notiz_lesen on public.spiegel_notiz;
create policy notiz_lesen on public.spiegel_notiz for select
  using (klasse = '' or public.darf_klasse(klasse, schuljahr));

drop policy if exists notiz_anlegen on public.spiegel_notiz;
create policy notiz_anlegen on public.spiegel_notiz for insert
  with check (case when klasse = '' then public.ist_leitung() else public.darf_klasse(klasse, schuljahr) end);

drop policy if exists notiz_aendern on public.spiegel_notiz;
create policy notiz_aendern on public.spiegel_notiz for update
  using (case when klasse = '' then public.ist_leitung() else public.darf_klasse(klasse, schuljahr) end)
  with check (case when klasse = '' then public.ist_leitung() else public.darf_klasse(klasse, schuljahr) end);

drop policy if exists notiz_loeschen on public.spiegel_notiz;
create policy notiz_loeschen on public.spiegel_notiz for delete using (public.ist_leitung());
