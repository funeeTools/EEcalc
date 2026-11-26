# Transistor Switch — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/transistor-switch` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-transistor-switch.test.ts`

## Purpose and scope
Low-side switch for a relay coil, a resistive load, or an LED with its series resistor, driven from a logic pin.
- NPN BJT: base resistor and overdrive.
- N-channel MOSFET: R_DS(on) at the drive voltage, conduction and PWM losses, and a gate resistor for an edge time.

Not covered: high-side or P-channel switches, Darlingtons, gate-driver ICs, motor-drive H-bridges.

## Model and why
- **BJT:** hard saturation with forced gain β_F, I_B = I_L/β_F, R_B = (V_drive − V_BE(sat))·β_F/I_L. Overdrive = h_FE,min/β_F; below 1 the page shows the worst-case active-region current and dissipation.
  - V_CE(sat) and V_BE(sat) are maximum values from the datasheet test point at or above the load current (I_C/I_B = 10).
  - h_FE,min is the smaller of the test points just below and just above I_L, with no interpolation.
- **MOSFET:** R_DS(on) is the maximum value at the highest listed V_GS not above the drive voltage. A drive below every listed V_GS is flagged.
  - Miller plateau V_pl ≈ V_th + I_L/g_fs; edge times are t = Q_gd·R_G,tot/I_G (Balogh, TI SLUA618).
  - **Each edge is taken at the threshold that makes it slow** (reviewer): turn-on at V_th,max, turn-off at V_th,min.
  - **P_sw depends on the load** (reviewer): ½·V·I·(t_on+t_off)·f for a clamped inductive load (relay), with the caveat that the current-rise interval is not included; V·I·t·f/6 for resistive and LED loads.
  - Gate-drive power is Q_g·V_drv·f.

## Deliberate choices — ask before changing
- Solve options: rb / betaF (BJT) and rg / tsw (MOSFET).
  - A device switch maps design↔design and analysis↔analysis, so BJT→MOSFET→BJT returns the same page (reviewer).
  - sync moves a solve option that belongs to the other device to this device's analysis.
- Preset parameters are hidden fields; they are read from the tables in compute. Custom shows the fields.
- R_B rounds to the next E-series value **down** (more base current). R_G also rounds **down**, so the edge is at most the target (reviewer).
- The relay load always draws a flyback diode and assumes the switch sees V_CC + 0.7 V when off.
- Pin-current warnings start at 8 mA and 20 mA. The gate-current warning only fires when R_drv ≥ 20 Ω, i.e. a GPIO rather than a driver IC.
- No 2N7000 preset here: its datasheet gives no gate charge, so the edge time could not be computed honestly. No BC337: its datasheet could not be downloaded.
- The default is a 5 V, 70 Ω relay driven from 3.3 V through a 2N2222A at β_F 10 → R_B 313 Ω (300 Ω E24). The reference calculator's features are all covered (β, V_BE, V_CE(sat), overdrive, E-series); MOSFET mode and loss figures are additions.

## Sources
- **Verified** from the PDFs:
  - onsemi 2N3903/2N3904 and P2N2222A: V_CE(sat), V_BE(sat), h_FE minimum table.
  - AOS AO3400A: R_DS(on) 48/32/26.5 mΩ, V_th 0.65–1.45 V, g_fs 33 S, Q_g 6 nC, Q_gd 1.8 nC, R_g 3 Ω.
  - Infineon IRLML2502 and IRLZ44N. The IRLZ44N's 2.4 W comes from R_θJA 62 °C/W and T_J 175 °C.
- Balogh, TI SLUA618: plateau and switching intervals; the ½·V·I·t inductive formula. The V·I·t/6 resistive result is the standard overlap integral.
- Horowitz & Hill 3e §2.2.1: the switch rule of thumb. The §1.6.7 reference for inductive kick is from memory.

## Known limits and open items
- Edge times are first-order (Q_gd taken at the datasheet V_DS; current-rise interval ignored), good to about ×2.
- Conduction loss is taken at 100 % duty.
- BJT storage time is a note only.
- Not done: P-channel and high-side switches, a 2N7000 preset (needs gate-charge data), a gate pull-down drawn in the diagram.

## Review history
- The plateau always used V_th,max, which made turn-off optimistic (led-strip-ao3400: 186 ns → 405 ns). Fixed per edge.
- P_sw used the inductive formula for resistive loads (about 3× too high). Branched on load type.
- R_G rounded to the nearest value (the edge could come out slower than the target). Now rounds down.
- BJT→MOSFET→BJT came back as betaF instead of rb. Fixed by mapping the solve option.
- Diagram: value labels were clipped at the right edge and the load-current arrow sat on the R_L label. Fixed from the snapshots.

## Changelog
- 0.1.0 (2026-11-26) — first release: low-side BJT/MOSFET switch with base/gate resistor, losses and datasheet presets.
