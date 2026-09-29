# OmniGestão Pro — Pessoas / DP & RH
## Auditoria arquitetural e plano de implementação — v1.0

**Data:** 15/09/2026.  
**Repositório:** `rafaelfaria49-png/omni-gestao-pro-pdv-claude`.  
**Baseline efetivamente lida:** `main` em `90b991e1972ee3a671f9c749f4fe8d1c4fa6d432`.  
**Situação deste documento:** proposta para implementação; não representa software entregue, migração aplicada, teste executado ou homologação trabalhista.  
**Prioridade:** cadastrar funcionários e produzir a primeira folha mensal com holerites reais, mantendo o Contador HUB como consumidor documental/contábil.

## 1. Decisão executiva

Criar o módulo **Pessoas**, imediatamente acima do **Contador HUB** na navegação. A primeira entrega operacional é **Funcionários → Folha mensal → Holerites → Registro de pagamento**, com integração progressiva e controlada ao Financeiro e ao Contador.

O Contador HUB não será refeito nem transformado em motor de folha. O documento recebido define essa separação, e o commit histórico `44f7d2fc8539293adfa01598cf85c33683fed26f` confirma que “Folha & DP” passou a mostrar documentos reais, sem cálculo, cadastro trabalhista ou schema de Pessoas. [U01, R02]

A arquitetura proposta é um **monólito modular** dentro do Next.js/Prisma existente. Não criar microserviço de RH, outro sistema de autenticação ou outra contabilidade. Isolar o domínio e os contratos; reutilizar infraestrutura somente quando suas garantias forem adequadas.

O primeiro fechamento produtivo depende de validação do perfil real da empresa e dos empregados. Não assumir CLT mensalista, regime tributário, convenção coletiva, jornada, benefícios ou ausência de outros vínculos sem confirmação. O desenvolvimento do cadastro não precisa aguardar esses dados; a liberação do cálculo precisa.

**Duas formas distintas de documento:** documento recebido do contador, cuja origem deve ser preservada; e holerite calculado no Omni, derivado de fechamento homologado. Nunca converter um documento externo em “calculado pelo Omni” apenas por transcrição.

## 2. Auditoria do estado atual

A leitura foi remota, estática e fixada no SHA acima. Não houve execução local de build, testes, consultas ao banco, alterações de repositório ou validação de produção. Os resultados negativos de busca do conector estavam incompletos; portanto não são prova de ausência em cada arquivo do repositório.

| Ponto | Evidência observada | Consequência para Pessoas |
|---|---|---|
| Navegação | Existe `/dashboard/contador`, ainda com badge `Preview` e visibilidade por `p.hubs.financeiro`; não há item Pessoas no arquivo lido. | Adicionar `hubs.pessoas`; não copiar a dependência de Financeiro. O badge residual não invalida entregas reais do Contador. [R03] |
| Permissões | A matriz tem `hubs.contador` e `contador.manageExternalAccess`; os papéis são fixos e o helper de merge parte de permissões completas. | As novas capacidades DP precisam negar por padrão, inclusive para gerente; não herdar permissões sensíveis implicitamente. [R04] |
| Identidade | `AdminUser` e `AdminUserStore` tratam acesso ao sistema. `Tecnico` contém especialidade/comissão e não histórico trabalhista. | Funcionário não é usuário nem técnico. Vínculos explícitos e opcionais. [R05] |
| Empresas/lojas | `Store` possui identificação e CNPJ; a configuração fiscal é por loja. | Store operacional não será considerado empregador legal sem mapeamento confirmado. [R05] |
| Domínio trabalhista | Não foi identificado domínio canônico completo de vínculo, contrato histórico, competência de folha, cálculo e holerite nos pontos inspecionados. | Criar domínio aditivo, com busca local abrangente no pré-flight para evitar entidades duplicadas. [R02, R05] |
| Financeiro | `ContaPagarTitulo`, `MovimentacaoFinanceira`, `CarteiraFinanceira` existem; dinheiro é `Float` em modelos legados. Há outro conjunto `Financial*`, distinto do Financeiro HUB nativo. | Integrar ao conjunto nativo; usar decimal no novo domínio e adaptador de fronteira, sem reescrever o Financeiro inteiro. [R05] |
| Contas a pagar | Serviços oferecem upsert, pagamento, parcial e estorno, usando o cliente Prisma global. A construção de payload insere origem manual. | Não assumir transação composta nem preservação da origem da folha apenas chamando a função atual. Adaptar com testes e escopo estreito. [R06, R07] |
| Contador | Competências, snapshots agregados, documentos privados, versões, pacotes, eventos e identidade externa separados estão modelados. | Reutilizar contratos/documentação e integrar por referência/projeção; não reutilizar sua competência como competência da folha. [R05] |
| Storage | A porta privada admite conteúdo server-side, leitura privada e URLs temporárias; documentação indica R2 como adapter produtivo e Supabase como legado. | Reaproveitar transporte privado, mas preservar namespaces e autorização próprios. Configuração real do ambiente não foi testada. [R08] |
| Eventos | `lib/events/event-bus.ts` usa Map/Set em memória e captura erros dos handlers. | Não é mecanismo durável para fechamento/pagamento. Usar outbox transacional. [R09] |
| Auditoria | O log genérico não oferece o mesmo isolamento de domínio do Contador; eventos do Contador proíbem PII nos metadados. | Auditoria DP própria, escopada, com referências e diferenças saneadas; nunca salários/CPF em logs gerais. [R05] |
| Ferramentas | O manifesto declara Next/React/Prisma, Zod, Vitest, Playwright e SDKs de storage. Não declara renderer de holerite. | Reaproveitar testes e infraestrutura; adicionar dependências específicas somente com versão travada e prova de build. [R10] |

## 3. Fronteiras e fonte da verdade

```text
AdminUser / permissões existentes
        │ autenticação + concessão explícita DP
        ▼
Pessoas ── Empregador legal ── Estabelecimentos
   │              │                  │
   │              └──── mapeamento autorizado ─── Store(s)
   │
   ├── Pessoa ── vínculos trabalhistas ── contratos versionados
   │      ├·· usuário de acesso (opcional)
   │      └·· técnico operacional (opcional; OS permanece separada)
   │
   ├── Competência / processamento / lançamentos
   │      └── motor puro + regras versionadas
   │              └── cálculo persistido e revisado
   │                      └── fechamento imutável
   │                              ├── holerite → documento privado
   │                              ├── obrigação salarial → Financeiro
   │                              └── outbox → Contador HUB
   │
   └── pagamento realizado / retenção / comprovante
            ↔ serviço transacional de liquidação do Financeiro
            └── evento documental/contábil para Contador

Contador HUB → competência contábil própria, documentos compartilhados,
              pacotes, guias, obrigações e conferência

Futuro: snapshots/eventos autorizados → adapter eSocial → recibos/totalizadores
        → conciliação com FGTS Digital / DCTFWeb e obrigações correspondentes
```

**Pessoas** responde por cadastro trabalhista, verbas, bases e valores calculados. **Financeiro** responde pela execução e conciliação financeira, carteiras e movimentos. **Documentos** guarda bytes/versionamento/integridade. **Contador** organiza a visão contábil e documental. **Integrações oficiais** guardam seus protocolos e estados, sem alterar silenciosamente uma folha local.

O valor líquido no título financeiro é uma projeção de uma obrigação salarial identificada, não uma segunda folha editável. Um PDF do contador arquivado no Omni não se torna prova de transmissão ao governo. Um fechamento local não significa eSocial aceito ou guia paga.

