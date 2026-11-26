# BJT Bias Point — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/bjt-bias-point` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-bjt-bias.test.ts`

## Purpose and scope
DC bias of one BJT, NPN or PNP, in three networks: voltage divider + R_E, fixed base resistor, and collector feedback. The page can analyse a set of resistors or design them for a target I_C, V_CE and V_E (plus the divider current k·I_B). Not covered: small-signal gain, bypass capacitors, current-mirror bias (see current-mirror), the Early effect and I_CBO.

## Model and why
- Constant-V_BE large-signal model (Sedra & Smith 7e ch. 6, §7.4).
- Active region: I_C = β·I_B. **Saturation is solved properly**: both loops with V_CE = V_CE(sat). The reference calculator only flags saturation and prints a negative V_CE (its default shows −4.7 V).
- Cutoff when V_BB ≤ V_BE.
- PNP is solved in an "NPN frame": node voltages are measured down from V_CC, which exchanges R1 and R2. The page reports the real node voltages and a negative V_CE (with "−").
- Stability: S_β = (R_x + R_y)/(R_x + (β+1)R_y), the I_CBO factor S = (β+1)·S_β, and the drift from dV_BE/dT = −2 mV/°C. The Python reference checks these by finite differences.
- Design formulas are exact for the model, so analysing the designed parts returns the targets to 1e-12.

## Deliberate choices — ask before changing
- Solve options: 'ic' (analysis; the I_C and V_CE boxes are outputs) and 'design' (all resistors solved together, via solvedWhen, like the 555 page's Ra/Rb).
- After an active analysis the page writes V_E and k back as hidden solved values, so ◎ design straight afterwards reproduces the same resistors. Builder, after harness medium round-trip flags.
- An NPN↔PNP switch (type select, or a preset that changes type) swaps R1/R2 so the bias point stays the same. It is tracked with `prevType`, which sync maintains. Reviewer found the default saturating after the switch.
- Design mode rounds each resistor to its **nearest** E-series value and re-analyses the circuit with those parts, warning above 5 % I_C error.
- Design β is the datasheet typical h_FE where one is given, else the geometric mean of min and max (stated in the help).
- Default: 2N3904, 12 V, 160k/33k/5.6k/1.2k. These are the E24 parts of the 1 mA, V_CE 5 V, V_E 1.2 V, k 10 design.
- Kept harness flags (comment in def.ts):
  - ◎ design after a cutoff or saturated analysis can error or differ, because no design form exists there.
  - Errors after ◎ are the user's request.

## Sources
- onsemi datasheets for 2N3903/2N3904, P2N2222A, BC546/7/8, 2N3906 and BC556B/7/8: h_FE, V_CE(sat), V_BE(on), ratings. **Verified** from the PDFs. The test currents matter:
  - 2N3904 and 2N3906: 100–300 at 10 mA; the minimum at 1 mA is 70 and 80.
  - BC547B / BC557B: at 2 mA.
  - 2N2222A: ≥ 75 at 10 mA, ≤ 300 at 150 mA.
- Sedra & Smith divider example (15 V, 100k/50k, R_E 3k, R_C 5k, β 100 → V_C ≈ 8.6 V, I_E 1.29 mA): from memory, reproduced in a test.
- −2 mV/°C: textbook value (Sedra & Smith).

## Known limits and open items
- h_FE is treated as constant. Its variation with I_C and temperature is only described in a note.
- V_BE = 0.65 V is a fixed value for the presets (BC557B uses its typical 0.62 V).
- No small-signal gain or input impedance results; no I_CBO leakage.

## Review history
- NPN → PNP turned the default into saturation (forced β 6.6). Fixed by mirroring R1/R2.
- V_CE was printed as ASCII "-3.74 V". It now uses "−".
- 2N3904 h_FE,min 100 is the 10 mA value. Kept, with the help stating each test current.
- Diagram: the PNP base-current arrow pointed the wrong way, R_E = 0 was drawn as a resistor, and some ground rails ended in nothing. Fixed from the snapshots.

## Changelog
- 0.1.0 (2026-11-26) — first release: BJT bias analysis and design for three networks, NPN/PNP, with β and temperature stability.
