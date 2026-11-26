import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: '555 timer — how this calculator works',
    lead:
      'The 555 is two comparators, a flip-flop and a discharge transistor. An external RC charges until the capacitor reaches the upper threshold (⅔·V<sub>CC</sub>) and is discharged until it falls to the lower one (⅓·V<sub>CC</sub>). Every timing formula is therefore an RC charge between two known voltages. This page evaluates those exponentials exactly, as in the TI NE555 and TLC555 data sheets, for the astable oscillator and the monostable one-shot, and can solve for the resistors or the capacitor that give a target timing.',
  },
  sections: [
    {
      title: 'Thresholds',
      html: `<p>A resistor divider inside the chip sets the two comparator references: the THRES comparator trips at $V_U = \\tfrac23 V_{CC}$ and the TRIG comparator at $V_L = \\tfrac13 V_{CC}$. A voltage $V_{CV}$ applied to CONT (pin 5) overrides the divider: $V_U = V_{CV}$, $V_L = V_{CV}/2$. This is how a 555 is voltage-controlled (VCO, PWM). Because both thresholds scale with $V_{CC}$ when CONT is left open, the standard circuits’ timing does not depend on the supply voltage — no longer true with a fixed $V_{CV}$ or with the diode option below.</p>
<p>Charging a capacitor through $R$ from $V_1$ towards a source $V_S$ reaches $V_2$ after</p>
$$t = RC\\,\\ln\\frac{V_S - V_1}{V_S - V_2}$$
<p>which is all the analysis below needs.</p>`,
    },
    {
      title: 'Astable (free-running) operation',
      html: `<p>C charges through $R_A + R_B$ from $V_L$ to $V_U$ (output high), then the discharge transistor pulls the $R_A$–$R_B$ node to ground and C discharges through $R_B$ from $V_U$ to $V_L$ (output low):</p>
$$t_H = (R_A + R_B)\\,C\\,\\ln\\frac{V_{CC} - V_L}{V_{CC} - V_U} = \\ln 2\\,(R_A + R_B)\\,C,\\qquad t_L = R_B\\,C\\,\\ln\\frac{V_U}{V_L} = \\ln 2\\,R_B\\,C$$
$$f = \\frac{1}{t_H + t_L} = \\frac{1}{\\ln 2\\,(R_A + 2R_B)\\,C} \\approx \\frac{1.44}{(R_A + 2R_B)\\,C},\\qquad D = \\frac{t_H}{t_H + t_L} = \\frac{R_A + R_B}{R_A + 2R_B}$$
<p>The duty cycle is always above 50 %, because the charge path includes $R_B$. Two common ways around that: put a diode across $R_B$ (C then charges through $R_A$ only, towards $V_{CC} - V_F$, so $t_H$ and $t_L$ are independent), or use the output inverted. The diode option on this page uses the exact charge target $V_{CC} - V_F$, which matters at low supply voltage.</p>
<p>After power-up the capacitor starts at 0 V instead of $V_L$, so the first high period is longer: $t_{H1} = (R_A + R_B)\\,C\\ln 3$ with the internal divider. The waveform plot shows this.</p>`,
    },
    {
      title: 'Monostable (one-shot) operation',
      html: `<p>While idle, the discharge transistor holds C at 0 V. Pulling TRIG below $V_L$ sets the output high and releases C, which charges through $R_A$ until it reaches $V_U$; then the output returns low and C is discharged again:</p>
$$t_w = R_A\\,C\\,\\ln\\frac{V_{CC}}{V_{CC} - V_U} = \\ln 3\\,R_A C \\approx 1.1\\,R_A C.$$
<p>The trigger must return above $V_L$ before $t_w$ ends, otherwise the output stays high. Triggers that arrive during the pulse are ignored.</p>`,
    },
    {
      title: 'Solving for R or C',
      html: `<p>Click ◎ beside a value to make it the unknown:</p>
<ul>
<li><strong>f and D</strong> (astable) or <strong>t_w</strong> (monostable) — from the parts.</li>
<li><strong>R_A and R_B</strong> for a target frequency and duty, given C: $R_B = t_L/(C\\ln 2)$ and $R_A = t_H/(C\\ln 2) - R_B$. A duty of 50 % or less gives $R_A \\le 0$ — the page says so and points to the diode option. In monostable mode, $R_A = t_w/(C\\ln 3)$.</li>
<li><strong>C</strong> for a target frequency (the duty then follows from $R_A/R_B$) or pulse width.</li>
</ul>
<p>The timing is linear in each part, so these inverses are exact. The parts are then rounded to the nearest preferred values (E24 resistors and E12 capacitors by default) and the timing you will actually get is shown.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Resistor range.</strong> Keep $R_A \\ge 1$ kΩ: during $t_L$ the discharge pin sinks $V_{CC}/R_A$. At the top end, the NE555’s threshold input current (up to 250 nA) limits $R_A + R_B$ to about 3.4 MΩ at 5 V and 10 MΩ at 15 V (TI data-sheet note). CMOS parts (TLC555, LMC555) draw picoamps and allow much larger values, limited by capacitor and board leakage.</li>
<li><strong>Capacitor.</strong> Use C0G/NP0 ceramic or film for accurate, stable timing. Electrolytics give ±20 % tolerance and leakage that lengthens $t_H$; class-2 ceramics lose capacitance with DC bias and temperature.</li>
<li><strong>Speed.</strong> Comparator and flip-flop delays of a few hundred nanoseconds add to each half-cycle; both the NE555 and TLC555 data sheets specify the astable equations only below 100 kHz, so above that expect the frequency to come out low (the TLC555 can still oscillate to about 1.2 MHz minimum, 2.1 MHz typical, under its test conditions). The NE555 data sheet also limits the monostable pulse to at least 10 µs.</li>
<li><strong>Supply.</strong> The bipolar NE555 needs 4.5–16 V and draws a large current spike at each output transition — decouple V<sub>CC</sub> with 0.1 µF close to the pins and bypass CONT with 10 nF when it is unused. The TLC555 runs from 2 V (C grade; 3 V for the I grade, 5 V for M/Q).</li>
<li><strong>Output level.</strong> The bipolar output stage swings to about 1.7 V below V<sub>CC</sub> under load; CMOS versions swing closer to the rails. The plots show an ideal rail-to-rail output.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>Texas Instruments, <em>xx555 Precision Timers</em> (NE555, SA555, SE555), data sheet SLFS022 — astable and monostable timing equations, threshold-current note on maximum timing resistance, recommended operating conditions.</li>
<li>Texas Instruments, <em>TLC555 CMOS Timer</em>, data sheet SLFS043 — CMOS 555 timing, supply range by temperature grade, CONT input range, maximum frequency.</li>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015, §7.1 (oscillators: the 555 relaxation oscillator).</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em>.</li>
</ul>`,
    },
  ],
};