## 4. Identidade, empregador e multi-loja

### 4.1 Pessoa, usuário e vínculo

Uma pessoa pode existir sem login. Um usuário pode ser proprietário, prestador ou contador e não ser funcionário. Um técnico pode ser terceirizado. Um empregado pode ter mais de um vínculo ao longo do tempo. A aplicação não deve inferir vínculo trabalhista por nome, telefone, e-mail, perfil `TECNICO` ou comissão operacional.

No MVP, a identidade `DpPessoa` fica segregada pelo empregador autorizado. Isso evita deduplicação global de CPF entre clientes do SaaS. A mesma pessoa física em empregadores distintos não compartilha automaticamente dados. Uma identidade corporativa transversal, caso venha a ser necessária, exigirá autorização e migração próprias.

Criar associação opcional e tipada com `AdminUser` e `Tecnico`; não criar “Vendedor” artificial para copiar um papel do controle de acesso. Toda associação a Técnico valida a Store permitida. Alterar/desativar login não apaga o empregado e desligar empregado não altera automaticamente contas de terceiros.

### 4.2 Empregador e Store

`DpEmpregador` representa o empregador legal; `DpEstabelecimento` representa estabelecimento de inscrição/localização; `DpUnidadeVinculo` mapeia as Stores operacionais autorizadas. O cadastro deverá distinguir identificação do empregador e identificação completa do estabelecimento, preservando os identificadores oficiais. [W03, W04]

A entrada inicial será um empregador e uma Store gestora, com vínculos adicionais somente por ação administrativa explícita. `storeGestoraId` organiza responsabilidade e implantação, mas **não concede, sozinho, acesso a todas as unidades**. As relações ao empregador e as permissões DP são verificadas no servidor.

Não criar ou unir empregadores automaticamente porque duas Stores têm CNPJ semelhante. Não transformar CNPJ em número nem remover letras: a documentação eSocial já prevê CNPJ alfanumérico. [W03]

Um funcionário trabalhando em duas unidades do mesmo empregador mantém seu vínculo e sua folha. A alocação de custo é uma distribuição gerencial histórica, não dois salários nem duas aplicações da tabela de INSS. Guardar percentual, vigência e versão do rateio. O responsável por apenas uma unidade não recebe automaticamente o holerite integral.

Mudança entre empregadores distintos não é edição de `storeId`. Transferências, sucessões ou novo contrato requerem fluxo trabalhista próprio. Até implementado, bloquear a operação simplificada, mantendo o processo externo documentado.

## 5. Proposta de entidades e schema Prisma

Este é um **dicionário de schema proposto**, não uma migration pronta. Os nomes `Dp*` isolam o domínio; os nomes de tabelas devem seguir o padrão adotado no projeto. Criar tabelas por GOAL, não todas antecipadamente.

### 5.1 Tipos e invariantes comuns

- IDs técnicos estáveis, sem documento pessoal embutido. `empregadorId` obrigatório em entidades de DP; `storeId` obrigatório onde houver proprietário operacional/integração por Store. Nunca `@default("loja-1")` em tabelas novas.
- Chaves estrangeiras compostas, por exemplo `(vinculoId, empregadorId)` e `(calculoId, empregadorId)`, impedem cruzamento de escopo no banco. Ter alvo `@@unique([id, empregadorId])` onde necessário.
- Valores finais e bases monetárias: `Decimal @db.Decimal(18,2)`. Quantidades/taxas: precisão definida por campo, por exemplo `Decimal(18,6)`; intermediários em aritmética decimal com precisão superior e limites explicitamente testados. DTOs carregam strings decimais canônicas.
- Datas civis: `DateTime @db.Date` com codec de data sem horário; competência como chave civil validada. Timestamps de evento: instante UTC. Não converter uma admissão em dia anterior por timezone.
- `validFrom/validTo` são vigência jurídica/operacional; `recordedAt` informa quando o sistema conheceu o registro. Correções têm `supersedesId`, motivo e ator. Não sobrescrever evidência histórica.
- Exclusão de emprego/contrato/fechamento referenciado: `Restrict`, não cascade. Arquivamento lógico, retenção por categoria e processo de descarte autorizado.
- JSON somente para snapshots e estruturas versionadas com validação. IDs relacionais, dinheiro essencial, datas, estado e integridade não ficam apenas em JSON livre.
- Limites, datas válidas, estados e imutabilidade exigem validação de aplicação mais constraints/índices SQL versionados. O que Prisma não expressar deve aparecer na migration SQL e nos testes.

### 5.2 Cadastro, contrato e segurança — GOAL 001

| Entidade proposta | Campos essenciais | Regras principais |
|---|---|---|
| `DpEmpregador` | id, storeGestoraId, tipoInscricao, inscricao, nome/razão social, status, createdAt | Escopo administrativo explícito; dados de identificação versionados; nenhum agrupamento automático por CNPJ. |
| `DpEmpregadorVersao` | empregadorId, versao, identificação/endereço/regime aplicável, validFrom, validTo, recordedAt, supersedesId, autor/motivo | Fotografia jurídica selecionada na folha; mudança futura de razão social não reescreve documentos antigos. |
| `DpEstabelecimento` | empregadorId, identificação completa, endereço, status | Pertence a um empregador. Versões para atributos com efeito temporal; inscrição e lotação tributária não se confundem com Store. |
| `DpUnidadeVinculo` | empregadorId, estabelecimentoId, storeId, vigência, aprovadoPor | Um mapeamento operacional ativo coerente; mudança histórica não autoriza mistura de dados retroativa. |
| `DpAcesso` | empregadorId, adminUserId, capacidades, escopo, concedidoPor, datas de concessão/revogação | Permissões de domínio limitadas a catálogo validado; deny-by-default. Não aceitar capacidade arbitrária enviada pelo cliente. |
| `DpPessoa` / `DpPessoaVersao` | empregadorId, nome, CPF protegido, índice HMAC escopado, dados cadastrais necessários, versões | Unique CPF normalizado no escopo permitido; nome/endereço de referência preservados no fechamento. Rascunho incompleto permitido, cálculo bloqueado. |
| `DpPessoaUsuario` / `DpPessoaTecnico` | empregadorId, pessoaId, adminUserId OU tecnicoId tipado, storeId quando aplicável, vigência | Vínculo explícito; nunca cria conta ou emprego automaticamente. Implementar somente links necessários no MVP. |
| `DpVinculo` | empregadorId, pessoaId, matricula, admissao, termino?, regime, categoria, status | Unique `(empregadorId,matricula)`; não impor “uma pessoa só pode ter um vínculo na vida”. |
| `DpContratoVersao` | vinculoId, empregadorId, versão, cargo, CBO, tipo/prazo do contrato, salarioBase, unidadeSalario, jornada, divisor, estabelecimentoId, referência CCT, vigência, recordedAt, supersedesId | Fonte única do salário contratual. “Histórico salarial” é projeção dessas versões, não tabela concorrente editável. |
| `DpDependenteVersao` | pessoa/vinculo, identificação mínima protegida, tipo de elegibilidade, vigência, comprovação | Benefícios e deduções selecionados pela regra aplicável; não apenas contador numérico sem origem. |
| `DpParametroVinculoVersao` | vínculo, políticas recorrentes/benefícios/descontos autorizados, documentos de suporte, vigência | Estrutura tipada por rubrica; não espaço livre para desconto sem fundamento. |
| `DpDocumento` | empregadorId, pessoaId?/vinculoId?, categoria, classificação, storageRef, mime, bytes, sha256, origem, versaoDeId?, timestamps | Privado, sem URL pública. Atestados/dados de saúde têm acesso separado do cadastro comum. |
| `DpAuditoria` | empregadorId, atorId, comandoId, ação, entidadeId, instante, justificativa, referências de versões e diferenças saneadas | Append-only; eventos gerais não recebem CPF/salário bruto/documentos. |

