"use client";

import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { ShieldCheck, KeyRound, Info } from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Badge } from "@/components/configuracoes-v3/components/ui/badge";
import { useSession, signOut } from "next-auth/react";

export function SegurancaSection() {
  const { data: session, status } = useSession();

  const loading = status === "loading";
  const autenticado = status === "authenticated" && !!session?.user;

  const nome = session?.user?.name?.trim() || "—";
  const email = session?.user?.email?.trim() || "—";
  const role = session?.user?.role?.trim() || "—";

  const handleEncerrar = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title="Segurança"
        description="Autenticação via NextAuth v5 (email + senha). Sessão JWT com validade configurada no servidor."
      />

      <SettingsCard title="Como a autenticação funciona">
        <div className="flex gap-3 rounded-lg border border-border bg-card-muted p-4 text-sm leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
          <div className="space-y-2">
            <p>
              <span className="font-medium text-foreground">Login:</span> email + senha verificados contra a tabela{" "}
              <code className="rounded bg-muted px-1 text-xs text-foreground">admin_users</code> (bcrypt). Sessão JWT
              armazenada via cookie{" "}
              <code className="rounded bg-muted px-1 text-xs text-foreground">authjs.session-token</code> (httpOnly,
              secure em produção).
            </p>
            <p>
              <span className="font-medium text-foreground">Papéis disponíveis:</span> SUPER_ADMIN, ADMIN, GERENTE,
              OPERADOR — mapeados em{" "}
              <code className="rounded bg-muted px-1 text-xs text-foreground">lib/auth/enterprise-permissions.ts</code>.
            </p>
            <p>
              <span className="font-medium text-foreground">Proteção de rotas:</span> middleware{" "}
              <code className="rounded bg-muted px-1 text-xs text-foreground">proxy.ts</code> redireciona
              /dashboard/* para /login se não houver sessão válida.
            </p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Sessão autenticada do sistema" description="Dados da sessão NextAuth ativa neste navegador.">
        {loading ? (
          <p className="py-4 text-sm text-muted-foreground">Carregando estado…</p>
        ) : (
          <ul className="divide-y divide-border">
            <li className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {autenticado ? nome : "Sem sessão ativa"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {autenticado
                      ? `${email} · Papel: ${role}`
                      : "Nenhuma sessão NextAuth válida detectada."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={autenticado ? "default" : "secondary"}>
                  {autenticado ? role : "Inativo"}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!autenticado}
                  onClick={() => void handleEncerrar()}
                >
                  Encerrar sessão
                </Button>
              </div>
            </li>
          </ul>
        )}
      </SettingsCard>

      <SettingsCard title="Nível de segurança atual" description="Resumo honesto — sem inventar recursos.">
        <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
          <li>Senha bcrypt + JWT httpOnly; tráfego deve usar HTTPS em produção.</li>
          <li>Não há 2FA, recuperação de senha por e-mail nem auditoria de login nesta tela.</li>
          <li>Não há listagem de sessões ativas nem revogação por dispositivo no backend.</li>
        </ul>
      </SettingsCard>

      <SettingsCard title="Recursos não implementados">
        <p className="text-sm text-muted-foreground">
          Alteração de senha tradicional, autenticação em dois fatores, histórico de acessos com IP e encerrar outras
          sessões: <span className="font-medium text-foreground">em breve / fora do escopo atual</span>.
        </p>
      </SettingsCard>
    </div>
  );
}
