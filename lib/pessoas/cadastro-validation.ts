export type CamposCadastro = {
  nome: string | null; cpf: string | null; matricula: string | null
  admissao: Date | null; regime: string | null; categoria: string | null
  cargo: string | null; cbo: string | null; salarioBase: string | null
  unidadeSalario: string | null; jornadaSemanal: string | null; divisor: number | null
  contractValidFrom: Date | null
}

export function pendenciasCadastro(campos: CamposCadastro): string[] {
  return ([
    ["nome", campos.nome], ["cpf", campos.cpf], ["matricula", campos.matricula],
    ["admissao", campos.admissao], ["regime", campos.regime], ["categoria", campos.categoria],
    ["cargo", campos.cargo], ["cbo", campos.cbo], ["salarioBase", campos.salarioBase],
    ["unidadeSalario", campos.unidadeSalario], ["jornadaSemanal", campos.jornadaSemanal],
    ["divisor", campos.divisor], ["contractValidFrom", campos.contractValidFrom],
  ] as const).filter(([, v]) => v == null).map(([k]) => k)
}