Não coletar raça, saúde, biometria ou filiação sindical apenas “para o futuro”. CBO/categoria e campos necessários ao cálculo têm validação apropriada; campos exigidos exclusivamente por futuras integrações entram quando sua finalidade estiver definida.

### 5.3 Competência e cálculo — GOAL 002

| Entidade proposta | Campos essenciais | Regras principais |
|---|---|---|
| `DpCompetencia` | empregadorId, tipoApuracao, periodKey, status operacional, versão de edição | Unique `(empregadorId,tipoApuracao,periodKey)`; mensal `AAAA-MM`, anual 13º `AAAA`; nunca mês 13. |
| `DpProcessamento` | competenciaId, empregadorId, tipoFolha, sequência, versaoEdicao, status, fechamentoVigenteId? | Identifica o lote lógico. As revisões oficiais ficam em DpFechamento; versaoEdicao serve apenas ao controle de concorrência. Unique competência/tipo/sequência. |
| `DpRubrica` | empregadorId ou catálogo versionado segregado, código estável, ativa | Identidade da rubrica, não valor livre. Não vincular apenas por descrição. |
| `DpRubricaVersao` | rubricaId, versão, nome, natureza, tipo, unidadeReferência, formulaId, parâmetros, incidências INSS/IRRF/FGTS, referências oficiais, vigência | Rubrica publicada é imutável. Tabelas de incidência não são três checkboxes sem códigos/contexto temporal. |
| `DpRegraPacote` | id/version, país/regime, vigência por espécie de regra, fontes, fonteHash, engineVersion, engineArtifactHash, roundingVersion, payloadSchema, aprovador | Separar tabelas legais, fórmulas, políticas da empresa/CCT e leiaute de integração. Nova versão não altera cálculo antigo. |
| `DpLancamento` | processamentoId, vinculoId, rubricaVersaoId, quantidade, valor informado quando cabível, referência, data, origem, sourceRef, revisão, autor | Lançamento informado não equivale a folha fechada. Mudanças invalidam aprovação; entrada usada em cálculo arquivado é preservada por versão/supersessão. |
| `DpContextoApuracao` | vínculo/pessoa/empregador, período de incidência, dados anteriores relevantes, outros vínculos declarados, pagamento previsto, versões consultadas | Captura todos os dados que afetam teto/retenção/cumulatividade; nada consultado silenciosamente depois do fechamento. |
| `DpCalculo` | processamentoId, vinculoId, versão, inputHash, ruleBundleHash, snapshotSchemaVersion, inputSnapshot, outputSnapshot, engineArtifactHash, totais Decimal, createdAt | Cada tentativa persistida é evidência imutável; recalcular gera nova tentativa. Unique processamento/vínculo/versão. |
| `DpLinhaCalculo` | calculoId, empregadorId, ordem, rubricaVersaoId, código/nome/ref congelados, provento/desconto/informativa, valor Decimal, bases, memória | Soma por linhas precisa coincidir com totais. Rubrica informativa não vira desconto no líquido. |
| `DpAprovacao` | processamentoId, cálculo(s)/hash manifesto, revisorId, parecer, instante | A aprovação é do conjunto exato, não de uma tela que pode mudar depois. |

Para fórmulas e incidências comuns, um catálogo de regras imutável pode ser compartilhado como referência sem compartilhar dados de empregados. Overrides da empresa exigem versão própria e aprovação; não podem alterar o catálogo de todos os clientes.

### 5.4 Fechamento, documentos e pagamento — GOALs 003–004

| Entidade proposta | Campos essenciais | Regras principais |
|---|---|---|
| `DpFechamento` | processamentoId, empregadorId, revisão, manifesto de calculoIds/hashes, totais, snapshotHash, schemaVersion, autor, fechadoEm, supersedesId?, motivo | Versão oficial imutável. Fechamento posterior pode substituir logicamente o anterior, nunca apagar o original. |
| `DpFechamentoItem` | fechamentoId, empregadorId, vinculoId, calculoId | FK e unique impedem mistura de vínculos/calculos/empregadores e duplicação no lote. |
| `DpHolerite` | fechamentoItemId, documentoId, número/identificador, templateVersion, snapshotHash, artefatoHash, emitidoEm, situação de emissão | Somente cálculo fechado pode gerar documento definitivo. Reimpressão recupera o arquivo original. |
| `DpObrigacaoSalarial` | fechamentoItemId, tipo, valor original Decimal, vencimento/data prevista, documento de origem | Crédito calculado pela folha; obrigação não é dinheiro transferido. Correções criam diferenças identificadas. |
| `DpPagamento` | obrigação/vínculo, empregadorId, pagamentoEm, valor Decimal, forma, carteira/origem, referência de comprovante, sourceId, idempotencyKey, status de evidência | Fato de pagamento/registro autorizado; não efetua PIX. IDs únicos impedem baixa duplicada. |
| `DpPagamentoAlocacao` | pagamentoId, obrigacaoId, valor, apuracaoRetencaoId? | Permite pagamento parcial, lote e vínculo de um pagamento a verbas; lógica tributária deve ser homologada antes de habilitar cada modalidade. |
| `DpRetencaoApuracao` | fonte pagadora, pessoa, período de pagamento, contexto cumulativo, base/retenção, regras, versões, pagamentos de referência | Separar cálculo da retenção e sua ocorrência efetiva. Mudança material no contexto gera ajuste versionado. |
| `DpPagamentoEvento` | pagamentoId, tipo registro/estorno/retificação/comprovação, valor aplicável, motivo, ator, instante | Eventos são append-only. Não apagar comprovante nem apagar movimento para “desfazer”. |
| `DpFinanceiroVinculo` | empregadorId, storeId, obrigacaoId, contaPagarTituloId, sourceKey, valorProjetado Decimal, projeçãoVersão | Vínculo tipado e único de origem. Não é segunda contabilidade. |
| `DpCompartilhamentoContador` | empregadorId, storeId destino, contadorCompetenciaId, documento/fechamentoId, versão, finalidade, autorizadoPor, revogadoEm? | Compartilhamento explícito, sem liberar folha inteira por mera permissão financeira. |
| `DpOutbox` / `DpEntregaEvento` | eventId, entidadeId, versão, tipo, metadados mínimos, createdAt; consumerId, tentativas, nextAttemptAt, status, erro saneado | Gravar evento na transação de negócio; entrega no mínimo uma vez, efeito idempotente por consumidor. |

Constraints adicionais: unique `(processamentoId,revisao)` em DpFechamento; unique `(fechamentoId,vinculoId)` em DpFechamentoItem; unique de sourceKey na projeção financeira e de `(eventId,consumerId)` na entrega. Somente um fechamento pode ser o vigente do lote, por transição atômica com checagem de versão. Prevenir duplicação acidental do empregador no escopo administrativo autorizado, sem índice global que revele a existência de um CNPJ em outro cliente.

A decisão de arquivo pronto/erro/pendente pertence à emissão, não modifica o cálculo. Uma retificação de documento visual, sem alteração do cálculo, cria novo artefato com motivo e versão de template preservando o PDF anterior.

### 5.5 Entidades reservadas para evolução

