"use client"

import { useEffect, useMemo, useState } from "react"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { resolveLojaIdParaConsultaClientes } from "@/lib/clientes-loja-resolve"
import { useLojaAtiva } from "@/lib/loja-ativa"
import {
  Search,
  Filter,
  Plus,
  Users,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  ChevronDown,
  MoreHorizontal,
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  CreditCard,
  Tag,
  Activity,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Info,
  Check,
  Building,
  UserCheck,
  Trash2,
  Pencil,
  FileText,
  HelpCircle
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatPhoneBrInput, isValidPhoneBr } from "@/lib/phone-br"
import { useToast } from "@/hooks/use-toast"
import { EmptyState } from "@/components/ui/states/EmptyState"
import { LoadingState } from "@/components/ui/states/LoadingState"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type ClienteRow = {
  id: string
  name: string
  phone: string
  email: string
  kind: string
  document: string
  city: string
  tags: any
  active: boolean
  totalSpent: number
  lastPurchaseAt: string | null
  createdAt: string
}

function formatDateBr(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("pt-BR", { year: "numeric", month: "2-digit", day: "2-digit" })
}

function displayPhone(raw: string | null) {
  if (!raw?.trim()) return "-"
  return formatPhoneBrInput(raw)
}

function formatCpfCnpj(val: string) {
  const clean = val.replace(/\D/g, "")
  if (clean.length <= 11) {
    return clean
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
  }
  return clean
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2")
}

function formatCep(val: string) {
  const clean = val.replace(/\D/g, "")
  if (clean.length <= 8) {
    return clean.replace(/(\d{5})(\d{1,3})$/, "$1-$2")
  }
  return clean.substring(0, 8).replace(/(\d{5})(\d{3})$/, "$1-$2")
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val)
}

const toastRafacell = {
  className: "border-red-600/45 bg-zinc-950 text-white shadow-xl shadow-red-900/20",
  duration: 4000,
}

async function fetchClientes(q: string, lojaId: string): Promise<ClienteRow[]> {
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""
  const r = await fetch(`/api/clientes${qs}`, {
    cache: "no-store",
    credentials: "include",
    headers: { [ASSISTEC_LOJA_HEADER]: lojaId },
  })
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error || `HTTP ${r.status}`)
  }
  const j = (await r.json()) as {
    clientes: Array<any>
  }
  return j.clientes.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone ?? "",
    email: c.email ?? "",
    kind: c.kind ?? "PF",
    document: c.document ?? "",
    city: c.city ?? "",
    tags: c.tags,
    active: c.active !== false,
    totalSpent: c.totalSpent ?? 0,
    lastPurchaseAt: c.lastPurchaseAt ? new Date(c.lastPurchaseAt).toISOString() : null,
    createdAt: typeof c.createdAt === "string" ? c.createdAt : new Date(c.createdAt).toISOString(),
  }))
}

async function fetchClienteDetails(id: string, lojaId: string): Promise<any> {
  const r = await fetch(`/api/clientes/${encodeURIComponent(id)}`, {
    cache: "no-store",
    credentials: "include",
    headers: { [ASSISTEC_LOJA_HEADER]: lojaId },
  })
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error || `HTTP ${r.status}`)
  }
  return await r.json()
}

async function createCliente(lojaId: string, payload: any): Promise<void> {
  const r = await fetch("/api/clientes", {
    method: "POST",
    headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: lojaId },
    credentials: "include",
    body: JSON.stringify(payload),
  })
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error || `HTTP ${r.status}`)
  }
}

async function updateCliente(lojaId: string, id: string, payload: any): Promise<void> {
  const r = await fetch(`/api/clientes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: lojaId },
    credentials: "include",
    body: JSON.stringify(payload),
  })
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error || `HTTP ${r.status}`)
  }
}

async function deleteCliente(lojaId: string, id: string): Promise<void> {
  const r = await fetch(`/api/clientes/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
    headers: { [ASSISTEC_LOJA_HEADER]: lojaId },
  })
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error || `HTTP ${r.status}`)
  }
}

