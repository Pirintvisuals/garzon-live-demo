/*
 * Fájlok beolvasása a böngészőben. Itt nincs mesterséges intelligencia: a tételek szövege, mennyisége
 * és a sor helye (munkalap + sor) közvetlenül a táblázatból jön, ezért mindig visszakereshető.
 */
(function (root) {
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const low = v => clean(v).toLowerCase();

  function findHeader(rows) {
    for (let r = 0; r < Math.min(rows.length, 25); r++) {
      const cells = (rows[r] || []).map(low);
      if (cells.some(c => /megnevez/.test(c)) && cells.some(c => /mennyis/.test(c))) return r;
    }
    return -1;
  }

  function mapColumns(header) {
    const h = header.map(low);
    const first = test => h.findIndex(test);
    return {
      no: first(c => /^(s(or)?sz|sorsz|ssz|tétel ?sz)/.test(c)),
      name: first(c => /megnevez/.test(c)),
      spec: first(c => /specifik|műszaki leírás|műszaki tartalom|leírás/.test(c)),
      qty: first(c => /mennyis/.test(c) && !/egys/.test(c)),
      unit: first(c => /egys/.test(c) && /(mennyis|mérték)/.test(c))
    };
  }

  function parseQty(v) {
    if (typeof v === 'number') return v;
    const n = parseFloat(clean(v).replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : NaN;
  }

  const rowHasText = row => (row || []).some(c => clean(c) !== '');

  // Tételek kiolvasása egy munkalapról a megadott oszlopkiosztással. A leírás több oszlopból is összeállhat.
  function extract(rows, hr, col, sheetName, partNo) {
    const header = (rows[hr] || []).map(clean);
    const specCols = (col.specs || []).filter(c => c >= 0 && c !== col.name && c !== col.qty && c !== col.unit && c !== col.no);
    const items = [];
    for (let r = hr + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const name = clean(row[col.name]);
      const qty = parseQty(row[col.qty]);
      if (!name || !(qty > 0)) continue;
      if (/^(összesen|mindösszesen|részösszeg|összeg)/i.test(name)) continue;
      const no = col.no >= 0 ? clean(row[col.no]).replace(/\.$/, '') : '';
      const spec = specCols.length === 1 ? clean(row[specCols[0]])
        : specCols.map(c => { const v = clean(row[c]); return v ? (header[c] ? header[c] + ': ' : '') + v : ''; }).filter(Boolean).join('; ');
      items.push({
        id: partNo + '/' + (no || items.length + 1),
        partNo, part: clean(sheetName), sheet: sheetName, row: r + 1, no: no || String(items.length + 1),
        name, spec, qty, unit: col.unit >= 0 ? clean(row[col.unit]) : ''
      });
    }
    // Azonos kód kétszer: a sorszámmal tesszük egyedivé.
    const seen = {};
    items.forEach(it => { if (seen[it.id]) it.id = it.id + '#' + it.row; seen[it.id] = true; });
    return items;
  }

  /*
   * Munkafüzet beolvasása. Először szabály alapján keressük a fejlécet; ahol ez nem sikerül,
   * a `detect` függvény (mesterséges intelligencia) megmondja az oszlopkiosztást. A tételeket mindig a kód olvassa ki.
   */
  async function readWorkbook(buf, fileName, detect) {
    const wb = XLSX.read(buf, { type: 'array', codepage: 1250 });
    const sheets = wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', blankrows: true }) }));
    const plan = sheets.map(sh => {
      const hr = findHeader(sh.rows);
      if (hr < 0) return null;
      const c = mapColumns(sh.rows[hr]);
      return c.name >= 0 && c.qty >= 0 ? { hr, col: { no: c.no, name: c.name, qty: c.qty, unit: c.unit, specs: c.spec >= 0 ? [c.spec] : [] } } : null;
    });
    let usedAi = false, aiError = '';
    const unknown = sheets.map((sh, i) => i).filter(i => !plan[i] && sheets[i].rows.filter(rowHasText).length >= 3);
    if (unknown.length && detect) {
      try {
        const payload = unknown.map(i => ({ name: sheets[i].name, rows: sheets[i].rows.slice(0, 40).map(r => (r || []).slice(0, 30).map(c => clean(c).slice(0, 70))) }));
        const out = await detect(payload);
        (out.lapok || []).forEach((l, n) => {
          const i = unknown.find(k => sheets[k].name === l.nev); const idx = i !== undefined ? i : unknown[n];
          if (idx === undefined || !l.van_tetel || l.oszlop_megnevezes < 0 || l.oszlop_mennyiseg < 0) return;
          plan[idx] = { hr: Math.max(0, l.fejlec_sor), ai: true, col: { no: l.oszlop_sorszam, name: l.oszlop_megnevezes, qty: l.oszlop_mennyiseg, unit: l.oszlop_egyseg, specs: l.oszlopok_leiras || [] } };
          usedAi = true;
        });
      } catch (e) { aiError = e.message; }
    }
    const parts = [], skipped = [];
    sheets.forEach((sh, i) => {
      const items = plan[i] ? extract(sh.rows, plan[i].hr, plan[i].col, sh.name, parts.length + 1) : [];
      if (items.length) parts.push({ no: parts.length + 1, name: clean(sh.name), sheet: sh.name, items, ai: !!plan[i].ai, header: (sh.rows[plan[i].hr] || []).map(clean), col: plan[i].col });
      else skipped.push(sh.name);
    });
    return { fileName, parts, items: parts.flatMap(p => p.items), skipped, sheetCount: wb.SheetNames.length, usedAi, aiError };
  }

  async function readDocument(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const buf = await file.arrayBuffer();
    if (ext === 'docx') {
      const out = await mammoth.extractRawText({ arrayBuffer: buf });
      return { fileName: file.name, text: out.value };
    }
    if (ext === 'txt') return { fileName: file.name, text: new TextDecoder('utf-8').decode(buf) };
    throw new Error('A szöveges dokumentumot egyelőre .docx vagy .txt formátumban tudom olvasni (' + file.name + ').');
  }

  /* Idézet-ellenőrzés: a modell által adott idézetet megkeressük a forrásszövegben. */
  const norm = s => String(s || '').toLowerCase().replace(/[„”"'’‘`´]/g, '').replace(/\s+/g, ' ').trim();

  // Laza egyezés: a szerződésminták csillagos, szögletes zárójeles betoldásait ("* [nem releváns rész törlendő]") figyelmen kívül hagyjuk.
  const loose = s => norm(s).replace(/\[[^\]]*\]/g, ' ').replace(/[*]/g, ' ').replace(/[^a-z0-9áéíóöőúüű%]+/g, ' ').trim();

  function makeDocIndex(text) {
    const paras = String(text || '').split(/\r?\n/).map(clean).filter(Boolean);
    return { paras, normParas: paras.map(norm), looseParas: paras.map(loose), normAll: norm(paras.join(' ')) };
  }

  function locateQuote(index, quote) {
    const q = norm(quote);
    if (!q || q.length < 8) return { found: false };
    let i = index.normParas.findIndex(p => p.includes(q));
    if (i >= 0) return { found: true, para: i + 1, text: index.paras[i] };
    // részleges egyezés: az idézet eleje egy bekezdésben
    const head = q.slice(0, Math.min(60, q.length));
    i = index.normParas.findIndex(p => p.includes(head));
    if (i >= 0) return { found: true, para: i + 1, text: index.paras[i], partial: true };
    const lq = loose(quote);
    if (lq.length >= 12) { i = index.looseParas.findIndex(p => p.includes(lq)); if (i >= 0) return { found: true, para: i + 1, text: index.paras[i], partial: true }; }
    return { found: index.normAll.includes(q) };
  }

  // A modell néha kihagyással ("...") vagy a megnevezést és a leírást összefűzve idéz: ilyenkor a darabokat külön keressük.
  const fragments = quote => String(quote || '').split(/\s*(?:\.{3,}|…|\[\.{3}\]|\s-\s)\s*/).map(norm).filter(f => f.length >= 6);
  const quoteInItem = (item, quote) => {
    const hay = norm(item.name + ' ' + item.spec), fr = fragments(quote);
    if (fr.length > 0 && fr.every(f => hay.includes(f))) return true;
    // A táblázat sortörései miatt a szóközök eltérhetnek: csak a betűket és számokat hasonlítjuk.
    const squash = x => norm(x).replace(/[^a-z0-9áéíóöőúüű]+/g, '');
    const sh = squash(item.name + ' ' + item.spec), sq = fr.map(squash).filter(f => f.length >= 6);
    return sq.length > 0 && sq.every(f => sh.includes(f));
  };

  root.Parse = { readWorkbook, readDocument, makeDocIndex, locateQuote, quoteInItem, clean };
})(window);
