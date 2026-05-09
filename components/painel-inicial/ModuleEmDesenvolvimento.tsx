import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export type ModuleDevLink = { href: string; label: string };

type Props = {
  title: string;
  description: string;
  links?: ModuleDevLink[];
};

export function ModuleEmDesenvolvimento({ title, description, links = [] }: Props) {
  return (
    <div className="mx-auto flex min-w-0 max-w-lg flex-col gap-6 p-8">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Módulo em desenvolvimento
        </p>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {links.length > 0 ? (
        <ul className="flex flex-col gap-2 text-sm">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="font-medium text-primary hover:underline">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        Voltar ao painel inicial
      </Link>
    </div>
  );
}
