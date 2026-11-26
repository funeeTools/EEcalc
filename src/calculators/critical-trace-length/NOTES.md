# Critical Trace Length — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/critical-trace-length` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-critical-trace-length.test.ts`

## Purpose and scope
When a trace must be treated as a transmission line: L_crit = t_r/(k·t_pd) with t_pd = √εeff/c. Solve options: L/L_crit (the verdict, analysis), the critical length for a rise time, or the fastest rise time a trace tolerates. Gives the knee frequency 0.5/t_r and the single-pole bandwidth 0.35/t_r, a table of L_crit for each k with row tones, and two graphs; the drawing is a board top view with L and L_crit, a strip showing the edge, and a cross-section inset.
Not covered: termination design, reflections or ringing amplitude (the page only gives the verdict), loss.

## Model and why
- Lumped while TD = len·t_pd ≤ t_r/k. The user-selectable k presets are 2, 3, 4, 5, 6, 10 or custom, each explained on the page:
  - k = 2: round-trip delay equals the rise time (Montrose, EMC and the PCB 1999, "Calculating trace lengths").
  - k = 5: Bogatin, Signal and Power Integrity — Simplified 2e, ch. 8: TD below 20 % of t_r keeps unterminated ringing under about 10 %.
  - k = 6: Johnson & Graham 1993 §1.3: lumped when shorter than 1/6 of the edge's effective length l_edge = t_r/t_pd.
  - k = 3, 4, 10: other fractions in use; 10 is a conservative margin for precision clocks.
- εeff: Hammerstad & Jensen static εeff for microstrip (`microstrip/model.ts`), εr for stripline, or a typed εeff (custom).
- Knee frequency 0.5/t_r (Johnson & Graham §1.1); BW = 0.35/t_r (10–90 % edge of a one-pole low-pass, = ln 9/(2π)/t_r; Bogatin ch. 2).

## Deliberate choices — ask before changing
- The default criterion is k = 6 (Johnson & Graham); reason not recorded beyond the presets being sourced.
- **Citations (reviewer, 2026-11-24):** the lumped-vs-distributed 1/6 rule is Johnson & Graham **§1.3**, not §1.2 (confirmed from the book's table of contents; §1.1 for the knee is right). Montrose is cited by section name only: the builder could not confirm p. 117 and the reviewer could not see the equation, so no page number is given.
- **Voltage strip redrawn (reviewer, 2026-11-24):** at k = 6 the trace holds only 1/6 of the swing and the first strip was a near-flat sliver with an odd "– V" label. It now shows the full edge l_edge as a full-height ramp with a dashed 100 % "V" line on its own scale; the trace length and L_crit = l_edge/k are two separate rows under it.
- Stripline trace is `cuHidden` with vias at TX and RX, no pads or mask over it (it is on an inner layer); in the microstrip inset the mask covers the whole laminate and laps over the trace.
- A custom k is allowed from 1 to 100; k < 2 warns. L_crit spans many decades, so length units are mm, µm and km first; imperial units give "unreadable" harness flags for extreme lengths because inch/foot/mil have no prefixes (expected).
- Style guide §7b (user): PCB material kit with legend; traces rectangular until the etch-profile choice is made.

## Sources
- Johnson & Graham 1993 §1.1 and §1.3: **section numbers verified** against the book's table of contents by the reviewer; the 1/6 statement itself was not re-read.
- Montrose 1999 "Calculating Trace Lengths": the section exists (reviewer); the equation was not seen, so k = 2's attribution is plausible, not confirmed.
- Bogatin 2009 ch. 2 and ch. 8: from the builder, not verified.
- Hammerstad & Jensen 1980: through the Microstrip page. Python re-implementation: 120 random points agree to 4e-16 (reviewer).
- Test: Bogatin's rule of thumb (FR-4 stripline, k = 5, L_crit [in] ≈ t_r [ns], v ≈ 6 in/ns).

## Known limits and open items
- Montrose page number unconfirmed.
- Criterion is rule-of-thumb by nature: the page states the sources of each k rather than one "correct" value.
- No dispersion; εeff static even at high knee frequency.

## Review history
- Citation wrong: Johnson & Graham §1.2 → §1.3 (theory.ts and model header).
- Voltage strip near-flat at k = 6 with unclear "– V" → full-edge ramp with 100 % line.
- Stripline drawn as `maskCu` on top with pads and no vias → `cuHidden` with vias; microstrip inset mask a floating cap over the trace only → covers laminate.
- Harness: only typed-value errors and imperial-unit readability remain (documented in def.ts).

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed 2026-11-24 (citation, voltage strip, stripline drawing), fixed 2026-11-24.
