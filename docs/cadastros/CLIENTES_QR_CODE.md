# Clientes — contato por QR Code (vCard)

Evolução funcional do Cadastros HUB sobre a main publicada após a PR #297 (importação
vCard). Não cria nem renumera CAD-R2/GOAL; não reabre #294–#297. AEP opt-in inativo na
worktree; nenhum state, ledger ou registry alterado.

## O que o operador faz

Em **Clientes → Novo → Importar contato**, a área **QR Code do contato** oferece:

1. **Ler QR Code com câmera** — só por clique. A prévia da câmera aparece com indicador
   pulsante ("Câmera ligada…"). O primeiro QR reconhecido desliga a câmera e o contato
   vai para a prévia.
2. **Escolher imagem de QR Code** — PNG, JPG ou WebP, para dispositivos sem câmera ou
   sem permissão.
3. **Cancelar leitura** (câmera ou imagem em andamento) e **Repetir tentativa** (após
   erro ou QR incompatível pela câmera).

A partir daí é o importador da #297, sem segunda interface: escolha de contato, prévia
editável, escolha explícita entre vários telefones/emails/endereços, divergências
explícitas, "Aplicar aos campos vazios", substituição consciente, revisão,
"Revisei os dados e confirmo o cadastro." e **Salvar cliente** →
`salvarClienteRevisado` → `ClientWriteService`. Nada é salvo ao ler, interpretar ou
aplicar. A câmera nunca abre ao entrar em Clientes nem ao abrir a importação.

## Decodificação local

