# Processo regulatório de atualização XSD fiscal

| Campo | Valor |
|---|---|
| GOAL | `FISCAL-XSD-OFFICIAL-VALIDATION-002` |
| ADR | ADR-0010 |
| Regra | nenhuma troca silenciosa de bytes, versão ou motor |

```text
nova NT ou pacote oficial
        ↓
captura em fonte oficial
        ↓
registro de URL, versão e data
        ↓
hash SHA-256
        ↓
novo diretório versionado
        ↓
novo manifesto
        ↓
reexecução de fixtures
        ↓
comparação de regressão
        ↓
revisão humana
        ↓
ativação controlada
```

## Procedimento obrigatório

1. Registrar NT, publicação, vigência, modelos e UFs usando apenas Portal Nacional da NF-e e
   documentos oficiais por ele referenciados.
2. Capturar o pacote sem executar conteúdo e registrar URL, horário, tamanho e SHA-256 do original.
3. Extrair em temporário após bloquear caminho absoluto, `..`, symlink e nomes inesperados.
4. Mapear o fecho transitivo de `xs:include`/`xs:import`. Criar novo diretório versionado; nunca
   sobrescrever a versão anterior.
5. Criar manifesto com pacote, entrypoint, modelo, leiaute, hashes, tamanhos e grafo. Bytes diferentes
   sob o mesmo nome constituem incidente de proveniência.
6. Executar hashes, corpus positivo/negativo, XXE/rede/traversal, regressão fiscal, build da imagem,
   SBOM e scanner. Vulnerabilidade crítica ou caminho alcançável sem mitigação bloqueia o rollout.
7. Submeter diff regulatório, manifesto, resultados, SBOM e scan a revisão humana. A aprovação deve
   escolher explicitamente versão, hash e digest permitidos.
8. Fazer rollout por digest com canário e rollback. Atualizar schema nunca habilita produção.

Reter documento e URL oficiais, arquivo/hash original, manifesto, diff do grafo, hash do binário,
digest da imagem, SBOM, scan, logs sanitizados, fixtures, aprovador e digest anterior. O worker não
possui rede em runtime; nenhum schema é baixado durante validação.
