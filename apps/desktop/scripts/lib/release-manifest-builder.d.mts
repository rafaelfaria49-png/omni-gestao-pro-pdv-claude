// Tipos do builder (.mjs) para o teste de contrato do lado web (lib/desktop-distribution).
export declare const SETUP_FILE_NAME: string
export declare function parseBase(raw: unknown): URL
export declare function objectKeys(version: string): {
  dir: string
  setup: string
  sums: string
  release: string
  latest: string
  history: string
}
export declare function buildReleaseManifest(args: {
  base: string
  artifacts: unknown
  publicCheck: unknown
  installTest: string
  publishedAt: string
  notes?: string
}): Record<string, unknown>
export declare function parseTrustedThumbprints(raw: unknown): string[]
export declare function checkReleaseManifest(
  raw: unknown,
  base: string,
  trusted: string[],
): { version: string; sha256: string; thumbprint: string; url: string }
export declare function appendHistory(
  history: unknown,
  release: Record<string, unknown>,
): { channel: "production"; versions: Array<{ version: string; sha256: string; url?: string; publishedAt?: string; buildCommit?: string }> }
