<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "FISCAL-SEFAZ-CSTAT588-COMPACT-MESSAGE-023",
  "track": "fiscal",
  "title": "Eliminar causa mecânica do cStat 588: mensagem compacta + backstop D01e + matriz 588 (zero SEFAZ)",
  "status": "READY",
  "class": "C3",
  "risk_tier": "ALTO",
  "branch": "goal/fiscal-023-cstat588-compact-message",
  "worktree": "C:/workspace",
  "test_command": "npx vitest run lib/fiscal/xml lib/fiscal/signing lib/fiscal/provider/sefaz lib/fiscal/homologation lib/fiscal/queue test/fiscal/scenario-battery",
  "allowlist": [
    "lib/fiscal/**",
    "test/fiscal/**",
    "docs/fiscal/**",
    "docs/ai/CURRENT_STATUS.md",
    "docs/ai-execution/_evidence/**"
  ],
  "gates_liberados": [],
  "read_budget": 180,
  "plan_ref": "FISCAL-FABLE5-CONTINUATION-MASTERPLAN-001",
  "plan_rev": 1,
  "familia_executor": "opencode",
  "revisao_independente": true,
  "reversibilidade": "offline-only; nenhum socket SEFAZ; nenhum tpAmb=1; nenhum job/nota real; nenhuma mutacao de schema, banco de producao, certificado, CSC ou secrets; revertivel por descarte da branch",
  "gates_extra": [
    {
      "id": "sefaz_homologacao",
      "status": "bloqueado",
      "dependencias": []
    },
    {
      "id": "production",
      "status": "bloqueado",
      "dependencias": []
    }
  ],
  "gate_humano": {
    "requerido": true,
    "pendente": false,
    "aprovacao": {
      "aprovado": true,
      "autorizacao": "GOAL 023 offline-only ratificado: serializacao compacta + backstop D01e + matriz cStat 588, ZERO transmissao SEFAZ (homologacao e producao bloqueadas), sem XML real do 022E como fixture, revisao independente obrigatoria antes de qualquer merge.",
      "registrado_por": "Rafael Faria",
      "em": "2026-09-22T00:00:00Z"
    }
  }
}
-->

# FISCAL-SEFAZ-CSTAT588-COMPACT-MESSAGE-023 — Mensagem compacta + backstop D01e + matriz 588 (zero SEFAZ)

