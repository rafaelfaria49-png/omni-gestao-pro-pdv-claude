import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

export function Navbar({ onCta }: { onCta: () => void }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="mx-auto mt-4 max-w-6xl px-4">
        <nav className="glass flex items-center justify-between rounded-2xl px-5 py-3">
          <a href="#" className="flex items-center gap-2 font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[image:var(--gradient-neon)] glow-blue">
              <Zap className="h-4 w-4 text-neutral-950" />
            </span>
            <span>OmniGestão <span className="text-gradient-neon">Pro</span></span>
          </a>
          <div className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#arsenal" className="hover:text-foreground transition">Recursos</a>
            <a href="#pricing" className="hover:text-foreground transition">Preços</a>
            <a href="#faq" className="hover:text-foreground transition">FAQ</a>
          </div>
          <Button variant="neon" size="sm" onClick={onCta}>
            Teste Grátis
          </Button>
        </nav>
      </div>
    </header>
  );
}
