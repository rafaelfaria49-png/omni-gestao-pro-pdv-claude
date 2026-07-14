# Contrato arquitetural do worker de validação XSD fiscal

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-XSD-ADR-P01-DECISION-002A` |
| ADR | `ADR-0010` |
| Data | 2026-07-14 |
| Estado | contrato arquitetural; sem implementação |
| Motor decidido | B2 — `xmllint`/libxml2 provisionado em worker containerizado |

## 1. Objetivo e limites

Este documento fixa o contrato conceitual entre o serviço fiscal interno e o futuro worker de
validação XSD da NFC-e. Ele não escolhe provedor, protocolo, linguagem de implementação, produto de
fila ou hospedagem. Também não cria API pública.

O worker tem uma única responsabilidade: validar um XML contra uma versão permitida do pacote XSD
oficial, offline, e devolver resultado estruturado e auditável. Ele não calcula tributos, não assina,
não recebe certificado/CSC, não transmite à SEFAZ, não emite e não escreve diretamente no domínio de
vendas.

## 2. Posição na arquitetura

```text
PDV / aplicação
        ↓
serviço fiscal interno
        ↓
persistência do job fiscal
        ↓
fila persistente
        ↓
worker fiscal containerizado
        ↓
xmllint provisionado + XSD oficial local
        ↓
resultado persistido
        ↓
