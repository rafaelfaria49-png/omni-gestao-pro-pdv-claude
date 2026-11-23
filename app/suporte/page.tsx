import { resolverGestaoLojasConfig } from "@/lib/comercial/gestao-lojas-oferta"

// Mesmas chaves da /gestao-lojas (GESTAO_LOJAS_CONTATO_*), lidas no build como lá.
// Sem contato aprovado configurado, a página não mostra nenhum número ou email:
// contato fictício em página pública leva o cliente para um canal que não existe.
export const dynamic = "force-static"

export default function SuportePage() {
  const { contatoWhatsapp, contatoEmail } = resolverGestaoLojasConfig()
  const temContato = Boolean(contatoWhatsapp || contatoEmail)
  return (
    <div className="min-h-screen bg-background p-6 lg:p-10 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Suporte</h1>
      <p className="text-muted-foreground">Canal para resolver dúvidas de cobrança e uso do sistema</p>
      <div className="rounded-xl border border-border bg-card p-6 space-y-2">
        {temContato ? (
          <>
            {contatoWhatsapp && (
              <p className="text-sm">
                WhatsApp: <a className="text-primary underline" href={`https://wa.me/${contatoWhatsapp}`} rel="noopener">abrir conversa</a>
              </p>
            )}
            {contatoEmail && (
              <p className="text-sm">
                E-mail: <a className="text-primary underline" href={`mailto:${contatoEmail}`}>{contatoEmail}</a>
              </p>
            )}
          </>
        ) : (
          <p className="text-sm">
            Os canais de suporte são enviados pela equipe junto com o acesso da sua loja.
          </p>
        )}
      </div>
    </div>
  )
}
