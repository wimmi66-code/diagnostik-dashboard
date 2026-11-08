/* Datenschicht: Supabase (online) oder Browser-Speicher (Demo/lokal). */
(function (root) {
  'use strict';
  const LS_KEY = 'diagnostik-dashboard-v1';
  const cfg = root.APP_CONFIG || {};
  const online = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && root.supabase);
  const sb = online ? root.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  /* ---------- lokal ---------- */
  function lsLoad() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || { tests: [], nextId: 1 }; }
    catch (e) { return { tests: [], nextId: 1 }; }
  }
  let mem = lsLoad();
  function lsSave() { try { localStorage.setItem(LS_KEY, JSON.stringify(mem)); } catch (e) { /* privat/voll */ } }

  const gleich = (a, b) => a.verfahren === b.verfahren && (a.testversion || '') === (b.testversion || '') &&
    String(a.klasse).toLowerCase() === String(b.klasse).toLowerCase() && a.schuljahr === b.schuljahr &&
    (a.testdatum || null) === (b.testdatum || null);

  /* ---------- Supabase: alle Zeilen seitenweise ---------- */
  async function alleZeilen(table, select, order) {
    const out = []; const step = 1000;
    for (let from = 0; ; from += step) {
      let q = sb.from(table).select(select).range(from, from + step - 1);
      if (order) q = q.order(order);
      const { data, error } = await q;
      if (error) throw error;
      out.push(...data);
      if (data.length < step) break;
    }
    return out;
  }

  const Store = {
    online,
    sb,

    async session() {
      if (!online) return { user: { email: 'lokal' }, rolle: 'leitung', lokal: true };
      const { data } = await sb.auth.getSession();
      if (!data.session) return null;
      const user = data.session.user;
      const { data: prof } = await sb.from('profile').select('*').eq('id', user.id).maybeSingle();
      return { user, rolle: prof ? prof.rolle : 'lehrkraft', profil: prof };
    },

    async login(email) {
      const { error } = await sb.auth.signInWithOtp({
        email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: cfg.ALLOW_SIGNUP !== false }
      });
      if (error) throw error;
    },
    async logout() { if (online) await sb.auth.signOut(); },

    /** Alle sichtbaren Tests inkl. Ergebnisse */
    async ladeAlles() {
      if (!online) return JSON.parse(JSON.stringify(mem.tests));
      const tests = await alleZeilen('test', '*', 'id');
      const erg = await alleZeilen('ergebnis', 'test_id,kennung,skala,skala_name,rw,pr,tw,ks,fq,hinweis', 'id');
      const byTest = new Map(tests.map(t => [t.id, Object.assign(t, { ergebnisse: [] })]));
      for (const e of erg) { const t = byTest.get(e.test_id); if (t) t.ergebnisse.push(e); }
      return tests;
    },

    async findeDuplikat(meta) {
      if (!online) return mem.tests.find(t => gleich(t, meta)) || null;
      let q = sb.from('test').select('id').eq('verfahren', meta.verfahren).eq('klasse', meta.klasse).eq('schuljahr', meta.schuljahr);
      q = meta.testversion ? q.eq('testversion', meta.testversion) : q.is('testversion', null);
      q = meta.testdatum ? q.eq('testdatum', meta.testdatum) : q.is('testdatum', null);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data;
    },

    async speichereTest(meta, ergebnisse, ersetzen) {
      const dup = await this.findeDuplikat(meta);
      if (dup && !ersetzen) { const e = new Error('Dieser Test ist bereits gespeichert.'); e.code = 'DUP'; throw e; }
      if (dup) await this.loescheTest(dup.id);
      if (!online) {
        const id = mem.nextId++;
        mem.tests.push(Object.assign({ id, importiert_am: new Date().toISOString() }, meta, { ergebnisse }));
        lsSave();
        return id;
      }
      const row = {
        verfahren: meta.verfahren, fach: meta.fach, testversion: meta.testversion || null, klasse: meta.klasse,
        stufe: meta.stufe, schuljahr: meta.schuljahr, testdatum: meta.testdatum || null, norm: meta.norm || null, datei: meta.datei || null
      };
      const { data: t, error } = await sb.from('test').insert(row).select('id').single();
      if (error) throw error;
      const rows = ergebnisse.map(e => ({
        test_id: t.id, kennung: e.kennung, skala: e.skala, skala_name: e.skala_name,
        rw: e.rw, pr: e.pr, tw: e.tw, ks: e.ks, fq: e.fq, hinweis: e.hinweis
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error: e2 } = await sb.from('ergebnis').insert(rows.slice(i, i + 500));
        if (e2) { await sb.from('test').delete().eq('id', t.id); throw e2; }
      }
      return t.id;
    },

    async loescheTest(id) {
      if (!online) { mem.tests = mem.tests.filter(t => t.id !== id); lsSave(); return; }
      const { error } = await sb.from('test').delete().eq('id', id);
      if (error) throw error;
    },

    /* ---------- Verwaltung (nur online) ---------- */
    async profile() {
      const { data, error } = await sb.from('profile').select('*').order('email');
      if (error) throw error; return data;
    },
    async setzeRolle(id, rolle) {
      const { error } = await sb.from('profile').update({ rolle }).eq('id', id);
      if (error) throw error;
    },
    async zuordnungen() {
      const { data, error } = await sb.from('zuordnung').select('*').order('schuljahr', { ascending: false });
      if (error) throw error; return data;
    },
    async neueZuordnung(user_id, klasse, schuljahr) {
      const { error } = await sb.from('zuordnung').insert({ user_id, klasse, schuljahr });
      if (error) throw error;
    },
    async loescheZuordnung(id) {
      const { error } = await sb.from('zuordnung').delete().eq('id', id);
      if (error) throw error;
    },

    /* ---------- lokal: Sicherung ---------- */
    exportJson() { return JSON.stringify(mem, null, 1); },
    importJson(text) {
      const d = JSON.parse(text);
      if (!d || !Array.isArray(d.tests)) throw new Error('Keine gültige Sicherungsdatei.');
      mem = d; lsSave();
    },
    alleLokalLoeschen() { mem = { tests: [], nextId: 1 }; lsSave(); }
  };

  root.Store = Store;
})(window);
