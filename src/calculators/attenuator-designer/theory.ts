import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Resistive attenuators — how this calculator works',
    lead:
      'A resistive pad lowers the signal by a fixed number of decibels while presenting the correct impedance at both ports. Three resistors are enough to set the loss and the two port impedances independently, which gives the classic Pi and T pads; with only two resistors the loss is no longer free, which gives the minimum-loss pad between unequal impedances. This page designs the pad from the closed-form equations, then solves the actual circuit (with your resistor values or the nearest preferred values) to report the loss, the match and the power in every resistor.',
  },
  sections: [
    {
      title: 'Equal impedances',
      html: `<p>Write the attenuation as a voltage ratio $K = 10^{A/20}$. For a pad between two equal impedances $Z_0$:</p>
$$\\text{Pi:}\\quad R_{shunt} = Z_0\\,\\frac{K+1}{K-1},\\qquad R_{series} = Z_0\\,\\frac{K^2-1}{2K}$$
$$\\text{T:}\\quad R_{series} = Z_0\\,\\frac{K-1}{K+1},\\qquad R_{shunt} = Z_0\\,\\frac{2K}{K^2-1}$$
$$\\text{Bridged-T:}\\quad R_{arm} = Z_0,\\qquad R_{bridge} = Z_0\\,(K-1),\\qquad R_{shunt} = \\frac{Z_0}{K-1}$$
<p>For example, a 10 dB 50 Ω Pi pad uses 96.25 Ω shunts and a 71.15 Ω series resistor; the T equivalent uses 25.97 Ω series arms and a 35.14 Ω shunt. The bridged-T has the practical advantage that only two resistors change with the attenuation, which is why it is used in switched and variable attenuators.</p>`,
    },
    {
      title: 'Unequal impedances and the minimum-loss pad',
      html: `<p>A resistive network between $Z_1$ and $Z_2$ that is matched in both directions cannot have less loss than</p>
$$A_{min} = 20\\log_{10}\\!\\left(\\sqrt{\\frac{Z_1}{Z_2}} + \\sqrt{\\frac{Z_1}{Z_2}-1}\\right),\\qquad Z_1 \\gt Z_2$$
<p>This is reached by a two-resistor L pad: a series resistor $R_1 = \\sqrt{Z_1(Z_1-Z_2)}$ on the high-impedance side and a shunt resistor $R_2 = Z_2\\sqrt{Z_1/(Z_1-Z_2)}$ at the low-impedance port. For 75 Ω to 50 Ω that is 43.30 Ω and 86.60 Ω with 5.72 dB loss. For a larger loss, use a Pi or T pad with power ratio $N = K^2$:</p>
$$\\text{T:}\\quad R_{sh} = \\frac{2\\sqrt{N Z_1 Z_2}}{N-1},\\quad R_{1} = Z_1\\frac{N+1}{N-1} - R_{sh},\\quad R_{3} = Z_2\\frac{N+1}{N-1} - R_{sh}$$
$$\\text{Pi:}\\quad R_{2} = \\frac{N-1}{2}\\sqrt{\\frac{Z_1Z_2}{N}},\\quad \\frac{1}{R_{1}} = \\frac{N+1}{Z_1(N-1)} - \\frac{1}{R_2},\\quad \\frac{1}{R_{3}} = \\frac{N+1}{Z_2(N-1)} - \\frac{1}{R_2}$$
<p>Below $A_{min}$ one of these resistors would have to be negative, and the page says so.</p>`,
    },
    {
      title: 'What is reported, and how',
      html: `<p>After designing, the calculator does not trust the formulas: it builds the circuit — source with internal impedance $Z_1$, the pad, load $Z_2$ — and solves it by nodal analysis. From the node voltages it reports</p>
<ul>
<li><strong>Attenuation</strong> as transducer loss, $A = 10\\log_{10}(P_{avail}/P_{load})$ with $P_{avail} = V_s^2/(4Z_1)$. For a matched pad this equals the insertion loss.</li>
<li><strong>Return loss</strong> at each port, from $Z_{in}$ (port 2 terminated in $Z_2$) and $Z_{out}$ (port 1 terminated in $Z_1$): $RL = -20\\log_{10}|\\Gamma|$.</li>
<li><strong>Power in each resistor</strong> for the stated available input power. In a Pi pad above about 6 dB the input shunt resistor takes the most power — about half the input for a 10 dB pad — so it sets the power rating; below 6 dB the series resistor runs hottest.</li>
</ul>
<p>Because the same analysis runs on the E-series-rounded values, you see the real effect of using preferred resistors. Over 1–40 dB Pi and T pads in 50 Ω and 75 Ω (on a 0.01 dB grid), simply taking the nearest value gives at worst about 0.2 dB attenuation error and 44 dB return loss with E96 parts, 0.9 dB and 32 dB with E24, and 1.6 dB and 27 dB with E12. Return loss usually matters less than you might fear; the attenuation error is mostly what changes.</p>`,
    },
    {
      title: 'Solve for resistors or for attenuation',
      html: `<p>In <em>design</em> mode (the resistors are green) you give the attenuation and the impedances and get the resistors. Click ◎ on the attenuation to switch to <em>analysis</em>: type any three resistors (for example, parts you have on hand) and the page reports the attenuation, the port impedances and how well they match $Z_1$ and $Z_2$. For the minimum-loss pad the attenuation is always calculated, since it is fixed by $Z_1/Z_2$.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Power rating.</strong> Rate each resistor for at least twice its dissipation; thick-film chip resistors also derate with temperature.</li>
<li><strong>Frequency range.</strong> Chip resistors in 0402/0603 work well into the low GHz; above that, the parasitic capacitance across the series resistor and the inductance of the shunt resistors' ground vias limit the attenuation flatness. Large attenuations (over about 30–40 dB) suffer from leakage around the pad; split them into two cascaded pads.</li>
<li><strong>Splitting shunt resistors</strong> into two parallel parts halves the via inductance and doubles the power rating.</li>
<li><strong>Noise.</strong> A matched pad with loss $L$ (linear) at physical temperature $T$ has noise factor $F = 1 + (L-1)\\,T/T_0$, with $T_0$ = 290 K; at $T = T_0$ the noise figure equals the loss, so 10 dB of attenuation adds 10 dB of noise figure.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>W. M. Middleton, M. E. Van Valkenburg (eds.), <em>Reference Data for Engineers: Radio, Electronics, Computer and Communications</em>, 9th ed., Newnes, 2002, ch. 11 (attenuators and pads).</li>
<li>F. E. Terman, <em>Radio Engineers' Handbook</em>, McGraw-Hill, 1943, §3 (attenuating networks; minimum-loss pads).</li>
<li>D. M. Pozar, <em>Microwave Engineering</em>, 4th ed., Wiley, 2012, §4.3–4.4 (ABCD and scattering parameters used for the return-loss definitions).</li>
<li>IEC 60063, <em>Preferred number series for resistors and capacitors</em> (E12–E96).</li>
</ul>`,
    },
  ],
};
