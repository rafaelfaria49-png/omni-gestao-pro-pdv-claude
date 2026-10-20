# CAD-R2-021 — alternativas de voz e evidência de compatibilidade

## Implementação — 19/10/2026 (desbloqueio autorizado pelo responsável do produto)

Escolhida a **alternativa A (local estrita)**. A **B (remota) continua não aprovada e sem caminho de código**, nem como fallback. A **C (texto)** está preservada. A autorização é de produto/desenvolvimento, não parecer jurídico nem aprovação de fornecedor (ver VOICE-GOVERNANCE.md).

| Ponto | Implementação |
| --- | --- |
| Política | `CLIENT_VOICE_POLICY` congelada em runtime (`lib/cadastros/voice-capture/cliente.ts`): `processing: "local-only"`, `remoteFallback: false`, pt-BR, 30 s, 2000 caracteres, `storesAudio: false`, `autoSave: false`. Decisão de código, sem env/query/storage. Suspender = `enabled: false` (desliga UI e a origem `voice` na Action). |
| Disponibilidade | `lib/cadastros/voice-capture/local.ts`: exige contexto seguro e a API on-device completa (`processLocally` no protótipo + `available()`); consulta somente `available({langs:["pt-BR"], processLocally:true})`, timeout 5 s, sem construir motor nem pedir microfone. `SpeechRecognition` genérico sem essas peças = indisponível. |
| Respostas | `available` → "Ditar por voz"; `downloadable` → botão explícito "Instalar voz local pt-BR" (`install()` chamado no clique; baixa só o modelo do navegador); `downloading` → "Verificar voz local"; `unavailable`, `NotAllowedError` (política), outra rejeição, timeout, contexto inseguro ou API ausente → somente texto, com motivo exibido. |
| Início | Só após clique. Instância nova; `processLocally = true` antes de `start()`; se a instância não confirmar `processLocally === true`, não inicia e marca indisponível. `lang = "pt-BR"`, contínuo, resultados parciais. |
| Sessão | Parar (stop → finais → `end`), Cancelar (abort; eventos tardios descartados), parada automática em 30 s ou 2000 caracteres, carência de 5 s para `end` após parar/erro (senão abort), indicador "Ouvindo · m:ss de 0:30". |
| Ciclo de vida | Fechar o diálogo, Cancelar, trocar de loja (remount por `key`), Descartar, aba oculta (`visibilitychange`) e `pagehide` encerram o motor; serial por sessão e por consulta invalida callbacks antigos. |
| Erros | `not-allowed`/`service-not-allowed` → microfone bloqueado; `audio-capture`; `no-speech`; `language-not-supported` (pacote ausente → reconsulta); demais → mensagem constante. Todo término sem sucesso descarta o trecho temporário. |
| Transcrição | Só em estado React do editor. Ao concluir, vira texto editável no campo "Descreva o novo cliente", em linha própria, preservando o que foi digitado. Formatação visível: pontuação falada ("vírgula", "ponto e vírgula", "dois pontos", "arroba"/"ponto") e vírgula antes dos rótulos que o parser já conhece. Não extrai campos. |
| Interpretação | Mesmo `interpretarClienteTextoLivre` → `interpretarTextoCliente` (determinístico). A Action autentica/autoriza a loja e só então aceita os literais `text`/`voice`; a origem é rótulo, não autoriza nada e não altera parser, sugestão nem escrita. |
| Persistência | Inalterada: revisão campo a campo, confirmação explícita, `salvarClienteRevisado` → ClientWriteService (identidade, deduplicação, UNIQUE, isolamento de loja). Áudio, transcrição bruta e origem não entram no DTO. |
| Produto | `browser.ts`, `session.ts`, `types.ts`, `detect.ts`, `index.ts` e `produto-ia.tsx` sem alteração. Clientes reusa `reduceVoiceCapture`, os tipos de evento/snapshot e o contrato `VoiceBrowserSession`. |

`Permissions-Policy` do app já é `microphone=(self)`; `on-device-speech-recognition` tem allowlist padrão `self`. Nenhuma configuração alterada.

### Compatibilidade observada nesta máquina (19/10/2026)

