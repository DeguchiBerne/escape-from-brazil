// QA no Chrome headless: título → partida → plantão → fim, com capturas de tela em tests/shots/.
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), port = 9247, shots = path.join(root, 'tests/shots');
fs.mkdirSync(shots, { recursive: true });
fs.rmSync(path.join(root, 'tests/browser-profile'), { recursive: true, force: true });  // sem cache de CSS/JS antigos
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run',
  '--allow-file-access-from-files', '--remote-debugging-port=' + port, '--user-data-dir=' + path.join(root, 'tests/browser-profile'),
  'file:///' + path.join(root, 'index.html').replaceAll('\\', '/')], { stdio: 'ignore', windowsHide: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let targets;
  for (let i = 0; i < 100; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.some(t => t.type === 'page')) break; } catch {}
    await sleep(200);
  }
  const target = targets.find(t => t.type === 'page'), ws = new WebSocket(target.webSocketDebuggerUrl), pending = new Map(), errors = [];
  let seq = 0;
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(Error(JSON.stringify(msg.error))) : p.resolve(msg.result); }
  };
  const cmd = (method, params = {}) => { const id = ++seq; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); };
  async function ev(expression) {
    const r = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
  async function shot(name) {
    await sleep(250);
    const r = await cmd('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(shots, name), Buffer.from(r.data, 'base64'));
  }

  await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
  for (let i = 0; i < 100; i++) { if (await ev("typeof EscapeGame !== 'undefined'")) break; await sleep(100); }
  await ev('document.fonts.ready');
  await shot('1-titulo.png');

  // Menu de dificuldade: cada nível tem um personagem com o recado.
  await ev("document.getElementById('seedInput').value = '42'; document.getElementById('startBtn').click()");
  await shot('1b-niveis.png');
  for (const [lv, file] of [['facil', '1c-facil'], ['dificil', '1d-xandao'], ['medio', '1e-pai']]) {
    await ev(`document.querySelector('button.level[data-level="${lv}"]').click()`);
    await sleep(150);
    await shot(file + '.png');
    if (lv !== 'medio') await ev("document.getElementById('backBtn').click()");
  }
  await ev("document.getElementById('goBtn').click()");
  assert.equal(await ev('EscapeGame.state().level'), 'medio', 'nível não chegou ao jogo');
  assert.equal(await ev("document.getElementById('modal').classList.contains('hidden')"), false, 'intro da fase 1 não abriu');
  await sleep(500);
  await shot('2-moraes.png');
  // Cena do Moraes e intro da fase: fecha os modais da fila.
  for (let i = 0; i < 5 && !(await ev("document.getElementById('modal').classList.contains('hidden')")); i++) {
    await ev("document.querySelector('#modalChoices button').click()");
    await sleep(150);
  }
  // Tráfico de influência começa fechado; abre para a captura e fecha de novo.
  assert.equal(await ev("document.getElementById('missionBody').classList.contains('hidden')"), true, 'dicas deviam começar fechadas');
  await ev("document.getElementById('missionBtn').click()");
  await shot('3-brasilia.png');
  await ev("document.getElementById('mission').scrollIntoView()");
  await shot('3c-dicas.png');
  await ev('window.scrollTo(0, 0)');
  await ev("document.getElementById('missionBtn').click()");

  // Clicar numa pessoa mostra quem é.
  const who = await ev(`(() => {
    const n = EscapeCore.PHASES[0].nodes.pai, [x, y] = EscapeMaps.center(...n.at);
    const r = document.getElementById('map').getBoundingClientRect();
    document.getElementById('map').dispatchEvent(new MouseEvent('click', { clientX: r.left + (x + 12) * r.width / EscapeMaps.W, clientY: r.top + (y - 8) * r.height / EscapeMaps.H, bubbles: true }));
    return document.getElementById('toast').textContent;
  })()`);
  assert(who.includes('Jairzão'), 'clique na pessoa não identificou: ' + who);
  await sleep(200);
  await shot('3a-quem-e.png');
  assert.equal(await ev('EscapeGame.state().node'), 'apto', 'identificar não devia mover');

  // Clique no mapa: tocar num vizinho brilhando faz a família andar até lá.
  const clicked = await ev(`(() => {
    const s = EscapeGame.state(), n = EscapeCore.PHASES[0].nodes.loja, [x, y] = EscapeMaps.center(...n.at);
    const r = document.getElementById('map').getBoundingClientRect();
    document.getElementById('map').dispatchEvent(new MouseEvent('click', { clientX: r.left + x * r.width / EscapeMaps.W, clientY: r.top + y * r.height / EscapeMaps.H, bubbles: true }));
    return s.node;
  })()`);
  assert.equal(clicked, 'loja', 'o clique no mapa não moveu a família');
  await sleep(900);
  await shot('3b-resultado.png');

  // Joga até o fim clicando nos botões reais: o botão ★ PRÓXIMO PASSO, ou a sugestão dentro do plantão.
  const policy = `(() => {
    const modal = !document.getElementById('modal').classList.contains('hidden');
    if (modal) {
      const want = EscapeGame.queue().length ? '' : EscapeCore.suggest(EscapeGame.state());
      const b = [...document.querySelectorAll('#modalChoices button')].find(x => want && x.dataset.id === want) || document.querySelector('#modalChoices button');
      b.click(); return 'modal:' + b.dataset.id;
    }
    const next = document.querySelector('#nextBox .next');
    if (!next) return 'SEM-BOTAO ' + JSON.stringify({ pending: EscapeGame.state().pending, q: EscapeGame.queue().length, sug: EscapeCore.suggest(EscapeGame.state()), html: document.getElementById('actions').innerHTML.slice(0, 200) });
    next.click(); return next.dataset.id;
  })()`;
  let tookCard = false, teleported = false;
  const shotTags = new Set();
  const phaseShots = new Set();
  for (let i = 0; i < 900; i++) {
    if (!(await ev("document.getElementById('end').classList.contains('hidden')"))) break;
    const st = await ev('({ ended: !!EscapeGame.state().ended, phase: EscapeGame.state().phase, modal: !document.getElementById("modal").classList.contains("hidden") })');
    if (st.ended) { if (st.modal) await ev("document.querySelector('#modalChoices button').click()"); await sleep(600); continue; }
    const tag = await ev("document.getElementById('modal').classList.contains('hidden') ? '' : document.getElementById('modalTag').textContent");
    if (!tookCard && tag === 'PLANTÃO URGENTE') { await shot('4-plantao.png'); tookCard = true; }
    if (!shotTags.has('roll') && tag.includes('FALHOU') && tag.startsWith('🎲 O DADO')) {
      shotTags.add('roll');
      await ev("document.querySelector('.rigBtn').click()");
      await sleep(700);
      await shot('4b-dado-falhou.png');
    }
    if (!shotTags.has('milei') && tag.startsWith('PUERTO')) { shotTags.add('milei'); await sleep(200); await shot('5d-milei.png'); }
    if (!shotTags.has('attack') && tag.startsWith('☭')) { shotTags.add('attack'); await sleep(300); await shot('4c-ataque.png'); }
    if (!shotTags.has('ok') && tag.startsWith('🎲 SUCESSO')) { shotTags.add('ok'); await sleep(700); await shot('4d-sucesso.png'); }
    if (!st.modal && !phaseShots.has(st.phase)) {
      phaseShots.add(st.phase);
      await sleep(400);
      await shot(`5-fase${st.phase + 1}.png`);
    }
    if (!teleported && st.phase === 1 && !st.modal && !(await ev('EscapeGame.queue().length'))) {
      // Teletransporte: abre o modo, mostra os destinos em verde e salta para o curral.
      await ev("document.getElementById('pTp').click()");
      await shot('5b-teletransporte.png');
      await ev("EscapeGame.play('tp:curral')");
      await sleep(350);
      await shot('5c-teletransporte.png');
      assert.equal(await ev('EscapeGame.state().node'), 'curral', 'teletransporte falhou');
      teleported = true;
      continue;
    }
    const did = await ev(policy);
    if (did.startsWith('SEM-BOTAO')) { console.log(did, errors, await ev('JSON.stringify(EscapeGame.queue().map(x => x.type))')); await shot('erro.png'); throw Error('sem botão de próximo passo'); }
    await sleep(40);
  }
  await sleep(1200);
  assert.equal(await ev("document.getElementById('end').classList.contains('hidden')"), false, 'tela final não apareceu');
  const ending = await ev('EscapeGame.state().ended.type');
  await sleep(800);
  await shot('6-fim.png');

  await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await ev("document.getElementById('replayBtn').click(); document.querySelector('#modalChoices button').click()");
  await shot('7-desktop.png');

  // Menu do jogo volta ao título; no título, fechar mostra o aviso e o Xandão.
  await ev("document.querySelector('#modalChoices button') && !document.getElementById('modal').classList.contains('hidden') && document.querySelector('#modalChoices button').click()");
  await sleep(300);
  await ev("document.getElementById('menuBtn').click()");
  await shot('8-menu.png');
  await ev("[...document.querySelectorAll('#modalChoices button')].find(b => b.textContent.includes('tela principal')).click()");
  assert.equal(await ev("document.getElementById('title').classList.contains('hidden')"), false, 'menu não voltou ao título');
  await ev("document.getElementById('quitBtn').click()");
  await shot('9a-aviso.png');
  await ev("document.querySelector('#modalChoices button').click()");
  await sleep(200);
  await shot('9b-acabou.png');
  assert(String(await ev("document.getElementById('modalTitle').textContent")).includes('ACABOU'), 'Xandão não disse ACABOU');

  assert.deepEqual(errors, [], 'erros de JavaScript na página');
  console.log(`Navegador OK: níveis, quem é quem, Mileto ${shotTags.has('milei') ? 'visto' : 'não alcançado'}, título, intro, clique no mapa, teletransporte, plantão ${tookCard ? 'visto' : 'não sorteado'}, final "${ending}". Capturas em tests/shots/.`);
  ws.close();
  browser.kill();
})().catch(e => { console.error(e); browser.kill(); process.exitCode = 1; });
