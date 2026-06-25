---
title: ADR-0009 · Cofre de segredos fiscais (certificado A1, senha, CSC)
status: aceita
data: 2026-06-24
autor: Claude Opus (BL-FISCAL-001 — ADR do cofre de segredos)
revisores: [Rafael Faria]
hub: cross
tags: [fiscal, seguranca, certificado, a1, csc, vault, kms, multi-loja]
substitui:
superado_por:
---

# ADR-0009 · Cofre de segredos fiscais

> **Status:** aceita
> **Decisão em uma frase:** Os segredos fiscais (`.pfx` A1, senha do certificado, token CSC) são
> guardados **sempre por referência opaca** (`blobRef`/`senhaRef`/`cscTokenRef`) resolvida por um
> **port único `FiscalSecretVault`** server-side — com backend **EnvVault** (env por loja) no
> piloto/homologação e **KmsStorageVault** (envelope encryption + storage privado) em produção —
> **sem nenhuma mudança de schema** e **sem o segredo jamais tocar o banco em claro, o log, o
> cliente ou a IA**.

---

## 1. Contexto

A frente Fiscal saiu das Fases 0–2 com uma fundação dormente madura: schema migrado
(`0013_fiscal_foundation`), identidade fiscal por loja, máquina de estados, snapshot, provider
abstrato (STUB), pipeline e numeração — tudo `simulado = true` e `fiscalEnabled = false`. A
auditoria da Fase 2 confirmou o **maior bloqueio** para sair da simulação: **não existe cofre**
onde guardar o certificado A1 e seus segredos. Sem isso, a assinatura digital (F4) — pré-requisito
da transmissão SEFAZ (F5) — não pode existir com segurança. Este é o **Gate G-F1** do
`MASTER_FISCAL_EXECUTION_PLAN`.

O schema **já prevê** o contrato de referência (decisão herdada do GOAL_001B + ADR-0008 P6):

- `CertificadoDigital.blobRef` → ponteiro para o `.pfx` (bytes **fora** do banco).
- `CertificadoDigital.senhaRef` → ponteiro para a senha do `.pfx`.
- `ConfiguracaoFiscalLoja.cscId` (identificador, **não-segredo**) + `cscTokenRef` (ponteiro p/ token CSC).
- `ConfiguracaoFiscalLoja.providerTokenRef` → ponteiro p/ token de gateway (quando houver).
- `CertificadoDigital.status` (`PENDENTE_VALIDACAO` default) + `ativo` (`false` default) + `validoDe/validoAte`.

Falta apenas **decidir o que esses `*Ref` apontam** e **como o segredo é resolvido em runtime** —
sem implementar nada agora (esta fase é só decisão).

**Restrições:**
- **Segurança (inegociável):** `.pfx`/senha/CSC vazados permitem emitir documento fiscal em nome do
  contribuinte. Nunca em coluna em claro, log, trace, `FiscalLog.detalhe`, bundle do cliente ou IA.
- **Multi-loja estrito (ADR-0003):** segredo por `storeId`, sem cruzar lojas, sem fallback `loja-1`.
- **Sem mudança de schema:** os `*Ref` já existem; a decisão deve caber neles (ADR-0008 P6, plano §11).
- **Plataforma:** deploy Vercel (env secrets nativos), banco Supabase (Storage/Vault disponíveis).
- **Governança:** áreas protegidas (schema, auth, runtime fiscal) intocadas; só documentação aqui.

**Estado atual relevante:**
- `docs/architecture/FISCAL_SECURITY.md` em 2026-06-24: §3 listava 4 opções de cofre "a decidir na F1".
- `docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md`: **F1 = este ADR** (Gate G-F1); bloqueia F4.
- `docs/roadmaps/ROADMAP_FISCAL.md`: BL-FISCAL-1 (cofre indefinido) bloqueia a assinatura.