Reservar contratos de integração, não tabelas vazias sem usuário: períodos aquisitivos e gozos de férias; composição/médias/parcelas de 13º; afastamentos; verbas e documentos rescisórios; bases/encargos patronais; eventos oficiais e totalizadores; processos administrativos/judiciais quando houver caso real. O sistema deve detectar e bloquear caso não suportado, em vez de tratar mês com férias ou afastamento como mês integral comum.

## 6. Motor de cálculo e regras

### 6.1 Motor puro

Contrato conceitual:

```text
calcularFolha(entradaCongelada, pacoteRegras)
    → linhas + bases + totais + memória + avisos + bloqueios
```

O motor não consulta banco, relógio, rede, ambiente, salário atual, localStorage ou IA. A aplicação resolve os dados por vigência e os entrega serializados. Propõe-se `decimal.js`, encapsulado no domínio e com contexto próprio de precisão/arredondamento; sua API oferece configuração explícita dessas propriedades. Travar versão e lockfile. [W07]

Fluxo de cálculo: validar elegibilidade/período → selecionar contrato/segmentos vigentes → resolver lançamentos → calcular proventos e referências → construir bases específicas → contribuição do empregado → retenção conforme período/contexto de pagamento → descontos permitidos → líquido → verificações cruzadas → memória explicável.

Fórmulas são funções registradas por ID/versão. Não usar `eval`, JavaScript livre armazenado no banco ou modelo de linguagem para decidir valores. Regras dependentes de outras rubricas formam grafo sem ciclos; invalidar configurações com dependência circular.

### 6.2 Regras atuais verificadas e consequência arquitetural

A tabela INSS vigente desde janeiro/2026 é progressiva, com faixas até R$ 1.621,00; R$ 2.902,84; R$ 4.354,27; R$ 8.475,55 e alíquotas 7,5%; 9%; 12%; 14%. A fonte também aborda vínculos concomitantes e separação do 13º. Isso exige regra versionada, teto e contexto adequado — não aplicação de uma alíquota única ao salário todo. [W01]

O IRRF mensal de 2026 não se resume à tabela progressiva antiga: há redução que zera o imposto nos rendimentos abrangidos até R$ 5.000 e diminui até R$ 7.350. O motor deve distinguir rendimentos tributáveis, base após deduções e redução; preservar a escolha aplicável entre deduções legais e desconto simplificado, sem somá-los indevidamente. Os parâmetros completos vêm do pacote validado, não deste documento. [W02]

O eSocial diferencia remuneração por competência e pagamento pelo regime de caixa. Logo, folha de setembro paga em outubro precisa guardar ambos os períodos; regras selecionadas apenas por `09/2026` são insuficientes. [W04]

Esses valores não certificam a folha específica da RafaCell. Antes de produção: regime/categoria/CCT, salário/jornada, benefícios, dependentes e outros vínculos precisam ser confirmados pelo responsável.

### 6.3 Arredondamento e reprodução

Precisão e arredondamento são parte da versão da regra. Documentar, por fórmula, onde arredondar ou truncar, quantas casas manter, e como consolidar as linhas. Não assumir que uma regra global `toFixed(2)` representa o procedimento trabalhista de todas as verbas.

A proposta inicial é usar alta precisão nos intermediários e quantização explícita nos pontos homologados. O modo de cada ponto deve ser confrontado com a fonte/regra do evento e exemplos independentes. A igualdade de saída deve ser exata em centavos; tolerância genérica de um centavo não aprova divergência sem explicação.

Guardar a memória dos cálculos, todas as versões de entrada e o artefato executável do motor. Um texto `engineVersion="v1"` sem o código/lockfile preservado não assegura reprodução. Disponibilizar teste que reexecute um fechamento antigo com seu motor original.

Para rateios gerenciais, distribuir resíduos por algoritmo determinístico, com critério estável e documentado. Nunca arredondar tributos separadamente em cada Store para depois somá-los.

### 6.4 Remuneração, retenção e pagamento

A folha revista contém data prevista e contexto de pagamento usados no cálculo da retenção. No registro efetivo, verificar se o período e a cumulatividade continuam compatíveis. Se houve mudança material, criar apuração/revisão de ajuste vinculada antes da liquidação automática; não alterar os números de um holerite já emitido.

A identidade de apuração tributária deve contemplar fonte pagadora e pessoa, e não somente contrato ou Store. Outros vínculos fora do sistema entram como informação declarada e documentada, jamais por consulta indiscriminada a outro empregador.

O MVP homologará o perfil de pagamento efetivamente necessário. Pagamentos parciais no mesmo mês, adiantamentos e múltiplos pagamentos exigem testes próprios; divisão entre meses ou situações não homologadas ficam bloqueadas para automação e com encaminhamento explícito ao responsável, nunca escondidas sob “outros descontos”.

Encargos do empregador e rubricas informativas permanecem separados de desconto do empregado. As bases precisam existir na primeira folha; a apuração patronal completa pode continuar externa e identificada até sua fase própria.

## 7. Fechamento, estados e retificações

Separar três máquinas:

```text
Folha:     RASCUNHO → CALCULADA → REVISADA → FECHADA
Pagamento: PENDENTE → PARCIAL → PAGO; estornos são eventos vinculados
Oficial:   NÃO INTEGRADO → PREPARADO → ENVIADO → ACEITO / REJEITADO
```

“Paga” na tela é projeção da liquidação das obrigações, não motivo para destruir o estado de fechamento. Aceito significa confirmação oficial correspondente, não envio HTTP bem-sucedido.

### 7.1 Fechamento atômico

O comando informa `expectedVersion`, hash do conjunto revisado e chave de idempotência. O servidor autentica, autoriza, valida escopos, verifica contratos/lançamentos/regras, adquire controle de concorrência, e confirma que o conjunto não mudou. Dentro de uma transação grava fechamento, itens, obrigação(s), auditoria e outbox.

O conjunto de funcionários esperados precisa ser congelado e reconciliado: empregado omitido, admitido, afastado ou desligado tem justificativa explícita. Não fechar “todos” se um cálculo falhou. Para poucas pessoas, uma transação curta e lote controlado são suficientes; renderização de arquivos nunca fica dentro dessa transação.

Mudança em entradas/regras usadas revoga a revisão anterior. Duplo clique com mesma chave retorna a mesma operação; mesma chave com entrada diferente gera conflito. Retries transacionais são limitados e não ignoram mudança de versão.

### 7.2 Imutabilidade

Snapshots, linhas e vínculo oficial de cálculo não aceitam update/delete de rotina. Usar restrições/guards no banco além da aplicação e permissões mínimas da credencial de execução. Hash detecta alteração de conteúdo, mas não impede sozinho que alguém com acesso irrestrito altere dados e hash. Backup, trilha e controle de acesso continuam indispensáveis.

### 7.3 Retificação

Reabrir significa criar revisão de trabalho a partir do fechamento anterior. O anterior permanece consultável. Guardar motivo, ator, diferença de valores e impacto em documentos, obrigação salarial, pagamento e integração oficial.

Quando a folha já foi paga, gerar diferenças/ajustes identificados. Não recriar automaticamente o título integral nem cobrar do empregado por desconto automático. Quando documento já entrou em pacote contábil fechado, preservar pacote e produzir pendência de retificação controlada; não alterar o pacote antigo por fora do fluxo do Contador.

## 8. Holerite e documentos

### 8.1 Conteúdo

