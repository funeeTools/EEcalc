# RT60 Reverberation — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `audio/rt60-reverberation` (directory `rt60`) · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts` (room diagram drawn there; no `diagram.ts`), `tests/calc-rt60.test.ts`

## Purpose and scope
Octave-band reverberation time (Sabine, Eyring, Millington–Sette) of a rectangular room with air absorption, from a list of surfaces ("rest of" a boundary or an area patch) and a material table; or the treatment area needed for a target RT60. Not covered: "optimal RT60 for speech or music" (no primary source, so not built despite being on the reference calculator), non-diffuse rooms, modal behaviour.

## Model and why
- Sabine T = (24 ln10/c)·V/(A + 4mV); Eyring T = …/(−S ln(1−ᾱ) + 4mV); Millington–Sette uses −Σ S_i ln(1−α_i). 24 ln10/c = 0.161 s/m at 20 °C (Kuttruff ch. 5; Sabine 1922; Eyring 1930; Millington 1932; Sette 1933).
- Air absorption from ISO 9613-1 eq. (3)–(5) with Annex B saturation pressure; m = α/(10 lg e); c = 343.2·√(T/293.15) m/s. The reviewer confirmed the m = α/(10 lg e) convention (intensity coefficient).
- Schroeder frequency 2000√(T/V) and critical distance √(A/16π) ≈ 0.057√(V/T) as validity warnings. Six bands, 125 Hz–4 kHz.
- Treatment-area solve by Brent root-finding. Target band: mid (500 Hz–1 kHz), worst of 500 Hz–2 kHz (ANSI S12.60), or a single band.
- Accuracy stated in theory: 10–20 % in rooms that satisfy diffuse-field assumptions. Reviewer's Python: 120 points on all three formulas and the area via bisection, differences 5e-5 (their different sound-speed form) and 4e-4 for area; builder's own reference ≤ 3e-13.

## Deliberate choices — ask before changing
- **An unreachable target clamps at the whole free area** and shows an amber "TARGET NOT MET" status with the achieved RT60, the RT60 in red in the diagram ("target … not met"), and the area graph's legend below, instead of a red NO SOLUTION (a band, material or mount switch most often landed there; 16 trails). It matches the "already meets the target → 0 m²" clamp. The round trip from a clamped answer therefore does not return the target (legitimate harness flag, commented). (builder, harness 2026-11-23)
- **Surface list stays consistent on switches:** moving a "rest of" row onto a boundary that already has one swaps them; Covers rest → area pre-fills the covered area; area → rest turns the old "rest of" into a patch; ⧉ on a "rest of" row makes several "rest of" rows share the free area equally, with a note; a treatment surface with patches but no "rest of" fills the free area, with a note. (builder, 2026-11-23)
- **✕ on a boundary's only "rest of" row is refused** by `canRemove` with a reason, because no honest default material exists. Originally flagged as a legitimate harness high; a core `ListSpec` hook now allows the refusal. (builder, 2026-11-23)
- **Coefficients ≥ 1 are capped inside the logarithms** with a note; editing a coefficient switches the material to Custom.
- **RT60 input maximum is 100 s** (was 30 s); above is refused as OUT OF RANGE. The solved value is checked against the field range (`solvedOutOfRange`). (reviewer/builder, 2026-11-23)
- **Tile materials carry product names** ("Mineral-fibre tile (Armstrong Fine Fissured)", "… Ultima"), not NRC numbers: Fine Fissured's listed NRC is 0.55 but its band values average 0.585, which would round to 0.60; the source comment records this. (builder, 2026-11-23)
- The by-band graph spans 100 Hz–5 kHz with dotted labelled lines at each band centre (the plot has no categorical axis; the subtitle explains the lines). (builder, 2026-11-23)
- "Not reachable" text excludes the surface being treated. Fully covered walls say "no free walls area left", not "NaN %".
- Coefficient sources: NIOSH Compendium Table 5 (AIMA data), Owens Corning 703 pub. 10021736 (ASTM C423 Type A), Armstrong UL summary (E-400). Mean absorption 0.065 before and 0.626 after treatment reproduces NIOSH Example 9.
- Very dry air (outside ISO 9613-1's stated accuracy) gets a note (tested at 5 % RH).

## Sources
- OC 703 1″/2″ coefficients: **verified** by the reviewer against the current OC data sheet 10021736 (exact).
- NIOSH/AIMA values: the reviewer matched them to the widely reproduced table **from memory**; the NIOSH PDF was too large to fetch. Armstrong values: not traced to a named table by the reviewer (the 0.55 tile was relabelled).
- ISO 9613-2 Table 2 (6 climates × 8 bands): the builder reproduced it from memory (the standard could not be fetched; the 15 °C/80 % 1 kHz entry computes 4.151, on the rounding edge); the reviewer's independent ISO 9613-1 code reproduces the table within rounding.
- Kuttruff, Schroeder–Kuttruff, ANSI S12.60: cited, not opened as far as recorded. No published worked RT60 example was found to test against.

## Known limits and open items
- Diffuse-field theory only; no flutter echo, modes or low-frequency absorber design.
- ITU-R 468 weighting and optimal-RT60 tables left out.

## Review history
- "NaN % of free area": solveFor rt60, treatArea 0, default room plus a 96 m² window patch on the walls with no "rest of walls".
- Tile labelled "NRC 0.55" had band values averaging 0.585.
- With treatOn = ceiling the failure text still suggested "Treat another surface as well (ceiling, floor)".
- A 200 × 200 × 50 m room with α 0.01 solved 51.7 s above the 30 s field maximum.
- RT60-by-band x-axis ticks at 200/500/1k/2k instead of band centres.
- Band, material or mount switch gave red NO SOLUTION (16 trails); surface-list switches left the room description inconsistent (floor vinyl ↔ ceiling tile "rest of" swap).

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23 (NaN %, tile names, range, band graph), mode-switch harness fixes 2026-11-23 (clamp at free area, surface-list consistency, band labels).
