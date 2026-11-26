import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'LC ladder filters from low-pass prototypes',
    lead:
      'Almost every passive LC filter is designed the same way: pick a response (how the loss rises with frequency), look up the element values $g_k$ of a normalised low-pass "prototype" for 1 Ω and 1 rad/s, then scale it to the real impedance and transform it to the real frequency band. This page does each step explicitly and then checks the finished circuit by computing its actual response from the components.',
  },
  sections: [
    {
      title: 'Butterworth and Chebyshev responses',
      html: `<p>For the low-pass prototype at normalised frequency $\\Omega$, the insertion loss is</p>
$$\\text{Butterworth: } L_A = 10\\log_{10}\\left(1+\\Omega^{2n}\\right)\\qquad \\text{Chebyshev: } L_A = 10\\log_{10}\\left(1+\\varepsilon^2T_n^2(\\Omega)\\right)$$
<p>with $\\varepsilon^2 = 10^{L_{Ar}/10}-1$ for a ripple of $L_{Ar}$ dB and $T_n$ the Chebyshev polynomial ($\\cos(n\\arccos\\Omega)$ inside the passband, $\\cosh(n\\,\\text{arccosh}\\,\\Omega)$ outside). Butterworth is maximally flat and its cutoff is the −3 dB point. Chebyshev trades a ripple in the passband for a much steeper skirt; its "cutoff" is the edge of the ripple band. Far into the stopband both fall at $20n$ dB per decade, but Chebyshev starts from a higher level: a 5th-order 0.5 dB Chebyshev has about 12 dB more attenuation at $\\Omega = 2$ (42 dB vs 30 dB) than a Butterworth of the same order.</p>`,
    },
    {
      title: 'Prototype element values',
      html: `<p>Butterworth: $g_k = 2\\sin\\frac{(2k-1)\\pi}{2n}$, $g_{n+1} = 1$. Chebyshev (Matthaei, Young & Jones):</p>
$$\\beta = \\ln\\coth\\frac{L_{Ar}}{17.37},\\quad \\gamma = \\sinh\\frac{\\beta}{2n},\\quad a_k = \\sin\\frac{(2k-1)\\pi}{2n},\\quad b_k = \\gamma^2+\\sin^2\\frac{k\\pi}{n}$$
$$g_1 = \\frac{2a_1}{\\gamma},\\qquad g_k = \\frac{4a_{k-1}a_k}{b_{k-1}g_{k-1}},\\qquad g_{n+1} = \\begin{cases}1 & n\\text{ odd}\\\\ \\coth^2(\\beta/4) & n\\text{ even}\\end{cases}$$
<p>An even-order Chebyshev ladder cannot be equally terminated: at DC it presents a mismatch equal to the ripple, so its load must differ from the source by the factor $g_{n+1}$. That is why odd orders are the usual choice for 50 Ω-to-50 Ω filters.</p>`,
    },
    {
      title: 'Choosing the order',
      html: `<p>Given an attenuation $A_s$ at a stopband frequency whose normalised value is $\\Omega_s$, the minimum orders are</p>
$$n_{BW} \\ge \\frac{\\log_{10}\\left(10^{A_s/10}-1\\right)}{2\\log_{10}\\Omega_s}\\qquad n_{Ch} \\ge \\frac{\\text{arccosh}\\sqrt{(10^{A_s/10}-1)/\\varepsilon^2}}{\\text{arccosh}\\,\\Omega_s}$$
<p>rounded up. $\\Omega_s = f_s/f_c$ for a low-pass and $f_c/f_s$ for a high-pass; for band filters it comes from the band-pass mapping below. Click ◎ on the order to let the calculator choose it, or on $A_s$ to see what a fixed order achieves.</p>`,
    },
    {
      title: 'Impedance scaling and frequency transformation',
      html: `<p>With $\\omega_c = 2\\pi f_c$ and system impedance $R_0$, a prototype shunt capacitor $g$ and series inductor $g$ become</p>
<table class="kv" style="max-width:640px"><tbody>
<tr><th>Low-pass</th><td>$C = \\dfrac{g}{\\omega_cR_0}$, $\\ L = \\dfrac{gR_0}{\\omega_c}$</td></tr>
<tr><th>High-pass</th><td>shunt $L = \\dfrac{R_0}{\\omega_c g}$, $\\ $ series $C = \\dfrac{1}{\\omega_c g R_0}$</td></tr>
<tr><th>Band-pass</th><td>shunt parallel LC, series series-LC, each resonant at $\\omega_0$</td></tr>
<tr><th>Band-stop</th><td>shunt series-LC, series parallel LC, each resonant at $\\omega_0$</td></tr>
</tbody></table>
<p>For band filters, $\\omega_0 = 2\\pi\\sqrt{f_1f_2}$ and $\\Delta = (f_2 - f_1)/f_0$, and the prototype frequency is $\\Omega = \\frac{1}{\\Delta}\\left|\\frac{f}{f_0}-\\frac{f_0}{f}\\right|$ (band-pass) or its reciprocal (band-stop). The band-pass response is therefore symmetric on a <em>logarithmic</em> frequency axis, not a linear one.</p>`,
    },
    {
      title: 'Checking the circuit',
      html: `<p>The curves are not the textbook formula: they are computed from the actual component values by multiplying the ABCD matrix of each arm (series impedance $Z$: $\\begin{bmatrix}1 & Z\\\\0 & 1\\end{bmatrix}$, shunt admittance $Y$: $\\begin{bmatrix}1 & 0\\\\Y & 1\\end{bmatrix}$) and converting to S-parameters between $R_s$ and $R_L$:</p>
$$S_{21} = \\frac{2\\sqrt{R_sR_L}}{AR_L + B + CR_sR_L + DR_s}$$
<p>So rounding to E-series values, finite inductor Q, or a wrong load shows up directly. Group delay is $-d\\varphi/d\\omega$ of $S_{21}$; it peaks near the band edges, more so for Chebyshev and higher orders — which matters for pulses and digital modulation.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul><li><strong>Parasitics set the stopband floor.</strong> Inductor self-resonance and capacitor ESL make real filters stop attenuating well above cutoff; 60–80 dB is hard to reach without shielding between sections.</li>
<li><strong>Inductor Q rounds the corners.</strong> Loss is worst at the band edges where the stored energy is highest. Narrow band-pass filters need $Q_u \\gg f_0/BW$.</li>
<li><strong>Tolerance.</strong> 5 % parts move the cutoff by a few percent; Chebyshev designs with small ripple are the most sensitive.</li>
<li><strong>Return loss.</strong> A Chebyshev ripple of 0.01 dB corresponds to ~26 dB return loss, 0.1 dB to ~16 dB, 0.5 dB to ~10 dB.</li></ul>`,
    },
    {
      title: 'References',
      html: `<ul><li>G. Matthaei, L. Young, E. M. T. Jones, <em>Microwave Filters, Impedance-Matching Networks, and Coupling Structures</em>, McGraw-Hill, 1964, ch. 4.</li>
<li>D. M. Pozar, <em>Microwave Engineering</em>, 4th ed., §8.3–8.4 (Tables 8.3–8.6).</li>
<li>A. I. Zverev, <em>Handbook of Filter Synthesis</em>, Wiley, 1967.</li>
<li>A. B. Williams, F. J. Taylor, <em>Electronic Filter Design Handbook</em>, 4th ed., McGraw-Hill.</li></ul>`,
    },
  ],
};
