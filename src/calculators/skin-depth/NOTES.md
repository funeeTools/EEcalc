# Skin Depth — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `rf/skin-depth` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-skin-depth.test.ts`

## Purpose and scope
Skin depth δ, surface resistance R_s, plating guide (3δ and 5δ), and the exact AC/DC resistance ratio of an isolated round wire (with internal inductance), for common metals and AWG sizes. Solve for δ (from f), f (for a target δ) or f (for a target R_ac/R_dc).

Not covered: proximity effect, litz or stranded wire, rectangular conductors and PCB traces (see `pcb/skin-depth-percentage` and `pcb/trace-resistance`, which import this model), surface roughness.

## Model and why
- δ = 1/√(π f μ₀ μr σ); R_s = 1/(σδ) (Ramo, Whinnery & Van Duzer §3.16–3.17).
- **Exact Bessel solution for the wire:** Z/R_dc = (ka/2)·J₀(ka)/J₁(ka), k = (1−j)/δ (RWV §5.12, Schelkunoff 1934), instead of an approximation. Complex power series for a/δ ≤ 30 (at least 10 digits), 16-term Hankel asymptotic expansion above (A&S 9.2.5–9.2.10); the branches agree to about 1e-12 at the crossover. Two simpler approximations are also shown with their error against the exact value (builder).
- The model's `wireZRatio` is reused by `coax-impedance` for the inner conductor at low frequency, so a change here changes the coax loss.

## Deliberate choices — ask before changing
- Presets: annealed copper (IACS, 58 MS/m), silver, gold, pure aluminium (CRC resistivities), Al 6061-T6, 70/30 brass, 304 stainless (ASM values), and nickel and low-carbon steel at μr ≈ 100 with an "uncertain μr" warning (permeability depends strongly on alloy, field and frequency). Wire size can be picked by AWG (`physics/awg.ts`).
- The ◎ on R_ac/R_dc at very low frequency starts from a ratio of 2 ("where does R double?"), because the written-back ratio is exactly 1 to double precision and no frequency gives it; this was a red error caused by the click (harness, 2026-11-23). Targets are accepted down to 1 + 1e-14, so a value solved at 1 Hz (1.000000000075) can be fed back and returns f ≈ 1 Hz (reviewer fix, 2026-11-22).
- Large ratios, a/δ and mil values are printed without e-notation: "2.9907e+5" was read by the harness as an exponent next to "25 mm", and the diagram showed "d/δ = 1.02e+3" (2026-11-23).
- The bus-rod example's big jumps after switching the gauge are correct (the 25 mm custom diameter is replaced by AWG 22; (25/0.644)² ≈ 1507). Not a bug (reviewer, 2026-11-23).
- Plating wording: |J| falls to 5 % at 3δ and 0.7 % at 5δ; for a finite slab R_s is about 0.34 % high at 3δ and within 0.013 % at 5δ (computed from coth). The asymptote line "a/2δ + 1/4 + 3δ/32a" shows "—" when a < 2δ.
- Warning when σ/ωε₀ < 100 (not a good conductor) and above about 100 GHz (anomalous skin effect, roughness).
- Diagram (2026-11-22): wire cross-section to scale, outer ring of thickness δ in copper (at least 4 px), core in a faded copper (`.xs-cu-soft`, changed 2026-11-24 because the first tan looked like FR-4), the whole wire solid with a note when δ ≥ d/2.
- Default: copper, 1 MHz (δ = 66.085 µm), AWG 18, 1 m.

## Sources
- Ramo, Whinnery & Van Duzer 3rd ed. §3.16–3.17 and §5.12; Schelkunoff, Bell Syst. Tech. J. 13 (1934); A&S 9.2.5–9.2.10; CRC and ASM for resistivities (cited in the builder's report). Opening of the books is **not recorded**.
- Checked numerically: independent Python with Kelvin functions at 90 digits (builder test) across the series/asymptotic crossover; Terman's round-wire table (x = √2·a/δ) reproduced in a test; reviewer's exact Bessel ratio agreed to 6e-6 or better, mostly 1e-9.

## Known limits and open items
- Isolated straight wire only. Ferromagnetic μr is a single constant.
- The classic skin-depth relation and the exact Rac/Rdc assume a good conductor.

## Review history
- ◎ on R_ac/R_dc at very low f gave a red error (ratio exactly 1) → starts from 2.
- Target threshold too strict at low f: a ratio solved at 1 Hz could not be fed back → threshold 1 + 1e-14.
- Labels and threshold wording (round 1 review, 2026-11-22); asymptote relabelled; σ/ωε₀ warning added.
- Harness: e-notation misread as an exponent next to "25 mm" (ratio, a/δ, mil values, diagram "d/δ = 1.02e+3", graph marker).

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed and fixed 2026-11-22, cross-section diagram 2026-11-22 (copper tone unified 2026-11-24), mode-switch fixes 2026-11-23.
