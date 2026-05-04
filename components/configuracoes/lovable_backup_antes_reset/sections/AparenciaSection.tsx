"use client";

import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { ThemeCard } from "../components/ThemeCard";

export function AparenciaSection() {
  return (
    <div className="space-y-5">
      <SectionHeader title="Aparência" description="Escolha um dos 4 temas do sistema (compatível com o shell)." />

      <SettingsCard title="Temas" description="A troca de tema é global (aplica no dashboard inteiro).">
        <ThemeCard />
      </SettingsCard>
    </div>
  );
}

