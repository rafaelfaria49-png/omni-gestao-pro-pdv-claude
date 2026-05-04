"use client";

import { useCallback, useEffect, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { ShieldCheck, KeyRound, Info } from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Badge } from "@/components/configuracoes-v3/components/ui/badge";
import { STAFF_SESSION_COOKIE, STAFF_ROLE_COOKIE } from "@/lib/staff-session";

type AdminGet =
  | { authenticated: true; admin: { id: string; name: string } }
  | { authenticated: false };

type StaffGet = { ok: true; role: string } | { ok: false };

export function SegurancaSection() {
  const [admin, setAdmin] = useState<AdminGet | null>(null);
  const [staff, setStaff] = useState<StaffGet | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"staff" | "admin" | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ra, rs] = await Promise.all([
        fetch("/api/auth/admin", { credentials: "include", cache: "no-store" }),
        fetch("/api/auth/staff", { credentials: "include", cache: "no-store" }),
      ]);
      const ja = (await ra.json().catch(() => ({}))) as AdminGet;
      const js = (await rs.json().catch(() => ({}))) as StaffGet;
      setAdmin(ja.authenticated === true ? ja : { authenticated: false });
      setStaff(js.ok === true ? js : { ok: false });
    } catch {
      setAdmin({ authenticated: false });
      setStaff({ ok: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logoutStaff = async () => {
    setBusy("staff");
    try {
      await fetch("/api/auth/staff", { method: "DELETE", credentials: "include" });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const logoutAdmin = async () => {
    setBusy("admin");
    try {
      await fetch("/api/auth/admin", { method: "DELETE", credentials: "include" });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const adminAtivo = admin?.authenticated === true;
  const staffAtivo = staff?.ok === true;
  const papelStaff = staffAtivo ? String(staff.role) : null;

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title="Segurança"
        description="Cookies httpOnly e PIN (staff). Sem 2FA, sem troca de senha por e-mail e sem registro de sessões múltiplas no backend."
      />

      <SettingsCard title="Como a autenticação funciona hoje">
        <div className="flex gap-3 rounded-lg border border-border bg-card-muted p-4 text-sm leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
          <div className="space-y-2">
            <p>
              <span className="font-medium text-foreground">Admin (créditos / rotas admin):</span> cookie{" "}
              <code className="rounded bg-muted px-1 text-xs text-foreground">assistec_admin_session</code> definido
              após POST <code className="rounded bg-muted px-1 text-xs">/api/auth/admin</code> (PIN de usuário ADMIN no
              Prisma).
            </p>
            <p>
              <span className="font-medium text-foreground">Staff (caixa / PDV):</span> cookies{" "}
              <code className="rounded bg-muted px-1 text-xs text-foreground">{STAFF_SESSION_COOKIE}</code> e{" "}
              <code className="rounded bg-muted px-1 text-xs text-foreground">{STAFF_ROLE_COOKIE}</code> após POST{" "}
              <code className="rounded bg-muted px-1 text-xs">/api/auth/staff</code> (PIN + modo ADMIN, VENDEDOR ou
              GERENTE).
            </p>
            <p>
              <span className="font-medium text-foreground">Servidor (getUserId):</span> se não houver cookie admin, várias
              rotas ainda usam o id sintético <code className="rounded bg-muted px-1 text-xs">mock-admin</code> até auth
              plena — isso não aparece como cookie no navegador.
            </p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Sessão neste navegador" description="Leitura via APIs existentes (sem expor valor dos cookies).">
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
                  <p className="text-sm font-medium text-foreground">Sessão administrativa</p>
                  <p className="text-xs text-muted-foreground">
                    {adminAtivo
                      ? `${admin.admin.name} · id ${admin.admin.id.slice(0, 8)}…`
                      : "Nenhum cookie admin válido detectado pelo servidor."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={adminAtivo ? "default" : "secondary"}>{adminAtivo ? "Ativo" : "Inativo"}</Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!adminAtivo || busy !== null}
                  onClick={() => void logoutAdmin()}
                >
                  {busy === "admin" ? "Encerrando…" : "Encerrar sessão admin"}
                </Button>
              </div>
            </li>
            <li className="flex flex-col gap-3 py-4 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Sessão staff (operador)</p>
                  <p className="text-xs text-muted-foreground">
                    {staffAtivo
                      ? `Papel: ${papelStaff} (validado por GET /api/auth/staff)`
                      : "Sem sessão staff ativa (ou cookies ausentes / inválidos)."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={staffAtivo ? "default" : "secondary"}>{staffAtivo ? papelStaff ?? "Staff" : "Inativo"}</Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!staffAtivo || busy !== null}
                  onClick={() => void logoutStaff()}
                >
                  {busy === "staff" ? "Encerrando…" : "Encerrar sessão staff"}
                </Button>
              </div>
            </li>
          </ul>
        )}
      </SettingsCard>

      <SettingsCard title="Nível de segurança atual" description="Resumo honesto — sem inventar recursos.">
        <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
          <li>PIN + cookies httpOnly; tráfego deve usar HTTPS em produção (secure nos Set-Cookie).</li>
          <li>Papéis staff incluem ADMIN, VENDEDOR, GERENTE (e tipos reservados em código: MARKETING, OPERADOR).</li>
          <li>Não há 2FA, recuperação de senha por e-mail nem auditoria de login nesta tela.</li>
          <li>Não há listagem de &quot;sessões ativas&quot; nem revogação por dispositivo no backend.</li>
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
