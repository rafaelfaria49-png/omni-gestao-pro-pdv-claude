import { describe,it,expect } from "vitest"
import { parseReportQuery,previousQuery,saoPauloDayStart } from "./contracts"
import { csvCell,pdfReport } from "./export"
import type { ReportResponse } from "./contracts"

describe("report query boundaries",()=>{
  it("uses Sao Paulo civil days, independent of process timezone",()=>{
    const q=parseReportQuery(new URLSearchParams("from=2026-11-01&to=2026-11-10"))
    expect(q.start.toISOString()).toBe("2026-11-01T03:00:00.000Z")
    expect(q.end.toISOString()).toBe("2026-11-11T03:00:00.000Z")
    expect(previousQuery(q)).toMatchObject({from:"2026-10-22",to:"2026-10-31"})
  })
  it("handles historical DST midnight and 23-hour day",()=>{
    expect(saoPauloDayStart("2018-11-04").toISOString()).toBe("2018-11-04T03:00:00.000Z")
    expect(saoPauloDayStart("2018-11-05").toISOString()).toBe("2018-11-05T02:00:00.000Z")
  })
  it("compares leap day with preceding February 28",()=>{
    const q=parseReportQuery(new URLSearchParams("from=2024-02-29&to=2024-02-29&compare=year"))
    expect(previousQuery(q)).toMatchObject({from:"2023-02-28",to:"2023-02-28"})
  })
  it.each(["from=2026-02-30&to=2026-03-01","from=2025-01-01&to=2026-11-01","from=2026-11-02&to=2026-11-01","from=2026-11-01&to=2026-11-02&page=-1","from=2026-11-01&to=2026-11-02&pageSize=1000","from=2026-11-01&to=2026-11-02&sort=sql"])("rejects invalid/unbounded query %s",raw=>{
    expect(()=>parseReportQuery(new URLSearchParams(raw))).toThrow()
  })
})
describe("exports",()=>{
  it.each(["=HYPERLINK(1)","  +SUM(1)","\t@SUM(1)","\n-1+1"])("neutralizes formula text %s",text=>expect(csvCell(text)).toContain("'"))
  it("quotes delimiters, quotes and multiline names without altering numeric values",()=>{
    expect(csvCell('A;"B"\nC')).toBe('"A;""B""\nC"')
    expect(csvCell(-12)).toBe('"-12"')
  })
  it("builds a multipage PDF with escaped untrusted operators and valid cross reference",()=>{
    const report={title:"QA (teste) \\ texto",storeId:"qa-a",period:{from:"2026-11-01",to:"2026-11-10"},generatedAt:"2026-11-10T12:00:00Z",basis:"Caixa parcial",source:"PostgreSQL",limitations:["CMV indisponível"],metrics:[],columns:[{key:"name",label:"Nome"}],rows:Array.from({length:100},(_,i)=>({name:`Item ${i} () \\` })),total:100} as unknown as ReportResponse
    const text=Buffer.from(pdfReport(report)).toString("latin1")
    expect(text).toContain("%PDF-1.4")
    expect(text).toContain("/Count 6")
    expect(text).toContain("CMV indisponível")
    const offset=Number(text.match(/startxref\n(\d+)/)?.[1])
    expect(text.slice(offset,offset+4)).toBe("xref")
  })
})
