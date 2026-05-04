/**
 * Convert `oklch(...)` assignments inside selected theme blocks in `app/globals.css`
 * into HSL *channels* (`H S% L%`) for use with `hsl(var(--token) / <alpha-value>)`.
 */

import fs from "node:fs";
import path from "node:path";
import { convertRgbToHsl, formatCss, formatHex, parse } from "culori";

const root = process.cwd();
const file = path.join(root, "app", "globals.css");

function convertOklchValue(raw) {
  const m = String(raw).trim().match(/^oklch\(([^)]+)\)\s*;?$/i);
  if (!m) return null;
  const inner = m[1].replace(/\s+/g, " ").trim();
  const parts = inner.split("/");
  const coords = parts[0].trim().split(/\s+/).map(Number);
  if (coords.length < 3 || coords.some((n) => Number.isNaN(n))) return null;

  const alpha = parts[1] != null ? Number(parts[1].trim()) : undefined;
  const color = {
    mode: "oklch",
    l: coords[0],
    c: coords[1],
    h: coords[2],
    ...(Number.isFinite(alpha) ? { alpha } : {}),
  };

  const hex = formatHex(color);
  if (!hex) return null;
  const rgb = parse(hex);
  const hsl = convertRgbToHsl(rgb);
  if (!hsl || hsl.mode !== "hsl") return null;
  const css = formatCss(hsl);
  const innerHsl = css
    .replace(/^hsl\((.+)\)$/i, "$1")
    .trim()
    .replace(/\bnone\b/gi, "0");
  return innerHsl;
}

const BLOCK_HEADERS = [
  /^\.soft-ice\s*\{/,
  /^\.midnight\s*\{/,
  /^\.black-edition\s*\{/,
  /^html\.light\[data-studio-theme="classic"\]\s*\{/,
];

let css = fs.readFileSync(file, "utf8");
const lines = css.split(/\r?\n/);
const out = [];
/** @type {number | null} */
let braceBalance = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();

  if (braceBalance === null && BLOCK_HEADERS.some((re) => re.test(trimmed))) {
    braceBalance = 0;
  }

  let replaced = false;
  if (braceBalance !== null) {
    // Inside (or on the opening line of) a target block: convert assignments first.
    if (braceBalance > 0 || trimmed.endsWith("{")) {
      const m = line.match(/^(\s*--[a-zA-Z0-9-]+:\s*)([^;]+);(\s*)$/);
      if (m) {
        const value = m[2].trim();
        if (value.startsWith("oklch(") && !value.includes("linear-gradient")) {
          const ch = convertOklchValue(value);
          if (ch) {
            out.push(`${m[1]}${ch};${m[3] || ""}`);
            replaced = true;
          }
        }
      }
    }

    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    braceBalance += opens - closes;
    if (braceBalance <= 0) {
      braceBalance = null;
    }
  }

  if (!replaced) out.push(line);
}

fs.writeFileSync(file, out.join("\n"), "utf8");
console.log("Updated", path.relative(root, file));
