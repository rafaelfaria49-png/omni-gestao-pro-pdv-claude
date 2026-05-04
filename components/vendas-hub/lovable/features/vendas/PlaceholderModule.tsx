import { Link } from "@tanstack/react-router";
import { ArrowLeft, Construction, Clock, type LucideIcon } from "lucide-react";

type Props = {
  title: string;
  description: string;
  icon?: LucideIcon;
};

export default function PlaceholderModule({ title, description, icon: Icon = Construction }: Props) {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] p-6 md:p-8">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/vendas"
          className="inline-flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Vendas HUB
        </Link>

        <div
          className="rounded-2xl border p-10 md:p-14 text-center shadow-sm"
          style={{
            backgroundColor: "hsl(var(--card))",
            color: "hsl(var(--card-foreground))",
            borderColor: "hsl(var(--border))",
          }}
        >
          <div
            className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "hsl(var(--primary) / 0.12)" }}
          >
            <Icon className="h-10 w-10 text-[hsl(var(--primary))]" strokeWidth={2} />
          </div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] uppercase tracking-wide font-semibold mb-4"
            style={{
              backgroundColor: "hsl(var(--muted))",
              color: "hsl(var(--muted-foreground))",
            }}
          >
            <Clock className="h-3 w-3" />
            Em construção
          </span>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-3 text-base text-[hsl(var(--muted-foreground))] max-w-lg mx-auto">
            {description}
          </p>
          <button
            type="button"
            disabled
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold opacity-60 cursor-not-allowed"
            style={{
              backgroundColor: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
            }}
          >
            Em breve
          </button>
        </div>
      </div>
    </div>
  );
}