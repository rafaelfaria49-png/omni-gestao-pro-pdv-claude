"use server"

import * as admin from "@/lib/pessoas/admin"
import * as cadastro from "@/lib/pessoas/cadastro"
import { PessoasError } from "@/lib/pessoas/domain"

async function resposta<T>(op: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; code: string }> {
  try {
    return { ok: true, data: await op() }
  } catch (e) {
    return { ok: false, code: e instanceof PessoasError ? e.code : "FALHA_INTERNA" }
  }
}

export async function setupEmpregador(input: Parameters<typeof admin.criarEmpregador>[0]) {
  return resposta(() => admin.criarEmpregador(input))
}
export async function listarEmpregadores() {
  return resposta(() => admin.listarEmpregadores())
}
export async function obterEmpregador(id: string) {
  return resposta(() => admin.obterEmpregador(id))
}
export async function editarEmpregador(input: Parameters<typeof admin.atualizarEmpregador>[0]) {
  return resposta(() => admin.atualizarEmpregador(input))
}
export async function criarEstabelecimento(input: Parameters<typeof admin.criarEstabelecimento>[0]) {
  return resposta(() => admin.criarEstabelecimento(input))
}
export async function editarEstabelecimento(input: Parameters<typeof admin.atualizarEstabelecimento>[0]) {
  return resposta(() => admin.atualizarEstabelecimento(input))
}
export async function vincularUnidade(input: Parameters<typeof admin.vincularUnidade>[0]) {
  return resposta(() => admin.vincularUnidade(input))
}
export async function concederAcesso(input: Parameters<typeof admin.concederAcesso>[0]) {
  return resposta(() => admin.concederAcesso(input))
}
export async function revogarAcesso(input: Parameters<typeof admin.revogarAcesso>[0]) {
  return resposta(() => admin.revogarAcesso(input))
}
export async function listarFuncionarios(empregadorId: string) {
  return resposta(() => cadastro.listarFuncionarios(empregadorId))
}
export async function obterFuncionario(empregadorId: string, vinculoId: string) {
  return resposta(() => cadastro.obterFuncionario(empregadorId, vinculoId))
}
export async function criarFuncionario(input: cadastro.FuncionarioInput) {
  return resposta(() => cadastro.criarFuncionario(input))
}
export async function atualizarDadosPessoais(input: Parameters<typeof cadastro.atualizarDadosPessoais>[0]) {
  return resposta(() => cadastro.atualizarDadosPessoais(input))
}
export async function completarVinculoRascunho(input: Parameters<typeof cadastro.completarVinculoRascunho>[0]) {
  return resposta(() => cadastro.completarVinculoRascunho(input))
}
export async function criarVersaoContrato(input: Parameters<typeof cadastro.criarVersaoContrato>[0]) {
  return resposta(() => cadastro.criarVersaoContrato(input))
}
export async function listarHistorico(empregadorId: string, vinculoId: string) {
  return resposta(() => cadastro.listarHistorico(empregadorId, vinculoId))
}
export async function arquivarVinculo(input: Parameters<typeof cadastro.arquivarVinculo>[0]) {
  return resposta(() => cadastro.arquivarVinculo(input))
}
export async function vincularIdentidade(input: Parameters<typeof cadastro.vincularIdentidade>[0]) {
  return resposta(() => cadastro.vincularIdentidade(input))
}
