# DIAGNÓSTICO — "Venda Completa parece abrir como PDV comum" (máquina da loja) — v01

> **Tipo:** Runbook operacional de diagnóstico · **Modo:** READ ONLY (não altera código nem comportamento do app).
> **Data:** 2026-06-10 · **Autor:** Claude Code (Opus) · **Loja-alvo:** RafaCell (produção Vercel).
> **Relacionado:** `docs/audits/AUDITORIA_OPERACIONAL_PDV_FINAL_v03.md` (auditoria que originou este runbook).
>
> **Para quem é:** quem estiver na **máquina física da loja** onde o sintoma aparece. Este documento é um
> procedimento guiado de console do navegador — **não** é uma correção de código. Todos os snippets de
> *diagnóstico* são **somente leitura** (`getItem`/`JSON.parse`); os snippets de *limpeza* são destrutivos e estão
> claramente sinalizados e travados atrás da verificação de vendas pendentes.

---

## 1. Contexto do problema

No Vendas HUB existe o card **"Venda Completa"**, que deve abrir a tela comercial estruturada
(`VendaCompletaEnterprise` — cliente obrigatório, NF, tipos de venda) e **não** o PDV de balcão comum.

A auditoria **v03** (ver §13) provou, com histórico de git, que:

- O link do card aponta para `/dashboard/vendas/venda-completa` **desde o primeiro commit do arquivo**
  (`365418a`) — **nunca** apontou para o PDV comum.
- A rota `/dashboard/vendas/venda-completa` renderiza o componente real **sem redirect**.
- Portanto **o link nunca regrediu em código.**

Mesmo assim, em algumas máquinas o sintoma "abre o PDV comum" aparece. A causa, então, **não é o link** — é
**estado da máquina** (localStorage legado e/ou cache do PWA). Este runbook separa as causas com segurança.

---

## 2. Sintomas observados

- Ao clicar em **"Venda Completa"**, o usuário relata que abre **o PDV comum** (balcão Clássico) em vez da tela
  de Venda Completa.
- O comportamento **não se reproduz em um clone limpo** do sistema — só na máquina específica da loja.
- Sensação de "já tinha sido corrigido e voltou".

Essa assinatura ("só na máquina X, some no ambiente limpo") é típica de **estado persistido no navegador**
(localStorage e/ou Service Worker), não de bug no código publicado.

---

## 3. Diferença entre bug de código × cache/localStorage

| Característica | Bug de código (link/rota errados) | Estado da máquina (localStorage / PWA) |
|---|---|---|
| Reproduz em clone limpo / outra máquina? | **Sim** | **Não** (só na máquina afetada) |
| Reproduz em aba anônima/privada? | **Sim** | Normalmente **não** (sem SW/localStorage herdados) |
| Sai com hard refresh / limpar cache? | Não | **Sim** |
| Origem | `href`/rota/redirect no repositório | `localStorage` legado **ou** Service Worker servindo bundle/shell antigo |
| Conserto | PR de código (novo GOAL) | Limpeza guiada na máquina (este runbook) |

**Mecanismo de runtime conhecido (não é o link):** em `/dashboard/vendas` (a rota do PDV, não o card), se o
`localStorage` tiver `omni-pdv-classic-layout = "venda-completa"` (resíduo legado), o app **normaliza esse valor
para o Clássico comum em silêncio** (`vendas-pdv.tsx`). Some no clone limpo porque depende do `localStorage`
local. O segundo vetor é o **PWA**: Service Worker ativo (`skipWaiting`, `cacheOnFrontEndNav`) pode servir um
shell/bundle antigo.

> **Teste rápido para confirmar "é máquina, não código":** abra em **aba anônima** (Ctrl+Shift+N) e clique no
> card "Venda Completa". Se abrir a tela **certa** na anônima e **errada** na normal → é estado da máquina
> (siga este runbook). Se abrir **errado nas duas** → me avise: aí investigamos código.

---

## 4. Checklist de segurança (LER ANTES DE QUALQUER LIMPEZA)

- [ ] **NUNCA** usar **"Clear site data" / "Clear storage"** (aba Application). Isso apaga o `localStorage`, que é
      **onde ficam as vendas offline não sincronizadas** → risco de **perder venda**.
