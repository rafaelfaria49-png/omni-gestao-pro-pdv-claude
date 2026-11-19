import type { Metadata } from "next"
import Link from "next/link"
import { headers } from "next/headers"
import { APP_DISPLAY_NAME } from "@/lib/app-brand"
import { PlatformNotice } from "@/components/desktop-download/PlatformNotice"
import { DESKTOP_COMPATIBILIDADE, DESKTOP_REQUISITOS, type CompatStatus } from "@/lib/desktop-distribution/compatibility"
import { getDesktopDownloadState } from "@/lib/desktop-distribution/download-state"
import { desktopVersionFromUserAgent } from "@/lib/desktop-distribution/platform"
import { compareSemver } from "@/lib/desktop-distribution/semver"

export const metadata: Metadata = {
  title: `Baixar para Windows — ${APP_DISPLAY_NAME}`,
  description: "Programa do OmniGestão Pro para Windows: download, requisitos, instalação e atualizações.",
}

const STATUS_LABEL: Record<CompatStatus, string> = {
  verificado: "Testado",
  "em-validacao": "Em validação",
  "nao-suportado": "Não suportado",
}

function formatMb(bytes: number) {
  return `${(bytes / 1048576).toFixed(0)} MB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

export default async function BaixarPage() {
  const [state, h] = await Promise.all([getDesktopDownloadState(), headers()])
  const release = state.status === "available" ? state.release : null
  const desktopVersion = desktopVersionFromUserAgent(h.get("user-agent"))
  const desktopOutdated = Boolean(release && desktopVersion && compareSemver(release.version, desktopVersion) > 0)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-10 px-4 py-10 sm:px-6 sm:py-16">
        <header className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-sm font-semibold">{APP_DISPLAY_NAME}</Link>
          <a href="/login" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Entrar pelo navegador</a>
        </header>

        <section className="flex min-w-0 flex-col gap-4" aria-labelledby="titulo">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Programa para Windows</p>
          <h1 id="titulo" className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {APP_DISPLAY_NAME} para Windows
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            O programa abre o mesmo sistema da nuvem numa janela própria, com ícone na Área de Trabalho e impressão
            direta na impressora térmica. Você entra com a sua conta e vê somente os dados da sua loja — igual ao navegador.
          </p>

          {desktopVersion ? (
            <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
              Você está no programa, versão {desktopVersion}.
              {desktopOutdated && release ? ` A versão ${release.version} está disponível abaixo — instale quando o caixa estiver fechado.` : ""}
            </p>
          ) : null}

          {release ? (
            <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground">
              <div className="flex min-w-0 flex-wrap items-center gap-4">
                <a
                  href={release.installerUrl}
                  className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                  download
                >
                  Baixar para Windows (64 bits)
                </a>
                <p className="text-sm text-muted-foreground">
                  Versão {release.version} · {formatMb(release.bytes)} · publicada em {formatDate(release.publishedAt)}
                </p>
              </div>
              <PlatformNotice />
              <dl className="grid min-w-0 gap-2 text-sm">
                <div className="min-w-0">
                  <dt className="font-medium">Assinado digitalmente por</dt>
                  <dd className="break-words text-muted-foreground">{release.signer}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="font-medium">SHA-256 do instalador</dt>
                  <dd className="break-all font-mono text-xs text-muted-foreground">{release.sha256}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-5 text-card-foreground">
              <p className="font-semibold">O download público do instalador ainda não está liberado.</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Ele será liberado aqui quando o instalador estiver assinado digitalmente e aprovado nos testes de Windows.
                Enquanto isso, use o {APP_DISPLAY_NAME} pelo navegador — é a mesma conta, com os mesmos dados.
                Lojas do piloto recebem o instalador diretamente da equipe da plataforma.
              </p>
              <div>
                <a href="/login" className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
                  Acessar pelo navegador
                </a>
              </div>
            </div>
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-3" aria-labelledby="requisitos">
          <h2 id="requisitos" className="text-xl font-semibold">Requisitos</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
            {DESKTOP_REQUISITOS.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <div className="min-w-0 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Compatibilidade testada</caption>
              <thead className="bg-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Sistema</th>
                  <th scope="col" className="px-3 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {DESKTOP_COMPATIBILIDADE.map((c) => (
                  <tr key={c.sistema} className="border-t border-border align-top">
                    <td className="px-3 py-2">{c.sistema}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{STATUS_LABEL[c.status]}</span>
                      <span className="block text-muted-foreground">{c.detalhe}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-3" aria-labelledby="instalar">
          <h2 id="instalar" className="text-xl font-semibold">Como instalar</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>Baixe o <span className="font-mono">OmniGestaoPro-Setup.exe</span> somente por esta página.</li>
            <li>
              Antes de abrir, confira a assinatura: clique com o botão direito no arquivo → <em>Propriedades</em> →
              aba <em>Assinaturas Digitais</em>. Se não houver assinatura ou o nome for outro, não execute.
            </li>
            <li>Dê dois cliques no arquivo. A instalação é por usuário, não pede senha de administrador e abre o programa sozinha.</li>
            <li>O atalho &quot;{APP_DISPLAY_NAME}&quot; fica na Área de Trabalho e no Menu Iniciar.</li>
            <li>Entre com o e-mail e a senha que você já usa no sistema.</li>
            <li>
              Impressora térmica: em <em>Configurações → PDV e impressão → Impressão direta neste computador</em>, escolha a
              impressora. A escolha fica salva neste computador.
            </li>
          </ol>
          <p className="text-sm text-muted-foreground">
            Conferência avançada (PowerShell): <span className="break-all font-mono text-xs">Get-FileHash .\OmniGestaoPro-Setup.exe</span>{" "}
            deve mostrar o SHA-256 publicado acima, e{" "}
            <span className="break-all font-mono text-xs">Get-AuthenticodeSignature .\OmniGestaoPro-Setup.exe</span> deve dizer <em>Valid</em>.
          </p>
        </section>

        <section className="flex min-w-0 flex-col gap-3" aria-labelledby="assinatura">
          <h2 id="assinatura" className="text-xl font-semibold">Assinatura digital</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            O instalador oficial é assinado com certificado Authenticode emitido por uma autoridade certificadora. A assinatura
            garante que o arquivo não foi alterado depois de publicado. Nunca instale uma cópia sem assinatura recebida por
            mensagem, pendrive ou outro site. Se o Windows avisar &quot;editor desconhecido&quot;, cancele e baixe novamente por aqui.
          </p>
        </section>

        <section className="flex min-w-0 flex-col gap-3" aria-labelledby="atualizacoes">
          <h2 id="atualizacoes" className="text-xl font-semibold">Atualizações</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>As telas e funções do sistema atualizam sozinhas, como no navegador — não é preciso reinstalar.</li>
            <li>
              Uma versão nova do programa aparece em <em>Sobre</em> (atalho Ctrl+Shift+Alt+V). O programa nunca se fecha nem
              reinicia sozinho: instale a versão nova com o caixa fechado e sem venda em andamento.
            </li>
            <li>Ao atualizar, ficam guardados o login, as vendas que ainda aguardam envio e a impressora escolhida.</li>
          </ul>
        </section>

        <section className="flex min-w-0 flex-col gap-3" aria-labelledby="ajuda">
          <h2 id="ajuda" className="text-xl font-semibold">Ajuda e problemas comuns</h2>
          <dl className="space-y-3 text-sm leading-relaxed">
            <div>
              <dt className="font-medium">Aparece &quot;Sem conexão&quot;</dt>
              <dd className="text-muted-foreground">O programa precisa de internet. Ele tenta de novo sozinho e reabre o sistema quando a conexão volta.</dd>
            </div>
            <div>
              <dt className="font-medium">O cupom não imprime</dt>
              <dd className="text-muted-foreground">Confira se a impressora está ligada e com o cabo USB conectado. O sistema avisa quando a impressora não responde; use &quot;Tentar novamente&quot; depois de religar.</dd>
            </div>
            <div>
              <dt className="font-medium">Desinstalar ou reinstalar</dt>
              <dd className="text-muted-foreground">Em <em>Configurações do Windows → Aplicativos instalados → {APP_DISPLAY_NAME}</em>. Desinstalar não apaga o login guardado nem vendas pendentes de envio; ao reinstalar, eles continuam lá.</dd>
            </div>
            <div>
              <dt className="font-medium">Computador sem Windows 64 bits</dt>
              <dd className="text-muted-foreground">Use o sistema pelo navegador, com a mesma conta.</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">Outras dúvidas: fale com o responsável pela sua loja ou com a equipe que liberou o seu acesso.</p>
        </section>

        <footer className="flex flex-wrap gap-4 border-t border-border pt-6 text-xs text-muted-foreground">
          <Link href="/privacy" className="underline">Privacidade</Link>
          <a href="/login" className="underline">Entrar pelo navegador</a>
        </footer>
      </div>
    </main>
  )
}
