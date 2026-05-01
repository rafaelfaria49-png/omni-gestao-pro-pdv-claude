import { Shield, Lock, CreditCard, Zap } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative mt-12 border-t border-white/10 py-14">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 font-bold">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[image:var(--gradient-neon)] glow-blue">
                <Zap className="h-4 w-4 text-neutral-950" />
              </span>
              <span>OmniGestão <span className="text-gradient-neon">Pro</span></span>
            </div>
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">
              O ecossistema de gestão omnicanal com IA que trabalha por você, 24/7.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold">Produto</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><a href="#arsenal" className="hover:text-foreground">Recursos</a></li>
              <li><a href="#pricing" className="hover:text-foreground">Preços</a></li>
              <li><a href="#faq" className="hover:text-foreground">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Empresa</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground">Sobre</a></li>
              <li><a href="#" className="hover:text-foreground">Privacidade</a></li>
              <li><a href="#" className="hover:text-foreground">Termos</a></li>
            </ul>
          </div>
        </div>

        {/* Trust row */}
        <div className="mt-12 flex flex-col items-center justify-between gap-6 border-t border-white/10 pt-8 md:flex-row">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} OmniGestão Pro. Todos os direitos reservados.</p>

          <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
            <div className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5">
              <Shield className="h-3.5 w-3.5 text-neon-green" />
              Pagamento Seguro (Stripe / Asaas)
            </div>
            <div className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5">
              <Lock className="h-3.5 w-3.5 text-neon-blue" />
              Criptografia AES-256
            </div>
            <div className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5">
              <CreditCard className="h-3.5 w-3.5 text-neon-cyan" />
              Visa • Master • Pix • Boleto
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
