/**
 * Mapa determinístico palavra-chave → categoria sugerida (nome canônico).
 * A categoria só vira `categoriaId` quando existe cadastro ativo no perfil (PortaCadastros);
 * caso contrário a despesa segue sem categoria — nunca se cria categoria pelo chat.
 */
import { normalizarTexto } from "./texto"

const MAPA: Array<{ categoria: string; termos: string[] }> = [
  { categoria: "Supermercado", termos: ["mercado", "supermercado", "feira", "hortifruti", "acougue", "atacadao", "assai", "sacolao"] },
  { categoria: "Energia", termos: ["energia", "luz", "conta de luz", "enel", "cemig", "copel", "light", "celesc", "coelba"] },
  { categoria: "Água", termos: ["agua", "conta de agua", "sabesp", "saneamento", "copasa", "sanepar"] },
  { categoria: "Internet e telefone", termos: ["internet", "telefone", "celular", "plano de celular", "vivo", "claro", "tim", "oi fibra"] },
  { categoria: "Combustível", termos: ["gasolina", "combustivel", "posto", "etanol", "alcool", "diesel", "abastecer", "abasteci"] },
  { categoria: "Alimentação", termos: ["restaurante", "almoco", "jantar", "lanche", "ifood", "padaria", "pizza", "lanchonete", "cafe"] },
  { categoria: "Transporte", termos: ["uber", "taxi", "onibus", "metro", "estacionamento", "pedagio", "passagem"] },
  { categoria: "Saúde", termos: ["farmacia", "remedio", "medico", "consulta medica", "exame", "dentista", "plano de saude", "drogaria"] },
  { categoria: "Aluguel", termos: ["aluguel"] },
  { categoria: "Moradia", termos: ["condominio", "iptu", "gas", "botijao"] },
  { categoria: "Educação", termos: ["escola", "curso", "faculdade", "mensalidade escolar", "livro", "material escolar"] },
  { categoria: "Lazer", termos: ["cinema", "viagem", "bar", "show", "streaming", "netflix", "spotify"] },
  { categoria: "Vestuário", termos: ["roupa", "roupas", "sapato", "tenis", "calcado"] },
  { categoria: "Fornecedores", termos: ["fornecedor", "mercadoria", "estoque", "reposicao"] },
  { categoria: "Impostos", termos: ["imposto", "impostos", "guia das", "simples nacional", "ipva", "darf", "taxa"] },
  { categoria: "Salários", termos: ["salario", "funcionario", "folha", "pro labore", "pro-labore"] },
  { categoria: "Manutenção", termos: ["manutencao", "conserto", "reforma", "oficina", "mecanico"] },
  { categoria: "Eletrônicos", termos: ["celular novo", "notebook", "computador", "tv", "televisao", "geladeira", "eletrodomestico"] },
]

/** Retorna a categoria sugerida e o termo que a originou, ou null. Termos mais longos vencem. */
export function categoriaPorTexto(textoNormalizado: string): { categoria: string; termo: string } | null {
  let melhor: { categoria: string; termo: string } | null = null
  for (const { categoria, termos } of MAPA) {
    for (const termo of termos) {
      if (new RegExp(`(^|\\s)${termo}($|\\s)`).test(textoNormalizado) && (!melhor || termo.length > melhor.termo.length)) {
        melhor = { categoria, termo }
      }
    }
  }
  return melhor
}

export function mesmaCategoria(a: string, b: string): boolean {
  return normalizarTexto(a) === normalizarTexto(b)
}
