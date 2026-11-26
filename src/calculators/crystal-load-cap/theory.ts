import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Crystal load capacitance — how this calculator works',
    lead:
      'A parallel-resonant crystal is calibrated to run at its marked frequency only when the oscillator presents a specified load capacitance C_L. In the Pierce oscillator used by almost every microcontroller, that load is the two capacitors from the crystal pins to ground, in series, plus the stray capacitance of the pins and traces. This page sizes those capacitors, shows how far a mismatch pulls the frequency, and checks that the oscillator has enough gain to start.',
  },
  sections: [
    {
      title: 'Load capacitance of a Pierce oscillator',
      html: `<p>Seen from the crystal, $C_{L1}$ (XIN to ground) and $C_{L2}$ (XOUT to ground) are in series through ground, and the stray capacitance $C_s$ is in parallel:</p>
$$C_{L} = \\frac{C_{L1}\\,C_{L2}}{C_{L1} + C_{L2}} + C_s$$
<p>With equal capacitors, $C_{L1} = C_{L2} = 2\\,(C_L - C_s)$. $C_s$ is the two pin capacitances in series plus the trace capacitance, typically 2–5 pF. It is the uncertain term: if the board runs slow, the stray is larger than assumed.</p>`,
    },
    {
      title: 'Frequency pulling',
      html: `<p>Near resonance a crystal is a series $L_m C_m R_m$ branch (the motional arm) in parallel with the electrode capacitance $C_0$. With a load capacitance in series it resonates at</p>
$$f_L = f_s\\sqrt{1 + \\frac{C_m}{C_0 + C_L}} \;\\approx\; f_s\\left(1 + \\frac{C_m}{2\\,(C_0 + C_L)}\\right)$$
<p>where $f_s = 1/(2\\pi\\sqrt{L_m C_m})$ is the series resonance. The crystal is marked with $f_L$ at its specified $C_L$, so running it with a different load moves the frequency by</p>
$$\\frac{\\Delta f}{f} = \\frac{f_L(C_{L,circ})}{f_L(C_{L})} - 1, \\qquad \\frac{\\partial (\\Delta f/f)}{\\partial C_L} \\approx -\\frac{C_m}{2\\,(C_0 + C_L)^2}$$
<p>More load capacitance makes the crystal run slower. The slope is the trim sensitivity in ppm/pF; it is steeper for small $C_L$, which is why low-$C_L$ crystals are both easier to drive and more sensitive to layout. $C_m$ is rarely in the data sheet (a few fF for MHz crystals); without it the page reports the load error in pF only. AN826’s example crystal is not quite self-consistent: its rounded $L_1$ and $C_1$ give $f_s$ = 7 997 837 Hz, while $C_1$, $C_0$ and 8 MHz at 13 pF give 7 995 889 Hz (244 ppm apart); the page uses the latter.</p>`,
    },
    {
      title: 'Start-up: gain margin',
      html: `<p>The oscillator starts only if the amplifier’s transconductance comfortably exceeds the crystal’s critical value (ST AN2867):</p>
$$g_{m,crit} = 4\\,ESR\\,(2\\pi f)^2\\,(C_0 + C_L)^2, \\qquad \\text{gain margin} = \\frac{G_m}{g_{m,crit}} \\ge 5$$
<p>Use the maximum ESR and $C_0$ from the crystal data sheet. A margin below 5 may still start on the bench and fail cold, with an aged crystal or on a humid board. Newer MCU data sheets give the largest crystal $g_{m,crit}$ the oscillator supports instead of $G_m$ (choose that in “MCU data sheet gives”); then the condition is simply $g_{m,crit} \\le$ that value, a ratio ≥ 1. A common industry rule of thumb in negative-resistance terms is $|R_{neg}| \\ge 5\\,ESR$.</p>`,
    },
    {
      title: 'Drive level',
      html: `<p>The power dissipated in the crystal follows from the current through it, which is the current into the capacitor on the measured pin. With the peak-to-peak swing $V_{pp}$ at XIN,</p>
$$DL = \\frac{ESR\\,(\\pi f\\,C_{tot}\\,V_{pp})^2}{2}, \\qquad C_{tot} = C_{L1} + \\frac{C_s}{2}$$
<p>Tuning-fork crystals tolerate only about 0.5–1 µW; MHz crystals typically 100–500 µW. Overdriving accelerates ageing and can break 32 kHz forks. Measure $V_{pp}$ with a low-capacitance (≤ 1 pF) probe, since an ordinary probe adds load and pulls the oscillator.</p>`,
    },
    {
      title: 'Solving and standard values',
      html: `<p>In analysis the page computes the circuit load from the capacitors. Solving for $C_{L1}$ (with “equal” on, both capacitors) or $C_{L2}$ inverts the series formula exactly: $C_{L2} = C_{L1}x/(C_{L1} - x)$ with $x = C_L - C_s$, which needs $C_{L1} > x$. The pair table searches the chosen E-series for every $C_{L1}$ from $1.4x$ to $3x$ with the two values around the exact $C_{L2}$, keeps pairs within about 2 : 1, and ranks them by load error (equal values first when the errors are within 0.02 pF). A slightly unequal pair often lands closer than an equal one.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Use C0G/NP0 capacitors: X7R loses capacitance with temperature and voltage and moves the frequency.</li>
<li>Keep the crystal and its capacitors next to the pins, with a ground guard and no signals underneath; every picofarad of trace adds to $C_s$.</li>
<li>Check the final frequency on the board (with a buffered output or a frequency counter on a clock-out pin) and adjust $C_{L1}/C_{L2}$ once for the layout.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>S. Bible, <em>Crystal Oscillator Basics and Crystal Selection for rfPIC and PICmicro Devices</em>, Microchip application note AN826 (DS00826A), 2002 — Pierce load capacitance, example crystal, pulling ($\\Delta f$, ppm/pF).</li>
<li>STMicroelectronics, <em>Guidelines for oscillator design on STM8AF/AL/S and STM32 MCUs/MPUs</em>, application note AN2867 — critical transconductance, gain margin, drive level.</li>
<li>Abracon, <em>ABS07 32.768 kHz SMD crystal</em> data sheet (revised 08-10-22) — C_L, C₀, ESR, drive level.</li>
<li>J. R. Vig, <em>Quartz Crystal Resonators and Oscillators for Frequency Control and Timing Applications — A Tutorial</em>, U.S. Army CECOM, rev. 2004 — equivalent circuit and load resonance.</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em>.</li>
</ul>`,
    },
  ],
};
