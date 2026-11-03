# Omni Print — agente local Windows (candidato 004C)

Processo Node sem dependências que roda no computador do caixa. **Só faz conexões de saída** (HTTPS para o OmniGestão):
não abre porta, não escuta em 127.0.0.1, não é alcançável por páginas web.

- `agent.mjs` — CLI (`printers`, `pair --server https://… --code XXXX-XXXX-XXXX`, `run`) e laço: heartbeat (inventário de
  filas), `claim`, envio RAW, `report`.
- `journal.mjs` — diário durável por `sendKey` (fsync antes de qualquer byte ir ao spooler). Uma via que **pode** ter
  chegado ao spooler nunca é reenviada; só uma nova tentativa após falha **comprovada** (NO_EFFECT) envia de novo.
- `spooler-windows.mjs` — um host PowerShell 5.1 persistente (P/Invoke `winspool.drv`, RAW, sem diálogo/preview,
  sem impressora padrão). Timeout ⇒ o host é morto e só então a saída é declarada encerrada.
- `spooler-fake.mjs` — impressora/spooler **simulados** para testes. Nada do simulador é impressão física.
- `protocol.mjs` — validação ESC/POS (sem gaveta, sem DLE/GS ( ), URL do servidor só https, cliente sem redirect.

Garantias: uma instância por diário (`journal.jsonl.lock`); cada tentativa é presa à instância que a iniciou no
servidor (outra cópia do agente com o mesmo token nunca recebe a reentrega); credencial guardada com DPAPI do usuário;
resultado máximo informado = "aceito pela fila do Windows" (não é confirmação de papel).

Requer Node 24 LTS no computador do caixa. Instalação como serviço/tarefa agendada e pacote assinado: fora do escopo
deste candidato (gate D04/D05). Ver `docs/print-004c-e2e/ROTEIRO_HOMOLOGACAO_FISICA.md`.
