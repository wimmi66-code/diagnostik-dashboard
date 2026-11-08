/* Zugangsdaten zur Supabase-Datenbank.
   Leer lassen = lokaler Modus (Daten nur im Browser, mit Beispieldaten).
   Werte finden Sie in Supabase unter Project Settings › API.
   Der "anon public"-Schlüssel darf öffentlich sein; geschützt wird über Login + Row Level Security. */
window.APP_CONFIG = {
     SUPABASE_URL: 'https://odfjmwczwcxwcfbalwcg.supabase.co',
   SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kZmptd2N6d2N4d2NmYmFsd2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxMzQ3ODcsImV4cCI6MjEwOTcxMDc4N30.ZDnEeW1Kpq3S24uOlMuTp1PsKVtj0wH6YIe5gwjDknI',
  ALLOW_SIGNUP: false      // false = nur eingeladene Konten können sich anmelden
};
