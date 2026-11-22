/*
 * Formázott Excel-kimenet: minden letöltött munkalap egységes, rendezett kinézettel
 * (sötét fejléc, szegélyek, tördelt szöveg, szűrő, forint-formátum).
 * Íráshoz az xlsx-js-style könyvtárat használja (XLSXS), mert a SheetJS ingyenes változata formázást nem ír.
 * Olvasásra továbbra is a SheetJS (XLSX) szolgál. Ha az XLSXS nem töltődött be, formázás nélkül ír.
 */
(function (root) {
  const lib = () => root.XLSXS || root.XLSX;
  const FONT = 'Calibri';
  const line = rgb => ({ style: 'thin', color: { rgb } });
  const box = rgb => ({ top: line(rgb), bottom: line(rgb), left: line(rgb), right: line(rgb) });
  const S = {
    title: { font: { name: FONT, sz: 14, bold: true, color: { rgb: '1B1D21' } } },
    head: { font: { name: FONT, sz: 10.5, bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '23262B' } }, alignment: { vertical: 'center', wrapText: true }, border: box('23262B') },
    body: { font: { name: FONT, sz: 10.5 }, alignment: { vertical: 'top', wrapText: true }, border: box('D9DEE5') },
    label: { font: { name: FONT, sz: 10.5, bold: true, color: { rgb: '475569' } }, alignment: { vertical: 'top' } },
    value: { font: { name: FONT, sz: 10.5 }, alignment: { vertical: 'top', wrapText: true } }
  };
  const MONEY = '#,##0 "Ft"';

  /*
   * aoa: sorok tömbje; widths: oszlopszélességek (karakter).
   * opt.title: címsorok indexei · opt.head: fejlécsorok indexei (alapból 0) · opt.label: „címke: érték” sorok indexei
   * opt.money: forintos oszlopok indexei · opt.filter: szűrő a (első) táblázat fejlécén
   * Egy fejléc alatti sorok a következő üres sorig a táblázat törzse.
   */
  function sheet(aoa, widths, opt = {}) {
    const X = lib();
    const ws = X.utils.aoa_to_sheet(aoa);
    ws['!cols'] = widths.map(w => ({ wch: w }));
    if (!root.XLSXS) return ws;
    const heads = new Set(opt.head || [0]), titles = new Set(opt.title || []), labels = new Set(opt.label || []), money = new Set(opt.money || []);
    const cellAt = (r, c) => { const a = X.utils.encode_cell({ r, c }); if (!ws[a]) ws[a] = { t: 's', v: '' }; return ws[a]; };
    let width = 0, firstHead = -1, lastBody = -1;
    aoa.forEach((row, r) => {
      const empty = !row || !row.some(v => v !== '' && v != null);
      if (titles.has(r)) { (row || []).forEach((v, c) => { cellAt(r, c).s = S.title; }); width = 0; return; }
      if (heads.has(r)) {
        width = row.length;
        for (let c = 0; c < width; c++) cellAt(r, c).s = S.head;
        if (firstHead < 0) firstHead = r;
        return;
      }
      if (labels.has(r)) { (row || []).forEach((v, c) => { cellAt(r, c).s = c === 0 ? S.label : S.value; }); return; }
      if (empty) { width = 0; return; }
      if (!width) { (row || []).forEach((v, c) => { if (ws[X.utils.encode_cell({ r, c })]) cellAt(r, c).s = S.value; }); return; }
      for (let c = 0; c < width; c++) {
        const cell = cellAt(r, c);
        cell.s = S.body;
        if (money.has(c) && (cell.t === 'n' || cell.f)) cell.z = MONEY;
      }
      if (firstHead >= 0) lastBody = r;
    });
    if (opt.filter && firstHead >= 0 && lastBody > firstHead) {
      ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: firstHead, c: 0 }, e: { r: lastBody, c: aoa[firstHead].length - 1 } }) };
    }
    return ws;
  }
  const book = () => lib().utils.book_new();
  const add = (wb, ws, name) => lib().utils.book_append_sheet(wb, ws, String(name).replace(/[\\/?*[\]:]/g, '').slice(0, 31));
  const save = (wb, name) => lib().writeFile(wb, name);
  root.XL = { sheet, book, add, save };
})(window);
