# UI follow-ups

Small polish items noted for later.

## Gene table: header/body cell-divider misalignment

The per-ancestry grid header's group-cell outline doesn't line up with the body
rows. Specifically the **bottom-left corner of the "P-value" group-header cell**
doesn't align with the vertical divider of the second (body) row's first
P-value cell.

Likely cause: header groups render one flex row per level with padding on an
inner wrapper, while body cells distribute width by flex-basis:0 weights
([VirtualTable.tsx](../app/src/components/VirtualTable.tsx) — see the comment
about per-cell padding skewing width distribution). The group-header divider and
the leaf-column divider are computed on slightly different boxes, so the left
rule of the "P-value" block is a hair off from the body cell divider below it.

Fix direction: ensure the divider (left rule) is drawn on the same box/weight
for group headers, leaf headers, and body cells — e.g. move the divider onto the
flex item itself (consistently) rather than the padded inner wrapper, or share a
single border-position helper across header + body.