- [ ] Sempre, **nesta ordem**: (1) checar vendas pendentes → (2) sincronizar se houver → (3) só então limpar.
- [ ] Limpar **apenas Service Worker + Cache Storage** é seguro para as vendas (storage diferente), mas
      **sincronize antes mesmo assim**.
- [ ] Limpar **só a chave de layout** (`omni-pdv-classic-layout*`) é a ação mais cirúrgica e **não** toca em
      vendas.
- [ ] Confirmar que a máquina está **online** antes de sincronizar.
- [ ] Não fechar a aba durante a sincronização.

---

## 5. Chaves reais usadas pelo app (referência)

Verificadas no código (READ ONLY):

| Finalidade | Chave(s) reais | Pode conter `venda-completa`? | Fonte |
|---|---|---|---|
| Sub-layout do PDV Clássico | `omni-pdv-classic-layout` (legado global) **e** `omni-pdv-classic-layout::{storeId}` | **SIM — é esta** | `lib/store-scoped-storage.ts:56-57`, `lib/pdv-classic-layout.ts:24` |
| Layout principal do PDV | `@omnigestao:pdv-layout` **e** `@omnigestao:pdv-layout::{storeId}` | Não (só `classic`/`supermercado`/`next`) | `lib/store-scoped-storage.ts:52-54`, `lib/pdv-layout-storage.ts` |
| Modo do PDV | `omnigestao-pdv-modo` **e** `omnigestao-pdv-modo::{storeId}` | Não | `lib/store-scoped-storage.ts:59-60` |
| Ramo de atuação | `@omnigestao:ramo-atuacao:{storeId}` | Não | `vendas-pdv.tsx` |
| **Vendas / devoluções / caixa pendentes** | `assistec-pro-ops-v1-{storeId}` (ou legado `assistec-pro-ops-v1`) → JSON com `sales[].syncPending` | — | `lib/ops-loja-id.ts:4`, `lib/loja-ativa.tsx:36`, `lib/operations-store.tsx:446-453,521` |

> ⚠️ Chaves do tipo `omni-pdv-sale-mode` e `omnigestao:pdv-layout` **não existem** no app — o `saleMode` é estado
> React em memória (não é persistido). Não procure por elas.
>
> ⚠️ Os layouts são **scoped por loja** (`...::{storeId}`). Conferir só a chave "global" pode dar `null` e
> mascarar o problema — sempre escanear por **substring** (snippets abaixo já fazem isso).

---

## 6. PASSO A — Abrir o sistema e o Console

1. Acessar: **https://omni-gestao-pro.vercel.app/dashboard/vendas/venda-completa**
2. Pressionar **F12** → aba **Console**.

---

## 7. PASSO B — 🔴 Verificação de vendas pendentes (NÃO PULE)

Cole no Console (somente leitura — não altera nada):

```js
(() => {
  const opsKeys = Object.keys(localStorage).filter(k => k.startsWith("assistec-pro-ops-v1"));
  let totalPend = 0; const detalhe = [];
  for (const k of opsKeys) {
    let s; try { s = JSON.parse(localStorage.getItem(k) || "{}"); } catch { continue; }
    const vp = (s.sales||[]).filter(x => x.syncPending === true).length;
    const dp = (s.devolucoes||[]).filter(x => x.syncPending === true).length;
    const cp = (s.pendingCaixaOperations||[]).filter(x => x.syncPending === true).length;
    totalPend += vp + dp + cp;
    detalhe.push({ chave:k, vendasPendentes:vp, devolucoesPendentes:dp, caixaPendente:cp,
                   totalVendas:(s.sales||[]).length });
  }
  console.table(detalhe);
  console.log(totalPend === 0
    ? "✅ SEM pendências — seguro prosseguir para limpeza."
    : `🔴 ${totalPend} item(ns) PENDENTE(S) — SINCRONIZE ANTES de limpar qualquer coisa.`);
  return totalPend;
})();
```

- **`🔴 ... PENDENTE(S)`** → ir ao **PASSO E (sincronização)** e **não limpar nada ainda**.
- **`✅ SEM pendências`** → pode seguir para o **PASSO C / D** (diagnóstico) e depois **F (limpeza)**.

---

## 8. PASSO C — Verificação de localStorage (layout legado)

**C.1 — Procurar o valor `venda-completa` nas chaves de layout:**

