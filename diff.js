/*
 * Tételjegyzék-revíziók összevetése. Itt nincs mesterséges intelligencia: a tételek párosítása és a
 * szöveges eltérés kiszámítása determinisztikus, ezért minden jelzett változás biztosan ott van a fájlban.
 */
(function (root) {
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();

  // Tételek párosítása részen belül: azonos sor és megnevezés, majd azonos megnevezés, végül azonos sor.
  function pairItems(oldItems, newItems) {
    const taken = new Set();
    const pick = test => newItems.find(x => !taken.has(x) && test(x));
    const pairs = oldItems.map(o => [o, null]);
    const passes = [
      (o, x) => x.row === o.row && norm(x.name) === norm(o.name),
      (o, x) => norm(x.name) === norm(o.name),
      (o, x) => x.row === o.row
    ];
    for (const test of passes) {
      pairs.forEach(p => {
        if (p[1]) return;
        const n = pick(x => test(p[0], x));
        if (n) { taken.add(n); p[1] = n; }
      });
    }
    return { pairs, added: newItems.filter(x => !taken.has(x)) };
  }

  function compareBooks(a, b) {
    const changes = [];
    const usedParts = new Set();
    a.parts.forEach((pa, i) => {
      let pb = b.parts.find(p => !usedParts.has(p) && norm(p.sheet) === norm(pa.sheet));
      if (!pb && b.parts[i] && !usedParts.has(b.parts[i])) pb = b.parts[i];
      if (pb) usedParts.add(pb);
      const { pairs, added } = pairItems(pa.items, pb ? pb.items : []);
      pairs.forEach(([o, n]) => {
        if (!n) { changes.push({ kind: 'removed', part: pa.name, id: o.id, old: o }); return; }
        const fields = [];
        if (o.name !== n.name) fields.push('name');
        if (norm(o.spec) !== norm(n.spec)) fields.push('spec');
        if (o.qty !== n.qty) fields.push('qty');
        if (norm(o.unit) !== norm(n.unit) && o.unit && n.unit) fields.push('unit');
        if (fields.length) changes.push({ kind: 'changed', part: pa.name, id: o.id, old: o, new: n, fields });
      });
      added.forEach(n => changes.push({ kind: 'added', part: pa.name, id: n.id, new: n }));
    });
    b.parts.filter(p => !usedParts.has(p)).forEach(p => p.items.forEach(n => changes.push({ kind: 'added', part: p.name, id: n.id, new: n })));
    return changes;
  }

  // Szavankénti eltérés (leghosszabb közös részsorozat). Eredmény: [['=', szöveg], ['-', szöveg], ['+', szöveg], ...]
  function wordDiff(a, b) {
    const A = String(a || '').match(/\S+\s*/g) || [], B = String(b || '').match(/\S+\s*/g) || [];
    const k = t => t.trim();
    let s = 0; while (s < A.length && s < B.length && k(A[s]) === k(B[s])) s++;
    let e = 0; while (e < A.length - s && e < B.length - s && k(A[A.length - 1 - e]) === k(B[B.length - 1 - e])) e++;
    const a2 = A.slice(s, A.length - e), b2 = B.slice(s, B.length - e);
    const N = a2.length, M = b2.length;
    const dp = Array.from({ length: N + 1 }, () => new Uint16Array(M + 1));
    for (let i = N - 1; i >= 0; i--) for (let j = M - 1; j >= 0; j--)
      dp[i][j] = k(a2[i]) === k(b2[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const ops = A.slice(0, s).map(t => ['=', t]);
    let i = 0, j = 0;
    while (i < N && j < M) {
      if (k(a2[i]) === k(b2[j])) { ops.push(['=', a2[i]]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push(['-', a2[i++]]);
      else ops.push(['+', b2[j++]]);
    }
    while (i < N) ops.push(['-', a2[i++]]);
    while (j < M) ops.push(['+', b2[j++]]);
    A.slice(A.length - e).forEach(t => ops.push(['=', t]));
    const out = [];
    ops.forEach(([o, t]) => { if (out.length && out[out.length - 1][0] === o) out[out.length - 1][1] += t; else out.push([o, t]); });
    return out;
  }

  root.Diff = { compareBooks, wordDiff };
})(window);
