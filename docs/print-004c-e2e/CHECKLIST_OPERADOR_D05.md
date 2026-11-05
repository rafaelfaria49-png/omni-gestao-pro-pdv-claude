# D05 — comandos para o operador Windows

**Preparado; não executar instalação, pareamento ou impressão antes dos gates do PLANO_AMBIENTE_D05.md.**
Usar bancada isolada, dados sintéticos e o usuário Windows consentido. Não abrir PowerShell como outro administrador.
Autorização recebida: RAFACELL, `RAFACELL\rafae`, SID terminado1002 e POS-80/USB005. Faltam nome do operador e janela
presencial; aguardar também Preview isolado com commit revisado/CI verde. A fila observada offline exige diagnóstico.
Não instalar Node, driver ou software adicional sem consentimento próprio. Pacote D04 **sem assinatura digital**.
Fotos/logs nunca devem mostrar tokens, código de pareamento, chaves, URL de banco ou `config.json`.

## 1. Conferência de leitura, no equipamento autorizado

Substituir a pasta pelo ZIP recebido do CI da PR revisada e por sua extração. Não executar ZIP de origem desconhecida.

```powershell
$D05Package = 'C:\HomologacaoD05\omni-print-agent'
$D05Zip = 'C:\HomologacaoD05\omni-print-agent-0.2.0-d04.zip'
$D05ExpectedSha = 'f48b30977a4cff2384e0ccfb8bf45bcc741d7da36c6edb3790cb55561255832a'
$D05Node = 'C:\Users\rafae\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$D05InstallRoot = Join-Path $env:LOCALAPPDATA 'OmniPrintAgentApp-D05'
$D05DataRoot = Join-Path $env:LOCALAPPDATA 'OmniPrintAgent-D05'
$D05TaskName = 'OmniPrintAgent-Lab-D05'
if ((Get-FileHash -LiteralPath $D05Zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $D05ExpectedSha) { throw 'ZIP divergente: parar' }
& $D05Node --version # 24.x >=24.12.0; no RAFACELL foi verificado 24.22.1
$PSVersionTable.PSVersion # PowerShell 5.1
[Security.Principal.WindowsIdentity]::GetCurrent().User.Value # registrar SID autorizado
Get-CimInstance Win32_Printer | Select-Object Name,DriverName,PortName,WorkOffline,PrinterStatus
Get-PnpDevice -PresentOnly | Where-Object InstanceId -like 'USBPRINT*' | Select-Object Status,FriendlyName,InstanceId
Set-Location -LiteralPath $D05Package
.\windows\Install-Agent.ps1 -NodePath $D05Node -InstallRoot $D05InstallRoot -DataRoot $D05DataRoot -TaskName $D05TaskName # somente PLANO
```

Registrar Windows, Node/caminho, PowerShell, Chrome/Edge, modelo/série da impressora, nome exato da fila, driver/versão,
USB/porta e largura. Bobina 58 mm só com guia/adaptação suportada pelo fabricante. Largura não suportada: N/A somente
com justificativa e aprovação humana; falta de equipamento ou autorização continua BLOCKED.
Usar diretórios/tarefa exclusivos acima; não reutilizar configuração, credencial ou diário de outra instalação. O `node`
genérico do PATH pode ter outra versão. Em outro computador, identificar um Node24 autorizado e ajustar apenas esse caminho.

## 2. Somente após aprovação do ambiente, equipamento e instalação

```powershell
.\windows\Install-Agent.ps1 -NodePath $D05Node -InstallRoot $D05InstallRoot -DataRoot $D05DataRoot -TaskName $D05TaskName -Apply -AuthorizedLab
$D05Install = Get-Content -LiteralPath (Join-Path $D05InstallRoot 'installation.json') -Raw | ConvertFrom-Json
& $D05Install.nodePath (Join-Path $D05Install.releaseRoot 'agent.mjs') printers --data-dir $D05Install.dataRoot
.\windows\Diagnose-Agent.ps1 -InstallRoot $D05InstallRoot
Get-ScheduledTask -TaskName $D05Install.taskName | Select-Object TaskName,State,Principal,Settings,Triggers
```

Esperado: tarefa **desabilitada**, logon do mesmo SID, Interactive/Limited/IgnoreNew, pacote íntegro. O parâmetro
`-AuthorizedLab` apenas declara um consentimento já recebido; digitá-lo não cria autorização. Se ACL/tarefa falhar,
registrar e parar; não elevar privilégios automaticamente. DPAPI em outro usuário já é testado no CI descartável;
repetição física exige segundo usuário autorizado, sem copiar credencial para conta/computador real alheio.

## 3. Pareamento e início, somente com transporte autorizado

No navegador do próprio caixa sintético: Configurações → PDV → gerar código único. O domínio precisa estar comprovadamente
ligado ao banco de teste e ao SHA/release autorizado. Não registrar a linha com código real em transcrição/log/chat.

