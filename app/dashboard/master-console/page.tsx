"use client";
import { useState } from "react";
import { Store, Users, Wallet, Command, Search, Bell } from "lucide-react";
import { KpiCard } from "@/components/master-console/KpiCard";
import { StoreList, type Store as StoreType } from "@/components/master-console/StoreList";
import { TeamPanel } from "@/components/master-console/TeamPanel";
import type { ActivityEntry } from "@/components/master-console/ActivityLog";
import type { Employee } from "@/components/master-console/TeamPanel";

const stores: StoreType[] = [
  {
    id: "s1",
    name: "RafaCell Matriz",
    cnpj: "12.345.678/0001-90",
    manager: "Rafael Souza",
    status: "Ativa",
    city: "São Paulo, SP",
  },
  {
    id: "s2",
    name: "RafaCell Shopping Norte",
    cnpj: "12.345.678/0002-70",
    manager: "Marina Costa",
    status: "Ativa",
    city: "São Paulo, SP",
  },
  {
    id: "s3",
    name: "RafaCell Centro",
    cnpj: "12.345.678/0003-51",
    manager: "Bruno Lima",
    status: "Ativa",
    city: "Guarulhos, SP",
  },
  {
    id: "s4",
    name: "RafaCell Outlet",
    cnpj: "12.345.678/0004-32",
    manager: "Camila Rocha",
    status: "Ativa",
    city: "Osasco, SP",
  },
];

const employeesByStore: Record<string, Employee[]> = {
  s1: [
    { id: "e1", name: "Rafael Souza", initials: "RS", role: "Dono" },
    { id: "e2", name: "Marina Costa", initials: "MC", role: "Gerente" },
    { id: "e3", name: "João Pereira", initials: "JP", role: "Operador" },
    { id: "e4", name: "Ana Paula", initials: "AP", role: "Caixa" },
  ],
  s2: [
    { id: "e5", name: "Marina Costa", initials: "MC", role: "Gerente" },
    { id: "e6", name: "Diego Alves", initials: "DA", role: "Operador" },
    { id: "e7", name: "Larissa Nunes", initials: "LN", role: "Caixa" },
  ],
  s3: [
    { id: "e8", name: "Bruno Lima", initials: "BL", role: "Gerente" },
    { id: "e9", name: "Paulo Mendes", initials: "PM", role: "Operador" },
  ],
  s4: [
    { id: "e10", name: "Camila Rocha", initials: "CR", role: "Gerente" },
    { id: "e11", name: "Felipe Dias", initials: "FD", role: "Operador" },
  ],
};

const activityByStore: Record<string, ActivityEntry[]> = {
  s1: [
    {
      id: "a1",
      actorInitials: "RS",
      message: "Rafael alterou permissões da equipe da Matriz.",
      time: "Há 8 minutos",
      type: "permission",
    },
    {
      id: "a2",
      actorInitials: "MC",
      message: "Marina registrou venda de R$ 1.248,90 no PDV.",
      time: "Há 22 minutos",
      type: "create",
    },
    {
      id: "a3",
      actorInitials: "AP",
      message: "Ana Paula realizou fechamento parcial do caixa.",
      time: "Há 1 hora",
      type: "finance",
    },
  ],
  s2: [
    {
      id: "a4",
      actorInitials: "MC",
      message: "Marina aprovou acesso temporário ao Marketing Studio.",
      time: "Há 14 minutos",
      type: "permission",
    },
    {
      id: "a5",
      actorInitials: "DA",
      message: "Diego criou uma venda com garantia estendida.",
      time: "Há 37 minutos",
      type: "create",
    },
  ],
  s3: [
    {
      id: "a6",
      actorInitials: "BL",
      message: "Bruno atualizou estoque de telas iPhone 11.",
      time: "Há 41 minutos",
      type: "stock",
    },
    {
      id: "a7",
      actorInitials: "PM",
      message: "Paulo editou uma ordem de serviço em andamento.",
      time: "Há 2 horas",
      type: "edit",
    },
  ],
  s4: [
    {
      id: "a8",
      actorInitials: "CR",
      message: "Camila realizou login no console da filial.",
      time: "Há 18 minutos",
      type: "login",
    },
    {
      id: "a9",
      actorInitials: "FD",
      message: "Felipe removeu um item duplicado do carrinho.",
      time: "Há 49 minutos",
      type: "delete",
    },
  ],
};

const MasterConsolePage = () => {
  const [selectedId, setSelectedId] = useState<string>("s1");
  const selected = stores.find((s) => s.id === selectedId)!;

  return (
    <main className="mx-auto max-w-[1600px] px-6 py-8 animate-fade-in bg-background text-foreground">
      <div className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">Visão geral</p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl text-foreground">Olá, Rafael 👋</h2>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard label="Lojas Ativas" value="4" trend="+1 nos últimos 30 dias" icon={Store} tone="info" />
        <KpiCard label="Total de Colaboradores" value="18" trend="+3 este mês" icon={Users} tone="purple" />
        <KpiCard label="Faturamento Global" value="R$ 145.000,00" icon={Wallet} tone="success" highlight />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        <StoreList stores={stores} selectedId={selectedId} onSelect={setSelectedId} />
        <TeamPanel key={selected.id} store={selected} employees={employeesByStore[selected.id] ?? []} activity={activityByStore[selected.id] ?? []} />
      </div>
    </main>
  );
};
export default MasterConsolePage;
