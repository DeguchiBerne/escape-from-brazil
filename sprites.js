/* Sprites 16 bits no estilo RPG portátil: personagens "chibi" com contorno escuro.
   Cada personagem é meia matriz (8 colunas) espelhada, mais acessórios por cima.
   Na hora de pintar, cada sprite passa por Scale2x (suaviza diagonais sem borrar) e ganha
   luz no topo e sombra na lateral: o resultado tem o dobro da resolução, com `k = 2`
   (quem desenha usa largura/k em coordenadas do mundo).
   '.' = transparente. Letras de cor: veja PALETTE e o mapa `colors` de cada personagem. */
(function (root) {
  'use strict';

  const PALETTE = {
    k: '#1a1423', w: '#f4f1e8', s: '#f6c9a0', S: '#d99a72', m: '#a33a3a',
    r: '#d6303c', R: '#ff7a7a', y: '#f7cf3d', Y: '#b8862b', g: '#2f9e44', G: '#1d6b2d',
    b: '#24345e', B: '#4a6fb5', n: '#7a4f2e', N: '#a8754a', c: '#6b6f7a', C: '#b9bcc4',
    p: '#e07ab8', P: '#8f3b78', o: '#ee8a2a', a: '#5bc0eb', d: '#3b2a20', e: '#2b2b33',
    v: '#7f5bd6', l: '#7fc3ff', x: '#c8a2ff',
  };

  // Meia cabeça e meio corpo. H cabelo, T roupa de cima, t centro (gravata/zíper), B calça/saia, O sapato.
  const HEAD = [
    '.....kkk',
    '...kkHHH',
    '..kHHHHH',
    '.kHHHHHH',
    '.kHHHHHH',
    '.kHHHsss',
    '.kHsssss',
    '.kssksss',
    '.kssksss',
    '.kSsssss',
    '..kSssss',
    '...kkkkk',
  ];
  const LONG = { 6: 'kHHsssss', 7: 'kHssksss', 8: 'kHssksss', 9: 'kHSsssss', 10: 'kHHSssss', 11: '.kHkkkkk' };
  const CAP = { 0: '....kkkk', 1: '..kkHHHH', 2: '.kHHHHHy', 3: '.kHHHHHH', 4: 'kkkkkkkk', 5: '.kdddsss', 6: '.kdsssss' };
  const BALD = { 1: '...kksss', 2: '..ksssss', 3: '.kssssss', 4: '.kssssss', 5: '.kssssss', 6: '.kkkksss' };
  const BODY = [
    '..kTTTTt',
    '.kTTTTTt',
    'ksTTTTTt',
    '.kkTTTTt',
    '..kBBBBB',
  ];
  const LEGS = [
    ['...kBBk..kBBk...', '...kOOk..kOOk...'],
    ['..kBBk....kBk...', '..kOOk...kOOk...'],
  ];

  const mirror = half => half + [...half].reverse().join('');

  function chibi(o) {
    const head = HEAD.map((row, i) => (o.cap && CAP[i]) || (o.bald && BALD[i]) || (o.long && LONG[i]) || row);
    const body = o.kid ? [BODY[0], BODY[2], BODY[4]] : BODY;
    const make = legs => {
      const rows = [...head, ...body].map(mirror).concat(legs).map(r => [...r]);
      rows[10][7] = rows[10][8] = o.mouth || 'm';
      for (const [x, y, k] of o.extra || []) {
        const yy = y < 0 ? rows.length + y : y;
        if (rows[yy]) rows[yy][x] = k;
      }
      return rows.map(r => r.join(''));
    };
    return { frames: [make(LEGS[0]), make(LEGS[1])], colors: o.colors };
  }

  const CHARS = {
    senador: chibi({ colors: { H: 'd', T: 'b', t: 'g', B: 'b', O: 'k' },
      extra: [[7, 12, 'w'], [8, 12, 'w'], [8, 13, 'y'], [7, 14, 'y']] }),
    esposa: chibi({ long: true, colors: { H: 'y', T: 'p', t: 'p', B: 'P', O: 'P' } }),
    filha: chibi({ kid: true, long: true, colors: { H: 'd', T: 'a', t: 'w', B: 'B', O: 'k' } }),
    filha2: chibi({ kid: true, long: true, colors: { H: 'N', T: 'p', t: 'w', B: 'P', O: 'k' } }),
    policial: chibi({ cap: true, colors: { H: 'b', T: 'b', t: 'y', B: 'e', O: 'k' },
      extra: [[4, 13, 'y'], [5, 13, 'y']] }),
    marcal: chibi({ colors: { H: 'd', T: 'B', t: 'w', B: 'e', O: 'k' },
      extra: [[2, 9, 'd'], [13, 9, 'd'], [3, 10, 'd'], [12, 10, 'd'], [4, 11, 'd'], [5, 11, 'd'], [10, 11, 'd'], [11, 11, 'd'],
        [15, 13, 'c'], [15, 12, 'k'], [14, 14, 's']] }),
    pai: chibi({ colors: { H: 'C', T: 'o', t: 'o', B: 'o', O: 'k' },
      extra: [[3, 12, 'g'], [4, 13, 'g'], [5, 13, 'y'], [6, 14, 'y'], [7, 14, 'g'], [8, 15, 'g'], [9, 15, 'y']] }),
    irmao: chibi({ colors: { H: 'N', T: 'e', t: 'e', B: 'B', O: 'w' },
      extra: [[0, 13, 'a'], [0, 12, 'k'], [7, 2, 'N'], [8, 1, 'N'], [6, 1, 'N']] }),
    queiroz: chibi({ colors: { H: 'C', T: 'N', t: 'w', B: 'n', O: 'k' }, mouth: 'C',
      extra: [[6, 10, 'C'], [9, 10, 'C'], [14, 14, 'w'], [15, 14, 'w'], [14, 15, 'w'], [15, 15, 'k']] }),
    // Toga preta do STF com gola branca; careca e sobrancelhas grossas.
    moraes: chibi({ bald: true, colors: { T: 'e', t: 'w', B: 'e', O: 'k' }, mouth: 'k',
      extra: [[3, 6, 'k'], [4, 6, 'k'], [5, 6, 'k'], [10, 6, 'k'], [11, 6, 'k'], [12, 6, 'k'], [6, 12, 'w'], [9, 12, 'w'], [2, 14, 'e'], [13, 14, 'e']] }),
    michelle: chibi({ long: true, colors: { H: 'd', T: 'g', t: 'g', B: 'G', O: 'k' },
      extra: [[5, 12, 'y'], [6, 13, 'y'], [7, 13, 'y'], [8, 13, 'y'], [9, 13, 'y'], [10, 12, 'y'], [15, 14, 'y'], [15, 13, 'y'], [14, 14, 'C']] }),
    carlos: chibi({ colors: { H: 'd', T: 'v', t: 'x', B: 'b', O: 'k' },
      extra: [[2, 1, 'y'], [13, 2, 'x'], [1, 13, 'y'], [14, 11, 'w'], [4, 3, 'w']] }),
    // Cabelo revolto, costeletas, jaqueta de couro e motosserra.
    milei: chibi({ colors: { H: 'n', T: 'e', t: 'e', B: 'e', O: 'k' },
      extra: [[3, 0, 'n'], [5, 0, 'k'], [10, 0, 'k'], [12, 0, 'n'], [1, 1, 'n'], [14, 1, 'n'], [0, 3, 'n'], [15, 3, 'n'], [0, 5, 'n'], [15, 5, 'n'],
        [2, 7, 'n'], [2, 8, 'n'], [2, 9, 'n'], [13, 7, 'n'], [13, 8, 'n'], [13, 9, 'n'],
        [13, 12, 'o'], [14, 12, 'o'], [15, 12, 'o'], [13, 13, 'o'], [14, 13, 'C'], [15, 13, 'C'], [15, 14, 'C'], [15, 15, 'C']] }),
    vorcaro: chibi({ colors: { H: 'd', T: 'c', t: 'r', B: 'c', O: 'k' },
      extra: [[0, 13, 'a'], [0, 12, 'k'], [6, 2, 'C'], [7, 2, 'C']] }),
  };

  const SPRITES = {
    // Fantasma do Comunismo: lençol vermelho com a foice e o martelo amarelos.
    fantasma: [
      '.....kkkkkk.....',
      '...kkrrrrrrkk...',
      '..krrrrrrrrrrk..',
      '.krrrrrrrrrrrrk.',
      '.krwwrrrrrrwwrk.',
      'krrwkrrrrrrwkrrk',
      'krrrrrrrrrrrrrrk',
      'krrrrryyrryyrrrk',
      'krrrryyyrrryyrrk',
      'krrrrryyyrrryyrk',
      'krrrrrrryyrryyrk',
      'krrrrrrrryyyyrrk',
      'krrrryyrrryyrrrk',
      'krrryyrrrrrryyrk',
      'krrrrrrrrrrrrrrk',
      'krrkkrrkkrrkkrrk',
      '.kk..kk..kk..kk.',
    ],
    // Fantasma do Flávinho (o "funcionário fantasma"): lençol branco com crachá.
    fantasmaFlavio: [
      '.....kkkkkk.....',
      '...kkwwwwwwkk...',
      '..kwwwwwwwwwwk..',
      '.kwwwwwwwwwwwwk.',
      '.kwkkwwwwwwkkwk.',
      'kwwkawwwwwwkawwk',
      'kwwwwwwwwwwwwwCk',
      'kwwwwwwllwwwwwwk',
      'kwwwwwlwwlwwwwCk',
      'kwwwwwBBBBwwwwwk',
      'kwwwwBkkkkBwwwwk',
      'kwwwwBwwwwBwwwwk',
      'kwwwwBkkwwBwwwCk',
      'kwwwwBBBBBBwwwwk',
      'kwwwwwwwwwwwwwCk',
      'kwwkkwwkkwwkkwwk',
      '.kk..kk..kk..kk.',
    ],
    // Dark Horse, o Pangaré da Escuridão Soluçante, com sela vermelha.
    cavalo: [
      '...............kk...',
      '..............kekk..',
      '.............keeek..',
      '............keewek..',
      '...........keeeeeek.',
      '..kkkkkkkkkeeekkeek.',
      '.keerrrreeeeek..kk..',
      'keeerrrreeeeek......',
      'keeeeeeeeeeek.......',
      'keeeeeeeeeeek.......',
      'kkeekkkkkkeek.......',
      'k.kek....kek........',
      '..kek....kek........',
      '..kCk....kCk........',
      '...k......k.........',
    ],
    mamadeira: [
      '...pp...',
      '..pppp..',
      '..pppp..',
      '.kkkkkk.',
      'kwwwwwwk',
      'kwaawwwk',
      'kwwwwwwk',
      'kwaawwwk',
      'kwwwwwwk',
      'kwwwwwwk',
      '.kkkkkk.',
    ],
    kit: [
      'kkkkkkkkkkkk',
      'krrrrrrrrrrk',
      'kooooooooook',
      'kyyyyyyyyyyk',
      'kggggggggggk',
      'kBBBBBBBBBBk',
      'kvvvvvvvvvvk',
      'kkkkkkkkkkkk',
    ],
    cedula: [
      'kkkkkkkkk',
      'kgGGGGGgk',
      'kGgwwgGGk',
      'kgGGGGGgk',
      'kkkkkkkkk',
    ],
    mala: [
      '...kkk...',
      '...k.k...',
      'knnnnnnnk',
      'knNNyNNnk',
      'knNyyyNnk',
      'knNNyNNnk',
      'knnnnnnnk',
      '.kkkkkkk.',
    ],
    vaca: [
      '..kk.........',
      '.kwwkkkkkkkk.',
      'kwkwwwkkwwwwk',
      'kwwwwkkkwwkwk',
      '.kpkwwwwwwwwk',
      '..k.kwk..kwk.',
      '....kk...kk..',
    ],
    heli: [
      'kkkkkkkkkkkkkkkkkkkk',
      '.........kk.........',
      '......kkkkkkkk......',
      '....kwwwwwwwwwwk....',
      '...kwaaaawwwwwwwkkkk',
      '..kwaaaaawwwwwwwwwwk',
      '..kwwwwwwwwrrrwkkkkk',
      '...kwwwwwwwwwwk.....',
      '....kkkkkkkkkk......',
      '.....k......k.......',
      '...kkkkkkkkkkkk.....',
    ],
    jato: [
      '..........kk..............',
      '.........kwwk.............',
      '..kkkkkkkkwwkkkkkkkkkk....',
      '.kwwawwawwawwawwawwwwwkk..',
      'kwwwwwwwwwwwwwwwwwwwwwwwkk',
      '.kkCCwwwwwwwwwwwwwwwwwkk..',
      '...kkkkkkkkCCCkkkkkkkk....',
      '..........kCCk............',
      '...........kk.............',
    ],
    oculos: [
      'kkkk.kkkk',
      'kkk...kkk',
    ],
  };

  /* ---------- pintura em alta definição ---------- */
  const OUTLINE = [26, 20, 35];
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  function rows2px(rows, colors) {
    const w = Math.max(...rows.map(r => r.length)), h = rows.length;
    const px = new Uint32Array(w * h);   // 0 = transparente; senão 0xFFRRGGBB
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        let k = row[x];
        if (k === '.') continue;
        if (colors && colors[k]) k = colors[k];
        const [r, g, b] = hex(PALETTE[k] || '#ff00ff');
        px[y * w + x] = (0xFF000000 | (r << 16) | (g << 8) | b) >>> 0;
      }
    });
    return { px, w, h };
  }

  // Scale2x (EPX): dobra a resolução copiando vizinhos iguais nas quinas, o que arredonda as diagonais.
  function scale2x({ px, w, h }) {
    const out = new Uint32Array(w * h * 4), W2 = w * 2;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : px[y * w + x]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), Cc = at(x - 1, y), D = at(x, y + 1);
      let e0 = P, e1 = P, e2 = P, e3 = P;
      if (Cc === A && Cc !== D && A !== B) e0 = A;
      if (A === B && A !== Cc && B !== D) e1 = B;
      if (D === Cc && D !== B && Cc !== A) e2 = Cc;
      if (B === D && B !== A && D !== Cc) e3 = D;
      out[(2 * y) * W2 + 2 * x] = e0;
      out[(2 * y) * W2 + 2 * x + 1] = e1;
      out[(2 * y + 1) * W2 + 2 * x] = e2;
      out[(2 * y + 1) * W2 + 2 * x + 1] = e3;
    }
    return { px: out, w: W2, h: h * 2 };
  }

  // Luz de cima, sombra à direita: dá volume sem mudar o desenho.
  function shade({ px, w, h }) {
    const out = px.slice();
    const isEdge = v => v === 0 || (((v >> 16) & 255) === OUTLINE[0] && ((v >> 8) & 255) === OUTLINE[1] && (v & 255) === OUTLINE[2]);
    const tint = (v, f) => {
      const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(ch => Math.max(0, Math.min(255, Math.round(f > 0 ? ch + (255 - ch) * f : ch * (1 + f)))));
      return (0xFF000000 | (c[0] << 16) | (c[1] << 8) | c[2]) >>> 0;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = px[y * w + x];
      if (isEdge(v)) continue;
      const up = y > 0 ? px[(y - 1) * w + x] : 0, right = x < w - 1 ? px[y * w + x + 1] : 0, down = y < h - 1 ? px[(y + 1) * w + x] : 0;
      if (isEdge(up)) out[y * w + x] = tint(v, 0.28);
      else if (isEdge(right) || isEdge(down)) out[y * w + x] = tint(v, -0.22);
    }
    return { px: out, w, h };
  }

  function toCanvas({ px, w, h }) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < px.length; i++) {
      const v = px[i];
      if (!v) continue;
      img.data[i * 4] = (v >> 16) & 255;
      img.data[i * 4 + 1] = (v >> 8) & 255;
      img.data[i * 4 + 2] = v & 255;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    c.k = 2;
    return c;
  }

  const cache = {};
  // sprite('senador', 1) devolve o 2º quadro da caminhada; objetos sem animação ignoram o quadro.
  function sprite(name, frame = 0) {
    const key = name + ':' + frame;
    if (cache[key]) return cache[key];
    const ch = CHARS[name];
    const base = ch ? rows2px(ch.frames[frame % 2], ch.colors) : rows2px(SPRITES[name]);
    return (cache[key] = toCanvas(shade(scale2x(base))));
  }

  root.EscapeSprites = { PALETTE, SPRITES, CHARS, sprite };
})(typeof globalThis !== 'undefined' ? globalThis : this);