export default function DashboardClientesPage() {
  const { lojaAtivaId } = useLojaAtiva()
  const lojaHeader = useMemo(() => resolveLojaIdParaConsultaClientes(lojaAtivaId), [lojaAtivaId])
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [rows, setRows] = useState<ClienteRow[]>([])

  // Busca e Filtros
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [filterKind, setFilterKind] = useState<string>("ALL") // ALL, PF, PJ
  const [filterStatus, setFilterStatus] = useState<string>("ALL") // ALL, ACTIVE, INACTIVE
  const [filterVip, setFilterVip] = useState<boolean>(false)
  const [filterInadimplente, setFilterInadimplente] = useState<boolean>(false)
  const [filterCity, setFilterCity] = useState<string>("ALL")

  // Controladores de gavetas
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create")
  const [editingId, setEditingId] = useState<string | null>(null)
  
  // Abas do formulário
  const [formActiveTab, setFormActiveTab] = useState<"main" | "contact" | "address" | "financial" | "operational">("main")

  // Estados do Formulário
  const [name, setName] = useState("")
  const [kind, setKind] = useState("PF")
  const [document, setDocument] = useState("")
  const [rgIe, setRgIe] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [gender, setGender] = useState("")
  const [phone, setPhone] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [email, setEmail] = useState("")
  const [phoneSecondary, setPhoneSecondary] = useState("")
  const [cep, setCep] = useState("")
  const [street, setStreet] = useState("")
  const [number, setNumber] = useState("")
  const [neighborhood, setNeighborhood] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [complement, setComplement] = useState("")
  const [reference, setReference] = useState("")
  const [creditLimit, setCreditLimit] = useState<number>(0)
  const [permitsFiado, setPermitsFiado] = useState(false)
  const [notesFinancial, setNotesFinancial] = useState("")
  const [inadimplente, setInadimplente] = useState(false)
  const [carteiraPadrao, setCarteiraPadrao] = useState("")
  const [notesOperational, setNotesOperational] = useState("")
  const [clientTags, setClientTags] = useState("")
  const [source, setSource] = useState("")
  const [tecnicoResponsavel, setTecnicoResponsavel] = useState("")
  const [vip, setVip] = useState(false)
  const [active, setActive] = useState(true)
  const [totalSpent, setTotalSpent] = useState<number>(0)

  // Gaveta de Perfil do Cliente
  const [profileOpen, setProfileOpen] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileData, setProfileData] = useState<any>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileActiveTab, setProfileActiveTab] = useState<"history" | "details" | "timeline">("history")

  // Modal de Exclusão
  const [deleteTarget, setDeleteTarget] = useState<ClienteRow | null>(null)

  // Carregar dados
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setListError(null)
    fetchClientes(query, lojaHeader)
      .then((data) => {
        if (cancelled) return
        setRows(data)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setListError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [query, lojaHeader])

  // Monitoramento do CEP
  useEffect(() => {
    const cleanCep = cep.replace(/\D/g, "")
    if (cleanCep.length === 8) {
      void fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
        .then((res) => {
          if (res.ok) return res.json()
          throw new Error("CEP não encontrado")
        })
        .then((data) => {
          if (data && !data.erro) {
            setStreet(data.logradouro || "")
            setNeighborhood(data.bairro || "")
            setCity(data.localidade || "")
            setState(data.uf || "")
            toast({
              title: "Endereço localizado",
              description: `${data.logradouro}, ${data.bairro}`,
              duration: 3000,
            })
          }
        })
        .catch(() => {})
    }
  }, [cep])

  // Filtragem local
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      // Filtro tipo
      if (filterKind !== "ALL" && r.kind !== filterKind) return false
      
      // Filtro status
      if (filterStatus !== "ALL") {
        const isActive = r.active !== false
        if (filterStatus === "ACTIVE" && !isActive) return false
        if (filterStatus === "INACTIVE" && isActive) return false
      }

      // Parse tags
      let tagsObj: any = {}
      try {
        if (r.tags) {
          tagsObj = typeof r.tags === "string" ? JSON.parse(r.tags) : r.tags
        }
      } catch (e) {}

      // Filtro VIP
      if (filterVip) {
        const isVip = r.tags && (tagsObj.operational?.vip === true || tagsObj.labels?.includes("VIP"))
        if (!isVip) return false
      }

      // Filtro Inadimplente
      if (filterInadimplente) {
        const isInadimplente = r.tags && (tagsObj.financial?.inadimplente === true || tagsObj.labels?.includes("Inadimplente"))
        if (!isInadimplente) return false
      }

      // Filtro Cidade
      if (filterCity !== "ALL" && r.city !== filterCity) return false

      return true
    })
  }, [rows, filterKind, filterStatus, filterVip, filterInadimplente, filterCity])

  // Cidades únicas para filtros
  const uniqueCities = useMemo(() => {
    const cities = new Set<string>()
    rows.forEach((r) => {
      if (r.city?.trim()) cities.add(r.city.trim())
    })
    return Array.from(cities)
  }, [rows])

  // Cálculos de KPIs baseados na listagem ativa
  const kpis = useMemo(() => {
    const total = rows.length
    const ativos = rows.filter((r) => r.active !== false).length
    
    // Novos nos últimos 30 dias
    const trintaDiasAtras = new Date()
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30)
    const novos = rows.filter((r) => {
      const cr = new Date(r.createdAt)
      return cr >= trintaDiasAtras
    }).length

    // Inadimplentes
    const inadimplentesCount = rows.filter((r) => {
      try {
        if (!r.tags) return false
        const t = typeof r.tags === "string" ? JSON.parse(r.tags) : r.tags
        return t?.financial?.inadimplente === true || t?.labels?.includes("Inadimplente")
      } catch (e) {
        return false
      }
    }).length

    // Ticket Médio
    const spent = rows.map((r) => r.totalSpent || 0).filter((s) => s > 0)
    const avgSpent = spent.length > 0 ? spent.reduce((a, b) => a + b, 0) / spent.length : 0

    return { total, ativos, novos, inadimplentes: inadimplentesCount, ticketMedio: avgSpent }
  }, [rows])

  const canSubmit =
    name.trim().length > 0 && phone.trim().length > 0 && isValidPhoneBr(phone) && !submitting

  // Formulário - Abrir Nova Inclusão
  const openCreateDrawer = () => {
    setFormError(null)
    setDrawerMode("create")
    setEditingId(null)
    setFormActiveTab("main")
    
    // Reset campos
    setName("")
    setKind("PF")
    setDocument("")
    setRgIe("")
    setBirthDate("")
    setGender("")
    setPhone("")
    setWhatsapp("")
    setEmail("")
    setPhoneSecondary("")
    setCep("")
    setStreet("")
    setNumber("")
    setNeighborhood("")
    setCity("")
    setState("")
    setComplement("")
    setReference("")
    setCreditLimit(0)
    setPermitsFiado(false)
    setNotesFinancial("")
    setInadimplente(false)
    setCarteiraPadrao("")
    setNotesOperational("")
    setClientTags("")
    setSource("")
    setTecnicoResponsavel("")
    setVip(false)
    setActive(true)
    setTotalSpent(0)
    
    setDrawerOpen(true)
  }

  // Formulário - Abrir Edição
  const openEditDrawer = (row: ClienteRow) => {
    setFormError(null)
    setDrawerMode("edit")
    setEditingId(row.id)
    setFormActiveTab("main")

    setName(row.name)
    setPhone(formatPhoneBrInput(row.phone || ""))
    setEmail(row.email?.trim() ?? "")
    setKind(row.kind || "PF")
    setDocument(row.document || "")
    setCity(row.city || "")
    setActive(row.active !== false)
    setTotalSpent(row.totalSpent || 0)

    // Desestruturar dados estruturados da coluna tags
    let tagsObj: any = {}
    try {
      if (row.tags) {
        tagsObj = typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags
      }
    } catch (e) {
      console.error("Erro no parse de tags do cliente", e)
    }

    if (Array.isArray(tagsObj)) {
      setClientTags(tagsObj.join(", "))
      setRgIe("")
      setBirthDate("")
      setGender("")
      setWhatsapp("")
      setPhoneSecondary("")
      setCep("")
      setStreet("")
      setNumber("")
      setNeighborhood("")
      setState("")
      setComplement("")
      setReference("")
      setCreditLimit(0)
      setPermitsFiado(false)
      setNotesFinancial("")
      setInadimplente(false)
      setCarteiraPadrao("")
      setNotesOperational("")
      setSource("")
      setTecnicoResponsavel("")
      setVip(false)
    } else {
      const labels = Array.isArray(tagsObj.labels) ? tagsObj.labels.join(", ") : (typeof tagsObj.labels === "string" ? tagsObj.labels : "")
      setClientTags(labels)
      setRgIe(tagsObj.rg_ie || "")
      setBirthDate(tagsObj.birthDate || "")
      setGender(tagsObj.gender || "")
      setWhatsapp(tagsObj.whatsapp ? formatPhoneBrInput(tagsObj.whatsapp) : "")
      setPhoneSecondary(tagsObj.phoneSecondary ? formatPhoneBrInput(tagsObj.phoneSecondary) : "")
      
      const addr = tagsObj.address || {}
      setCep(addr.cep || "")
      setStreet(addr.street || "")
      setNumber(addr.number || "")
      setNeighborhood(addr.neighborhood || "")
      setState(addr.state || "")
      setComplement(addr.complement || "")
      setReference(addr.reference || "")
      
      const fin = tagsObj.financial || {}
      setCreditLimit(fin.creditLimit || 0)
      setPermitsFiado(fin.permitsFiado || false)
      setNotesFinancial(fin.notes || "")
      setInadimplente(fin.inadimplente || false)
      setCarteiraPadrao(fin.carteiraPadrao || "")
      
      const oper = tagsObj.operational || {}
      setNotesOperational(oper.notes || "")
      setSource(oper.source || "")
      setTecnicoResponsavel(oper.tecnicoResponsavel || "")
      setVip(oper.vip || false)
    }

    setDrawerOpen(true)
  }

  // Perfil do Cliente - Abrir Gaveta e Buscar Dados Reais da API
  const openProfileDrawer = (clientId: string) => {
    setSelectedProfileId(clientId)
    setProfileLoading(true)
    setProfileError(null)
    setProfileData(null)
    setProfileActiveTab("history")
    setProfileOpen(true)

    fetchClienteDetails(clientId, lojaHeader)
      .then((data) => {
        setProfileData(data.cliente)
      })
      .catch((err) => {
        setProfileError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        setProfileLoading(false)
      })
  }

  const reload = async () => {
    setLoading(true)
    try {
      const data = await fetchClientes(query, lojaHeader)
      setRows(data)
      setListError(null)
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  // Enviar formulário de Inclusão/Edição
  const submit = async () => {
    const n = name.trim()
    const p = phone.trim()
    const e = email.trim()
    
    if (!n) {
      setFormError('O campo "Nome" é obrigatório.')
      return
    }
    if (!p) {
      setFormError('O campo "Telefone" é obrigatório.')
      return
    }
    if (!isValidPhoneBr(p)) {
      setFormError("Informe um telefone válido com DDD (10 ou 11 dígitos).")
      return
    }

    setSubmitting(true)
    setFormError(null)

    // Formatar tags digitadas separadas por vírgula
    const labelsArray = clientTags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    // Incluir tags automáticas operacionais
    if (vip && !labelsArray.includes("VIP")) labelsArray.push("VIP")
    if (inadimplente && !labelsArray.includes("Inadimplente")) labelsArray.push("Inadimplente")

    // Estruturar dados extras no payload tags
    const payloadTags = {
      labels: labelsArray,
      rg_ie: rgIe.trim(),
      birthDate: birthDate,
      gender: gender,
      whatsapp: whatsapp.trim(),
      phoneSecondary: phoneSecondary.trim(),
      address: {
        cep: cep.trim(),
        street: street.trim(),
        number: number.trim(),
        neighborhood: neighborhood.trim(),
        state: state.trim(),
        complement: complement.trim(),
        reference: reference.trim(),
      },
      financial: {
        creditLimit: creditLimit,
        permitsFiado: permitsFiado,
        notes: notesFinancial.trim(),
        inadimplente: inadimplente,
        carteiraPadrao: carteiraPadrao,
      },
      operational: {
        notes: notesOperational.trim(),
        source: source,
        tecnicoResponsavel: tecnicoResponsavel,
        vip: vip,
      },
    }

    const payload = {
      name: n,
      phone: p,
      email: e || null,
      kind,
      document: document.trim(),
      city: city.trim() || (state.trim() ? `${city.trim()}/${state.trim()}` : ""),
      tags: payloadTags,
      active,
      totalSpent,
    }

    try {
      if (drawerMode === "edit" && editingId) {
        await updateCliente(lojaHeader, editingId, payload)
        toast({
          title: "Cliente atualizado",
          description: `${n} foi salvo com sucesso.`,
          ...toastRafacell,
        })
      } else {
        await createCliente(lojaHeader, payload)
        toast({
          title: "Cliente cadastrado",
          description: `${n} foi adicionado.`,
          ...toastRafacell,
        })
      }
      setDrawerOpen(false)
      await reload()
    } catch (e2) {
      setFormError(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteCliente(lojaHeader, deleteTarget.id)
      toast({
        title: "Cliente excluído",
        description: `${deleteTarget.name} foi removido.`,
        ...toastRafacell,
      })
      setDeleteTarget(null)
      await reload()
    } catch (e2) {
      setDeleteError(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setDeleting(false)
    }
  }

  // Retorna iniciais do nome para o avatar
  const getInitials = (n: string) => {
    const parts = n.trim().split(" ")
    if (parts.length === 0) return "?"
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── CADASTRAL HEADER ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
            Cadastros HUB
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-foreground">
            Clientes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Central enterprise de gerenciamento, histórico financeiro e relatórios de clientes
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateDrawer}
          className="flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-elegant transition-smooth hover:opacity-90 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Novo Cliente
        </button>
      </div>

      {/* ── METRICS CARDS (KPIs) ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="glass-card flex flex-col justify-between rounded-xl p-4 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Total Clientes</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:bg-indigo-500/20">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-foreground">{loading ? "..." : kpis.total}</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">Cadastrados nesta unidade</p>
          </div>
        </div>

        <div className="glass-card flex flex-col justify-between rounded-xl p-4 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Clientes Ativos</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-foreground">{loading ? "..." : kpis.ativos}</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {loading ? "..." : `${((kpis.ativos / (kpis.total || 1)) * 100).toFixed(0)}% do total`}
            </p>
          </div>
        </div>

        <div className="glass-card flex flex-col justify-between rounded-xl p-4 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Novos (30 dias)</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-500 dark:bg-cyan-500/20">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-foreground">{loading ? "..." : kpis.novos}</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">Crescimento da carteira</p>
          </div>
        </div>

        <div className="glass-card flex flex-col justify-between rounded-xl p-4 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Inadimplência</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500 dark:bg-rose-500/20">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-foreground">{loading ? "..." : kpis.inadimplentes}</h3>
            <p className="mt-1 text-[11px] text-rose-500 dark:text-rose-400 font-medium">Bloqueados para fiado</p>
          </div>
        </div>

        <div className="glass-card flex flex-col justify-between rounded-xl p-4 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Ticket Médio</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 dark:bg-amber-500/20">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-foreground">{loading ? "..." : formatCurrency(kpis.ticketMedio)}</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">Faturamento por cliente</p>
          </div>
        </div>
      </div>

      {/* ── TOOLBAR DE BUSCA E FILTROS OPERACIONAIS ── */}
      <div className="rounded-xl border border-border bg-card shadow-card p-4">
        <div className="flex flex-col gap-4">
          {/* Busca Global */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="clientes-busca"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setQuery(search)
                }}
                placeholder="Buscar por nome, CPF/CNPJ, e-mail, telefone..."
                className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setQuery(search)}
                className="h-10 rounded-lg bg-secondary px-4 text-sm font-semibold text-secondary-foreground transition-smooth hover:bg-muted border border-border"
              >
                Buscar
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearch("")
                  setQuery("")
                  setFilterKind("ALL")
                  setFilterStatus("ALL")
                  setFilterVip(false)
                  setFilterInadimplente(false)
                  setFilterCity("ALL")
                }}
                className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-muted-foreground transition-smooth hover:bg-muted"
              >
                Limpar filtros
              </button>
            </div>
          </div>

          {/* Filtros Rápidos */}
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-sm">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">Filtros:</span>
            </div>

            {/* Tipo */}
            <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setFilterKind("ALL")}
                className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-smooth", filterKind === "ALL" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setFilterKind("PF")}
                className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-smooth", filterKind === "PF" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                Pessoa Física
              </button>
              <button
                type="button"
                onClick={() => setFilterKind("PJ")}
                className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-smooth", filterKind === "PJ" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                Pessoa Jurídica
              </button>
            </div>

            {/* Status */}
            <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setFilterStatus("ALL")}
                className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-smooth", filterStatus === "ALL" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                Todos Status
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus("ACTIVE")}
                className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-smooth", filterStatus === "ACTIVE" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                Ativos
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus("INACTIVE")}
                className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-smooth", filterStatus === "INACTIVE" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                Inativos
              </button>
            </div>

            {/* VIP & Inadimplentes switches */}
            <button
              type="button"
              onClick={() => setFilterVip(!filterVip)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-smooth",
                filterVip ? "bg-amber-500/10 border-amber-500/35 text-amber-600 dark:text-amber-400" : "border-border bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              <Sparkles className="h-3 w-3" />
              VIP
            </button>

            <button
              type="button"
              onClick={() => setFilterInadimplente(!filterInadimplente)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-smooth",
                filterInadimplente ? "bg-rose-500/10 border-rose-500/35 text-rose-600 dark:text-rose-400" : "border-border bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              <AlertTriangle className="h-3 w-3" />
              Inadimplentes
            </button>

            {/* Filtrar por Cidade */}
            {uniqueCities.length > 0 && (
              <div className="relative">
                <select
                  value={filterCity}
                  onChange={(e) => setFilterCity(e.target.value)}
                  className="h-7 rounded-lg border border-border bg-background px-3 py-0 text-xs font-medium text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="ALL">Todas as cidades</option>
                  {uniqueCities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* ── TABELA OPERACIONAL ── */}
        {listError ? (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {listError}
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Cliente</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Documento</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Contato</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Localização</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Total Gasto</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Cadastro</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-0">
                    <LoadingState message="Carregando cadastro de clientes..." />
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4">
                    <EmptyState
                      compact
                      title="Nenhum cliente encontrado"
                      description="Ajuste os filtros ou insira um novo registro na base."
                      action={{ label: "Cadastrar Cliente", onClick: openCreateDrawer }}
                    />
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  let tagsObj: any = {}
                  try {
                    if (r.tags) {
                      tagsObj = typeof r.tags === "string" ? JSON.parse(r.tags) : r.tags
                    }
                  } catch (e) {}

                  const isVip = tagsObj.operational?.vip === true || tagsObj.labels?.includes("VIP")
                  const isInadimplente = tagsObj.financial?.inadimplente === true || tagsObj.labels?.includes("Inadimplente")

                  return (
                    <tr key={r.id} className="transition-all hover:bg-muted/30">
                      {/* Cliente Nome/Avatar */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openProfileDrawer(r.id)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs hover:bg-primary/20 transition-smooth"
                          >
                            {getInitials(r.name)}
                          </button>
                          <div>
                            <button
                              type="button"
                              onClick={() => openProfileDrawer(r.id)}
                              className="font-semibold text-foreground hover:underline text-left"
                            >
                              {r.name}
                            </button>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-muted-foreground">{r.email || "Sem e-mail"}</span>
                              {isVip && (
                                <span className="inline-flex items-center rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                                  VIP
                                </span>
                              )}
                              {isInadimplente && (
                                <span className="inline-flex items-center rounded-sm bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-rose-600 dark:text-rose-400">
                                  DÉBITO
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Documento */}
                      <td className="px-4 py-3 text-foreground font-mono text-xs">
                        <div className="flex flex-col">
                          <span>{r.document ? formatCpfCnpj(r.document) : "—"}</span>
                          <span className="text-[10px] text-muted-foreground">{r.kind === "PJ" ? "CNPJ" : "CPF"}</span>
                        </div>
                      </td>

                      {/* Contato com WhatsApp Link */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground">{displayPhone(r.phone)}</span>
                          {r.phone && (
                            <a
                              href={`https://wa.me/55${r.phone.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-smooth"
                              title="Iniciar conversa no WhatsApp"
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Localização */}
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground/60" />
                          <span>{r.city || "—"}</span>
                        </div>
                      </td>

                      {/* Total Gasto */}
                      <td className="px-4 py-3 text-foreground font-semibold">
                        {formatCurrency(r.totalSpent)}
                      </td>

                      {/* Data Cadastro */}
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {formatDateBr(r.createdAt)}
                      </td>

                      {/* Ações Hover Dropdown */}
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-smooth"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 bg-popover text-popover-foreground">
                            <DropdownMenuItem onClick={() => openProfileDrawer(r.id)}>
                              <User className="mr-2 h-4 w-4" />
                              Visualizar Perfil
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditDrawer(r)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar Cadastro
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <a
                                href={`/dashboard/os?clienteId=${r.id}`}
                                className="flex w-full items-center px-2 py-1.5 text-sm"
                              >
                                <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                                Abrir Nova OS
                              </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <a
                                href={`/dashboard/vendas?clienteId=${r.id}`}
                                className="flex w-full items-center px-2 py-1.5 text-sm"
                              >
                                <DollarSign className="mr-2 h-4 w-4 text-muted-foreground" />
                                Iniciar Venda (PDV)
                              </a>
                            </DropdownMenuItem>
                            {r.phone && (
                              <DropdownMenuItem asChild>
                                <a
                                  href={`https://wa.me/55${r.phone.replace(/\D/g, "")}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex w-full items-center px-2 py-1.5 text-sm"
                                >
                                  <Phone className="mr-2 h-4 w-4 text-emerald-500" />
                                  Chamar no WhatsApp
                                </a>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => {
                                setDeleteError(null)
                                setDeleteTarget(r)
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir Cliente
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── GAVETA LATERAL: CADASTRO / EDIÇÃO ── */}
      <Sheet open={drawerOpen} onOpenChange={(open) => !open && !submitting && setDrawerOpen(false)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto scroll-elegant border-l border-border bg-card/95 backdrop-blur-md p-0 flex flex-col h-full">
          <SheetHeader className="p-6 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2 text-primary">
              <User className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-wider">Enterprise Módulo</span>
            </div>
            <SheetTitle className="text-xl font-bold text-foreground">
              {drawerMode === "edit" ? "Atualizar Ficha Cadastral" : "Cadastrar Novo Cliente"}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground mt-1">
              {drawerMode === "edit"
                ? "Edite as informações detalhadas nas abas abaixo para manter os dados atualizados."
                : "Insira os dados cadastrais estruturados. Preencha todas as abas operacionais se necessário."}
            </SheetDescription>
          </SheetHeader>

          {/* Abas Internas do Formulário */}
          <div className="flex border-b border-border bg-muted/40 p-1 gap-1">
            {(["main", "contact", "address", "financial", "operational"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFormActiveTab(tab)}
                className={cn(
                  "flex-1 py-2 text-xs font-semibold rounded-lg transition-smooth border border-transparent",
                  formActiveTab === tab
                    ? "bg-card text-foreground shadow-sm border-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {tab === "main" && "Principal"}
                {tab === "contact" && "Contatos"}
                {tab === "address" && "Endereço"}
                {tab === "financial" && "Financeiro"}
                {tab === "operational" && "Operacional"}
              </button>
            ))}
          </div>

          <div className="flex-1 p-6 space-y-4">
            {formError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                {formError}
              </div>
            ) : null}

            {/* ABA 1: PRINCIPAL */}
            {formActiveTab === "main" && (
              <div className="space-y-4 animate-fade-in">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="form-kind" className="text-xs font-semibold text-muted-foreground">
                      Tipo de Pessoa
                    </label>
                    <select
                      id="form-kind"
                      value={kind}
                      onChange={(e) => setKind(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="PF">Pessoa Física (PF)</option>
                      <option value="PJ">Pessoa Jurídica (PJ)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="form-doc" className="text-xs font-semibold text-muted-foreground">
                      {kind === "PJ" ? "CNPJ" : "CPF"}
                    </label>
                    <input
                      id="form-doc"
                      value={document}
                      onChange={(e) => setDocument(formatCpfCnpj(e.target.value))}
                      placeholder={kind === "PJ" ? "00.000.000/0000-00" : "000.000.000-00"}
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="form-name" className="text-xs font-semibold text-muted-foreground">
                    Nome Completo / Razão Social <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="form-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: João da Silva ou RafaCell LTDA"
                    className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="form-rgie" className="text-xs font-semibold text-muted-foreground">
                      {kind === "PJ" ? "Inscrição Estadual (IE)" : "RG"}
                    </label>
                    <input
                      id="form-rgie"
                      value={rgIe}
                      onChange={(e) => setRgIe(e.target.value)}
                      placeholder="Isento ou Nº do documento"
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <div>
                    <label htmlFor="form-birth" className="text-xs font-semibold text-muted-foreground">
                      Data de Nascimento
                    </label>
                    <input
                      id="form-birth"
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="form-gender" className="text-xs font-semibold text-muted-foreground">
                    Sexo / Gênero (Opcional)
                  </label>
                  <select
                    id="form-gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Não informado</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Feminino">Feminino</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="form-active"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
                  />
                  <label htmlFor="form-active" className="text-xs font-semibold text-foreground">
                    Cliente Ativo (Permite emitir OS e Vendas)
                  </label>
                </div>
              </div>
            )}

            {/* ABA 2: CONTATOS */}
            {formActiveTab === "contact" && (
              <div className="space-y-4 animate-fade-in">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="form-phone" className="text-xs font-semibold text-muted-foreground">
                      Celular / Telefone Principal <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="form-phone"
                      value={phone}
                      onChange={(e) => setPhone(formatPhoneBrInput(e.target.value))}
                      placeholder="(14) 99999-9999"
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label htmlFor="form-whatsapp" className="text-xs font-semibold text-muted-foreground">
                        WhatsApp (Canal Omni)
                      </label>
                      <button
                        type="button"
                        onClick={() => setWhatsapp(phone)}
                        className="text-[10px] text-primary font-semibold hover:underline"
                      >
                        Copiar Principal
                      </button>
                    </div>
                    <input
                      id="form-whatsapp"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(formatPhoneBrInput(e.target.value))}
                      placeholder="(14) 99999-9999"
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="form-email" className="text-xs font-semibold text-muted-foreground">
                      E-mail Corporativo / Pessoal
                    </label>
                    <input
                      id="form-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="cliente@email.com"
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <div>
                    <label htmlFor="form-phonesec" className="text-xs font-semibold text-muted-foreground">
                      Telefone Fixo / Secundário
                    </label>
                    <input
                      id="form-phonesec"
                      value={phoneSecondary}
                      onChange={(e) => setPhoneSecondary(formatPhoneBrInput(e.target.value))}
                      placeholder="(14) 3222-2222"
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ABA 3: ENDEREÇO */}
            {formActiveTab === "address" && (
              <div className="space-y-4 animate-fade-in">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="form-cep" className="text-xs font-semibold text-muted-foreground">
                      CEP (Autocompletar)
                    </label>
                    <input
                      id="form-cep"
                      value={cep}
                      onChange={(e) => setCep(formatCep(e.target.value))}
                      placeholder="17000-000"
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="form-street" className="text-xs font-semibold text-muted-foreground">
                      Rua / Avenida
                    </label>
                    <input
                      id="form-street"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder="Rua, Av..."
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="form-num" className="text-xs font-semibold text-muted-foreground">
                      Número
                    </label>
                    <input
                      id="form-num"
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      placeholder="123"
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="form-neigh" className="text-xs font-semibold text-muted-foreground">
                      Bairro
                    </label>
                    <input
                      id="form-neigh"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder="Bairro"
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label htmlFor="form-city" className="text-xs font-semibold text-muted-foreground">
                      Cidade
                    </label>
                    <input
                      id="form-city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Cidade"
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <div>
                    <label htmlFor="form-state" className="text-xs font-semibold text-muted-foreground">
                      Estado (UF)
                    </label>
                    <input
                      id="form-state"
                      value={state}
                      onChange={(e) => setState(e.target.value.toUpperCase())}
                      placeholder="SP"
                      maxLength={2}
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="form-compl" className="text-xs font-semibold text-muted-foreground">
                      Complemento
                    </label>
                    <input
                      id="form-compl"
                      value={complement}
                      onChange={(e) => setComplement(e.target.value)}
                      placeholder="Ex: Bloco B, Apt 4"
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <div>
                    <label htmlFor="form-ref" className="text-xs font-semibold text-muted-foreground">
                      Ponto de Referência
                    </label>
                    <input
                      id="form-ref"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="Próximo a..."
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ABA 4: FINANCEIRO */}
            {formActiveTab === "financial" && (
              <div className="space-y-4 animate-fade-in">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="form-limit" className="text-xs font-semibold text-muted-foreground">
                      Limite de Crédito (BRL)
                    </label>
                    <input
                      id="form-limit"
                      type="number"
                      value={creditLimit}
                      onChange={(e) => setCreditLimit(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <div>
                    <label htmlFor="form-wallet" className="text-xs font-semibold text-muted-foreground">
                      Carteira Padrão de Acerto
                    </label>
                    <select
                      id="form-wallet"
                      value={carteiraPadrao}
                      onChange={(e) => setCarteiraPadrao(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">Nenhuma (Dinheiro/Geral)</option>
                      <option value="caixa-principal">Caixa Principal PDV</option>
                      <option value="banco-itau">Banco Itaú PJ</option>
                      <option value="carteira-fiados">Carteira Fiados/Crédito</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 border border-border rounded-xl p-4 bg-muted/10">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="form-fiado"
                      checked={permitsFiado}
                      onChange={(e) => setPermitsFiado(e.target.checked)}
                      className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
                    />
                    <label htmlFor="form-fiado" className="text-xs font-semibold text-foreground">
                      Permitir Fiado (Contas a Receber)
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="form-inad"
                      checked={inadimplente}
                      onChange={(e) => setInadimplente(e.target.checked)}
                      className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
                    />
                    <label htmlFor="form-inad" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                      Marcar como Inadimplente (Restrição)
                    </label>
                  </div>
                </div>

                <div>
                  <label htmlFor="form-finnotes" className="text-xs font-semibold text-muted-foreground">
                    Observações e Notas Financeiras
                  </label>
                  <textarea
                    id="form-finnotes"
                    value={notesFinancial}
                    onChange={(e) => setNotesFinancial(e.target.value)}
                    placeholder="Instruções de cobrança, restrições internas..."
                    className="mt-1.5 h-20 w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            )}

            {/* ABA 5: OPERACIONAL */}
            {formActiveTab === "operational" && (
              <div className="space-y-4 animate-fade-in">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="form-source" className="text-xs font-semibold text-muted-foreground">
                      Origem de Captação
                    </label>
                    <select
                      id="form-source"
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">Não informado</option>
                      <option value="Instagram">Instagram / Redes Sociais</option>
                      <option value="Indicação">Indicação de Cliente</option>
                      <option value="Google">Google / Buscas</option>
                      <option value="Panfletagem">Panfletagem / Local</option>
                      <option value="Outros">Outros meios</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="form-tech" className="text-xs font-semibold text-muted-foreground">
                      Técnico / Consultor Responsável
                    </label>
                    <select
                      id="form-tech"
                      value={tecnicoResponsavel}
                      onChange={(e) => setTecnicoResponsavel(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">Nenhum designado</option>
                      <option value="Michel">Michel</option>
                      <option value="Israel">Israel</option>
                      <option value="Larissa">Larissa</option>
                      <option value="Paulo">Paulo</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="form-tags" className="text-xs font-semibold text-muted-foreground">
                    Tags Operacionais (Separadas por vírgula)
                  </label>
                  <input
                    id="form-tags"
                    value={clientTags}
                    onChange={(e) => setClientTags(e.target.value)}
                    placeholder="VIP, Frequente, Difícil, Garantia..."
                    className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2 border border-border rounded-xl p-4 bg-muted/10">
                  <input
                    type="checkbox"
                    id="form-vip"
                    checked={vip}
                    onChange={(e) => setVip(e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
                  />
                  <label htmlFor="form-vip" className="text-xs font-semibold text-amber-500 dark:text-amber-400">
                    Cliente VIP (Destacar na listagem e faturamento)
                  </label>
                </div>

                <div>
                  <label htmlFor="form-opnotes" className="text-xs font-semibold text-muted-foreground">
                    Observações Operacionais Gerais
                  </label>
                  <textarea
                    id="form-opnotes"
                    value={notesOperational}
                    onChange={(e) => setNotesOperational(e.target.value)}
                    placeholder="Instruções de atendimento, horários de preferência, observações técnicas..."
                    className="mt-1.5 h-20 w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Rodapé do Formulário */}
          <div className="p-6 border-t border-border bg-muted/20 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="h-10 rounded-xl border border-border bg-background px-5 text-sm font-semibold text-foreground transition-smooth hover:bg-muted"
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit || submitting}
              className="h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-elegant transition-smooth hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? "Salvando..." : drawerMode === "edit" ? "Salvar Alterações" : "Criar Cliente"}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── GAVETA LATERAL: PERFIL DETALHADO DO CLIENTE ── */}
      <Sheet open={profileOpen} onOpenChange={(open) => !open && setProfileOpen(false)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto scroll-elegant border-l border-border bg-card/95 backdrop-blur-md p-0 flex flex-col h-full">
          {profileLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <LoadingState message="Carregando dossiê do cliente..." />
            </div>
          ) : profileError ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
              <AlertTriangle className="h-12 w-12 text-rose-500" />
              <h3 className="text-lg font-bold text-foreground">Falha ao carregar perfil</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">{profileError}</p>
              <button
                type="button"
                onClick={() => selectedProfileId && openProfileDrawer(selectedProfileId)}
                className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                Tentar novamente
              </button>
            </div>
          ) : profileData ? (
            <div className="flex flex-col h-full">
              {/* Cabeçalho do Perfil */}
              <div className="p-6 border-b border-border bg-gradient-primary/5 dark:bg-muted/10 relative">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-2xl border border-primary/20">
                    {getInitials(profileData.name)}
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-foreground">{profileData.name}</h2>
                      {profileData.active !== false ? (
                        <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          ATIVO
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                          INATIVO
                        </span>
                      )}
                      
                      {/* Desestruturar tags operacionais */}
                      {(() => {
                        let tObj: any = {}
                        try {
                          if (profileData.tags) {
                            tObj = typeof profileData.tags === "string" ? JSON.parse(profileData.tags) : profileData.tags
                          }
                        } catch (e) {}

                        const isVipProfile = tObj.operational?.vip === true || tObj.labels?.includes("VIP")
                        const isInadProfile = tObj.financial?.inadimplente === true || tObj.labels?.includes("Inadimplente")

                        return (
                          <>
                            {isVipProfile && (
                              <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                                VIP
                              </span>
                            )}
                            {isInadProfile && (
                              <span className="inline-flex items-center rounded-md bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                                BLOQUEADO
                              </span>
                            )}
                          </>
                        )
                      })()}
                    </div>
                    <p className="text-sm text-muted-foreground">{profileData.email || "Sem e-mail cadastrado"}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        {displayPhone(profileData.phone)}
                      </span>
                      {profileData.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {profileData.city}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Métricas Principais Consolidadas */}
                <div className="grid grid-cols-3 gap-3 mt-6 border-t border-border/60 pt-4 text-center">
                  <div className="bg-card rounded-lg p-2.5 border border-border/50">
                    <span className="block text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Consumido</span>
                    <span className="block text-sm font-bold text-foreground mt-0.5">{formatCurrency(profileData.totalSpent)}</span>
                  </div>
                  <div className="bg-card rounded-lg p-2.5 border border-border/50">
                    <span className="block text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Ordens de Serviço</span>
                    <span className="block text-sm font-bold text-foreground mt-0.5">{profileData.ordensServico?.length || 0} OS</span>
                  </div>
                  <div className="bg-card rounded-lg p-2.5 border border-border/50">
                    <span className="block text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Vendas Realizadas</span>
                    <span className="block text-sm font-bold text-foreground mt-0.5">{profileData.vendas?.length || 0} compras</span>
                  </div>
                </div>
              </div>

              {/* Seletor de Abas do Perfil */}
              <div className="flex border-b border-border bg-muted/40 p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setProfileActiveTab("history")}
                  className={cn(
                    "flex-1 py-2 text-xs font-semibold rounded-lg transition-smooth border border-transparent",
                    profileActiveTab === "history"
                      ? "bg-card text-foreground shadow-sm border-border"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Activity className="inline-block h-3.5 w-3.5 mr-1" />
                  Histórico Operacional
                </button>
                <button
                  type="button"
                  onClick={() => setProfileActiveTab("details")}
                  className={cn(
                    "flex-1 py-2 text-xs font-semibold rounded-lg transition-smooth border border-transparent",
                    profileActiveTab === "details"
                      ? "bg-card text-foreground shadow-sm border-border"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <User className="inline-block h-3.5 w-3.5 mr-1" />
                  Ficha Cadastral
                </button>
                <button
                  type="button"
                  onClick={() => setProfileActiveTab("timeline")}
                  className={cn(
                    "flex-1 py-2 text-xs font-semibold rounded-lg transition-smooth border border-transparent",
                    profileActiveTab === "timeline"
                      ? "bg-card text-foreground shadow-sm border-border"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Calendar className="inline-block h-3.5 w-3.5 mr-1" />
                  Timeline
                </button>
              </div>

              {/* Conteúdo do Perfil */}
              <div className="flex-1 p-6 space-y-6 overflow-y-auto scroll-elegant">
                
                {/* ABA DE HISTÓRICO (OS e Vendas Reais) */}
                {profileActiveTab === "history" && (
                  <div className="space-y-6 animate-fade-in">
                    {/* Lista de OS */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-border/80 pb-2">
                        <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-primary" />
                          Últimas Ordens de Serviço
                        </h3>
                        <span className="text-xs text-muted-foreground">{profileData.ordensServico?.length || 0} registradas</span>
                      </div>
                      
                      {(!profileData.ordensServico || profileData.ordensServico.length === 0) ? (
                        <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                          Nenhuma Ordem de Serviço registrada para este cliente.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto scroll-elegant">
                          {profileData.ordensServico.map((os: any) => (
                            <div key={os.id} className="flex items-center justify-between p-3 border border-border rounded-lg bg-card hover:bg-muted/20 transition-smooth">
                              <div>
                                <span className="text-xs font-semibold text-foreground">OS #{os.numero || os.id.slice(-6).toUpperCase()}</span>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{os.equipamento} — {os.defeito}</p>
                              </div>
                              <div className="text-right">
                                <span className="block text-xs font-bold text-foreground">{formatCurrency(os.valorTotal)}</span>
                                <span className={cn(
                                  "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[9px] font-semibold mt-1",
                                  os.status === "Entregue" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                                  os.status === "Pronto" && "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
                                  os.status === "EmAnalise" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                                  os.status === "Aberto" && "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                )}>
                                  {os.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Lista de Vendas */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-border/80 pb-2">
                        <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                          <DollarSign className="h-4 w-4 text-emerald-500" />
                          Histórico de Compras (PDV)
                        </h3>
                        <span className="text-xs text-muted-foreground">{profileData.vendas?.length || 0} registradas</span>
                      </div>

                      {(!profileData.vendas || profileData.vendas.length === 0) ? (
                        <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                          Nenhuma compra registrada em PDV para este cliente.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto scroll-elegant">
                          {profileData.vendas.map((venda: any) => (
                            <div key={venda.id} className="flex items-center justify-between p-3 border border-border rounded-lg bg-card hover:bg-muted/20 transition-smooth">
                              <div>
                                <span className="text-xs font-semibold text-foreground">Pedido #{venda.pedidoId}</span>
                                <p className="text-[11px] text-muted-foreground mt-0.5">Realizada em {formatDateBr(venda.at)}</p>
                              </div>
                              <div className="text-right">
                                <span className="block text-xs font-bold text-foreground">{formatCurrency(venda.total)}</span>
                                <span className="inline-flex items-center rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                                  {venda.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ABA DE DADOS COMPLETOS DA FICHA CADASTRAL */}
                {profileActiveTab === "details" && (
                  <div className="space-y-6 animate-fade-in text-xs">
                    {/* Contatos */}
                    <div className="border border-border rounded-xl p-4 bg-muted/10 space-y-3">
                      <h4 className="font-bold text-foreground uppercase tracking-wide flex items-center gap-1 border-b border-border/80 pb-1.5">
                        <Phone className="h-3.5 w-3.5 text-primary" />
                        Canais de Contato
                      </h4>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <span className="text-muted-foreground block">Telefone Celular:</span>
                          <span className="text-foreground font-semibold">{displayPhone(profileData.phone)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">E-mail:</span>
                          <span className="text-foreground font-semibold">{profileData.email || "Não informado"}</span>
                        </div>
                      </div>
                      
                      {(() => {
                        let tObj: any = {}
                        try {
                          if (profileData.tags) {
                            tObj = typeof profileData.tags === "string" ? JSON.parse(profileData.tags) : profileData.tags
                          }
                        } catch (e) {}

                        if (Array.isArray(tObj)) return null

                        return (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 border-t border-border/50 pt-2 mt-2">
                            <div>
                              <span className="text-muted-foreground block">WhatsApp:</span>
                              <span className="text-foreground font-semibold">{displayPhone(tObj.whatsapp) || "Mesmo que celular"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block">Contato Secundário:</span>
                              <span className="text-foreground font-semibold">{displayPhone(tObj.phoneSecondary) || "Não cadastrado"}</span>
                            </div>
                          </div>
                        )
                      })()}
                    </div>

                    {/* Endereço */}
                    <div className="border border-border rounded-xl p-4 bg-muted/10 space-y-3">
                      <h4 className="font-bold text-foreground uppercase tracking-wide flex items-center gap-1 border-b border-border/80 pb-1.5">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        Logradouro e Localização
                      </h4>
                      {(() => {
                        let tObj: any = {}
                        try {
                          if (profileData.tags) {
                            tObj = typeof profileData.tags === "string" ? JSON.parse(profileData.tags) : profileData.tags
                          }
                        } catch (e) {}

                        if (Array.isArray(tObj) || !tObj.address) {
                          return (
                            <div>
                              <span className="text-muted-foreground block">Cidade/UF cadastrado:</span>
                              <span className="text-foreground font-semibold">{profileData.city || "Não informado"}</span>
                            </div>
                          )
                        }

                        const adr = tObj.address

                        return (
                          <div className="space-y-2">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                              <div className="sm:col-span-2">
                                <span className="text-muted-foreground block">Logradouro:</span>
                                <span className="text-foreground font-semibold">{adr.street ? `${adr.street}, nº ${adr.number || "S/N"}` : "Não informado"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">CEP:</span>
                                <span className="text-foreground font-semibold">{adr.cep || "Não informado"}</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 border-t border-border/40 pt-2">
                              <div>
                                <span className="text-muted-foreground block">Bairro:</span>
                                <span className="text-foreground font-semibold">{adr.neighborhood || "Não informado"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Cidade:</span>
                                <span className="text-foreground font-semibold">{profileData.city || adr.city || "—"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Estado (UF):</span>
                                <span className="text-foreground font-semibold">{adr.state || "—"}</span>
                              </div>
                            </div>
                            {(adr.complement || adr.reference) && (
                              <div className="border-t border-border/40 pt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {adr.complement && (
                                  <div>
                                    <span className="text-muted-foreground block">Complemento:</span>
                                    <span className="text-foreground font-semibold">{adr.complement}</span>
                                  </div>
                                )}
                                {adr.reference && (
                                  <div>
                                    <span className="text-muted-foreground block">Ponto de Referência:</span>
                                    <span className="text-foreground font-semibold">{adr.reference}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>

                    {/* Financeiro */}
                    <div className="border border-border rounded-xl p-4 bg-muted/10 space-y-3">
                      <h4 className="font-bold text-foreground uppercase tracking-wide flex items-center gap-1 border-b border-border/80 pb-1.5">
                        <CreditCard className="h-3.5 w-3.5 text-primary" />
                        Crédito e Condições Financeiras
                      </h4>
                      {(() => {
                        let tObj: any = {}
                        try {
                          if (profileData.tags) {
                            tObj = typeof profileData.tags === "string" ? JSON.parse(profileData.tags) : profileData.tags
                          }
                        } catch (e) {}

                        if (Array.isArray(tObj) || !tObj.financial) {
                          return (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-muted-foreground block">Permite Fiado:</span>
                                <span className="text-foreground font-semibold">Sim (Padrão)</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Limite Global:</span>
                                <span className="text-foreground font-semibold">Sem Limite</span>
                              </div>
                            </div>
                          )
                        }

                        const fin = tObj.financial

                        return (
                          <div className="space-y-2">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                              <div>
                                <span className="text-muted-foreground block">Limite de Crédito:</span>
                                <span className="text-foreground font-semibold">{formatCurrency(fin.creditLimit || 0)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Permite Fiado:</span>
                                <span className="text-foreground font-semibold">{fin.permitsFiado ? "✅ Autorizado" : "❌ Bloqueado"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Carteira Principal:</span>
                                <span className="text-foreground font-semibold">{fin.carteiraPadrao || "Dinheiro / Caixa Geral"}</span>
                              </div>
                            </div>
                            {fin.notes && (
                              <div className="border-t border-border/40 pt-2">
                                <span className="text-muted-foreground block">Notas e Restrições Internas:</span>
                                <p className="text-foreground font-medium bg-rose-500/5 dark:bg-rose-500/10 p-2 rounded border border-rose-500/20 text-[11px] mt-1">
                                  {fin.notes}
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>

                    {/* Operacional */}
                    {(() => {
                      let tObj: any = {}
                      try {
                        if (profileData.tags) {
                          tObj = typeof profileData.tags === "string" ? JSON.parse(profileData.tags) : profileData.tags
                        }
                      } catch (e) {}

                      if (Array.isArray(tObj) || !tObj.operational) return null

                      const oper = tObj.operational

                      return (
                        <div className="border border-border rounded-xl p-4 bg-muted/10 space-y-3">
                          <h4 className="font-bold text-foreground uppercase tracking-wide flex items-center gap-1 border-b border-border/80 pb-1.5">
                            <Activity className="h-3.5 w-3.5 text-primary" />
                            Controle Operacional
                          </h4>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <div>
                              <span className="text-muted-foreground block">Origem do Cadastro:</span>
                              <span className="text-foreground font-semibold">{oper.source || "Geral/Balcão"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block">Técnico Preferencial:</span>
                              <span className="text-foreground font-semibold">{oper.tecnicoResponsavel || "Não atribuído"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block">Destaque:</span>
                              <span className="text-foreground font-semibold">{oper.vip ? "⭐ VIP Especial" : "Geral"}</span>
                            </div>
                          </div>
                          {oper.notes && (
                            <div className="border-t border-border/40 pt-2">
                              <span className="text-muted-foreground block">Observações do Atendimento:</span>
                              <p className="text-foreground font-medium p-2 mt-1 bg-card rounded border border-border">
                                {oper.notes}
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* ABA DE TIMELINE */}
                {profileActiveTab === "timeline" && (
                  <div className="space-y-4 animate-fade-in text-xs">
                    <div className="relative border-l border-border pl-6 space-y-6">
                      
                      {/* Evento 1: Última Compra */}
                      {profileData.lastPurchaseAt && (
                        <div className="relative">
                          <div className="absolute -left-[30px] top-0 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-500 text-white">
                            <Check className="h-2.5 w-2.5" />
                          </div>
                          <div>
                            <span className="text-muted-foreground text-[10px]">{formatDateBr(profileData.lastPurchaseAt)}</span>
                            <h5 className="font-bold text-foreground mt-0.5">Última Transação Registrada</h5>
                            <p className="text-muted-foreground mt-0.5">O cliente realizou uma compra no PDV.</p>
                          </div>
                        </div>
                      )}

                      {/* Evento 2: Última OS */}
                      {profileData.ordensServico && profileData.ordensServico.length > 0 && (
                        <div className="relative">
                          <div className="absolute -left-[30px] top-0 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-primary text-white">
                            <FileText className="h-2.5 w-2.5" />
                          </div>
                          <div>
                            <span className="text-muted-foreground text-[10px]">{formatDateBr(profileData.ordensServico[0].createdAt)}</span>
                            <h5 className="font-bold text-foreground mt-0.5">Ordem de Serviço Emitida</h5>
                            <p className="text-muted-foreground mt-0.5">OS #{profileData.ordensServico[0].numero || "OS"} aberta: {profileData.ordensServico[0].equipamento}.</p>
                          </div>
                        </div>
                      )}

                      {/* Evento 3: Cadastro */}
                      <div className="relative">
                        <div className="absolute -left-[30px] top-0 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-indigo-500 text-white">
                          <Users className="h-2.5 w-2.5" />
                        </div>
                        <div>
                          <span className="text-muted-foreground text-[10px]">{formatDateBr(profileData.createdAt)}</span>
                          <h5 className="font-bold text-foreground mt-0.5">Cliente Cadastrado no ERP</h5>
                          <p className="text-muted-foreground mt-0.5">Ficha cadastral criada e homologada na unidade.</p>
                        </div>
                      </div>

                    </div>
                  </div>
                )}

              </div>

              {/* Rodapé do Perfil */}
              <div className="p-6 border-t border-border bg-muted/20 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false)
                    openEditDrawer(profileData)
                  }}
                  className="h-10 rounded-xl bg-secondary px-5 text-sm font-semibold text-secondary-foreground hover:bg-muted border border-border"
                >
                  Editar Cadastro
                </button>
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
                >
                  Fechar
                </button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* ── DIÁLOGO DE EXCLUSÃO DE CLIENTE ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Excluir cliente permanentemente?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {deleteTarget ? (
                <>
                  Você está prestes a remover <span className="font-semibold text-foreground">{deleteTarget.name}</span>. 
                  Esta operação excluirá todos os dados do cliente e desvinculará seu histórico. Esta ação não poderá ser desfeita.
                </>
              ) : null}
              {deleteError ? <p className="text-sm text-red-400 font-semibold">{deleteError}</p> : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void confirmDelete()}
              className={cn(buttonVariants(), "bg-rose-600 text-white hover:bg-rose-500 transition-smooth active:scale-95")}
            >
              {deleting ? "Excluindo..." : "Confirmar Exclusão"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

