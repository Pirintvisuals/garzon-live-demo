/*
 * Excel munkafüzet: az árajánlatadó ebben folytatja a munkát. Az ároszlopok üresek, a nettó érték képlet.
 */
(function () {
  const { MAKERS } = App;
  const H = App.helpers;
  const sheet = (aoa, widths) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = widths.map(w => ({ wch: w })); return ws; };

  function itemRows(list, startRow) {
    return list.map((it, n) => {
      const a = App.state.ai[it.id] || {};
      const r = startRow + n;
      return [it.id, it.part, it.name, it.spec, a.kategoria || '', a.szelesseg_mm || '', a.melyseg_mm || '', a.magassag_mm || '', a.anyag || '', a.vaz || '', a.szin || '',
        a.gyarto ? MAKERS[a.gyarto].label : '', it.qty, it.unit, '', { f: `M${r}*O${r}` },
        H.notesOf(it).map(x => x.szoveg).join(' | '), `${it.sheet}, ${it.row}. sor`];
    });
  }
  const ITEM_HEAD = ['Tétel', 'Rész', 'Megnevezés', 'Eredeti leírás', 'Kategória', 'Szélesség (mm)', 'Mélység (mm)', 'Magasság (mm)', 'Anyag', 'Váz', 'Szín', 'Gyártás', 'Mennyiség', 'Egység', 'Nettó egységár (Ft)', 'Nettó érték (Ft)', 'Észrevétel', 'Forrás'];
  const ITEM_W = [8, 20, 26, 60, 12, 10, 10, 10, 34, 26, 14, 18, 10, 7, 16, 16, 50, 24];

  function build() {
    const st = App.state, t = st.tender, wb = XLSX.utils.book_new();
    const all = H.items();
    if (t) {
      const o = t.osszefoglalo;
      XLSX.utils.book_append_sheet(wb, sheet([
        ['Vezetői összefoglaló'], [], ['Tárgy', o.targy], ['Ajánlatkérő', o.ajanlatkero], ['Eljárás', o.eljaras || ''], ['Leírás', o.rovid_leiras], [],
        ['Feltétel', 'Érték', 'Idézet a dokumentumból'], ...o.feltetelek.map(f => [f.nev, f.ertek, f.idezet]), [],
        ['Kockázat', 'Leírás', 'Súlyosság', 'Idézet'], ...o.kockazatok.map(k => [k.cim, k.leiras, H.SEV[k.sulyossag].label, k.idezet]), [],
        ['Csatolandó dokumentumok'], ...o.csatolando.map(x => [x])
      ], [34, 70, 70, 60]), 'Összefoglaló');
    }
    XLSX.utils.book_append_sheet(wb, sheet([ITEM_HEAD, ...itemRows(all, 2)], ITEM_W), 'Tételek');
    [['fa', 'Faüzem', m => m === 'fa' || m === 'fa_fem'], ['fem', 'Fémüzem', m => m === 'fem' || m === 'fa_fem'], ['karpit', 'Kárpitos', m => m === 'karpit'], ['beszallitoi', 'Beszállítói', m => m === 'beszallitoi']]
      .forEach(([, name, test]) => {
        const list = all.filter(i => test(H.makerOf(i)));
        if (list.length) XLSX.utils.book_append_sheet(wb, sheet([ITEM_HEAD, ...itemRows(list, 2)], ITEM_W), name);
      });
    const checks = [['Típus', 'Súlyosság', 'Megállapítás', 'Leírás', 'Idézet', 'Érintett tételek']];
    if (t) t.ellenorzes.forEach(f => checks.push([H.FIND_TYPES[f.tipus] || '', H.SEV[f.sulyossag].label, f.cim, f.leiras, f.idezet, f.erintett_tetelek.join(', ')]));
    all.forEach(it => H.notesOf(it).forEach(n => checks.push([H.NOTE_TYPES[n.tipus] || '', '', it.name, n.szoveg, n.idezet, it.id])));
    XLSX.utils.book_append_sheet(wb, sheet(checks, [32, 11, 40, 70, 60, 20]), 'Ellenőrizendő');
    if (t) XLSX.utils.book_append_sheet(wb, sheet([['#', 'Kérdés', 'Miért kell', 'Érintett tételek'], ...t.kerdesek.map((q, n) => [n + 1, q.kerdes.replace(/^\s*Tisztelt\s+[^!,.]{0,40}[!,.]\s*/i, ''), q.miert, q.erintett_tetelek.join(', ')])], [4, 90, 60, 20]), 'Kérdések');
    if (st.rev && st.rev.changes.length) {
      const KIND = { changed: 'Módosult', added: 'Új tétel', removed: 'Törölt tétel' };
      const rows = st.rev.changes.map(c => {
        const a = st.rev.ai[c.id] || {}, o = c.old || {}, n = c.new || {};
        return [c.id, c.part, (c.old || c.new).name, KIND[c.kind], a.mi_valtozott || '', a.arat_erinti ? H.IMPACT[a.arat_erinti].label : '',
          o.qty != null ? o.qty : '', n.qty != null ? n.qty : '', o.spec || '', n.spec || '', c.kind === 'changed' ? H.earlierFlags(c.id).join(' | ') : ''];
      });
      XLSX.utils.book_append_sheet(wb, sheet([['Tétel', 'Rész', 'Megnevezés', 'Változás', 'Mi változott', 'Árhatás', 'Régi menny.', 'Új menny.', 'Régi leírás', 'Új leírás', 'A program az eredetinél jelezte'], ...rows],
        [8, 20, 26, 12, 50, 16, 10, 10, 60, 60, 50]), 'Revízió');
    }
    XLSX.writeFile(wb, 'ajanlatkeres_elokeszites.xlsx');
  }
  document.getElementById('btn-xlsx').addEventListener('click', build);
})();
