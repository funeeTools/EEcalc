import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Power plane impedance — how this calculator works',
    lead:
      'A power plane and the ground plane under it form a large, very low-inductance capacitor, and also a resonant cavity. This page works out the plate capacitance, the inductance the planes present to a via, the cavity resonances, and the impedance a load sees at its connection point from low frequency up through the resonances, using the standard cavity model. It compares that impedance with the target impedance set by the supply voltage, the allowed ripple and the transient current.',
  },
  sections: [
    {
      title: 'Capacitance and inductance of a plane pair',
      html: `<p>Two planes of overlap $a \\times b$ separated by a dielectric of thickness $d$ and permittivity $\\varepsilon_r$ have the parallel-plate capacitance</p>
$$C = \\frac{\\varepsilon_0\\varepsilon_r\\,a\\,b}{d}$$
<p>which is about 38 pF/cm² for 100 µm of FR-4. Fringing at the edges is neglected, which is fine while $d$ is much smaller than the plane. For the same pair the loop inductance of a uniform current sheet flowing out along one plane and back along the other is $\\mu_0 d$ <em>per square</em> (about 126 pH/□ for 100 µm, or 32 pH per mil of thickness). Across the whole length, from one $b$-wide edge to the other, it is $\\mu_0 d\\,a/b$. Both scale with $d$: a thin dielectric gives more capacitance <em>and</em> less inductance.</p>
<p>A load never feeds a plane from a whole edge, though. Current leaves the planes through a via, and spreading from that small contact into the plane adds a <em>spreading inductance</em>, which grows as the contact shrinks (logarithmically) and is largest near a corner. The page gets it from the cavity model below.</p>`,
    },
    {
      title: 'Cavity resonances',
      html: `<p>With open edges the plane pair is a cavity whose voltage between the planes forms standing waves. The modes are</p>
$$f_{mn} = \\frac{c}{2\\sqrt{\\varepsilon_r}}\\sqrt{\\left(\\frac{m}{a}\\right)^2 + \\left(\\frac{n}{b}\\right)^2},\\qquad V_{mn}(x,y) \\propto \\cos\\frac{m\\pi x}{a}\\cos\\frac{n\\pi y}{b}$$
<p>The lowest, TM₁₀, has half a wavelength along the longer side: 723 MHz for a 100 mm FR-4 plane. At a resonance the planes stop looking like a capacitor and the impedance at a port can rise far above the plate reactance. A port that sits on a mode’s nodal line (for example the centre for TM₁₀) does not see that mode at all, while ports near the edges and corners see them all.</p>`,
    },
    {
      title: 'Impedance at a port: the cavity model',
      html: `<p>For a square port of side $w$ centred at $(x, y)$, the self-impedance of the plane pair is the double sum over all modes (Lei, Techentin & Gilbert, 1999; Swaminathan & Engin, 2007):</p>
$$Z(\\omega) = \\frac{j\\omega\\mu_0 d}{a\\,b}\\sum_{m=0}^{\\infty}\\sum_{n=0}^{\\infty}\\frac{\\chi_m^2\\chi_n^2\\cos^2(k_m x)\\cos^2(k_n y)\\,\\mathrm{sinc}^2\\tfrac{k_m w}{2}\\,\\mathrm{sinc}^2\\tfrac{k_n w}{2}}{k_m^2 + k_n^2 - k^2}$$
<p>with $k_m = m\\pi/a$, $k_n = n\\pi/b$, $\\chi_0 = 1$, $\\chi_{m>0} = \\sqrt 2$ and</p>
$$k^2 = \\omega^2\\mu_0\\varepsilon_0\\varepsilon_r\\left[1 - j\\left(\\tan\\delta + \\frac{\\delta_s}{d}\\right)\\right],\\qquad \\delta_s = \\sqrt{\\frac{2}{\\omega\\mu_0\\sigma}}$$
<p>where the two loss terms are the dielectric loss and the resistance of both planes. The $m = n = 0$ term is a uniform voltage that drives no current along the plates, so it carries only the dielectric loss and is exactly $1/(j\\omega C)$ with ESR $\\tan\\delta/(\\omega C)$; all the others together act, well below the first resonance, as a series inductance</p>
$$L_{sp} = \\frac{\\mu_0 d}{ab}\\sum_{(m,n)\\neq(0,0)}\\frac{\\chi_m^2\\chi_n^2\\cos^2\\cos^2\\,\\mathrm{sinc}^2\\,\\mathrm{sinc}^2}{k_m^2 + k_n^2}$$
<p>which is the port’s spreading inductance shown on the page. The $\\mathrm{sinc}^2$ factors come from averaging over the port area; without them the sum would diverge, which is the mathematical form of “a point contact has infinite spreading inductance”.</p>
<p><strong>Numerics.</strong> Modes up to four times the top frequency are summed exactly. The remaining modes, up to $m = 2a/w$ and $n = 2b/w$, are added through the expansion $1/(K - k^2) = 1/K + k^2/K^2 + k^4/K^3$, accurate to better than 0.03 % for those terms; truncating there leaves about 0.15 % of the spreading inductance, checked against a sum to $8a/w$. Below the frequency where the skin depth exceeds the copper thickness, the plate-loss term uses the DC sheet resistance of the planes instead.</p>`,
    },
    {
      title: 'Target impedance',
      html: `<p>A supply with nominal voltage $V$ that may move by a fraction $r$ (the ripple) when the load current steps by $\\Delta I$ needs a power distribution network whose impedance stays below</p>
$$Z_t = \\frac{V\\,r}{\\Delta I}$$
<p>over the whole band of the load’s current spectrum (Smith et al., 1999). A 3.3 V rail with 5 % ripple and a 1 A step needs 165 mΩ; a 1 V core at 3 % and 10 A needs 3 mΩ. The plane capacitance alone meets $Z_t$ above $f = 1/(2\\pi C Z_t)$, until the first resonance spoils it; below that frequency decoupling capacitors and the regulator have to do the work.</p>`,
    },
    {
      title: 'Solving',
      html: `<p>By default the page analyses the planes. Click ◎ on $C$ to turn it into a target: the page then finds the dielectric thickness that gives it, by a bracketed Brent search on $C(d)$ (1 µm to 5 mm), and recomputes everything else for that thickness.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Thin dielectrics help twice:</strong> more capacitance and less spreading inductance. Going from 100 µm to 25 µm quadruples C and cuts L_sp to a quarter.</li>
<li><strong>Resonances need damping, not just more capacitance.</strong> Decoupling capacitors with some ESR, lossy dielectrics, or edge termination lower the peaks. Capacitors placed near the edges and corners, where every mode has a voltage maximum, are the most effective at it.</li>
<li><strong>Real plane shapes</strong> are not clean rectangles: cut-outs, splits and via antipads shift the resonances. Treat the mode frequencies as estimates within ten percent or so, and use a field solver for a signed-off design.</li>
<li><strong>What the model leaves out:</strong> radiation from the edges, fringing capacitance, frequency-dependent εᵣ and tan δ, and the inductance of the via between the port and the planes.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>G. T. Lei, R. W. Techentin, B. K. Gilbert, “High-frequency characterization of power/ground-plane structures,” <em>IEEE Trans. Microwave Theory Tech.</em> 47(5), 1999, pp. 562–569.</li>
<li>M. Swaminathan, A. E. Engin, <em>Power Integrity Modeling and Design for Semiconductors and Systems</em>, Prentice Hall, 2007, ch. 2.</li>
<li>T. Okoshi, <em>Planar Circuits for Microwaves and Lightwaves</em>, Springer, 1985.</li>
<li>I. Novak, J. R. Miller, <em>Frequency-Domain Characterization of Power Distribution Networks</em>, Artech House, 2007.</li>
<li>L. D. Smith, E. Bogatin, <em>Principles of Power Integrity for PDN Design — Simplified</em>, Prentice Hall, 2017.</li>
<li>E. Bogatin, <em>Signal and Power Integrity — Simplified</em>, 3rd ed., Pearson, 2018 (sheet inductance of plane pairs).</li>
<li>L. D. Smith, R. E. Anderson, D. W. Forehand, T. J. Pelc, T. Roy, “Power distribution system design methodology and capacitor selection for modern CMOS technology,” <em>IEEE Trans. Advanced Packaging</em> 22(3), 1999, pp. 284–291.</li>
</ol>`,
    },
  ],
};
