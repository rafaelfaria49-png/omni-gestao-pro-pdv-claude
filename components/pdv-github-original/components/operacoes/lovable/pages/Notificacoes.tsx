import { OperacoesLayout } from "@/components/operacoes/OperacoesLayout";
import { Bell, Mail, MessageSquare, Smartphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

const EVENTOS = [
  { id: "os_criada", label: "OS criada" },
  { id: "orcamento_enviado", label: "Orçamento enviado" },
  { id: "orcamento_aprovado", label: "Orçamento aprovado" },
  { id: "aparelho_pronto", label: "Aparelho pronto" },
  { id: "garantia_iniciada", label: "Garantia iniciada" },
  { id: "garantia_vencendo", label: "Garantia vencendo (7d)" },
  { id: "retorno_garantia", label: "Retorno em garantia" },
];

const CANAIS = [
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { id: "email", label: "E-mail", icon: Mail },
  { id: "interno", label: "Notif. interna", icon: Smartphone },
];

export default function NotificacoesPage() {
  const [config, setConfig] = useState<Record<string, Record<string, boolean>>>(() => {
    const c: Record<string, Record<string, boolean>> = {};
    EVENTOS.forEach((e) => {
      c[e.id] = { whatsapp: true, email: false, interno: true };
    });
    return c;
  });

  return (
    <OperacoesLayout>
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bell className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Notificações automáticas</h1>
          <p className="text-sm text-muted-foreground">Configure quais eventos disparam mensagens em cada canal</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Evento</th>
              {CANAIS.map((c) => (
                <th key={c.id} className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <c.icon className="h-3.5 w-3.5" /> {c.label}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EVENTOS.map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="p-3 font-medium">{e.label}</td>
                {CANAIS.map((c) => (
                  <td key={c.id} className="p-3 text-center">
                    <Switch
                      checked={config[e.id][c.id]}
                      onCheckedChange={(v) =>
                        setConfig((prev) => ({ ...prev, [e.id]: { ...prev[e.id], [c.id]: v } }))
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        ⚠️ As notificações ainda são mockadas. Quando o backend for conectado, cada switch ligará automaticamente o disparo via WhatsApp/E-mail.
      </p>
    </OperacoesLayout>
  );
}
