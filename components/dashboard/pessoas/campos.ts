import type { Field } from "./ui"
export const personal: Field[] = [
  { name: "nome", label: "Nome completo" }, { name: "cpf", label: "CPF", maxLength: 14 },
  { name: "nascimento", label: "Nascimento", type: "date" },
]
export const vinculo: Field[] = [
  { name: "matricula", label: "Matrícula", maxLength: 64 }, { name: "admissao", label: "Admissão original", type: "date" },
  { name: "regime", label: "Regime", maxLength: 80 }, { name: "categoria", label: "Categoria", maxLength: 80 },
]
export const contrato: Field[] = [
  { name: "cargo", label: "Cargo", maxLength: 160 }, { name: "cbo", label: "CBO", maxLength: 12 },
  { name: "tipoContrato", label: "Tipo de contrato", maxLength: 80 },
  { name: "salarioBase", label: "Salário base", hint: "Sem separador de milhar. Exemplo: 2500,00." },
  { name: "unidadeSalario", label: "Unidade do salário", maxLength: 24 },
  { name: "jornadaSemanal", label: "Jornada semanal", hint: "Horas entre 0,00 e 168,00." },
  { name: "divisor", label: "Divisor", type: "number" }, { name: "cctRef", label: "Referência CCT", maxLength: 160 },
]
export const motivo: Field = { name: "motivo", label: "Motivo", required: true, maxLength: 1000 }
export const vigencia: Field = { name: "validFrom", label: "Vigência inicial", type: "date", required: true }
