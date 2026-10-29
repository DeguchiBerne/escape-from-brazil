const assert = require('assert');
const C = require('../core.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

// O bot é a própria sugestão do jogo: se ela vence, o destaque na interface leva o jogador a um final bom.
const botChoice = s => C.suggest(s);

// Resolve qualquer pendência do jeito mais "honesto" (sem dado não auditado).
function settle(s) {
  for (let i = 0; i < 20 && s.pending; i++) {
    const t = s.pending.type;
    C.act(s, t === 'card' ? 'opt:1' : t === 'roll' ? 'accept' : t === 'attack' ? 'duck' : t === 'detour' ? 'detour:skip' : 'dodge');
  }
}

function play(seed, chooser = botChoice, max = 600) {
  const s = C.newGame(seed);
  const ids = [];
  for (let i = 0; i < max && !s.ended; i++) {
    const id = chooser(s);
    ids.push(id);
    C.act(s, id);
    assert(s.cerco >= 0 && s.cerco <= 100, `cerco fora do intervalo: ${s.cerco}`);
    assert(s.paranoia >= 0 && s.paranoia <= 100, `paranoia fora do intervalo: ${s.paranoia}`);
    assert(s.reais >= 0 && s.usd >= 0, 'dinheiro negativo');
  }
  return { s, ids };
}

test('mesma seed e mesmas ações produzem a mesma partida', () => {
  const a = play(7), b = C.newGame(7);
  for (const id of a.ids) C.act(b, id);
  const strip = s => JSON.stringify({ ...s, events: [] });
  assert.strictEqual(strip(a.s), strip(b));
});

test('seeds diferentes embaralham o plantão de notícias', () => {
  const decks = new Set([1, 2, 3, 4, 5].map(seed => C.newGame(seed).deck.join(',')));
  assert(decks.size > 1);
});

test('o jogo ficou difícil: a sugestão segura vence entre 1/3 e 4/5', () => {
  let wins = 0;
  const endings = {};
  for (let seed = 1; seed <= 60; seed++) {
    const { s } = play(seed);
    assert(s.ended, `seed ${seed} não terminou`);
    endings[s.ended.type] = (endings[s.ended.type] || 0) + 1;
    if (s.ended.type === 'won') wins++;
  }
  console.log('   finais do bot:', JSON.stringify(endings));
  assert(wins >= 20, `bot venceu só ${wins}/60`);
  assert(wins <= 48, `fácil demais: ${wins}/60`);
});

test('o jogador aleatório sempre chega a um final válido', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rng = (() => { let x = seed * 7919; return () => (x = (x * 48271) % 2147483647) / 2147483647; })();
    const { s } = play(seed, st => {
      const list = C.actions(st).filter(a => !a.disabled && a.id !== 'quit');
      return list[Math.floor(rng() * list.length)].id;
    }, 3000);
    assert(s.ended, `seed ${seed} não terminou`);
    assert(['won', 'caught', 'late'].includes(s.ended.type));
  }
});

test('malas além da capacidade ficam para trás', () => {
  const s = C.newGame(1);
  s.reais = 450; // 5 malas, carro leva 2
  const lost = C.overflow(s, C.capacity(s));
  assert.deepStrictEqual(lost, { reais: 250, usd: 0 });
  C.act(s, 'go:loja');
  assert.strictEqual(s.reais, 200);
  assert.strictEqual(s.lost, 250);
});

test('dólares ocupam menos malas que reais', () => {
  const s = C.newGame(1);
  s.reais = 0; s.usd = 400;
  assert.strictEqual(C.bags(s), 1);
  s.reais = 400; s.usd = 0;
  assert.strictEqual(C.bags(s), 4);
});

test('Cerco em 100 termina em captura', () => {
  const s = C.newGame(3);
  s.cerco = 99;
  C.act(s, 'wait');
  assert.strictEqual(s.ended.type, 'caught');
  assert.deepStrictEqual(C.actions(s), []);
});

test('desistir leva ao final "fico para liderar a oposição"', () => {
  const s = C.newGame(3);
  C.act(s, 'quit');
  assert.strictEqual(s.ended.type, 'quit');
});

test('o piloto só aceita dólares e é obrigatório para sair de Iguazú', () => {
  const s = C.newGame(5);
  s.phase = 3; s.node = 'aeroporto'; s.reais = 900; s.usd = 0;
  assert(C.actions(s).find(a => a.kind === 'exit').disabled);
  assert(C.actions(s).find(a => a.id === 'call:piloto').disabled);
});

test('estrada com blitz pede dado com CD maior por policial; sem blitz, sem dado', () => {
  const s = C.newGame(2);
  s.patrols = s.patrols.map(() => 0);
  s.patrols[0] = 2;   // apto–loja
  const go = C.actions(s).find(a => a.id === 'go:loja');
  assert.strictEqual(go.cost.cops, 2);
  assert.strictEqual(go.cost.dc, 15);
  const free = C.actions(s).find(a => a.id === 'go:gabinete');
  assert.strictEqual(free.cost.dc, 0);
  C.act(s, 'go:loja');
  assert(s.roll, 'a blitz não rolou o dado');
});

