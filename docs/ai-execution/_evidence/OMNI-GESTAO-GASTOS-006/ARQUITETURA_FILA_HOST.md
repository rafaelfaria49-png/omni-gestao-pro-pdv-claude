# Decisão G006 — PostgreSQL, identidade de origem e runtime

Decisão de código; contratação/configuração/implantação NÃO autorizadas. `CLOUD_RUNTIME_PROOF=BLOCKED_EXTERNAL`. Execução local não certifica nuvem.

## Fila e fronteiras

PostgreSQL é a autoridade: inbox+job na mesma transação antes do ACK, unique(META,phoneNumberId,externalMessageId), SKIP LOCKED, ordenação runAfter/createdAt/id e relógio DB. Não há Redis, fila em memória ou after() como autoridade. O timer apenas acorda o consumidor/heartbeat; reinício lê o mesmo estado persistido.

GESTAO é global sem Store; ATENDIMENTO conserva Store. phoneNumberId/E164 são únicos e a migration cruza ambos com WhatsAppPhoneNumber legado. WABA/app e credencialRef são explícitos. Cadastro inicia inativo. Identidade é imutável; ativação/rotação incrementa versão e bloqueia origens antigas para revisão, sem fallback para outro canal.

WhatsAppGestaoInbox guarda conteúdo e referências de mídia privados, correlação, reply, identidade e timestamps, sem inventar usuário/perfil/loja. Conclusão STAGING_PRIVADO significa armazenamento/aguardo de vínculo, nunca gasto aplicado. Nenhuma rota Meta ou Inbox comercial foi modificada.

G007 fornecerá VerificadorVinculo: recebe canal/phoneNumberId/remetente e transaction client, valida a identidade e versão atuais e toma os locks pertinentes nessa transação. Ausente por padrão. Os verificados dos testes são fixtures, não binding real. GastoOrigemCanal fixa inbox, grupo, perfil/store, autor e referência/versão verificados ANTES da aplicação futura G004. Não guarda outro lançamento nem resultado financeiro. G008 deverá usar essa identidade antes de chamar os serviços canônicos; o worker G006 nunca importa/chama apply ou fabrica sessão NextAuth.

O dispatcher encontra apenas operações APLICADA e resultado/outbox G004 correspondentes à origem. Um GastoJob ENVIAR_RESULTADO único por outbox referencia o fato existente. A outbox permanece imutável/PENDENTE conforme G004: estado de entrega vive no job. Outboxes do HUB sem origem WhatsApp não são roteadas nem recebem destinatário inferido. Queda após commit financeiro recupera o resultado por essa relação, sem reaplicar dinheiro.

## Lease, retry e observação

Todo claim recebe token novo; heartbeat/conclusão/falha exigem owner+token+lease ainda vigente no DB. Worker antigo e lease expirada sem sucessor são recusados. Tentativas totais nunca diminuem; limite por ciclo e prazo24h terminalizam indisponibilidade. Reprocessamento autorizado zera só o ciclo, preserva identidade, contador total e eventos append-only.

Falha local antes da fronteira externa e 429 com rejeição comprovada podem tentar novamente com backoff exponencial, jitter e Retry-After limitado. 401/403, configuração, payload e poison estacionam. Antes do port externo, INICIADO é commitado. Timeout/5xx/ambiguidade/queda nesse estado viram ENVIO_INCERTO, sem retry automático. Uma resposta ACEITO com ID não declara ENTREGUE. Prova posterior precisa do MESMO job/canal/ID e operador SQL autorizado; só NAO_ENVIADO comprovado permite reprocessar a mesma identidade.

G006 aceita somente TransporteSimulado/ProvaSimulada injetados. O daemon padrão é STAGING. O port não importa fetch/sendTextMessage; reaproveita o contrato WhatsAppCloudCredentials do cliente existente e resolve token exclusivamente pela referência do canal. Adaptar transporte/status Meta real pertence ao gate posterior, sem alegar exatamente uma entrega externa.

Logs contêm evento/código constante/versão e contagens por estado. Histórico técnico não contém conteúdo, valores, telefone ou token. Worker técnico lê staging e resultados necessários; operador lê somente IDs técnicos de origem, jobs/eventos. Nenhum acesso humano a conteúdo privado é concedido por esta fundação.

## Host previsto e alternativas

Referências consultadas em25/10/2026, sem acesso a contas ou contratação:

| Opção | Adequação e decisão |
|---|---|
| Render Background Worker | Host previsto para prova isolada: processo contínuo sem entrada pública. Node24 pode ser fixado por configuração do serviço; build/start/segredos/região exigem gate próprio. [Worker](https://render.com/docs/background-workers), [Node](https://render.com/docs/node-version). |
| Vercel Functions/cron | Não assumir daemon em uma requisição ou after(). Funções têm limite de duração; um consumidor em lotes acionado por scheduler precisaria de configuração/acionamento e provas próprios. [Limites](https://vercel.com/docs/functions/limitations). |
| Vercel Daemons | Alternativa técnica existente em beta, com consumidores de fila; a documentação atual restringe a ambientes Production, sem Preview. Não há prova de entitlement/configuração nem autorização para usar Production nesta trilha. Requer avaliação separada de imagem/configuração/ambiente. [Daemons](https://vercel.com/docs/daemons). |

Nenhum host autorizado de Gastos foi identificado no pedido/pacote; não reutilizar VPS/serviço de outra frente. Não foram criados serviço, conta, pipeline, Dockerfile, vercel.json ou dependências. A decisão por Render é proposta revisável, não infraestrutura disponível.

Custos dependem de plano/compute permanente, região, conexão/egress do PostgreSQL e retenção de logs. A página de [preços](https://render.com/pricing) não forneceu uma cotação completa legível para este cenário; não inventar valor nem presumir gratuidade. Exigir orçamento e autorização do responsável antes de contratar. Meta/STT/OCR/storage não foram usados; são gates posteriores.

## Contrato concreto da prova cloud pendente

Liberar host/projeto/região de homologação exclusivo, orçamento, responsável, commit de imagem/fonte e política de logs/retenção. Fornecer URL de candidate com TLS/identidade confirmada e login omni_gastos_worker sem owner/BYPASSRLS/DML financeiro. Aprovar migration/grants SOMENTE no ambiente alvo. Configurar Node24.22.1, npm ci --include=dev (tsx já fixado no lock), Prisma gerado no host Linux e comando node --import tsx workers/gastos/index.ts. Não enviar o engine Windows; não executar migrate/Next build como bootstrap do worker.

Usar GASTOS_WORKER_ENV=homologacao, MODE=STAGING e somente dados sintéticos, sem tokens Meta e sem binding real. Capturar deployment/commit, versão Node, identidade DB redigida, logs/health, dois workers disputando e lease recuperada após encerrar uma instância. Demonstrar continuidade sem processo/túnel/navegador Windows. Registrar provedores externos como NÃO ACIONADOS. A prova precisa ocorrer no host autorizado, sem substituir logs reais por simulação local. Só então avaliar CLOUD_RUNTIME_PROVEN e G006_COMPLETE; nenhuma ativação G007 é consequência automática.

Homologação futura exige nome exclusivo gastos_g006_hml_<identificador> aprovado e configurado em GASTOS_WORKER_APPROVED_DATABASE. O loader compara esse nome com a URL remota TLS; nenhum candidate produtivo é presumido.
