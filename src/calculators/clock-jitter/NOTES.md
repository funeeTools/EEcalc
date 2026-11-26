# Clock Jitter — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `protocol/clock-jitter` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-clock-jitter.test.ts`

## Purpose and scope
RMS ↔ peak-to-peak jitter at a bit error ratio with the dual-Dirac model, a jitter budget built from a list of sources, the eye margin at a data rate, and the jitter-limited SNR of a sampling clock. RJ and DJ are typed ("direct") or built from the list ("budget"). Solve for TJ, BER, RJ, DJ or the maximum data rate. Period and cycle-to-cycle conversions are given for white jitter only. The converter-level SNR (quantisation, thermal, aperture) lives on `signal/adc-snr`.

## Model and why
- TJ(BER) = DJ + 2·Q⁻¹(BER/ρ_T)·RJ, Q(x) = ½·erfc(x/√2). erfc by power series below 2 and a Lentz continued fraction above (A&S 7.1.5/7.1.14, Numerical Recipes), accuracy about 1e-15.
- Budget: independent random terms add in RSS, dual-Dirac DJ terms add linearly (Stephens 2004; FC-MJSQ).
- ADC SNR = −20·log₁₀(2π·f_in·σ) (ADI MT-008, AN-756). Period jitter σ√2 and cycle-to-cycle σ√6 for uncorrelated edge errors (Da Dalt & Sheikholeslami), labelled as the white-jitter case only.
- **Eye margin = UI − TJ − t_su − t_h** (builder). The builder judged the reference calculator's "T − setup − hold − TJ" margin physically wrong and replaced it (reason: user-visible in the page; the builder's own judgement).
- Solving for the data rate gives the highest rate at zero margin, by construction (margin forced to exactly zero to avoid a 1e-26 s residue).

## Deliberate choices — ask before changing
- **Transition density ρ_T is a select** (reviewer finding, builder fix, 2026-11-23). 1 is the default and reproduces AN-815 Table 1 (2Q = 14.069 at 1e-12); 0.5 for random NRZ data gives 13.874. The theory, the note, `method` and the model header all state which convention applies. The `serdes-rj-limit` example uses 0.5.
- The 14.069 table is cited to **AN-815 only**, which the builder read. It is deliberately not attributed to Maxim, Stephens or FC-MJSQ, whose convention could not be confirmed.
- Any value written back is checked against its field range, else `ok: false` naming the field and range (reviewer rule 4, 2026-11-23): BER 1e-18 … 0.1 (TJ = DJ + 1 fs would need BER 0.49996), RJ 0.1 fs … 1 ms, DJ 0 … 1 ms, budget totals, TJ up to 20 ms (`TJ_MAX = 20·T_MAX` in def.ts; RJ = DJ = 1 ms at 1e-18 needs 18.5 ms; widened from 10 ms by the harness fix, 2026-11-23; a def.ts comment still says 10 ms). A value typed at a field limit gets 1e-9 relative slack so it solves back.
- Mode switches (harness, 2026-11-23): BER example → "Budget of sources" analyses TJ instead of a red error; typed RJ/DJ/TJ and the unknown are kept in an internal `directStash` so typed → budget → typed returns the same answer.
- The harness round-trip flag "rate = 2.13 Gb/s but the state has 1 Gb/s" is expected (rate is a maximum, not an inverse). Typed impossible values (BER below 1e-18, TJ ≤ DJ) and removing every RJ source are legitimate red errors.
- A warning fires when 2π·f_in·RJ ≥ 1, where SNR and ENOB would go negative (reviewer).
- Default: direct mode, RJ 5 ps (the budget list holds four sources: reference oscillator, PLL, two fanout buffers, ISI + crosstalk), DJ 100 ps, BER 1e-12, 1 Gb/s, t_su 200 ps, t_h 100 ps, f_in 100 MHz (TJ 170.345 ps).

## Sources
- **Read:** IDT/Renesas AN-815 "Understanding Jitter Units" (Rev. A, 2014) Table 1, reproduced in the test (14 rows, plus the 4 ps → 56.3 ps example). The IEEE P802.3ae Task Force comment on D3.2 (proposed Annex 48B §1.1, file asanders_1_0901.pdf, Aug–Sep 2001) was downloaded and read: it says BER is the probability of an error at a transition times the transition density, assumed 50 % for typical data. It names no author.
- Background, not confirmed against the documents: Maxim HFAN-04.0.2; Stephens, Agilent white paper (2004); INCITS FC-MJSQ (2004); Da Dalt & Sheikholeslami (2018). ADI MT-008 / AN-756 reproduce 1 ps at 100 MHz = 64.04 dB.
- Python references with independent bisection Q⁻¹: 480 points, worst 5.8e-13, then 480 points with ρ_T, worst 1.3e-13; reviewer 400 states, worst 7e-14.

## Known limits and open items
- Gaussian RJ plus δδ DJ only; no bounded uncorrelated jitter, no phase-noise integration, no PLL transfer.
- Period (√2) and cycle-to-cycle (√6) factors hold for white edge errors only.
- Phone width: the theory's wide KaTeX equation scrolls the page sideways by a few pixels (found 2026-11-24, reported, not fixed).

## Review history
- Theory never said that Q = Q⁻¹(BER) assumes ρ_T = 1 (AN-815) and cited Stephens/FC-MJSQ for it → ρ_T select and explicit statement.
- BER solve wrote out-of-range values: TJ = DJ + 1 fs gave BER 0.49996; other cases 1.1e-268 → refused.
- SNR and ENOB negative without warning at 2π·f·RJ ≥ 1.
- Solved TJ, RJ, DJ and budget totals written outside field ranges (RJ = DJ = 1 ms at 1e-18 gave TJ 18.5 ms; TJ = 10 ms at BER 0.1 gave RJ 3.9 ms; TJ = 1e-16 at 1e-18 gave RJ 5.7e-18; a 64 × 1 ms budget gave RJ 8 ms, DJ 64 ms, TJ 177 ms).
- The "IEEE 802.3ae comment" citation was vague and missing from the reference list → full entry added.
- Harness: BER example → budget was a red error (BER below 1e-18); typed → budget → typed did not return the same answer; round-off at RJ, DJ, BER and rate limits.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23 (ρ_T select, range guards, citation), mode-switch fixes 2026-11-23 (budget switch, TJ range).
