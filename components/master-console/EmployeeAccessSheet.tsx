import Link from "next/link";
import { ShieldCheck, ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PanelTeamMember } from "@/lib/master-console-team";

interface EmployeeAccessSheetProps {
  member: PanelTeamMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmployeeAccessSheet({ member, open, onOpenChange }: EmployeeAccessSheetProps) {
  if (!member) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full min-w-0 overflow-y-auto border-l border-border bg-card p-0 sm:max-w-md"
      >
        <SheetHeader className="space-y-0 border-b border-border bg-gradient-to-br from-panel to-card px-6 py-5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span>Conta do painel</span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Avatar className="h-12 w-12 shrink-0 ring-2 ring-background">
              <AvatarFallback className="bg-gradient-to-br from-info/30 to-purple/30 text-sm font-bold text-foreground">
                {member.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base font-bold">{member.name}</SheetTitle>
              <SheetDescription className="truncate text-xs">{member.email}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-6 px-6 py-6">
          <dl className="space-y-4 rounded-xl border border-border bg-panel/40 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-muted-foreground">Papel</dt>
              <dd>
                <Badge variant="outline" className="font-normal">
                  {member.roleLabel}
                </Badge>
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-muted-foreground">Estado</dt>
              <dd>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 text-xs font-medium",
                    member.active ? "text-success" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      member.active ? "bg-success" : "bg-muted-foreground",
                    )}
                  />
                  {member.active ? "Ativo" : "Inativo"}
                </span>
              </dd>
            </div>
          </dl>

          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-normal">
                Em breve
              </Badge>
              <span className="font-medium text-foreground">Matriz granular de módulos</span>
            </div>
            <p>
              Permissões detalhadas por módulo e PIN de turno PDV por colaborador ainda não estão disponíveis neste
              painel — somente leitura aqui. Utilize{" "}
              <Link
                href="/dashboard/configuracoes?sec=usuarios"
                className="font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => onOpenChange(false)}
              >
                Configurações → Utilizadores
              </Link>{" "}
              para editar papel, unidades e estado da conta.
            </p>
          </div>

          <div className="flex flex-col gap-2 pb-2">
            <Button className="w-full rounded-xl font-semibold" asChild>
              <Link href="/dashboard/configuracoes?sec=usuarios" onClick={() => onOpenChange(false)}>
                Editar em Utilizadores
                <ExternalLink className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="ghost" className="rounded-xl font-semibold" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
