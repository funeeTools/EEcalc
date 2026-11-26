import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Frequency tolerance in ppm — how this calculator works',
    lead:
      'Clock accuracy is quoted in parts per million because the errors of crystals and oscillators are tiny fractions of their frequency. This page converts between ppm, hertz, percent and an actual frequency, adds up the error budget of a clock source (initial tolerance, temperature and ageing) into the window of frequencies it can produce, turns that into timekeeping drift, and checks it against the tolerance of a UART or USB link.',
  },
  sections: [
    {
      title: 'Units',
      html: `<p>For a nominal frequency $f_0$ and an actual frequency $f$:</p>
$$\\frac{\\Delta f}{f_0} = \\frac{f - f_0}{f_0},\\qquad \\text{ppm} = 10^6\\,\\frac{\\Delta f}{f_0},\\qquad 1\\ \\% = 10\\,000\\ \\text{ppm}$$
<p>One ppm is one microsecond per second, 86.4 ms per day or 31.5 s per year. A clock running $e$ ppm fast gains $e \\times 10^{-6} \\times 86\\,400$ s every day.</p>`,
    },
    {
      title: 'The error budget',
      html: `<p>A clock source’s frequency differs from nominal for three main reasons, each specified as an interval:</p>
<ul>
<li><strong>Initial tolerance</strong> $\\pm a$ — calibration at 25 °C, including the effect of the specified load capacitance.</li>
<li><strong>Temperature.</strong> AT-cut MHz crystals and packaged oscillators give a stability $\\pm b$ over the operating range (their real curve is a cubic lying inside that band). 32.768 kHz tuning-fork crystals follow a downward parabola about the turnover temperature $T_0$:
$$\\frac{\\Delta f}{f}(T) = -\\beta\\,(T - T_0)^2,\\qquad \\beta \\approx 0.034\\text{–}0.040\\ \\text{ppm}/^\\circ\\text{C}^2,\\ T_0 = 25 \\pm 5\\ ^\\circ\\text{C}$$
so they only ever run slow away from $T_0$: with β = 0.034, about −31 ppm at 55 °C or −5 °C and −144 ppm at −40 °C.</li>
<li><strong>Ageing</strong> — a slow drift, fastest in the first year. Data sheets give the first-year figure $A_1$ (often ±3 ppm) and sometimes a yearly figure after that; this page adds $A_1$ for the first year and $A_n$ per year after, interpolating linearly within each year. Real ageing is roughly logarithmic in time (fast at first), so values inside the first year are approximate; the year-end figures match the data-sheet form.</li>
</ul>
<p>The <em>worst case</em> adds the intervals (every term at its limit with the worst sign). The <em>RSS</em> estimate treats the terms as independent: the centres add and the half-widths add in quadrature, $h = \\sqrt{h_a^2 + h_T^2 + h_A^2}$. Design to the worst case when the link must never fail; RSS tells you what a typical unit will do.</p>`,
    },
    {
      title: 'Links: UART and USB',
      html: `<p>An asynchronous UART re-synchronises on the falling edge of each start bit and then samples each bit in its middle. With $OS$× oversampling the edge is detected up to $1/OS$ of a bit late, and the stop bit of an $N$-bit frame is sampled $N - \\tfrac12$ bit times after the edge. A relative clock mismatch $\\delta$ between transmitter and receiver moves that sample by $\\delta (N - \\tfrac12)$ bits, which must stay within half a bit:</p>
$$\\delta_{max} = \\frac{\\tfrac12 - 1/OS}{N - \\tfrac12} = \\frac{0.5 - 0.0625}{9.5} = 4.6\\ \\%\\quad(\\text{8N1},\\ OS = 16)$$
<p>Both ends share this budget, and edge rise times, majority-vote sampling and noise eat into it; STM32 reference manuals, for example, quote a receiver tolerance of 3.75 % for this case. USB, in contrast, gives each device’s own data rate a tolerance (USB 2.0 §7.1.11): ±1.5 % at low speed, ±0.25 % at full speed and ±0.05 % (500 ppm) at high speed. The low- and full-speed figures are for devices: hosts and hubs must hold ±0.05 % at every speed. An uncalibrated RC oscillator meets the first but not the others.</p>`,
    },
    {
      title: 'Converting',
      html: `<p>The converter at the top takes an offset in any one of four forms — ppm, hertz, percent or the actual frequency — and computes the other three exactly: $\\Delta f = f_0\\,\\text{ppm}\\cdot 10^{-6}$, $f = f_0 (1 + \\text{ppm}\\cdot 10^{-6})$. Typing into a computed box makes it the given one. The converter is independent of the budget below it.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>A load-capacitance mismatch adds a fixed offset that is not in the crystal’s tolerance (see the crystal load capacitance page); a few pF can cost tens of ppm.</li>
<li>For timekeeping, the turnover parabola dominates outdoors and in cars; an RTC with temperature compensation (TCXO-based) holds ±2–5 ppm over temperature.</li>
<li>Measure with a counter whose own time base is much better than what you measure (a GPS-disciplined or OCXO reference for sub-ppm work).</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>J. R. Vig, <em>Quartz Crystal Resonators and Oscillators for Frequency Control and Timing Applications — A Tutorial</em>, U.S. Army CECOM, rev. 2004 — frequency–temperature characteristics of AT-cut and tuning-fork crystals, ageing.</li>
<li>Abracon, <em>ABS07 32.768 kHz SMD crystal</em> data sheet (revised 08-10-22) — ±20 ppm, −0.036 ppm/°C² typ (−0.040 max), turnover 25 ± 5 °C, ageing ±3 ppm first year.</li>
<li>USB Implementers Forum, <em>Universal Serial Bus Specification</em>, rev. 2.0, 2000, §7.1.11 (data signalling rate tolerances).</li>
<li>STMicroelectronics, STM32 reference manuals, USART chapter, “Tolerance of the USART receiver to clock deviation”.</li>
</ul>`,
    },
  ],
};
