import Link from "next/link"
import { APP_DISPLAY_NAME } from "@/lib/app-brand"

export default function PilotEntryPage() {
  return <main className="flex min-h-screen flex-col bg-background px-6 py-8 text-foreground sm:px-12">
    <header className="text-sm font-semibold">{APP_DISPLAY_NAME}</header>
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 py-16">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Acesso piloto</p>
      <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">A gestão da sua loja começa por aqui.</h1>
      <p className="max-w-xl text-base leading-relaxed text-muted-foreground">O acesso ao OmniGestão Pro é liberado pela equipe da plataforma para as lojas participantes do piloto.</p>
      <div>
        {/* A entrada de autenticação carrega um novo documento e seu contexto de sessão. */}
        <a href="/login" className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">Entrar no sistema</a>
      </div>
      <p className="text-sm text-muted-foreground">Já recebeu seu acesso? Use o email e a senha individual fornecidos pelo responsável.</p>
    </section>
    <footer className="text-xs text-muted-foreground"><Link href="/privacy" className="underline">Privacidade</Link></footer>
  </main>
}
