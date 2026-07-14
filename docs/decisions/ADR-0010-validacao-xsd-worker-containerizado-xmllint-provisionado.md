---
title: ADR-0010 · Validação XSD fiscal em worker containerizado com xmllint provisionado
status: aceita
data: 2026-07-14
autor: Codex (FISCAL-XSD-ADR-P01-DECISION-002A)
revisores: [Rafael Faria]
hub: cross
tags: [fiscal, nfce, xsd, xmllint, libxml2, worker, container, seguranca]
substitui:
superado_por:
---

# ADR-0010 · Validação XSD fiscal em worker containerizado com xmllint provisionado

> **Status:** aceita
> **Decisão em uma frase:** A validação XSD oficial da NFC-e será executada exclusivamente por
> **xmllint/libxml2 provisionado, fixado e verificável (B2), dentro de worker fiscal
> containerizado**, sem depender do binário do host, sem execução direta na Vercel e antes da
> assinatura e da transmissão.

---

## 1. Contexto e problema

O dry-run fiscal possui um placeholder em `lib/fiscal/dry-run/dry-run-validation.ts:72`. A função
`validarXsd` não valida o XML: sem schema retorna `xsd_nao_configurado`; com uma string XSD retorna
`xsd_presente_sem_validador` e nenhuma violação. Os testes atuais em
`lib/fiscal/dry-run/dry-run.test.ts:38` e `:86-95`, e o cenário em
`lib/fiscal/pipeline/fiscal-pipeline.test.ts:29`, preservam esse estado provisório.

O GOAL `FISCAL-XSD-OFFICIAL-VALIDATION-002` identificou o pacote oficial
`PL_010e_v1.02.zip`, leiaute 4.00 para NF-e/NFC-e modelos 55/65, e executou dois spikes
eliminatórios. A decisão humana do checkpoint foi: **Opção B aprovada com condições,
exclusivamente como B2 — xmllint provisionado em worker fiscal containerizado**.

O problema arquitetural é tornar a validação XSD real, offline, íntegra e previsível sem introduzir
no processo web uma biblioteca vulnerável, um binário implícito do host ou consumo de recursos não
controlado. A decisão também precisa preservar a arquitetura fiscal já aceita: satélite pós-commit,
fila, idempotência, snapshot imutável e venda nunca bloqueada pela SEFAZ.

### 1.1 Forças de decisão

- suporte completo a XSD 1.0 e ao grafo local de `xs:include`/`xs:import`;
- execução offline, fail-closed e sem resolução externa;
- proveniência oficial e atualização auditável do motor e dos schemas;
- isolamento de XML fiscal não confiável;
- limites externos de memória, CPU, PIDs, tempo, entrada e saída;
- reprodutibilidade em Linux/CI e independência do `PATH` do host;
- compatibilidade com a arquitetura assíncrona da ADR-0008;
- diagnóstico estruturado sem expor XML ou segredo em log;
- reversibilidade sem mudar o contrato do pipeline fiscal.

## 2. Evidências dos spikes

### 2.1 Pesquisa e pacote oficial

A branch `origin/fiscal/goal-002-xsd-official`, commit
`f7026bc165b0789a20c52901e9b57830414a4ddd`, identificou:

- ZIP oficial `PL_010e_v1.02.zip`, publicado pelo Portal Nacional da NF-e em 10/07/2026;
- SHA-256 do ZIP `d44ae5aa6a0d1cabf6235d2d2d47b75be5dd87bc6b90a7ec3dcec99c3d41bda1`;
- entrypoint `nfe_v4.00.xsd` e quatro dependências locais;
- cinco XSDs oficiais totalizando 441.480 bytes na captura original;
- resolução fechada: `nfe_v4.00.xsd` inclui `leiauteNFe_v4.00.xsd`, que importa
  `xmldsig-core-schema_v1.01.xsd` e inclui `tiposBasico_v4.00.xsd` e
  `DFeTiposBasicos_v1.00.xsd`.

### 2.2 Spike A — Node/WASM

A branch `origin/fiscal/goal-002-xsd-wasm-spike`, HEAD
`c0ec48da6a579ffea49d6b7bba87bc87a3b00f95`, demonstrou que
`xmllint-wasm@5.2.0` é funcional, offline, pequeno e empacotável com tracing explícito. A versão
avaliada foi rejeitada para produção porque embute libxml2 2.13.8, alcançada por vulnerabilidades
relevantes ao parser/XSD, incluindo CVE-2025-6021 e CVE-2026-6732. A rejeição é da versão testada,
não uma proibição permanente de toda abordagem WASM.