test('falhar no dado vira pendência; "não auditado" escolhe o número e fortalece o Fantasma', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const s = C.newGame(seed);
    C.act(s, 'take');
    if (!s.pending || s.pending.type !== 'roll') continue;
    const choices = C.actions(s).map(a => a.id);
    assert(choices.includes('accept') && choices.includes('rig:20'));
    const p = s.paranoia, cerco = s.cerco;
    C.act(s, 'rig:20');
    assert.strictEqual(s.ghostPower, 1);
    assert(s.paranoia >= p + C.RIG_PARANOIA - 0.01);
    assert(s.roll.rigged && s.roll.ok);
    assert.strictEqual(s.cerco, cerco, 'o sucesso forçado não devia custar Cerco');
    assert.strictEqual(s.reais, 200);
    assert(s.result && s.result.fx.reais === 150, 'o resumo da ação devia mostrar +150');
    return;
  }
  assert.fail('nenhuma falha encontrada');
});

test('toda ação concluída gera um resumo com bônus e ônus', () => {
  const s = C.newGame(11);
  s.patrols = s.patrols.map(() => 0);
  C.act(s, 'wait');
  assert.strictEqual(s.result.title, 'ESPERAR 72H');
  assert.strictEqual(s.result.fx.hours, 2);
  assert(s.result.notes.length >= 1);
});

test('a visita ao pai: Micheki leva parte dos reais', () => {
  const s = C.newGame(9);
  s.node = 'pai'; s.reais = 500;
  C.act(s, 'visit');
  settle(s);
  assert(s.stolen >= 100, `Michelle levou só ${s.stolen}`);
  assert.strictEqual(s.reais + s.stolen, 500);
  assert(!C.actions(s).some(a => a.id === 'visit'));
});

test('o "irmão" Torcaro sempre manda só a metade, uma vez', () => {
  const s = C.newGame(4);
  const before = s.reais;
  C.act(s, 'vorcaro');
  settle(s);
  assert.strictEqual(s.reais, before + 200);
  assert(!C.actions(s).some(a => a.id === 'vorcaro'));
});

test('depois de Brasília a família anda no Dark Horse', () => {
  for (let p = 1; p <= 3; p++) assert(C.PHASES[p].vehicle.name.includes('Pangaré da Escuridão Soluçante'));
  assert.strictEqual(C.PHASES[0].vehicle.name, 'Carro da família');
});

test('o Fantasma ataca com mamadeira ou kit; o kit traz Charlitos com purpurina', () => {
  let kitHit = false, attacks = 0;
  for (let seed = 1; seed <= 500 && !kitHit; seed++) {
    const s = C.newGame(seed);
    s.ghostPower = 6;
    for (let i = 0; i < 6 && !s.ended; i++) {
      if (s.pending && s.pending.type === 'attack') {
        attacks++;
        const item = s.pending.item;
        C.act(s, 'duck');
        if (s.pending && s.pending.type === 'roll') {
          C.act(s, 'accept');
          if (item === 'kit') { assert(s.events.some(e => e.type === 'carlos')); kitHit = true; }
        }
      } else if (s.pending) settle(s);
      else C.act(s, 'wait');
    }
  }
  assert(attacks > 0 && kitHit, 'o Fantasma nunca acertou o kit');
});

test('ameaças falsas só aparecem com Paranoia acima de 50', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const s = C.newGame(seed);
    s.paranoia = 0; s.patrols = s.patrols.map(() => 0);
    C.act(s, 'go:loja');
    if (s.pending && s.pending.type === 'threat') assert(s.pending.real);
  }
  let fakes = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const s = C.newGame(seed);
    s.paranoia = 70; s.patrols = s.patrols.map(() => 0);
    C.act(s, 'go:loja');
    if (s.pending && s.pending.type === 'threat' && !s.pending.real) fakes++;
  }
  assert(fakes > 40, `poucas ameaças falsas: ${fakes}`);
});

test('Querijoz entrega o dinheiro na fazenda', () => {
  const s = C.newGame(2);
  C.act(s, 'call:queiroz'); settle(s);
  C.act(s, 'send:loja'); settle(s);
  assert.strictEqual(s.deliveries.length, 1);
  const amount = s.deliveries[0].amount, before = s.reais;
  s.node = 'saida';
  C.act(s, 'exit:0'); settle(s);
  assert.strictEqual(s.phase, 1);
  assert(s.reais >= before + amount - 1, 'entrega não chegou');
});

test('andar deixa rastro; o teletransporte não deixa rastro nem gasta tempo', () => {
  const s = C.newGame(4);
  s.patrols = s.patrols.map(() => 0);
  C.act(s, 'go:loja');
  settle(s);
  assert.strictEqual(s.trail.length, 1);
  const h = s.hours;
  C.act(s, 'tp:irmao');
  assert.strictEqual(s.node, 'irmao');
  assert.strictEqual(s.hours, h);
  assert.strictEqual(s.trail.length, 1);
  assert.strictEqual(s.teleports, 1);
  settle(s);
  C.act(s, 'tp:apto');
  settle(s);
  assert(!C.actions(s).some(a => a.kind === 'tp'), 'teletransporte além do limite');
});

