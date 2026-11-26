# Planar Spiral Inductor — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/planar-spiral-inductor` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-planar-spiral.test.ts`

## Purpose and scope
Printed spiral inductor (square, hexagonal, octagonal or circular): L from Mohan 1999, DC and AC resistance, skin-effect factor, Q (an upper bound), current-crowding onset, and a table of quarter-turn layouts. Solve options: L from the layout (analysis), turns n for a target L, outer diameter for a target L. Graphs: L vs n, Q vs f. Drawing: to-scale copper spiral on bare laminate with the via, a dashed under-pass and terminals 1 and 2.
Not covered: substrate loss, self-resonance and parasitic capacitance (Q is skin effect only), coupled or multi-layer coils, spirals on silicon.

## Model and why
- Inductance: Mohan, Hershenson, Boyd & Lee, IEEE JSSC 34(10), 1999: modified Wheeler (Table I), current sheet (Table II), monomial fit (Table III), user-selectable. d_in = d_out − 2n·w − 2(n − 1)·s (the definition that reproduces their Table IV). Fitted against 19 000 ASITIC cases (d_out 100–480 µm, d_in 0.1–0.9·d_out, w ≤ 0.3·d_out, s ≤ 3w): typical error 1–2 %, most under 3 %, current sheet worst 8 % for s ≤ 3w.
- Wheeler and current sheet are scale-free (L ∝ μ₀·length), so they carry over to PCB sizes. The monomial is not quite (length exponents sum to 1.007–1.013) and drifts by a few percent far outside its fitted sizes; the page warns at PCB size.
- Copper: track length = n × perimeter at d_avg; R_dc = ρ·l/(w·t) with ρ = 1/58 Ω·mm²/m (IEC 60028, annealed copper at 20 °C). Skin effect: Yue & Wong 2000, R = ρ·l/(w·δ·(1 − e^(−t/δ))). Crowding onset: Kuhn & Ibrahim 2001, ω_crit = 3.1(w + s)R_sheet/(μ₀w²); above it Q is an upper bound.

## Deliberate choices — ask before changing
- **A circular coil always uses the current sheet**: Mohan gives no circular Wheeler or monomial coefficients, so the other expressions fall back to it (builder).
- **A target with two turn counts returns the smaller n** (builder): near a full coil L(n) peaks and dips, so the smaller n is the hollower coil with better Q, inside Mohan's d_in ≥ 0.1·d_out range, and the other root is mentioned. A round trip from the far side of the peak therefore returns the smaller n (expected harness flag).
- **Q is labelled an upper bound**; Q vs f uses skin effect only.
- Warnings at Mohan's published limits: s > 3w, d_in < 0.1·d_out, n < 2, monomial at PCB size, crowding, λ/10.
- Drawing (reviewer fixes 2026-11-24): vias clamped to a 3.5–8 px radius; the lead and terminal 1 stay on the canvas with a square end (no triangle artefact); the inner end has a square cap not a mitre; the w and s arrows and the d_in line avoid the end via; the inward step is clamped so extreme spacings cannot spiral through the centre; the under-pass is `cuHidden` with "Copper, other layer" in a 2-column legend, no inline dash or text note.
- PCB material kit; traces rectangular until the etch-profile choice is made (user, §7b). The spiral drawing is a top view and was drawn to scale by the builder; it was not checked against the one-scale rule.

## Sources
- Mohan 1999 Tables I–III: the reviewer matched the coefficients to their reading of the paper, and the PDF text confirms the stated accuracy. **Table IV rows are images**, so examples #1 and #56 are **unverified** by the reviewer; the builder reproduced 9 rows (square and octagonal): monomial within ±0.15 %, Wheeler and current sheet within ±0.3 % (test: "reproduces the tabulated errors").
- Yue & Wong 2000 and Kuhn & Ibrahim 2001: from the builder, not verified against the papers. IEC 60028 resistivity: from the builder.
- Python reference (`ps_ref()` in scratch ref.py): L, R_dc, R_ac and Q match to 1e-15 over 104 successful points; the 46 failures were legitimate unreachable-target messages (reviewer).

## Known limits and open items
- Q ignores substrate loss, proximity effect and capacitance; it is an upper bound only.
- Table IV examples #1 and #56 unchecked against the paper.

## Review history
- Via size scaled with w and was not clamped: n = 1.25, w = 1 mm, d_out = 5 mm gave huge vias running off the left edge, a hidden under-pass, d_in line and s arrow on a via, a triangular artefact on the terminal-1 lead → clamped, re-checked at extremes (wide hex, wide circle, very dense coils, s ≫ d_out).
- Under-pass drawn with an inline dash and text note → `cuHidden` with a legend entry.
- Harness: round trip of #56 with ×10 spacing returns a second root (L(n) non-monotonic near full fill): expected.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed 2026-11-24 (via clamp, under-pass), fixed 2026-11-24.