### 2.3 Spike B — xmllint nativo

A branch `origin/fiscal/goal-002-xmllint-native-spike`, HEAD
`7aee00ec7c81278445a982b85542c89de02957f7`, comparou:

- **B1 host/PATH:** ausente no Windows local; libxml2 2.9.9 no `windows-2022`; libxml2 2.9.14 no
  `ubuntu-24.04`. Origem e versão variaram e ficaram abaixo do piso 2.15.3;
- **B2 provisionado:** source oficial libxml2 2.15.3, SHA-256
  `78262a6e7ac170d6528ebfe2efccdf220191a5af6a6cd61ea4a9a9a5042c7a07`, com patch oficial
  `d3352554e4c1f052b914cda7b415d06b7eab5dfa` para `--maxmem`, patch SHA-256
  `ab319bb46b2aeb5f4311a12676b6b3eed1d18fb47721ae6274a849d31b96fb7c`;
- matriz Windows/Linux aprovada no GitHub Actions, 37/37 testes reais em cada plataforma;
- execução com `spawn`, sem shell, entrada por `stdin`, argumentos fixos, timeout, limite de saída,
  preflight de DTD/entidades e limpeza de temporários;
- o contador interno `--maxmem` não foi suficiente nem em 512 MiB; o limite de memória precisa ser
  imposto externamente pelo container, com concorrência controlada.

## 3. Alternativas consideradas

| Alternativa | Vantagens | Custos e riscos | Decisão |
|---|---|---|---|
| **A — `xmllint-wasm@5.2.0` em Node** | portável, sem binário do host, funcional e empacotável | libxml2 2.13.8 vulnerável na versão avaliada; timeout forte insuficiente | **rejeitada na versão avaliada**; release futuro corrigido pode ser reavaliado em GOAL próprio |
| **B1 — `xmllint` do host/PATH** | integração simples quando presente | versão, origem, ABI e disponibilidade imprevisíveis; Vercel não garante o binário | **rejeitada** |
| **B2 — `xmllint` provisionado em worker containerizado** | processo isolado, source/patch/hash fixos, offline, limites externos e imagem imutável | nova unidade operacional, fila, observabilidade, atualização de imagem e consumo de recursos | **escolhida com condições** |
| **C — Java/JAXP/Xerces em helper dedicado** | XSD 1.0 sólido, bom controle de resolver e erros | segunda stack, JRE, maior superfície operacional e cold start | **não selecionada**; contingência arquitetural se B2 deixar de ser sustentável |

## 4. Decisão

Adotar exclusivamente **B2: xmllint provisionado em worker fiscal containerizado**. O worker será
uma unidade interna, não pública, acionada por job persistido e fila. A aplicação web/Vercel não
executará `xmllint` diretamente e não dependerá de executável no `PATH`.

O motor será construído a partir de source oficial fixado. Enquanto não houver release oficial que
contenha a correção de `--maxmem`, o build poderá aplicar somente o patch upstream oficial já
identificado, após verificar seu hash. A imagem resultante será imutável, terá SBOM, scan de
vulnerabilidades e identidade de versão/hash reportável.

### 4.1 Condições obrigatórias

1. source oficial do libxml2 fixado;
2. patch oficial fixado, se ainda necessário;
3. hashes do source, patch, binário/imagem e XSDs verificados;
4. imagem imutável e identificada por digest;
5. SBOM gerada e arquivada;
6. scanner de vulnerabilidades com política de bloqueio;
7. egress do worker bloqueado;
8. schemas exclusivamente locais e em grafo allowlisted;
9. XML recebido por canal interno controlado;
10. processo iniciado por `spawn`, com `shell: false`;
11. caminho absoluto e argumentos fixos;
12. timeout externo com encerramento da árvore do processo;
13. limite externo de memória, CPU e PIDs no container;
14. limite de payload antes de enfileirar e antes de executar;
15. limite agregado de `stdout`/`stderr`;
16. logs sanitizados, sem XML integral nem dados fiscais desnecessários;
17. temporários isolados por execução;
18. limpeza em `finally` e rotina de varredura para resíduos de crash;
19. concorrência inicialmente unitária por instância;
20. fila persistente com backpressure;
21. retry somente para falha transitória e com orçamento explícito;
22. idempotência por job, hash do XML e versão do schema;
23. health, readiness e liveness checks;
24. versão e hashes reportáveis na resposta e telemetria;
25. processo documentado de atualização de segurança;
26. nenhum segredo na imagem, no payload ou nos logs;
27. nenhuma execução direta na Vercel;
28. nenhuma dependência de binário implícito no `PATH`;
29. nenhuma emissão, homologação ou ativação nesta decisão;
30. revisão humana antes de habilitar qualquer integração real.

