# Escape from Brazil: The Phantom of Communism

Jogo satírico de logística de fuga em pixel art 16 bits (Canvas 2D), para web e Android (shell WebView, como o VolleySim).
Projeto independente do VolleySim e do Volleyball Manager 2027.

- Documento de design: https://claude.ai/artifact/9nXsJNFqqjcufseL8vzin4
- Meta: versão web jogável no itch.io ao fim de 2026-10-30; Android em 2026-10-31.

Obra de ficção e paródia. Todos os nomes são fictícios (parecidos, nunca iguais, aos de figuras públicas); as notas "inspirado em" citam casos noticiados. Contatos e esconderijos são fictícios.

## Jogar

- **Navegador:** https://deguchiberne.github.io/escape-from-brazil/ (ou abra `index.html` direto do disco; não há build nem npm).
- **Android:** baixe o APK em Releases, ou gere com `cd android; .\gradlew.bat :app:assembleDebug` (precisa de `JAVA_HOME` apontando para o JBR do Android Studio e de `android/local.properties` com `sdk.dir`). Se o Gradle pegar outro Java (por exemplo, o JRE de uma extensão do VS Code, sem jlink), acrescente `"-Porg.gradle.java.installations.auto-detect=false" "-Porg.gradle.java.installations.fromEnv=JAVA_HOME"`. O build copia o jogo web para os assets; o app é só uma casca WebView, offline.

## Versão 1.2.0

- Nomes: Fluvio, Fernandete, Jairo, Ronan e Charlitos Bozonero; Micheki Bozonero; Frabiccio Querijoz; Alejandro de Amores, o Xande; Pablito Marco; Danilo Torcaro; Chavo Miley; Polvo da Selva.
- Topo: ♪ ON · ? TUTORIAL · ☰ MENU, acima da data. O tutorial explica o jogo e cada botão.
- Primeira vez de cada botão: explica o que faz e pede confirmação; depois age direto.
- Na tela principal os botões mostram só o título e as etiquetas; textos longos só ao usar (🔒 mostra o motivo de um botão travado).
- Ações do local só aparecem quando a família chega.
- Modais sempre centralizados.
- 🔍 Zoom 2× do mapa com arrasto (padrão no celular); na caminhada a câmera segue a família.

## Versão 1.1.0

A versão fica em `core.js` (`VERSION`), aparece na tela inicial e o Android lê dela (`versionName` 1.1.0, `versionCode` 10100).

- Painel **TRÁFICO DE INFLUÊNCIA** (antes "Missão") perto do fim da tela: dicas e o ★ próximo passo só aparecem ao tocar.
- Poderes sobre o mapa: 📱 Fake news à esquerda, 👻 Teleporte à direita.
- "ESPERAR 72H" (brincadeira: são só duas).
- Cerco e Paranoia em linhas próprias e maiores; dinheiro menor.
- ☰ MENU no jogo para voltar à tela principal; FECHAR O JOGO na tela principal (aviso e o Xande: "ACABOU.").
- Nomes fictícios mais distantes dos reais (veja `NAMES` em `core.js`).

## Dificuldade

- **FÁCIL** (o Fluvio: "Sempre trabalhei duro."): mais dinheiro, 3 fake news, 3 teletransportes, +3 em todo dado, Cerco 30% mais lento.
- **MEIO FÁCIL** (o Pai, preso em casa: "Você é da família... tudo de mão beijada, talquei!"): +1 nos dados, Cerco 15% mais lento.
- **MENOS FÁCIL** (o Xande: "Sem imunidade."): o equilíbrio original.

Seguindo sempre o botão ★, o bot dos testes vence cerca de 90%, 70% e 50% das partidas, respectivamente.

## Regras de RPG

- Ações arriscadas rolam **1d20 + modificador contra uma CD** mostrada no botão (🎲 CD 12). 20 natural sempre passa, 1 natural sempre falha.
- Falhar nunca trava o jogo: a ação acontece, mas com preço maior (mais Cerco, menos dinheiro).
- Na falha, **"Esse dado não é auditado"** deixa escolher o número; em troca, Paranoia +12 e o Fantasma do Comunismo ganha força (ataca mais com mamadeira ou kit).
- **Blitz**: policiais parados nas estradas (em vermelho no mapa). Passar por uma estrada com blitz pede dado; sem blitz, não.
- Toda ação termina num modal com o que aconteceu e os bônus/ônus.

## Arquivos

- `core.js` — motor determinístico (UMD `EscapeCore`): fases, contatos, dinheiro vivo e malas, Cerco/Paranoia, ameaças reais e falsas (Fantasma), cartas de plantão, finais. Também os personagens do mapa (pai, irmão caçula, coach, ex-assessor, Miley na Argentina; todos com nomes fictícios em `NAMES`), os três níveis de dificuldade (`LEVELS`), os poderes (fake news, teletransporte do Fantasma Verde-e-Amarelo), o rastro e a ajuda ao jogador: `goals()` (missão da fase) e `suggest()` (próximo passo seguro, que os testes usam como bot). Mesma seed + mesmas ações = mesma partida.
- `maps.js` — mapas isométricos 10×10 no estilo SimCity 2000: chão em cache, estradas em "L" que também são o caminho da família, prédios em caixas isométricas e um marco por fase.
- `sprites.js` — sprites "chibi" no estilo RPG portátil (meia matriz espelhada) e objetos (fantasmas, mala, helicóptero, jato).
- `game.js` — desenho do mapa, caminhada da família, polícia e fantasmas nas ruas, balões, HUD, missão, ações com etiquetas de custo, plantão (modal), cenas finais (helicóptero em Miami) e som chiptune via Web Audio.
- `index.html`, `style.css` — telas de título, dificuldade, jogo e final. `fonts/` — Press Start 2P e VT323 (SIL OFL), embutidas para funcionar offline.
- `android/` — app Android (WebView) que empacota o jogo web.

## Testes

- `node tests/core.test.cjs` — regras do motor, determinismo, bot (a própria sugestão do jogo) que precisa vencer ≥ 40/60 seeds, jogador aleatório sempre chega a um final, poderes, rastro e personagens.
- `node scripts/qa-browser.cjs` — Chrome headless joga uma partida inteira pela interface (clique no mapa, teletransporte, botão ★) e salva capturas de cada fase em `tests/shots/` (falha se houver erro de JavaScript). Usa o Chrome em `C:/Program Files/Google/Chrome/Application/chrome.exe`.

`tests/shots/` e `tests/browser-profile/` são gerados pelo QA e não fazem parte do jogo publicado.
