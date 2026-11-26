# LC Filter Designer — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `signal/filter-designer` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `circuit.ts` (ladder schematic), `index.ts`, `tests/calc-filter.test.ts`

## Purpose and scope
Doubly terminated LC ladder filters, Butterworth or Chebyshev, low-pass, high-pass, band-pass and band-stop: minimum order for a stopband spec, the stopband attenuation of a given order, element values with optional E12/E24/E48/E96 rounding and finite inductor Q, response, passband detail and group delay, and a ladder schematic. Solve for the order n or for the stopband attenuation A_s.

Not covered: Bessel, elliptic or coupled-resonator filters (the description once claimed Bessel by mistake and was corrected 2026-11-22), unequal source and load for odd orders, active filters, distributed filters.

## Model and why
- Prototype g-values: Butterworth gₖ = 2 sin((2k−1)π/2n); Chebyshev type I from Matthaei, Young & Jones §4.05 / Pozar eq. 8.73. Frequency and impedance transformations per Pozar Table 8.6. Order limited to 15.
- **The response is computed from the actual component values with ABCD matrices**, not from the ideal prototype formula, so it checks the synthesis and shows what E-series rounding and inductor Q do (builder). The "as built" figures, the group delay and the passband loss all come from that.
- Parts are rounded to the nearest E-series value (`nearestE`).

## Deliberate choices — ask before changing
- **Even-order Chebyshev is never used between equal terminations:** the order solver rounds up to the next odd order (note "Order rounded up from n−1 to n") and a warning appears if an even order is forced (round-3 reviewer finding, 2026-11-21). Example: 7.5 MHz, 0.1 dB harmonic low-pass with 40 dB at 14 MHz solved to n = 6, which needs a 36.89 Ω load. The built-in "3 MHz Chebyshev 0.1 dB high-pass" example was changed accordingly. The reference calculator was also wrong about its even-order Chebyshev high-pass load value (coordinator, 2026-11-21).
- **Filter-type switch keeps the design** (harness, 2026-11-23): `sync` keeps f_c and f₀ equal; `retarget()` runs as the select's `apply` and mirrors f_s to the same normalised Ω_s on the stopband side of the new type (or Ω_s = 2 if it sat at the edge); an unusable bandwidth is reset to f₀/10. A → B → A restores f_s and the order.
- **A_s is written back rounded DOWN to 0.01 dB:** rounding up (18.129 → 18.13) made "solve n" need one more order, so A_s → n → A_s did not return (harness, 2026-11-23). When n is the unknown it is rounded up to a whole order, so A(f_s) exceeds the target; this is expected, not a round-trip error.
- At f_s exactly at a band-stop centre (Ω_s = ∞) every order nulls it, so the minimum order is 1: solving n from the notch example gives 1, not the example's 3. Expected, commented.
- The transmission zero reads "∞ (transmission zero)", not "lossless null": the harness bad-text check matched "null" (6 false highs), and the new wording is also more precise.
- Group delay is limited to the region around the passband and dropped when no delay is defined (a very narrow band, a few Hz at MHz, leaves none); deep-stopband delay is undefined.
- "−3 dB edges" are measured 3 dB below the passband peak, so finite-Q designs still report a bandwidth.
- Warnings for the as-built design: attenuation at f_s below the spec after E-series rounding or finite Q (when solving n); smallest C below 0.5 pF; smallest L below 1 nH; passband loss above 1 dB (inductor Q too low); fractional bandwidth below 5 %; inductor value span above 300×; notch depth above 80 dB is ideal-component only.
- The "First element" help says shunt-first gives the fewest inductors for a low-pass and series-first for a high-pass, for odd orders (reviewer item 9, 2026-11-21).
- Parts list is not row-toned: it compares ideal with standard values (coordinator, 2026-11-23).
- Default: 100 MHz Butterworth low-pass, 50 Ω, 40 dB at 200 MHz, order solved (5), shunt first, ideal parts.

## Sources
- Matthaei, Young & Jones (1964) §4.05; Pozar 4e eq. 8.73 and Table 8.6. The reviewer wrote independent ABCD and synthesis code and its own Python (`fc_filter.py`, `r3-filter/chk.py`); whether the books were opened is **not recorded**.
- Round 3 of the review (2026-11-21) concluded "the core synthesis is correct".

## Known limits and open items
- Round-3 findings 5 and 6 are in the code: midband loss and band-edge loss are separate results (the edge reads about 3 dB by definition for Butterworth), and the Butterworth return-loss row notes that it is the RL at Ω = 0.8.
- Finite-Q is modelled for inductors only, as series resistance; capacitor loss and self-resonance are not.

## Review history
- Even-order Chebyshev solved between equal terminations (7.5 MHz, 0.1 dB, 40 dB at 14 MHz → n = 6 needs 36.89 Ω; in 50 Ω ripple 0.1 → 0.32 dB; n = 4 at 0.5 dB → 1.81 dB).
- No warning when the as-built design missed A_s (E12 gave 41.15 dB for A_s = 42; Butterworth with Q_L = 20 gave 28.6 dB for 30 dB).
- Hidden losses: 10.7 MHz band-pass, 300 kHz wide, Q_L = 100 has 6.1 dB midband loss and both −3 dB edges showed "—".
- A(f_s) warning colour compared against a stale A_s in solve-A_s mode (audio example 18.1 dB flagged because the default is 40; A_s = 150 flagged a correct 47.7 dB); f_s inside the passband displayed 0.0 dB but wrote 1 back.
- NaN at exact resonance broke band edges; the notch group delay showed a fake spike (phase 1).
- Harness: filter-type switch left a stale target (defaults → high-pass: f_s = 200 MHz inside the passband; audio low-pass → band-pass jumped from 20 kHz to the 100 MHz default); extreme f₀ showed "NaN dB"; label clipped at the left edge.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built and reviewed 2026-11-21 (phase 1, three review rounds), ladder schematic and description fix 2026-11-22, mode-switch fixes 2026-11-23.
