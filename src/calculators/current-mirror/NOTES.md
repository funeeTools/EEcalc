# Current Mirror — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/current-mirror` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-current-mirror.test.ts`

## Purpose and scope
The page covers six mirrors: BJT basic, degenerated (R_E with R_E/N), Wilson and Widlar, and MOSFET simple and cascode, each as a sink or a source.
- It gives R_ref for a target I_ref, I_out and its error, R_out and the compliance voltage, and the Widlar R_E and R_ref for given I_ref and I_out.
- Not covered: device mismatch statistics, body effect, high injection, and triode or saturation operation below compliance.

## Model and why
- **Large-signal device laws, solved exactly** rather than with the one-line textbook ratios.
  - BJT: I_C = I_S·e^{V_BE/V_T}(1+V_CE/V_A), I_B = I_S·e^{V_BE/V_T}/β (SPICE Gummel–Poon style).
  - MOSFET: square law with (1+λV_DS).
- The textbook ratios are reproduced as limits in the tests: N/(1+(N+1)/β), 1−2/(β²+2β+2), V_T·ln(I₁/I₂) = I_E·R_E, β·r_o/2, r_o[1+g_m·…].
- Basic, degenerated and Widlar share one solver (`bjtPair`, a brent search on ln I_e2).
- Wilson uses one brent search on ln I_e, because all its node voltages are explicit in I_e. An earlier fixed-point version produced NaN at extreme parameters.
- Cascode: brent search on the inner drain voltage V_x.
- **R_out** is the numerical derivative of the large-signal I_out(V_out), so it includes every modelled effect.
- **Source polarity** uses the same equations with voltages measured from V_CC. The drawing is the sink drawing flipped vertically.

## Deliberate choices — ask before changing
- **Below compliance** the model cannot hold: Early factors can go negative and I_out < 0. The point is therefore evaluated at the limit (`clamped`).
  - I_out, error and R_out are toned fail and labelled "(at V_out,lim)", with a warning.
  - The output graph widens its x-axis and draws the real V_out as a dashed red "saturated" line.
  - Modelling triode or saturation was judged not worth it for this page. (builder; display fixed after review)
- **R_ref for a target I_ref** is an exact closed form; the analysis from R_ref finds I_ref by root search. The two round-trip to 1e-15.
- **The Widlar solve** designs R_E and R_ref together from the I_ref and I_out targets (◎ on R_E). It is offered only for the Widlar topology, and leaving that topology turns it back into an R_ref design.
- **Presets.**
  - I_S and V_A come from the Fairchild/onsemi SPICE models: 2N3904 IS 6.734 fA, VAF 74.03; 2N3906 IS 1.41 fA, VAF 18.7.
  - β is the data-sheet minimum h_FE at 1 mA: 70 for the 2N3904, 80 for the 2N3906. (reviewer)
  - V_CE(sat) is the data-sheet maximum at 10 mA.
  - MOS preset: Sedra & Smith Ex. 8.1 process.
- **Polarity switch** swaps the 2N3904 and 2N3906 presets. The preset reverts to Custom when any value is edited (`sync`).
- **Wilson is equal-area only.** The N field is hidden there.
- **Mismatch warning** for discrete parts: 1 mV of V_BE ≈ 4 % of current. This is derived from V_T, not invented.
- **Kept harness flags.** The remaining `error-after-edit` flags are typed numbers: a supply that cannot drive the reference, a Widlar target above the R_E = 0 current, or a solved value outside the field range. There is a comment above `run()`.
- **Departures from the reference calculator.** The reference calculator uses I_out = N·I_ref·β/(β+2), which is wrong for N ≠ 1, and V_BE = 0.7 V. This page solves the transcendental equations instead.

## Sources
- Gray, Hurst, Lewis & Meyer 5e ch. 4; Sedra & Smith 7e ch. 8 (Ex. 8.1 reproduced: R = 19.84 kΩ, V_OV = 0.316 V; Widlar 11.5 kΩ); Razavi 2e ch. 5. All from memory.
- SPICE parameters, h_FE minimums and the 625 mW rating: from memory, not re-checked against the PDFs.

## Known limits and open items
- No body effect in the cascode, no temperature drift of I_S, no improved four-transistor Wilson, no β fall-off with current.
- Degeneration R_out is ~15 % from the simple textbook formula, because the base is driven through Q1 + R_E. This is expected, and the test uses Gray & Meyer's R_B form.

## Review history
- Fuzz: NaN or brent errors with V_out far below the rail. Fixed with clamp-at-compliance, guarded brackets and the brent-based Wilson.
- Python cross-check: clamped cases are excluded from the comparison, which still covers 287 cases to 2.7e-14.
- Diagram: in the source polarity the I_out value touched the V_out label. Moved.
- Reviewer: below-compliance figures read as real. Now toned fail and labelled, and the graph shows V_out.
- Reviewer: dissipation value and its display used different voltages; the large-N base-current hint was shown only for the basic topology; β 100 changed to 70/80 at 1 mA.
- Re-verify: the saturated line was not drawn dashed red. Fixed.

## Changelog
- 0.1.0 (2026-11-26) — first release: BJT and MOSFET current mirrors solved with large-signal models, with R_ref/Widlar design, error, R_out and compliance.
