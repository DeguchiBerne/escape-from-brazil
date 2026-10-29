/* Escape from Brazil — mapas isométricos no estilo SimCity 2000.
   Grade 10×10 de losangos 32×16. A casa [c, r] tem o vértice de cima em top(c, r):
   c cresce para baixo-direita, r para baixo-esquerda. As estradas ligam os lugares
   de cada fase em "L" (primeiro ao longo de c, depois de r) e são também o caminho
   por onde a família anda. Desenho em canvas 2D puro; o chão fica em cache por fase. */
(function (root) {
  'use strict';

  const C = root.EscapeCore;
  const N = C.GRID, W = 320, H = 208, OX = 160, OY = 34, SCALE = 2;
  const top = (c, r) => [OX + (c - r) * 16, OY + (c + r) * 8];
  const center = (c, r) => [OX + (c - r) * 16, OY + (c + r) * 8 + 8];
  const key = (c, r) => c + ',' + r;

  function hash(x, y, k) {
    let h = (x * 374761393 + y * 668265263 + k * 2246822519) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  const THEMES = [
    { grass: ['#b49d57', '#a08b49', '#c7b16a'], road: 'asphalt', earth: ['#8a4b2c', '#6e3a22'] },   // cerrado seco
    { grass: ['#5aa548', '#4c9140', '#6fbb5b'], road: 'dirt', earth: ['#8a3f22', '#6d2f18'] },      // terra roxa
    { grass: ['#5aa548', '#4c9140', '#6fbb5b'], road: 'asphalt', earth: ['#7a5236', '#5e3f2a'] },
    { grass: ['#3f8f45', '#33793a', '#52a45a'], road: 'dirt', earth: ['#8a3f22', '#6d2f18'] },      // Misiones
    { grass: ['#6a9c4a', '#5b8a40', '#7caf5a'], road: 'taxi', earth: ['#6b5a48', '#54463a'] },
  ];

  const grid = fill => Array.from({ length: N }, (_, c) => Array.from({ length: N }, (_, r) => fill(c, r)));

  // Caminho em "L" de a até b, incluindo as duas pontas.
  function lpath(a, b) {
    const out = [[a[0], a[1]]];
    let [c, r] = a;
    while (c !== b[0]) { c += Math.sign(b[0] - c); out.push([c, r]); }
    while (r !== b[1]) { r += Math.sign(b[1] - r); out.push([c, r]); }
    return out;
  }

  const layouts = {};
  function layout(p) {
    if (layouts[p]) return layouts[p];
    const ph = C.PHASES[p];
    const ground = grid(() => 'grass');
    const objs = grid(() => null);
    const paths = {};
    const roads = new Set();
    const out = {};   // estradas que saem do mapa: casa -> direção extra

    if (p === 0) for (let r = 0; r < N; r++) ground[9][r] = 'water';          // Lago Paranoá
    if (p === 2) for (let r = 0; r < N; r++) ground[8][r] = 'water';          // Rio Paraná
    if (p === 3) for (let c = 0; c < N; c++) ground[c][0] = 'water';          // Rio Iguaçu
    if (p === 4) {
      for (let c = 0; c < N; c++) for (let r = 0; r < N; r++) ground[c][r] = 'apron';
      for (let r = 0; r < N; r++) { ground[9][r] = 'runway'; ground[0][r] = 'grass'; }
      for (let c = 0; c < 9; c++) ground[c][9] = 'grass';
    }

    const road = (c, r) => {
      if (ground[c][r] === 'water') ground[c][r] = 'bridge';
      else if (ground[c][r] !== 'runway') ground[c][r] = 'road';
      roads.add(key(c, r));
    };
    for (const [a, b] of ph.edges) {
      const tiles = lpath(ph.nodes[a].at, ph.nodes[b].at);
      paths[a + '|' + b] = tiles;
      tiles.forEach(([c, r]) => road(c, r));
    }
    // Saída de cada fase continua até a borda do mapa.
    const exitAt = ph.nodes[ph.exits[0].at].at;
    if (p === 0) { road(8, 0); out[key(8, 0)] = [0, -1]; }
    if (p === 1) { road(9, 3); out[key(9, 3)] = [1, 0]; }
    if (p === 2) { road(8, 5); road(9, 5); out[key(9, 5)] = [1, 0]; }
    if (p === 3) { road(9, 4); }
    void exitAt;

    for (const [id, n] of Object.entries(ph.nodes)) {
      const [c, r] = n.at;
      ground[c][r] = ground[c][r] === 'runway' ? 'runway' : 'plaza';
      roads.add(key(c, r));
    }
    // O prédio de cada lugar fica numa casa "atrás" dele, para a família ficar à frente.
    const free = (c, r) => c >= 0 && r >= 0 && c < N && r < N && !roads.has(key(c, r)) && !objs[c][r]
      && ground[c][r] !== 'water' && ground[c][r] !== 'runway';
    for (const [id, n] of Object.entries(ph.nodes)) {
      const [c, r] = n.at;
      const spot = [[c, r - 1], [c - 1, r], [c - 1, r - 1], [c + 1, r - 1], [c - 1, r + 1], [c + 1, r], [c, r + 1]].find(([x, y]) => free(x, y));
      if (spot) objs[spot[0]][spot[1]] = { type: n.icon, node: id };
    }

    const fixed = {
      0: [[1, 2, 'congresso']],
      1: [[6, 8, 'silo']],
      2: [[6, 5, 'flagBR'], [9, 4, 'flagAR'], [8, 5, 'arch']],
      3: [[2, 0, 'falls'], [5, 0, 'falls'], [6, 6, 'casino']],
      4: [[1, 2, 'ctltower']],
    }[p];
    for (const [c, r, type] of fixed) if (!objs[c][r]) objs[c][r] = { type };

    for (let c = 0; c < N; c++) for (let r = 0; r < N; r++) {
      if (objs[c][r] || roads.has(key(c, r))) continue;
      const g = ground[c][r], h = hash(c, r, p + 11), v = hash(r, c, p + 23);
      if (g === 'water' || g === 'runway') continue;
      let type = null;
      if (p === 0) type = h < 0.34 ? 'bloco' : h < 0.58 ? (v < 0.5 ? 'ipe' : 'cerrado') : null;
      if (p === 1) {
        if (h < 0.3) ground[c][r] = 'field';
        else type = h < 0.52 ? 'araucaria' : h < 0.6 ? 'vaca' : null;
      }
      if (p === 2) type = h < 0.38 ? 'casa' : h < 0.55 ? 'tree' : null;
      if (p === 3) type = h < 0.45 ? 'jungle' : h < 0.6 ? 'casa' : null;
      if (p === 4) type = g === 'grass' ? (h < 0.5 ? 'palm' : null) : (h < 0.1 ? 'smallplane' : null);
      if (type) objs[c][r] = { type };
    }

    return (layouts[p] = { ground, objs, paths, roads, out });
  }

  // Caminho em casas de `from` até `to` seguindo a estrada da aresta.
  function path(p, from, to) {
    const L = layout(p);
    if (L.paths[from + '|' + to]) return L.paths[from + '|' + to];
    if (L.paths[to + '|' + from]) return [...L.paths[to + '|' + from]].reverse();
    return [C.PHASES[p].nodes[from].at, C.PHASES[p].nodes[to].at];
  }

  /* ---------- primitivas ---------- */
  function poly(g, pts, col) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fill();
  }

  function diamond(g, X, Y, col, inset = 0) {
    g.fillStyle = col;
    for (let i = inset; i < 16 - inset; i++) {
      const hw = (i < 8 ? 2 * (i + 1) : 2 * (16 - i)) - inset * 2;
      if (hw > 0) g.fillRect(X - hw, Y + i, hw * 2, 1);
    }
  }

  function outline(g, X, Y, col) {
    g.fillStyle = col;
    for (let i = 0; i < 16; i++) {
      const hw = i < 8 ? 2 * (i + 1) : 2 * (16 - i);
      g.fillRect(X - hw, Y + i, 2, 1);
      g.fillRect(X + hw - 2, Y + i, 2, 1);
    }
  }

  // Ponto (u, v) dentro do losango: u ao longo de r, v ao longo de c (0..1).
  const at = (X, Y, u, v) => [X + (v - u) * 16, Y + (u + v) * 8];

  function lineIso(g, a, b, col, dash = 0) {
    const n = Math.max(1, Math.round(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
    g.fillStyle = col;
    for (let i = 0; i <= n; i++) {
      if (dash && Math.floor(i / dash) % 2) continue;
      g.fillRect(Math.round(a[0] + (b[0] - a[0]) * i / n), Math.round(a[1] + (b[1] - a[1]) * i / n), 1, 1);
    }
  }

  function box(g, X, Y, h, cols, o = {}) {
    const k = o.inset || 0, dx = o.dx || 0, dy = o.dy || 0;
    X += dx; Y += dy;
    const T = [X, Y + k], R = [X + 16 - 2 * k, Y + 8], B = [X, Y + 16 - k], L = [X - 16 + 2 * k, Y + 8];
    const up = p => [p[0], p[1] - h];
    poly(g, [L, B, up(B), up(L)], cols[1]);
    poly(g, [B, R, up(R), up(B)], cols[2]);
    poly(g, [up(T), up(R), up(B), up(L)], cols[0]);
    if (o.win) {
      const lit = o.lit || o.win;
      for (let x = L[0] + 3; x < B[0] - 2; x += 4) {
        const yb = L[1] + (x - L[0]) * 0.5;
        for (let f = 3; f < h - 3; f += o.floor || 5) {
          g.fillStyle = hash(x, f, X + Y) < 0.3 ? lit : o.win;
          g.fillRect(x, Math.round(yb - h + f), 2, 2);
        }
      }
      for (let x = B[0] + 2; x < R[0] - 2; x += 4) {
        const yb = B[1] - (x - B[0]) * 0.5;
        for (let f = 3; f < h - 3; f += o.floor || 5) {
          g.fillStyle = hash(f, x, X + Y) < 0.3 ? lit : o.win;
          g.fillRect(x, Math.round(yb - h + f), 2, 2);
        }
      }
    }
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(B[0], B[1] - h, 1, h);
    return { T, R, B, L, up };
  }

  function roof(g, b, h, rh, cl, cr) {
    const apex = [(b.L[0] + b.R[0]) / 2, (b.T[1] + b.B[1]) / 2 - h - rh];
    poly(g, [b.up(b.L), b.up(b.B), apex], cl);
    poly(g, [b.up(b.B), b.up(b.R), apex], cr);
  }

  function blob(g, cx, cy, rad, col) {
    g.fillStyle = col;
    for (let y = -rad; y <= rad; y++) {
      const w = Math.round(Math.sqrt(rad * rad - y * y));
      g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2, 1);
    }
  }

  function rect(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); }

  /* ---------- chão ---------- */
  function drawTile(g, p, c, r, type, L) {
    const [X, Y] = top(c, r), th = THEMES[p];
    const dots = (cols, density) => {
      for (let i = 0; i < 16; i++) {
        const hw = i < 8 ? 2 * (i + 1) : 2 * (16 - i);
        for (let x = -hw + 1; x < hw - 1; x++) {
          const v = hash(X + x, Y + i, p);
          if (v < density) { g.fillStyle = cols[v < density / 2 ? 0 : 1]; g.fillRect(X + x, Y + i, 1, 1); }
        }
      }
    };
    if (type === 'water' || type === 'bridge') {
      diamond(g, X, Y, '#2e6cc2');
      dots(['#4a86d8', '#1f56a3'], 0.08);
      if (hash(c, r, 5) < 0.6) lineIso(g, at(X, Y, 0.3, 0.2), at(X, Y, 0.3, 0.5), '#8fbdf2');
    } else if (type === 'field') {
      diamond(g, X, Y, '#8a6b2a');
      for (let u = 0.1; u < 1; u += 0.2) lineIso(g, at(X, Y, u, 0.05), at(X, Y, u, 0.95), '#6fae3f');
    } else if (type === 'apron') {
      diamond(g, X, Y, '#9a9ca3');
      lineIso(g, at(X, Y, 0, 0), at(X, Y, 0, 1), '#83858c');
      lineIso(g, at(X, Y, 0, 0), at(X, Y, 1, 0), '#83858c');
    } else if (type === 'runway') {
      diamond(g, X, Y, '#3b3d44');
      lineIso(g, at(X, Y, 0, 0.5), at(X, Y, 1, 0.5), '#f4f1e8', 3);
      lineIso(g, at(X, Y, 0, 0.1), at(X, Y, 1, 0.1), '#c9c9c9');
      lineIso(g, at(X, Y, 0, 0.9), at(X, Y, 1, 0.9), '#c9c9c9');
    } else {
      diamond(g, X, Y, th.grass[0]);
      dots([th.grass[1], th.grass[2]], 0.14);
    }

    if (type === 'road' || type === 'plaza' || type === 'bridge') {
      const paved = { asphalt: ['#5a5a63', '#9a968c', '#f5c542'], dirt: ['#a4552e', '#8a4424', '#c9764a'], taxi: ['#6b6d74', '#9a9ca3', '#f5c542'] }[th.road];
      const isRoad = (x, y) => L.roads.has(key(x, y));
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dc, dr]) => isRoad(c + dc, r + dr)
        || (L.out[key(c, r)] && L.out[key(c, r)][0] === dc && L.out[key(c, r)][1] === dr)
        || ((p === 0 && c === 8 && r === 0 && dr === -1) || (p === 3 && c === 9 && r === 4 && dc === 1)));
      const w = 0.32;
      const cen = at(X, Y, 0.5, 0.5);
      const band = (u0, v0, u1, v1) => poly(g, [at(X, Y, u0, v0), at(X, Y, u0, v1), at(X, Y, u1, v1), at(X, Y, u1, v0)], paved[0]);
      band(0.5 - w, 0.5 - w, 0.5 + w, 0.5 + w);
      for (const [dc, dr] of dirs) {
        if (dc === 1) band(0.5 - w, 0.5, 0.5 + w, 1);
        if (dc === -1) band(0.5 - w, 0, 0.5 + w, 0.5);
        if (dr === 1) band(0.5, 0.5 - w, 1, 0.5 + w);
        if (dr === -1) band(0, 0.5 - w, 0.5, 0.5 + w);
        const end = at(X, Y, 0.5 + dr * 0.45, 0.5 + dc * 0.45);
        if (th.road !== 'dirt') lineIso(g, cen, end, paved[2], 2);
      }
      if (type === 'bridge') {
        const rails = c <= 8 && p === 2 ? ['#2f9e44', '#f7cf3d'] : ['#7fc3ff', '#f4f1e8'];
        lineIso(g, at(X, Y, 0.5 - w, 0), at(X, Y, 0.5 - w, 1), rails[0]);
        lineIso(g, at(X, Y, 0.5 + w, 0), at(X, Y, 0.5 + w, 1), rails[1]);
      }
      if (type === 'plaza') {
        diamond(g, X, Y + 0, paved[1], 4);
        diamond(g, X, Y + 0, paved[0], 6);
      }
    }
  }

  const groundCache = {};
  function ground(p) {
    if (groundCache[p]) return groundCache[p];
    // Desenhado em 2× (SCALE) para casar com os sprites em alta definição.
    const cv = document.createElement('canvas');
    cv.width = W * SCALE; cv.height = H * SCALE;
    const g = cv.getContext('2d');
    g.scale(SCALE, SCALE);
    g.fillStyle = '#17112a';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) rect(g, hash(i, 1, 77) * W, hash(i, 2, 77) * H, 1, 1, hash(i, 3, 77) < 0.5 ? '#3a2f52' : '#2a2140');
    const L = layout(p), th = THEMES[p];
    for (let s = 0; s <= 2 * (N - 1); s++) {
      for (let c = 0; c < N; c++) {
        const r = s - c;
        if (r < 0 || r >= N) continue;
        drawTile(g, p, c, r, L.ground[c][r], L);
      }
    }
    // Lateral da "maquete", como no SimCity 2000.
    for (let i = 0; i < N; i++) {
      const [X1, Y1] = top(i, N - 1), [X2, Y2] = top(N - 1, i);
      const water1 = L.ground[i][N - 1] === 'water', water2 = L.ground[N - 1][i] === 'water' || L.ground[N - 1][i] === 'bridge';
      poly(g, [[X1 - 16, Y1 + 8], [X1, Y1 + 16], [X1, Y1 + 26], [X1 - 16, Y1 + 18]], water1 ? '#1f4f96' : th.earth[0]);
      poly(g, [[X2, Y2 + 16], [X2 + 16, Y2 + 8], [X2 + 16, Y2 + 18], [X2, Y2 + 26]], water2 ? '#173d75' : th.earth[1]);
      for (let k = 0; k < 4; k++) {
        rect(g, X1 - 14 + k * 4, Y1 + 13 + k * 2 + 4, 2, 1, 'rgba(0,0,0,.25)');
        rect(g, X2 + 3 + k * 4, Y2 + 15 - k * 2 + 4, 2, 1, 'rgba(0,0,0,.25)');
      }
    }
    return (groundCache[p] = cv);
  }

  /* ---------- objetos (prédios, árvores, marcos) ---------- */
  const WHITE = ['#efeadf', '#cfc8b8', '#aaa395'];
  function drawObject(g, p, o, c, r, now, night) {
    const [X, Y] = top(c, r);
    const hv = hash(c, r, 99);
    const win = night ? '#ffe28a' : '#4a5a7a', lit = night ? '#fff2c0' : '#7d93b8';
    switch (o.type) {
      case 'bloco': {
        const h = 16 + Math.floor(hv * 10);
        box(g, X, Y, h, WHITE, { inset: 3, win, lit });
        rect(g, X - 12, Y + 9, 24, 1, 'rgba(0,0,0,.25)');
        break;
      }
      case 'tower':
        box(g, X, Y, 32, ['#f1e3c4', '#d3c19d', '#b2a07d'], { inset: 2, win, lit });
        rect(g, X - 2, Y - 26, 4, 4, '#d6303c');
        break;
      case 'shop': {
        const b = box(g, X, Y, 12, ['#c08552', '#8a5a35', '#6e4528'], { inset: 3 });
        for (let i = 0; i < 6; i++) poly(g, [[b.L[0] + i * 3, b.L[1] - 9 + i * 1.5], [b.L[0] + i * 3 + 3, b.L[1] - 7.5 + i * 1.5], [b.L[0] + i * 3 + 3, b.L[1] - 4.5 + i * 1.5], [b.L[0] + i * 3, b.L[1] - 6 + i * 1.5]], i % 2 ? '#f4f1e8' : '#e07ab8');
        rect(g, X - 4, Y - 6, 8, 4, '#5a2f14');
        rect(g, X - 3, Y - 5, 6, 2, '#e07ab8');
        break;
      }
      case 'office': {
        box(g, X, Y, 36, ['#f4f1e8', '#d8d3c7', '#b5b0a4'], { inset: 1, win: night ? win : '#2f5c8f', lit, floor: 4 });
        rect(g, X - 1, Y - 34, 2, 6, '#6b6f7a');
        rect(g, X + 1, Y - 34, 5, 3, '#2f9e44');
        rect(g, X + 2, Y - 33, 2, 1, '#f7cf3d');
        break;
      }
      case 'congresso': {
        box(g, X, Y, 5, WHITE, { inset: 0 });
        box(g, X, Y, 46, WHITE, { inset: 6, dx: -3, dy: -2, win: '#9aa3b5' });
        box(g, X, Y, 46, WHITE, { inset: 6, dx: 4, dy: -1, win: '#9aa3b5' });
        g.fillStyle = '#f4f1e8';
        g.beginPath(); g.ellipse(X - 10, Y + 2, 6, 3, 0, Math.PI, 0); g.fill();
        g.beginPath(); g.ellipse(X + 11, Y + 1, 7, 3, 0, 0, Math.PI); g.fill();
        rect(g, X + 4, Y - 1, 14, 1, '#cfc8b8');
        break;
      }
      case 'prison': {
        const b = box(g, X, Y, 12, ['#c9c3b5', '#9e988a', '#827c70'], { inset: 3 });
        roof(g, b, 12, 7, '#5a4a40', '#43372f');
        for (let i = 0; i < 2; i++) {
          const wx = b.L[0] + 5 + i * 7, wy = b.L[1] - 8 + (5 + i * 7) * 0.5;
          rect(g, wx, wy, 4, 4, '#2b2b33');
          rect(g, wx + 1, wy, 1, 4, '#9a9a9a'); rect(g, wx + 3, wy, 1, 4, '#9a9a9a');
        }
        rect(g, X + 10, Y - 14, 1, 16, '#6b6f7a');
        rect(g, X + 11, Y - 14, 7, 5, '#2f9e44');
        rect(g, X + 13, Y - 13, 3, 3, '#f7cf3d');
        rect(g, X + 14, Y - 12, 1, 1, '#24345e');
        break;
      }
      case 'studio': {
        const b = box(g, X, Y, 12, ['#9a7ac8', '#7458a3', '#5b4485'], { inset: 3 });
        roof(g, b, 12, 6, '#3a2f52', '#2a2140');
        rect(g, X, Y - 26, 1, 10, '#b9bcc4');
        rect(g, X - 3, Y - 26, 7, 1, '#b9bcc4');
        const lw = b.L[0] + 7, ly = b.L[1] - 6 + 3.5;
        blob(g, lw, ly, 2, night ? '#ffffff' : '#f7cf3d');
        break;
      }
      case 'sign': {
        rect(g, X - 1, Y - 4, 2, 14, '#6b6f7a');
        rect(g, X - 9, Y - 12, 18, 9, '#f4f1e8');
        rect(g, X - 8, Y - 11, 16, 7, '#1f7a3a');
        rect(g, X - 5, Y - 8, 8, 1, '#f4f1e8');
        rect(g, X + 2, Y - 10, 1, 5, '#f4f1e8'); rect(g, X + 3, Y - 9, 1, 3, '#f4f1e8');
        break;
      }
      case 'gate': {
        rect(g, X - 10, Y - 6, 2, 16, '#6e4528'); rect(g, X + 8, Y - 2, 2, 16, '#6e4528');
        lineIso(g, [X - 9, Y - 5], [X + 9, Y - 1], '#a8754a');
        lineIso(g, [X - 9, Y - 4], [X + 9, Y], '#a8754a');
        rect(g, X - 6, Y - 12, 12, 5, '#a8754a');
        rect(g, X - 5, Y - 11, 10, 3, '#f4f1e8');
        break;
      }
      case 'farmhouse': {
        const b = box(g, X, Y, 11, ['#f4f1e8', '#ddd6c6', '#bdb5a3'], { inset: 2, win: '#6e4528' });
        roof(g, b, 11, 8, '#c4562f', '#9b3f20');
        break;
      }
      case 'barn': {
        const b = box(g, X, Y, 14, ['#b8323a', '#a02a31', '#7f2027'], { inset: 2 });
        roof(g, b, 14, 7, '#5b2a2a', '#451f1f');
        lineIso(g, [b.L[0] + 3, b.L[1] - 12], [b.B[0] - 3, b.B[1] - 2], '#f4f1e8');
        lineIso(g, [b.L[0] + 3, b.L[1] - 2], [b.B[0] - 3, b.B[1] - 12], '#f4f1e8');
        break;
      }
      case 'silo':
        rect(g, X - 5, Y - 18, 10, 26, '#b9bcc4');
        rect(g, X + 2, Y - 18, 3, 26, '#8f939b');
        g.fillStyle = '#d7d9de'; g.beginPath(); g.ellipse(X, Y - 18, 5, 3, 0, Math.PI, 0); g.fill();
        break;
      case 'aduana': {
        box(g, X, Y, 8, ['#d8d3c7', '#a9a395', '#8a8476'], { inset: 5 });
        box(g, X, Y - 14, 2, ['#24345e', '#1a2747', '#141e38'], { inset: 0 });
        rect(g, X - 12, Y - 6, 2, 12, '#6b6f7a'); rect(g, X + 10, Y - 6, 2, 12, '#6b6f7a');
        for (let i = 0; i < 6; i++) rect(g, X + 4 + i * 2, Y + 9 - i, 2, 1, i % 2 ? '#f4f1e8' : '#d6303c');
        break;
      }
      case 'fuel': {
        box(g, X, Y, 2, ['#d6303c', '#a3252e', '#821d24'], { inset: 1, dy: -12 });
        rect(g, X - 9, Y - 4, 2, 12, '#b9bcc4'); rect(g, X + 7, Y - 4, 2, 12, '#b9bcc4');
        rect(g, X - 3, Y + 3, 3, 5, '#f4f1e8'); rect(g, X + 2, Y + 5, 3, 5, '#f4f1e8');
        rect(g, X - 6, Y - 13, 12, 3, '#f4f1e8');
        break;
      }
      case 'bridgehead': {
        rect(g, X - 1, Y - 6, 2, 14, '#6b6f7a');
        rect(g, X - 12, Y - 14, 24, 9, '#f4f1e8');
        rect(g, X - 11, Y - 13, 11, 7, '#2f9e44'); rect(g, X - 8, Y - 11, 5, 3, '#f7cf3d');
        rect(g, X, Y - 13, 11, 7, '#7fc3ff'); rect(g, X, Y - 11, 11, 3, '#f4f1e8'); rect(g, X + 5, Y - 10, 1, 1, '#f7cf3d');
        break;
      }
      case 'arch': {
        g.strokeStyle = '#d8d3c7'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(X, Y + 12, 13, 9, 0, Math.PI, 0); g.stroke();
        break;
      }
      case 'flagBR':
        rect(g, X, Y - 10, 1, 18, '#6b6f7a');
        rect(g, X + 1, Y - 10, 10, 7, '#2f9e44'); rect(g, X + 3, Y - 8, 6, 3, '#f7cf3d'); rect(g, X + 5, Y - 7, 2, 1, '#24345e');
        break;
      case 'flagAR':
        rect(g, X, Y - 10, 1, 18, '#6b6f7a');
        rect(g, X + 1, Y - 10, 10, 7, '#7fc3ff'); rect(g, X + 1, Y - 8, 10, 3, '#f4f1e8'); rect(g, X + 5, Y - 7, 2, 1, '#f7cf3d');
        break;
      case 'exchange': {
        box(g, X, Y, 14, ['#3f8f45', '#2f6e35', '#245a2c'], { inset: 3, win: '#f7cf3d' });
        rect(g, X - 5, Y - 16, 10, 7, '#f7cf3d');
        rect(g, X - 1, Y - 15, 2, 5, '#245a2c'); rect(g, X - 3, Y - 14, 6, 1, '#245a2c'); rect(g, X - 3, Y - 12, 6, 1, '#245a2c');
        break;
      }
      case 'hotel':
        box(g, X, Y, 30, ['#7d93b8', '#5b6f94', '#455673'], { inset: 2, win, lit });
        rect(g, X + 9, Y - 26, 3, 16, night ? '#ff4d6d' : '#d6303c');
        break;
      case 'casino':
        box(g, X, Y, 20, ['#f7cf3d', '#b8862b', '#8f6620'], { inset: 1, win: night ? '#ff7ac8' : '#8f3b78' });
        rect(g, X - 6, Y - 22, 12, 4, night ? '#ff7ac8' : '#e07ab8');
        break;
      case 'airport':
        box(g, X, Y, 9, ['#d8d3c7', '#7fa7c9', '#5f86a8'], { inset: 0, win: '#2f5c8f' });
        box(g, X, Y, 26, ['#d8d3c7', '#b5b0a4', '#99948a'], { inset: 6, dx: 8, dy: -4 });
        box(g, X, Y - 26, 4, ['#5bc0eb', '#2f8fbd', '#246f93'], { inset: 4, dx: 8, dy: -4 });
        break;
      case 'ctltower':
        box(g, X, Y, 28, ['#d8d3c7', '#b5b0a4', '#99948a'], { inset: 6 });
        box(g, X, Y - 28, 5, ['#5bc0eb', '#2f8fbd', '#246f93'], { inset: 4 });
        break;
      case 'hangar': {
        const b = box(g, X, Y, 12, ['#8a9a7a', '#6f7f60', '#56644a'], { inset: 0 });
        g.fillStyle = '#9fb08d';
        g.beginPath(); g.moveTo(b.up(b.L)[0], b.up(b.L)[1]); g.quadraticCurveTo(X, Y - 14, b.up(b.R)[0], b.up(b.R)[1]); g.lineTo(b.up(b.B)[0], b.up(b.B)[1]); g.closePath(); g.fill();
        rect(g, b.L[0] + 6, b.L[1] - 9 + 3, 8, 8, '#2b2b33');
        break;
      }
      case 'truck':
        box(g, X, Y, 6, ['#f4f1e8', '#cfc8b8', '#aaa395'], { inset: 5, dx: -3 });
        box(g, X, Y, 6, ['#d6303c', '#a3252e', '#821d24'], { inset: 6, dx: 7, dy: -4 });
        rect(g, X - 8, Y + 2, 10, 2, '#d6303c');
        break;
      case 'jet':
      case 'smallplane': {
        const img = root.EscapeSprites.sprite('jato');
        const k = (o.type === 'jet' ? 1 : 0.6) / img.k;
        g.drawImage(img, X - img.width * k / 2, Y + 8 - img.height * k, img.width * k, img.height * k);
        break;
      }
      case 'runway':
        rect(g, X - 1, Y - 8, 1, 16, '#6b6f7a');
        rect(g, X, Y - 8, 6, 3, '#ee8a2a'); rect(g, X + 2, Y - 7, 4, 1, '#f4f1e8');
        rect(g, X - 10, Y - 2, 8, 6, '#f4f1e8'); rect(g, X - 9, Y - 1, 6, 4, '#2b2b33');
        break;
      case 'casa': {
        const walls = [['#efe2c4', '#d4c4a0', '#b8a882'], ['#e9b9a0', '#cf9a80', '#b07c64'], ['#c8d8e8', '#a7bbcf', '#8aa0b6']][Math.floor(hv * 3)];
        const b = box(g, X, Y, 8, walls, { inset: 4, win: night ? win : '#4a5a7a' });
        roof(g, b, 8, 5, '#c4562f', '#9b3f20');
        break;
      }
      case 'tree':
        rect(g, X - 1, Y + 2, 2, 6, '#6e4528');
        blob(g, X, Y, 6, '#2f7a35'); blob(g, X - 2, Y - 2, 3, '#45a04a');
        break;
      case 'ipe': {
        rect(g, X - 1, Y + 1, 2, 7, '#6e4528');
        const col = hv < 0.5 ? ['#e8b21c', '#ffd84a'] : ['#c9579b', '#f08cc8'];
        blob(g, X, Y - 1, 6, col[0]); blob(g, X - 2, Y - 3, 3, col[1]);
        break;
      }
      case 'cerrado':
        rect(g, X - 1, Y, 2, 8, '#5a3a20'); rect(g, X - 4, Y - 1, 4, 1, '#5a3a20'); rect(g, X + 1, Y - 3, 4, 1, '#5a3a20');
        blob(g, X - 5, Y - 3, 3, '#5f7a2e'); blob(g, X + 5, Y - 5, 3, '#6f8a36'); blob(g, X, Y - 6, 3, '#5f7a2e');
        break;
      case 'araucaria':
        rect(g, X - 1, Y - 14, 2, 22, '#6e4528');
        for (let i = 0; i < 3; i++) {
          g.fillStyle = i % 2 ? '#2a6b33' : '#1d5527';
          g.beginPath(); g.ellipse(X, Y - 15 + i * 4, 9 - i * 2, 2, 0, 0, Math.PI * 2); g.fill();
        }
        break;
      case 'jungle':
        rect(g, X - 1, Y + 1, 2, 7, '#5a3a20');
        blob(g, X - 3, Y - 1, 5, '#1d5527'); blob(g, X + 3, Y - 2, 5, '#256b30'); blob(g, X, Y - 6, 4, '#2f8a3a');
        break;
      case 'palm': {
        for (let i = 0; i < 14; i++) rect(g, X + Math.round(Math.sin(i / 5) * 2), Y + 8 - i, 2, 1, '#8a6a3a');
        const tx = X + 2, ty = Y - 6;
        for (const [dx, dy] of [[-7, 2], [7, 2], [-5, -3], [5, -3], [0, -5]]) lineIso(g, [tx, ty], [tx + dx, ty + dy], '#2f9e44');
        break;
      }
      case 'vaca': {
        const img = root.EscapeSprites.sprite('vaca');
        const flip = hv < 0.5;
        g.save();
        if (flip) { g.translate(X * 2, 0); g.scale(-1, 1); }
        g.drawImage(img, X - 6, Y + 2, img.width / img.k, img.height / img.k);
        g.restore();
        break;
      }
      case 'falls':
        for (let i = 0; i < 5; i++) rect(g, X - 8 + i * 4, Y + 8 + (i % 2), 2, 10, '#e9f4ff');
        g.globalAlpha = 0.35 + 0.15 * Math.sin(now / 400 + c);
        blob(g, X, Y + 18, 7, '#ffffff');
        g.globalAlpha = 1;
        break;
    }
  }

  // Altura aproximada de cada objeto, para posicionar balões e rótulos.
  const objects = p => {
    const L = layout(p), out = [];
    for (let c = 0; c < N; c++) for (let r = 0; r < N; r++) if (L.objs[c][r]) out.push({ c, r, o: L.objs[c][r] });
    return out;
  };

  root.EscapeMaps = { W, H, N, SCALE, top, center, layout, path, ground, objects, drawObject, diamond, outline, blob, rect, hash };
})(typeof globalThis !== 'undefined' ? globalThis : this);
