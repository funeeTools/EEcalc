# EIRP Calculator — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `antenna/eirp-calculator` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-eirp.test.ts`

## Purpose and scope
EIRP and ERP from transmit power, cable loss, other losses and antenna gain (dBi or dBd, power in dBm or W), compared with a regulatory or user-entered limit. Solve options: EIRP (analysis), transmit power, antenna gain, cable loss (the attenuator needed). Reports the maximum Tx power and maximum gain under the limit.

Not covered: 868 MHz and 433 MHz SRD rule presets (no rule text was available; the user ERP/EIRP limit covers them), other regions' rules, SAR or field-strength limits (see `rf/power-density`), link budgets (see `rf/free-space-path-loss`).

## Model and why
- EIRP = P_t − L_c − L_o + G_i, in dB, so every unknown has an exact inverse. ERP = EIRP − 2.15 dB, dBd = dBi − 2.15 (half-wave dipole D₀ = 1.643; Balanis §4.6, ITU Radio Regulations).
- Limit rules carry a base power and a slope (dB per dB of gain above 6 dBi) so the "maximum gain" result works for every preset (builder fix, 2026-11-23).
- FCC 47 CFR 15.247 presets: (b)(3)/(b)(4) 1 W conducted minus the gain above 6 dBi; (c)(1)(i) 2.4 GHz fixed point-to-point, 1 dB per 3 dB above 6 dBi; (c)(1)(ii) 5.8 GHz point-to-point, no reduction; (b)(1) 2.4 GHz FHSS below 75 channels, 0.125 W; (b)(2) 902–928 MHz FHSS, 1 W with at least 50 channels and 0.25 W with 25–49.
- ETSI EN 300 328 V2.2.2: non-FHSS limit is min(20 dBm, 10 + 10·log(B/1 MHz)) e.i.r.p. (§4.3.2.3.3, 10 dBm per MHz, B below 1 MHz counts as 1 MHz, flat spectrum assumed); FHSS 20 dBm.

## Deliberate choices — ask before changing
- **The FCC limit is applied to P_t as entered, so cable loss earns no credit** (builder; a note on the page says so). It is the conservative reading of "conducted output power".
- The EIRP box range is −400 … 200 dBm so that every analysis from the input limits (−350 … 170 dBm) is accepted (reviewer finding, builder fix, 2026-11-23).
- ETSI is split into non-FHSS (adds a bandwidth input shown only for that preset, plus a PSD result) and FHSS presets (reviewer, 2026-11-23). The 1 W FCC preset is labelled to say it also covers FHSS cases; the notes cite §4.3.1.2.2 for FHSS and §4.3.2.2.2 for other wideband modulations.
- A cable cannot add power: solving for cable loss that would need negative loss is a NO SOLUTION (soft failure). The harness round-trip flags after a "soft NO SOLUTION" state are legitimate and commented in `stop` / `fail` (harness review, 2026-11-23).
- Large jumps in margin after a limit change are expected (harness note).
- Default: 2.4 GHz access point, 20 dBm, 1.5 dB cable, 0.5 dB other, 8 dBi, FCC 15.247 (1 W, minus gain above 6 dBi), 36 dBm limit.

## Sources
- 47 CFR 15.247 from the eCFR text the builder fetched; ETSI EN 300 328 V2.2.2 §4.3.x.2.3 from the PDF the builder fetched; the reviewer re-checked the FCC (b)(2) and (c)(1)(i) presets against the CFR text it fetched earlier, and the ETSI PSD formula "from my knowledge of the standard; I did not fetch the text" (**partly from memory**); the builder said it confirmed §4.3.2.3.3 in the PDF.
- Balanis §4.6 (dipole gain) from the code header; verification not recorded.
- Self-checks: builder 240 points at 1.4e-14 dB against Python in watts; reviewer 800 random states over all 10 presets (PSD with B from 1 kHz to 1 GHz, all solve modes, W and dBd entry) with max deviation 3.6e-15 dB, plus 4000 fuzz states with no OUT OF RANGE.
- The reference calculator was used for its feature list only.

## Known limits and open items
- Phone width: the theory section's wide KaTeX equations widen the page by a few pixels (reported 2026-11-24, not fixed).
- At 1280 px the "Radiated power" label was 6 px truncated (reviewer nit; the drawing label was fixed, the field label status is not recorded).
- No gain-pattern or polarisation correction; gain is the peak.

## Review history
- EIRP field range −100…150 dBm refused valid analyses: P_t = 100 dBm with G = 70 dBi gave OUT OF RANGE (136 of 3000 fuzz states).
- ETSI non-FHSS PSD limit (10 dBm/MHz) was missing.
- Presets missing or mislabelled: 902 MHz FHSS (b)(2), 2.4 GHz FHSS point-to-point (c)(1)(i), the 1 W label said digital modulation only.
- Note cited §4.3.1.2.2 (FHSS clause) for the wideband definition; should be §4.3.2.2.2.
- Drawing label overlap fixed 2026-11-23.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23 (range, ETSI split, FCC presets, citation), diagram label fixed 2026-11-23.
