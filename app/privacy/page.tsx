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
            <time dateTime="2026-10-15">15 de outubro de 2026</time>
          </p>
        </header>

        <article className="space-y-8 text-base leading-relaxed">
          <section>
            <p>
              Este aviso descreve o tratamento operacional de dados na <strong>OmniGestão Pro</strong>.
              A definição de responsabilidades, bases jurídicas e retenção deve ser validada
              pelo responsável pela operação. Este aviso não atesta conformidade LGPD plena.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              Coleta e uso de informações
            </h2>
            <p>
              O cadastro pode conter nome, contato, CPF/CNPJ, endereço e informações
              relacionadas ao atendimento. O acesso depende da operação, do perfil
              autenticado e da unidade autorizada. Evite inserir dados pessoais
              desnecessários em campos livres e arquivos.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">
              Compartilhamento de dados
            </h2>
            <p>
              A operação utiliza hospedagem e integrações configuradas. O inventário
              de operadores, destinatários e finalidades precisa ser confirmado
              pelo responsável antes de autorizar novos compartilhamentos.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">Solicitações sobre dados pessoais</h2>
            <p>
              O uso da plataforma não constitui, por si só, consentimento. Solicitações
              de acesso, correção e exclusão exigem verificação de identidade,
              autorização e análise de retenção. O encaminhamento interno não
              executa automaticamente esses direitos. Registros financeiros, fiscais,
              vendas e ordens de serviço não são eliminados por esse fluxo.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold">Contato</h2>
            <p>
              Canal de contato informado nesta página (a designação de responsável
              e o procedimento de atendimento ainda dependem de validação administrativa):{" "}
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