## 5. Arquitetura e ordem do pipeline

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
xmllint provisionado + pacote XSD oficial local
        ↓
resultado estruturado e persistido
        ↓
próxima etapa do pipeline fiscal
```

A ordem normativa interna fica explícita:

```text
snapshot → tributos → XML → validação XSD → assinatura → regras/gates → transmissão
```

A validação XSD deve aprovar o XML antes da assinatura e da transmissão. Uma futura revalidação do
documento já assinado pode ser defesa adicional, mas não substitui o gate pré-assinatura. Falha XSD
é fail-closed para o pipeline fiscal; não desfaz a venda, que já foi persistida conforme ADR-0008.

O worker XSD não recebe certificado, CSC ou credencial SEFAZ, não assina, não emite e não transmite.

## 6. Limites e segurança

- DTD, `DOCTYPE`, declarações `ENTITY`, `schemaLocation` arbitrário, URL, caminho absoluto,
  traversal e symlink são rejeitados antes do parser;
- `--nonet` e `--nocatalogs` são defesa em profundidade; a barreira principal é o container sem
  egress e o grafo local fechado;
- o XML segue por `stdin` ou por referência interna segura; não compõe linha de comando;
- filesystem raiz é somente leitura, usuário é não root, capabilities Linux são removidas e o
  temporário tem quota;
- o payload não carrega segredo; autorização futura é escopada por `storeId`;
- o limite inicial de XML deve partir dos 2 MiB comprovados no spike e só mudar com evidência;
- erros são estruturados e sanitizados; dados do documento não são métrica nem log.

## 7. Deployment, operação e observabilidade

Não se escolhe provedor de hospedagem nesta ADR. O destino deve suportar container imutável,
isolamento, fila persistente, limites de recursos e egress bloqueado. Vercel permanece como origem da
aplicação, não como local aprovado para executar o binário.

O worker publica, no mínimo:

- health de processo e integridade do binário/XSD;
- readiness condicionada a versões e hashes permitidos;
- liveness sem executar XML fiscal real;
- métricas de duração, fila, resultado, timeout, retry, DLQ e versão, sem payload;
- tracing por correlation ID e job ID;
- logs estruturados sanitizados;
- rollout canário, rollback por digest e drenagem segura da fila.

## 8. Atualização de dependências

Cada atualização do libxml2, patch, toolchain ou pacote XSD exige:

1. captura de fonte oficial e licença;
2. hash SHA-256 e assinatura/digest quando disponível;
3. diff do source/patch e do grafo XSD;
4. build reproduzível e SBOM;
5. scan de CVEs e revisão dos caminhos alcançáveis;
6. suíte de fixtures maliciosas, válidas e inválidas;
7. matriz Linux/CI e teste do limite externo;
8. publicação de imagem por digest, canário e rollback;
9. aprovação humana quando mudar versão permitida ou comportamento fiscal.

Uma mudança de bytes com o mesmo nome de pacote é incidente de proveniência e falha fechada.

## 9. Consequências

### 9.1 Positivas

- versão, source, patch, binário/imagem e schemas tornam-se verificáveis;
- XML hostil fica fora do processo web e sob limites externos reais;
- o contrato de resultado é independente do mecanismo de execução;
- o worker mantém o validador offline e desacoplado da Vercel;
- B1 e versões vulneráveis falham antes de validar documento.

### 9.2 Negativas / custos

- surge uma segunda unidade de deploy e uma fila operacional;
- validação passa a depender da disponibilidade interna do worker;
- manutenção inclui imagem, SBOM, scanner, CVEs e atualização do libxml2;
- latência inclui enfileiramento e persistência, não apenas os 20–80 ms medidos no spike;
- concorrência unitária reduz throughput inicial e exige capacidade planejada.

### 9.3 Riscos e mitigação

| Risco | Mitigação obrigatória |
|---|---|
| exaustão de memória/CPU pelo parser | limites do container, timeout, payload limitado, concorrência 1 |
| vulnerabilidade nova no libxml2 | scan contínuo, allowlist de versão, rebuild por digest e kill-switch |
| job duplicado ou resposta incerta | idempotência, persistência de resultado, reconciliação por job/hash |
| indisponibilidade do worker/fila | readiness, backpressure, retry seguro, DLQ e alerta |
| vazamento de XML em diagnóstico | mensagens sanitizadas, saída limitada, sem XML integral em log |
| adulteração de binário/XSD | hashes em startup e por job, imagem imutável, falha fechada |
| drift entre ambientes | proibição de PATH/B1, mesma imagem por digest |

## 10. Reversibilidade e reconsideração

A decisão é reversível no nível do adaptador: o contrato de entrada/saída do worker não deve expor
detalhes do CLI. Desabilitar a versão/imagem ou pausar a fila interrompe apenas a etapa fiscal; não
reverte vendas e não autoriza pular a validação.

Reconsiderar esta ADR somente se:

- B2 não alcançar SLOs medidos com carga representativa mesmo após dimensionamento;
- o libxml2 deixar de ser mantido ou acumular risco sem correção aceitável;
- surgir release WASM corrigido, auditável e operacionalmente superior;
- Java/Xerces ou outro motor isolado reduzir materialmente risco/custo com a mesma previsibilidade;
- a arquitetura de deploy do produto mudar e oferecer sandbox nativo equivalente comprovado.

Mudança de direção exige nova ADR que substitua esta; não editar silenciosamente uma ADR aceita.

## 11. Impacto nos GOALs e gates

- `FISCAL-XSD-OFFICIAL-VALIDATION-002` continua aberto: esta ADR decide o caminho, não implementa.
- O próximo ciclo deve implementar B2 e o contrato arquitetural sem copiar o spike inteiro.
- `validarXsd` continua no-op e o pipeline continua desconectado.
- O dry-run permanece N3 e não destrava F5 enquanto o gate XSD real não estiver verde.
- G-F5, G-F7 e G-F12 permanecem abertos e inalterados.
- Não há homologação, produção, emissão, chamada SEFAZ ou ativação de loja.

## 12. Fora de escopo

- implementar worker, fila, API, adaptador ou `validarXsd`;
- integrar ou copiar branches experimentais;
- escolher provedor de container/fila;
- instalar dependência, binário ou XSD nesta branch documental;
- tocar banco, Prisma, certificados, segredos, emissão ou SEFAZ;
- declarar o GOAL-002, dry-run, homologação ou produção concluídos.

## 13. Referências e relação com ADRs existentes

- **ADR-0008:** esta decisão preserva satélite pós-commit, fila, idempotência, venda independente e
  default-off. A falha do worker nunca desfaz a venda.
- **ADR-0009:** o worker XSD não recebe os segredos definidos pelo cofre fiscal.
- `docs/fiscal/FISCAL_XSD_RESEARCH_001.md`, `FISCAL_XSD_MANIFEST_001.md` e
  `FISCAL_XSD_VALIDATOR_OPTIONS_001.md` na branch de pesquisa.
- `docs/fiscal/FISCAL_XSD_WASM_SPIKE_001.md`, `FISCAL_XSD_SECURITY_REVIEW_001.md` e
  `FISCAL_XSD_PACKAGING_REPORT_001.md` na branch WASM.
- `docs/fiscal/FISCAL_XSD_NATIVE_SPIKE_001.md`,
  `FISCAL_XSD_NATIVE_SECURITY_REVIEW_001.md` e
  `FISCAL_XSD_NATIVE_DEPLOYMENT_REPORT_001.md` na branch nativa.
- `docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md` e
  `docs/fiscal/FISCAL_RECONCILE_REPORT_001.md`.

## 14. Aprovação humana e notas

Rafael aprovou expressamente em 14/07/2026: **“Opção B aprovada com condições, exclusivamente como
B2: xmllint provisionado em worker fiscal containerizado.”** Por isso o status é `aceita`, conforme
o enum real do projeto.

O identificador provisório “ADR-P01” deste checkpoint é escopado ao
`FISCAL-XSD-ADR-P01-DECISION-002A`. A reconstrução anterior do pacote Fable usava ADR-P01 para
autoridade tributária e ADR-P02 para proveniência XSD; essa ambiguidade histórica é preservada e
explicada no mapeamento fiscal. O número real desta decisão é ADR-0010, próximo número global livre
na `origin/main` e nas branches remotas consultadas em 14/07/2026.

O `docs/decisions/INDEX.md` não é alterado neste GOAL porque não pertence à allowlist explícita. A
integração da ADR deve acrescentar seu índice em etapa autorizada, sem mudar o conteúdo aceito.