| Etapa | Como |
| --- | --- |
| Imagem | Tamanho checado antes de ler (≤ 10 MiB). Formato e dimensões lidos do **cabeçalho** (PNG IHDR, JPEG SOF, WebP VP8/VP8L/VP8X), não do MIME nem da extensão. Limites antes de decodificar pixels: ≤ 10.000 px de lado e ≤ 36 MP; as dimensões reais do bitmap são conferidas de novo. Reduzida para ≤ 1.600 px de lado antes da leitura. |
| Câmera | `getUserMedia` só vídeo (sem microfone), câmera traseira preferida. Um quadro a cada 250 ms, sem sobreposição, reduzido para ≤ 960 px. Desliga sozinha em 60 s. |
| Decodificador | `jsqr@1.4.0` (Apache-2.0, sem dependências, sem rede/eval; ~250 KB não minificado), carregado sob demanda como chunk do próprio app — sem CDN. Lê os **bytes exatos** do QR. O `BarcodeDetector` nativo só é consultado quando existe, suporta `qr_code` e o jsQR não achou nada no quadro. |
| Conteúdo | Até 4.096 bytes (um QR comporta 2.953). Bytes → UTF-8 estrito → `parseVcardBytes` (mesmo parser, versões, limites e mensagens da #297). Texto do detector nativo → `parseVcardText`; texto com "Ã©" (UTF-8 lido como Latin-1 pelo sistema) ou U+FFFD é recusado, nunca "corrigido". Modo Kanji ou ECI ≠ UTF-8 com bytes não ASCII: recusa de codificação. |
| Recusas | Link (http/https, www., mailto:, tel:, javascript:, data: …), PIX (BR Code), Wi-Fi, MECARD, texto comum, conteúdo desconhecido, mais de um QR na imagem, nenhum QR, imagem corrompida — cada um com mensagem própria que **não ecoa** o conteúdo. O link não é aberto nem requisitado. |

Por que não só o nativo: `BarcodeDetector` não existe no Chrome desktop do Windows,
no Firefox nem no Safari, e devolve texto já decodificado pelo sistema (acento pode
chegar trocado). Alternativas avaliadas: `zxing-wasm` (mantido, mas baixa o `.wasm`
de CDN por padrão e é bem maior) e `@zxing/library` (~12 MB, em manutenção). O jsQR
não tem release desde 2021, mas é estável, pequeno, sem dependências e sem advisories
no GitHub; a decisão fica registrada aqui. `qrcode-generator@2.0.4` (MIT, sem
dependências) entra só como devDependency para gerar QRs sintéticos nos testes.

## Ciclo de vida da câmera

A captura termina, com `track.stop()` em todas as tracks reais, `video.srcObject = null`,
timers e loop cancelados, quando: QR reconhecido (antes de entregar à prévia), operador
cancela, "Cancelar importação", fechar o diálogo, trocar de loja (o editor remonta),
aba oculta (`visibilitychange`), `pagehide`, track encerrada pelo sistema, falha de
`play()`/leitura, vários QR no quadro, 60 s sem QR, ou quando o operador escolhe um
`.vcf`/imagem ou edita o texto colado. Permissão que chega depois do cancelamento tem a
track encerrada na hora. Erros de permissão/dispositivo (`NotAllowedError`,
`NotFoundError`, `NotReadableError`, `NotSupportedError`, contexto inseguro) viram
mensagens que apontam imagem, `.vcf` e texto colado.

Concorrência: toda leitura (imagem ou câmera) usa o mesmo número de série do
importador; tentativa antiga, troca de arquivo, cancelamento e troca de loja invalidam
resultados atrasados. A câmera só fala com a prévia se ainda for a captura corrente, e
o primeiro QR já a encerrou: a mesma leitura repetida não reimporta nem apaga edições.

## Cabeçalho `Permissions-Policy`

Antes desta entrega o app enviava `camera=()`, que bloqueia a câmera em todo o site
(`getUserMedia` → `NotAllowedError`), inclusive na própria origem. Para a leitura por
câmera funcionar no sistema real, `next.config.mjs` passou a enviar
`camera=(self), microphone=(self), geolocation=(), interest-cohort=()`: câmera só na
própria origem (iframes de terceiros continuam sem câmera), sempre por clique e com o
pedido de permissão do navegador. O harness de smoke de Clientes espelha a mesma
política. O E2E confere o cabeçalho servido pelo `next start`.

## Privacidade

Imagem, quadros, QR bruto, nome do arquivo e dados não utilizados não vão a servidor,
banco, `localStorage`/`sessionStorage`/IndexedDB, URL, logs ou telemetria. Só os campos
revisados seguem em `salvarClienteRevisado` (contrato inalterado). Sem Server Action
nova, sem Prisma no fluxo, sem schema/migration, sem provedor de OCR/visão/IA.

## Arquivos

- `lib/cadastros/vcard/qr.ts` — limites, inspeção do cabeçalho, classificação, bytes/texto → parser vCard.
- `lib/cadastros/vcard/qr-browser.ts` — leitura da imagem e câmera (jsQR sob demanda, detector nativo, liberação de recursos).
- `lib/cadastros/vcard/__fixtures__/qr.ts` — QRs sintéticos (matriz, RGBA, PNG).
- `components/cadastros/lovable/components/cadastros/ClienteVcardImport.tsx` — área "QR Code do contato" dentro da importação existente.
- `package.json` / `package-lock.json` — `jsqr` (dependência) e `qrcode-generator` (devDependency), versões exatas.
- `next.config.mjs` — `Permissions-Policy` com `camera=(self)`; `scripts/cadastros/cliente-editor-harness.mjs` espelha a política.
- `.github/workflows/cadastros-cliente-assistido.yml` — inclui `ClienteVcardQr.test.ts`; `ramos-cadastros.yml` — nome do passo E2E.

## Testes

| Tipo | Arquivo | Cobertura |
| --- | --- | --- |
| Unitário (jsQR real) | `lib/cadastros/vcard/qr.test.ts` | QR vCard 3.0/4.0 com nome, telefone, email, endereço e acentos; QR invertido; 2.1 com a mensagem do parser; link, PIX, Wi-Fi, MECARD, texto; UTF-8 inválido, Kanji, ECI; limite de conteúdo; imagem sem QR; texto nativo com acento trocado; cabeçalhos PNG/JPEG/WebP, formato pelo conteúdo, limites de dimensão/área/bytes, cabeçalhos corrompidos e JPEG com muitos segmentos |
| Ciclo de vida | `lib/cadastros/vcard/qr-browser.test.ts` | sem suporte/contexto inseguro; erros de permissão e dispositivo; só vídeo; `play()` recusado; primeiro QR encerra antes de entregar e uma vez só; intervalo sem sobreposição; cancelar antes da permissão e durante a leitura; 60 s; track encerrada; vários QR; imagem: bitmap fechado, canvas liberado, dimensões reais, corrompida, sem QR, nativo só como segunda tentativa |
| Componente (jsdom, editor real) | `ClienteVcardQr.test.ts` | câmera nunca automática; imagem → mesma prévia → manual preservado → aplicar → salvar só após confirmar; link/PIX/Wi-Fi sem abrir nada; conteúdo vs extensão, 10 MiB sem leitura, corrompida; troca de imagem, cancelar e troca de loja descartam leitura atrasada; câmera: indicador, entrega única, leitura repetida não reimporta, tentativa antiga ignorada, repetir; permissão negada/sem dispositivo/ocupada; sem câmera a imagem segue; câmera real encerrada por cancelar, cancelar importação, `.vcf`, texto colado, aba oculta, pagehide, fechar diálogo e troca de loja; permissão tardia; privacidade |
| E2E autenticado | `e2e/cadastros-ramos/06-clientes-qr.spec.ts`, `07-clientes-qr-camera.spec.ts` (job `e2e-authenticated` de `Ramos e Cadastros`) | build de produção + `next start` + PostgreSQL descartável + NextAuth real. Imagem PNG sintética → jsQR real no Chromium (sem `BarcodeDetector`: caminho "sem suporte nativo") → prévia → aplicar → revisar → salvar (duplo clique = 1 Server Action, 1 registro na loja B) → buscar → reabrir → novo login → banco conferido; nenhum byte da imagem, QR bruto, nota, link ou CEP saiu do navegador nem foi para storage. JPEG e WebP reais, link/PIX/texto, imagem sem QR, corrompida e > 10 MiB, cancelar sem gravar, troca de loja, 390/320/1440 px. Câmera com dispositivo sintético do Chromium (vídeo Y4M gerado com o QR): permissão concedida → indicador → QR lido → tracks `ended` → salvar; câmera viva sem QR → cancelar e fechar encerram as tracks; permissão negada → mensagem com alternativas, nenhuma track |

Mutação conferida: sem a guarda de "captura corrente", a leitura repetida reimporta
(teste falha); sem `stop()` ao limpar, 5 testes de encerramento falham.

## Voz (frente preservada) — intermitência sob carga

Nada de voz, diagnóstico, política de áudio ou parser de texto livre foi alterado. Local
(Node 26, `--no-experimental-webstorage`, `--maxWorkers=2`, mesmo conjunto: `lib/cadastros`
+ `ClienteEditor.test.ts` + `ClienteVcardImport.test.ts`), trocando só o
`ClienteVcardImport.tsx` entre a versão da main e a candidata: **main 0 falhas em 8
execuções; candidata 1 em 8** ("switching store aborts capture…"). Numa rodada maior
(com rotas e actions), a candidata teve 1 falha em outro teste de voz ("closing the
dialog aborts the engine…"). Isolado, `ClienteEditor.test.ts` passou 37/37 em 3
execuções. Os testes que falharam usam `findByRole` com timeout de 1 s e mudam de uma
execução para outra; com a importação fechada, o componente só acrescenta um listener
de `visibilitychange`/`pagehide` que retorna sem câmera ativa. Sem mecanismo causal
identificado, mas a amostra não basta para afirmar que é a intermitência histórica do
CAD-R2-021 (que a #297 mediu em 4/8 na main): fica registrada como **inconclusiva**.
Não foi corrigida aqui (fora do escopo).

## Limitações

- **Câmera física não homologada.** A câmera é provada com o dispositivo sintético do
  Chromium; um aparelho real (foco, luz, reflexo, permissões do sistema) ainda precisa
  de teste na loja.
- O `BarcodeDetector` nativo não existe no Chromium da CI: o caminho nativo é coberto
  por testes com detector simulado, não por navegador real com suporte.
- O "headless shell" do Playwright não tem `getUserMedia`; o E2E de câmera usa o
  Chromium completo (`channel: "chromium"`). O padrão animado embutido do Chromium
  encerra a track em < 1 s localmente, por isso o E2E usa vídeo Y4M.
- jsQR é síncrono: o tempo por leitura é limitado pelo teto de pixels (≤ 2,6 MP por
  imagem, ≤ 0,9 MP por quadro), não por cancelamento no meio do quadro.
- Só vCard. MECARD, contatos em lote, agenda do dispositivo e QR com várias páginas não
  são suportados.

`docs/ai/CURRENT_STATUS.md` não foi alterado: a PR #290 (aberta) também o edita; este
documento é o handoff de estado da funcionalidade.
