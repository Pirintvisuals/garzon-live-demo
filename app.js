/*
 * Nézetek és a feldolgozás vezérlése.
 * Állapot: a táblázatból olvasott tételek (kód), a modell értelmezése tételenként (ai), a kiírás feldolgozása (tender).
 */
(function (root) {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Hosszú megnevezés rövidítve a címekben (a teljes szöveg a forrásnál látszik).
  const shortName = (t, n = 70) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, t.lastIndexOf(' ', n) > 30 ? t.lastIndexOf(' ', n) : n) + '…' : t; };
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
    { id: 'egyezes', label: 'Egyezés' },
    { id: 'osszefoglalo', label: 'Eredmény' },
    { id: 'ellenorzes', label: 'Hibák a kiírásban' },
    { id: 'kerdesek', label: 'Kérdések' },
    { id: 'bontas', label: 'Tételek és gyártás' },
    { id: 'arazas', label: 'Árazás' },
    { id: 'revizio', label: 'Módosítás érkezett' }
  ];
  // Minden résznek saját színe van: ugyanaz a szín a folyamatábrán, a fülön és az oldal tetején.
  const SEC = { feltoltes: '#5d6873', egyezes: '#8a3b2e', osszefoglalo: '#2f5866', ellenorzes: '#b7791f', kerdesek: '#2b6cb0', tetelek: '#a8763e', bontas: '#a8763e', arazas: '#2c6845', revizio: '#6b4f9a' };
  // Mire jó az oldal, és mit érdemes rajta csinálni.
  // Generálkivitelezői munkánál néhány oldal mást csinál.
  const GUIDE_GK = {
    kerdesek: ['A jóváhagyott hibákból és a saját észrevételekből kész levelek: a generálkivitelezőnek, a tervezőnek, és rövid üzenet a belső kollégáknak.', 'A „Kinek szól?” részben állítsa be, melyik kérdés kié, aztán írassa meg, olvassa át, és küldje el árazás előtt.'],
    arazas: ['Első árvázlat tételtípusonként. Felül a tételjegyzékből hiányzó tételek, a soroknál az eltérések.', 'Ami hiányzik vagy eltér, arra előbb kérdezzen rá; a többi tételnél nyissa meg a „Számítás” gombot.']
  };
  const GUIDE = {
    egyezes: ['A rajz, a konszignáció és a tételjegyzék összevetése alaprajzi jel szerint: mi hiányzik, mi tér el darabszámban vagy méretben.', 'Felül a legvalószínűbb eltérések állnak, lefelé csökkenő sorrendben. A „Források megnyitása” gomb egymás mellett mutatja a táblázat sorát, a konszignációs lapot és a rajzot. Az eltérések Excelben letölthetők.'],
    osszefoglalo: ['Egy pillantásra: mit talált a program ebben az ajánlatkérésben.', 'Nézze át a négy kártyát. Lent a vezetésnek szóló rész: a szerződés feltételei és kockázatai alapján érdemes-e ajánlatot adni.'],
    ellenorzes: ['Hol hibás vagy ellentmondásos a kiírás. Ha ez rejtve marad, rossz terméket áraznak be.', 'A „Forrás” gombbal ellenőrizze, majd hagyja jóvá, ami valóban tisztázandó. Amit a program nem talált meg, azt a lap alján veheti fel.'],
    kerdesek: ['A jóváhagyott hibákból és a saját észrevételekből kész levelek: kiegészítő tájékoztatás-kérés az ajánlatkérőnek, és ha kell, rövid üzenet a belső kollégáknak.', 'A „Kinek szól?” részben állítsa be, melyik kérdés kié, aztán írassa meg, olvassa át, szerkessze, és küldje el.'],
    tetelek: ['Részletes tétellista: az ajánlatkérő szabad szöveges leírásai rendezve, méret, anyag, szín külön oszlopban.', 'Ellenőrizze a tételeket. A „Gyártás” oszlopban átállítható, ki készíti; a bontás ennek megfelelően frissül.'],
    bontas: ['A tételek rendezve és szétosztva: melyik üzem mit gyárt, és mit kell beszállítótól megvenni.', 'Adja tovább a listákat az üzemeknek. A beszállítói tételekhez kész az ajánlatkérő szöveg. Minden oszlop a „Részletes tétellista” gombbal látszik.'],
    arazas: ['Első árvázlat tételtípusonként: katalógus, beszállítói, saját gyártás, egyedi.', 'Nyisson meg egy „Számítás” gombot, és állítsa a haszon és a kockázati felár mértékét. A végső árat mindig a kolléga hagyja jóvá.'],
    revizio: ['Ha az ajánlatkérő később javított tételjegyzéket küld: pontosan mi változott?', 'Töltse fel az új táblázatot. A változások tételenként, színnel jelölve látszanak.']
  };
  // Mi lenne más az éles, a Garzonra szabott rendszerben (oldalanként egy-két sor, ígéret nélkül).
  // Oldalanként mi változna még (jelenleg nincs ilyen sor: a felület a kész munkafolyamatot mutatja).
  const LIVE = {};
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

  // Az ügyfél saját anyaga csak helyben van meg: a minta/_helyi.js (git-ignored) adja meg a fájlokat és a gombok feliratát.
  // A nyilvános telepítésben ez a fájl nincs, ezért ott ezek a gombok nem jelennek meg.
  const HELYI = root.HELYI || {};
  if (HELYI.kozb) SAMPLES.helyi_kozb = HELYI.kozb;
  const GK = (HELYI.gk && HELYI.gk.files) || [];
  // Tartalék, ha élőben nem érhető el a feldolgozás: a saját anyag korábbi futása (helyben, data/_gk.json, data/_kozb.json).
  const isKozbSample = () => st.sample === 'helyi_kozb' || !!(HELYI.kozb && st.book && st.book.fileName === HELYI.kozb.sheet[1]);
  const savedFile = () => (mode === 'gk' && GK.length ? 'data/_gk.json' : (isKozbSample() ? 'data/_kozb.json' : ''));
  async function loadGk() {
    if (st.running) return;
    const files = await Promise.all(GK.map(u => getFile(u, decodeURIComponent(u.split('/').pop()))));
    st = fresh(); Egyezes.reset(); mode = 'gk'; render();
    // A tételjegyzék a többi lépéshez is betöltődik (hibák, kérdések, gyártás); az összevetés a PDF-ekből és a táblázatból készül.
    await Promise.all([setFile('sheet', files[0]), Egyezes.addFiles(files.slice(1))]);
    st.tab = 'egyezes'; render();
  }
  const fresh = () => ({
    sample: '', rev: null, prices: {}, pricing: { margin: 12, risk: 0, open: {} }, todo: {}, replay: null, replayed: false, chatCache: {}, chat: { open: false, msgs: [], draft: '' },
    review: {}, manual: [], route: {}, letter: null, letters: {}, lang: 'hu', writing: false, letterError: '', savedOffer: null,
    tab: 'feltoltes', files: { sheet: null, doc: null }, book: null, doc: null, docIndex: null,
    ai: {}, tender: null, partStatus: {}, tenderStatus: 'idle', tenderError: '',
    docs: [], reading: '', running: false, startedAt: 0, elapsedMs: 0, model: '', filter: { maker: '', part: '', onlyNotes: false }, fromSaved: false
  });
  let st = fresh();
  // Munkatípus: közbeszerzés (tételjegyzék + kiírás) vagy generálkivitelezői munka (tételjegyzék + konszignáció + tervlapok).
  let mode = 'kozbeszerzes';
  const tabs = () => TABS.filter(t => (t.id !== 'egyezes' || mode === 'gk') && (t.id !== 'revizio' || st.tab === 'revizio'));
  root.App = { get state() { return st; }, MAKERS, render: () => render() };

  /* ---------- számított adatok ---------- */
  const items = () => (st.book ? st.book.items : []);
  const makerOf = it => (st.ai[it.id] && st.ai[it.id].gyarto) || '';
  // A „gyártmányterv alapján” a gyártó feladata (az asztalos készíti), nem hiányzó adat: ezt a modell néha hiánynak veszi.
  const shopDrawing = (it, n) => n.tipus === 'hiany' && /gyártmányterv/i.test(n.szoveg) && /gyártmányterv alapján/i.test(it.name + ' ' + it.spec);
  const notesOf = it => ((st.ai[it.id] && st.ai[it.id].eszrevetelek) || []).filter(n => !shopDrawing(it, n));
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
      questions: st.letter ? st.letter.qs.length : 0
    };
  }

  /* ---------- keret ---------- */
  // A részletes tétellista (tetelek) nem külön lépés, hanem a "Tételek és gyártás" lépés aloldala.
  const stepOf = tab => (tab === 'tetelek' ? 'bontas' : tab);
  // Oldalsáv ikonjai (egyszerű vonalas SVG, egységes 24x24 rácson).
  const svg = d => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = {
    feltoltes: svg('<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
    egyezes: svg('<rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/><path d="M10 9h4M10 15h4"/>'),
    osszefoglalo: svg('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="10" width="8" height="11" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/>'),
    ellenorzes: svg('<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>'),
    kerdesek: svg('<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="m4 7 8 6 8-6"/>'),
    bontas: svg('<path d="M3 21V10l5 3V10l5 3V10l5 3v8z"/><path d="M3 21h18"/>'),
    arazas: svg('<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M8 7h8M8 11h2M12 11h2M8 15h2M12 15h2M16 11v4"/>'),
    revizio: svg('<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>')
  };
  function navStatus(id) {
    const c = counts();
    if (id === 'feltoltes') return st.book ? { t: 'betöltve', cls: 'ok' } : { t: 'itt kezdje' };
    if (!st.book && id !== 'egyezes') return null;
    if (id === 'egyezes') { if (!Egyezes.ready()) return null; const n = Egyezes.state.result.groups.filter(g => g.findings.length).length; return { t: `${n} eltérés`, cls: n ? 'warn' : 'ok' }; }
    if (st.running && ['osszefoglalo', 'ellenorzes', 'bontas', 'arazas'].includes(id)) return { t: 'készül…' };
    if (id === 'osszefoglalo') return st.tender ? { t: 'kész', cls: 'ok' } : null;
    if (id === 'ellenorzes') {
      if (!st.tender && !c.read) return null;
      // Csak ennek az oldalnak a felvetései (hibák és hiányzó adatok): az Egyezés eltérései az Egyezés fülön számolódnak, különben a szám nem egyezik az oldallal.
      const r = [...allFindings().map(x => x.key), ...missingNotes().map(({ it, n }) => missKey(it, n))];
      const nF = allFindings().length, open = r.filter(k => !st.review[k]).length, ok = r.filter(k => st.review[k] === 'ok').length;
      return { t: `${nF} felvetés${ok ? ` · ${ok} jóváhagyva` : ''}${open && ok ? ` · ${open} vár` : ''}`, cls: open ? 'warn' : 'ok' };
    }
    if (id === 'kerdesek') return st.letter ? { t: `${st.letter.qs.length} kérdés · ${st.letter.parts.length} címzett`, cls: 'ok' } : { t: 'még nincs levél' };
    if (id === 'bontas') return c.read ? { t: `${c.items} tétel szétosztva` } : null;
    if (id === 'arazas') return c.read ? { t: 'első árvázlat · mintaárak' } : null;
    return null;
  }
  function renderChrome() {
    const c = counts();
    // Oldalsáv: lépésenként ikon, név és egy rövid állapotsor (hol tart a munka).
    $('#tabs').innerHTML = tabs().map((t, n) => {
      const disabled = t.id === 'egyezes' ? !Egyezes.ready() : (t.id !== 'feltoltes' && !st.book);
      const stt = navStatus(t.id);
      return `<button class="tab" role="tab" data-tab="${t.id}" aria-selected="${stepOf(st.tab) === t.id}" ${disabled ? 'disabled' : ''}>
        <span class="tab-ic" aria-hidden="true">${ICONS[t.id] || ''}</span>
        <span class="tab-tx"><span class="tab-l"><span class="tab-n">${n + 1}</span>${t.label}</span>${stt ? `<span class="tab-s ${stt.cls || ''}">${stt.t}</span>` : ''}</span></button>`;
    }).join('');
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'view-' + st.tab));
    const title = (mode === 'gk' && Egyezes.projectName()) || (st.tender ? st.tender.osszefoglalo.targy : (st.book ? st.book.fileName : 'Nincs betöltött ajánlatkérés'));
    const meta = st.book ? `${c.parts} rész · ${c.items} tétel · ${esc(qtyText(items()))}` + (st.docs.length ? ` · ${st.docs.length === 1 ? esc(st.docs[0].fileName) : st.docs.length + ' dokumentum'}` : '') : 'Töltse fel a tételjegyzéket és a kiírás dokumentumát.';
    $('#proj-head').innerHTML = `<div class="proj-title">${esc(title)}</div><div class="proj-meta">${meta}</div>`;
    $('#btn-xlsx').hidden = !(done() || (mode === 'gk' && st.book && Egyezes.ready()));
    $('#btn-new').hidden = !st.book;
    renderTimer();
  }
  function renderTimer() {
    const el = $('#timer');
    const ms = st.running ? Date.now() - st.startedAt : st.elapsedMs;
    el.hidden = !ms;
    if (ms) el.textContent = (st.running ? 'Feldolgozás: ' : 'Feldolgozva: ') + (ms / 1000).toFixed(st.running ? 0 : 1).replace('.', ',') + ' mp' + (!st.running && st.replayed ? ' (korábbi futás)' : '');
  }

  function render() {
    renderChrome();
    ({ feltoltes: viewUpload, egyezes: Egyezes.view, osszefoglalo: viewBrief, tetelek: viewItems, bontas: viewSplit, ellenorzes: viewCheck, kerdesek: viewQuestions, arazas: viewPricing, revizio: viewRevision })[st.tab]();
    decorate();
    renderChat();
  }
  // Az aktív oldal kerete: felül, mire jó és mit érdemes tenni; alul, mi a következő lépés.
  function decorate() {
    const el = $('#view-' + st.tab), g = (mode === 'gk' && GUIDE_GK[st.tab]) || GUIDE[st.tab];
    el.style.setProperty('--sec', SEC[st.tab]);
    if (!g || !(st.book || (st.tab === 'egyezes' && Egyezes.ready()))) return;
    const T = tabs(), idx = T.findIndex(t => t.id === stepOf(st.tab)), next = T[idx + 1];
    el.classList.add('guided');
    const back = st.tab === 'tetelek' ? `<button class="btn btn-sm g-back" data-tab="bontas">← Vissza az üzemenkénti bontáshoz</button>` : '';
    el.insertAdjacentHTML('afterbegin', `<div class="guide"><span class="g-n">${idx + 1}</span><div>${back}<div class="g-what">${esc(g[0])}</div><div class="g-do"><b>Mit tegyen itt:</b> ${esc(g[1])}</div>${LIVE[st.tab] ? `<div class="g-live"><b>Az éles rendszerben:</b> ${esc(LIVE[st.tab])}</div>` : ''}</div></div>`);
    el.insertAdjacentHTML('beforeend', next
      ? `<div class="nextbar" style="--sec:${SEC[next.id]}"><span>Következő lépés</span><button class="btn nextbtn" data-tab="${next.id}"><span class="tn">${idx + 2}</span>${next.label} →</button></div>`
      : `<div class="nextbar"><span>Ez az utolsó lépés. Az előkészített munkafüzet a jobb felső gombbal letölthető, az árazás abban folytatható.</span></div>`);
  }

  const waiting = what => `<div class="card"><div class="card-b empty">${st.running ? '<span class="spin"></span> ' + what + ' készül…' : 'Még nincs feldolgozott adat. Indítsa el a feldolgozást a Feltöltés fülön.'}</div></div>`;

  /* ---------- Feltöltés ---------- */
  const probed = {};
  function probe(url, sel) {
    const show = () => { const b = $(sel); if (b && probed[url] === true) b.hidden = false; };
    if (url in probed) { if (probed[url] !== 'wait') show(); return; }
    probed[url] = 'wait';
    fetch(url, { method: 'HEAD' }).then(r => { probed[url] = r.ok; show(); }).catch(() => { probed[url] = false; });
  }
  // Feltöltés: üres állapotban egy nagy mező a mappának; betöltés után a betöltött anyag röviden, és egyetlen fő lépés.
  function viewUpload() {
    const c = counts();
    const f = st.files, E = Egyezes.state, gk = mode === 'gk';
    const loaded = !!(st.book || st.docs.length || E.konsz.length || E.plans.length);
    const busy = st.loadingAll || st.detecting || st.reading || E.reading;
    let h = `<div class="up-head"><h2>${loaded ? 'Betöltött ajánlatkérés' : 'Új ajánlatkérés'}</h2>
      <p>${loaded ? 'Ellenőrizze, hogy minden fájl megvan-e, aztán indítsa a feldolgozást.' : 'Húzza be egy ajánlatkérés teljes mappáját. A program maga ismeri fel, mi a tételjegyzék, a kiírás, a konszignáció és a tervlap.'}</p></div>`;

    // 1. A fő mező (üres állapotban nagy, betöltés után kicsi: fájlok hozzáadása vagy csere)
    // Kattintással a böngésző külön mappaválasztót ad (webkitdirectory), mert a sima fájlválasztó mappát nem tud.
    const pick = `<span class="pick"><label class="btn ${loaded ? 'btn-sm' : 'btn-primary'}"><input type="file" webkitdirectory directory multiple hidden>Mappa kiválasztása</label>
      <label class="btn ${loaded ? 'btn-sm' : ''}"><input type="file" multiple hidden>Fájlok kiválasztása</label></span>`;
    h += `<div class="drop drop-all ${loaded ? 'compact' : ''}" data-kind="all">
      ${busy ? `<div class="drop-s"><span class="spin"></span> ${esc(st.loadingAll || E.reading || st.reading || 'A táblázat beolvasása…')}</div>`
        : loaded ? `<div class="drop-row"><span class="drop-f">Másik ajánlatkérés: húzza ide a mappát, vagy</span>${pick}</div>`
          : `<div class="drop-t">Húzza ide a mappát</div><div class="drop-f">vagy válassza ki:</div>${pick}`}</div>`;
    if (!loaded) {
      const own = [HELYI.gk ? `<button class="btn btn-sm" id="btn-gk" hidden>${esc(HELYI.gk.label.replace(/^Saját anyag:\s*/, ''))}</button>` : '',
        HELYI.kozb ? `<button class="btn btn-sm" data-sample="helyi_kozb" id="btn-kozb" hidden>${esc(HELYI.kozb.label.replace(/^Saját anyag:\s*/, ''))}</button>` : ''].join('');
      h += HELYI.gk || HELYI.kozb
        ? `<div class="up-quick"><span class="muted small">Saját anyag:</span>${own}</div>`
        : `<div class="up-quick"><span class="muted small">Példa, nyilvános közbeszerzés:</span><button class="btn btn-sm" data-sample="szeged">Szegedi Szakképzési Centrum, 2026</button><button class="btn btn-sm" data-sample="debrecen">Debrecen, 2018</button><button class="btn btn-sm" id="btn-saved" hidden>Korábbi eredmény</button></div>`;
    }

    // 2. A betöltött anyag, csoportosítva
    if (loaded) {
      const pages = E.konsz.reduce((a, k) => a + k.items.length, 0), marks = E.result ? E.result.groups.reduce((a, g) => a + (g.pCount || 0), 0) : 0;
      const row = (label, val, sub, ok = true) => `<div class="fg"><span class="fg-l">${label}</span><span class="fg-v ${ok ? '' : 'muted'}">${val}</span>${sub ? `<span class="fg-s">${sub}</span>` : ''}</div>`;
      h += `<div class="card up-files"><div class="card-h"><h3>${esc(projectTitle() || 'Ajánlatkérés')}</h3><span class="badge ${gk ? 'warn' : 'grey'}">${gk ? 'Generálkivitelezői munka' : 'Közbeszerzés'}</span></div><div class="card-b">
        ${row('Tételjegyzék', st.book ? `${esc(st.book.fileName)}` : (f.sheet ? esc(f.sheet.name) : 'nincs'), st.book ? `${c.items} tétel · ${esc(qtyText(items()))}${st.book.parts[0] ? ` · <button class="opn" data-open-sheet="${esc(st.book.parts[0].sheet)}">Megnyitás</button>` : ''}` : '', !!st.book)}
        ${gk ? row('Konszignáció', E.konsz.length ? `${E.konsz.length} fájl` : 'nincs', E.konsz.length ? `${pages} lap` : '', !!E.konsz.length) : ''}
        ${gk ? row('Tervlapok', E.plans.length ? `${E.plans.length} fájl` : 'nincs', E.plans.length ? `${marks} bútorjel a rajzokon` : '', !!E.plans.length) : ''}
        ${row(gk ? 'Szerződés, feltételek' : 'Kiírás dokumentumai', st.docs.length ? `${st.docs.length} fájl` : (gk ? 'nincs (nem kötelező)' : 'nincs'), st.docs.length ? `${st.docIndex ? st.docIndex.paras.length.toLocaleString('hu-HU') + ' bekezdés' : ''}${st.docs.some(d => d.scanned) ? ' · szkennelt PDF is, szövegfelismeréssel' : ''}` : '', !!st.docs.length)}
        ${st.docs.filter(d => d.failedPages && d.failedPages.length).map(d => `<div class="drop-i">${esc(d.fileName)}: ${d.failedPages.length} oldal nem volt olvasható.</div>`).join('')}
        ${E.error ? `<div class="drop-i">${esc(E.error)}</div>` : ''}
        <div class="up-links">
          ${st.book ? '<button class="lnk" data-tab="revizio">Módosított tételjegyzék érkezett?</button>' : ''}
          ${savedFile() ? '<button class="lnk" id="btn-saved-run" hidden>Tartalék: korábbi feldolgozás</button>' : ''}</div>
      </div></div>`;
    }

    // 3. A következő lépés: mindig egy fő gomb
    if (st.book && !busy) {
      const tGo = gk && Egyezes.ready() ? `<button class="btn" data-tab="egyezes">Egyezés megnyitása <span class="b-sub">azonnal, ingyenes</span></button>` : '';
      if (st.running) {
        h += `<div class="card next"><div class="card-h"><h3>Feldolgozás folyamatban</h3><span class="muted">${c.read} / ${c.items} tétel értelmezve</span></div><div class="card-b">
          <div class="bar big"><i style="width:${c.items ? Math.round(100 * c.read / c.items) : 0}%"></i></div>
          <div class="steps">${stepRow('Kiírás dokumentuma: összefoglaló, összevetés', st.tenderStatus, st.tenderError)}
          ${st.book.parts.map(p => stepRow(`${esc(p.name)} · ${p.items.length} tétel`, st.partStatus[p.no] || 'idle', (st.partStatus['err' + p.no] || ''), p.no)).join('')}</div>
          ${gk && Egyezes.ready() ? '<p class="muted small" style="margin:10px 0 0">Amíg fut, az Egyezés már megnézhető.</p>' : ''}<div class="actions" style="margin-top:8px">${tGo}</div></div></div>`;
      } else if (st.savedOffer && !done()) {
        const d = new Date(st.savedOffer.savedAt);
        h += `<div class="card next saved"><div class="card-b"><div class="next-t">Ezt az ajánlatkérést már feldolgozta</div>
          <p>${d.toLocaleDateString('hu-HU')} ${d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })} · az eredmény ezen a gépen el van mentve, a jóváhagyásokkal és a levelekkel együtt.</p>
          <div class="actions"><button class="btn btn-primary btn-lg" id="btn-open-saved">Megnyitás <span class="b-sub">ingyenes, azonnal</span></button>
          <button class="btn" id="btn-run-again">Feldolgozás újra <span class="b-sub">kb. 2 perc, MI-használattal</span></button>${tGo}</div></div></div>`;
      } else if (done()) {
        h += `<div class="card next"><div class="card-b"><div class="next-t">Feldolgozva</div><p>Az eredmény ezen a gépen el van mentve.</p>
          <div class="actions"><button class="btn btn-primary btn-lg" data-tab="osszefoglalo">Eredmény megnyitása</button>${tGo}<button class="btn" id="btn-run">Feldolgozás újra <span class="b-sub">MI-használattal</span></button></div></div></div>`;
      } else {
        const failed = st.tenderStatus === 'err' || Object.keys(st.partStatus).some(k => st.partStatus[k] === 'err');
        h += `<div class="card next"><div class="card-b"><div class="next-t">Következő lépés</div>
          <p>${gk ? 'A program értelmezi a tételeket a konszignációval együtt, megkeresi a hibákat, szétosztja a tételeket gyártás szerint, és előkészíti a kérdéseket.' : 'A program értelmezi a tételeket, összeveti a kiírással, kigyűjti a feltételeket és a kockázatokat, szétosztja a tételeket gyártás szerint, és előkészíti a kérdéseket.'}</p>
          ${failed ? `<div class="drop-i">${esc(st.tenderError || 'A feldolgozás egy része nem sikerült.')} Próbálja újra, vagy töltse be a korábbi feldolgozást.</div>` : ''}
          <div class="actions"><button class="btn btn-primary btn-lg" id="btn-run">Feldolgozás indítása <span class="b-sub">kb. 2 perc</span></button>${tGo}</div></div></div>`;
      }
    }

    // 4. Fájlok egyenként (rejtve, ha nincs rá szükség)
    const manual = !loaded || st.manualOpen;
    h += `<details class="up-manual" ${st.manualOpen ? 'open' : ''}><summary>${loaded ? 'Fájlok egyenként' : 'Inkább fájlonként tölti fel?'}</summary>`;
    if (manual) {
      const modeBtn = (k, t) => `<button class="seg-b ${mode === k ? 'on' : ''}" data-mode="${k}" ${st.running ? 'disabled' : ''}>${t}</button>`;
      h += `<div class="seg">${modeBtn('kozbeszerzes', 'Közbeszerzés')}${modeBtn('gk', 'Generálkivitelezői munka')}</div>
      <div class="grid g2">
        <label class="drop ${f.sheet ? 'has' : ''}" data-kind="sheet"><input type="file" accept=".xls,.xlsx,.xlsm,.csv" hidden>
          <div class="drop-t">Tételjegyzék (Excel)</div>
          <div class="drop-f">${f.sheet ? esc(f.sheet.name) + (st.running ? '' : ' <button class="rm" data-remove="sheet">Eltávolítás</button>') : 'Húzza ide, vagy kattintson'}</div>
          ${st.book && st.book.usedAi ? colInfo() : ''}</label>
        <label class="drop ${f.doc ? 'has' : ''}" data-kind="doc"><input type="file" accept=".pdf,.docx,.txt" multiple hidden>
          <div class="drop-t">${gk ? 'Szerződés, feltételek <span class="muted" style="font-weight:400">· nem kötelező</span>' : 'Kiírás dokumentumai (PDF, Word)'}</div>
          <div class="drop-f">${st.docs.length ? st.docs.map(d => `<div>${esc(d.fileName)} <button class="opn" data-open-doc="${esc(d.fileName)}">Megnyitás</button>${st.running ? '' : ` <button class="rm" data-remove="doc" data-name="${esc(d.fileName)}">Eltávolítás</button>`}</div>`).join('') : 'Húzza ide, vagy kattintson; több fájl is lehet'}</div></label>
      </div>
      ${gk ? Egyezes.dropHtml() : ''}`;
    }
    h += `</details>`;

    // 5. A beolvasott tételek: csak kérésre
    if (st.book && !st.running && !c.read) h += `<details class="up-items"><summary>Beolvasott tételek (${c.items})</summary>${previewTable()}</details>`;
    if (st.book && st.book.skipped.length) h += `<p class="muted small">Tétel nélküli munkalapok (kihagyva): ${st.book.skipped.map(esc).join(', ')}</p>`;

    $('#view-feltoltes').innerHTML = h;
    if (!HELYI.gk && !HELYI.kozb && !loaded) probe('data/mentett.json', '#btn-saved');
    if (HELYI.kozb && !loaded) probe(HELYI.kozb.sheet[0], '#btn-kozb');
    if (GK.length && !loaded) probe(GK[0], '#btn-gk');
    if (savedFile() && st.book) probe(savedFile(), '#btn-saved-run');
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
      const hit = (relatedIds && relatedIds.length ? relatedIds.map(itemById).filter(Boolean) : items()).find(it => Parse.quoteInItem(it, quote)) || (relatedIds && relatedIds.length ? items().find(it => Parse.quoteInItem(it, quote)) : null);
      if (hit) { ok = true; where = `${esc(hit.sheet)} munkalap, ${hit.row}. sor (tétel ${esc(hit.id)})`; attr = `data-item="${esc(hit.id)}"`; }
    }
    // A modell néha nem egy darabban idéz (két mondatot összevon, vagy a közepét kihagyja): ilyenkor a leghosszabb, szó szerint megtalálható darabot keressük.
    if (!ok) {
      for (const fr of quoteFragments(quote)) {
        if (source !== 'tetelegyzek' && st.docIndex) { const loc = Parse.locateQuote(st.docIndex, fr); if (loc.found && loc.para) { ok = true; where = esc(paraLabel(loc.para)); attr = `data-para="${loc.para}"`; break; } }
        const hit = items().find(it => Parse.quoteInItem(it, fr));
        if (hit) { ok = true; where = `${esc(hit.sheet)} munkalap, ${hit.row}. sor (tétel ${esc(hit.id)})`; attr = `data-item="${esc(hit.id)}"`; break; }
      }
    }
    return `<div class="quote ${ok ? '' : 'unv'}"><span class="q-text">„${esc(quote)}”</span>${ok
      ? `<button class="q-src q-open" ${attr} data-quote="${esc(quote)}" title="Megnyitás a forrásban">Forrás: ${where} ›</button>`
      : '<span class="q-src">⚠ Ezt a mondatot a program nem találta meg szó szerint a feltöltött fájlokban: valószínűleg átfogalmazva idézte. A megállapítás ettől lehet helyes, de jóváhagyás előtt nézze meg a tételt vagy a dokumentumot.</span>'}</div>`;
  }
  /* ---------- Teendők: mit kell tenni ezzel az ajánlatkéréssel (az eredményekből összeállítva) ---------- */
  function todoList() {
    const all = items(), n = test => all.filter(i => test(makerOf(i))).length;
    const blocked = [...new Set(errorNotes().filter(e => e.p >= 50).map(e => e.it.id))].length;
    const work = [];
    work.push(st.letter
      ? { id: 'w-kerdes', text: `Kérdések elküldése: ${st.letter.parts.map(p => `${RCPT()[p.r].label} (${p.qs.length})`).join(', ')}`, hint: 'A levelek a Kérdések oldalon szerkeszthetők és kimásolhatók.', tab: 'kerdesek' }
      : { id: 'w-kerdes', text: 'A hibák jóváhagyása és a kérdések megírása', hint: 'A kérdések csak a jóváhagyott hibákból készülnek.', tab: 'ellenorzes' });
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
  // Generálkivitelezői munkánál az Eredmény második kártyája az Egyezés összefoglalója.
  function gkHubCard() {
    const R = Egyezes.state.result, gs = R.groups.filter(g => g.findings.length);
    const miss = Egyezes.missingGroups().length;
    // A kártyán a tartalmi eltérések (mennyiség, méret) a legérdekesebbek, nem a táblázat formai hibái.
    const KEY = ['Eltérő mennyiség', 'Nem fér el a megadott helyen', 'Eltérő méret'];
    const top = gs.flatMap(g => g.findings.filter(f => KEY.includes(f.t)).map(f => ({ g, f }))).sort((x, y) => y.f.p - x.f.p)
      .filter((x, i, arr) => arr.findIndex(z => z.g === x.g) === i).slice(0, 2);
    return `<div class="hubc warn"><div class="hub-n">${gs.length}</div><div class="hub-t">jelnél eltér a rajz, a konszignáció és a tételjegyzék</div>
      <ul><li><b>${miss} tétel nincs a küldött listában</b> (a rajzon vagy a konszignációban szerepel): valószínűleg más alvállalkozóé, érdemes megerősíttetni.</li>
      ${top.map(({ g, f }) => `<li><b>${esc(g.codes.join(', '))}:</b> ${esc(f.d)} <span class="muted">(${f.p}%)</span></li>`).join('')}
      <li>Amit jóváhagy, abból kérdés készül a generálkivitelezőnek.</li></ul>
      <button class="btn btn-primary" data-tab="egyezes">Egyezés</button> <button class="btn" data-tab="kerdesek">Levél</button></div>`;
  }
  function viewBrief() {
    const el = $('#view-osszefoglalo');
    if (!st.tender) { el.innerHTML = st.tenderStatus === 'err' ? `<div class="card"><div class="card-b empty neg-t">${esc(st.tenderError)}</div></div>` : waiting('A vezetői összefoglaló'); return; }
    const o = st.tender.osszefoglalo, c = counts();
    // Ha nem érkezett szerződés: a dokumentum hiányát a program maga jelzi (egy sor, forrás nélkül), a modell erről szóló kockázatát nem mutatjuk, mert ahhoz nincs mit idézni.
    const noDoc = !st.docs.length;
    const risks = noDoc ? o.kockazatok.filter(k => !(/hiány|nem érkez|nincs/i.test(k.cim) && /dokumentum|szerződés|feltétel|kiírás/i.test(k.cim + " " + k.leiras))) : o.kockazatok;
    const byMaker = Object.keys(MAKERS).map(k => ({ k, n: items().filter(i => makerOf(i) === k).length, q: qtyText(items().filter(i => makerOf(i) === k)) })).filter(x => x.n);
    let h = `<div class="view-head"><div><h2>${esc(o.targy)}</h2><p>${esc(o.ajanlatkero)}${o.eljaras ? ' · ' + esc(o.eljaras) : ''}</p></div></div>`;
    const allF = allFindings(), sure = allF.filter(x => x.p >= 50), top = sure.slice(0, 3);
    const fTitle = x => x.kind === 'item' ? (x.its.length > 1 ? x.its.length + ' tétel' : shortName(x.its[0].name)) : x.f.cim;
    h += `<p class="lead" style="margin-bottom:14px">${esc(o.rovid_leiras)}</p>`;
    // Határidők (a dokumentumból, forrással) és hol tart a munka: ezt kell először látni.
    const dl = (o.feltetelek || []).filter(f => /határid/i.test(f.nev)).map(f => {
      const m = String(f.ertek).match(/(\d{4})[.\-]\s?(\d{1,2})[.\-]\s?(\d{1,2})/);
      let left = '';
      if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]), n = Math.ceil((d - new Date()) / 86400000); left = n < 0 ? 'lejárt' : n === 0 ? 'ma' : `${n} nap van hátra`; }
      return `<div class="dl"><span class="dl-l">${esc(f.nev)}</span><b>${esc(String(f.ertek).slice(0, 80))}</b>${left ? `<span class="badge ${left === 'lejárt' ? 'grey' : 'warn'}">${left}</span>` : ''}</div>`;
    }).join('');
    const rvAll2 = reviewables(), open2 = rvAll2.filter(k => !st.review[k]).length, ok2 = rvAll2.filter(k => st.review[k] === 'ok').length + st.manual.length;
    const unsure = items().filter(i => makerConf(i) === 'bizonytalan').length;
    h += `<div class="status-strip">${dl ? `<div class="dls">${dl}</div>` : ''}
      <div class="sts"><span class="st-i"><b>${open2}</b> felvetés vár átnézésre</span><span class="st-i"><b>${ok2}</b> jóváhagyva</span>
      <span class="st-i">${st.letter ? `<b>${st.letter.qs.length}</b> kérdés kész` : 'kérdéslevél még nincs'}</span>${unsure ? `<span class="st-i"><b>${unsure}</b> tétel besorolása bizonytalan</span>` : ''}</div></div>`;
    h += `<div class="hub">
      <div class="hubc warn"><div class="hub-n">${sure.length}</div><div class="hub-t">biztos vagy valószínű hibát talált a kiírásban${allF.length > sure.length ? `, és ${allF.length - sure.length} további pontot, amit érdemes megnézni` : ''}${missingNotes().length ? `. Ezen felül ${missingNotes().length} hiányzó adat (külön listában)` : ''}</div>
        <ul>${top.map(x => `<li><b>${esc(fTitle(x))}:</b> ${esc(x.kind === 'item' ? x.n.szoveg : x.f.leiras)} <span class="muted">(${x.p}%)</span></li>`).join('') || '<li class="muted">Nem talált valószínű hibát.</li>'}</ul>
        <button class="btn btn-primary" data-tab="ellenorzes">Mind megnézem</button></div>
      ${mode === 'gk' && Egyezes.ready() ? gkHubCard() : (() => { const rvAll = reviewables(), nOk = rvAll.filter(k => st.review[k] === 'ok').length + st.manual.length; return `<div class="hubc"><div class="hub-n">${st.letter ? st.letter.qs.length : nOk}</div><div class="hub-t">${st.letter ? `kérdés kész, ${st.letter.parts.length} címzettnek` : 'probléma jóváhagyva; a kérdések a jóváhagyottakból készülnek'}</div>
        <ul>${st.letter ? st.letter.qs.slice(0, 2).map(q => `<li>${esc(q.slice(0, 150))}${q.length > 150 ? '…' : ''}</li>`).join('') : `<li>${rvAll.length - rvAll.filter(k => st.review[k]).length} felvetés vár átnézésre.</li><li>A Hibák oldalon hagyja jóvá, ami valóban tisztázandó.</li>`}</ul>
        <button class="btn" data-tab="${st.letter ? 'kerdesek' : 'ellenorzes'}">${st.letter ? 'Levél megnyitása' : 'Hibák átnézése'}</button></div>`; })()}
      <div class="hubc"><div class="hub-n">${c.items}</div><div class="hub-t">tételt rendezett és osztott szét (${esc(qtyText(items()))})</div>
        <div class="makers col">${byMaker.map(x => `<span class="mk ${MAKERS[x.k].cls}"><b>${MAKERS[x.k].label}</b> ${x.n} tétel · ${esc(x.q)}</span>`).join('')}</div>
        <button class="btn" data-tab="bontas">Tételek és gyártás</button></div>
      <div class="hubc"><div class="hub-n">${st.elapsedMs ? Math.round(st.elapsedMs / 1000) + ' mp' : '–'}</div><div class="hub-t">alatt olvasta végig a ${c.items} tételt és ${st.docIndex ? st.docIndex.paras.length.toLocaleString('hu-HU') + ' bekezdésnyi' : 'a'} dokumentumot</div>
        <ul><li>Az Árazás oldalon első árvázlatot ad; a végső árat a kolléga hagyja jóvá.</li><li>Az előkészített Excel letölthető, abban folytatható a munka.</li></ul>
        <button class="btn" data-tab="arazas">Árazás</button></div>
    </div>
    ${todoHtml()}
    <h4 class="sec">${noDoc ? 'A vezetésnek: feltételek és kockázatok a küldött tételjegyzék alapján' : 'A vezetésnek: feltételek és kockázatok a szerződésből'}</h4>
    ${noDoc ? '<p class="eg-how" style="margin-top:-4px">Szerződés vagy kiírási dokumentum nem érkezett, ezért az alábbiak csak a tételjegyzék szövegéből származnak. A fizetési feltételek, a határidő és a kötbér innen nem olvasható ki.</p>' : ''}`;
    h += `<div class="grid g-main"><div class="card"><div class="card-h"><h3>${noDoc ? 'A tételjegyzékből kiolvasható feltételek' : 'Feltételek, amelyek az árat és a kockázatot érintik'}</h3></div>
      <div class="tbl-wrap"><table><tbody>${o.feltetelek.map(f => `<tr><td class="k">${esc(f.nev)}</td><td>${esc(f.ertek)}${quoteSrc(f.idezet, 'dokumentum')}</td></tr>`).join('') || '<tr><td class="muted">Nincs ilyen feltétel.</td></tr>'}</tbody></table></div></div>
      <div><div class="card"><div class="card-h"><h3>Kockázatok</h3></div><div class="card-b risks">
      ${noDoc ? `<div class="risk"><span class="badge neg">Magas</span><div><b>Nem érkezett szerződés vagy feltétel</b><p>Csak a tételjegyzék érkezett meg. A fizetési feltétel, a teljesítési határidő, a kötbér és a jótállás ezért nem ismert: ezeket ajánlatadás előtt el kell kérni.</p><p class="muted small">Ezt a program a feltöltött fájlokból állapítja meg, nem a modell.</p></div></div>` : ''}
      ${risks.map(k => `<div class="risk"><span class="badge ${SEV[k.sulyossag].cls}">${SEV[k.sulyossag].label}</span><div><b>${esc(k.cim)}</b><p>${esc(k.leiras)}</p>${quoteSrc(k.idezet, 'dokumentum')}</div></div>`).join('') || (noDoc ? '' : '<span class="muted">Nincs kiemelt kockázat.</span>')}</div></div></div></div>`;
    el.innerHTML = h;
  }

  /* ---------- forrásnézet: az idézet a saját helyén, a környezetével ---------- */
  // Egy bekezdés helye: fájlnév és oldalszám (PDF), vagy bekezdésszám.
  function paraLabel(n) {
    const m = (st.docIndex.meta && st.docIndex.meta[n - 1]) || {};
    return (m.file || st.doc.fileName) + ', ' + (m.page ? m.page + '. oldal' : n + '. bekezdés');
  }
  // Az idézet darabjai (mondatonként, kihagyásnál szétvágva), a leghosszabb elöl.
  function quoteFragments(quote) {
    return String(quote || '').split(/\s*(?:\.{3,}|…|\[\.{3}\]|[.;:!?]\s+|\s[–-]\s)\s*/).map(s => s.trim()).filter(s => s.length >= 18).sort((a, b) => b.length - a.length);
  }
  // Az idézet helye a szövegben. Ha nem pontosan egyezik (más idézőjel, sortörés, szóköz), csak a betűket és számokat
  // hasonlítjuk, és az eredeti szövegre vetítjük vissza; végső esetben a leghosszabb egyező darabot jelöljük.
  function findSpan(text, quote) {
    text = String(text || ''); const q = String(quote || '').trim();
    if (!q || !text) return null;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i >= 0) return [i, i + q.length];
    const map = []; let s = '';
    for (let k = 0; k < text.length; k++) if (/[\p{L}\p{N}]/u.test(text[k])) { s += text[k].toLowerCase(); map.push(k); }
    const sq = x => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    for (const part of [q, ...quoteFragments(q)]) {
      const p = sq(part);
      if (p.length < 6) continue;
      const at = s.indexOf(p);
      if (at >= 0) return [map[at], map[at + p.length - 1] + 1];
    }
    return null;
  }
  // whole: ha az idézet nem található a szövegben, az egész szöveg legyen kiemelve (bekezdésnél), vagy semmi (táblázatcellánál).
  function mark(text, quote, whole = true) {
    text = String(text || '');
    const r = findSpan(text, quote);
    if (!r) return whole ? `<mark>${esc(text)}</mark>` : esc(text);
    return esc(text.slice(0, r[0])) + '<mark>' + esc(text.slice(r[0], r[1])) + '</mark>' + esc(text.slice(r[1]));
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
      body = `<table class="compact"><thead><tr><th>Ssz.</th><th>Megnevezés</th><th>Leírás</th><th class="num">Mennyiség</th></tr></thead><tbody><tr><td>${esc(it.no)}</td><td>${mark(it.name, d.quote, false)}</td><td>${mark(it.spec, d.quote, false)}</td><td class="num">${fmt(it.qty)} ${esc(it.unit)}</td></tr></tbody></table>`;
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
  // Üzemenkénti lista Excelben: ezt kapja meg az üzem vagy a beszállító.
  const WS = {
    fa: { title: 'Faüzem', test: m => m === 'fa' || m === 'fa_fem' },
    fem: { title: 'Fémüzem', test: m => m === 'fem' || m === 'fa_fem' },
    karpit: { title: 'Kárpitos', test: m => m === 'karpit' },
    beszallitoi: { title: 'Beszállítói tételek', test: m => m === 'beszallitoi' }
  };
  function downloadWorkshop(k) {
    const g = WS[k]; if (!g) return;
    const list = items().filter(i => g.test(makerOf(i)));
    const head = [[`${g.title}: gyártási lista`], [], ['Projekt', projectTitle()], ['Tételek', `${list.length} tétel · ${qtyText(list)}`], ['Készült', new Date().toLocaleDateString('hu-HU')], []];
    const rows = [['Tétel', 'Besorolás biztonsága', 'Megnevezés', 'Leírás', 'Szélesség (mm)', 'Mélység (mm)', 'Magasság (mm)', 'Anyag', 'Váz', 'Szín', 'Mennyiség', 'Egység', 'Megjegyzés', 'Forrás']];
    list.forEach(it => {
      const a = st.ai[it.id] || {};
      const notes = notesOf(it).filter(n => st.review[missKey(it, n)] === 'ok' || (n.tipus !== 'hiany' && (n.valoszinuseg == null || n.valoszinuseg >= 50))).map(n => n.szoveg).join(' | ');
      rows.push([it.id, MCONF[makerConf(it)].label, it.name, it.spec, a.szelesseg_mm || '', a.melyseg_mm || '', a.magassag_mm || '', a.anyag || '', a.vaz || '', a.szin || '', it.qty, it.unit, notes, `${it.sheet}, ${it.row}. sor`]);
    });
    const ws = XL.sheet(head.concat(rows), [10, 14, 34, 60, 11, 11, 11, 30, 24, 16, 10, 8, 50, 22], { title: [0], label: [2, 3, 4], head: [head.length], filter: true });
    const wb = XL.book();
    XL.add(wb, ws, g.title);
    XL.save(wb, `${(projectTitle() || 'ajanlatkeres').replace(/[\\/:*?"<>|]/g, '').slice(0, 60)} - ${g.title}.xlsx`);
  }
  // Mennyire biztos a gyártási besorolás. Ha a feldolgozás nem adott értéket (régebbi futás), szabály alapján:
  // kézzel átállított = biztos; vegyes (fa+fém) és kárpitos = bizonytalan (attól függ, házon belül gyártják-e); a többi valószínű.
  const MCONF = { biztos: { label: 'biztos', cls: 'ok' }, valoszinu: { label: 'valószínű', cls: 'warn' }, bizonytalan: { label: 'bizonytalan', cls: 'neg' } };
  function makerConf(it) {
    const a = st.ai[it.id] || {};
    if (a.gyarto_indok === 'Kézzel átállítva.' || a.gyarto_ok) return 'biztos';
    if (MCONF[a.gyarto_biztos]) return a.gyarto_biztos;
    return a.gyarto === 'fa_fem' || a.gyarto === 'karpit' ? 'bizonytalan' : 'valoszinu';
  }
  const confRank = { bizonytalan: 0, valoszinu: 1, biztos: 2 };
  function viewSplit() {
    const el = $('#view-bontas');
    if (!items().some(i => st.ai[i.id])) { el.innerHTML = waiting('A gyártási bontás'); return; }
    let h = `<div class="view-head"><div><h2>Tételek és gyártás</h2><p>Ki készíti az egyes tételeket. A program minden tételt besorolt, és megmondja, mennyire biztos benne. Önnek csak a <b>bizonytalanokat</b> kell átnéznie. A vegyes (fémváz + lapanyag) tételek mindkét üzem listáján megjelennek.</p></div>
      <div><button class="btn" data-tab="tetelek">Részletes tétellista, minden oszloppal →</button></div></div>`;
    const groups = [
      { k: 'fa', title: 'Faüzem', test: m => m === 'fa' || m === 'fa_fem' },
      { k: 'fem', title: 'Fémüzem', test: m => m === 'fem' || m === 'fa_fem' },
      { k: 'karpit', title: 'Kárpitos munka', test: m => m === 'karpit' },
      { k: 'beszallitoi', title: 'Beszállítói tételek (árajánlatot kell kérni)', test: m => m === 'beszallitoi' }
    ];
    const nUns = items().filter(i => st.ai[i.id] && makerConf(i) === 'bizonytalan').length;
    h += nUns ? `<div class="uns-bar"><b>${nUns} tétel besorolása bizonytalan.</b> A program nem biztos benne, hogy a jelenlegi üzemhez tartoznak; az indoklás a tétel alatt áll. Minden üzemnél ezek vannak elöl, sárgával. Ha nem oda valók, a „Gyártás” mezőben állítsa át, ha jók, nyomja meg a „Rendben” gombot. A többi tételt nem kell átnézni.</div>` : '';
    for (const g of groups) {
      const list = items().filter(i => g.test(makerOf(i))).sort((p, q) => confRank[makerConf(p)] - confRank[makerConf(q)]);
      if (!list.length) continue;
      h += `<div class="card"><div class="card-h"><h3><span class="mk ${MAKERS[g.k].cls}">${g.title}</span></h3><span class="muted">${list.length} tétel · ${esc(qtyText(list))}</span>
        <span class="ws-act"><button class="btn btn-sm btn-primary" data-ws="${g.k}">Letöltés (Excel)</button>${g.k === 'beszallitoi' ? ' <button class="btn btn-sm" id="btn-rfq">Ajánlatkérő szöveg másolása</button>' : ''}</span></div>
        <div class="tbl-wrap"><table class="compact"><thead><tr><th>Tétel</th><th>Megnevezés és a besorolás indoka</th><th>Gyártás (átállítható)</th><th>Méret (mm)</th><th>${g.k === 'fem' ? 'Váz' : 'Anyag'}</th><th class="num">Menny.</th><th>Rész</th></tr></thead><tbody>
        ${list.map(i => { const a = st.ai[i.id]; const cf = makerConf(i);
        return `<tr class="${cf === 'bizonytalan' ? 'uns' : ''}"><td class="code">${esc(i.id)}</td><td>${esc(i.name)}${makerOf(i) === 'fa_fem' ? ' <span class="badge grey">vegyes</span>' : ''}<div class="mconf"><span class="badge ${MCONF[cf].cls}" title="Mennyire biztos, hogy ide tartozik">${cf === 'bizonytalan' ? 'bizonytalan: nem biztos, hogy ide tartozik' : MCONF[cf].label}</span> <span class="muted small">${esc((st.ai[i.id] || {}).gyarto_indok || '')}</span></div></td><td class="mk-sel">${makerSelect(i)}${cf === 'bizonytalan' ? `<button class="btn btn-sm" data-maker-ok="${esc(i.id)}" title="A besorolás jó, nem kell átnézni">✓ Rendben</button>` : ''}</td><td class="mono">${esc(dims(a))}</td><td>${esc(g.k === 'fem' ? (a.vaz || a.anyag) : a.anyag)}</td><td class="num">${fmt(i.qty)} ${esc(i.unit)}</td><td class="muted">${esc(i.part)}</td></tr>`; }).join('')}
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
      if (!groups.has(key)) groups.set(key, { kind: 'item', key: 'i:' + key, p, n, its: [] });
      const g = groups.get(key); g.its.push(it); g.p = Math.max(g.p, p);
    }
    // A dokumentum-összevetés néha megismétli egy tétel saját ellentmondását: ha ugyanazt a tételt ugyanazzal az idézettel érinti, nem mutatjuk kétszer.
    const nz = t => String(t || '').toLowerCase().replace(/\s+/g, ' ');
    const frs = t => nz(t).split(/\s*(?:\[\.{3}\]|\.{3,}|…)\s*/).filter(fr => fr.length >= 12);
    const overlap = (a, b) => frs(a).some(fr => nz(b).includes(fr)) || frs(b).some(fr => nz(a).includes(fr));
    const dup = f => f.erintett_tetelek.length === 1 && [...groups.values()].some(g => g.its.some(i => i.id === f.erintett_tetelek[0]) && overlap(g.n.idezet, f.idezet));
    const docs = st.tender ? st.tender.ellenorzes.map((f, i) => ({ kind: 'doc', key: 'd:' + i, p: probF(f), f, i })).filter(x => !dup(x.f)) : [];
    return [...groups.values(), ...docs].sort((x, y) => y.p - x.p);
  }
  const whyNot = (t, p) => (t && p < 80 ? `<p class="whynot"><b>Lehet, hogy mégsem hiba:</b> ${esc(t)}</p>` : '');
  // Jóváhagyás: a kolléga dönti el, melyik felvetés valódi; a kérdések csak a jóváhagyottakból készülnek.
  function rvBtns(k) {
    const v = st.review[k] || '';
    return `<span class="rv"><button class="rv-b ok ${v === 'ok' ? 'on' : ''}" data-rv="${esc(k)}" data-v="ok">✓ Jóváhagyom</button><button class="rv-b no ${v === 'no' ? 'on' : ''}" data-rv="${esc(k)}" data-v="no">✗ Nem hiba</button></span>`;
  }
  const rvCls = k => (st.review[k] === 'ok' ? ' rv-ok' : st.review[k] === 'no' ? ' rv-no' : '');
  root.App.rvBtns = rvBtns; root.App.rvCls = rvCls;
  function findingHtml(x) {
    const bd = pband(x.p);
    const why = (x.n || x.f).pont_indok;
    const pb = `<span class="pbadge ${bd.cls}" title="${esc(why ? 'Miért ennyi: ' + why : 'Mennyire valószínű, hogy tényleg hiba')}">${x.p}% valószínű</span>`;
    if (x.kind === 'item') {
      const first = x.its[0];
      const title = x.its.length > 1 ? `${x.its.length} tétel: ${x.its.map(i => esc(shortName(i.name))).join(', ')}` : `${esc(shortName(first.name))} <span class="muted" style="font-weight:400">· ${fmt(first.qty)} ${esc(first.unit)}</span>`;
      return `<div class="flag ${bd.cls}${rvCls(x.key)}"><div class="flag-h">${pb}<span class="flag-id">${x.its.map(i => esc(i.id)).join(', ')}</span><span class="flag-type">${NOTE_TYPES[x.n.tipus] || ''}</span><span class="flag-title">${title}</span>${rvBtns(x.key)}</div>
        <div class="flag-b one"><div><p>${esc(x.n.szoveg)}</p>${whyNot(x.n.ha_megsem_hiba, x.p)}${quoteSrc(x.n.idezet, 'tetelegyzek', x.its.map(i => i.id))}</div></div></div>`;
    }
    const f = x.f;
    return `<div class="flag ${bd.cls}${rvCls(x.key)}"><div class="flag-h">${pb}<span class="flag-id">E-${String(x.i + 1).padStart(2, '0')}</span><span class="flag-type">${FIND_TYPES[f.tipus] || ''}</span><span class="flag-title">${esc(f.cim)}</span>${rvBtns(x.key)}</div>
      <div class="flag-b one"><div><p>${esc(f.leiras)}</p>${whyNot(f.ha_megsem_hiba, x.p)}${quoteSrc(f.idezet, f.forras, f.erintett_tetelek)}
      ${f.erintett_tetelek.length ? `<p class="muted small">Érintett tételek: ${f.erintett_tetelek.map(id => { const it = itemById(id); return it ? `<span class="badge grey" title="${esc(it.name)}">${esc(id)} ${esc(it.name)}</span>` : ''; }).join(' ')}</p>` : ''}</div></div></div>`;
  }
  // Saját észrevétel: amit a program nem talált meg. Automatikusan a jóváhagyottak közé kerül.
  function manualHtml() {
    return `<div class="card man"><div class="card-h"><h3>Saját észrevétel hozzáadása</h3><span class="muted small">Amit a program nem talált meg; ebből is kérdés készül.</span></div>
      <div class="card-b"><div class="man-f"><select id="man-item"><option value="">Általános (nem tételhez kötött)</option>${items().map(i => `<option value="${esc(i.id)}">${esc(i.id)} · ${esc(shortName(i.name, 60))}</option>`).join('')}</select>
      <textarea id="man-text" rows="2" placeholder="Például: a 14. tételnél nincs megadva a kárpit színe."></textarea><button class="btn btn-primary" id="man-add">Hozzáadás</button></div>
      ${st.manual.length ? `<ul class="man-l">${st.manual.map(m => { const it = m.item && itemById(m.item); return `<li><span class="badge ok">Saját</span> ${it ? `<b>${esc(it.id)} ${esc(shortName(it.name, 50))}:</b> ` : ''}${esc(m.text)} <button class="rm" data-man-del="${esc(m.id)}">Törlés</button></li>`; }).join('')}</ul>` : ''}</div></div>`;
  }
  function viewCheck() {
    const el = $('#view-ellenorzes');
    const c = counts();
    if (!st.tender && !c.read) { el.innerHTML = waiting('Az ellenőrzés'); return; }
    const all = allFindings(), miss = missingNotes();
    const rvAll = reviewables(), nOk = rvAll.filter(k => st.review[k] === 'ok').length, nNo = rvAll.filter(k => st.review[k] === 'no').length;
    let h = `<div class="view-head"><div><h2>Hibák a kiírásban</h2><p>Minden, ami lehet, hogy hibás, valószínűség szerint rendezve. Hagyja jóvá, ami valóban tisztázandó: a kérdések ezekből készülnek.</p></div>
      <div class="rv-sum"><span class="badge ok">${nOk} jóváhagyva</span> <span class="badge grey">${nNo} nem hiba</span> <button class="btn btn-sm" data-tab="kerdesek">Kérdések →</button></div></div>`;
    h += `<div class="pbands">${PBANDS.map(bd => `<span class="pbadge ${bd.cls}">${bd.label}: ${all.filter(x => pband(x.p) === bd).length}</span>`).join('')}${miss.length ? `<span class="pbadge pb-lo">Hiányzó adat: ${miss.length} (külön, lent)</span>` : ''}<span class="muted small">A program minden lehetséges hibát felvet, és megbecsüli, mennyire valószínű, hogy tényleg hiba. A „Forrás” gombbal ellenőrizhető.</span></div>`;
    for (const bd of PBANDS) {
      const list = all.filter(x => pband(x.p) === bd);
      if (!list.length) continue;
      // Gyors döntés egy egész sávra: csak a még el nem döntött pontokra hat, a már megjelöltet nem írja felül.
      const undec = list.map(x => x.key).filter(k => !st.review[k]);
      const bulk = undec.length > 1 ? `<span class="band-act"><button class="rv-b ok" data-rvall="ok" data-keys="${esc(undec.join('§'))}">✓ Mind jóváhagyom (${undec.length})</button><button class="rv-b no" data-rvall="no" data-keys="${esc(undec.join('§'))}">✗ Egyik sem hiba</button></span>` : '';
      h += `<h4 class="sec band-h">${bd.label} <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">(${bd.note})</span>${bulk}</h4>` + list.map(findingHtml).join('');
    }
    if (!all.length) h += `<div class="card"><div class="card-b muted">${c.read ? 'Nem talált hibát.' : 'Készül…'}</div></div>`;
    h += `<h4 class="sec">Saját észrevétel</h4>` + manualHtml();
    // Hiányzó adatok: tételenként összevonva, minden hiányosság mellett az eredeti sor megnyitható.
    const missBy = new Map();
    miss.forEach(({ it, n }) => { if (!missBy.has(it.id)) missBy.set(it.id, { it, ns: [] }); missBy.get(it.id).ns.push(n); });
    h += `<h4 class="sec">Hiányzó adatok: ${miss.length} hiányosság, ${missBy.size} tételnél</h4>
      <p class="eg-how">Ezek nem ellentmondások, hanem olyan információk, amelyek a kiírásból hiányoznak, de az árazáshoz kellenek (például méret, szín, anyag, típus). Ezért külön listában állnak, nem a fenti számokban. Tételenként vannak, és a „Forrás” gombbal megnyitható az eredeti sor.</p>
      <div class="card"><div class="card-b miss-l">
      ${[...missBy.values()].map(({ it, ns }) => `<div class="miss-i"><div class="miss-h"><span class="code">${esc(it.id)}</span> <b>${esc(shortName(it.name, 90))}</b> <span class="muted small">${esc(it.sheet)}, ${it.row}. sor</span> <button class="btn btn-sm" data-open-sheet="${esc(it.sheet)}" data-row="${it.row}">Forrás: ${it.row}. sor ›</button></div>
        ${ns.map(n => `<div class="miss-n${rvCls(missKey(it, n))}"><span>${esc(n.szoveg)}</span>${rvBtns(missKey(it, n))}</div>`).join('')}</div>`).join('') || '<span class="muted">Nincs hiányzó adat.</span>'}
      </div></div>`;
    // Mit nézett át a program: hogy a kolléga tudja, mire támaszkodhat, és mi marad az ő dolga.
    h += `<h4 class="sec">Mit ellenőrzött a program</h4><div class="card"><div class="card-b"><ul class="cov">
      <li><b>${c.items} tétel</b> mindegyikét végigolvasta (${c.read} már kész), és egyenként megkereste az ellentmondásokat, pontatlan leírásokat és hiányzó adatokat.</li>
      ${st.docIndex ? `<li>A kiírás dokumentumait (${st.docIndex.paras.length.toLocaleString('hu-HU')} bekezdés) összevetette a tételjegyzékkel.</li>` : ''}
      ${st.docs.some(d => d.scanned) ? `<li>A szkennelt PDF-eket szövegfelismeréssel olvasta be.</li>` : ''}
      ${gkMode() && Egyezes.ready() ? `<li>A tervlapokon minden alaprajzi jelet megkeresett a helyével együtt, és a rajzot, a konszignációt és a tételjegyzéket jel szerint, kódból számolva vetette össze (Egyezés oldal).</li>` : ''}
      <li class="muted">Amit nem értelmez: a dokumentumokba ágyazott fényképeket és ábrákat${gkMode() ? ', valamint a csak képként (szkennelve) érkezett tervlapot: ilyenkor a Feltöltés oldal jelzi, hogy abban a fájlban nem talált jelet' : ''}.</li></ul></div></div>`;
    el.innerHTML = h;
  }


  /* ---------- Árazás: első árvázlat tételtípusonként, mintaárakkal (pricing.js) ---------- */
  const ft = n => Math.round(n).toLocaleString('hu-HU') + ' Ft';
  // Az árazás csak a legalább 50%-os (vagy valószínűség nélküli) észrevételeket veszi ellentmondásnak; a hiányzó adat mindig számít.
  const priceNotes = it => notesOf(it).filter(n => n.tipus === 'hiany' || !Number.isFinite(n.valoszinuseg) || n.valoszinuseg >= 50);
  const priced = () => items().map(it => ({ it, p: Pricing.priceItem(it, st.ai[it.id], priceNotes(it), st.pricing.margin, st.pricing.risk) }));
  const priceOf = it => { const p = Pricing.priceItem(it, st.ai[it.id], priceNotes(it), st.pricing.margin, st.pricing.risk); return p.unit ? { avg: p.unit } : null; };
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
  // A tételjegyzékből hiányzó, de a konszignációban vagy a rajzon szereplő jelek: árazás előtt rákérdezni.
  function gkMissingHtml() {
    const list = Egyezes.missingGroups();
    if (!list.length) return '';
    // Ezek valószínűleg más alvállalkozóé: összecsukva, hogy az árvázlat legyen elöl.
    return `<details class="up-items eg-miss-d"><summary>Nincs a küldött listában: ${list.length} tétel, kié? <span class="muted" style="font-weight:400">· valószínűleg más alvállalkozóé; árazás előtt érdemes megerősíttetni</span></summary>
      <div class="tbl-wrap"><table class="compact"><thead><tr><th>Jel</th><th>Megnevezés</th><th class="num">Konszignáció</th><th class="num">Rajzon</th></tr></thead><tbody>
      ${list.map(g => `<tr><td class="code">${g.codes.map(esc).join(', ')}</td><td>${esc(g.name)}</td><td class="num">${g.kQty == null ? '–' : fmt(g.kQty) + ' ' + esc(g.unit)}</td><td class="num">${g.pCount ? g.pCount + ' hely' : '–'}</td></tr>`).join('')}
      </tbody></table></div></details>`;
  }

  function viewPricing() {
    const el = $('#view-arazas');
    const gkMiss = mode === 'gk' && Egyezes.ready() ? gkMissingHtml() : '';
    if (!items().some(i => st.ai[i.id])) { el.innerHTML = gkMiss + waiting('Az árvázlat'); return; }
    const all = priced(), T = Pricing.TYPES;
    const sum = list => list.reduce((s, x) => s + (x.p.unit || 0) * x.it.qty, 0);
    const byType = k => all.filter(x => x.p.type === k);
    let h = `<div class="view-head"><div><h2>Árazás: első árvázlat</h2></div></div>
      ${gkMiss}<div class="sample-note"><b>Mintaárak.</b> A számítás módszere a végleges; az egységárak (anyag, munkadíj, rezsi, katalógus- és beszállítói árak) helyére az Önök árlistája kerül.</div>`;
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
        <td><span class="badge ${T[p.type].cls}">${T[p.type].label}</span> <span class="muted small">${esc(p.reason || T[p.type].how)}</span>${p.warn ? `<div class="warn-t small">⚠ ${esc(p.warn)}</div>` : ''}${mode === 'gk' ? Egyezes.flagsForRow(it.row).map(f => `<div class="neg-t small">⚠ ${esc(f.t)}: ${esc(f.d)}</div>`).join('') : ''}</td>
        <td class="num">${p.unit ? ft(p.unit) : '<span class="faint">kolléga</span>'}</td><td class="num">${p.unit ? ft(p.unit * it.qty) : ''}</td>
        <td>${p.unit ? `<button class="btn btn-sm" data-pcalc="${esc(it.id)}">${open ? 'Bezár' : 'Számítás'}</button>` : ''}</td></tr>`;
      if (open && p.unit) h += `<tr class="calc-row"><td></td><td colspan="6">${calcHtml(p)}</td></tr>`;
    }
    h += `</tbody></table></div></div>`;
    el.innerHTML = h;
  }


  /* ---------- Kérdések: csak a jóváhagyott hibákból és a saját észrevételekből ---------- */
  const cleanQ = s => String(s || '').replace(/^\s*Tisztelt\s+[^!,.]{0,40}[!,.]\s*/i, '');
  const gkMode = () => mode === 'gk';
  const projectTitle = () => (gkMode() && Egyezes.projectName()) || (st.tender ? st.tender.osszefoglalo.targy : (st.book ? st.book.fileName : ''));
  const egyKey = (g, f) => 'e:' + g.codes.join(',') + '|' + f.t;
  const missKey = (it, n) => 'm:' + it.id + '|' + n.szoveg.trim().toLowerCase();
  // Minden felvetés, amit a kolléga jóváhagyhat (hibák, hiányzó adatok, és generálkivitelezőnél az egyezés eltérései).
  function reviewables() {
    const out = allFindings().map(x => x.key);
    missingNotes().forEach(({ it, n }) => out.push(missKey(it, n)));
    if (gkMode() && Egyezes.ready()) { Egyezes.state.result.groups.forEach(g => g.findings.forEach(f => out.push(egyKey(g, f)))); Egyezes.sheetFindings().forEach(x => out.push(x.key)); }
    return [...new Set(out)];
  }
  function approvedProblems() {
    const out = [], ok = k => st.review[k] === 'ok';
    for (const x of allFindings()) {
      if (!ok(x.key)) continue;
      if (x.kind === 'item') out.push({ id: x.key, forras: 'tétel', tetel: x.its.map(itemLabel).join('; '), cim: NOTE_TYPES[x.n.tipus] || 'Észrevétel', leiras: x.n.szoveg, idezet: x.n.idezet });
      else out.push({ id: x.key, forras: 'dokumentum', tetel: x.f.erintett_tetelek.map(itemById).filter(Boolean).map(itemLabel).join('; '), cim: x.f.cim, leiras: x.f.leiras, idezet: x.f.idezet });
    }
    missingNotes().forEach(({ it, n }) => { const k = missKey(it, n); if (ok(k)) out.push({ id: k, forras: 'hiányzó adat', tetel: itemLabel(it), cim: 'Hiányzó adat', leiras: n.szoveg, idezet: n.idezet }); });
    if (gkMode() && Egyezes.ready()) Egyezes.state.result.groups.forEach(g => g.findings.forEach(f => { const k = egyKey(g, f); if (ok(k)) out.push({ id: k, forras: 'egyezés', tetel: g.codes.join(', ') + (g.name ? ' – ' + g.name : ''), cim: f.t, leiras: f.d }); }));
    if (gkMode() && Egyezes.ready()) Egyezes.sheetFindings().forEach(x => { if (ok(x.key)) out.push({ id: x.key, forras: 'tételjegyzék', tetel: `${x.row}. sor${x.text ? ' – ' + x.text : ''}`, cim: x.t, leiras: x.d }); });
    st.manual.forEach(m => { const it = m.item && itemById(m.item); out.push({ id: 'k:' + m.id, forras: 'saját észrevétel', tetel: it ? itemLabel(it) : '', cim: 'Saját észrevétel', leiras: m.text }); });
    return out;
  }
  // Címzettek: a kérdések nem mind ugyanannak mennek. A külső címzetteknek hivatalos levél (a választott nyelven),
  // a belső kollégáknak rövid, tegező magyar üzenet. Alapból minden a külső címzetthez (generálkivitelező / ajánlatkérő) kerül.
  const RCPT_ORDER = ['kulso', 'tervezo', 'beszerzes', 'uzem'];
  const RCPT = () => ({
    kulso: { label: gkMode() ? 'Generálkivitelező' : 'Ajánlatkérő', intern: false, hint: gkMode() ? 'eltérések, hiányzó tételek, ami az ő listájukat érinti' : 'kiegészítő tájékoztatás-kérés' },
    tervezo: { label: 'Tervező', intern: false, hint: 'rajz, méret, konszignáció, műszaki tartalom' },
    beszerzes: { label: 'Belső: beszerzés', intern: true, hint: 'beszállítói ár, típus, szállítási idő' },
    uzem: { label: 'Belső: gyártás, üzem', intern: true, hint: 'gyárthatóság, anyag, munkaidő' }
  });
  const routeOf = p => (st.route[p.id] && RCPT()[st.route[p.id]] ? st.route[p.id] : 'kulso');
  // Régebbi mentésben a levél egyetlen címzetté: azt a külső címzetthez soroljuk.
  function normLetter(l) {
    if (!l) return l;
    if (!l.parts) l.parts = [{ r: 'kulso', qs: l.qs || [], text: l.text || '' }];
    l.qs = l.parts.flatMap(p => p.qs);
    return l;
  }
  const problemsSig = list => list.map(p => p.id + '|' + p.leiras + '|' + routeOf(p)).join('§');
  // A levél nyelve: magyar, német vagy román (a kérdéseket a modell ezen a nyelven írja). A belső üzenet mindig magyar.
  const LANGS = { hu: 'Magyar', de: 'Deutsch', ro: 'Română' };
  function letterText(qs, lang, r = 'kulso') {
    const gk = gkMode();
    const list = qs.map((q, n) => `${n + 1}. ${q}`).join('\n\n');
    if (RCPT()[r].intern) {
      const pn = projectTitle();
      return `Szia!\n\n${pn ? `A(z) „${pn}” ajánlatához` : 'Az ajánlathoz'} ezekre lenne szükségem:\n\n${list}\n\nKöszönöm!`;
    }
    // Közbeszerzésnél a tárgy a magyar összefoglalóból jön: idegen nyelvű levélbe nem tesszük bele.
    const pn = (lang && lang !== 'hu' && !gk) ? '' : projectTitle();
    const asGk = gk || r === 'tervezo';
    const T = {
      hu: {
        head: r === 'tervezo' ? `Tisztelt Tervező!\n\n${pn ? `A(z) „${pn}” projekt` : 'A projekt'} bútor- és asztalos tételeinek árazása előtt a tervekkel kapcsolatban az alábbiakat kérjük tisztázni:`
          : asGk ? `Tisztelt Címzett!\n\n${pn ? `A(z) „${pn}” projekt` : 'A projekt'} bútor- és asztalos tételeinek árazása előtt az alábbiakat kérjük tisztázni:`
          : `Tisztelt Ajánlatkérő!\n\n${pn ? `A(z) „${pn}” tárgyú eljárásban` : 'Az eljárásban'} az alábbi kiegészítő tájékoztatást kérjük:`,
        end: 'Válaszukat előre is köszönjük.\n\nTisztelettel:\nGarzon'
      },
      de: {
        head: asGk ? `Sehr geehrte Damen und Herren,\n\nvor der Kalkulation der Möbel- und Tischlerpositionen ${pn ? `des Projekts „${pn}“` : 'des Projekts'} bitten wir um Klärung der folgenden Punkte:`
          : `Sehr geehrte Damen und Herren,\n\nim vorliegenden Vergabeverfahren bitten wir um folgende ergänzende Auskünfte:`,
        end: 'Für Ihre Antwort bedanken wir uns im Voraus.\n\nMit freundlichen Grüßen\nGarzon'
      },
      ro: {
        head: asGk ? `Stimate doamne și domni,\n\nînainte de ofertarea pozițiilor de mobilier și tâmplărie ${pn ? `ale proiectului „${pn}”` : 'ale proiectului'}, vă rugăm să clarificați următoarele:`
          : `Stimate doamne și domni,\n\nîn cadrul prezentei proceduri vă rugăm să ne furnizați următoarele clarificări:`,
        end: 'Vă mulțumim anticipat pentru răspuns.\n\nCu stimă,\nGarzon'
      }
    }[lang || 'hu'];
    return `${T.head}\n\n${list}\n\n${T.end}`;
  }
  const questionsText = () => (st.letter ? st.letter.parts.map(p => p.text).join('\n\n\n') : '');
  async function writeQuestions() {
    const probs = approvedProblems();
    if (!probs.length || st.writing) return;
    st.writing = true; st.letterError = ''; render();
    const R = RCPT(), errs = [];
    const groups = RCPT_ORDER.map(r => ({ r, probs: probs.filter(p => routeOf(p) === r) })).filter(g => g.probs.length);
    // Címzettenként külön kérés, egyszerre: a modell minden címzettnek a saját hangnemében ír.
    const parts = await Promise.all(groups.map(async ({ r, probs: ps }) => {
      const lang = R[r].intern ? 'hu' : st.lang;
      let qs;
      try {
        const cimzett = r === 'kulso' ? (gkMode() ? 'gk' : 'ajanlatkero') : r;
        const out = await api('questions', { cimzett, projekt: projectTitle(), problems: ps, nyelv: lang });
        qs = out.kerdesek.map(q => cleanQ(q.kerdes));
      } catch (e) {
        // Ha a szolgáltatás nem érhető el, egyszerű vázlat a jóváhagyott problémákból (szerkeszthető).
        qs = ps.map(p => `${p.tetel ? p.tetel + ': ' : ''}${p.leiras || p.cim} ${R[r].intern ? 'Kérlek, nézd meg.' : 'Kérjük pontosítani.'}`);
        errs.push(`${R[r].label}: ${e.message}`);
      }
      return { r, qs, text: letterText(qs, lang, r) };
    }));
    if (errs.length) st.letterError = 'A kérdések megírása nem sikerült minden címzettnél (' + errs.join('; ') + '). Ezeknél egyszerű vázlat készült a jóváhagyott problémákból.';
    st.letter = normLetter({ parts, sig: problemsSig(probs), lang: st.lang });
    st.letters[st.lang] = st.letter;
    st.writing = false; render(); saveJobSoon();
  }
  // Ki kapja a kérdést: soronként választható. Azonos forrású pontoknál (például 22 „nincs a küldött listában”) egyszerre is átállítható.
  function routeHtml(probs) {
    const R = RCPT();
    const opts = cur => RCPT_ORDER.map(k => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(R[k].label)}</option>`).join('');
    const counts = RCPT_ORDER.map(k => ({ k, n: probs.filter(p => routeOf(p) === k).length })).filter(x => x.n);
    // Az ismétlődő, azonos című pontok (például 22 „nincs a küldött listában”) egy sorban, egy választóval.
    const byCim = {};
    probs.forEach(p => (byCim[p.cim] = byCim[p.cim] || []).push(p));
    const rows = [], seen = new Set();
    probs.forEach(p => {
      const grp = byCim[p.cim];
      if (grp.length >= 3) { if (!seen.has(p.cim)) { seen.add(p.cim); rows.push({ grp }); } }
      else rows.push({ p });
    });
    return `<div class="card route"><div class="card-h"><h3>Kinek szól?</h3><span class="muted small">${counts.map(x => `${esc(R[x.k].label)}: <b>${x.n}</b>`).join(' · ')}</span></div>
      <div class="card-b"><p class="muted" style="margin:0 0 10px">Nem minden kérdés ugyanannak megy. Állítsa át, ami a tervezőre, a beszerzésre vagy az üzemre tartozik: a program címzettenként külön levelet ír, a belső kollégáknak rövid üzenetet.</p>
      <div class="tbl-wrap"><table class="compact"><thead><tr><th>Tétel</th><th>Probléma</th><th>Címzett</th></tr></thead><tbody>
      ${rows.map(({ p, grp }) => {
        if (grp) {
          const rs = new Set(grp.map(routeOf)), cur = rs.size === 1 ? [...rs][0] : '';
          return `<tr><td class="muted">${grp.length} tétel: ${esc(shortName(grp.map(x => x.tetel.split(' – ')[0]).join(', '), 70))}</td><td><b>${esc(grp[0].cim)}</b> <span class="muted small">· egy kérdésben</span></td>
            <td><select class="route-sel r-${cur || 'kulso'}" data-route-all="${esc(grp.map(x => x.id).join('§'))}">${cur ? '' : '<option value="">vegyes</option>'}${opts(cur)}</select></td></tr>`;
        }
        return `<tr><td class="muted">${esc(shortName(p.tetel || 'általános', 60))}</td><td><b>${esc(p.cim)}</b>${p.leiras && p.leiras !== p.cim ? ` <span class="muted small">· ${esc(shortName(p.leiras, 110))}</span>` : ''}</td>
        <td><select class="route-sel r-${routeOf(p)}" data-route="${esc(p.id)}">${opts(routeOf(p))}</select></td></tr>`;
      }).join('')}
      </tbody></table></div></div></div>`;
  }
  function viewQuestions() {
    const el = $('#view-kerdesek');
    if (!st.book) { el.innerHTML = waiting('A kérdéslista'); return; }
    const probs = approvedProblems(), all = reviewables(), R = RCPT();
    const open = all.filter(k => !st.review[k]).length, own = st.manual.length;
    let h = `<div class="view-head"><div><h2>Kérdések</h2><p>A kérdések a jóváhagyott hibákból és a saját észrevételekből készülnek, címzettenként külön levélben. Küldés előtt szerkeszthető.</p></div></div>`;
    h += `<div class="card"><div class="card-b q-sum"><div><b>${probs.length}</b> jóváhagyott probléma${own ? ` (ebből ${own} saját észrevétel)` : ''} · <span class="muted">${open} felvetés még nincs átnézve</span></div>
      <div class="actions"><label class="lang-l">A külső levelek nyelve <select id="q-lang" ${st.writing ? 'disabled' : ''}>${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${st.lang === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      ${probs.length ? `<button class="btn btn-primary" id="btn-write-q" ${st.writing ? 'disabled' : ''}>${st.writing ? '<span class="spin"></span> Kérdések írása…' : (st.letter ? 'Kérdések újraírása' : 'Kérdések megírása')}</button>` : ''}
      <button class="btn" data-tab="ellenorzes">Hibák átnézése</button>${gkMode() && Egyezes.ready() ? '<button class="btn" data-tab="egyezes">Egyezés átnézése</button>' : ''}</div></div></div>`;
    if (st.letter && st.letter.sig !== problemsSig(probs)) h += `<div class="callout warn-c">A jóváhagyások vagy a címzettek megváltoztak a levél megírása óta. A „Kérdések újraírása” gombbal frissíthető.</div>`;
    if (st.letterError) h += `<div class="callout warn-c">${esc(st.letterError)}</div>`;
    if (!probs.length) h += `<div class="card"><div class="card-b empty">Még nincs jóváhagyott probléma. A <b>Hibák a kiírásban</b>${gkMode() ? ' és az <b>Egyezés</b>' : ''} oldalon a „Jóváhagyom” gombbal jelölje meg, ami valóban tisztázandó, vagy vegyen fel saját észrevételt. A kérdések ezekből készülnek.</div></div>`;
    else h += routeHtml(probs);
    if (st.letter) {
      st.letter.parts.forEach(p => {
        const rc = R[p.r] || R.kulso, lang = rc.intern ? 'hu' : (st.letter.lang || 'hu');
        h += `<h4 class="sec q-to"><span class="route-tag r-${p.r}">${esc(rc.label)}</span> ${p.qs.length} kérdés${rc.intern ? ' · belső üzenet' : ` · ${LANGS[lang]}`}</h4>
          <div class="grid g-main"><div class="card"><div class="card-h"><h3>Kérdések (${p.qs.length})</h3></div><div class="card-b qs">${p.qs.map((q, n) => `<div class="q"><span class="q-n">${n + 1}.</span><div><p class="q-k">${esc(q)}</p></div></div>`).join('')}</div></div>
          <div class="card"><div class="card-h"><h3>${rc.intern ? 'Üzenet' : 'Levél'}</h3><span><button class="btn btn-sm" data-mail="${p.r}">E-mail megnyitása</button> <button class="btn btn-primary btn-sm" data-copy-letter="${p.r}">Szöveg másolása</button></span></div><div class="card-b"><textarea class="letter-ta" data-letter="${p.r}" rows="${Math.min(22, 8 + p.qs.length * 3)}">${esc(p.text)}</textarea></div></div></div>`;
      });
    }
    el.innerHTML = h;
  }
  const letterPart = r => (st.letter ? st.letter.parts.find(p => p.r === r) : null);

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
  // A saját gépen (bemutatón) nem kérdez rá: ott a kreditet a gép gazdája költi, és a kérdés az ügyfél előtt zavaró.
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const creditOk = () => { if (isLocal) return true; try { return sessionStorage.getItem('creditOk') === '1'; } catch (e) { return false; } };
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
  // Azonos szövegű tételhibát egyszer küldünk; a hiányzó adatokat tételenként egy felvetésbe fogjuk.
  // A kérdések levele is ebből készül: minden legalább 50%-os hibához és hiányhoz egy kérdés, valószínűség szerint.
  // onlyMissing: csak a hiányzó adatokat pontozza, és a kérdéseiket a meglévő levélhez adja (a mentett mintához).
  const itemLabel = it => `${it.partNo}. rész ${String(String(it.id).split('/')[1] || it.id).split('#')[0]}. tétel (${shortName(it.name, 80)})`;
  async function rescore(onlyMissing) {
    const groups = new Map(), list = [];
    const ctxOf = it => `${it.name} | ${it.qty} ${it.unit} | ${it.spec}`;
    for (const it of items()) {
      const miss = notesOf(it).filter(n => n.tipus === 'hiany');
      if (miss.length) {
        const key = 'hiany|' + it.id;
        groups.set(key, { notes: miss, its: [it] });
        list.push({ id: 'n' + list.length, key, allitas: 'HIÁNYZÓ ADAT: ' + miss.map(n => n.szoveg).join(' '), idezet: miss.map(n => n.idezet).filter(Boolean).join(' / '), ha_megsem_hiba: miss.map(n => n.ha_megsem_hiba).filter(Boolean).join(' '), kontextus: ctxOf(it) });
      }
      if (onlyMissing) continue;
      for (const n of notesOf(it)) {
        if (n.tipus === 'hiany') continue;
        const key = n.tipus + '|' + n.szoveg.trim().toLowerCase();
        if (!groups.has(key)) { groups.set(key, { notes: [], its: [] }); list.push({ id: 'n' + list.length, key, allitas: n.szoveg, idezet: n.idezet, ha_megsem_hiba: n.ha_megsem_hiba || '', kontextus: ctxOf(it) }); }
        const g = groups.get(key); g.notes.push(n); if (!g.its.includes(it)) g.its.push(it);
      }
    }
    list.forEach(f => { if (f.key) f.tetelek = groups.get(f.key).its.map(itemLabel).join('; '); });
    if (!onlyMissing) (st.tender ? st.tender.ellenorzes : []).forEach((f, i) => {
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
        if (p.valoszinuseg >= 50 && p.kerdes && p.kerdes.trim()) qs.push({ kerdes: p.kerdes.trim(), miert: src.allitas.replace(/^HIÁNYZÓ ADAT: /, 'Hiányzó adat: '), erintett_tetelek: ids, valoszinuseg: p.valoszinuseg, doc: !src.key });
      }
      if (st.tender && qs.length) {
        if (!st.tender.kerdesek_elso) st.tender.kerdesek_elso = st.tender.kerdesek;
        const isDoc = q => (q.doc != null ? q.doc : st.tender.ellenorzes.some(f => q.miert.startsWith(f.cim + ':')));
        const all = (onlyMissing ? st.tender.kerdesek.map(q => ({ ...q, doc: isDoc(q) })) : []).concat(qs);
        // Egyetlen tételt érintő dokumentum-kérdés kimarad, ha arra a tételre már van tétel-kérdés (ugyanazt kérdezné).
        // A megmaradó tétel-kérdés megkapja a kimaradó dokumentum-kérdés valószínűségét, ha az nagyobb (a sorrend miatt).
        const itemQ = new Set(all.filter(q => !q.doc).flatMap(q => q.erintett_tetelek));
        const dropped = all.filter(q => q.doc && q.erintett_tetelek.length === 1 && itemQ.has(q.erintett_tetelek[0]));
        for (const d of dropped) for (const q of all) if (!q.doc && q.erintett_tetelek.includes(d.erintett_tetelek[0])) q.valoszinuseg = Math.max(q.valoszinuseg, d.valoszinuseg);
        st.tender.kerdesek = all.filter(q => !dropped.includes(q))
          .sort((x, y) => y.valoszinuseg - x.valoszinuseg);
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
    // Generálkivitelezői munkánál a tételhez tartozó konszignációs lap is a leírás része lesz (méret, anyag, felület).
    if (mode === 'gk' && Egyezes.ready()) items().forEach(it => {
      if (it.konsz) return;
      const k = Egyezes.konszTextForRow(it.row);
      if (k) { it.konsz = true; it.spec = (it.spec ? it.spec + ' | ' : '') + k; }
    });
    st.running = true; st.startedAt = Date.now(); st.elapsedMs = 0;
    const tick = setInterval(renderTimer, 500);
    render();
    await Promise.all([runTender(), pool(st.book.parts.map(p => () => runPart(p)), 10)]);
    await rescore();
    clearInterval(tick);
    st.running = false; st.elapsedMs = Date.now() - st.startedAt;
    if (done() && st.tender) st.tab = 'osszefoglalo';
    st.savedOffer = null; render(); saveJobSoon();
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
        Egyezes.trySheet(file);
        try { st.book = await Parse.readWorkbook(await file.arrayBuffer(), file.name, sheets => api('columns', { sheets })); } finally { st.detecting = false; }
        st.ai = {}; st.tender = null; st.rev = null; st.partStatus = {}; st.tenderStatus = 'idle'; st.elapsedMs = 0;
        if (st.book.items.length) checkSaved();
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
  // Egy mappa (vagy több kijelölt fájl) behúzása: a mappák tartalmát is kibontjuk.
  async function filesFromDrop(dt) {
    const entries = [...(dt.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (!entries.length) return [...dt.files];
    const out = [];
    const walk = async en => {
      if (en.isFile) { out.push(await new Promise((res, rej) => en.file(res, rej))); return; }
      const rd = en.createReader();
      for (;;) { const batch = await new Promise((res, rej) => rd.readEntries(res, rej)); if (!batch.length) break; for (const b of batch) await walk(b); }
    };
    for (const en of entries) await walk(en);
    return out;
  }
  // Az összes fájl egyszerre: a táblázatból dönti el a munkatípust (ha van "Alaprajzi jel" oszlop, generálkivitelezői munka),
  // utána mindent a helyére tesz: Excel = tételjegyzék; közbeszerzésnél a PDF és Word a kiírás; generálkivitelezőnél a PDF-ek konszignáció vagy tervlap.
  async function loadAll(files) {
    if (st.running) return;
    files = files.filter(f => !/^[.~]/.test(f.name) && /\.(xlsx?|xlsm|pdf|docx|txt)$/i.test(f.name));
    const sheets = files.filter(f => /\.(xlsx?|xlsm)$/i.test(f.name));
    if (!sheets.length) { alert('A fájlok között nincs Excel tételjegyzék.'); return; }
    const sheet = sheets[0];
    let gk = false;
    try { Egyezes.readSheet(await sheet.arrayBuffer(), sheet.name); gk = true; } catch (e) { gk = false; }
    st = fresh(); Egyezes.reset(); mode = gk ? 'gk' : 'kozbeszerzes';
    st.loadingAll = `${files.length} fájl beolvasása (${gk ? 'generálkivitelezői munka' : 'közbeszerzés'})…`; render();
    const rest = files.filter(f => f !== sheet);
    const docs = gk ? rest.filter(f => /\.(docx|txt)$/i.test(f.name)) : rest.filter(f => /\.(pdf|docx|txt)$/i.test(f.name));
    const pdfs = gk ? rest.filter(f => /\.pdf$/i.test(f.name)) : [];
    try {
      await Promise.all([
        setFile('sheet', sheet),
        docs.length ? setFile('doc', docs) : null,
        pdfs.length ? Egyezes.addFiles(pdfs) : null
      ]);
    } finally { st.loadingAll = ''; }
    st.tab = gk && Egyezes.ready() ? 'egyezes' : 'feltoltes';
    render();
  }
  const getFile = async (url, name) => new File([await (await fetch(url)).blob()], name);
  async function loadSample(key) {
    const S = SAMPLES[key]; if (!S || st.running) return;
    st = fresh(); st.sample = key; mode = 'kozbeszerzes'; Egyezes.reset(); render();
    await setFile('sheet', await getFile(S.sheet[0], S.sheet[1]));
    await setFile('doc', await Promise.all(S.docs.map(d => getFile(d[0], d[1]))));
    // Ha ehhez a mintához van előre feldolgozott eredmény, a feldolgozás azt játssza vissza (API nélkül).
    try { const s = await (await fetch('data/mentett.json')).json(); if (s && s.sample === key) { st.replay = s; st.chatCache = s.chatCache || {}; } } catch (e) { /* nincs mentett eredmény: élő feldolgozás */ }
    render();
  }
  // Feldolgozott munkák mentése ezen a gépen (böngésző tárhely): ugyanannak a tételjegyzéknek az újbóli feltöltésekor
  // az eredmény ingyen visszatölthető, nem kell újra futtatni. Legfeljebb 8 munka; a legrégebbi törlődik.
  const JOBS = 'garzon-munkak';
  const fingerprint = () => st.book ? [mode, st.book.fileName, st.book.items.length, st.book.items.reduce((a, i) => a + (i.qty || 0), 0)].join('|') : '';
  const readJobs = () => { try { return JSON.parse(localStorage.getItem(JOBS) || '{}'); } catch (e) { return {}; } };
  function saveJob() {
    if (!done() || !st.tender || st.running) return;
    const jobs = readJobs(), fp = fingerprint();
    jobs[fp] = { savedAt: new Date().toISOString(), title: projectTitle(), snap: { ...snapshot(), review: st.review, manual: st.manual, route: st.route, letters: st.letters, lang: st.lang } };
    const keys = Object.keys(jobs).sort((a, b) => (jobs[b].savedAt > jobs[a].savedAt ? 1 : -1));
    keys.slice(8).forEach(k => delete jobs[k]);
    for (let n = 0; n < 8; n++) {
      try { localStorage.setItem(JOBS, JSON.stringify(jobs)); return; } catch (e) { const ks = Object.keys(jobs).sort((a, b) => (jobs[a].savedAt > jobs[b].savedAt ? 1 : -1)); if (ks.length <= 1) return; delete jobs[ks[0]]; }
    }
  }
  let saveTimer = null;
  function saveJobSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveJob, 800); }
  root.App.saveSoon = saveJobSoon;
  function checkSaved() {
    if (!st.book || done()) return;
    const j = readJobs()[fingerprint()];
    st.savedOffer = j ? { savedAt: j.savedAt } : null;
  }
  function openSaved() {
    const j = readJobs()[fingerprint()]; if (!j) return;
    const s = j.snap;
    restore(s); st.replay = null; st.replayed = false;
    Object.assign(st, { review: s.review || {}, manual: s.manual || [], route: s.route || {}, letters: s.letters || {}, lang: s.lang || 'hu' });
    Object.keys(st.letters).forEach(k => { st.letters[k] = normLetter(st.letters[k]); });
    st.letter = st.letters[st.lang] || null;
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
  root.App.helpers = { items, makerOf, notesOf, dims, counts, earlierFlags, priceOf, todoList, recipients: RCPT, NOTE_TYPES, SEV, FIND_TYPES, IMPACT };

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
      if (m && m.a && !m.added) { st.manual.push({ id: Date.now().toString(36), item: '', text: cleanQ(m.a.kerdes_az_ajanlatkeronek) }); m.added = true; render(); }
    }
    // A besorolás jó: biztosra vált, de a program indoklása megmarad.
    else if (t.dataset.makerOk) { const a = st.ai[t.dataset.makerOk]; if (a) { a.gyarto_ok = true; const y = window.scrollY; render(); window.scrollTo(0, y); saveJobSoon(); } }
    else if (t.dataset.openSheet !== undefined) { e.preventDefault(); openSheet(t.dataset.openSheet, t.dataset.row); }
    else if (t.dataset.openDoc !== undefined) { e.preventDefault(); openDoc(t.dataset.openDoc, t.dataset.page); }
    else if (t.dataset.pcalc) { const y = window.scrollY; st.pricing.open[t.dataset.pcalc] = !st.pricing.open[t.dataset.pcalc]; render(); window.scrollTo(0, y); }
    else if (t.dataset.remove) { e.preventDefault(); removeFile(t.dataset.remove, t.dataset.name); }
    else if (t.dataset.sample) loadSample(t.dataset.sample);
    else if (t.id === 'btn-rev-sample') { const S = SAMPLES[st.sample]; getFile(S.rev[0], S.rev[1]).then(setRevision); }
    else if (t.id === 'btn-rev-retry') summarizeRevision();
    else if (t.id === 'btn-saved') fetch('data/mentett.json').then(r => r.json()).then(restore).catch(() => alert('A mentett eredmény nem tölthető be.'));
    else if (t.id === 'btn-new') { if (!st.running) { st = fresh(); Egyezes.reset(); render(); } }
    else if (t.id === 'btn-gk') loadGk();
    // Tartalék, ha élőben nem érhető el a feldolgozás: a korábbi futás eredménye (helyben, data/_gk.json).
    else if (t.id === 'btn-saved-run') fetch(savedFile()).then(r => r.json()).then(s => { restore(s); st.replay = null; render(); }).catch(() => alert('A korábbi feldolgozás nem tölthető be.'));
    else if (t.dataset.mode) { mode = t.dataset.mode; if (st.tab === 'egyezes' && mode !== 'gk') st.tab = 'feltoltes'; render(); }
    else if (t.dataset.retry) retry(t.dataset.retry);
    else if (t.dataset.rvall) { const y = window.scrollY; t.dataset.keys.split('§').forEach(k => { if (!st.review[k]) st.review[k] = t.dataset.rvall; }); render(); window.scrollTo(0, y); saveJobSoon(); }
    else if (t.dataset.rv) { const y = window.scrollY, k = t.dataset.rv; st.review[k] = st.review[k] === t.dataset.v ? '' : t.dataset.v; render(); window.scrollTo(0, y); saveJobSoon(); }
    else if (t.id === 'man-add') { const txt = ($('#man-text') || {}).value || ''; if (txt.trim()) { st.manual.push({ id: Date.now().toString(36), item: ($('#man-item') || {}).value || '', text: txt.trim() }); const y = window.scrollY; render(); window.scrollTo(0, y); } }
    else if (t.dataset.manDel) { st.manual = st.manual.filter(m => m.id !== t.dataset.manDel); const y = window.scrollY; render(); window.scrollTo(0, y); }
    else if (t.id === 'btn-write-q') writeQuestions();
    else if (t.dataset.upManual !== undefined) { st.manualOpen = !st.manualOpen; render(); }
    else if (t.id === 'btn-open-saved') openSaved();
    else if (t.id === 'btn-run-again') { st.savedOffer = null; run(); }
    else if (t.dataset.mail) { const p = letterPart(t.dataset.mail); if (p) { const rc = RCPT()[p.r]; const subj = (rc.intern ? 'Ajánlat: ' : p.r === 'kulso' && !gkMode() ? 'Kiegészítő tájékoztatás-kérés: ' : 'Kérdések: ') + projectTitle(); location.href = 'mailto:?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(p.text); } }
    else if (t.dataset.ws) downloadWorkshop(t.dataset.ws);
    else if (t.dataset.copyLetter) { const p = letterPart(t.dataset.copyLetter); if (p) copy(p.text, t); }
    else if (t.id === 'btn-rfq') copy(rfqText(), t);
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.type === 'file' && t.files[0]) { const k = t.closest('.drop').dataset.kind; if (k === 'all') loadAll([...t.files]); else if (k === 'egyezes') Egyezes.addFiles([...t.files]); else if (k === 'rev') setRevision(t.files[0]); else { if (k === 'sheet') st.sample = ''; setFile(k, k === 'doc' ? [...t.files] : t.files[0]); } }
    else if (t.dataset.maker) { st.ai[t.dataset.maker].gyarto = t.value; st.ai[t.dataset.maker].gyarto_indok = 'Kézzel átállítva.'; const y = window.scrollY; render(); window.scrollTo(0, y); saveJobSoon(); }
    else if (t.dataset.route) { const y = window.scrollY; st.route[t.dataset.route] = t.value; render(); window.scrollTo(0, y); saveJobSoon(); }
    else if (t.dataset.routeAll && t.value) { const y = window.scrollY; t.dataset.routeAll.split('§').forEach(k => { st.route[k] = t.value; }); render(); window.scrollTo(0, y); saveJobSoon(); }
    else if (t.id === 'q-lang') { st.lang = t.value; st.letter = normLetter(st.letters[st.lang]) || null; render(); saveJobSoon(); }
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
    if (ev === 'drop' && d.dataset.kind === 'all') { filesFromDrop(e.dataTransfer).then(loadAll); return; }
    if (ev === 'drop' && e.dataTransfer.files[0]) {
      if (d.dataset.kind === 'egyezes') Egyezes.addFiles([...e.dataTransfer.files]);
      else if (d.dataset.kind === 'rev') setRevision(e.dataTransfer.files[0]);
      else { if (d.dataset.kind === 'sheet') st.sample = ''; setFile(d.dataset.kind, d.dataset.kind === 'doc' ? [...e.dataTransfer.files] : e.dataTransfer.files[0]); }
    }
  }));
  // A „Fájlok egyenként” rész nyitva maradjon a következő rajzoláskor is.
  document.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('up-manual')) { const o = e.target.open; if (st.manualOpen !== o) { st.manualOpen = o; render(); } } }, true);
  document.addEventListener('input', e => { const p = e.target.dataset && e.target.dataset.letter && letterPart(e.target.dataset.letter); if (p) { p.text = e.target.value; saveJobSoon(); } });
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