**Precedente forte no próprio repo (ADR-0006 · WhatsApp):** `resolveStoreWhatsAppCredentials`
(`lib/whatsapp/store-credentials.ts`) guarda no banco apenas `tokenEnvKey` (um **nome**); o token
real é lido de `process.env[tokenEnvKey]` (secret Vercel), **nunca persistido**, e retorna `null`
se ausente — sem fallback global. Esta ADR **espelha** esse padrão para o fiscal.

---

## 2. Decisão

**D1 — Contrato único por referência opaca + port `FiscalSecretVault`.**
Os `*Ref` são **referências opacas**, nunca o segredo. Todo acesso passa por **um** port
server-side (a implementar na F4), com a forma conceitual:

```
interface FiscalSecretVault {
  // Resolve o segredo a partir da referência. Server-only. Nunca loga, nunca devolve ao client.
  getCertificadoPfx(storeId, blobRef): Promise<Buffer | null>
  getCertificadoSenha(storeId, senhaRef): Promise<string | null>
  getCscToken(storeId, cscTokenRef): Promise<string | null>
  // Escrita/rotação (admin-only, auditada). Recebe o segredo, devolve a NOVA referência.
  putCertificadoPfx(storeId, bytes, senha): Promise<{ blobRef; senhaRef }>
  putCscToken(storeId, token): Promise<{ cscTokenRef }>
  revoke(storeId, ref): Promise<void>
}
```

O resolver retorna `null` quando o segredo está ausente (caller **não** emite e **não** cai em
global) — exatamente como `resolveStoreWhatsAppCredentials`. **Os callers (assinatura, CSC) nunca
sabem qual backend está por trás.**

**D2 — Backend do piloto/homologação: `EnvVault` (env por loja).**
`blobRef`/`senhaRef`/`cscTokenRef` guardam **nomes de variáveis de ambiente** (secrets Vercel,
cifrados em repouso pela plataforma), por loja. Ex.: `blobRef = "FISCAL_A1_PFX_B64_<STORE>"`,
`senhaRef = "FISCAL_A1_SENHA_<STORE>"`, `cscTokenRef = "FISCAL_CSC_TOKEN_<STORE>"`. O `.pfx` é
gravado **base64** no env (cifrado pela Vercel), a senha e o token CSC em envs próprios. Zero infra
nova; consistente com ADR-0006; adequado para **1 loja-piloto** em homologação. **Não escala** para
muitas lojas (limites de env + rotação manual) — e isso é aceitável no piloto.

**D3 — Backend de produção/escala: `KmsStorageVault` (envelope encryption + storage privado).**
O `.pfx` é cifrado com uma **data key por loja**; a data key é **embrulhada (wrap) por uma
master key no KMS**; o blob cifrado mora em **bucket privado** (Supabase Storage ou equivalente).
`blobRef` = caminho do blob; `senhaRef`/`cscTokenRef` = referências a segredos em store gerenciado
(Supabase Vault / KMS). Separa o segredo do **backup do banco**, suporta **rotação por loja**,
auditoria e escala. **Mesmo contrato** do D1 — a migração piloto→produção **não toca schema nem
callers**, só troca o backend resolvido por ambiente.

**D4 — `.pfx` e senha: onde ficam.**
- **Piloto:** `.pfx` base64 em env Vercel (cifrado em repouso); senha em env separada.
- **Produção:** `.pfx` cifrado (envelope) em bucket privado; senha em secret gerenciado (KMS/Vault).
- **Nunca:** bytes do `.pfx` ou senha em coluna do Postgres, em claro ou base64-sem-cifra.

**D5 — CSC: identificador público + token secreto.**
`cscId` é identificador (fica em claro na config, ok). O **token CSC** é segredo → `cscTokenRef`
no mesmo cofre (env no piloto, secret gerenciado em produção). Nunca em claro/log/client/IA.

**D6 — Quem cadastra/rotaciona: admin fiscal apenas, server-side.**
Cadastro/ativação/rotação/revogação exigem papel **`admin`** (SUPER_ADMIN/ADMIN) via
`requireFiscalAdmin` (`enterpriseRoleFromUserRole(role) === "admin"` + `canAccessStore`).
**`gerente`/`caixa`/`tecnico`/`vendedor`/`OPERADOR` não acessam segredo fiscal** — nem leitura,
nem escrita. A escrita do binário/senha é **server-only** (Node runtime), nunca via client.

