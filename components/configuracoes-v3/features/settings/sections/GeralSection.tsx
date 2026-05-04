"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import { Input } from "@/components/configuracoes-v3/components/ui/input";
import { Label } from "@/components/configuracoes-v3/components/ui/label";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/configuracoes-v3/components/ui/select";
import { ConfigEmpresaProvider } from "@/lib/config-empresa";
import { LojaAtivaProvider, useLojaAtiva } from "@/lib/loja-ativa";
import { StoreSettingsProvider, useStoreSettings } from "@/lib/store-settings-provider";
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";

type AddressForm = {
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
};

function emptyAddress(): AddressForm {
  return { rua: "", numero: "", bairro: "", cidade: "", estado: "", cep: "" };
}

function parseAddress(raw: unknown): AddressForm {
  const base = emptyAddress();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const pick = (k: keyof AddressForm) => String(o[k] ?? "").trim();
  return {
    rua: pick("rua"),
    numero: pick("numero"),
    bairro: pick("bairro"),
    cidade: pick("cidade"),
    estado: pick("estado"),
    cep: pick("cep"),
  };
}

type FormSnapshot = {
  nomeFantasia: string;
  cnpj: string;
  telefone: string;
  email: string;
  whatsapp: string;
  whatsappDono: string;
  address: AddressForm;
};

function emptyFormSnapshot(): FormSnapshot {
  return {
    nomeFantasia: "",
    cnpj: "",
    telefone: "",
    email: "",
    whatsapp: "",
    whatsappDono: "",
    address: emptyAddress(),
  };
}

