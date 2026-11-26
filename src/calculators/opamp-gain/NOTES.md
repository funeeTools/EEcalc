# Op-Amp Gain — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/opamp-gain` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-opamp-gain.test.ts`

## Purpose and scope
Inverting, non-inverting and difference amplifiers: resistor values for a target gain, closed-loop bandwidth from GBW, Bode plot, noise, and worst-case CMRR of the difference stage. Bandwidth-focused work (full-power bandwidth, phase margin, cascades) lives on `general/opamp-bandwidth`, which reuses this page's `closedLoopBandwidth` and `OPAMPS` presets read-only. This page has no supply rails or output-swing model.

## Model and why
- Ideal gain: non-inverting 1 + Rf/Rin; inverting −Rf/Rin; difference Rf/Rin. Gain is entered as a magnitude |G|; the sign follows the configuration.
- Single dominant pole A(s) = A₀/(1 + s/ωp), ωp = 2π·GBW/A₀. Exact closed-loop −3 dB frequency f_c = (GBW/A_OL)(1 + A_OL/NG), feedback factor β = Rin/(Rin + Rf) (Franco ch. 1, 2, 6).
- The single-pole model is optimistic below noise gain 2; the page says so.
- Also: noise gain, loop gain, DC gain error, rise time, gain and phase at an optional signal frequency, GBW needed for ≤ 1 % error (f_c ≥ 7.02·f), slew-limited full-power bandwidth, bias-balance resistor, √(4kTR) noise, gain range over resistor tolerance.
- Accuracy: Python nodal solve of the inverting ×47 / NE5532 case (gain, phase, bandwidth at 20 kHz); CMRR over all 16 tolerance corners = 54.4024 dB vs 54.403 dB from (1+G)/(4t); a later harness comparison of 12 states agreed to 2e-16.

## Deliberate choices — ask before changing
- **|G| keeps its meaning across configurations**, so a resistor design keeps its target when the user changes configuration. Exceptions (builder fix, harness 2026-11-23): a target the non-inverting stage cannot reach (|G| < 1, or Rin sizing at |G| = 1) goes back to analysis of the entered resistors, with no red error; a follower (Rf = 0) switched to inverting or difference solves Rf for the present gain.
- **Rf may be 0 Ω** (the unity-gain follower, non-inverting |G| = 1), so `rf` min is 0; any other solved Rf below 1 mΩ is refused with its own message. The gain range (1e-15 … 1e16) covers every Rf/Rin ratio of the resistor ranges so analysis never leaves it. (builder, 2026-11-23)
- **Keep-the-entered-resistor row:** besides the best E-series Rf/Rin pair, the page offers "keep the resistor you entered, round the other". Outside 1 Ω – 10 MΩ it says "no practical resistor" and warns, and the pair search is range-limited through the shared function. (reviewer, 2026-11-22)
- Pair table rows are toned by gain error against max(tolerance, 0.5 %): green within half the limit, yellow within the limit, red above. (coordinator, 2026-11-23)
- The loop-gain display uses one decimal, never "−0.0", with a typographic minus; the DC-error warning reads "Loop gain A_OL·β is only 0.0 dB, so the DC gain is 50.0 % below the ideal value". (reviewer, 2026-11-22)
- Presets are typical data-sheet values: NE5532 cites SLOS075K (12 MHz, 5 V/µs; older revisions say 10 MHz, 9 V/µs), TL072H cites SLOS080W (A_OL 120 dB at R_L = 2 kΩ), plus LM358 and OPA2134. The citations appear in the preset help and theory. (reviewer, 2026-11-22)
- Harness: the 180° phase jump when switching to inverting, typed gain extremes, and Rin = ∞ at unity gain were judged legitimate. (builder, 2026-11-23)
- Diagram labels R_f, R_in, R₃, R₄, V_in, V_out with the solved part toned. (coordinator, 2026-11-22)

## Sources
- Franco, *Design with Operational Amplifiers* 4e, ch. 1, 2, 6; Horowitz & Hill 3e ch. 4 and 8; IEC 60063. Books not recorded as opened (**treat as from memory**); results verified by Python (above).
- TI data sheets LM358 (SLOS068), TL07xH (SLOS080), NE5532 (SLOS075), OPA2134 (SBOS058): the reviewer corrected the NE5532/TL072H citations against them. No record whether OPA2134 figures were re-read.

## Known limits and open items
- No rails, output swing, input common-mode range or second pole; one pole only.
- Difference amp assumes R3 = Rin, R4 = Rf (matched pairs plus a tolerance spread).

## Review history
- DC-error warning printed "−0.0" / double negative for tiny loop gain → fixed, regression test.
- Near-unity gain produced a sub-ohm "standard" resistor in the keep-the-other row → "no practical resistor".
- NE5532 / TL072H preset citations used the wrong revision figures → corrected.
- Non-inverting |G| = 1 solving Rf: Rf = 0 refused as OUT OF RANGE → min is 0.
- Inverting |G| < 1 switched to non-inverting → red error; now analysis.
- Follower (Rf = 0) switched to inverting or difference → now solves Rf.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed and fixed 2026-11-22 (loop-gain wording, near-unity row, preset citations), diagram 2026-11-22, row tones 2026-11-23, mode-switch harness fixes 2026-11-23.
