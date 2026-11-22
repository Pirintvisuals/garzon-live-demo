/*
 * Egyezés: tervlapok, konszignáció és tételjegyzék összevetése alaprajzi jel szerint.
 * Minden a böngészőben fut, kód számol (nincs MI): a jeleket a vektoros PDF-ek szövegéből és a táblázatból olvassa.
 *
 * Olvasók:
 *   readSheet(file)  tételjegyzék (Excel): az "Alaprajzi jel" oszlop sorai, rejtett sorok, hibás cellák
 *   readPdf(file)    konszignáció (lapokon "Jel:" / "Alaprajzi jel:") vagy tervlap (a jelek helyével)
 *   compare()        jelcsoportonként: hány db a rajzon, a konszignációban, a tételjegyzékben, és mi tér el
 *
 * A tervlap-olvasó egyetlen kicserélhető rész: { code, page, x, y, w, h } találatokat ad. Szkennelt tervhez
 * ugyanezt a formát kell előállítania (például a rajzolvasóval), a többi rész változatlan marad.
 */
(function (root) {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => (Math.round(n * 100) / 100).toLocaleString('hu-HU');

  // Alaprajzi jel: két-három nagybetű, opcionális kötőjel, két számjegy, opcionális kisbetű és "-1" sorszám. (MO11a, AE02-1, BEB-05)
  const CODE = '(?:[A-Z]{2,3}-?\\d{2}[a-z]?(?:-\\d)?)';
  const CODE_G = new RegExp('(?<![A-Za-z0-9-])' + CODE + '(?![A-Za-z0-9])', 'g');
  const CODE_ONE = new RegExp('^' + CODE + '$');
  // Csak a bútor- és asztalos jelek (a tervlapon sok más jel is van: helyiségszám, nyílászáró, szerkezet).
  // Alapból ezek; ha van tételjegyzék vagy konszignáció, azok jelcsoportjai számítanak (a burkolat-, ajtó- stb. jelek kimaradnak).
  const PREFIX_DEFAULT = ['MO', 'AS', 'AE', 'MOB', 'BEB'];
  const PREFIX_OK = /^[A-Z]{2,3}-?\d/;
  const NL = String.fromCharCode(10);
  const ROOM = /^([0-9]{1,2}\.[0-9]{2,3})(?:\s|$)/;
  const base = c => c.replace(/[a-z]$/, '');
  const prefixOf = c => c.replace(/-?\d.*$/, '');

  const fresh = () => ({ sheet: null, konsz: [], plans: [], reading: '', result: null, filter: 'elteres', error: '', open: {} });
  let st = fresh();
  const pdfDocs = {}; // fájlnév -> pdf.js dokumentum (a kiemeléshez újra kell rajzolni)

  /* ---------- tételjegyzék ---------- */
  // "MO11a,b" -> MO11a, MO11b; "MO12a,b,c"; "AE02-1"; "BEB-01"
  function expandCodes(cell) {
    const s = String(cell || '').trim();
    if (!s || s === '-') return [];
    const out = [];
    let last = '';
    for (const part of s.split(/[,;/]\s*|\s+és\s+/)) {
      const p = part.trim();
      if (CODE_ONE.test(p)) { out.push(p); last = p; }
      else if (/^[a-z]$/.test(p) && last) out.push(base(last) + p);
      else (p.match(CODE_G) || []).forEach(c => { out.push(c); last = c; });
    }
    return [...new Set(out)];
  }
  const num = v => {
    if (typeof v === 'number') return v;
    const m = String(v || '').replace(/\s/g, '').replace(',', '.').match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  };

  function readSheet(buf, fileName) {
    const wb = XLSX.read(buf, { type: 'array', codepage: 1250, cellStyles: true, cellFormula: true });
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws['!ref']) continue;
      const R = XLSX.utils.decode_range(ws['!ref']);
      const cell = (r, c) => ws[XLSX.utils.encode_cell({ r, c })];
      const val = (r, c) => { const x = cell(r, c); return x ? (x.w != null ? x.w : (x.v != null ? x.v : '')) : ''; };
      // Fejléc: az a sor, amelyben "jel" oszlop van.
      let hr = -1, col = {};
      for (let r = R.s.r; r <= Math.min(R.e.r, R.s.r + 30) && hr < 0; r++) {
        const c2 = {};
        for (let c = R.s.c; c <= R.e.c; c++) {
          const t = String(val(r, c)).toLowerCase().replace(/\s+/g, ' ').trim();
          if (!t) continue;
          if (/(alaprajzi )?jel(e)?\.?$/.test(t) && c2.code == null) c2.code = c;
          else if (/^ssz|^sorsz/.test(t)) c2.no = c;
          else if (/tétel szöveg|megnevez|leírás|tétel$/.test(t) && c2.text == null) c2.text = c;
          else if (/^menny/.test(t)) c2.qty = c;
          else if (/^(menny\. ?)?egys(é|e)g\.?$|^m\.e\.?$/.test(t)) c2.unit = c;
          else if (/műszaki tartalom|műszaki leírás|megajánlott/.test(t) && c2.spec == null) c2.spec = c;
        }
        if (c2.code != null && c2.qty != null) { hr = r; col = c2; }
      }
      if (hr < 0) continue;
      const rowsMeta = ws['!rows'] || [];
      const rows = [], issues = [];
      let section = '';
      let prevNo = null;
      for (let r = hr + 1; r <= R.e.r; r++) {
        const text = String(col.text != null ? val(r, col.text) : '').trim();
        const codeCell = String(val(r, col.code)).trim();
        const qRaw = val(r, col.qty);
        const qty = num(qRaw);
        const noCell = col.no != null ? cell(r, col.no) : null;
        const hidden = !!(rowsMeta[r] && rowsMeta[r].hidden);
        if (!text && !codeCell && !String(qRaw).trim()) continue;
        if (/^(mind)?összesen/i.test(text)) continue;
        if (!codeCell && !Number.isFinite(qty)) { section = text; continue; } // fejezetcím
        const noErr = noCell && (noCell.t === 'e' || /#REF!|#HIV!/i.test(String(noCell.w || '') + String(noCell.f || '')));
        const no = noCell && !noErr ? noCell.v : '';
        const spec = col.spec != null ? String(val(r, col.spec)).trim() : '';
        const row = { row: r + 1, sheet: sheetName, no, codeCell, codes: expandCodes(codeCell), text, spec, qty: Number.isFinite(qty) ? qty : null, unit: String(col.unit != null ? val(r, col.unit) : '').trim() || 'db', section, hidden, issues: [] };
        if (hidden) row.issues.push({ t: 'Rejtett sor', d: `Az Excelben a ${r + 1}. sor el van rejtve: megnyitáskor és nyomtatásban nem látszik, csak az elrejtés megszüntetésével. Ezért könnyű kihagyni az árból. Lehet szándékos (nem része a munkának), lehet véletlen: érdemes megkérdezni, hogy árazandó-e.`, p: 50 });
        if (noErr) row.issues.push({ t: 'Hibás sorszám', d: 'A sorszám cellája hibás hivatkozást ad (#REF!): a táblázatból sorokat töröltek vagy másoltak, a sorszámozás nem megbízható.', p: 60 });
        if (/nincs pontos adat|nincs adat|rajz szerint\?|tisztázandó/i.test(text + ' ' + spec)) row.issues.push({ t: 'Hiányzó adat', d: `A sor szövege szerint nincs pontos adat: „${text.replace(/\s+/g, ' ').slice(0, 80)}”.`, p: 90 });
        if (!row.codes.length) row.issues.push({ t: 'Nincs alaprajzi jel', d: 'A tételnek nincs jele, ezért nem párosítható a konszignációval és a rajzzal.', p: 60 });
        if (row.qty == null) row.issues.push({ t: 'Nincs mennyiség', d: 'A mennyiség cellája üres vagy nem szám.', p: 85 });
        if (Number.isFinite(no) && Number.isFinite(prevNo) && no > prevNo + 1) issues.push({ t: 'Kihagyott sorszámok', d: `A sorszámozás ${prevNo} után ${no}-${no - prevNo - 1 > 1 ? 'tól' : 'től'} folytatódik: ${no - prevNo - 1} sorszám hiányzik (${r + 1}. sor előtt). Valószínűleg sorokat töröltek a táblázatból.`, p: 70, row: r + 1 });
        if (Number.isFinite(no)) prevNo = no;
        rows.push(row);
      }
      if (!rows.length) continue;
      return { fileName, sheet: sheetName, rows, issues, headerRow: hr + 1 };
    }
    throw new Error('A táblázatban nem találtam „Alaprajzi jel” oszlopot.');
  }

  /* ---------- PDF: konszignáció vagy tervlap ---------- */
  async function loadPdf(buf) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    return pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
  }
  // Egy oldal szövege sorokba rendezve (azonos magasságú elemek balról jobbra).
  function linesOf(tc) {
    const its = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5] }));
    its.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of its) {
      const L = lines.find(l => Math.abs(l.y - it.y) < 2.5);
      if (L) L.parts.push(it); else lines.push({ y: it.y, parts: [it] });
    }
    return lines.map(l => ({ y: l.y, x: Math.min(...l.parts.map(p => p.x)), text: l.parts.sort((a, b) => a.x - b.x).map(p => p.s).join(' ').replace(/\s+/g, ' ').trim() }));
  }
  const isKonszPage = text => /(alaprajzi jel|^|\s)jel\s*:\s*[A-Z]{2,3}-?\d{2}/i.test(text) && /megnevez/i.test(text);

  // Méretek: "42 x 30 x 180 cm", "4200 x 600 x 2160 mm", "1800 x 600 x 400 mm" -> cm-ben.
  function dimsOf(text) {
    const out = [];
    const re = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?\s*(mm|cm|m)\b/gi;
    let m;
    while ((m = re.exec(text))) {
      const k = { mm: 0.1, cm: 1, m: 100 }[m[4].toLowerCase()];
      const v = [m[1], m[2], m[3]].filter(Boolean).map(x => parseFloat(x.replace(',', '.')) * k);
      out.push({ v, raw: m[0], max: /maximum|max\.?/i.test(text.slice(Math.max(0, m.index - 30), m.index)) });
    }
    return out;
  }
  function qtyOf(lines) {
    // "Mennyiség: 4 db", "Mennyiség: 4-4 Light Grey, ... - 14 db", vagy (asztalos lap) egy önálló "1 db" sor.
    const ml = lines.find(l => /mennyis(é|e)g\s*:/i.test(l.text));
    if (ml) {
      const t = ml.text.replace(/^.*?mennyis(é|e)g\s*:/i, '');
      const all = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*(db|szett|sze|klt|fm|m2|m²|pár)\b/gi)];
      if (all.length) { const a = all[all.length - 1]; return { qty: parseFloat(a[1].replace(',', '.')), unit: a[2].replace(/^sze$/i, 'szett'), raw: ml.text }; }
      const n = num(t); if (Number.isFinite(n)) return { qty: n, unit: 'db', raw: ml.text };
    }
    // Az asztalos lapon a darabszám önálló cellában áll; mellé néha egy méretszám is ugyanabba a sorba kerül ("40 1 db").
    const sl = lines.find(l => /(?:^|\s)\d+(?:[.,]\d+)?\s*(db|szett|klt|pár)$/i.test(l.text) && l.text.length < 24);
    if (sl) { const m = sl.text.match(/(\d+(?:[.,]\d+)?)\s*(\S+)$/); return { qty: parseFloat(m[1].replace(',', '.')), unit: m[2], raw: sl.text }; }
    return { qty: null, unit: '', raw: '' };
  }
  function konszItem(lines, page, fileName) {
    const all = lines.map(l => l.text).join('\n');
    const jm = all.match(/(?:alaprajzi jel|(?:^|\n|\s)jel)\s*:\s*([^\n]+)/i);
    const codes = jm ? expandCodes(jm[1].replace(/megnevez.*$/i, '')) : [];
    if (!codes.length) return null;
    let name = '';
    const nm = all.match(/megnevez(é|e)s\s*:\s*([^\n]*?)(?:\s+alaprajzi jel.*)?(?:\n|$)/i);
    if (nm) name = nm[2].trim();
    if (!name) { const kt = all.match(/konszign(á|a)ci(ó|o)s t(é|e)tel\s*:?[^\n]*\n([^\n]+)/i); if (kt) name = kt[4].trim(); }
    // A lap leíró része: a jel sorától a "Megjegyzés" / figyelmeztető szövegig.
    const start = all.search(/megnevez(é|e)s\s*:/i);
    let body = start >= 0 ? all.slice(start) : all;
    // A minden lapon ismétlődő figyelmeztető és fejléc-sorok kimaradnak.
    body = body.split(NL).filter(l => !/tervrajzokr(ó|o)l l(é|e)pt(é|e)kkel|kivitelez(ő|o)k, alv(á|a)llalkoz|(é|e)rtelmezend|tervez(ő|o)nek!|helyettes(í|i)thet|GY(Á|A)RT(Á|A)S EL(Ő|O)TT|gy(á|a)rtm(á|a)nyterveket|GSPublisher|^M = 1:|KIVITELI TERV|Munkasz(á|a)m|Tervfajta|Tervlap|Projekt:|Aktu(á|a)lis kiad|Gener(á|a)ltervez|Els(ő|o) kiad|^\d{4}\.\s?\d{2}\.\s?\d{2}\.?$|Budapest, |^MOB(Í|I)LI(Á|A)K$|^[A-Z]\d+\s*-\s*[A-ZÁÉÍÓÖŐÚÜŰ ]+$|^[A-Z]\d+\.[A-Z]/i.test(l)).join(NL);
    const q = qtyOf(lines);
    // Projekt neve a lap fejlécéből, például "X12 - PROJEKT NEVE".
    const pm = all.match(/\b([A-Z]\d+\s*-\s*[A-ZÁÉÍÓÖŐÚÜŰ][A-ZÁÉÍÓÖŐÚÜŰ ]{4,}[A-ZÁÉÍÓÖŐÚÜŰ])/);
    return { project: pm ? pm[1].trim() : '', codes, name, qty: q.qty, unit: q.unit || 'db', qtyRaw: q.raw, text: body.trim(), dims: dimsOf(body), page, fileName };
  }

  async function readPdf(file, onProgress) {
    const buf = await file.arrayBuffer();
    const pdf = await loadPdf(buf);
    pdfDocs[file.name] = pdf;
    const first = await (await pdf.getPage(1)).getTextContent();
    const firstText = linesOf(first).map(l => l.text).join('\n');
    if (isKonszPage(firstText) || /konszign(á|a)ci/i.test(firstText)) {
      const items = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        onProgress && onProgress(p, pdf.numPages);
        const tc = p === 1 ? first : await (await pdf.getPage(p)).getTextContent();
        const it = konszItem(linesOf(tc), p, file.name);
        if (it) items.push(it);
      }
      if (items.length) return { kind: 'konsz', fileName: file.name, pages: pdf.numPages, items };
    }
    // Tervlap: minden jel a helyével.
    const hits = [], pages = [], stamps = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      onProgress && onProgress(p, pdf.numPages);
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      pages.push({ w: vp.width, h: vp.height });
      const tc = p === 1 ? first : await page.getTextContent();
      for (const i of tc.items) {
        if (!i.str) continue;
        // Helyiségszám (például "0.040", "1.012"): ebből tudjuk, melyik helyiségben van egy jel.
        const rm = i.str.trim().match(ROOM);
        if (rm) { const [rx, ry] = vp.convertToViewportPoint(i.transform[4], i.transform[5]); stamps.push({ room: rm[1], page: p, x: rx, y: ry }); }
        CODE_G.lastIndex = 0;
        let m;
        while ((m = CODE_G.exec(i.str))) {
          const code = m[0];
          if (!PREFIX_OK.test(code)) continue;
          const L = i.str.length || 1, tw = i.width || 0;
          const fs = Math.hypot(i.transform[2], i.transform[3]) || i.height || 8;
          // A felirat lehet elforgatva (a tervlapokon a jel gyakran függőleges): a jel közepét a szöveg irányában számoljuk,
          // így a karika a jelre kerül, nem mellé. pdf.js koordináta (bal alsó sarok) -> nézet koordináta (bal felső sarok).
          const len = Math.hypot(i.transform[0], i.transform[1]) || 1, ux = i.transform[0] / len, uy = i.transform[1] / len;
          const lc = tw * (code.length / L), along = tw * (m.index / L) + lc / 2;
          const [cx, cy] = vp.convertToViewportPoint(i.transform[4] + ux * along - uy * fs * 0.4, i.transform[5] + uy * along + ux * fs * 0.4);
          const vertical = Math.abs(uy) > Math.abs(ux);
          const w = vertical ? fs * 1.2 : Math.max(lc, fs * 2), hh = vertical ? Math.max(lc, fs * 2) : fs * 1.2;
          hits.push({ code, page: p, x: cx - w / 2, y: cy - hh / 2, w, h: hh, fs });
        }
      }
    }
    const uniq = hits.filter((h, i) => !hits.slice(0, i).some(o => o.code === h.code && o.page === h.page && Math.abs(o.x - h.x) < 3 && Math.abs(o.y - h.y) < 3));
    // A helyiséglista táblázata (egy oszlopban sok helyiségszám) nem a rajz része: kihagyjuk.
    const col = {};
    stamps.forEach(st2 => { const k = st2.page + ':' + Math.round(st2.x / 12); col[k] = (col[k] || 0) + 1; });
    const planStamps = stamps.filter(st2 => (col[st2.page + ':' + Math.round(st2.x / 12)] || 0) < 12);
    // Minden jelhez a legközelebbi helyiségszám (ha elég közel van), azonos lapon.
    uniq.forEach(h => {
      let best = null, bd = Infinity;
      for (const st2 of planStamps) {
        if (st2.page !== h.page) continue;
        const d = (st2.x - h.x) ** 2 + (st2.y - h.y) ** 2;
        if (d < bd) { bd = d; best = st2; }
      }
      const W = pages[h.page - 1].w;
      h.room = best && Math.sqrt(bd) < W * 0.12 ? best.room : '';
    });
    return { kind: 'plan', fileName: file.name, label: planLabel(file.name), pages, hits: uniq, rooms: [...new Set(planStamps.map(x => x.room))] };
  }
  function planLabel(name) {
    const n = name.replace(/\.pdf$/i, '');
    const m = n.match(/(?:R\d+\s*[-_ ]+\s*|_)([^_]*(?:ALAPRAJZ|TERV|RÉSZLET|METSZET)[^_]*)$/i);
    return (m ? m[1] : n).trim();
  }

  /* ---------- összevetés ---------- */
  function compare() {
    const sheet = st.sheet, konsz = st.konsz.flatMap(k => k.items);
    const known = new Set([...(sheet ? sheet.rows.flatMap(r => r.codes) : []), ...konsz.flatMap(k => k.codes)].map(prefixOf));
    const allowed = known.size ? known : new Set(PREFIX_DEFAULT);
    const plans = st.plans.map(p => ({ ...p, hits: p.hits.filter(h => allowed.has(prefixOf(h.code))) }));
    const roomFiles = {};
    plans.forEach(p => (p.rooms || []).forEach(r => { (roomFiles[r] = roomFiles[r] || new Set()).add(p.fileName); }));
    const sharedRooms = new Set(Object.keys(roomFiles).filter(r => roomFiles[r].size > 1));
    // Jelcsoportok: ami egy táblázatsorban vagy egy konszignációs lapon együtt szerepel, illetve a kisbetűs változatok (MO11 ~ MO11a, MO11b).
    const parent = {};
    const find = c => { while (parent[c] !== c) { parent[c] = parent[parent[c]]; c = parent[c]; } return c; };
    const add = c => { if (!(c in parent)) parent[c] = c; };
    const union = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
    const allCodes = new Set();
    (sheet ? sheet.rows : []).forEach(r => { r.codes.forEach(c => { add(c); allCodes.add(c); }); r.codes.slice(1).forEach(c => union(r.codes[0], c)); });
    konsz.forEach(k => { k.codes.forEach(c => { add(c); allCodes.add(c); }); k.codes.slice(1).forEach(c => union(k.codes[0], c)); });
    plans.forEach(p => p.hits.forEach(h => { add(h.code); allCodes.add(h.code); }));
    allCodes.forEach(c => { if (base(c) !== c && allCodes.has(base(c))) union(base(c), c); });
    // azonos alapú kisbetűs változatok egymással is (MO12a ~ MO12b), akkor is, ha az alap nem szerepel
    const byBase = {};
    allCodes.forEach(c => { if (base(c) !== c) (byBase[base(c)] = byBase[base(c)] || []).push(c); });
    Object.values(byBase).forEach(list => list.slice(1).forEach(c => union(list[0], c)));

    const groups = new Map();
    const G = c => { const r = find(c); if (!groups.has(r)) groups.set(r, { codes: new Set(), rows: [], konsz: [], hits: [] }); return groups.get(r); };
    (sheet ? sheet.rows : []).forEach(r => r.codes.length && (r.codes.forEach(c => G(c).codes.add(c)), G(r.codes[0]).rows.push(r)));
    konsz.forEach(k => { k.codes.forEach(c => G(c).codes.add(c)); G(k.codes[0]).konsz.push(k); });
    plans.forEach(p => p.hits.forEach(h => { G(h.code).codes.add(h.code); G(h.code).hits.push({ ...h, fileName: p.fileName, label: p.label }); }));

    const haveSheet = !!sheet, haveKonsz = konsz.length > 0, havePlans = plans.length > 0;
    const konszPrefixes = new Set(konsz.flatMap(k => k.codes.map(prefixOf)));
    const out = [];
    for (const g of groups.values()) {
      const codes = [...g.codes].sort((a, b) => a.localeCompare(b, 'hu', { numeric: true }));
      const tjQty = g.rows.length ? g.rows.reduce((s, r) => s + (r.qty || 0), 0) : null;
      const kQty = g.konsz.length && g.konsz.every(k => k.qty != null) ? g.konsz.reduce((s, k) => s + k.qty, 0) : null;
      // Átfedő részletrajzok: ha egy helyiség több tervlapon is ki van rajzolva, abban a helyiségben
      // a jelet csak egyszer számoljuk (amelyik lapon több van). A nyers darabszám is megmarad.
      const perRoomFile = {};
      g.hits.forEach(h => { if (!h.room || !sharedRooms.has(h.room)) return; const k = h.room; (perRoomFile[k] = perRoomFile[k] || {})[h.fileName] = (perRoomFile[k][h.fileName] || 0) + 1; });
      const overlapExtra = Object.values(perRoomFile).reduce((sum, byFile) => { const v = Object.values(byFile); return sum + v.reduce((a, b) => a + b, 0) - Math.max(...v); }, 0);
      const rawCount = g.hits.length, pCount = rawCount - overlapExtra;
      const perPlan = {}, perRoom = {};
      g.hits.forEach(h => { perPlan[h.label] = (perPlan[h.label] || 0) + 1; if (h.room) perRoom[h.room] = (perRoom[h.room] || 0) + 1; });
      const name = (g.konsz[0] && g.konsz[0].name) || (g.rows[0] && g.rows[0].text.replace(/\s+/g, ' ').slice(0, 70)) || '';
      const f = [];
      const inSheet = g.rows.length > 0, inKonsz = g.konsz.length > 0, onPlan = pCount > 0;
      const unit = (g.rows[0] && g.rows[0].unit) || (g.konsz[0] && g.konsz[0].unit) || 'db';
      const countable = /^(db|szett|pár)$/i.test(unit);
      if (haveSheet && !inSheet) f.push({ t: 'Nincs a küldött listában', d: (inKonsz ? `A konszignációban szerepel (${kQty != null ? fmt(kQty) + ' ' + unit : 'mennyiség nélkül'})${onPlan ? `, a rajzon ${pCount} helyen` : ''}, a tételjegyzékben nincs sora.` : `A rajzon ${pCount} helyen szerepel, de sem a tételjegyzékben, sem a konszignációban nincs.`) + ' Valószínűleg szándékosan: a generálkivitelező a listát az ajánlattevőre szabta, és ezt más alvállalkozó szállítja. Érdemes megerősíttetni, hogy nem az Önök része; ha mégis, most kimaradna az árból.', p: 50 });
      if (haveKonsz && !inKonsz && (inSheet || onPlan)) {
        const other = !konszPrefixes.has(prefixOf(codes[0]));
        f.push({ t: 'Nincs konszignációs lapja', d: other ? `Ehhez a jelcsoporthoz (${prefixOf(codes[0])}) nem érkezett konszignáció. A műszaki tartalmat másik tervlapról kell venni${onPlan ? ' (a jel a rajzon megtalálható)' : ''}.` : 'A konszignációban nincs ilyen jelű lap, így a méret és az anyag nem ellenőrizhető.', p: other ? 45 : 80 });
      }
      if (havePlans && !onPlan && (inSheet || inKonsz)) f.push({ t: 'Nem található a tervlapokon', d: 'A jel egyik feltöltött tervlapon sem szerepel. Lehet, hogy egy fel nem töltött tervlapon van, vagy a rajzon más jelöléssel.', p: 50 });
      if (tjQty != null && kQty != null && Math.abs(tjQty - kQty) > 1e-6) f.push({ t: 'Eltérő mennyiség', d: `Tételjegyzék: ${fmt(tjQty)} ${unit}, konszignáció: ${fmt(kQty)} ${unit}.`, p: 90 });
      if (onPlan && countable) {
        const ref = kQty != null ? kQty : tjQty, src = kQty != null ? 'konszignáció' : 'tételjegyzék';
        // Ha a rajzi darabszám valamelyik dokumentummal egyezik, a két dokumentum eltérését az "Eltérő mennyiség" már jelzi.
        if (ref != null && pCount !== ref && pCount !== tjQty && pCount !== kQty) {
          const sheets = Object.keys(perPlan).length;
          // A rajzi jelek száma nem mindig darabszám: egy jel jelölhet egy egész sort (például öltözőszekrény-sor),
          // és két részletrajz átfedheti egymást. Ezért a valószínűség attól függ, melyik eset valószínű.
          if (pCount < ref * 0.5) f.push({ t: 'A rajzon kevesebb jel', d: `A tervlapokon ${pCount} helyen szerepel a jel, a ${src} ${fmt(ref)} ${unit}-ot ír. Valószínűleg egy jel több darabot jelöl (például egy szekrénysort); érdemes a rajzon ellenőrizni.`, p: 35 });
          else if (pCount > ref && sheets > 1 && !overlapExtra) f.push({ t: 'A rajzon más a darabszám', d: `A tervlapokon ${pCount} helyen szerepel a jel (${Object.entries(perPlan).map(([k, v]) => k + ': ' + v).join(', ')}), a ${src} ${fmt(ref)} ${unit}-ot ír. A jel több részletrajzon is szerepel; ha a részletek átfedik egymást, ugyanaz a darab kétszer számolódik.`, p: 45 });
          else f.push({ t: 'A rajzon más a darabszám', d: `A tervlapokon ${pCount} helyen szerepel a jel${overlapExtra ? ` (az átfedő részletrajzokon kétszer szereplő ${overlapExtra} jelet egyszer számolva)` : ''}, a ${src} ${fmt(ref)} ${unit}-ot ír.`, p: Math.abs(pCount - ref) >= 2 ? 65 : 55 });
        }
      }
      // Méretek: konszignáció vs tételjegyzék (műszaki tartalom + tételszöveg)
      const kd = g.konsz.flatMap(k => k.dims.map(d => ({ ...d, page: k.page, fileName: k.fileName })));
      // Bútorméret: legalább egyik mérete 30 cm feletti (a fogantyú, mosogatótálca stb. kimarad).
      const big = d => d.v.length === 3 && Math.max(...d.v) >= 30;
      const td = g.rows.flatMap(r => { const a = dimsOf(r.text).filter(big); return a.length ? a : dimsOf(r.spec).filter(big); });
      const kFull = kd.filter(d => !d.max && big(d)), tFull = td;
      if (kFull.length && tFull.length) {
        const srt = a => [...a].sort((x, y) => x - y);
        const same = (a, b) => srt(a).every((x, i) => Math.abs(x - srt(b)[i]) <= Math.max(1, 0.03 * x));
        if (!kFull.some(k => tFull.some(t => same(k.v, t.v)))) {
          // Több részből álló tétel (asztal + szék + konténer): a párosítás bizonytalanabb.
          const multi = kd.length > 1 || tFull.length > 1;
          f.push({ t: 'Eltérő méret', d: `Konszignáció: ${kFull.map(d => d.raw).join('; ')}. Tételjegyzék: ${tFull.map(d => d.raw).join('; ')}.${multi ? ' A tétel több részből áll; ellenőrizze, melyik méret melyik darabé.' : ''}`, p: multi ? 55 : 80 });
        }
      }
      const kMax = kd.filter(d => d.max && d.v.length === 2);
      if (kMax.length && tFull.length) {
        const lim = [...kMax[0].v].sort((a, b) => a - b);
        const plan = [...tFull[0].v].sort((a, b) => a - b).slice(0, 2); // a két kisebb méret az alapterület
        // A szöveg magyarázza is: a termék két kisebb mérete az alapterület, így akárhogy állítják, az egyik oldala nagyobb a megengedettnél.
        const over = plan[1] > lim[1] + 0.5 ? [plan[1], lim[1]] : [plan[0], lim[0]];
        if (plan[0] > lim[0] + 0.5 || plan[1] > lim[1] + 0.5) f.push({ t: 'Nem fér el a megadott helyen', d: `A konszignáció legfeljebb ${kMax[0].raw} alapterületet enged. A tételjegyzék szerinti termék ${tFull[0].raw}: a két kisebb mérete ${fmt(plan[0])} × ${fmt(plan[1])} cm, tehát akárhogy állítják, az egyik oldala ${fmt(over[0])} cm, a megengedett ${fmt(over[1])} cm helyett.`, p: 90 });
      }
      // Gyanús érték magában a konszignációban: ülőmunkához való asztal 90 cm-nél magasabb.
      for (const k of g.konsz) {
        const hm = k.text.match(/asztal\s+magass(á|a)ga\s*:\s*(\d+(?:[.,]\d+)?)\s*(cm|mm)/i);
        const h = hm ? parseFloat(hm[2].replace(',', '.')) * (hm[3].toLowerCase() === 'mm' ? 0.1 : 1) : null;
        if (h && h >= 90 && !/álló|pult|munkapad|bárasztal|magasított/i.test(k.name + ' ' + k.text)) f.push({ t: 'Gyanús érték a konszignációban', d: `${k.name || 'Az asztal'}: a konszignáció ${fmt(h)} cm asztalmagasságot ír. Ülő munkához a szokásos 72–76 cm; valószínűleg elírás, érdemes rákérdezni.`, p: 70 });
      }
      g.rows.forEach(r => r.issues.forEach(i => f.push({ ...i, row: r.row })));
      f.sort((a, b) => b.p - a.p);
      out.push({ codes, name, tjQty, kQty, pCount, rawCount, overlapExtra, perPlan, perRoom, unit, rows: g.rows, konsz: g.konsz, hits: g.hits, findings: f, p: f.length ? f[0].p : 0 });
    }
    // A legbiztosabb eltérések elöl (a valódi mennyiségi és méreteltérések), utána a kérdések, a végén az egyezők.
    out.sort((a, b) => (b.findings.length > 0) - (a.findings.length > 0) || b.p - a.p || a.codes[0].localeCompare(b.codes[0], 'hu', { numeric: true }));
    // Sorok jel nélkül (nem párosíthatók): külön lista.
    const noCode = sheet ? sheet.rows.filter(r => !r.codes.length) : [];
    return { groups: out, noCode, sheetIssues: sheet ? sheet.issues : [], at: Date.now() };
  }

  /* ---------- fájlok ---------- */
  async function addFiles(files) {
    st.error = '';
    for (const f of files) {
      try {
        if (/\.(xlsx?|xlsm)$/i.test(f.name)) { st.reading = 'Táblázat: ' + f.name; App.render(); st.sheet = readSheet(await f.arrayBuffer(), f.name); }
        else if (/\.pdf$/i.test(f.name)) {
          st.reading = 'Olvasás: ' + f.name; App.render();
          const r = await readPdf(f, (p, n) => { if (n > 1) { st.reading = `Olvasás: ${f.name} (${p} / ${n} oldal)`; App.render(); } });
          if (r.kind === 'konsz') st.konsz = st.konsz.filter(x => x.fileName !== r.fileName).concat(r);
          else if (r.hits.length) st.plans = st.plans.filter(x => x.fileName !== r.fileName).concat(r);
          else st.error = `${f.name}: nem találtam benne alaprajzi jelet. Ha szkennelt terv, azt ez a változat még nem olvassa.`;
        }
      } catch (e) { st.error = f.name + ': ' + e.message; }
    }
    st.reading = '';
    warm();
    st.result = (st.sheet || st.konsz.length) && (st.konsz.length || st.plans.length) ? compare() : null;
    App.render();
  }
  function remove(name) {
    if (st.sheet && st.sheet.fileName === name) st.sheet = null;
    st.konsz = st.konsz.filter(x => x.fileName !== name);
    st.plans = st.plans.filter(x => x.fileName !== name);
    delete pdfDocs[name];
    st.result = (st.sheet || st.konsz.length) && (st.konsz.length || st.plans.length) ? compare() : null;
    App.render();
  }
  // A tervlapokat betöltés után a háttérben egyszer megrajzolja (képként eltárolva). Utána a „Rajzon” nézet
  // és az Ellenőrzés panel kivágásai azonnal megjelennek, nem kell minden kattintásnál újrarajzolni.
  const pageCache = {};
  const zoomBase = w => Math.min(1, 6000 / w) * (w < 2000 ? 2.2 : 1);
  const CACHE_Z = 0.6;
  let warming = false;
  async function warm() {
    if (warming) return; warming = true;
    try {
      for (const p of st.plans) {
        const pdf = pdfDocs[p.fileName]; if (!pdf) continue;
        for (let n = 1; n <= pdf.numPages; n++) {
          const key = p.fileName + '|' + n;
          if (pageCache[key]) continue;
          const page = await pdf.getPage(n);
          const w1 = page.getViewport({ scale: 1 }).width, scale = CACHE_Z * zoomBase(w1);
          const vp = page.getViewport({ scale });
          const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          try { await page.render({ canvasContext: c.getContext('2d'), viewport: vp, intent: 'print' }).promise; pageCache[key] = { canvas: c, scale }; } catch (e) { /* nem baj: kattintáskor élőben rajzol */ }
          fillCrops();
        }
      }
    } finally { warming = false; }
  }
  // Az Ellenőrzés panel rajzi kivágásai: a jel környéke a tervlapról, bekarikázva.
  function fillCrops() {
    document.querySelectorAll('canvas[data-crop]').forEach(cv => {
      if (cv.dataset.done) return;
      const [gi, hi] = cv.dataset.crop.split('|').map(Number);
      const g = st.result && st.result.groups[gi], h = g && g.hits[hi];
      const ctx = cv.getContext('2d');
      if (!h) return;
      const cache = pageCache[h.fileName + '|' + h.page];
      const key = cropKey(h);
      cv.dataset.ck = key;
      if (sharp[key]) { ctx.drawImage(sharp[key], 0, 0, cv.width, cv.height); cv.dataset.done = '1'; return; }
      // Az éles kivágás nem vár a teljes lap gyorsítótárára.
      const wantSharp = hi < SHARP_MAX;
      if (!cache) { ctx.fillStyle = '#f3f4f6'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.fillStyle = '#6b7280'; ctx.font = '22px sans-serif'; ctx.fillText('rajzolás…', 18, 38); if (wantSharp) sharpCrop(h, cv.width, cv.height); return; }
      // Előbb a gyorsítótárból (azonnal, de elmosódott), aztán a sorban kirajzolt éles változat váltja.
      const z = cache.scale, cx = (h.x + h.w / 2) * z, cy = (h.y + h.h / 2) * z;
      const sw = 220, sh = 147;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(cache.canvas, cx - sw / 2, cy - sh / 2, sw, sh, 0, 0, cv.width, cv.height);
      cv.dataset.done = '1';
      if (wantSharp) sharpCrop(h, cv.width, cv.height);
    });
  }
  // Éles kivágás: a jel környéke külön, nagy felbontással kirajzolva. A gyorsítótárban tárolt lap ehhez kicsi
  // (egy nagy tervlapon a jel felirata ott csak 2-3 képpont), ezért a karika alatt nem lehetett elolvasni a jelet.
  // Egy éles kivágás egy nagy tervlapon kb. 4-5 másodperc (a pdf.js a teljes rajzot végigolvassa hozzá), ezért kártyánként
  // csak az első néhány élesedik, a többi gyors előnézet marad (kattintásra a teljes tervlap nyílik). A legutóbb kért van elöl.
  const SHARP_MAX = 4;
  const sharp = {}, jobs = [];
  let working = false;
  const cropKey = h => `${h.fileName}|${h.page}|${Math.round(h.x)}|${Math.round(h.y)}`;
  function sharpCrop(h, W, H) {
    const key = cropKey(h);
    if (sharp[key] || jobs.some(j => j.key === key)) return;
    jobs.push({ key, h, W, H });
    if (!working) runJobs();
  }
  async function runJobs() {
    working = true;
    try {
      while (jobs.length) {
        const { key, h, W, H } = jobs.pop();
        if (sharp[key] || !document.querySelector(`canvas[data-ck="${CSS.escape(key)}"]`)) continue;
        const pdf = pdfDocs[h.fileName]; if (!pdf) continue;
        try {
          const page = await pdf.getPage(h.page);
          const fs = h.fs || (h.h / 1.2) || 8;
          const scale = Math.max(1.5, Math.min(8, 20 / fs)); // a jel felirata kb. 20 képpont magas legyen
          const cx = (h.x + h.w / 2) * scale, cy = (h.y + h.h / 2) * scale;
          const vp = page.getViewport({ scale, offsetX: W / 2 - cx, offsetY: H / 2 - cy });
          const c = document.createElement('canvas'); c.width = W; c.height = H;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
          await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
          ctx.strokeStyle = '#d62828'; ctx.lineWidth = 3; ctx.beginPath();
          ctx.arc(W / 2, H / 2, Math.max(22, Math.max(h.w, h.h) * scale * 0.7 + 10), 0, Math.PI * 2); ctx.stroke();
          sharp[key] = c;
          document.querySelectorAll(`canvas[data-ck="${CSS.escape(key)}"]`).forEach(x => x.getContext('2d').drawImage(c, 0, 0, x.width, x.height));
        } catch (e) { /* marad a gyors előnézet */ }
      }
    } finally { working = false; }
  }
  // A tételjegyzék jelhez nem köthető hibái egy listában (kihagyott sorszám, jel nélküli sor). Jóváhagyhatók, mint a többi felvetés.
  function sheetFindings() {
    const R = st.result; if (!R) return [];
    return [...R.sheetIssues.map(i => ({ row: i.row, t: i.t, d: i.d, p: i.p, text: '' })),
      ...R.noCode.flatMap(r => r.issues.map(i => ({ row: r.row, t: i.t, d: i.d, p: i.p, text: r.text.replace(/\s+/g, ' ').slice(0, 90) })))]
      .map(x => ({ ...x, key: 's:' + x.row + '|' + x.t }));
  }
  const ready = () => !!st.result;
  const reset = () => { st = fresh(); };

  /* ---------- nézet ---------- */
  const PB = p => (p >= 80 ? 'pb-hi' : p >= 50 ? 'pb-mid' : 'pb-lo');
  const cellQty = (v, unit, miss) => (v == null ? `<span class="${miss ? 'neg-t' : 'muted'}">${miss ? 'nincs' : '–'}</span>` : `${fmt(v)} <span class="muted">${esc(unit)}</span>`);
  function filesHtml() {
    const li = (name, sub) => `<div class="eg-file"><b>${esc(name)}</b> <span class="muted small">${sub}</span> <button class="rm" data-eg-remove="${esc(name)}">Eltávolítás</button></div>`;
    let h = '';
    if (st.sheet) h += li(st.sheet.fileName, `tételjegyzék · ${st.sheet.rows.length} tétel`);
    st.konsz.forEach(k => { h += li(k.fileName, `konszignáció · ${k.items.length} lap`); });
    st.plans.forEach(p => { h += li(p.fileName, `tervlap · ${p.hits.length} jel`); });
    return h;
  }
  // A Feltöltés oldal harmadik mezője.
  function dropHtml() {
    const has = st.sheet || st.konsz.length || st.plans.length;
    return `<label class="drop wide ${has ? 'has' : ''}" data-kind="egyezes"><input type="file" accept=".pdf,.xls,.xlsx" multiple hidden>
      <div class="drop-t">3. Konszignáció és tervlapok (PDF) <span class="muted" style="font-weight:400">· generálkivitelezői munkánál</span></div>
      <div class="drop-h">A konszignáció (bútor- és asztalos lapok) és az alaprajzok. A program alaprajzi jel szerint összeveti a rajzot, a konszignációt és a tételjegyzéket, és kigyűjti az eltéréseket. Több fájl is húzható egyszerre; a tételjegyzék is ide tehető.</div>
      <div class="drop-f">${has ? filesHtml() : 'Húzza ide, vagy kattintson (.pdf, .xlsx), több fájl is lehet'}</div>
      ${st.reading ? `<div class="drop-s"><span class="spin"></span> ${esc(st.reading)}</div>` : ''}
      ${st.error ? `<div class="drop-i">${esc(st.error)}</div>` : ''}</label>
      ${st.result ? `<div class="eg-go"><button class="btn btn-primary" data-tab="egyezes">Egyezés megnyitása: ${st.result.groups.filter(g => g.findings.length).length} jelnél eltérés →</button></div>` : ''}`;
  }

  // A tételjegyzék saját hibái: rövid magyarázat típusonként (mit jelent, és miért kell vele foglalkozni).
  const SHEET_WHY = {
    'Kihagyott sorszámok': 'A sorszámozásban lyuk van: valószínűleg sorokat töröltek a táblázatból. Ha a törölt sor egy tétel volt, az nem kerül bele az árba.',
    'Nincs alaprajzi jel': 'A tételhez nincs alaprajzi jel, ezért a program nem tudja párosítani a konszignációval és a rajzzal. A méretét és darabszámát kézzel kell ellenőrizni.',
    'Rejtett sor': 'Ezek a sorok el vannak rejtve az Excelben: megnyitáskor és nyomtatásban nem látszanak, csak az elrejtés megszüntetésével. Ezért könnyű kihagyni őket az árból. Lehet szándékos (nem része a munkának), lehet véletlen: egy kérdésben érdemes tisztázni, hogy árazandók-e.',
    'Hibás sorszám': 'A sorszám cellája hibás hivatkozás (#REF!): sorokat töröltek vagy másoltak, a sorszámozás nem megbízható.',
    'Hiányzó adat': 'A sor szövege szerint nincs pontos adat. Árazás előtt tisztázni kell.',
    'Nincs mennyiség': 'A mennyiség cellája üres vagy nem szám, ezért a tétel nem árazható.'
  };
  const bandLabel = d => (d >= 90 ? 'szinte biztos eltérés' : d >= 80 ? 'nagyon valószínű' : d >= 70 ? 'valószínű' : d >= 60 ? 'érdemes megnézni' : d >= 50 ? 'ellenőrizendő' : d >= 40 ? 'kevésbé valószínű' : 'valószínűleg nem hiba, de jelezzük');
  const bandHead = d => (d >= 90 ? '90–100%' : d >= 40 ? `${d}–${d + 9}%` : '40% alatt');
  const dOf = p => Math.max(30, Math.floor(p / 10) * 10);
  const fKey = (g, f) => 'e:' + g.codes.join(',') + '|' + f.t;
  // Az ismétlődő, sablonos eltérések (például 22 tétel „Nincs a küldött listában”) egy kártyán, táblázatban: a közös magyarázat egyszer áll.
  const GROUP_WHY = {
    'Nincs a küldött listában': 'A rajzon vagy a konszignációban szerepelnek, de a tételjegyzékben nincs soruk. Valószínűleg szándékosan: a generálkivitelező a listát az Önök részére szabta, ezeket más alvállalkozó szállítja. Érdemes egy kérdésben megerősíttetni: ha mégis az Önöké, most kimaradnának az árból.',
    'Nem található a tervlapokon': 'A tételjegyzékben vagy a konszignációban szerepelnek, de egyik feltöltött tervlapon sem. Lehet, hogy egy fel nem töltött tervlapon vannak, vagy a rajzon más jelöléssel.',
    'Nincs konszignációs lapja': 'Ezekhez a tételekhez nem érkezett konszignációs lap, így a méret és az anyag a konszignációból nem ellenőrizhető.'
  };
  const GROUP_MIN = 3;
  // A rajz, a konszignáció és a tételjegyzék darabszáma egymás mellett: egy pillantással látszik, hol tér el.
  function factsHtml(g, planCols) {
    const vals = [g.pCount || null, g.kQty, g.tjQty].filter(v => v != null);
    const differs = vals.length > 1 && new Set(vals.map(v => Math.round(v * 100))).size > 1;
    const chip = (label, v, absent, u) => `<span class="egc-fact${v == null ? ' none' : differs ? ' diff' : ''}"><i>${label}</i><b>${v == null ? (absent ? 'nincs' : '–') : fmt(v) + ' ' + esc(u || g.unit)}</b></span>`;
    return `<div class="egc-facts">${planCols ? chip('Rajzon', g.pCount || null, true, 'hely') : ''}${chip('Konszignáció', g.kQty, st.konsz.length && !g.konsz.length)}${chip('Tételjegyzék', g.tjQty, st.sheet && !g.rows.length)}</div>`;
  }
  const srcBtn = (ok, isOpen) => `<button class="btn btn-sm ${isOpen ? 'btn-primary' : ''}" data-eg-check="${esc(ok)}">${isOpen ? 'Források elrejtése ▴' : 'Források ▾'}</button>`;
  function cardHtml(x, planCols) {
    const { g, gi, f } = x, key = fKey(g, f), ok = gi + ':' + f.t, isOpen = !!st.open[ok];
    // Ha ennél a jelnél más eltérés is van, az a saját százalékával máshol áll a listában: itt csak utalunk rá.
    const others = g.findings.filter(o => o !== f);
    return `<div class="egc ${PB(f.p)}${App.rvCls ? App.rvCls(key) : ''}">
      <div class="egc-h"><span class="pbadge ${PB(f.p)}">${f.p}%</span><b class="egc-t">${esc(f.t)}</b>${App.rvBtns ? App.rvBtns(key) : ''}</div>
      <div class="egc-who"><span class="egc-code">${g.codes.map(esc).join(', ')}</span>${g.name ? `<span class="muted"> · ${esc(g.name)}</span>` : ''}</div>
      <p class="egc-d">${esc(f.d)}</p>
      ${factsHtml(g, planCols)}
      <div class="egc-act">${srcBtn(ok, isOpen)}${others.length ? `<span class="muted small">Ennél a jelnél még: ${others.map(o => `${esc(o.t)} (${o.p}%)`).join(', ')}</span>` : ''}</div>
      ${isOpen ? `<div class="egc-detail">${detailHtml(g, gi)}</div>` : ''}</div>`;
  }
  function groupCardHtml(u, planCols) {
    const t = u.t, p = u.p, keys = u.xs.map(x => fKey(x.g, x.f));
    const nOk = keys.filter(k => App.state.review[k] === 'ok').length, nNo = keys.filter(k => App.state.review[k] === 'no').length;
    const cols = 4 + (planCols ? 1 : 0) + 2;
    const rows = u.xs.map(x => {
      const { g, gi, f } = x, key = fKey(g, f), ok = gi + ':' + f.t, isOpen = !!st.open[ok];
      return `<tr class="${App.rvCls ? App.rvCls(key).trim() : ''}"><td class="code">${g.codes.map(esc).join(', ')}</td><td>${esc(g.name)}</td>
        ${planCols ? `<td class="num">${g.pCount ? g.pCount + ' <span class="muted">hely</span>' : '<span class="muted">–</span>'}</td>` : ''}
        <td class="num">${cellQty(g.kQty, g.unit, st.konsz.length && !g.konsz.length)}</td><td class="num">${cellQty(g.tjQty, g.unit, st.sheet && !g.rows.length)}</td>
        <td class="nowrap">${srcBtn(ok, isOpen)}</td><td class="nowrap">${App.rvBtns ? App.rvBtns(key) : ''}</td></tr>
        ${isOpen ? `<tr class="eg-detail"><td colspan="${cols}">${detailHtml(g, gi)}</td></tr>` : ''}`;
    }).join('');
    return `<div class="egc egc-grp ${PB(p)}">
      <div class="egc-h"><span class="pbadge ${PB(p)}">${p}%</span><b class="egc-t">${esc(t)}: ${u.xs.length} tétel</b>
        <span class="rv"><button class="rv-b ok" data-eg-rvall="ok" data-keys="${esc(keys.join('§'))}">✓ Mind jóváhagyom</button><button class="rv-b no" data-eg-rvall="no" data-keys="${esc(keys.join('§'))}">✗ Egyik sem hiba</button></span></div>
      <p class="egc-d">${esc(GROUP_WHY[t] || SHEET_WHY[t] || u.xs[0].f.d)}</p>
      ${nOk || nNo ? `<p class="muted small" style="margin:-4px 0 8px">${nOk} jóváhagyva, ${nNo} nem hiba, ${keys.length - nOk - nNo} még nincs eldöntve.</p>` : ''}
      <div class="tbl-wrap"><table class="compact eg-t"><thead><tr><th>Jel</th><th>Megnevezés</th>${planCols ? '<th class="num">Rajzon</th>' : ''}<th class="num">Konszignáció</th><th class="num">Tételjegyzék</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  function view() {
    const el = $('#view-egyezes');
    if (!st.result) { el.innerHTML = `<div class="card"><div class="card-b empty">Töltse fel a Feltöltés oldalon a konszignációt és a tervlapokat (és a tételjegyzéket). Az összevetés néhány másodperc alatt elkészül.</div></div>`; return; }
    const R = st.result, gs = R.groups;
    const withF = gs.filter(g => g.findings.length), okG = gs.filter(g => !g.findings.length);
    const cnt = t => gs.filter(g => g.findings.some(f => f.t === t)).length;
    const src = [st.sheet ? 'tételjegyzék' : '', st.konsz.length ? 'konszignáció' : '', st.plans.length ? st.plans.length + ' tervlap' : ''].filter(Boolean).join(', ');
    const sf = sheetFindings();
    const planCols = st.plans.length;
    let h = `<div class="view-head"><div><h2>Egyezés: rajz, konszignáció, tételjegyzék</h2><p>${gs.length} alaprajzi jelet vetettünk össze (${esc(src)}). A darabszámokat a program a fájlokból számolja, nem becsli.</p></div>
      <div><button class="btn btn-primary" id="eg-xlsx">Eltérések letöltése (Excel)</button></div></div>`;
    h += `<div class="kpis">
      <div class="kpi"><div class="l">Összevetett jel</div><div class="v">${gs.length}</div><div class="s">${okG.length} egyezik, ${withF.length} jelnél van eltérés</div></div>
      <div class="kpi"><div class="l">Nincs a küldött listában</div><div class="v">${cnt('Nincs a küldött listában')}</div><div class="s">kié? valószínűleg más alvállalkozóé</div></div>
      <div class="kpi warn"><div class="l">Eltérő mennyiség vagy méret</div><div class="v">${gs.filter(g => g.findings.some(f => /mennyiség|méret|darabszám|fér el/.test(f.t))).length}</div><div class="s">tételjegyzék, konszignáció, rajz</div></div>
      <div class="kpi"><div class="l">Hibák az Excelben</div><div class="v">${sf.length + gs.reduce((s, g) => s + g.rows.reduce((a, r) => a + r.issues.length, 0), 0)}</div><div class="s">rejtett sor, hibás cella, hiányzó adat</div></div></div>`;
    // Egy lista, valószínűség szerint csökkenően, tízesével fejléccel. Az azonos sablonos eltérések egy kártyán.
    const flat = gs.flatMap((g, gi) => g.findings.map(f => ({ g, gi, f })));
    const units = [];
    const byTP = {};
    flat.forEach(x => { const k = x.f.t + '|' + x.f.p; (byTP[k] = byTP[k] || []).push(x); });
    Object.values(byTP).forEach(xs => {
      const byCode = (a, b) => a.g.codes[0].localeCompare(b.g.codes[0], 'hu', { numeric: true });
      // Csak a sablonos szövegűek kerülnek egy kártyára; ahol a leírás tételenként mást mond (méret, darabszám), ott külön kártya marad.
      if (xs.length >= GROUP_MIN && (GROUP_WHY[xs[0].f.t] || SHEET_WHY[xs[0].f.t])) units.push({ grp: true, t: xs[0].f.t, p: xs[0].f.p, xs: xs.sort(byCode), code: xs[0].g.codes[0] });
      else xs.forEach(x => units.push({ grp: false, p: x.f.p, x, code: x.g.codes[0] }));
    });
    // Azonos százaléknál a csoportos kártya a végére kerül: elöl az egyedi, konkrét eltérések.
    units.sort((a, b) => b.p - a.p || (a.grp - b.grp) || a.code.localeCompare(b.code, 'hu', { numeric: true }));
    h += `<p class="eg-how">Felül a legvalószínűbb eltérések, lefelé csökkenő sorrendben. A „Források” gomb egymás mellett mutatja a táblázat sorát, a konszignációs lapot és a rajzot.</p>`;
    let lastD = null;
    units.forEach(u => {
      const d = dOf(u.p);
      if (d !== lastD) {
        lastD = d;
        const n = units.filter(v => dOf(v.p) === d).reduce((s, v) => s + (v.grp ? v.xs.length : 1), 0);
        h += `<h4 class="sec eg-band ${PB(d)}"><span>${bandHead(d)}</span> ${bandLabel(d)} <span class="muted" style="font-weight:400">(${n})</span></h4>`;
      }
      h += u.grp ? groupCardHtml(u, planCols) : cardHtml(u.x, planCols);
    });
    if (!flat.length) h += `<div class="card"><div class="card-b muted">Nincs eltérés: a rajz, a konszignáció és a tételjegyzék egyezik.</div></div>`;
    // Az egyező jelek: összecsukva, hogy az eltérések legyenek elöl. A nyitott állapot megmarad a következő rajzoláskor is.
    h += `<details class="eg-ok-d" data-keep="okg" ${st.keep && st.keep.okg ? 'open' : ''}><summary>Egyező jelek: ${okG.length}</summary><div class="card"><div class="tbl-wrap"><table class="compact eg-t"><thead><tr><th>Jel</th><th>Megnevezés</th>${planCols ? '<th class="num">Rajzon</th>' : ''}<th class="num">Konszignáció</th><th class="num">Tételjegyzék</th></tr></thead><tbody>
      ${okG.map(g => `<tr class="eg-ok"><td class="code">${g.codes.map(esc).join(', ')}</td><td>${esc(g.name)}</td>${planCols ? `<td class="num">${g.pCount ? g.pCount + ' <span class="muted">hely</span>' : '–'}</td>` : ''}<td class="num">${cellQty(g.kQty, g.unit, false)}</td><td class="num">${cellQty(g.tjQty, g.unit, false)}</td></tr>`).join('') || `<tr><td colspan="5" class="muted">Nincs egyező jel.</td></tr>`}
      </tbody></table></div></div></details>`;
    if (sf.length) {
      const byT = {};
      sf.forEach(x => (byT[x.t] = byT[x.t] || []).push(x));
      h += `<h4 class="sec">Hibák magában az Excel-táblázatban (${sf.length})</h4>
        <p class="eg-how">Ezek nem a rajzzal való eltérések, hanem a küldött táblázat saját hibái. <b>Nem szabad figyelmen kívül hagyni őket:</b> egy törölt vagy elrejtett sor azt jelentheti, hogy egy tétel kimarad az árból. Itt azok a hibák állnak, amelyek nem köthetők alaprajzi jelhez; a jelhez köthető hibák (rejtett sor, hibás sorszám, hiányzó adat) a fenti listában a saját jelüknél szerepelnek.</p>`;
      Object.keys(byT).sort((a, b) => Math.max(...byT[b].map(x => x.p)) - Math.max(...byT[a].map(x => x.p))).forEach(t => {
        const list = byT[t].sort((a, b) => b.p - a.p || a.row - b.row);
        h += `<div class="card eg-sh"><div class="card-h"><h3>${esc(t)}</h3><span class="muted small">${list.length} előfordulás</span></div>
          <div class="card-b"><p class="muted" style="margin:0 0 8px">${esc(SHEET_WHY[t] || 'A táblázat ezen sora formailag hibás vagy hiányos.')}</p>
          ${list.map(x => `<div class="eg-shr${App.rvCls ? App.rvCls(x.key) : ''}"><div><span class="pbadge ${PB(x.p)}">${x.p}%</span> <span class="muted nowrap">${x.row}. sor</span>${x.text ? ` · <b>${esc(x.text)}</b>` : ''}<div class="muted small">${esc(x.d)}</div></div>
            <div class="eg-shb"><button class="btn btn-sm" data-eg-sheet="${x.row}">Táblázat</button>${App.rvBtns ? App.rvBtns(x.key) : ''}</div></div>`).join('')}</div></div>`;
      });
    }
    el.innerHTML = h;
    fillCrops();
  }
  // Ellenőrzés: a három forrás egymás mellett, hogy egy pillantással látszódjon, tényleg mindhárom helyen ott van-e.
  function detailHtml(g, idx) {
    const tj = g.rows.length ? g.rows.map(r => `<div class="eg-src"><div class="eg-src-h"><b>${r.row}. sor</b> · ${esc(r.codeCell || '–')} · <b>${r.qty == null ? 'nincs mennyiség' : fmt(r.qty) + ' ' + esc(r.unit)}</b>${r.hidden ? ' · <span class="neg-t">rejtett sor</span>' : ''}</div>
        <div>${esc(r.text.replace(/\s+/g, ' ').slice(0, 260))}</div>${r.spec ? `<div class="muted small">${esc(r.spec.replace(/\s+/g, ' ').slice(0, 220))}</div>` : ''}
        <button class="btn btn-sm" data-eg-sheet="${r.row}">Táblázat</button></div>`).join('') : '<div class="muted">A tételjegyzékben nincs ilyen sor.</div>';
    const ks = g.konsz.length ? g.konsz.map(k => `<div class="eg-src"><div class="eg-src-h"><b>${esc(k.fileName.replace(/\.pdf$/i, '').slice(-34))}</b> · ${k.page}. oldal · <b>${k.qty == null ? 'nincs mennyiség' : fmt(k.qty) + ' ' + esc(k.unit)}</b></div>
        <div>${esc(k.name)}</div>${k.dims.length ? `<div class="muted small">Méret: ${k.dims.map(d => esc(d.raw) + (d.max ? ' (legfeljebb)' : '')).join('; ')}</div>` : ''}${k.qtyRaw ? `<div class="muted small">${esc(k.qtyRaw)}</div>` : ''}
        <button class="btn btn-sm" data-eg-page="${esc(k.fileName)}|${k.page}">Lap</button></div>`).join('') : '<div class="muted">Nincs konszignációs lapja.</div>';
    const MAX = 18;
    const pl = g.hits.length ? `<div class="eg-crops">${g.hits.slice(0, MAX).map((h, i) => `<button class="eg-crop" data-eg-hit="${idx}|${i}" title="Megnyitás a tervlapon"><canvas data-crop="${idx}|${i}" width="396" height="264"></canvas><span>${esc(h.label.replace(/ALAPRAJZ,?\s*/i, '').trim())}${h.room ? ' · ' + esc(h.room) : ''}</span></button>`).join('')}</div>
        ${g.hits.length > MAX ? `<div class="muted small">…és még ${g.hits.length - MAX} hely</div>` : ''}${g.overlapExtra ? `<div class="muted small">${g.overlapExtra} jel két átfedő részletrajzon is szerepel; a darabszámban egyszer számolva (${g.rawCount} → ${g.pCount}).</div>` : ''}` : '<div class="muted">A feltöltött tervlapokon nem szerepel.</div>';
    return `<div class="eg-detail-g">
      <div><h5>Tételjegyzék · ${g.tjQty == null ? '–' : fmt(g.tjQty) + ' ' + esc(g.unit)}</h5>${tj}</div>
      <div><h5>Konszignáció · ${g.kQty == null ? '–' : fmt(g.kQty) + ' ' + esc(g.unit)}</h5>${ks}${g.konsz.length ? `<button class="btn btn-sm" data-eg-konsz="${idx}">A lap teljes szövege</button>` : ''}</div>
      <div><h5>Rajz · ${g.pCount || 0} hely</h5>${pl}${g.hits.length ? `<button class="btn btn-sm" data-eg-plan="${idx}" style="margin-top:6px">Összes hely megnyitása a tervlapon</button>` : ''}</div></div>`;
  }

  /* ---------- források megnyitása ---------- */
  function modal(title, body, foot, cls) {
    document.querySelectorAll('.modal').forEach(x => x.remove());
    const m = document.createElement('div');
    m.className = 'modal'; m.innerHTML = `<div class="modal-box wide ${cls || ''}"><div class="modal-h"><h3>${title}</h3><button class="btn btn-sm" data-close>Bezárás</button></div><div class="modal-b">${body}</div><div class="modal-f mf-row">${foot || ''}</div></div>`;
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) m.remove(); });
    document.body.appendChild(m);
    return m;
  }
  let sheetFile = null;
  async function openSheetRow(row) {
    if (!sheetFile) return;
    const wb = XLSX.read(await sheetFile.arrayBuffer(), { type: 'array', codepage: 1250, cellStyles: true });
    const ws = wb.Sheets[st.sheet.sheet];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true });
    const meta = ws['!rows'] || [];
    const width = Math.min(11, Math.max(...rows.map(r => r.length)));
    const body = `<div class="sv-wrap"><table class="sv"><tbody>${rows.map((r, i) => `<tr${i + 1 === Number(row) ? ' class="sv-hit" id="sv-hit"' : ''}${meta[i] && meta[i].hidden ? ' style="opacity:.55" title="Rejtett sor"' : ''}><th>${i + 1}${meta[i] && meta[i].hidden ? ' ◌' : ''}</th>${Array.from({ length: width }, (_, c) => `<td>${esc(String(r[c]).slice(0, 140))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const m = modal(`${esc(st.sheet.fileName)} · ${row}. sor`, body, '<span>Az eredeti táblázat. A ◌ jelű sorok az Excelben el vannak rejtve.</span>');
    const hit = m.querySelector('#sv-hit'); if (hit) hit.scrollIntoView({ block: 'center' });
  }
  function openKonsz(idx) {
    const g = st.result.groups[idx];
    const body = g.konsz.map(k => `<div class="eg-k"><div class="muted small">${esc(k.fileName)} · ${k.page}. oldal</div><pre class="mail-pre">${esc(k.text)}</pre>
      <button class="btn btn-sm" data-eg-page="${esc(k.fileName)}|${k.page}">Lap megtekintése</button></div>`).join('');
    modal(`Konszignáció · ${g.codes.map(esc).join(', ')}`, body, '<span>A konszignációs lap szövege, ahogy a PDF-ben áll.</span>');
  }
  // Tervlap vagy konszignációs lap kirajzolása; a jel minden előfordulása bekarikázva.
  async function openPage(fileName, pageNo, marks, title, start) {
    const pdf = pdfDocs[fileName]; if (!pdf) { alert('A fájl ebben a munkamenetben már nem érhető el. Töltse fel újra.'); return; }
    const page = await pdf.getPage(pageNo);
    const vp1 = page.getViewport({ scale: 1 });
    const zooms = [0.4, CACHE_Z, 1.1].map(z => z * zoomBase(vp1.width));
    let zi = marks && marks.length ? 1 : 0, cur = start || 0;
    const others = marks && marks.length ? `<span class="muted small" id="eg-cnt"></span> <button class="btn btn-sm" id="eg-prev">← Előző</button> <button class="btn btn-sm" id="eg-next">Következő →</button>` : '';
    const m = modal(title, `<div class="eg-zoom"><button class="btn btn-sm" data-z="-1">−</button><button class="btn btn-sm" data-z="1">+</button> ${others}</div><div class="eg-canvas-wrap" id="eg-cw"><div class="eg-stage" id="eg-stage"><canvas id="eg-cv"></canvas><svg id="eg-ov"></svg></div><div class="eg-loading" id="eg-ld"><span class="spin"></span> A tervlap rajzolása…</div></div>`,
      `<span>${esc(fileName)} · ${pageNo}. oldal${marks && marks.length ? ` · a jel ${marks.length} helyen` : ''}. Vektoros rajz, a jelek a PDF szövegéből.</span>`, 'eg-modal');
    let task = null;
    async function draw() {
      const z = zooms[zi], vp = page.getViewport({ scale: z });
      const cv = m.querySelector('#eg-cv'), ov = m.querySelector('#eg-ov'), ld = m.querySelector('#eg-ld');
      ld.hidden = false;
      focus(true);
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px';
      ov.setAttribute('width', cv.width); ov.setAttribute('height', cv.height);
      ov.innerHTML = (marks || []).map((k, i) => { const r = Math.max(k.w, k.h) * z * 0.9 + 10; return `<circle cx="${(k.x + k.w / 2) * z}" cy="${(k.y + k.h / 2) * z}" r="${r}" class="${i === cur ? 'cur' : ''}"/>`; }).join('');
      if (task) { try { task.cancel(); } catch (e) { /* már kész */ } }
      const cache = pageCache[fileName + '|' + pageNo];
      if (cache && Math.abs(cache.scale - z) < 1e-6) { cv.getContext('2d').drawImage(cache.canvas, 0, 0); ld.hidden = true; focus(true); return; }
      task = page.render({ canvasContext: cv.getContext('2d'), viewport: vp });
      try { await task.promise; } catch (e) { return; }
      ld.hidden = true;
      focus();
    }
    function focus(instant) {
      if (!marks || !marks.length) return;
      const z = zooms[zi], k = marks[cur], cw = m.querySelector('#eg-cw');
      cw.scrollTo({ left: (k.x + k.w / 2) * z - cw.clientWidth / 2, top: (k.y + k.h / 2) * z - cw.clientHeight / 2, behavior: instant ? 'auto' : 'smooth' });
      m.querySelectorAll('#eg-ov circle').forEach((c, i) => c.classList.toggle('cur', i === cur));
      const c = m.querySelector('#eg-cnt'); if (c) c.textContent = `${cur + 1} / ${marks.length}`;
    }
    m.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.z) { const n = Math.max(0, Math.min(zooms.length - 1, zi + Number(b.dataset.z))); if (n !== zi) { zi = n; draw(); } }
      else if (b.id === 'eg-next') { cur = (cur + 1) % marks.length; focus(); }
      else if (b.id === 'eg-prev') { cur = (cur - 1 + marks.length) % marks.length; focus(); }
    });
    draw();
  }
  function openPlan(idx) {
    const g = st.result.groups[idx];
    // tervlaponként; ha több lapon is van, az elsővel kezd, a többi gombbal választható
    const byFile = {};
    g.hits.forEach(h => { const k = h.fileName + '|' + h.page; (byFile[k] = byFile[k] || []).push(h); });
    const keys = Object.keys(byFile);
    const show = k => { const [f, p] = k.split('|'); openPage(f, Number(p), byFile[k], `${g.codes.map(esc).join(', ')} · ${esc(byFile[k][0].label)} · ${byFile[k].length} hely`); };
    if (keys.length === 1) return show(keys[0]);
    modal(`${g.codes.map(esc).join(', ')} · melyik tervlap?`, keys.map(k => `<p><button class="btn" data-eg-pk="${esc(k)}">${esc(byFile[k][0].label)} · ${byFile[k].length} hely</button></p>`).join(''), '');
    document.querySelector('.modal').addEventListener('click', e => { const b = e.target.closest('[data-eg-pk]'); if (b) show(b.dataset.egPk); });
  }

  /* ---------- Excel ---------- */
  function buildWb() {
    const R = st.result;
    const wb = XL.book();
    const plansOn = st.plans.length > 0;
    const head = ['Alaprajzi jel', 'Megnevezés', ...(plansOn ? ['Rajzon (hely)'] : []), 'Konszignáció', 'Tételjegyzék', 'Egység'];
    const rowOf = g => [g.codes.join(', '), g.name, ...(plansOn ? [g.pCount || ''] : []), g.kQty == null ? '' : g.kQty, g.tjQty == null ? '' : g.tjQty, g.unit];
    // Ugyanaz a sorrend, mint a képernyőn: a legvalószínűbb eltérések elöl.
    const rows = [];
    R.groups.forEach(g => g.findings.forEach(f => rows.push([...rowOf(g), f.p, f.t, f.d, f.row || (g.rows[0] ? g.rows[0].row : ''), g.konsz.map(k => k.page).join(', '), Object.entries(g.perPlan).map(([k, v]) => `${k}: ${v}`).join('; ')])));
    R.sheetIssues.forEach(i => rows.push(['', '', ...(plansOn ? [''] : []), '', '', '', i.p, i.t, i.d, i.row, '', '']));
    R.noCode.forEach(r => r.issues.forEach(i => rows.push(['', r.text.replace(/\s+/g, ' ').slice(0, 90), ...(plansOn ? [''] : []), '', r.qty == null ? '' : r.qty, r.unit, i.p, i.t, i.d, r.row, '', ''])));
    const pAt = head.length;
    rows.sort((a, b) => b[pAt] - a[pAt]);
    const e = [[...head, 'Valószínűség (%)', 'Eltérés', 'Részletek', 'Táblázat sora', 'Konszignáció oldala', 'Tervlapok'], ...rows];
    XL.add(wb, XL.sheet(e, [14, 34, ...(plansOn ? [11] : []), 13, 13, 8, 12, 28, 80, 10, 12, 40], { filter: true }), 'Eltérések');
    const all = [[...head, 'Állapot', 'Tervlaponként']];
    R.groups.forEach(g => all.push([...rowOf(g), g.findings.length ? g.findings.map(f => f.t).join('; ') : 'Egyezik', Object.entries(g.perPlan).map(([k, v]) => `${k}: ${v}`).join('; ')]));
    XL.add(wb, XL.sheet(all, [14, 34, ...(plansOn ? [11] : []), 13, 13, 8, 50, 50], { filter: true }), 'Összes jel');
    return wb;
  }
  function exportXlsx() {
    if (!st.result) return;
    const name = (st.sheet ? st.sheet.fileName.replace(/\.[^.]+$/, '') : 'egyezes').slice(0, 60);
    XL.save(buildWb(), `Eltérések - ${name}.xlsx`);
  }

  /* ---------- események ---------- */
  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.egRemove) { e.preventDefault(); remove(t.dataset.egRemove); }
    // Csoportos kártya: mind jóváhagyva / egyik sem hiba. Ugyanaz, mintha soronként kattintana.
    else if (t.dataset.egRvall) { const y = window.scrollY, v = t.dataset.egRvall, rv = App.state.review; t.dataset.keys.split('§').forEach(k => { if (!rv[k]) rv[k] = v; }); App.render(); window.scrollTo(0, y); if (App.saveSoon) App.saveSoon(); }
    else if (t.dataset.egPlan) openPlan(Number(t.dataset.egPlan));
    else if (t.dataset.egCheck) { const y = window.scrollY, i = t.dataset.egCheck; st.open[i] = !st.open[i]; App.render(); window.scrollTo(0, y); }
    else if (t.dataset.egHit) {
      const [gi, hi] = t.dataset.egHit.split('|').map(Number), g = st.result.groups[gi], h = g.hits[hi];
      const marks = g.hits.filter(x => x.fileName === h.fileName && x.page === h.page);
      openPage(h.fileName, h.page, marks, `${g.codes.map(esc).join(', ')} · ${esc(h.label)} · ${marks.length} hely`, marks.indexOf(h));
    }
    else if (t.dataset.egKonsz) openKonsz(Number(t.dataset.egKonsz));
    else if (t.dataset.egSheet) openSheetRow(Number(t.dataset.egSheet));
    else if (t.dataset.egPage) { const [f, p] = t.dataset.egPage.split('|'); openPage(f, Number(p), null, `${esc(f)} · ${p}. oldal`); }
    else if (t.id === 'eg-xlsx') exportXlsx();
  });
  // A hosszú sávok összecsukott része maradjon nyitva a következő rajzoláskor is.
  // Az összecsukható részek nyitott állapota maradjon meg a következő rajzoláskor is.
  document.addEventListener('toggle', e => { const t = e.target; if (t.dataset && t.dataset.keep && t.closest('#view-egyezes')) { st.keep = st.keep || {}; st.keep[t.dataset.keep] = t.open; } }, true);
  function take(files) {
    const sheet = files.find(f => /\.(xlsx?|xlsm)$/i.test(f.name));
    if (sheet) sheetFile = sheet;
    return addFiles(files);
  }

  // A fő tételjegyzék-mezőbe tett táblázat: ha van benne alaprajzi jel oszlop, az összevetés is ezt használja.
  async function trySheet(f) {
    try { st.sheet = readSheet(await f.arrayBuffer(), f.name); sheetFile = f; } catch (e) { return; }
    st.result = st.konsz.length || st.plans.length ? compare() : null;
    App.render();
  }

  /* ---------- kérdések a generálkivitelezőnek, árazási jelzések, Excel-lapok ---------- */
  const has = (g, t) => g.findings.find(f => f.t === t);
  const label = g => `${g.codes.join(', ')}${g.name ? ' (' + g.name + ')' : ''}`;
  const qtyS = (v, u) => (v == null ? '–' : fmt(v) + ' ' + u);
  // Az eltérésekből kérdések: egy kérdés egy döntést kér. Csak a legalább 50%-os eltérések kerülnek bele, a legbiztosabbak elöl.
  function questions() {
    const R = st.result; if (!R) return [];
    const gs = R.groups, q = [];
    const miss = gs.filter(g => has(g, 'Nincs a küldött listában') && g.konsz.length);
    if (miss.length) q.push({ p: 90, kerdes: `A konszignációban szerepelnek, de a tételjegyzékben nincsenek: ${miss.map(g => `${label(g)}: ${qtyS(g.kQty, g.unit)}`).join('; ')}. Kérjük, erősítsék meg, hogy ezek a tételek ajánlatunk részét képezik-e, vagy más alvállalkozó árazza őket.`, miert: 'Ha a mi ajánlatunk része, a tételjegyzék alapján kimaradna az árból; ha nem, jó tudni, kié.', codes: miss.flatMap(g => g.codes) });
    const ghost = gs.filter(g => !g.konsz.length && !g.rows.length && g.pCount);
    if (ghost.length) q.push({ p: 75, kerdes: `A tervlapokon szerepelnek a következő jelek, de sem konszignációs lap, sem tétel nem tartozik hozzájuk: ${ghost.map(g => `${g.codes.join(', ')} (${g.pCount} helyen)`).join('; ')}. Mit jelölnek, és részei-e az ajánlatnak?`, miert: 'A rajzon lévő, de sehol nem leírt elemet nem lehet beárazni.', codes: ghost.flatMap(g => g.codes) });
    gs.filter(g => has(g, 'Eltérő mennyiség')).forEach(g => q.push({ p: 90, kerdes: `${label(g)}: a tételjegyzék ${qtyS(g.tjQty, g.unit)}, a konszignáció ${qtyS(g.kQty, g.unit)} mennyiséget ír${g.pCount ? `, a tervlapokon ${g.pCount} helyen szerepel` : ''}. Melyik mennyiséget árazzuk?`, miert: 'Eltérő mennyiség: az ajánlati ár ettől függ.', codes: g.codes }));
    gs.filter(g => g.rows.length && !has(g, 'Eltérő mennyiség') && (has(g, 'A rajzon más a darabszám') || {}).p >= 70).forEach(g => q.push({ p: 70, kerdes: `${label(g)}: a tételjegyzék ${qtyS(g.tjQty, g.unit)} mennyiséget ír, a tervlapokon viszont ${g.pCount} helyen szerepel a jel. Kérjük, erősítsék meg a darabszámot.`, miert: 'A rajz szerinti darabszám eltér a kiírttól.', codes: g.codes }));
    gs.forEach(g => { const f = has(g, 'Nem fér el a megadott helyen') || ((has(g, 'Eltérő méret') || {}).p >= 80 ? has(g, 'Eltérő méret') : null); if (f) q.push({ p: f.p, kerdes: `${label(g)}: ${f.d} Melyik méret az irányadó?`, miert: 'Más méret más terméket és más árat jelent.', codes: g.codes }); });
    const odd = gs.filter(g => has(g, 'Gyanús érték a konszignációban'));
    if (odd.length) q.push({ p: 70, kerdes: `A konszignáció az alábbi tételeknél 90 cm feletti asztalmagasságot ír (ülő munkához a szokásos 72–76 cm): ${odd.map(g => { const m = has(g, 'Gyanús érték a konszignációban').d.match(/(\d+(?:[,.]\d+)?) cm/); return `${label(g)}${m ? ': ' + m[1] + ' cm' : ''}`; }).join('; ')}. Kérjük, erősítsék meg a helyes magasságot.`, miert: 'Valószínű elírás a konszignációban; a magasság a gyártást és az árat is érinti.', codes: odd.flatMap(g => g.codes) });
    const hidden = gs.filter(g => g.rows.some(r => r.hidden));
    if (hidden.length) q.push({ p: 80, kerdes: `A megküldött tételjegyzékben ${hidden.length} tétel sora el van rejtve: ${hidden.map(g => g.codes.join(', ')).join('; ')}. Kérjük, erősítsék meg, hogy ezek is árazandók.`, miert: 'A rejtett sor nyomtatásban nem látszik; nem egyértelmű, hogy szándékosan rejtették-e el.', codes: hidden.flatMap(g => g.codes) });
    const noK = gs.filter(g => g.rows.length && !g.konsz.length && has(g, 'Nincs konszignációs lapja'));
    if (noK.length) q.push({ p: 60, kerdes: `Az alábbi tételekhez nem kaptunk konszignációs lapot vagy részletrajzot: ${noK.map(label).join('; ')}. Kérjük, küldjék meg a műszaki tartalmukat (méret, anyag, felület).`, miert: 'Leírás nélkül csak becsülni lehet az árat.', codes: noK.flatMap(g => g.codes) });
    return q.sort((a, b) => b.p - a.p);
  }
  function projectName() {
    for (const k of st.konsz) for (const it of k.items) if (it.project) return it.project.replace(/\s+/g, ' ');
    return '';
  }
  // extra: további kérdések (a tételek szövegéből, a modell értelmezése); a sorszámozás folytatódik.
  function letter(extra) {
    const q = questions().map(x => ({ kerdes: x.kerdes })).concat((extra || []).map(k => ({ kerdes: k }))), pn = projectName();
    return `Tisztelt Címzett!\n\n${pn ? `A(z) „${pn}” projekt` : 'A projekt'} bútor- és asztalos tételeinek árazása előtt az alábbiakat kérjük tisztázni:\n\n` +
      q.map((x, n) => `${n + 1}. ${x.kerdes}`).join('\n\n') + `\n\nVálaszukat előre is köszönjük.\n\nÜdvözlettel:\nGarzon`;
  }
  // A táblázat egy sorának jelei (a modell kérdéseinek összevetéséhez az egyezés kérdéseivel).
  function codesForRow(row) {
    if (!st.result) return [];
    const g = st.result.groups.find(x => x.rows.some(r => r.row === row));
    return g ? g.codes : [];
  }
  // Árazáshoz: a táblázat egy sorához tartozó eltérések (sorszám szerint), és a tételjegyzékből hiányzó jelek.
  function flagsForRow(row) {
    if (!st.result) return [];
    const g = st.result.groups.find(x => x.rows.some(r => r.row === row));
    return g ? g.findings.filter(f => f.p >= 50 && !/^(Hibás sorszám|Nincs alaprajzi jel)$/.test(f.t)) : [];
  }
  const missingGroups = () => (st.result ? st.result.groups.filter(g => !g.rows.length && (g.konsz.length || g.pCount)) : []);
  function appendSheets(wb) {
    if (!st.result) return;
    const w = buildWb();
    w.SheetNames.forEach((n, i) => XL.add(wb, w.Sheets[n], i === 0 ? 'Egyezés - eltérések' : 'Egyezés - összes jel'));
  }

  // A táblázat egy sorához tartozó konszignációs lap(ok) szövege: a modell ebből látja a méretet és az anyagot.
  function konszTextForRow(row) {
    if (!st.result) return '';
    const g = st.result.groups.find(x => x.rows.some(r => r.row === row));
    if (!g || !g.konsz.length) return '';
    return g.konsz.map(k => `[${g.codes.join(', ')} konszignáció, ${k.page}. oldal] ${k.text.split(NL).map(l => l.trim()).filter(Boolean).join(' · ')}`).join(' | ').slice(0, 1500);
  }
  root.Egyezes = { get state() { return st; }, sheetFindings, sharpCount: () => Object.keys(sharp).length, addFiles: take, trySheet, ready, reset, view, dropHtml, readSheet, compare, expandCodes, dimsOf, questions, letter, flagsForRow, missingGroups, appendSheets, projectName, konszTextForRow, codesForRow };
})(window);
