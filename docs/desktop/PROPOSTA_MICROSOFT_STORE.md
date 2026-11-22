# Proposta — publicar o programa Windows sem certificado próprio

GOAL `OMNI-DESKTOP-WIN10-PILOTO-CUSTO-ZERO-002` · 22/11/2026 · **apenas proposta: nada foi contratado,
cadastrado nem publicado.**

## Resumo

| Caminho | Custo direto | Assinatura | Atualização | Impressão direta | Esforço |
|---|---|---|---|---|---|
| **1. Microsoft Store com pacote MSIX** (recomendado) | R$ 0 | A Microsoft assina na publicação | Pela Store, automática | Sim (app desktop "full trust") | Médio |
| 2. Microsoft Store com o Setup.exe atual | R$ 0 | **Exige certificado próprio** | Nossa (Squirrel) | Sim | Baixo, mas bloqueado pelo certificado |
| 3. PWA na Microsoft Store (PWABuilder) | ~R$ 40/ano (domínio próprio) | A Microsoft assina | Automática (é o site) | **Não** (diálogo do navegador) | Baixo |
| 4. Instalação assistida (atual, piloto) | R$ 0 | Nenhuma | Manual, pela equipe | Sim | Por loja |

## Fatos levantados (fontes no fim)

- **Conta de desenvolvedor:** gratuita para pessoa física desde 10/09/2025 e para empresa desde
  07/05/2026. A taxa de US$ 99 da conta empresa acabou. A empresa ainda passa por verificação da
  Microsoft. O cadastro deve começar por `storedeveloper.microsoft.com`, porque outras entradas ainda podem
  mostrar a taxa antiga.
- **MSIX:** não exige certificado de autoridade certificadora para enviar. Depois da certificação, a Store
  assina o pacote com certificado da Microsoft, o que elimina o aviso "editor desconhecido" para quem
  instala pela Store.
- **EXE/MSI na Store:** a Store **não** assina esses instaladores. O instalador e todos os seus arquivos
  executáveis precisam estar assinados com certificado de uma raiz confiável da Microsoft; autoassinado não
  serve. O arquivo fica hospedado por nós, em URL versionada, e não tem atualização pela Store. Para nós,
  esse caminho volta ao problema do certificado.
- **Electron → MSIX:** o Electron Forge tem `@electron-forge/maker-msix` desde a 7.10, ainda
  **experimental** (a configuração pode mudar entre versões). O build só roda em Windows 10/11 com o
  Windows SDK, o que o runner `windows-latest` do Actions atende. Há também o guia oficial da Microsoft
  com o `winapp` CLI.
- **Dados do app no MSIX:** o que o app grava em `%AppData%` vai para uma pasta privada do pacote. Por
  isso o perfil da instalação Squirrel (login, `print-station.json`, vendas pendentes) **não aparece** para
  a versão da Store. Desligar essa virtualização exige capacidade restrita e, segundo relatos da
  comunidade, pode impedir a distribuição pela Store.
- **Política para apps web:** um app enviado como web app precisa ser publicado pelo dono do domínio.
  `omni-gestao-pro.vercel.app` é subdomínio da Vercel, então o PWA na Store pede domínio próprio. Os
  links de suporte e de privacidade precisam ser páginas reais do nosso site; hoje `/suporte` tem
  contatos de exemplo.

## Recomendação: caminho 1 (MSIX na Store), em etapas com autorização própria

1. **Pré-requisitos sem código:** o proprietário cria a conta **empresa** gratuita e passa pela
   verificação. É preciso uma página de suporte real e a política de privacidade (`/privacy`, que já
   existe). O nome "OmniGestão Pro" fica reservado na conta.
2. **Prova técnica isolada (1 PR, sem publicar):** adicionar o `maker-msix` ao Forge **ao lado** do
   Squirrel, sem trocar o canal atual. No MSIX, desligar a checagem de atualização própria, porque quem
   atualiza é a Store (`updates.ts` passa a respeitar um canal `store`). O CI gera o `.msix` sem
   assinatura (a Store assina). A instalação local de teste é por sideload, só num PC de teste, nunca no
   caixa da RAFACELL.
3. **Homologar no PC de teste:** login, isolamento entre lojas, impressão direta pelo spooler dentro do
   contêiner MSIX, reinício e desinstalação. É o ponto de maior risco.
4. **Migração das lojas piloto:** a versão Store começa com perfil vazio. Antes de migrar, a loja fecha
   o caixa, sincroniza as vendas pendentes, desinstala o Squirrel e instala pela Store; depois, novo
   login e nova escolha de impressora. Tudo isso entra num roteiro como o de `HOMOLOGACAO_WINDOWS_10_11.md`.
5. **Envio para certificação:** a Microsoft pode recusar por política. A impressão direta é a função
   nativa que diferencia o app de um site embrulhado, mas a aprovação **não é garantida**.
6. **Só então** o `/baixar` passa a apontar para a página da Store, no lugar do Setup.exe. O fail-closed
   atual continua valendo para o canal próprio.

Custo: R$ 0 em taxas. O custo é tempo de desenvolvimento e teste (etapas 2 a 4) e o risco de recusa.

## O que fica igual até lá

- `DESKTOP_PUBLIC_DOWNLOAD` desligado; nenhum instalador não assinado em página pública.
- A RAFACELL fica na 1.0.3 (Windows 11, homologada). A Rafa Brinquedos usa instalação assistida 1.0.3,
  pelo roteiro.
- A integração de certificado pago (SSL.com eSigner) continua dormente na branch
  `claude/desktop-release-assinatura-r2-001`, para quando houver orçamento.

## Fontes

- [Free developer registration for individual developers (Windows Developer Blog, 10/09/2025)](https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/)
- [Microsoft Store: Company developer accounts are now free (heise)](https://www.heise.de/en/news/Microsoft-Store-Company-developer-accounts-are-now-free-11318012.html) · [Neowin](https://www.neowin.net/news/microsoft-makes-company-developer-accounts-free-for-the-microsoft-store/)
- [Open a developer account in Partner Center](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account)
- [App package requirements for MSI/EXE app](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/app-package-requirements)
- [App package requirements for MSIX app](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements)
- [Code signing options for Windows app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- [Electron Forge — MSIX maker](https://www.electronforge.io/config/makers/msix) · [Electron packaging com winapp CLI (Microsoft)](https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/guides/electron-packaging)
- [MSIX flexible virtualization](https://learn.microsoft.com/en-us/windows/msix/desktop/flexible-virtualization)
- [Microsoft Store Policies](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies)