```powershell
# Preencher somente na sessão protegida, sem gravação de histórico/transcrição do segredo.
& $D05Install.nodePath (Join-Path $D05Install.releaseRoot 'agent.mjs') pair --data-dir $D05Install.dataRoot --server https://DOMINIO-HOMOLOGACAO --code XXXX-XXXX-XXXX
.\windows\Diagnose-Agent.ps1 -InstallRoot $D05InstallRoot -ProbeCredential -AuthorizedLab
.\windows\Start-Agent.ps1 -InstallRoot $D05InstallRoot -Apply -AuthorizedLab
```

Conferir online e vincular terminal/fila/largura pelo navegador autorizado. Ligar impressão somente na loja sintética.
Código já consumido/pareamento pendente: parar e reconciliar; não apagar `pairing.pending.json`, configuração ou trava.
Falha de acesso ao Preview não autoriza remover proteção/TLS ou usar outro servidor.

## 4. Executar e registrar H01–H18

Usar as instruções do RUNBOOK_D05.md e ROTEIRO_HOMOLOGACAO_FISICA.md. Uma ação por vez; contar e fotografar todo papel
antes/depois de cada falha. Em H04/H05/H06 testar manual/automático autorizado e venda não confirmada, comparar itens,
total, pagamento e troco. H07 cobre PDV/Histórico/Conferência; H08 cobre Chrome/Edge. Nada de vendas financeiras reais.

Copiar `evidence/d05/H01-H18.template.json` para a pasta privada de evidências da execução. Preencher início/fim com fuso,
operador, equipamento/versão, observado, IDs sintéticos, contagem, correção, resultado e referências relativas dos arquivos.
Cada evidência usa `kind=PHOTO|LOG|SCREENSHOT|VIDEO`, `path` relativo e `sha256` calculado do arquivo original.
O inventário global `equipment` é uma lista de estações, cada uma com `ref`, `computerModel`, `windowsVersion`,
`nodeVersion`, `powershellVersion`, `chromeVersion`, `edgeVersion`, `printerModel`, `printerSerial`, `driver`,
`driverVersion`, `queue`, `port` e `paperWidthsMm` (lista de 58 e/ou 80). `equipmentRef` de cada caso aponta para uma
dessas referências; registrar as duas estações de H15 e correlacioná-las nos IDs/evidências do caso. Todos os campos de
identificação/versão são obrigatórios em casos executados. `ownerApproval={by, reference, at}` é o **aceite final das
evidências**, posterior ao fim de todos os testes e decisões N/A; não reutilizar a autorização prévia de execução.

Comando para obter o hash do arquivo original:

```powershell
Get-FileHash -LiteralPath 'C:\HomologacaoD05\evidencias\H04-papel.jpg' -Algorithm SHA256
# No checkout D05 revisado; só lê o registro e confere os hashes dos arquivos relativos.
node tools/print-d05/readiness.mjs record 'C:\HomologacaoD05\evidencias\H01-H18.json'
```

`VALID` confere preenchimento/arquivos, não atesta a veracidade do papel ou da aprovação. Não enviar o arquivo bruto
à PR se contiver informação sensível. A versão redigida preserva IDs sintéticos e os hashes das provas originais guardadas.
H04/H05 podem ser N/A por largura não suportada com aprovação; função parcial (por exemplo corte) é subcaso documentado,
mantendo os demais itens de H05 testados. H01–H03 e H06–H18 sem execução ficam BLOCKED. Spooler aceito não prova papel.

## 5. Parada, atualização e retirada

Duplicidade, gaveta, venda sem confirmação, dado real ou risco financeiro: parar imediatamente e pedir nova liberação.
Para parada normal, pausar pedidos, preservar relatos, revogar a instalação no sistema e então:

```powershell
.\windows\Stop-Agent.ps1 -InstallRoot $D05InstallRoot -Apply -AuthorizedLab
.\windows\Diagnose-Agent.ps1 -InstallRoot $D05InstallRoot
# Atualização somente de pacote revisado e com consentimento; tarefa continua desabilitada.
.\windows\Update-Agent.ps1 -InstallRoot $D05InstallRoot -PackageRoot 'C:\HomologacaoD05\PACOTE-REVISADO' -Apply -AuthorizedLab
# Retirada só depois de revogar no servidor e preservar as evidências/diário:
.\windows\Uninstall-Agent.ps1 -InstallRoot $D05InstallRoot -Apply -AuthorizedLab -RevocationConfirmed
```

Atualizar e desinstalar são alternativas conforme a etapa; não executar ambas por copiar este bloco. Não apagar UNKNOWN,
histórico, diário, `.lock`, `.guard`, instância, hosts ou fila; não restaurar diário antigo. Desmontagem de banco/Preview
exige conferência e autorização separadas conforme o plano. Aprovação final do proprietário fica com referência/data;
`PHYSICAL_HOMOLOGATION=PASS` só após conferir todos os casos aplicáveis e evidências físicas.
