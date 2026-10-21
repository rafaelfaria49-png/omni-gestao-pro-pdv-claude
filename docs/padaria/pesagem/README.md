# Núcleo de pesagem isolado

**Núcleo de pesagem isolado; ainda não ligado à venda produtiva.** Independente
de ramo, layout, loja, preço, estoque e banco. A bancada usa somente dados
simulados. Nenhuma marca/modelo está homologada. `services/hardware-bridge.ts`
e todos os seus consumidores mantêm a API e o comportamento anteriores.

## API e precisão

| Entrada pública | Responsabilidade |
| --- | --- |
| `lib/pesagem`: `parseMass(value, unit)` | Decimal exato com unidade `g`/`kg`, casas declaradas e `kilograms` em string |
| `explicitUnitAsciiProtocol(basis?)` | Apenas massa com unidade explícita, baseada nos exemplos `02.350kg` e `+1234 g` do bridge existente |
| `simulatedWeightProtocol` | Protocolo **sintético**, exclusivo de bancada |
| `WeightSession` | Enquadramento, sequência, estados, estabilidade, validade e candidato físico |
| `services/pesagem`: `ScaleConnection` | Loop de leitura, timeout, cancelamento, exclusão por recurso e cleanup |
| `transportForOpenPort(port)` | Assume stream de porta **já aberta e autorizada pelo chamador**; não solicita permissão nem abre porta |
| `transportForStream(stream, close?)` | Mesmo lifecycle para stream injetado, utilizado na bancada |

Não há ponto flutuante no cálculo de massa ou tolerância. Aceitam-se até
24 dígitos e 9 casas decimais na unidade de origem; excesso é erro explícito.
`350 g` → `0.350 kg`; `350.00 g` → `0.35000 kg`. Conversão de gramas acrescenta
três casas à precisão de origem. Vírgula é separador decimal, nunca de milhares.
Não há inferência de unidade, casas implícitas, preço, etiqueta ou protocolo.
Peso negativo é representável como medição, mas não gera candidato utilizável.
Zero também é medição válida e fica bloqueado como candidato físico.

`WeightReading` contém `sessionId`, `contextId`, `sequence`, `packetSequence`,
`receivedAt` (milissegundos do relógio injetado, por padrão `Date.now()`),
`protocolId`, `simulated`, `mass`, `basis` e `stability`.
O relógio precisa ser finito e não regressivo; regressão invalida a sessão.

`basis` é `net`, `gross` ou `unknown`. Apenas líquido positivo pode produzir
candidato; o núcleo **não subtrai tara**. ASCII simples começa com base
desconhecida. Uma integração futura só deve declarar `net` após obter evidência
do manual/configuração do equipamento. Não interpreta a linha estruturada
`ST,NT,0,...` do comentário legado porque o protocolo completo é desconhecido.

## Estados, amostras novas e encerramento

`snapshot()` entrega estado imutável; `measurementCandidate(afterSequence?)`
entrega apenas líquido positivo, estável e vigente, com sequência maior que a
informada. Isso indica aptidão física, **não autorização de venda**.
Consumidores precisam revalidar o snapshot no momento do uso e comparar a dupla
`sessionId`/`sequence`. Um snapshot guardado é apenas registro histórico.

| Estados | Significado |
| --- | --- |
| `idle`, `waiting` | Sessão ainda não ligada / aguardando mensagem completa |
| `incomplete`, `invalid`, `unknown_unit` | Fragmento pendente / formato, precisão ou encoding inválido / unidade ausente ou não suportada |
| `device_error`, `overload` | Sinais explícitos do protocolo sintético; protocolos reais dependerão de manual |
| `negative`, `zero`, `gross_weight`, `unknown_weight_basis` | Medição sem aptidão operacional |
| `unstable`, `ready`, `stale` | Estabilidade insuficiente / candidato físico atual / validade vencida |
| `disconnected`, `cancelled`, `timeout`, `context_changed` | Finais: leitura, janela e fragmentos descartados |
| `read_error`, `connection_error`, `port_in_use`, `cleanup_error`, `clock_error` | Falhas de transporte, aquisição, exclusão, liberação ou relógio |

Política obrigatória: `windowMs`, `minimumSpanMs`, `minimumSamples`,
`maximumSamples`, `toleranceKg`, `validForMs`. A estimativa considera as últimas
`maximumSamples` mensagens líquidas positivas dentro de `windowMs`, exige
quantidade mínima, duração mínima e amplitude **máximo − mínimo** dentro da
tolerância inclusiva. A memória é limitada. O exemplo da bancada usa 500 ms,
200 ms, 3/256 amostras, tolerância de 0.001 kg e validade de 1000 ms. Esses
números são parâmetros de demonstração e não homologação metrológica.

Estabilidade informada pelo protocolo é `source=protocol`; a estimada é
`source=estimated`. Sinal explícito de instabilidade nunca é sobreposto pelo
estimador. Uma série de linhas no mesmo pacote tem sequências próprias, mas
não comprova duração mínima. Snapshot ou releitura do mesmo pacote não cria
amostra. `packetSequence` precisa crescer a cada **recebimento real**;
o transporte fornece isso automaticamente. Bytes idênticos podem ser amostras
novas quando o equipamento de fato os envia novamente.

Validade vence em `idade >= validForMs`. Pacote vazio não renova a leitura nem
o timeout. Mensagem parcial retira o candidato imediatamente, preservando a
janela apenas até completar a mensagem ou vencer. Erros retiram o candidato
e reiniciam a janela. LF e CRLF, fragmentos e várias mensagens são suportados;
ASCII estrito e limite padrão de 256 bytes por linha. Uma linha corrompida ou
excessiva é descartada até LF, sem reinterpretar seu sufixo como peso.

