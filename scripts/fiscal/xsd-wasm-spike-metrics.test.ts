import { stat } from "node:fs/promises"
import { performance } from "node:perf_hooks"
import { join } from "node:path"
import { expect, it } from "vitest"
import { VALID_NFCE_XML_VERPROC_20 } from "../../lib/fiscal/xsd/__fixtures__/nfce-xsd-spike-fixtures"
import {
  OFFICIAL_XSD_PACKAGE,
  validateXmlAgainstOfficialXsdSpike,
} from "../../lib/fiscal/xsd/xmllint-wasm-spike"

it("mede inicialização, warm-up, concorrência, memória e tamanhos do spike", async () => {
  const schemaDirectory = join(
    process.cwd(),
    "lib",
    "fiscal",
    "xsd",
    "schemas",
    OFFICIAL_XSD_PACKAGE.name,
    "NFe",
  )

  const memoryBefore = process.memoryUsage()
  const coldStart = performance.now()
  const coldResult = await validateXmlAgainstOfficialXsdSpike(VALID_NFCE_XML_VERPROC_20)
  const coldMs = performance.now() - coldStart
  const memoryAfterCold = process.memoryUsage()

  const warmSamples: number[] = []
  for (let index = 0; index < 10; index += 1) {
    const startedAt = performance.now()
    const result = await validateXmlAgainstOfficialXsdSpike(VALID_NFCE_XML_VERPROC_20)
    expect(result.valid).toBe(true)
    warmSamples.push(performance.now() - startedAt)
  }

  const concurrentStart = performance.now()
  const concurrent = await Promise.all(
    Array.from({ length: 4 }, () => validateXmlAgainstOfficialXsdSpike(VALID_NFCE_XML_VERPROC_20)),
  )
  const concurrentMs = performance.now() - concurrentStart
  expect(concurrent.every((result) => result.valid)).toBe(true)

  const xsdBytes = (
    await Promise.all(
      OFFICIAL_XSD_PACKAGE.files.map(async (file) => (await stat(join(schemaDirectory, file.name))).size),
    )
  ).reduce((total, size) => total + size, 0)
  const wasmBytes = (await stat(join(process.cwd(), "node_modules", "xmllint-wasm", "xmllint.wasm"))).size
  const memoryAfter = process.memoryUsage()
  const average = warmSamples.reduce((sum, sample) => sum + sample, 0) / warmSamples.length

  expect(coldResult.valid).toBe(true)
  console.log(
    "XSD_SPIKE_METRICS",
    JSON.stringify({
      environment: { platform: process.platform, arch: process.arch, node: process.version },
      coldMs: Number(coldMs.toFixed(2)),
      warm: {
        samples: warmSamples.length,
        averageMs: Number(average.toFixed(2)),
        minMs: Number(Math.min(...warmSamples).toFixed(2)),
        maxMs: Number(Math.max(...warmSamples).toFixed(2)),
      },
      concurrent4Ms: Number(concurrentMs.toFixed(2)),
      memory: {
        rssBefore: memoryBefore.rss,
        rssAfterCold: memoryAfterCold.rss,
        rssAfter: memoryAfter.rss,
        rssDeltaCold: memoryAfterCold.rss - memoryBefore.rss,
        rssDeltaTotal: memoryAfter.rss - memoryBefore.rss,
      },
      wasmBytes,
      xsdBytes,
    }),
  )
})
