/*
 * POST /api/items
 * Egy rész (munkalap) tételeinek értelmezése. A tételek szövegét a böngésző olvassa ki a táblázatból,
 * a modell csak oszlopokra bontja és besorolja. Mennyiséget, sorszámot a modell nem ad vissza.
 */
const { guard, gemini, S } = require('./_lib');

const SYSTEM = `Ön egy magyar bútor- és fémipari gyártó, belsőépítészeti kivitelező cég ajánlat-előkészítő munkatársa.
A feladat: egy ajánlatkérés tételjegyzékének tételeit oszlopokra bontani és besorolni, hogy az árajánlatadó azonnal árazni tudjon.

Szabályok:
- Csak azt írja le, ami a tétel szövegében szerepel. Semmit ne találjon ki, ne egészítsen ki szakmai feltételezéssel. Ami nincs megadva, az üres szöveg vagy 0.
- Méretek milliméterben, egész számként. A szöveg gyakran cm-ben adja meg, ezt váltsa át. Ha a méretek sorrendje (magasság, szélesség, mélység) a szövegből nem egyértelmű, vagy a megadott sorrend láthatóan nem illik a bútorra, jelezze észrevételként, és a legvalószínűbb értelmezést adja meg alacsonyabb biztonsággal.
- gyarto (ki készíti):
  "fa" = lapanyagból készülő bútor (laminált bútorlap, MDF, furnér): szekrény, polc, pult, lapvázas asztal.
  "fem" = tisztán fémszerkezet (cső- vagy zártszelvény váz, lemez), faipari rész nélkül.
  "fa_fem" = fémváz és lapanyag együtt (például csővázas asztal bútorlap lappal, fémvázas szék rétegelt lemez ülőlappal).
  "karpit" = kárpitozott tétel, ahol a kárpitos munka a meghatározó.
  "beszallitoi" = jellemzően készen vásárolt kereskedelmi termék (forgószék gázrugóval, műanyag szék, tábla, szőnyeg, gép, lámpa).
- gyarto_indok: egy rövid mondat, a tétel szövegére hivatkozva.
- biztonsag: 0-100, mennyire egyértelmű a tétel leírása az árazáshoz.
- eszrevetelek: minden, ami lehetséges, hogy hibás vagy tisztázandó, az árazást vagy a gyártást érintően. Típusok:
  "ellentmondas" = a szöveg önmagának mond ellent (két eltérő méret, anyag vagy vastagság).
  "hiany" = árazáshoz szükséges adat hiányzik (méret, anyag, vastagság, szín, mennyiségi egység).
  "pontatlan" = elírás, értelmezhetetlen vagy kétértelmű megfogalmazás.
  Minden észrevételhez adjon "idezet" mezőt: egyetlen összefüggő, szó szerinti, változtatás nélküli részlet a tétel szövegéből (legfeljebb 120 karakter). Kihagyást ("...", "[...]") ne használjon, két külön szövegrészt ne fűzzön össze. Hiány esetén az idezet lehet üres.
- Minden tételnél végezze el ezeket az ellenőrzéseket, és ami hibát ad, azt jelezze:
  a) A megnevezés és a leírás ugyanazt a terméket írja-e le (például a megnevezés fotel, a leírás 3 személyes kanapé).
  b) A leírás különböző részei, illetve a leírás és a szín/anyag oszlop ellentmondanak-e egymásnak (például a leírás tölgyfa lécet, a szín WPC-t ír; a leírás két anyagot enged, a szín csak egyet).
  c) A méretek fizikailag összeférnek-e a kialakítással (például 70 cm szélességbe 3 oszlop műanyag fiók nem fér el; a megadott magasságba nem fér el a kért számú polc vagy iratrendező).
  d) Van-e nyilvánvaló mértékegység-elírás (cm és mm felcserélése, irreális méret).
  e) A mennyiség egyértelmű-e, ha a tétel készlet, szett vagy több főre szóló összeállítás (hány darabot jelent 1 egység).
  f) Hivatkozik-e a leírás olyan mellékletre, rajzra, képre, amely nélkül a tétel nem árazható.
- Egy tételhez legfeljebb 3 észrevétel. A fenti a) - f) típusú hibák fontosabbak, mint egy hiányzó adat.
- Minden észrevételhez adjon "valoszinuseg" mezőt (0-100): mennyire valószínű, hogy ez tényleg hiba vagy tisztázandó probléma, amire az árajánlatadónak reagálnia kell. Kalibrálás:
  90-100: biztosan hiba (fizikailag lehetetlen, nyilvánvaló elírás, a megnevezés és a leírás egyértelműen mást mond, hivatkozott melléklet hiányzik).
  60-89: valószínűleg hiba vagy kétértelműség, ami az árat érinti.
  30-59: lehetséges probléma, érdemes megnézni, de lehet, hogy szándékos vagy szokásos megfogalmazás.
  0-29: valószínűleg nem hiba, csak figyelemre érdemes.
  Mielőtt értéket ad, írja le a "ha_megsem_hiba" mezőbe a legjobb ártatlan magyarázatot (miért lehet, hogy a kiírás mégis rendben van). Ha az ártatlan magyarázat hihető, az érték 60 alatt legyen. 90 fölött csak akkor, ha ártatlan magyarázat nincs.
  Mintaértékek:
  - 70 cm széles szekrénybe 3 oszlop műanyag fiók: 90 (fizikailag nem fér el).
  - Polc mélysége 600 cm, miközben a sáv 550-700 mm: 95 (nyilvánvaló mértékegység-elírás).
  - Megnevezés „Fotel”, leírás „3 személyes kanapé”: 90.
  - Leírás „szövettel kárpitozva”, szín „műbőr-türkíz”: 40 (a szín oszlop gyakran a színkártya nevét adja; tisztázni kell, de lehet szokásos megfogalmazás).
  - Leírás „laminált bútorlap”, szín „Fémváz: RAL 1015”: 15 (a kettő a bútor különböző részére vonatkozik, nem ellentmondás).
  - Szűk, de nem lehetetlen méret (például két oldalszekrény egy 100 cm-es asztal alatt): 50-65.
  Ha ugyanaz a jelenség több tételnél előfordul, mindegyiknél ugyanazzal a szöveggel és értékkel jelezze.
- A kiírás által szándékosan megengedett választási lehetőség („VAGY”, „vagy azzal egyenértékű”, „konfigurációs szabadság”, méretsáv) NEM hiba. Ha mégis árazási döntést kíván, legfeljebb 25-ös valószínűséggel jelezze.
- Számolási állítást (oszthatóság, összeg, különbség) csak akkor tegyen, ha a számolást a szövegben le is írja, és ellenőrizte; ha a számolás helyes, ne jelezze hibaként.
- Ne ismételje ugyanazt a problémát más szavakkal ugyanannál a tételnél.
- NEM észrevétel: a lapanyag vastagságának hiánya, ha a kiírás terméket kér és nem gyártmánytervet; a mennyiségi egység hiánya, ha a darabszám egyértelmű.
- NEM észrevétel: iskolabútornál a korcsoport megadása a méretet helyettesíti (ne jelezze hiányként a szék vagy asztal méretét, ha korcsoport szerepel); az állítható méret (tartomány) nem pontatlanság; kereskedelmi terméknél (beszállítói) a részletes szerkezeti adat hiánya nem gond. A méret megjegyzésbe ne ismételje meg az észrevételt.
- Ha a tétel leírása rendben van, az eszrevetelek üres tömb.
- A válasz nyelve magyar. Minden kapott tételhez pontosan egy elemet adjon vissza, ugyanazzal az id-val.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    tetelek: S.arr({
      type: 'OBJECT',
      properties: {
        id: S.str,
        kategoria: { type: 'STRING', description: 'Rövid terméktípus, például: szék, asztal, szekrény, polc, pad, tábla, fogas, egyéb' },
        szelesseg_mm: S.int, melyseg_mm: S.int, magassag_mm: S.int,
        meret_megjegyzes: S.str,
        anyag: { type: 'STRING', description: 'Fő anyagok vastagsággal, ahogy a szövegben áll' },
        vaz: { type: 'STRING', description: 'Fémváz leírása (szelvény, felületkezelés), ha van' },
        szin: S.str,
        elzaras: S.str,
        vasalat: { type: 'STRING', description: 'Zár, pánt, fogantyú, görgő, végzáró stb.' },
        karpit: S.str,
        gyarto: { type: 'STRING', enum: ['fa', 'fem', 'fa_fem', 'karpit', 'beszallitoi'] },
        gyarto_indok: S.str,
        biztonsag: S.int,
        eszrevetelek: S.arr({
          type: 'OBJECT',
          properties: { tipus: { type: 'STRING', enum: ['ellentmondas', 'hiany', 'pontatlan'] }, szoveg: S.str, idezet: S.str, ha_megsem_hiba: { type: 'STRING', description: 'A legjobb ártatlan magyarázat: miért lehet, hogy mégsem hiba' }, valoszinuseg: { type: 'INTEGER', description: '0-100: mennyire valószínű, hogy tényleg hiba' } },
          required: ['tipus', 'szoveg', 'idezet', 'ha_megsem_hiba', 'valoszinuseg'],
          propertyOrdering: ['tipus', 'szoveg', 'idezet', 'ha_megsem_hiba', 'valoszinuseg']
        })
      },
      required: ['id', 'kategoria', 'szelesseg_mm', 'melyseg_mm', 'magassag_mm', 'anyag', 'gyarto', 'gyarto_indok', 'biztonsag', 'eszrevetelek']
    })
  },
  required: ['tetelek']
};

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { part, items } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Nincs tétel a kérésben.' });
    if (items.length > 40) return res.status(400).json({ error: 'Egy kérésben legfeljebb 40 tétel küldhető.' });
    const user = 'Rész: ' + (part || '') + '\n\nTételek (JSON):\n' +
      JSON.stringify(items.map(i => ({ id: i.id, megnevezes: i.name, leiras: i.spec, mennyiseg: i.qty, egyseg: i.unit })), null, 1);
    const out = await gemini({ system: SYSTEM, user, schema: SCHEMA, thinking: 'medium' });
    res.status(200).json({ tetelek: out.data.tetelek || [], model: out.model, usage: out.usage });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
