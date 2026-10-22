/** Test-only claims for existing, explicitly authorized synthetic identities.
 * Production identity always comes from auth.ts and persistent memberships.
 */
import { MODULES } from "./access-policy"

export function legacyAccessFixture(input: {
  role: string; storeAccess: "all" | "restricted"; allowedStoreIds?: string[]
}) {
  const platformAuthority = input.storeAccess === "all" && ["ADMIN", "SUPER_ADMIN"].includes(input.role)
  return {
    platformAuthority, accessScope: platformAuthority ? "PLATFORM" : "STORE",
    storeModules: Object.fromEntries((input.allowedStoreIds ?? []).map((id) => [id, [...MODULES]])),
  }
}
