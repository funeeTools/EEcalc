# Aperture Diagonal — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/aperture-diagonal` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-aperture-diagonal.test.ts`

## Purpose and scope
A rectangular pin, tab or cutout made with round tools: the diagonal of an L × W rectangle, the smallest stocked drill that covers it (with an IPC-7251 lead clearance), and the opening a router leaves, with corner reliefs. Solve d, L or W.

**It is not a stencil page.** The name suggests stencil apertures, but the reference calculator's page of the same name is about round tools. Stencils live on `pcb/solder-paste` only.

## Model and why
- Rectangle in a circle: d = √(L² + W²) (Euclid III.31). The L or W for a given d is √(d² − other²) (no solution when d is not longer than the other side).
- Drilled hole for a rectangular lead: IPC-7251 draft 1 sizes a plated hole as the maximum lead dimension plus 0.25 / 0.20 / 0.15 mm for density levels A / B / C. The diagonal is the dimension that must pass, so the finished hole D ≥ d + c; the covering hole is the next size at or above d + c on the fabricator's grid (default 0.05 mm steps, minimum 0.15 mm, largest 6.5 mm). Above the largest drill the page says to route.
- Routed opening: the cutter radius r = d_r/2 leaves inside corners of radius r. Growth per side that keeps clearance c/2 at the part's corners as well as the flats is g = max(c/2, r − (r − c/2)/√2) (≈ 0.293 r for c = 0). A dog-bone relief (cutter centre r/√2 in from both edges) is the alternative; a pocket with radius-r corners loses (4 − π)r² of area.

## Deliberate choices — ask before changing
- **Scope follows the reference calculator's feature list, not the coordinator's stencil guess** (builder, 2026-11-25; the coordinator's brief had assumed IPC-7525 stencil checks). IPC-7525 is not cited here.
- **Corner growth keeps half the clearance at the part's corners** (reviewer bug, fixed 2026-11-25): the first version used max(c/2, r(1 − 1/√2)), which left the corners nearly touching the fillet (0.038 mm against the intended 0.1 mm).
- The covering-hole table uses the same (1 + 1e-9) slack at the largest drill as the results (reviewer, fixed).
- Gap labels: (D − W)/2 is the gap at the long flat faces (reviewer, fixed: they were swapped).
- Default: 0.64 mm square post, level B (c = 0.2 mm): diagonal 0.905 mm, d + c = 1.105 mm, covering hole 1.15 mm on the 0.05 mm grid (a test states this); 0.5 mm cutter; defaults raise no warnings.
- Drawing: two top views on one scale, drilled and routed, on the PCB kit. `solder` is used only for a tin-plated pin; any other part to clear (e.g. an M3 slot) is drawn with `part`, so legend meanings keep their colour's meaning (reviewer, §7b). Dimensions show live values.

## Sources
- IPC-7251 draft 1 (2008) allowances 0.25 / 0.20 / 0.15 mm: **not read from the standard.** Checked by the reviewer in footag's `ipc7251draft1.c` (`hole = {M 0.25, N 0.20, L 0.15}`).
- Euclid III.31. The 3-4-5 case (2 mm opening, 2.5 mm drill) is the reference calculator's worked example and a test.
- Geometry (fillet relief, dog-bone centre at r/√2, lost area) confirmed by the reviewer's own reference; Python brute-force fillet check at 1e-9.

## Known limits and open items
- Drill grid and levels are generic; the fabricator's real stock sizes win.
- Labels L_o and r can collide at extreme sizes; one fix was requested after the final harness run (below) and I did not check its state in the code.

## Review history
- shell-tab (1.7 × 0.6 mm, D 2.05 mm) showed 725 µm at the short sides and 175 µm at the long sides: swapped. Fixed.
- Routed growth gave the part corners 0.038 mm (default) and 0.017 mm (shell-tab) instead of c/2. Fixed.
- L = √(6.3² − 1) mm, W = 1 mm, level B: the results showed a 6.5 mm hole but the table row said "route". Fixed.
- Dimensions had no values; `solder` colour reused for non-pin parts. Fixed.
- Harness: label "L_o = …" overlapped "r" in the routed view ("Widest 2 mm opening one 2.5 mm drill covers" → Length ÷10 and → Diagonal ×10). Sent back to the builder for a fix.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-25, reviewed and fixed 2026-11-25 (swapped gap labels, corner growth, table slack, dimension values), label overlap fix 2026-11-25.
