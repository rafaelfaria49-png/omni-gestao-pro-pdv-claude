"""QA independente: PDFium renderiza o PDF real; ZXing-C++ lê o raster, sem reutilizar bwip-js."""
import json
import argparse
from pathlib import Path
import importlib.metadata
import pypdfium2 as pdfium
from pypdf import PdfReader
import zxingcpp

parser = argparse.ArgumentParser()
parser.add_argument("--e2e", action="store_true", help="Decodifica os bytes reais recebidos pelo browser autenticado.")
args = parser.parse_args()
root = Path("test-results/vestuario-p03-e2e/pdf" if args.e2e else "test-results/vestuario-p03/pdf")
if args.e2e:
    codes = json.loads((root / "expected.json").read_text(encoding="utf-8"))["codes"]
    assert 0 < len(codes) <= 500
    samples = [(root / "lote-real-api.pdf", codes, None)]
else:
    metrics = json.loads((root / "metrics.json").read_text(encoding="utf-8"))
    samples = [(root / (s["media"] + ".pdf"), None, s["codigo"]) for s in metrics]
proofs = []
for file, codes, sample_code in samples:
    doc = pdfium.PdfDocument(str(file))
    reader = PdfReader(file)
    if codes is not None:
        assert len(doc) == len(codes), "PDF HTTP deve conter todas as etiquetas do snapshot."
    for index, page in enumerate(doc):
        code = codes[index] if codes is not None else sample_code
        text = reader.pages[index].extract_text()
        assert "SKU:" in text and code in text
        if not args.e2e:
            assert "49,90" in text
        for dpi in (203, 300):
            bitmap = page.render(scale=dpi / 72).to_pil()
            image = root / f'{file.stem}-p{index + 1}-{dpi}dpi.png'
            bitmap.save(image)
            barcodes = zxingcpp.read_barcodes(bitmap)
            values = [b.text for b in barcodes if b.format == zxingcpp.BarcodeFormat.Code128]
            assert values == [code], f"PDF não decodificado: {image}: {values}"
            proofs.append({"file": file.name, "page": index + 1, "dpi": dpi, "decoded": values[0], "format": "Code128", "pixels": bitmap.size})
    doc.close()
result = {"status": "PASS", "versions": {key: importlib.metadata.version(key) for key in ("pypdfium2", "pypdf", "zxing-cpp", "Pillow")}, "checks": proofs,
          "physicalHomologation": "NOT_EXECUTED", "note": "Rasterização/decodificação automatizada não mede tolerância de impressora, mídia, DPI real ou leitor físico."}
(root / "independent-decoding.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"PASS: {len(proofs)} páginas/rasterizações decodificadas independentemente (203/300 DPI); homologação física NÃO EXECUTADA.")
