import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { describe, expect, it } from "vitest"

describe("offline module boundary", () => {
  it("has no operational imports, environment access, network calls, logging or live clock", () => {
    const directory = fileURLToPath(new URL(".", import.meta.url))
    const files = readdirSync(directory).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && file !== "fixtures.ts")
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const parsed = ts.createSourceFile(file, readFileSync(directory + "/" + file, "utf8"), ts.ScriptTarget.Latest, true)
      const visit = (node: ts.Node) => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
          expect(ts.isStringLiteral(node.moduleSpecifier)).toBe(true)
          const module = (node.moduleSpecifier as ts.StringLiteral).text
          expect(module.startsWith("./") || module === "node:crypto", file).toBe(true)
          expect(module).not.toContain("fixtures")
        }
        if (ts.isCallExpression(node)) {
          const call = node.expression.getText(parsed)
          expect(["fetch", "require", "Date.now", "setTimeout", "setInterval", "eval"].includes(call), file).toBe(false)
          expect(call.startsWith("console.") || node.expression.kind === ts.SyntaxKind.ImportKeyword, file).toBe(false)
        }
        if (ts.isPropertyAccessExpression(node)) expect(node.getText(parsed), file).not.toBe("process.env")
        ts.forEachChild(node, visit)
      }
      visit(parsed)
    }
  })
})
