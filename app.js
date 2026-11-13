/*
 * Nézetek és a feldolgozás vezérlése.
 * Állapot: a táblázatból olvasott tételek (kód), a modell értelmezése tételenként (ai), a kiírás feldolgozása (tender).
 */
(function (root) {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => (Math.round(n * 100) / 100).toLocaleString('hu-HU');
  // Mennyiség összesítve mértékegységenként (db és fm nem adható össze).
  const qtyText = list => {
    const by = {};
    list.forEach(i => { const u = (i.unit || 'db').toLowerCase(); by[u] = (by[u] || 0) + i.qty; });
    return Object.keys(by).sort((a, b) => (a === 'db' ? -1 : b === 'db' ? 1 : 0)).map(u => fmt(by[u]) + ' ' + u).join(' + ');
  };

  const MAKERS = {
    fa: { label: 'Faüzem', cls: 'm-fa' },
    fem: { label: 'Fémüzem', cls: 'm-fem' },
    fa_fem: { label: 'Faüzem + Fémüzem', cls: 'm-mix' },
    karpit: { label: 'Kárpitos', cls: 'm-karpit' },
    beszallitoi: { label: 'Beszállítói', cls: 'm-besz' }
  };
  const NOTE_TYPES = { ellentmondas: 'Ellentmondás', hiany: 'Hiányzó adat', pontatlan: 'Pontatlan leírás' };
  const SEV = { magas: { label: 'Magas', cls: 'neg' }, kozepes: { label: 'Közepes', cls: 'warn' }, alacsony: { label: 'Alacsony', cls: 'grey' } };
  const FIND_TYPES = { dokumentum_kovetelmeny: 'Követelmény a dokumentumban', elteres: 'Eltérés a dokumentum és a tételjegyzék között', tetelek_kozti_elteres: 'Eltérés tételek között', meghatarozatlan: 'Meghatározatlan' };

  const TABS = [
    { id: 'feltoltes', label: 'Feltöltés' },
    { id: 'osszefoglalo', label: 'Vezetői összefoglaló' },
    { id: 'tetelek', label: 'Tételek' },
    { id: 'bontas', label: 'Gyártási bontás' },
    { id: 'ellenorzes', label: 'Ellenőrizendő' },
    { id: 'kerdesek', label: 'Kérdések az ajánlatkérőnek' }
  ];

  const fresh = () => ({
    tab: 'feltoltes', files: { sheet: null, doc: null }, book: null, doc: null, docIndex: null,
    ai: {}, tender: null, partStatus: {}, tenderStatus: 'idle', tenderError: '',
    running: false, startedAt: 0, elapsedMs: 0, model: '', filter: { maker: '', part: '', onlyNotes: false }, fromSaved: false
  });
  let st = fresh();
  root.App = { get state() { return st; }, MAKERS };

  /* ---------- számított adatok ---------- */
  const items = () => (st.book ? st.book.items : []);
  const makerOf = it => (st.ai[it.id] && st.ai[it.id].gyarto) || '';
  const notesOf = it => (st.ai[it.id] && st.ai[it.id].eszrevetelek) || [];
  const done = () => items().length > 0 && items().every(it => st.ai[it.id]);
  const itemById = id => items().find(i => i.id === id);
  function counts() {
    const all = items();
    return {
      items: all.length, pieces: all.reduce((s, i) => s + i.qty, 0), parts: st.book ? st.book.parts.length : 0,
      read: all.filter(i => st.ai[i.id]).length,
      notes: all.reduce((s, i) => s + notesOf(i).length, 0),
      findings: st.tender ? st.tender.ellenorzes.length : 0,
      questions: st.tender ? st.tender.kerdesek.length : 0
    };
  }

  /* ---------- keret ---------- */
  function renderChrome() {
    const c = counts();
    $('#tabs').innerHTML = TABS.map(t => {
      let cnt = '';
      if (t.id === 'tetelek' && c.items) cnt = `<span class="cnt">${c.items}</span>`;
      if (t.id === 'ellenorzes' && (c.notes + c.findings)) cnt = `<span class="cnt warn">${c.notes + c.findings}</span>`;
      if (t.id === 'kerdesek' && c.questions) cnt = `<span class="cnt">${c.questions}</span>`;
      const disabled = t.id !== 'feltoltes' && !st.book;
      return `<button class="tab" role="tab" data-tab="${t.id}" aria-selected="${st.tab === t.id}" ${disabled ? 'disabled' : ''}>${t.label}${cnt}</button>`;
    }).join('');
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'view-' + st.tab));
    const title = st.tender ? st.tender.osszefoglalo.targy : (st.book ? st.book.fileName : 'Nincs betöltött ajánlatkérés');
    const meta = st.book ? `${c.parts} rész · ${c.items} tétel · ${esc(qtyText(items()))}` + (st.doc ? ` · ${esc(st.doc.fileName)}` : '') : 'Töltse fel a tételjegyzéket és a kiírás dokumentumát.';
    $('#proj-head').innerHTML = `<div class="proj-title">${esc(title)}</div><div class="proj-meta">${meta}</div>`;
    $('#btn-xlsx').hidden = !done();
    $('#btn-new').hidden = !st.book;
    renderTimer();
  }
  function renderTimer() {
    const el = $('#timer');
    const ms = st.running ? Date.now() - st.startedAt : st.elapsedMs;
    el.hidden = !ms;
    if (ms) el.textContent = (st.running ? 'Feldolgozás: ' : 'Feldolgozva: ') + (ms / 1000).toFixed(st.running ? 0 : 1).replace('.', ',') + ' mp';
  }

  function render() {
    renderChrome();
    ({ feltoltes: viewUpload, osszefoglalo: viewBrief, tetelek: viewItems, bontas: viewSplit, ellenorzes: viewCheck, kerdesek: viewQuestions })[st.tab]();
  }

  const waiting = what => `<div class="card"><div class="card-b empty">${st.running ? '<span class="spin"></span> ' + what + ' készül…' : 'Még nincs feldolgozott adat. Indítsa el a feldolgozást a Feltöltés fülön.'}</div></div>`;

  /* ---------- Feltöltés ---------- */
  function viewUpload() {
    const c = counts();
    const f = st.files;
    let h = `<div class="view-head"><div><h2>Ajánlatkérés feltöltése</h2>
      <p>Két fájl kell: a tételjegyzék (Excel) és a kiírás szöveges dokumentuma (Word). A program beolvassa a tételeket, oszlopokra bontja a leírásokat, szétosztja őket gyártás szerint, összeveti a dokumentummal, és előkészíti a kérdéseket. Ár nem kerül bele.</p></div></div>`;
    h += `<div class="grid g2">
      <label class="drop ${f.sheet ? 'has' : ''}" data-kind="sheet"><input type="file" accept=".xls,.xlsx,.xlsm,.csv" hidden>
        <div class="drop-t">1. Tételjegyzék / ártáblázat</div>
        <div class="drop-f">${f.sheet ? esc(f.sheet.name) : 'Húzza ide, vagy kattintson (.xls, .xlsx)'}</div>
        ${st.detecting ? '<div class="drop-s"><span class="spin"></span> A táblázat szerkezetének felismerése…</div>' : ''}
        ${st.book ? `<div class="drop-s">${st.book.sheetCount} munkalap, ebből ${c.parts} tartalmaz tételeket · ${c.items} tétel · ${esc(qtyText(items()))}</div>${st.book.usedAi ? colInfo() : ''}` : ''}</label>
      <label class="drop ${f.doc ? 'has' : ''}" data-kind="doc"><input type="file" accept=".docx,.txt" hidden>
        <div class="drop-t">2. Kiírás, műszaki leírás, szerződéstervezet</div>
        <div class="drop-f">${f.doc ? esc(f.doc.name) : 'Húzza ide, vagy kattintson (.docx)'}</div>
        ${st.doc ? `<div class="drop-s">${st.docIndex.paras.length.toLocaleString('hu-HU')} bekezdés · ${st.doc.text.length.toLocaleString('hu-HU')} karakter</div>` : ''}</label>
    </div>`;
    h += `<div class="card"><div class="card-b actions">
      <button class="btn btn-primary btn-lg" id="btn-run" ${st.book && !st.running ? '' : 'disabled'}>${st.running ? 'Feldolgozás folyamatban…' : (done() ? 'Feldolgozás újra' : 'Feldolgozás indítása')}</button>
      <button class="btn" id="btn-sample" ${st.running ? 'disabled' : ''}>Minta betöltése: Debreceni Tankerületi Központ, bútorbeszerzés (nyilvános közbeszerzés)</button>
      <button class="btn" id="btn-saved" hidden>Korábban feldolgozott eredmény megnyitása</button>
    </div></div>`;
    if (st.book && (st.running || c.read || st.tenderStatus !== 'idle')) {
      h += `<div class="card"><div class="card-h"><h3>Feldolgozás állapota</h3><span class="muted">${c.read} / ${c.items} tétel értelmezve</span></div><div class="card-b">
        <div class="bar big"><i style="width:${c.items ? Math.round(100 * c.read / c.items) : 0}%"></i></div>
        <div class="steps">${stepRow('Kiírás dokumentuma: összefoglaló, összevetés, kérdések', st.tenderStatus, st.tenderError)}
        ${st.book.parts.map(p => stepRow(`${esc(p.name)} · ${p.items.length} tétel`, st.partStatus[p.no] || 'idle', (st.partStatus['err' + p.no] || ''), p.no)).join('')}</div>
      </div></div>`;
    }
    if (st.book && st.book.skipped.length) h += `<p class="muted small">Tétel nélküli munkalapok (kihagyva): ${st.book.skipped.map(esc).join(', ')}</p>`;
    if (st.book && !st.running && !c.read) h += previewTable();
    $('#view-feltoltes').innerHTML = h;
    fetch('data/mentett.json', { method: 'HEAD' }).then(r => { const b = $('#btn-saved'); if (b && r.ok) b.hidden = false; }).catch(() => {});
  }
  // Ismeretlen szerkezetű táblázatnál megmutatjuk, mit minek olvasott a program.
  function colInfo() {
    const p = st.book.parts.find(x => x.ai); if (!p) return '';
    const h = i => (i >= 0 && p.header[i]) ? '„' + esc(p.header[i]) + '”' : '';
    const specs = (p.col.specs || []).map(h).filter(Boolean);
    return `<div class="drop-i">Ismeretlen szerkezetű táblázat, az oszlopokat a program ismerte fel: megnevezés ${h(p.col.name)}, mennyiség ${h(p.col.qty)}${specs.length ? ', műszaki tartalom ' + specs.join(', ') : ''}.</div>`;
  }
  function stepRow(label, status, err, partNo) {
    const map = { idle: ['grey', 'Várakozik'], run: ['', 'Olvasás…'], ok: ['ok', 'Kész'], err: ['neg', 'Hiba'] };
    const [cls, txt] = map[status] || map.idle;
    return `<div class="step"><span class="badge ${cls}">${status === 'run' ? '<span class="spin"></span> ' : ''}${txt}</span><span>${label}</span>${status === 'err' ? `<span class="neg-t">${esc(err)}</span> <button class="btn btn-sm" data-retry="${partNo || 'tender'}">Újra</button>` : ''}</div>`;
  }
  function previewTable() {
    const rows = items().slice(0, 8);
    return `<div class="card"><div class="card-h"><h3>Beolvasott tételek (előnézet, a táblázatból)</h3><span class="muted">${items().length} tételből az első ${rows.length}</span></div>
      <div class="tbl-wrap"><table class="compact"><thead><tr><th>Tétel</th><th>Megnevezés</th><th>Leírás, ahogy a kiírásban áll</th><th class="num">Menny.</th></tr></thead><tbody>
      ${rows.map(i => `<tr><td class="code">${esc(i.id)}</td><td>${esc(i.name)}</td><td class="muted">${esc(i.spec)}</td><td class="num">${fmt(i.qty)} ${esc(i.unit)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  }

  /* ---------- Vezetői összefoglaló ---------- */
  function quoteSrc(quote, source, relatedIds) {
    if (!quote) return '';
    let where = '', ok = false, attr = '';
    if (source !== 'tetelegyzek' && st.docIndex) {
      const loc = Parse.locateQuote(st.docIndex, quote);
      if (loc.found) { ok = true; where = loc.para ? `${esc(st.doc.fileName)}, ${loc.para}. bekezdés` : esc(st.doc.fileName); if (loc.para) attr = `data-para="${loc.para}"`; }
    }
    if (!ok) {
      const hit = (relatedIds && relatedIds.length ? relatedIds.map(itemById).filter(Boolean) : items()).find(it => Parse.quoteInItem(it, quote));
      if (hit) { ok = true; where = `${esc(hit.sheet)} munkalap, ${hit.row}. sor (tétel ${esc(hit.id)})`; attr = `data-item="${esc(hit.id)}"`; }
    }
    return `<div class="quote ${ok ? '' : 'unv'}"><span class="q-text">„${esc(quote)}”</span>${ok
      ? `<button class="q-src q-open" ${attr} data-quote="${esc(quote)}" title="Megnyitás a forrásban">Forrás: ${where} ›</button>`
      : '<span class="q-src">Az idézet szó szerint nem található a forrásban, kérjük ellenőrizze.</span>'}</div>`;
  }
  function viewBrief() {
    const el = $('#view-osszefoglalo');
    if (!st.tender) { el.innerHTML = st.tenderStatus === 'err' ? `<div class="card"><div class="card-b empty neg-t">${esc(st.tenderError)}</div></div>` : waiting('A vezetői összefoglaló'); return; }
    const o = st.tender.osszefoglalo, c = counts();
    const byMaker = Object.keys(MAKERS).map(k => ({ k, n: items().filter(i => makerOf(i) === k).length, q: qtyText(items().filter(i => makerOf(i) === k)) })).filter(x => x.n);
    let h = `<div class="view-head"><div><h2>${esc(o.targy)}</h2><p>${esc(o.ajanlatkero)}${o.eljaras ? ' · ' + esc(o.eljaras) : ''}</p></div></div>`;
    h += `<div class="kpis"><div class="kpi"><div class="l">Részek</div><div class="v">${c.parts}</div><div class="s">külön megpályázható egység</div></div>
      <div class="kpi"><div class="l">Tételek</div><div class="v">${c.items}</div><div class="s">${esc(qtyText(items()))}</div></div>
      <div class="kpi warn"><div class="l">Ellenőrizendő</div><div class="v">${c.notes + c.findings}</div><div class="s">${c.notes} tételszintű, ${c.findings} a kiírásból</div></div>
      <div class="kpi"><div class="l">Előkészített kérdés</div><div class="v">${c.questions}</div><div class="s">az ajánlatkérőnek</div></div></div>`;
    h += `<div class="card" style="margin-top:16px"><div class="card-b"><p class="lead">${esc(o.rovid_leiras)}</p>
      ${byMaker.length ? `<div class="makers">${byMaker.map(x => `<span class="mk ${MAKERS[x.k].cls}"><b>${MAKERS[x.k].label}</b> ${x.n} tétel · ${esc(x.q)}</span>`).join('')}</div>` : ''}</div></div>`;
    h += `<div class="grid g-main"><div class="card"><div class="card-h"><h3>Feltételek, amelyek az árat és a kockázatot érintik</h3></div>
      <div class="tbl-wrap"><table><tbody>${o.feltetelek.map(f => `<tr><td class="k">${esc(f.nev)}</td><td>${esc(f.ertek)}${quoteSrc(f.idezet, 'dokumentum')}</td></tr>`).join('')}</tbody></table></div></div>
      <div><div class="card"><div class="card-h"><h3>Kockázatok</h3></div><div class="card-b risks">
      ${o.kockazatok.map(k => `<div class="risk"><span class="badge ${SEV[k.sulyossag].cls}">${SEV[k.sulyossag].label}</span><div><b>${esc(k.cim)}</b><p>${esc(k.leiras)}</p>${quoteSrc(k.idezet, 'dokumentum')}</div></div>`).join('') || '<span class="muted">Nincs kiemelt kockázat.</span>'}</div></div>
      <div class="card"><div class="card-h"><h3>Az ajánlathoz csatolandó</h3></div><div class="card-b"><ul class="chk">${o.csatolando.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div></div></div>`;
    el.innerHTML = h;
  }

  /* ---------- forrásnézet: az idézet a saját helyén, a környezetével ---------- */
  function mark(text, quote) {
    const i = text.toLowerCase().indexOf(String(quote || '').toLowerCase().trim());
    if (i < 0 || !quote) return `<mark>${esc(text)}</mark>`;
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + quote.trim().length)) + '</mark>' + esc(text.slice(i + quote.trim().length));
  }
  function openSource(d) {
    let title = '', body = '';
    if (d.para) {
      const n = Number(d.para), P = st.docIndex.paras;
      title = `${esc(st.doc.fileName)} · ${n}. bekezdés`;
      for (let i = Math.max(1, n - 2); i <= Math.min(P.length, n + 2); i++)
        body += `<p class="${i === n ? 'hit' : 'ctx'}"><span class="pn">${i}.</span>${i === n ? mark(P[i - 1], d.quote) : esc(P[i - 1])}</p>`;
    } else if (d.item) {
      const it = itemById(d.item); if (!it) return;
      title = `${esc(st.book.fileName)} · ${esc(it.sheet)} munkalap · ${it.row}. sor`;
      body = `<table class="compact"><thead><tr><th>Ssz.</th><th>Megnevezés</th><th>Leírás</th><th class="num">Mennyiség</th></tr></thead><tbody><tr><td>${esc(it.no)}</td><td>${mark(it.name, d.quote).replace(/^<mark>(.*)<\/mark>$/, '$1')}</td><td>${mark(it.spec, d.quote).replace(/^<mark>(.*)<\/mark>$/, '$1')}</td><td class="num">${fmt(it.qty)} ${esc(it.unit)}</td></tr></tbody></table>`;
    } else return;
    const m = document.createElement('div');
    m.className = 'modal'; m.innerHTML = `<div class="modal-box"><div class="modal-h"><h3>${title}</h3><button class="btn btn-sm" data-close>Bezárás</button></div><div class="modal-b">${body}</div><div class="modal-f">Ez a feltöltött fájl eredeti szövege, változtatás nélkül.</div></div>`;
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) m.remove(); });
    document.body.appendChild(m);
  }

  /* ---------- Tételek ---------- */
  const dims = a => (a && (a.szelesseg_mm || a.melyseg_mm || a.magassag_mm)) ? [a.szelesseg_mm, a.melyseg_mm, a.magassag_mm].map(v => v || '?').join(' × ') : '';
  function makerSelect(it) {
    const cur = makerOf(it);
    return `<select class="maker-sel ${cur ? MAKERS[cur].cls : ''}" data-maker="${esc(it.id)}">${Object.keys(MAKERS).map(k => `<option value="${k}" ${k === cur ? 'selected' : ''}>${MAKERS[k].label}</option>`).join('')}</select>`;
  }
  function viewItems() {
    const el = $('#view-tetelek');
    if (!st.book) { el.innerHTML = waiting('A tétellista'); return; }
    const f = st.filter;
    const list = items().filter(i => (!f.maker || makerOf(i) === f.maker) && (!f.part || String(i.partNo) === f.part) && (!f.onlyNotes || notesOf(i).length));
    let h = `<div class="view-head"><div><h2>Tételek, oszlopokra bontva</h2><p>A megnevezés, a leírás és a mennyiség a táblázatból származik, változtatás nélkül. A méret, az anyag és a gyártási besorolás a leírás értelmezése: első vázlat, a besorolás átállítható.</p></div>
      <div class="filters"><select id="f-part"><option value="">Minden rész</option>${st.book.parts.map(p => `<option value="${p.no}" ${f.part === String(p.no) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <select id="f-maker"><option value="">Minden gyártás</option>${Object.keys(MAKERS).map(k => `<option value="${k}" ${f.maker === k ? 'selected' : ''}>${MAKERS[k].label}</option>`).join('')}</select>
      <label class="chk-l"><input type="checkbox" id="f-notes" ${f.onlyNotes ? 'checked' : ''}> csak az észrevételesek</label></div></div>`;
    h += `<div class="card"><div class="tbl-wrap"><table class="items"><thead><tr><th>Tétel</th><th>Megnevezés és eredeti leírás</th><th class="num">Menny.</th><th>Méret (mm)<br><span class="faint">szél. × mély. × mag.</span></th><th>Anyag, váz, szín</th><th>Gyártás</th><th>Észrevétel</th></tr></thead><tbody>`;
    let lastPart = null;
    for (const it of list) {
      if (it.partNo !== lastPart) { lastPart = it.partNo; h += `<tr class="zone-row"><td colspan="7">${esc(it.part)}</td></tr>`; }
      const a = st.ai[it.id];
      h += `<tr><td class="code">${esc(it.id)}<span class="src">${it.row}. sor</span></td>
        <td><b>${esc(it.name)}</b>${a && a.kategoria ? ` <span class="badge grey">${esc(a.kategoria)}</span>` : ''}<div class="orig">${esc(it.spec)}</div></td>
        <td class="num">${fmt(it.qty)} ${esc(it.unit)}</td>`;
      if (!a) { h += `<td colspan="4" class="muted">${st.partStatus[it.partNo] === 'run' ? '<span class="spin"></span> értelmezés…' : (st.partStatus[it.partNo] === 'err' ? 'Hiba az értelmezésnél' : 'Még nincs értelmezve')}</td></tr>`; continue; }
      const mat = [a.anyag, a.vaz && ('Váz: ' + a.vaz), a.szin && ('Szín: ' + a.szin), a.elzaras && ('Él: ' + a.elzaras), a.vasalat && ('Vasalat: ' + a.vasalat), a.karpit && ('Kárpit: ' + a.karpit)].filter(Boolean);
      h += `<td class="mono">${esc(dims(a)) || '<span class="faint">nincs megadva</span>'}${a.meret_megjegyzes ? `<div class="orig">${esc(a.meret_megjegyzes)}</div>` : ''}</td>
        <td>${mat.map(esc).join('<br>')}</td>
        <td>${makerSelect(it)}<div class="orig">${esc(a.gyarto_indok || '')}</div><div class="conf" title="Mennyire egyértelmű a leírás az árazáshoz"><i style="width:${Math.max(0, Math.min(100, a.biztonsag || 0))}%"></i></div></td>
        <td>${notesOf(it).map(n => `<div class="note"><span class="badge warn">${NOTE_TYPES[n.tipus] || esc(n.tipus)}</span> ${esc(n.szoveg)}${n.idezet ? `<div class="q-inline ${Parse.quoteInItem(it, n.idezet) ? '' : 'unv'}">„${esc(n.idezet)}”</div>` : ''}</div>`).join('') || '<span class="badge ok">Rendben</span>'}</td></tr>`;
    }
    h += `</tbody></table></div></div>`;
    el.innerHTML = h;
  }

  /* ---------- Gyártási bontás ---------- */
  function viewSplit() {
    const el = $('#view-bontas');
    if (!items().some(i => st.ai[i.id])) { el.innerHTML = waiting('A gyártási bontás'); return; }
    let h = `<div class="view-head"><div><h2>Gyártási bontás</h2><p>Ki készíti az egyes tételeket. A vegyes (fémváz + lapanyag) tételek mindkét üzem listáján megjelennek. A besorolás a Tételek fülön átállítható.</p></div></div>`;
    const groups = [
      { k: 'fa', title: 'Faüzem', test: m => m === 'fa' || m === 'fa_fem' },
      { k: 'fem', title: 'Fémüzem', test: m => m === 'fem' || m === 'fa_fem' },
      { k: 'karpit', title: 'Kárpitos munka', test: m => m === 'karpit' },
      { k: 'beszallitoi', title: 'Beszállítói tételek (árajánlatot kell kérni)', test: m => m === 'beszallitoi' }
    ];
    for (const g of groups) {
      const list = items().filter(i => g.test(makerOf(i)));
      if (!list.length) continue;
      h += `<div class="card"><div class="card-h"><h3><span class="mk ${MAKERS[g.k].cls}">${g.title}</span></h3><span class="muted">${list.length} tétel · ${esc(qtyText(list))}</span>
        ${g.k === 'beszallitoi' ? '<button class="btn btn-sm" id="btn-rfq">Beszállítói ajánlatkérő szöveg másolása</button>' : ''}</div>
        <div class="tbl-wrap"><table class="compact"><thead><tr><th>Tétel</th><th>Megnevezés</th><th>Méret (mm)</th><th>${g.k === 'fem' ? 'Váz' : 'Anyag'}</th><th class="num">Menny.</th><th>Rész</th></tr></thead><tbody>
        ${list.map(i => { const a = st.ai[i.id]; return `<tr><td class="code">${esc(i.id)}</td><td>${esc(i.name)}${makerOf(i) === 'fa_fem' ? ' <span class="badge grey">vegyes</span>' : ''}</td><td class="mono">${esc(dims(a))}</td><td>${esc(g.k === 'fem' ? (a.vaz || a.anyag) : a.anyag)}</td><td class="num">${fmt(i.qty)} ${esc(i.unit)}</td><td class="muted">${esc(i.part)}</td></tr>`; }).join('')}
        </tbody></table></div></div>`;
    }
    el.innerHTML = h;
  }
  function rfqText() {
    const list = items().filter(i => makerOf(i) === 'beszallitoi');
    const title = st.tender ? st.tender.osszefoglalo.targy : 'ajánlatkérés';
    return `Tisztelt Partnerünk!\n\nAz alábbi tételekre kérünk árajánlatot (${title}).\nKérjük, tételenként adja meg a nettó egységárat, a szállítási határidőt és a megajánlott típust.\n\n` +
      list.map((i, n) => `${n + 1}. ${i.name}, ${fmt(i.qty)} ${i.unit}\n   ${i.spec}`).join('\n\n') + `\n\nKöszönettel:\nGarzon Bútor Zrt.`;
  }

  /* ---------- Ellenőrizendő ---------- */
  function viewCheck() {
    const el = $('#view-ellenorzes');
    const c = counts();
    if (!st.tender && !c.read) { el.innerHTML = waiting('Az ellenőrzés'); return; }
    let h = `<div class="view-head"><div><h2>Ellenőrizendő</h2><p>Ahol a kiírás ellentmondásos, hiányos, vagy a dokumentum olyat kér, ami a tételekben nem szerepel. Minden megállapítás mellett ott a szó szerinti idézet és a helye, hogy másodpercek alatt ellenőrizhető legyen.</p></div></div>`;
    h += `<h4 class="sec">A kiírás dokumentuma és a tételjegyzék összevetése${st.tender ? ` (${c.findings})` : ''}</h4>`;
    if (!st.tender) h += waiting('Az összevetés');
    else h += st.tender.ellenorzes.map((f, n) => `<div class="flag"><div class="flag-h"><span class="flag-id">E-${String(n + 1).padStart(2, '0')}</span><span class="flag-type">${FIND_TYPES[f.tipus] || ''}</span><span class="badge ${SEV[f.sulyossag].cls}">${SEV[f.sulyossag].label}</span><span class="flag-title">${esc(f.cim)}</span></div>
      <div class="flag-b one"><div><p>${esc(f.leiras)}</p>${quoteSrc(f.idezet, f.forras, f.erintett_tetelek)}
      ${f.erintett_tetelek.length ? `<p class="muted small">Érintett tételek: ${f.erintett_tetelek.map(id => { const it = itemById(id); return it ? `<span class="badge grey" title="${esc(it.name)}">${esc(id)} ${esc(it.name)}</span>` : ''; }).join(' ')}</p>` : ''}</div></div></div>`).join('') || '<div class="card"><div class="card-b muted">Nincs megállapítás.</div></div>';
    const noted = items().filter(i => notesOf(i).length);
    h += `<h4 class="sec">Tételszintű észrevételek (${c.notes})</h4><div class="card"><div class="tbl-wrap"><table><thead><tr><th>Tétel</th><th>Megnevezés</th><th>Észrevétel</th><th>Idézet a leírásból</th><th>Hely</th></tr></thead><tbody>
      ${noted.flatMap(it => notesOf(it).map(n => `<tr><td class="code">${esc(it.id)}</td><td>${esc(it.name)}</td><td><span class="badge warn">${NOTE_TYPES[n.tipus] || ''}</span> ${esc(n.szoveg)}</td><td class="muted">${n.idezet ? '„' + esc(n.idezet) + '”' : ''}</td><td class="muted nowrap">${esc(it.sheet)}, ${it.row}. sor</td></tr>`)).join('') || '<tr><td colspan="5" class="muted">Nincs tételszintű észrevétel.</td></tr>'}
      </tbody></table></div></div>`;
    el.innerHTML = h;
  }

  /* ---------- Kérdések ---------- */
  const cleanQ = s => String(s || '').replace(/^\s*Tisztelt\s+[^!,.]{0,40}[!,.]\s*/i, '');
  function questionsText() {
    const o = st.tender.osszefoglalo;
    return `Tisztelt Ajánlatkérő!\n\nA(z) „${o.targy}” tárgyú eljárásban az alábbi kiegészítő tájékoztatást kérjük:\n\n` +
      st.tender.kerdesek.map((q, n) => `${n + 1}. ${cleanQ(q.kerdes)}`).join('\n\n') + `\n\nVálaszukat előre is köszönjük.\n\nTisztelettel:\nGarzon Bútor Zrt.`;
  }
  function viewQuestions() {
    const el = $('#view-kerdesek');
    if (!st.tender) { el.innerHTML = waiting('A kérdéslista'); return; }
    let h = `<div class="view-head"><div><h2>Kérdések az ajánlatkérőnek</h2><p>Kiegészítő tájékoztatás-kérés vázlata. Küldés előtt az árajánlatadó átnézi és szerkeszti.</p></div><button class="btn btn-primary" id="btn-copy-q">Levél szövegének másolása</button></div>`;
    h += `<div class="grid g-main"><div class="card"><div class="card-b qs">${st.tender.kerdesek.map((q, n) => `<div class="q"><span class="q-n">${n + 1}.</span><div><p class="q-k">${esc(cleanQ(q.kerdes))}</p><p class="muted small">Miért kell: ${esc(q.miert)}${q.erintett_tetelek.length ? ' · Tételek: ' + q.erintett_tetelek.map(esc).join(', ') : ''}</p></div></div>`).join('')}</div></div>
      <div class="card"><div class="card-h"><h3>Levél vázlata</h3></div><div class="card-b"><pre class="mail-pre">${esc(questionsText())}</pre></div></div></div>`;
    el.innerHTML = h;
  }

  /* ---------- feldolgozás ---------- */
  async function api(path, body) {
    for (;;) {
      const r = await fetch('/api/' + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-demo-key': sessionStorage.getItem('demoKey') || '' }, body: JSON.stringify(body) });
      if (r.status === 401) {
        const pw = prompt('Jelszó a feldolgozáshoz:');
        if (!pw) throw new Error('Jelszó szükséges.');
        sessionStorage.setItem('demoKey', pw); continue;
      }
      const j = await r.json().catch(() => ({ error: 'Érvénytelen válasz a szervertől (' + r.status + ').' }));
      if (!r.ok) throw new Error(j.error || ('Hiba: ' + r.status));
      return j;
    }
  }
  async function runPart(p) {
    st.partStatus[p.no] = 'run'; render();
    try {
      const out = await api('items', { part: p.name, items: p.items.map(i => ({ id: i.id, name: i.name, spec: i.spec, qty: i.qty, unit: i.unit })) });
      for (const t of out.tetelek) if (itemById(t.id)) st.ai[t.id] = t;
      const missing = p.items.filter(i => !st.ai[i.id]).length;
      if (missing) throw new Error(missing + ' tételre nem érkezett értelmezés.');
      st.model = out.model; st.partStatus[p.no] = 'ok';
    } catch (e) { st.partStatus[p.no] = 'err'; st.partStatus['err' + p.no] = e.message; }
    render();
  }
  async function runTender() {
    st.tenderStatus = 'run'; st.tenderError = ''; render();
    try {
      const out = await api('tender', { docText: st.doc ? st.doc.text : '', docName: st.doc ? st.doc.fileName : '', items: items().map(i => ({ id: i.id, part: i.part, name: i.name, spec: i.spec, qty: i.qty, unit: i.unit })) });
      st.tender = { osszefoglalo: out.osszefoglalo, ellenorzes: out.ellenorzes || [], kerdesek: out.kerdesek || [] };
      st.tenderStatus = 'ok';
    } catch (e) { st.tenderStatus = 'err'; st.tenderError = e.message; }
    render();
  }
  async function pool(tasks, n) {
    const q = tasks.slice();
    await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await q.shift()(); }));
  }
  async function run() {
    if (!st.book || st.running) return;
    st.ai = {}; st.tender = null; st.partStatus = {}; st.tenderStatus = 'idle'; st.fromSaved = false;
    st.running = true; st.startedAt = Date.now(); st.elapsedMs = 0;
    const tick = setInterval(renderTimer, 500);
    render();
    await Promise.all([runTender(), pool(st.book.parts.map(p => () => runPart(p)), 10)]);
    clearInterval(tick);
    st.running = false; st.elapsedMs = Date.now() - st.startedAt;
    if (done() && st.tender) st.tab = 'osszefoglalo';
    render();
  }
  async function retry(which) {
    if (st.running) return;
    st.running = true; st.startedAt = Date.now() - st.elapsedMs;
    if (which === 'tender') await runTender(); else await runPart(st.book.parts.find(p => String(p.no) === String(which)));
    st.running = false; st.elapsedMs = Date.now() - st.startedAt; render();
  }

  /* ---------- fájlok ---------- */
  async function setFile(kind, file) {
    try {
      if (kind === 'sheet') {
        st.files.sheet = file; st.book = null; st.detecting = true; render();
        try { st.book = await Parse.readWorkbook(await file.arrayBuffer(), file.name, sheets => api('columns', { sheets })); } finally { st.detecting = false; }
        st.ai = {}; st.tender = null; st.partStatus = {}; st.tenderStatus = 'idle'; st.elapsedMs = 0;
        if (!st.book.items.length) { alert('Ebben a táblázatban nem találtam tételjegyzéket.' + (st.book.aiError ? ' (' + st.book.aiError + ')' : '')); st.book = null; st.files.sheet = null; }
      } else {
        st.doc = await Parse.readDocument(file); st.files.doc = file; st.docIndex = Parse.makeDocIndex(st.doc.text);
      }
    } catch (e) { alert(e.message); }
    render();
  }
  async function loadSample() {
    const get = async (url, name) => new File([await (await fetch(url)).blob()], name);
    await setFile('sheet', await get('minta/debrecen_artablazatok.xls', 'Ártáblázatok_1_10.xls'));
    await setFile('doc', await get('minta/debrecen_kozbeszerzesi_dok.docx', 'Közbeszerzési dok_1_10.docx'));
  }
  function snapshot() { return { v: 1, savedAt: new Date().toISOString(), book: st.book, doc: st.doc, ai: st.ai, tender: st.tender, elapsedMs: st.elapsedMs, model: st.model }; }
  function restore(s) {
    st = fresh(); Object.assign(st, { book: s.book, doc: s.doc, ai: s.ai, tender: s.tender, elapsedMs: s.elapsedMs, model: s.model, fromSaved: true });
    st.files = { sheet: { name: s.book.fileName }, doc: s.doc ? { name: s.doc.fileName } : null };
    st.docIndex = s.doc ? Parse.makeDocIndex(s.doc.text) : null;
    st.book.parts.forEach(p => { st.partStatus[p.no] = 'ok'; }); st.tenderStatus = s.tender ? 'ok' : 'idle';
    st.tab = 'osszefoglalo'; render();
  }
  root.App.snapshot = snapshot; root.App.rfqText = rfqText; root.App.questionsText = () => (st.tender ? questionsText() : '');
  root.App.helpers = { items, makerOf, notesOf, dims, counts, NOTE_TYPES, SEV, FIND_TYPES };

  /* ---------- események ---------- */
  const copy = (text, btn) => navigator.clipboard.writeText(text).then(() => { const t = btn.textContent; btn.textContent = 'Kimásolva'; setTimeout(() => { btn.textContent = t; }, 1500); });
  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.tab) { st.tab = t.dataset.tab; render(); window.scrollTo(0, 0); }
    else if (t.classList.contains('q-open')) openSource(t.dataset);
    else if (t.id === 'btn-run') run();
    else if (t.id === 'btn-sample') loadSample();
    else if (t.id === 'btn-saved') fetch('data/mentett.json').then(r => r.json()).then(restore).catch(() => alert('A mentett eredmény nem tölthető be.'));
    else if (t.id === 'btn-new') { if (!st.running) { st = fresh(); render(); } }
    else if (t.dataset.retry) retry(t.dataset.retry);
    else if (t.id === 'btn-copy-q') copy(questionsText(), t);
    else if (t.id === 'btn-rfq') copy(rfqText(), t);
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.type === 'file' && t.files[0]) setFile(t.closest('.drop').dataset.kind, t.files[0]);
    else if (t.dataset.maker) { st.ai[t.dataset.maker].gyarto = t.value; st.ai[t.dataset.maker].gyarto_indok = 'Kézzel átállítva.'; render(); }
    else if (t.id === 'f-part') { st.filter.part = t.value; render(); }
    else if (t.id === 'f-maker') { st.filter.maker = t.value; render(); }
    else if (t.id === 'f-notes') { st.filter.onlyNotes = t.checked; render(); }
  });
  ['dragover', 'drop'].forEach(ev => document.addEventListener(ev, e => {
    const d = e.target.closest && e.target.closest('.drop'); if (!d) return;
    e.preventDefault();
    if (ev === 'drop' && e.dataTransfer.files[0]) setFile(d.dataset.kind, e.dataTransfer.files[0]);
  }));
  // Ctrl+Shift+S: a feldolgozott eredmény mentése JSON-ba (ebből lesz a data/mentett.json tartalék).
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's' && st.book) {
      e.preventDefault();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot())], { type: 'application/json' })); a.download = 'mentett.json'; a.click();
    }
  });

  render();
})(window);
