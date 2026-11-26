# Cascaded Noise Figure — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `rf/noise-figure-cascade` · **Version:** 0.1.0 · **Files:** `def.ts` (the model lives here, there is no `model.ts`), `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-nf-cascade.test.ts`

## Purpose and scope
Receiver line-up of amplifier, mixer and passive stages: cascade noise figure, gain, noise temperature, IIP3/OIP3, sensitivity, noise floor, SFDR, noise share per stage, stage table and a level diagram. Solve for the cascade NF (default) or for the largest NF one chosen stage may have to meet a target cascade NF.

Not covered: frequency dependence (all gains are available gains at the one frequency), mixer image-noise folding, compression point (P1dB) cascade, non-Gaussian noise sources.

## Model and why
- Friis: F = F₁ + (F₂−1)/G₁ + …, T_e = T₀(F−1), T₀ = 290 K. First built as phase 1 of the project (2026-11-21).
- Passive stage at physical temperature T_p: G = 1/L, F = 1 + (L−1)·T_p/T₀ (equal to L at 290 K).
- IP3: 1/IIP3 = Σ G_pre/IIP3_i with IIP3_i = OIP3_i/G_i, a **coherent worst case** (IM3 products add in phase); the page notes that a power-sum model gives a higher IIP3. Passives without an IP3 count as linear.
- Noise at a stage output = k(T_s + T_e,cum)·B·G_cum, starting at kT_sB, so a source temperature other than 290 K is honoured (sensitivity uses the actual T_s; the "MDS" row is the 290 K figure).
- SFDR = ⅔(IIP3 − noise floor) with the actual source temperature.
- Stage-NF solve is closed-form: F_target = A + (F_k − 1)/G_pre + rest/(G_pre·G_k), with the k = 0 case handled. The result is exact (matches a 200-step bisection to 1e-6 dB).

## Deliberate choices — ask before changing
- **An unreachable target stays `ok: true`** with a NOT ACHIEVABLE verdict, a blank solved box and the graphs of the current stages, not a red error (mode-switch review, 2026-11-23; commented in def.ts). So the harness "round trip 2.8 vs 2 dB" after duplicating the filter in the solve example is legitimate.
- **The unknown stays on the same stage** when stages above it are removed or duplicated, using a per-state WeakMap in `sync`; removing the solved stage ends the solve (harness, 2026-11-23). The core has no list-change hook, hence the workaround (the coordinator listed an `onListChange` hook as a core suggestion).
- Setting the solved stage to passive goes back to cascade analysis, because a passive stage has no NF box (its NF is set by its loss), so nothing would be visible as the unknown.
- A required stage NF below 0.3 dB warns that it is below what practical amplifiers reach.
- Mixer note: datasheet NF is usually DSB; SSB ≈ DSB + 3 dB; without an image filter the LNA's image-band noise folds in. The page does not model it.
- Level diagram: the legend sits below the plot because it hid the OIP3 trace.
- Diagram (2026-11-22): amp triangle, mixer circle with ×, passive box with resistor glyph; Σ G and Σ NF under each stage; 1–4 stages one row, 5–8 two rows, more than 8 folds the middle into a dashed box (the first, solved and last stage stay visible). When the target is unreachable the solved stage is red ("NF —") but the final Σ NF is not marked red (limitation).
- Default: preselect filter 1.5 dB, LNA 18 dB/1.2 dB/OIP3 30, mixer −7 dB/8 dB/15, IF amp 20 dB/4 dB/35; B = 1 MHz, P_in −90 dBm, required SNR 10 dB, 290 K source.

## Sources
- Friis, Proc. IRE 1944; Pozar 4th ed. ch. 10; Keysight AN 57-1 (cited in theory.ts). The reviewer (2026-11-21) said it used Pozar ch. 10 formulas in its own Python; whether the documents were opened is **not recorded**.
- The reference calculator's worked example (LNA, SAW filter, gain block; fetched once by the reviewer) agrees: F = 1.2239, NF 0.88 dB, T_e 64.9 K, IIP3 +1.3 dBm, OIP3 +34.3 dBm, floor −113.1 dBm. The reference calculator was a sanity point only.
- Independent Python: 5 chains × 2 source temperatures to 1e-13; seven realistic line-ups (GPS with SNR −20 dB in 2 MHz, NF 2.43 dB and IIP3 −27.7 dBm; HF with a hot antenna; Ku LNB with 50 K sky, NF 0.87 dB; WCDMA base station with duplexer, NF 2.38 dB; 6 dB pad, NF 2.56 dB; SDR with 3 dB loss before the LNA, NF 9.34 dB; cryogenic chain with 20 K coax).

## Known limits and open items
- The "Solve: LNA NF needed for 2 dB system" example needs a 0.08 dB LNA and carries the practicality warning (correct, left as a teaching example).
- The first reviewer's findings list was not preserved in the excerpts, only the "verified correct" part.

## Review history
- Phase-1 reviews (2026-11-21): sensitivity ignored the source (antenna) temperature; "50 K" was parsed as 50 000 K; new list items inherited values from the previous item. All fixed with regression tests.
- Harness: the solve example → stage 2 set to passive left no visible unknown (now goes back to analysis).
- Removing stage 2 in the solve example silently moved the unknown to the mixer; removing or duplicating stages above the solved one also moved it.
- Level-diagram legend hid the OIP3 trace.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built and reviewed 2026-11-21 (phase 1, 2–3 independent rounds), diagram added 2026-11-22, mode-switch fixes 2026-11-23 (passive switch, stage re-indexing, legend).
