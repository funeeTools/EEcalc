# Audio SNR and Dynamic Range — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `audio/audio-snr` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts` (block diagram drawn there; no `diagram.ts`), `tests/calc-audio-snr.test.ts`

## Purpose and scope
SNR and dynamic range of an audio chain from the source resistance and amplifier noise (EIN or e_n density), through gain and an optional ADC, with A, C or no weighting and optional TPDF dither. Solve for the SNR, the signal level (dBu, dBV or dBFS), the input noise (EIN or e_n) or the converter bits. It is not an ADC-only budget (jitter, THD): that is `signal/adc-snr`.

## Model and why
- Weighting: IEC 61672-1:2013 Annex E eq. (E.1)–(E.6) poles f1 = 20.598997, f2 = 107.65265, f3 = 737.86223, f4 = 12194.217 Hz, normalised so 1 kHz is 0 dB (A1000 −2.000, C1000 −0.062). Noise of density e through weighting W has rms e·√B_eff with B_eff = ∫|W|² df.
- Source thermal noise e² = 4kTR_s (Johnson, Nyquist); total e_tot² = e_n² + 4kTR_s; EIN = e_tot²·B_eff.
- Ideal N-bit quantiser: SNR = 6.02N + 1.76 dB, noise q²/12 over 0…fs/2 (Bennett; Kester MT-001). TPDF ±1 LSB dither adds q²/6, total q²/4 (+4.77 dB, Lipshitz et al.).
- Levels: 0 dBu = √0.6 V, 0 dBV = 1 V, 0 dBFS = rms of a full-scale sine (AES17).
- Accuracy: reviewer's Python integration of the weighting, 240 points to 3.4e-8 dB; B_eff within 6e-5 (builder harness).

## Deliberate choices — ask before changing
- **Bits solve gives the smallest whole N** that meets the target, so the achieved SNR beats it; round trips through bits are inexact on purpose (comment in def.ts; harness "roundtrip" flags on bits are legitimate). (builder, 2026-11-23)
- **Switching the converter off while solving for bits** moves `solveFor` to `snr` (analysis of the chain as entered; the last solved N stays in the state for when the converter is switched back on). `def.sync` is used because `ToggleField` has no `apply` hook. (builder, harness 2026-11-23)
- **The thermal floor is allowed as a target**: ◎ e_n from the "noiseless amp on 150 Ω" example gives e_n = 0 (1e-9 relative tolerance) instead of NO SOLUTION; ◎ EIN gives the thermal EIN. (builder, 2026-11-23)
- **No analog noise at all:** EIN shows "−∞" and is never written back. A target e_n or EIN below the source's thermal noise is rejected. (reviewer/builder, 2026-11-23)
- **dBu / dBV / V limits are one range converted exactly** (not round numbers); a typed 62.2185 dBu is just above the limit and refused: the harness "display-mismatch" high is that artefact (commented). (builder, 2026-11-23)
- **Solved e_n or signal level beyond the field limits is refused** (OUT OF RANGE): e_n = 5.48 mV/√Hz for SNR 20 dB at +20 dBu with no ADC; L_sig = +173 dBu for SNR 250 dB. (reviewer rule, 2026-11-23)
- **Sub-LSB warning depends on the dither mode** (it said "add TPDF dither" while TPDF was on). (reviewer, 2026-11-23)
- **Johnson noise of 150 Ω is quoted at 20 °C (−130.9 dBu), with −130.85 dBu at 25 °C** in the theory, matching the model; the example uses 20 °C. (reviewer, 2026-11-23)
- Weighting outside 10 Hz–20 kHz is flagged as extrapolation beyond IEC Table 3.
- Remaining harness flags legitimate: "sigDbfs −5e-15 vs 0" (relative error at zero) and typed numbers.
- Examples: mic preamp (EBU R68: −18 dBFS = 0 dBu; EIN −127 dBu), 150 Ω thermal limit, 16-bit CD, bits for 110 dB(A), max EIN, consumer −10 dBV line. Block-diagram tab: source → noise sum → gain → ADC → weighting filter. (builder)

## Sources
- IEC 61672-1:2013 Annex E and Table 3: **verified by the reviewer** from the defining constants (f1–f4 match to all digits; A(1 kHz) −1.99966, C(1 kHz) −0.06190; all 34 A/C Table 3 entries within rounding, A at 160 Hz −13.35 vs −13.4 being the edge). A-weighted ENBW over 20 Hz–20 kHz is 12468 Hz (−2.05 dB).
- Bennett 1948, Lipshitz–Wannamaker–Vanderkooy 1992, Kester MT-001, AES17, EBU R68, SMPTE RP155, Self *Small Signal Audio Design*: cited; quantisation and TPDF formulas were re-derived by the reviewer. No record the documents themselves were opened (**treat as from memory**). The 150 Ω floor is cross-checked with a Sound On Sound figure in a test name.

## Known limits and open items
- e_n recovered from EIN differs up to 3e-5 relative where e_n is far below the source's thermal noise (cancellation).
- No 1/f noise, no distortion; the quantiser is ideal.

## Review history
- Sub-LSB warning "undithered… Add TPDF dither" shown with TPDF selected (sigDbfs −150).
- Theory "150 Ω at 25 °C … −130.9 dBu" (that is the 20 °C value).
- Solve noise (en-form, sigDbu 20, SNR 20, G 0, no ADC) wrote e_n = 5.48 mV/√Hz beyond the 1e-4 maximum; solve sig with SNR 250 wrote +173 dBu beyond +60.
- Bits as the unknown, converter switched off: red "Solving for bits needs a converter" hiding the unknown.
- Example noiseless amp on 150 Ω → solve density: red NO SOLUTION from rounding at the thermal limit.
- EIN written back as a number with no analog noise.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23 (warning wording, range refusals, theory value), mode-switch harness fixes 2026-11-23 (converter toggle, thermal limit).
