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

## Preparação Windows D04-A

Pacote candidato **sem assinatura digital**, reproduzível e sem dependências npm. Requer Windows 10/11, disco local
NTFS, PowerShell 5.1 e Node **24.x, a partir de 24.12.0**, instalado separadamente. O instalador não baixa nem instala Node.
Não usa LocalSystem, serviço ou senha do Windows. A tarefa usa o SID do usuário atual, logon interativo, privilégio
Limited e IgnoreNew. O pareamento e a execução devem usar esse mesmo usuário. Não executar como outro administrador.

**Nesta entrega, os comandos modificadores só podem ser aplicados em VM/laboratório autorizado.** Sem `-Apply`, os scripts
de manutenção apenas exibem o plano. `-Apply` exige a declaração `-AuthorizedLab`; essa declaração não autoriza caixa real.
Instalação real, pareamento real, papel e D05 continuam pendentes.

Geração no repositório: `node tools/print-d04/package.mjs`. Saída: ZIP, `.sha256` e pasta `omni-print-agent` em
`tools/print-d04/.artifacts/`. Duas gerações das mesmas fontes produzem os mesmos bytes. Compare o SHA-256 do ZIP com o
artefato do CI/commit revisado antes de extrair. `MANIFEST.json` verifica cada arquivo e o contentId; um hash não é assinatura
nem comprova por si só a origem de um pacote recebido.

Em PowerShell, dentro da pasta extraída, **apenas no laboratório autorizado**:

```powershell
.\windows\Install-Agent.ps1                             # plano, sem gravação
.\windows\Install-Agent.ps1 -Apply -AuthorizedLab       # tarefa instalada desabilitada
$m = Get-Content "$env:LOCALAPPDATA\OmniPrintAgentApp\installation.json" -Raw | ConvertFrom-Json
& $m.nodePath (Join-Path $m.releaseRoot 'agent.mjs') printers --data-dir $m.dataRoot
# Após autorização própria para pareamento, usar código sintético do ambiente de homologação:
& $m.nodePath (Join-Path $m.releaseRoot 'agent.mjs') pair --data-dir $m.dataRoot --server https://DOMINIO-HOMOLOGACAO --code XXXX-XXXX-XXXX
.\windows\Diagnose-Agent.ps1 -ProbeCredential -AuthorizedLab
.\windows\Start-Agent.ps1 -Apply -AuthorizedLab
```

O pareamento é único e serializado antes de consumir o código. Credencial existente nunca é sobrescrita. Uma falha de
gravação deixa `pairing.pending.json` para reconciliação; não repetir o código nem apagar esse arquivo automaticamente.
O token DPAPI e os IDs de instalação/loja ficam em `config.json`. Não copiar credencial para outro usuário/computador.
O terminal e a fila continuam sujeitos ao vínculo e às autorizações do servidor. Instalar não liga impressão na loja.

Dados: `%LOCALAPPDATA%\OmniPrintAgent`. Binários: `%LOCALAPPDATA%\OmniPrintAgentApp\releases\<versão-contentId>`.
A instalação preserva os dados do 004C. Não há serviço, porta de escuta nem download de código em execução. O CLI instalado
aceita somente HTTPS, inclusive para loopback; HTTP local fica restrito aos objetos dos testes sintéticos.

```powershell
.\windows\Diagnose-Agent.ps1                           # integridade, usuário, tarefa e parada
.\windows\Stop-Agent.ps1 -Apply -AuthorizedLab         # pausa persistente e espera fechamento do host
.\windows\Update-Agent.ps1 -PackageRoot C:\PACOTE-EXTRAIDO -Apply -AuthorizedLab
# Atualização deixa a tarefa desabilitada. Conferir diagnóstico e depois executar Start-Agent.
.\windows\Uninstall-Agent.ps1 -Apply -AuthorizedLab -RevocationConfirmed
```

Revogar no servidor antes de confirmar a desinstalação. Ela remove a tarefa, retém binários inertes, credencial, diário,
instância e históricos. Não remove filas, drivers, Node ou outros programas. Não existe opção automática de apagar dados.
Start/Stop/Update/Uninstall são serializados por um lock de manutenção. Atualização verifica a integridade antes de pausar,
aguarda supervisor/agente/host encerrarem, mantém releases anteriores e muda a tarefa desabilitada. Falha mantém a parada.

O supervisor registra um orçamento persistente: no máximo quatro partidas em 15 minutos, com intervalo de cinco segundos
após falha recuperável. A tarefa também limita a recuperação de uma queda do supervisor. Rede indisponível usa backoff
dentro do agente. Revogação (401), parada intencional e erro fatal criam `halt.json`; não reiniciam em laço nem no próximo
logon. Erro fatal/esgotamento só admite `Start-Agent -ResumeAfterReview` após análise. Revogação exige novo pareamento
autorizado e reconciliação; o script não contorna esse estado.

## Recuperação sem duplicar

`runtime.mjs` adquire exclusão do SO antes de abrir diário/configuração. O guard usa FileStream com compartilhamento
exclusivo e mantém também o arquivo de proprietário protegido contra escrita/exclusão. PID e instante de criação
identificam o processo; uma trava de dono vivo nunca é removida. Os arquivos `.guard` permanecem no disco: presença não
significa atividade. Não apagar `.lock`, `.guard`, `.instance`, diário ou registro de hosts para forçar uma partida.

Antes de qualquer comando de envio, o host apresenta PID, criação, imagem e nonce, e o agente registra isso com fsync em
`journal.jsonl.hosts.jsonl`. O host mantém um handle do pai e se encerra se ele morrer. Na retomada, o agente só encerra
um órfão pelo mesmo handle cuja identidade, imagem, usuário e nonce foram conferidos; PID reaproveitado não é morto.
Se não conseguir provar encerramento, a partida falha antes de liberar UNKNOWN. Um host legado sem registro bloqueia a
atualização operacional: usar diagnóstico e reinício controlado do laboratório, preservando todos os dados.

SUBMITTING interrompido vira UNKNOWN após fechar o transporte, nunca novo envio. A última linha truncada é preservada
com marcador e hash; corrupção intermediária/estrutural falha fechado. O diário não é compactado, expurgado ou apagado.
Disco cheio/erro de fsync impede enviar. Para cópia de segurança, primeiro parar/drenar e copiar **todo** o diretório de
dados; restauração exige reconciliação de histórico e revogações. Não restaurar um diário anterior e liberar impressão.

Aceite significa somente fila do Windows, nunca papel confirmado. Fila bloqueada, falta de papel, energia, USB, corte,
acentos e comportamento de logon/reboot na bancada seguem o roteiro D05. Ver `docs/print-004c-e2e/RUNBOOK_D05.md`.
