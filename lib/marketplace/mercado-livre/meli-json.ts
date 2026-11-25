import "server-only"

const EXTERNAL_ID_KEYS = new Set(["id", "user_id", "seller_id", "family_id"])
const POSITIVE_CANONICAL_INTEGER = /^[1-9][0-9]*$/
const MAX_JSON_DEPTH = 64

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39
}

function isDigit1To9(code: number): boolean {
  return code >= 0x31 && code <= 0x39
}

function hexValue(code: number): number {
  if (code >= 0x30 && code <= 0x39) return code - 0x30
  if (code >= 0x41 && code <= 0x46) return code - 0x37
  if (code >= 0x61 && code <= 0x66) return code - 0x57
  return -1
}

/**
 * Parser JSON estrito (RFC 8259) sem conversão prévia de Int64 para Number.
 *
 * - Compatível com Node 20.20.2 e Node 24 (sem depender de `JSON.parse` `context.source`).
 * - Preserva dígitos exatos como string apenas para inteiros positivos canônicos em campos de
 *   identificador externo (`id`, `user_id`, `seller_id`, `family_id`), inclusive com chaves escapadas.
 * - Mantém números de negócio (preços, quantidades, duração, status HTTP) como `number`.
 * - Mantém números inválidos para ID (zero, negativos, fracionários, notação exponencial) como
 *   `number`, garantindo rejeição fail-closed nos schemas Zod.
 * - Rejeita explicitamente chaves duplicadas no mesmo objeto JSON para evitar ambiguidade.
 */
