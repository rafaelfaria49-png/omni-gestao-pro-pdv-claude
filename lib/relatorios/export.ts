import type { Cell, ReportResponse } from "./contracts"
import { formatCell } from "./format"
export function csvCell(value: Cell): string {
  let text=String(value ?? "Indisponível")
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/u.test(text)) text="'"+text
  return `"${text.replace(/"/g,'""')}"`
}
export function csvReport(report: ReportResponse): string {
  const rows: Cell[][] = [[report.title], ["Loja",report.storeId], ["Período São Paulo",report.period.from,report.period.to], ["Gerado em",report.generatedAt],
    ["Regime / base",report.basis], ["Fontes",report.source], ...report.limitations.map(x=>["Limitação",x]), [],
    ["Indicador","Valor","Motivo"], ...report.metrics.map(m=>[m.label,m.value,m.value===null?m.reason??"Sem cobertura suficiente":""]), [],
    report.columns.map(c=>c.label), ...report.rows.map(r=>report.columns.map(c=>r[c.key]??null))]
  return "\ufeff"+rows.map(r=>r.map(csvCell).join(";")).join("\r\n")+"\r\n"
}

/** Small dependency-free, multipage text PDF. Strings are data, never PDF operators. */
export function pdfReport(report: ReportResponse): Uint8Array {
  const clean=(s:string)=>s.normalize("NFC").replace(/[^\x20-\x7e\xa0-\xff]/g," ")
  const escape=(s:string)=>clean(s).replace(/([\\()])/g,"\\$1")
  const wrap=(text:string,width=104):string[]=>{
    const lines:string[]=[]
    for(const paragraph of text.split(/\r?\n/)) {
      let rest=paragraph
      while(rest.length>width){ let cut=rest.lastIndexOf(" ",width); if(cut<width/2)cut=width; lines.push(rest.slice(0,cut));rest=rest.slice(cut).trimStart() }
      lines.push(rest)
    }
    return lines
  }
  const lines=[report.title,`Loja: ${report.storeId} | ${report.period.from} a ${report.period.to} (America/Sao_Paulo)`,
    `Gerado: ${formatCell(report.generatedAt,"date")} | ${report.total} registros`,...wrap(report.basis),...wrap(`Fontes: ${report.source}`),"",
    ...report.metrics.flatMap(m=>wrap(`${m.label}: ${formatCell(m.value,m.format)}${m.value===null?` - ${m.reason??"Sem cobertura suficiente"}`:""}`)),"Limitações:",
    ...report.limitations.flatMap(l=>wrap(l)),"","Registros:",
    ...report.rows.flatMap((row,i)=>[`${i+1}.`,...report.columns.flatMap(c=>wrap(`${c.label}: ${formatCell(row[c.key],c.format)}`)),""])]
  const pages:string[][]=[]
  for(let i=0;i<lines.length;i+=53)pages.push(lines.slice(i,i+53))
  const objects:string[]=["", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]
  const pageIds:number[]=[]
  pages.forEach((page,index)=>{
    const pageId=objects.length+1,streamId=pageId+1
    pageIds.push(pageId)
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`)
    const text=`BT /F1 9 Tf 40 802 Td 14 TL ${page.map((line,i)=>`${i?"T* ":""}(${escape(line)}) Tj`).join("\n")} T* (Pagina ${index+1}/${pages.length}) Tj ET`
    objects.push(`<< /Length ${Buffer.byteLength(text,"latin1")} >>\nstream\n${text}\nendstream`)
  })
  objects[0]="<< /Type /Catalog /Pages 2 0 R >>"
  objects[1]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`
  let pdf="%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
  const offsets=[0]
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf,"latin1"));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`})
  const xref=Buffer.byteLength(pdf,"latin1")
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,"0")+" 00000 n \n").join("")}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Uint8Array(Buffer.from(pdf,"latin1"))
}
