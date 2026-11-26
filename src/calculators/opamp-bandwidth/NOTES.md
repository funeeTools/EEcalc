# Op-Amp Bandwidth — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/opamp-bandwidth` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-opamp-bandwidth.test.ts`

## Purpose and scope
The page covers bandwidth limits of voltage-feedback op-amp stages:
- small-signal f₋₃dB from GBW and noise gain (inverting NG = |G|+1);
- full-power bandwidth from slew rate, and the lower of the two at a given swing;
- rise times, phase margin, peaking and overshoot;
- n identical cascaded stages.

It solves GBW, gain per stage or slew rate. Resistor values, gain error and noise belong to `opamp-gain`. This page reuses `closedLoopBandwidth` and the `OPAMPS` presets from there, read-only.

## Model and why
- A dominant pole f₁ = GBW/A_OL, plus an optional second pole f₂. f₂ is found by brent so that the unity-gain phase margin equals the data-sheet φ_m.
- The closed loop is then second order: ω₀² = ω₁ω₂(1+A_OLβ) and Q from the same terms.
- **Cascade −3 dB.** Solved exactly from |H|²ⁿ = ½ as a quadratic in u = (f/f₀)².
  - Use the cancellation-free root form: the naive one returned 0 at very low Q.
- **Cascade step response.** Each pole is advanced with an exact first-order-hold step, which is stable for stiff stages. Explicit RK4 diverged on overdamped stages.
- **Rise time.** Exact ln9/(2πf) for one pole, Erlang for n poles, and a root search on the closed-form step for second order.
- Verified against Python built from complex A(jf) directly (bandwidth to 2e-15, rise time against RK4 to 5e-8).

## Deliberate choices — ask before changing
- **Large-step rise time.** (builder; corrected twice after review)
  - No slewing (ΔV ≤ V_slew = SR / steepest slope): exactly t_r.
  - Slewing: max(t_r, slew at SR then exponential with τ = t_r/ln9).
  - The steepest-slope τ overstated overdamped two-pole stages (TLV9002: 3.74 µs against ≈ 3.44 µs).
  - For a ringing stage (Q > 0.707) the note says it is an approximation.
- **Separate full-power bandwidth field (f_FP).** The SR solve targets f_FP, so that a solve in one mode and an analysis agree. Using the small-signal bandwidth as the SR target produced about 1500 harness round-trip flags.
- **The bandwidth field** is the chain's small-signal −3 dB: an answer in analysis and SR modes, the target in GBW and gain modes.
- **Switching to non-inverting with |G| < 1** sets |G| = 1 (a follower), the nearest valid stage, instead of a red error.
- **A preset switch** turns GBW or SR designs back into analysis: targets do not carry over.
- **SR units** (V/µs, V/ns, V/ms, V/s) are not SI prefixes of one base unit, so `def.sync` picks a readable unit for a solved SR; the core cannot.
- **Presets.** TLV9002, MCP6002 and OPA350 were checked against their data sheets. φ_m is filled in only where the data sheet states it (TLV9002 78°, MCP6002 90°). The rest use the single-pole model.
- **Diagram.** A follower draws R_f as a wire with no R_in. The cascade strip is shown only for n > 1.
- **Kept harness flags.** The remaining `error-after-edit` flags are typed numbers: a non-inverting |G| < 1, targets that no GBW or gain can reach (bandwidth never falls below the open-loop pole), or a solved SR outside the field range. There is a comment above `run()`.
- **Departures from the reference calculator.** The reference calculator gives only GBW/A_CL and 0.35/BW. This page adds noise gain, slew rate, phase margin, exact cascades and the solves.

## Sources
- **Verified** from the PDF text: TI OPA350 SBOS099D (38 MHz, 22 V/µs, 122 dB); Microchip MCP6002 DS20001733L (1 MHz, 0.6 V/µs, 112 dB, PM 90°); TI TLV9002 SBOS833R (1 MHz, 2 V/µs, PM 78° at 5.5 V).
- TLV9002 A_OL of 117 dB was picked from several table rows (100–130 dB depending on load); its effect on bandwidth is negligible.
- Franco 4e ch. 6/8 and Sedra & Smith §11.10: from memory.

## Known limits and open items
- Two-pole model only: no third pole, no capacitive load and no current-feedback amplifiers (a note says so).
- The slewing model is single-pole, and slewing is shown for the last stage only.
- No feedback-capacitor compensation calculator.

## Review history
- Fuzz: low-Q bandwidth returned 0 (cancellation) — fixed. RK4 chain gave NaN for stiff stages — replaced. The φ_m card was NaN when A_OL·β ≤ 1 — now n/a.
- Harness: SR-solve round trip — f_FP field added. Unreadable solved SR units — fixed in sync.
- Reviewer: the large-step rise time 0.8·ΔV/SR was faster than t_r — replaced by slew then settle. The follower diagram had a 0 Ω R_f and an "open" R_in — fixed.
- Re-verify: without slewing the result differed from t_r (V_pk = 0.1 V gave 3.73 µs against 3.42 µs) — now exactly t_r, and τ = t_r/ln9.

## Changelog
- 0.1.0 (2026-11-26) — first release: op-amp small-signal and full-power bandwidth, phase margin, cascades and rise time, with GBW/gain/SR solves.