Documento A4 legível, imprimível em preto e branco, com identificação do empregador/estabelecimento, empregado e matrícula, competência e tipo de processamento, cargo, salário-base, rubricas/códigos/referências, proventos, descontos, bases pertinentes, líquido, identificação/versão, data de emissão, data prevista de pagamento claramente rotulada e espaço/forma de recebimento.

Incluir indicação de origem e retificação quando aplicável. Minimizar CPF e dados bancários exibidos conforme finalidade aprovada. Não incluir diagnóstico médico, CPF de dependentes, segredos, tokens ou dados cadastrais irrelevantes.

### 8.2 Geração

Proposta: `@react-pdf/renderer` server-side em runtime Node, isolado atrás de `PayslipRendererPort`. A documentação oferece `renderToBuffer` e declara suporte a React 19 na linha compatível. A versão exata será fixada e submetida ao build Next/Vercel do projeto. Não confundir com o pacote homônimo voltado somente a visualizar PDFs. [W06]

O renderer recebe somente DTO do snapshot fechado e assets aprovados. Não refaz cálculo, não busca salário atual e não faz download arbitrário de URL fornecida no cadastro. Fontes/logos precisam estar empacotados ou validados e versionados.

Gerar → validar bytes/hash → gravar artefato privado → associar documento. Não sobrescrever path de um arquivo emitido. Ao repetir “Imprimir”/“Baixar”, servir os mesmos bytes. Guardar hash do snapshot separado do hash do PDF; PDF pode incluir metadados de geração, e igualdade de cálculo não assegura igualdade binária sem controle do renderer.

Falha no storage deixa emissão pendente/erro recuperável, não recalcula a folha. O download é autorizado por request, sem cache público ou persistência offline no PDV.

### 8.3 Pagamento e recebimento

Emitir holerite, registrar pagamento, anexar comprovante e reconhecer recebimento são fatos distintos. A CLT disciplina recibo e a equivalência do comprovante bancário nas condições legais; a emissão de um PDF pelo sistema não comprova, por si, pagamento. [W05]

Aceite futuro vira evento associado ao hash do documento. Não inserir assinatura simulada nem marcar “recebido” porque alguém clicou em imprimir. A versão com comprovação posterior deve ser novo documento/evento, preservando o original.

## 9. Integração com Financeiro

Usar `ContaPagarTitulo` e `MovimentacaoFinanceira` do Financeiro HUB nativo. Não usar `FinancialTransaction` por coincidência de nome. Funcionário continua em Pessoas; não criar cadastro de fornecedor artificial para acomodar o formulário manual. [R05, R06]

A obrigação salarial nasce em Pessoas. O adaptador produz título idempotente com vínculo tipado de origem e referência estável. A criação de obrigação/título não baixa carteira. O usuário confirma o pagamento, com data real, valor, forma, conta e comprovante quando disponível; a operação não transfere dinheiro por si.

Os serviços lidos usam Prisma global, parâmetros `number` e montagem com origem manual. Portanto a integração exige adição controlada de suporte transacional/proveniência e não mera chamada ao endpoint manual existente. [R07]

No GOAL de integração, o comando comum de pagamento recebe contexto autorizado e executa baixa, movimento, vínculo DP, auditoria e evento de modo consistente. Todas as entradas de pagamento — tanto na tela Pessoas quanto no Financeiro — devem usar esse caminho para títulos de origem folha. Rotas legadas não podem contornar o bloqueio.

O domínio novo mantém Decimal como fonte. Na fronteira legada, converter somente valores já quantizados, validar range e conferir ida/volta em centavos. Uma migração global de Float fica fora deste GOAL. Se a fronteira não sustentar a conciliação, bloquear a automação e aplicar o menor endurecimento necessário antes do gate.

Pagamentos previamente registrados em Pessoas não geram nova saída ao ativar integração. O vínculo exige reconciliação e identificação de movimento existente ou criação explícita única. Estorno não apaga histórico; baixa e estorno respeitam fechamento financeiro e fiscal pertinente, produzindo ajuste onde necessário.

### 9.1 Proteção contra bypass e vazamento

Mapear todos os readers/writers, exportações e relatórios que acessam títulos e movimentos DP. O valor de um título individual pode revelar remuneração, mesmo com nome mascarado. Definir capacidade específica para pagamento/consulta financeira de folha. Acesso genérico a Financeiro não abre rubricas, CPF, dependentes ou holerite.

Títulos DP não aceitam mudança genérica de valor/origem/beneficiário. Alterações vêm do fluxo de ajuste aprovado. O Financeiro pode apresentar uma projeção mínima autorizada para pagar; acesso à folha completa exige permissão própria. Agregados de empresa com um funcionário também merecem avaliação de acesso.

## 10. Integração com Contador HUB

Eventos mínimos propostos: `pessoas.folha.fechada.v1`, `pessoas.holerite.emitido.v1`, `pessoas.pagamento.registrado.v1`, `pessoas.folha.retificada.v1`. Payloads gerais carregam IDs, versões, hashes e escopo; detalhes salariais são lidos por serviço autorizado, não distribuídos no event bus.

Criar publicação deliberada para a competência contábil correspondente. A competência DP não é FK obrigatória de vida ao Contador: Pessoas deve funcionar mesmo sem compartilhamento, e o Contador preserva suas próprias regras de fechamento.

A ponte guarda referência de origem, versão, propósito e autorização. O Contador recebe resumo conferível, holerites autorizados, bases/documentos e situação informada de encargos. A identidade externa continua separada; não se torna usuário interno DP. [R05]

O schema atual de documentos usa namespace privado `contador/{storeId}/...` e validações de competência/versão. Não apontar esse campo improvisadamente para `pessoas/...` nem relaxar a validação global. Criar um adapter de documento de origem ou projeção explícita suportada pelo leitor e pelo empacotador. Cópia física no pacote fechado é aceitável para arquivo, desde que preserve hash/proveniência e não seja outra fonte de cálculo. [R05, R08]

Compartilhamento deve cobrir lista, download direto, URL temporária e ZIP, não apenas ocultar um botão. Pacotes gerados não podem incluir holerites não autorizados. A revogação impede novos acessos; não promete recolher cópias já baixadas. Emissão concluída não muda automaticamente guia manual para paga.

## 11. eSocial, FGTS e DCTFWeb

Modelar desde o início CPF/matrícula, identificação do empregador/estabelecimento, categoria, CBO, vigências, rubricas, bases, competência, demonstrativo e data de pagamento. A chave anual do 13º deve ser distinta da mensal. Isso prepara dados, mas não equivale a ter uma integração oficial implementada. [W04]

O catálogo de eventos e seus campos serão mapeados no GOAL oficial contra o leiaute vigente: tabelas do empregador e rubricas; admissão/alterações/afastamento/desligamento; remuneração e pagamentos; fechamento/reabertura; totalizadores e recibos. Não tentar reconstruir XML a partir de PDF.

Separar versão da regra trabalhista da versão do leiaute. O portal técnico já apresenta pacotes futuros com datas diferentes de produção; selecionar “o arquivo mais novo” pode usar uma especificação ainda não vigente. A linha S-1.3/CNPJ alfanumérico é relevante ao cadastro atual. [W03]

O adapter terá ambiente de homologação/produção, idempotência, certificados/procuração por referência segura, fila, timeout/retry, recibos, rejeições, reconciliação de bases e acesso mínimo. Não copiar a autorização fiscal de NFC-e como se concedesse automaticamente poderes de eSocial.

Antes desse GOAL, o sistema deve dizer **“Obrigações oficiais a cargo do responsável/contador”**, com responsável, prazo, evidência e pendências. Não prometer emissão automática de todas as guias nem API pública disponível para todo serviço; auditar canais e autorizações efetivamente suportados quando da implantação.

