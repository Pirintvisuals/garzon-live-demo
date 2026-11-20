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
      if (cells.some(isNameHeader) && cells.some(isQtyHeader)) return r;
    }
    return -1;
  }
  // Mennyiség oszlop: „Mennyiség”, vagy maga az egység a fejléc („db”, „darab”, „menny.”).
  // Megnevezés oszlop: „Megnevezés”, vagy generálkivitelezői táblázatban „Tétel szövege”.
  const isNameHeader = c => /megnevez|tétel ?szöveg|termék ?specifik/.test(c);
  const isQtyHeader = c => (/mennyis/.test(c) && !/egys/.test(c)) || /^(db|darab|menny\.?|db\.)$/.test(c);

  function mapColumns(header) {
    const h = header.map(low);
    const first = test => h.findIndex(test);
    const nameCol = first(isNameHeader);
    const spec = h.findIndex((c, i) => i !== nameCol && /specifik|műszaki leírás|műszaki tartalom|leírás/.test(c) && !/megajánlott|paraméter/.test(c));
    // A műszaki tartalomhoz tartozó további oszlopok (szín, helyszín, anyag stb.), az ár- és nyilatkozatoszlopok nélkül.
    const extra = h.map((c, i) => (i !== spec && /^(szín|helyszín|anyag|felület|méret|megjegyzés|rajz|alaprajzi jel)/.test(c) && !/ár|egységár|összesen|díj/.test(c)) ? i : -1).filter(i => i >= 0);
    return {
      no: first(c => /^(s(or)?sz|sorsz|ssz|tétel ?sz)/.test(c)),
      name: first(isNameHeader),
      spec, extra,
      qty: first(isQtyHeader),
      unit: first(c => (/egys/.test(c) && /(mennyis|mérték)/.test(c)) || /^egység.?$/.test(c))
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
    // Oszlopcímke a leíráshoz: a fejléc első sora, zárójel és magyarázat nélkül (a kiírások fejléce gyakran egész bekezdés).
    const header = (rows[hr] || []).map(h => clean(String(h == null ? '' : h).split(/\r?\n/)[0].split(' (')[0].split(':')[0]).slice(0, 30));
    const specCols = (col.specs || []).filter(c => c >= 0 && c !== col.name && c !== col.qty && c !== col.unit && c !== col.no);
    // Ha nincs külön egység oszlop, de a mennyiség oszlop fejléce maga az egység ("db", "fm"), azt használjuk.
    const qh = clean((rows[hr] || [])[col.qty]).toLowerCase();
    const qtyUnit = /^(db|darab|fm|m2|m²|m|klt|készlet|garnitúra|szett)$/.test(qh) ? qh : '';
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
        name, spec, qty, unit: col.unit >= 0 ? clean(row[col.unit]) : qtyUnit
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
  async function readWorkbook(buf, fileName, detect, preset) {
    const wb = XLSX.read(buf, { type: 'array', codepage: 1250 });
    const sheets = wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', blankrows: true }) }));
    const sameHeader = (row, header) => JSON.stringify((row || []).map(clean)) === JSON.stringify(header);
    const plan = sheets.map(sh => {
      // Revíziónál: ha a munkalap fejléce ugyanaz, mint az eredetiben, ugyanazt az oszlopkiosztást használjuk.
      const pr = preset && preset[sh.name];
      if (pr && pr.hr >= 0 && sameHeader(sh.rows[pr.hr], pr.header)) return { hr: pr.hr, col: pr.col };
      const hr = findHeader(sh.rows);
      if (hr < 0) return null;
      const c = mapColumns(sh.rows[hr]);
      const specs = [...c.extra.filter(i => i < c.spec), ...(c.spec >= 0 ? [c.spec] : []), ...c.extra.filter(i => i > c.spec)];
      return c.name >= 0 && c.qty >= 0 ? { hr, col: { no: c.no, name: c.name, qty: c.qty, unit: c.unit, specs } } : null;
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
      if (items.length) parts.push({ no: parts.length + 1, name: clean(sh.name), sheet: sh.name, items, ai: !!plan[i].ai, hr: plan[i].hr, header: (sh.rows[plan[i].hr] || []).map(clean), col: plan[i].col });
      else skipped.push(sh.name);
    });
    return { fileName, parts, items: parts.flatMap(p => p.items), skipped, sheetCount: wb.SheetNames.length, usedAi, aiError };
  }

  const PAGE = n => '##### OLDAL ' + n + ' #####';
  const toBase64 = buf => { let b = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(b); };

  // PDF szövegrétegének kiolvasása oldalanként, soronként.
  async function pdfText(buf) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
    let text = '', chars = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      const tc = await (await pdf.getPage(n)).getTextContent();
      let page = '', lastY = null;
      for (const it of tc.items) {
        const y = it.transform ? Math.round(it.transform[5]) : lastY;
        if (lastY !== null && Math.abs(y - lastY) > 2) page += '\n';
        page += it.str; if (it.hasEOL) page += '\n';
        lastY = y;
      }
      // A sorokat bekezdésekké fűzzük: új bekezdés üres sornál, vagy ha az előző sor mondatvéggel zárul.
      const paras = []; let cur = '';
      for (const line of page.split('\n').map(l => l.replace(/\s+/g, ' ').trim())) {
        if (!line) { if (cur) { paras.push(cur); cur = ''; } continue; }
        cur = cur ? cur + ' ' + line : line;
        if (/[.:;!?]$/.test(line)) { paras.push(cur); cur = ''; }
      }
      if (cur) paras.push(cur);
      chars += paras.join('').length;
      text += PAGE(n) + '\n' + paras.join('\n') + '\n';
    }
    return { text, pages: pdf.numPages, chars, pdf };
  }

  // Szkennelt PDF: az oldalakat képpé rajzoljuk, és 3 oldalas adagokban, párhuzamosan íratjuk át.
  async function pdfOcr(pdf, ocr, onProgress) {
    const images = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(2.2, 1500 / base.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, intent: 'print' }).promise; // 'print': háttérben lévő lapon sem áll meg a rajzolás
      images.push({ n, data: canvas.toDataURL('image/jpeg', 0.72).split(',')[1] });
      canvas.width = canvas.height = 0;
    }
    const batches = [];
    for (let i = 0; i < images.length; i += 3) batches.push(images.slice(i, i + 3));
    const out = new Array(batches.length); let done = 0, next = 0; const failed = [];
    // Ha egy adag nem sikerül, oldalanként újrapróbáljuk; ami így sem megy, azt kihagyjuk és jelezzük.
    const readBatch = async batch => {
      try { return (await ocr({ pages: batch })).text; } catch (e) {
        let text = '';
        for (const pg of batch) {
          try { text += (await ocr({ pages: [pg] })).text + '\n'; }
          catch (e2) { failed.push(pg.n); text += PAGE(pg.n) + '\n[Az oldal szövegfelismerése nem sikerült.]\n'; }
        }
        return text;
      }
    };
    const worker = async () => {
      while (next < batches.length) {
        const k = next++;
        out[k] = await readBatch(batches[k]);
        done += batches[k].length; if (onProgress) onProgress(done, images.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(9, batches.length) }, worker));
    return { text: out.join('\n'), failed: failed.sort((a, b) => a - b) };
  }

  /*
   * Szöveges dokumentum beolvasása: .docx, .txt, .pdf. Szkennelt PDF-nél (nincs szövegréteg) az `ocr` függvény írja át.
   */
  async function readDocument(file, ocr, onProgress) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const buf = await file.arrayBuffer();
    if (ext === 'docx') {
      const out = await mammoth.extractRawText({ arrayBuffer: buf });
      return { fileName: file.name, text: out.value };
    }
    if (ext === 'txt') return { fileName: file.name, text: new TextDecoder('utf-8').decode(buf) };
    if (ext === 'pdf') {
      const t = await pdfText(buf);
      if (t.chars >= 150 * t.pages) return { fileName: file.name, text: t.text, pages: t.pages };
      if (onProgress) onProgress(0, t.pages);
      if (!ocr) throw new Error('Szkennelt PDF, a szövegfelismerés nem érhető el (' + file.name + ').');
      const o = await pdfOcr(t.pdf, ocr, onProgress);
      return { fileName: file.name, text: o.text, pages: t.pages, scanned: true, failedPages: o.failed };
    }
    throw new Error('A dokumentumot .pdf, .docx vagy .txt formátumban tudom olvasni (' + file.name + ').');
  }

  // Több dokumentum egy szöveggé fűzve, fájljelölő sorokkal.
  const FILE = name => '##### FÁJL: ' + name + ' #####';
  const combineDocs = docs => docs.map(d => FILE(d.fileName) + '\n' + d.text).join('\n');

  /* Idézet-ellenőrzés: a modell által adott idézetet megkeressük a forrásszövegben. */
  const norm = s => String(s || '').toLowerCase().replace(/[„”"'’‘`´]/g, '').replace(/\s+/g, ' ').trim();

  // Laza egyezés: a szerződésminták csillagos, szögletes zárójeles betoldásait ("* [nem releváns rész törlendő]") figyelmen kívül hagyjuk.
  const loose = s => norm(s).replace(/\[[^\]]*\]/g, ' ').replace(/[*]/g, ' ').replace(/[^a-z0-9áéíóöőúüű%]+/g, ' ').trim();

  const squashText = x => norm(x).replace(/[^a-z0-9áéíóöőúüű]+/g, '');
  function makeDocIndex(text) {
    const paras = [], meta = [];
    let file = '', page = 0;
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = clean(raw); if (!line) continue;
      let m = line.match(/^#{3,}\s*FÁJL:\s*(.+?)\s*#{3,}$/); if (m) { file = m[1]; page = 0; continue; }
      m = line.match(/^#{3,}\s*OLDAL\s*(\d+)\s*#{3,}$/); if (m) { page = Number(m[1]); continue; }
      paras.push(line); meta.push({ file, page });
    }
    // Csak betűk és számok, bekezdéshatárok nélkül: a PDF sortörései és elválasztásai miatt több bekezdésen átnyúló idézethez.
    const sq = paras.map(squashText), starts = [];
    let pos = 0; sq.forEach(x => { starts.push(pos); pos += x.length; });
    return { paras, meta, normParas: paras.map(norm), looseParas: paras.map(loose), normAll: norm(paras.join(' ')), sqAll: sq.join(''), sqStarts: starts };
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
    const sqq = squashText(quote);
    if (sqq.length >= 16 && index.sqAll) {
      const at = index.sqAll.indexOf(sqq);
      if (at >= 0) { let k = 0; while (k + 1 < index.sqStarts.length && index.sqStarts[k + 1] <= at) k++; return { found: true, para: k + 1, text: index.paras[k], partial: true }; }
    }
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

  root.Parse = { readWorkbook, readDocument, combineDocs, makeDocIndex, locateQuote, quoteInItem, clean };
})(window);
