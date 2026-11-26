# LM317 / LM337 Resistors — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/lm317-resistors` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-lm317.test.ts`

## Purpose and scope
Sizes the two set resistors of an adjustable three-terminal regulator (LM317 positive, LM337 negative, or custom data) and checks what breaks real designs: headroom, minimum load, tolerance spread, rating and dissipation. It gives no junction temperature: that belongs on `power/ldo-thermal`, and the warnings point there.

## Model and why
- V_out = V_REF(1 + R₂/R₁) + I_ADJ·R₂ (TI SLVS044Z eq. 1–2). Solving for R₁ or R₂ uses exact closed-form inverses of that one forward equation, so a solved value round-trips exactly.
- The LM337 uses the same equation in magnitudes. The state stores magnitudes (min 0); the sign is shown only in displays and the drawing (`PARTS[part].neg`).
- Worst case: V_REF ±vrefTol, R₂ high with R₁ low (and the reverse), I_ADJ anywhere from 0 to I_ADJ,max. The data sheets give no I_ADJ minimum, so 0 is used. No RSS (the reference term dominates).
- P_D = (V_in − V_out)(I_L + V_REF/R₁) + (V_in − V_out + V_REF)·I_ADJ.

## Deliberate choices — ask before changing
- The default R₁ is 120 Ω, not the classic 240 Ω: 120 Ω meets the 10 mA guaranteed minimum load on its own (TI LM337 §9.2.2). 240 Ω only meets the 3.5 mA typical and therefore warns. (builder)
- Minimum load: I_R1 + I_L,min ≥ I_min (10 mA max spec). I_L,min is a separate input because load current can drop to 0.
- E-series pair search: R₁ ranges over ×/÷2.2 of the present value and extends down to V_REF/(I_min − I_L,min). Pairs that fail the minimum load **sort last**, whatever the present R₁ is. (reviewer, 2026-11-26)
- "Keeping R₁ / R₂" pick: shown beside the best pair, as the hand-design alternative.
- Presets are limited to LM317 and LM337, whose values were verified in the TI PDFs. LM338/LM350 are left to "Custom": their limits were not verified.
- Headroom V_DO defaults to 3 V because TI specifies the parts from 3 V and says they need "up to 3 V".
- In dropout (V_in < V_out + V_DO), P_D and η show "—" (null), and the drawing's block reads "dropout". (reviewer)
- The current arrows in the drawing reverse for the negative part (conventional current direction).
- Harness: the medium "error-after-edit" flags are typed impossible targets (V_out < V_REF, R outside 1 Ω…1 MΩ / 0…100 MΩ, I_ADJ·R₂ ≥ V_out − V_REF). These errors are the intended answer.
- Field ranges: V_out goes up to 1e9 so every analysis result fits. A solved R outside its field range returns ok:false with a message.
- Departure from the reference calculator: the reference calculator has no worst case, no minimum-load check, no headroom check and no LM337; all are added here. The reference calculator's "Ideal" series option is dropped, since the exact value is always shown.

## Sources
- TI SLVS044Z (rev. Apr 2025), LM317: eq. 1–2, §6.6 table (V_REF 1.2/1.25/1.3, I_ADJ 50/100 µA, min load 3.5/10 mA, current limit 1.5 A), §7.4 headroom. **Verified** from the PDF.
- TI SLVS047L, LM337: V_REF −1.2/−1.25/−1.3, I_ADJ 65/100 µA, min output current 2.5/10 mA, R₁ = 120 Ω → 10.42 mA. **Verified** from the PDF.
- 240 Ω / 720 Ω: Fig. 8-1 shows R₁ = 240 Ω with no R₂; 720 Ω appears only in Fig. 8-9 (tracking preregulator). The 5.036 V figure is a **hand calculation**, not a published example (corrected after review).
- Horowitz & Hill, AoE 3e ch. 9: from memory. IEC 60063: via `core/eseries`.

## Known limits and open items
- Line and load regulation, thermal drift and the falling current limit at high differential are not modelled; the last only gets a note.
- The dropout is a single number, not a curve. For a current-dependent dropout, use the regulator-dropout page.

## Review history
- V_in = 3 V with the defaults gave P_D = −421 mW and η = 158 % → now "—" in dropout.
- LM337: the I_R1/I_ADJ arrows pointed the positive-regulator way → reversed.
- `high-r` example: the best E96 pair raised R₁ to 1.24 kΩ although 1 kΩ already failed the minimum load → min-load failures now rank last.
- "TI typical application 240/720" citation unconfirmed → relabelled as a hand calculation (Fig. 8-1 / 8-9).

## Changelog
- 0.1.0 (2026-11-26) — first release: R₁/R₂ for LM317/LM337 with I_ADJ, E-series pairs, worst case, minimum load, headroom and dissipation.
