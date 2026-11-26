# Dual Stripline — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/dual-stripline` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `scale.ts` (one-scale layout), `tests/calc-dual-stripline.test.ts`

## Purpose and scope
Two signal layers between one pair of planes (stack: plane · H₁ · trace 1 · D · trace 2 · H₂ · plane), routed at right angles. Gives Z₀ of a trace on each layer (Z₀₁, Z₀₂), delay, return-current split, f_PP, and the Zₒ / Zₑ / Zdiff / k_b that a **parallel** run on the two layers would have. Solve options: analysis, both widths (each for its own layer's target), H₁ for Z₀₁, H₂ for Z₀₂, εr for Z₀₁. Graphs: Z₀ of both layers vs W; Z₀ and k_b vs D.
Not covered: a full broadside pair design (`broadside-coupled`), edge-coupled pairs, orthogonal-layer crosstalk.

## Model and why
- Each layer is an offset stripline in which the other signal layer is just dielectric: layer 1 has H₁ to its near plane and D + T + H₂ to the far one; layer 2 the mirror. This is the assumption behind the classic dual-stripline equation (IPC-2251 draft 2001; IPC-2141A).
- The offset-stripline impedance is the `asymmetric-stripline` model imported unchanged (field-checked +0…+0.9 % for W ≥ H_near, up to +2.6 % at W = H_near/4). The reviewer confirmed the composition is physically right, within 0.9 % of a full field solution (2026-11-25).
- Parallel runs: `broadside()` from `broadside-coupled`. That model assumes H₁ = H₂; for an unequal stack it is evaluated at the mean H = (H₁ + H₂)/2 and labelled an estimate.
- Delay = √εr/c on both layers (homogeneous dielectric).

## Deliberate choices — ask before changing
- **The IPC dual-stripline equation is not used** (builder): its text could not be verified, and the IPC asymmetric-stripline fit is far coarser than the imported offset model.
- **Two impedances Z₀₁ and Z₀₂, not one** (builder): the first harness run produced 160+ round-trip flags with a single Z₀, so the target was split per layer.
- **Broadside warning above k_b = 5 %**, pointing to the Broadside-Coupled page. k_b is hidden where Cohn's even-mode formula fails (W < D/4 or k_b ≤ 0; it gave −0.9 % there before).
- **Far-plane warning threshold is 5** (H_far/H_near), aligned with the theory's checked range (reviewer nit 2026-11-25; the warning had fired at 5.5).
- A laminate preset while solving εr returns to analysis; the target does not carry over.
- Copper beyond the thin-strip limit is refused with the reason; a failed W solve blanks both widths.
- Drawing: the stack uses the one-scale rule (§7b, user): `scale.ts` gives copper width and thickness one factor k (copper 5–40 px thick), dielectric heights share k when they fit, otherwise they are compressed and the hint says so; wide traces run past both edges with outward W arrows. The `cutW` fix (arrows ending inside the board, labels kept clear of field arrows) is shared with `stripline-diff-asym`. Traces are rectangular until the etch-profile choice is made (user, §7b).

## Sources
- Cohn 1960 and Cohn 1954 / Wheeler 1978, Wadell §3.6.3: through the imported models, not re-read here.
- IPC-2251 draft 2001 and IPC-2141A: cited only to describe the classic assumption; the standards' dual-stripline text was **not verified**.
- No published worked example exists. The builder checked the composition against the field-checked offset model (Python re-implementation, 319 states, 9e-15). Reviewer's BEM field solver (scratchpad `reviewR1/bem.mjs`) confirmed it within 0.9 %.

## Known limits and open items
- Orthogonal routing is assumed for Z₀₁ and Z₀₂; for parallel layers the broadside numbers are the estimate described above, not exact for H₁ ≠ H₂.
- No field-solver check of the broadside estimate for asymmetric stacks beyond the reviewer's composition check.
- No dispersion, loss or etch profile.
- On 2026-11-24 the coordinator suggested folding dual stripline into `controlled-impedance`; the page was built separately on 2026-11-25. No later decision recorded.

## Review history
- Review 2026-11-25: composition correct, ship. Nit: theory said H_far/H ≤ 5, warning fired above 5.5 → both 5.
- Diagram (shared with `stripline-diff-asym`): cut wide pairs left `cutW` arrows as 2 px heads pointing inward, with the left arrow outside the board; field arrows crossed the W and εr labels → fixed.
- Builder fixes after viewing snapshots: hint text collided with itself; field arrows crossed labels; T labels collided with "−" and W.
- Harness: 160+ round-trip flags with a single Z₀ → split into Z₀₁ and Z₀₂. Remaining medium flags are typed-number errors.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-25, reviewed 2026-11-25 (composition, warning threshold, cut-pair arrows), fixed 2026-11-25.
