# BRaVa browser ETL.
#
#   make meta     # gene + phenotype indexes -> ../app/public/data/meta
#   make sample   # small local dataset for dev (a few traits + example genes)
#   make full     # full dataset -> ./build  (then: make upload)
#   make upload    # push ./build to the public GCS bucket (gzip-transcoded)

OUT_DEV  ?= ../app/public/data
OUT_FULL ?= build
BUCKET   ?= gs://brava-meta-analysis-public/browser

SAMPLE_PHENOS ?= LDLC,T2Diab,Height,CAD,AFib
SAMPLE_GENES  ?= PCSK9,LDLR,APOB,TTN,GIGYF1,BRCA2,APOC3,ANGPTL3,ASGR1,GCK,PCSK1,MC4R

.PHONY: meta sample full upload clean

meta:
	python build_annotation.py --out $(OUT_DEV)
	python build_phenotypes.py --out $(OUT_DEV)

sample: meta
	python build_data.py --out $(OUT_DEV) --phenos $(SAMPLE_PHENOS) --genes $(SAMPLE_GENES)

full:
	python build_annotation.py --out $(OUT_FULL)
	python build_phenotypes.py --out $(OUT_FULL)
	python build_data.py --out $(OUT_FULL) --phenos all --genes all --gene-shards 16

upload:
	# -Z gzip-transcodes (sets Content-Encoding: gzip); object names stay .json.
	gsutil -m -h "Cache-Control:public,max-age=86400" cp -Z -r $(OUT_FULL)/meta $(BUCKET)/
	gsutil -m -h "Cache-Control:public,max-age=86400" cp -Z -r $(OUT_FULL)/gene $(BUCKET)/
	gsutil -m -h "Cache-Control:public,max-age=86400" cp -Z -r $(OUT_FULL)/phenotype $(BUCKET)/

clean:
	rm -rf $(OUT_FULL) _tmp
