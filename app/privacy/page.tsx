import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade — OmniGestão Pro",
  description:
    "Saiba como a OmniGestão Pro coleta, utiliza e protege seus dados pessoais.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <header className="mb-10 border-b border-border pb-8">
          <p className="mb-2 text-sm font-medium tracking-widest text-muted-foreground uppercase">
            OmniGestão Pro
          </p>
          <h1 className="text-4xl font-bold tracking-tight">
            Política de Privacidade
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Última atualização:{" "}
            <time dateTime="2026-05-11">11 de maio de 2026</time>
          </p>
        </header>

        <article className="space-y-8 text-base leading-relaxed">
          <section>
            <p>
              A <strong>OmniGestão Pro</strong> respeita a privacidade dos
              usuários e protege os dados utilizados na plataforma.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              Coleta e uso de informações
            </h2>
            <p>
              As informações coletadas são utilizadas apenas para
              funcionalidades internas do sistema, autenticação, integrações e
              melhorias da experiência do usuário.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              Compartilhamento de dados
            </h2>
            <p>
              Nenhum dado é vendido para terceiros. As informações podem ser
              compartilhadas somente quando estritamente necessário para a
              operação das integrações habilitadas pelo próprio usuário.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">Consentimento</h2>
            <p>
              Ao utilizar a plataforma, o usuário concorda com o processamento
              necessário para operação do sistema, conforme descrito nesta
              política.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">Contato</h2>
            <p>
              Dúvidas ou solicitações relacionadas à privacidade podem ser
              enviadas para:{" "}
              <a
                href="mailto:rafacellassistec49@gmail.com"
                className="font-medium text-primary underline underline-offset-4 hover:opacity-80 transition-opacity"
              >
                rafacellassistec49@gmail.com
              </a>
            </p>
          </section>
        </article>

        <footer className="mt-16 border-t border-border pt-8 text-center text-sm text-muted-foreground">
          <p>
            &copy; {new Date().getFullYear()} OmniGestão Pro. Todos os direitos
            reservados.
          </p>
        </footer>
      </div>
    </main>
  );
}
