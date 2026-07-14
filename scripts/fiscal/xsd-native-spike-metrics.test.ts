import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { performance } from "node:perf_hooks"
import { describe, expect, it } from "vitest"
import { VALID_NFCE_XML_VERPROC_20 } from "../../lib/fiscal/xsd/__fixtures__/nfce-xsd-spike-fixtures"
import {
  inspectNativeXmllintSpike,
  NATIVE_SPIKE_XSD_PACKAGE,
  type NativeXmllintSpikeOptions,
  validateXmlWithNativeXmllintSpike,
} from "../../lib/fiscal/xsd-native/xmllint-native-spike"

const executablePath = process.env.FISCAL_XMLLINT_PATH
const executableSha256 = process.env.FISCAL_XMLLINT_SHA256
const enabled = Boolean(executablePath && executableSha256)

function realOptions(): NativeXmllintSpikeOptions {
  if (!executablePath || !executableSha256) throw new Error("Configuração xmllint ausente")
  return {
    executablePath,
    trust: { mode: "provisioned", expectedSha256: executableSha256 },
    timeoutMs: 5_000,
    maxMemoryBytes: Number(process.env.FISCAL_XMLLINT_MAX_MEMORY_BYTES ?? 512 * 1024 * 1024),
  }
}

describe.skipIf(!enabled)("métricas reproduzíveis do xmllint nativo", () => {
  it("mede versão, cold, warm, concorrência, RSS do wrapper, temporário e tamanhos", async () => {
    const configured = realOptions()
    const inspectionStart = performance.now()
    const inspection = await inspectNativeXmllintSpike(configured)
    const inspectionMs = performance.now() - inspectionStart
    const rssBefore = process.memoryUsage().rss

    const coldStart = performance.now()
    const cold = await validateXmlWithNativeXmllintSpike(VALID_NFCE_XML_VERPROC_20, configured)
    const coldMs = performance.now() - coldStart
    const rssAfterCold = process.memoryUsage().rss

    const warmSamples: number[] = []
    for (let index = 0; index < 10; index += 1) {
      const startedAt = performance.now()
      const result = await validateXmlWithNativeXmllintSpike(VALID_NFCE_XML_VERPROC_20, configured)
      expect(result.valid).toBe(true)
      warmSamples.push(performance.now() - startedAt)
    }

    const concurrentStart = performance.now()
    const concurrent = await Promise.all(
      Array.from({ length: 4 }, () =>
        validateXmlWithNativeXmllintSpike(VALID_NFCE_XML_VERPROC_20, configured),
      ),
    )
    const concurrent4Ms = performance.now() - concurrentStart
    expect(concurrent.every((result) => result.valid)).toBe(true)

    const temporaryStart = performance.now()
    const temporary = await mkdtemp(join(tmpdir(), "native-spike-metric-"))
    await rm(temporary, { recursive: true, force: true })
    const temporaryCreateCleanupMs = performance.now() - temporaryStart

    const schemaDirectory = join(
      process.cwd(),
      "lib",
      "fiscal",
      "xsd-native",
      "schemas",
      NATIVE_SPIKE_XSD_PACKAGE.name,
      "NFe",
    )
    const xsdBytes = (
      await Promise.all(
        NATIVE_SPIKE_XSD_PACKAGE.files.map(async (file) =>
          (await stat(join(schemaDirectory, file.name))).size,
        ),
      )
    ).reduce((sum, size) => sum + size, 0)
    const average = warmSamples.reduce((sum, value) => sum + value, 0) / warmSamples.length
    const rssAfter = process.memoryUsage().rss

    expect(cold.valid).toBe(true)
    console.log(
      "XSD_NATIVE_SPIKE_METRICS",
      JSON.stringify({
        environment: { platform: process.platform, architecture: process.arch, node: process.version },
        engine: {
          version: inspection.version,
          sha256: inspection.executableSha256,
          binaryBytes: inspection.executableBytes,
          versionDiscoveryMs: Number(inspection.versionDiscoveryMs.toFixed(2)),
          fullInspectionMs: Number(inspectionMs.toFixed(2)),
        },
        coldMs: Number(coldMs.toFixed(2)),
        warm: {
          samples: warmSamples.length,
          averageMs: Number(average.toFixed(2)),
          minMs: Number(Math.min(...warmSamples).toFixed(2)),
          maxMs: Number(Math.max(...warmSamples).toFixed(2)),
        },
        concurrent4Ms: Number(concurrent4Ms.toFixed(2)),
        wrapperMemory: {
          rssBefore,
          rssAfterCold,
          rssAfter,
          rssDeltaCold: rssAfterCold - rssBefore,
          rssDeltaTotal: rssAfter - rssBefore,
        },
        temporaryCreateCleanupMs: Number(temporaryCreateCleanupMs.toFixed(2)),
        xsdBytes,
      }),
    )
  })
})