Chrome 155.0.8059.80, Windows 11: API local presente (`processLocally`, `available`, `install`); `available(pt-BR, local)` = **downloadable** (pacote não instalado no perfil). Edge 155: não iniciou via Playwright neste host; sem conclusão sobre Edge. Playwright Chromium 136 (CI): sem API local → no produto, somente texto. Cada terminal é verificado em runtime; não há lista fixa de navegadores homologados.

Após o download autorizado (SODA 1.2.12 + pt-BR 1.3071.0), o Chrome 155 volta a responder `downloadable` a cada reinício até `install()` ser chamado de novo; offline, o clique só reativa os arquivos locais (11 ms). Nesta máquina o motor local recebeu a fala sintética em modo local, offline, mas não devolveu texto; causa não determinada (pressão de memória e motor sob automação/áudio falso seguem como hipóteses; detalhes em REPORT.md, "Captura real"). Caminhos do modelo acima de 260 caracteres impedem o motor de terminar: perfis reais ficam perto de 220, mas nomes de usuário Windows longos se aproximam do limite. Em qualquer falha o produto termina com "Nenhuma fala reconhecida" e mantém o texto. Requisito operacional sugerido para homologação: repetir o roteiro real em cada tipo de terminal.

### Modo remoto — documentado, não ativado

Remoto seria o reconhecimento do navegador sem `processLocally` (no Chrome, serviço do Google; no Edge, da Microsoft) ou um fornecedor contratado (seção B). Exposição: áudio, idioma, metadados técnicos e transcrição. Não existe código desse caminho em Clientes. Condições para um GOAL próprio: fornecedor e modalidade escolhidos; finalidade; países, suboperadores e acessos de suporte; retenção, treinamento e exclusão comprovados; DPA e mecanismo de transferência LGPD; avisos a atendentes e clientes; aprovação administrativa/jurídica registrada. Até lá, `remoteFallback: false`.

As seções seguintes registram a análise anterior à implementação; onde divergirem, vale a seção acima.

## Comparação para decisão

| Alternativa | Fluxo e exposição | Viabilidade / evidência que falta | Estado |
| --- | --- | --- | --- |
| A. Web Speech estritamente local | Áudio processado pelo navegador/dispositivo; eventual download de pacote é um fluxo separado que também precisa ser explicado. | Provar API local, pt-BR, pacote instalado, políticas, dispositivo e qualidade; existência de `SpeechRecognition` não basta. | NÃO HOMOLOGADA para os terminais da operação. |
| B. Serviço externo contratado | Áudio, idioma, metadados técnicos e transcrição trafegam para o serviço; endpoint, contrato e modalidade determinam outros destinatários. | Inventário contratual, regiões, suboperadores, retenção e aprovação específica; nenhum SDK/serviço integrado nesta continuação. | NÃO APROVADA; candidatos abaixo. |
| C. Digitação/colar texto revisado | Texto segue para a Action da própria aplicação, parser determinístico e campos revisados para ClientWriteService. | Fluxo já publicado em #282; regressões desta continuação devem preservá-lo. | ALTERNATIVA OBRIGATÓRIA e disponível. |

**Regra para qualquer implementação futura:** indisponibilidade do modo local encerra a tentativa e oferece texto. Não mudar `processLocally` para `false`, não usar o adapter remoto de Produto, não escolher fornecedor e não iniciar outro serviço silenciosamente.

## A — API local: critérios verificáveis

A propriedade `processLocally` exige processamento local e o valor padrão é `false`; deve ser fixada antes de qualquer início. A API ainda é experimental. [MDN: processLocally](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally).

