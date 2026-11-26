# Solder Paste Volume — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/solder-paste-volume` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-solder-paste.test.ts`

## Purpose and scope
Stencil aperture area ratio and aspect ratio against the IPC-7525 release guidelines, printed paste volume, and the solder (metal) volume left after reflow. Aperture shapes: rectangle, rounded rectangle, circle. Solve options: paste volume (analysis, default), foil thickness T, aperture reduction.

This is **the stencil page**. `pcb/aperture-diagonal` is not a stencil page (round-tool openings), and `pcb/bga-land-pad` leaves stencil apertures to this page.

## Model and why
- IPC-7525B (2011) §3.2.1: aspect ratio = W_min/T > 1.5; area ratio = A_open/A_walls = A/(P·T) > 0.66. Rectangle AR = L·W/(2(L+W)T); circle D/(4T); rounded rectangle uses the true area A = L·W − (4−π)r² and perimeter P = 2(L+W) − (8−2π)r.
- Paste volume V_paste = A·T·TE, TE the transfer efficiency (from paste inspection). Aperture is the pad reduced by the chosen percentage.
- Metal volume fraction from the weight fraction by the rule of mixtures: φ = (w/ρ_m)/(w/ρ_m + (1−w)/ρ_f), as in Kester's "Calculating Solder Paste Volume Percent". Alloy densities are from the Indium Corporation Solder Alloy Directory 97720.
- Table of standard foil thicknesses with row tones (release OK / near / risk), two graphs, stencil cross-section.

## Deliberate choices — ask before changing
- Alloy densities are the Indium directory values (its lb/in³ and g/cm³ columns agree; a test locks them). Sn96.5Ag3.5 was questioned by the reviewer (rule of mixtures gives 7.39 g/cm³ against a listed 7.50); the builder then moved to the Indium values and a test.
- **Independent metal-volume tests, not a circular one** (reviewer 2026-11-23): the Kester test rebuilt the density from Kester's own numbers (6.46 g/cm³, not plausible for an alloy) and proved nothing. Replaced with Kurtz Ersa's rule of thumb (about 90 wt % ≈ 50 vol %; SAC305 88.5 wt % with 1.0 g/cm³ flux → 51.0 vol %) and the density test.
- Never write a value outside its field: solved T stays inside the 10–1000 µm foil field, analysed volume inside 1e-15…1e-6 m³ (reviewer, 2026-11-23; the central runCompute safety net was added the same day).
- On a circle the area-ratio and aspect curves coincide (axes scaled 1:4); the graph subtitle explains this instead of hiding it (reviewer nit, fixed).
- The `bga05` example is labelled as failing the area ratio (AR = 0.625 < 0.66, RELEASE RISK), not "marginal".
- A shape switch goes back to analysis (solve reduction → circle was a red error; test).
- Default: 1.5 × 0.8 mm pad, 10 % reduction, 120 µm foil, TE 100 %, SAC305 at 88.5 wt %, flux 1.0 g/cm³ → 0.972 mm², AR 1.957, 0.1166 mm³. This matches the reference calculator's default (builder).
- Drawing restyled 2026-11-24 to the PCB kit: stencil foil is `steel` (added to the kit on this page's request: the builder had drawn a neutral box and asked the coordinator), paste grainy, pad copper with a gold finish, mask, laminate, plus a legend. Physics untouched (coordinator brief). Rectangular copper per §7b.

## Sources
- IPC-7525B §3.2.1: limits 1.5 and 0.66. **Not verified in the standard** (the original brief said "verify the numbers in the standard or a reliable summary"; no record of which was used).
- Indium Corporation Solder Alloy Directory 97720: densities, checked against both of its unit columns.
- Kester knowledge-base note and Kurtz Ersa wiki: rule of mixtures and the 90 wt % ≈ 50 vol % check.
- Builder's Python agrees to 5e-16; the Kester 58.55 % metal-by-volume example was reproduced (before the circular test was replaced).

## Known limits and open items
- Geometry guidelines only; real release depends on stencil finish, paste type and print parameters.
- Aperture diagonal / drilled-hole sizing is not here (separate page).

## Review history
- Solving for T accepted 1–2000 µm while the field is 10–1000 µm, so 8.8 µm was written back; V_paste could be written below the 1e-15 field minimum. Fixed.
- `bga05` example labelled "(marginal)" although AR = 0.625 < 0.66. Relabelled.
- Area-ratio and aspect curves coincided on a circle. Explained on the graph.
- Kester test circular (6.46 g/cm³). Replaced.
- 2026-11-24 restyle review: numbers unchanged, diagram on kit materials.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23 (ranges, labels, density tests), diagram restyled to the PCB kit 2026-11-24.