próxima etapa do pipeline
```

Ordem obrigatória da esteira:

```text
snapshot → tributos → XML → validação XSD → assinatura → regras/gates → transmissão
```

O serviço orquestrador só avança após resultado conclusivo `VALIDACAO_APROVADA`. A falha fiscal não
desfaz a venda já persistida. Uma resposta ausente ou incerta nunca é interpretada como XML válido.

## 3. Envelope de entrada

O formato abaixo é conceitual. Nomes exatos, transporte e serialização serão definidos na
implementação, sem reduzir os campos ou controles.

| Campo | Obrigatório | Regra |
|---|---:|---|
| `jobId` | sim | identificador imutável e globalmente único do job |
| `storeId` | sim | loja proprietária; usado em autorização e isolamento |
| `schemaVersion` | sim | versão allowlisted, por exemplo `PL_010e_v1.02/NFe/nfe_v4.00.xsd` |
| `schemaPackageHash` | sim | SHA-256 esperado do pacote/manifesto oficial |
| `xmlSha256` | sim | hash dos bytes exatos a validar |
| `xmlPayload` ou `payloadRef` | sim | exatamente um: bytes/UTF-8 controlados ou referência interna segura |
| `payloadBytes` | sim | tamanho declarado, conferido contra os bytes reais |
| `maxPayloadBytes` | sim | limite do contrato; nunca maior que a política do worker |
| `correlationId` | sim | correlação ponta a ponta, sem dado fiscal sensível |
| `attempt` | sim | tentativa iniciando em 1, controlada pela fila |
| `deadline` | sim | instante máximo do job; não apenas timeout relativo |
| `requestedAt` | sim | timestamp UTC de criação |
| `contractVersion` | sim | versão do contrato do worker |

### 3.1 Regras de entrada

- o produtor persiste o job antes de publicar na fila;
- `storeId`, `jobId`, `xmlSha256`, `schemaVersion` e `contractVersion` compõem a chave de
  idempotência lógica;
- o worker recalcula `payloadBytes` e `xmlSha256`; divergência falha fechada;
- o limite inicial de XML não excede 2 MiB, valor comprovado nos spikes; aumento exige medição e
  decisão registrada;
- `payloadRef` aponta somente a storage interna autorizada, com prazo e escopo mínimos; URL pública
  ou egress aberto são proibidos;
- o payload não contém segredo, certificado, senha, CSC ou token SEFAZ;
- XML compactado não é aceito por padrão. Se compressão for introduzida no futuro, tamanho
  descompactado, razão de expansão e tempo de descompressão devem ser limitados contra bomb;
- DTD, `DOCTYPE`, declarações `ENTITY` e hints externos de schema são proibidos antes do motor.

## 4. Envelope de saída

| Campo | Obrigatório | Regra |
|---|---:|---|
| `jobId` | sim | eco exato do identificador, após validação do envelope |
| `storeId` | sim | usado para conferir isolamento e persistir resultado |
| `correlationId` | sim | igual ao recebido |
| `contractVersion` | sim | versão efetivamente processada |
| `outcome` | sim | estado de domínio/infraestrutura enumerado no §5 |
| `valid` | sim | `true` somente em `VALIDACAO_APROVADA`; `false` nos demais estados conclusivos |
| `errors` | sim | lista estruturada, possivelmente vazia; nunca texto bruto ilimitado |
| `xmllintVersion` | sim | saída normalizada da versão efetiva |
| `libxml2Version` | sim | versão efetiva, por exemplo `2.15.3` |
| `binarySha256` | sim | hash do executável permitido |
| `imageDigest` | sim | digest imutável da imagem do worker |
| `schemaVersion` | sim | versão efetivamente carregada |
| `schemaPackageSha256` | sim | hash do pacote/manifesto carregado |
| `schemaFileHashes` | sim | mapa dos cinco arquivos oficiais utilizados |
| `xmlSha256` | sim | hash recalculado do payload |
| `durationMs` | sim | duração total no worker, sem incluir espera da fila |
| `engineDurationMs` | sim | duração do processo `xmllint` |
| `infrastructureStatus` | sim | saúde/causa técnica normalizada |
| `attempt` | sim | tentativa processada |
| `completedAt` | sim | timestamp UTC confiável |

### 4.1 Erro estruturado

Cada item de `errors` contém no máximo:

- `code`: código estável do domínio;
- `category`: `XML_SYNTAX`, `XSD_VALIDATION`, `POLICY`, `INTEGRITY` ou `INFRASTRUCTURE`;
- `message`: mensagem normalizada e sanitizada, com tamanho máximo;
- `line` e `column`: somente quando o motor fornecer números confiáveis;
- `schemaFile`: apenas basename de arquivo allowlisted;
- `retryable`: derivado da classe, não do texto do `stderr`.

O XML integral, fragmentos longos, caminho temporário, stack interna, variável de ambiente e saída
bruta do processo nunca entram no resultado persistido ou no log.

## 5. Estados e semântica

| Estado | Significado | Retry automático | Avança pipeline |
|---|---|---:|---:|
| `VALIDACAO_APROVADA` | XML bem formado e válido no XSD permitido | não | sim |
| `XML_INVALIDO` | XML bem formado, mas viola o XSD | não | não |
| `XML_MALFORMADO` | parser não forma documento XML | não | não |
| `POLITICA_REJEITADA` | DTD, entidade, schema hint, limite ou regra de entrada proibida | não | não |
| `FALHA_TRANSITORIA` | recurso interno temporariamente indisponível, sem conclusão sobre o XML | sim, com orçamento | não |
| `FALHA_PERMANENTE` | erro não recuperável do contrato/execução | não | não |
| `TIMEOUT` | deadline ou timeout externo excedido | somente se política permitir e payload for idempotente | não |
| `WORKER_INDISPONIVEL` | job não chegou a uma instância pronta | sim, pela fila | não |
| `VERSAO_NAO_PERMITIDA` | motor, contrato ou schema fora da allowlist | não | não |
| `HASH_DIVERGENTE` | XML, binário, imagem, patch ou XSD não confere | não; incidente | não |
| `PACOTE_XSD_AUSENTE` | grafo local incompleto | não até corrigir deploy | não |
| `RESPOSTA_INCERTA` | processo terminou sem resultado conclusivo/persistido | reconciliar antes de retry | não |

`valid: true` é impossível fora de `VALIDACAO_APROVADA`. Falha de infraestrutura não é XML
inválido; XML inválido não é retriado. `RESPOSTA_INCERTA` exige consulta ao resultado persistido por
`jobId` antes de nova execução.

## 6. Idempotência, fila e retry

- o consumidor adquire lock/lease do job e renova enquanto processa;
- o resultado é persistido de modo condicional pelo `jobId` e chave idempotente;
- redelivery retorna o resultado já persistido se hashes/versões forem iguais;
- se o mesmo `jobId` chegar com payload ou versão diferente, o worker responde
  `HASH_DIVERGENTE`/`FALHA_PERMANENTE` e alerta;
- concorrência inicial é 1 por instância; aumento depende de pico real do processo filho, não apenas
  RSS do wrapper Node medido no spike;
- retry usa backoff com jitter, máximo de tentativas e deadline absoluto;
- somente falhas classificadas como transitórias são retentadas automaticamente;
- tentativas esgotadas vão para dead-letter com metadados sanitizados;
- reprocessamento manual é autenticado, auditado e preserva a chave idempotente.

## 7. Segurança

### 7.1 Isolamento de processo e filesystem

- container executa como usuário não root;
- root filesystem é somente leitura;
- diretório temporário por job, permissão mínima, quota de bytes/inodes e montagem `noexec` quando
  suportada;
- capabilities Linux são removidas; `no-new-privileges` é obrigatório;
- seccomp/AppArmor ou mecanismo equivalente é aplicado quando disponível;
- limites externos cobrem memória, CPU, PIDs e tempo;
- o executável é chamado por caminho absoluto, com `spawn`, `shell: false`, argumentos fixos e
  ambiente mínimo;
- XML segue por `stdin`; nome, conteúdo ou hash do XML não vira argumento de shell;
- temporários são removidos em `finally`; resíduos após crash são varridos por rotina de startup.

### 7.2 Rede e schemas

- egress bloqueado por política de rede, não apenas por flag do processo;
- `--nonet` e `--nocatalogs` permanecem ativados como defesa em profundidade;
- somente cinco XSDs allowlisted são montados na imagem;
- imports/includes devem usar basenames relativos conhecidos; URL, caminho absoluto, traversal e
  symlink são rejeitados;
- hash de cada XSD é verificado na inicialização e antes de entrar em readiness;
- o worker não baixa schema nem consulta o Portal Nacional em runtime.

### 7.3 Dados, autenticação e autorização

- nenhum XML integral em log, métrica, trace ou mensagem de erro;
- nenhum segredo no payload, imagem ou ambiente do processo filho;
- autenticação interna entre produtor e fila/worker será obrigatória antes da integração;
- autorização é escopada por `storeId`; um job não acessa payload de outra loja;
- correlation ID é opaco e não carrega CPF, CNPJ, chave de acesso ou conteúdo do documento;
- replay só ocorre por mecanismo autenticado, auditado e idempotente;
- retenção de payload temporário e resultado deve ser definida em GOAL próprio antes de produção.

## 8. Operação e observabilidade

### 8.1 Health, readiness e liveness

- **health:** processo responde e runtime básico está operacional;
- **readiness:** imagem/digest permitido, binário executável, versão permitida, hashes do binário e
  dos cinco XSDs íntegros, temporário gravável e fila alcançável;
- **liveness:** detecta deadlock do worker sem validar XML fiscal real nem mascarar sobrecarga;
- falha de integridade retira readiness e não é curada por retry de job.

### 8.2 Métricas mínimas

- jobs recebidos, concluídos e em andamento;
- outcomes por código;
- tempo de espera na fila, duração total e duração do motor;
- timeouts, kills, excesso de saída e violações de limite;
- retries, dead-letter e respostas incertas;
- uso e pressão de memória/CPU/PIDs do container;
- versão/digest da imagem, versão/hash do motor e versão/hash do XSD como labels de baixa
  cardinalidade;
- nenhuma label derivada de `storeId`, XML, chave de acesso ou dado pessoal sem revisão de
  privacidade.

### 8.3 Logs e tracing

- logs estruturados contêm job ID, correlation ID, outcome, tentativa, duração e versões/hashes
  abreviados;
- mensagens do `xmllint` passam por normalizador, limite e sanitização;
- tracing cobre publicação, espera, processamento e persistência, sem payload;
- alerta mínimo para integridade divergente, versão proibida, DLQ crescente, timeout e ausência de
  workers prontos.

## 9. Versionamento, rollout e rollback

- contrato, motor, imagem e pacote XSD têm versões independentes e explícitas;
- o produtor só publica combinações allowlisted;
- mudança incompatível cria nova versão de contrato, com período de compatibilidade da fila;
- imagem é promovida por digest, nunca por tag mutável;
- rollout usa canário com fixtures sintéticas e tráfego controlado;
- rollback seleciona o digest anterior permitido e drena a versão problemática;
- jobs em voo guardam a combinação de versões solicitada; não são silenciosamente revalidados por
  versão diferente;
- atualização de segurança pode bloquear readiness imediatamente, mas não autoriza pular XSD.

## 10. Processo de atualização de segurança

1. acompanhar advisories oficiais do libxml2 e NVD;
2. fixar source/release e patch oficial por hash;
3. revisar licença, changelog e caminhos alcançáveis;
4. build reproduzível com toolchain fixado;
5. gerar SBOM e scan de vulnerabilidade;
6. testar corpus válido, inválido, malicioso, limites, timeout e concorrência;
7. verificar o pacote XSD oficial e grafo fechado;
8. publicar imagem por digest em ambiente controlado;
9. executar canário, observar e manter rollback;
10. registrar aprovação humana quando exigida pela ADR-0010.

## 11. Critérios de aceite da implementação futura

- nenhuma dependência de `PATH` ou rede durante validação;
- integridade do binário, imagem e cinco XSDs comprovada;
- todos os estados do §5 testados;
- limites externos exercitados com processo realmente encerrado;
- concorrência 1 e backpressure comprovados;
- redelivery/idempotência e resposta incerta testados;
- DLQ, health/readiness/liveness, métricas, logs e tracing observáveis;
- nenhum XML/segredo em logs ou artefatos;
- matriz Linux/CI verde e scan/SBOM aprovados;
- `validarXsd` só substituído após revisão humana específica;
- nenhuma emissão, homologação ou produção habilitada pelo simples aceite do worker.

## 12. Fora de escopo deste contrato

- escolher Kubernetes, ECS, Cloud Run, plataforma de fila ou fornecedor equivalente;
- criar endpoint público ou definir autenticação externa;
- persistir schema ou alterar Prisma;
- implementar fila, worker, adaptador ou pipeline;
- assinar/transmitir XML ou manusear certificado/CSC;
- definir SLO numérico de produção sem carga representativa;
- encerrar o GOAL-002 ou destravar gates F5/F7/F12.

## 13. Evidências

- `origin/fiscal/goal-002-xsd-official` @
  `f7026bc165b0789a20c52901e9b57830414a4ddd`;
- `origin/fiscal/goal-002-xsd-wasm-spike` @
  `c0ec48da6a579ffea49d6b7bba87bc87a3b00f95`;
- `origin/fiscal/goal-002-xmllint-native-spike` @
  `7aee00ec7c81278445a982b85542c89de02957f7`;
- ADR-0008, ADR-0009 e ADR-0010;
- `docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md`.
