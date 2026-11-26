# Broadside-Coupled Pair — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/broadside-coupled-pair` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-broadside-coupled.test.ts`

## Purpose and scope
Two traces of width W stacked one above the other, facing gap S (a core), each H from its own plane, centred between planes (b = 2H + 2T + S) in one homogeneous dielectric. Gives Zdiff, Zcm, Z₀ₑ, Z₀ₒ and coupling. Solves for W, S or H (or analyses Zdiff).
Not covered: lateral offset between the two strips (Shelton 1966 — the builder could not get the paper and the Rogers note excludes it), traces on two layers that are not parallel (orthogonal runs: `dual-stripline`), edge-coupled pairs.

## Model and why
- Zero thickness: Cohn 1960 exact parametric solution (as reproduced in Rogers design note 3.2.1) with s = S/b, w = W/b and one parameter k. k is found with Brent on artanh k, written so wide strips (k → 1) keep full precision. η₀ = 376.73 Ω exactly, not Cohn's rounded 188.3 / 296.1 Ω.
- Odd mode: the mid-plane is an electric wall, so each strip is an offset stripline against that wall; computed with the `asymmetric-stripline` model (Cohn odd formula, narrow-strip deficit restored from the exact centred line, image-method thickness increments).
- Even mode with thickness: Cohn's even formula with strips on their centre planes (gap S + T) plus the plane-side thickness increment of the centred thick stripline (Wadell §3.6.3; Cohn 1954 + Wheeler 1978).
- Homogeneous dielectric: εeff = εr, Z ∝ 1/√εr.
- Accuracy against 2-D field solutions (builder's finite-volume solver, 25 sections, plus the independent reviewer's): Zdiff −0.1…+1.2 %. Zcm band keyed on W/S and W/(b − S): −0.65…0 % for W ≥ S and W/(b − S) ≥ 0.2; −1.8 % for narrower traces; −2.6 % at W = S/2; about −7 % for W ≤ S/4 (warned; Cohn's even-mode formula assumes close coupling).

## Deliberate choices — ask before changing
- **Copper thickness is a warning above T/(2D + T) = 0.1 and a hard error only above 0.45** (TB_MAX). Reviewer 2026-11-24: the original T/b > 0.25 refusal blocked 1 oz on 2-mil dielectric; the reviewer's field checks gave −0.14 % at 0.26 and −0.84 % at 0.375 (centred stripline). The page quotes ±0.5 % up to 0.26 and −1.1…+0.6 % up to 0.45.
- **Zcm band is shown beside Zcm and keyed on W/(b − S) as well as W/S** (reviewer, 2026-11-24): the first band (−0.5…0 % for W ≥ S) was too optimistic for narrow strips with copper.
- Lateral offset is left out, and the page says so, rather than guessing a formula (builder).
- Diagram: PCB kit through the shared frame `controlled-impedance/xs.ts`; odd-mode arrows run + plane → − (reviewer 2026-11-24). Copper is drawn at least 6 px thick and strips at least 40 px wide so it still reads at hover-card size; T sits beside the lower strip.
- Style guide §7b (user): traces rectangular until the etch-profile choice is made; W and T on one scale. The minimum-thickness clamp here departs from one-scale when copper is thin; no scale hint is drawn.
- Solder mask is not modelled (stripline: not applicable).

## Sources
- Cohn 1960 (IRE MTT-8, 633–637) as reproduced in Rogers design note 3.2.1: **the seven example rows of the table are reproduced** (Z₀ to 0.016 Ω, coupling to 0.01 dB); test `Rogers Design Note 3.2.1`. The IRE paper itself was not read.
- Wadell, Transmission Line Design Handbook §3.6.3 and Cohn 1954 / Wheeler 1978: used via shared models, not checked again here.
- Independent parametric check of the k solve (150 random (s, k) points, no root finding): agrees to 3e-12 (reviewer). Python re-implementation (80-digit bisection for k): 1e-9.
- Builder's and reviewer's own 2-D solvers (they agree within 0.02–0.22 %).

## Known limits and open items
- No lateral offset; no dispersion or loss; pure TEM only.
- Zcm is the weak figure: it reads low for loosely coupled or narrow strips.
- On 2026-11-24 the coordinator suggested folding the five differential-impedance pages into one page with a "where the planes sit" selector. No decision is recorded. If it happens, the broadside drawing (vertical gap) is the hard one.

## Review history
- Review verdict 2026-11-24: ship. Fixes asked: Zcm caveat too optimistic for narrow strips with copper (W/S 10, T/H 0.2 gave −0.63 %; W/(b − S) 0.05–0.12 gave −0.83…−0.92 %) → keyed on W/(b − S).
- T/b > 0.25 hard error too strict (1 oz on 2 mil blocked) → warning, error above 0.45.
- Odd-mode field arrow ended in empty laminate beside the − strip; strips only about 4 px thick at hover size and "T" floated far right → fixed (see above).

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed 2026-11-24 (Zcm band, T/b limit, arrows, hover-size drawing), fixed 2026-11-24.
