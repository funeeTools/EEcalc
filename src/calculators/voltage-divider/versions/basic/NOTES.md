# Voltage Divider (Basic) — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `power/voltage-divider@basic` · **Version:** 0.1.0 · **Files:** `versions/basic/def.ts`, `index.ts`, `theory.ts`, `tests/calc-voltage-divider-basic.test.ts`

## Purpose and scope
The bare two-resistor divider: V_in, R₁, R₂ and V_out, solve for any one. Results: the solved value, the division ratio, the current, the output resistance R₁∥R₂ and the power in each resistor; one graph (V_out vs R₂); the circuit.
It is a **separate calculator**, the second version of `power/voltage-divider` (the default, labelled **Standard**). It is reached only from the version button beside the title, not from the menus or the finder (style guide §13a).
Not covered, on purpose: a load, standard-value (E-series) pairs, tolerance, chip sizes. Those are the Standard version's job.

## Model and why
- V_out = V_in·R₂/(R₁+R₂), with the exact closed-form inverse for each unknown (Kirchhoff/Ohm; any circuits text, e.g. Horowitz & Hill 3e §1.2.3). With no load, these are the same equations as the Standard version, and a test checks that both give the same V_out.
- The graph sweeps R₂ two decades either side of its value with R₁ and V_in fixed, and marks the operating point: it shows how the ratio saturates towards V_in and 0.

## Deliberate choices — ask before changing
- **Exists to demonstrate other versions** (user, 2026-11-26: "add another version of the resistor voltage divider that I can see working"). The coordinator chose a deliberately simpler variant rather than a copy of the Standard version, so the difference is visible.
- **Key `basic`, label "Basic"** (coordinator, 2026-11-26). The key is part of the id used by saved calculations, links and agents: never rename it.
- **Self-contained:** imports only `@/core/…` and its own files, never `../../model.ts` or the Standard def, so editing the Standard version cannot change this one (coordinator; a test in `tests/versions.test.ts` enforces it). It therefore repeats the few lines of divider algebra on purpose.
- **Version 0.1.0**, like every new calculator; it is not an "older" version of the Standard one, so it does not borrow a lower number (coordinator).
- Defaults 12 V across 30 kΩ / 10 kΩ, solving V_out = 3 V: round numbers a reader can check by hand (coordinator). Default solve is V_out (analysis), unlike the Standard version's R₁, because the basic page is about seeing what a divider does.
- Same input limits and solve messages as the Standard version (impossible ratio, V_in = 0, V_out = 0).

## Sources
- Divider equation: textbook (Horowitz & Hill 3e §1.2.3), from memory; trivially checked by hand and against the Standard version.

## Known limits and open items
- Not reviewed by an independent reviewer or run through the mode-switch harness (built as a demonstration; the equations are the Standard version's unloaded case).
- No examples beyond two; no worst-case or parts output by design.

## Review history
- None yet.

## Changelog
- 0.1.0 (2026-11-26) — first version: unloaded divider, four solve options, V_out vs R₂ graph, circuit.
