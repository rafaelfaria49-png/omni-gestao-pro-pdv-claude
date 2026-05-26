"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Label } from "@/components/configuracoes-v3/components/ui/label";
import { Input } from "@/components/configuracoes-v3/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/configuracoes-v3/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/configuracoes-v3/components/ui/table";
import { useLojaAtiva } from "@/lib/loja-ativa";
import {
  CONFIG_AUDIT_AREAS,
  CONFIG_AUDIT_AREA_LABELS,
  type ConfigAuditArea,
  type ConfigAuditLogRow,
} from "@/lib/config-audit/types";

function formatAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function truncateCell(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t || "—";
  return `${t.slice(0, max - 1)}…`;
}

function AuditoriaSectionContent() {
  const { lojaAtivaId } = useLojaAtiva();
  const [area, setArea] = useState<string>("all");
  const [section, setSection] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [onlyActiveStore, setOnlyActiveStore] = useState(true);
  const [logs, setLogs] = useState<ConfigAuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeFilter = onlyActiveStore ? lojaAtivaId?.trim() || "" : "";

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (area !== "all") p.set("area", area);
    if (section !== "all") p.set("section", section);
    if (storeFilter) p.set("storeId", storeFilter);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    p.set("limit", "200");
    return p.toString();
  }, [area, section, storeFilter, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/config-audit?${queryString}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        logs?: ConfigAuditLogRow[];
      };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setLogs(j.logs ?? []);
    } catch (e) {
      setLogs([]);
      setError(e instanceof Error ? e.message : "Falha ao carregar registros");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<ClipboardList className="h-5 w-5" />}
        title="Central de Auditoria"
        description="Histórico read-only de alterações críticas de configuração (financeiro, PDV, impostos, usuários, permissões, maquininhas e módulos)."
      />

      <SettingsCard
        title="Filtros"
        description="Refine por área, seção, período e unidade. Os registros são gravados automaticamente ao salvar nas abas de configuração."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2 min-w-0">
            <Label>Área</Label>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger className="min-w-0">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as áreas</SelectItem>
                {CONFIG_AUDIT_AREAS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {CONFIG_AUDIT_AREA_LABELS[a as ConfigAuditArea]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 min-w-0">
            <Label>Seção (UI)</Label>
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger className="min-w-0">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="geral">Geral</SelectItem>
                <SelectItem value="pdv">PDV</SelectItem>
                <SelectItem value="vendas">Vendas</SelectItem>
                <SelectItem value="financeiro">Financeiro</SelectItem>
                <SelectItem value="usuarios">Usuários</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 min-w-0 sm:col-span-2 lg:col-span-1">
            <Label>Unidade</Label>
            <Select
              value={onlyActiveStore ? "active" : "all"}
              onValueChange={(v) => setOnlyActiveStore(v === "active")}
            >
              <SelectTrigger className="min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Somente unidade ativa</SelectItem>
                <SelectItem value="all">Todas as unidades</SelectItem>
              </SelectContent>
            </Select>
            {onlyActiveStore && !lojaAtivaId?.trim() ? (
              <p className="text-xs text-muted-foreground">Nenhuma unidade ativa — defina em Lojas.</p>
            ) : null}
          </div>
          <div className="space-y-2 min-w-0">
            <Label htmlFor="audit-from">De</Label>
            <Input
              id="audit-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2 min-w-0">
            <Label htmlFor="audit-to">Até</Label>
            <Input id="audit-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end min-w-0">
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Registros" description={`${logs.length} evento(s) no período filtrado.`}>
        {error ? (
          <p className="py-6 text-sm text-destructive">{error}</p>
        ) : loading && logs.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Carregando…</p>
        ) : logs.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            Nenhum registro encontrado. Altere uma configuração crítica e volte aqui — os eventos
            aparecem após salvar com sucesso.
          </p>
        ) : (
          <div className="min-w-0 overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Quando</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead className="whitespace-nowrap">Loja</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Campo</TableHead>
                  <TableHead>Antes</TableHead>
                  <TableHead>Depois</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">
                      {formatAt(row.at)}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs" title={row.userLabel}>
                      {truncateCell(row.userLabel, 48)}
                    </TableCell>
                    <TableCell className="max-w-[100px] truncate font-mono text-xs" title={row.storeId}>
                      {truncateCell(row.storeId || "—", 16)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {CONFIG_AUDIT_AREA_LABELS[row.area] ?? row.area}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate font-mono text-xs" title={row.field}>
                      {truncateCell(row.field, 40)}
                    </TableCell>
                    <TableCell
                      className="max-w-[120px] truncate text-xs text-muted-foreground"
                      title={row.oldValue}
                    >
                      {truncateCell(row.oldValue, 32)}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs" title={row.newValue}>
                      {truncateCell(row.newValue, 32)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {logs.some((r) => r.ip || r.userAgent) ? (
          <p className="mt-3 text-xs text-muted-foreground">
            IP e dispositivo são registrados quando a alteração passa pelo servidor (detalhe no
            metadata de cada evento).
          </p>
        ) : null}
      </SettingsCard>
    </div>
  );
}

export function AuditoriaSection() {
  return <AuditoriaSectionContent />;
}
