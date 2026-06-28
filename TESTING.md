# Testing — data accuracy

The browser only shows what the pipeline emits, so the tests guard both halves
of the path from raw SAIGE-GENE+ TSV → JSON → rendered value. Two suites:

## Pipeline (Python / pytest) — `pipeline/tests/`

```bash
cd pipeline
pip install -r requirements.txt   # includes pytest
pytest                            # runs all of tests/
```

- **`test_transform.py`** — the core ETL transform on a synthetic TSV (offline,
  no `gsutil`). Pins the invariants that silently corrupt every number if wrong:
  the Burden β **and** SE come from the *Inverse-variance-weighted* row (not
  Stouffer — the historical `.first()` bug); SKAT/SKAT-O come from Stouffer;
  p-values store as −log10(p) and round-trip; Group/max_MAF map to the canonical
  mask/MAF indices (unknowns dropped); IVW-absent falls back to Stouffer;
  non-finite SE/β become `null` (never the invalid-JSON `Infinity`/`NaN`).
- **`test_wire_contract.py`** — asserts `common.py` and
  `app/src/lib/constants.ts` list ancestries / masks / MAFs in the *same order*,
  since the JSON uses bare integer indices into those lists.
- **`test_built_data.py`** — runs against the local build (`pipeline/build`,
  skipped if absent). Array-length + index-range invariants, browser-valid JSON
  (no `Infinity`/`NaN`), meta-index alignment, and the key **cross-layer
  consistency** check: the per-gene and per-phenotype files are two views of the
  same numbers and must agree exactly for sampled cells.
- **`test_known_biology.py`** — sanity vs established lipid genetics on the built
  data: PCSK9 LoF lowers LDL (β<0), LDLR LoF raises it (β>0), both highly
  significant; the synonymous control is far weaker.

The build-dependent suites skip cleanly until you've run `make full` (or
`make sample`).

## Frontend (TypeScript / vitest) — `app/src/lib/*.test.ts`

```bash
cd app
npm install
npm test           # vitest run  (npm run test:watch for watch mode)
```

- **`format.test.ts`** — `fmtPLog` reconstructs the mantissa/exponent from the
  stored −log10(p) without float underflow at p≈10⁻³⁰⁰, and renormalises the
  mantissa so it never prints `10.00e-n`; plus `fmtP`, `fmtBeta`, `fmtCount`,
  `neglog10`, `pFromNeglog10`.
- **`select.test.ts`** — `phenoRows` / `geneRows` / `forestSeries` filter the
  columnar payloads by mask/MAF/ancestry/test and read the correct parallel
  arrays (incl. het p coming only from the `All` meta row).
- **`effect.test.ts`** — effect-direction wording (binary risk↑/protective↓,
  quantitative higher↑/lower↓) and the β sign convention.
