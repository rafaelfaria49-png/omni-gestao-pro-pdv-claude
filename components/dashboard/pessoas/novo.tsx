"use client"
import { useRouter } from "next/navigation"
import { criarFuncionario } from "@/app/actions/pessoas"
import { decimalInput } from "@/lib/pessoas/adapters/cadastro-ui"
import { usePessoas } from "./contexto"
import { CommandForm, Notice, Section } from "./ui"
import { personal, vinculo, contrato, motivo } from "./campos"
export function NovoFuncionario() {
  const { empregadorId, capacidades } = usePessoas()
  const router = useRouter()
  if (!empregadorId || !capacidades.includes("editCadastro")) return <Notice code="ESCOPO_NEGADO" />
  const editContrato = capacidades.includes("editContrato")
  return <Section title="Novo funcionário">
    <p className="text-sm text-muted-foreground">Preencha os dados disponíveis. Campos pendentes mantêm o cadastro como rascunho; nenhuma informação trabalhista será presumida.</p>
    <CommandForm fields={[...personal, ...vinculo, ...(editContrato ? [...contrato, { name: "contractValidFrom", label: "Vigência do contrato", type: "date" }] : []), motivo]}
      submitLabel="Salvar cadastro"
      onSaved={() => router.push("/dashboard/pessoas/funcionarios")}
      action={async (values, comandoId) => {
        try {
          const optional = Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== "" && !["divisor", "salarioBase", "jornadaSemanal"].includes(key)))
          return criarFuncionario({ ...optional, motivo: values.motivo, empregadorId, comandoId,
            ...(editContrato ? { salarioBase: decimalInput(values.salarioBase), jornadaSemanal: decimalInput(values.jornadaSemanal),
              divisor: values.divisor ? Number(values.divisor) : undefined } : {}) })
        } catch (error) { return { ok: false, code: error instanceof Error && error.message === "DECIMAL_INVALIDO" ? "DECIMAL_INVALIDO" : "REDE" } }
      }} />
  </Section>
}
