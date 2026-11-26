# PCB Crosstalk — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/pcb-crosstalk` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-pcb-crosstalk.test.ts`

## Purpose and scope
Near-end (NEXT) and far-end (FEXT) crosstalk between two parallel traces, microstrip or centred stripline, from coupled-line L and C, for a given gap, height, coupled length and rise time. Solve options: crosstalk (analysis), minimum gap for a budget, longest coupled run for a budget; the budget applies to NEXT or FEXT. Graphs: crosstalk vs spacing in dB (with the 1/(1+(D/H)²) rule of thumb, labelled as such), victim near- and far-end waveforms, crosstalk vs length with L_sat. Table of gap needed for 0.5–10 % budgets. Drawing: top view above a cross-section.
Not covered: strongly coupled victim loading (weak-coupling formulas), multiple aggressors, a different victim termination, EMC radiated crosstalk (the reference calculator lists a separate "PCB Crosstalk EMC" page; the coordinator noted the possible duplicate on 2026-11-24, no decision).

## Model and why
- Weak-coupling formulas from the L and C matrices (Hall & Heck 2009 ch. 4; Bogatin 2009 ch. 10): K_b = ¼(L_m/L + C_m/C); NEXT = K_b·min(1, 2TD/t_r), saturating at L_sat = t_r/(2t_pd); FEXT = ½(C_m/C − L_m/L)·TD/t_r, capped at half the swing (modal saturation).
- **Line delay t_pd = (√εe + √εo)/(2c)** (exactly √εr/c in stripline). Reviewer bug fix: √(L·C) is not the line delay under strong coupling.
- Modes: microstrip from `edge-coupled-embedded/model.ts` without a cover (Kirschning–Jansen + Jansen thickness); stripline from `stripline-diff/model.ts` (Cohn), centred, b = 2H + T, εeff = εr so FEXT is exactly 0.
- Rule of thumb 1/(1 + (D/H)²) (Johnson & Graham 1993) is shown only as a labelled comparison.
- Accuracy against the builder's 2-D field solver: microstrip K_b −3…+12 % for S < 2H and −9…+51 % for wider gaps (mostly overestimated, the safe side), K_f −3…+27 % (160 cases). Stripline (141 cross-sections, W/H 0.2–5, S/H 0.1–5, T/b 0–0.2): zero thickness −2…+0.2 %; with copper, W/b ≥ 0.15: −26…+0.7 %; narrower: −40…−3 % (`STRIP_KB`). **The stripline error is on the unsafe side.**

## Deliberate choices — ask before changing
- **Stripline with copper gets an "unsafe side, keep margin" warning with the band** (coordinator, 2026-11-24, after the reviewer measured K_b about 11 % low at W = 0.5H, S = H, T = 0.1H, εr 4.3: model 0.0493, field 0.0555). The cause is Cohn's thickness correction in the shared `stripline-diff` model; that page was **not** changed because its Zdiff/Zcm claims hold and it does not show coupling.
- **When any gap meets the budget the solve returns the smallest gap in range (0.01·H) with an "ANY GAP PASSES" status and a pass note, not a red error** (reviewer, 2026-11-24). The budget is then a limit, so re-solving crosstalk from there returns the actual lower value (a documented harness round trip: typed 100 % budget). The any-gap test uses the peak crosstalk over the whole gap range because FEXT is not monotonic in S.
- A saturated NEXT budget is answered with L_sat and a note; a round trip from a saturated state returns L_sat, not the run entered.
- Crosstalk graphs are in dB of the swing with a floor at −120 dB for FEXT = 0 (decades of % read badly on a log axis).
- Top view: stripline traces are drawn as `cuHidden` with vias to the parts (inner layer), microstrip as exposed copper; the A→V arrow in the cross-section is labelled "coupling C_m, L_m" (reviewer 2026-11-24). PCB material kit; traces rectangular until the etch-profile choice is made (user, §7b).
- Stripline legend uses 3 columns.

## Sources
- Hall & Heck 2009, Bogatin 2009, Johnson & Graham 1993: formulas as the builder gave them; **not verified against the books** (no record of a page check).
- Mode models from this project's pages (see their NOTES). Python re-implementation: 180 random states including zero-thickness stripline vs exact Cohn, 7.8e-15.
- Builder's and the reviewer's 2-D field solvers (the reviewer's reproduced the stripline case).

## Known limits and open items
- Stripline NEXT with thick copper reads up to 26 % (narrow traces up to 40 %) low; this is a limit of Cohn's thickness correction, not fixed.
- Weak-coupling only; FEXT sign and magnitude depend on the microstrip mode spread, which the page warns about.
- Gap solves can legitimately return another value than entered for FEXT on microstrip at small S/H.

## Review history
- t_pd = √(L·C) inflated TD, unsaturated NEXT, L_sat and FEXT: stripline W = 0.75 mm, S = 0.076 mm, H = 0.65 mm had NEXT off by 16–22 % (+3 % at K_b 0.12, +15 % at 0.25). Default NEXT moved from 4.91 % to 4.84 %. Test added.
- Stripline K_b about 11 % low and claimed only "exact for thin copper" (W = 0.5H, S = H, T = 0.1H) → band stated and warned.
- Top view drew inner-layer traces as exposed copper on bare laminate → `cuHidden` with vias; unlabelled arrow → labelled.
- "Any gap meets the budget" was a red NO SOLUTION → pass note with smallest gap.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed 2026-11-24 (delay bug, stripline band, drawing, any-gap), fixed 2026-11-24.