## 12. ACL, privacidade e auditoria

A habilitação inicial do módulo exige administrador autenticado com autoridade comprovada sobre a Store gestora e confirmação explícita; o bootstrap de DpAcesso não pode aceitar empregador/Store arbitrários nem depender apenas de um papel enviado no cliente. Identificar o contrato de autoridade já existente no pré-flight; se não houver vínculo confiável para a operação, este é um gate de segurança, não motivo para abrir acesso global.

Capacidades propostas: `pessoas.viewCadastro`, `editCadastro`, `viewRemuneracao`, `editContrato`, `calcularFolha`, `revisarFolha`, `fecharFolha`, `retificarFolha`, `viewPagamentos`, `registrarPagamento`, `viewDocumento`, `shareContador`, `manageRules`, `manageAccess`.

Não criar login DP independente. Reutilizar sessão interna válida e acrescentar grants por empregador. Administrador habilitador concede acesso DP deliberadamente; gerente não herda salário de todos por `FULL`. Caixa, técnico e vendedor começam sem acesso. Contador externo recebe somente o escopo compartilhado.

Em empresa pequena, o dono pode acumular preparar/revisar/fechar mediante política explícita e confirmação registrada; não exigir segundo funcionário inexistente como bloqueio operacional. Ações e papéis continuam separados no modelo para segregação posterior.

Validar autenticação, concessão DP atual, vínculo do objeto ao empregador, mapeamento de Store e versão de comando no servidor. Cabeçalho/cookie/storeId enviado pelo cliente não é autorização. Não reutilizar fallback de loja nem guard permissivo de legado no domínio novo.

CPF, salário e conta bancária são dados pessoais confidenciais; dados de saúde, biometria ou filiação sindical, quando presentes, têm classificação legal sensível específica. Não chamar indiscriminadamente todos esses campos de “dado sensível” na acepção da LGPD. [W08]

Minimizar coleta; proteger transporte, banco, snapshots, blobs e backups; não expor dados em logs, parâmetros de URL, analytics ou prompts de IA. Para CPF pesquisável, prever cifra e índice HMAC com chave segregada, não hash simples enumerável. Chaves nunca ficam no frontend. RLS deve ser avaliada conforme credenciais e arquitetura reais, sem assumir que uma service role seja limitada por políticas ignoradas por ela.

Excluir Pessoas das estratégias de cache/offline/PWA do PDV, inclusive respostas, prefetch persistente e arquivos. Usar `private/no-store` nas superfícies apropriadas. Download tem autorização e auditoria; URL temporária deve expirar em prazo curto.

Retenção por categoria e obrigação, com finalidade, acesso, legal hold e descarte governado. Imutabilidade operacional não significa armazenamento eterno sem política. A evidência de revisão e a identidade do ator não exigem replicar seu e-mail/nome em cada log.

## 13. UX e rotas

Navegação: **Financeiro HUB → Pessoas → Contador HUB** no trecho pertinente da sidebar. Pessoas terá entrada própria e não será subaba escondida do Contador.

Rotas propostas:

```text
/dashboard/pessoas
/dashboard/pessoas/funcionarios
/dashboard/pessoas/funcionarios/[id]
/dashboard/pessoas/folha
/dashboard/pessoas/folha/[competenciaId]
/dashboard/pessoas/holerites
/dashboard/pessoas/documentos
/dashboard/pessoas/configuracoes
```

Página inicial: total real de vínculos ativos, competência em andamento, pendências impeditivas, documentos a emitir e pagamentos; carregamento/erro/vazio distintos. Nunca mostrar KPI de exemplo como empresa real.

Ficha: dados pessoais; vínculo/contrato; jornada/remuneração; benefícios/dependentes aplicáveis; histórico; documentos; folhas e pagamentos. Wizard de admissão permite salvar rascunho e informa requisitos faltantes. Funcionário já existente usa admissão original, documentos anteriores e contexto de implantação, não “data de admissão hoje”.

Folha: empregado por linha; status individual, proventos, descontos, líquido e bloqueios; drawer de memória de cálculo; mudanças em relação à competência anterior com justificativa; total consistente; ações revisar/fechar habilitadas apenas quando prontas.

Após fechar: painel com holerite emitido ou geração pendente, baixar/imprimir, registrar pagamento, publicar para Contador e pendências oficiais. Diferenciar “documento emitido”, “pagamento registrado” e “comprovante anexado”.

Telas futuras de férias/13º/rescisão ficam ocultas até existirem, ou em roadmap não operacional claramente separado. Não usar oito abas e botões com “em breve” no caminho urgente. Tokens, acessibilidade, teclado, foco, mobile e tema seguem o Omni. Configurações DP pertencem ao módulo; configurações globais apenas levam até elas.

## 14. Actions, readers, endpoints e processos

### 14.1 Estrutura sugerida

```text
app/dashboard/pessoas/**
app/actions/pessoas/**
app/api/pessoas/documentos/[id]/download/route.ts
app/api/pessoas/holerites/[id]/pdf/route.ts
components/dashboard/pessoas/**
lib/pessoas/domain/**
lib/pessoas/application/**
lib/pessoas/engine/**
lib/pessoas/readers/**
lib/pessoas/repositories/**
lib/pessoas/documents/**
lib/pessoas/integrations/financeiro/**
lib/pessoas/integrations/contador/**
lib/pessoas/outbox/**
```

Nomes são proposta; respeitar convenções existentes encontradas no pré-flight. O controller/action não contém fórmulas. DTOs públicos nunca carregam objeto Prisma, Decimal não serializado, Buffer, segredo ou PII dispensável.

### 14.2 Contratos de aplicação

Cadastro: `listarFuncionarios`, `obterFuncionario`, `criarFuncionario`, `atualizarDadosPessoais`, `criarVersaoContrato`, `listarHistorico`, `arquivarVinculo`, `anexarDocumento`.

Folha: `abrirCompetencia`, `listarCompetencias`, `obterFolha`, `salvarLancamentos`, `calcularProcessamento`, `obterMemoriaCalculo`, `revisarProcessamento`, `fecharProcessamento`, `iniciarRetificacao`, `compararRevisoes`.

Documentos/pagamento: `solicitarHolerite`, `listarHolerites`, `autorizarDownload`, `registrarPagamento`, `estornarPagamento`, `anexarComprovante`, `publicarNoContador`, `reconciliarIntegracoes`.

Comandos sensíveis recebem chave de idempotência e versão esperada; ator e escopo são derivados/revalidados no servidor, não aceitos como verdade do body. Retornar códigos tipados, por exemplo `SCOPE_DENIED`, `PROFILE_UNSUPPORTED`, `RULESET_MISSING`, `VERSION_CONFLICT`, `PAYMENT_CONTEXT_CHANGED`, `DOCUMENT_PENDING` — sem stack sensível.

Usar server actions/readers para interface interna, endpoints para bytes/upload/webhooks/jobs necessários. Não criar REST duplicada de cada action sem consumidor real.

### 14.3 Síncrono versus job

CRUD validado, cálculo de lote pequeno, revisão, fechamento e liquidação são operações síncronas curtas. Gerar um documento pode começar imediatamente após commit, mas sempre com estado de emissão persistido e retry. Lotes PDF/ZIP, conciliação, integrações oficiais e notificações rodam como jobs.

