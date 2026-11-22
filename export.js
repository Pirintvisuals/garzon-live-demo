/*
 * Excel munkafüzet: az árajánlatadó ebben folytatja a munkát. Az ároszlopok üresek, a nettó érték képlet.
 * A formázást (fejléc, szegély, tördelés, szűrő, forint) az xlstyle.js adja.
 */
(function () {
  const { MAKERS } = App;
  const H = App.helpers;

  function itemRows(list, startRow) {
    return list.map((it, n) => {
      const a = App.state.ai[it.id] || {};
      const r = startRow + n;
      return [it.id, it.part, it.name, it.spec, a.kategoria || '', a.szelesseg_mm || '', a.melyseg_mm || '', a.magassag_mm || '', a.anyag || '', a.vaz || '', a.szin || '',
        a.gyarto ? MAKERS[a.gyarto].label : '', it.qty, it.unit, ((App.state.ai[it.id] && H.priceOf(it)) || {}).avg || '', { f: `M${r}*O${r}` },
        H.notesOf(it).map(x => x.szoveg).join(' | '), `${it.sheet}, ${it.row}. sor`];
    });
  }
  const ITEM_HEAD = ['Tétel', 'Rész', 'Megnevezés', 'Eredeti leírás', 'Kategória', 'Szélesség (mm)', 'Mélység (mm)', 'Magasság (mm)', 'Anyag', 'Váz', 'Szín', 'Gyártás', 'Mennyiség', 'Egység', 'Nettó egységár (Ft)', 'Nettó érték (Ft)', 'Észrevétel', 'Forrás'];
  const ITEM_W = [8, 20, 30, 60, 14, 11, 11, 11, 34, 26, 16, 18, 10, 8, 16, 16, 50, 22];
  const itemSheet = list => XL.sheet([ITEM_HEAD, ...itemRows(list, 2)], ITEM_W, { money: [14, 15], filter: true });

  function build() {
    const st = App.state, t = st.tender, wb = XL.book();
    const all = H.items();
    if (t) {
      // Az összefoglaló több kis táblázatból áll: a fejlécsorok helyét építés közben jegyezzük fel.
      const o = t.osszefoglalo, a = [], head = [], label = [];
      a.push(['Vezetői összefoglaló']); a.push([]);
      [['Tárgy', o.targy], ['Ajánlatkérő', o.ajanlatkero], ['Eljárás', o.eljaras || ''], ['Leírás', o.rovid_leiras]].forEach(r => { label.push(a.length); a.push(r); });
      a.push([]);
      head.push(a.length); a.push(['Feltétel', 'Érték', 'Idézet a dokumentumból']); o.feltetelek.forEach(f => a.push([f.nev, f.ertek, f.idezet])); a.push([]);
      head.push(a.length); a.push(['Kockázat', 'Leírás', 'Súlyosság', 'Idézet']); o.kockazatok.forEach(k => a.push([k.cim, k.leiras, H.SEV[k.sulyossag].label, k.idezet])); a.push([]);
      head.push(a.length); a.push(['Csatolandó dokumentumok']); o.csatolando.forEach(x => a.push([x]));
      XL.add(wb, XL.sheet(a, [34, 70, 60, 60], { title: [0], head, label }), 'Összefoglaló');
    }
    XL.add(wb, itemSheet(all), 'Tételek');
    [['Faüzem', m => m === 'fa' || m === 'fa_fem'], ['Fémüzem', m => m === 'fem' || m === 'fa_fem'], ['Kárpitos', m => m === 'karpit'], ['Beszállítói', m => m === 'beszallitoi']]
      .forEach(([name, test]) => {
        const list = all.filter(i => test(H.makerOf(i)));
        if (list.length) XL.add(wb, itemSheet(list), name);
      });
    const checks = [['Típus', 'Súlyosság', 'Megállapítás', 'Leírás', 'Idézet', 'Érintett tételek']];
    if (t) t.ellenorzes.forEach(f => checks.push([H.FIND_TYPES[f.tipus] || '', H.SEV[f.sulyossag].label, f.cim, f.leiras, f.idezet, f.erintett_tetelek.join(', ')]));
    all.forEach(it => H.notesOf(it).forEach(n => checks.push([H.NOTE_TYPES[n.tipus] || '', '', it.name, n.szoveg, n.idezet, it.id])));
    XL.add(wb, XL.sheet(checks, [30, 12, 40, 70, 60, 18], { filter: true }), 'Ellenőrizendő');
    // Kérdések: a jóváhagyott hibákból megírt levél kérdései (ha már elkészült).
    // Címzettenként: ki kapja, és mit.
    if (st.letter && st.letter.qs.length) {
      const R = H.recipients(), rows = [];
      st.letter.parts.forEach(p => p.qs.forEach((q, n) => rows.push([(R[p.r] || R.kulso).label, n + 1, q])));
      XL.add(wb, XL.sheet([['Címzett', '#', 'Kérdés'], ...rows], [22, 5, 110], { filter: true }), 'Kérdések');
    }
    if (st.rev && st.rev.changes.length) {
      const KIND = { changed: 'Módosult', added: 'Új tétel', removed: 'Törölt tétel' };
      const rows = st.rev.changes.map(c => {
        const a = st.rev.ai[c.id] || {}, o = c.old || {}, n = c.new || {};
        return [c.id, c.part, (c.old || c.new).name, KIND[c.kind], a.mi_valtozott || '', a.arat_erinti ? H.IMPACT[a.arat_erinti].label : '',
          o.qty != null ? o.qty : '', n.qty != null ? n.qty : '', o.spec || '', n.spec || '', c.kind === 'changed' ? H.earlierFlags(c.id).join(' | ') : ''];
      });
      XL.add(wb, XL.sheet([['Tétel', 'Rész', 'Megnevezés', 'Változás', 'Mi változott', 'Árhatás', 'Régi menny.', 'Új menny.', 'Régi leírás', 'Új leírás', 'A program az eredetinél jelezte'], ...rows],
        [8, 20, 26, 12, 50, 16, 10, 10, 60, 60, 50], { filter: true }), 'Revízió');
    }
    if (window.Egyezes && Egyezes.ready()) Egyezes.appendSheets(wb);
    const td = H.todoList();
    const ta = [['Kész', 'Teendő', 'Megjegyzés'], ...td.work.map(x => [st.todo[x.id] ? 'x' : '', x.text, x.hint || '']), []];
    const docHead = ta.length;
    ta.push(['Kész', 'Csatolandó dokumentum'], ...td.docs.map(x => [st.todo[x.id] ? 'x' : '', x.text]));
    XL.add(wb, XL.sheet(ta, [6, 70, 70], { head: [0, docHead] }), 'Teendők');
    XL.save(wb, 'ajanlatkeres_elokeszites.xlsx');
  }
  document.getElementById('btn-xlsx').addEventListener('click', build);
})();