function GeralSectionContent() {
  const { toast } = useToast();
  const { lojaAtivaId, refreshStoresList } = useLojaAtiva();
  const { refresh: refreshStoreSettings } = useStoreSettings();

  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle");
  const [saving, setSaving] = useState(false);
  const [snapshot, setSnapshot] = useState<FormSnapshot | null>(null);

  const [nomeFantasia, setNomeFantasia] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [whatsappDono, setWhatsappDono] = useState("");
  const [address, setAddress] = useState<AddressForm>(() => emptyAddress());

  const [moeda, setMoeda] = useState("brl");
  const [fuso, setFuso] = useState("br-sp");

  const applySnapshot = useCallback((s: FormSnapshot) => {
    setNomeFantasia(s.nomeFantasia);
    setCnpj(s.cnpj);
    setTelefone(s.telefone);
    setEmail(s.email);
    setWhatsapp(s.whatsapp);
    setWhatsappDono(s.whatsappDono);
    setAddress(s.address);
  }, []);

  useEffect(() => {
    if (!lojaAtivaId) {
      setLoadState("idle");
      setSnapshot(null);
      applySnapshot(emptyFormSnapshot());
      return;
    }

    let cancelled = false;
    setLoadState("loading");
    setSnapshot(null);
    applySnapshot(emptyFormSnapshot());
    void (async () => {
      try {
        const [rStore, rSettings] = await Promise.all([
          fetch(`/api/stores/${encodeURIComponent(lojaAtivaId)}`, { credentials: "include", cache: "no-store" }),
          fetch(`/api/stores/${encodeURIComponent(lojaAtivaId)}/settings`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);
        const jStore = (await rStore.json().catch(() => ({}))) as { store?: Record<string, unknown> | null };
        const jSettings = (await rSettings.json().catch(() => ({}))) as { settings?: Record<string, unknown> | null };
        if (cancelled) return;
        const s = jStore.store ?? {};
        const st = jSettings.settings ?? {};
        const next: FormSnapshot = {
          nomeFantasia: String(s.name ?? ""),
          cnpj: String(s.cnpj ?? ""),
          telefone: String(s.phone ?? ""),
          email: String(st.contactEmail ?? ""),
          whatsapp: String(st.contactWhatsapp ?? ""),
          whatsappDono: String(st.contactWhatsappDono ?? ""),
          address: parseAddress(s.address),
        };
        setSnapshot(next);
        applySnapshot(next);
        setLoadState("idle");
      } catch {
        if (!cancelled) {
          setLoadState("error");
          toast({
            title: "Não foi possível carregar",
            description: "Verifique sua conexão e tente abrir a aba novamente.",
            variant: "destructive",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lojaAtivaId, applySnapshot]);

  const handleCancel = () => {
    if (snapshot) applySnapshot(snapshot);
  };

  const handleSave = async () => {
    const nomeTrim = nomeFantasia.trim();
    if (!nomeTrim) {
      toast({
        title: "Nome obrigatório",
        description: "Preencha o nome da empresa para identificar a unidade.",
        variant: "destructive",
      });
      return;
    }
    if (!lojaAtivaId) {
      toast({
        title: "Nenhuma unidade ativa",
        description: "Defina a unidade ativa na seção Lojas e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    const lojaHeader = lojaAtivaId.trim();
    setSaving(true);
    try {
      const storeRes = await fetch(`/api/stores/${encodeURIComponent(lojaHeader)}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          [ASSISTEC_LOJA_HEADER]: lojaHeader,
        },
        body: JSON.stringify({
          name: nomeTrim,
          cnpj: cnpj.trim(),
          phone: telefone.trim(),
          address,
        }),
      });
      if (!storeRes.ok) {
        const err = (await storeRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `Falha ao salvar unidade (HTTP ${storeRes.status})`);
      }

      const settingsRes = await fetch(`/api/stores/${encodeURIComponent(lojaHeader)}/settings`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          [ASSISTEC_LOJA_HEADER]: lojaHeader,
        },
        body: JSON.stringify({
          contactEmail: email.trim(),
          contactWhatsapp: whatsapp.trim(),
          contactWhatsappDono: whatsappDono.trim(),
        }),
      });
      if (!settingsRes.ok) {
        const err = (await settingsRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `Falha ao salvar contatos (HTTP ${settingsRes.status})`);
      }

      const next: FormSnapshot = {
        nomeFantasia: nomeTrim,
        cnpj: cnpj.trim(),
        telefone: telefone.trim(),
        email: email.trim(),
        whatsapp: whatsapp.trim(),
        whatsappDono: whatsappDono.trim(),
        address: { ...address },
      };
      setSnapshot(next);
      void refreshStoreSettings();
      void refreshStoresList();
      toast({ title: "Salvo", description: "Dados da empresa atualizados para a unidade ativa." });
    } catch (e) {
      toast({
        title: "Falha ao salvar",
        description: e instanceof Error ? e.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const busy = loadState === "loading" || saving;
  const noLoja = !lojaAtivaId;

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Settings className="h-5 w-5" />}
        title="Geral"
        description="Informações da empresa e preferências regionais."
      />

      {noLoja ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma unidade ativa. Abra a seção <span className="font-medium text-foreground">Lojas</span> e selecione
          uma unidade para editar os dados gerais.
        </p>
      ) : null}

      <SettingsCard
        title="Dados da empresa"
        description="Aparecem em recibos, notas e relatórios."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={handleCancel} disabled={busy || !snapshot}>
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
            onChange={(e) => setNomeFantasia(e.target.value)}
            placeholder="Minha Empresa LTDA"
            disabled={busy || noLoja}
          />
          <Field
            label="CNPJ"
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value)}
            placeholder="00.000.000/0001-00"
            disabled={busy || noLoja}
          />
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contato@empresa.com"
            disabled={busy || noLoja}
          />
          <Field
            label="Telefone"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(00) 00000-0000"
            disabled={busy || noLoja}
          />
          <Field
            label="WhatsApp (loja)"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="(00) 00000-0000"
            disabled={busy || noLoja}
          />
          <Field
            label="WhatsApp (responsável)"
            value={whatsappDono}
            onChange={(e) => setWhatsappDono(e.target.value)}
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
              onChange={(e) => setAddress((a) => ({ ...a, rua: e.target.value }))}
              disabled={busy || noLoja}
            />
            <Field
              label="Número"
              value={address.numero}
              onChange={(e) => setAddress((a) => ({ ...a, numero: e.target.value }))}
              disabled={busy || noLoja}
            />
            <Field
              label="Bairro"
              value={address.bairro}
              onChange={(e) => setAddress((a) => ({ ...a, bairro: e.target.value }))}
              disabled={busy || noLoja}
            />
            <Field
              label="Cidade"
              value={address.cidade}
              onChange={(e) => setAddress((a) => ({ ...a, cidade: e.target.value }))}
              disabled={busy || noLoja}
            />
            <Field
              label="Estado"
              value={address.estado}
              onChange={(e) => setAddress((a) => ({ ...a, estado: e.target.value }))}
              disabled={busy || noLoja}
            />
            <Field
              label="CEP"
              value={address.cep}
              onChange={(e) => setAddress((a) => ({ ...a, cep: e.target.value }))}
              disabled={busy || noLoja}
            />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Preferências regionais"
        description="Configuração visual — ainda não salva no sistema."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Moeda</Label>
            <Select value={moeda} onValueChange={setMoeda} disabled>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="brl">Real (R$)</SelectItem>
                <SelectItem value="usd">Dólar (US$)</SelectItem>
                <SelectItem value="eur">Euro (€)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fuso horário</Label>
            <Select value={fuso} onValueChange={setFuso} disabled>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="br-sp">América/São Paulo (GMT-3)</SelectItem>
                <SelectItem value="br-mn">América/Manaus (GMT-4)</SelectItem>
                <SelectItem value="utc">UTC</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}

function Field({ label, ...rest }: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input {...rest} />
    </div>
  );
}

/** Mesma pilha de multiloja do dashboard + cache de settings da unidade ativa. */
export function GeralSection() {
  return (
    <ConfigEmpresaProvider>
      <LojaAtivaProvider>
        <StoreSettingsProvider>
          <GeralSectionContent />
        </StoreSettingsProvider>
      </LojaAtivaProvider>
    </ConfigEmpresaProvider>
  );
}
