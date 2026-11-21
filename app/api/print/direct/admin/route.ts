/** OMNI-PRINT-004C candidate — disabled unless the owner-approval gate is open (lib/printing/direct/activation.ts). */
import * as direct from "@/lib/printing/direct/http"
import { directPrintDeps } from "@/lib/printing/direct/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = (req: Request) => direct.adminList(req, directPrintDeps())
export const POST = (req: Request) => direct.adminAction(req, directPrintDeps())
