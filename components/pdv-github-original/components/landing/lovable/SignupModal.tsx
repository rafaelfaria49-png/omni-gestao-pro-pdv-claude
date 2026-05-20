import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Sparkles } from "lucide-react";

interface SignupModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  planName?: string;
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function SignupModal({ open, onOpenChange, planName }: SignupModalProps) {
  const [phone, setPhone] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="landing-page bg-slate-950 border border-neon-blue/40 shadow-[0_0_60px_-10px_oklch(0.75_0.22_230_/_0.5)] sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-[image:var(--gradient-neon)] glow-blue">
            <Sparkles className="h-6 w-6 text-neutral-950" />
          </div>
          <DialogTitle className="text-center text-2xl">
            {planName ? `Assinar plano ${planName}` : "Comece seu teste grátis"}
          </DialogTitle>
          <DialogDescription className="text-center">
            7 dias grátis. Sem compromisso. Cancele quando quiser.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            onOpenChange(false);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-white">Nome completo</Label>
            <Input
              id="name"
              required
              placeholder="Seu nome"
              className="bg-slate-900/80 border-neon-blue/30 text-white placeholder:text-slate-400 focus-visible:ring-neon-blue focus-visible:border-neon-blue/60"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-white">E-mail corporativo</Label>
            <Input
              id="email"
              type="email"
              required
              placeholder="voce@empresa.com"
              className="bg-slate-900/80 border-neon-blue/30 text-white placeholder:text-slate-400 focus-visible:ring-neon-blue focus-visible:border-neon-blue/60"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-white">WhatsApp</Label>
            <Input
              id="phone"
              required
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              placeholder="(11) 99999-9999"
              className="bg-slate-900/80 border-neon-blue/30 text-white placeholder:text-slate-400 focus-visible:ring-neon-blue focus-visible:border-neon-blue/60"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="store" className="text-white">Nome da loja</Label>
            <Input
              id="store"
              required
              placeholder="Minha Loja LTDA"
              className="bg-slate-900/80 border-neon-blue/30 text-white placeholder:text-slate-400 focus-visible:ring-neon-blue focus-visible:border-neon-blue/60"
            />
          </div>

          <Button type="submit" variant="neon" size="lg" className="w-full">
            Criar Conta e Acessar
          </Button>

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            Você será redirecionado para o pagamento seguro. Não cobraremos nada hoje.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