**D7 — Auditoria de acesso.**
Toda operação de segredo grava `FiscalLog` (append-only) com `operador`, `acao`, `storeId` e
detalhe **sem o segredo**. Ações novas (a criar na F4): `secret.set`, `secret.rotate`,
`secret.revoke`, `secret.access` (resolução para assinatura). A trilha permite responder "quem
acessou o A1 da loja X e quando".

**D8 — Revogação.**
Revogar = `CertificadoDigital.status = REVOGADO` + `ativo = false` + **destruir o material**:
piloto = zerar/remover a env; produção = deletar o blob cifrado e **revogar a data key no KMS**.
CSC: emitir novo `cscId`/token. **Documento já autorizado permanece** (XML imutável — ADR-0008 P4);
revogação afeta só emissões futuras.

**D9 — Multi-loja.**
`*Ref` são por loja (`CertificadoDigital.storeId`, `ConfiguracaoFiscalLoja.storeId`); o vault
**escopa por `storeId`** e nunca resolve segredo de outra loja. Nomes de env são por loja
(`..._<STORE>`); blobs de produção têm prefixo por loja no bucket. Habilitar uma loja não expõe outra.

**D10 — Robustez à decisão de provider (Gate G-F5).**
Se a F5 escolher um **gateway que custodia o A1** (Focus/PlugNotas/eNotas/NFE.io), o `.pfx` **não**
fica local: `blobRef`/`senhaRef` ficam vazios para aquela loja e o vault custodia apenas o
**token do gateway** (`providerTokenRef`) + CSC. O contrato (D1) **não muda** — só encolhe o que é
guardado localmente. A decisão do cofre é **independente e compatível** com qualquer rota da F5.

**Regras inegociáveis (constam do ADR e replicadas no FISCAL_SECURITY):**
- ❌ Nunca salvar senha em texto puro. ❌ Nunca salvar `.pfx` base64 **sem cifra** no banco.
- ❌ Nunca expor segredo no client. ❌ Nunca logar segredo. ❌ Nunca enviar segredo para IA.
- ❌ Nunca operador comum acessa segredo — **admin fiscal apenas**.
- ✅ Toda ação de segredo gera auditoria (`FiscalLog`).
- ✅ Certificado nasce **inativo** (`PENDENTE_VALIDACAO`/`ativo=false`) até validação.
- ✅ **Produção só após homologação** (ambiente vira `PRODUCAO` por loja só na F12).

**O que esta decisão NÃO inclui (escopo fechado):**
- Não **implementa** o vault (port + backends são da F4). Esta fase é só decisão.
- Não cria env real, não sobe `.pfx` real, não toca schema/runtime/Supabase/APIs.
- Não escolhe o **provider** fiscal (Gate G-F5) — apenas garante compatibilidade (D10).
- Não decide o fornecedor exato de KMS de produção (Supabase Vault × cloud KMS) — decisão de
  implementação da F4, dentro do backend `KmsStorageVault`; o contrato já está fixado aqui.

---

## 3. Alternativas consideradas

> Avaliação no contexto do OmniGestão Pro (Vercel + Supabase, multi-loja, piloto 1 loja → escala).
> Legenda: 🟢 bom · 🟡 médio · 🔴 ruim.

