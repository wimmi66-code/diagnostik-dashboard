/* Jahrgangsspiegel: Klassenkennzahlen je Jahrgang, schulweite Übersicht, Excel-Export.
   Wird von app.js über window.Spiegel.render(ctx) aufgerufen. */
(function () {
  'use strict';

  const EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';

  const BEREICHE = [
    { k: 'lesen', titel: 'Deutsch: Lesen', bsp: 'z.B. Stolperwörter', risiko: '% Risikogruppe\n(unter Norm)', schnitt: 'Schnitt R/Min', schnittTyp: 'rw' },
    { k: 'rs', titel: 'Deutsch: Rechtschreibung', bsp: 'z.B. HSP', risiko: '% Förderbedarf\n(Strategie-Lücke)', schnitt: 'Schnitt T-Wert', schnittTyp: 't' },
    { k: 'mathe', titel: 'Mathematik', bsp: 'z.B. LRP / DEMAT', risiko: '% Risikogruppe\n(unter PR 15)', schnitt: 'Schnitt T-Wert', schnittTyp: 't' }
  ];
  const STRATEGIEN = ['A', 'O', 'M', 'O+M', 'WÜ'];
  const HJ_NAME = { 1: 'Schulhalbjahr 1 (Herbst)', 2: 'Schulhalbjahr 2 (Frühjahr)' };

  function bereichVon(t) {
    const s = [t.verfahren, t.testversion, t.fach].join(' ');
    if (/lese|elfe|stolper|slrt|\bsls\b|wllp|lgvt|salzburger/i.test(s)) return 'lesen';
    if (/mathe|rechnen|\blrp\b|demat/i.test(s)) return 'mathe';
    if (/deutsch|rechtschreib|\bhsp\b/i.test(s)) return 'rs';
    return null;
  }
  function halbjahrVon(t) {
    if (t.testdatum) { const m = +String(t.testdatum).slice(5, 7); return (m >= 8 || m === 1) ? 1 : 2; }
    return /mitte|ende|frühjahr/i.test(t.testversion || '') ? 2 : 1;
  }
  const mean = (a) => { const v = a.filter(x => x != null && !Number.isNaN(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  function ampel(p) { if (p == null) return null; return p > 0.3 ? 'Rot' : p >= 0.2 ? 'Gelb' : 'Grün'; }
  const maxOf = (a) => { const v = a.filter(x => x != null); return v.length ? Math.max(...v) : null; };
  const sjLang = (sj) => { const y = parseInt(sj, 10); return Number.isFinite(y) ? `${y}/${y + 1}` : sj; };

  /** Kennzahlen einer Testdurchführung für ihren Bereich */
  function kennzahl(C, t, b) {
    const hs = C.hauptskala(t);
    const haupt = C.erg(t, hs).filter(e => C.tWert(e) != null);
    const n = haupt.length;
    if (!n) return null;
    let risiko;
    if (b === 'rs') {
      const sks = C.skalen(t).filter(s => STRATEGIEN.includes(s));
      risiko = haupt.filter(e => {
        if (!sks.length) return C.tWert(e) < 40;
        return sks.some(sk => { const x = t.ergebnisse.find(r => r.kennung === e.kennung && r.skala === sk); const tv = x ? C.tWert(x) : null; return tv != null && tv < 40; });
      }).length / n;
    } else if (b === 'mathe') {
      risiko = haupt.filter(e => (e.pr != null ? Number(e.pr) < 15 : C.tWert(e) < 39.6)).length / n;
    } else {
      risiko = haupt.filter(e => C.tWert(e) < 40).length / n;
    }
    const schnitt = b === 'lesen' ? mean(haupt.map(e => e.rw == null ? null : Number(e.rw))) : mean(haupt.map(C.tWert));
    return { n, risiko, schnitt, test: t, skala: C.skalaName(t, hs) };
  }

  /** Spiegel für ein Schuljahr und Halbjahr berechnen */
  function berechne(C, tests, notizen, sj, hj) {
    const imZeitraum = tests.filter(t => t.schuljahr === sj && halbjahrVon(t) === hj && bereichVon(t));
    const stufen = [...new Set(imZeitraum.map(t => t.stufe))].sort((a, b) => a - b);
    const notiz = (stufe, klasse) => notizen.find(n => n.schuljahr === sj && +n.halbjahr === hj && +n.stufe === stufe && (n.klasse || '') === (klasse || '')) || {};
    return stufen.map(stufe => {
      const ts = imZeitraum.filter(t => t.stufe === stufe);
      const klassenNamen = [...new Set(ts.map(t => t.klasse))].sort((a, b) => String(a).localeCompare(String(b), 'de', { numeric: true }));
      const versionen = {};
      const klassen = klassenNamen.map(kl => {
        const werte = {};
        BEREICHE.forEach(B => {
          const kand = ts.filter(t => t.klasse === kl && bereichVon(t) === B.k)
            .sort((a, b) => String(b.testdatum || '').localeCompare(String(a.testdatum || '')));
          werte[B.k] = kand.length ? kennzahl(C, kand[0], B.k) : null;
          if (kand.length) (versionen[B.k] = versionen[B.k] || new Set()).add(kand[0].testversion || kand[0].verfahren);
        });
        const st = ampel(maxOf(BEREICHE.map(B => werte[B.k] && werte[B.k].risiko)));
        return { klasse: kl, werte, ampel: st, notiz: notiz(stufe, kl) };
      });
      const gesamt = {};
      BEREICHE.forEach(B => {
        const v = klassen.map(k => k.werte[B.k]).filter(Boolean);
        gesamt[B.k] = v.length ? { n: v.reduce((s, x) => s + x.n, 0), risiko: mean(v.map(x => x.risiko)), schnitt: mean(v.map(x => x.schnitt)) } : null;
      });
      const schueler = klassen.reduce((s, k) => s + (maxOf(BEREICHE.map(B => k.werte[B.k] && k.werte[B.k].n)) || 0), 0);
      return { stufe, klassen, gesamt, schueler, versionen, ampel: ampel(maxOf(BEREICHE.map(B => gesamt[B.k] && gesamt[B.k].risiko))), notiz: notiz(stufe, '') };
    });
  }

  /* ---------------- Ansicht ---------------- */
  const ui = { sj: null, hj: null };
  function ampelChip(a) {
    if (!a) return '<span class="muted">–</span>';
    const k = a === 'Grün' ? 'gruen' : a === 'Gelb' ? 'gelb' : 'rot';
    const sym = a === 'Grün' ? '●' : a === 'Gelb' ? '▲' : '■';
    return `<span class="ampel ${k}"><i aria-hidden="true">${sym}</i>${a}</span>`;
  }

  async function render(C) {
    const el = document.getElementById('view-spiegel');
    const { esc, fmt, state, S } = C;
    const kandidaten = state.tests.filter(t => bereichVon(t));
    if (!kandidaten.length) { el.innerHTML = '<div class="card empty">Noch keine Tests für den Jahrgangsspiegel vorhanden.</div>'; return; }
    const sjs = [...new Set(kandidaten.map(t => t.schuljahr))].sort().reverse();
    if (!sjs.includes(ui.sj)) ui.sj = state.filter.schuljahr && sjs.includes(state.filter.schuljahr) ? state.filter.schuljahr : sjs[0];
    const hjs = [...new Set(kandidaten.filter(t => t.schuljahr === ui.sj).map(halbjahrVon))].sort();
    if (!hjs.includes(ui.hj)) ui.hj = hjs[hjs.length - 1];
    let notizen = [];
    try { notizen = await S.notizen(); } catch (e) { C.meldung('Notizen konnten nicht geladen werden: ' + e.message, true); }
    const daten = berechne(C, state.tests, notizen, ui.sj, ui.hj);
    const leitung = !S.online || (state.session && state.session.rolle === 'leitung');
    const pctF = (v) => v == null ? '–' : (v * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
    const zelle = (w, B) => w ? `<td class="r num gs">${w.n}</td><td class="r num">${pctF(w.risiko)}</td><td class="r num">${fmt(w.schnitt)}</td>` : '<td class="r muted gs">–</td><td class="r muted">–</td><td class="r muted">–</td>';

    el.innerHTML = `
      <div class="filters">
        <div class="field"><label for="sp-sj">Schuljahr</label><select id="sp-sj">${sjs.map(s => `<option ${s === ui.sj ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="field"><label for="sp-hj">Stand</label><select id="sp-hj">${[1, 2].filter(h => hjs.includes(h)).map(h => `<option value="${h}" ${h === ui.hj ? 'selected' : ''}>${HJ_NAME[h]}</option>`).join('')}</select></div>
        <button class="btn primary" id="sp-xlsx">Als Excel herunterladen</button>
      </div>
      ${daten.map(d => `
      <div class="card">
        <div class="card-head"><h2>Jahrgangsspiegel Jahrgang ${d.stufe}</h2><span class="muted small">Schuljahr ${esc(sjLang(ui.sj))} · ${HJ_NAME[ui.hj]}</span></div>
        <div class="table-wrap"><table class="spiegel">
          <thead>
            <tr class="grp"><th colspan="2">Stammdaten</th>${BEREICHE.map(B => `<th colspan="3" class="gs">${esc(B.titel)}<br><span class="sub">${esc(d.versionen[B.k] ? [...d.versionen[B.k]].join(', ') : B.bsp)}</span></th>`).join('')}<th colspan="2" class="gs">Gesamtbeurteilung &amp; Maßnahmen</th></tr>
            <tr><th>Klasse</th><th>Klassenleitung</th>${BEREICHE.map(B => `<th class="r gs">Anzahl S.</th><th class="r">${esc(B.risiko).replace('\n', '<br>')}</th><th class="r">${esc(B.schnitt)}</th>`).join('')}<th class="gs">Handlungsbedarf</th><th>Vereinbarte Fördermaßnahme / Ressourcen</th></tr>
          </thead>
          <tbody>
            ${d.klassen.map(k => `<tr>
              <td><b>${esc(k.klasse)}</b></td>
              <td><input type="text" class="sp-in" data-stufe="${d.stufe}" data-klasse="${esc(k.klasse)}" data-f="klassenleitung" value="${esc(k.notiz.klassenleitung || '')}" placeholder="eintragen" aria-label="Klassenleitung ${esc(k.klasse)}"></td>
              ${BEREICHE.map(B => zelle(k.werte[B.k], B)).join('')}
              <td class="gs">${ampelChip(k.ampel)}</td>
              <td><input type="text" class="sp-in wide" data-stufe="${d.stufe}" data-klasse="${esc(k.klasse)}" data-f="text" value="${esc(k.notiz.text || '')}" placeholder="Maßnahme eintragen" aria-label="Maßnahme ${esc(k.klasse)}"></td>
            </tr>`).join('')}
            <tr class="sum"><td>Gesamt / Schnitt</td><td>Jahrgang ${d.stufe}</td>
              ${BEREICHE.map(B => zelle(d.gesamt[B.k], B)).join('')}
              <td class="gs">${ampelChip(d.ampel)}</td>
              <td>${leitung ? `<input type="text" class="sp-in wide" data-stufe="${d.stufe}" data-klasse="" data-f="text" value="${esc(d.notiz.text || '')}" placeholder="Schwerpunkt des Jahrgangs" aria-label="Schwerpunkt Jahrgang ${d.stufe}">` : esc(d.notiz.text || '')}</td></tr>
          </tbody>
        </table></div>
      </div>`).join('')}
      <div class="card">
        <div class="card-head"><h2>Schulweite Übersicht</h2><span class="muted small">Schuljahr ${esc(sjLang(ui.sj))} · ${HJ_NAME[ui.hj]}</span></div>
        <div class="table-wrap"><table class="spiegel">
          <thead><tr><th>Jahrgang</th><th class="r">Anzahl Klassen</th><th class="r">Schüler gesamt</th><th class="r">Lesen: % Risikogruppe</th><th class="r">Rechtschreiben: % Förderbedarf</th><th class="r">Mathe: % Risikogruppe</th><th>Gesamt-Status</th><th>Pädagogischer Schwerpunkt / Maßnahme</th></tr></thead>
          <tbody>${daten.map(d => `<tr><td><b>Jahrgang ${d.stufe}</b></td><td class="r num">${d.klassen.length}</td><td class="r num">${d.schueler}</td>
            ${BEREICHE.map(B => `<td class="r num">${pctF(d.gesamt[B.k] && d.gesamt[B.k].risiko)}</td>`).join('')}
            <td>${ampelChip(d.ampel)}</td><td>${esc(d.notiz.text || '')}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="card small">
        <h3 style="margin-bottom:8px">So wird gerechnet</h3>
        <div class="grid two" style="gap:8px 24px">
          <div><b>Lesen:</b> Anteil Kinder unter T 40 (≈ PR 16) in der Hauptskala; Schnitt = mittlerer Rohwert (z. B. richtige Wörter pro Minute).<br>
            <b>Rechtschreibung:</b> Anteil Kinder mit mindestens einer Strategie (A, O, M, O+M, WÜ) unter T 40; Schnitt = mittlerer T-Wert der Graphemtreffer.<br>
            <b>Mathematik:</b> Anteil Kinder unter PR 15 in der Hauptskala (LRP: Operationsverständnis); Schnitt = mittlerer T-Wert.</div>
          <div><b>Handlungsbedarf</b> richtet sich nach dem höchsten Anteil der drei Bereiche:<br>
            ${ampelChip('Grün')} unter 20 % · ${ampelChip('Gelb')} 20 bis 30 % · ${ampelChip('Rot')} über 30 %<br>
            Jahrgangswerte: Anzahl summiert, Anteile und Schnitte als Mittel der Klassenwerte. Ohne Testdatum gilt „Mitte/Ende“ als 2. Halbjahr, sonst 1. Halbjahr.</div>
        </div>
      </div>`;

    document.getElementById('sp-sj').onchange = e => { ui.sj = e.target.value; ui.hj = null; render(C); };
    document.getElementById('sp-hj').onchange = e => { ui.hj = +e.target.value; render(C); };
    document.getElementById('sp-xlsx').onclick = () => exportXlsx(C, daten, ui.sj, ui.hj).catch(e => C.meldung('Excel-Export fehlgeschlagen: ' + e.message, true));
    el.querySelectorAll('.sp-in').forEach(inp => inp.onchange = async () => {
      const stufe = +inp.dataset.stufe, klasse = inp.dataset.klasse;
      const vorh = notizen.find(n => n.schuljahr === ui.sj && +n.halbjahr === ui.hj && +n.stufe === stufe && (n.klasse || '') === klasse) || {};
      const neu = { schuljahr: ui.sj, halbjahr: ui.hj, stufe, klasse, klassenleitung: vorh.klassenleitung || null, text: vorh.text || null };
      neu[inp.dataset.f] = inp.value.trim() || null;
      try { await S.speichereNotiz(neu); Object.assign(vorh, neu); if (!notizen.includes(vorh)) notizen.push(vorh); inp.classList.add('saved'); setTimeout(() => inp.classList.remove('saved'), 1200); }
      catch (e) { C.meldung(/spiegel_notiz/.test(e.message) ? 'Bitte zuerst supabase/update-jahrgangsspiegel.sql in Supabase ausführen.' : 'Speichern fehlgeschlagen: ' + e.message, true); }
    });
  }

  /* ---------------- Excel-Export (Aufbau wie Vorlage) ---------------- */
  function ladeExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = EXCELJS_URL;
      s.onload = () => res(window.ExcelJS); s.onerror = () => rej(new Error('Excel-Bibliothek konnte nicht geladen werden (Internetverbindung prüfen).'));
      document.head.appendChild(s);
    });
  }

  async function exportXlsx(C, daten, sj, hj) {
    const ExcelJS = await ladeExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Diagnostik-Dashboard';
    const FONT = 'Segoe UI', DUNKEL = 'FF1F497D', MITTEL = 'FF2C5E8A', HELL = 'FFDCE6F1';
    const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
    const rahmen = { top: thin, left: thin, bottom: thin, right: thin };
    const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const titel = (ws, t, sub) => {
      ws.getCell('A1').value = t; ws.getCell('A1').font = { name: FONT, size: 16, bold: true, color: { argb: DUNKEL } };
      ws.getCell('A2').value = sub; ws.getCell('A2').font = { name: FONT, size: 11, color: { argb: 'FF595959' } };
    };
    const ampelCF = (ws, ref) => ws.addConditionalFormatting({ ref, rules: [
      { type: 'cellIs', operator: 'equal', formulae: ['"Grün"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } }, font: { color: { argb: 'FF006100' } } } },
      { type: 'cellIs', operator: 'equal', formulae: ['"Gelb"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFEB9C' } }, font: { color: { argb: 'FF9C5700' } } } },
      { type: 'cellIs', operator: 'equal', formulae: ['"Rot"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' } } } }
    ] });
    const ampelFormel = (cells) => `IF(COUNT(${cells})=0,"-",IF(MAX(${cells})>0.3,"Rot",IF(MAX(${cells})>=0.2,"Gelb","Grün")))`;
    const r1 = (v) => v == null ? null : Math.round(v * 10) / 10;
    const r3 = (v) => v == null ? null : Math.round(v * 1000) / 1000;
    const sheetName = (stufe) => `Jahrgangsspiegel_Jg${stufe}`;
    const gesamtZeile = {};

    daten.forEach(d => {
      const ws = wb.addWorksheet(sheetName(d.stufe));
      [16, 18, 12, 18, 16, 12, 18, 16, 12, 18, 16, 18, 45].forEach((w, i) => ws.getColumn(i + 1).width = w);
      titel(ws, 'SCHULINTERNER JAHRGANGSSPIEGEL — DIAGNOSTIK', `Jahrgangstufe: ${d.stufe}  |  Schuljahr: ${sjLang(sj)}  |  Stand: ${HJ_NAME[hj]}`);
      const gruppen = [['A4:B4', 'Stammdaten'], ...BEREICHE.map((B, i) => [`${'CFI'[i]}4:${'EHK'[i]}4`, `${B.titel} (${d.versionen[B.k] ? [...d.versionen[B.k]].join(', ') : B.bsp})`]), ['L4:M4', 'Gesamtbeurteilung & Maßnahmen']];
      gruppen.forEach(([ref, txt]) => {
        ws.mergeCells(ref); const c = ws.getCell(ref.split(':')[0]); c.value = txt;
        c.font = { name: FONT, size: 11, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(DUNKEL);
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });
      ws.getRow(4).height = 32;
      const kopf = ['Klasse', 'Klassenleitung', ...BEREICHE.flatMap(B => ['Anzahl S.', B.risiko, B.schnitt]), 'Handlungsbedarf', 'Vereinbarte Fördermaßnahme / Ressourcen'];
      kopf.forEach((t, i) => {
        const c = ws.getRow(5).getCell(i + 1); c.value = t;
        c.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(MITTEL);
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = rahmen;
      });
      ws.getRow(5).height = 30;
      const start = 6;
      d.klassen.forEach((k, idx) => {
        const r = start + idx, row = ws.getRow(r);
        const vals = [k.klasse, k.notiz.klassenleitung || null];
        BEREICHE.forEach(B => { const w = k.werte[B.k]; vals.push(w ? w.n : null, w ? r3(w.risiko) : null, w ? r1(w.schnitt) : null); });
        vals.forEach((v, i) => { row.getCell(i + 1).value = v; });
        row.getCell(12).value = { formula: ampelFormel(`D${r},G${r},J${r}`), result: k.ampel || '-' };
        row.getCell(13).value = k.notiz.text || null;
      });
      const ende = start + d.klassen.length - 1, gz = ende + 1;
      gesamtZeile[d.stufe] = gz;
      const g = ws.getRow(gz);
      g.getCell(1).value = 'Gesamt / Schnitt'; g.getCell(2).value = `Jahrgang ${d.stufe}`;
      BEREICHE.forEach((B, i) => {
        const [cn, cr, cs] = [3 + i * 3, 4 + i * 3, 5 + i * 3].map(n => ws.getColumn(n).letter);
        const gw = d.gesamt[B.k];
        g.getCell(3 + i * 3).value = { formula: `IF(COUNT(${cn}${start}:${cn}${ende})=0,"",SUM(${cn}${start}:${cn}${ende}))`, result: gw ? gw.n : '' };
        g.getCell(4 + i * 3).value = { formula: `IFERROR(AVERAGE(${cr}${start}:${cr}${ende}),"")`, result: gw ? r3(gw.risiko) : '' };
        g.getCell(5 + i * 3).value = { formula: `IFERROR(AVERAGE(${cs}${start}:${cs}${ende}),"")`, result: gw ? r1(gw.schnitt) : '' };
      });
      g.getCell(12).value = { formula: ampelFormel(`D${gz},G${gz},J${gz}`), result: d.ampel || '-' };
      g.getCell(13).value = d.notiz.text || 'Auswertung in der Jahrgangskonferenz';
      for (let r = start; r <= gz; r++) {
        const row = ws.getRow(r), sum = r === gz;
        for (let c = 1; c <= 13; c++) {
          const cell = row.getCell(c);
          cell.font = { name: FONT, size: 10, bold: sum || c === 12 };
          cell.border = sum ? { top: thin, left: thin, right: thin, bottom: { style: 'double' } } : rahmen;
          if (sum) cell.fill = fill(HELL);
          const art = c >= 3 && c <= 11 ? ['n', 'p', 's'][(c - 3) % 3] : null;
          if (art === 'n') { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'center' }; }
          else if (art === 'p') { cell.numFmt = '0.0%'; cell.alignment = { horizontal: 'right' }; }
          else if (art === 's') { cell.numFmt = '0.0'; cell.alignment = { horizontal: 'right' }; }
          else if (c === 12) cell.alignment = { horizontal: 'center' };
          else cell.alignment = { horizontal: 'left', wrapText: c === 13 };
        }
      }
      ampelCF(ws, `L${start}:L${gz}`);
      ws.views = [{ state: 'frozen', ySplit: 5, xSplit: 1 }];
      ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    });

    // Schulweite Übersicht
    const ws = wb.addWorksheet('Schulweite_Übersicht');
    [16, 16, 16, 22, 26, 22, 16, 45].forEach((w, i) => ws.getColumn(i + 1).width = w);
    titel(ws, 'SCHULWEITE DIAGNOSTIK-ÜBERSICHT (SCHULLEITUNG)', `Aggregierter Status aller Jahrgangsstufen  |  Schuljahr: ${sjLang(sj)}  |  Stand: ${HJ_NAME[hj]}`);
    ['Jahrgang', 'Anzahl Klassen', 'Schüler Gesamt', 'Lesen: % Risikogruppe', 'Rechtschreiben: % Förderbedarf', 'Mathe: % Risikogruppe', 'Gesamt-Status', 'Pädagogischer Schwerpunkt / Maßnahme'].forEach((t, i) => {
      const c = ws.getRow(4).getCell(i + 1); c.value = t;
      c.font = { name: FONT, size: 11, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(DUNKEL);
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = rahmen;
    });
    ws.getRow(4).height = 30;
    daten.forEach((d, i) => {
      const r = 5 + i, row = ws.getRow(r), sn = sheetName(d.stufe), gz = gesamtZeile[d.stufe];
      row.getCell(1).value = `Jahrgang ${d.stufe}`;
      row.getCell(2).value = d.klassen.length;
      row.getCell(3).value = d.schueler;
      ['D', 'G', 'J'].forEach((col, k) => {
        const gw = d.gesamt[BEREICHE[k].k];
        row.getCell(4 + k).value = { formula: `${sn}!${col}${gz}`, result: gw ? r3(gw.risiko) : '' };
      });
      row.getCell(7).value = { formula: ampelFormel(`D${r}:F${r}`), result: d.ampel || '-' };
      row.getCell(8).value = d.notiz.text || null;
      for (let c = 1; c <= 8; c++) {
        const cell = row.getCell(c); cell.border = rahmen;
        cell.font = { name: FONT, size: 10, bold: c === 1 || c === 7 };
        if (c === 2 || c === 3) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'center' }; }
        else if (c >= 4 && c <= 6) { cell.numFmt = '0.0%'; cell.alignment = { horizontal: 'right' }; }
        else if (c === 7) cell.alignment = { horizontal: 'center' };
        else cell.alignment = { horizontal: 'left', wrapText: c === 8 };
      }
    });
    if (daten.length) ampelCF(ws, `G5:G${4 + daten.length}`);
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

    // Legende
    const lg = wb.addWorksheet('Stammdaten_Legende');
    lg.getColumn(1).width = 25; lg.getColumn(2).width = 90;
    lg.getCell('A1').value = 'LEGENDE & BENUTZERHINWEISE'; lg.getCell('A1').font = { name: FONT, size: 16, bold: true, color: { argb: DUNKEL } };
    const zeilen = [
      [3, 'Status-Definitionen:', ''],
      [4, 'Grün', 'Unter 20% Risikogruppe – Regelunterricht & Standardförderung ausreichend.'],
      [5, 'Gelb', '20% bis 30% Risikogruppe – Beobachtung & gezielte Binnendifferenzierung im Jahrgang.'],
      [6, 'Rot', 'Über 30% Risikogruppe – Erhöhter Handlungsbedarf, Ressourcenzuweisung (z.B. Erzieher/Förderstunden).'],
      [7, 'Maßgeblich:', 'Der höchste Anteil der drei Bereiche Lesen, Rechtschreibung und Mathematik.'],
      [9, 'Berechnung Lesen:', 'Anteil der Kinder unter T 40 (≈ PR 16) in der Hauptskala; Schnitt = mittlerer Rohwert (z. B. richtige Wörter pro Minute).'],
      [10, 'Berechnung Rechtschreibung:', 'Anteil der Kinder mit mindestens einer Rechtschreibstrategie (A, O, M, O+M, WÜ) unter T 40; Schnitt = mittlerer T-Wert der Graphemtreffer.'],
      [11, 'Berechnung Mathematik:', 'Anteil der Kinder unter PR 15 in der Hauptskala (LRP: Operationsverständnis); Schnitt = mittlerer T-Wert.'],
      [12, 'Jahrgangswerte:', 'Anzahl summiert; Anteile und Schnitte als Mittel der Klassenwerte.'],
      [14, 'Datenschutz-Hinweis:', 'Diese Tabelle enthält ausschließlich aggregierte Klassendaten (%-Sätze und Mittelwerte). Es werden keine personenbezogenen Einzeldaten von Schülerinnen und Schülern eingetragen.'],
      [15, 'Nutzungszyklus:', '1. Durchführung der Screenings (Oktober/November & April/Mai).\n2. Import der Klett-Auswertungen ins Diagnostik-Dashboard; Klassenleitung und Maßnahmen dort eintragen.\n3. Auswertung in der Jahrgangskonferenz und im Bilanzgespräch mit der Schulleitung.'],
      [16, 'Erstellt:', `Diagnostik-Dashboard, ${new Date().toLocaleDateString('de-DE')}`]
    ];
    zeilen.forEach(([r, a, b]) => {
      lg.getCell('A' + r).value = a; lg.getCell('A' + r).font = { name: FONT, size: 10, bold: true };
      lg.getCell('B' + r).value = b; lg.getCell('B' + r).font = { name: FONT, size: 10 };
      lg.getCell('A' + r).alignment = { vertical: 'top' }; lg.getCell('B' + r).alignment = { vertical: 'top', wrapText: true };
    });
    ampelCF(lg, 'A4:A6');

    const buf = await wb.xlsx.writeBuffer();
    C.download(`Jahrgangsspiegel_${sj.replace('/', '-')}_HJ${hj}.xlsx`, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    C.meldung('Excel-Datei erstellt.');
  }

  window.Spiegel = { render, berechne, bereichVon, halbjahrVon, exportXlsx };
})();
