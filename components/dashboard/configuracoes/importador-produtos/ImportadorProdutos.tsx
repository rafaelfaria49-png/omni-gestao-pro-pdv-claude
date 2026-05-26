"use client"

import { AlertCircle, Package, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useImportadorProdutos } from "./hooks/use-importador-produtos"
import { UploadProdutos } from "./UploadProdutos"
import { PreviewProdutos } from "./PreviewProdutos"
import { LotesProdutos } from "./LotesProdutos"
import { LogProdutos } from "./LogProdutos"

/**
 * Importador de Produtos — planilhas grandes/legadas (XLS, XLSX, CSV).
 *
 * Fluxo guiado:
 *   1) Upload de 1 arquivo (até 50MB).
 *   2) Pré-visualização: cabeçalho detectado, totais, duplicados, amostra de 20 linhas.
 *   3) Importação por lotes manuais (até 500 produtos/lote — botão dispara cada lote).
 *   4) Log final com criados/atualizados/pulados/erros + detalhamento.
 *
 * Diferenças vs Importador Avançado:
 *   - Foco em PRODUTOS apenas (não detecta domínio).
 *   - Aceita planilhas legadas com banner antes do cabeçalho.
 *   - Importação fatiada — operador controla cada lote (não tudo de uma vez).
 *   - Não toca em estoque de produtos pré-existentes (regra global).
 */

export function ImportadorProdutos() {
  const imp = useImportadorProdutos()
  const {
    estado,
    arquivo,
    modoConflito,
    temLojaObrigatoria,
    totais,
    escolherArquivo,
    setModoConflito,
    limpar,
    rodarPreview,
    enviarProximoLote,
  } = imp

  const fasePreview = estado.fase === "preview-loading"
  const desabilitarUpload = fasePreview || estado.fase === "lotes-em-andamento"

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card">
          <Package className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            Importador de Produtos — lotes manuais
          </p>
          <p className="text-xs text-muted-foreground">
            Para planilhas grandes (milhares de itens), inclusive XLS antigos de sistemas legados.
            Após o preview, você escolhe lote a lote — nada vai para o banco sem confirmação.
            Estoque de produto existente <strong className="font-medium">nunca</strong> é sobrescrito.
          </p>
        </div>
      </div>

      {/* Upload (sempre visível, mas desabilita em fases avançadas) */}
      <UploadProdutos
        arquivo={arquivo}
        temLojaObrigatoria={temLojaObrigatoria}
        desabilitado={desabilitarUpload}
        onSelecionar={escolherArquivo}
      />

      {/* Ações idle / preview-ok */}
      {(estado.fase === "idle" || estado.fase === "preview-loading") && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {arquivo
              ? "Pré-visualize antes de importar — o preview mostra cabeçalho, válidos, inválidos e duplicados."
              : "Selecione um arquivo para começar."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={limpar}
              disabled={!arquivo || desabilitarUpload}
            >
              Descartar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void rodarPreview()}
              disabled={!arquivo || !temLojaObrigatoria || desabilitarUpload}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {fasePreview ? "Analisando…" : "Pré-visualizar"}
            </Button>
          </div>
        </div>
      )}

      {/* Erro */}
      {estado.fase === "erro" && (
        <ErroBox
          mensagem={estado.mensagem}
          detalhe={estado.detalhe}
          onFechar={limpar}
        />
      )}

      {/* Skeleton durante preview */}
      {estado.fase === "preview-loading" && <SkeletonPreview />}

      {/* Preview pronto + ação para iniciar a importação */}
      {estado.fase === "preview-ok" && (
        <>
          <PreviewProdutos preview={estado.preview} />
          {estado.preview.totalLinhasValidas > 0 ? (
            <LotesProdutos
              preview={estado.preview}
              modoConflito={modoConflito}
              setModoConflito={setModoConflito}
              loteAtual={0}
              totais={totais}
              resultados={[]}
              enviando={false}
              onImportarProximo={enviarProximoLote}
            />
          ) : (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
              Nenhuma linha válida encontrada para importar. Revise os motivos no detalhamento acima e
              tente outra planilha.
            </div>
          )}
        </>
      )}

      {/* Lotes em andamento */}
      {estado.fase === "lotes-em-andamento" && (
        <>
          <PreviewProdutos preview={estado.preview} />
          <LotesProdutos
            preview={estado.preview}
            modoConflito={modoConflito}
            setModoConflito={setModoConflito}
            loteAtual={estado.loteAtual}
            totais={totais}
            resultados={estado.resultados}
            enviando={estado.enviando}
            onImportarProximo={enviarProximoLote}
          />
        </>
      )}

      {/* Concluído */}
      {estado.fase === "concluido" && (
        <LogProdutos
          arquivo={estado.preview.arquivo}
          batchId={estado.batchId}
          resultados={estado.resultados}
          totais={totais}
          onReiniciar={limpar}
        />
      )}
    </div>
  )
}

function ErroBox({
  mensagem,
  detalhe,
  onFechar,
}: {
  mensagem: string
  detalhe?: string
  onFechar: () => void
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-destructive">{mensagem}</p>
        {detalhe ? <p className="mt-1 text-xs text-destructive/80">{detalhe}</p> : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onFechar}
        className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        Fechar
      </Button>
    </div>
  )
}

function SkeletonPreview() {
  return (
    <div className="space-y-3" aria-busy aria-live="polite">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
    </div>
  )
}
