// Tipos do gerador de AppxManifest (.mjs) para os testes unitários.
export interface MsixIdentity {
  name: string
  publisher: string
  publisherDisplayName: string
}
export declare const CI_TEST_IDENTITY: Readonly<MsixIdentity>
export declare const MSIX_APP_ID: string
export declare const MSIX_EXECUTABLE: string
export declare const MIN_WINDOWS_VERSION: string
export declare class MsixManifestError extends Error {}
export declare function msixVersion(semver: unknown): string
export declare function validateIdentity(identity: Partial<MsixIdentity> | null | undefined, opts?: { store?: boolean }): MsixIdentity
export declare function buildAppxManifest(opts: {
  identity: Partial<MsixIdentity>
  version: string
  displayName: string
  description: string
  store?: boolean
}): string
