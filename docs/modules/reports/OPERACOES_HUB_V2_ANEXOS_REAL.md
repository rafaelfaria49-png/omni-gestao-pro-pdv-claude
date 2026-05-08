# Operações HUB V2 — Arquitetura híbrida de anexos persistentes (fase local)

Data: 2026-05-07  
Escopo: solução **sem Prisma schema/migration**, sem Storage cloud real, sem redesign pesado.  
Objetivo: remover a “falsa persistência” de `URL.createObjectURL(file)` e garantir que anexos continuem visíveis após reload.

## Problema antigo

O `AnexosPanel` criava `url` com `URL.createObjectURL(file)` e gravava isso no payload.

Consequências:
- funcionava visualmente na sessão atual
- quebrava após reload (blob URL é temporária)
- alto risco de perda operacional (fotos, laudos, comprovantes)

## Solução aplicada (híbrida e segura)

Separação clara:

- **Payload JSONB (Prisma `ordens_servico.payload`)**: guarda metadados do anexo + URL estável de referência
- **Storage local persistente (IndexedDB)**: guarda o **Blob real** do arquivo

Em runtime:
- a UI resolve preview/abertura convertendo o Blob do IndexedDB em objectURL (somente para render/preview).

## Arquitetura criada

Pasta:

- `components/operacoes/lovable/services/anexos/`

Arquivos:

- `types.ts`: tipo canônico (`CanonicalAnexo`), categorias e providers
- `helpers.ts`: mapeamento payload ↔ canônico, categoria por tipo, URL `local-idb://...`
- `storage.ts`: provider local IndexedDB (put/get/delete)
- `preview.ts`: resolver preview URL de forma centralizada + cache + revoke/GC

## Tipo canônico (resumo)

Campos principais:

- `id`, `nome`, `tipo`, `mimeType`, `tamanho`
- `createdAt`, `enviadoPor`
- `categoria` (diagnostico/bancada/cliente/comprovante/garantia/equipamento/outros)
- `url` (persistida; nesta fase `local-idb://<id>`)
- `storageProvider` (`local-idb`, `legacy-blob`, `external-url`)
- `persisted` (bool)
- `metadata` opcional

## Persistência local (como funciona)

Ao adicionar anexo:
1. UI salva o Blob no IndexedDB (`putLocalBlob(id, file)`).
2. UI grava no payload um anexo com:
   - `url: local-idb://<id>`
   - `storageProvider: local-idb`
   - `persisted: true`
   - metadados (nome, tipo, tamanho, mimeType, categoria, publico, etc.)

Ao renderizar:
- se `url` for `local-idb://...`, a UI busca o Blob no IndexedDB e cria objectURL **apenas para preview**.

## Compatibilidade com payload atual

- Mantido o array `payload.anexos` (não foi criado schema novo).
- Anexos antigos com `url` iniciando em `blob:` são tratados como:
  - `storageProvider: legacy-blob`
  - `persisted: false`
  - exibidos como “Sessão atual” (podem quebrar após reload, por limitação do legado).

## Timeline integrada

Eventos gravados no payload:

- `anexo_adicionado`
- `anexo_removido`

## UX (sem redesign pesado)

Mantido:
- grid de anexos
- botões por tipo (Foto antes/depois, vídeo, laudo PDF, nota, outro)

Melhorias pequenas:
- upload múltiplo (mesmo botão aceita múltiplos arquivos)
- indicador “Persistido” vs “Sessão atual”
- categoria + tamanho no rodapé
- botão de remover no hover

## O que NÃO foi implementado (intencional)

- Supabase Storage real / upload cloud
- compressão, OCR, IA, CDN
- migração de anexos blob antigos para o storage local (exigiria acesso ao arquivo original)

## Próximos passos (para migrar para Supabase Storage)

1. Implementar um provider `supabase-storage` em `storage.ts` com:
   - upload → retorna URL https
   - delete → remove do bucket
2. Manter o mesmo payload, apenas trocar `storageProvider` e `url`
3. Opcional: job de migração “local-idb → cloud” por OS selecionada

