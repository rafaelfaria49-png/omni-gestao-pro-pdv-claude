"use client";

import type { ReactNode } from "react";
import { KeyRound, ListChecks, Smartphone, Sparkles, User } from "lucide-react";
import { CHECKLIST_PADRAO } from "@/types/os";
import { SectionShellV3 } from "../components/SectionShellV3";
import { ConstructionBadgeV3 } from "../components/ConstructionBadgeV3";
import { ButtonV3 } from "../components/UiV3";
import { useOperacoesV3 } from "../context/OperacoesV3Context";
import { SCREEN_COPY } from "../data/screen-copy";

function Card({ icon, titulo, children }: { icon: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
      </div>
      {children}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export function AtendimentoRapidoV3() {
  const { acaoEmConstrucao, abrirNovaOS } = useOperacoesV3();
  return (
    <SectionShellV3
      titulo={SCREEN_COPY.atendimento.titulo}
      subtitulo={SCREEN_COPY.atendimento.subtitulo}
      badge={<ConstructionBadgeV3 />}
      actions={
        <ButtonV3 variant="primary" onClick={abrirNovaOS}>
          <Sparkles className="h-4 w-4" aria-hidden />
          Nova OS completa
        </ButtonV3>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          abrirNovaOS();
        }}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
          <p className="min-w-0 text-xs text-foreground">
            Este é o <strong>check-in simplificado</strong>. Para abrir a ordem de serviço de verdade (cliente, equipamento, itens, pagamento previsto e garantia), use a <strong>Nova OS Enterprise</strong>.
          </p>
          <ButtonV3 variant="primary" onClick={abrirNovaOS} className="shrink-0">
            <Sparkles className="h-4 w-4" aria-hidden />
            Abrir Nova OS
          </ButtonV3>
        </div>
        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Casca de check-in: os campos são editáveis para validar o fluxo, mas <strong>nada é gravado</strong> aqui. A criação real fica na Nova OS Enterprise.
        </p>

        <Card icon={<User className="h-4 w-4" />} titulo="Cliente">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nome / razão social">
              <input className={inputCls} placeholder="Buscar ou cadastrar cliente" />
            </Campo>
            <Campo label="Telefone / WhatsApp">
              <input className={inputCls} placeholder="(00) 00000-0000" />
            </Campo>
          </div>
        </Card>

        <Card icon={<Smartphone className="h-4 w-4" />} titulo="Equipamento">
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Tipo">
              <input className={inputCls} placeholder="Celular, notebook, videogame…" />
            </Campo>
            <Campo label="Marca">
              <input className={inputCls} placeholder="Marca" />
            </Campo>
            <Campo label="Modelo">
              <input className={inputCls} placeholder="Modelo" />
            </Campo>
          </div>
          <div className="mt-3">
            <Campo label="Defeito relatado">
              <textarea className={inputCls} rows={2} placeholder="O que o cliente relatou?" />
            </Campo>
          </div>
        </Card>

        <Card icon={<ListChecks className="h-4 w-4" />} titulo="Checklist de entrada">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CHECKLIST_PADRAO.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              >
                <span className="truncate text-foreground">{item.label}</span>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-success/50" title="OK" aria-hidden />
                  <span className="h-2.5 w-2.5 rounded-full bg-destructive/40" title="Ruim" aria-hidden />
                  <span className="h-2.5 w-2.5 rounded-full bg-info/40" title="Não testado" aria-hidden />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card icon={<KeyRound className="h-4 w-4" />} titulo="Senha do aparelho">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Tipo de senha">
              <select className={inputCls} defaultValue="numerica">
                <option value="numerica">Numérica / PIN</option>
                <option value="texto">Texto</option>
                <option value="padrao">Padrão (desenho)</option>
              </select>
            </Campo>
            <Campo label="Senha / descrição do padrão">
              <input className={inputCls} placeholder="••••" />
            </Campo>
          </div>
        </Card>

        <footer className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
          <span className="mr-auto text-xs text-muted-foreground">Etapa visual — a criação real fica na Nova OS Enterprise.</span>
          <ButtonV3 variant="outline" type="button" onClick={() => acaoEmConstrucao("Imprimir etiqueta de entrada")}>
            Imprimir etiqueta
          </ButtonV3>
          <ButtonV3 variant="primary" type="button" onClick={abrirNovaOS}>
            <Sparkles className="h-4 w-4" aria-hidden />
            Abrir Nova OS Enterprise
          </ButtonV3>
        </footer>
      </form>
    </SectionShellV3>
  );
}
