"use client";
import { useId } from "react";
import { Settings } from "lucide-react";
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { SettingsCardSkeleton } from "../components/SettingsCardSkeleton";
import { SettingsSoonBadge } from "../components/SettingsSoonBadge";
import { Input } from "@/components/configuracoes-v3/components/ui/input";
import { Label } from "@/components/configuracoes-v3/components/ui/label";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/configuracoes-v3/components/ui/select";
import { useLojaAtiva } from "@/lib/loja-ativa";
import { useStoreSettings } from "@/lib/store-settings-provider";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";
import { GoLiveChecklistRafaCell } from "../components/GoLiveChecklistRafaCell";
import { BusinessResourcesCard } from "../components/BusinessResourcesCard";
import { parseStoreBasics } from "@/lib/store-basics";
import { useStoreBasics, useStoreBasicsScope } from "@/lib/use-store-basics";

function GeralSectionContent({ storeId }: { storeId: string }) {
  const permissions = useEnterprisePermissions();
  const { toast } = useToast();
  const { refreshStoresList } = useLojaAtiva();
  const { refresh: refreshStoreSettings } = useStoreSettings();
  const editor = useStoreBasics(storeId);
  const { name: nomeFantasia, cnpj, phone: telefone, contactEmail: email, contactWhatsapp: whatsapp, contactWhatsappDono: whatsappDono, address } = editor.draft ?? parseStoreBasics({}, {});
  const { saving } = editor;
  const loadState = editor.loading ? "loading" : !editor.draft ? "error" : "idle";
  const busy = editor.loading || saving;
  const noLoja = !storeId;
  const handleCancel = editor.cancel;
  const handleSave = async () => {
    if (!await editor.save()) return;
    void refreshStoreSettings();
    void refreshStoresList();
    toast({ title: "Salvo", description: "Dados da empresa salvos e conferidos para esta unidade." });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Settings className="h-5 w-5" />}
        title="Geral"
        description="Dados da unidade, contatos, ramo e recursos utilizados. Revise e salve cada bloco para a unidade ativa."
      />

      <BusinessResourcesCard />
      {editor.message && <p role="status" className="text-sm">{editor.message}</p>}

      {permissions?.platformAuthority && <GoLiveChecklistRafaCell
        empresa={{
          nomeFantasia,
          cnpj,
          telefone,
          email,
          whatsapp,
        }}
      />}

      {noLoja ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Nenhuma unidade ativa. Abra a seção <span className="font-medium text-foreground">Lojas</span> e selecione
          uma unidade para editar os dados gerais.
        </p>
      ) : null}

      {loadState === "loading" ? (
        <>
          <SettingsCardSkeleton rows={4} />
          <SettingsCardSkeleton rows={2} />
        </>
      ) : null}

      {loadState === "error" ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Não foi possível carregar os dados da unidade. Recarregue a página ou troque a unidade ativa.
        </p>
      ) : null}

      {loadState !== "loading" && loadState !== "error" ? (
      <>
      <SettingsCard
        title="Dados da empresa"
        description="Aparecem em recibos, notas e relatórios."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={handleCancel} disabled={busy || !editor.draft}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={busy || noLoja}>
              {saving ? "Salvando…" : "Salvar alterações"}
            </Button>
          </>
        }
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="Nome da empresa"
            value={nomeFantasia}
            onChange={(e) => editor.setField("name", e.target.value)}
            placeholder="Minha Empresa LTDA"
            disabled={busy || noLoja}
          />
          <Field
            label="CNPJ"
            value={cnpj}
            onChange={(e) => editor.setField("cnpj", e.target.value)}
            placeholder="00.000.000/0001-00"
            disabled={busy || noLoja}
          />
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={(e) => editor.setField("contactEmail", e.target.value)}
            placeholder="contato@empresa.com"
            disabled={busy || noLoja}
          />
          <Field
            label="Telefone"
            value={telefone}
            onChange={(e) => editor.setField("phone", e.target.value)}
            placeholder="(00) 00000-0000"
            disabled={busy || noLoja}
          />
          <Field
            label="WhatsApp (loja)"
            value={whatsapp}
            onChange={(e) => editor.setField("contactWhatsapp", e.target.value)}
            placeholder="(00) 00000-0000"
            disabled={busy || noLoja}
          />
          <Field
            label="WhatsApp (responsável)"
            value={whatsappDono}
            onChange={(e) => editor.setField("contactWhatsappDono", e.target.value)}
            placeholder="(00) 00000-0000"
            disabled={busy || noLoja}
          />
        </div>

        <div className="mt-6 space-y-3">
          <p className="text-sm font-medium text-foreground">Endereço</p>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              label="Rua"
              value={address.rua}
              onChange={(e) => editor.setAddressField("rua", e.target.value)}
              disabled={busy || noLoja}
            />
            <Field
              label="Número"
              value={address.numero}
              onChange={(e) => editor.setAddressField("numero", e.target.value)}
              disabled={busy || noLoja}
            />
            <Field
              label="Bairro"
              value={address.bairro}
              onChange={(e) => editor.setAddressField("bairro", e.target.value)}
              disabled={busy || noLoja}
            />
            <Field
              label="Cidade"
              value={address.cidade}
              onChange={(e) => editor.setAddressField("cidade", e.target.value)}
              disabled={busy || noLoja}
            />
            <Field
              label="Estado"
              value={address.estado}
              onChange={(e) => editor.setAddressField("estado", e.target.value)}
              disabled={busy || noLoja}
            />
            <Field
              label="CEP"
              value={address.cep}
              onChange={(e) => editor.setAddressField("cep", e.target.value)}
              disabled={busy || noLoja}
            />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Preferências regionais"
        description="Integração futura — moeda e fuso não são persistidos; o sistema usa Real (BRL) e fuso do navegador/servidor."
        headerExtra={<SettingsSoonBadge />}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Moeda (somente leitura)</Label>
            <Select value="brl" disabled>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="brl">Real (R$) — padrão operacional</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fuso horário (somente leitura)</Label>
            <Select value="br-sp" disabled>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="br-sp">América/São Paulo (GMT-3) — padrão sugerido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Não altere esperando gravar: os selects estão desabilitados até existir campo em Store/StoreSettings.
        </p>
      </SettingsCard>
      </>
      ) : null}
    </div>
  );
}

function Field({ label, ...rest }: { label: string } & React.ComponentProps<typeof Input>) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...rest} />
    </div>
  );
}

/** Usa `AppOpsProviders` do dashboard — sem providers duplicados. */
export function GeralSection() {
  const { storeId, scope } = useStoreBasicsScope();
  return <GeralSectionContent key={scope} storeId={storeId} />;
}
