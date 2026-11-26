# Crystal Load Capacitance — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/crystal-load-capacitance` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-crystal-load-cap.test.ts`

## Purpose and scope
Pierce-oscillator load capacitors for a parallel-resonant crystal: the circuit C_L (analysis) or C_L1/C_L2 for the specified C_L, standard-value pairs, frequency pulling, start-up gain margin and drive level. Overall clock accuracy (tolerance, temperature, ageing) lives on `general/frequency-ppm-tolerance`.

## Model and why
- C_L = C_L1·C_L2/(C_L1 + C_L2) + C_s (AN826). The inverses are exact (`c2For`, equal caps 2(C_L − C_s)).
- Pulling uses the exact lossless BVD form f_L = f_s√(1 + C_m/(C₀ + C_L)). Its first order is AN826's Δf = f_s·C_m/(2(C₀ + C_L)). The offset is the ratio of f_L at the circuit load to f_L at the specified load.
- **Rejected:** The reference calculator's rule of thumb ΔC_L/(2C_L) × 1000 ppm. It has no physical basis and ignores C_m and C₀.
- g_m,crit = 4·ESR(2πf)²(C₀ + C_L)² (ST AN2867).
- Drive level DL = ESR(πf·C_tot·V_pp)²/2, with C_tot = C_L1 + C_s/2. This follows from the crystal current into the measured pin's capacitor; the form matches AN2867 as remembered.

## Deliberate choices — ask before changing
- **Gain-margin criterion selector** (`gmKind`). "Oscillator G_m" requires a margin ≥ 5 (AN2867). "Max crystal g_m,crit" (newer MCU data sheets, which already include the margin) requires ≥ 1. Tone, status, warning and graph line all follow it. (reviewer)
- C_m is optional. Without it, pulling is not computed and the page says so. No invented "typical" C_m.
- Pair search: C_L1 from 1.4x to 3x (x = C_L − C_s), pairs within 2.2 : 1. Ranked by |ΔC_L| in 0.02 pF steps, with equal values preferred on ties. Very unequal pairs (e.g. 8.2 + 330 pF) are excluded on purpose.
- Pulling tones are the same on the card and in the table: yellow above a quarter of the crystal tolerance, red above half.
- Equal toggle: on while solving C_L2 → solve C_L1; off while solving C_L1 → solve C_L2. Both give the same values, so A→B→A is stable.
- |R_neg| ≥ 5·ESR is labelled an industry rule of thumb, not AN2867.
- The circuit C_L is an `output` field with a solved result in every mode, so its box is always written back.
- Harness: one high flag is kept. ◎ on C_L1/C_L2 when C_s ≥ the specified C_L has no answer, and the error is the answer (§5a: ◎ clicks report their own errors). The "roundtrip" mediums from the mismatch example are expected: solves target the specified C_L, not the circuit load. Both are commented in def.ts.
- AN826 preset: its rounded L₁/C₁ give f_s = 7 997 837 Hz, while C₁, C₀ and 8 MHz at 13 pF imply 7 995 889 Hz (244 ppm apart). The page uses the latter; the preset help and theory say so.
- ABS07 preset uses data-sheet **maxima** for C₀ (2.0 pF) and ESR (70 kΩ), as AN2867 asks for g_m,crit. Its C_m is null (not published).

## Sources
- Microchip AN826 (DS00826A, 2002): example crystal, C_L formula, ppm/pF, Δf. **Verified** from the PDF.
- Abracon ABS07 data sheet (rev. 08-10-22): C_L 12.5 pF, C₀ 0.9–1.2 typ / 2.0 max, ESR 70 kΩ, DL 0.5 µW max, ±20 ppm. **Verified** from the PDF.
- ST AN2867: g_m,crit, the ×5 margin, and the DL formula are **from memory**. The ST site timed out, so the PDF was not read; section numbers are deliberately not cited.
- Vig's crystal tutorial: from memory, background only.

## Known limits and open items
- AN2867 should be re-read to confirm the C_tot definition for the drive level and the latest wording on the g_m,crit_max criterion.
- No series resistor at XOUT; overtone crystals are not modelled; pin capacitances are lumped into C_s.

## Review history
- The help said "margin ≥ 1 for g_m,crit,max" while the page warned below 5 → criterion selector added.
- Preset switch ABS07 → AN826 left the ESR unit at kΩ (0.1 kΩ) → the preset now sets `esrUnit`.
- AN826 values 244 ppm apart → documented, not "fixed".
- `unequal` example: equal on → off left C_L1 solved → the C_L2 solve is restored.
- Card and table pulling thresholds differed → unified.

## Changelog
- 0.1.0 (2026-11-26) — first release: Pierce load capacitors with E-series pairs, BVD pulling, gain margin and drive level.
