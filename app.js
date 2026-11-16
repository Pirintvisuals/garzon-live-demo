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
    { id: 'osszefoglalo', label: 'Eredmény' },
    { id: 'ellenorzes', label: 'Hibák a kiírásban' },
    { id: 'kerdesek', label: 'Kérdések' },
    { id: 'tetelek', label: 'Tételek' },
    { id: 'bontas', label: 'Ki gyártja' },
    { id: 'arazas', label: 'Árazás' },
    { id: 'revizio', label: 'Módosítás érkezett' }
  ];
  // Minden résznek saját színe van: ugyanaz a szín a folyamatábrán, a fülön és az oldal tetején.
  const SEC = { feltoltes: '#5d6873', osszefoglalo: '#2f5866', ellenorzes: '#b7791f', kerdesek: '#2b6cb0', tetelek: '#4a5568', bontas: '#a8763e', arazas: '#2c6845', revizio: '#6b4f9a' };
  // Mire jó az oldal, és mit érdemes rajta csinálni.
  const GUIDE = {
    osszefoglalo: ['Egy pillantásra: mit talált a program ebben az ajánlatkérésben.', 'Nézze át a négy kártyát. Lent a vezetésnek szóló rész: a szerződés feltételei és kockázatai alapján érdemes-e ajánlatot adni.'],
    ellenorzes: ['Hol hibás vagy ellentmondásos az ajánlatkérő listája. Ha ez rejtve marad, rossz terméket áraznak be.', 'A „Forrás” gombbal nyissa meg az eredeti szöveget, és döntse el, melyik hibára kell rákérdezni.'],
    kerdesek: ['A talált hibákból kész levél az ajánlatkérőnek (kiegészítő tájékoztatás-kérés).', 'Olvassa át, másolja ki, szerkessze, és küldje el.'],
    tetelek: ['Az ajánlatkérő szabad szöveges leírásai rendezve: méret, anyag, szín külön oszlopban.', 'Ellenőrizze a tételeket. A „Gyártás” oszlopban átállítható, ki készíti.'],
    bontas: ['Melyik üzem mit gyárt, és mit kell beszállítótól megvenni.', 'Adja tovább a listákat az üzemeknek. A beszállítói tételekhez kész az ajánlatkérő szöveg.'],
    arazas: ['Első árvázlat tételtípusonként: katalógus, beszállítói, saját gyártás, egyedi. Mintaárakkal: azt mutatja, hogyan készülne.', 'Nyisson meg egy „Számítás” gombot, és állítsa a haszon és a kockázati felár mértékét. A végső árat mindig a kolléga hagyja jóvá.'],
    revizio: ['Ha az ajánlatkérő később javított tételjegyzéket küld: pontosan mi változott?', 'Töltse fel az új táblázatot. A változások tételenként, színnel jelölve látszanak.']
  };
  // Mi lenne más az éles, a Garzonra szabott rendszerben (oldalanként egy-két sor, ígéret nélkül).
  const LIVE = {
    osszefoglalo: 'Az Önök saját fájljain fut, nem előre lefuttatott mintán. Az „érdemes-e indulni” szempontjait (például kötbér, határidő, minimális összeg) Önök adják meg.',
    ellenorzes: 'A kollégák jelölik, melyik találat volt valódi hiba és melyik nem. Ez alapján finomítjuk a szabályokat és a valószínűségeket az Önök kiírásaira.',
    kerdesek: 'Az Önök levélsablonjával készül, és a kolléga pipálja ki, melyik kérdés menjen el.',
    tetelek: 'A tételeket az Önök termékeihez és termékkódjaihoz párosítja, a gyártási besorolást pedig az Önök üzemeihez igazítjuk.',
    bontas: 'A listák abban a formában mennek tovább, ahogy az üzemek és a beszállítók ma is kapják (például Excel).',
    arazas: 'A mintaárak helyére az Önök árlistája, anyagárai és kalkulációs szabályai kerülnek, így az árvázlat az Önök árszintjén készül.',
    revizio: 'Az árazott ajánlatban is megjelöli, mely tételek árát kell a módosítás miatt újraszámolni.'
  };
  const IMPACT = { igen: { label: 'Árat érinti', cls: 'neg' }, lehet: { label: 'Árat érintheti', cls: 'warn' }, nem: { label: 'Csak pontosítás', cls: 'grey' } };

  // Minták: nyilvános közbeszerzések dokumentumai.
  const SAMPLES = {
    szeged: {
      sheet: ['minta/szeged_tetelegyzek_eredeti.xlsx', '1_sz_melleklet_butor-fin.xlsx'],
      docs: [['minta/szeged_szerzodestervezet.pdf', 'Adásvételi szerződés bútor RRF SZSZC.pdf']],
      rev: ['minta/szeged_tetelegyzek_2026-09-23.xlsx', '1_sz_melleklet_butor-260923.xlsx'],
      revLabel: 'A 3. kiegészítő tájékoztatással kiadott tételjegyzék (2026.09.23.)'
    },
    debrecen: {
      sheet: ['minta/debrecen_artablazatok.xls', 'Ártáblázatok_1_10.xls'],
      docs: [['minta/debrecen_kozbeszerzesi_dok.docx', 'Közbeszerzési dok_1_10.docx']]
    }
  };

  const fresh = () => ({
    sample: '', rev: null, prices: {}, pricing: { margin: 12, risk: 0, open: {} }, todo: {}, replay: null, replayed: false, chatCache: {}, chat: { open: false, msgs: [], draft: '' },
    tab: 'feltoltes', files: { sheet: null, doc: null }, book: null, doc: null, docIndex: null,
    ai: {}, tender: null, partStatus: {}, tenderStatus: 'idle', tenderError: '',
    docs: [], reading: '', running: false, startedAt: 0, elapsedMs: 0, model: '', filter: { maker: '', part: '', onlyNotes: false }, fromSaved: false
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
      errors: all.reduce((s, i) => s + notesOf(i).filter(n => n.tipus !== 'hiany').length, 0),
      findings: st.tender ? st.tender.ellenorzes.length : 0,
      questions: st.tender ? st.tender.kerdesek.length : 0
    };
  }

  /* ---------- keret ---------- */
  function renderChrome() {
    const c = counts();
    $('#tabs').innerHTML = TABS.map(t => {
      // A füleken csak a lépés sorszáma látszik; a darabszámok az oldalakon vannak (két szám egymás mellett összezavaró volt).
      const cnt = '';
      const disabled = t.id !== 'feltoltes' && !st.book;
      return `<button class="tab" role="tab" data-tab="${t.id}" style="--sec:${SEC[t.id]}" aria-selected="${st.tab === t.id}" ${disabled ? 'disabled' : ''}><span class="tn">${TABS.indexOf(t) + 1}</span>${t.label}${cnt}</button>`;
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
    if (ms) el.textContent = (st.running ? 'Feldolgozás: ' : 'Feldolgozva: ') + (ms / 1000).toFixed(st.running ? 0 : 1).replace('.', ',') + ' mp' + (!st.running && st.replayed ? ' (minta, korábbi futás)' : '');
  }

  function render() {
    renderChrome();
    ({ feltoltes: viewUpload, osszefoglalo: viewBrief, tetelek: viewItems, bontas: viewSplit, ellenorzes: viewCheck, kerdesek: viewQuestions, arazas: viewPricing, revizio: viewRevision })[st.tab]();
    decorate();
    renderChat();
  }
  // Az aktív oldal kerete: felül, mire jó és mit érdemes tenni; alul, mi a következő lépés.
  function decorate() {
    const el = $('#view-' + st.tab), g = GUIDE[st.tab];
    el.style.setProperty('--sec', SEC[st.tab]);
    if (!g || !st.book) return;
    const idx = TABS.findIndex(t => t.id === st.tab), next = TABS[idx + 1];
    el.classList.add('guided');
    el.insertAdjacentHTML('afterbegin', `<div class="guide"><span class="g-n">${idx + 1}</span><div><div class="g-what">${esc(g[0])}</div><div class="g-do"><b>Mit tegyen itt:</b> ${esc(g[1])}</div>${LIVE[st.tab] ? `<div class="g-live"><b>Az éles rendszerben:</b> ${esc(LIVE[st.tab])}</div>` : ''}</div></div>`);
    el.insertAdjacentHTML('beforeend', next
      ? `<div class="nextbar" style="--sec:${SEC[next.id]}"><span>Következő lépés</span><button class="btn nextbtn" data-tab="${next.id}"><span class="tn">${idx + 2}</span>${next.label} →</button></div>`
      : `<div class="nextbar"><span>Ez az utolsó lépés. Az előkészített munkafüzet a jobb felső gombbal letölthető, az árazás abban folytatható.</span></div>`);
  }

  const waiting = what => `<div class="card"><div class="card-b empty">${st.running ? '<span class="spin"></span> ' + what + ' készül…' : 'Még nincs feldolgozott adat. Indítsa el a feldolgozást a Feltöltés fülön.'}</div></div>`;

  /* ---------- Feltöltés ---------- */
  function viewUpload() {
    const c = counts();
    const f = st.files;
    let h = `<div class="view-head"><div><h2>Ajánlatkérés feltöltése</h2>
      <p>Két fájl kell: a tételjegyzék (Excel) és a kiírás dokumentuma (PDF vagy Word: műszaki leírás, szerződéstervezet). A program beolvassa a tételeket, oszlopokra bontja a leírásokat, szétosztja őket gyártás szerint, összeveti a dokumentummal, és előkészíti a kérdéseket. Ár nem kerül bele.</p></div></div>`;
    const outBtn = (id, title, sub) => `<button class="fl-out" style="--sec:${SEC[id]}" data-tab="${id}" ${st.book ? '' : 'disabled'}><b>${title}</b><span>${sub}</span></button>`;
    h += `<div class="flow">
      <div class="fl-col"><div class="fl-h">Amit az ajánlatkérő küld</div>
        <div class="fl-in ${f.sheet ? 'ok' : ''}"><b>Tételjegyzék (Excel)</b><span>mit kér, hány darabot; az árak üresek</span></div>
        <div class="fl-in ${f.doc ? 'ok' : ''}"><b>Feltételek (PDF, Word)</b><span>határidő, fizetés, kötbér, jótállás</span></div></div>
      <div class="fl-arrow">→</div>
      <div class="fl-mid"><b>A program végigolvassa</b><span>kb. 1 perc</span></div>
      <div class="fl-arrow">→</div>
      <div class="fl-col wide"><div class="fl-h">Amit Ön kap, ellenőrzésre</div><div class="fl-outs">
        ${outBtn('ellenorzes', 'Hibák a kiírásban', 'ellentmondás, elírás, hiány')}
        ${outBtn('kerdesek', 'Kérdések', 'kész levél az ajánlatkérőnek')}
        ${outBtn('tetelek', 'Rendezett tételek', 'méret, anyag, szín oszlopokban')}
        ${outBtn('bontas', 'Ki gyártja', 'faüzem, fémüzem, beszállító')}
        ${outBtn('arazas', 'Árbecslés és Excel', 'ebben folytatódik az árazás')}</div></div>
      <div class="fl-arrow">→</div>
      <div class="fl-end"><b>Az árajánlatadó áraz</b><span>Árat a program nem ad.</span></div>
    </div>`;
    h += `<div class="grid g2">
      <label class="drop ${f.sheet ? 'has' : ''}" data-kind="sheet"><input type="file" accept=".xls,.xlsx,.xlsm,.csv" hidden>
        <div class="drop-t">1. Tételjegyzék (Excel)</div>
        <div class="drop-h">Az ajánlatkérő táblázata arról, mit kér és hány darabot. Az ároszlopok üresek: azokat kell majd kitölteni az ajánlathoz.</div>
        <div class="drop-f">${f.sheet ? esc(f.sheet.name) + (st.book ? ` <button class="opn" data-open-sheet="${esc(st.book.parts[0].sheet)}" title="A táblázat megnyitása">Megnyitás</button>` : '') + (st.running ? '' : ' <button class="rm" data-remove="sheet" title="Fájl eltávolítása">Eltávolítás</button>') : 'Húzza ide, vagy kattintson (.xls, .xlsx)'}</div>
        ${st.detecting ? '<div class="drop-s"><span class="spin"></span> A táblázat szerkezetének felismerése…</div>' : ''}
        ${st.book ? `<div class="drop-s">${st.book.sheetCount} munkalap, ebből ${c.parts} tartalmaz tételeket · ${c.items} tétel · ${esc(qtyText(items()))}</div>${st.book.usedAi ? colInfo() : ''}` : ''}</label>
      <label class="drop ${f.doc ? 'has' : ''}" data-kind="doc"><input type="file" accept=".pdf,.docx,.txt" multiple hidden>
        <div class="drop-t">2. Feltételek (PDF vagy Word)</div>
        <div class="drop-h">A kiírás, a műszaki leírás, a szerződéstervezet: határidő, fizetés, kötbér, jótállás. Nem kötelező, de ebből lesz a vezetői összefoglaló.</div>
        <div class="drop-f">${st.docs.length ? st.docs.map(d => `<div>${esc(d.fileName)} <button class="opn" data-open-doc="${esc(d.fileName)}" title="A dokumentum megnyitása">Megnyitás</button>${st.running ? '' : ` <button class="rm" data-remove="doc" data-name="${esc(d.fileName)}" title="Fájl eltávolítása">Eltávolítás</button>`}</div>`).join('') : 'Húzza ide, vagy kattintson (.pdf, .docx), több fájl is lehet'}</div>
        ${st.reading ? `<div class="drop-s"><span class="spin"></span> ${esc(st.reading)}</div>` : ''}
        ${st.doc ? `<div class="drop-s">${st.docs.length} dokumentum · ${st.docIndex.paras.length.toLocaleString('hu-HU')} bekezdés${st.docs.some(d => d.scanned) ? ' · szkennelt PDF szövegfelismeréssel' : ''}</div>${st.docs.filter(d => d.failedPages && d.failedPages.length).map(d => `<div class="drop-i">${esc(d.fileName)}: ${d.failedPages.length} oldal nem volt olvasható (${d.failedPages.join(', ')}. oldal).</div>`).join('')}` : ''}</label>
    </div>`;
    h += `<div class="card"><div class="card-b actions">
      <button class="btn btn-primary btn-lg" id="btn-run" ${st.book && !st.running ? '' : 'disabled'}>${st.running ? 'Feldolgozás folyamatban…' : (done() ? 'Feldolgozás újra' : 'Feldolgozás indítása')}</button>
      <span class="muted small">Nincs kéznél fájl? Próbálja ki egy valódi, nyilvános közbeszerzésen:</span>
      <button class="btn ${st.sample === 'szeged' ? 'on' : ''}" data-sample="szeged" ${st.running ? 'disabled' : ''}>${st.sample === 'szeged' ? '✓ Betöltve: ' : 'Minta: '}Szegedi Szakképzési Centrum, bútorbeszerzés 2026</button>
      <button class="btn btn-sm ${st.sample === 'debrecen' ? 'on' : ''}" data-sample="debrecen" ${st.running ? 'disabled' : ''}>${st.sample === 'debrecen' ? '✓ Betöltve: ' : 'Másik minta: '}Debrecen, 2018</button>
      <button class="btn" id="btn-saved" hidden>Korábban feldolgozott eredmény megnyitása</button>
    </div></div>`;
    if (st.book && (st.running || c.read || st.tenderStatus !== 'idle')) {
      h += `<div class="card"><div class="card-h"><h3>Feldolgozás állapota</h3><span class="muted">${c.read} / ${c.items} tétel értelmezve</span></div><div class="card-b">
        <div class="bar big"><i style="width:${c.items ? Math.round(100 * c.read / c.items) : 0}%"></i></div>
        ${canReplay() || st.replayed ? '<p class="muted small" style="margin:10px 0 0">A beépített minta előre feldolgozott eredményt játszik vissza (az eredeti feldolgozás ideje a jobb felső sarokban). Saját fájl feltöltésekor a feldolgozás élőben fut.</p>' : ''}
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
      if (loc.found) { ok = true; where = loc.para ? esc(paraLabel(loc.para)) : esc(st.doc.fileName); if (loc.para) attr = `data-para="${loc.para}"`; }
    }
    if (!ok) {
      const hit = (relatedIds && relatedIds.length ? relatedIds.map(itemById).filter(Boolean) : items()).find(it => Parse.quoteInItem(it, quote));
      if (hit) { ok = true; where = `${esc(hit.sheet)} munkalap, ${hit.row}. sor (tétel ${esc(hit.id)})`; attr = `data-item="${esc(hit.id)}"`; }
    }
    return `<div class="quote ${ok ? '' : 'unv'}"><span class="q-text">„${esc(quote)}”</span>${ok
      ? `<button class="q-src q-open" ${attr} data-quote="${esc(quote)}" title="Megnyitás a forrásban">Forrás: ${where} ›</button>`
      : '<span class="q-src">Az idézet szó szerint nem található a forrásban, kérjük ellenőrizze.</span>'}</div>`;
  }
  /* ---------- Teendők: mit kell tenni ezzel az ajánlatkéréssel (az eredményekből összeállítva) ---------- */
  function todoList() {
    const all = items(), n = test => all.filter(i => test(makerOf(i))).length;
    const blocked = [...new Set(errorNotes().filter(e => e.p >= 50).map(e => e.it.id))].length;
    const work = [];
    if (st.tender && st.tender.kerdesek.length) work.push({ id: 'w-kerdes', text: `${st.tender.kerdesek.length} kérdés elküldése az ajánlatkérőnek`, hint: 'A levél vázlata kész; a kiegészítő tájékoztatás kérésének határideje a kiírásban szerepel.', tab: 'kerdesek' });
    if (blocked) work.push({ id: 'w-hiba', text: `${blocked} hibás vagy ellentmondásos tétel tisztázása árazás előtt`, hint: 'Ezeket a válasz megérkezéséig érdemes feltételesen árazni.', tab: 'ellenorzes' });
    if (n(m => m === 'beszallitoi')) work.push({ id: 'w-besz', text: `Beszállítói árajánlat bekérése ${n(m => m === 'beszallitoi')} tételre`, hint: 'Az ajánlatkérő szöveg kimásolható.', tab: 'bontas' });
    if (n(m => m === 'fa' || m === 'fa_fem')) work.push({ id: 'w-fa', text: `Faüzem: ${n(m => m === 'fa' || m === 'fa_fem')} tétel árazása`, tab: 'bontas' });
    if (n(m => m === 'fem' || m === 'fa_fem')) work.push({ id: 'w-fem', text: `Fémüzem: ${n(m => m === 'fem' || m === 'fa_fem')} tétel árazása`, tab: 'bontas' });
    if (n(m => m === 'karpit')) work.push({ id: 'w-karpit', text: `Kárpitos munka: ${n(m => m === 'karpit')} tétel árazása`, tab: 'bontas' });
    work.push({ id: 'w-excel', text: 'Az előkészített munkafüzet letöltése és az árak beírása', hint: 'Jobb felső gomb: Munkafüzet letöltése (Excel).' });
    const docs = st.tender ? st.tender.osszefoglalo.csatolando.map((x, i) => ({ id: 'd-' + i, text: x })) : [];
    return { work, docs };
  }
  function todoHtml() {
    const { work, docs } = todoList();
    const row = t => `<label class="todo ${st.todo[t.id] ? 'done' : ''}"><input type="checkbox" data-todo="${t.id}" ${st.todo[t.id] ? 'checked' : ''}><span><span class="td-t">${esc(t.text)}</span>${t.hint ? `<span class="td-h">${esc(t.hint)}</span>` : ''}</span>${t.tab ? `<button class="btn btn-sm" data-tab="${t.tab}" style="--sec:${SEC[t.tab]}">Megnyitás</button>` : ''}</label>`;
    const total = work.length + docs.length, done = [...work, ...docs].filter(t => st.todo[t.id]).length;
    return `<h4 class="sec">Teendők ehhez az ajánlatkéréshez <span class="td-c">${done} / ${total} kész</span></h4>
      <div class="grid g2"><div class="card"><div class="card-h"><h3>Munka</h3></div><div class="card-b todos">${work.map(row).join('')}</div></div>
      <div class="card"><div class="card-h"><h3>Az ajánlathoz csatolandó dokumentumok</h3></div><div class="card-b todos">${docs.map(row).join('') || '<span class="muted">A dokumentum nem sorol fel csatolandó iratot.</span>'}</div></div></div>`;
  }
  function viewBrief() {
    const el = $('#view-osszefoglalo');
    if (!st.tender) { el.innerHTML = st.tenderStatus === 'err' ? `<div class="card"><div class="card-b empty neg-t">${esc(st.tenderError)}</div></div>` : waiting('A vezetői összefoglaló'); return; }
    const o = st.tender.osszefoglalo, c = counts();
    const byMaker = Object.keys(MAKERS).map(k => ({ k, n: items().filter(i => makerOf(i) === k).length, q: qtyText(items().filter(i => makerOf(i) === k)) })).filter(x => x.n);
    let h = `<div class="view-head"><div><h2>${esc(o.targy)}</h2><p>${esc(o.ajanlatkero)}${o.eljaras ? ' · ' + esc(o.eljaras) : ''}</p></div></div>`;
    const allF = allFindings(), sure = allF.filter(x => x.p >= 50), top = sure.slice(0, 3);
    const fTitle = x => x.kind === 'item' ? (x.its.length > 1 ? x.its.length + ' tétel' : x.its[0].name.trim()) : x.f.cim;
    h += `<p class="lead" style="margin-bottom:14px">${esc(o.rovid_leiras)}</p>`;
    h += `<div class="hub">
      <div class="hubc warn"><div class="hub-n">${sure.length}</div><div class="hub-t">biztos vagy valószínű hibát talált a kiírásban${allF.length > sure.length ? `, és ${allF.length - sure.length} további pontot, amit érdemes megnézni` : ''}</div>
        <ul>${top.map(x => `<li><b>${esc(fTitle(x))}:</b> ${esc(x.kind === 'item' ? x.n.szoveg : x.f.leiras)} <span class="muted">(${x.p}%)</span></li>`).join('') || '<li class="muted">Nem talált valószínű hibát.</li>'}</ul>
        <button class="btn btn-primary" data-tab="ellenorzes">Mind megnézem</button></div>
      <div class="hubc"><div class="hub-n">${c.questions}</div><div class="hub-t">kérdést készített elő az ajánlatkérőnek</div>
        <ul>${st.tender.kerdesek.slice(0, 2).map(q => `<li>${esc(cleanQ(q.kerdes).slice(0, 150))}${cleanQ(q.kerdes).length > 150 ? '…' : ''}</li>`).join('')}</ul>
        <button class="btn" data-tab="kerdesek">Levél megnyitása</button></div>
      <div class="hubc"><div class="hub-n">${c.items}</div><div class="hub-t">tételt rendezett és osztott szét (${esc(qtyText(items()))})</div>
        <div class="makers col">${byMaker.map(x => `<span class="mk ${MAKERS[x.k].cls}"><b>${MAKERS[x.k].label}</b> ${x.n} tétel · ${esc(x.q)}</span>`).join('')}</div>
        <button class="btn" data-tab="bontas">Ki gyártja</button> <button class="btn" data-tab="tetelek">Tételek</button></div>
      <div class="hubc"><div class="hub-n">${st.elapsedMs ? Math.round(st.elapsedMs / 1000) + ' mp' : '–'}</div><div class="hub-t">alatt olvasta végig a ${c.items} tételt és ${st.docIndex ? st.docIndex.paras.length.toLocaleString('hu-HU') + ' bekezdésnyi' : 'a'} dokumentumot</div>
        <ul><li>Az árakat nem tölti ki: az árazás az Önök szakértelme.</li><li>Az előkészített Excel letölthető, abban folytatható a munka.</li></ul>
        <button class="btn" data-tab="arazas">Árazás</button></div>
    </div>
    ${todoHtml()}
    <h4 class="sec">A vezetésnek: feltételek és kockázatok a szerződésből</h4>`;
    h += `<div class="grid g-main"><div class="card"><div class="card-h"><h3>Feltételek, amelyek az árat és a kockázatot érintik</h3></div>
      <div class="tbl-wrap"><table><tbody>${o.feltetelek.map(f => `<tr><td class="k">${esc(f.nev)}</td><td>${esc(f.ertek)}${quoteSrc(f.idezet, 'dokumentum')}</td></tr>`).join('')}</tbody></table></div></div>
      <div><div class="card"><div class="card-h"><h3>Kockázatok</h3></div><div class="card-b risks">
      ${o.kockazatok.map(k => `<div class="risk"><span class="badge ${SEV[k.sulyossag].cls}">${SEV[k.sulyossag].label}</span><div><b>${esc(k.cim)}</b><p>${esc(k.leiras)}</p>${quoteSrc(k.idezet, 'dokumentum')}</div></div>`).join('') || '<span class="muted">Nincs kiemelt kockázat.</span>'}</div></div></div></div>`;
    el.innerHTML = h;
  }

  /* ---------- forrásnézet: az idézet a saját helyén, a környezetével ---------- */
  // Egy bekezdés helye: fájlnév és oldalszám (PDF), vagy bekezdésszám.
  function paraLabel(n) {
    const m = (st.docIndex.meta && st.docIndex.meta[n - 1]) || {};
    return (m.file || st.doc.fileName) + ', ' + (m.page ? m.page + '. oldal' : n + '. bekezdés');
  }
  function mark(text, quote) {
    const i = text.toLowerCase().indexOf(String(quote || '').toLowerCase().trim());
    if (i < 0 || !quote) return `<mark>${esc(text)}</mark>`;
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + quote.trim().length)) + '</mark>' + esc(text.slice(i + quote.trim().length));
  }
  function openSource(d) {
    let title = '', body = '';
    if (d.para) {
      const n = Number(d.para), P = st.docIndex.paras;
      title = esc(paraLabel(n).replace(', ', ' · '));
      for (let i = Math.max(1, n - 2); i <= Math.min(P.length, n + 2); i++)
        body += `<p class="${i === n ? 'hit' : 'ctx'}"><span class="pn">${i}.</span>${i === n ? mark(P[i - 1], d.quote) : esc(P[i - 1])}</p>`;
    } else if (d.item) {
      const it = itemById(d.item); if (!it) return;
      title = `${esc(st.book.fileName)} · ${esc(it.sheet)} munkalap · ${it.row}. sor`;
      body = `<table class="compact"><thead><tr><th>Ssz.</th><th>Megnevezés</th><th>Leírás</th><th class="num">Mennyiség</th></tr></thead><tbody><tr><td>${esc(it.no)}</td><td>${mark(it.name, d.quote).replace(/^<mark>(.*)<\/mark>$/, '$1')}</td><td>${mark(it.spec, d.quote).replace(/^<mark>(.*)<\/mark>$/, '$1')}</td><td class="num">${fmt(it.qty)} ${esc(it.unit)}</td></tr></tbody></table>`;
    } else return;
    // Gomb az eredeti fájlhoz: a táblázat sora kiemelve, illetve a PDF a megfelelő oldalon.
    let open = '';
    if (d.item) { const it = itemById(d.item); open = `<button class="btn btn-sm" data-open-sheet="${esc(it.sheet)}" data-row="${it.row}">Megnyitás a teljes táblázatban</button>`; }
    else { const mt = (st.docIndex.meta && st.docIndex.meta[Number(d.para) - 1]) || {}; if (mt.file) open = `<button class="btn btn-sm" data-open-doc="${esc(mt.file)}" data-page="${mt.page || ''}">Megnyitás az eredeti dokumentumban${mt.page ? ' (' + mt.page + '. oldal)' : ''}</button>`; }
    showModal(title, body, `<span>Ez a feltöltött fájl eredeti szövege, változtatás nélkül.</span>${open}`);
  }
  function showModal(title, body, foot, wide) {
    const m = document.createElement('div');
    m.className = 'modal'; m.innerHTML = `<div class="modal-box${wide ? ' wide' : ''}"><div class="modal-h"><h3>${title}</h3><button class="btn btn-sm" data-close>Bezárás</button></div><div class="modal-b">${body}</div><div class="modal-f mf-row">${foot || ''}</div></div>`;
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) m.remove(); });
    document.body.appendChild(m);
    return m;
  }

  /* ---------- az eredeti, feltöltött fájlok megnyitása ---------- */
  // A fájlok a böngészőben maradnak (nem kerülnek a mentett eredménybe); a mintánál szükség esetén újra letöltjük.
  const rawFiles = {};
  // A minta fájljainak saját webcíme (így a böngésző a valódi fájlként nyitja meg, a helyes típussal).
  function sampleUrlOf(name) {
    for (const k of Object.keys(SAMPLES)) {
      const S = SAMPLES[k], hit = [S.sheet, ...(S.docs || []), S.rev].filter(Boolean).find(x => x[1] === name);
      if (hit) return hit[0];
    }
    return '';
  }
  async function getRaw(name) {
    if (rawFiles[name]) return rawFiles[name];
    const url = sampleUrlOf(name);
    if (url) { rawFiles[name] = await getFile(url, name); return rawFiles[name]; }
    return null;
  }
  const MIME = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  // Letölthető / megnyitható cím: a mintánál a fájl saját címe, feltöltött fájlnál a helyes típusú helyi cím.
  async function fileUrl(name) {
    const u = sampleUrlOf(name); if (u) return u;
    const f = await getRaw(name); if (!f) return '';
    const ext = (name.split('.').pop() || '').toLowerCase();
    return URL.createObjectURL(new Blob([f], { type: MIME[ext] || f.type || 'application/octet-stream' }));
  }
  async function openSheet(sheetName, row) {
    const f = await getRaw(st.book.fileName);
    if (!f) { alert('Az eredeti táblázat ebben a munkamenetben nem érhető el. Töltse fel újra.'); return; }
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', codepage: 1250 });
    const name = wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', blankrows: true });
    let last = rows.length; while (last > 0 && !(rows[last - 1] || []).some(c => String(c).trim())) last--;
    const width = Math.max(1, ...rows.slice(0, last).map(r => { let w = r.length; while (w > 0 && !String(r[w - 1]).trim()) w--; return w; }));
    const tabs = wb.SheetNames.map(s => `<button class="chip ${s === name ? 'on' : ''}" data-open-sheet="${esc(s)}">${esc(s)}</button>`).join('');
    const body = `<div class="sv-tabs">${tabs}</div><div class="sv-wrap"><table class="sv"><tbody>${rows.slice(0, last).map((r, i) =>
      `<tr${i + 1 === Number(row) && name === sheetName ? ' class="sv-hit" id="sv-hit"' : ''}><th>${i + 1}</th>${Array.from({ length: width }, (_, c) => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    document.querySelectorAll('.modal').forEach(x => x.remove());
    const dl = await fileUrl(st.book.fileName);
    const m = showModal(`${esc(st.book.fileName)} · ${esc(name)} munkalap`, body, `<span>Az ajánlatkérő eredeti táblázata, változtatás nélkül.</span>${dl ? `<a class="btn btn-sm" href="${esc(dl)}" download="${esc(st.book.fileName)}">Letöltés és megnyitás Excelben</a>` : ''}`, true);
    const hit = m.querySelector('#sv-hit'); if (hit) hit.scrollIntoView({ block: 'center' });
  }
  async function openDoc(name, page) {
    const hash = page ? '#page=' + page : '';
    // A minta PDF-je a saját címén nyílik meg (azonnal, hogy a böngésző ne tiltsa le az új lapot).
    const su = sampleUrlOf(name);
    if (su && /\.pdf$/i.test(name)) { window.open(su + hash, '_blank'); return; }
    const doc = st.docs.find(x => x.fileName === name);
    if (/\.pdf$/i.test(name)) { const u = await fileUrl(name); if (u) { window.open(u + hash, '_blank'); return; } }
    if (!doc) { alert('Az eredeti dokumentum ebben a munkamenetben nem érhető el. Töltse fel újra.'); return; }
    const paras = String(doc.text || '').split(/\r?\n/).map(s => s.trim()).filter(s => s && !/^#{3,}/.test(s));
    showModal(esc(name), paras.map(p => `<p class="ctx">${esc(p)}</p>`).join(''), '<span>A dokumentum szövege, változtatás nélkül.</span>', true);
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
        <td>${notesOf(it).map(n => `<div class="note"><span class="badge warn">${NOTE_TYPES[n.tipus] || esc(n.tipus)}</span> ${esc(n.szoveg)}${n.idezet ? (Parse.quoteInItem(it, n.idezet) ? `<button class="q-inline q-open" data-item="${esc(it.id)}" data-quote="${esc(n.idezet)}" title="Megnyitás a forrásban">„${esc(n.idezet)}” <span class="q-go">Forrás ›</span></button>` : `<div class="q-inline unv">„${esc(n.idezet)}”</div>`) : ''}</div>`).join('') || '<span class="badge ok">Rendben</span>'}</td></tr>`;
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

  /* ---------- Ellenőrizendő: minden lehetséges hiba, valószínűség szerint ---------- */
  // Valószínűség: a modell adja (0-100). Régebbi eredménynél nincs ilyen mező: ott a súlyosságból becsüljük.
  const SEV_P = { magas: 75, kozepes: 55, alacsony: 35 };
  const probN = n => (Number.isFinite(n.valoszinuseg) ? n.valoszinuseg : 60);
  const probF = f => (Number.isFinite(f.valoszinuseg) ? f.valoszinuseg : (SEV_P[f.sulyossag] || 50));
  const errorNotes = () => items().flatMap(it => notesOf(it).filter(n => n.tipus !== 'hiany').map(n => ({ it, n, p: probN(n) }))).sort((x, y) => y.p - x.p);
  const missingNotes = () => items().flatMap(it => notesOf(it).filter(n => n.tipus === 'hiany').map(n => ({ it, n })));
  const PBANDS = [
    { min: 80, label: 'Szinte biztos hiba', cls: 'pb-hi', note: '80–100%' },
    { min: 50, label: 'Valószínű hiba', cls: 'pb-mid', note: '50–79%' },
    { min: 0, label: 'Érdemes megnézni', cls: 'pb-lo', note: '50% alatt: lehet szándékos vagy szokásos megfogalmazás' }
  ];
  const pband = p => PBANDS.find(b => p >= b.min);
  // Az összes találat egy listában: a tételek hibái (azonos szövegűek összevonva) és a dokumentum-összevetés megállapításai.
  function allFindings() {
    const groups = new Map();
    for (const { it, n, p } of errorNotes()) {
      const key = n.tipus + '|' + n.szoveg.trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, { kind: 'item', p, n, its: [] });
      const g = groups.get(key); g.its.push(it); g.p = Math.max(g.p, p);
    }
    // A dokumentum-összevetés néha megismétli egy tétel saját ellentmondását: ha ugyanazt a tételt ugyanazzal az idézettel érinti, nem mutatjuk kétszer.
    const nz = t => String(t || '').toLowerCase().replace(/\s+/g, ' ');
    const frs = t => nz(t).split(/\s*(?:\[\.{3}\]|\.{3,}|…)\s*/).filter(fr => fr.length >= 12);
    const overlap = (a, b) => frs(a).some(fr => nz(b).includes(fr)) || frs(b).some(fr => nz(a).includes(fr));
    const dup = f => f.erintett_tetelek.length === 1 && [...groups.values()].some(g => g.its.some(i => i.id === f.erintett_tetelek[0]) && overlap(g.n.idezet, f.idezet));
    const docs = st.tender ? st.tender.ellenorzes.map((f, i) => ({ kind: 'doc', p: probF(f), f, i })).filter(x => !dup(x.f)) : [];
    return [...groups.values(), ...docs].sort((x, y) => y.p - x.p);
  }
  const whyNot = (t, p) => (t && p < 80 ? `<p class="whynot"><b>Lehet, hogy mégsem hiba:</b> ${esc(t)}</p>` : '');
  function findingHtml(x) {
    const bd = pband(x.p);
    const why = (x.n || x.f).pont_indok;
    const pb = `<span class="pbadge ${bd.cls}" title="${esc(why ? 'Miért ennyi: ' + why : 'Mennyire valószínű, hogy tényleg hiba')}">${x.p}% valószínű</span>`;
    if (x.kind === 'item') {
      const first = x.its[0];
      const title = x.its.length > 1 ? `${x.its.length} tétel: ${x.its.map(i => esc(i.name.trim())).join(', ')}` : `${esc(first.name)} <span class="muted" style="font-weight:400">· ${fmt(first.qty)} ${esc(first.unit)}</span>`;
      return `<div class="flag ${bd.cls}"><div class="flag-h">${pb}<span class="flag-id">${x.its.map(i => esc(i.id)).join(', ')}</span><span class="flag-type">${NOTE_TYPES[x.n.tipus] || ''}</span><span class="flag-title">${title}</span></div>
        <div class="flag-b one"><div><p>${esc(x.n.szoveg)}</p>${whyNot(x.n.ha_megsem_hiba, x.p)}${quoteSrc(x.n.idezet, 'tetelegyzek', x.its.map(i => i.id))}</div></div></div>`;
    }
    const f = x.f;
    return `<div class="flag ${bd.cls}"><div class="flag-h">${pb}<span class="flag-id">E-${String(x.i + 1).padStart(2, '0')}</span><span class="flag-type">${FIND_TYPES[f.tipus] || ''}</span><span class="flag-title">${esc(f.cim)}</span></div>
      <div class="flag-b one"><div><p>${esc(f.leiras)}</p>${whyNot(f.ha_megsem_hiba, x.p)}${quoteSrc(f.idezet, f.forras, f.erintett_tetelek)}
      ${f.erintett_tetelek.length ? `<p class="muted small">Érintett tételek: ${f.erintett_tetelek.map(id => { const it = itemById(id); return it ? `<span class="badge grey" title="${esc(it.name)}">${esc(id)} ${esc(it.name)}</span>` : ''; }).join(' ')}</p>` : ''}</div></div></div>`;
  }
  function viewCheck() {
    const el = $('#view-ellenorzes');
    const c = counts();
    if (!st.tender && !c.read) { el.innerHTML = waiting('Az ellenőrzés'); return; }
    const all = allFindings(), miss = missingNotes();
    let h = `<div class="view-head"><div><h2>Hibák a kiírásban</h2><p>Minden, ami lehet, hogy hibás, valószínűség szerint rendezve.</p></div></div>`;
    h += `<div class="pbands">${PBANDS.map(bd => `<span class="pbadge ${bd.cls}">${bd.label}: ${all.filter(x => pband(x.p) === bd).length}</span>`).join('')}<span class="muted small">A program minden lehetséges hibát felvet, és megbecsüli, mennyire valószínű, hogy tényleg hiba. A „Forrás” gombbal ellenőrizhető.</span></div>`;
    for (const bd of PBANDS) {
      const list = all.filter(x => pband(x.p) === bd);
      if (!list.length) continue;
      h += `<h4 class="sec">${bd.label} <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">(${bd.note})</span></h4>` + list.map(findingHtml).join('');
    }
    if (!all.length) h += `<div class="card"><div class="card-b muted">${c.read ? 'Nem talált hibát.' : 'Készül…'}</div></div>`;
    h += `<h4 class="sec">Hiányzó adatok (${miss.length})</h4><div class="card"><div class="tbl-wrap"><table class="compact"><thead><tr><th>Tétel</th><th>Megnevezés</th><th>Mi hiányzik</th><th>Hely</th></tr></thead><tbody>
      ${miss.map(({ it, n }) => `<tr><td class="code">${esc(it.id)}</td><td>${esc(it.name)}</td><td>${esc(n.szoveg)}</td><td class="muted nowrap">${esc(it.sheet)}, ${it.row}. sor</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nincs hiányzó adat.</td></tr>'}
      </tbody></table></div></div>`;
    el.innerHTML = h;
  }


  /* ---------- Árazás: első árvázlat tételtípusonként, mintaárakkal (pricing.js) ---------- */
  const ft = n => Math.round(n).toLocaleString('hu-HU') + ' Ft';
  const priced = () => items().map(it => ({ it, p: Pricing.priceItem(it, st.ai[it.id], notesOf(it), st.pricing.margin, st.pricing.risk) }));
  const priceOf = it => { const p = Pricing.priceItem(it, st.ai[it.id], notesOf(it), st.pricing.margin, st.pricing.risk); return p.unit ? { avg: p.unit } : null; };
  function calcHtml(p) {
    if (p.type === 'gyartott') {
      return `<div class="calc"><table class="compact"><thead><tr><th>Anyag és munka</th><th class="num">Menny.</th><th class="num">Egységár</th><th class="num">Érték</th></tr></thead><tbody>
        ${p.mat.map(m => `<tr><td>${esc(m.name)}${m.note ? ` <span class="faint">(${esc(m.note)})</span>` : ''}</td><td class="num">${fmt(m.q)} ${esc(m.unit)}</td><td class="num">${ft(m.price)}</td><td class="num">${ft(m.q * m.price)}</td></tr>`).join('')}
        ${p.lab.map(l => `<tr><td>${esc(l.name)} munkaidő</td><td class="num">${fmt(l.h)} óra</td><td class="num">${ft(l.rate)}</td><td class="num">${ft(l.h * l.rate)}</td></tr>`).join('')}
        </tbody></table>
        <table class="compact sch"><tbody>${p.rows.map(r => `<tr><td>${esc(r[0])}</td><td class="num">${ft(r[1])}</td></tr>`).join('')}
        <tr class="sub"><td>Önköltség</td><td class="num">${ft(p.onkoltseg)}</td></tr>
        <tr><td>Haszon (${st.pricing.margin}%) és kockázati felár (${st.pricing.risk}%)</td><td class="num">${ft(p.unit - p.onkoltseg)}</td></tr>
        <tr class="total"><td>Nettó egységár (vázlat)</td><td class="num">${ft(p.unit)}</td></tr></tbody></table></div>`;
    }
    if (p.detail) return `<div class="calc"><table class="compact sch"><tbody>${p.detail.map(r => `<tr><td>${esc(r[0])}</td><td class="num">${ft(r[1])}</td></tr>`).join('')}<tr class="total"><td>Nettó egységár (vázlat)</td><td class="num">${ft(p.unit)}</td></tr></tbody></table></div>`;
    return '';
  }
  function viewPricing() {
    const el = $('#view-arazas');
    if (!items().some(i => st.ai[i.id])) { el.innerHTML = waiting('Az árvázlat'); return; }
    const all = priced(), T = Pricing.TYPES;
    const sum = list => list.reduce((s, x) => s + (x.p.unit || 0) * x.it.qty, 0);
    const byType = k => all.filter(x => x.p.type === k);
    let h = `<div class="view-head"><div><h2>Árazás: első árvázlat</h2></div></div>
      <div class="sample-note"><b>Minden szám mintaérték.</b> Ez az oldal azt mutatja meg, <b>hogyan</b> készülne el az első árvázlat tételtípusonként. Az éles változatban az Önök árlistája, normaidői és kalkulációs sémája kerülne ide, és minden árat a kolléga hagy jóvá.</div>`;
    h += `<div class="ptypes">${['katalogus', 'beszallitoi', 'gyartott', 'egyedi'].map(k => { const l = byType(k); return `<div class="ptype ${T[k].cls}"><div class="pt-n">${l.length}</div><div class="pt-l">${T[k].label}</div><div class="pt-h">${esc(T[k].how)}</div>${k === 'egyedi' ? '' : `<div class="pt-s">${ft(sum(l))}</div>`}</div>`; }).join('')}
      <div class="ptype t-piac"><div class="pt-l">Piaci döntés: mindig az Önöké</div><div class="pt-h">Haszon és kockázati felár (kötbér, határidő, verseny). A program ezt nem találja ki.</div>
        <label class="pin-l">Haszon <span><input class="pin sm" type="number" min="0" max="60" step="1" value="${st.pricing.margin}" data-pmargin> %</span></label>
        <label class="pin-l">Kockázati felár <span><input class="pin sm" type="number" min="0" max="40" step="1" value="${st.pricing.risk}" data-prisk> %</span></label></div></div>`;
    h += `<div class="ptotal"><div><span class="muted">Árvázlat összesen (nettó, mintaárakkal)</span><b>${ft(sum(all))}</b></div><div class="muted">${all.filter(x => x.p.unit).length} tételnek van vázlata · <b>${byType('egyedi').length} tételt a kolléga áraz</b> · szállítás és szerelés helyszínenként külön</div></div>`;
    h += `<div class="card"><div class="tbl-wrap"><table class="ptable"><thead><tr><th>Tétel</th><th>Megnevezés</th><th class="num">Menny.</th><th>Típus és módszer</th><th class="num">Egységár</th><th class="num">Összesen</th><th></th></tr></thead><tbody>`;
    let last = null;
    for (const { it, p } of all) {
      if (it.partNo !== last) { last = it.partNo; h += `<tr class="zone-row"><td colspan="7">${esc(it.part)}</td></tr>`; }
      const open = st.pricing.open[it.id];
      h += `<tr><td class="code">${esc(it.id)}</td><td><b>${esc(it.name)}</b></td><td class="num">${fmt(it.qty)} ${esc(it.unit)}</td>
        <td><span class="badge ${T[p.type].cls}">${T[p.type].label}</span> <span class="muted small">${esc(p.reason || T[p.type].how)}</span>${p.warn ? `<div class="warn-t small">⚠ ${esc(p.warn)}</div>` : ''}</td>
        <td class="num">${p.unit ? ft(p.unit) : '<span class="faint">kolléga</span>'}</td><td class="num">${p.unit ? ft(p.unit * it.qty) : ''}</td>
        <td>${p.unit ? `<button class="btn btn-sm" data-pcalc="${esc(it.id)}">${open ? 'Bezár' : 'Számítás'}</button>` : ''}</td></tr>`;
      if (open && p.unit) h += `<tr class="calc-row"><td></td><td colspan="6">${calcHtml(p)}</td></tr>`;
    }
    h += `</tbody></table></div></div>`;
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

  /* ---------- Revízió ---------- */
  // Szavankénti eltérés megjelenítése; a hosszú változatlan szakaszokat összecsukjuk.
  function diffHtml(a, b) {
    const ops = Diff.wordDiff(a, b), keep = 7;
    return ops.map(([o, t], n) => {
      if (o === '-') return `<del>${esc(t)}</del>`;
      if (o === '+') return `<ins>${esc(t)}</ins>`;
      const w = t.match(/\S+\s*/g) || [];
      if (w.length <= keep * 2 + 3) return `<span class="dq">${esc(t)}</span>`;
      const head = n === 0 ? [] : w.slice(0, keep), tail = n === ops.length - 1 ? [] : w.slice(-keep);
      return `<span class="dq">${esc(head.join(''))}<span class="gap">…</span>${esc(tail.join(''))}</span>`;
    }).join('');
  }
  // Mit jelzett a program ehhez a tételhez az eredeti kiírásnál (tételszintű észrevétel vs. kiírás-szintű megállapítás).
  function earlierFlags(id) {
    const it = itemById(id); if (!it) return [];
    const out = notesOf(it).map(n => n.szoveg);
    if (st.tender) st.tender.ellenorzes.forEach(f => { if ((f.erintett_tetelek || []).includes(id)) out.push(f.cim); });
    return out;
  }
  function viewRevision() {
    const el = $('#view-revizio');
    if (!st.book) { el.innerHTML = waiting('Az összevetés'); return; }
    const S = SAMPLES[st.sample];
    let h = `<div class="view-head"><div><h2>Revízió: módosított tételjegyzék összevetése</h2>
      <p>Ha az ajánlatkérő módosított tételjegyzéket ad ki (például kiegészítő tájékoztatás után), a program tételenként megmutatja, mi változott, és hogy ez érinti-e az árat. Nem kell a két táblázatot kézzel, soronként összenézni.</p></div></div>`;
    h += `<div class="grid g2"><label class="drop ${st.rev ? 'has' : ''}" data-kind="rev"><input type="file" accept=".xls,.xlsx,.xlsm" hidden>
        <div class="drop-t">Módosított tételjegyzék</div>
        <div class="drop-f">${st.rev ? esc(st.rev.fileName) + ' <button class="rm" data-remove="rev" title="Fájl eltávolítása">Eltávolítás</button>' : 'Húzza ide, vagy kattintson (.xls, .xlsx)'}</div>
        ${st.revReading ? '<div class="drop-s"><span class="spin"></span> Beolvasás és összevetés…</div>' : ''}
        ${st.rev ? `<div class="drop-s">Összevetve ezzel: ${esc(st.book.fileName)}</div>` : ''}</label>
      <div class="card"><div class="card-b">${S && S.rev
        ? `<p class="muted small" style="margin:0 0 10px">A mintához tartozó valódi módosítás: az ajánlatkérő az ajánlattevők kérdései után háromszor adott ki javított tételjegyzéket.</p><button class="btn" id="btn-rev-sample" ${st.revReading ? 'disabled' : ''}>Minta: ${esc(S.rev[1])}<br><span class="faint">${esc(S.revLabel)}</span></button>`
        : '<p class="muted small" style="margin:0">Töltse fel ugyanannak az ajánlatkérésnek egy későbbi, módosított tételjegyzékét.</p>'}</div></div></div>`;
    if (!st.rev) { el.innerHTML = h; return; }
    const ch = st.rev.changes, ai = st.rev.ai;
    const changed = ch.filter(c => c.kind === 'changed'), flagged = changed.filter(c => earlierFlags(c.id).length);
    const priced = ch.filter(c => ai[c.id] && ai[c.id].arat_erinti === 'igen').length;
    h += `<div class="kpis" style="margin-top:16px"><div class="kpi warn"><div class="l">Módosított tétel</div><div class="v">${changed.length}</div><div class="s">${items().length} tételből</div></div>
      <div class="kpi"><div class="l">Új / törölt tétel</div><div class="v">${ch.filter(c => c.kind === 'added').length} / ${ch.filter(c => c.kind === 'removed').length}</div><div class="s">a két változat között</div></div>
      <div class="kpi"><div class="l">Árat érinti</div><div class="v">${st.rev.status === 'run' ? '<span class="spin"></span>' : priced}</div><div class="s">a módosítások közül</div></div>
      <div class="kpi"><div class="l">Már az eredetinél jelezve</div><div class="v">${Object.keys(st.ai).length ? flagged.length : '–'}</div><div class="s">${Object.keys(st.ai).length ? 'ennyi módosított tételhez volt észrevétel' : 'előbb futtassa a feldolgozást'}</div></div></div>`;
    if (!ch.length) { el.innerHTML = h + '<div class="card"><div class="card-b empty">A két tételjegyzék tartalma megegyezik.</div></div>'; return; }
    if (st.rev.status === 'err') h += `<p class="neg-t small">Az összefoglaló nem készült el: ${esc(st.rev.error)} <button class="btn btn-sm" id="btn-rev-retry">Újra</button></p>`;
    h += `<div class="card"><div class="tbl-wrap"><table class="rev"><thead><tr><th>Tétel</th><th>Változás a tételjegyzékben<br><span class="faint"><del>törölt</del> <ins>új</ins> szöveg</span></th><th>Mi változott</th><th>A program az eredeti kiírásnál</th></tr></thead><tbody>`;
    let lastPart = null;
    for (const c of ch) {
      if (c.part !== lastPart) { lastPart = c.part; h += `<tr class="zone-row"><td colspan="4">${esc(c.part)}</td></tr>`; }
      const it = c.old || c.new, a = ai[c.id], fl = c.kind === 'changed' ? earlierFlags(c.id) : [];
      let body = '';
      if (c.kind === 'added') body = `<span class="badge ok">Új tétel</span> ${esc(c.new.spec)} <b>${fmt(c.new.qty)} ${esc(c.new.unit)}</b>`;
      else if (c.kind === 'removed') body = `<span class="badge neg">Törölt tétel</span> <span class="faint">${esc(c.old.spec)}</span>`;
      else {
        if (c.fields.includes('name')) body += `<div><b>Megnevezés:</b> ${diffHtml(c.old.name, c.new.name)}</div>`;
        if (c.fields.includes('qty') || c.fields.includes('unit')) body += `<div><b>Mennyiség:</b> <del>${fmt(c.old.qty)} ${esc(c.old.unit)}</del> <ins>${fmt(c.new.qty)} ${esc(c.new.unit)}</ins></div>`;
        if (c.fields.includes('spec')) body += `<div class="dspec">${diffHtml(c.old.spec, c.new.spec)}</div>`;
      }
      h += `<tr><td class="code">${esc(c.id)}<span class="src">${it.row}. sor</span></td>
        <td><b>${esc(it.name)}</b>${body}</td>
        <td>${a ? `<span class="badge ${IMPACT[a.arat_erinti].cls}">${IMPACT[a.arat_erinti].label}</span><p class="rv-w">${esc(a.mi_valtozott)}</p><p class="muted small">${esc(a.indok)}</p>` : (st.rev.status === 'run' ? '<span class="spin"></span>' : '')}</td>
        <td>${fl.length ? `<span class="badge warn">Jelezte</span>${fl.map(x => `<div class="muted small">${esc(x)}</div>`).join('')}` : (Object.keys(st.ai).length && c.kind === 'changed' ? '<span class="faint small">Nem jelezte</span>' : '')}</td></tr>`;
    }
    h += `</tbody></table></div></div>`;
    el.innerHTML = h;
  }
  async function setRevision(file) {
    if (!st.book || st.revReading) return;
    st.revReading = true; st.rev = null; render();
    try {
      // Az eredeti oszlopkiosztást használjuk, ha a fejléc ugyanaz, hogy a két változat összevethető legyen.
      const preset = {}; st.book.parts.forEach(p => { if (p.col) preset[p.sheet] = { header: p.header, col: p.col, hr: p.hr }; });
      const book = await Parse.readWorkbook(await file.arrayBuffer(), file.name, sheets => api('columns', { sheets }), preset);
      if (!book.items.length) throw new Error('A módosított fájlban nem találtam tételjegyzéket.');
      st.rev = { fileName: file.name, book, changes: Diff.compareBooks(st.book, book), ai: {}, status: 'idle', error: '' };
    } catch (e) { alert(e.message); }
    st.revReading = false; render();
    if (st.rev) summarizeRevision();
  }
  async function summarizeRevision() {
    const list = st.rev.changes.filter(c => c.kind === 'changed');
    if (!list.length) return;
    st.rev.status = 'run'; st.rev.error = ''; render();
    // Minta: a korábban elkészült összefoglalók visszajátszása, ha ugyanazokról a tételekről van szó.
    const saved = st.replay && st.replay.rev && st.replay.rev.ai;
    if (saved && st.sample && list.every(c => saved[c.id])) {
      for (const c of list) { await sleep(220); st.rev.ai[c.id] = saved[c.id]; render(); }
      st.rev.status = 'ok'; render(); return;
    }
    const chunks = [];
    for (let i = 0; i < list.length; i += 6) chunks.push(list.slice(i, i + 6));
    try {
      await Promise.all(chunks.map(async ch => {
        const out = await api('revision', { changes: ch.map(c => ({ id: c.id, name: c.old.name, before: `${c.old.name} | ${c.old.qty} ${c.old.unit} | ${c.old.spec}`, after: `${c.new.name} | ${c.new.qty} ${c.new.unit} | ${c.new.spec}` })) });
        out.valtozasok.forEach(v => { if (IMPACT[v.arat_erinti]) st.rev.ai[v.id] = v; });
        render();
      }));
      st.rev.status = 'ok';
    } catch (e) { st.rev.status = 'err'; st.rev.error = e.message; }
    render();
  }

  /* ---------- Csevegés a kiírással: a sarokban, minden oldalon ---------- */
  const CHAT_SUGG = ['Mennyi a késedelmi kötbér?', 'Van-e előleg, és mikor fizetnek?', 'Hány helyszínre kell szállítani?', 'Mely tételeknél kell helyszíni szerelés?'];
  function chatMsgHtml(m, n) {
    let a = '';
    if (m.loading) a = '<div class="cm ca"><span class="spin"></span> Keresem a dokumentumokban…</div>';
    else if (m.err) a = `<div class="cm ca err">Nem sikerült válaszolni: ${esc(m.err)}</div>`;
    else if (m.a) {
      const r = m.a;
      // Összeadás: a modell csak a tételeket jelöli meg, az összeget a kód számolja a táblázat mennyiségeiből.
      const cnt = [...new Set(r.szamolt_tetelek || [])].map(itemById).filter(Boolean);
      const sum = cnt.length ? `<div class="cm-sum"><b>Összesen: ${esc(qtyText(cnt))}</b> <span>(${cnt.length} tételből, a táblázat mennyiségei alapján összeadva)</span><ul>${cnt.map(i => `<li>${esc(i.name.trim())}: ${fmt(i.qty)} ${esc(i.unit)} <span class="faint">(${esc(i.id)})</span></li>`).join('')}</ul></div>` : '';
      // Tételre hivatkozó idézet: ha a szöveg nem szó szerinti, a tétel megnevezését mutatjuk, a forrás így is a tétel sora.
      const qv = q => { const it = q.tetel_id && itemById(q.tetel_id); return it && !Parse.quoteInItem(it, q.idezet) ? it.name.trim() : q.idezet; };
      a = `<div class="cm ca ${r.talalt ? '' : 'nf'}"><p>${esc(r.valasz)}</p>${sum}
        ${!r.talalt && r.javaslat ? `<p class="cm-help">${esc(r.javaslat)}</p>` : ''}
        ${cnt.length ? '' : (r.idezetek || []).map(q => quoteSrc(qv(q), q.forras, q.tetel_id ? [q.tetel_id] : null)).join('')}
        ${!r.talalt && r.kerdes_az_ajanlatkeronek && st.tender ? (m.added
          ? '<div class="cm-added">✓ Felvéve a Kérdések közé</div>'
          : `<div class="cm-ask"><span>Ezt érdemes megkérdezni az ajánlatkérőtől:</span><em>${esc(cleanQ(r.kerdes_az_ajanlatkeronek))}</em><button class="btn btn-sm" data-addq="${n}">Felvétel a Kérdések közé</button></div>`) : ''}</div>`;
    }
    return `<div class="cm cq">${esc(m.q)}</div>${a}`;
  }
  function renderChat() {
    let box = $('#chat');
    if (!box) { box = document.createElement('div'); box.id = 'chat'; document.body.appendChild(box); }
    if (!st.book) { box.innerHTML = ''; return; }
    const c = st.chat, old = box.querySelector('#chat-in'), focused = old && document.activeElement === old;
    if (old) c.draft = old.value;
    if (!c.open) { box.innerHTML = '<button id="chat-fab" class="chat-fab"><span class="cf-i">?</span>Kérdezzen a kiírásról</button>'; return; }
    const busy = c.msgs.some(m => m.loading);
    box.innerHTML = `<div class="chat-panel" role="dialog" aria-label="Kérdezzen a kiírásról">
      <div class="chat-h"><div><b>Kérdezzen a kiírásról</b><span>Csak a feltöltött fájlokból válaszol, forrással.</span></div><button class="btn btn-sm" id="chat-close">Bezárás</button></div>
      <div class="chat-b" id="chat-b">${c.msgs.length ? c.msgs.map(chatMsgHtml).join('') : `<div class="chat-empty">Tegyen fel kérdést a szerződésről, a feltételekről vagy a tételekről. Például:</div>`}
        ${(() => { const left = CHAT_SUGG.filter(q => !c.msgs.some(m => m.q === q)); return left.length && !busy ? `<div class="chat-sugg">${c.msgs.length ? '<div class="chat-empty small">További kérdések:</div>' : ''}${left.map(q => `<button class="chip" data-chatq="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''; })()}</div>
      <div class="chat-f"><input id="chat-in" type="text" maxlength="400" placeholder="Írja be a kérdését…" autocomplete="off" ${busy ? 'disabled' : ''}><button class="btn btn-primary" id="chat-send" ${busy ? 'disabled' : ''}>Küldés</button></div></div>`;
    const inp = box.querySelector('#chat-in'); inp.value = c.draft || '';
    if (focused || c.focus) { inp.focus(); c.focus = false; }
    const b = box.querySelector('#chat-b'); b.scrollTop = b.scrollHeight;
  }
  async function askChat(q) {
    q = String(q || '').trim(); const c = st.chat;
    if (!q || !st.book || c.msgs.some(m => m.loading)) return;
    const m = { q, loading: true }; c.msgs.push(m); c.draft = ''; c.focus = true;
    const inp = $('#chat-in'); if (inp) inp.value = '';
    renderChat();
    // Minta: a javasolt kérdések válaszai előre elkészültek, így kulcs nélkül is működnek.
    if (st.replay && st.sample && st.chatCache[q]) { await sleep(1300); m.a = st.chatCache[q]; m.loading = false; c.focus = true; renderChat(); return; }
    try {
      m.a = await api('chat', {
        question: q, docText: st.doc ? st.doc.text : '',
        items: items().map(i => ({ id: i.id, part: i.part, name: i.name, spec: i.spec, qty: i.qty, unit: i.unit })),
        history: c.msgs.filter(x => x.a).slice(-3).map(x => ({ q: x.q, a: x.a.valasz }))
      });
      if (CHAT_SUGG.includes(q)) st.chatCache[q] = m.a;
    } catch (e) { m.err = e.message + (st.replay ? ' A mintánál a javasolt kérdések kulcs nélkül is működnek.' : ''); }
    m.loading = false; c.focus = true; renderChat();
  }

  /* ---------- feldolgozás ---------- */
  // A jelszót a böngésző megjegyzi, így ezen a gépen csak egyszer kell megadni.
  const getKey = () => { try { return localStorage.getItem('demoKey') || sessionStorage.getItem('demoKey') || ''; } catch (e) { return ''; } };
  const setKey = v => { try { localStorage.setItem('demoKey', v); } catch (e) { try { sessionStorage.setItem('demoKey', v); } catch (e2) { /* nincs tároló */ } } };
  // Minden élő (API-kreditet használó) hívás előtt egyszer megerősítést kérünk böngésző-munkamenetenként.
  // A beépített minta visszajátszása nem hívja ezt a függvényt, így nem kérdez és nem fogyaszt.
  let creditAsk = null;
  const creditOk = () => { try { return sessionStorage.getItem('creditOk') === '1'; } catch (e) { return false; } };
  function confirmCredit() {
    if (creditOk()) return Promise.resolve(true);
    if (creditAsk) return creditAsk;
    creditAsk = new Promise(resolve => {
      const m = document.createElement('div');
      m.className = 'modal';
      m.innerHTML = `<div class="modal-box credit-box"><div class="modal-h"><h3>Élő feldolgozás: API-kreditet használ</h3></div>
        <div class="modal-b"><p>Ez a lépés a mesterséges intelligenciát hívja, ami a fiók API-keretéből fogyaszt.</p>
        <p class="muted">A beépített szegedi minta és a javasolt kérdések ingyenesek, azokhoz nem kell ez.</p></div>
        <div class="modal-f credit-f"><button class="btn" data-credit="no">Mégse</button><button class="btn btn-primary" data-credit="yes">Folytatás</button></div></div>`;
      m.addEventListener('click', e => {
        const b = e.target.closest('[data-credit]'); if (!b) return;
        const yes = b.dataset.credit === 'yes';
        if (yes) { try { sessionStorage.setItem('creditOk', '1'); } catch (e2) { /* nincs tároló */ } }
        m.remove(); creditAsk = null; resolve(yes);
      });
      document.body.appendChild(m);
    });
    return creditAsk;
  }
  async function api(path, body) {
    if (!(await confirmCredit())) throw new Error('Megszakítva: az élő feldolgozás nem lett engedélyezve.');
    for (;;) {
      const r = await fetch('/api/' + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-demo-key': getKey() }, body: JSON.stringify(body) });
      if (r.status === 401) {
        const pw = prompt('Jelszó a feldolgozáshoz:');
        if (!pw) throw new Error('Jelszó szükséges.');
        setKey(pw); continue;
      }
      const j = await r.json().catch(() => ({ error: 'Érvénytelen válasz a szervertől (' + r.status + ').' }));
      if (!r.ok) throw new Error(j.error || ('Hiba: ' + r.status));
      return j;
    }
  }
  async function runPart(p) {
    st.partStatus[p.no] = 'run'; render();
    try {
      // Nagy részt 10 tételes adagokban, párhuzamosan értelmezünk, hogy alaposabb és gyorsabb legyen.
      const chunks = [];
      for (let i = 0; i < p.items.length; i += 10) chunks.push(p.items.slice(i, i + 10));
      let out;
      await Promise.all(chunks.map(async ch => {
        out = await api('items', { part: p.name, items: ch.map(i => ({ id: i.id, name: i.name, spec: i.spec, qty: i.qty, unit: i.unit })) });
        for (const t of out.tetelek) if (itemById(t.id)) st.ai[t.id] = t;
        render();
      }));
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
  // Második, szkeptikus kör: a felvetett hibák valószínűségét egy külön hívás pontozza újra.
  // Azonos szövegű tételhibát egyszer küldünk. Ha a hívás nem sikerül, az első becslés marad.
  // A kérdések levele is ebből készül: minden legalább 50%-os hibához egy kérdés, valószínűség szerint.
  const itemLabel = it => `${it.partNo}. rész ${String(it.id).split('/')[1] || it.id}. tétel (${it.name.trim()})`;
  async function rescore() {
    const groups = new Map(), list = [];
    for (const it of items()) for (const n of notesOf(it)) {
      if (n.tipus === 'hiany') continue;
      const key = n.tipus + '|' + n.szoveg.trim().toLowerCase();
      if (!groups.has(key)) { groups.set(key, { notes: [], its: [] }); list.push({ id: 'n' + list.length, key, allitas: n.szoveg, idezet: n.idezet, ha_megsem_hiba: n.ha_megsem_hiba || '', kontextus: `${it.name} | ${it.qty} ${it.unit} | ${it.spec}` }); }
      const g = groups.get(key); g.notes.push(n); if (!g.its.includes(it)) g.its.push(it);
    }
    list.forEach(f => { if (f.key) f.tetelek = groups.get(f.key).its.map(itemLabel).join('; '); });
    (st.tender ? st.tender.ellenorzes : []).forEach((f, i) => {
      const its = f.erintett_tetelek.map(itemById).filter(Boolean);
      const ctx = its.slice(0, 3).map(it => `${it.id} ${it.name}: ${it.spec}`).join('\n');
      list.push({ id: 'd' + i, tetelek: its.map(itemLabel).join('; '), allitas: f.cim + ': ' + f.leiras, idezet: f.idezet, ha_megsem_hiba: f.ha_megsem_hiba || '', kontextus: ctx || f.idezet });
    });
    if (!list.length) return;
    try {
      const out = await api('score', { findings: list.map(({ key, ...f }) => f) });
      const qs = [];
      for (const p of out.pontok || []) {
        if (!Number.isFinite(p.valoszinuseg)) continue;
        const src = list.find(f => f.id === p.id); if (!src) continue;
        const doc = src.key ? null : st.tender.ellenorzes[+p.id.slice(1)];
        const targets = src.key ? groups.get(src.key).notes : [doc];
        for (const t of targets) { if (t.valoszinuseg_elso == null) t.valoszinuseg_elso = t.valoszinuseg; t.valoszinuseg = p.valoszinuseg; t.pont_indok = p.indok; }
        const ids = src.key ? groups.get(src.key).its.map(i => i.id) : doc.erintett_tetelek;
        if (p.valoszinuseg >= 50 && p.kerdes && p.kerdes.trim()) qs.push({ kerdes: p.kerdes.trim(), miert: src.allitas, erintett_tetelek: ids, valoszinuseg: p.valoszinuseg, doc: !src.key });
      }
      if (st.tender && qs.length) {
        if (!st.tender.kerdesek_elso) st.tender.kerdesek_elso = st.tender.kerdesek;
        // Egyetlen tételt érintő dokumentum-kérdés kimarad, ha arra a tételre már van tétel-kérdés (ugyanazt kérdezné).
        const itemQ = new Set(qs.filter(q => !q.doc).flatMap(q => q.erintett_tetelek));
        st.tender.kerdesek = qs.filter(q => !(q.doc && q.erintett_tetelek.length === 1 && itemQ.has(q.erintett_tetelek[0])))
          .sort((x, y) => y.valoszinuseg - x.valoszinuseg).map(({ doc, ...q }) => q);
      }
      st.rescored = true;
    } catch (e) { st.rescored = false; }
    render();
  }
  async function pool(tasks, n) {
    const q = tasks.slice();
    await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await q.shift()(); }));
  }
  // A beépített minta előre feldolgozott eredményét játssza vissza, API-hívás nélkül (bemutatóhoz, kredit nélkül).
  const sleep = ms => new Promise(ok => setTimeout(ok, ms));
  const canReplay = () => !!(st.replay && st.sample && st.replay.sample === st.sample && items().every(i => st.replay.ai[i.id]));
  async function replayRun() {
    const R = st.replay;
    st.ai = {}; st.tender = null; st.rev = null; st.partStatus = {}; st.tenderStatus = 'run'; st.fromSaved = false; st.replayed = false;
    st.running = true; st.startedAt = Date.now(); st.elapsedMs = 0;
    const tick = setInterval(renderTimer, 500);
    st.book.parts.forEach(p => { st.partStatus[p.no] = 'run'; });
    render();
    const queue = st.book.parts.map(p => p.items.slice());
    while (queue.some(q => q.length)) {
      await sleep(520);
      queue.forEach((q, n) => {
        q.splice(0, 2 + (n % 2)).forEach(it => { st.ai[it.id] = JSON.parse(JSON.stringify(R.ai[it.id])); });
        if (!q.length) st.partStatus[st.book.parts[n].no] = 'ok';
      });
      render();
    }
    await sleep(900);
    st.tender = JSON.parse(JSON.stringify(R.tender)); st.tenderStatus = 'ok'; st.model = R.model || '';
    clearInterval(tick);
    st.running = false; st.replayed = true; st.elapsedMs = R.elapsedMs || (Date.now() - st.startedAt);
    st.tab = 'osszefoglalo'; render();
  }
  async function run() {
    if (!st.book || st.running) return;
    if (canReplay()) return replayRun();
    st.ai = {}; st.tender = null; st.partStatus = {}; st.tenderStatus = 'idle'; st.fromSaved = false; st.replayed = false;
    st.running = true; st.startedAt = Date.now(); st.elapsedMs = 0;
    const tick = setInterval(renderTimer, 500);
    render();
    await Promise.all([runTender(), pool(st.book.parts.map(p => () => runPart(p)), 10)]);
    await rescore();
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
        st.files.sheet = file; st.book = null; st.detecting = true; rawFiles[file.name] = file; render();
        try { st.book = await Parse.readWorkbook(await file.arrayBuffer(), file.name, sheets => api('columns', { sheets })); } finally { st.detecting = false; }
        st.ai = {}; st.tender = null; st.rev = null; st.partStatus = {}; st.tenderStatus = 'idle'; st.elapsedMs = 0;
        if (!st.book.items.length) { alert('Ebben a táblázatban nem találtam tételjegyzéket.' + (st.book.aiError ? ' (' + st.book.aiError + ')' : '')); st.book = null; st.files.sheet = null; }
      } else {
        const list = Array.isArray(file) ? file : [file];
        for (const f of list) {
          st.reading = 'Olvasás: ' + f.name; rawFiles[f.name] = f; render();
          const d = await Parse.readDocument(f, p => api('ocr', p), (done, all) => { st.reading = 'Szkennelt PDF, szövegfelismerés: ' + f.name + ' (' + done + ' / ' + all + ' oldal)'; render(); });
          st.docs = st.docs.filter(x => x.fileName !== d.fileName).concat(d);
        }
        setDocs(st.docs);
      }
    } catch (e) { st.reading = ''; alert(e.message); }
    render();
  }
  function setDocs(docs) {
    st.docs = docs; st.reading = '';
    if (!docs.length) { st.doc = null; st.docIndex = null; st.files.doc = null; return; }
    st.doc = { fileName: docs.map(d => d.fileName).join(' + '), text: Parse.combineDocs(docs) };
    st.files.doc = { name: st.doc.fileName }; st.docIndex = Parse.makeDocIndex(st.doc.text);
  }
  // Feltöltött fájl eltávolítása (rossz fájl esetén). A tételjegyzék eltávolítása a feldolgozott eredményt is törli.
  function removeFile(kind, name) {
    if (st.running) return;
    if (kind === 'sheet') { const docs = st.docs; st = fresh(); setDocs(docs); }
    else if (kind === 'doc') { setDocs(st.docs.filter(d => d.fileName !== name)); st.tender = null; st.tenderStatus = 'idle'; }
    else if (kind === 'rev') st.rev = null;
    render();
  }
  const getFile = async (url, name) => new File([await (await fetch(url)).blob()], name);
  async function loadSample(key) {
    const S = SAMPLES[key]; if (!S || st.running) return;
    st = fresh(); st.sample = key; render();
    await setFile('sheet', await getFile(S.sheet[0], S.sheet[1]));
    await setFile('doc', await Promise.all(S.docs.map(d => getFile(d[0], d[1]))));
    // Ha ehhez a mintához van előre feldolgozott eredmény, a feldolgozás azt játssza vissza (API nélkül).
    try { const s = await (await fetch('data/mentett.json')).json(); if (s && s.sample === key) { st.replay = s; st.chatCache = s.chatCache || {}; } } catch (e) { /* nincs mentett eredmény: élő feldolgozás */ }
    render();
  }
  function snapshot() { return { v: 1, savedAt: new Date().toISOString(), sample: st.sample, book: st.book, doc: st.doc, docs: st.docs, ai: st.ai, tender: st.tender, rev: st.rev, prices: {}, todo: {}, chatCache: st.chatCache, elapsedMs: st.elapsedMs, model: st.model }; }
  function restore(s) {
    st = fresh(); Object.assign(st, { sample: s.sample || '', rev: s.rev || null, prices: s.prices || {}, todo: s.todo || {}, replay: s.sample ? s : null, replayed: true, chatCache: s.chatCache || {}, book: s.book, doc: s.doc, ai: s.ai, tender: s.tender, elapsedMs: s.elapsedMs, model: s.model, fromSaved: true });
    st.files = { sheet: { name: s.book.fileName }, doc: s.doc ? { name: s.doc.fileName } : null };
    st.docs = s.docs || (s.doc ? [s.doc] : []);
    st.docIndex = s.doc ? Parse.makeDocIndex(s.doc.text) : null;
    st.book.parts.forEach(p => { st.partStatus[p.no] = 'ok'; }); st.tenderStatus = s.tender ? 'ok' : 'idle';
    st.tab = 'osszefoglalo'; render();
  }
  root.App.snapshot = snapshot; root.App.rescore = rescore; root.App.rfqText = rfqText; root.App.questionsText = () => (st.tender ? questionsText() : '');
  root.App.helpers = { items, makerOf, notesOf, dims, counts, earlierFlags, priceOf, todoList, NOTE_TYPES, SEV, FIND_TYPES, IMPACT };

  /* ---------- események ---------- */
  const copy = (text, btn) => navigator.clipboard.writeText(text).then(() => { const t = btn.textContent; btn.textContent = 'Kimásolva'; setTimeout(() => { btn.textContent = t; }, 1500); });
  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.tab) { st.tab = t.dataset.tab; render(); window.scrollTo(0, 0); }
    else if (t.classList.contains('q-open')) openSource(t.dataset);
    else if (t.id === 'btn-run') run();
    else if (t.id === 'chat-fab') { st.chat.open = true; st.chat.focus = true; renderChat(); }
    else if (t.id === 'chat-close') { st.chat.open = false; renderChat(); }
    else if (t.id === 'chat-send') askChat(($('#chat-in') || {}).value);
    else if (t.dataset.chatq) askChat(t.dataset.chatq);
    else if (t.dataset.addq !== undefined) {
      const m = st.chat.msgs[Number(t.dataset.addq)];
      if (m && m.a && st.tender) { st.tender.kerdesek.push({ kerdes: cleanQ(m.a.kerdes_az_ajanlatkeronek), miert: 'A csevegésben merült fel; a feltöltött dokumentumok nem adnak rá választ.', erintett_tetelek: [] }); m.added = true; render(); }
    }
    else if (t.dataset.openSheet !== undefined) { e.preventDefault(); openSheet(t.dataset.openSheet, t.dataset.row); }
    else if (t.dataset.openDoc !== undefined) { e.preventDefault(); openDoc(t.dataset.openDoc, t.dataset.page); }
    else if (t.dataset.pcalc) { const y = window.scrollY; st.pricing.open[t.dataset.pcalc] = !st.pricing.open[t.dataset.pcalc]; render(); window.scrollTo(0, y); }
    else if (t.dataset.remove) { e.preventDefault(); removeFile(t.dataset.remove, t.dataset.name); }
    else if (t.dataset.sample) loadSample(t.dataset.sample);
    else if (t.id === 'btn-rev-sample') { const S = SAMPLES[st.sample]; getFile(S.rev[0], S.rev[1]).then(setRevision); }
    else if (t.id === 'btn-rev-retry') summarizeRevision();
    else if (t.id === 'btn-saved') fetch('data/mentett.json').then(r => r.json()).then(restore).catch(() => alert('A mentett eredmény nem tölthető be.'));
    else if (t.id === 'btn-new') { if (!st.running) { st = fresh(); render(); } }
    else if (t.dataset.retry) retry(t.dataset.retry);
    else if (t.id === 'btn-copy-q') copy(questionsText(), t);
    else if (t.id === 'btn-rfq') copy(rfqText(), t);
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.type === 'file' && t.files[0]) { const k = t.closest('.drop').dataset.kind; if (k === 'rev') setRevision(t.files[0]); else { if (k === 'sheet') st.sample = ''; setFile(k, k === 'doc' ? [...t.files] : t.files[0]); } }
    else if (t.dataset.maker) { st.ai[t.dataset.maker].gyarto = t.value; st.ai[t.dataset.maker].gyarto_indok = 'Kézzel átállítva.'; render(); }
    else if (t.id === 'f-part') { st.filter.part = t.value; render(); }
    else if (t.id === 'f-maker') { st.filter.maker = t.value; render(); }
    else if (t.id === 'f-notes') { st.filter.onlyNotes = t.checked; render(); }
    else if (t.dataset.todo) { const y = window.scrollY; st.todo[t.dataset.todo] = t.checked; render(); window.scrollTo(0, y); }
    else if (t.dataset.pmargin !== undefined) { st.pricing.margin = Math.max(0, Math.min(60, parseFloat(t.value) || 0)); render(); }
    else if (t.dataset.prisk !== undefined) { st.pricing.risk = Math.max(0, Math.min(40, parseFloat(t.value) || 0)); render(); }
  });
  ['dragover', 'drop'].forEach(ev => document.addEventListener(ev, e => {
    const d = e.target.closest && e.target.closest('.drop'); if (!d) return;
    e.preventDefault();
    if (ev === 'drop' && e.dataTransfer.files[0]) {
      if (d.dataset.kind === 'rev') setRevision(e.dataTransfer.files[0]);
      else { if (d.dataset.kind === 'sheet') st.sample = ''; setFile(d.dataset.kind, d.dataset.kind === 'doc' ? [...e.dataTransfer.files] : e.dataTransfer.files[0]); }
    }
  }));
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'chat-in') { e.preventDefault(); askChat(e.target.value); } });
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
