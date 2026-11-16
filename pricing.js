/*
 * Árazási bemutató: első árvázlat tételtípusonként, MINTAÁRAKKAL.
 * Nincs mesterséges intelligencia és nincs API-hívás: a módszert mutatja, nem valódi árat.
 * Az éles változatban a cég saját árlistája, normaidői és kalkulációs sémája kerülne a SAMPLE helyére.
 */
(function (root) {
  const SAMPLE = {
    // Saját gyártás: anyagok, munkadíjak, kalkulációs séma (a korábbi demó mintaszintjei)
    lap18: { name: '18 mm laminált bútorlap', unit: 'm²', price: 5400, waste: 0.18 },
    lap25: { name: '25 mm laminált bútorlap', unit: 'm²', price: 6900, waste: 0.18 },
    hdf: { name: 'HDF hátfal 3 mm', unit: 'm²', price: 1250, waste: 0.10 },
    el: { name: 'ABS élzárás 2 mm', unit: 'fm', price: 240, waste: 0.10 },
    elv: { name: 'ABS élzárás 42×2 mm', unit: 'fm', price: 380, waste: 0.10 },
    pant: { name: 'Pánt, csillapított', unit: 'db', price: 1950 },
    zar: { name: 'Bútorzár', unit: 'db', price: 1800 },
    fogo: { name: 'Fogantyú', unit: 'db', price: 2400 },
    fiok: { name: 'Fiókrendszer', unit: 'garn.', price: 16800 },
    acel: { name: 'Acél zártszelvény', unit: 'kg', price: 540, waste: 0.08 },
    porf: { name: 'Porfestés (bérmunka)', unit: 'm²', price: 3400 },
    retl: { name: 'Rétegelt lemez ülés/támla', unit: 'm²', price: 9000, waste: 0.15 },
    forg: { name: 'Forgácslap kárpitváz', unit: 'm²', price: 2600, waste: 0.15 },
    hab: { name: 'HR hab', unit: 'm³', price: 118000, waste: 0.10 },
    szovet: { name: 'Kárpitszövet (140 cm)', unit: 'fm', price: 9800, waste: 0.20 },
    oraAsztalos: 3300, oraLakatos: 3400, oraKarpitos: 3200,
    jarulek: 0.13, anyagrezsi: 0.04, uak: 1.5, vak: 0.09,
    // Katalógus: ismétlődő, saját termékek listaára (minta)
    katalogus: [
      ['vezetői forgószék', 89000], ['irodai forgószék', 46500], ['forgószék', 39800], ['tárgyaló szék', 42000],
      ['műanyag szék', 9800], ['bárszék', 24500], ['munka szék', 28000]
    ],
    // Beszállítói: a beszállító ajánlata (minta) + kezelési díj
    beszallito: [
      ['moduláris tábla', 145000], ['modurális tábla', 145000], ['partyasztal', 38000], ['bárasztal', 42000], ['fogas', 18500],
      ['vitrin', 165000], ['fém polc', 52000], ['kulcstároló', 24000], ['puff', 28000], ['asztal', 45000]
    ],
    kezelesi: 0.08
  };

  const r0 = n => Math.round(n);
  const r2 = n => Math.round(n * 100) / 100;
  const low = s => String(s || '').toLowerCase();
  const find = (list, name) => { const n = low(name); const hit = list.find(([k]) => n.includes(k)); return hit ? hit[1] : null; };

  // Anyag- és munkasorok egy saját gyártású tételhez, a méretekből (egyszerűsített szabályok).
  function build(it, a) {
    const W = (a.szelesseg_mm || 0) / 1000, D = (a.melyseg_mm || 0) / 1000, H = (a.magassag_mm || 0) / 1000;
    const cat = low(a.kategoria), m = a.gyarto, mat = [], lab = [];
    const add = (k, q, note) => { const s = SAMPLE[k]; mat.push({ name: s.name, unit: s.unit, q: r2(q * (1 + (s.waste || 0))), price: s.price, note }); };
    const work = (who, h) => lab.push({ name: who === 'l' ? 'Lakatos' : who === 'k' ? 'Kárpitos' : 'Asztalos', h: r2(h), rate: who === 'l' ? SAMPLE.oraLakatos : who === 'k' ? SAMPLE.oraKarpitos : SAMPLE.oraAsztalos });
    const steel = len => { add('acel', len * 1.7, `${r2(len)} m cső × 1,7 kg/m`); add('porf', len * 0.12, 'festett felület'); work('l', 0.6 + 0.25 * len); };

    if (m === 'karpit') {
      const seat = W * D, back = W * H * 0.5;
      add('forg', seat + back, 'ülés + támla váz');
      add('hab', seat * 0.1 + back * 0.08, '10 cm ülés, 8 cm támla');
      add('szovet', (seat * 2 + back * 2) / 1.4, '140 cm-es vég');
      work('k', 1.2 + 1.6 * W); work('a', 0.6);
    } else if (/szék/.test(cat)) {
      steel(4.2); add('retl', 0.35, 'ülőlap + háttámla'); work('a', 0.3);
    } else if (/szekrény|konténer|polc|tároló/.test(cat)) {
      const n = Math.max(1, Math.round(H / 0.35) - 1);
      const box = 2 * H * D + 2 * W * D + n * W * D, front = /polc/.test(cat) ? 0 : W * H;
      add('lap18', box + front, `korpusz ${r2(box)} m² + front ${r2(front)} m²`);
      if (!/polc/.test(cat)) add('hdf', W * H, 'hátfal');
      add('el', 2 * H + 2 * W + n * W + (front ? 2 * (W + H) : 0), 'látszó élek');
      if (/konténer/.test(low(it.name)) || (H < 0.8 && W < 0.5)) { mat.push({ name: SAMPLE.fiok.name, unit: 'garn.', q: 3, price: SAMPLE.fiok.price }); }
      else if (front) { const doors = W > 0.6 ? 2 : 1; mat.push({ name: SAMPLE.pant.name, unit: 'db', q: doors * Math.max(2, Math.ceil(H / 0.8)), price: SAMPLE.pant.price }); mat.push({ name: SAMPLE.fogo.name, unit: 'db', q: doors, price: SAMPLE.fogo.price }); mat.push({ name: SAMPLE.zar.name, unit: 'db', q: 1, price: SAMPLE.zar.price }); }
      work('a', 1.5 + 0.6 * (box + front));
      if (m === 'fa_fem') steel(2 * (W + H));
    } else {
      // asztal, pad és hasonló: lap + láb (laplábas) vagy fémváz
      add('lap25', W * D, 'asztallap');
      add('elv', 2 * (W + D), 'lap élzárás');
      if (m === 'fa_fem' || m === 'fem') steel(4 * H + 2 * W + 2 * D);
      else { add('lap25', 2 * H * D, 'laplábak'); add('el', 4 * H, 'láb élek'); }
      work('a', 1 + 0.5 * W * D);
    }
    return { mat, lab };
  }

  // Kalkulációs séma: anyag + anyagrezsi + bér + járulék + üzemi rezsi + vállalati rezsi = önköltség
  function schema(mat, lab) {
    const anyag = mat.reduce((s, x) => s + x.q * x.price, 0);
    const ber = lab.reduce((s, x) => s + x.h * x.rate, 0);
    const rows = [
      ['Anyag', anyag], ['Anyagbeszerzési költség (4%)', anyag * SAMPLE.anyagrezsi],
      ['Munkabér', ber], ['Járulék (13%)', ber * SAMPLE.jarulek], ['Üzemi általános költség (bér 150%-a)', ber * SAMPLE.uak]
    ];
    const kozvetlen = rows.reduce((s, x) => s + x[1], 0);
    rows.push(['Vállalati általános költség (9%)', kozvetlen * SAMPLE.vak]);
    return { rows, onkoltseg: kozvetlen * (1 + SAMPLE.vak) };
  }

  const TYPES = {
    katalogus: { label: 'Katalógus', cls: 't-kat', how: 'Ismétlődő saját termék: ár a cég árlistájából.' },
    beszallitoi: { label: 'Beszállítói', cls: 't-besz', how: 'Beszállítói ajánlat alapján, kezelési díjjal.' },
    gyartott: { label: 'Saját gyártás', cls: 't-gyart', how: 'Kalkuláció a méretekből: anyag, munka, rezsi.' },
    egyedi: { label: 'Egyedi: a kolléga árazza', cls: 't-egyedi', how: 'Hiányzó méret, rajz vagy ellentmondás: a program nem ad árat.' }
  };

  // Egy tétel árvázlata. margin és risk százalékban (a „piaci döntés” része, a felhasználó adja meg).
  function priceItem(it, a, notes, margin, risk) {
    a = a || {};
    const mult = (1 + margin / 100) * (1 + risk / 100);
    const dims = [a.szelesseg_mm, a.melyseg_mm, a.magassag_mm];
    const contra = (notes || []).some(n => n.tipus === 'ellentmondas');
    // Kárpitos tételnél az ellentmondás többnyire az anyagról szól (szövet vagy műbőr), ami az árat eldönti: ilyenkor nem adunk árat.
    const blocking = contra && a.gyarto === 'karpit';
    if (a.gyarto === 'beszallitoi') {
      const kat = find(SAMPLE.katalogus, it.name);
      if (kat) return { type: 'katalogus', unit: r0(kat * (1 + risk / 100)), detail: [[`Listaár (mintakatalógus): ${low(it.name)}`, kat]] };
      const b = find(SAMPLE.beszallito, it.name);
      if (b) { const unit = r0(b * (1 + SAMPLE.kezelesi) * mult); return { type: 'beszallitoi', unit, detail: [['Beszállítói ajánlat (minta)', b], ['Kezelési díj (8%)', b * SAMPLE.kezelesi]] }; }
      return { type: 'egyedi', reason: 'Nincs beszállítói ár: ajánlatot kell kérni.' };
    }
    const multi = /összeállítás/.test(low(a.kategoria) + ' ' + low(it.name));
    if (multi || dims.filter(x => x > 0).length < 3)
      return { type: 'egyedi', reason: multi ? 'Összeállítás több elemből: a kolléga állítja össze.' : 'Hiányzó méret: rajz vagy pontosítás kell.' };
    if (blocking) return { type: 'egyedi', reason: 'Ellentmondás a leírásban: előbb tisztázni kell.' };
    const { mat, lab } = build(it, a);
    const s = schema(mat, lab);
    return { type: 'gyartott', unit: r0(s.onkoltseg * mult), mat, lab, rows: s.rows, onkoltseg: s.onkoltseg, warn: contra ? 'A leírásban ellentmondás van: a vázlat a kiírt méretekből számol, tisztázás után változhat.' : '' };
  }

  root.Pricing = { SAMPLE, TYPES, priceItem };
})(window);
