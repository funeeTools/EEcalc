import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'LM317 / LM337 resistors — how this calculator works',
    lead:
      'An adjustable three-terminal regulator servoes its OUT pin to a fixed reference voltage above its ADJ pin. Two resistors turn that reference into any output voltage. This page uses the data-sheet equation, including the small current that flows out of the ADJ pin, solves it exactly for either resistor, finds the best standard-value pair, and checks the things that make real designs fail: headroom, minimum load, tolerance and dissipation.',
  },
  sections: [
    {
      title: 'The output equation',
      html: `<p>The regulator holds $V_{REF} \\approx 1.25$ V between OUT and ADJ. $R_1$ sits across that reference, so it carries a fixed current $V_{REF}/R_1$. The same current flows on through $R_2$ to ground, joined by the adjustment-pin current $I_{ADJ}$:</p>
$$V_{out} = V_{REF}\\left(1 + \\frac{R_2}{R_1}\\right) + I_{ADJ}\\,R_2$$
<p>$I_{ADJ}$ is about 50 µA (LM317) or 65 µA (LM337), so with $R_1$ = 120–240 Ω it adds well under 1 % to the output. It grows in importance as the resistors get larger, and because it varies from part to part (up to 100 µA) it is a tolerance term as much as an offset.</p>
<p>The LM337 is the negative counterpart: the same equation holds for magnitudes, with the input, output and reference all negative with respect to ground. The page takes magnitudes and shows the sign.</p>`,
    },
    {
      title: 'Solving for R₁ or R₂',
      html: `<p>The equation is linear in $R_2$ and in $1/R_1$, so both inverses are exact:</p>
$$R_2 = \\frac{V_{out} - V_{REF}}{V_{REF}/R_1 + I_{ADJ}}, \\qquad R_1 = \\frac{V_{REF}\\,R_2}{V_{out} - V_{REF} - I_{ADJ}R_2}$$
<p>The output cannot be below $V_{REF}$ (that is $R_2 = 0$), and solving for $R_1$ fails when $I_{ADJ}R_2$ alone already reaches $V_{out} - V_{REF}$. A solved value fed back into the analysis gives the target exactly.</p>
<p>The standard-value search tries every preferred $R_1$ within about a factor of two of the present one, with the two preferred values that bracket its exact $R_2$, and ranks the pairs by output error (with $I_{ADJ}$ included). Rows are judged against the resistor tolerance and against the minimum-load requirement.</p>`,
    },
    {
      title: 'Minimum load and the choice of R₁',
      html: `<p>The regulator’s own operating current leaves through the OUT pin, so it needs a minimum load to stay in regulation: 3.5 mA typical and 10 mA maximum for the LM317, 2.5 mA typical and 10 mA maximum for the LM337 (both at 40 V input–output difference; less at lower difference). The divider current $V_{REF}/R_1$ counts towards it. With nothing else guaranteed to draw current,</p>
$$R_1 \\le \\frac{V_{REF}}{I_{min}} = \\frac{1.25\\ \\text{V}}{10\\ \\text{mA}} = 125\\ \\Omega$$
<p>which is why 120 Ω is the usual choice. The classic 240 Ω (5.2 mA) meets the typical figure but not the guaranteed one. Enter the smallest current your load ever draws in $I_{L,min}$; it adds to the divider current.</p>`,
    },
    {
      title: 'Headroom, current and dissipation',
      html: `<p>The LM317 and LM337 are not low-dropout parts: TI specifies them from 3 V input–output difference and says they need up to 3 V of headroom. The minimum input is therefore</p>
$$V_{in,min} = V_{out} + V_{DO}$$
<p>evaluated at the lowest input — the ripple valley of a rectified supply, low line. Below it the output follows the input down and the ripple passes straight through. The regulator dissipates</p>
$$P_D = (V_{in} - V_{out})(I_L + V_{REF}/R_1) + (V_{in} - V_{out} + V_{REF})\\,I_{ADJ}$$
<p>The page evaluates it at the entered input; for the thermal worst case use the highest input on the LDO thermal page. The absolute-maximum input–output difference is 40 V, and the current limit (1.5 A minimum up to 15 V) falls to 0.15 A minimum at 40 V.</p>`,
    },
    {
      title: 'Tolerance',
      html: `<p>The worst case puts every error at its limit together: $V_{REF}$ at ±4 % (the 1.2–1.3 V data-sheet range over line, load and temperature), $R_2$ high with $R_1$ low (or the reverse), and $I_{ADJ}$ anywhere from 0 to 100 µA (no minimum is specified). The reference dominates: even perfect resistors leave about ±4 %. For a tighter output, use a regulator with a better reference (e.g. 1 % parts) or trim. The breakdown in the results shows each contribution alone.</p>
<p>Not included: line and load regulation, thermal drift and long-term stability (up to 1 %/1000 h), all listed in the data sheets.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Return R₂ to ground close to the load, and connect R₁ directly at the OUT pin, so load current in the wiring does not add to the reference.</li>
<li>0.1 µF at the input (if the regulator is far from the filter capacitor) and 1 µF or more at the output. A 10 µF capacitor from ADJ to ground raises the 120 Hz ripple rejection (TI: 65 dB → 80 dB typical on the current die); add the protection diodes the data sheet shows when you use it or a large output capacitor.</li>
<li>For loads above 1.5 A, the LM338 (5 A) and LM350 (3 A) use the same equation with their own data-sheet limits (choose “Custom” and enter them).</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>Texas Instruments, <em>LM317 3-Pin Adjustable Regulator</em>, data sheet SLVS044Z (rev. April 2025) — eq. 1–2 (output voltage), §6.6 electrical characteristics, §7.4 functional modes (headroom, minimum load).</li>
<li>Texas Instruments, <em>LMx37 3-Terminal Adjustable Negative Regulators</em>, data sheet SLVS047L (rev. January 2015) — §7.5 electrical characteristics, §9.2.2 design procedure (R₁ = 120 Ω).</li>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015, ch. 9 (voltage regulation: three-terminal adjustable regulators).</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em>.</li>
</ul>`,
    },
  ],
};
