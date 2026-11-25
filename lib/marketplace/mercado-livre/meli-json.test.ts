import { describe, expect, it } from "vitest"
import { parseMeliJson } from "./meli-json"

const SAFE_MAX = "9007199254740991"
const ABOVE_SAFE_A = "9007199254740992"
const ABOVE_SAFE_B = "9007199254740993"
const INT64_PENULTIMATE = "9223372036854775806"
const INT64_MAX = "9223372036854775807"
const INT64_19_DIGITS = "1000000000000000001"

describe("parseMeliJson — preservação lossless de identificadores externos", () => {
  it("preserva inteiros seguros, MAX_SAFE_INTEGER, acima do limite seguro e Int64 de 19 dígitos", () => {
    const raw = `{
      "id": ${INT64_PENULTIMATE},
      "user_id": ${INT64_MAX},
      "seller_id": ${SAFE_MAX},
      "family_id": ${INT64_19_DIGITS},
      "nested": {
        "id": 1,
        "user_id": 745001,
        "seller_id": ${ABOVE_SAFE_A},
        "family_id": ${ABOVE_SAFE_B}
      }
    }`

    const parsed = parseMeliJson(raw) as Record<string, unknown>
    expect(parsed).toEqual({
      id: INT64_PENULTIMATE,
      user_id: INT64_MAX,
      seller_id: SAFE_MAX,
      family_id: INT64_19_DIGITS,
      nested: {
        id: "1",
        user_id: "745001",
        seller_id: ABOVE_SAFE_A,
        family_id: ABOVE_SAFE_B,
      },
    })
  })

  it("distingue identificadores consecutivos acima do limite seguro sem colisão IEEE 754", () => {
    // Em IEEE 754 Number, 9007199254740992 === 9007199254740993 e 9223372036854775806 === 9223372036854775807.
    expect(Number(ABOVE_SAFE_A)).toBe(Number(ABOVE_SAFE_B))
    expect(Number(INT64_PENULTIMATE)).toBe(Number(INT64_MAX))

    const raw = `{
      "variations": [
        {"id": ${ABOVE_SAFE_A}, "price": 49.90, "available_quantity": 2},
        {"id": ${ABOVE_SAFE_B}, "price": 59.95, "available_quantity": 0},
        {"id": ${INT64_PENULTIMATE}, "price": 129.99, "available_quantity": 10},
        {"id": ${INT64_MAX}, "price": 0.01, "available_quantity": 1}
      ]
    }`

    const parsed = parseMeliJson(raw) as {
      variations: Array<{ id: unknown; price: unknown; available_quantity: unknown }>
    }

    expect(parsed.variations.map((v) => v.id)).toEqual([
      ABOVE_SAFE_A,
      ABOVE_SAFE_B,
      INT64_PENULTIMATE,
      INT64_MAX,
    ])
    expect(parsed.variations[0].id).not.toBe(parsed.variations[1].id)
    expect(parsed.variations[2].id).not.toBe(parsed.variations[3].id)
    expect(parsed.variations.map((v) => v.price)).toEqual([49.9, 59.95, 129.99, 0.01])
    expect(parsed.variations.map((v) => v.available_quantity)).toEqual([2, 0, 10, 1])
  })

  it("preserva identificadores já textuais, User Product ID e campos numéricos sem coerção indevida", () => {
    const raw = `[{
      "code": 200,
      "body": {
        "id": "MLB1234567890123456789",
        "seller_id": "${INT64_PENULTIMATE}",
        "user_product_id": "MLBU9223372036854775807",
        "family_id": "119",
        "price": 199.95,
        "available_quantity": 42,
        "expires_in": 21600,
        "attributes": [{"id": "SELLER_SKU", "value_name": "SKU-01"}],
        "pictures": [{"id": "pic-1", "secure_url": "https://http2.mlstatic.com/D_1.webp"}]
      }
    }]`

    const parsed = parseMeliJson(raw) as Array<{ code: unknown; body: Record<string, unknown> }>
    expect(typeof parsed[0].code).toBe("number")
    expect(parsed[0].code).toBe(200)
    expect(parsed[0].body.id).toBe("MLB1234567890123456789")
    expect(parsed[0].body.seller_id).toBe(INT64_PENULTIMATE)
    expect(parsed[0].body.user_product_id).toBe("MLBU9223372036854775807")
    expect(parsed[0].body.family_id).toBe("119")
    expect(typeof parsed[0].body.price).toBe("number")
    expect(parsed[0].body.price).toBe(199.95)
    expect(typeof parsed[0].body.available_quantity).toBe("number")
    expect(parsed[0].body.available_quantity).toBe(42)
    expect(typeof parsed[0].body.expires_in).toBe("number")
    expect(parsed[0].body.expires_in).toBe(21600)
  })

  it("não corrompe strings contendo conteúdo semelhante a JSON ou escapes Unicode/emoji", () => {
    const jsonLike = '{"id":9223372036854775807,"user_id":9223372036854775806,"seller_id":123}'
    const raw = `{"id":${INT64_PENULTIMATE},"title":${JSON.stringify(jsonLike)},"emoji":"\\uD83D\\uDE00 \\"ok\\" \\\\ / \\b\\f\\n\\r\\t"}`

    const parsed = parseMeliJson(raw) as { id: unknown; title: unknown; emoji: unknown }
    expect(parsed.id).toBe(INT64_PENULTIMATE)
    expect(parsed.title).toBe(jsonLike)
    expect(parsed.emoji).toBe('😀 "ok" \\ / \b\f\n\r\t')
  })

  it("decodifica chaves JSON escapadas antes de preservar identificadores Int64", () => {
    const raw = `{
      "\\u0069d": ${INT64_PENULTIMATE},
      "user_\\u0069d": ${INT64_MAX},
      "seller\\u005fid": ${ABOVE_SAFE_A},
      "fam\\u0069ly_id": ${ABOVE_SAFE_B}
    }`

    expect(parseMeliJson(raw)).toEqual({
      id: INT64_PENULTIMATE,
      user_id: INT64_MAX,
      seller_id: ABOVE_SAFE_A,
      family_id: ABOVE_SAFE_B,
    })
  })

  it("não converte para string valores numéricos negativos, zero, fracionários ou exponenciais em IDs", () => {
    const raw = `{
      "id": -9223372036854775806,
      "user_id": 12.34,
      "seller_id": 1e18,
      "family_id": 0,
      "nested": {
        "id": 12.0,
        "user_id": -1,
        "seller_id": 9.223372036854776e+18,
        "family_id": 1e5
      },
      "price": 1.5e2
    }`

    const parsed = parseMeliJson(raw) as Record<string, unknown> & { nested: Record<string, unknown> }
    expect(typeof parsed.id).toBe("number")
    expect(typeof parsed.user_id).toBe("number")
    expect(typeof parsed.seller_id).toBe("number")
    expect(typeof parsed.family_id).toBe("number")
    expect(typeof parsed.nested.id).toBe("number")
    expect(typeof parsed.nested.user_id).toBe("number")
    expect(typeof parsed.nested.seller_id).toBe("number")
    expect(typeof parsed.nested.family_id).toBe("number")
    expect(parsed.price).toBe(150)
  })

  it("não propaga chave de ID externo para elementos de array", () => {
    const parsed = parseMeliJson(`{"id":[${INT64_PENULTIMATE}]}`) as { id: unknown[] }
    expect(typeof parsed.id[0]).toBe("number")
  })

  it("rejeita explicitamente campos duplicados no mesmo objeto (inclusive com chave escapada)", () => {
    expect(() => parseMeliJson(`{"id":111,"id":${INT64_PENULTIMATE}}`)).toThrow(SyntaxError)
    expect(() => parseMeliJson(`{"user_id":${INT64_PENULTIMATE},"user_\\u0069d":${INT64_MAX}}`)).toThrow(SyntaxError)
    expect(() => parseMeliJson(`{"scope":"read","scope":"read offline_access"}`)).toThrow(SyntaxError)
    expect(() => parseMeliJson(`{"price":10.5,"price":20.5}`)).toThrow(SyntaxError)
  })

  it("não polui Object.prototype com chave __proto__", () => {
    const parsed = parseMeliJson('{"__proto__":{"polluted":true},"id":123}') as Record<string, unknown>
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(parsed, "__proto__")).toBe(true)
    expect(parsed.id).toBe("123")
  })

  it.each([
    "",
    "   ",
    "{",
    "[1,2",
    '{"id":1,}',
    "[1,]",
    "{id:1}",
    "{'id':1}",
    '{"id":01}',
    '{"id":.5}',
    '{"id":1.}',
    '{"id":1e}',
    '{"id":1e+}',
    '{"id":+1}',
    '{"id":NaN}',
    '{"id":Infinity}',
    '{"id":1} trailing',
    '{"s":"\\x41"}',
    '{"s":"\\u123g"}',
    '{"s":"\\u12"}',
    '{"s":"linha\nquebrada"}',
    '{"s":"tab\tnao-escapado"}',
    "truefalse",
    `${"[".repeat(65)}]${"]".repeat(64)}`,
  ])("rejeita JSON inválido (%j)", (invalid) => {
    expect(() => parseMeliJson(invalid)).toThrow(SyntaxError)
  })
})
