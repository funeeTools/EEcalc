# MOSFET Operating Point — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/mosfet-operating-point` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-mosfet-op-point.test.ts`

## Purpose and scope
DC operating point of an enhancement MOSFET, N or P channel, with R_D, biased by a fixed V_GS or by an R1/R2 divider with R_S. Results: I_D, V_DS, region, g_m, r_o and gain estimates, plus the bias across the V_th spread. Switching use (R_DS(on), gate charge) lives on transistor-switch.

## Model and why
- Square law, Shichman–Hodges / SPICE level 1, with (1+λV_DS) in **both** branches so the curve is continuous at V_DS = V_ov.
- K is fitted from g_fs at a current (K = g_fs²/2I_D), from one (V_GS, I_D) point, or entered directly.
- **Honesty caveat, on purpose:** discrete vertical power MOSFETs follow the square law poorly. The page warns when I_D is more than 5× above or 20× below the fit current, and near threshold (subthreshold conduction). The theory states that the AO3400A square law gives about 7 mΩ against a datasheet 48 mΩ maximum. Do not drop these warnings.
- The bias equation I = f(V_G − I·R_S, V_DD − I(R_D+R_S)) has a strictly decreasing residual, so there is a unique root, found with Brent's method. The bracket is capped at (V_G − V_th)/R_S because Brent's tolerance is absolute; the reviewer caught it failing with huge R_S.
- Solve options:
  - 'id': analysis.
  - 'gate': V_GS or R2 for a target I_D, by Brent on the forward model.
  - 'rd': R_D for a target V_DS.

## Deliberate choices — ask before changing
- P-channel is solved in a frame measured down from V_DD, with magnitudes. Results show negative V_GS and V_DS with "−".
- N↔P swaps R1/R2 for the divider bias, so the same bias results (`prevType` is tracked in sync). Reviewer found 31 mA saturation turning into 60 mA triode.
- A switch of the K form carries K over: it sets the new form's parameters (`prevForm`) so I_D is unchanged and no red error appears. Reviewer case: custom V_th 5 V → "One point".
- The default point is 200 mA at 3.35 V, the point the typical g_fs of the 2N7000 implies with typical V_th 2.1 V. Never pair I_D(on) min (75 mA at 4.5 V) with a typical V_th: that gives a K 10× too low (reviewer).
- Presets fit K from g_fs: typical where the datasheet gives one (2N7000, AO3400A), else the minimum (IRLML2502, IRLZ44N). V_th is the typical value, or the midpoint of min and max when no typical is given.
- λ defaults to 0: datasheets do not give it.
- Default: 2N7000 common-source stage, 12 V, 1M/510k, R_D 150 Ω, R_S 47 Ω → 31 mA in saturation. The V_th-spread warning is shown on purpose (0.8–3 V).
- Kept harness flags:
  - ◎ gate after a cutoff analysis (I_D = 0) is a user request.
  - Big jumps after a preset switch are a different part.
  - With g_fs at its 1 µS minimum, sub-pA currents appear.

## Sources
- Datasheets, **verified** from the PDFs: onsemi 2N7000/2N7002/NDS7002A (V_th 0.8/2.1/3 V, g_fs 320 mS typ at 200 mA, ratings), AOS AO3400A, Infineon IRLML2502 and IRLZ44N.
- Shichman & Hodges 1968 and SPICE2 (Nagel 1975): the model form. Standard; not re-read.
- Sedra & Smith NMOS example (V_t 0.7 V, K 3.2 mA/V², R_S 3.25k, R_D 5k, ±2.5 V shifted to 0/5 V → 0.4 mA, V_GS 1.2 V): from memory, reproduced exactly in a test.

## Known limits and open items
- No P-channel part presets: no datasheet was at hand during the build (AO3401A and BSS84 are candidates).
- No temperature model for V_th or mobility, no subthreshold model, no velocity saturation.
- The fit uses a single point, so it is only good near that current.

## Review history
- Brent did not converge on a degenerate bracket (huge R_S, tiny root). Fixed with the tighter bracket.
- The default "One point" was an I_D(on) minimum paired with typical V_th. Fixed.
- N → P with the divider changed the operating point. Fixed by mirroring.
- The K-form switch errored with V_th above the old point. Fixed by carrying K over.
- The PMOS example was in triode while meant to teach saturation. R_D changed to 100 Ω.
- The output-characteristics graph clipped curves into fake plateaus. The axis now fits the family and only the load line is cut.
- The P-channel I_D arrow pointed up. Fixed.

## Changelog
- 0.1.0 (2026-11-26) — first release: square-law MOSFET bias point, N/P channel, fitted to datasheet g_fs or a point.
