# Diagnostik-Dashboard

Web-App für die Schulleitung: Klett-Diagnostik-Klassenauswertungen (PDF) einlesen, je Klasse auswerten und Parallelklassen einer Stufe vergleichen. Läuft als installierbare App (PWA) auf GitHub Pages, die Daten liegen in einer Supabase-Datenbank in Frankfurt.

## Was die App kann

| Reiter | Inhalt |
|---|---|
| Überblick | Kennzahlen und alle Testdurchführungen mit Median-T-Wert, Förderanteil und Verteilung |
| Klasse | Klassenprofil über alle Bereiche, Verteilung je Bereich, Einzelergebnisse je Kennung (T-Wert, PR, Rohwert, Kompetenzstufe), CSV-Export |
| Stufenvergleich | Parallelklassen einer Stufe im selben Test: Median mit mittleren 50 %, Verteilung, Matrix über alle Bereiche |
| Jahrgang | Verlauf eines Einschulungsjahrgangs über mehrere Testzeitpunkte (z. B. 1d 2024/25 → 3d 2026/27) |
| Förderliste | Alle Kinder mit mindestens einem Bereich unter T 40, Suche nach Kennung, CSV-Export |
| Import | PDF-Auswertungen per Drag & Drop, Metadaten vor dem Speichern prüfen; CSV-Vorlage für andere Verfahren |
| Verwaltung | Rollen (Schulleitung/Lehrkraft) und Klassen-Zuordnungen, Tests löschen |

Unterstützte PDF-Formate: **HSP** (Hamburger Schreib-Probe, alle Skalen wie W, GT, A, O, M, O+M, WÜ, ÜOE) und **LRP** (ZV, OV, AD, SU, MU, DI). Andere Verfahren (z. B. ELFE, DEMAT) lassen sich über die CSV-Vorlage importieren. Weitere PDF-Formate werden in `js/parser.js` ergänzt.

**Bewertungslogik:** Vergleichbar gemacht wird über den T-Wert (Mittel 50, Standardabweichung 10). Fehlt er, wird er aus dem Prozentrang geschätzt. Bänder: unter 35 deutlich unterdurchschnittlich, 35–39 unterdurchschnittlich, 40–60 durchschnittlich, über 60 überdurchschnittlich. „Förderbedarf“ = T unter 40 (≈ PR 16). Hauptskala: HSP = Graphemtreffer, LRP = Operationsverständnis.

## Einrichtung (ca. 20 Minuten)

### 1. Datenbank bei Supabase

1. Konto auf <https://supabase.com> anlegen, **New project**, Region **Central EU (Frankfurt)**.
2. Im Projekt **SQL Editor → New query**, den Inhalt von `supabase/schema.sql` einfügen, **Run**.
3. **Authentication → Sign In / Providers → Email**: aktiviert lassen. Unter **Authentication → Settings** „Allow new users to sign up“ ausschalten, damit sich nur eingeladene Personen anmelden können.
4. **Authentication → URL Configuration**: als *Site URL* die spätere GitHub-Pages-Adresse eintragen (z. B. `https://ihr-name.github.io/diagnostik-dashboard/`), dieselbe Adresse auch unter *Redirect URLs*.
5. **Project Settings → API**: *Project URL* und den Schlüssel *anon public* kopieren und in `js/config.js` eintragen.

### 2. App auf GitHub Pages

1. Auf GitHub ein neues Repository anlegen (z. B. `diagnostik-dashboard`, gern **privat** – Pages funktioniert bei privaten Repos ab GitHub Pro/Team; sonst öffentlich, die Daten liegen ohnehin nicht im Repo).
2. Alle Dateien dieses Ordners hochladen (**Add file → Upload files**).
3. **Settings → Pages → Source: Deploy from a branch**, Branch `main`, Ordner `/ (root)`, speichern. Nach 1–2 Minuten ist die App unter der angezeigten Adresse erreichbar.

### 3. Konten anlegen

1. In Supabase **Authentication → Users → Invite user**: eigene Adresse einladen, dann alle Lehrkräfte.
2. Nach Ihrer ersten Anmeldung im SQL Editor ausführen:
   ```sql
   update public.profile set rolle = 'leitung' where email = 'ihre@adresse.de';
   ```
3. Danach im Reiter **Verwaltung** jeder Lehrkraft ihre Klassen zuordnen (Klasse + Schuljahr). Lehrkräfte sehen und importieren nur zugeordnete Klassen, die Schulleitung sieht alles.

Auf dem Handy oder Tablet lässt sich die App über „Zum Startbildschirm hinzufügen“ wie eine normale App installieren.

## Datenschutz

- Gespeichert werden nur Klasse, Testangaben und die vom Verlag vergebenen pseudonymen Kennungen mit ihren Werten. Die Zuordnung Kennung → Kind bleibt im Klett-Portal bzw. bei der Lehrkraft.
- Die PDFs werden ausschließlich im Browser ausgelesen und nicht hochgeladen.
- Zugriff nur nach Anmeldung; Row Level Security in der Datenbank setzt die Rollen durch, auch wenn jemand die App umgeht.
- Pseudonymisierte Daten sind weiterhin personenbezogene Daten. Vor dem Echtbetrieb: Auftragsverarbeitungsvertrag (DPA) mit Supabase abschließen (im Dashboard unter *Legal*), Eintrag ins Verarbeitungsverzeichnis, ggf. Abstimmung mit der/dem behördlichen Datenschutzbeauftragten und dem Schulträger.

## Ohne Datenbank testen

Bleiben `SUPABASE_URL` und `SUPABASE_ANON_KEY` in `js/config.js` leer, läuft die App im lokalen Modus: Daten nur im Browser, mit Beispieldaten (Reiter Import) und Sicherung als JSON-Datei. Die Beispieldaten enthalten die Klassen 1d (HSP 2024/25) und 3d (LRP 2026/27) aus den echten Auswertungen; die Parallelklassen a–c sind zufällig erzeugt.

## Dateien

```
index.html              App-Hülle
css/style.css           Gestaltung (Hell/Dunkel)
js/config.js            Supabase-Zugangsdaten
js/parser.js            PDF-/CSV-Erkennung (HSP, LRP)
js/store.js             Datenzugriff (Supabase oder lokal)
js/app.js               Oberfläche und Auswertungen
js/demo-data.js         Beispieldaten für den lokalen Modus
supabase/schema.sql     Tabellen, Rollen, Zugriffsregeln
sw.js, manifest.webmanifest, icon-*   App-Installation (PWA)
```
