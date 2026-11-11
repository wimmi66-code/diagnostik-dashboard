/* Diagnostik-Dashboard – Oberfläche */
(function () {
  'use strict';
  const P = window.KlettParser, S = window.Store;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 1) => v == null || Number.isNaN(v) ? '–' : Number(v).toLocaleString('de-DE', { maximumFractionDigits: d });
  const pct = (v) => v == null ? '–' : Math.round(v * 100) + ' %';
  const datum = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('de-DE') : '–';

  /* ================= Fachlogik ================= */
  const BAENDER = [
    { k: 'du', name: 'deutlich unterdurchschnittlich', kurz: 'T < 35' },
    { k: 'u', name: 'unterdurchschnittlich', kurz: 'T 35–39' },
    { k: 'd', name: 'durchschnittlich', kurz: 'T 40–60' },
    { k: 'ue', name: 'überdurchschnittlich', kurz: 'T > 60' }
  ];
  // Prozentrang -> T-Wert (Normalverteilung), falls nur PR vorliegt
  function prToT(pr) {
    if (pr == null) return null;
    const p = Math.min(Math.max(pr / 100, 0.001), 0.999);
    // Acklam-Näherung der Normalquantilfunktion
    const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
    const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
    const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
    const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
    let q, z;
    if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); z = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); z = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else { q = p - 0.5; const r = q * q; z = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    return 50 + 10 * z;
  }
  const tWert = (e) => e.tw != null ? Number(e.tw) : prToT(e.pr == null ? null : Number(e.pr));
  function band(e) {
    const t = tWert(e);
    if (t == null) return 'na';
    return t < 35 ? 'du' : t < 40 ? 'u' : t <= 60 ? 'd' : 'ue';
  }
  const foerder = (e) => { const b = band(e); return b === 'du' || b === 'u'; };
  function quantil(arr, q) {
    const s = arr.filter(v => v != null).sort((a, b) => a - b);
    if (!s.length) return null;
    const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }
  function skalen(test) {
    const seen = []; for (const e of test.ergebnisse) if (!seen.includes(e.skala)) seen.push(e.skala);
    return seen;
  }
  const skalaName = (test, sk) => (test.ergebnisse.find(e => e.skala === sk) || {}).skala_name || P.SKALEN[sk] || sk;
  function hauptskala(test) {
    const sk = skalen(test);
    for (const h of (P.HAUPTSKALA[test.verfahren] || [])) if (sk.includes(h)) return h;
    // Skalen ohne T-Wert (z. B. ÜOE) nicht als Hauptskala
    return sk.find(s => test.ergebnisse.some(e => e.skala === s && tWert(e) != null)) || sk[0];
  }
  function statistik(rows) {
    const gueltig = rows.filter(e => tWert(e) != null);
    const ts = gueltig.map(tWert);
    const counts = { du: 0, u: 0, d: 0, ue: 0 };
    gueltig.forEach(e => counts[band(e)]++);
    const n = gueltig.length;
    return {
      n, nGesamt: rows.length, counts,
      median: quantil(ts, 0.5), q1: quantil(ts, 0.25), q3: quantil(ts, 0.75),
      anteilFoerder: n ? (counts.du + counts.u) / n : null
    };
  }
  const erg = (test, sk) => test.ergebnisse.filter(e => e.skala === sk);
  const kennungen = (test) => [...new Set(test.ergebnisse.map(e => e.kennung))];
  const sjStart = (sj) => parseInt(String(sj).slice(0, 4), 10);
  const jahrgang = (t) => sjStart(t.schuljahr) - (t.stufe || 1) + 1;   // Einschulungsjahr
  const zug = (t) => (String(t.klasse).match(/[a-zA-Z]+$/) || [''])[0].toLowerCase();
  const testLabel = (t) => `${t.klasse} · ${t.testversion || t.verfahren} · ${t.schuljahr}${t.testdatum ? ' · ' + datum(t.testdatum) : ''}`;
  const sortTests = (a, b) => (b.schuljahr || '').localeCompare(a.schuljahr || '') || (a.stufe - b.stufe) ||
    String(a.klasse).localeCompare(String(b.klasse), 'de', { numeric: true }) || String(a.testdatum || '').localeCompare(String(b.testdatum || ''));

  /* ================= Zustand ================= */
  const state = { tests: [], session: null, filter: { schuljahr: '', fach: '' }, view: 'overview',
    klasseTest: null, klasseWert: 'tw', stufe: { stufe: null, version: null, skala: null }, jg: { jahrgang: null } };

  const gefiltert = () => state.tests.filter(t =>
    (!state.filter.schuljahr || t.schuljahr === state.filter.schuljahr) && (!state.filter.fach || t.fach === state.filter.fach)).sort(sortTests);

  /* ================= Tooltip ================= */
  const tip = $('#tooltip');
  function showTip(ev, html) {
    tip.innerHTML = html; tip.style.opacity = 1;
    const x = Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    const y = Math.max(8, ev.clientY - tip.offsetHeight - 10);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  document.addEventListener('pointermove', (ev) => {
    const el = ev.target.closest && ev.target.closest('[data-tip]');
    if (el) showTip(ev, el.getAttribute('data-tip')); else tip.style.opacity = 0;
  });
  document.addEventListener('pointerdown', (ev) => {
    const el = ev.target.closest && ev.target.closest('[data-tip]');
    if (el) showTip(ev, el.getAttribute('data-tip'));
  });

  /* ================= Bausteine ================= */
  function legendeBaender() {
    return `<div class="legend">${BAENDER.map(b => `<span><i class="dot ${b.k}"></i>${b.name} (${b.kurz})</span>`).join('')}</div>`;
  }
  function stackBar(st) {
    if (!st.n) return '<span class="muted small">keine auswertbaren Werte</span>';
    return `<div class="stack" role="img" aria-label="Verteilung">${BAENDER.map(b => {
      const c = st.counts[b.k]; if (!c) return '';
      return `<span class="${b.k}" style="flex:${c}" data-tip="${esc(b.name)}: ${c} von ${st.n} (${pct(c / st.n)})"></span>`;
    }).join('')}</div>`;
  }
  function wertZelle(e, wert = 'tw') {
    if (!e) return '<span class="muted">–</span>';
    const b = band(e);
    let v = wert === 'pr' ? e.pr : wert === 'rw' ? e.rw : wert === 'ks' ? e.ks : tWert(e);
    const shown = wert === 'ks' ? (v || '–') : fmt(v);
    const t = tWert(e);
    const tipTxt = `${esc(e.skala_name || e.skala)}<br>T-Wert ${fmt(t)} · PR ${fmt(e.pr)} · RW ${fmt(e.rw)}${e.ks ? ' · KS ' + esc(e.ks) : ''}${e.fq != null ? ' · gFQ ' + fmt(e.fq) + ' %' : ''}${e.hinweis ? '<br><i>' + esc(e.hinweis) + '</i>' : ''}${e.tw == null && t != null ? '<br><i>T-Wert aus PR geschätzt</i>' : ''}${UMR[e.skala] ? '<br><i>' + UMR[e.skala].kurz + '</i>' : ''}`;
    return `<span class="cell" data-tip="${tipTxt}"><i class="dot ${b}"></i>${shown}${e.hinweis ? '<span class="flag">*</span>' : ''}</span>`;
  }

  /** Punktdiagramm: Median (Punkt) + mittlere 50 % (Linie), Normbereich T 40–60 hinterlegt */
  function dotChart(rows, opts = {}) {
    const w = Math.max(300, Math.round(opts.w || 640));
    const lw = Math.min(opts.labelWidth || 120, Math.round(w * 0.4)), rh = 30, top = 24, h = top + rows.length * rh + 8;
    const x0 = lw + 8, x1 = w - 16, lo = 20, hi = 80;
    const X = (t) => x0 + (Math.min(Math.max(t, lo), hi) - lo) / (hi - lo) * (x1 - x0);
    let s = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(opts.title || 'Diagramm')}">`;
    s += `<rect class="normband" x="${X(40)}" y="${top - 6}" width="${X(60) - X(40)}" height="${h - top}" />`;
    s += '<g class="grid">';
    for (let t = lo; t <= hi; t += 10) s += `<line x1="${X(t)}" x2="${X(t)}" y1="${top - 6}" y2="${h - 2}" /><text x="${X(t)}" y="12" text-anchor="middle">${t}</text>`;
    s += '</g>';
    s += `<line class="base" x1="${X(50)}" x2="${X(50)}" y1="${top - 6}" y2="${h - 2}" stroke-dasharray="3 3" />`;
    rows.forEach((r, i) => {
      const cy = top + i * rh + rh / 2;
      s += `<text class="lbl" x="${lw}" y="${cy + 4}" text-anchor="end">${esc(r.label)}</text>`;
      if (r.median == null) { s += `<text x="${x0 + 4}" y="${cy + 4}">keine Werte</text>`; return; }
      const col = r.color || 'var(--s1)';
      if (r.q1 != null && r.q3 != null) s += `<line x1="${X(r.q1)}" x2="${X(r.q3)}" y1="${cy}" y2="${cy}" stroke="${col}" stroke-width="3" stroke-linecap="round" opacity="0.55" />`;
      s += `<circle cx="${X(r.median)}" cy="${cy}" r="6" fill="${col}" stroke="var(--surface)" stroke-width="2" />`;
      s += `<rect class="hit" x="${x0}" y="${cy - rh / 2}" width="${x1 - x0}" height="${rh}" data-tip="${esc(r.tip || '')}" />`;
    });
    return s + '</svg>';
  }

  /** Liniendiagramm für Jahrgangsverlauf */
  function lineChart(xLabels, series, cw) {
    const w = Math.max(300, Math.round(cw || 640)), h = 260, l = 40, r = 16, t = 16, b = 46, lo = 20, hi = 80;
    const n = xLabels.length;
    const X = (i) => n === 1 ? (l + w - r) / 2 : l + i * (w - l - r) / (n - 1);
    const Y = (v) => t + (hi - Math.min(Math.max(v, lo), hi)) / (hi - lo) * (h - t - b);
    let s = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Verlauf">`;
    s += `<rect class="normband" x="${l}" y="${Y(60)}" width="${w - l - r}" height="${Y(40) - Y(60)}" />`;
    s += '<g class="grid">';
    for (let v = lo; v <= hi; v += 10) s += `<line x1="${l}" x2="${w - r}" y1="${Y(v)}" y2="${Y(v)}" /><text x="${l - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
    s += '</g>';
    xLabels.forEach((lab, i) => {
      const parts = lab.split('\n');
      parts.forEach((p, k) => { s += `<text x="${X(i)}" y="${h - b + 18 + k * 13}" text-anchor="middle">${esc(p)}</text>`; });
    });
    series.forEach(se => {
      const off = (series.indexOf(se) - (series.length - 1) / 2) * 7;   // leichte Versetzung gegen Überdeckung
      const pts = se.values.map((v, i) => v == null ? null : [X(i) + off, Y(v.median), v]).filter(Boolean);
      if (pts.length > 1) s += `<polyline fill="none" stroke="${se.color}" stroke-width="2" points="${pts.map(p => p[0] + ',' + p[1]).join(' ')}" />`;
      pts.forEach(p => {
        s += `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="${se.color}" stroke="var(--surface)" stroke-width="2" />`;
        s += `<circle class="hit" cx="${p[0]}" cy="${p[1]}" r="14" data-tip="${esc(se.name)}<br>${esc(p[2].tip)}" />`;
      });
    });
    return s + '</svg>';
  }

  /** sortierbare Tabelle */
  function tabelle(container, cols, rows, opts = {}) {
    let sortKey = opts.sortKey || null, dir = opts.dir || 1;
    function draw() {
      const data = rows.slice();
      if (sortKey) {
        const c = cols.find(c => c.key === sortKey);
        data.sort((a, b) => {
          const va = c.sort ? c.sort(a) : a[sortKey], vb = c.sort ? c.sort(b) : b[sortKey];
          if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
          return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'de', { numeric: true })) * dir;
        });
      }
      container.innerHTML = `<div class="table-wrap"><table><thead><tr>${cols.map(c =>
        `<th class="${c.sortable === false ? '' : 'sortable'} ${c.r ? 'r' : ''} ${c.key === sortKey ? (dir > 0 ? 'sort-asc' : 'sort-desc') : ''} ${c.sticky ? 'sticky-col' : ''}" data-k="${c.key}">${c.label}</th>`).join('')}</tr></thead>
        <tbody>${data.map((r, i) => `<tr class="${opts.onRow ? 'clickable' : ''}" data-i="${rows.indexOf(r)}">${cols.map(c =>
          `<td class="${c.r ? 'r num' : ''} ${c.sticky ? 'sticky-col' : ''}">${c.html ? c.html(r) : esc(r[c.key] ?? '–')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      $$('th.sortable', container).forEach(th => th.onclick = () => {
        const k = th.dataset.k; if (sortKey === k) dir = -dir; else { sortKey = k; dir = 1; } draw();
      });
      if (opts.onRow) $$('tbody tr', container).forEach(tr => tr.onclick = (ev) => {
        if (ev.target.closest('button,select,input,a')) return;
        opts.onRow(rows[+tr.dataset.i]);
      });
    }
    draw();
  }
  function leer(text) { return `<div class="card empty">${text}</div>`; }
  const farbe = (i) => `var(--s${(i % 8) + 1})`;

  /* ================= Filter ================= */
  function renderFilter() {
    const sjs = [...new Set(state.tests.map(t => t.schuljahr))].sort().reverse();
    const faecher = [...new Set(state.tests.map(t => t.fach))].sort();
    $('#f-schuljahr').innerHTML = '<option value="">Alle Schuljahre</option>' + sjs.map(s => `<option ${s === state.filter.schuljahr ? 'selected' : ''}>${esc(s)}</option>`).join('');
    $('#f-fach').innerHTML = '<option value="">Alle Fächer</option>' + faecher.map(s => `<option ${s === state.filter.fach ? 'selected' : ''}>${esc(s)}</option>`).join('');
  }
  $('#f-schuljahr').onchange = (e) => { state.filter.schuljahr = e.target.value; renderAll(); };
  $('#f-fach').onchange = (e) => { state.filter.fach = e.target.value; renderAll(); };

  /* ================= Überblick ================= */
  function renderOverview() {
    const el = $('#view-overview'); const tests = gefiltert();
    if (!state.tests.length) {
      el.innerHTML = leer(S.online && state.session && state.session.rolle !== 'leitung'
        ? 'Ihnen sind noch keine Klassen zugeordnet oder es wurden noch keine Tests importiert.'
        : 'Noch keine Daten. Importieren Sie eine Klett-Auswertung (PDF) im Reiter <b>Import</b>' + (S.online ? '.' : ' oder laden Sie dort die Beispieldaten.'));
      return;
    }
    let schueler = 0, foerderHaupt = 0, gueltigHaupt = 0;
    const klassen = new Set();
    tests.forEach(t => {
      klassen.add(t.schuljahr + '|' + t.klasse);
      schueler += kennungen(t).length;
      const st = statistik(erg(t, hauptskala(t)));
      foerderHaupt += st.counts.du + st.counts.u; gueltigHaupt += st.n;
    });
    el.innerHTML = `
      <div class="grid tiles">
        <div class="card tile"><div class="label">Testdurchführungen</div><div class="value">${tests.length}</div><div class="sub">${[...new Set(tests.map(t => t.verfahren))].join(', ') || '–'}</div></div>
        <div class="card tile"><div class="label">Klassen</div><div class="value">${klassen.size}</div><div class="sub">in ${new Set(tests.map(t => t.schuljahr)).size} Schuljahr(en)</div></div>
        <div class="card tile"><div class="label">Getestete Kinder</div><div class="value">${schueler}</div><div class="sub">Summe über alle Tests</div></div>
        <div class="card tile"><div class="label">Förderbedarf (Hauptskala)</div><div class="value">${gueltigHaupt ? pct(foerderHaupt / gueltigHaupt) : '–'}</div><div class="sub">${foerderHaupt} von ${gueltigHaupt} mit T-Wert unter 40</div></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Alle Testdurchführungen</h2><span class="muted small">Zeile antippen öffnet die Klassenansicht</span></div>
        ${legendeBaender()}
        <div id="ov-table" style="margin-top:10px"></div>
      </div>`;
    const rows = tests.map(t => {
      const hs = hauptskala(t), st = statistik(erg(t, hs));
      return { t, klasse: t.klasse, stufe: t.stufe, fach: t.fach, version: t.testversion || t.verfahren, sj: t.schuljahr,
        datum: t.testdatum, hs: skalaName(t, hs), n: st.n, nG: kennungen(t).length, median: st.median, foerder: st.anteilFoerder, st };
    });
    tabelle($('#ov-table'), [
      { key: 'klasse', label: 'Klasse', html: r => `<b>${esc(r.klasse)}</b>${r.t.demo ? ' <span class="badge">Beispiel</span>' : ''}` },
      { key: 'sj', label: 'Schuljahr' },
      { key: 'fach', label: 'Fach' },
      { key: 'version', label: 'Test' },
      { key: 'datum', label: 'Datum', html: r => datum(r.datum) },
      { key: 'n', label: 'n', r: true, html: r => `${r.n}<span class="muted">/${r.nG}</span>` },
      { key: 'hs', label: 'Hauptskala' },
      { key: 'median', label: 'Median T', r: true, html: r => fmt(r.median) },
      { key: 'foerder', label: 'Förderbedarf', r: true, html: r => pct(r.foerder) },
      { key: 'vert', label: 'Verteilung', sortable: false, html: r => stackBar(r.st) }
    ], rows, { onRow: r => { state.klasseTest = r.t.id; zeige('klasse'); } });
  }

  /* ================= Klasse ================= */
  function renderKlasse() {
    const el = $('#view-klasse'); const tests = gefiltert();
    if (!tests.length) { el.innerHTML = leer('Keine Tests im aktuellen Filter.'); return; }
    let t = tests.find(x => x.id === state.klasseTest) || tests[0];
    state.klasseTest = t.id;
    const sks = skalen(t);
    const stats = sks.map(sk => ({ sk, name: skalaName(t, sk), st: statistik(erg(t, sk)) }));
    el.innerHTML = `
      <div class="filters">
        <div class="field" style="flex:1;min-width:220px"><label>Testdurchführung</label>
          <select id="k-test">${tests.map(x => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${esc(testLabel(x))}</option>`).join('')}</select></div>
        <div class="field"><label>Wert in der Tabelle</label>
          <select id="k-wert">${(t.verfahren === 'SLS' ? [['tw', 'T-Wert'], ['rw', 'Lesequotient'], ['pr', 'Prozentrang'], ['ks', 'Leistungsstufe']]
            : [['tw', 'T-Wert'], ['pr', 'Prozentrang'], ['rw', 'Rohwert']].concat(t.verfahren === 'HSP' ? [['ks', 'Kompetenzstufe']] : t.verfahren === 'STOLLE' ? [['ks', 'Leistungsstufe']] : []))
            .map(([v, l]) => `<option value="${v}" ${v === state.klasseWert ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <button class="btn" id="k-csv">CSV exportieren</button>
        <button class="btn" id="k-print" onclick="window.print()">Drucken</button>
      </div>
      <div class="card">
        <div class="card-head"><h2>Klasse ${esc(t.klasse)} · ${esc(t.testversion || t.verfahren)}</h2>
          <span class="muted small">${esc(t.fach)} · ${esc(t.schuljahr)} · ${datum(t.testdatum)} · Norm: ${esc(t.norm || '–')}</span></div>
        <div class="grid two">
          <div><h3 style="margin-bottom:6px">Klassenprofil</h3>
            <p class="muted small" style="margin:0 0 6px">Punkt = Median der Klasse, Linie = mittlere 50 % der Kinder, grau = Normbereich T 40–60.</p>
            <div id="k-profil"></div>
          </div>
          <div><h3 style="margin-bottom:6px">Verteilung je Bereich</h3>
            <div id="k-skalen"></div>
            <div style="margin-top:8px">${legendeBaender()}</div>
          </div>
        </div>
      </div>
      ${umrechnungsHinweis(t)}
      ${leseVerlauf(t)}
      <div class="card">
        <div class="card-head"><h2>Einzelergebnisse</h2><span class="muted small">Spaltenkopf sortiert · * = Hinweis (hochgerechnet, Grenzwert oder nicht auswertbar)</span></div>
        <div id="k-matrix"></div>
      </div>`;
    const kp = $('#k-profil');
    kp.innerHTML = dotChart(stats.filter(s => s.st.n).map(s => ({ label: s.name, median: s.st.median, q1: s.st.q1, q3: s.st.q3, color: 'var(--s1)',
      tip: `${esc(s.name)}<br>Median T ${fmt(s.st.median)} · mittlere 50 %: ${fmt(s.st.q1)}–${fmt(s.st.q3)}<br>n = ${s.st.n}` })), { labelWidth: 170, title: 'Klassenprofil', w: kp.clientWidth });
    tabelle($('#k-skalen'), [
      { key: 'name', label: 'Bereich' },
      { key: 'n', label: 'n', r: true, html: r => r.st.n },
      { key: 'med', label: 'Median T', r: true, html: r => fmt(r.st.median) },
      { key: 'f', label: 'Förderbedarf', r: true, html: r => pct(r.st.anteilFoerder) },
      { key: 'v', label: 'Verteilung', sortable: false, html: r => stackBar(r.st) }
    ], stats.map(s => Object.assign(s, { n: s.st.n, med: s.st.median, f: s.st.anteilFoerder })));

    const rows = kennungen(t).map(k => {
      const r = { kennung: k, werte: {} };
      t.ergebnisse.filter(e => e.kennung === k).forEach(e => r.werte[e.skala] = e);
      r.anzFoerder = Object.values(r.werte).filter(foerder).length;
      return r;
    });
    const w = state.klasseWert;
    tabelle($('#k-matrix'), [
      { key: 'kennung', label: 'Kennung', sticky: true, html: r => `<b>${esc(r.kennung)}</b>` },
      ...sks.map(sk => ({ key: sk, label: esc(sk), r: true, html: r => wertZelle(r.werte[sk], w),
        sort: r => { const e = r.werte[sk]; if (!e) return null; return w === 'tw' ? tWert(e) : w === 'ks' ? e.ks : e[w]; } })),
      { key: 'anzFoerder', label: 'Bereiche < T40', r: true, html: r => r.anzFoerder ? `<b>${r.anzFoerder}</b>` : '0' }
    ], rows, { sortKey: hauptskala(t), dir: 1 });

    $('#k-test').onchange = (e) => { state.klasseTest = +e.target.value || e.target.value; renderKlasse(); };
    $('#k-wert').onchange = (e) => { state.klasseWert = e.target.value; renderKlasse(); };
    $('#k-csv').onclick = () => {
      const kopf = ['Kennung', ...sks.flatMap(sk => [sk + '_RW', sk + '_PR', sk + '_T', sk + '_KS', sk + '_Hinweis'])];
      const lines = [kopf.join(';')].concat(rows.map(r => [r.kennung, ...sks.flatMap(sk => {
        const e = r.werte[sk] || {}; return [e.rw, e.pr, e.tw, e.ks, e.hinweis].map(v => v == null ? '' : String(v).replace('.', ','));
      })].join(';')));
      download(`${t.klasse}_${t.verfahren}_${t.schuljahr.replace('/', '-')}.csv`, '﻿' + lines.join('\n'), 'text/csv');
    };
  }

  /* Umrechnung der Lesetests in T-Werte (für die Vergleichbarkeit mit HSP/LRP) */
  const UMR = {
    LQ: { kurz: 'T-Wert umgerechnet aus dem Lesequotienten: T = 50 + (LQ − 100) / 1,5', test: 'SLS', formel: 'T = 50 + (LQ − 100) / 1,5', grenze: 'T 40 entspricht etwa LQ 85', vorlage: 'LQ unter 90' },
    LES: { kurz: 'T-Wert umgerechnet aus dem Prozentrang (Normalverteilung)', test: 'STOLLE', formel: 'Prozentrang über die Normalverteilung in T-Werte übertragen', grenze: 'T 40 entspricht etwa PR 16', vorlage: 'PR ≤ 24' }
  };
  function umrechnungsHinweis(t) {
    const u = UMR[hauptskala(t)]; if (!u) return '';
    return `<div class="msg small"><b>Hinweis zur Umrechnung:</b> Die ${u.test}-Ergebnisse wurden in T-Werte umgerechnet (${u.formel}), damit sie mit HSP und LRP vergleichbar sind.
      Klassenprofil, Einzelergebnisse und Förderliste nutzen deshalb die gemeinsame Grenze T 40; ${u.grenze}.
      Die Einstufung laut Testvorlage (Risikogruppe ${u.vorlage}) zeigen „Leistungsstufen im Verlauf“ und der Jahrgangsspiegel.</div>`;
  }

  /** Leistungsstufen der Testvorlage im Verlauf (gleicher Jahrgang und Zug) */
  function leseVerlauf(t) {
    const B = LT()[t.verfahren]; if (!B) return '';
    const hj = (x) => window.Spiegel ? window.Spiegel.halbjahrVon(x) : 1;
    const reihe = state.tests.filter(x => x.verfahren === t.verfahren && jahrgang(x) === jahrgang(t) && zug(x) === zug(t))
      .sort((a, b) => a.schuljahr.localeCompare(b.schuljahr) || hj(a) - hj(b));
    const zp = (x) => (x.testversion || '').replace(/^(STOLLE|SLS)\s*/, '').replace(/\s*Klasse\s*\d+$/, '') + (x.verfahren === 'SLS' ? ` Kl. ${x.stufe}` : '');
    const n = (x) => x.ergebnisse.filter(e => e.ks).length;
    return `<div class="card">
      <div class="card-head"><h2>Leistungsstufen ${esc(t.verfahren)} im Verlauf</h2><span class="muted small">Zug ${esc(zug(t).toUpperCase())}, Einschulung ${jahrgang(t)} · Stufen laut Testvorlage · Risikogruppe: ${esc(B.risikoText)}</span></div>
      <div class="table-wrap"><table class="spiegel"><thead><tr><th>Leistungsstufe</th>${reihe.map(x => `<th class="r gs ${x.id === t.id ? 'aktuell' : ''}">${esc(zp(x))}<br><span class="muted">${esc(x.klasse)} · ${esc(x.schuljahr)}</span></th>`).join('')}</tr></thead>
      <tbody>${B.baender.map(([, lab, name], i) => `<tr><td><b>${esc(lab)}</b> ${esc(name)}</td>${reihe.map(x => {
        const c = x.ergebnisse.filter(e => e.ks === name).length, N = n(x);
        const risk = B.risiko(x.verfahren === 'SLS' ? { rw: B.baender[i][0] === -Infinity ? 0 : B.baender[i][0] } : { pr: B.baender[i][0] });
        return `<td class="r num gs ${x.id === t.id ? 'aktuell' : ''}">${c ? `<b>${c}</b> <span class="muted">(${pct(c / N)})</span>` : '<span class="muted">–</span>'}${risk && c ? ' <i class="dot du" title="Risikogruppe"></i>' : ''}</td>`;
      }).join('')}</tr>`).join('')}
      <tr class="sum"><td>Getestete Kinder</td>${reihe.map(x => `<td class="r num gs">${n(x)}</td>`).join('')}</tr></tbody></table></div>
      ${reihe.length < 2 ? '<p class="muted small" style="margin:8px 0 0">Weitere Spalten erscheinen, sobald derselbe Zug zu späteren Zeitpunkten getestet wurde.</p>' : ''}
    </div>`;
  }

  /* ================= Stufenvergleich ================= */
  function renderStufe() {
    const el = $('#view-stufe');
    const basis = gefiltert();
    if (!basis.length) { el.innerHTML = leer('Keine Tests im aktuellen Filter.'); return; }
    const sjs = [...new Set(basis.map(t => t.schuljahr))].sort().reverse();
    const sj = state.stufe.sj && sjs.includes(state.stufe.sj) ? state.stufe.sj : sjs[0];
    const imSj = basis.filter(t => t.schuljahr === sj);
    const stufen = [...new Set(imSj.map(t => t.stufe))].sort((a, b) => a - b);
    const stufe = stufen.includes(state.stufe.stufe) ? state.stufe.stufe : stufen[0];
    const inStufe = imSj.filter(t => t.stufe === stufe);
    const versionen = [...new Set(inStufe.map(t => t.testversion || t.verfahren))];
    const version = versionen.includes(state.stufe.version) ? state.stufe.version : versionen[0];
    const klassen = inStufe.filter(t => (t.testversion || t.verfahren) === version).sort(sortTests);
    const sks = [...new Set(klassen.flatMap(skalen))].filter(sk => klassen.some(t => erg(t, sk).some(e => tWert(e) != null)));
    const skala = sks.includes(state.stufe.skala) ? state.stufe.skala : (klassen[0] ? hauptskala(klassen[0]) : sks[0]);
    Object.assign(state.stufe, { sj, stufe, version, skala });
    const name = klassen[0] ? skalaName(klassen[0], skala) : skala;

    el.innerHTML = `
      <div class="filters">
        <div class="field"><label>Schuljahr</label><select id="s-sj">${sjs.map(s => `<option ${s === sj ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="field"><label>Klassenstufe</label><select id="s-stufe">${stufen.map(s => `<option value="${s}" ${s === stufe ? 'selected' : ''}>Stufe ${s}</option>`).join('')}</select></div>
        <div class="field" style="min-width:200px"><label>Test</label><select id="s-version">${versionen.map(v => `<option ${v === version ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
      </div>
      <div class="chips" id="s-skalen">${sks.map(sk => `<button class="chip" aria-pressed="${sk === skala}" data-sk="${esc(sk)}">${esc(klassen[0] ? skalaName(klassen[0], sk) : sk)}</button>`).join('')}</div>
      ${klassen.length < 2 ? `<div class="msg">In Stufe ${stufe} liegt für diesen Test bisher nur ${klassen.length} Klasse vor. Der Vergleich füllt sich, sobald weitere Parallelklassen importiert sind.</div>` : ''}
      <div class="grid two">
        <div class="card"><div class="card-head"><h2>${esc(name)}: Median je Klasse</h2></div>
          <p class="muted small" style="margin:0 0 6px">Punkt = Median, Linie = mittlere 50 %, grau = Normbereich T 40–60.</p>
          <div id="s-dots"></div>
        </div>
        <div class="card"><div class="card-head"><h2>${esc(name)}: Verteilung je Klasse</h2></div>
          <div id="s-vert"></div><div style="margin-top:8px">${legendeBaender()}</div></div>
      </div>
      <div class="card"><div class="card-head"><h2>Alle Bereiche im Vergleich</h2><span class="muted small">Median T-Wert · in Klammern Anteil mit Förderbedarf</span></div>
        <div id="s-matrix"></div></div>`;

    const sd = $('#s-dots');
    sd.innerHTML = dotChart(klassen.map((t, i) => { const st = statistik(erg(t, skala)); return { label: 'Klasse ' + t.klasse, median: st.median, q1: st.q1, q3: st.q3, color: farbe(i),
      tip: `Klasse ${esc(t.klasse)}<br>Median T ${fmt(st.median)} · mittlere 50 %: ${fmt(st.q1)}–${fmt(st.q3)}<br>Förderbedarf ${pct(st.anteilFoerder)} (n = ${st.n})` }; }), { labelWidth: 90, title: 'Median je Klasse', w: sd.clientWidth });
    tabelle($('#s-vert'), [
      { key: 'klasse', label: 'Klasse', html: r => `<b>${esc(r.klasse)}</b>` },
      { key: 'n', label: 'n', r: true },
      { key: 'f', label: 'Förderbedarf', r: true, html: r => pct(r.f) },
      { key: 'v', label: 'Verteilung', sortable: false, html: r => stackBar(r.st) }
    ], klassen.map(t => { const st = statistik(erg(t, skala)); return { klasse: t.klasse, n: st.n, f: st.anteilFoerder, st }; }));

    const mrows = klassen.map(t => { const r = { klasse: t.klasse, t }; sks.forEach(sk => r[sk] = statistik(erg(t, sk))); return r; });
    const gesamt = { klasse: 'Stufe gesamt' };
    sks.forEach(sk => gesamt[sk] = statistik(klassen.flatMap(t => erg(t, sk))));
    tabelle($('#s-matrix'), [
      { key: 'klasse', label: 'Klasse', sticky: true, html: r => `<b>${esc(r.klasse)}</b>` },
      ...sks.map(sk => ({ key: sk, label: esc(sk), r: true, sort: r => r[sk].median,
        html: r => { const st = r[sk]; if (!st.n) return '–'; const b = band({ tw: st.median });
          return `<span class="cell" data-tip="${esc(skalaName(klassen[0], sk))}<br>Median T ${fmt(st.median)}<br>Förderbedarf ${pct(st.anteilFoerder)} (n = ${st.n})"><i class="dot ${b}"></i>${fmt(st.median)} <span class="muted">(${pct(st.anteilFoerder)})</span></span>`; } }))
    ], mrows.concat(klassen.length > 1 ? [gesamt] : []));

    $('#s-sj').onchange = e => { state.stufe.sj = e.target.value; renderStufe(); };
    $('#s-stufe').onchange = e => { state.stufe.stufe = +e.target.value; renderStufe(); };
    $('#s-version').onchange = e => { state.stufe.version = e.target.value; renderStufe(); };
    $$('#s-skalen .chip').forEach(b => b.onclick = () => { state.stufe.skala = b.dataset.sk; renderStufe(); });
  }

  /* ================= Jahrgang ================= */
  function renderJahrgang() {
    const el = $('#view-jahrgang');
    const basis = state.tests.filter(t => !state.filter.fach || t.fach === state.filter.fach);
    if (!basis.length) { el.innerHTML = leer('Keine Tests vorhanden.'); return; }
    const jgs = [...new Set(basis.map(jahrgang))].sort().reverse();
    const jg = jgs.includes(state.jg.jahrgang) ? state.jg.jahrgang : jgs[0];
    state.jg.jahrgang = jg;
    const tests = basis.filter(t => jahrgang(t) === jg);
    const zuege = [...new Set(tests.map(zug))].sort();
    const faecher = [...new Set(tests.map(t => t.fach))].sort();
    el.innerHTML = `
      <div class="filters">
        <div class="field"><label>Einschulungsjahrgang</label><select id="j-jg">${jgs.map(j => `<option value="${j}" ${j === jg ? 'selected' : ''}>Einschulung ${j}/${String((j + 1) % 100).padStart(2, '0')}</option>`).join('')}</select></div>
      </div>
      <div class="msg small">Ein Jahrgang umfasst alle Klassen, die im selben Schuljahr eingeschult wurden (z. B. 1d im Schuljahr 2024/25 und 3d im Schuljahr 2026/27). Die Kennungen sind je Test verschieden, der Verlauf vergleicht deshalb Klassenmediane der Hauptskala.</div>
      ${faecher.map(f => `<div class="card" id="j-${esc(f)}"></div>`).join('')}`;
    faecher.forEach(f => {
      const tf = tests.filter(t => t.fach === f).sort((a, b) => (a.testdatum || a.schuljahr).localeCompare(b.testdatum || b.schuljahr));
      // Zeitpunkte = Testversion + Schuljahr
      const punkte = []; tf.forEach(t => { const k = t.schuljahr + '|' + (t.testversion || t.verfahren); if (!punkte.includes(k)) punkte.push(k); });
      const series = zuege.map((z, i) => ({ name: 'Zug ' + z.toUpperCase(), color: farbe(i), values: punkte.map(p => {
        const t = tf.find(t => zug(t) === z && t.schuljahr + '|' + (t.testversion || t.verfahren) === p); if (!t) return null;
        const hs = hauptskala(t), st = statistik(erg(t, hs)); if (st.median == null) return null;
        return { median: st.median, tip: `Klasse ${t.klasse} · ${t.testversion || t.verfahren}<br>${skalaName(t, hs)}: Median T ${fmt(st.median)}<br>Förderbedarf ${pct(st.anteilFoerder)}` };
      }) })).filter(s => s.values.some(Boolean));
      const labels = punkte.map(p => { const [sj, v] = p.split('|'); return v + '\n' + sj; });
      const box = $(`#j-${CSS.escape(f)}`);
      box.innerHTML = `<div class="card-head"><h2>${esc(f)}</h2><span class="muted small">Median T-Wert der Hauptskala je Testzeitpunkt</span></div>
        ${series.length > 1 ? `<div class="legend" style="margin-bottom:6px">${series.map(s => `<span><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : ''}
        <div class="j-chart"></div>${punkte.length < 2 ? '<p class="muted small" style="margin:6px 0 0">Bisher ein Testzeitpunkt. Die Verlaufslinie entsteht, sobald ein weiterer Test dieses Jahrgangs importiert ist.</p>' : ''}`;
      const jc = $('.j-chart', box); jc.innerHTML = lineChart(labels, series, Math.min(jc.clientWidth, 900));
    });
    $('#j-jg').onchange = e => { state.jg.jahrgang = +e.target.value; renderJahrgang(); };
  }

  /* ================= Förderliste ================= */
  function renderFoerder() {
    const el = $('#view-foerder'); const tests = gefiltert();
    el.innerHTML = `
      <div class="filters">
        <div class="field" style="flex:1;min-width:200px"><label>Kennung suchen</label><input type="text" id="fl-q" placeholder="z. B. j0w7d" value="${esc(state.flQ || '')}"></div>
        <div class="field"><label>Anzeige</label><select id="fl-mode">
          <option value="foerder" ${state.flMode !== 'alle' ? 'selected' : ''}>Nur mit Förderbedarf</option>
          <option value="alle" ${state.flMode === 'alle' ? 'selected' : ''}>Alle Kinder</option></select></div>
        <button class="btn" id="fl-csv">CSV exportieren</button>
      </div>
      <div class="card"><div class="card-head"><h2>Förderliste</h2><span class="muted small">Kinder mit mindestens einem Bereich unter T 40 (≈ Prozentrang 16)</span></div><div id="fl-table"></div>
        ${tests.some(t => UMR[hauptskala(t)]) ? `<p class="muted small" style="margin:10px 0 0">† Umgerechnet: Für STOLLE (Prozentrang) und SLS (Lesequotient) wurden die Ergebnisse in T-Werte umgerechnet, damit sie mit HSP und LRP vergleichbar sind. T 40 entspricht etwa PR 16 bzw. LQ 85. Die Einstufung laut Testvorlage (Risikogruppe STOLLE PR ≤ 24, SLS LQ unter 90) zeigen die Klassenansicht und der Jahrgangsspiegel.</p>` : ''}</div>`;
    const q = (state.flQ || '').trim().toLowerCase();
    const rows = [];
    tests.forEach(t => kennungen(t).forEach(k => {
      if (q && !k.toLowerCase().includes(q)) return;
      const es = t.ergebnisse.filter(e => e.kennung === k);
      const schwach = es.filter(foerder);
      const ts = es.map(tWert).filter(v => v != null);
      if (state.flMode !== 'alle' && !schwach.length) return;
      const hs = es.find(e => e.skala === hauptskala(t));
      rows.push({ kennung: k, t, klasse: t.klasse, test: t.testversion || t.verfahren, sj: t.schuljahr, fach: t.fach,
        haupt: hs ? tWert(hs) : null, hsE: hs, minT: ts.length ? Math.min(...ts) : null, anz: schwach.length, schwach });
    }));
    if (!rows.length) { $('#fl-table').innerHTML = '<p class="muted">Keine Treffer.</p>'; }
    else tabelle($('#fl-table'), [
      { key: 'kennung', label: 'Kennung', sticky: true, html: r => `<b>${esc(r.kennung)}</b>` },
      { key: 'klasse', label: 'Klasse' }, { key: 'sj', label: 'Schuljahr' }, { key: 'test', label: 'Test', html: r => esc(r.test) + (UMR[hauptskala(r.t)] ? ' <span class="muted" title="in T-Werte umgerechnet">†</span>' : '') },
      { key: 'haupt', label: 'Hauptskala T', r: true, html: r => wertZelle(r.hsE) },
      { key: 'minT', label: 'niedrigster T', r: true, html: r => fmt(r.minT) },
      { key: 'anz', label: 'Bereiche < T40', r: true },
      { key: 'b', label: 'Betroffene Bereiche', sortable: false, html: r => r.schwach.map(e => `<span class="cell" style="margin-right:8px">${wertZelle(e)} <span class="muted small">${esc(e.skala)}${UMR[e.skala] ? ' †' : ''}</span></span>`).join('') }
    ], rows, { sortKey: 'minT', dir: 1, onRow: r => { state.klasseTest = r.t.id; zeige('klasse'); } });
    const qi = $('#fl-q');
    qi.oninput = e => { state.flQ = e.target.value; const pos = e.target.selectionStart; renderFoerder(); const n = $('#fl-q'); n.focus(); n.setSelectionRange(pos, pos); };
    $('#fl-mode').onchange = e => { state.flMode = e.target.value; renderFoerder(); };
    $('#fl-csv').onclick = () => {
      const lines = ['Kennung;Klasse;Schuljahr;Test;Hauptskala_T;niedrigster_T;Bereiche_unter_T40;Bereiche'].concat(rows.map(r =>
        [r.kennung, r.klasse, r.sj, r.test, fmt(r.haupt), fmt(r.minT), r.anz, r.schwach.map(e => e.skala).join(' ')].join(';')));
      download('Foerderliste.csv', '﻿' + lines.join('\n'), 'text/csv');
    };
  }

  /* ================= Import ================= */
  const importQueue = [];
  const LT = () => (window.LeseTabellen && window.LeseTabellen.STUFEN) || {};
  function leseStufenInfo(t) {
    const B = LT()[t.meta.verfahren]; if (!B) return '';
    const n = t.ergebnisse.filter(e => e.ks).length;
    return `<div class="small" style="margin-top:6px">${B.baender.map(([, lab, name]) => {
      const c = t.ergebnisse.filter(e => e.ks === name).length;
      return `<span style="margin-right:12px;white-space:nowrap">${esc(name)}: <b>${c}</b></span>`; }).join('')}<span class="muted">(${n} Kinder mit Wert)</span></div>`;
  }
  function renderImport() {
    const el = $('#view-import');
    el.innerHTML = `
      <div class="card">
        <div class="card-head"><h2>Auswertungen importieren</h2></div>
        <label class="drop" id="drop">
          <input type="file" id="imp-file" accept=".pdf,.csv,.xlsx" multiple hidden>
          <div><b>Auswertungen hier ablegen</b> oder antippen zum Auswählen</div>
          <div class="muted small" style="margin-top:6px">PDF: Klett-Klassenauswertungen (HSP, LRP). Excel: Ergebnistabellen der Klassenleitungen für STOLLE und SLS. CSV: andere Verfahren.</div>
        </label>
        <div class="row" style="margin-top:12px">
          <a class="btn" href="vorlagen/Ergebnistabelle_STOLLE.xlsx" download>Ergebnistabelle STOLLE</a>
          <a class="btn" href="vorlagen/Ergebnistabelle_SLS.xlsx" download>Ergebnistabelle SLS</a>
          <button class="btn" id="imp-vorlage">CSV-Vorlage (andere Tests)</button>
          ${!S.online ? '<button class="btn" id="imp-demo">Beispieldaten laden</button>' : ''}
        </div>
        <p class="muted small" style="margin-bottom:0">Die PDFs werden nur im Browser ausgelesen. Gespeichert werden ausschließlich Klasse, Testangaben und die pseudonymisierten Kennungen mit ihren Werten.</p>
      </div>
      <div id="imp-list"></div>`;
    const inp = $('#imp-file'), drop = $('#drop');
    inp.onchange = () => verarbeiteDateien([...inp.files]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); verarbeiteDateien([...e.dataTransfer.files]); };
    $('#imp-vorlage').onclick = () => download('Vorlage_Diagnostik.csv', '﻿' +
      'verfahren;fach;testversion;klasse;stufe;schuljahr;testdatum;kennung;skala;skala_name;rw;pr;tw;ks;hinweis\n' +
      'ELFE;Deutsch;ELFE II;2a;2;2026/27;15.10.2026;ab12c;LV;Leseverständnis;14;35;46;;\n', 'text/csv');
    const demo = $('#imp-demo');
    if (demo) demo.onclick = async () => {
      for (const t of (window.DEMO_DATA || [])) {
        try { await S.speichereTest(Object.assign({}, t.meta, { demo: !!t.demo }), t.ergebnisse, true); } catch (e) { console.error(e); }
      }
      await laden(); meldung('Beispieldaten geladen.'); zeige('overview');
    };
    zeichneQueue();
  }
  async function verarbeiteDateien(files) {
    for (const f of files) {
      const item = { datei: f.name, status: 'lesen', tests: [] };
      importQueue.unshift(item); zeichneQueue();
      try {
        if (/\.xlsx$/i.test(f.name)) item.tests = await window.LeseTabellen.parseXlsx(await f.arrayBuffer(), f.name);
        else if (/\.csv$/i.test(f.name)) {
          const txt = await f.text();
          item.tests = /schüler.?id/i.test(txt.split('\n').slice(0, 30).join(' ')) ? window.LeseTabellen.parseCsvTabelle(txt, f.name) : P.parseCsv(txt, f.name);
        } else if (/\.xls$/i.test(f.name)) {
          throw new Error('Altes Excel-Format (.xls). Bitte in Excel „Speichern unter“ → Excel-Arbeitsmappe (.xlsx) wählen.');
        } else {
          if (!window.pdfjsLib) throw new Error('PDF-Bibliothek nicht geladen (Internetverbindung prüfen).');
          item.tests = [await P.parsePdf(await f.arrayBuffer(), f.name)];
        }
        item.tests.forEach(t => { if (!t.ergebnisse.length) throw new Error('Keine Schülerergebnisse gefunden.'); });
        item.status = 'bereit';
      } catch (e) { item.status = 'fehler'; item.fehler = e.message; }
      zeichneQueue();
    }
  }
  function zeichneQueue() {
    const box = $('#imp-list'); if (!box) return;
    box.innerHTML = importQueue.map((it, qi) => it.status === 'fehler'
      ? `<div class="card"><b>${esc(it.datei)}</b><div class="msg err" style="margin-top:8px">${esc(it.fehler)}</div></div>`
      : it.status === 'lesen' ? `<div class="card"><b>${esc(it.datei)}</b> <span class="muted">wird gelesen …</span></div>`
      : it.tests.map((t, ti) => {
        const m = t.meta, sk = [...new Set(t.ergebnisse.map(e => e.skala))];
        const n = new Set(t.ergebnisse.map(e => e.kennung)).size;
        return `<div class="card import-item" data-q="${qi}" data-t="${ti}">
          <div class="card-head"><h2>${esc(m.testversion || m.verfahren)}</h2><span class="muted small">${esc(it.datei)}</span></div>
          <div class="muted small">${n} Kinder · Bereiche: ${sk.map(esc).join(', ')}</div>
          ${leseStufenInfo(t)}
          ${(t.warnungen || []).length ? `<div class="msg err small" style="margin-top:8px">Nicht übernommen:<br>${t.warnungen.map(esc).join('<br>')}</div>` : ''}
          <div class="meta-grid">
            <div class="field"><label>Klasse</label><input type="text" data-f="klasse" value="${esc(m.klasse)}"></div>
            <div class="field"><label>Stufe</label><input type="number" min="1" max="13" data-f="stufe" value="${esc(m.stufe)}"></div>
            <div class="field"><label>Schuljahr (JJJJ/JJ)</label><input type="text" data-f="schuljahr" value="${esc(m.schuljahr)}" placeholder="2026/27"></div>
            <div class="field"><label>Testdatum</label><input type="date" data-f="testdatum" value="${esc(m.testdatum || '')}"></div>
            ${LT()[m.verfahren] ? `<div class="field"><label>Zeitpunkt</label><select data-f="zeitpunkt">${LT()[m.verfahren].zeitpunkte.map(z => `<option ${z === t.zeitpunkt ? 'selected' : ''}>${esc(z)}</option>`).join('')}${t.zeitpunkt && !LT()[m.verfahren].zeitpunkte.includes(t.zeitpunkt) ? `<option selected>${esc(t.zeitpunkt)}</option>` : ''}</select></div>`
              : `<div class="field"><label>Fach</label><input type="text" data-f="fach" value="${esc(m.fach)}"></div>`}
          </div>
          <div class="row">${t.gespeichert ? '<span class="msg ok">✓ gespeichert</span>' : `<button class="btn primary" data-act="save">Speichern</button>`}
            ${t.dup && !t.gespeichert ? '<button class="btn danger" data-act="replace">Vorhandenen Test ersetzen</button>' : ''}
            <span class="small ${t.err ? 'msg err' : ''}">${esc(t.err || '')}</span></div>
        </div>`;
      }).join('')).join('');
    $$('.import-item', box).forEach(card => {
      const t = importQueue[+card.dataset.q].tests[+card.dataset.t];
      $$('input[data-f], select[data-f]', card).forEach(i => i.onchange = () => {
        const f = i.dataset.f;
        if (f === 'zeitpunkt') t.zeitpunkt = i.value;
        else t.meta[f] = f === 'stufe' ? parseInt(i.value, 10) : i.value;
        if (f === 'klasse' && !t.meta.stufe) t.meta.stufe = parseInt((i.value.match(/\d+/) || [])[0], 10) || null;
        if (LT()[t.meta.verfahren]) {
          if (!t.zeitpunkt && t.meta.verfahren === 'STOLLE' && t.meta.stufe) t.zeitpunkt = 'Ende Klasse ' + t.meta.stufe;
          t.meta.testversion = t.meta.verfahren === 'STOLLE' ? `STOLLE ${t.zeitpunkt}` : `SLS ${t.zeitpunkt} Klasse ${t.meta.stufe || '?'}`;
          zeichneQueue();
        }
      });
      $$('button[data-act]', card).forEach(b => b.onclick = async () => {
        const m = t.meta;
        if (!m.klasse || !m.stufe || !/^\d{4}\/\d{2}$/.test(m.schuljahr || '')) { t.err = 'Bitte Klasse, Stufe und Schuljahr (z. B. 2026/27) angeben.'; zeichneQueue(); return; }
        b.disabled = true; b.textContent = 'Speichere …';
        try { await S.speichereTest(m, t.ergebnisse, b.dataset.act === 'replace'); t.gespeichert = true; t.err = ''; await laden(); }
        catch (e) { t.err = e.code === 'DUP' ? 'Dieser Test ist bereits gespeichert.' : (e.message || String(e)); t.dup = e.code === 'DUP'; }
        zeichneQueue();
      });
    });
  }

  /* ================= Verwaltung ================= */
  async function renderAdmin() {
    const el = $('#view-admin');
    const testsHtml = `<div class="card"><div class="card-head"><h2>Gespeicherte Tests</h2></div><div id="a-tests"></div></div>`;
    if (!S.online) {
      el.innerHTML = `<div class="card"><div class="card-head"><h2>Lokaler Modus</h2></div>
        <p class="small">Die Daten liegen nur in diesem Browser. Für den gemeinsamen Zugriff von Schulleitung und Lehrkräften tragen Sie die Supabase-Zugangsdaten in <code>js/config.js</code> ein (siehe README).</p>
        <div class="row"><button class="btn" id="a-exp">Sicherung herunterladen</button>
        <label class="btn">Sicherung einspielen<input type="file" id="a-imp" accept=".json" hidden></label>
        <button class="btn danger" id="a-del">Alle Daten löschen</button></div></div>${testsHtml}`;
      $('#a-exp').onclick = () => download('diagnostik-sicherung.json', S.exportJson(), 'application/json');
      $('#a-imp').onchange = async e => { try { S.importJson(await e.target.files[0].text()); await laden(); meldung('Sicherung eingespielt.'); } catch (er) { meldung(er.message, true); } };
      $('#a-del').onclick = async () => { if (confirm('Wirklich alle lokal gespeicherten Daten löschen?')) { S.alleLokalLoeschen(); await laden(); } };
    } else {
      el.innerHTML = `
        <div class="card"><div class="card-head"><h2>Konten und Rollen</h2><span class="muted small">Neue Lehrkräfte: in Supabase unter Authentication › Users einladen</span></div><div id="a-prof">Lädt …</div></div>
        <div class="card"><div class="card-head"><h2>Klassen-Zuordnungen</h2><span class="muted small">Lehrkräfte sehen nur zugeordnete Klassen</span></div>
          <div class="filters" style="margin-bottom:12px">
            <div class="field" style="min-width:200px"><label>Lehrkraft</label><select id="z-user"></select></div>
            <div class="field"><label>Klasse</label><input type="text" id="z-klasse" placeholder="3d"></div>
            <div class="field"><label>Schuljahr</label><input type="text" id="z-sj" placeholder="2026/27"></div>
            <button class="btn primary" id="z-add">Zuordnen</button>
          </div><div id="a-zu"></div></div>${testsHtml}`;
      try {
        const [prof, zu] = await Promise.all([S.profile(), S.zuordnungen()]);
        const byId = new Map(prof.map(p => [p.id, p]));
        tabelle($('#a-prof'), [
          { key: 'email', label: 'E-Mail' },
          { key: 'rolle', label: 'Rolle', sortable: false, html: p => `<select data-uid="${p.id}" ${p.id === state.session.user.id ? 'disabled' : ''}>
            <option value="lehrkraft" ${p.rolle === 'lehrkraft' ? 'selected' : ''}>Lehrkraft</option><option value="leitung" ${p.rolle === 'leitung' ? 'selected' : ''}>Schulleitung</option></select>` }
        ], prof);
        $$('#a-prof select').forEach(s => s.onchange = async () => { try { await S.setzeRolle(s.dataset.uid, s.value); meldung('Rolle geändert.'); } catch (e) { meldung(e.message, true); } });
        $('#z-user').innerHTML = prof.filter(p => p.rolle === 'lehrkraft').map(p => `<option value="${p.id}">${esc(p.email)}</option>`).join('');
        $('#z-sj').value = [...new Set(state.tests.map(t => t.schuljahr))].sort().pop() || '';
        tabelle($('#a-zu'), [
          { key: 'u', label: 'Lehrkraft', html: z => esc((byId.get(z.user_id) || {}).email || z.user_id) },
          { key: 'klasse', label: 'Klasse' }, { key: 'schuljahr', label: 'Schuljahr' },
          { key: 'x', label: '', sortable: false, html: z => `<button class="btn small danger" data-zid="${z.id}">Entfernen</button>` }
        ], zu);
        $$('#a-zu button[data-zid]').forEach(b => b.onclick = async () => { await S.loescheZuordnung(+b.dataset.zid); renderAdmin(); });
        $('#z-add').onclick = async () => {
          const u = $('#z-user').value, k = $('#z-klasse').value.trim(), sj = $('#z-sj').value.trim();
          if (!u || !k || !/^\d{4}\/\d{2}$/.test(sj)) { meldung('Lehrkraft, Klasse und Schuljahr (JJJJ/JJ) angeben.', true); return; }
          try { await S.neueZuordnung(u, k, sj); renderAdmin(); } catch (e) { meldung(e.message, true); }
        };
      } catch (e) { $('#a-prof').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
    }
    const tests = state.tests.slice().sort(sortTests);
    tabelle($('#a-tests'), [
      { key: 'klasse', label: 'Klasse' }, { key: 'schuljahr', label: 'Schuljahr' },
      { key: 'v', label: 'Test', html: t => esc(t.testversion || t.verfahren) },
      { key: 'testdatum', label: 'Datum', html: t => datum(t.testdatum) },
      { key: 'datei', label: 'Datei', html: t => `<span class="muted small">${esc(t.datei || '')}</span>` },
      { key: 'x', label: '', sortable: false, html: t => `<button class="btn small danger" data-tid="${t.id}">Löschen</button>` }
    ], tests);
    $$('#a-tests button[data-tid]').forEach(b => b.onclick = async () => {
      if (!confirm('Diesen Test mit allen Ergebnissen löschen?')) return;
      try { await S.loescheTest(isNaN(+b.dataset.tid) ? b.dataset.tid : +b.dataset.tid); await laden(); } catch (e) { meldung(e.message, true); }
    });
  }

  /* ================= Rahmen ================= */
  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  let toastTimer;
  function meldung(text, fehler) {
    const t = $('#toast'); t.textContent = text; t.className = 'msg ' + (fehler ? 'err' : 'ok'); t.style.display = 'block';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.style.display = 'none', 4000);
  }
  const CTX = { state, S, esc, fmt, tWert, hauptskala, skalen, skalaName, erg, download, meldung: (t, f) => meldung(t, f) };
  const renderSpiegel = () => window.Spiegel ? window.Spiegel.render(CTX) : null;
  const RENDER = { spiegel: renderSpiegel, overview: renderOverview, klasse: renderKlasse, stufe: renderStufe, jahrgang: renderJahrgang, foerder: renderFoerder, import: renderImport, admin: renderAdmin };
  function zeige(view) {
    state.view = view;
    $$('.tab').forEach(b => b.setAttribute('aria-selected', b.dataset.view === view));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    try { history.replaceState(null, '', '#' + view); } catch (e) { /* ignore */ }
    RENDER[view]();
    window.scrollTo(0, 0);
  }
  function renderAll() { renderFilter(); RENDER[state.view](); }
  $$('.tab').forEach(b => b.onclick = () => zeige(b.dataset.view));
  let rzT, rzW = window.innerWidth;
  window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => {
    if (Math.abs(window.innerWidth - rzW) > 40 && ['klasse', 'stufe', 'jahrgang'].includes(state.view)) { rzW = window.innerWidth; RENDER[state.view](); }
  }, 250); });

  async function laden() {
    try { state.tests = await S.ladeAlles(); }
    catch (e) { meldung('Daten konnten nicht geladen werden: ' + e.message, true); state.tests = []; }
    renderAll();
  }

  async function start() {
    $('#mode').textContent = S.online ? 'Online' : 'Lokal';
    $('#mode').classList.toggle('online', S.online);
    state.session = await S.session();
    if (!state.session) {
      $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
      $('#app-tabs').classList.add('hidden');
      $('#login-form').onsubmit = async (e) => {
        e.preventDefault();
        const mail = $('#login-mail').value.trim(), pw = $('#login-pw').value;
        if (!pw) { $('#login-msg').textContent = 'Bitte Passwort eingeben oder einen Anmeldelink anfordern.'; return; }
        try { await S.loginPasswort(mail, pw); location.reload(); }
        catch (er) { $('#login-msg').textContent = /invalid/i.test(er.message) ? 'E-Mail oder Passwort stimmt nicht.' : 'Fehler: ' + er.message; }
      };
      $('#login-link').onclick = async () => {
        const mail = $('#login-mail').value.trim();
        if (!mail) { $('#login-msg').textContent = 'Bitte zuerst die E-Mail-Adresse eingeben.'; return; }
        try { await S.login(mail); $('#login-msg').textContent = 'Anmeldelink wurde an ' + mail + ' geschickt. Bitte E-Mail öffnen und Link antippen.'; }
        catch (er) { $('#login-msg').textContent = 'Fehler: ' + er.message; }
      };
      return;
    }
    $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
    $('#user').textContent = S.online ? `${state.session.user.email} · ${state.session.rolle === 'leitung' ? 'Schulleitung' : 'Lehrkraft'}` : '';
    $('#logout').classList.toggle('hidden', !S.online);
    $('#app-tabs').classList.remove('hidden');
    $('#pw-open').classList.toggle('hidden', !S.online);
    const dlg = $('#pw-dialog');
    $('#pw-open').onclick = () => { $('#pw-msg').textContent = ''; $('#pw-neu').value = $('#pw-neu2').value = ''; dlg.showModal(); };
    $('#pw-cancel').onclick = () => dlg.close();
    $('#pw-save').onclick = async () => {
      const a = $('#pw-neu').value, b = $('#pw-neu2').value;
      if (a.length < 8) { $('#pw-msg').textContent = 'Mindestens 8 Zeichen.'; return; }
      if (a !== b) { $('#pw-msg').textContent = 'Die beiden Eingaben stimmen nicht überein.'; return; }
      try { await S.passwortAendern(a); $('#pw-msg').textContent = 'Passwort gespeichert.'; setTimeout(() => dlg.close(), 1200); }
      catch (e) { $('#pw-msg').textContent = 'Fehler: ' + e.message; }
    };
    $('#logout').onclick = async () => { await S.logout(); location.reload(); };
    $('.tab[data-view="admin"]').classList.toggle('hidden', S.online && state.session.rolle !== 'leitung');
    await laden();
    if (!S.online && !state.tests.length && (window.APP_CONFIG || {}).AUTO_DEMO && window.DEMO_DATA) {
      for (const t of window.DEMO_DATA) { try { await S.speichereTest(Object.assign({}, t.meta, { demo: !!t.demo }), t.ergebnisse, true); } catch (e) { /* weiter */ } }
      await laden();
    }
    const h = location.hash.slice(1);
    zeige(RENDER[h] && !(h === 'admin' && S.online && state.session.rolle !== 'leitung') ? h : 'overview');
  }
  if (S.online) S.sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' && !state.session) start(); });
  start();
})();
