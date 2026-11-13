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

  function readWorkbook(buf, fileName) {
    const wb = XLSX.read(buf, { type: 'array', codepage: 1250 });
    const parts = [];
    const skipped = [];
    wb.SheetNames.forEach((sheetName, si) => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', blankrows: true });
      const hr = findHeader(rows);
      if (hr < 0) { skipped.push(sheetName); return; }
      const col = mapColumns(rows[hr]);
      if (col.name < 0 || col.qty < 0) { skipped.push(sheetName); return; }
      const partNo = parts.length + 1;
      const items = [];
      for (let r = hr + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        const name = clean(row[col.name]);
        const qty = parseQty(row[col.qty]);
        if (!name || !(qty > 0)) continue;
        const no = col.no >= 0 ? clean(row[col.no]).replace(/\.$/, '') : '';
        items.push({
          id: partNo + '/' + (no || items.length + 1),
          partNo, part: clean(sheetName), sheet: sheetName, row: r + 1, no: no || String(items.length + 1),
          name, spec: col.spec >= 0 ? clean(row[col.spec]) : '',
          qty, unit: col.unit >= 0 ? clean(row[col.unit]) : ''
        });
      }
      if (items.length) parts.push({ no: partNo, name: clean(sheetName), sheet: sheetName, items });
      else skipped.push(sheetName);
    });
    return { fileName, parts, items: parts.flatMap(p => p.items), skipped, sheetCount: wb.SheetNames.length };
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
