import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Printed spiral inductors — how this calculator works',
    lead:
      'A planar spiral is the cheapest inductor there is: copper track on the board itself, used for NFC and wireless-power antennas, RF matching and filters. This page computes its low-frequency inductance with the three expressions of Mohan, Hershenson, Boyd and Lee (1999), which match field-solver results to a few percent, and estimates the copper loss and Q from the track length, the skin depth and the onset of current crowding.',
  },
  sections: [
    {
      title: 'Geometry',
      html: `<p>A spiral of $n$ turns of width $w$ and spacing $s$ is fixed by one more size; Mohan et al. use the outer diameter $d_{out}$, measured across the flats. The inner diameter, average diameter and fill ratio follow:</p>
$$d_{in} = d_{out} - 2nw - 2(n-1)s,\\qquad d_{avg} = \\frac{d_{out}+d_{in}}{2},\\qquad \\rho = \\frac{d_{out}-d_{in}}{d_{out}+d_{in}}$$
<p>The fill ratio says how hollow the coil is: $\\rho \\to 0$ for a thin ring of turns, $\\rho \\to 1$ for a coil wound right to the centre. Two coils with the same $d_{avg}$ differ in $L$: the fuller one has less, because its inner turns are small and sit close to turns carrying current the other way across the centre.</p>`,
    },
    {
      title: 'Inductance: Mohan’s three expressions',
      html: `<p><b>Modified Wheeler</b> (eq. 1), a modification of Wheeler’s 1928 formula for discrete coils:</p>
$$L_{mw} = K_1\\,\\mu_0\\,\\frac{n^2\\,d_{avg}}{1+K_2\\,\\rho}$$
<table class="kv"><tr><th>Shape</th><th>K₁</th><th>K₂</th></tr><tr><td>square</td><td>2.34</td><td>2.75</td></tr><tr><td>hexagonal</td><td>2.33</td><td>3.82</td></tr><tr><td>octagonal</td><td>2.25</td><td>3.55</td></tr></table>
<p><b>Current sheet</b> (eq. 2): each side of the spiral is replaced by a uniform current sheet; opposite sides couple, perpendicular ones do not, and the self and mutual inductances follow from geometric, arithmetic and arithmetic-square mean distances:</p>
$$L_{gmd} = \\frac{\\mu_0\\,n^2\\,d_{avg}\\,c_1}{2}\\left[\\ln\\frac{c_2}{\\rho} + c_3\\,\\rho + c_4\\,\\rho^2\\right]$$
<table class="kv"><tr><th>Shape</th><th>c₁</th><th>c₂</th><th>c₃</th><th>c₄</th></tr><tr><td>square</td><td>1.27</td><td>2.07</td><td>0.18</td><td>0.13</td></tr><tr><td>hexagonal</td><td>1.09</td><td>2.23</td><td>0.00</td><td>0.17</td></tr><tr><td>octagonal</td><td>1.07</td><td>2.29</td><td>0.00</td><td>0.19</td></tr><tr><td>circular</td><td>1.00</td><td>2.46</td><td>0.00</td><td>0.20</td></tr></table>
<p><b>Monomial fit</b> (eq. 3), a least-squares fit to 19 000 simulated inductors, with lengths in µm and $L$ in nH:</p>
$$L_{mon} = \\beta\\, d_{out}^{\\alpha_1}\\, w^{\\alpha_2}\\, d_{avg}^{\\alpha_3}\\, n^{\\alpha_4}\\, s^{\\alpha_5}$$
<table class="kv"><tr><th>Shape</th><th>β</th><th>α₁</th><th>α₂</th><th>α₃</th><th>α₄</th><th>α₅</th></tr><tr><td>square</td><td>1.62·10⁻³</td><td>−1.21</td><td>−0.147</td><td>2.40</td><td>1.78</td><td>−0.030</td></tr><tr><td>hexagonal</td><td>1.28·10⁻³</td><td>−1.24</td><td>−0.174</td><td>2.47</td><td>1.77</td><td>−0.049</td></tr><tr><td>octagonal</td><td>1.33·10⁻³</td><td>−1.21</td><td>−0.163</td><td>2.43</td><td>1.75</td><td>−0.049</td></tr></table>
<p>The page shows all three and uses the one you select for the headline and for solving.</p>`,
    },
    {
      title: 'Accuracy and range',
      html: `<p>Against the field solver ASITIC on 19 000 inductors ($d_{out}$ 100–480 µm, $w$ from 2 µm to $0.3\\,d_{out}$, $s$ from 2 µm to $3w$, $d_{in}$ from $0.1$ to $0.9\\,d_{out}$), all three expressions have typical errors of 1–2 % and mostly under 3 %; the current-sheet expression worsens as $s/w$ grows, with a worst case of 8 % at $s = 3w$. Against about 60 measured inductors they did as well as the field solver itself (Mohan’s Table IV; the page reproduces several rows in its tests).</p>
<p><b>Scaling to PCB sizes.</b> The modified Wheeler and current-sheet expressions are scale-free: $L$ is $\\mu_0$ times a length times a function of $n$ and $\\rho$, so multiplying every dimension by 100 multiplies $L$ by exactly 100 and the field-solver comparison carries over to centimetre coils. The monomial is not: its length exponents add up to 1.007–1.013 instead of 1, so at PCB sizes it is extrapolated and drifts by a few percent; the page warns when you use it there. None of the expressions includes the effect of a ground plane or copper pour under the coil, which lowers $L$.</p>
<p>Wheeler’s and the monomial fit have no circular coefficients, so a circular coil always uses the current-sheet expression.</p>`,
    },
    {
      title: 'Resistance and Q',
      html: `<p>The track length is taken as $n$ times the perimeter at $d_{avg}$ — $4d$ for a square, $N d\\tan(\\pi/N)$ for an $N$-gon across the flats, $\\pi d$ for a circle — and the under-pass adds roughly $(d_{out}-d_{in})/2$ on the other layer. With copper resistivity $\\rho_{Cu} = 1/58\\ \\Omega\\,\\text{mm}^2/\\text{m}$:</p>
$$R_{dc} = \\frac{\\rho_{Cu}\\,l}{w\\,t},\\qquad R_{ac} = R_{dc}\\,\\frac{t/\\delta}{1-e^{-t/\\delta}},\\qquad \\delta = \\sqrt{\\frac{\\rho_{Cu}}{\\pi f \\mu_0}}$$
<p>The skin-effect factor is Yue and Wong’s: the current crowds into a layer of effective thickness $\\delta(1-e^{-t/\\delta})$. Then $Q = 2\\pi f L / R_{ac}$.</p>
<p>That $Q$ is an <b>upper bound</b>. In a multi-turn spiral the magnetic field of the outer turns also pushes the current in the inner turns to their edges (current crowding, or proximity effect). Kuhn and Ibrahim found it sets in around</p>
$$\\omega_{crit} = \\frac{3.1}{\\mu_0}\\,\\frac{w+s}{w^2}\\,R_{sheet},\\qquad R_{sheet} = \\frac{\\rho_{Cu}}{t}$$
<p>and above it the real resistance rises well beyond the skin-effect value. For wide PCB tracks this onset is low — often below 1 MHz — which is why practical coils leave the centre open (the inner turns add little $L$ and suffer most) and why measured $Q$ of 13.56 MHz NFC coils is typically 20–60. Dielectric loss and self-resonance (from turn-to-turn and under-pass capacitance) are not modelled; keep the operating frequency well below self-resonance, and use a field solver or measurement for the final $Q$.</p>`,
    },
    {
      title: 'How solve-for works',
      html: `<p>Choose the unknown with ◎. For <b>n</b> or <b>d<sub>out</sub></b>, the page finds the value at which the selected expression gives the target $L$, by bracketing and Brent’s method on the same forward equation, so feeding the answer back reproduces the target exactly. The number of turns comes out fractional; the table on the Tables tab lists the quarter-turn layouts around it, with their $L$, $R_{dc}$ and $Q$, so you can pick one. Turns are limited to those that fit ($d_{in} > 0$); if the target needs more, the page says how much you could reach.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Keep copper pours and planes away from the coil — at least a coil diameter around it, and nothing underneath. Eddy currents in nearby copper act like a shorted turn and reduce both $L$ and $Q$.</li>
<li>A hollow coil ($d_{in} \\gtrsim 0.3\\,d_{out}$) gives a better $Q$ per area: the innermost turns add resistance but little inductance.</li>
<li>Etching tolerance on $w$ and $s$ (±10–20 µm) hardly changes $L$, but solder mask, the enclosure and any nearby metal or tissue detune it: leave a tuning capacitor or a trimmable turn.</li>
<li>Count the under-pass and the vias in the resistance, and keep the under-pass short: it crosses every turn and adds capacitance across the whole coil.</li>
<li>Thick copper (2 oz) lowers $R_{dc}$ but helps $Q$ little once $t$ is several skin depths ($\\delta \\approx 18$ µm at 13.56 MHz).</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>S. S. Mohan, M. del Mar Hershenson, S. P. Boyd and T. H. Lee, “Simple Accurate Expressions for Planar Spiral Inductances”, <i>IEEE Journal of Solid-State Circuits</i>, vol. 34, no. 10, pp. 1419–1424, Oct. 1999.</li>
<li>H. A. Wheeler, “Simple Inductance Formulas for Radio Coils”, <i>Proc. IRE</i>, vol. 16, no. 10, pp. 1398–1400, Oct. 1928.</li>
<li>C. P. Yue and S. S. Wong, “Physical Modeling of Spiral Inductors on Silicon”, <i>IEEE Trans. Electron Devices</i>, vol. 47, no. 3, pp. 560–568, Mar. 2000.</li>
<li>W. B. Kuhn and N. M. Ibrahim, “Analysis of Current Crowding Effects in Multiturn Spiral Inductors”, <i>IEEE Trans. Microwave Theory Tech.</i>, vol. 49, no. 1, pp. 31–38, Jan. 2001.</li>
<li>U.-M. Jow and M. Ghovanloo, “Design and Optimization of Printed Spiral Coils for Efficient Transcutaneous Inductive Power Transmission”, <i>IEEE Trans. Biomedical Circuits and Systems</i>, vol. 1, no. 3, pp. 193–202, 2007 (PCB coil modelling with these expressions).</li>
<li>IEC 60028, <i>International standard of resistance for copper</i> (annealed copper, 1/58 Ω·mm²/m at 20 °C).</li>
</ol>`,
    },
  ],
};