| # | Alternativa | Segurança | Custo | Complex. | Multi-loja | Vazamento | Backup/Restore | Rotação | Homolog. | Produção | MVP/Piloto | Escala |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **ENV por loja** (escolhida p/ piloto) | 🟡 cifrado pela Vercel | 🟢 zero | 🟢 baixa | 🟡 nome por loja | 🟡 quem lê env do deploy | 🟡 fora do DB | 🔴 manual | 🟢 ok | 🟡 limitado | 🟢 ideal | 🔴 não escala |
| 2 | Supabase Storage + cripto app-level | 🟡 depende da chave | 🟢 baixo | 🟡 média | 🟢 path por loja | 🟡 se a chave vaza | 🟢 bom | 🟡 ok | 🟢 | 🟡 | 🟡 | 🟢 |
| 3 | Supabase Vault | 🟢 gerenciado | 🟢 incluso | 🟡 média | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 |
| 4 | **KMS externo + storage** (escolhida p/ produção) | 🟢 envelope+wrap | 🟡 OPEX | 🔴 alta | 🟢 data key/loja | 🟢 mínimo | 🟢 | 🟢 | 🟢 | 🟢 | 🔴 over p/ piloto | 🟢 ideal |
| 5 | Serviço dedicado de segredo (HashiCorp Vault) | 🟢 | 🔴 alto | 🔴 alta | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🔴 | 🟢 |
| 6 | Banco "criptografado" (`.pfx`/senha em coluna) | 🔴 backup carrega segredo | 🟢 | 🟢 | 🟢 | 🔴 alto | 🔴 dump vaza | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| 7 | Gateway fiscal custodia o A1 | 🟢 sem A1 local | 🔴 recorrente | 🟢 (no fiscal) | 🟢 | 🟢 (sem `.pfx`) | 🟢 | 🟢 (no gateway) | 🟢 | 🟢 | 🟢 | 🟢 |

**Leitura:** opção **6 é proibida** (viola ADR-0008 P6 — backup do DB carrega segredo). Opções 3/4/5
são fortes para escala, mas 4/5 são **over-engineering** para 1 loja-piloto. Opção 1 é a mais simples
e **já é o padrão do projeto** (ADR-0006) → vence no piloto. Opção 4 (envelope+KMS) vence na produção
por isolar o segredo do banco com rotação real. **Opção 7 é ortogonal** (decidida no Gate G-F5): se
adotada, reduz o problema local a CSC + token de gateway — o contrato (D1) absorve os dois cenários.

---

## 4. Consequências

### 4.1 Positivas
- **Bloqueio destravado:** F4 (assinatura) tem um cofre definido para carregar o A1 com segurança.
- **Zero schema:** os `*Ref` já existem; nada de migração (plano §11 respeitado).
- **Consistência:** mesmo padrão do WhatsApp (ADR-0006) — uma só mentalidade de "segredo por nome".
- **Caminho piloto→produção sem refactor:** trocar `EnvVault` por `KmsStorageVault` é trocar o
  backend do port; callers e schema intactos.
- **Postura forte:** segredo nunca no DB/log/client/IA; admin-only; auditável; revogável.

### 4.2 Negativas / Custos
- **Piloto não escala:** env por loja exige trabalho manual e não serve a muitas lojas (aceito no piloto).
- **Produção tem OPEX/complexidade:** KMS + storage privado + rotação são mais peças (justificável na escala).
- **Dois backends para manter** (Env e Kms) — mitigado pelo contrato único.

### 4.3 Riscos introduzidos
- **Vazamento de env do deploy** (piloto) → mitigação: acesso ao painel Vercel restrito; produção
  migra para KMS; nunca env em build do client (só server).
- **Perda da master key (KMS)** torna blobs ilegíveis → mitigação: política de backup/rotação de
  chave do KMS + reemissão do certificado (documento autorizado é imutável, não depende do A1).
- **Ref órfã** (`*Ref` apontando para segredo inexistente) → o resolver retorna `null` e o caller
  **não emite** (fail-closed) — comportamento seguro por construção.

### 4.4 O que muda imediatamente
- **Arquivos:** este ADR + atualização de `FISCAL_SECURITY.md`, `MASTER_FISCAL_EXECUTION_PLAN.md`,
  `decisions/INDEX.md`, `ROADMAP_FISCAL.md`. **Nenhum código produtivo.**
- **Decisões afetadas:** subordina-se a **ADR-0008** (P6); **complementa** o Gate G-F5 (provider) via D10.
- **Blocker:** **BL-FISCAL-1 resolvido** (decisão tomada); a implementação vai para a F4.

### 4.5 O que muda no longo prazo
- A F4 implementa o port `FiscalSecretVault` + `EnvVault`; a virada de produção (rumo à F12)
  implementa `KmsStorageVault`. O contrato fixado aqui garante que isso seja uma sprint isolada.

