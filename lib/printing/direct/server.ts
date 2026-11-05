import "server-only"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { directPrintRuntimeFromEnv } from "./activation"
import { prismaDatabase } from "./db"
import type { DirectPrintDeps } from "./http"

/** Real runtime dependencies for the Next route files. Disabled unless the 004C gate is open (see activation.ts). */
export function directPrintDeps(): DirectPrintDeps {
  return {
    runtime: directPrintRuntimeFromEnv(),
    db: prismaDatabase(prisma as unknown as Parameters<typeof prismaDatabase>[0]),
    getSession: () => auth(),
  }
}
