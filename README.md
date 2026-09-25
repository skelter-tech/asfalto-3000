# Asfalto 3000

Corrida arcade 3D no navegador, com a alma do Top Gear 3000 e o acabamento de um
Horizon Chase: 4 planetas, 12 pistas, 11 rivais, nitro, turbo na pista, energia,
garagem com upgrades e trilha synthwave gerada em tempo real.

Roda no computador e no celular, sem instalar nada.

## Como jogar

| | Teclado | Celular | Controle |
|---|---|---|---|
| Virar | ← → ou A D | ◀ ▶ | analógico / direcional |
| Acelerar | ↑ ou W | automático | A ou RT |
| Frear | ↓ ou S | FREIO | B ou LT |
| Nitro | Espaço | NITRO | X, Y ou RB |
| Câmera | C | Opções | LB |
| Pausa | P ou Esc | ❚❚ | Start |

- **Largada perfeita:** acelere (ou toque NITRO) no último instante antes do VAI!
- **Pódio libera a próxima pista.** Chegue até o 3º lugar.
- **Energia** cai com a distância e com batidas. Pegue os cristais verdes.
- **Moedas** e prêmios viram créditos para a garagem: motor, turbina, pneus, nitro e blindagem.
- Nas curvas o carro é jogado para fora. Quanto mais rápido, mais força. Pneus melhores ajudam.

## Os planetas

1. **Terra Nova** — litoral, palmeiras e metrópole no horizonte (manhã, pôr do sol, noite)
2. **Duna Vermelha** — Marte: cânions, domos e o pôr do sol azul marciano
3. **Cristalis** — lua gelada de cristais, com aurora
4. **Neo Tóquio 3000** — via expressa entre torres e arcos de néon

## Publicar na Vercel

O jogo é um site estático, sem etapa de build.

1. Entre em [vercel.com/new](https://vercel.com/new) e importe este repositório.
2. Framework Preset: **Other**. Build Command: vazio. Output Directory: vazio (raiz).
3. Clique em **Deploy**. A cada `git push` a Vercel publica de novo.

No celular, abra o link, toque em **Tela cheia** e jogue na horizontal. Dá para
adicionar à tela inicial (é um app instalável).

## Rodar localmente

```bash
npx http-server -c-1 .
# ou
python3 -m http.server 8000
```

Abra `http://localhost:8080` (ou a porta indicada). Precisa ser servido por HTTP
porque usa módulos ES.

## Como é feito

- [three.js](https://threejs.org) r169 (incluído em `vendor/`, licença MIT), com bloom no modo de gráficos Alta.
- Pistas geradas por código: curvas polares fechadas com morros, zebras e faixas alternadas.
- Todos os modelos (carros, palmeiras, cristais, prédios) são geometria low-poly criada no código.
- Som 100% sintetizado com Web Audio: motor com troca de marchas, efeitos e música.
- Progresso salvo no navegador (`localStorage`).
- Resolução dinâmica: se o aparelho cair abaixo de ~45 fps, a resolução baixa sozinha.

```
index.html        telas e HUD
css/style.css     visual da interface
js/main.js        laço do jogo, telas, garagem, render
js/race.js        física, IA, colisões, itens, câmera
js/track.js       gerador de pistas
js/world.js       céu, cenário, luz
js/models.js      carro e objetos low-poly
js/audio.js       motor, efeitos e música
js/data.js        planetas, pistas, upgrades
```
