-- =====================================================================
--  Diagnostik-Dashboard – Datenbankschema für Supabase (Postgres)
--  Einmalig im Supabase-Dashboard unter "SQL Editor" ausführen.
--  Rollen: 'leitung' sieht und verwaltet alles,
--          'lehrkraft' sieht und importiert nur zugeordnete Klassen.
-- =====================================================================

-- ---------- Profile (1:1 zu auth.users) ----------
create table if not exists public.profile (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  name       text,
  rolle      text not null default 'lehrkraft' check (rolle in ('leitung','lehrkraft')),
  erstellt   timestamptz not null default now()
);

-- Neues Konto -> automatisch Profil als Lehrkraft anlegen
create or replace function public.neues_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profile (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.neues_profil();

-- ---------- Klassen-Zuordnung für Lehrkräfte ----------
create table if not exists public.zuordnung (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profile(id) on delete cascade,
  klasse     text not null,          -- z. B. '3d'
  schuljahr  text not null,          -- z. B. '2026/27'
  unique (user_id, klasse, schuljahr)
);

-- ---------- Testdurchführungen (eine pro Klasse und Test) ----------
create table if not exists public.test (
  id          bigint generated always as identity primary key,
  verfahren   text not null,          -- 'HSP', 'LRP', ...
  fach        text not null,          -- 'Deutsch', 'Mathematik'
  testversion text,                   -- 'HSP 1+ Mitte Klasse 1', 'LRP 2.4/3.1'
  klasse      text not null,          -- '1d'
  stufe       int  not null,          -- 1..10
  schuljahr   text not null,          -- '2024/25'
  testdatum   date,
  norm        text,                   -- Vergleichsnorm laut Auswertung
  datei       text,                   -- Name der importierten Datei
  importiert_von uuid references public.profile(id) default auth.uid(),
  importiert_am  timestamptz not null default now(),
  unique nulls not distinct (verfahren, testversion, klasse, schuljahr, testdatum)
);
create index if not exists test_stufe_idx on public.test (schuljahr, stufe, verfahren);

-- ---------- Einzelergebnisse (pseudonymisierte Kennung) ----------
create table if not exists public.ergebnis (
  id         bigint generated always as identity primary key,
  test_id    bigint not null references public.test(id) on delete cascade,
  kennung    text not null,           -- Schülerkennung aus dem Verlagssystem
  skala      text not null,           -- 'GT', 'A', 'ZV', 'OV', ...
  skala_name text,
  rw         numeric,                 -- Rohwert / Testwert
  pr         numeric,                 -- Prozentrang
  tw         numeric,                 -- T-Wert
  ks         text,                    -- Kompetenzstufe (HSP)
  fq         numeric,                 -- (Gesamt-)Fehlerquotient in % (LRP)
  hinweis    text,                    -- 'hochgerechnet', 'nicht auswertbar', ...
  unique (test_id, kennung, skala)
);
create index if not exists ergebnis_test_idx on public.ergebnis (test_id);

-- ---------- Hilfsfunktionen für die Rechte ----------
create or replace function public.ist_leitung() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profile where id = auth.uid() and rolle = 'leitung');
$$;

create or replace function public.darf_klasse(p_klasse text, p_schuljahr text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.ist_leitung() or exists (
    select 1 from public.zuordnung z
    where z.user_id = auth.uid()
      and lower(z.klasse) = lower(p_klasse)
      and z.schuljahr = p_schuljahr);
$$;

-- ---------- Row Level Security ----------
alter table public.profile   enable row level security;
alter table public.zuordnung enable row level security;
alter table public.test      enable row level security;
alter table public.ergebnis  enable row level security;

-- Profile: jede/r sieht sich selbst, Leitung sieht und ändert alle
drop policy if exists profil_lesen on public.profile;
create policy profil_lesen on public.profile for select
  using (id = auth.uid() or public.ist_leitung());
drop policy if exists profil_aendern on public.profile;
create policy profil_aendern on public.profile for update
  using (public.ist_leitung()) with check (public.ist_leitung());

-- Zuordnungen: eigene lesen, Leitung verwaltet
drop policy if exists zuordnung_lesen on public.zuordnung;
create policy zuordnung_lesen on public.zuordnung for select
  using (user_id = auth.uid() or public.ist_leitung());
drop policy if exists zuordnung_verwalten on public.zuordnung;
create policy zuordnung_verwalten on public.zuordnung for all
  using (public.ist_leitung()) with check (public.ist_leitung());

-- Tests: lesen/anlegen nur für berechtigte Klassen, löschen nur Leitung
drop policy if exists test_lesen on public.test;
create policy test_lesen on public.test for select
  using (public.darf_klasse(klasse, schuljahr));
drop policy if exists test_anlegen on public.test;
create policy test_anlegen on public.test for insert
  with check (public.darf_klasse(klasse, schuljahr));
drop policy if exists test_aendern on public.test;
create policy test_aendern on public.test for update
  using (public.ist_leitung()) with check (public.ist_leitung());
drop policy if exists test_loeschen on public.test;
create policy test_loeschen on public.test for delete
  using (public.ist_leitung());

-- Ergebnisse erben die Rechte ihres Tests
drop policy if exists ergebnis_lesen on public.ergebnis;
create policy ergebnis_lesen on public.ergebnis for select
  using (exists (select 1 from public.test t where t.id = test_id and public.darf_klasse(t.klasse, t.schuljahr)));
drop policy if exists ergebnis_anlegen on public.ergebnis;
create policy ergebnis_anlegen on public.ergebnis for insert
  with check (exists (select 1 from public.test t where t.id = test_id and public.darf_klasse(t.klasse, t.schuljahr)));
drop policy if exists ergebnis_loeschen on public.ergebnis;
create policy ergebnis_loeschen on public.ergebnis for delete
  using (public.ist_leitung());

-- =====================================================================
--  Nach dem ersten Login das eigene Konto zur Schulleitung machen:
--  update public.profile set rolle = 'leitung' where email = 'IHRE@ADRESSE.de';
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
