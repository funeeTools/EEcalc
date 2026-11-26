# ADC SNR Budget — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `signal/adc-snr` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-adc-snr.test.ts`

## Purpose and scope
ADC SNR budget: quantization, front-end thermal noise, clock and aperture jitter, oversampling gain, THD, SINAD and ENOB. Solve for the bit count, the maximum clock jitter or the maximum input frequency that meets a target given as SINAD or ENOB. Not modelled (stated in the theory): DNL and spurs (SFDR), the shape of clock phase noise, noise shaping.

## Model and why
- Quantization SNR = 6.02N + 1.76 dB for a full-scale sine, noise spread over DC…fs/2 (ADI MT-001).
- Processing gain 10·log10(fs/(2·BW)) applies to the white terms (quantization, thermal) but **not** to THD.
- Jitter SNR = −20·log10(2π·f_in·t_j), independent of amplitude; clock and aperture jitter add root-sum-square (MT-007, MT-008, AN-756).
- ENOB = (SINAD − 1.76 + 20·log10(FS/amplitude))/6.02 (MT-003), with exact constants (10·log10 1.5 and 20·log10 2) so an ideal N-bit converter gives exactly N.
- Independent noise powers add; all in dBc at the entered input level.
- NSD is referred back to the full Nyquist band and full scale, so it does not depend on BW (ideal 12-bit at 100 MSPS = −151.0 dBFS/Hz).
- Accuracy: independent Python in V² noise powers with bisection solves (default SINAD 74.3456 dB, max jitter 232.08 fs, max f_in 508.6 MHz, oversampled N = 13); harness worst 7e-14 over 10 states.

## Deliberate choices — ask before changing
- **N is rounded up to a whole bit** (the exact value is in a note). Solving jitter or f_in from there therefore gives a larger value than the one in the box; this is not a round-trip error (comment in def.ts). (builder, harness 2026-11-23)
- **Target as SINAD or ENOB** (`targetAs`, set by ◎ buttons and listed so the AI API can set it); the other is shown green and kept inside its field range. (builder; API control added 2026-11-23)
- **A target equal to the best achievable value is met at the limit**, not "no solution": ◎ on jitter from an ideal converter gives jitter = 0 with a warning; f_in gives "NO LIMIT" (∞, value null so nothing is written back). With zero or negligible jitter the f_in solve reports "met at every frequency". (reviewer 2026-11-22; builder 2026-11-23)
- Unreachable targets name the limiting term; with no other noise the message blames the bit count (needs more than 64 bits), not jitter or thermal noise. (reviewer, 2026-11-22)
- A target outside the SINAD/ENOB ranges is refused with an explicit error. Field ranges cover every analysable output (SINAD −500…1000 dB, ENOB min −100 bits); the SINAD analysed down to about −330 dB fits. (builder, 2026-11-23)
- The SNR-vs-f_in sweep starts below f_in so the operating-point marker is always on the graph.
- Theory states the thermal-noise shortfall as ≈3–5 dB at 12 bits and 10–15 dB at 14–16 bits (a 14-bit 250 MSPS part reads 70–73 dBFS against 86 ideal). The default is a 14-bit 250 MSPS, 70 MHz IF, 100 fs clock part. (reviewer, 2026-11-22)
- Remaining flags are legitimate: the BW display mismatch high is a harness artefact of a shared-core item; round-trip mediums come from the N rounding.
- Diagram: signal chain (source → summing node with v_n → S/H clocked by f_s → N-bit quantiser). The dominant contributor is red with a caption such as "Limited by thermal noise (83 %)"; zero terms are grey; a solved N, t_j or f_in is green (∞ when no limit); no solution shows "?" in red. A block diagram on purpose: circuit details would not change the answer. (builder, 2026-11-22; coordinator decision)

## Sources
- ADI tutorials MT-001, MT-003, MT-007, MT-008 and AN-756 (Brannon). Cited by the builder; tutorial values reproduced in tests (74.0 dB, +6.02 dB per 4×, 64.04 dB for 1 ps at 100 MHz). No record that the documents were opened and compared line by line, so **treat as from memory plus reproduced tutorial numbers**.

## Known limits and open items
- No SFDR/spur model; a single THD number adds in power.
- Clock phase noise is lumped as RMS jitter.

## Review history
- NSD off by 2·PG whenever BW < fs/2: `{n:12, vn:0, tjAp:0, tjClk:0, ain:0, fs:100e6, bw:1e6}` showed −184.98 dBFS/Hz, correct −151.0.
- Theory: "thermal-noise limited 2–4 dB below ideal" was wrong for 14–16 bits.
- N-solve out-of-reach message blamed jitter/thermal noise with both at zero (`{snr:500, vn:0, tj:0}`).
- f_in solve with zero jitter returned NO SOLUTION.
- Shared solver bug: `{solveFor:'fin', snr:40, n:14, vn:0, tjAp:0, tjClk:0.1ps, ain:0, fs:100 GHz}` returned 15.9191 GHz, exact 15.9153 (brent tolerance, fixed in core, test added).
- ◎ Clock jitter or ◎ Input frequency from the "Ideal 12-bit" example said "perfect clock gives only 74.01 dB; target 74.01 dB" and dropped the graphs.
- ENOB = 200 wrote SINAD 1205.9 dB (out of range).
- Analysed SINAD −53 dB (1 µs aperture jitter) gave a red error (field min too high).
- Oversampled-audio example: f_in marker outside the sweep, label clipped.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed and fixed 2026-11-22 (NSD, messages, theory), diagram 2026-11-22, mode-switch harness fixes and API control for `targetAs` 2026-11-23.