```js
Object.keys(localStorage)
  .filter(k => k.includes("omni-pdv-classic-layout") || k.includes("@omnigestao:pdv-layout") || k.includes("omnigestao-pdv-modo"))
  .map(k => ({ chave:k, valor: localStorage.getItem(k) }));
```

👉 Se qualquer linha mostrar **`valor: "venda-completa"`** → **causa confirmada: localStorage legado.**

**C.2 — Varredura ampla (pega também a chave de operações):**

```js
Object.keys(localStorage)
  .filter(k => /pending|sync|venda|sale|pdv|ops|layout|caixa/i.test(k))
  .map(k => [k, (localStorage.getItem(k)||"").slice(0,80)]);
```

Anotar: lista de chaves PDV encontradas e se há `venda-completa` em alguma.

---

## 9. PASSO D — Verificação de Service Worker e Cache Storage

**D.1 — Service Worker (via Console):**

```js
navigator.serviceWorker.getRegistrations().then(rs =>
  console.table(rs.map(r => ({
    escopo: r.scope,
    ativo: !!r.active, ativoState: r.active?.state,
    esperando: !!r.waiting,      // waiting = update disponível e preso
    instalando: !!r.installing,
  })))
);
```

Anotar:
- Existe Service Worker **ativo**? (`ativo: true`)
- Existe **waiting** / update disponível? (`esperando: true`)
- (Via aba **Application → Service Workers**) há botão **Update** / **Skip waiting**? O app está servindo de
  cache (offline-capable)?

**D.2 — Cache Storage (via Console):**

```js
caches.keys().then(ks => console.log("Cache Storage:", ks));
```

Anotar: nomes dos caches existentes (geralmente prefixos do Workbox/next-pwa). (Equivalente na aba
**Application → Cache Storage**.)

---

## 10. PASSO E — Procedimento de sincronização (se houver pendência)

Executar **somente** se o PASSO B indicou pendências:

1. Abrir **https://omni-gestao-pro.vercel.app/dashboard/vendas-arquivo-geral** (Histórico de Vendas).
2. Clicar em **"Reenviar sincronização"** e aguardar o **toast de sucesso**.
3. **Não fechar a aba** durante o processo. Confirmar que a máquina está **online**.
4. Reexecutar o snippet do **PASSO B**. Só prosseguir para a limpeza quando der **`✅ SEM pendências`**.

> O app também tenta reenviar automaticamente (ao voltar online, ao focar a aba e a cada ~30s), mas a
> confirmação manual acima é obrigatória antes de qualquer limpeza.

---

## 11. PASSO F — Procedimento seguro de limpeza

> **Pré-condição:** PASSO B = **`✅ SEM pendências`** (ou pendências já sincronizadas no PASSO E).

**F.1 — Remover SÓ a chave de layout problemática (cirúrgico, preserva vendas e SW):**

```js
// Rodar apenas se PASSO B deu ✅ SEM pendências
Object.keys(localStorage)
  .filter(k => k.includes("omni-pdv-classic-layout"))
  .forEach(k => { console.log("removendo", k, "=", localStorage.getItem(k)); localStorage.removeItem(k); });
location.reload();
```

**F.2 — Limpar Service Worker + Cache Storage e recarregar (NÃO toca em localStorage/vendas):**

```js
// Seguro p/ vendas (storage diferente); ainda assim sincronize antes por garantia
Promise.all([
  navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))),
  caches.keys().then(ks => Promise.all(ks.map(c => caches.delete(c)))),
]).then(() => location.reload(true));
```

Equivalente manual: **Application → Service Workers → Unregister** + **Cache Storage → deletar cada cache** +
**Ctrl+Shift+R**.

> ❌ **NÃO** clicar em **"Clear site data"** — apaga `localStorage` e pode levar vendas pendentes junto.

---

## 12. Cenários e ações recomendadas

Preencher com os achados (PASSO B/C/D) e seguir a linha correspondente:

| Achado em C/D | Pendências (B) | Ação recomendada |
|---|---|---|
| `venda-completa` em chave `omni-pdv-classic-layout*` | **> 0** | **(d) NÃO limpar.** Sincronizar (PASSO E) primeiro; depois cair na linha de baixo. |
| `venda-completa` em chave `omni-pdv-classic-layout*` | **0** | **(a) Limpar só a chave problemática** (F.1) + reload. Resolve sem tocar em vendas/SW. |
| SW `ativo`/`esperando: true`, caches antigos, **sem** `venda-completa` | **0** | **(b)+(c)** Limpar SW + Cache Storage (F.2) + hard refresh. |
| Nada de `venda-completa`, SW ok, mas sintoma persiste | qualquer | **Provável bug de código/percepção.** Registrar valores e abrir investigação (§ seguinte). |