Outbox fica no banco desde o primeiro fechamento. Worker/dispatcher autorizado usa lease, tentativas, backoff e chaves únicas por consumidor. Não precisa instalar Kafka nem adotar event sourcing do ERP. Falha de um consumidor não apaga a folha e não se transforma em sucesso silencioso.

## 15. Plano de testes e gates

### 15.1 Motor

Versionar exemplos independentes validados com fontes oficiais e conferência do responsável; não usar a própria função testada como geradora da expectativa. Testar todas as bordas de faixas, teto, redução IRRF, deduções, pagamento em mês diferente, outros pagamentos/vínculos informados, proporção de admissão e mudanças salariais, horas extras/comissão/DSR quando suportados, descontos e bloqueios.

Comparar resultado final e bases/linhas em centavos. Toda divergência exige causa e resolução; não fechar com tolerância informal. Asserções de determinismo executam a mesma entrada sob datas/ordens/locale diferentes. Testar regras históricas após atualização de pacote.

### 15.2 Persistência e concorrência

Migration em banco isolado; FKs compostas; vazamento entre empregadores; duas revisões concorrentes; contrato alterado após revisão; funcionário omitido; duplo clique; chave de idempotência reaproveitada com dados divergentes; falha no meio da transação; retry de outbox; tentativa SQL/application de alterar fechamento.

### 15.3 Dinheiro e documentos

Fechar → gerar obrigação sem movimentar caixa. Registrar → título/movimento/pagamento coerentes. Parcial/estorno/retificação não duplicam saída. Finanças fechadas e projeções indisponíveis produzem erro operacional correto. Downloads repetidos retornam o artefato salvo. PDF tem texto extraível, acentos, múltiplas linhas, quebra de página, valores e número/versão corretos.

### 15.4 Segurança e experiência

Testar IDs de outras Stores/empregadores, usuários sem permissão, contador externo, link direto, ZIP, revogação, URL expirada, ausência de cache e ausência de PII em logs/analytics. Testar todos os papéis existentes para não vazar novas capacidades por herança.

Typecheck, ESLint focado, testes unitários/integrados, build e E2E autenticado em banco de homologação. Registrar baseline de erros anteriores separadamente; não esconder erros novos em waiver genérico. Não pagar funcionário nem alterar produção durante teste automático.

### 15.5 Gates de liberação

G0: reconciliação da main e ADRs/allowlist.  
G1: schema/identidade/multi-loja/ACL aprovados.  
G2: perfil da RafaCell e dos empregados confirmado, convenção/parâmetros/benefícios documentados.  
G3: cálculo independente e reprodução histórica aprovados.  
G4: fechamento, retificação, documento privado e backup/restore aprovados.  
G5: pagamento, proveniência, reconciliação e integração sem vazamento aprovados.  
G6: piloto assistido com comparação ao contador e responsabilidade pelas obrigações formalmente identificada.  
G7 futuro: homologação de integrações oficiais e retorno de totalizadores/recibos.

Não bloquear cadastro por faltar G3; não habilitar emissão definitiva por ter passado apenas G1. Sem G2/G3, calculadora fica em simulação ou documento externo preservado.

## 16. Roadmap em GOALs completos

| GOAL | Escopo produtivo e critério de encerramento | Dependências |
|---|---|---|
| **PESSOAS-000 — Ratificação arquitetural** | Incorporar este plano em `docs/pessoas/`, registrar ADRs e delta da main; pesquisar domínio existente com ferramenta local confiável; fixar allowlist e matriz do MVP. Etapa curta incorporável ao início do 001, não outra auditoria interminável. | SHA atual, governança do repo. |
| **PESSOAS-001 — Fundação + cadastro real** | Migration aditiva, empregador/estabelecimento/mapeamento, grants próprios, Pessoas na sidebar, funcionário/vínculo/contrato, histórico, dados necessários, documentos privados e auditoria; CRUD de verdade com leitura após reload e testes de isolamento. Não entregar só scaffold. | G0/G1. |
| **PESSOAS-002 — Folha mensal calculável** | Competência, rubricas, pacote versionado, entradas, motor puro e memória, UI de simulação/revisão, casos independentes e bloqueios de escopo. Tabelas 2026 homologadas e contexto de pagamento. | 001; G2/G3. |
| **PESSOAS-003 — Fechamento + holerite real** | Revisão vinculada a hashes, fechamento atômico, snapshot/retificação, outbox, PDF arquivado, impressão, histórico e obrigação salarial; registro básico de pagamento/comprovante com origem e exportação privada para conferência. Sem integração, estado declarado e nenhuma saída financeira duplicada. | 002; G4 e perfil de pagamento homologado. |
| **PESSOAS-004 — Pagamento e integrações completas** | Adaptador Financeiro idempotente/transacional, proteção contra writes genéricos e vazamento, parcial/estorno do perfil homologado, reconciliação de registros anteriores, bridge Contador e inclusão autorizada em pacotes; teste ponta a ponta. | 003; G5/G6. |
| **PESSOAS-005 — 13º + férias** | Processamentos próprios, períodos/médias/parcelas e bases segregadas, documentos, pagamentos e retificação. Ordem entre 13º e férias definida pela ocorrência real mais próxima. | MVP mensal estável; fontes/regimes específicos aprovados. |
| **PESSOAS-006 — Afastamentos + rescisões** | Eventos, efeitos na remuneração/médias, cálculos e documentos de término/afastamento, pagamentos e conferência; cenários não suportados bloqueados. | 005 quando pertinente e validações específicas. |
| **PESSOAS-007 — Encargos completos + integrações oficiais** | Perfil patronal, bases/conciliação, adapters eSocial e canais oficiais comprovados, certificados/procurações, homologação, envios/recibos/rejeições, obrigações e guias sem fingir automação. | G7 e escopo oficial aprovado. |

**Primeiro marco para gerar holerites próprios:** GOAL 003 após validação do perfil e do cálculo. **Primeiro ciclo plenamente integrado:** GOAL 004. Não é necessário aguardar férias, rescisão ou conexão direta ao governo para desenvolver o cadastro e homologar a folha mensal. A responsabilidade pela escrituração/obrigações continua explicitamente atribuída durante a transição.

Cada GOAL inclui implementação de todo seu escopo, diagnóstico/correção dos erros encontrados, repetição das validações e relatório único com evidências. Parar somente por credencial/autorização ausente, risco destrutivo, dependência externa real ou impedimento técnico não contornável. Commit/PR/push seguem a autorização e a governança efetivamente vigentes; não presumir merge em main autorizado por este planejamento.

Higiene: não acumular pastas temporárias em `C:\Projetos`. Após validar, commitar e publicar/mergear com segurança, remover worktree temporária e executar `git worktree prune`. Com WIP ou estado incerto, não remover.

## 17. Primeiro GOAL recomendado

**`PESSOAS-DP-FUNDACAO-CADASTRO-FUNCIONARIOS-001`**

Entregar a rota Pessoas funcional, acima do Contador, com cadastro e histórico de funcionários reais. O pré-flight ratifica a arquitetura e identifica qualquer domínio já existente; não altera o desenho silenciosamente nem expande para conserto geral do ERP.

Incluir setup do empregador, associação explícita à Store, permissões específicas, schema/migration aditivos, pessoa/vínculo/contrato versionado, documentos privados necessários, busca/lista/ficha/histórico, trilha de alterações e estados reais de erro/vazio. Validar gravação e leitura, vigência, duplicidade de matrícula/CPF no escopo, datas civis, acesso por papéis e isolamento entre lojas.

