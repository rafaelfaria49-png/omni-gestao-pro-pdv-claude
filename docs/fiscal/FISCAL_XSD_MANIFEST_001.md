# Manifesto do pacote XSD oficial da NFC-e

| Campo | Valor |
|---|---|
| Autoridade | Portal Nacional da NF-e |
| Índice | `https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w%3D` |
| Download | `https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=akib2DRpJN4%3D` |
| Pacote | `PL_010e_v1.02.zip` |
| Rótulo | Schemas XML NF-e 010e v1.02 — NT 2025.002 v1.40, NT 2026.002 v1.0 e NT 2026.003 v1.0 |
| Publicação / captura | 10/07/2026 / 14/07/2026 07:03:01 -03:00 |
| Leiaute / modelo | 4.00 / NFC-e 65 |
| ZIP | 41.335 bytes; SHA-256 `d44ae5aa6a0d1cabf6235d2d2d47b75be5dd87bc6b90a7ec3dcec99c3d41bda1` |
| Manifesto | `lib/fiscal/xsd/manifest.json`; SHA-256 `fc42d03e1c4a676d5ea5fe813cd2941672caa18540856cac5208ccdff049cae1` |

| Arquivo | Bytes | SHA-256 |
|---|---:|---|
| `nfe_v4.00.xsd` | 716 | `adce3646c13ceb54922ec3142fc1dc45bd4fb839ac35ad583e86c733c07d27df` |
| `leiauteNFe_v4.00.xsd` | 352.527 | `598c71780cbc6b54f170464bd6d5538c2d01a99d987a1666b662d4e166b84bf7` |
| `tiposBasico_v4.00.xsd` | 22.532 | `772619c85723e598840667ca66e7298a250442df47eeb94b397d2a333ce62047` |
| `DFeTiposBasicos_v1.00.xsd` | 61.958 | `7fe1dbd89a1dd80826c5134c2406b7eb5df4fa7a9177c5aa6e72319caba7c6d2` |
| `xmldsig-core-schema_v1.01.xsd` | 3.747 | `f56744a5f51c03f027de13f39f869307091781a9ef1d91b1ebe14719ce28e1ac` |

```text
nfe_v4.00.xsd
└── leiauteNFe_v4.00.xsd
    ├── xmldsig-core-schema_v1.01.xsd
    ├── tiposBasico_v4.00.xsd
    └── DFeTiposBasicos_v1.00.xsd
```

Nenhum XSD foi modificado. Startup e validação conferem tamanho/hash, rejeitam symlink, traversal e
dependência fora da allowlist. Reprodução: `npm run fiscal:xsd:verify-hashes`.
