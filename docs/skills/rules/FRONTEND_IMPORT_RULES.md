# FRONTEND_IMPORT_RULES.md — Importação de UI externa

Regras para trazer telas/componentes gerados por ferramentas externas
(**Lovable**, **Cloud Design**, **Gemini**, **Antigravity**) para dentro
do OmniGestão Pro.

Protótipo externo é **rascunho de UI**, não código de produção.
Ele só vira parte do projeto após auditoria e integração controlada.

## 1. Princípio geral

- Importação é **incremental** e **auditada**, nunca um "colar tudo".
- O projeto OmniGestão é o dono das convenções — o protótipo se adapta a ele,
  não o contrário.
- Nunca substitua um módulo real funcionando por um protótipo visual
  sem validação explícita.

## 2. Pasta temporária `_imports/`

- Quando o material externo for grande ou misturado, despeje primeiro em
  uma pasta temporária `_imports/` na raiz.
- `_imports/` é **área de quarentena**: nada ali está integrado.
- Audite, selecione e mova o que serve. **Esvazie `_imports/`** ao final.
- `_imports/` nunca deve ser referenciada por código de produção.

## 3. Auditar antes de integrar

Antes de mover qualquer arquivo para fora de `_imports/`:

- [ ] Confira o que o arquivo realmente faz.
- [ ] Identifique dependências que ele arrasta.
- [ ] Verifique se há equivalente já existente no projeto.
- [ ] Verifique uso de cores hardcoded / tokens não-semânticos.

## 4. O que NUNCA copiar do projeto externo

O protótipo vem com a estrutura própria dele. **Não traga**:

- Roteamento próprio (`react-router` raiz, `App.tsx` de topo, etc.).
- `package.json`, `package-lock.json`, lockfiles, `node_modules`.
- Servidor / bootstrap (`server`, `start`, `main.tsx`, `index.html`, Vite config).
- `globals.css` / reset global do protótipo.
- Componentes **shadcn/ui duplicados** — o OmniGestão já tem os seus;
  reaproveite os existentes.
- Qualquer config de build/lint/tsconfig do projeto externo.

## 5. Manter os tokens do OmniGestão

- Converta cores hardcoded do protótipo para tokens semânticos:
  `bg-background`, `text-foreground`, `border-border`, `text-primary`, etc.
- Aplique `min-w-0` em itens flex/grid.
- Respeite o `AppShell` como único dono de scroll.
- Ver `CORE_RULES.md` §7 para os tokens visuais.

## 6. Destino por domínio

Cada arquivo importado vai para a pasta do **domínio** a que pertence:

| Domínio | Destino |
|---------|---------|
| Vendas / PDV | `components/dashboard/vendas/...` |
| Operações / OS | `components/operacoes/...` |
| Financeiro | `components/financeiro/...` |
| (outros) | seguir a pasta do módulo correspondente |

Nunca jogue UI importada solta na raiz de `components/`.

## 7. Mapa arquivo → destino (obrigatório)

Antes de mover qualquer coisa, monte um mapa explícito:

```
_imports/Tela.tsx          → components/dashboard/vendas/Tela.tsx
_imports/components/Card   → reaproveitar components/ui/card (já existe)
_imports/router/*          → DESCARTAR
```

- Sem mapa, não mova arquivos.
- O mapa entra no relatório final da tarefa.

## 8. Integração incremental

- Integre **uma tela / um fluxo por vez**.
- Após cada peça: `npx tsc --noEmit` e verificação visual.
- Só avance para a próxima peça quando a anterior estiver validada.
- Ver `DELIVERY_CHECKLIST.md` para encerramento.

---

Ver também: [`CORE_RULES.md`](./CORE_RULES.md) ·
[`AI_WORKFLOW.md`](./AI_WORKFLOW.md) ·
[`DELIVERY_CHECKLIST.md`](./DELIVERY_CHECKLIST.md)