Nessa entrega, “Folha” só aparece operacional quando houver suporte; não criar botão “Gerar holerite” que apenas imprime formulário em branco ou não calcula. Holerites recebidos do contador podem ser armazenados como documentos externos, sem reatribuir autoria.

Não tocar PDV, OS, estoque, Caixa ou Fiscal fora de eventual ponto de associação estritamente necessário e aprovado. Alterar navegação e permissões de forma aditiva. Não implementar eSocial, biometria, controle de ponto ou ferramenta de recrutamento.

## 18. Dados e decisões para o primeiro uso da RafaCell

Confirmar empregador do contrato e CNPJ/estabelecimento, regime aplicável, vínculo/categoria, data original de admissão, matrícula, cargo/CBO, salário e última alteração, jornada e divisor, convenção/acordo coletivo, calendário, benefícios/descontos autorizados (inclusive verificar salário-família, pensão ou consignado quando pertinentes), dependentes quando aplicáveis, outros vínculos/remunerações relevantes, forma/data de pagamento, adiantamentos e pagamentos já realizados.

Usar holerites recentes do contador como evidência e comparação independente, em canal privado. Incorporar saldos/contexto histórico necessários à primeira competência, médias e eventos futuros, com origem marcada. Falta de histórico bloqueia apenas cálculos que dele dependem, não apaga o empregado.

O responsável confirma que todos os eventos do mês foram informados. Não assumir “sem faltas”, “sem férias”, “sem consignado”, “sem benefício” ou “sem outro vínculo” pela ausência de preenchimento. Diferenciar não informado de explicitamente não aplicável.

## 19. Riscos e segunda revisão crítica

| Risco revisado | Tratamento incorporado |
|---|---|
| Store tratada como empregador | Entidade legal + mapeamento autorizado de estabelecimentos/unidades. |
| Funcionário tratado como login/técnico | Identidades separadas e associação opcional tipada. |
| Dois salários atuais editáveis | Histórico salarial deriva da versão contratual canônica. |
| Seleção de regra somente pela competência | Data/período de pagamento e contexto cumulativo explícitos. |
| PAGA como único estado posterior a FECHADA | Estados de folha, liquidação, documento e governo independentes. |
| Hash apresentado como proteção total | Imutabilidade no serviço/banco, credenciais mínimas e backup. |
| Cálculo antigo muda com atualização | Entrada, regras, motor executável e documento preservados. |
| Reabertura destrói histórico | Nova revisão, diferenças e ajuste financeiro/documental. |
| Financeiro usa Float ou origem manual | Fronteira decimal validada e adaptador específico, sem reescrita global. |
| Dupla saída por duas telas | Comando compartilhado, sourceKey único e reconciliação. |
| Funcionário vira fornecedor | Beneficiário DP com ponte financeira, sem identidade fictícia. |
| Evento de fechamento perdido | Outbox transacional, retries e idempotência por consumidor. |
| PDF posterior altera números | Renderer sem cálculo e download de artefato arquivado. |
| Holerite vazando pelo Contador/Financeiro | ACL também em readers, títulos, download e ZIP; não só botão. |
| Pacote contábil fechado modificado pela folha | Versões/projeções e pendência de retificação, sem sobrescrita. |
| Preparação eSocial confundida com integração | Estados oficiais próprios e evidências; sem promessa de API não verificada. |
| RH completo atrasando urgência | 001–003 liberam núcleo, 004 integra; funções especiais têm fases próprias. |
| Sem dados de CCT/perfil | Gate no cálculo, não suposições nem cadastro bloqueado desnecessariamente. |

**Não construir agora:** ponto/biometria, ATS/recrutamento, avaliação de desempenho, portal completo do empregado, IA decidindo desconto/cálculo, fórmulas arbitrárias, integração bancária de transferência, todos os regimes/categorias simultaneamente, migrador global de identidades ou de Float, duplicata de Contador, microserviços e aplicativo mobile próprio de RH.

O plano não afirma conformidade de cada caso possível. Define escopo verificável, limites explícitos e gates para atingir operação real sem documentos fictícios. O primeiro passo é cadastro íntegro, não PDF avulso.

## 20. Registro das fontes consultadas

As referências `[Rxx]` identificam conteúdo do repositório lido pelo conector GitHub. Com exceção de R02, as leituras foram fixadas no SHA de baseline. Os caminhos abaixo permitem reproduzir a auditoria; não comprovam estado do banco ou deploy.

- **U01:** anexo do usuário `Texto colado(20260915-165255).txt`, briefing de continuidade de Pessoas/DP & RH, recebido em 15/09/2026.
- **R01:** branch `main`, metadados do commit `90b991e1972ee3a671f9c749f4fe8d1c4fa6d432`, merge PR #182 em 15/09/2026.
- **R02:** commit histórico `44f7d2fc8539293adfa01598cf85c33683fed26f`, `feat(contador): dashboard interno honesto — fim das fixtures que pareciam dado real`, 21/08/2026.
- **R03:** `lib/navigation/dashboard-nav-items.ts`.
- **R04:** `lib/auth/enterprise-permissions.ts`, trecho inicial e matriz de papéis.
- **R05:** `prisma/schema.prisma`, trechos de Store, Tecnico, LogsAuditoria, ContaPagarTitulo, CarteiraFinanceira, MovimentacaoFinanceira, AdminUser, AdminUserStore, configuração fiscal e modelos Contador.
- **R06:** `app/api/financeiro/pagar/route.ts`, linhas 1–260.
- **R07:** `lib/financeiro/services/contas-pagar-service.ts`, linhas 1–370.
- **R08:** `lib/contador/documentos/storage-types.ts`; árvore `lib/contador/documentos`.
- **R09:** `lib/events/event-bus.ts`.
- **R10:** `package.json`.

Fontes externas primárias consultadas em 15/09/2026. Usar a versão vigente e a redação aplicável à competência ao implementar; páginas podem mudar depois desta auditoria.

- **W01:** INSS, “Tabela de contribuição mensal”, atualização 13/01/2026. `https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal`
- **W02:** Receita Federal, “Tributação de 2026”, incidência/redução mensais, atualização 27/04/2026. `https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026`
- **W03:** eSocial, “Documentação Técnica”, leiautes e datas de implantação consultados na data do plano. `https://www.gov.br/esocial/pt-br/documentacao-tecnica`
- **W04:** eSocial, MOS S-1.3 consolidado até NO 11/2026, publicado 26/05/2026, retificado 28/05/2026, especialmente identificadores e seções 10.3.1/10.3.3/10.3.4. `https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-11-2026-retificada.pdf`
- **W05:** CLT, especialmente arts. 462 e 464. `https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm`
- **W06:** documentação oficial de `@react-pdf/renderer`, Node API e compatibilidade. `https://react-pdf.org/docs/v4/node` e `https://react-pdf.org/docs/v4/compatibility`
- **W07:** documentação oficial decimal.js, precisão e arredondamento. `https://mikemcl.github.io/decimal.js/`
- **W08:** LGPD, Lei 13.709, especialmente arts. 5º e 6º. `https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm`

## 21. Cobertura dos entregáveis do briefing

A diagnóstico: seção 2. B arquitetura: 1–3. C diagrama: 3. D entidades/schema: 4–5. E fluxos: 6–10 e 13. F motor: 6. G regras: 6. H fechamento: 7. I holerite: 8. J Financeiro: 9. K Contador: 10. L oficial: 11. M segurança: 12. N UX: 13. O GOALs: 16. P riscos/gates: 15/18/19. Q exclusões: 19. R primeiro GOAL: 17. Segunda revisão: 19.