---

## 5. Plano de implementação

**Esta decisão é só decisão — implementação vai para sprint (F4).**

- Sprint sugerida: **F4 — Assinatura A1**, que inclui o port `FiscalSecretVault` + backend `EnvVault`
  + as ações de auditoria `secret.*` no `FiscalLog`. Produção (`KmsStorageVault`) entra rumo à F12.
- Owner humano: Rafael Faria.
- Pré-requisitos: este ADR aprovado (Gate G-F1). **Nenhum `.pfx` real antes disso.**
- Critério de pronto da implementação (F4): A1 carregado do vault e usado para assinar XML
  verificável; segredo **nunca** em log/trace/bundle; ações de segredo auditadas; resolver
  fail-closed (`null` ⇒ não emite).

---

## 6. Validação / como saberemos que deu certo

- **Métrica 1 — isolamento:** 0 ocorrências de `.pfx`/senha/CSC em coluna/log/bundle (auditável por
  varredura em `.next/static`, schema e logs).
- **Métrica 2 — admin-only:** 100% das ações de segredo barradas para papéis ≠ `admin` (teste de guard).
- **Métrica 3 — auditável:** toda resolução/escrita/rotação/revogação deixa entrada em `FiscalLog`.
- **Métrica 4 — fail-closed:** ref ausente ⇒ emissão não ocorre (sem fallback global).
- Janela de observação: durante a F4 e o piloto de homologação (F7/F11).

---

## 7. Referências

- ADRs relacionados: **ADR-0008** (arquitetura fiscal — P6 segredo por referência),
  **ADR-0006** (WhatsApp `tokenEnvKey` — precedente direto), **ADR-0003** (multi-loja sem fallback).
- Arquitetura: `docs/architecture/FISCAL_SECURITY.md` (§3 atualizado por este ADR),
  `docs/architecture/NFCE_ARCHITECTURE.md` (Etapa 4 assinatura), `docs/architecture/FISCAL_SCHEMA_DESIGN.md`.
- Governança: `docs/governance/MASTER_FISCAL_EXECUTION_PLAN.md` (F1/F4 · Gate G-F1).
- Auditorias: `docs/audits/AUDITORIA_FISCAL_GAPS_v01.md` (P0-3, P1-6), Fase 2 (auditoria de código).
- Código precedente: `lib/whatsapp/store-credentials.ts`, `lib/fiscal/guard-fiscal-admin.ts`,
  `lib/auth/enterprise-permissions.ts`, `app/api/fiscal/certificado/**`, `prisma/schema.prisma`
  (`CertificadoDigital`, `ConfiguracaoFiscalLoja`).

---

## 8. Notas / discussão

- **Por que não pular direto para KMS:** porque o piloto é **uma loja em homologação**. Pagar a
  complexidade do KMS antes de validar a emissão é inverter a ordem de risco. O contrato único
  garante que adotar KMS depois seja barato. "A solução mais simples que satisfaz o critério vence."
- **Por que env (e não banco cifrado) no piloto:** porque o requisito-mãe (ADR-0008 P6) é **tirar o
  segredo do banco**. Env cumpre isso com cifra de plataforma e zero infra; banco cifrado mantém o
  segredo no dump. A escolha é guiada pelo princípio, não pela conveniência.
- **Por que admin-only e não "gerente fiscal":** hoje o papel `gerente` tem financeiro completo, mas
  **segredo de assinatura é mais sensível que dado financeiro** — comprometê-lo permite forjar
  documento fiscal. Mantém-se o gate mais estrito já existente (`requireFiscalAdmin`). Um papel
  "supervisor fiscal" dedicado pode ser criado no futuro, mas exige ADR próprio (mudança no modelo
  de permissões) — fora deste escopo.
- **Trade-off aceito:** simplicidade no piloto (env, não escala) em troca de velocidade segura para
  destravar a F4, com caminho de produção (KMS) já decidido e sem refactor. O humano dono aprovou.
