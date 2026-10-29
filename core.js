/* Escape from Brazil: The Phantom of Communism — motor do jogo.
   Módulo UMD sem dependências (EscapeCore no navegador, module.exports no Node).
   Toda aleatoriedade passa por s.rng: mesma seed + mesmas ações = mesma partida.
   Posições `at: [c, r]` são casas do mapa isométrico 10×10 desenhado por maps.js.

   Regra de RPG: ações arriscadas rolam 1d20 + modificador contra uma CD mostrada antes.
   20 natural sempre passa, 1 natural sempre falha. Falhar nunca trava o jogo: a ação
   acontece, mas com um preço maior. Na falha, o item "Esse dado não é auditado" deixa
   escolher o número; em troca a Paranoia sobe e o Fantasma do Comunismo ganha força. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EscapeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '1.1.0';  // única fonte da versão: o Android (build.gradle.kts) lê daqui
  const BAG = 100;          // R$ mil por mala de reais
  const USD_BAG = 400;      // R$ mil (equivalente) por mala de dólares
  const DEADLINE = 17;      // hora 0 = seg 26/10 18:00; prazo do STF = ter 27/10 11:00
  const LIMIT = 78;         // qui 29/10 24:00: o tempo acabou
  const GRID = 10;
  const RIG_PARANOIA = 12;  // preço de cada dado "não auditado"
  const DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const HORSE = 'Dark Horse, o Pangaré da Escuridão Soluçante';

  // Todos os nomes são fictícios: parecidos com figuras públicas, nunca iguais (paródia).
  const NAMES = {
    senador: 'Flaviano Bolsonero', esposa: 'Fernandete Bolsonero', filha: 'a filha mais velha', filha2: 'a filha caçula',
    pai: 'Jairzão Bolsonero, o Pai', irmao: 'Ronan Bolsonero, o caçula', carlos: 'Carlitos Bolsonero', michelle: 'Michaela Bolsonero',
    queiroz: 'Fabrizzio Queijoz', moraes: 'Alexandrino de Amores, o Xandão', marcal: 'Pablito Março', vorcaro: 'Danilo Torcaro',
    milei: 'Xavier Mileto', lula: 'Lulão da Selva', policial: 'Policial da blitz', fantasma: 'Fantasma do Comunismo',
    fantasmaFlavio: 'Funcionário Fantasma do Flaviano', cavalo: HORSE,
  };

  /* Três níveis. "Menos fácil" é o equilíbrio original (a sugestão ★ vence cerca de metade das vezes).
     bonus soma em todo d20; rate multiplica a subida do Cerco. */
  const LEVELS = {
    facil: { name: 'FÁCIL', reais: 100, cerco: 0, paranoia: 5, fakeNews: 3, lanterns: 2, teleports: 3, rate: 0.7, bonus: 3 },
    medio: { name: 'MEIO FÁCIL', reais: 50, cerco: 5, paranoia: 10, fakeNews: 2, lanterns: 2, teleports: 2, rate: 0.85, bonus: 1 },
    dificil: { name: 'MENOS FÁCIL', reais: 50, cerco: 10, paranoia: 15, fakeNews: 2, lanterns: 1, teleports: 2, rate: 1, bonus: 0 },
  };
  const MILEI = 'Esse Pangaré aqui é comida.';

  const CONTACTS = {
    queiroz: { name: 'Queijoz', phase: 0, cost: 0, hours: 1, dc: 6, art: 'queiroz',
      service: 'O ex-assessor busca o dinheiro vivo dos esconderijos e entrega na fazenda. Cobra 10% e às vezes fica com "a parte dele".',
      fact: 'Inspirado no caso das "rachadinhas", investigado pelo MP-RJ a partir de um relatório do Coaf (2018).' },
    capitao: { name: 'o Ex-Capitão', phase: 0, cost: 150, hours: 2, dc: 8, art: 'policial',
      service: 'Escolta e SUV blindada: leva 5 malas, +3 nos dados de estrada e sai de Brasília sem blitz.' },
    fazendeiro: { name: 'o Fazendeiro Amigo', phase: 1, cost: 80, hours: 1, dc: 8, art: 'queiroz',
      service: 'Libera a sede da fazenda como esconderijo: esperar lá reduz o Cerco.' },
    despachante: { name: 'o Despachante da Ponte', phase: 2, cost: 100, hours: 2, dc: 8, art: 'policial',
      service: 'Travessia sem conferência, mas só entre 20h e 4h.' },
    doleiro: { name: 'o Doleiro', phase: 3, cost: 0, hours: 1, dc: 8, art: 'vorcaro',
      service: 'Troca reais vivos por dólares com taxa de 10%. Dólar ocupa bem menos malas.' },
    piloto: { name: 'o Piloto Sem Plano de Voo', phase: 3, cost: 250, currency: 'usd', hours: 2, dc: 8, art: 'senador',
      service: 'Gulfstream fretado até Guayaquil. Só aceita dólares.' },
  };

  // Falas inventadas para a paródia. Não são citações reais.
  const COACH = [
    'Fugir não é fugir: é pivotar seu CPF para o mercado internacional!',
    'Quem tem mala cheia não tem medo de fronteira. Tem medo de escassez!',
    'Eu subi o Pico dos Marins de chinelo. Você atravessa uma ponte de cavalo!',
    'O Fantasma do Comunismo é só uma crença limitante, meu irmão!',
    'Faz o M: Mala, Montaria e Miami!',
    'Polícia é um feedback do universo. Agradece e acelera!',
    'Passaporte cancelado? Isso é um convite pra ser nômade digital!',
  ];
  const BROTHER = [
    'Pera, qual era a senha do meu Instagram?',
    'Vou fazer uma live explicando que você NÃO está na fazenda!',
    'Ô mano, tuitei sem querer. Foi sem querer!',
    'Fantasma do comunismo? Vou dar print.',
  ];
  const POEMS = [
    'Ó algoritmo da madrugada, tua vírgula é um mito que tuíta.',
    'Sou nuvem de print, choro em caixa alta, renasço em hashtag.',
    'A purpurina é a liberdade que o comunismo não viu chegar.',
    'No ventre do grupo da família, um emoji de bandeira floresce.',
    'Brilho, logo existo. Existo, logo bloqueio.',
  ];

  const PHASES = [
    {
      id: 'brasilia', name: 'Brasília', subtitle: 'A noite da derrota', start: 'apto',
      vehicle: { name: 'Carro da família', bags: 2 },
      fact: 'Fato: a PF pediu os passaportes na segunda (26/10). O prazo do STF venceu às 11h de terça. (CNN Brasil)',
      coachSpots: ['loja', 'gabinete'],
      nodes: {
        apto: { name: 'Apartamento', at: [1, 6], icon: 'tower', stash: { label: 'a caixa de sapatos do closet', amount: 150 } },
        loja: { name: 'Loja de chocolate', at: [3, 2], icon: 'shop', stash: { label: 'o fundo falso da loja de chocolate', amount: 350 } },
        gabinete: { name: 'Gabinete no Senado', at: [5, 7], icon: 'office', stash: { label: 'o cofre do gabinete', amount: 250 } },
        pai: { name: 'Casa do Pai', at: [6, 3], icon: 'prison', npc: 'pai' },
        irmao: { name: 'Casa do Irmão Caçula', at: [8, 7], icon: 'studio', npc: 'irmao' },
        saida: { name: 'BR rumo ao Sul', at: [8, 1], icon: 'sign' },
      },
      edges: [['apto', 'loja', 1, 0.15], ['apto', 'gabinete', 1, 0.2], ['loja', 'pai', 1, 0.2], ['gabinete', 'pai', 1, 0.2],
        ['gabinete', 'irmao', 1, 0.2], ['pai', 'saida', 2, 0.25], ['irmao', 'saida', 2, 0.3]],
      exits: [{ at: 'saida', label: 'Pegar a estrada até Foz do Iguaçu', hours: 10, soft: 'capitao', penalty: 20, dc: 12,
        penaltyText: 'Sem escolta, a viagem passa por três blitz.' }],
    },
    {
      id: 'fazenda', name: 'Foz do Iguaçu', subtitle: 'A fazenda', start: 'entrada',
      vehicle: { name: HORSE, bags: 6 },
      fact: 'Fato: segundo a TV argentina C5N, ele estava numa fazenda em Foz do Iguaçu desde a noite anterior à fuga. (Brasil de Fato)',
      coachSpots: ['curral'],
      nodes: {
        entrada: { name: 'Entrada da fazenda', at: [1, 6], icon: 'gate' },
        sede: { name: 'Sede da fazenda', at: [4, 2], icon: 'farmhouse', hide: true, stash: { label: 'a mala enterrada no sítio', amount: 250 } },
        curral: { name: 'Curral', at: [5, 7], icon: 'barn' },
        porteira: { name: 'Porteira dos fundos', at: [8, 3], icon: 'sign' },
      },
      edges: [['entrada', 'sede', 1, 0.1], ['entrada', 'curral', 1, 0.15], ['sede', 'curral', 1, 0.1],
        ['sede', 'porteira', 1, 0.15], ['curral', 'porteira', 1, 0.2]],
      exits: [{ at: 'porteira', label: 'Galopar até a ponte', hours: 1 }],
    },
    {
      id: 'ponte', name: 'A Ponte', subtitle: 'Tancredo Neves, 22h50', start: 'avenida',
      vehicle: { name: HORSE, bags: 6 },
      fact: 'Fato: segundo a Migração argentina, a família cruzou a Ponte Tancredo Neves às 22h50 de terça (de van, não de cavalo). (Brasil de Fato)',
      coachSpots: ['posto'],
      nodes: {
        avenida: { name: 'Av. das Cataratas', at: [1, 6], icon: 'sign' },
        aduana: { name: 'Fila da aduana', at: [4, 3], icon: 'aduana' },
        posto: { name: 'Posto de gasolina', at: [4, 8], icon: 'fuel' },
        ponte: { name: 'Ponte Tancredo Neves', at: [7, 5], icon: 'bridgehead' },
      },
      edges: [['avenida', 'aduana', 1, 0.4], ['avenida', 'posto', 1, 0.2], ['aduana', 'posto', 1, 0.25],
        ['aduana', 'ponte', 1, 0.3], ['posto', 'ponte', 1, 0.3]],
      exits: [{ at: 'ponte', label: 'Cruzar a ponte a cavalo para a Argentina', hours: 1, crossing: true, dc: 14 }],
    },
    {
      id: 'iguazu', name: 'Puerto Iguazú', subtitle: 'O jatinho', start: 'chegada',
      vehicle: { name: HORSE, bags: 6 },
      fact: 'Fato: às 23h30, a família embarcou em Puerto Iguazú num Gulfstream G400 rumo a Guayaquil. (Brasil de Fato)',
      coachSpots: ['cambio', 'hotel'],
      nodes: {
        chegada: { name: 'Puerto Iguazú', at: [1, 6], icon: 'sign', npc: 'milei' },
        cambio: { name: 'Casa de câmbio', at: [4, 2], icon: 'exchange' },
        hotel: { name: 'Hotel discreto', at: [4, 8], icon: 'hotel', rest: true },
        aeroporto: { name: 'Aeroporto de Iguazú', at: [8, 4], icon: 'airport' },
      },
      edges: [['chegada', 'cambio', 1, 0.15], ['chegada', 'hotel', 1, 0.1], ['cambio', 'hotel', 1, 0.1],
        ['cambio', 'aeroporto', 1, 0.25], ['hotel', 'aeroporto', 1, 0.2]],
      exits: [
        { at: 'aeroporto', label: 'Voar direto, sobre o Brasil', hours: 6, needs: 'piloto', bags: 10, cerco: 15,
          extraText: 'O radar brasileiro vê o jatinho passar. Cerco +15.' },
        { at: 'aeroporto', label: 'Desviar por Paraguai, Bolívia e Peru', hours: 8, needs: 'piloto', bags: 10, paranoia: 10,
          extraText: 'Duas horas a mais de voo olhando pela janela. Paranoia +10.' },
      ],
    },
    {
      id: 'guayaquil', name: 'Guayaquil', subtitle: 'Escala para Miami', start: 'pouso',
      vehicle: { name: 'Gulfstream G400 (com o pangaré no bagageiro)', bags: 10 },
      fact: 'Fato: o voo decolou de Guayaquil às 6h22 de quarta, com pouso previsto em Opa-locka, Miami. (Brasil de Fato)',
      coachSpots: [],
      nodes: {
        pouso: { name: 'Pátio de Guayaquil', at: [1, 5], icon: 'jet' },
        tanque: { name: 'Caminhão de combustível', at: [4, 2], icon: 'truck', fuel: true },
        hangar: { name: 'Hangar', at: [4, 8], icon: 'hangar', rest: true },
        pista: { name: 'Cabeceira da pista', at: [8, 5], icon: 'runway' },
      },
      edges: [['pouso', 'tanque', 1, 0.1], ['pouso', 'hangar', 1, 0.1], ['tanque', 'hangar', 1, 0.1],
        ['tanque', 'pista', 1, 0.15], ['hangar', 'pista', 1, 0.15]],
      exits: [{ at: 'pista', label: 'Decolar para Miami', hours: 5, needsFuel: true, win: true }],
    },
  ];

  const FACTS = {
    pai: 'Fato: o ex-presidente foi condenado pelo STF em 2025 por trama golpista. Suas crises de soluço viraram notícia várias vezes.',
    joias: 'Inspirado no caso das joias sauditas, investigado pela PF. A cena com Michaela é paródia.',
    teleport: 'Referência às suspeitas de "funcionários fantasmas" investigadas no caso das rachadinhas.',
    vorcaro: 'Paródia inspirada na liquidação de um banco privado pelo Banco Central em 2025. O "Banco Mestre" é fictício.',
    milei: 'Paródia. Fala e cena inventadas; o personagem é fictício.',
    horse: 'Referência a "Dark Horse", filme sobre a vida do pai. Tradução livre do jogo: Pangaré da Escuridão Soluçante.',
    moraes: 'Cena dramatizada. O pedido dos passaportes e o prazo de terça às 11h foram noticiados (CNN Brasil).',
  };

  const THREATS = [
    'Um repórter com câmera na calçada.',
    'Um drone sobrevoando a estrada.',
    'Um jornalista no posto. Ou é o vendedor de churros?',
    'Um agente de terno olhando demais para vocês.',
    'Um carro preto atrás de vocês há três quarteirões.',
  ];

  const CARDS = [
    { title: 'PF pede a entrega dos passaportes', text: 'O prazo é 11h de terça. Os aliados querem saber o que você vai fazer.', min: 0, max: 0,
      options: [{ label: 'Ignorar o pedido', fx: { cerco: 8 } }, { label: 'Postar "vou cumprir a lei"', fx: { paranoia: 10, cerco: 2 } }] },
    { title: 'Irmão defende sua saída em live', text: '"Se perder, tem que sair do país", disse ele. Ao vivo. Para todo mundo.', min: 0, max: 2,
      options: [{ label: 'Desmentir no X', fx: { paranoia: 8, cerco: -4 } }, { label: 'Ficar quieto', fx: { cerco: 6 } }] },
    { title: 'Aliados cobram um vídeo', text: 'Gente do partido quer uma nota ou um vídeo dizendo onde você está.', min: 0, max: 3,
      options: [{ label: 'Gravar vídeo no banco de trás', fx: { cerco: 10, paranoia: -15 } }, { label: 'Silêncio total', fx: { paranoia: 10 } }] },
    { title: 'Defesa diz não saber do seu paradeiro', text: 'Seus advogados também estão procurando você.', min: 0, max: 3,
      options: [{ label: 'Ligar para o advogado', fx: { cerco: 6, paranoia: -10 } }, { label: 'Melhor assim', fx: { paranoia: 6 } }] },
    { title: 'Vendedor de churros te reconhece', text: '"Ô, senador! Tira uma foto comigo?"', min: 0, max: 2,
      options: [{ label: 'Comprar todos os churros', fx: { money: -20 } }, { label: 'Boné e óculos escuros', fx: { cerco: 6, paranoia: 5 } }] },
    { title: 'As filhas precisam ir ao banheiro', text: 'Agora. Não dá para esperar o próximo país.', min: 0, max: 4,
      options: [{ label: 'Parar no posto', fx: { hours: 1, cerco: 4 } }, { label: 'Seguir viagem', fx: { paranoia: 8 } }] },
    { title: 'O Fantasma sussurra', text: '"O motorista é comunista. Olha a cor da camiseta dele."', min: 1, max: 4,
      options: [{ label: 'Trocar de motorista', fx: { money: -40, hours: 1 } }, { label: 'Confiar no motorista', fx: { paranoia: 15 } }] },
    { title: 'O pangaré soluça na fila', text: 'HIC! Um guarda olha para o cavalo. O cavalo olha para o guarda.', min: 1, max: 3,
      options: [{ label: 'Dar açúcar ao cavalo', fx: { money: -10, cerco: -3 } }, { label: 'Fingir que é de outro', fx: { cerco: 7 } }] },
    { title: 'Passaportes cancelados', text: 'A PF cancelou o passaporte comum e o diplomático. Portos e aeroportos já sabem.', min: 1, max: 2,
      options: [{ label: '"Tenho outros documentos"', fx: { paranoia: 8, cerco: 4 } }, { label: 'Sumir mais um pouco', fx: { hours: 2, cerco: -6 } }] },
    { title: 'Governo argentino nega sua entrada', text: 'O porta-voz diz que você nunca entrou nem pediu asilo. Você está na Argentina.', min: 3, max: 3,
      options: [{ label: 'Rir de nervoso', fx: { paranoia: -8 } }, { label: 'Ficar quieto no hotel', fx: { hours: 2, cerco: -5 } }] },
    { title: 'FlightAware de olho', text: 'Curiosos na internet rastreiam todo jatinho que sai de Iguazú.', min: 3, max: 4,
      options: [{ label: 'Pagar o piloto para "voar discreto"', fx: { money: -40, cerco: -6 } }, { label: 'Ignorar a internet', fx: { cerco: 10 } }] },
    { title: 'Lulão da Selva chama sua saída de "vergonhosa"', text: 'Diz que você devia ter ficado para provar sua inocência.', min: 3, max: 4,
      options: [{ label: 'Responder no X', fx: { cerco: 6, paranoia: -10 } }, { label: 'Fingir que não viu', fx: { paranoia: 8 } }] },
    { title: 'Departamento de Estado promete vistos', text: 'Washington diz que vai liberar a entrada da família.', min: 4, max: 4,
      options: [{ label: 'Comemorar', fx: { paranoia: -20 } }, { label: 'Desconfiar ("e se for comunista?")', fx: { paranoia: 10, cerco: -3 } }] },
  ];

  const ENDINGS = {
    won: 'Pouso em Opa-locka, Miami. Um helicóptero de TV filma tudo ao vivo. O Fantasma do Comunismo desembarca junto: parece que ele também ganhou visto.',
    caught: 'O Cerco fechou. A PF bate na porta, o pangaré soluça, e o Fantasma do Comunismo some como se nunca tivesse existido.',
    late: 'Meia-noite de quinta. O plano demorou demais e a PF chegou antes do avião.',
    quit: '"Fico para liderar a oposição." A família desfaz as malas. O dinheiro volta para a caixa de sapatos.',
  };

  const pad = n => String(n).padStart(2, '0');
  const clamp = v => Math.max(0, Math.min(100, v));

  function clock(h) {
    const total = Math.round((18 + h) * 60);
    const day = Math.floor(total / 1440), min = total % 1440;
    let d = 26 + day, m = 10;
    if (d > 31) { d -= 31; m = 11; }
    return `${DAYS[(1 + day) % 7]} ${pad(d)}/${pad(m)} ${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  }
  const hourOfDay = h => (18 + h) % 24;
  const inWindow = h => hourOfDay(h) >= 20 || hourOfDay(h) < 4;

  function rand(s) {
    let t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const d20 = s => 1 + Math.floor(rand(s) * 20);
  const pick = (s, list) => list[Math.floor(rand(s) * list.length)];

  function shuffle(s, list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand(s) * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function note(s, text) {
    s.seq++;
    s.log.unshift({ at: clock(s.hours), text, seq: s.seq });
    if (s.log.length > 40) s.log.length = 40;
  }

  function newGame(seed = 1, level = 'dificil') {
    seed = seed >>> 0;
    if (!LEVELS[level]) level = 'dificil';
    const L = LEVELS[level];
    const s = {
      seed, level, rng: (seed ^ 0x9E3779B9) >>> 0, hours: 0, phase: 0, node: PHASES[0].start,
      reais: L.reais, usd: 0, cerco: L.cerco, paranoia: L.paranoia, lanterns: L.lanterns, fakeNews: L.fakeNews, teleports: L.teleports,
      ghostPower: 0, calm: 0,
      contacts: {}, taken: {}, sent: {}, deliveries: [], fueled: false, done: {}, patrols: [],
      deck: [], used: {}, sinceCard: 0, pending: null, ended: null, coach: [], result: null, roll: null,
      deadlineNoted: false, trailNoted: false, lost: 0, stolen: 0, trail: [], log: [], events: [], seq: 0,
      stats: { threats: 0, fakes: 0, cards: 0, calls: 0, fakeNews: 0, teleports: 0, rolls: 0, fails: 0, rigged: 0, attacks: 0 },
    };
    s.deck = shuffle(s, CARDS.map((_, i) => i));
    s.coach = PHASES.map(ph => ph.coachSpots.length ? pick(s, ph.coachSpots) : null);
    repatrol(s);
    note(s, 'Segunda, 18h. A eleição acabou ontem. Alexandrino de Amores quer seus passaportes até amanhã às 11h.');
    s.events.push({ type: 'moraes' }, { type: 'phase', phase: 0 });
    return s;
  }

  const phaseOf = s => PHASES[s.phase];
  const nodeOf = s => phaseOf(s).nodes[s.node];
  const stashKey = (s, node) => `${s.phase}:${node}`;
  const bags = s => Math.ceil(s.reais / BAG) + Math.ceil(s.usd / USD_BAG);
  const money = s => s.reais + s.usd;
  const trailHere = s => s.trail.filter(t => t.phase === s.phase).length;
  const once = (s, key) => !s.done[`${s.phase}:${key}`];
  const mark = (s, key) => { s.done[`${s.phase}:${key}`] = true; };

  function capacity(s, exit) {
    if (exit && exit.bags) return exit.bags;
    if (s.phase === 0) return s.contacts.capitao ? 5 : 2;
    return phaseOf(s).vehicle.bags;
  }

  // Quanto fica para trás se a família partir com esta capacidade de malas.
  function overflow(s, cap) {
    const usdKeep = Math.min(s.usd, cap * USD_BAG);
    const free = Math.max(0, cap - Math.ceil(usdKeep / USD_BAG));
    const reaisKeep = Math.min(s.reais, free * BAG);
    return { reais: s.reais - reaisKeep, usd: s.usd - usdKeep };
  }

  function loadOut(s, cap) {
    const lost = overflow(s, cap);
    if (!lost.reais && !lost.usd) return;
    s.reais -= lost.reais;
    s.usd -= lost.usd;
    s.lost += lost.reais + lost.usd;
    note(s, `Não coube na montaria: R$ ${lost.reais + lost.usd} mil ficaram para trás.`);
    s.events.push({ type: 'drop' });
  }

  function canPay(s, cost, currency) {
    return currency === 'usd' ? s.usd >= cost : money(s) >= cost;
  }

  function pay(s, cost, currency) {
    if (currency === 'usd') { s.usd -= cost; return; }
    const fromReais = Math.min(s.reais, cost);
    s.reais -= fromReais;
    s.usd = Math.max(0, s.usd - (cost - fromReais));
  }

  // O rastro deixado no caminho ajuda a PF: cada trecho percorrido na fase acelera o Cerco.
  function cercoRate(s) {
    const base = s.phase <= 2 ? (s.hours < DEADLINE ? 0.7 : 1.0) : (s.phase === 3 ? 0.45 : 0.3);
    return (base + 0.03 * trailHere(s)) * LEVELS[s.level].rate;
  }

  function advance(s, h) {
    s.cerco = clamp(s.cerco + cercoRate(s) * h);
    s.paranoia = clamp(s.paranoia + h);
    s.hours += h;
    s.sinceCard += h;
    if (!s.deadlineNoted && s.hours >= DEADLINE) {
      s.deadlineNoted = true;
      note(s, 'Terça, 11h: o prazo do STF venceu. O Cerco acelera.');
      s.events.push({ type: 'deadline' });
    }
  }

  function bump(s, fx) {
    if (fx.hours) advance(s, fx.hours);
    if (fx.cerco) s.cerco = clamp(s.cerco + fx.cerco);
    if (fx.paranoia) s.paranoia = clamp(s.paranoia + fx.paranoia);
    if (fx.money) pay(s, Math.min(money(s), -fx.money));
  }

  function fxText(fx) {
    const parts = [];
    if (fx.hours) parts.push(`+${fx.hours}h`);
    if (fx.cerco) parts.push(`Cerco ${fx.cerco > 0 ? '+' : ''}${fx.cerco}`);
    if (fx.paranoia) parts.push(`Paranoia ${fx.paranoia > 0 ? '+' : ''}${fx.paranoia}`);
    if (fx.money) parts.push(`R$ ${fx.money} mil`);
    return parts.join(', ');
  }

  /* ---------- blitz: policiais parados nas estradas ---------- */

  // A cada ação a polícia muda de posição. Mais Cerco, mais blitz. Na Argentina e no Equador há menos.
  function repatrol(s) {
    const edges = phaseOf(s).edges;
    s.patrols = edges.map(() => 0);
    const n = Math.min(edges.length - 1, s.phase <= 2 ? 1 + Math.floor(s.cerco / 35) : Math.floor(s.cerco / 45));
    for (let i = 0; i < n; i++) {
      const k = Math.floor(rand(s) * edges.length);
      s.patrols[k] = Math.min(2, s.patrols[k] + 1);
    }
  }

  function neighbors(s) {
    const out = [];
    phaseOf(s).edges.forEach(([a, b, hours, risk], i) => {
      const cops = s.patrols[i] || 0;
      const to = a === s.node ? b : b === s.node ? a : null;
      if (to) out.push({ to, hours, risk, edge: i, cops, dc: cops ? 7 + 4 * cops + (s.hours >= DEADLINE ? 2 : 0) : 0 });
    });
    return out;
  }

  const riskName = r => (r >= 0.3 ? 'alto' : r >= 0.2 ? 'médio' : 'baixo');
  const escort = s => (s.phase === 0 && s.contacts.capitao ? 3 : 0);

  /* Cada ação traz `cost` estruturado ({ h, cerco, paranoia, pay, gain, risk, dc, cops }) para a interface
     mostrar o preço de cada decisão em etiquetas. `dc` = dificuldade do d20; ausente = sem dado. */
  function actions(s) {
    if (s.ended) return [];
    if (s.pending) return pendingChoices(s);
    const ph = phaseOf(s), node = nodeOf(s), list = [];
    const cap = capacity(s);
    const behind = c => { const o = overflow(s, c); return o.reais + o.usd; };
    const add = a => list.push(a);

    ph.exits.forEach((ex, i) => {
      if (ex.at !== s.node) return;
      let reason = '';
      if (ex.needs && !s.contacts[ex.needs]) reason = `Precisa de ${CONTACTS[ex.needs].name}.`;
      if (ex.needsFuel && !s.fueled) reason = 'O jato está sem combustível.';
      const left = behind(capacity(s, ex));
      let detail = left ? `Não cabe tudo: deixa R$ ${left} mil.` : '';
      let dc = 0;
      if (ex.soft && !s.contacts[ex.soft]) { dc = ex.dc; detail = `Sem ${CONTACTS[ex.soft].name}: ${ex.penaltyText} Falha = Cerco +${ex.penalty}. ${detail}`; }
      if (ex.crossing) {
        const clean = s.contacts.despachante && inWindow(s.hours);
        dc = clean ? 0 : ex.dc;
        detail = clean ? 'O Despachante está de plantão: passa direto, sem dado.' : 'Sem o Despachante na janela 20h–4h: role para despistar a aduana. Falha = Cerco +30.';
      }
      add({ id: `exit:${i}`, kind: 'exit', group: 'exit', exit: ex, disabled: !!reason, reason, label: ex.label,
        detail: detail.trim(), cost: { h: ex.hours, cerco: ex.cerco, paranoia: ex.paranoia, dc } });
    });

    if (node.stash && !s.taken[stashKey(s, s.node)] && !s.sent[stashKey(s, s.node)]) {
      const full = bags(s) >= cap;
      add({ id: 'take', kind: 'take', group: 'here', label: `Pegar ${node.stash.label}`, art: 'mala',
        detail: (full ? `O veículo já está cheio (${bags(s)}/${cap} malas): algo vai ficar para trás. ` : '') + 'Falha: alguém viu (Cerco +8).',
        cost: { h: 1, gain: `R$ ${node.stash.amount} mil`, dc: 6 } });
    }
    if (node.fuel && !s.fueled) {
      add({ id: 'fuel', kind: 'fuel', group: 'here', disabled: !canPay(s, 30), reason: 'Falta dinheiro.',
        label: 'Reabastecer o jato', cost: { h: 1, pay: 'R$ 30 mil' } });
    }
    if (s.contacts.doleiro && s.reais > 0) {
      add({ id: 'exchange', kind: 'exchange', group: 'here', label: 'Trocar reais por dólares', art: 'vorcaro',
        detail: `R$ ${s.reais} mil viram US$ ${Math.round(s.reais * 0.9)} mil (4× menos malas). Falha: taxa de 25%.`, cost: { h: 1, dc: 8 } });
    }
    if (node.hide && s.contacts.fazendeiro) {
      add({ id: 'hide', kind: 'hide', group: 'here', label: 'Esconder-se na sede', detail: 'Sucesso: Cerco −12. Falha: só −3.', cost: { h: 2, dc: 8 } });
    }
    if (node.rest) add({ id: 'rest', kind: 'rest', group: 'here', label: 'Descansar', cost: { h: 2, paranoia: -25 } });
    if (node.npc === 'pai' && once(s, 'pai')) {
      add({ id: 'visit', kind: 'visit', group: 'here', label: 'Pedir a bênção ao pai', art: 'pai',
        detail: '"HIC!" Enquanto isso, Michaela passa a mão nas suas joias: sucesso = leva 20% dos reais, falha = 45%.', cost: { h: 1, paranoia: -20, cerco: 8, dc: 10 } });
    }
    if (node.npc === 'irmao' && once(s, 'irmao')) {
      add({ id: 'brother', kind: 'brother', group: 'here', label: 'Pedir ajuda ao irmão caçula', art: 'irmao',
        detail: 'Sucesso: ele distrai a imprensa (Cerco −12). Falha: tuíta onde você está (Cerco +12).', cost: { h: 1, paranoia: -10, dc: 11 } });
    }
    if (s.coach[s.phase] === s.node && once(s, 'coach')) {
      add({ id: 'coach', kind: 'coach', group: 'here', label: 'Ouvir o coach Pablito Março', art: 'marcal',
        detail: 'Motivação garantida. Ele faz live com você ao fundo.', cost: { h: 1, paranoia: -12, cerco: 4 } });
    }

    if (node.npc === 'milei' && once(s, 'milei')) {
      add({ id: 'milei', kind: 'milei', group: 'here', label: 'Pedir ajuda a Xavier Mileto', art: 'milei',
        detail: `"${MILEI}" Sucesso: a motosserra corta a fila da imigração (Cerco −10). Falha: ele tenta levar o pangaré para o churrasco (+1h, Paranoia +8).`,
        cost: { h: 1, dc: 9 } });
    }

    for (const n of neighbors(s)) {
      const left = behind(cap);
      const blitz = n.cops ? `BLITZ com ${n.cops} policia${n.cops > 1 ? 'is' : 'l'}: role para passar. Falha = Cerco +9.` : 'Sem blitz: sem dado.';
      add({ id: `go:${n.to}`, kind: 'go', group: 'move', to: n.to, hours: n.hours, risk: n.risk, edge: n.edge, cops: n.cops, dc: n.dc,
        label: ph.nodes[n.to].name, detail: (left ? `Não cabe tudo: deixa R$ ${left} mil. ` : '') + blitz,
        cost: { h: n.hours, cops: n.cops, dc: n.dc } });
    }

    for (const [id, c] of Object.entries(CONTACTS)) {
      if (c.phase !== s.phase || s.contacts[id]) continue;
      const price = c.cost ? `${c.currency === 'usd' ? 'US$' : 'R$'} ${c.cost} mil` : 'comissão';
      add({ id: `call:${id}`, kind: 'call', group: 'phone', contact: id, art: c.art, disabled: !canPay(s, c.cost, c.currency),
        reason: c.currency === 'usd' ? 'Só aceita dólares.' : 'Falta dinheiro vivo.',
        label: `Ligar para ${c.name}`, detail: `${c.service} Falha: linha grampeada (Cerco +8).`, cost: { h: c.hours, cerco: 3, pay: price, dc: c.dc } });
    }
    if (s.phase <= 1 && !s.done.vorcaro) {
      add({ id: 'vorcaro', kind: 'vorcaro', group: 'phone', label: 'Ligar para o "irmão" Torcaro e pedir R$ 400 mil', art: 'vorcaro',
        detail: '"Irmão!" Ele sempre manda só a metade. Falha: o áudio vaza (Cerco +12).', cost: { h: 1, gain: 'R$ 200 mil', dc: 10 } });
    }
    if (s.phase === 0 && s.contacts.queiroz) {
      for (const [id, n] of Object.entries(ph.nodes)) {
        const key = stashKey(s, id);
        if (!n.stash || id === s.node || s.taken[key] || s.sent[key]) continue;
        add({ id: `send:${id}`, kind: 'send', group: 'phone', node: id, label: `Queijoz busca ${n.stash.label}`, art: 'queiroz',
          detail: 'Entrega na fazenda, sem ocupar o carro. Sucesso: fica com 10%. Falha: fica com metade.', cost: { h: 1, gain: `~R$ ${Math.round(n.stash.amount * 0.9)} mil`, dc: 9 } });
      }
    }

    if (s.fakeNews > 0) {
      add({ id: 'fake', kind: 'fake', group: 'power', label: `Fake news: "estou em Dubai" (${s.fakeNews})`, art: 'fantasma',
        detail: 'Sucesso: Cerco −14. Falha: a checagem desmente (Cerco +4). Também some com uma ameaça na hora.', cost: { h: 1, paranoia: 5, dc: 9 } });
    }
    if (s.teleports > 0) {
      for (const [id, n] of Object.entries(ph.nodes)) {
        if (id === s.node) continue;
        add({ id: `tp:${id}`, kind: 'tp', group: 'power', to: id, label: n.name, art: 'fantasmaFlavio',
          detail: 'Sem tempo, sem rastro, sem blitz, sem dado.', cost: { h: 0 } });
      }
    }

    add({ id: 'wait', kind: 'wait', group: 'other', label: 'ESPERAR 72H', detail: '(Brincadeira: são só duas.)', cost: { h: 2, paranoia: 3 } });
    add({ id: 'quit', kind: 'quit', group: 'other', label: 'Desistir: "fico para liderar a oposição"' });
    return list;
  }

  function pendingChoices(s) {
    const p = s.pending;
    if (p.type === 'card') {
      return p.card.options.map((o, i) => ({ id: `opt:${i}`, kind: 'opt', label: o.label, detail: fxText(o.fx) }));
    }
    if (p.type === 'roll') {
      const list = [{ id: 'accept', kind: 'accept', label: 'Aceitar o resultado', detail: p.failText }];
      for (let n = 1; n <= 20; n++) list.push({ id: `rig:${n}`, kind: 'rig', n, label: String(n), detail: `Paranoia +${RIG_PARANOIA}, Fantasma +1 de força.` });
      return list;
    }
    if (p.type === 'attack') {
      return [{ id: 'duck', kind: 'duck', label: 'Desviar!', detail: `Role 1d20 contra CD ${10 + s.ghostPower}.`, cost: { dc: 10 + s.ghostPower } }];
    }
    const list = [
      { id: 'dodge', kind: 'dodge', label: 'Desviar', detail: '+2h, sem risco.' },
      { id: 'push', kind: 'push', label: 'Seguir em frente', detail: 'Se for real: Cerco +15.' },
    ];
    if (s.fakeNews > 0) list.push({ id: 'fakenews', kind: 'fakenews', label: `Espalhar fake news (${s.fakeNews})`, detail: 'A ameaça some, real ou não.' });
    if (!p.revealed && s.lanterns > 0) {
      list.push({ id: 'lantern', kind: 'lantern', label: `Lanterna da realidade (${s.lanterns})`, detail: 'Mostra se é real ou o Fantasma.' });
    }
    return list;
  }

  /* ---------- dado ---------- */

  // Rola 1d20 + mod contra dc. Sucesso aplica o resultado já; falha vira pendência com a opção de "não auditar".
  function test(s, a, dc, mod, failText) {
    mod += LEVELS[s.level].bonus;
    const die = d20(s), roll = { die, mod, dc, total: die + mod, ok: die !== 1 && (die === 20 || die + mod >= dc), rigged: false };
    s.roll = roll;
    s.stats.rolls++;
    s.events.push({ type: 'dice', roll });
    if (roll.ok) { outcome(s, a, true); return; }
    s.stats.fails++;
    s.pending = { type: 'roll', action: a, roll, failText, title: a.label };
  }

  function outcome(s, a, ok) {
    const ph = phaseOf(s);
    switch (a.kind) {
      case 'go':
        if (ok) note(s, 'Passou pela blitz sem ser reconhecido. O pangaré nem soluçou.');
        else {
          s.cerco = clamp(s.cerco + 9);
          note(s, 'Parado na blitz! Uma foto sua circula nos grupos de WhatsApp. Cerco +9.');
          s.events.push({ type: 'hit' });
        }
        return;
      case 'take': {
        const st = nodeOf(s).stash;
        s.taken[stashKey(s, s.node)] = true;
        s.reais += st.amount;
        note(s, `Pegou ${st.label}: R$ ${st.amount} mil em notas.`);
        if (!ok) { s.cerco = clamp(s.cerco + 8); note(s, 'Mas o porteiro viu tudo. Cerco +8.'); }
        s.events.push({ type: 'coin', amount: st.amount });
        return;
      }
      case 'send': {
        const n = ph.nodes[a.node];
        s.sent[stashKey(s, a.node)] = true;
        const amount = Math.round(n.stash.amount * (ok ? 0.9 : 0.5));
        s.deliveries.push({ amount, label: n.stash.label, skimmed: !ok });
        note(s, ok ? `Queijoz foi buscar ${n.stash.label}. Promete entregar na fazenda.` : `Queijoz foi buscar ${n.stash.label}... e já avisou que "deu uma despesinha".`);
        s.events.push({ type: 'call' });
        return;
      }
      case 'exchange': {
        const usd = Math.round(s.reais * (ok ? 0.9 : 0.75));
        note(s, `O Doleiro troca R$ ${s.reais} mil por US$ ${usd} mil${ok ? '' : ' ("o câmbio mudou, irmão")'}.`);
        s.usd += usd;
        s.reais = 0;
        s.events.push({ type: 'coin' });
        return;
      }
      case 'call': {
        const c = CONTACTS[a.contact];
        s.contacts[a.contact] = true;
        note(s, `${c.name[0].toUpperCase()}${c.name.slice(1)} topou. ${c.service}`);
        if (!ok) { s.cerco = clamp(s.cerco + 8); note(s, 'A linha estava grampeada. Cerco +8.'); }
        s.events.push({ type: 'call' });
        return;
      }
      case 'vorcaro':
        s.done.vorcaro = true;
        s.reais += 200;
        note(s, '"Irmão! Te mando metade, o resto ficou preso na liquidação do Banco Mestre." Chegaram R$ 200 mil.');
        if (!ok) { s.cerco = clamp(s.cerco + 12); note(s, 'O áudio do "irmão" vazou. Cerco +12.'); }
        s.events.push({ type: 'coin', amount: 200 });
        return;
      case 'milei':
        note(s, `Xavier Mileto ergue a motosserra, olha o cavalo e grita: "${MILEI}"`);
        if (ok) { s.cerco = clamp(s.cerco - 10); note(s, '"¡Afuera, burocracia!" Ele corta a fila da imigração ao meio. Cerco −10.'); }
        else {
          advance(s, 1);
          s.paranoia = clamp(s.paranoia + 8);
          note(s, 'Ele já acendeu a churrasqueira. Uma hora para convencê-lo de que o pangaré é da família. Paranoia +8.');
        }
        s.events.push({ type: 'milei' });
        return;
      case 'hide':
        s.cerco = clamp(s.cerco - (ok ? 12 : 3));
        note(s, ok ? 'Duas horas escondido atrás das sacas de ração. O Cerco esfria (−12).' : 'O cachorro da fazenda não parou de latir. Cerco só −3.');
        return;
      case 'visit': {
        mark(s, 'pai');
        s.paranoia = clamp(s.paranoia - 20);
        s.cerco = clamp(s.cerco + 8);
        const stolen = Math.min(s.reais, Math.round(s.reais * (ok ? 0.2 : 0.45) / 10) * 10);
        s.reais -= stolen;
        s.stolen += stolen;
        note(s, '"HIC! Vai, meu filho. HIC! Leva o Fantasma junto. HIC!" A visita sai no jornal.');
        note(s, stolen ? `Enquanto isso, Michaela "guardou" as suas joias: R$ ${stolen} mil a menos.` : 'Michaela procurou joias, mas você não tinha nada.');
        s.events.push({ type: 'hic' }, { type: 'stolen', amount: stolen });
        return;
      }
      case 'brother':
        mark(s, 'irmao');
        s.paranoia = clamp(s.paranoia - 10);
        if (ok) {
          s.cerco = clamp(s.cerco - 12);
          note(s, 'O caçula faz uma live de três horas sobre outro assunto. A imprensa inteira assiste. Cerco −12.');
        } else {
          s.cerco = clamp(s.cerco + 12);
          note(s, '"Meu irmão está bem e seguro na fazenda em Foz!", tuíta o caçula. Cerco +12.');
          s.events.push({ type: 'hit' });
        }
        return;
      case 'fake':
        if (ok) { s.cerco = clamp(s.cerco - 14); note(s, 'Você posta: "curtindo Dubai". Metade da PF vai checar. Cerco −14.'); }
        else { s.cerco = clamp(s.cerco + 4); note(s, 'A agência de checagem desmentiu em 10 minutos: a foto era de 2019. Cerco +4.'); }
        return;
      case 'duck': {
        const kit = a.item === 'kit';
        if (ok) { note(s, `Você desvia ${kit ? 'do kit gay' : 'da mamadeira de piroca'}. O Fantasma bufa.`); return; }
        if (kit) {
          s.cerco = clamp(s.cerco + 4);
          s.paranoia = clamp(s.paranoia - 5);
          note(s, 'O kit gay acerta em cheio! Do nada surge o irmão Carlitos, brilhando de purpurina, e declama:');
          note(s, `"${pick(s, POEMS)}" Dá para ver o brilho do satélite. Cerco +4.`);
          s.events.push({ type: 'carlos' });
        } else {
          s.paranoia = clamp(s.paranoia + 12);
          advance(s, 1);
          note(s, 'A mamadeira de piroca acerta sua testa. Uma hora explicando para as filhas o que é aquilo. Paranoia +12.');
          s.events.push({ type: 'hit' });
        }
        return;
      }
      case 'exit':
        finishExit(s, a, ok);
        return;
    }
  }

  function maybeThreat(s, risk) {
    const real = rand(s) < risk * 0.6;
    const fake = !real && s.paranoia > 50 && rand(s) < 0.5;
    if (!real && !fake) return;
    const text = pick(s, THREATS);
    s.pending = { type: 'threat', text, real, revealed: false };
    s.stats.threats++;
    if (fake) s.stats.fakes++;
    s.events.push({ type: 'threat' });
  }

  function drawCard(s) {
    s.sinceCard = 0;
    for (const i of s.deck) {
      const c = CARDS[i];
      if (s.used[i] || s.phase < c.min || s.phase > c.max) continue;
      s.used[i] = true;
      s.stats.cards++;
      s.pending = { type: 'card', card: c };
      s.events.push({ type: 'card' });
      return;
    }
  }

  // O Fantasma do Comunismo ataca de vez em quando; mais forte a cada dado "não auditado".
  function maybeAttack(s) {
    s.calm++;
    const chance = Math.min(0.25, 0.04 + 0.03 * s.ghostPower + (s.paranoia > 70 ? 0.04 : 0));
    if (s.calm < 3 || rand(s) >= chance) return;
    s.calm = 0;
    const item = rand(s) < 0.5 ? 'kit' : 'mamadeira';
    s.stats.attacks++;
    s.pending = { type: 'attack', item };
    s.events.push({ type: 'attack', item });
  }

  function enterPhase(s, p) {
    s.phase = p;
    s.node = PHASES[p].start;
    s.events.push({ type: 'phase', phase: p });
    note(s, `${PHASES[p].name}: ${PHASES[p].subtitle}.`);
    if (p === 3) { s.events.push({ type: 'mileiScene' }); note(s, `Na chegada, Xavier Mileto olha o cavalo: "${MILEI}"`); }
    if (p === 1) {
      note(s, `A partir daqui a família segue no ${HORSE}.`);
      if (s.deliveries.length) {
        for (const d of s.deliveries) {
          s.reais += d.amount;
          note(s, d.skimmed
            ? `Queijoz entregou R$ ${d.amount} mil de ${d.label}. Diz que "o resto molhou na chuva".`
            : `Queijoz entregou R$ ${d.amount} mil de ${d.label}, já descontada a parte dele.`);
        }
        s.deliveries = [];
        s.events.push({ type: 'coin' });
      }
    }
    repatrol(s);
  }

  function finish(s, type) {
    const stars = type === 'won' ? 1 + (s.hours <= 48 ? 1 : 0) + (money(s) >= 150 ? 1 : 0) : 0;
    s.ended = { type, stars, text: ENDINGS[type] };
    s.pending = null;
    s.events.push({ type: 'end', ending: type });
  }

  function useFakeNews(s) {
    s.fakeNews--;
    s.stats.fakeNews++;
    s.events.push({ type: 'fake' });
  }

  function resolvePending(s, a) {
    const p = s.pending;
    if (a.kind === 'opt') {
      const o = p.card.options[Number(a.id.slice(4))];
      s.pending = null;
      bump(s, o.fx);
      note(s, `${p.card.title}: ${o.label}.`);
      return;
    }
    if (a.kind === 'accept') {
      s.pending = null;
      outcome(s, p.action, false);
      return;
    }
    if (a.kind === 'rig') {
      s.pending = null;
      s.ghostPower++;
      s.stats.rigged++;
      s.paranoia = clamp(s.paranoia + RIG_PARANOIA);
      const r = p.roll;
      const roll = { ...r, die: a.n, total: a.n + r.mod, ok: a.n !== 1 && (a.n === 20 || a.n + r.mod >= r.dc), rigged: true };
      s.roll = roll;
      note(s, `"Esse dado não é auditado." Saiu ${a.n}. O Fantasma do Comunismo fica mais forte (força ${s.ghostPower}). Paranoia +${RIG_PARANOIA}.`);
      s.events.push({ type: 'rig', roll });
      outcome(s, p.action, roll.ok);
      return;
    }
    if (a.kind === 'duck') {
      s.pending = null;
      test(s, { kind: 'duck', item: p.item, label: p.item === 'kit' ? 'Desviar do kit gay' : 'Desviar da mamadeira de piroca' },
        10 + s.ghostPower, 0, p.item === 'kit' ? 'O kit acerta: Carlitos aparece com purpurina (Cerco +4).' : 'A mamadeira acerta: Paranoia +12, +1h.');
      return;
    }
    if (a.kind === 'lantern') {
      s.lanterns--;
      p.revealed = true;
      note(s, p.real ? 'A lanterna da realidade confirma: a ameaça é REAL.' : 'A lanterna revela: não tem nada ali. Era o Fantasma do Comunismo.');
      s.events.push({ type: p.real ? 'threat' : 'ghost' });
      return;
    }
    s.pending = null;
    if (a.kind === 'fakenews') {
      useFakeNews(s);
      note(s, p.real ? 'Você posta uma foto antiga em Dubai. O repórter vai embora checar.' : 'Fake news contra um fantasma. Funcionou, mas não precisava.');
      return;
    }
    if (a.kind === 'dodge') {
      advance(s, 2);
      note(s, 'Desviou. Duas horas a mais de estrada.');
      return;
    }
    if (p.real) {
      s.cerco = clamp(s.cerco + 15);
      note(s, 'Era real. Uma foto sua circula nos grupos de WhatsApp. Cerco +15.');
      s.events.push({ type: 'hit' });
    } else {
      note(s, 'Não tinha nada lá. Era o Fantasma do Comunismo.');
      s.events.push({ type: 'ghost' });
    }
  }

  function perform(s, a) {
    const ph = phaseOf(s);
    switch (a.kind) {
      case 'go': {
        loadOut(s, capacity(s));
        const from = s.node;
        s.trail.push({ phase: s.phase, from, to: a.to, at: s.hours });
        s.node = a.to;
        advance(s, a.hours);
        s.events.push({ type: 'travel', from, to: a.to, edge: a.edge });
        note(s, `Chegou: ${ph.nodes[a.to].name}.`);
        if (!s.trailNoted && trailHere(s) >= 3) {
          s.trailNoted = true;
          note(s, 'O nervosismo deixa um rastro marrom pelo caminho. A PF segue o cheiro: o Cerco sobe mais rápido.');
        }
        if (s.paranoia > 80 && rand(s) < 0.3) {
          advance(s, 2);
          note(s, 'O Fantasma do Comunismo manda dar a volta no quarteirão. +2h.');
          s.events.push({ type: 'ghost' });
        }
        if (a.cops) test(s, a, a.dc, escort(s), 'Parado na blitz: Cerco +9.');
        else maybeThreat(s, a.risk);
        return;
      }
      case 'tp': {
        const from = s.node;
        s.teleports--;
        s.stats.teleports++;
        s.node = a.to;
        s.events.push({ type: 'teleport', from, to: a.to });
        note(s, `Teletransporte do Funcionário Fantasma: você aparece em ${ph.nodes[a.to].name}, deixando uma chuva de dinheiro. Ninguém viu você chegar, como no gabinete.`);
        return;
      }
      case 'fake':
        useFakeNews(s);
        advance(s, 1);
        s.paranoia = clamp(s.paranoia + 5);
        test(s, a, 9, 0, 'A checagem desmente: Cerco +4.');
        return;
      case 'take':
        advance(s, 1);
        test(s, a, 6, 0, 'Você pega o dinheiro, mas alguém viu: Cerco +8.');
        return;
      case 'send':
        advance(s, 1);
        test(s, a, 9, 0, 'Queijoz fica com metade.');
        return;
      case 'exchange':
        advance(s, 1);
        test(s, a, 8, 0, 'Taxa de 25% em vez de 10%.');
        return;
      case 'fuel':
        pay(s, 30);
        s.fueled = true;
        advance(s, 1);
        note(s, 'Tanque cheio. O frentista não fez perguntas.');
        s.events.push({ type: 'coin' });
        return;
      case 'call': {
        const c = CONTACTS[a.contact];
        pay(s, c.cost, c.currency);
        s.stats.calls++;
        advance(s, c.hours);
        s.cerco = clamp(s.cerco + 3);
        test(s, a, c.dc, 0, 'O contato topa, mas a linha está grampeada: Cerco +8.');
        return;
      }
      case 'vorcaro':
        advance(s, 1);
        test(s, a, 10, 0, 'O dinheiro chega, mas o áudio vaza: Cerco +12.');
        return;
      case 'hide':
        advance(s, 2);
        test(s, a, 8, 0, 'O cachorro latiu: Cerco só −3.');
        return;
      case 'rest':
        advance(s, 2);
        s.paranoia = clamp(s.paranoia - 25);
        note(s, 'Um cochilo. O Fantasma do Comunismo fica quieto por um tempo.');
        return;
      case 'visit':
        advance(s, 1);
        test(s, a, 10, 0, 'Michaela leva 45% dos seus reais em "joias".');
        return;
      case 'brother':
        advance(s, 1);
        test(s, a, 11, 0, 'Ele tuíta onde você está: Cerco +12.');
        return;
      case 'milei':
        mark(s, 'milei');
        advance(s, 1);
        test(s, a, 9, 0, 'Ele tenta levar o pangaré para o churrasco: +1h, Paranoia +8.');
        return;
      case 'coach':
        mark(s, 'coach');
        advance(s, 1);
        s.paranoia = clamp(s.paranoia - 12);
        s.cerco = clamp(s.cerco + 4);
        note(s, `Pablito Março: "${pick(s, COACH)}"`);
        s.events.push({ type: 'coach' });
        return;
      case 'wait':
        advance(s, 2);
        s.paranoia = clamp(s.paranoia + 3);
        note(s, 'Duas horas olhando o celular. Cada notificação parece a PF.');
        return;
      case 'quit':
        finish(s, 'quit');
        return;
      case 'exit': {
        const ex = a.exit;
        loadOut(s, capacity(s, ex));
        const departure = s.hours;
        advance(s, ex.hours);
        if (ex.soft && !s.contacts[ex.soft]) { test(s, a, ex.dc, 0, ex.penaltyText + ` Cerco +${ex.penalty}.`); return; }
        if (ex.crossing && !(s.contacts.despachante && inWindow(departure))) { test(s, a, ex.dc, 0, 'Conferência na aduana: Cerco +30.'); return; }
        finishExit(s, a, true);
        return;
      }
    }
  }

  function finishExit(s, a, ok) {
    const ex = a.exit;
    if (ex.soft && !s.contacts[ex.soft]) {
      if (ok) note(s, 'Sem escolta, mas as blitz olharam para o outro lado. Cerco +5.');
      else note(s, `${ex.penaltyText} Cerco +${ex.penalty}.`);
      s.cerco = clamp(s.cerco + (ok ? 5 : ex.penalty));
    }
    if (ex.crossing) {
      if (s.contacts.despachante && ok && !s.roll) note(s, 'O Despachante acena e o pangaré passa direto pela aduana.');
      else if (ok) note(s, 'O pangaré soluça, o guarda ri, e vocês passam.');
      else {
        s.cerco = clamp(s.cerco + 30);
        note(s, 'Conferência na aduana: documentos, alforjes, perguntas. Cerco +30.');
        s.events.push({ type: 'hit' });
      }
      if (s.cerco >= 100) return;
      s.cerco = clamp(s.cerco - 30);
      note(s, 'Do outro lado da ponte, a PF brasileira não manda mais. Cerco −30.');
    }
    if (ex.cerco) s.cerco = clamp(s.cerco + ex.cerco);
    if (ex.paranoia) s.paranoia = clamp(s.paranoia + ex.paranoia);
    if (ex.extraText) note(s, ex.extraText);
    if (s.cerco >= 100) return;
    if (ex.win) { finish(s, 'won'); return; }
    s.events.push({ type: 'depart', phase: s.phase });
    enterPhase(s, s.phase + 1);
  }

  const snapshot = (s, title) => ({ title, seq: s.seq, cerco: s.cerco, paranoia: s.paranoia, reais: s.reais, usd: s.usd, hours: s.hours });

  function act(s, id) {
    s.events = [];
    s.result = null;
    if (s.ended) return s;
    const a = actions(s).find(x => x.id === id);
    if (!a || a.disabled) throw new Error(`Ação inválida: ${id}`);
    const wasRoll = s.pending && s.pending.type === 'roll';
    const snap = wasRoll ? s.pending.before : snapshot(s, s.pending ? (s.pending.type === 'card' ? `${s.pending.card.title}: ${a.label}` : a.label) : a.label);
    if (!wasRoll) s.roll = null;
    if (s.pending) resolvePending(s, a);
    else perform(s, a);
    if (!s.ended && s.cerco >= 100) finish(s, 'caught');
    if (!s.ended && s.hours >= LIMIT) finish(s, 'late');
    if (s.pending && s.pending.type === 'roll') { s.pending.before = snap; return s; }
    if (a.kind !== 'lantern') {
      s.result = {
        title: snap.title, kind: wasRoll ? 'roll' : a.kind, art: a.art || null, roll: s.roll,
        notes: s.log.filter(e => e.seq > snap.seq).map(e => e.text).reverse(),
        fx: { hours: s.hours - snap.hours, cerco: Math.round(s.cerco - snap.cerco), paranoia: Math.round(s.paranoia - snap.paranoia), reais: s.reais - snap.reais, usd: s.usd - snap.usd },
      };
    }
    if (!s.ended && !s.pending) {
      repatrol(s);
      if (s.sinceCard >= 5) drawCard(s);
      if (!s.pending && a.kind !== 'tp') maybeAttack(s);
    }
    return s;
  }

  /* ---------- ajuda ao jogador: missão da fase e próximo passo sugerido ---------- */

  function stashesLeft(s) {
    return Object.entries(phaseOf(s).nodes).filter(([id, n]) => n.stash && !s.taken[stashKey(s, id)] && !s.sent[stashKey(s, id)]).length;
  }

  function goals(s) {
    const c = s.contacts, out = [];
    const g = (text, done) => out.push({ text, done: !!done });
    const exitName = phaseOf(s).nodes[phaseOf(s).exits[0].at].name;
    switch (s.phase) {
      case 0:
        g('Ligar para o Ex-Capitão: o carro passa a levar 5 malas', c.capitao);
        g('Ligar para Queijoz: ele busca dinheiro longe e entrega em Foz', c.queiroz);
        g('Juntar o dinheiro vivo dos 3 esconderijos ($ no mapa)', stashesLeft(s) === 0);
        g('Opcional: pedir dinheiro ao "irmão" Torcaro', s.done.vorcaro);
        g(`Ir até a ${exitName} e pegar a estrada`, false);
        break;
      case 1:
        g('Ligar para o Fazendeiro: a sede vira esconderijo', c.fazendeiro);
        g('Pegar a mala enterrada na sede', stashesLeft(s) === 0);
        g(`Sair pela ${exitName}, montado no pangaré`, false);
        break;
      case 2:
        g('Ligar para o Despachante da Ponte', c.despachante);
        g(`Cruzar a ponte entre 20h e 4h (agora: ${inWindow(s.hours) ? 'ABERTO' : 'fechado'})`, false);
        break;
      case 3:
        g('Ligar para o Doleiro e trocar os reais por dólares', c.doleiro && s.reais === 0);
        g('Contratar o Piloto: US$ 250 mil', c.piloto);
        g('Decolar no Aeroporto de Iguazú', false);
        break;
      case 4:
        g('Reabastecer no caminhão de combustível (R$ 30 mil)', s.fueled);
        g('Decolar na cabeceira da pista rumo a Miami', false);
        break;
    }
    return out;
  }

  // Próximo passo até um lugar, preferindo estradas sem blitz (busca em largura com custo).
  function stepToward(s, target) {
    const ph = phaseOf(s);
    if (target === s.node) return null;
    const dist = { [s.node]: 0 }, prev = {}, open = [s.node];
    while (open.length) {
      open.sort((x, y) => dist[x] - dist[y]);
      const cur = open.shift();
      ph.edges.forEach(([a, b], i) => {
        const nxt = a === cur ? b : b === cur ? a : null;
        if (!nxt) return;
        const d = dist[cur] + 1 + 3 * (s.patrols[i] || 0);
        if (dist[nxt] === undefined || d < dist[nxt]) { dist[nxt] = d; prev[nxt] = cur; open.push(nxt); }
      });
    }
    let step = target;
    while (prev[step] !== s.node) step = prev[step];
    return step;
  }

  // Sugestão de jogada segura (não ótima). A interface destaca; os testes usam como bot.
  function suggest(s) {
    const list = actions(s).filter(a => !a.disabled);
    if (!list.length) return null;
    const has = id => list.some(a => a.id === id);
    if (s.pending) {
      const p = s.pending;
      if (p.type === 'card') return 'opt:0';
      if (p.type === 'roll') return s.paranoia < 45 && s.ghostPower < 3 ? 'rig:20' : 'accept';
      if (p.type === 'attack') return 'duck';
      if (has('lantern')) return 'lantern';
      if (p.revealed && !p.real) return 'push';
      return has('fakenews') && s.cerco > 50 ? 'fakenews' : 'dodge';
    }
    for (const id of ['call:capitao', 'call:queiroz', 'vorcaro', 'call:fazendeiro', 'call:despachante', 'call:doleiro', 'exchange', 'call:piloto', 'fuel']) {
      if (has(id)) return id;
    }
    if (has('take') && bags(s) < capacity(s)) return 'take';
    const send = list.find(a => a.kind === 'send');
    if (send) return send.id;
    if (s.cerco > 55 && has('fake')) return 'fake';
    if (s.cerco > 60 && has('hide')) return 'hide';
    if (s.paranoia > 85 && has('rest')) return 'rest';
    const exit = list.find(a => a.kind === 'exit');
    if (exit) {
      if (exit.exit.crossing && !inWindow(s.hours)) return has('hide') ? 'hide' : 'wait';
      return exit.id;
    }
    const target = s.phase === 4 && !s.fueled ? 'tanque' : phaseOf(s).exits[0].at;
    const step = stepToward(s, target);
    return step ? `go:${step}` : 'wait';
  }

  return {
    VERSION, CONTACTS, PHASES, CARDS, THREATS, ENDINGS, COACH, BROTHER, POEMS, FACTS, HORSE, NAMES, LEVELS, MILEI, BAG, USD_BAG, DEADLINE, LIMIT, GRID, RIG_PARANOIA,
    newGame, actions, act, clock, hourOfDay, inWindow, capacity, bags, money, overflow, neighbors, goals, suggest,
  };
});