Legenda das ações: **(a)** limpar apenas a chave problemática · **(b)** atualizar Service Worker · **(c)** hard
refresh · **(d)** não limpar (há vendas pendentes).

---

## 13. Quando abrir correção de código (novo GOAL)

Abrir um GOAL de **código** somente se, **após** o diagnóstico acima:

- O sintoma reproduz em **aba anônima** e/ou em **outra máquina/clone limpo** (indício de bug real), **ou**
- O `localStorage` **não** contém `venda-completa` e o Service Worker está **limpo/atualizado**, mas o card ainda
  abre o PDV comum.

Nesses casos, o GOAL recomendado (já desenhado na auditoria v03, **ainda não aplicado**) é
**`PDV_VENDA_COMPLETA_E_SYNC_FASE_0`**, escopo cirúrgico **sem tocar o motor de venda**:

1. Em `vendas-pdv.tsx`, **tratar/sanear** explicitamente o valor `"venda-completa"` (redirecionar para
   `/dashboard/vendas/venda-completa` **ou** normalizar o `localStorage` legado **sem degradar em silêncio**).
2. Remover a ambiguidade de raiz: tipo órfão `"venda-completa"` em `PdvClassicLayoutKind`, prop morta
   `classicLayoutKind` no `PdvClassic`, e a duplicata `pdv-venda-completa-enterprise.tsx`.
3. Indicador persistente de **vendas pendentes** no header do PDV (reuso de `flushPendingSales`/`retrySyncSale`),
   importante porque limpezas de cache na loja podem ocorrer com fila pendente.
4. (PWA) Avaliar estratégia de cache (`NetworkFirst`/versionamento do SW) para evitar shell defasado em rotas
   críticas.

> Esse GOAL é de **código** e exige autorização explícita do usuário (CORE_RULES) + validação
> `npx tsc --noEmit` + `npm run build`. **Este runbook, por si só, não altera nada.**

---

## 14. Histórico da auditoria PDV (v03)

- **v01** (`docs/audits/AUDITORIA_OPERACIONAL_PDV_FINAL_v01.md`, commitada): auditoria operacional de todos os
  PDVs; concluiu núcleo saudável, sem P0; pela ótica do card, rota de Venda Completa correta.
- **v02** (`..._v02.md`): identificou o **mecanismo de runtime** do sintoma — layout legado `"venda-completa"`
  degradado em silêncio para o PDV comum (`vendas-pdv.tsx`) + prop `classicLayoutKind` morta + componente
  duplicado. Recomendou a Fase 0 de correção.
- **v03** (`..._v03.md`, 2026-06-10): re-verificou tudo contra o código atual e **afiou a conclusão**:
  - **Git prova** que o href do card é `/dashboard/vendas/venda-completa` **desde o 1º commit** (`365418a`) —
    **o link nunca regrediu em código**.
  - **Nada de código mudou nos PDVs** no último dia (commits recentes são todos de Operações V3) e **a Fase 0 do
    v02 NÃO foi aplicada** (tipo órfão, prop morta, duplicata, placeholder `/vendas/nova`, `saleMode` morto —
    todos ainda presentes).
  - **Vetor novo (R-05):** o app é PWA com Service Worker ativo em produção (`next.config.mjs`: `skipWaiting`,
    `cacheOnFrontEndNav`) → cache antigo na máquina pode servir shell/bundle defasado.
  - Núcleo transacional re-verificado linha a linha: motor único faz gate de caixa, valida estoque, confere
    soma-pagamentos × total, exige CPF p/ à-prazo/crédito e persiste com reenvio (`syncPending`). **Sem P0 ativo,
    sem caixa fantasma.**

**Conclusão que originou este runbook:** como o link nunca quebrou em código, o caminho correto é **diagnosticar
na máquina da loja** (este documento) **antes** de qualquer alteração de código.

---

*Fim do runbook v01. Documentação operacional — não altera código nem comportamento do app. Os snippets de
limpeza são executados pelo operador na máquina, sob as travas de segurança descritas (sincronizar antes de
limpar).*
