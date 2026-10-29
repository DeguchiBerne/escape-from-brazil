/* Escape from Brazil — interface: mapa isométrico em canvas (2× para sprites nítidos), HUD com o dinheiro
   em destaque, missão, ações com custo e CD do dado, modais de resultado/dado/plantão, cenas e trilha 16 bits.
   Toda regra vem de EscapeCore; aqui só desenho e fluxo. */
(function () {
  'use strict';

  const C = window.EscapeCore;
  const M = window.EscapeMaps;
  const { sprite } = window.EscapeSprites;
  const $ = id => document.getElementById(id);

  const { W, H, SCALE } = M;
  const map = $('map'), ctx = map.getContext('2d');
  map.width = W * SCALE; map.height = H * SCALE;

  let s = null;
  let queue = [];          // modais na fila: cena do Amores, resultados, intros de fase
  let party = [];          // [{x, y, dir}] senador, esposa, filha, filha2
  let walk = null;         // animação de caminhada pela estrada
  let arrived = false;     // a caminhada acabou neste quadro: mostra os botões do local
  let effects = [];        // teletransporte, fake news, dinheiro flutuando, Charlitos
  let tpMode = false;
  let bubbleTick = 0;
  let pendingArt = null;
  const FAMILY = ['senador', 'esposa', 'filha', 'filha2'];
  const LAG = [0, 0.8, 1.5, 2.2];
  const STEP_MS = 150;
  const fmt = n => n.toLocaleString('pt-BR');

  /* ---------- som (Web Audio, sem arquivos) ---------- */
  let audio = null, sfxGain = null;
  function tone(freq, dur, when = 0, type = 'square', vol = 0.05, dest = sfxGain) {
    if (!audio) return;
    const t = audio.currentTime + when;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  const SFX = {
    coin: () => { tone(988, 0.08); tone(1319, 0.2, 0.08); },
    call: () => { tone(1200, 0.12); tone(1200, 0.12, 0.2); tone(1200, 0.12, 0.6); tone(1200, 0.12, 0.8); },
    threat: () => { for (let i = 0; i < 3; i++) { tone(760, 0.18, i * 0.36, 'sawtooth', 0.035); tone(560, 0.18, i * 0.36 + 0.18, 'sawtooth', 0.035); } },
    card: () => { tone(523, 0.12); tone(659, 0.12, 0.12); tone(784, 0.25, 0.24); },
    travel: () => { for (let i = 0; i < 4; i++) tone(i % 2 ? 196 : 220, 0.06, i * 0.15, 'triangle', 0.06); },
    ghost: () => { tone(440, 0.3, 0, 'sine', 0.06); tone(330, 0.3, 0.25, 'sine', 0.06); tone(220, 0.5, 0.5, 'sine', 0.06); },
    teleport: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.08, i * 0.05, 'square', 0.04)),
    fake: () => { tone(1568, 0.05); tone(1175, 0.05, 0.07); tone(1568, 0.05, 0.14); tone(1175, 0.12, 0.21); },
    hic: () => { tone(620, 0.05, 0, 'square', 0.06); tone(620, 0.05, 0.5, 'square', 0.06); tone(620, 0.05, 1.0, 'square', 0.06); },
    coach: () => { tone(330, 0.1); tone(440, 0.1, 0.1); tone(554, 0.1, 0.2); tone(660, 0.2, 0.3); },
    dice: () => { for (let i = 0; i < 8; i++) tone(300 + i * 60, 0.03, i * 0.06, 'square', 0.03); },
    rig: () => { tone(110, 0.4, 0, 'sawtooth', 0.07); tone(104, 0.4, 0.1, 'sawtooth', 0.07); },
    attack: () => { tone(880, 0.1, 0, 'sawtooth', 0.04); tone(440, 0.3, 0.1, 'sawtooth', 0.04); },
    carlos: () => [1047, 1319, 1568, 2093, 1568, 2093].forEach((f, i) => tone(f, 0.12, i * 0.09, 'triangle', 0.05)),
    stolen: () => { tone(500, 0.1); tone(400, 0.1, 0.1); tone(300, 0.25, 0.2); },
    hit: () => { tone(160, 0.35, 0, 'sawtooth', 0.06); },
    drop: () => { tone(300, 0.1); tone(200, 0.2, 0.1); },
    deadline: () => { tone(880, 0.1); tone(880, 0.1, 0.15); tone(880, 0.1, 0.3); },
    won: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, i * 0.15)),
    lost: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, i * 0.2, 'triangle', 0.07)),
  };
  function unlockAudio() {
    if (audio) { if (audio.state === 'suspended') audio.resume(); return; }
    try {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      sfxGain = audio.createGain(); sfxGain.gain.value = 1; sfxGain.connect(audio.destination);
    } catch (e) { audio = null; }
  }

  /* ---------- trilha de fuga 16 bits: Lá menor, Am–F–G–E, acelera com o Cerco ---------- */
  const Music = (() => {
    let on = true, gain = null, timer = null, next = 0, step = 0, noise = null;
    try { on = localStorage.getItem('efb.music') !== 'off'; } catch (e) { /* sem storage */ }
    const CHORDS = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]];
    const MELODY = [
      [69, 0, 72, 0, 76, 0, 74, 72, 69, 0, 0, 67, 69, 0, 0, 0],
      [65, 0, 69, 0, 72, 0, 70, 69, 65, 0, 0, 64, 65, 0, 0, 0],
      [67, 0, 71, 0, 74, 0, 72, 71, 67, 0, 69, 0, 71, 0, 74, 0],
      [68, 0, 71, 0, 76, 0, 74, 71, 68, 0, 71, 0, 64, 0, 0, 0],
    ];
    const hz = m => 440 * Math.pow(2, (m - 69) / 12);
    function hat(t, vol, dur) {
      if (!noise) {
        noise = audio.createBuffer(1, audio.sampleRate * 0.2, audio.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const src = audio.createBufferSource(), g = audio.createGain(), f = audio.createBiquadFilter();
      src.buffer = noise; f.type = 'highpass'; f.frequency.value = dur > 0.06 ? 1500 : 7000;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(gain);
      src.start(t); src.stop(t + dur);
    }
    function voice(freq, t, dur, type, vol) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(gain); o.start(t); o.stop(t + dur + 0.02);
    }
    function schedule() {
      if (!audio) return;
      const cerco = s ? s.cerco : 0;
      const sixteenth = 60 / (132 + cerco * 0.5) / 4;
      while (next < audio.currentTime + 0.15) {
        const bar = Math.floor(step / 16) % 4, i = step % 16, ch = CHORDS[bar], mel = MELODY[bar][i];
        if (i % 2 === 0) voice(hz(ch[0] - 24), next, sixteenth * 1.7, 'triangle', 0.11);
        voice(hz(ch[i % 3] + 12), next, sixteenth * 0.8, 'square', 0.012);
        if (mel) voice(hz(mel), next, sixteenth * 1.8, 'square', 0.03);
        if (i % 2 === 0) hat(next, 0.025, 0.03);
        if (i % 8 === 4) hat(next, 0.07, 0.12);
        next += sixteenth; step++;
      }
    }
    function start() {
      if (!on || !audio || timer) return;
      gain = gain || audio.createGain();
      gain.gain.value = 0.5; gain.connect(audio.destination);
      next = audio.currentTime + 0.05;
      timer = setInterval(schedule, 40);
    }
    function stop() { clearInterval(timer); timer = null; if (gain) gain.disconnect(); }
    function toggle() {
      on = !on;
      try { localStorage.setItem('efb.music', on ? 'on' : 'off'); } catch (e) { /* sem storage */ }
      if (on) start(); else stop();
      return on;
    }
    return { start, stop, toggle, get on() { return on; } };
  })();

  /* ---------- posições ---------- */
  const nodeCenter = (p, id) => M.center(...C.PHASES[p].nodes[id].at);
  const IDLE = [[0, 1], [-8, -2], [7, -2], [-1, -5]];

  function placeParty(id) {
    const [x, y] = nodeCenter(s.phase, id);
    party = IDLE.map(([dx, dy]) => ({ x: x + dx, y: y + dy, dir: 1 }));
  }

  function along(pts, d) {
    d = Math.max(0, Math.min(pts.length - 1, d));
    const i = Math.min(pts.length - 2, Math.floor(d)), t = d - i;
    const a = pts[i], b = pts[i + 1] || a;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.sign(b[0] - a[0]) || 1];
  }

  function updateWalk(now) {
    if (!walk) return false;
    const d = (now - walk.t0) / STEP_MS;
    const end = walk.pts.length - 1;
    party.forEach((m, i) => {
      const [x, y, dir] = along(walk.pts, d - LAG[i]);
      m.x = x; m.y = y; m.dir = dir;
    });
    if (d >= end + LAG[3]) {
      const [x, y] = walk.pts[end];
      party.forEach((m, i) => { m.x = x + IDLE[i][0]; m.y = y + IDLE[i][1]; });
      walk = null;
      arrived = true;
      return false;
    }
    return true;
  }

  /* ---------- desenho do mapa ---------- */
  // Desenha com os pés em (x, y), em coordenadas do mundo; sprites 2× ocupam largura/k.
  function put(img, x, y, o = {}) {
    const k = (img.k || 1) / (o.k || 1);
    const w = img.width / k, h = img.height / k;
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    const dx = Math.round((x - w / 2) * 2) / 2, dy = Math.round((y - h) * 2) / 2;
    if (o.flip) { ctx.translate(dx + w, dy); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); }
    else ctx.drawImage(img, dx, dy, w, h);
    ctx.restore();
  }

  function shadow(x, y, w = 6) {
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.fillRect(Math.round(x - w), Math.round(y - 1), w * 2, 2);
  }

  // Texto nítido: desenhado direto em pixels do aparelho, por cima do mundo.
  function label(text, x, y, color, size = 14, bg = 'rgba(18,14,28,.85)') {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${size}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const X = x * SCALE, Y = y * SCALE, w = ctx.measureText(text).width + 10;
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(Math.round(X - w / 2), Math.round(Y - size / 2 - 4), Math.round(w), size + 8); }
    ctx.fillStyle = color;
    ctx.fillText(text, Math.round(X), Math.round(Y));
    ctx.restore();
  }

  // Rastro marrom: cada trecho percorrido vira manchas que crescem com as horas passadas.
  function drawTrail(now) {
    for (const t of s.trail) {
      if (t.phase !== s.phase) continue;
      const pts = M.path(s.phase, t.from, t.to).map(([c, r]) => M.center(c, r));
      const age = Math.max(0, s.hours - t.at);
      const size = Math.min(5, 1 + age * 0.22);
      for (let i = 0; i < pts.length - 1; i++) {
        for (let k = 0; k < 3; k++) {
          const f = k / 3, jx = (M.hash(i, k, t.at * 7) - 0.5) * 6, jy = (M.hash(k, i, t.at * 3) - 0.5) * 3;
          const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f + jx, y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f + jy;
          const rad = Math.max(1, Math.round(size * (0.6 + M.hash(i, k, 5) * 0.6)));
          M.blob(ctx, x, y, rad, '#5a3a1c');
          M.blob(ctx, x - 0.5, y - 0.5, Math.max(1, rad - 1), '#7a4f26');
          if (age > 8 && k === 0 && i % 2 === 0) {
            const a = now / 180 + i;
            ctx.fillStyle = '#1a1423';
            ctx.fillRect(x + Math.cos(a) * 4, y - 4 + Math.sin(a * 1.3) * 2, 1, 1);
          }
        }
      }
    }
  }

  function walkerPos(paths, i, now, speed) {
    const pts = paths[i % paths.length];
    const L = pts.length - 1;
    const cyc = (now / speed + i * 2.37) % (2 * L);
    const d = cyc < L ? cyc : 2 * L - cyc;
    const [x, y] = along(pts, d);
    return { x, y, dir: cyc < L ? Math.sign(pts[L][0] - pts[0][0]) || 1 : -(Math.sign(pts[L][0] - pts[0][0]) || 1) };
  }

  function render(now) {
    if (!s) return;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const p = s.phase, ph = C.PHASES[p];
    const hour = C.hourOfDay(s.hours), night = hour >= 19 || hour < 6;
    const moving = updateWalk(now);
    effects = effects.filter(e => now - e.t0 < e.dur);

    ctx.drawImage(M.ground(p), 0, 0, W, H);
    drawTrail(now);

    // Estradas com blitz ficam vermelhas: passar por elas pede o dado.
    const blink = Math.floor(now / 400) % 2;
    ph.edges.forEach(([a, b], i) => {
      if (!s.patrols[i]) return;
      for (const [c, r] of M.path(p, a, b)) {
        const [X, Y] = M.top(c, r);
        ctx.globalAlpha = 0.22 + 0.08 * blink;
        M.diamond(ctx, X, Y, '#ff3b3b');
        ctx.globalAlpha = 1;
      }
    });

    // Destinos possíveis piscam: dourado = estrada livre, vermelho = blitz, verde = teletransporte.
    const pulse = 0.55 + 0.45 * Math.sin(now / 220);
    if (!s.pending && !s.ended && !moving && !queue.length) {
      const targets = tpMode
        ? Object.keys(ph.nodes).filter(id => id !== s.node).map(id => [id, '#5dfc8a', 0])
        : C.neighbors(s).map(n => [n.to, n.cops ? '#ff5050' : '#f7cf3d', n.dc]);
      for (const [id, col] of targets) {
        const [X, Y] = M.top(...ph.nodes[id].at);
        ctx.globalAlpha = 0.25 * pulse;
        M.diamond(ctx, X, Y, col);
        ctx.globalAlpha = pulse;
        M.outline(ctx, X, Y, col);
        ctx.globalAlpha = 1;
        const ay = Y - 30 + Math.round(Math.sin(now / 160) * 3);
        ctx.fillStyle = '#1a1423';
        ctx.fillRect(X - 5, ay - 1, 11, 2); ctx.fillRect(X - 4, ay + 1, 9, 2); ctx.fillRect(X - 3, ay + 3, 7, 2); ctx.fillRect(X - 2, ay + 5, 5, 2); ctx.fillRect(X - 1, ay + 7, 3, 1);
        ctx.fillStyle = col;
        ctx.fillRect(X - 4, ay, 9, 1); ctx.fillRect(X - 3, ay + 1, 7, 2); ctx.fillRect(X - 2, ay + 3, 5, 2); ctx.fillRect(X - 1, ay + 5, 3, 2);
      }
      const [X, Y] = M.top(...ph.nodes[s.node].at);
      M.outline(ctx, X, Y, '#ffffff');
    }

    hits = [];
    const list = [];
    for (const { c, r, o } of M.objects(p)) {
      const [, cy] = M.center(c, r);
      list.push({ y: cy, draw: () => M.drawObject(ctx, p, o, c, r, now, night) });
    }
    for (const [id, n] of Object.entries(ph.nodes)) {
      const k = `${p}:${id}`;
      if (n.stash && !s.taken[k] && !s.sent[k]) {
        const [x, y] = M.center(...n.at);
        list.push({ y: y + 2, draw: () => put(sprite('mala'), x + 12, y + 4 + Math.round(Math.sin(now / 300))) });
      }
    }

    // Personagens fixos do mapa.
    const npc = (id, name, dx, extra) => {
      const n = ph.nodes[id];
      if (!n) return;
      const [x, y] = M.center(...n.at);
      hits.push({ who: name, x: x + dx, y: y + 2 });
      list.push({ y: y + 1, draw: () => { shadow(x + dx, y + 2, 5); put(sprite(name, Math.floor(now / 600) % 2), x + dx, y + 2, { flip: dx > 0 }); if (extra) extra(x + dx, y + 2); } });
    };
    if (p === 0) {
      npc('pai', 'pai', 12, (x, y) => {
        ctx.fillStyle = '#4a4a52';
        for (let i = -7; i <= 7; i += 3) ctx.fillRect(x + i, y - 19, 1, 19);
        ctx.fillRect(x - 8, y - 20, 17, 1);
      });
      npc('irmao', 'irmao', 12);
    }
    if (p === 1 && s.contacts.queiroz) npc('entrada', 'queiroz', 13);
    if (s.coach[p]) npc(s.coach[p], 'marcal', -13);
    if (p === 3) npc('chegada', 'milei', 13);

    // Blitz: policiais parados no meio de cada estrada vigiada, com "!" piscando.
    ph.edges.forEach(([a, b], i) => {
      const cops = s.patrols[i];
      if (!cops) return;
      const pts = M.path(p, a, b);
      const [x, y] = M.center(...pts[Math.floor(pts.length / 2)]);
      for (let k = 0; k < cops; k++) {
        const cx = x + (k ? 7 : -3), cy = y + (k ? 2 : 0);
        hits.push({ who: 'policial', x: cx, y: cy + 1 });
        list.push({ y: cy, draw: () => {
          shadow(cx, cy + 1, 5);
          put(sprite('policial', Math.floor(now / 500 + k) % 2), cx, cy + 1, { flip: k === 1 });
          if (effects.some(e => e.type === 'fake')) label('?', cx, cy - 23, '#f7cf3d', 12, null);
          else if (blink) label('!', cx, cy - 23, '#ff5050', 12, null);
        } });
      }
    });

    // Fantasmas do Comunismo vagando: mais Paranoia, mais fantasmas.
    const paths = ph.edges.map(([a, b]) => M.path(p, a, b).map(([c, r]) => M.center(c, r)));
    const ghosts = Math.floor(s.paranoia / 30);
    for (let i = 0; i < ghosts; i++) {
      const w = walkerPos(paths, i + 3, now, 1900);
      hits.push({ who: 'fantasma', x: w.x, y: w.y });
      list.push({ y: w.y, draw: () => put(sprite('fantasma'), w.x, w.y - 4 + Math.sin(now / 300 + i) * 2, { alpha: 0.7, flip: w.dir < 0 }) });
    }

    // A família. Depois de Brasília o Fluvio vai montado no Dark Horse.
    const tp = effects.find(e => e.type === 'teleport');
    const hidden = tp && now - tp.t0 < 450;
    if (!hidden) {
      party.forEach((m, i) => {
        if (i === 0 && p >= 1) hits.push({ who: 'cavalo', x: m.x, y: m.y + 1, h: 14 }, { who: 'senador', x: m.x - 3 * m.dir, y: m.y - 8, h: 14 });
        else hits.push({ who: FAMILY[i], x: m.x, y: m.y + 1 });
        list.push({ y: m.y + 0.1 * (4 - i), draw: () => {
          const alpha = tp ? Math.min(1, (now - tp.t0 - 450) / 300) : 1;
          const frame = moving ? Math.floor(now / 140 + i) % 2 : 0;
          if (i === 0 && p >= 1) {
            shadow(m.x, m.y + 1, 9);
            const bob = moving ? Math.floor(now / 120) % 2 : 0;
            put(sprite('cavalo'), m.x, m.y + 1 - bob, { flip: m.dir < 0, alpha });
            put(sprite('senador', 0), m.x - 3 * m.dir, m.y - 6 - bob, { flip: m.dir < 0, alpha });
            if (Math.floor(now / 2600) % 3 === 0 && (now % 2600) < 700) label('HIC!', m.x + 8 * m.dir, m.y - 26, '#1a1423', 10, '#ffffff');
          } else {
            shadow(m.x, m.y + 1, i < 2 ? 5 : 4);
            put(sprite(FAMILY[i], frame), m.x, m.y + 1, { flip: m.dir < 0, alpha });
          }
        } });
      });
    }
    if (s.paranoia > 50) {
      const a = Math.min(0.85, (s.paranoia - 40) / 60), lead = party[0];
      const gx = lead.x + Math.sin(now / 700) * 18, gy = lead.y - 8 + Math.sin(now / 400) * 3;
      list.push({ y: lead.y + 0.5, draw: () => put(sprite('fantasma'), gx, gy, { alpha: a }) });
    }

    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();

    const lead = party[0];
    // Ataque do Fantasma: ele aparece ao lado da família com a "arma" erguida.
    if (s.pending && s.pending.type === 'attack' && lead) {
      const gx = lead.x + 26, gy = lead.y - 14 + Math.sin(now / 200) * 3;
      put(sprite('fantasma'), gx, gy);
      put(sprite(s.pending.item === 'kit' ? 'kit' : 'mamadeira'), gx - 8 + Math.sin(now / 90) * 2, gy - 14);
    }
    for (const e of effects) {
      const t = (now - e.t0) / e.dur;
      if (e.type === 'throw' && lead) {
        const x = lead.x + 26 * (1 - t), y = lead.y - 28 + 14 * t - Math.sin(t * Math.PI) * 18;
        put(sprite(e.item === 'kit' ? 'kit' : 'mamadeira'), x, y);
      }
      if (e.type === 'carlos' && lead) {
        const cx = lead.x - 22, cy = lead.y + 2;
        put(sprite('carlos', Math.floor(now / 300) % 2), cx, cy);
        for (let i = 0; i < 14; i++) {
          const a = i / 14 * Math.PI * 2 + now / 300, rr = 9 + 5 * Math.sin(now / 150 + i);
          ctx.fillStyle = ['#ffd84a', '#ff7ac8', '#7fc3ff', '#ffffff', '#c8a2ff'][i % 5];
          ctx.fillRect(cx + Math.cos(a) * rr, cy - 10 + Math.sin(a) * rr, 1, 1);
        }
      }
      if (e.type === 'float') label(e.text, e.x, e.y - 10 - t * 18, e.color, 12);
      if (e.type === 'who') {
        const h = e.hit;
        ctx.strokeStyle = '#f7cf3d';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(h.x - 8) + 0.5, Math.round(h.y - (h.h || 22)) + 0.5, 16, (h.h || 22) + 2);
        label(e.text, Math.max(46, Math.min(W - 46, h.x)), Math.max(8, h.y - (h.h || 22) - 7), '#f7cf3d', 10);
      }
    }

    // Teletransporte do Funcionário Fantasma: lençol branco e chuva de dinheiro.
    if (tp) {
      const t = (now - tp.t0) / tp.dur;
      const [fx, fy] = tp.from, [tx, ty] = tp.to;
      const gx = t < 0.5 ? fx : tx, gy = (t < 0.5 ? fy - t * 50 : ty - (1 - t) * 50) - 4;
      put(sprite('fantasmaFlavio'), gx, gy, { alpha: 0.95 });
      for (let i = 0; i < 14; i++) {
        const sx = (t < 0.5 ? fx : tx) + (M.hash(i, 1, 9) - 0.5) * 50;
        const sy = gy - 20 + ((now / 4 + i * 37) % 60);
        put(sprite('cedula'), sx + Math.sin(now / 120 + i) * 3, sy, { flip: i % 2 === 0 });
      }
    }

    if (night) {
      ctx.fillStyle = 'rgba(16, 20, 70, 0.34)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function loop(now) {
    if (!$('overworld').classList.contains('hidden')) owRender(now);
    if (!$('game').classList.contains('hidden')) {
      render(now);
      if (zoomed && walk && party[0]) centerOn(party[0].x, party[0].y);
      if (arrived) { arrived = false; updateActions(); updateMission(); updateHud(); }
    }
    if (!$('end').classList.contains('hidden')) endScene(now);
    requestAnimationFrame(loop);
  }

  /* ---------- clique no mapa ---------- */
  // Clicar numa pessoa mostra quem é (nome fictício e papel); clicar num lugar anda até lá.
  const WHO = {
    senador: 'o senador em fuga (você)', esposa: 'a esposa', filha: 'viajando no banco de trás', filha2: 'quer ir ao banheiro',
    pai: 'preso em casa, com soluço', irmao: 'o irmão inimigo da sinapse', queiroz: 'o ex-assessor que busca o dinheiro vivo',
    marcal: 'o coach motivacional', milei: 'presidente da motosserra', policial: 'blitz: passar por esta estrada pede dado',
    fantasma: 'cresce com a sua Paranoia', cavalo: 'o filme do pai virou montaria', carlos: 'o irmão da purpurina',
  };
  let hits = [];
  function whoAt(x, y) {
    let best = null, bd = Infinity;
    for (const h of hits) {
      const top = h.y - (h.h || 22);
      if (x < h.x - 8 || x > h.x + 8 || y < top || y > h.y + 2) continue;
      const d = Math.abs(x - h.x) + Math.abs(y - (top + h.y) / 2);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }
  function identify(h) {
    const name = C.NAMES[h.who] || h.who;
    effects = effects.filter(e => e.type !== 'who');
    effects.push({ type: 'who', hit: h, text: name.split(',')[0].toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), t0: performance.now(), dur: 2600 });
    toast(`${name} — ${WHO[h.who] || ''}`);
  }

  map.addEventListener('click', e => {
    if (!s) return;
    if (dragged) { dragged = false; return; }
    const rect = map.getBoundingClientRect();
    const x = (e.clientX - rect.left) * W / rect.width, y = (e.clientY - rect.top) * H / rect.height;
    const person = whoAt(x, y);
    if (person) { identify(person); return; }
    if (s.pending || s.ended || walk || queue.length) return;
    const ph = C.PHASES[s.phase];
    let best = null, bd = 18;
    for (const [id, n] of Object.entries(ph.nodes)) {
      const [cx, cy] = M.center(...n.at);
      const d = Math.hypot(x - cx, (y - cy) * 1.6);
      if (d < bd) { bd = d; best = id; }
    }
    if (!best || best === s.node) return;
    const ids = C.actions(s).filter(a => !a.disabled).map(a => a.id);
    const id = tpMode ? `tp:${best}` : `go:${best}`;
    if (!ids.includes(id)) return;
    if (tpMode) play(id); else use(C.actions(s).find(a => a.id === id));
  });

  /* ---------- HUD, rótulos, balões ---------- */
  let shownReais = null, shownUsd = null;
  function updateHud() {
    const ph = C.PHASES[s.phase];
    $('clock').textContent = C.clock(s.hours);
    $('phaseName').textContent = `${s.phase + 1}/5 ${ph.name}`;
    $('cercoBar').style.width = `${s.cerco}%`;
    $('cercoVal').textContent = Math.round(s.cerco);
    $('paranoiaBar').style.width = `${s.paranoia}%`;
    $('paranoiaVal').textContent = Math.round(s.paranoia);
    $('cercoBar').parentNode.parentNode.classList.toggle('alert', s.cerco >= 75);
    $('paranoiaBar').parentNode.parentNode.classList.toggle('alert', s.paranoia >= 80);
    const flash = (el, prev, val) => {
      if (prev == null || prev === val) return;
      el.classList.remove('up', 'down'); void el.offsetWidth;
      el.classList.add(val > prev ? 'up' : 'down');
    };
    flash($('reais'), shownReais, s.reais);
    flash($('usd'), shownUsd, s.usd);
    shownReais = s.reais; shownUsd = s.usd;
    $('reais').textContent = `R$ ${fmt(s.reais)} mil`;
    $('usd').textContent = `US$ ${fmt(s.usd)} mil`;
    $('bags').textContent = `Malas ${C.bags(s)}/${C.capacity(s)}`;
    $('powers').textContent = `Lanterna da realidade ${s.lanterns} · Força do Fantasma ${s.ghostPower}`;
    const free = !s.pending && !s.ended && !queue.length;
    const ids = free ? C.actions(s).filter(a => !a.disabled).map(a => a.id) : [];
    $('pFake').querySelector('i').textContent = s.fakeNews;
    $('pFake').disabled = !ids.includes('fake');
    $('pTp').querySelector('i').textContent = s.teleports;
    $('pTp').disabled = !ids.some(id => id.startsWith('tp:'));
    $('pTp').classList.toggle('on', tpMode);
  }

  const pct = (x, y) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

  function updateLabels() {
    const ph = C.PHASES[s.phase];
    const box = $('labels');
    box.textContent = '';
    for (const [id, n] of Object.entries(ph.nodes)) {
      const k = `${s.phase}:${id}`;
      const el = document.createElement('span');
      el.className = 'label';
      if (id === s.node) el.classList.add('here');
      if (n.stash && !s.taken[k] && !s.sent[k]) el.classList.add('stash');
      if (ph.exits.some(e => e.at === id)) el.classList.add('exit');
      el.textContent = n.name;
      const [x, y] = M.center(...n.at);
      Object.assign(el.style, pct(x, y + 6));
      box.appendChild(el);
    }
    updateBubbles();
  }

  function updateBubbles() {
    const box = $('bubbles');
    box.textContent = '';
    if (!s) return;
    const ph = C.PHASES[s.phase];
    const lines = [];
    const say = (id, text, dx, cls = '') => lines.push({ id, text, dx, cls });
    if (s.phase === 0) {
      say('pai', 'HIC!', 12, 'hic');
      say('irmao', C.BROTHER[bubbleTick % C.BROTHER.length], 12);
    }
    if (s.phase === 1 && s.contacts.queiroz) say('entrada', 'Trouxe o envelope. Faltou um pouquinho...', 13);
    if (s.coach[s.phase]) say(s.coach[s.phase], C.COACH[(bubbleTick + 3) % C.COACH.length], -13, 'coach');
    const carlos = effects.find(e => e.type === 'carlos');
    if (carlos && party[0]) {
      const el = document.createElement('span');
      el.className = 'bubble poem';
      el.textContent = carlos.poem;
      Object.assign(el.style, pct(party[0].x - 22, party[0].y - 22));
      box.appendChild(el);
      return;
    }
    if (!lines.length) return;
    const { id, text, dx, cls } = lines[bubbleTick % lines.length];
    if (!ph.nodes[id]) return;
    const [x, y] = M.center(...ph.nodes[id].at);
    const el = document.createElement('span');
    el.className = `bubble ${cls}`;
    el.textContent = text;
    Object.assign(el.style, pct(x + dx, y - 20));
    box.appendChild(el);
  }

  /* ---------- painel: missão e ações ---------- */
  function chips(cost) {
    const wrap = document.createElement('span');
    wrap.className = 'chips';
    if (!cost) return wrap;
    const add = (text, cls) => { const c = document.createElement('i'); c.className = cls; c.textContent = text; wrap.appendChild(c); };
    const sign = v => (v > 0 ? `+${v}` : `−${-v}`);
    if (cost.h != null) add(`${cost.h}h`, 'time');
    if (cost.cops) add(`🚓 blitz ×${cost.cops}`, 'bad');
    if (cost.dc) add(`🎲 CD ${cost.dc}`, 'dice');
    else if (cost.dc === 0 && cost.cops === 0) add('sem dado', 'good');
    if (cost.cerco) add(`Cerco ${sign(cost.cerco)}`, cost.cerco > 0 ? 'bad' : 'good');
    if (cost.paranoia) add(`Paranoia ${sign(cost.paranoia)}`, cost.paranoia > 0 ? 'para' : 'good');
    if (cost.pay) add(cost.pay, 'pay');
    if (cost.gain) add(`+${cost.gain}`, 'gain');
    return wrap;
  }

  function button(a, onClick, cls = '') {
    const b = document.createElement('button');
    b.className = cls;
    const t = document.createElement('span');
    t.className = 'title';
    t.textContent = a.label;
    b.appendChild(t);
    if (a.cost || a.disabled) {
      const c = chips(a.cost);
      if (a.disabled && a.reason) { const i = document.createElement('i'); i.className = 'lock'; i.textContent = `🔒 ${a.reason}`; c.appendChild(i); }
      b.appendChild(c);
    }
    const extra = a.disabled ? a.reason : a.detail;
    if (extra) {
      const sm = document.createElement('small');
      sm.textContent = extra;
      b.appendChild(sm);
    }
    b.disabled = !!a.disabled;
    b.dataset.id = a.id || '';
    b.addEventListener('click', onClick);
    return b;
  }

  function section(box, title) {
    const h = document.createElement('h4');
    h.textContent = title;
    box.appendChild(h);
  }

  let missionOpen = false;
  try { missionOpen = localStorage.getItem('efb.dicas') === '1'; } catch (e) { /* sem armazenamento */ }
  function updateMission() {
    $('missionBody').classList.toggle('hidden', !missionOpen);
    $('missionBtn').setAttribute('aria-expanded', String(missionOpen));
    $('missionBtn').querySelector('span').textContent = missionOpen ? '▾ esconder' : '▸ ver dicas';
    const next = $('nextBox');
    next.textContent = '';
    if (!s.pending && !s.ended && !tpMode && !walk) {
      const list = C.actions(s), sa = list.find(a => a.id === C.suggest(s));
      if (sa && sa.kind !== 'quit') next.appendChild(button({ ...sa, label: `★ PRÓXIMO PASSO: ${sa.kind === 'go' ? 'ir para ' + sa.label : sa.label}` }, () => use(sa), 'next'));
    }
    const ul = $('goals');
    ul.textContent = '';
    for (const g of C.goals(s)) {
      const li = document.createElement('li');
      li.className = g.done ? 'done' : '';
      li.textContent = `${g.done ? '✔' : '▢'} ${g.text}`;
      ul.appendChild(li);
    }
  }

  function updateActions() {
    const box = $('actions');
    box.textContent = '';
    if (s.pending || s.ended) return;
    const list = C.actions(s);
    const sug = C.suggest(s);
    const ph = C.PHASES[s.phase];

    if (tpMode) {
      section(box, 'TELETRANSPORTE: TOQUE NUM LUGAR VERDE');
      const fact = document.createElement('p');
      fact.className = 'note';
      fact.textContent = C.FACTS.teleport;
      box.appendChild(fact);
      for (const a of list.filter(x => x.kind === 'tp')) box.appendChild(button(a, () => play(a.id), 'tp'));
      box.appendChild(button({ label: 'Cancelar' }, () => { tpMode = false; refresh(); }, 'quiet'));
      return;
    }

    if (walk) section(box, `A CAMINHO: ${ph.nodes[s.node].name.toUpperCase()}...`);
    const groups = [
      [`AQUI: ${ph.nodes[s.node].name.toUpperCase()}`, a => !walk && (a.group === 'exit' || a.group === 'here')],
      ['ANDAR (OU TOQUE NO MAPA) · VERMELHO = BLITZ', a => a.group === 'move'],
      ['TELEFONE', a => a.group === 'phone'],
    ];
    for (const [title, test] of groups) {
      const items = list.filter(test);
      if (!items.length) continue;
      section(box, title);
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const a of items) {
        let cls = a.kind === 'exit' ? 'exit' : a.group === 'power' ? 'power' : a.cops ? 'blitz' : '';
        if (a.id === sug) cls += ' suggested';
        grid.appendChild(button(a, () => use(a), cls));
      }
      box.appendChild(grid);
    }
    const other = document.createElement('div');
    other.className = 'grid other';
    for (const a of list.filter(x => x.group === 'other')) other.appendChild(button(a, () => use(a), a.kind === 'quit' ? 'quiet' : ''));
    box.appendChild(other);
  }

  function updateLog() {
    const box = $('log');
    box.textContent = '';
    for (const entry of s.log.slice(0, 12)) {
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = entry.at.slice(4);
      li.append(b, entry.text);
      box.appendChild(li);
    }
  }

  let toastTimer = 0;
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 6000);
  }

  /* ---------- modais ---------- */
  function drawArt(names) {
    const c = $('modalArt'), g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    c.classList.toggle('hidden', !names || !names.length);
    if (!names || !names.length) return;
    g.imageSmoothingEnabled = false;
    const imgs = names.map(n => sprite(n));
    const total = imgs.reduce((w, im) => w + im.width * 2 + 8, -8);
    let x = Math.round((c.width - total) / 2);
    for (const im of imgs) {
      g.drawImage(im, x, c.height - im.height * 2 - 4, im.width * 2, im.height * 2);
      x += im.width * 2 + 8;
    }
  }

  function rollLine(r) {
    if (!r) return '';
    const crit = r.die === 20 ? ' (20 natural!)' : r.die === 1 ? ' (1 natural)' : '';
    return `d20: ${r.die}${r.mod ? ` + ${r.mod}` : ''} = ${r.total} contra CD ${r.dc}${crit} → ${r.ok ? 'SUCESSO' : 'FALHOU'}${r.rigged ? ' (dado não auditado)' : ''}`;
  }

  function animateDice(final, ok) {
    const d = $('dice');
    d.classList.remove('hidden', 'ok', 'bad', 'settled');
    let i = 0;
    clearInterval(d._t);
    d._t = setInterval(() => {
      d.textContent = 1 + Math.floor(Math.random() * 20);
      if (++i > 9) {
        clearInterval(d._t);
        d.textContent = final;
        d.classList.add('settled', ok ? 'ok' : 'bad');
      }
    }, 55);
  }

  function showModal({ tag, title, text, fact, choices, art, dice, light, fx, extra }) {
    $('modal').classList.toggle('light', !!light);
    $('modalTag').textContent = tag;
    $('modalTitle').textContent = title;
    $('modalText').textContent = text;
    $('modalFact').textContent = fact || '';
    drawArt(art);
    const d = $('dice');
    if (dice) animateDice(dice.die, dice.ok); else d.classList.add('hidden');
    const fxBox = $('modalFx');
    fxBox.textContent = '';
    if (fx) fxBox.appendChild(fx);
    const box = $('modalChoices');
    box.textContent = '';
    for (const c of choices) box.appendChild(button(c, c.onClick, c.cls || ''));
    if (extra) box.appendChild(extra);
    $('modal').classList.remove('hidden');
  }
  const hideModal = () => $('modal').classList.add('hidden');

  function fxChips(fx) {
    const wrap = document.createElement('div');
    wrap.className = 'chips big';
    const add = (text, cls) => { const c = document.createElement('i'); c.className = cls; c.textContent = text; wrap.appendChild(c); };
    const sign = v => (v > 0 ? `+${v}` : `−${-v}`);
    if (fx.hours) add(`+${fx.hours}h`, 'time');
    if (fx.reais) add(`${fx.reais > 0 ? '+' : '−'}R$ ${fmt(Math.abs(fx.reais))} mil`, fx.reais > 0 ? 'gain' : 'bad');
    if (fx.usd) add(`${fx.usd > 0 ? '+' : '−'}US$ ${fmt(Math.abs(fx.usd))} mil`, fx.usd > 0 ? 'gain' : 'bad');
    if (fx.cerco) add(`Cerco ${sign(fx.cerco)}`, fx.cerco > 0 ? 'bad' : 'good');
    if (fx.paranoia) add(`Paranoia ${sign(fx.paranoia)}`, fx.paranoia > 0 ? 'para' : 'good');
    if (!wrap.children.length) add('sem efeito', 'time');
    return wrap;
  }

  const ART = {
    take: ['mala'], fuel: ['jato'], exchange: ['vorcaro', 'cedula'], hide: ['senador'], rest: ['senador'],
    milei: ['milei', 'cavalo'], visit: ['pai', 'michelle'], brother: ['irmao'], coach: ['marcal'], vorcaro: ['vorcaro', 'cedula'],
    fake: ['fantasma'], tp: ['fantasmaFlavio', 'cedula'], wait: ['senador'], dodge: ['senador'], push: ['senador'],
    fakenews: ['fantasma'], opt: ['senador'],
  };
  function artFor(a) {
    if (!a) return ['senador'];
    if (a.kind === 'call') return [C.CONTACTS[a.contact].art];
    if (a.kind === 'send') return ['queiroz', 'mala'];
    if (a.kind === 'go') return a.cops ? ['policial', 'senador'] : (s.phase >= 1 ? ['cavalo'] : ['senador', 'esposa']);
    if (a.kind === 'exit') return s.phase >= 3 ? ['jato'] : s.phase >= 1 ? ['cavalo'] : ['senador', 'esposa'];
    if (a.kind === 'duck') return [s.pending ? (s.pending.item === 'kit' ? 'kit' : 'mamadeira') : 'fantasma', 'fantasma'];
    return ART[a.kind] || ['senador'];
  }

  function resultModal(r, events) {
    const carlos = events.some(e => e.type === 'carlos');
    const stolen = events.find(e => e.type === 'stolen');
    let art = r.art;
    if (carlos) art = ['carlos', 'kit'];
    return {
      tag: r.roll ? (r.roll.ok ? '🎲 SUCESSO' : '🎲 FALHOU') : 'RESULTADO',
      title: r.kind === 'tp' ? `Teletransporte: ${r.title}` : r.kind === 'go' ? `Ir para ${r.title}` : r.title,
      text: r.notes.join(' '),
      fact: [rollLine(r.roll), stolen ? C.FACTS.joias : '', r.kind === 'vorcaro' ? C.FACTS.vorcaro : ''].filter(Boolean).join(' · '),
      art, dice: r.roll, light: true, fx: fxChips(r.fx),
      choices: [{ label: 'OK', cls: 'ok', onClick: () => { queue.shift(); refresh(); } }],
    };
  }

  function updateModal() {
    if (s.pending && s.pending.type === 'detour' && !queue.some(q => q.type === 'overworld')) queue.unshift({ type: 'overworld', to: s.pending.spot });
    const ow = queue.length && queue[0].type === 'overworld';
    $('overworld').classList.toggle('hidden', !ow);
    if (ow) { hideModal(); owUpdate(true); return; }
    if (queue.length) {
      const q = queue[0];
      if (q.type === 'moraes') {
        showModal({
          tag: 'STF · BRASILIA · SEGUNDA, 18h', title: 'ALEJANDRO DE AMORES, O XANDE',
          text: '— Senador, os passaportes. Amanhã, 11h. Sem atraso. — Claro, ministro… (no fundo da sala, o Fantasma do Comunismo ri baixinho)',
          fact: C.FACTS.moraes, art: ['moraes', 'senador', 'fantasma'],
          choices: [{ label: 'ENGOLIR EM SECO E COMEÇAR A FUGA', onClick: () => { queue.shift(); refresh(); } }],
        });
      } else if (q.type === 'intro') {
        const ph = C.PHASES[q.phase];
        showModal({
          tag: `FASE ${q.phase + 1} DE 5`, title: `${ph.name.toUpperCase()}: ${ph.subtitle}`,
          text: `Veículo: ${ph.vehicle.name} (${q.phase === 0 ? '2 malas, 5 com o Ex-Capitão' : `${ph.vehicle.bags} malas`}). Estradas em vermelho têm blitz: passar por elas pede o dado. Siga a MISSÃO; o botão ★ mostra um passo seguro.`,
          fact: q.phase === 1 ? `${ph.fact} ${C.FACTS.horse}` : ph.fact,
          art: q.phase === 0 ? ['senador', 'esposa', 'filha', 'filha2'] : q.phase >= 3 ? ['jato'] : ['cavalo', 'senador'],
          choices: [{ label: 'CONTINUAR', onClick: () => { queue.shift(); refresh(); } }],
        });
      } else if (q.type === 'milei') {
        showModal({
          tag: 'PUERTO IGUAZU · ARGENTINA', title: 'CHAVO MILEY',
          text: `Ele surge de jaqueta de couro, cabelo em pé e motosserra ligada. Olha o cavalo de cima a baixo: — "${C.MILEI}" (HIC!, faz o pangaré, apavorado.)`,
          fact: C.FACTS.milei, art: ['milei', 'cavalo'],
          choices: [{ label: 'SEGURAR AS RÉDEAS COM FORÇA', onClick: () => { queue.shift(); refresh(); } }],
        });
      } else if (q.type === 'result') {
        showModal(q.modal);
      }
      return;
    }
    if (s.pending) {
      const p = s.pending;
      const choices = C.actions(s).map(a => ({ ...a, onClick: () => play(a.id) }));
      if (p.type === 'card') {
        showModal({ tag: 'PLANTÃO URGENTE', title: p.card.title, text: p.card.text, choices, art: ['senador'] });
      } else if (p.type === 'roll') {
        const extra = document.createElement('div');
        extra.className = 'rig';
        const open = button({ label: '🎲 Esse dado não é auditado', detail: `Escolha o número. Paranoia +${C.RIG_PARANOIA} e o Fantasma ganha força (ataca mais e mais forte).` }, () => grid.classList.toggle('hidden'), 'rigBtn');
        const grid = document.createElement('div');
        grid.className = 'numbers hidden';
        for (const a of choices.filter(c => c.kind === 'rig')) {
          const b = document.createElement('button');
          b.textContent = a.label;
          b.dataset.id = a.id;
          if (a.n === 20) b.classList.add('nat');
          b.addEventListener('click', a.onClick);
          grid.appendChild(b);
        }
        extra.append(open, grid);
        showModal({
          tag: '🎲 O DADO FALHOU', title: p.title,
          text: `Precisava de ${p.roll.dc}. ${p.failText}`, fact: rollLine(p.roll), dice: p.roll, art: pendingArt,
          choices: choices.filter(c => c.kind === 'accept').map(c => ({ ...c, cls: 'accept' })), extra,
        });
      } else if (p.type === 'attack') {
        const kit = p.item === 'kit';
        showModal({
          tag: '☭ ATAQUE DO FANTASMA', title: kit ? 'O Fantasma arremessa um KIT GAY!' : 'O Fantasma arremessa uma MAMADEIRA DE PIROCA!',
          text: kit ? 'Se acertar, quem aparece é o irmão Charlitos, brilhando de purpurina e declamando poesia.' : 'Se acertar, uma hora explicando para as filhas o que é aquilo.',
          fact: 'As duas "armas" são fake news famosas da eleição de 2018; aqui o Fantasma devolve o presente.',
          art: ['fantasma', kit ? 'kit' : 'mamadeira'], choices,
        });
      } else {
        const known = p.revealed ? (p.real ? ' A lanterna diz: é REAL.' : ' A lanterna diz: é o Fantasma.') : '';
        showModal({ tag: 'AMEAÇA À FRENTE', title: p.text, text: `Real ou coisa da sua cabeça?${known}`, choices, art: ['senador', 'fantasma'] });
      }
      return;
    }
    hideModal();
  }

  /* ---------- fluxo ---------- */
  function handleEvents(now) {
    const intros = [];
    for (const e of s.events) {
      if (e.type === 'travel') {
        const pts = M.path(s.phase, e.from, e.to).map(([c, r]) => M.center(c, r));
        walk = { pts, t0: now };
        SFX.travel();
      } else if (e.type === 'teleport') {
        effects.push({ type: 'teleport', t0: now, dur: 1200, from: nodeCenter(s.phase, e.from), to: nodeCenter(s.phase, e.to) });
        walk = null;
        placeParty(e.to);
        if (zoomed) requestAnimationFrame(() => centerOn(party[0].x, party[0].y));
        SFX.teleport();
      } else if (e.type === 'fake') {
        effects.push({ type: 'fake', t0: now, dur: 4000 });
        toast('📱 FAKE NEWS: "Curtindo Dubai! 🌴" — a PF coça a cabeça.');
        SFX.fake();
      } else if (e.type === 'attack') {
        SFX.attack();
      } else if (e.type === 'carlos') {
        const poem = s.log[0] ? s.log[0].text.split('"')[1] || '' : '';
        effects.push({ type: 'carlos', t0: now, dur: 9000, poem: `"${poem}"` });
        effects.push({ type: 'throw', item: 'kit', t0: now, dur: 600 });
        SFX.carlos();
      } else if (e.type === 'moraes') {
        queue.push({ type: 'moraes' });
      } else if (e.type === 'mileiScene') {
        intros.push({ type: 'milei' });
      } else if (e.type === 'phase') {
        intros.push({ type: 'overworld', to: e.phase }, { type: 'intro', phase: e.phase });
        walk = null;
        placeParty(C.PHASES[e.phase].start);
        if (zoomed) requestAnimationFrame(() => centerOn(party[0].x, party[0].y));
        SFX.card();
      } else if (e.type === 'end') {
        (e.ending === 'won' ? SFX.won : SFX.lost)();
        if (e.ending === 'won') intros.push({ type: 'overworld', to: 5, final: true });
      } else if (SFX[e.type]) {
        SFX[e.type]();
      }
    }
    return intros;
  }

  function floatMoney(fx, now) {
    if (!party[0]) return;
    const items = [];
    if (fx.reais) items.push([`${fx.reais > 0 ? '+' : '−'}R$ ${fmt(Math.abs(fx.reais))} mil`, fx.reais > 0 ? '#9df29a' : '#ff8a8a']);
    if (fx.usd) items.push([`${fx.usd > 0 ? '+' : '−'}US$ ${fmt(Math.abs(fx.usd))} mil`, fx.usd > 0 ? '#9df29a' : '#ff8a8a']);
    items.forEach(([text, color], i) => effects.push({ type: 'float', text, color, x: party[0].x, y: party[0].y - 14 - i * 9, t0: now + i * 200, dur: 2200 }));
  }

  function refresh() {
    if (s.pending || s.ended) tpMode = false;
    updateHud();
    updateLabels();
    updateMission();
    updateActions();
    updateLog();
    if (s.ended && !queue.length) {
      hideModal();
      setTimeout(showEnd, walk ? 1200 : 400);
      return;
    }
    updateModal();
  }

  function play(id) {
    unlockAudio();
    Music.start();
    const first = id.startsWith('tp:') && s.stats.teleports === 0;
    const a = C.actions(s).find(x => x.id === id);
    const art = s.pending && s.pending.type === 'roll' ? pendingArt : artFor(a);
    C.act(s, id);
    if (id.startsWith('tp:')) tpMode = false;
    const now = performance.now();
    const intros = handleEvents(now);
    if (s.pending && s.pending.type === 'roll') pendingArt = art;
    if (s.result && !id.startsWith('detour:')) {
      queue.push({ type: 'result', modal: resultModal({ ...s.result, art }, s.events) });
      floatMoney(s.result.fx, now);
    }
    queue.push(...intros);
    if (id === 'call:queiroz') toast(C.CONTACTS.queiroz.fact);
    if (id === 'visit') toast(C.FACTS.pai);
    if (first) toast(C.FACTS.teleport);
    refresh();
  }

  function start(seed, level = 'dificil') {
    unlockAudio();
    Music.start();
    s = C.newGame(seed, level);
    queue = [];
    walk = null;
    effects = [];
    tpMode = false;
    shownReais = shownUsd = null;
    queue.push(...handleEvents(performance.now()));
    $('title').classList.add('hidden');
    $('end').classList.add('hidden');
    $('game').classList.remove('hidden');
    refresh();
  }

  /* ---------- 2.0: mapa-múndi no estilo dos jogos de plataforma 16 bits ----------
     Entre as fases o pangaré anda por um caminho pontilhado (Brasília → Miami). Algumas
     etapas têm uma casinha bônus no meio: o cavalo para e você escolhe visitar ou seguir. */
  const OW = {
    // [x, y, nome, deslocamento do rótulo]
    nodes: [[198, 100, 'BRASILIA', 0, 12], [164, 140, 'FOZ', 22, 0], [146, 154, 'PONTE', 0, 12], [118, 138, 'IGUAZU', -26, 0], [64, 72, 'GUAYAQUIL', 0, 12], [134, 22, 'MIAMI', 0, 12]],
    huts: { 1: [184, 124], 3: [132, 154], 4: [86, 106] },
    hills: [[214, 80], [170, 92], [120, 120], [86, 92], [206, 132], [150, 168]],
    palms: [[226, 110], [186, 150], [70, 128], [100, 60], [150, 26], [112, 14]],
  };
  const owCanvas = $('owArt'), og = owCanvas.getContext('2d');
  const OWW = 320, OWH = 180;
  let owBg = null, owState = '', owSound = false;

  function owLand(pts, col) {
    const c = document.createElement('canvas');
    c.width = OWW; c.height = OWH;
    const g = c.getContext('2d');
    g.fillStyle = col;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    // Sem antisserrilhado: cada pixel é terra ou mar.
    const d = g.getImageData(0, 0, OWW, OWH);
    for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 110 ? 255 : 0;
    g.putImageData(d, 0, 0);
    return c;
  }
  function owBase() {
    if (owBg) return owBg;
    const c = document.createElement('canvas');
    c.width = OWW; c.height = OWH;
    const g = c.getContext('2d');
    g.fillStyle = '#2b5fb8'; g.fillRect(0, 0, OWW, OWH);
    g.fillStyle = '#4a86dc';
    for (let y = 3; y < OWH; y += 7) for (let x = ((y / 7) % 2) * 7; x < OWW; x += 14) g.fillRect(x, y, 4, 1);
    const SA = [[70, 52], [100, 40], [140, 42], [176, 52], [214, 70], [246, 90], [242, 108], [224, 126], [206, 146], [180, 160], [158, 172], [140, 179], [128, 170], [122, 152], [110, 136], [88, 118], [64, 98], [48, 78]];
    const NA = [[90, 4], [152, 2], [170, 14], [150, 30], [128, 34], [112, 46], [96, 40], [84, 22]];
    const shrink = (pts, k) => {
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
    };
    for (const pts of [SA, NA]) {
      const edge = owLand(pts, '#1a1423');
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) g.drawImage(edge, dx, dy);
      g.drawImage(owLand(pts, '#f2d98a'), 0, 0);
      g.drawImage(owLand(shrink(pts, 0.93), '#3fa34d'), 0, 0);
    }
    // Xadrez de grama escura, como nos mapas de mundo.
    const d = g.getImageData(0, 0, OWW, OWH);
    for (let y = 0; y < OWH; y++) for (let x = 0; x < OWW; x++) {
      const i = (y * OWW + x) * 4;
      if (d.data[i] === 0x3f && d.data[i + 1] === 0xa3 && ((x >> 2) + (y >> 2)) % 2 === 0) { d.data[i] = 0x35; d.data[i + 1] = 0x92; d.data[i + 2] = 0x42; }
    }
    g.putImageData(d, 0, 0);
    // Morros com olhinhos e palmeiras.
    for (const [x, y] of OW.hills) {
      g.fillStyle = '#1a1423'; g.beginPath(); g.ellipse(x, y, 9, 8, 0, Math.PI, 0); g.fill();
      g.fillStyle = '#5ccf6a'; g.beginPath(); g.ellipse(x, y, 8, 7, 0, Math.PI, 0); g.fill();
      g.fillStyle = '#1a1423'; g.fillRect(x - 3, y - 5, 1, 2); g.fillRect(x + 2, y - 5, 1, 2);
    }
    for (const [x, y] of OW.palms) {
      g.fillStyle = '#7a4f2e'; g.fillRect(x, y - 6, 1, 6);
      g.fillStyle = '#1d6b2d'; g.fillRect(x - 3, y - 7, 7, 1); g.fillRect(x - 2, y - 8, 5, 1); g.fillRect(x - 4, y - 6, 2, 1); g.fillRect(x + 3, y - 6, 2, 1);
    }
    // Caminho pontilhado ligando todas as fases (passando pelas casinhas).
    const route = [];
    OW.nodes.forEach((n, i) => { if (OW.huts[i]) route.push(OW.huts[i]); route.push(n); });
    for (let i = 1; i < route.length; i++) {
      const [ax, ay] = route[i - 1], [bx, by] = route[i];
      const len = Math.hypot(bx - ax, by - ay), n = Math.floor(len / 5);
      for (let k = 1; k < n; k++) {
        const x = Math.round(ax + (bx - ax) * k / n), y = Math.round(ay + (by - ay) * k / n);
        g.fillStyle = '#1a1423'; g.fillRect(x - 1, y - 1, 3, 3);
        g.fillStyle = '#fff3c4'; g.fillRect(x, y, 1, 1);
      }
    }
    owBg = c;
    return c;
  }

  const owLerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // Onde está o viajante e em que etapa está a animação: 'moving' | 'choose' | 'done'.
  function owWhere(q, now) {
    const to = q.to, end = OW.nodes[to];
    if (q.view || to === 0) return { pos: end, stage: 'done' };
    const start = OW.nodes[to - 1], hut = OW.huts[to];
    if (!q.t0) q.t0 = now;
    if (hut && !s.detours[to] && !q.final) {
      const t = Math.min(1, (now - q.t0) / 1300);
      return { pos: owLerp(start, hut, t), stage: t < 1 ? 'moving' : (s.pending && s.pending.type === 'detour' ? 'choose' : 'moving') };
    }
    if (hut && !q.final) {
      if (!q.t1) q.t1 = now;
      const t = Math.min(1, (now - q.t1) / 1300);
      return { pos: owLerp(hut, end, t), stage: t < 1 ? 'moving' : 'done' };
    }
    const t = Math.min(1, (now - q.t0) / 1800);
    return { pos: owLerp(start, end, t), stage: t < 1 ? 'moving' : 'done' };
  }

  function owLabel(text, x, y, color) {
    og.save();
    og.setTransform(1, 0, 0, 1, 0, 0);
    og.font = '14px "Press Start 2P", monospace';
    og.textAlign = 'center'; og.textBaseline = 'middle';
    const w = og.measureText(text).width + 10;
    const X = Math.max(w / 2 + 2, Math.min(OWW * 2 - w / 2 - 2, x * 2));
    og.fillStyle = 'rgba(18,14,28,.85)'; og.fillRect(Math.round(X - w / 2), Math.round(y * 2 - 12), Math.round(w), 24);
    og.fillStyle = color;
    og.fillText(text, Math.round(X), Math.round(y * 2));
    og.restore();
  }
  function owSprite(name, x, y, o = {}) {
    const img = sprite(name, o.frame || 0), k = img.k || 1;
    const w = img.width / k, h = img.height / k;
    og.save();
    og.globalAlpha = o.alpha == null ? 1 : o.alpha;
    const dx = Math.round(x - w / 2), dy = Math.round(y - h);
    if (o.flip) { og.translate(dx + w, dy); og.scale(-1, 1); og.drawImage(img, 0, 0, w, h); }
    else og.drawImage(img, dx, dy, w, h);
    og.restore();
  }

  function owRender(now) {
    const q = queue[0];
    if (!q || q.type !== 'overworld' || !s) return;
    og.setTransform(2, 0, 0, 2, 0, 0);
    og.imageSmoothingEnabled = false;
    og.drawImage(owBase(), 0, 0);
    const at = owWhere(q, now);
    const reached = q.view ? s.phase : q.to;
    const blink = Math.floor(now / 350) % 2;
    // Casinhas bônus: vermelha = ainda não, verde = visitada, cinza = passou direto.
    for (const [spot, [x, y]] of Object.entries(OW.huts)) {
      const d = s.detours[spot];
      const roof = d === 'visit' ? '#2f9e44' : d === 'skip' ? '#6b6f7a' : '#d6303c';
      og.fillStyle = '#1a1423'; og.fillRect(x - 6, y - 5, 13, 7); og.fillRect(x - 5, y - 9, 11, 5);
      og.fillStyle = '#f4f1e8'; og.fillRect(x - 5, y - 4, 11, 5);
      og.fillStyle = roof; og.fillRect(x - 4, y - 8, 9, 4); og.fillRect(x - 6, y - 5, 13, 1);
      og.fillStyle = '#7a4f2e'; og.fillRect(x - 1, y - 2, 3, 3);
      if (d) owLabel(d === 'visit' ? '✓' : '×', x, y - 14, d === 'visit' ? '#5dfc8a' : '#b9bcc4');
    }
    // Fases: círculo dourado = pela frente, bandeira = já passou, Miami = castelo.
    OW.nodes.forEach(([x, y, name, lx, ly], i) => {
      const done = i < reached, here = i === reached;
      if (i === 5) {
        og.fillStyle = '#1a1423'; og.fillRect(x - 8, y - 12, 17, 14);
        og.fillStyle = '#f7cf3d'; og.fillRect(x - 7, y - 11, 15, 12);
        og.fillStyle = '#1a1423'; for (let k = -7; k <= 7; k += 4) og.fillRect(x + k, y - 13, 2, 2);
        og.fillRect(x - 1, y - 5, 3, 6);
      } else {
        og.fillStyle = '#1a1423'; og.beginPath(); og.arc(x, y, 6, 0, Math.PI * 2); og.fill();
        og.fillStyle = done ? '#4a6fb5' : here && blink ? '#ffffff' : '#f7cf3d';
        og.beginPath(); og.arc(x, y, 5, 0, Math.PI * 2); og.fill();
        if (done) {
          og.fillStyle = '#1a1423'; og.fillRect(x, y - 15, 1, 12);
          og.fillStyle = '#d6303c'; og.fillRect(x + 1, y - 15, 6, 4);
        }
      }
      owLabel(name, x + lx, y + ly, done ? '#9fd3ff' : '#f7cf3d');
    });
    // O viajante: pangaré nas fases de estrada, jatinho nos voos.
    const [x, y] = at.pos;
    const bob = at.stage === 'moving' ? Math.floor(now / 120) % 2 : 0;
    const flying = q.to >= 4 || (q.view && s.phase >= 4);
    const prev = q.to > 0 ? OW.nodes[q.to - 1] : OW.nodes[0];
    const flip = x < prev[0] || (q.view || q.to === 0);
    if (flying) owSprite('jato', x, y + 2 - bob, { flip });
    else {
      og.fillStyle = 'rgba(0,0,0,.3)'; og.fillRect(Math.round(x - 7), Math.round(y), 14, 2);
      owSprite('cavalo', x, y + 1 - bob, { flip });
      owSprite('senador', x + (flip ? 3 : -3), y - 6 - bob, { flip });
    }
    // O Fantasma do Comunismo persegue a família pelo mapa (mais visível com Paranoia alta).
    owSprite('fantasma', x + 22 + Math.sin(now / 500) * 6, y - 14 + Math.sin(now / 300) * 3, { alpha: 0.35 + s.paranoia / 200 });
    // Nuvens.
    og.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 3; i++) {
      const cx = ((now / (90 + i * 30) + i * 120) % (OWW + 60)) - 30, cy = 30 + i * 52;
      og.fillRect(Math.round(cx), cy, 18, 4); og.fillRect(Math.round(cx) + 4, cy - 3, 9, 3);
    }
    if (at.stage === 'moving' && !owSound) { owSound = true; SFX.travel(); }
    if (at.stage !== 'moving') owSound = false;
    if (at.stage !== owState) owUpdate();
  }

  // Textos e botões do mapa-múndi; refeitos só quando a etapa muda.
  function owUpdate(force) {
    const q = queue[0];
    if (!q || q.type !== 'overworld') return;
    const at = owWhere(q, performance.now());
    if (!force && at.stage === owState) return;
    owState = at.stage;
    const ph = C.PHASES[Math.min(q.to, 4)];
    const d = C.DETOURS[q.to];
    $('owTag').textContent = q.final ? 'MAPA DA FUGA · ÚLTIMO VOO' : `MAPA DA FUGA · ${q.view ? 'ONDE ESTAMOS' : `FASE ${q.to + 1} DE 5`}`;
    $('owStats').textContent = `🕒 ${C.clock(s.hours)} · R$ ${fmt(s.reais)} mil · US$ ${fmt(s.usd)} mil · Cerco ${Math.round(s.cerco)} · Paranoia ${Math.round(s.paranoia)}`;
    const box = $('owChoices');
    box.textContent = '';
    if (at.stage === 'choose') {
      $('owTitle').textContent = d.name;
      $('owText').textContent = d.text;
      for (const a of C.actions(s)) box.appendChild(button({ ...a, detail: '' }, () => play(a.id), a.id === 'detour:visit' ? 'suggested' : ''));
      return;
    }
    const note = d && s.detours[q.to] ? (s.log.find(l => l.text.includes(d.name)) || {}).text : '';
    $('owTitle').textContent = q.final ? 'RUMO A MIAMI!' : q.to === 0 ? 'A FUGA COMEÇA EM BRASÍLIA' : `PRÓXIMA PARADA: ${ph.name.toUpperCase()}`;
    $('owText').textContent = note || (q.final ? 'O Gulfstream cruza o Caribe. Lá embaixo, um helicóptero de TV já espera.'
      : q.view ? `Fase ${s.phase + 1} de 5: ${ph.name}. Bandeira vermelha = fase vencida; casinha = parada bônus no caminho.`
      : `${ph.subtitle}. Bandeira vermelha = fase vencida; casinha no caminho = parada bônus.`);
    if (at.stage === 'moving') {
      box.appendChild(button({ label: '▶▶ Pular a caminhada' }, () => { q.t0 = q.t1 = 1; owUpdate(true); }));
      return;
    }
    const label = q.final ? 'VER O POUSO EM MIAMI' : q.view ? 'VOLTAR À FUGA' : `ENTRAR NA FASE: ${ph.name.toUpperCase()}`;
    box.appendChild(button({ label }, () => { queue.shift(); owState = ''; refresh(); }, 'ok'));
  }

  /* ---------- final ---------- */
  const END_TITLES = { won: 'MIAMI!', caught: 'CAPTURADO', late: 'TEMPO ESGOTADO', quit: 'FICOU' };
  const endCanvas = $('endArt'), eg = endCanvas.getContext('2d');
  const EW = 320, EH = 180;
  endCanvas.width = EW * 2; endCanvas.height = EH * 2;

  function eput(name, x, y, o = {}) {
    const img = sprite(name, o.frame || 0);
    const k = (o.k || 1) / (img.k || 1);
    const w = img.width * k, h = img.height * k;
    eg.save();
    eg.globalAlpha = o.alpha == null ? 1 : o.alpha;
    const dx = Math.round(x - w / 2), dy = Math.round(y - h);
    if (o.flip) { eg.translate(dx + w, dy); eg.scale(-1, 1); eg.drawImage(img, 0, 0, w, h); }
    else eg.drawImage(img, dx, dy, w, h);
    eg.restore();
  }
  const er = (x, y, w, h, col) => { eg.fillStyle = col; eg.fillRect(Math.round(x), Math.round(y), w, h); };

  function endScene(now) {
    if (!s || !s.ended) return;
    eg.setTransform(2, 0, 0, 2, 0, 0);
    eg.imageSmoothingEnabled = false;
    const type = s.ended.type;
    eg.font = '8px "Press Start 2P", monospace'; eg.textBaseline = 'top';
    if (type === 'won') {
      const sky = ['#2b1d52', '#5a2a6e', '#a63d74', '#e0646a', '#f5a05a', '#f7cf6a'];
      sky.forEach((c, i) => er(0, i * 14, EW, 14, c));
      M.blob(eg, 250, 82, 14, '#ffe08a');
      const towers = [[8, 30, '#f2a6c4'], [26, 44, '#8fd3e8'], [44, 26, '#f7e1a0'], [60, 52, '#b9a6f2'], [80, 34, '#9fe0c0'], [98, 60, '#f2c0a6'], [120, 40, '#8fd3e8'], [138, 28, '#f2a6c4'], [196, 48, '#b9a6f2'], [214, 36, '#f7e1a0'], [232, 58, '#9fe0c0'], [252, 30, '#f2a6c4'], [270, 46, '#8fd3e8'], [292, 38, '#f2c0a6']];
      for (const [x, h, c] of towers) {
        er(x, 92 - h, 16, h, c);
        for (let y = 92 - h + 4; y < 90; y += 5) for (let i = 2; i < 14; i += 4) er(x + i, y, 2, 2, (i + y) % 3 ? '#4a5a7a' : '#ffe28a');
      }
      er(0, 92, EW, 26, '#2a8fbd');
      for (let i = 0; i < 18; i++) er((i * 37 + now / 40) % EW, 96 + (i % 4) * 5, 10, 1, '#7fd0f0');
      er(0, 118, EW, 62, '#f2d49b');
      for (let i = 0; i < 60; i++) er(M.hash(i, 1, 3) * EW, 120 + M.hash(i, 2, 3) * 58, 1, 1, '#d9b77a');
      for (const px of [20, 296]) {
        for (let i = 0; i < 40; i++) er(px + Math.sin(i / 10) * 3, 160 - i, 3, 1, '#8a6a3a');
        for (const [dx, dy] of [[-16, 6], [16, 6], [-12, -4], [12, -4], [0, -8]]) {
          for (let k = 0; k < 10; k++) er(px + 1 + dx * k / 10, 120 + dy * k / 10 + (k * k) / 20, 2, 2, '#2f9e44');
        }
      }
      const fx = 160, fy = 158;
      const bob = Math.floor(now / 400) % 2;
      eput('cavalo', fx - 70, fy, { k: 2 });
      eput('senador', fx, fy, { k: 2, frame: bob });
      eput('oculos', fx, fy - 18, { k: 2 });
      eput('esposa', fx - 30, fy, { k: 2 });
      eput('oculos', fx - 30, fy - 18, { k: 2 });
      eput('filha', fx + 28, fy, { k: 2 });
      eput('filha2', fx + 50, fy, { k: 2 });
      for (let i = 0; i < 3; i++) eput('mala', fx + 74 + i * 12, fy, { k: 1 });
      eput('fantasma', fx + 110, fy - 30 + Math.sin(now / 300) * 3, { k: 2, alpha: 0.85 });
      eput('oculos', fx + 110, fy - 50 + Math.sin(now / 300) * 3, { k: 2 });
      const hx = 70 + Math.sin(now / 900) * 10, hy = 26 + Math.sin(now / 500) * 3;
      eg.fillStyle = 'rgba(255, 245, 190, 0.28)';
      eg.beginPath(); eg.moveTo(hx + 4, hy + 6); eg.lineTo(fx - 26, fy + 4); eg.lineTo(fx + 30, fy + 4); eg.closePath(); eg.fill();
      eput('heli', hx, hy + 11, { k: 2 });
      er(hx - 20 + (Math.floor(now / 50) % 2) * 8, hy - 11, 40, 2, '#1a1423');
      er(6, 6, 52, 13, '#d6303c');
      if (Math.floor(now / 500) % 2) M.blob(eg, 13, 12, 3, '#ffffff');
      eg.fillStyle = '#ffffff';
      eg.fillText('AO VIVO', 19, 8);
      er(0, 166, EW, 14, '#1a1423');
      er(0, 166, 70, 14, '#d6303c');
      eg.fillStyle = '#ffffff'; eg.fillText('URGENTE', 6, 169);
      eg.fillStyle = '#f7cf3d';
      // A fonte pixelada não tem maiúsculas acentuadas: a tarja vai sem acento, como num gerador de caracteres antigo.
      const msg = 'FAMILIA DESEMBARCA EM MIAMI E E FILMADA DA PRAIA * O PANGARE SOLUCA NA AREIA * FANTASMA DO COMUNISMO TAMBEM GANHA VISTO * ';
      const off = (now / 25) % (msg.length * 8);
      eg.save(); eg.beginPath(); eg.rect(72, 166, EW - 72, 14); eg.clip();
      eg.fillText(msg + msg, 74 - off, 169);
      eg.restore();
      return;
    }
    er(0, 0, EW, EH, '#141030');
    for (let i = 0; i < 40; i++) er(M.hash(i, 4, 1) * EW, M.hash(i, 5, 1) * 90, 1, 1, '#c9c3ff');
    er(0, 120, EW, 60, '#2b2b33');
    for (let x = 0; x < EW; x += 24) er(x, 148, 12, 2, '#f7cf3d');
    const fx = 150, fy = 140;
    eput('senador', fx, fy, { k: 2 });
    eput('esposa', fx - 26, fy, { k: 2 });
    eput('filha', fx + 24, fy, { k: 2 });
    eput('filha2', fx + 42, fy, { k: 2 });
    if (type === 'caught' || type === 'late') {
      const blink = Math.floor(now / 250) % 2;
      er(210, 100, 70, 26, '#f4f1e8'); er(210, 112, 70, 4, '#24345e');
      er(226, 94, 20, 6, blink ? '#d6303c' : '#4a6fb5'); er(246, 94, 20, 6, blink ? '#4a6fb5' : '#d6303c');
      eg.fillStyle = '#24345e'; eg.fillText('PF', 238, 103);
      M.blob(eg, 220, 128, 5, '#1a1423'); M.blob(eg, 270, 128, 5, '#1a1423');
      eput('policial', 196, fy, { k: 2, flip: true });
      eput('policial', 110, fy, { k: 2 });
      // Na TV da esquina, Amores levanta uma sobrancelha.
      er(28, 40, 58, 46, '#1a1423'); er(31, 43, 52, 36, '#4a6fb5');
      eput('moraes', 57, 79, { k: 1.5 });
      er(52, 86, 10, 6, '#1a1423');
      eg.globalAlpha = blink ? 0.12 : 0.05; er(0, 0, EW, EH, blink ? '#d6303c' : '#4a6fb5'); eg.globalAlpha = 1;
    } else {
      er(40, 60, 70, 60, '#c9c3b5'); er(48, 70, 12, 12, '#ffe28a'); er(84, 70, 12, 12, '#ffe28a'); er(66, 96, 14, 24, '#6e4528');
      for (let i = 0; i < 3; i++) eput('mala', 196 + i * 12, fy, { k: 1 });
    }
  }

  function showEnd() {
    if (!s || !s.ended || !$('end').classList.contains('hidden')) return;
    const e = s.ended;
    $('game').classList.add('hidden');
    $('end').classList.remove('hidden');
    $('endTitle').textContent = END_TITLES[e.type];
    $('endStars').textContent = e.type === 'won' ? '★'.repeat(e.stars) + '☆'.repeat(3 - e.stars) : '';
    $('endText').textContent = e.text;
    const stats = [
      `Tempo de fuga: ${Math.round(s.hours)}h (${C.clock(s.hours)})`,
      `Dinheiro no bolso: R$ ${fmt(s.reais)} mil + US$ ${fmt(s.usd)} mil`,
      `Deixado para trás: R$ ${fmt(s.lost)} mil · "guardado" por Micheki: R$ ${fmt(s.stolen)} mil`,
      `Dificuldade: ${C.LEVELS[s.level].name}`,
      `Dados: ${s.stats.rolls} rolados, ${s.stats.fails} falhas, ${s.stats.rigged} "não auditados"`,
      `Ataques do Fantasma: ${s.stats.attacks} · força final ${s.ghostPower}`,
      `Contatos: ${s.stats.calls} · fake news: ${s.stats.fakeNews} · teletransportes: ${s.stats.teleports}`,
      `Rastro deixado: ${s.trail.length} trechos`,
      `Plantão nº ${s.seed}`,
    ];
    const ul = $('endStats');
    ul.textContent = '';
    for (const t of stats) { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }
  }

  function titleArt() {
    const c = $('titleArt'), g = c.getContext('2d');
    c.width = 320; c.height = 144;
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#1f1830';
    g.fillRect(0, 0, 160, 72);
    M.diamond(g, 80, 40, '#5aa548');
    for (let i = 0; i < 6; i++) M.diamond(g, 32 + i * 16, 48 + (i % 2) * 8, i % 2 ? '#4c9140' : '#6fbb5b');
    const put2 = (name, x, y, a = 1, flip = false) => {
      const img = sprite(name), w = img.width / img.k, h = img.height / img.k;
      g.save(); g.globalAlpha = a;
      if (flip) { g.translate(x + w, y); g.scale(-1, 1); g.drawImage(img, 0, 0, w, h); } else g.drawImage(img, x, y, w, h);
      g.restore();
    };
    put2('fantasmaFlavio', 4, 26, 0.95);
    put2('cavalo', 30, 49);
    put2('senador', 33, 36);
    put2('esposa', 58, 47);
    put2('filha', 74, 50);
    put2('filha2', 88, 50);
    put2('mala', 104, 56);
    put2('policial', 136, 46, 1, true);
    put2('fantasma', 120, 8, 0.85);
    put2('mamadeira', 112, 10);
  }

  /* ---------- início ---------- */
  /* Menu de dificuldade: cada nível tem um personagem que dá o recado. */
  const SAY = {
    facil: { art: ['senador', 'mala', 'cedula'], who: () => C.NAMES.senador, line: '"SEMPRE TRABALHEI DURO."' },
    medio: { art: ['pai'], bars: true, who: () => C.NAMES.pai + ', em prisão domiciliar', line: '"VOCE E DA FAMILIA... TUDO DE MAO BEIJADA, TALQUEI!" (HIC!)' },
    dificil: { art: ['moraes'], who: () => C.NAMES.moraes, line: '"SEM IMUNIDADE."' },
  };
  let level = 'dificil';
  function drawSay(o) {
    const c = $('sayArt'), g = c.getContext('2d');
    g.fillStyle = '#0b0812'; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = false;
    const imgs = o.art.map(n => sprite(n));
    const k = 3, total = imgs.reduce((w, im) => w + im.width / (im.k || 1) * k + 10, -10);
    let x = Math.round((c.width - total) / 2);
    for (const im of imgs) {
      const w = im.width / (im.k || 1) * k, h = im.height / (im.k || 1) * k;
      g.drawImage(im, x, c.height - h - 6, w, h);
      if (o.bars) {
        g.fillStyle = '#4a4a52';
        for (let i = -6; i <= w + 6; i += 9) g.fillRect(x + i, c.height - h - 14, 3, h + 14);
        g.fillRect(x - 8, c.height - h - 14, w + 18, 3);
      }
      x += w + 10;
    }
  }
  function pickLevel(id) {
    level = id;
    const o = SAY[id];
    $('levelPick').classList.add('hidden');
    $('levelSay').classList.remove('hidden');
    $('sayWho').textContent = o.who();
    $('sayLine').textContent = o.line;
    drawSay(o);
    unlockAudio();
    SFX.card();
  }
  $('startBtn').addEventListener('click', () => {
    unlockAudio();
    $('startBtn').classList.add('hidden');
    $('levelPick').classList.remove('hidden');
  });
  for (const b of document.querySelectorAll('button.level')) b.addEventListener('click', () => pickLevel(b.dataset.level));
  $('backBtn').addEventListener('click', () => {
    $('levelSay').classList.add('hidden');
    $('levelPick').classList.remove('hidden');
  });
  $('goBtn').addEventListener('click', () => {
    const v = parseInt($('seedInput').value, 10);
    start(Number.isFinite(v) && v > 0 ? v : 1 + Math.floor(Math.random() * 999999), level);
  });
  /* ---------- primeira vez de cada botão: explica e pede confirmação ---------- */
  const EXPLAIN = {
    go: 'Anda pela estrada até este lugar. Estrada vermelha tem blitz: passar por ela pede o dado.',
    take: 'Pega o dinheiro vivo escondido aqui. Cada R$ 100 mil ocupa uma mala do veículo.',
    call: 'Liga para um contato. Se ele topar, passa a ajudar na fuga.',
    send: 'Manda o ex-assessor buscar um esconderijo longe; o dinheiro chega na fazenda, sem ocupar o carro.',
    exit: 'Sai desta fase rumo à próxima. Malas que não cabem ficam para trás.',
    exchange: 'Troca reais por dólares: dólar ocupa 4× menos malas.', hide: 'Fica escondido para o Cerco esfriar.',
    rest: 'Descansa para baixar a Paranoia.', visit: 'Visita o Pai. Alguém aproveita para levar as joias.',
    brother: 'Pede ajuda ao irmão caçula. Pode distrair a imprensa... ou piorar tudo.',
    coach: 'Ouve o coach. Baixa a Paranoia, mas ele faz live com você ao fundo.',
    vorcaro: 'Pede dinheiro ao "irmão". Ele sempre manda só a metade.', milei: 'Pede ajuda ao presidente da motosserra.',
    fuel: 'Abastece o jato. Sem combustível, não decola.', fake: 'Espalha uma fake news para despistar a PF.',
    wait: 'Deixa o tempo passar. O Cerco continua subindo.', quit: 'Desiste da fuga e encerra a partida.',
  };
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem('efb.seen') || '{}') || {}; } catch (e) { seen = {}; }
  const seenKey = a => (a.kind === 'call' || a.kind === 'exit' ? a.id : a.kind);
  function remember(key) {
    seen[key] = 1;
    try { localStorage.setItem('efb.seen', JSON.stringify(seen)); } catch (e) { /* sem armazenamento */ }
  }
  function explainFirst(key, info, run) {
    if (seen[key]) { run(); return; }
    showModal({
      tag: '❓ PRIMEIRA VEZ', title: info.title, text: info.text, art: info.art, fx: info.cost ? chips(info.cost) : null,
      fact: 'Depois desta vez o botão age direto. Para rever o que ele faz, use o TUTORIAL.',
      choices: [
        { label: 'CONFIRMAR', cls: 'ok', onClick: () => { remember(key); hideModal(); run(); } },
        { label: 'Cancelar', onClick: () => refresh() },
      ],
    });
  }
  function use(a) {
    if (!a) return;
    explainFirst(seenKey(a), { title: a.label, text: [EXPLAIN[a.kind], a.detail].filter(Boolean).join(' '), art: artFor(a), cost: a.cost }, () => play(a.id));
  }

  $('pFake').addEventListener('click', () => use(C.actions(s).find(a => a.id === 'fake')));
  $('pTp').addEventListener('click', () => {
    if (tpMode) { tpMode = false; refresh(); return; }
    explainFirst('tp', {
      title: 'Teletransporte do Funcionário Fantasma',
      text: 'Escolha qualquer lugar da fase (fica verde) e vá na hora: sem tempo, sem rastro, sem blitz, sem dado. As cargas são poucas.',
      art: ['fantasmaFlavio', 'cedula'], cost: { h: 0 },
    }, () => { tpMode = true; refresh(); });
  });

  /* ---------- tutorial ---------- */
  const TUTORIAL = [
    ['O OBJETIVO', 'Levar a família de Brasília até Miami em 5 fases, com o máximo de dinheiro vivo, antes que o <b>Cerco</b> chegue a 100 ou o tempo acabe (quinta, meia-noite).'],
    ['CERCO E PARANOIA', '<b>Cerco</b> é o quanto a PF está perto: sobe com o tempo, com blitz e com erros. <b>Paranoia</b> é o Fantasma do Comunismo na sua cabeça: com ela alta surgem ameaças falsas e o Fantasma ataca mais.'],
    ['DINHEIRO E MALAS', 'Dinheiro vivo ocupa malas. Cada veículo leva um número de malas; o que não cabe fica para trás. Dólar ocupa menos espaço.'],
    ['O DADO', 'Ações arriscadas rolam 1d20 contra uma <b>CD</b> (a etiqueta 🎲). 20 sempre passa, 1 sempre falha. Falhar não trava o jogo: a ação acontece com um preço maior. Na falha, <b>"Esse dado não é auditado"</b> deixa escolher o número, mas a Paranoia sobe e o Fantasma ganha força.'],
    ['AS ETIQUETAS', 'Cada botão mostra o resumo: tempo (1h), dado (🎲 CD), blitz (🚓), Cerco, Paranoia, preço e ganho. 🔒 explica por que um botão está travado.'],
    ['♪ ON / OFF', 'Liga e desliga a música.'],
    ['? TUTORIAL', 'Abre esta ajuda.'],
    ['☰ MENU', 'Pausa e permite voltar à tela principal (a fuga em andamento é perdida).'],
    ['📱 FAKE NEWS', 'Canto esquerdo do mapa. Rola o dado: se der certo, o Cerco cai muito; também faz uma ameaça sumir na hora.'],
    ['👻 TELEPORTE', 'Canto direito do mapa. Escolha um lugar verde e vá na hora, sem tempo, rastro, blitz ou dado.'],
    ['🔍 ZOOM', 'Canto inferior do mapa. Deixa o mapa 2× maior; arraste com o dedo (ou o mouse) para olhar em volta. Na caminhada a câmera segue a família.'],
    ['O MAPA', 'Toque num lugar que pisca para andar até ele (dourado = estrada livre, vermelho = blitz). Toque numa pessoa para saber quem é.'],
    ['AQUI', 'Ações do lugar onde a família está. Aparecem quando ela chega.'],
    ['ANDAR', 'Os lugares vizinhos. Estrada vermelha tem blitz e pede dado.'],
    ['TELEFONE', 'Contatos que ajudam na fuga (escolta, ex-assessor, despachante, doleiro, piloto...).'],
    ['ESPERAR 72H', 'Brincadeira: são só 2 horas. O Cerco continua subindo.'],
    ['DESISTIR', 'Encerra a fuga: "fico para liderar a oposição".'],
    ['TRÁFICO DE INFLUÊNCIA', 'Toque para abrir as dicas da fase e o ★ PRÓXIMO PASSO, uma sugestão segura que você pode tocar direto.'],
    ['PRIMEIRA VEZ', 'Na primeira vez que você usa cada botão, o jogo explica o que ele faz e pede confirmação. Depois o botão age direto.'],
  ];
  $('tutorialBtn').addEventListener('click', () => {
    if (!s) return;
    const box = document.createElement('div');
    box.className = 'tutorial';
    for (const [h, p] of TUTORIAL) {
      const t = document.createElement('h5'); t.textContent = h;
      const d = document.createElement('p'); d.innerHTML = p;
      box.append(t, d);
    }
    const close = button({ label: 'ENTENDI, VOLTAR À FUGA' }, () => refresh(), 'ok');
    const reset = button({ label: 'Explicar os botões de novo na primeira vez' }, () => {
      seen = {};
      try { localStorage.removeItem('efb.seen'); } catch (e) { /* sem armazenamento */ }
      toast('Pronto: cada botão volta a se explicar no primeiro uso.');
    });
    box.append(close, reset);
    showModal({ tag: '? TUTORIAL', title: 'COMO FUGIR', text: 'Tudo o que cada parte da tela faz.', art: ['senador', 'cavalo', 'fantasma'], choices: [], extra: box });
  });

  /* ---------- zoom e arrasto do mapa ---------- */
  const scroller = $('scroller');
  let zoomed = window.innerWidth < 700, dragged = false;
  try { const z = localStorage.getItem('efb.zoom'); if (z != null) zoomed = z === '1'; } catch (e) { /* sem armazenamento */ }
  function centerOn(x, y) {
    const w = $('world');
    scroller.scrollLeft = (x / W) * w.clientWidth - scroller.clientWidth / 2;
    scroller.scrollTop = (y / H) * w.clientHeight - scroller.clientHeight / 2;
  }
  function setZoom(on) {
    zoomed = on;
    $('stage').classList.toggle('zoomed', on);
    $('zoomBtn').textContent = on ? '🔍 1×' : '🔍 2×';
    try { localStorage.setItem('efb.zoom', on ? '1' : '0'); } catch (e) { /* sem armazenamento */ }
    if (on && s && party[0]) requestAnimationFrame(() => centerOn(party[0].x, party[0].y));
  }
  $('zoomBtn').addEventListener('click', () => setZoom(!zoomed));
  // Toque arrasta com a rolagem nativa; o mouse arrasta por aqui.
  let drag = null;
  scroller.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || !zoomed) return;
    drag = { x: e.clientX, y: e.clientY, l: scroller.scrollLeft, t: scroller.scrollTop };
    dragged = false;
  });
  window.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) dragged = true;
    scroller.scrollLeft = drag.l - dx;
    scroller.scrollTop = drag.t - dy;
  });
  window.addEventListener('pointerup', () => { drag = null; });
  setZoom(zoomed);
  $('missionBtn').addEventListener('click', () => {
    missionOpen = !missionOpen;
    try { localStorage.setItem('efb.dicas', missionOpen ? '1' : '0'); } catch (e) { /* sem armazenamento */ }
    updateMission();
  });

  function goTitle() {
    hideModal();
    queue = [];
    $('overworld').classList.add('hidden');
    tpMode = false;
    $('game').classList.add('hidden');
    $('end').classList.add('hidden');
    $('title').classList.remove('hidden');
    $('startBtn').classList.remove('hidden');
    $('levelPick').classList.add('hidden');
    $('levelSay').classList.add('hidden');
    window.scrollTo(0, 0);
  }
  $('menuBtn').addEventListener('click', () => {
    if (!s) return;
    showModal({
      tag: 'MENU', title: 'PAUSA NA FUGA', text: 'O relógio só anda quando você age.', art: ['senador'],
      choices: [
        { label: 'CONTINUAR A FUGA', cls: 'ok', onClick: () => refresh() },
        { label: '🗺 Ver o mapa da fuga', onClick: () => { queue.unshift({ type: 'overworld', to: s.phase, view: true }); refresh(); } },
        { label: 'Voltar à tela principal', detail: 'A fuga em andamento será perdida.', onClick: goTitle },
      ],
    });
  });
  $('homeBtn').addEventListener('click', goTitle);
  $('quitBtn').addEventListener('click', () => {
    showModal({
      tag: '⚠ AVISO', title: 'FECHAR O JOGO?', text: 'O Fantasma do Comunismo continua solto lá fora. Tem certeza?', art: ['fantasma'],
      choices: [
        { label: 'SIM, FECHAR', cls: 'ok', onClick: () => {
          showModal({ tag: 'STF · DECISÃO FINAL', title: '"ACABOU."', text: `\u2014 ${C.NAMES.moraes}`, art: ['moraes'], choices: [] });
          SFX.lost();
          setTimeout(closeGame, 1800);
        } },
        { label: 'Não, voltar', onClick: hideModal },
      ],
    });
  });
  function closeGame() {
    if (window.EscapeAndroid) { window.EscapeAndroid.exit(); return; }
    window.close();
    // Navegadores só deixam fechar abas abertas por script; nas outras, fica o recado.
    setTimeout(() => {
      hideModal();
      $('title').innerHTML = '<h1>ACABOU.</h1><p class="pitch">Pode fechar esta aba. (Ou recarregue para fugir de novo.)</p>';
    }, 300);
  }
  $('version').textContent = `v${C.VERSION}`;

  $('againBtn').addEventListener('click', () => start(1 + Math.floor(Math.random() * 999999), s.level));
  $('replayBtn').addEventListener('click', () => start(s.seed, s.level));
  $('musicBtn').addEventListener('click', () => {
    unlockAudio();
    $('musicBtn').textContent = Music.toggle() ? '♪ ON' : '♪ OFF';
  });
  $('musicBtn').textContent = Music.on ? '♪ ON' : '♪ OFF';
  setInterval(() => { bubbleTick++; if (s && !$('game').classList.contains('hidden')) updateBubbles(); }, 3800);

  titleArt();
  requestAnimationFrame(loop);

  window.EscapeGame = { start, play, state: () => s, queue: () => queue, walking: () => !!walk };
})();
