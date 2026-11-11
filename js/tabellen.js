/* Import von Ergebnistabellen (Excel/CSV) für Lesetests ohne Klett-PDF:
   STOLLE (Stolperwörter-Lesetest, Prozentrang) und SLS (Salzburger Lesescreening, Lesequotient).
   Liefert dieselbe Struktur wie der PDF-Parser: [{ meta, ergebnisse }]. */
(function (root) {
  'use strict';
  const EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';

  // Leistungsstufen laut Testvorlagen (Untergrenze, Bezeichnung)
  const STUFEN = {
    STOLLE: { wert: 'Prozentrang', einheit: 'PR', skala: 'LES', skalaName: 'Leseleistung (STOLLE, PR)',
      zeitpunkte: ['Ende Klasse 1', 'Ende Klasse 2', 'Ende Klasse 3'],
      baender: [[90, '100–90 %', 'sehr gute Leistung'], [75, '89–75 %', 'überdurchschnittliche Leistung'], [25, '74–25 %', 'durchschnittliche Leistung'],
        [11, '24–11 %', 'unterdurchschnittliche Leistung'], [6, '10–6 %', 'schwache Leistung'], [0, '5–0 %', 'sehr schwache Leistung']],
      risiko: (e) => e.pr != null && Number(e.pr) <= 24, risikoText: 'PR ≤ 24' },
    SLS: { wert: 'Lesequotient', einheit: 'LQ', skala: 'LQ', skalaName: 'Lesequotient (SLS)',
      zeitpunkte: ['Aug/Sep', 'Apr/Mai'],
      baender: [[130, '130 und mehr', 'sehr gut'], [120, '120–129', 'gut'], [110, '110–119', 'überdurchschnittlich'], [90, '90–109', 'durchschnittlich'],
        [80, '80–89', 'unterdurchschnittlich'], [70, '70–79', 'schwach'], [-Infinity, 'unter 70', 'sehr schwach']],
      risiko: (e) => e.rw != null && Number(e.rw) < 90, risikoText: 'LQ unter 90' }
  };

  // Normalverteilung
  function phi(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
  function probit(p) { // Näherung (Beasley-Springer-Moro light)
    p = Math.min(Math.max(p, 0.001), 0.999);
    const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637], b = [-8.47351093090, 23.08336743743, -21.06224101826, 3.13082909833];
    const c = [0.3374754822726147, 0.9761690190917186, 0.1607979714918209, 0.0276438810333863, 0.0038405729373609, 0.0003951896511919, 0.0000321767881768, 0.0000002888167364, 0.0000003960315187];
    const y = p - 0.5;
    if (Math.abs(y) < 0.42) { const r = y * y; return y * (((a[3] * r + a[2]) * r + a[1]) * r + a[0]) / ((((b[3] * r + b[2]) * r + b[1]) * r + b[0]) * r + 1); }
    let r = p; if (y > 0) r = 1 - p; r = Math.log(-Math.log(r));
    let x = c[0] + r * (c[1] + r * (c[2] + r * (c[3] + r * (c[4] + r * (c[5] + r * (c[6] + r * (c[7] + r * c[8])))))));
    return y < 0 ? -x : x;
  }
  const r1 = (v) => Math.round(v * 10) / 10;

  function bandVon(verfahren, wert) {
    const B = STUFEN[verfahren]; if (!B || wert == null) return null;
    for (const [lo, , name] of B.baender) if (wert >= lo) return name;
    return B.baender[B.baender.length - 1][2];
  }

  /* ---------- Zellwerte ---------- */
  function zellText(v) {
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'object') {
      if ('result' in v) return zellText(v.result);
      if (v.richText) return v.richText.map(t => t.text).join('');
      if ('text' in v) return String(v.text);
      return '';
    }
    return String(v).trim();
  }
  function zahl(v) {
    if (v == null) return null;
    if (typeof v === 'object' && !(v instanceof Date)) v = zellText(v);
    if (typeof v === 'number') return v;
    const s = String(v).replace(',', '.').replace(/[^\d.\-]/g, '');
    if (s === '' || s === '-' || s === '.') return null;
    const n = Number(s); return Number.isFinite(n) ? n : null;
  }
  function schuljahr(s) {
    s = zellText(s);
    let m = s.match(/(20\d{2})\s*[/\-–]\s*(20)?(\d{2})/);
    if (m) return `${m[1]}/${m[3]}`;
    return s;
  }
  function datumIso(v) {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = zellText(v);
    let m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
    return null;
  }

  /** Eine Tabelle (Zeilen als Arrays von Zellwerten) auswerten */
  function auswerten(zeilen, datei, blattName) {
    const text = zeilen.slice(0, 12).map(r => r.map(zellText).join(' ')).join(' ');
    let verfahren = /stolle|stolperw/i.test(text + ' ' + datei) ? 'STOLLE' : /\bsls\b|salzburger/i.test(text + ' ' + datei) ? 'SLS' : null;
    // Kopfzeile suchen
    let hz = -1, cId = -1, cWert = -1, cRoh = -1;
    for (let i = 0; i < Math.min(zeilen.length, 40); i++) {
      const r = zeilen[i].map(zellText);
      const id = r.findIndex(c => /schüler.?id|^id$|kennung|schülerkennung/i.test(c));
      if (id >= 0) {
        hz = i; cId = id;
        cWert = r.findIndex(c => /prozentrang|^pr$|lesequotient|^lq\b|\(lq\)/i.test(c));
        cRoh = r.findIndex(c => /rohwert/i.test(c));
        if (!verfahren) verfahren = r.some(c => /lesequotient|^lq\b|\(lq\)/i.test(c)) ? 'SLS' : r.some(c => /prozentrang|^pr$/i.test(c)) ? 'STOLLE' : null;
        break;
      }
    }
    if (hz < 0) return null;                       // kein Ergebnisblatt
    if (!verfahren) throw new Error(`${blattName}: Test nicht erkannt. Titel oder Spaltenkopf muss „STOLLE“ (Prozentrang) oder „SLS“ (Lesequotient) enthalten.`);
    if (cWert < 0) throw new Error(`${blattName}: Spalte „${STUFEN[verfahren].wert}“ nicht gefunden.`);

    // Kopfangaben „Klasse:“, „Schuljahr:“ … links neben dem Wert
    const meta = {};
    for (let i = 0; i < hz; i++) {
      const r = zeilen[i];
      for (let j = 0; j < r.length; j++) {
        const lab = zellText(r[j]).toLowerCase().replace(/:$/, '');
        if (!['klasse', 'schuljahr', 'zeitpunkt', 'testdatum', 'datum', 'lehrkraft'].includes(lab)) continue;
        let v = null; for (let k = j + 1; k < r.length; k++) { const tx = zellText(r[k]); if (tx !== '' && tx.toLowerCase().replace(/:$/, '') !== lab) { v = r[k]; break; } }
        if (v != null && !/^z\.\s?b\.|^auswahl|^optional/i.test(zellText(v))) meta[lab === 'datum' ? 'testdatum' : lab] = v;
      }
    }
    // Werte aus Dateinamen ergänzen (z. B. „SLS_3d_2026-27_AugSep.xlsx“)
    const klasse = zellText(meta.klasse).replace(/^klasse\s*/i, '') || ((datei.match(/(?:klasse)?[_\s-]?(\d{1,2}[a-z])\b/i) || [])[1] || '');
    const stufe = parseInt((klasse.match(/\d+/) || [])[0], 10) || null;
    let zp = zellText(meta.zeitpunkt);
    if (!zp) zp = /apr|mai/i.test(datei) ? 'Apr/Mai' : /aug|sep/i.test(datei) ? 'Aug/Sep' : /ende/i.test(datei) ? `Ende Klasse ${stufe || ''}`.trim() : '';
    if (verfahren === 'STOLLE' && !zp && stufe) zp = `Ende Klasse ${stufe}`;
    const testdatum = meta.testdatum ? datumIso(meta.testdatum) : null;
    let sj = meta.schuljahr ? schuljahr(meta.schuljahr) : ((datei.match(/(20\d{2})[-_](\d{2})/) || []).slice(1, 3).join('/') || '');

    const B = STUFEN[verfahren];
    const ergebnisse = [], fehler = [];
    for (let i = hz + 1; i < zeilen.length; i++) {
      const r = zeilen[i];
      const id = zellText(r[cId]);
      const w = zahl(r[cWert]);
      if (!id && w == null) continue;
      if (/^beispiel|^summe|^gesamt|^ø|^mittel/i.test(id)) continue;
      if (!id) { fehler.push(`Zeile ${i + 1}: Wert ohne Schüler-ID`); continue; }
      const roh = cRoh >= 0 ? zahl(r[cRoh]) : null;
      if (w == null) { ergebnisse.push({ kennung: id, skala: B.skala, skala_name: B.skalaName, rw: null, pr: null, tw: null, ks: null, fq: null, hinweis: 'nicht getestet' }); continue; }
      if (verfahren === 'STOLLE') {
        if (w < 0 || w > 100) { fehler.push(`Zeile ${i + 1} (${id}): Prozentrang ${w} liegt nicht zwischen 0 und 100`); continue; }
        const t = 50 + 10 * probit(Math.min(Math.max(w, 0.5), 99.5) / 100);
        ergebnisse.push({ kennung: id, skala: B.skala, skala_name: B.skalaName, rw: roh, pr: w, tw: r1(t), ks: bandVon('STOLLE', w), fq: null, hinweis: null });
      } else {
        if (w < 40 || w > 160) { fehler.push(`Zeile ${i + 1} (${id}): LQ ${w} liegt nicht zwischen 40 und 160`); continue; }
        const t = 50 + (w - 100) / 1.5;
        ergebnisse.push({ kennung: id, skala: B.skala, skala_name: B.skalaName, rw: w, pr: r1(phi((w - 100) / 15) * 100), tw: r1(t), ks: bandVon('SLS', w), fq: null, hinweis: null });
      }
    }
    if (!ergebnisse.length) throw new Error(`${blattName}: keine Schülerzeilen mit Werten gefunden.`);
    const testversion = verfahren === 'STOLLE' ? `STOLLE ${zp || 'Ende Klasse ' + (stufe || '?')}` : `SLS ${zp || '?'} Klasse ${stufe || '?'}`;
    return {
      meta: { verfahren, fach: 'Deutsch', testversion, klasse, stufe, schuljahr: sj, testdatum, norm: `Stufen laut Testvorlage (${B.risikoText} = Risikogruppe)`, datei },
      ergebnisse, warnungen: fehler, zeitpunkt: zp
    };
  }

  function ladeExcelJS() {
    if (root.ExcelJS) return Promise.resolve(root.ExcelJS);
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = EXCELJS_URL;
      s.onload = () => res(root.ExcelJS); s.onerror = () => rej(new Error('Excel-Bibliothek konnte nicht geladen werden (Internetverbindung prüfen).'));
      document.head.appendChild(s);
    });
  }

  async function parseXlsx(buffer, datei) {
    const ExcelJS = await ladeExcelJS();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const out = [];
    wb.eachSheet(ws => {
      if (/hinweis/i.test(ws.name)) return;
      const zeilen = [];
      ws.eachRow({ includeEmpty: true }, (row, nr) => {
        const arr = []; row.eachCell({ includeEmpty: true }, (cell, col) => { arr[col - 1] = cell.value; });
        zeilen[nr - 1] = arr;
      });
      for (let i = 0; i < zeilen.length; i++) if (!zeilen[i]) zeilen[i] = [];
      const t = auswerten(zeilen, datei, ws.name);
      if (t) out.push(t);
    });
    if (!out.length) throw new Error('Keine Ergebnistabelle gefunden. Erwartet wird eine Spalte „Schüler-ID“ und eine Spalte „Prozentrang“ (STOLLE) bzw. „Lesequotient“ (SLS).');
    return out;
  }

  function parseCsvTabelle(text, datei) {
    const z = text.replace(/\r/g, '').split('\n');
    const sep = (z.find(l => l.includes(';')) ? ';' : ',');
    const t = auswerten(z.map(l => l.split(sep)), datei, datei);
    if (!t) throw new Error('Keine Spalte „Schüler-ID“ gefunden.');
    return [t];
  }

  root.LeseTabellen = { parseXlsx, parseCsvTabelle, auswerten, STUFEN, bandVon };
})(typeof window !== 'undefined' ? window : globalThis);
