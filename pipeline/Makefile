# BRaVa browser ETL.
#
#   make meta     # gene + phenotype indexes -> ../app/public/data/meta
#   make sample   # small local dataset for dev (a few traits + example genes)
#   make full     # full dataset -> ./build  (then: make upload)
#   make upload    # push ./build to the public GCS bucket (gzip-transcoded)
#
# Variant (v2):
#   make full-variants   # build variant JSON -> ./build/variant
#   make upload-variants # upload to Cloudflare R2 brava-browser bucket, v2/ prefix
#
# Cloudflare R2 upload requires rclone configured with an R2 S3-compatible remote.
# Set R2_REMOTE to match your rclone remote name (default: r2):
#   rclone config  # one-time setup; see docs/r2-rclone-setup.md

OUT_DEV  ?= ../app/public/data
OUT_FULL ?= build
BUCKET   ?= gs://brava-meta-analysis-public/browser

# R2 target (rclone remote:bucket/prefix).
R2_REMOTE ?= r2
R2_BUCKET ?= brava-browser
# Gzip-transcode staging dir (see upload-variants).
VARIANT_GZ := $(OUT_FULL)/variant.gz

SAMPLE_PHENOS ?= LDLC,T2Diab,Height,CAD,AFib
SAMPLE_GENES  ?= PCSK9,LDLR,APOB,TTN,GIGYF1,BRCA2,APOC3,ANGPTL3,ASGR1,GCK,PCSK1,MC4R

# Meta indexes for build_variants.py: prefer a fresh full-build output; fall
# back to the bundled app indexes (always up to date after `make meta`).
META_DIR ?= $(shell [ -f $(OUT_FULL)/meta/genes.json ] && echo $(OUT_FULL)/meta || echo $(OUT_DEV)/meta)

.PHONY: meta sample full upload clean \
        sample-variants full-variants upload-variants copy-variant-split

# build_phenotypes / build_biobanks fetch the supp tables from medRxiv (cached).
meta:
	python build_annotation.py --out $(OUT_DEV)
	python build_phenotypes.py --out $(OUT_DEV)
	python build_biobanks.py --out $(OUT_DEV)

sample: meta
	python build_data.py --out $(OUT_DEV) --phenos $(SAMPLE_PHENOS) --genes $(SAMPLE_GENES)

full:
	python build_annotation.py --out $(OUT_FULL)
	python build_phenotypes.py --out $(OUT_FULL)
	python build_biobanks.py --out $(OUT_FULL)
	python build_data.py --out $(OUT_FULL) --phenos all --genes all --gene-shards 16

upload:
	# -Z gzip-transcodes (sets Content-Encoding: gzip); object names stay .json.
	gsutil -m -h "Cache-Control:public,max-age=86400" cp -Z -r $(OUT_FULL)/meta $(BUCKET)/
	gsutil -m -h "Cache-Control:public,max-age=86400" cp -Z -r $(OUT_FULL)/gene $(BUCKET)/
	gsutil -m -h "Cache-Control:public,max-age=86400" cp -Z -r $(OUT_FULL)/phenotype $(BUCKET)/

# --- variant-level (v2) --------------------------------------------------------
# Requires meta indexes (genes.json + phenotypes.json) for gene-body overlap.
# Uses META_DIR (see above): prefers build/meta if it exists, else app/public/data/meta.

sample-variants: meta
	python build_variants.py --out $(OUT_DEV) --phenos $(SAMPLE_PHENOS) --genes $(SAMPLE_GENES) \
	  --meta-dir $(OUT_DEV)/meta

full-variants:
	python build_variants.py --out $(OUT_FULL) --phenos all --genes all --gene-shards 16 \
	  --meta-dir $(META_DIR)
	@echo ""
	@echo "Build complete. Next steps:"
	@echo "  1. make copy-variant-split   # update the bundled variant_split.json"
	@echo "  2. make upload-variants      # push variant JSON to R2"

# Copy the pipeline-generated split manifest into the bundled app so the
# frontend knows which genes use per-phenotype file splitting.
copy-variant-split:
	cp $(OUT_FULL)/meta/variant_split.json $(OUT_DEV)/meta/variant_split.json
	@echo "Copied variant_split.json -> $(OUT_DEV)/meta/variant_split.json"
	@echo "Commit this file before pushing to main."

# Upload variant JSON to Cloudflare R2 (immutable caching; served at VITE_VARIANT_BASE_URL/v2/).
# Requires rclone configured with an R2 S3-compatible remote (R2_REMOTE=r2 by default).
#
# rclone (unlike `gsutil -Z`) has no gzip-transcode, so we compress a staging
# copy and upload it with `Content-Encoding: gzip` — matching how v1 objects are
# stored on R2 (browsers decompress transparently; keeps storage ~4x smaller,
# under the 10 GB free-tier ceiling). Build output stays plain JSON for local dev.
# --checksum skips re-uploading unchanged files; --transfers 16 saturates bandwidth.
upload-variants:
	@echo "Gzip-transcoding $(OUT_FULL)/variant -> $(VARIANT_GZ) ..."
	rm -rf $(VARIANT_GZ)
	@cd $(OUT_FULL)/variant && find . -type d -print0 | \
	  xargs -0 -I{} mkdir -p "$(abspath $(VARIANT_GZ))/{}"
	@cd $(OUT_FULL)/variant && find . -type f -name '*.json' -print0 | \
	  xargs -0 -P 8 sh -c 'for f; do gzip -9 -c "$$f" > "$(abspath $(VARIANT_GZ))/$$f"; done' _
	@echo "Staged $$(find $(VARIANT_GZ) -type f | wc -l | tr -d ' ') gzipped files ($$(du -sh $(VARIANT_GZ) | cut -f1))."
	rclone copy --progress --checksum --transfers 16 \
	  --header-upload "Content-Encoding: gzip" \
	  --header-upload "Content-Type: application/json" \
	  --header-upload "Cache-Control: public, max-age=31536000, immutable" \
	  $(VARIANT_GZ) $(R2_REMOTE):$(R2_BUCKET)/v2/variant
	@echo "Upload complete. Total R2 usage:"
	rclone size $(R2_REMOTE):$(R2_BUCKET)

clean:
	rm -rf $(OUT_FULL) $(VARIANT_GZ) _tmp _tmp_variant
