# Delta–Wye Conversion — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/delta-wye-conversion` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-delta-wye.test.ts`

## Purpose and scope
Δ→Y and Y→Δ conversion, for resistors or for series R+L+C branches at one frequency (complex impedances). The page includes a balanced check (Z_Y = Z_Δ/3), a terminal-pair equivalence check, and a drawing of both networks with nodes A/B/C. Four-terminal bridges and the whole-bridge solve are out of scope; the theory points to converting one triangle at a time.

## Model and why
- Kennelly's formulas, with nodes A, B, C:
  - Δ→Y: Z_A = Z_AB·Z_CA/ΣΔ, and similarly for B and C.
  - Y→Δ: Z_AB = Π/Z_C with Π = Z_AZ_B + Z_BZ_C + Z_CZ_A, and similarly for the other branches.
- Complex arithmetic is in model.ts; division uses Smith's algorithm.
- The formulas are exact for phasors at one frequency. A Δ of mixed R, L, C generally has no fixed-part Y valid at all frequencies, so the graphs show the equivalent across frequency.
- **Check shown on the page:** the impedance between each terminal pair with the third terminal open, computed from both networks. That is the definition of equivalence.

## Deliberate choices — ask before changing
- **No `def.solve`.** It is a converter with a `given` select (delta/wye). In resistor mode the other side's R boxes are solved (green, `digits: 12`, written back).
  - In complex mode the output side's boxes are hidden and the results are R + jX, |Z|∠θ and the series L/C equivalent.
- **Switching direction converts first.** `apply` and ◎ (`takeSide`) write the equivalent into the other side, so the network does not change.
  - `prevGiven` (set in `sync`) is needed because the form sets the new select value before `apply` runs.
  - A `controls.given` was removed on purpose: it bypassed `apply` in the API.
- **Refused switches (reviewer).** The switch is refused, and a one-shot `switchNote` note says why, when:
  - a branch would have to be clamped (negative real part, L > 1 kH, C outside 1 aF … 10 F), because clamping silently changed the network (rf-negative: −11.76 + j47.06 Ω became j47.06 Ω);
  - the other side is itself invalid (R_AB = 0 gives two zero star arms, so no unique Δ).

  The note lives in the state with an age counter in `sync` (shown once, then cleared).
- **One zero star arm is not an error.** That node is the star point, the Δ branch opposite it is open, and the other two equal the remaining arms. The open branch shows "open (∞)" with value null (never ∞ in a box). When written back into a box it becomes 10 TΩ.
  - Δ→Y snaps arms below 1e-12 × the largest branch to 0, so zero arm → Δ → Y returns exactly 0.
  - Two or more zero arms, or ΣΔ = 0 (all shorted, or a series-resonant loop), are errors.
- **Harness flag kept as legitimate.** "error-after-edit": a typed arm at min or max gives an equivalent above 10 TΩ. A comment in def.ts explains this.
- **R units go down to fΩ:** converted values against a 10 TΩ branch are tiny. Units of written-back L/C/R are moved to a readable prefix.
- **Departures from the reference calculator.** The reference calculator is resistive and bidirectional with no mode switch. This page adds the complex R–L–C mode, the equivalence check, the balanced status and the frequency graphs. The reference calculator's 12/18/6 Ω example is not used.
- **Defaults:** Δ of 1 k / 2.2 k / 4.7 k → Y. The examples are balanced 30 Ω, Y 10/20/30 → Δ, a three-phase 12 + j9 Ω load at 60 Hz, and the negative-R RF case.

## Sources
- A. E. Kennelly, *Electrical World and Engineer* 34, 413–414 (1899): formulas. Citation from memory.
- Alexander & Sadiku 6e §2.7, and the chapters on impedance and three-phase. Chapter numbers are from memory and should be checked.
- Verification: an independent Python Δ→Y using an **exact rational** solve of the three terminal-pair equations matches the page to 3e-16 over 240 random complex and resistive points. The balanced 3-phase 12 + j9 → 4 + j3 Ω case is in the tests.

## Known limits and open items
- One frequency at a time; there is no wide-band equivalent synthesis.
- Branches are series R+L+C only. Parallel elements inside a branch are not supported.
- 10 TΩ stands in for an open branch when it is written into a box.

## Review history
- A complex-mode direction switch silently clamped a negative real part (rf-negative Δ→Y→Δ lost −11.76 Ω). The switch is now refused with a note; test added.
- R_AB = 0 and choosing Y → Δ snapped back silently. A note was added; test added.
- Zero arm → Δ → Y gave about 60 pΩ instead of 0. Fixed by the snap; test added.
- Harness: L/C written out of range, empty log graphs when a branch is zero (fixed with per-trace filtering and a linear fallback), labels touching rotated branches, and the "j735 m Ω" format (now one prefix for both parts).

## Changelog
- 0.1.0 (2026-11-26) — first release: Δ↔Y for resistors and R–L–C impedances at one frequency, with equivalence and balanced checks.
