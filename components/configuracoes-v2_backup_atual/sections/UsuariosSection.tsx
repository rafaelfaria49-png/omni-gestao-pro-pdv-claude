"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfigCard } from "../components/ConfigCard";
import { ConfigHeader } from "../components/ConfigHeader";
import { ConfigSection } from "../components/ConfigSection";
import { toastConfigV2Pending } from "../utils/pending-toast";

const MOCK = [
  { name: "Ana Costa", email: "ana@empresa.com", role: "Administrador" },
  { name: "Bruno Lima", email: "bruno@empresa.com", role: "Gerente" },
  { name: "Carla Mendes", email: "carla@empresa.com", role: "Operador" },
];

export function UsuariosSection() {
  return (
    <ConfigSection>
      <ConfigHeader
        title="Usuários e permissões"
        description="Equipa e níveis de acesso (dados de exemplo)."
        right={
          <Button variant="outline" size="lg" className="rounded-xl" onClick={toastConfigV2Pending}>
            Convidar utilizador
          </Button>
        }
      />

      <ConfigCard title="Equipa" description="Lista ilustrativa sem ligação a dados reais.">
        <div className="space-y-3">
          {MOCK.map((u) => (
            <div
              key={u.email}
              className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">{u.name}</p>
                <p className="text-sm text-muted-foreground">{u.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{u.role}</Badge>
                <Button size="sm" variant="outline" className="rounded-lg" onClick={toastConfigV2Pending}>
                  Editar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ConfigCard>
    </ConfigSection>
  );
}
