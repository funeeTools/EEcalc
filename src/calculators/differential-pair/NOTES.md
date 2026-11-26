# Differential Pair (edge-coupled microstrip) — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/differential-pair` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-differential-pair.test.ts`

## Purpose and scope
Edge-coupled surface-microstrip pair over one plane: Zdiff, Zcm, Z₀ₒ, Z₀ₑ, εeff for each mode, mode delay skew, coupling k, W/H. Solves for W, S or H (or analyses Zdiff). Table of widths for 85 / 90 / 100 Ω.
Not covered: solder mask over the pair (see below), pairs under a cover (`edge-coupled-embedded`), stripline pairs (`stripline-diff`, `stripline-diff-asym`, `broadside-coupled`), trapezoidal etch.

## Model and why
- Zero thickness: Kirschning & Jansen 1984 static even/odd εeff and impedances (stated 0.6 %, for 0.1 ≤ W/H, S/H ≤ 10 and 1 ≤ εr ≤ 18), on top of the Hammerstad–Jensen single line from `microstrip/model.ts`. Checked against the Qucs transcription.
- Thickness: Jansen 1978 increments (even-mode fraction j = 1 − ½·exp(−0.69·Δw/Δt), odd-mode side wall 2T·H/(S·εr)). They are applied to the **capacitances in air and in the dielectric**, not as extra strip widths as Jansen and Qucs/KiCad do (builder).
- Impedances are static. Dispersion is not included; f only sets the wavelength results and the TE₁ surface-wave warning.

## Deliberate choices — ask before changing
- **Capacitance form of the thickness correction** (builder, kept after review 2026-11-24). On the builder's 18 thick field-solver cases it gives Zdiff −0.85…+1.3 %, against −2.5…+5.1 % for the width form (+17 % as Qucs transcribes it). It costs some Zcm accuracy (−2.7…+0.4 % vs −4.3…−0.5 % in the builder's grid, but the reviewer's 4 cases show Zcm −0.68…−3.8 % vs −0.45…−1.55 % for the width form). The choice is driven by Zdiff. The reviewer found the first written reason ("Zcm") wrong; comment and theory now say Zdiff.
- **Stated bands cover both solvers:** Zdiff −0.9…+2.0 %, Zcm −3.8…+0.4 % (builder after review).
- **Solder mask is left out** and said so on the page: no sourced coupled-mask model exists. Mask lowers Zdiff by several ohms, more than for a single trace, because it fills the gap where the odd-mode field is strongest. The page tells the user to ask the fabricator to include mask in their field-solver run. (Builder; the mask-coated single trace is on `controlled-impedance`, Wan–Hoorfar plus Bahl–Stuchly, which the coordinator kept as is, labelled, with no fitted coefficients.)
- Search limits in W/H and S/H are twice beyond the KJ fit range each way; leaving the fit range gives a warning (builder).
- Drawing: PCB kit via the shared frame `controlled-impedance/xs.ts`, odd-mode field arrows run + → − (reviewer 2026-11-24), copper at least 3 px thick, W and S clamped at 16 and 14 px minimum (see Known limits).
- Style guide §7b (user): traces rectangular until the etch-profile choice is made; one scale for W and T. This drawing clamps W, S, T separately and does not follow the one-scale rule yet.

## Sources
- Kirschning & Jansen, IEEE T-MTT 32(1), 1984 (with the 1985 correction), and Jansen, T-MTT 26(2), 1978: formulas as transcribed by the builder, cross-checked with the Qucs technical documentation. The papers themselves were not read by a reviewer.
- No published worked example was available. The second source is the builder's 2-D finite-volume solver (27-point grid in the tests: W/H 0.5–2, S/H 0.3–1.5, T/H 0–0.175, εr 4.2; it reproduces Hammerstad–Jensen εeff to 0.07 %), plus the reviewer's own solver (agrees within 0.02–0.22 %).
- Python re-implementation (1e-9 in the test; 1.7k-point cross-check 7e-13 for the group).

## Known limits and open items
- Above T/H = 0.2 or S under 1.5T the page warns; Zcm already reads up to 2.7 % low at T/H = 0.175.
- Dispersion above a few GHz is not modelled (impedances shift a few percent).
- An etch-factor input was suggested by the coordinator (2026-11-24) and not built; it awaits the user's etch-profile decision.

## Review history
- Reason for the thickness deviation was stated wrongly (Zcm vs Zdiff) → comment and theory reworded (2026-11-24).
- Odd-mode arrows ran away from the − trace and converged in empty laminate → + to − across the gap and via the plane.
- Harness: round trip after H typed far below W and S (W/H, S/H ≈ 26): outside the KJ fit, Zdiff(S) is not monotonic, another S meets the same Zdiff. Left as is, explained in a def.ts comment.
- Harness: "unreadable" after the user picks inches for a 25 µm gap: no prefixed inch forms; left as is.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed 2026-11-24 (thickness-reason text, arrows), fixed 2026-11-24.