- trilha: `fiscal`
- classe: C3 · status: READY
- plano: `FISCAL-FABLE5-CONTINUATION-MASTERPLAN-001` (plan_rev 1)
- branch: `goal/fiscal-023-cstat588-compact-message`
- worktree: `C:/workspace`
- teste: `npx vitest run lib/fiscal/xml lib/fiscal/signing lib/fiscal/provider/sefaz lib/fiscal/homologation lib/fiscal/queue test/fiscal/scenario-battery`
- risco: `ALTO`
- revisao_independente: `true` (obrigatória; risco ALTO)
- predecessor: `022E` DONE (PR #220, merge em origin/main) permanece imutável; `022` BLOCKED permanece; `022B` DONE permanece

## 1. Relação com 022E

O 022E transmitiu UMA NFC-e real em HOMOLOGACAO que retornou cStat 588; CONSULTA posterior classificou 217 / NOT_FOUND; nenhuma retransmissão ocorreu. Evidência: `docs/ai-execution/_evidence/FISCAL-PILOT-HOMOLOGATION-SECOND-ATTEMPT-022E.md`. A regra oficial D01e define 588 como rejeição por caracteres de edição no início/fim da mensagem ou entre tags. Causa mecânica forte já identificada: `serializeXml()` pretty-print por default + join com `"\n"` + `serializeXmlEmbeddable()` reutiliza + `signNfceXmlDetailed` preserva verbatim e insere Signature + `composeEnviNFeRequest` preserva bytes + `buildSefazSoap12Envelope` preserva área fiscal byte a byte. Este GOAL elimina a causa, torna o caminho compatível com D01e e classifica 588 corretamente. ZERO transmissão SEFAZ neste GOAL.

## 2. Base (confirmar no início, read-only)

- Fetch + partir de `origin/main` atual (contém PR #220 / 022E DONE).
- Track `fiscal` sem GOAL ativo no caminho quente (após planejamento).
- Production fiscal fechada: `G-F12` bloqueado; `sefaz_homologacao` bloqueado neste GOAL.
- `EXTERNAL_SEFAZ_CONTACT=false` · `REAL_SEFAZ_DOCUMENT_TRANSMISSIONS=0` · `NEON_WRITES=0`.

## 3. Ritual AEP (antes do open)

1. Arquivo deste GOAL em `docs/execution-tracks/fiscal/goals/`
2. `node scripts/track.mjs registry`
3. `node scripts/track.mjs verify` (e `verify --all`)
4. `AEP_WRITE=1 git commit -m "aep(fiscal): plan FISCAL-SEFAZ-CSTAT588-COMPACT-MESSAGE-023"` por caminhos explícitos
5. Só então `node scripts/track.mjs open fiscal`

## 4. Escopo técnico

1. **Auditoria focada**: confirmar a cadeia real `xml-writer -> nfce-xml-builder -> nfce-signer -> sefaz-lote-envinfe -> sefaz-envelope -> provider -> transport`. Provar com teste atual que o XML assinável contém whitespace entre tags. Não versionar XML real do 022E; usar documento sintético equivalente.
2. **Serialização compacta**: sem alterar o pretty do documento standalone sem necessidade; o contrato EMBUTÍVEL destinado a assinatura/transmissão gera XML compacto: zero CR/LF/TAB; zero whitespace de formatação entre `><`; zero whitespace antes/depois da raiz. Preservar espaços legítimos DENTRO de texto e atributos. Compactação ANTES da assinatura, na origem; nunca regex destrutivo pós-assinatura.
3. **XMLDSig**: novo XML compacto assinado normalmente; `digestConfere=true`; `assinaturaConfere=true`; Reference aponta para infNFe correto; assinatura compacta; nenhuma LF introduzida entre tags por Signature. Não reutilizar assinatura de XML pretty.
4. **enviNFe**: `composeEnviNFeRequest` continua preservando bytes assinados, sem reserialização, `idLote/indSinc` iguais ao contrato; produto final compacto na área de dados.
5. **Backstop D01e**: validação fail-closed antes de qualquer transporte; boundary final RECUSA área de dados com whitespace antes/depois da raiz ou formatação entre tags (espaço/TAB/CR/LF, incluindo `</tag>\n<tag>` e `</tag>   <tag>`). Não confundir com `CABO USB C` em `<xProd>`. Apenas recusa, nunca limpa bytes assinados. Código de erro estável e sanitizado.
6. **E2E offline**: prova `snapshot sintético -> XML compacto -> XMLDSig -> XSD oficial -> enviNFe -> envelope SOAP -> transport fake/loopback` exigindo `XMLDSIG=true`, `XSD=VALIDACAO_APROVADA`, `D01E_SAFE=true`, `INTERTAG_FORMATTING_WHITESPACE=0`. Mesmo teste com XML pretty/adversarial para ANTES do fake socket.
7. **Matriz cStat**: 588 não pode continuar UNKNOWN em NFeAutorizacao4. Atualizar versão da matriz. Em NFeAutorizacao4: `outcome=REJECTED`, reason de formato/D01e, `terminal=true`, `numeroConsumido=false`, `requiresInutilizacao=false`, `requiresConsultation=false`, zero retry automático. Não generalizar 588 para CONSULTA como rejeição de documento (em consulta, 588 pode ser rejeição da própria mensagem de consulta). Se o modelo não comportar a distinção com segurança, implementar a menor extensão tipada ou parar para revisão.
8. **Regressões**: preservar 100, 103/105, 108/109, 204, 217, 656, CONSULTA 022B/022E, one-shot, default deny, Production block, authority opaca, zero retry, inutilização, contingência.

## 5. Testes específicos (mínimo)

- standalone mantém contrato; embeddable compacto; NFe assinada compacta; Signature sem whitespace; enviNFe compacto; SOAP data area compacta; pretty bloqueado pelo backstop; whitespace legítimo válido; XSD passa; XMLDSig passa; 588 em NFeAutorizacao4 não UNKNOWN; 588 em serviço inadequado não vira rejeição de documento; zero rede externa.

## 6. Validações

- `npx vitest run lib/fiscal/xml`
- `npx vitest run lib/fiscal/signing`
- `npx vitest run lib/fiscal/provider/sefaz`
- `npx vitest run lib/fiscal/homologation lib/fiscal/queue test/fiscal/scenario-battery`
- `npm run typecheck`
- eslint focado
- `git diff --check`
- `node scripts/track.mjs check fiscal`
- `node scripts/track.mjs verify --all`

## 7. Evidência

Criar evidência curta com `CSTAT_588_OFFICIAL_CAUSE, ROOT_CAUSE_REPRODUCED, PRE_FIX_INTERTAG_WHITESPACE, POST_FIX_INTERTAG_WHITESPACE, D01E_BACKSTOP, XMLDSIG, XSD, MATRIX_588, EXTERNAL_SEFAZ_CONTACT=false`. Não versionar XML real, certificado, CSC ou secrets.

## 8. Allowlist

```
lib/fiscal/**
test/fiscal/**
docs/fiscal/**
docs/ai/CURRENT_STATUS.md
docs/ai-execution/_evidence/**
```

Writes de runtime/Neon: nenhum (NEON_WRITES=0). Orquestradores efêmeros em `import/` (gitignored). Nunca versionar `DATABASE_URL`/`DIRECT_URL`, `.env.local`, A1/CSC/queue secret, XML real, artifact Docker ou WIPs de outros workstreams.

## 9. Fora de escopo

- Qualquer transmissão SEFAZ (homologação ou produção), socket, SOAP real, janela, activation, `fiscalEnabled=true`, job/nota real.
- Reabrir/mover/reescrever 022/022B/022D/022E ou reutilizar documento/job/chave reais.
- Schema/migration, auth, `proxy.ts`, `.github/workflows/**`, `package.json`, `next.config.mjs`.
- Retry automático de 588; generalização de 588 para consulta como rejeição de documento.
- Refactor de brinde fora da cadeia xml->transport e da matriz 588.

## 10. Critério de Pronto

1. Causa reproduzida pré-fix e zerada pós-fix (`PRE_FIX_INTERTAG_WHITESPACE>0`, `POST_FIX_INTERTAG_WHITESPACE=0`).
2. Embeddable/signed/enviNFe/SOAP data area compactos; standalone preservado; backstop recusa pretty e aceita legítimo.
3. XMLDSig + XSD verdes sobre compacto; pretty adversarial parado antes do fake socket.
4. Matriz versionada; 588 Autorização=REJECTED terminal sem retry; consulta sem semântica inventada.
5. Regressões e validações do §6 verdes; `track check` e `verify --all` verdes.
6. Evidência curta publicada sem secrets; `close fiscal` permitido pelo AEP; PR aberto com CI aceitável; sem merge; `READY_FOR_INDEPENDENT_REVIEW`.
