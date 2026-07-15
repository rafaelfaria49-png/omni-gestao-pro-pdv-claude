import { XSD_SCHEMA_PACKAGE, type XsdValidationEngine, type XsdValidationResult } from ".."
import { OFFICIAL_XSD_MANIFEST_SHA256 } from "../official-package"

export const TEST_XSD_ENGINE: XsdValidationEngine = {
  name: "xmllint",
  xmllintVersion: "2.15.3",
  libxml2Version: "2.15.3",
  binaryHash: "a".repeat(64),
  schemaPackage: XSD_SCHEMA_PACKAGE,
  schemaManifestHash: OFFICIAL_XSD_MANIFEST_SHA256,
}

export const XSD_OK_ADAPTER = {
  async validate(): Promise<XsdValidationResult> {
    return { valid: true, outcome: "VALIDACAO_APROVADA", issues: [], engine: TEST_XSD_ENGINE, durationMs: 1 }
  },
}
