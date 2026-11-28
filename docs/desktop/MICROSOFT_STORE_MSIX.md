# OmniGestão Pro na Microsoft Store (MSIX) — canal preparado, NÃO publicado

GOAL `OMNI-WINDOWS-INSTALACAO-COMERCIAL-CUSTO-ZERO-003` · 2026-11-23

**Estado:** o CI gera o pacote MSIX a partir do mesmo app Electron do Setup.exe e o instala de verdade
no runner (instalar, abrir, atualizar, desinstalar). **Não está pronto para clientes**: falta
homologação física (impressão térmica, login real, Windows 10 e 11) e a conta/identidade da Store.
Nada foi cadastrado nem enviado à Microsoft.

## Por que a Store

Custo zero de assinatura: na Store a **Microsoft assina** o MSIX na publicação. O Setup.exe próprio
continua exigindo certificado Authenticode pago (ver `DISTRIBUICAO_PUBLICA.md`). Conta de
desenvolvedor de **empresa** é gratuita desde 2026-05-07 (conferir a regra vigente no cadastro).

## O que foi feito

| Peça | Onde |
|---|---|
| Gerador do pacote (makeappx do Windows SDK; manifesto validado pelo esquema oficial) | `apps/desktop/scripts/make-msix.mjs` |
| AppxManifest puro e testado (identidade, versão `x.y.z.0`, x64, full trust, Windows 10 1809+) | `apps/desktop/scripts/lib/msix-manifest.mjs`, `tests/unit/msix.test.ts` |
| Logos do pacote (44, 50, 150, 310×150) a partir do ícone oficial | `apps/desktop/assets/msix/` |
| App sabe que está no MSIX (`process.windowsStore`) | `src/shared/distribution.ts` |
| Atualização **somente pela Store** no canal MSIX: não consulta o manifesto do Setup.exe, não trata eventos do Squirrel, não sobrescreve o AppUserModelID do pacote | `src/main/main.ts`, `src/main/updates.ts` |
| Instalação real no CI com certificado autoassinado descartável (cópia assinada; o original segue sem assinatura) | `tests/packaged/msix-test.mjs`, `.github/workflows/desktop-windows.yml` |

O Setup.exe (Squirrel) e o rascunho de release interna **não mudam**. O `.msix` não vai para os
artefatos do Actions (repositório público) nem para release: só `msix.json`, hashes e o relatório.

## Comportamento que muda no canal MSIX (documentar ao cliente)

- **Perfil**: o app da Store usa a pasta própria `OmniGestão Pro Store`, que o Windows grava em
  `%LocalAppData%\Packages\<família do pacote>\LocalCache\Roaming\OmniGestão Pro Store` (sessão, vendas
  pendentes, `print-station.json`), separada do perfil do Setup.exe (`%AppData%\OmniGestão Pro`).
  Motivo: no Windows 10 1903+ o app empacotado grava no lugar real os arquivos que **já existem** em
  `%AppData%` e só redireciona os novos; reusar a pasta do Setup.exe dividiria o perfil conforme a
  máquina (visto no CI). Pasta nova = sempre privada do pacote. **Não há migração automática**: quem trocar do Setup.exe para a
  Store precisa sincronizar as vendas pendentes antes e configurar a impressora de novo.
- **Atualizações da Store** preservam o perfil (provado no CI com marcador no perfil). O app nunca reinicia
  sozinho; o momento em que a Store aplica a versão nova com o app aberto **precisa ser confirmado na
  homologação** (não pode fechar uma venda em andamento).
- **Desinstalar o MSIX apaga o perfil do pacote** (diferente do Setup.exe, que preserva). Antes de
  desinstalar, conferir que não há vendas pendentes de envio.
- **Origem fixa**: o pacote é o build `production` (só `https://omni-gestao-pro.vercel.app`); isolamento
  entre lojas é do servidor, igual ao site e ao Setup.exe.
- **Impressão direta**: o app é full trust (`runFullTrust`), então a ponte de impressão e a checagem
  `Get-PnpDevice` rodam como no Setup.exe — **sem prova física ainda**.

## Pendências — dependem do proprietário

1. **Conta no Partner Center** (empresa, CNPJ) — cadastro e aceite de termos são do proprietário.
2. **Reservar o nome** "OmniGestão Pro" e copiar a identidade em *Gerenciamento do produto →
   Identidade do produto*: `Package/Identity/Name`, `Package/Identity/Publisher` (`CN=…`) e
   `Package/Properties/PublisherDisplayName`. Gravar como variáveis do repositório:
   `OMNI_MSIX_IDENTITY_NAME`, `OMNI_MSIX_PUBLISHER`, `OMNI_MSIX_PUBLISHER_DISPLAY_NAME`.
   Nenhum desses valores pode ser inventado: o build `--store` recusa vazio ou a identidade de teste.
3. **Política de privacidade** pública (a Store exige URL): `/privacy` existe — revisar o texto.
4. **Classificação etária, capturas de tela, descrição, categoria** — preenchidas no Partner Center.
5. **Justificativa de `runFullTrust`** (capacidade restrita): "aplicativo Electron de desktop; imprime
   direto na impressora térmica do caixa pelo spooler do Windows".
6. **Homologação física** (seção abaixo) antes de qualquer envio.
7. **Autorização** para gerar o pacote `--store` e enviar. Envio é manual no Partner Center (upload do
   `.msix` sem assinatura); a certificação da Microsoft leva de horas a alguns dias.

## Homologação física (antes de oferecer a clientes)

Em PC de teste (nunca o caixa da RAFACELL), Windows 11 x64 **e** Windows 10 22H2 x64, com o pacote
instalado pela Store (voo privado/"private audience" do Partner Center, sem tornar público):

| Item | Win 11 | Win 10 |
|---|---|---|
| Instalação pela Store, atalho no Menu Iniciar, abrir | | |
| Login, logout, troca de loja (ADMIN/GERENTE 2+ lojas), sem dados de outra loja | | |
| Impressão direta POS-80: teste, cupom automático, impressora desligada avisa | | |
| Venda offline → volta a conexão → envia; atualização da Store com venda pendente preservada | | |
| Desinstalar (perfil apagado — confirmar aviso ao operador) | | |

## Gerar o pacote para a Store (quando autorizado)

```powershell
cd apps/desktop
npm run build; node scripts/write-build-config.mjs --channel production; npx electron-forge package
$env:OMNI_MSIX_IDENTITY_NAME="<do Partner Center>"; $env:OMNI_MSIX_PUBLISHER="CN=<do Partner Center>"; $env:OMNI_MSIX_PUBLISHER_DISPLAY_NAME="<do Partner Center>"
node scripts/make-msix.mjs --store
```

Saída: `out/msix/OmniGestaoPro-<versão>-x64.msix` + `msix.json` + `SHA256SUMS.txt`.