`ScaleConnection.run(signal?)` é idempotente e retorna uma Promise do estado
final, resolvida após cleanup. `stop()` cancela; `stop("context_changed")`
encerra ao mudar produto, loja, terminal ou operação. Após isso, criar outra
`WeightSession` com **sessionId único** e o novo `contextId`; nunca reutilizar
a instância. `WeightSession.markConnected/receive/end` são a interface de
baixo nível para testes ou outro controlador; não manipulam transporte.

O controlador mantém uma reserva por objeto de recurso, cancela o leitor,
aguarda o loop, libera o lock e fecha o recurso nessa ordem. Portas já ocupadas
não são fechadas pela sessão concorrente. Falha de `close` produz
`cleanup_error`, conserva a reserva e admite `retryClose()` explícito.
Nenhum temporizador fica ativo após a Promise de execução terminar.

## Consumo futuro, sem ligação produtiva nesta entrega

```ts
import { WeightSession, explicitUnitAsciiProtocol } from "@/lib/pesagem"
import { ScaleConnection, transportForOpenPort } from "@/services/pesagem"

// authorizedOpenPort foi obtida/aberta por ação explícita fora deste núcleo.
// A declaração de líquido depende do manual e da configuração comprovados.
const session = new WeightSession({
  sessionId: crypto.randomUUID(), contextId: operationContextId,
  protocol: explicitUnitAsciiProtocol("net"),
  policy: { windowMs: 500, minimumSpanMs: 200, minimumSamples: 3,
    maximumSamples: 256, toleranceKg: "0.001", validForMs: 1000 },
})
const connection = new ScaleConnection(session, transportForOpenPort(authorizedOpenPort), 1500)
const finished = connection.run(abortSignal)
const seen = session.snapshot().reading?.sequence ?? 0
// Em uma interação posterior, após dados novos:
const candidate = session.measurementCandidate(seen)
// Validar contexto, permissão, produto e terminal antes de qualquer integração.
await connection.stop("context_changed")
await finished
```

O responsável pelo contrato compartilhado é a sessão **Adaptar configurações e
cadastros**, branch `codex/ramos-cadastros`. No preflight, seu WIP publica
`lib/cadastros/product-commercial-contract.ts` (`ProductCommercialV1`) e
`docs/cadastros/RAMOS_RECURSOS_CONTRATO.md`. Como ainda não integrados à base,
esta entrega não copia nem importa esses tipos. Mapeamento explícito:
unidade comercial `G` ↔ medição `g`, `KG` ↔ `kg`; `UN` não é massa.
`modoVenda=peso`, `basePreco` e capabilities continuam no contrato comercial;
não são propriedades nem decisões do núcleo físico.

A frente PDV deve ligar a API ao Clássico após reconciliar N5-C. Venda por peso
e acesso à balança permanecem recursos separados, sujeitos a contexto e
permissões. Estoque/quantidade fracionada é mudança transacional própria;
nenhum guard foi removido. Aceite futuro obrigatório:
**0,350 kg × R$ 20,00/kg = R$ 7,00**, incluindo venda, pagamento e baixa de
estoque corretos. Testar a conversão de massa não comprova esse aceite.

## Bancada e reprodução

Em um checkout com as dependências existentes (Node 24):

```sh
node node_modules/vitest/vitest.mjs run --config test/pesagem/vitest.config.mts
node node_modules/typescript/lib/tsc.js -p test/pesagem/tsconfig.json --noEmit
node node_modules/eslint/bin/eslint.js lib/pesagem services/pesagem test/pesagem --no-cache
node node_modules/tsx/dist/cli.mjs test/pesagem/harness.ts all
```

Na worktree desta missão, usar `../../node_modules/` nesses comandos para
reutilizar as dependências; não instalar outra cópia. Em sandbox Windows,
direcionar `TEMP`/`TMP` a `test/pesagem/.artifacts/tmp` se o temporário padrão
impedir rename. A pasta `.artifacts` é descartável e ignorada pelo Git.

O harness imprime **SIMULADO_SEM_EQUIPAMENTO** e aceita `all`, `stability`,
`fragmented`, `invalid`, `previous-session`, `disconnect`, `cancel`, `context`,
`timeout`. Exercita conexão, peso, oscilação, estabilização, ausência de novos
dados, desconexão/reconexão, cancelamento, mensagens inválidas/fragmentadas,
unidade incorreta e sessão anterior. Não depende de servidor ou navegador.

Protocolo sintético: `SIM|ST/US/NA|NET/GROSS/UNKNOWN|decimal|g/kg` + LF;
`ST` informa estável, `US` instável e `NA` não informa estabilidade.
`SIM|ERR|CODIGO` e `SIM|OL` simulam erro e sobrecarga. Fixtures desse formato
provam somente o parser/controlador, nunca compatibilidade com marcas.

## Pendências físicas

Confirmar marca/modelo/firmware, conexão, parâmetros seriais, formato completo,
delimitadores/checksum, escala decimal, resolução, capacidade, líquido/bruto,
tara, estabilidade e códigos de erro/sobrecarga. Validar calibração, desconexão
física e retomada. Sem timestamps/contador do equipamento, bytes antigos já
enfileirados no driver não podem ser datados pelo núcleo: a futura integração
precisa abrir stream novo ou descartar backlog conforme o protocolo comprovado.
Etiquetas com preço/peso aguardam identificação do formato. Nenhum suporte
Toledo, Filizola, Urano ou outro é anunciado nesta entrega.
