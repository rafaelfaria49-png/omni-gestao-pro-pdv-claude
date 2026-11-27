import { createRequire } from "node:module"
const require = createRequire("C:/Projetos/omni-gestao/package.json")
const next = require("eslint-config-next/core-web-vitals")
const configuration = [
  { ignores: ["**/.lab/**", "**/scratch/**", "**/evidence/**"] },
  ...next,
  { settings: { "import/resolver": { typescript: { project: "tools/print-core-004b/tsconfig.core.json" } } },
    rules: {
      // Same experimental React Compiler exclusions as the repository configuration.
      "react-hooks/set-state-in-effect": "off", "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off", "react-hooks/purity": "off",
      "react-hooks/rules-of-hooks": "off", "react-hooks/refs": "off",
      "react-hooks/static-components": "off", "import/no-anonymous-default-export": "off",
    } },
  { files: ["**/*.mjs"], languageOptions: { parser: require("espree") } },
  { files: ["lib/print-core-synthetic/**/*.ts"], rules: {
    "no-restricted-imports": ["error", { patterns: ["node:net","node:http","node:https","node:child_process","node:fs","node:worker_threads","ws","@/lib/prisma","@/auth","*hardware-bridge*","*print/raw*"] }],
  } },
]
export default configuration
