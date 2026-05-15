import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  "app/dashboard/page.tsx",
  "components/painel-inicial/CriticalStock.tsx",
  "components/painel-inicial/RecentActivityTable.tsx",
];

for (const rel of targets) {
  const p = path.join(root, rel);
  let c = fs.readFileSync(p, "utf8");
  const next = c.replace(/<\/?motion\.div/g, (m) => m.replace("motion.", ""));
  if (next !== c) {
    fs.writeFileSync(p, next);
    console.log("fixed", rel);
  }
}