export function parseMeliJson(body: string): unknown {
  if (typeof body !== "string") {
    throw new SyntaxError("JSON input must be a string")
  }

  const len = body.length
  let pos = 0

  function skipWhitespace(): void {
    while (pos < len) {
      const ch = body.charCodeAt(pos)
      if (ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x0d) {
        pos++
      } else {
        break
      }
    }
  }

  function parseLiteral<T>(expected: string, value: T): T {
    if (!body.startsWith(expected, pos)) {
      throw new SyntaxError(`Unexpected token in JSON at position ${pos}`)
    }
    pos += expected.length
    return value
  }

  function parseString(): string {
    pos++ // opening '"'
    let result = ""
    let chunkStart = pos

    while (pos < len) {
      const ch = body.charCodeAt(pos)
      if (ch === 0x22) {
        result += body.slice(chunkStart, pos)
        pos++
        return result
      }
      if (ch === 0x5c) {
        result += body.slice(chunkStart, pos)
        pos++
        if (pos >= len) {
          throw new SyntaxError("Unterminated escape sequence in JSON string")
        }
        const esc = body.charCodeAt(pos)
        pos++
        switch (esc) {
          case 0x22:
            result += '"'
            break
          case 0x5c:
            result += "\\"
            break
          case 0x2f:
            result += "/"
            break
          case 0x62:
            result += "\b"
            break
          case 0x66:
            result += "\f"
            break
          case 0x6e:
            result += "\n"
            break
          case 0x72:
            result += "\r"
            break
          case 0x74:
            result += "\t"
            break
          case 0x75: {
            if (pos + 4 > len) {
              throw new SyntaxError("Invalid unicode escape in JSON string")
            }
            const h0 = hexValue(body.charCodeAt(pos))
            const h1 = hexValue(body.charCodeAt(pos + 1))
            const h2 = hexValue(body.charCodeAt(pos + 2))
            const h3 = hexValue(body.charCodeAt(pos + 3))
            if (h0 < 0 || h1 < 0 || h2 < 0 || h3 < 0) {
              throw new SyntaxError("Invalid unicode escape in JSON string")
            }
            result += String.fromCharCode((h0 << 12) | (h1 << 8) | (h2 << 4) | h3)
            pos += 4
            break
          }
          default:
            throw new SyntaxError(`Invalid escape character in JSON string at position ${pos - 1}`)
        }
        chunkStart = pos
        continue
      }
      if (ch < 0x20) {
        throw new SyntaxError(`Unescaped control character in JSON string at position ${pos}`)
      }
      pos++
    }

    throw new SyntaxError("Unterminated JSON string")
  }

  function parseNumber(propertyKey: string | null): number | string {
    const start = pos

    if (body.charCodeAt(pos) === 0x2d) {
      pos++
    }

    if (pos >= len) {
      throw new SyntaxError("Invalid JSON number")
    }

    const firstDigit = body.charCodeAt(pos)
    if (firstDigit === 0x30) {
      pos++
      if (pos < len && isDigit(body.charCodeAt(pos))) {
        throw new SyntaxError(`Leading zero in JSON number at position ${start}`)
      }
    } else if (isDigit1To9(firstDigit)) {
      pos++
      while (pos < len && isDigit(body.charCodeAt(pos))) {
        pos++
      }
    } else {
      throw new SyntaxError(`Invalid JSON number at position ${pos}`)
    }

    if (pos < len && body.charCodeAt(pos) === 0x2e) {
      pos++
      if (pos >= len || !isDigit(body.charCodeAt(pos))) {
        throw new SyntaxError(`Invalid fraction in JSON number at position ${pos}`)
      }
      while (pos < len && isDigit(body.charCodeAt(pos))) {
        pos++
      }
    }

    if (pos < len && (body.charCodeAt(pos) === 0x65 || body.charCodeAt(pos) === 0x45)) {
      pos++
      if (pos < len && (body.charCodeAt(pos) === 0x2b || body.charCodeAt(pos) === 0x2d)) {
        pos++
      }
      if (pos >= len || !isDigit(body.charCodeAt(pos))) {
        throw new SyntaxError(`Invalid exponent in JSON number at position ${pos}`)
      }
      while (pos < len && isDigit(body.charCodeAt(pos))) {
        pos++
      }
    }

    const raw = body.slice(start, pos)
    if (propertyKey !== null && EXTERNAL_ID_KEYS.has(propertyKey) && POSITIVE_CANONICAL_INTEGER.test(raw)) {
      return raw
    }
    return Number(raw)
  }

  function parseObject(depth: number): Record<string, unknown> {
    if (depth >= MAX_JSON_DEPTH) {
      throw new SyntaxError("JSON nesting depth exceeded")
    }

    pos++ // opening '{'
    skipWhitespace()

    const obj: Record<string, unknown> = {}
    if (pos < len && body.charCodeAt(pos) === 0x7d) {
      pos++
      return obj
    }

    const seenKeys = new Set<string>()
    while (true) {
      skipWhitespace()
      if (pos >= len || body.charCodeAt(pos) !== 0x22) {
        throw new SyntaxError(`Expected JSON object key at position ${pos}`)
      }
      const key = parseString()
      if (seenKeys.has(key)) {
        throw new SyntaxError(`Duplicate JSON object key: ${key}`)
      }
      seenKeys.add(key)

      skipWhitespace()
      if (pos >= len || body.charCodeAt(pos) !== 0x3a) {
        throw new SyntaxError(`Expected ':' after JSON object key at position ${pos}`)
      }
      pos++

      const value = parseValue(key, depth + 1)
      Object.defineProperty(obj, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      })

      skipWhitespace()
      if (pos >= len) {
        throw new SyntaxError("Unterminated JSON object")
      }
      const next = body.charCodeAt(pos)
      if (next === 0x7d) {
        pos++
        return obj
      }
      if (next !== 0x2c) {
        throw new SyntaxError(`Expected ',' or '}' in JSON object at position ${pos}`)
      }
      pos++
    }
  }

  function parseArray(depth: number): unknown[] {
    if (depth >= MAX_JSON_DEPTH) {
      throw new SyntaxError("JSON nesting depth exceeded")
    }

    pos++ // opening '['
    skipWhitespace()

    const arr: unknown[] = []
    if (pos < len && body.charCodeAt(pos) === 0x5d) {
      pos++
      return arr
    }

    while (true) {
      arr.push(parseValue(null, depth + 1))
      skipWhitespace()
      if (pos >= len) {
        throw new SyntaxError("Unterminated JSON array")
      }
      const next = body.charCodeAt(pos)
      if (next === 0x5d) {
        pos++
        return arr
      }
      if (next !== 0x2c) {
        throw new SyntaxError(`Expected ',' or ']' in JSON array at position ${pos}`)
      }
      pos++
    }
  }

  function parseValue(propertyKey: string | null, depth: number): unknown {
    skipWhitespace()
    if (pos >= len) {
      throw new SyntaxError("Unexpected end of JSON input")
    }

    const ch = body.charCodeAt(pos)
    if (ch === 0x7b) return parseObject(depth)
    if (ch === 0x5b) return parseArray(depth)
    if (ch === 0x22) return parseString()
    if (ch === 0x74) return parseLiteral("true", true)
    if (ch === 0x66) return parseLiteral("false", false)
    if (ch === 0x6e) return parseLiteral("null", null)
    if (ch === 0x2d || isDigit(ch)) return parseNumber(propertyKey)

    throw new SyntaxError(`Unexpected token in JSON at position ${pos}`)
  }

  const value = parseValue(null, 0)
  skipWhitespace()
  if (pos !== len) {
    throw new SyntaxError(`Unexpected trailing token in JSON at position ${pos}`)
  }
  return value
}
