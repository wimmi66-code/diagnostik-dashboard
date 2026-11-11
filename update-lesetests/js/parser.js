/* Parser für Klett-Diagnostik Klassenauswertungen (PDF).
   Unterstützt: HSP (Hamburger Schreib-Probe) und LRP (Lernstand Rechnen / Mathe).
   Ausgabe (einheitlich):
   { meta: {verfahren, fach, testversion, klasse, stufe, schuljahr, testdatum, norm, datei},
     ergebnisse: [{kennung, skala, skala_name, rw, pr, tw, ks, fq, hinweis}] }            */
(function (root) {
  'use strict';

  const SKALEN = {
    // HSP Deutsch
    W: 'Richtig geschriebene Wörter', GT: 'Graphemtreffer', GP: 'Gesamtpunkte',
    A: 'Alphabetische Strategie', O: 'Orthografische Strategie', M: 'Morphematische Strategie',
    'O+M': 'Orthografisch/Morphematisch', WÜ: 'Wortübergreifende Strategie',
    ÜOE: 'Überflüssige orthogr. Elemente', ÜS: 'Überflüssige Satzzeichen', OZ: 'Oberzeichenfehler',
    // LRP Mathe
    ZV: 'Zahlenverständnis', OV: 'Operationsverständnis', AD: 'Addition', SU: 'Subtraktion',
    MU: 'Multiplikation', DI: 'Division',
    LES: 'Leseleistung (STOLLE)', LQ: 'Lesequotient (SLS)'
  };
  // Hauptskala je Verfahren (für Übersichten)
  const HAUPTSKALA = { HSP: ['GT', 'GP'], LRP: ['OV', 'ZV'], STOLLE: ['LES'], SLS: ['LQ'] };

  const num = (s) => {
    if (s == null) return null;
    s = String(s).replace('%', '').replace(',', '.').replace(/[≤<>*]/g, '').trim();
    if (s === '' || /n\.?\s*a/i.test(s)) return null;
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  };

  /** pdf.js-Dokument -> Zeilen (Strings), Seite für Seite */
  async function extractLines(pdf) {
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const rows = [];
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const x = it.transform[4], y = it.transform[5];
        let row = rows.find(r => Math.abs(r.y - y) < 2.5);
        if (!row) { row = { y, items: [] }; rows.push(row); }
        row.items.push({ x, s: it.str.trim() });
      }
      rows.sort((a, b) => b.y - a.y);
      for (const r of rows) {
        r.items.sort((a, b) => a.x - b.x);
        lines.push(r.items.map(i => i.s).join(' ').replace(/\s+/g, ' ').trim());
      }
    }
    return lines;
  }

  const norm = (l) => l.replace(/n\.\s*a\.(\*{0,2})/g, 'n.a.$1').replace(/\s+/g, ' ').trim();

  function metaWert(lines, label) {
    const re = new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(.*)$');
    for (const l of lines) { const m = l.match(re); if (m) return m[1].trim(); }
    return '';
  }

  function schuljahrAusDatei(name) {
    const m = (name || '').match(/Schuljahr\s*(\d{2})\s*[-_/]\s*(\d{2})/i);
    return m ? `20${m[1]}/${m[2]}` : '';
  }
  function schuljahrAusDatum(d) {
    const m = (d || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (!m) return '';
    const y = +m[3], mo = +m[2];
    const start = mo >= 8 ? y : y - 1;
    return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
  }
  function isoDatum(d) {
    const m = (d || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
  }

  function gemeinsameMeta(lines, datei) {
    const klasse = metaWert(lines, 'Klasse ').replace(/^Klasse\s*/i, '') || metaWert(lines, 'Klasse');
    const stufe = parseInt(metaWert(lines, 'Klassenstufe'), 10) || parseInt((klasse.match(/\d+/) || [])[0], 10) || null;
    const testdatumRaw = metaWert(lines, 'Testdatum');
    const testdatum = isoDatum(testdatumRaw);
    let schuljahr = metaWert(lines, 'Schuljahr');
    if (!/\d{4}\/\d{2}/.test(schuljahr)) schuljahr = schuljahrAusDatei(datei) || schuljahrAusDatum(testdatumRaw);
    return {
      klasse: klasse.replace(/^Klasse\s*/i, '').trim(),
      stufe, schuljahr, testdatum,
      testversion: metaWert(lines, 'Testversion'),
      norm: metaWert(lines, 'Vergleichswert zur Auswertung'),
      datei: datei || ''
    };
  }

  /* ---------------- HSP ---------------- */
  const KENNUNG = '([A-Za-z0-9]{3,12})(\\*{0,2})';
  function parseHSP(lines, datei) {
    const meta = Object.assign(gemeinsameMeta(lines, datei), { verfahren: 'HSP', fach: 'Deutsch' });
    const ergebnisse = [];
    let gruppen = null, spalten = null;
    const rowRe = new RegExp('^\\d{1,3} ' + KENNUNG + ' (.+)$');
    for (let i = 0; i < lines.length; i++) {
      const l = norm(lines[i]);
      // Kopfzeile: "Nr. Schülerkennung W¹ GT²" / "Nr. Schüler- A O+M" ...
      const h = l.match(/^Nr\.\s*Schüler-?\s*(?:kennung)?\s*(.+)$/);
      if (h) {
        gruppen = h[1].replace(/[¹²³⁴⁵]/g, '').split(' ').filter(Boolean);
        spalten = null;
        // Spaltenzeile kann in derselben oder einer der nächsten Zeilen stehen
        for (let j = i; j < Math.min(i + 3, lines.length); j++) {
          const c = norm(lines[j]).replace(/^.*?kennung\s*/, '').split(' ').filter(t => /^(RW|PR|TW|KS)$/.test(t));
          if (c.length >= gruppen.length) { spalten = c; break; }
        }
        continue;
      }
      if (!gruppen || !spalten) continue;
      const m = l.match(rowRe);
      if (!m) { if (/^Ø/.test(l)) { gruppen = null; } continue; }
      const kennung = m[1], stern = m[2];
      const toks = m[3].split(' ');
      if (toks.length !== spalten.length) continue;
      const proGruppe = spalten.length / gruppen.length;
      gruppen.forEach((g, gi) => {
        const rec = { kennung, skala: g, skala_name: SKALEN[g] || g, rw: null, pr: null, tw: null, ks: null, fq: null,
          hinweis: stern === '**' ? 'nicht auswertbar' : stern === '*' ? 'hochgerechnet' : null };
        for (let k = 0; k < proGruppe; k++) {
          const col = spalten[gi * proGruppe + k], v = toks[gi * proGruppe + k];
          if (col === 'KS') rec.ks = /n\.a/.test(v) ? null : v;
          else rec[col.toLowerCase()] = num(v);
        }
        ergebnisse.push(rec);
      });
    }
    return { meta, ergebnisse: dedupe(ergebnisse) };
  }

  /* ---------------- LRP ---------------- */
  function parseLRP(lines, datei) {
    const meta = Object.assign(gemeinsameMeta(lines, datei), { verfahren: 'LRP', fach: 'Mathematik' });
    const ergebnisse = [];
    let skala = null;
    const V = '(n\\.a\\.\\*{0,3}|-?[\\d,]+%?)';
    const BAND = '(n\\.a\\.\\*{0,3}|- ?\\*{1,3}|[\\d,]+ ?- ?[\\d,]+)';
    const rowRe = new RegExp('^' + KENNUNG + ' ' + V + ' ' + V + ' ' + V + ' ' + BAND + ' ' + V + '$');
    for (const raw of lines) {
      const l = norm(raw);
      const h = l.match(/Genauigkeit und allgemeine Leistungen \(([A-ZÄÖÜ]{2,4})\)/);
      if (h) { skala = h[1]; continue; }
      if (/^\d+(\.\d+)*\.? (Kennwerte|Grafische)/.test(l)) { skala = null; continue; }
      if (!skala) continue;
      const m = l.match(rowRe);
      if (!m || /^Mittler/.test(l)) continue;
      const [, kennung, stern, gfq, tw_roh, tw, band, pr] = m;
      const na = /n\.a/.test(tw);
      ergebnisse.push({
        kennung, skala, skala_name: SKALEN[skala] || skala,
        rw: num(tw_roh), tw: num(tw), pr: num(pr), ks: null, fq: num(gfq),
        hinweis: na ? 'nicht auswertbar' : /^- ?\*/.test(band) ? 'Grenzwert (T-Wert nicht genau bestimmbar)' : null
      });
    }
    return { meta, ergebnisse: dedupe(ergebnisse) };
  }

  function dedupe(arr) {
    const seen = new Set();
    return arr.filter(r => { const k = r.kennung + '|' + r.skala; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  function erkenneVerfahren(lines) {
    const kopf = lines.slice(0, 15).join(' ');
    if (/\bHSP\b/.test(kopf)) return 'HSP';
    if (/\bLRP\b/.test(kopf) || /Zahlenverständnis/.test(lines.join(' '))) return 'LRP';
    return null;
  }

  function parseLines(lines, datei) {
    const v = erkenneVerfahren(lines);
    if (v === 'HSP') return parseHSP(lines, datei);
    if (v === 'LRP') return parseLRP(lines, datei);
    throw new Error('Unbekanntes Testformat. Unterstützt werden derzeit HSP- und LRP-Klassenauswertungen von Klett Diagnostik.');
  }

  async function parsePdf(arrayBuffer, datei, pdfjsLib) {
    const lib = pdfjsLib || root.pdfjsLib;
    const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
    const lines = await extractLines(pdf);
    return parseLines(lines, datei);
  }

  /* CSV-Import (für andere Verfahren): Spalten
     verfahren;fach;klasse;stufe;schuljahr;testdatum;kennung;skala;skala_name;rw;pr;tw;ks;hinweis */
  function parseCsv(text, datei) {
    const zeilen = text.replace(/\r/g, '').split('\n').filter(z => z.trim());
    const sep = zeilen[0].includes(';') ? ';' : ',';
    const kopf = zeilen[0].split(sep).map(s => s.trim().toLowerCase());
    const idx = (k) => kopf.indexOf(k);
    const tests = new Map();
    for (const z of zeilen.slice(1)) {
      const c = z.split(sep).map(s => s.trim());
      const g = (k) => (idx(k) >= 0 ? c[idx(k)] : '');
      const key = [g('verfahren'), g('klasse'), g('schuljahr'), g('testdatum')].join('|');
      if (!tests.has(key)) tests.set(key, {
        meta: { verfahren: g('verfahren'), fach: g('fach'), testversion: g('testversion') || g('verfahren'), klasse: g('klasse'),
          stufe: parseInt(g('stufe'), 10) || null, schuljahr: g('schuljahr'), testdatum: isoDatum(g('testdatum')) || g('testdatum') || null,
          norm: g('norm'), datei: datei || '' },
        ergebnisse: []
      });
      tests.get(key).ergebnisse.push({ kennung: g('kennung'), skala: g('skala'), skala_name: g('skala_name') || SKALEN[g('skala')] || g('skala'),
        rw: num(g('rw')), pr: num(g('pr')), tw: num(g('tw')), ks: g('ks') || null, fq: num(g('fq')), hinweis: g('hinweis') || null });
    }
    return [...tests.values()];
  }

  const api = { extractLines, parseLines, parsePdf, parseCsv, SKALEN, HAUPTSKALA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KlettParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
