# Asymmetric Edge-Coupled Stripline — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/edge-coupled-internal-asymmetric` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-stripline-diff-asym.test.ts` (also uses `dual-stripline/scale.ts`)

## Purpose and scope
Differential and common-mode impedance of an edge-coupled pair on one layer, off-centre between two planes (H₁ below, H₂ above, homogeneous εr). Solves for Zdiff (analysis), W, S, H₁ or H₂. Results: Zcm, Z₀ₒ, Z₀ₑ, k_b, single-trace Z₀, the centred and plain image-method values for comparison, b_eq, each with the accuracy band for its geometry. Graphs vs W, vs S (shows Cohn's step at S = 5T) and vs pair position.
Not covered: the centred pair (`stripline-diff`), microstrip pairs, broadside pairs.

## Model and why
- **No published closed form exists** for this geometry (builder; the brief told the builder to stop and report if no defensible model existed, and the coordinator accepted this one, labelled as an approximation with measured bands).
- Equivalent centred line: find b_eq at which the centred single trace (W, b_eq, T) has the capacitance of the offset single trace (`asymmetric-stripline` model: Cohn 1960 odd mode, narrow-strip fix, Wadell §3.6.3 thickness), with 2H_near + T ≤ b_eq ≤ 2H_far + T. Then Z₀ₑ, Z₀ₒ are Cohn's 1955 coupled stripline at (W, S, b_eq, T), imported unchanged from `stripline-diff`.
- Properties that make it usable: exact for H₁ = H₂, exact single-trace limit as S → ∞, and every impedance rises monotonically as either plane moves away.
- **Rejected:** plain image method (each mode ½ΣC_mode(2Hᵢ + T): up to +9.7 % even, +4 % odd at T = 0), and image-method coupling increments added to the offset single trace (Zdiff up to −3.8 % and, worse, Zdiff falls again beyond H_far/H_near ≈ 4, which is physically impossible and broke the H₂ solve).
- Accuracy (builder's 2-D finite-volume solver, 300 cross-sections, H_far/H_near 1–5, W/H_near 0.25–2, S/H_near 0.25–4, T/H_near 0–0.25; all 300 inside the `BANDS` in model.ts): thin copper Zdiff +0.1…+1.1 % up to ratio 2 and +3.5 % at 5; with copper Cohn's thickness error adds, up to +10.7 % for narrow traces with 5T ≤ S < 8T. The model reads high.

## Deliberate choices — ask before changing
- **The far-off-centre warning fires above H_far/H_near = 5 and quotes the real errors** (reviewer 2026-11-25): +3.5 % with thin copper, up to +11 % for narrow traces just above S = 5T, and +11 % measured at ratio 8. The first text said "up to 4 %".
- **Cohn's step at S = 5T is kept**, and a target inside it answers S = 5T with a warning (same rule as `stripline-diff`; the PCIe 85 Ω example hits it).
- Every result card shows its own band for the present offset, width and copper group (from `BANDS`).
- Drawing, one-scale (§7b, user): W and T share one scale through `dual-stripline/scale.ts`; for a cut pair, 150 px of the left trace stay visible for the W label, S stays to scale or is shortened with "· S shortened" in the hint, `cutW` arrows end inside the board, field arrows sit near the gap on the side away from the W label, and the T label stays on the board. Traces are rectangular until the etch-profile choice is made (user, §7b).
- Test regression kept: the 85 Ω PCIe example solves H₂ (it failed with the image-increment model).

## Sources
- Cohn 1955 and 1960, Cohn 1954, Wheeler 1978, Wadell §3.6.3: through the imported models; not re-read here.
- No published data for offset coupled stripline. Accuracy rests on two independent field solvers: the builder's (`builderA2/cfd.mjs`) and the reviewer's BEM solver (`reviewR1/bem.mjs`, 240 points: 239 inside the bands, one marginally outside; measured +11.2 % at ratio 8).
- Python re-implementation: 343 states, worst difference 7e-15. The test file keeps 54 of the solver cross-sections.

## Known limits and open items
- An approximation: narrow traces with S just above 5T and ratios above 5 read up to about 11 % high; the page warns.
- The offset pair couples a little more than its equivalent centred pair, so Zdiff reads slightly high.
- No dispersion, loss or etch profile.

## Review history
- Warning at ratio > 5.5 said "up to 4 %" while the bands show about 11 % at ratio ≤ 5 → threshold 5, real figures quoted.
- Cut pair (W = 2 mm, S = 1 mm): S clamped to 200 px left about 67 px for the W label, so `cutW` arrows collapsed into 2 px heads pointing inward, the left one at x = 19 < board edge 20; dashed field arrows crossed W and εr labels; S clamp broke one-scale without a hint → fixed (see above).
- At H₁ = 0.6 mm, H₂ = 0.1 mm the downward field arrow started against the W/S labels → starts clear of an S label stacked next to W.
- Harness: round trip of S in the "IN MODEL STEP" state returns the model value, not the target; round trip of S ≫ b (Zdiff flat at 2·Z₀) returns the first S that reaches it. Both expected and documented in def.ts.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-25, reviewed 2026-11-25 (bands held on 239 of 240; warning text, cut-pair drawing), fixed 2026-11-25.