O Chrome anunciou o recurso desktop em 139. O inventário BCD consultado registra Chrome desktop 139, Edge espelhado do Chromium, Firefox em preview e ausência desse recurso em Chrome Android/Safari/iOS. Isso descreve a API, não prova pacote pt-BR nem funcionamento em um terminal concreto. Revalidar versões antes de homologar. [Chrome 139](https://developer.chrome.com/blog/new-in-chrome-139?hl=en), [BCD de SpeechRecognition](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SpeechRecognition.json).

Uma futura homologação deverá registrar SO, navegador/versão, hardware, política corporativa e resultado de `available({langs:["pt-BR"], processLocally:true})`. `available` permite prosseguir apenas após as demais autorizações; `downloadable` e `downloading` não autorizam captura; `unavailable`, API ausente, rejeição ou timeout mantêm texto. Instalação de pacote exigirá uma ação separada e explícita. [Especificação Web Speech](https://webaudio.github.io/web-speech-api/).

`on-device-speech-recognition` controla `available()`/`install()`; a allowlist padrão é `self`. Conferir contexto seguro e Permissions-Policy, inclusive delegação em iframe. Permissão de microfone é outro controle e permissão concedida pelo navegador não representa autorização administrativa/jurídica. [MDN: Permissions-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/on-device-speech-recognition).

### Probe seguro entregue

`scripts/cadastros/audit-voice-compatibility.mjs` roda somente num harness localhost com microfone negado. Consulta metadados da API/pacote pt-BR; não constrói reconhecedor, não chama `start`, `install`, `getUserMedia` ou APIs de permissão. Bloqueia requisições de página para destinos externos. A saída `voice-compatibility.json` identifica navegador, API local e resultado efetivo da consulta. Não é importado pela aplicação.

Mesmo um resultado `available` não demonstra reconhecimento correto de nomes/endereços/CPFs, ausência de tráfego interno do navegador ou capacidade dos navegadores dos atendentes. Não foi autorizada nem executada captura real de áudio. Homologação operacional pt-BR permanece **PENDENTE**, sem promessa de processamento local no produto atual.

Resultado efetivo do primeiro CI (19/10/2026 03:20:29 UTC): Playwright Chromium **136.0.7103.25**, contexto seguro, reconhecimento genérico exposto, porém `processLocally`, `available` e `install` ausentes; `ptBR=NOT_CHECKABLE`. Zero requisições externas de página, motor não construído, áudio não iniciado e nenhum pacote instalado. Esse navegador de teste é anterior ao Chrome 139 que anunciou a API local; não se extrapola sua ausência para versões atuais nem se presume suporte na frota dos atendentes. A evidência demonstra justamente por que detecção genérica é insuficiente. O probe é repetido no CI do head final; o JSON do artefato é a observação canônica desse runner.

### Erros e lifecycle exigidos para a futura liberação

| Evento/condição | Comportamento exigido, sem fallback remoto |
| --- | --- |
| `not-allowed`, `service-not-allowed`, política negada | Parar, limpar bruto, explicar indisponibilidade e manter texto. |
| `language-not-supported`, pacote/API ausente | Não iniciar; informar falta de suporte local pt-BR. |
| `audio-capture`, `network`, `no-speech`, erro desconhecido | Encerrar sessão; mensagem constante sem conteúdo bruto; preservar formulário manual. |
| Cancelar/fechar, troca de loja/cliente, unmount, perda da sessão | Abortar motor e invalidar callbacks; limpar interim/transcrição. Resultados antigos não podem alcançar outro editor. |
| Timeout | Proposta para aprovação: teto de 30 s e 2000 caracteres, uma sessão por vez, encerramento explícito/automático sem reinício. Não implementado nem aprovado para voz. |
| Concluir | Mostrar transcrição temporária, permitir corrigir/descartar, revisão de campos e novo submit explícito; nunca autosave. |

Estados futuros deverão ser verificados com eventos sintéticos antes de qualquer piloto autorizado. A máquina compartilhada `session.ts` organiza estados de Produto; o snapshot de Clientes permanece `unavailable`. Não se alterou o comportamento de Produto para preparar Clientes.

## B — fornecedores potenciais, sem contratação ou integração

Todos os itens abaixo são condições de diligência, não escolha aprovada. Nenhuma conta, chave, endpoint produtivo ou contrato de voz de Clientes foi inspecionado ou configurado.

| Questão | Google Cloud Speech-to-Text, API V1 | Microsoft Azure Speech, reconhecimento em tempo real |
| --- | --- | --- |
| Dados/finalidade | Áudio, idioma/configuração, metadados de requisição e texto resultante para transcrever. | Áudio por SDK/REST, idioma/configuração, metadados técnicos e transcrição para o mesmo fim. |
| Países/região | FAQ V1: processamento global, ou endpoints limitados aos EUA/UE; país exato e suporte/acessos precisam ser contratualmente mapeados. Não extrapolar essa regra para V2. | `brazilsouth` (Brasil) consta no catálogo; a região/recurso/modalidade realmente contratados e acessos de suporte precisam ser confirmados. Região brasileira isoladamente não prova ausência de transferência internacional. |
| Retenção pública | FAQ distingue streaming (memória) de operações assíncronas, que podem reter transcrição aproximadamente 5 dias para consulta. Logs técnicos, backups, suporte e contrato precisam de evidência própria. | Documentação de tempo real declara processamento em memória e ausência de armazenamento do conteúdo nessa modalidade. Batch/customização têm regras diferentes; não generalizar para toda a conta. |
| Treinamento | Uso para melhoria está associado ao opt-in de data logging; exigir prova de opt-out e contrato aplicável. | Exigir cláusula/evidência sobre não treinamento, funções adicionais e diagnósticos; não inferir pelo simples uso do endpoint regional. |
| Exclusão | Confirmar API/modalidade e eventual logging: dados do programa opt-in não somem apenas com exclusão do projeto. | Confirmar modalidade; batch permite delete/TTL, sem confundir com tempo real. Verificar logs, suporte, cópias e backups. |
| Suboperadores | Lista pública inclui, para Speech-to-Text, LXT AI (Canadá, Índia, Romênia), Productive Playhouse (Índia, Tailândia, EUA), Sigma AI (Espanha, Reino Unido) e TELUS International AI (Bulgária, Finlândia, Índia). Aplicabilidade a uma modalidade/conta NÃO comprovada. | Lista oficial de Online Services disponível no Service Trust Portal. Relação aplicável ao recurso e respectivos países: **PENDENTE** de obtenção e confirmação contratual; não presumir que todos, ou nenhum, participam. |
| Instrumentos | CDPA/DPA, termos do produto, instruções, confidencialidade, medidas de segurança, subcontratação, exclusão e mecanismo LGPD de transferência: análise pendente. | Microsoft Products and Services DPA, termos do serviço e lista de subprocessadores; mesmas verificações LGPD pendentes. |

Fontes oficiais dos candidatos:

- [Google: uso e retenção por modalidade V1](https://docs.cloud.google.com/speech-to-text/docs/v1/data-usage-faq), [data logging](https://docs.cloud.google.com/speech-to-text/docs/v1/data-logging), [disponibilidade regional e distinção V2](https://docs.cloud.google.com/speech-to-text/docs/locations).
- [Google: subprocessadores e países](https://cloud.google.com/terms/subprocessors), [Cloud Data Processing Addendum](https://cloud.google.com/terms/data-processing-addendum).
- [Microsoft: dados de speech-to-text](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/speech-to-text/data-privacy-security), [regiões](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions).
- [Microsoft: DPA](https://www.microsoft.com/licensing/docs/view/Microsoft-Products-and-Services-Data-Protection-Addendum-DPA), [lista oficial de subprocessadores](https://servicetrust.microsoft.com/DocumentPage/dbd39f46-4f02-4653-8f66-2d7a3b75937c). A existência da lista foi verificada; seu conteúdo contratual aplicável não foi validado.

Reconhecimento genérico do navegador com processamento remoto seria ainda uma alternativa B: destinatários e retenção não ficam comprovados pela API. Não é atalho para dispensar a diligência de fornecedor.

## Fronteira de segurança atual

O gate é constante imutável, sem leitura de env, query, storage ou configuração externa. A Action autentica/autoriza a loja e aceita somente o discriminador literal `text`; a UI não importa o adapter de fala. Não existe credencial/endpoint de fornecedor nesse caminho. A Action de save aceita apenas campos revisados, sem áudio/transcrição/proveniência bruta e usa o ClientWriteService.

O discriminador não determina a origem física de uma string: um chamador pode fornecer texto obtido por meios externos, inclusive ditado do sistema operacional. O servidor não atesta que uma string foi digitada. Isso não ativa microfone, integração ou autorização de voz da aplicação; instruções operacionais e transparência precisam cobrir também ferramentas externas usadas pelo atendente.
