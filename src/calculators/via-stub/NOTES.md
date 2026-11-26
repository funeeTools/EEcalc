# Via Stub Resonance — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/via-stub-resonance` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-via-stub.test.ts`

## Purpose and scope
The unused barrel below the exit layer of a signal via, treated as an open-circuited stub: its quarter-wave resonance against the Nyquist frequency (NRZ or PAM4), the back-drill target, the fastest data rate for a margin, and the insertion-loss notch. The stack is given as layer count plus exit layer.

Single-ended via only; the pair is on `differential-via`, which shares the stub model. No channel simulation.

## Model and why
- Open stub: Z_in = Z_v·coth(γℓ), resonance at f = c/(4ℓ√εr) and odd harmonics (Pozar §2.3–2.7; Bogatin; Johnson 2003).
- Optional end capacitance (pad or plane) gives the lossless resonance tan(βℓ) = 1/(ωC·Z_v), which lies below the quarter wave; roots are found per harmonic by Brent in bracketed intervals.
- Insertion loss: ABCD cascade of the used barrel and a shunt stub admittance between Z₀ terminations, with dielectric loss α_d = π·f·√εr·tanδ/c. With C_end = 0 it is the `differential-via` stub model (tested).
- Nyquist: f_N = R_b/2 for NRZ, R_b/4 for PAM4.

## Deliberate choices — ask before changing
- **The required margin k is a design rule, not a property of the via** (builder). Default rule is 3× Nyquist; presets 2×, 3×, 5×, and 10× (≈ Bogatin's "300 mil ÷ Gb/s" rule, Polar AP8204). So the stub and rate solves answer for k, and a solve from an analysed state does not return the entered stub or rate. The harness "roundtrip" mediums are this, not bugs; they are explained in `def.ts`.
- The achieved margin (analysis) is a separate field from the required one (the same pattern as the annular ring's ratio).
- A notch at or below Nyquist fails the via whatever the loss at f_N, because the notch can sit between f_N samples. Loss above 1 dB at Nyquist is warned (same allowance as the differential-via page).
- A lossless stub shows "deep" instead of the 600 dB numerical floor.
- Residual stub: blank means "full stub, no back-drill". Back-drill depth is reported "from the bottom"; the theory says to ask the fabricator what residual stub they hold (0.1–0.25 mm typical).
- Typed numbers with no answer are red errors with a reason: exit layer above the layer count, a stub shorter than back-drilling can leave, a rate that drives f_res/f_N out of range.
- PCB material kit; the stub is ringed (red when failing, green when solved) and the back-drilled bore is drawn (user kit decision, 2026-11-24). An L1/exit-label overlap at 60+ layers was fixed.

## Sources
- **Confirmed in review (2026-11-24):** the end-capacitance resonance, the ABCD stub admittance, α_d = β·tanδ/2, and Bogatin's rule (¼ wave ≈ 3 inch per Gb/s, so 300 mil ≈ 10× Nyquist, checked against a Signal Integrity Journal article).
- Pozar (4th ed.) §2.3, 2.7, 4.4; Bogatin (3rd ed.); Johnson (2003); Polar AP8204: cited. Whether the books themselves were read is not recorded.

## Known limits and open items
- Lumped end capacitance only; no pad stack or plane coupling in the stub.
- Material presets (generic FR-4 to RO4350B and two "Megtron class" entries) are typical values, not datasheet figures.
- The record for this page is thin: the reviewer's finding list for it is not in the transcript excerpts.

## Review history
- Reviewer confirmed the physics (150 random points, worst deviation 3e-14); no via-stub bug is recorded.
- Builder's harness run: one overlap of the L1 and exit labels at 60+ layers, fixed.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed 2026-11-24 (physics confirmed), label overlap fixed 2026-11-24.
