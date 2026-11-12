/* Analysen: Schaubilder für Steuergruppe und Konferenzen
   1. Förderbedarf je Zug und Bereich
   2. Entwicklung der Risikogruppe über die Schuljahre (mit Markierung einer Maßnahme)
   3. Leistungsstufen laut Testvorlage (SLS/STOLLE) je Zeitpunkt */
(function () {
  'use strict';
  const BER = [['lesen', 'Lesen'], ['rs', 'Rechtschreibung'], ['mathe', 'Mathematik']];
  const LS_KEY = 'diagnostik-analysen';
  const ui = (() => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } })();
  const merke = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(ui)); } catch (e) { /* egal */ } };
  const farbe = (i) => `var(--s${(i % 8) + 1})`;
  const pctTxt = (v) => v == null ? '–' : Math.round(v * 100) + ' %';

  function zp(t) { return (t.testversion || '').replace(/^(STOLLE|SLS)\s*/, '').replace(/\s*Klasse\s*\d+$/, ''); }

  /* ---------- Diagramm-Bausteine (SVG, Farben über CSS-Variablen) ---------- */
  function balkenGruppen(gruppen, serien, werte, opts) {
    // werte[g][s] = { v: Anteil 0..1, tip }
    const w = Math.max(320, opts.w || 640), h = 280, l = 44, r = 10, t = 16, b = 34;
    const maxV = Math.max(0.2, ...gruppen.flatMap((g, gi) => serien.map((s, si) => (werte[gi][si] || {}).v || 0)));
    const top = Math.ceil(maxV * 100 / 5) * 5 / 100 + 0.03;
    const Y = (v) => t + (1 - v / top) * (h - t - b);
    const gw = (w - l - r) / gruppen.length, bw = Math.min(46, (gw - 24) / serien.length - 4);
    let s = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${opts.titel}">`;
    s += '<g class="grid">';
    for (let v = 0; v <= top + 1e-9; v += top > 0.5 ? 0.1 : 0.05) s += `<line x1="${l}" x2="${w - r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${l - 6}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v * 100)}</text>`;
    s += '</g>';
    s += `<text x="12" y="${(h - b + t) / 2}" transform="rotate(-90 12 ${(h - b + t) / 2})" text-anchor="middle">${opts.yLabel}</text>`;
    gruppen.forEach((g, gi) => {
      const gx = l + gi * gw + gw / 2, start = gx - (serien.length * (bw + 4) - 4) / 2;
      serien.forEach((se, si) => {
        const d = werte[gi][si]; if (!d || d.v == null) return;
        const x = start + si * (bw + 4), y = Y(d.v), hh = Y(0) - y;
        s += `<path d="M${x},${Y(0)} V${y + 4} Q${x},${y} ${x + 4},${y} H${x + bw - 4} Q${x + bw},${y} ${x + bw},${y + 4} V${Y(0)} Z" fill="${farbe(si)}"/>`;
        s += `<text class="lbl" x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" style="font-size:11px">${Math.round(d.v * 100)}</text>`;
        s += `<rect class="hit" x="${x - 2}" y="${t}" width="${bw + 4}" height="${h - t - b}" data-tip="${d.tip}"/>`;
      });
      s += `<text class="lbl" x="${gx}" y="${h - 12}" text-anchor="middle">${g}</text>`;
    });
    s += `<line class="base" x1="${l}" x2="${w - r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    return s + '</svg>';
  }

  function linien(xLabels, serien, opts) {
    // serien: [{name, werte:[{v, tip}|null]}]
    const w = Math.max(300, opts.w || 640), h = 270, l = 44, t = 18, b = 30;
    const schmal = w < 560;
    const r = schmal ? 16 : Math.min(190, w * 0.3);
    const alle = serien.flatMap(s => s.werte.filter(Boolean).map(d => d.v));
    const top = Math.max(0.2, Math.ceil((Math.max(0, ...alle) + 0.05) * 20) / 20);
    const n = xLabels.length, pad = Math.min(50, (w - l - r) / (2 * Math.max(n, 1)));
    const X = (i) => n === 1 ? (l + w - r) / 2 : l + pad + i * (w - l - r - 2 * pad) / (n - 1);
    const Y = (v) => t + (1 - v / top) * (h - t - b);
    let s = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${opts.titel}">`;
    if (opts.markAb != null && opts.markAb >= 0) {
      const x0 = opts.markAb === 0 ? l : (X(opts.markAb - 1) + X(opts.markAb)) / 2;
      s += `<rect class="normband" x="${x0}" y="${t}" width="${w - r - x0}" height="${h - t - b}"/>`;
      s += `<text x="${(x0 + w - r) / 2}" y="${t + 14}" text-anchor="middle">${opts.markText}</text>`;
    }
    s += '<g class="grid">';
    for (let v = 0; v <= top + 1e-9; v += top > 0.5 ? 0.1 : 0.05) s += `<line x1="${l}" x2="${w - r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${l - 6}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v * 100)}</text>`;
    s += '</g>';
    s += `<text x="12" y="${(h - b + t) / 2}" transform="rotate(-90 12 ${(h - b + t) / 2})" text-anchor="middle">${opts.yLabel}</text>`;
    xLabels.forEach((x, i) => { s += `<text class="lbl" x="${X(i)}" y="${h - 8}" text-anchor="middle">${schmal && n > 3 ? String(x).slice(2) : x}</text>`; });
    const endLabels = [];
    serien.forEach((se, si) => {
      const pts = se.werte.map((d, i) => d ? [X(i), Y(d.v), d, i] : null).filter(Boolean);
      if (pts.length > 1) s += `<polyline fill="none" stroke="${farbe(si)}" stroke-width="2.5" points="${pts.map(p => p[0] + ',' + p[1]).join(' ')}"/>`;
      pts.forEach(([x, y, d, i]) => {
        const andere = serien.filter((o, oi) => oi !== si && o.werte[i]).map(o => o.werte[i].v);
        const oben = !andere.length || d.v >= Math.max(...andere);
        s += `<circle cx="${x}" cy="${y}" r="5.5" fill="${farbe(si)}" stroke="var(--surface)" stroke-width="2"/>`;
        if (serien.length <= 2) s += `<text x="${x}" y="${oben ? y - 10 : y + 18}" text-anchor="middle" style="font-size:11px">${Math.round(d.v * 100)} %</text>`;
        s += `<circle class="hit" cx="${x}" cy="${y}" r="14" data-tip="${se.name}<br>${d.tip}"/>`;
      });
      const last = pts[pts.length - 1];
      if (last) endLabels.push({ x: last[0] + 12, y: last[1] + 4, txt: `${se.name}${serien.length > 2 ? ' · ' + Math.round(last[2].v * 100) + ' %' : ''}`, col: farbe(si) });
    });
    endLabels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < endLabels.length; i++) if (endLabels[i].y - endLabels[i - 1].y < 14) endLabels[i].y = endLabels[i - 1].y + 14;
    if (!schmal) endLabels.forEach(e => { s += `<text x="${e.x}" y="${e.y}" style="font-size:11.5px;fill:${e.col}">${e.txt}</text>`; });
    s += `<line class="base" x1="${l}" x2="${w - r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    return s + '</svg>';
  }

  /* ---------- Berechnungen ---------- */
  function zugAnteile(C, tests, lesetest) {
    const zuege = [...new Set(tests.map(t => (String(t.klasse).match(/[a-z]+$/i) || [''])[0].toLowerCase()).filter(Boolean))].sort();
    const ber = BER.filter(([k]) => tests.some(t => window.Spiegel.bereichVon(t) === k));
    const werte = ber.map(([k, name]) => zuege.map(z => {
      let ja = 0, n = 0;
      tests.filter(t => window.Spiegel.bereichVon(t) === k && (String(t.klasse).toLowerCase().endsWith(z)))
        .filter(t => k !== 'lesen' || !lesetest || t.verfahren === lesetest)
        .forEach(t => C.erg(t, C.hauptskala(t)).forEach(e => { const tv = C.tWert(e); if (tv == null) return; n++; if (tv < 40) ja++; }));
      return n ? { v: ja / n, tip: `Zug ${z.toUpperCase()} · ${name}<br>${ja} von ${n} Kindern unter T 40 (${pctTxt(ja / n)})` } : null;
    }));
    return { zuege, ber, werte };
  }

  function verlauf(C, tests, bereich) {
    const sjs = [...new Set(tests.map(t => t.schuljahr))].sort();
    const relevant = tests.filter(t => window.Spiegel.bereichVon(t) === bereich);
    const key = (t) => t.verfahren === 'SLS' ? `SLS ${zp(t)}` : t.verfahren === 'STOLLE' ? 'STOLLE Ende Klasse' : t.verfahren;
    const keys = [...new Set(relevant.map(key))].sort();
    const serien = keys.map(k => ({ name: k, werte: sjs.map(sj => {
      let risk = 0, n = 0;
      relevant.filter(t => key(t) === k && t.schuljahr === sj).forEach(t => {
        const kz = window.Spiegel.kennzahl(C, t, bereich); if (!kz) return; risk += kz.risiko * kz.n; n += kz.n;
      });
      return n ? { v: risk / n, tip: `${sj}: ${Math.round(risk)} von ${n} Kindern (${pctTxt(risk / n)})` } : null;
    }) })).filter(s => s.werte.some(Boolean));
    return { sjs, serien };
  }

  function stufenVerteilung(tests, verfahren, stufe) {
    const B = window.LeseTabellen.STUFEN[verfahren];
    const ts = tests.filter(t => t.verfahren === verfahren && +t.stufe === +stufe);
    const zps = [...new Set(ts.map(zp))].sort((a, b) => B.zeitpunkte.indexOf(a) - B.zeitpunkte.indexOf(b));
    return { B, zeilen: zps.map(z => {
      const es = ts.filter(t => zp(t) === z).flatMap(t => t.ergebnisse.filter(e => e.ks));
      return { z, n: es.length, anteile: B.baender.map(([, lab, name]) => ({ name, lab, c: es.filter(e => e.ks === name).length })) };
    }) };
  }

  /* ---------- Ansicht ---------- */
  function render(C) {
    const el = document.getElementById('view-analysen');
    const { esc, state } = C;
    const tests = state.tests.filter(t => (!state.filter.schuljahr || t.schuljahr === state.filter.schuljahr));
    if (!state.tests.length) { el.innerHTML = '<div class="card empty">Noch keine Daten für Analysen vorhanden.</div>'; return; }
    const leseVerf = [...new Set(tests.filter(t => window.Spiegel.bereichVon(t) === 'lesen').map(t => t.verfahren))].sort();
    if (ui.lesetest && !leseVerf.includes(ui.lesetest)) ui.lesetest = '';
    if (ui.lesetest === undefined) ui.lesetest = leseVerf.includes('SLS') ? 'SLS' : '';
    const berMitDaten = BER.filter(([k]) => state.tests.some(t => window.Spiegel.bereichVon(t) === k));
    if (!berMitDaten.some(([k]) => k === ui.bereich)) ui.bereich = berMitDaten[0] ? berMitDaten[0][0] : 'lesen';
    const alleSj = [...new Set(state.tests.map(t => t.schuljahr))].sort();
    const stufenTests = state.tests.filter(t => window.LeseTabellen && window.LeseTabellen.STUFEN[t.verfahren]);
    const sv = [...new Set(stufenTests.map(t => t.verfahren))].sort();
    if (!sv.includes(ui.sverf)) ui.sverf = sv.includes('SLS') ? 'SLS' : sv[0];
    const stufen = [...new Set(stufenTests.filter(t => t.verfahren === ui.sverf).map(t => +t.stufe))].sort();
    if (!stufen.includes(+ui.sstufe)) ui.sstufe = stufen[0];
    merke();
    const zeitraum = state.filter.schuljahr ? `Schuljahr ${state.filter.schuljahr}` : 'alle Schuljahre';

    el.innerHTML = `
      <div class="card">
        <div class="card-head"><h2>Förderbedarf je Zug</h2><span class="muted small">Anteil der Kinder unter T 40 (≈ PR 16) in der Hauptskala · ${esc(zeitraum)} · Filter „Schuljahr“ oben</span></div>
        ${leseVerf.length > 1 ? `<div class="filters" style="margin-bottom:8px"><div class="field"><label for="an-lese">Lesen aus</label><select id="an-lese"><option value="">allen Lesetests</option>${leseVerf.map(v => `<option ${v === ui.lesetest ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div></div>` : ''}
        <div class="legend" id="an-z-leg"></div>
        <div id="an-zug"></div>
        <p class="muted small" style="margin:6px 0 0">STOLLE und SLS sind für diesen Vergleich in T-Werte umgerechnet (†).</p>
      </div>
      <div class="card">
        <div class="card-head"><h2>Entwicklung über die Schuljahre</h2><span class="muted small">Risikogruppe wie im Jahrgangsspiegel, alle Klassen zusammen</span></div>
        <div class="filters" style="margin-bottom:8px">
          <div class="field"><label for="an-ber">Bereich</label><select id="an-ber">${berMitDaten.map(([k, n]) => `<option value="${k}" ${k === ui.bereich ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div class="field"><label for="an-mark">Maßnahme markieren ab</label><select id="an-mark"><option value="">keine Markierung</option>${alleSj.map(s => `<option ${s === ui.mark ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
          <div class="field" style="flex:1;min-width:180px"><label for="an-marktext">Bezeichnung</label><input type="text" id="an-marktext" value="${esc(ui.markText || 'Fördermaßnahme')}"></div>
        </div>
        <div id="an-verlauf"></div>
        <p class="muted small" style="margin:6px 0 0" id="an-verlauf-info"></p>
      </div>
      ${sv.length ? `<div class="card">
        <div class="card-head"><h2>Leistungsstufen laut Testvorlage</h2><span class="muted small">Alle Klassen der Stufe · ${esc(zeitraum)}</span></div>
        <div class="filters" style="margin-bottom:8px">
          <div class="field"><label for="an-sv">Test</label><select id="an-sv">${sv.map(v => `<option ${v === ui.sverf ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
          <div class="field"><label for="an-st">Klassenstufe</label><select id="an-st">${stufen.map(s => `<option value="${s}" ${s === +ui.sstufe ? 'selected' : ''}>Klasse ${s}</option>`).join('')}</select></div>
        </div>
        <div id="an-stufen"></div>
      </div>` : ''}`;

    // 1 Zug
    const za = zugAnteile(C, tests, ui.lesetest);
    const w1 = document.getElementById('an-zug').clientWidth;
    document.getElementById('an-z-leg').innerHTML = za.zuege.map((z, i) => `<span><i class="dot" style="background:${farbe(i)}"></i>Zug ${z.toUpperCase()}</span>`).join('');
    document.getElementById('an-zug').innerHTML = za.zuege.length ? balkenGruppen(za.ber.map(b => b[1]), za.zuege, za.werte, { w: w1, titel: 'Förderbedarf je Zug', yLabel: 'Anteil unter T 40 (%)' }) : '<p class="muted">Keine Klassen mit Zugbuchstaben gefunden.</p>';

    // 2 Verlauf
    const vl = verlauf(C, state.tests, ui.bereich);
    const markIdx = ui.mark ? vl.sjs.indexOf(ui.mark) : -1;
    const vw = document.getElementById('an-verlauf').clientWidth;
    document.getElementById('an-verlauf').innerHTML = (vw < 560 && vl.serien.length ? `<div class="legend" style="margin-bottom:6px">${vl.serien.map((se, i) => { const l = se.werte.filter(Boolean).pop(); return `<span><i class="dot" style="background:${farbe(i)}"></i>${esc(se.name)}${l ? ' · ' + Math.round(l.v * 100) + ' %' : ''}</span>`; }).join('')}</div>` : '') + (vl.serien.length ? linien(vl.sjs, vl.serien, { w: document.getElementById('an-verlauf').clientWidth, titel: 'Entwicklung', yLabel: 'Risikogruppe (%)', markAb: markIdx >= 0 ? markIdx : null, markText: esc(`${ui.markText || 'Maßnahme'} ab ${ui.mark}`) }) : '<p class="muted">Keine Daten.</p>');
    document.getElementById('an-verlauf-info').textContent = ui.bereich === 'lesen' ? 'Lesen: SLS LQ unter 90, STOLLE PR ≤ 24 (Grenzen der Testvorlagen).'
      : ui.bereich === 'rs' ? 'Rechtschreibung: mindestens eine Strategie unter T 40.' : 'Mathematik: Prozentrang unter 15 in der Hauptskala.';

    // 3 Stufen
    if (sv.length) {
      const d = stufenVerteilung(tests, ui.sverf, ui.sstufe);
      const cols = d.B.baender.length === 7 ? ['#1c5cab', '#5598e7', '#9ec5f4', 'var(--b-d)', '#f0a29d', '#e05a5a', '#b22e2e'] : ['#1c5cab', '#9ec5f4', 'var(--b-d)', '#f0a29d', '#e05a5a', '#b22e2e'];
      const order = d.B.baender.map((b, i) => ({ name: b[2], lab: b[1], col: cols[i] })).reverse();
      document.getElementById('an-stufen').innerHTML = d.zeilen.length ? `
        <div class="legend" style="margin-bottom:8px">${order.map(o => `<span><i class="dot" style="background:${o.col}"></i>${esc(o.name)}</span>`).join('')}</div>
        ${d.zeilen.map(z => `<div class="row" style="flex-wrap:nowrap;margin-bottom:8px"><div style="width:110px;flex:none" class="small"><b>${esc(z.z)}</b><br><span class="muted">${z.n} Kinder</span></div>
          <div class="stack" style="height:26px;flex:1">${order.map(o => { const a = z.anteile.find(x => x.name === o.name); const p = z.n ? a.c / z.n : 0; if (!a.c) return '';
            return `<span style="flex:${a.c};background:${o.col};display:flex;align-items:center;justify-content:center;font-size:11px;color:${/b22e2e|e05a5a|1c5cab|5598e7/.test(o.col) ? '#fff' : o.col.startsWith('var') ? 'var(--ink)' : '#0b0b0b'}" data-tip="${esc(z.z)} · ${esc(o.lab)} ${esc(o.name)}<br>${a.c} von ${z.n} Kindern (${pctTxt(p)})">${p >= 0.05 ? Math.round(p * 100) : ''}</span>`; }).join('')}</div></div>`).join('')}
        <p class="muted small" style="margin:4px 0 0">Zahlen im Balken = Anteil in Prozent. Risikogruppe: ${esc(d.B.risikoText)}.</p>` : '<p class="muted">Für diese Auswahl liegen keine Daten vor.</p>';
    }

    const reRender = () => { merke(); render(C); };
    const on = (id, f) => { const x = document.getElementById(id); if (x) x.onchange = f; };
    on('an-lese', e => { ui.lesetest = e.target.value; reRender(); });
    on('an-ber', e => { ui.bereich = e.target.value; reRender(); });
    on('an-mark', e => { ui.mark = e.target.value; reRender(); });
    on('an-marktext', e => { ui.markText = e.target.value; reRender(); });
    on('an-sv', e => { ui.sverf = e.target.value; ui.sstufe = null; reRender(); });
    on('an-st', e => { ui.sstufe = +e.target.value; reRender(); });
  }

  window.Analysen = { render };
})();
