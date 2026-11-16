"""QA independente: PDFium renderiza o PDF real; ZXing-C++ lê o raster, sem reutilizar bwip-js."""
import json
from pathlib import Path
import importlib.metadata
import pypdfium2 as pdfium
from pypdf import PdfReader
import zxingcpp

root = Path("test-results/vestuario-p03/pdf")
metrics = json.loads((root / "metrics.json").read_text(encoding="utf-8"))
proofs = []
for sample in metrics:
    file = root / (sample["media"] + ".pdf")
    doc = pdfium.PdfDocument(str(file))
    reader = PdfReader(file)
    for index, page in enumerate(doc):
        text = reader.pages[index].extract_text()
        assert "SKU:" in text and sample["codigo"] in text and "49,90" in text
        for dpi in (203, 300):
            bitmap = page.render(scale=dpi / 72).to_pil()
            image = root / f'{sample["media"]}-p{index + 1}-{dpi}dpi.png'
            bitmap.save(image)
            barcodes = zxingcpp.read_barcodes(bitmap)
            values = [b.text for b in barcodes if b.format == zxingcpp.BarcodeFormat.Code128]
            assert values == [sample["codigo"]], f"PDF não decodificado: {image}: {values}"
            proofs.append({"file": file.name, "page": index + 1, "dpi": dpi, "decoded": values[0], "format": "Code128", "pixels": bitmap.size})
    doc.close()
result = {"status": "PASS", "versions": {key: importlib.metadata.version(key) for key in ("pypdfium2", "pypdf", "zxing-cpp", "Pillow")}, "checks": proofs,
          "physicalHomologation": "NOT_EXECUTED", "note": "Rasterização/decodificação automatizada não mede tolerância de impressora, mídia, DPI real ou leitor físico."}
(root / "independent-decoding.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"PASS: {len(proofs)} páginas/rasterizações decodificadas independentemente (203/300 DPI); homologação física NÃO EXECUTADA.")