test('toda fase tem missão e todo lugar tem casa única no mapa 10×10', () => {
  const s = C.newGame(1);
  C.PHASES.forEach((ph, p) => {
    s.phase = p; s.node = ph.start;
    assert(C.goals(s).length >= 2);
    const seen = new Set();
    for (const n of Object.values(ph.nodes)) {
      const [c, r] = n.at;
      assert(c >= 0 && r >= 0 && c < C.GRID && r < C.GRID, n.name);
      assert(!seen.has(c + ',' + r), 'casa repetida: ' + n.name);
      seen.add(c + ',' + r);
    }
  });
});

test('a sugestão é sempre uma ação válida', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = C.newGame(seed);
    for (let i = 0; i < 600 && !s.ended; i++) {
      const id = C.suggest(s);
      assert(C.actions(s).some(a => a.id === id && !a.disabled), 'sugestão inválida: ' + id);
      C.act(s, id);
    }
  }
});

test('o relógio começa na segunda 26/10 às 18h e vira o mês', () => {
  assert.strictEqual(C.clock(0), 'seg 26/10 18:00');
  assert.strictEqual(C.clock(17), 'ter 27/10 11:00');
  assert.strictEqual(C.clock(28.83), 'ter 27/10 22:50');
  assert.strictEqual(C.clock(126), 'dom 01/11 00:00');
});

test('três níveis: quanto mais fácil, mais a sugestão vence', () => {
  const wins = {};
  for (const lv of ['facil', 'medio', 'dificil']) {
    wins[lv] = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = C.newGame(seed, lv);
      assert.strictEqual(s.level, lv);
      for (let i = 0; i < 800 && !s.ended; i++) C.act(s, C.suggest(s));
      if (s.ended.type === 'won') wins[lv]++;
    }
  }
  console.log('   vitórias por nível:', JSON.stringify(wins));
  assert(wins.facil > wins.medio && wins.medio > wins.dificil);
  assert(wins.facil >= 48, 'o fácil devia ser fácil');
  assert.strictEqual(C.newGame(1, 'xyz').level, 'dificil');
});

test('na Argentina Miley aparece e diz que o pangaré é comida', () => {
  const s = C.newGame(6);
  s.phase = 2; s.node = 'ponte'; s.contacts.despachante = true; s.hours = 4;
  C.act(s, 'exit:0'); settle(s);
  assert.strictEqual(s.phase, 3);
  assert(s.log.some(l => l.text.includes(C.MILEI)));
  const a = C.actions(s).find(x => x.id === 'milei');
  assert(a && a.cost.dc === 9);
  C.act(s, 'milei'); settle(s);
  assert(s.log.some(l => l.text.includes('Esse Pangaré aqui é comida')));
  assert(!C.actions(s).some(x => x.id === 'milei'), 'Miley só uma vez');
});

test('nenhum nome real sobrou no texto visível do jogo', () => {
  const fs = require('fs'), path = require('path');
  const lines = ['core.js', 'game.js', 'index.html']
    .flatMap(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\n'))
    .filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l));
  for (const real of ['Queiroz', 'Michelle', 'Moraes', 'Marçal', 'Vorcaro', 'Carlos', 'Lula', 'Milei', 'Bolsonaro', 'Fabrício', 'Pablo', 'Alexandre', 'Daniel', 'Master']) {
    const hit = lines.find(l => l.includes(real));
    assert(!hit, `${real}: ${hit && hit.trim()}`);
  }
});

test('2.0: no mapa-múndi, casas-bônus entre as fases (visitar ou seguir)', () => {
  const s = C.newGame(3);
  s.node = 'saida';
  C.act(s, 'exit:0');
  if (s.pending && s.pending.type === 'roll') C.act(s, 'accept');
  assert.strictEqual(s.phase, 1);
  assert.deepStrictEqual(s.pending, { type: 'detour', spot: 1 });
  assert.deepStrictEqual(C.actions(s).map(a => a.id), ['detour:visit', 'detour:skip']);
  const h = s.hours, p = s.paranoia;
  C.act(s, 'detour:visit');
  assert.strictEqual(s.detours[1], 'visit');
  assert.strictEqual(s.hours, h + 1);
  assert(s.paranoia < p, 'a palestra devia baixar a Paranoia');
  assert(s.log.some(l => l.text.includes('Pablito Marco')));

  const t = C.newGame(3);
  t.phase = 3; t.node = 'aeroporto'; t.contacts.piloto = true;
  C.act(t, 'exit:0');
  assert.deepStrictEqual(t.pending, { type: 'detour', spot: 4 });
  const usd = t.usd;
  C.act(t, 'detour:skip');
  assert.strictEqual(t.usd, usd);
  assert.strictEqual(t.detours[4], 'skip');
  assert.deepStrictEqual(Object.keys(C.DETOURS), ['1', '3', '4']);
});

console.log(`\n${passed} testes passaram`);
