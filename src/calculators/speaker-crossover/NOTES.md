# Speaker Crossover — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `audio/speaker-crossover` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-speaker-crossover.test.ts`

## Purpose and scope
Two-way passive crossover L and C values for 1st to 4th order Butterworth and Linkwitz–Riley alignments, with tweeter polarity, optional tweeter L-pad, E6/E12/E24 rounding with the as-built crossing frequency, the summed response and the load seen by the amplifier. Drivers are treated as resistors; real driver impedance, Zobel networks and acoustic offsets are theory notes only.

## Model and why
- Each section is a voltage-driven LC ladder into a resistor R. Low-pass: series L, shunt C, series L…; high-pass is the s → 1/s dual. Values come from matching the ladder's ABCD denominator polynomial to the target (Butterworth (s+1), (s²+√2s+1), (s+1)(s²+s+1); LR (s+1)², (s²+√2s+1)²) (Linkwitz, JAES 1976).
- Alignments offered: `bw1`, `bw2`, `lr2`, `bw3`, `lr4`.
- Polarity is derived from the transfer functions and tested: LR2 and BW2 need the tweeter inverted (BW2 then gives +3 dB at f_c; normal polarity gives a null); LR4 and 1st order use normal polarity; BW3 sums flat either way.
- Accuracy: element coefficients match the published tables (×R/f for L, ×1/(R·f) for C; e.g. LR4 0.3000/0.2533/0.1500/0.0563, BW3 HP 0.1061/0.1194/0.3183); Python nodal-analysis solver (Gaussian elimination, not ABCD) for 5 types × 3 frequencies agrees on section levels, both polarity sums and |Z_in|; harness check worst below 2e-3 except at deep nulls where the page clamps at −240 dB and shows "< −100".

## Deliberate choices — ask before changing
- **No solve-for.** It is a synthesis calculator like the filter page (commented in def.ts); the outputs are the parts and the as-built crossing frequency. (builder, 2026-11-22)
- **Polarity is `auto` by default** and recommended per alignment; an explicitly chosen "normal" carries over when the alignment changes and is shown by the POLARITY status (the tweeter turns red with a caption like "normal: should be inverted" in the diagram), not as a red error. (builder; builder, 2026-11-23)
- **2nd-order phase difference shows +180°**, wrapped to (−180°, 180°], not −180°. (reviewer, 2026-11-22)
- **Amplifier-load statement:** parallel BW1, BW2 and BW3 are exactly constant-resistance (|Z| = R); LR2 and LR4 peak at 2R at f_c with minimum about R. The theory had said only 1st order was constant-resistance with a dip; corrected and tested. (reviewer, 2026-11-22)
- **Texts avoid "null" as prose** ("deep notch, below −60 dB", "(notch at f_c)") because the harness flags the word; the LR2-wrong-polarity example is labelled "notch at f_c". (builder, 2026-11-23)
- E6 comes from the shared `core/eseries.ts` (a local copy was removed); E6/E12/E24 or ideal. The response with ideal parts is also drawn when rounding is on.
- Circuit tab: woofer branch (low-pass ladder into R_W) and tweeter branch (high-pass ladder, then L-pad R_s, R_p when padDb > 0, into R_T), each shunt part with its own ground; the number of parts follows the order and the rounded values show. Tweeter +/− marks swap when inverted. Labels L1W, C1T… match the results. No solved tone. The horizontal capacitor label gap of 18 was a shared-core fix for phones. (builder, 2026-11-22)
- The parts table is deliberately not row-toned: it compares each ideal value with the standard part used; each part is not a separate pass or fail. (coordinator, 2026-11-23)
- Harness flags judged legitimate: low "big-jump" at values near 0 (phase 180° → ~0°).

## Sources
- Linkwitz JAES 24(1) 1976; Small JAES 19(1) 1971 (constant-resistance first order); Bullock, *Speaker Builder* 1985; Dickason, *Loudspeaker Design Cookbook* 7e. The coefficient tables were compared by the builder and independently re-derived by the reviewer ("numbers and polarity all confirmed correct"). The Bullock and Dickason citations carry no page or chapter number; whether the originals were opened is not recorded (**treat as from memory**, backed by independent computation).

## Known limits and open items
- Drivers as pure resistors: no voice-coil inductance, no Zobel, no baffle step, no acoustic offset or delay; inductor DCR ignored.
- Two-way only; L-pad on the tweeter only.

## Review history
- Theory said only 1st order is constant-resistance and "the graph shows where it dips"; actually BW2/BW3 are also constant and LR2/LR4 peak at 2R.
- Polarity help omitted 3rd order; 2nd-order phase difference shown as −180°.
- Harness bad-text flags from "null" in "sum a deep null" and the LR2 example label.
- Shared: horizontal capacitor value touched the plates on phones (crossover drawing); speaker cone overlapped its label.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed and fixed 2026-11-22 (theory text, phase wrap, E6 from core), circuit diagram 2026-11-22, mode-switch harness text fixes 2026-11-23.
