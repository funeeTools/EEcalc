# Comparator Hysteresis — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/comparator-hysteresis` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-comparator-hysteresis.test.ts`

## Purpose and scope
The page sets the thresholds of a comparator with positive feedback. It covers inverting and non-inverting configurations, push-pull and open-drain outputs, and a reference taken from an R₁/R₂ divider fed by V_R.
- It gives V_TH and V_TL from the resistors, or solves R₂ and R₃ for target thresholds, then lists E-series pairs.
- It does not cover the op-amp Schmitt RC oscillator (see `schmitt-trigger`) or response time.

## Model and why
- IN+ is computed by superposition (Millman). The output is a Thévenin source in each state:
  - push-pull: V_OH or V_OL behind 0 Ω;
  - open-drain high: V_PU behind R_P + R₃; open-drain low: V_OL.
- Equations follow TI TIDU020A, Maxim AN3616 and ADI MT-083.
- Solving R₂ and R₃ (R₁, and R₄ in the non-inverting case, kept):
  - For each trial R₃, the low-state equation is inverted exactly: it is linear in 1/R₂ (inverting) or in V_ref (non-inverting).
  - `invert()` then searches R₃ on the forward value of the other threshold, using the same `thresholds()`, so a solved pair round-trips exactly.
  - The R₃ ranges where R₂ > 0 are split at analytic breakpoints by `intervals()`.
- A closed form exists only for push-pull. It is not used, so that one forward model serves every output type.
- Neglected: comparator offset and internal hysteresis, bias current, push-pull output resistance, and the load.

## Deliberate choices — ask before changing
- **R₁ is kept, R₂ and R₃ are solved.** This is the TIDU020A procedure, which keeps R_x. With R₁ = 100 kΩ and 2.7 V / 2.3 V it gives 100 kΩ / 575 kΩ exactly, which is the first example and the defaults. (builder)
- **Root choice.** An open-drain output can meet the targets with two R₃ values. The solver keeps the one nearest the present R₃ (`r3hint`), so that a solve does not jump to the other branch (harness round-trip flag). (builder, after the harness)
- **Wide threshold range (±1e18 V).** With R₄ ≫ R₃ the non-inverting thresholds legitimately lie far outside the rails, and the analysis must never be refused for it.
- **Out-of-rail warning is inverting only.** In the non-inverting case it is a note: the source must swing that far, while IN+ stays at V_ref. (reviewer)
- **Open-drain rule.** The page uses R₃ > 100·R_P, as stated in the TIDU020A text. The warning fires when the output-high level is below 90 % of the swing.
- **Sink-current warning above 4 mA.** This is the current at which the LM393 V_OL is specified.
- **E-series search.** All pairs within ±15 % of the exact R₂ and R₃, ranked by the worse threshold error. Row tones: ≤ 5 % of ΔV pass, ≤ 20 % warn.
- **Kept harness flags.** All remaining `error-after-edit` flags are typed numbers that make the answer impossible: V_OH ≤ V_OL, V_TH ≤ V_TL, or a target the divider cannot reach. There is a comment above `run()`. Remaining low `unreadable` flags come from units the user picked.
- **Departures from the reference calculator.** The reference calculator has only the rail-to-rail inverting form with one solve (R₁ from a % hysteresis). This page adds the non-inverting form, open-drain, a separate V_R, two-threshold synthesis, a noise check and the E-series table.

## Sources
- TI TIDU020A (2013, rev. 2014): equations, worked example, R_h > 100·R_P. **Verified** from the PDF text.
- Maxim AN3616, ADI MT-083, Horowitz & Hill AoE 3e: cited from memory as general references.
- LM393 V_OL ≤ 400 mV at 4 mA: from memory, not re-checked.

## Known limits and open items
- There is no tolerance or worst-case analysis of the thresholds, and no offset or bias-current input.
- No graph of a noisy input against time; TIDU020A has one.

## Review history
- Harness: inverting design with V_TL < 0 had the wrong R₃ range, so R₂ came out negative and V_TH ran to 1e12 V. Fixed with sign-aware breakpoints.
- Harness: LM393 example with V_R at its minimum returned another valid root. Fixed with the root nearest R₃.
- Diagram: the V_R label overlapped R₁ in the non-inverting layout. Moved it above the terminal.
- Reviewer: the "no closer than" message printed the closest threshold as if it were the gap, and its advice "Lower R₄" was wrong (non-inverting, V_R = 2 V). The message now prints the real gap and the violated constraint, adds an explicit V_TL ≥ V_R check, and notes that scaling R₁ never helps.
- Reviewer: the out-of-rail warning also fired for the non-inverting circuit. Now inverting only.

## Changelog
- 0.1.0 (2026-11-26) — first release: comparator thresholds and R₂/R₃ synthesis with positive feedback, push-pull or open-drain, with E-series pairs.
