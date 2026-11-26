# BGA Land Pad — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/bga-land-pad` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-bga-land-pad.test.ts`

## Purpose and scope
BGA land (pad) diameter from the ball, or a check of an existing land (its percentage, judged against the table's land variation); NSMD or SMD mask opening; mask web; traces between lands. Rules: IPC-7351B tables, IPC-7352 levels A/B/C, match the package pad (TI), or custom. The IPC table at the chosen pitch is shown, with TI's Table 2-1.

Not covered: stencil apertures (`pcb/solder-paste`), via-in-pad drill, dog-bone fan-out (`pcb/bga-breakout`).

## Model and why
- **IPC-7351B §14 Table 14-5** (collapsing balls) and **Table 14-6** (non-collapsing): land = ball reduced by 25 % (0.55–0.75 mm balls), 20 % (0.25–0.50), 15 % (0.15–0.20), or enlarged by 15 / 10 / 5 % for non-collapsing, rounded to a 0.05 mm grid (0.01 mm for the smallest balls), each with a land variation MMC–LMC. A ball between two rows takes the smaller ball's row (PCB Libraries forum guidance; same as the reference calculator).
- **IPC-7352 (2023)** levels: collapsing balls reduced 15 / 20 / 25 % at A / B / C; non-collapsing enlarged 15 / 10 / 5 %.
- **Package-pad rule** (TI SPRAA99C §2.1, Table 3-4): board land equal to the package's ball pad for optimum reliability; for NSMD the land is 90 % of the package pad, the SMD opening 100 %. TI Table 2-1 gives optimum lands by pitch (e.g. 0.8 mm: 0.400 / 0.500 mm).
- Channel between lands: N = ⌊(g − s)/(W + s)⌋ with g = p − D, imported from `bga-breakout/model`.

## Deliberate choices — ask before changing
- **Table 14-6, 0.45 mm row corrected from 0.55–0.40 to 0.55–0.45** (builder, kept by the reviewer as defensible; 2026-11-25). Altium's transcription prints a 0.15 mm spread where every other row spans 0.10 mm. The correction is stated on the page (theory and table note), not only in a code comment, and a test pins the row.
- Table 14-5's uneven rows (0.30: 0.25–0.20; 0.25: 0.20–0.17) are **kept as printed**: they still contain their nominal and their spreads match the neighbouring rows, so nothing marks them as misprints. The 0.17 mm collapsing row (0.1445 rounds to 0.15) is the stated exception to "every nominal is ball × (1 ∓ r) rounded".
- **The IPC-7351B range is informational under IPC-7352 levels and the package-pad rule** (reviewer, fixed 2026-11-25): a designer following the newer standard must not get a red "outside IPC-7351B" status. It is a note for comparison there.
- NSMD land is 90 % of the package pad, SMD opening 100 % (reviewer; TI Table 3-4).
- Mask web counts the traces in the gap (s − mask clearance) and warns when the opening exposes a trace (reviewer, fixed).
- Left out from the reference calculator (builder): stencil aperture (the solder-paste page covers it) and the via-in-pad drill (the reference calculator's own rule of thumb; padstack and breakout pages cover it).
- Defaults: 0.8 mm pitch, 0.45 mm collapsing ball, 20 % → 0.36 mm land, NSMD with 0.05 mm mask clearance, one trace of 0.1 mm.
- Drawing: a 3 × 2 top view plus a joint section (collapsing or non-collapsing ball, NSMD or SMD mask) on the PCB kit; the section has a thin ENIG layer and is captioned "(own scale)". Traces rectangular until the etch-profile choice (§7b).

## Sources
- IPC-7351B Tables 14-5/14-6: table **names confirmed in IPC's own table of contents; row values are from Altium's transcription** ("What's Your BGA Land Pattern and Footprint?"), not from the standard itself. Each nominal was checked as ball × (1 ∓ r) rounded.
- IPC-7352 level percentages: Altium's summary only.
- TI SPRAA99C (nFBGA Packaging, 2021) §2.1, Tables 2-1 and 3-4: used for the package-pad rule and a test (1.0 mm pitch NSMD land 0.45 mm = IPC 25 % of a 0.6 mm ball); reading of the PDF not explicitly reported. TI AN-1112, Intel AN 114: cited.

## Known limits and open items
- Table values should be re-checked against IPC-7351B if a copy becomes available.
- Balls outside 0.15–0.75 mm are not in the table (message shown).

## Review history
- NSMD mask clearance 0.15 mm with s = 0.1 mm exposed the trace but the web showed 140 µm with no warning ("bigclr"). Fixed.
- IPC-7352 levels and the package-pad rule turned the status red (level A collapsing 0.75/0.6/0.3 mm balls; level C non-collapsing 0.75/0.6 mm; package pad with non-collapsing balls). Fixed.
- A 0.42 mm land under a non-collapsing 0.45 mm ball showed "below the range" although the printed table accepts it → the correction is stated on the page.
- Package-pad rule used 100 % for NSMD where TI says about 90 %. Fixed.
- Section had no ENIG layer and a different scale from the top view without saying so. Fixed.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-25, reviewed and fixed 2026-11-25 (mask web, informational range, 90 % NSMD, table correction stated, ENIG layer).
