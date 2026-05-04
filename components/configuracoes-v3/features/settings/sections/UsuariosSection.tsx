"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { Users, Plus, Shield, ExternalLink } from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Badge } from "@/components/configuracoes-v3/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/configuracoes-v3/components/ui/avatar";

type StaffGet = { ok: true; role: string } | { ok: false };

const PAPEIS_REAIS = [
  {
    nome: "ADMIN",
    desc: "Tabela `users` (Prisma): operadores com role ADMIN autenticam em POST /api/auth/staff no modo ADMIN (PIN único por usuário).",
  },
  {
    nome: "CAIXA",
    desc: "Tabela `users`: role padrão CAIXA; no login staff modo VENDEDOR o PIN valida usuários CAIXA/caixa.",
  },
  {
    nome: "GERENTE",
    desc: "Login staff modo GERENTE: PIN de usuário GERENTE ou variável de ambiente ASSISTEC_GERENTE_PIN (quando definida).",
  },
] as const;

export function UsuariosSection() {
  const [staff, setStaff] = useState<StaffGet | null>(null);
  const [staffLoading, setStaffLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/staff", { credentials: "include", cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as StaffGet;
        if (!cancelled) setStaff(data.ok === true ? data : { ok: false });
      } catch {
        if (!cancelled) setStaff({ ok: false });
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const staffLabel = staffLoading ? "Carregando…" : staff?.ok ? String(staff.role) : "Sem sessão staff ativa";

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Users className="h-5 w-5" />}
        title="Usuários e Permissões"
        description="O banco possui modelo `User` (nome, PIN, role). Não há API de listagem nem vínculo usuário↔loja nesta versão."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/master-console">
                Master Console
                <ExternalLink className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button type="button" disabled title="Não há endpoint de cadastro de usuários na API">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar usuário
            </Button>
          </div>
        }
      />

      <SettingsCard
        title="Sessão staff (caixa)"
        description="GET /api/auth/staff — reflete cookies de login por PIN (operador)."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback className="bg-muted text-muted-foreground text-xs">OP</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium text-foreground">Papel na sessão</p>
              <p className="text-xs text-muted-foreground">
                {staffLoading ? "Consultando…" : "Não inclui nome do usuário (API não retorna lista)."}
              </p>
            </div>
          </div>
          <Badge variant={staff?.ok ? "default" : "secondary"} className="w-fit shrink-0">
            {staffLabel}
          </Badge>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Equipe"
        description="Não há GET de usuários exposto ao frontend. Cadastros reais ficam na tabela `users` (ex.: upsert em /api/user/credits)."
      >
        <ul className="divide-y divide-border">
          <li className="py-8 text-center text-sm text-muted-foreground">
            Lista vazia — nenhuma API lista operadores para esta tela.
          </li>
        </ul>
      </SettingsCard>

      <SettingsCard title="Papéis no sistema (real)" description="Conforme Prisma e /api/auth/staff — não é matriz de permissões fina.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PAPEIS_REAIS.map((f) => (
            <div key={f.nome} className="flex items-start gap-3 rounded-lg border border-border bg-card-muted p-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{f.nome}</p>
                <p className="mt-1 text-sm font-normal leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          A tela <span className="font-medium text-foreground">Master Console</span> mostra equipe por loja como{" "}
          <span className="font-medium text-foreground">demonstração</span> (dados mock), não ligada ao Prisma.
        </p>
      </SettingsCard>
    </div>
  );
}
