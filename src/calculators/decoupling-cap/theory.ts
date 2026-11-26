import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Decoupling capacitors — how this calculator works',
    lead:
      'Board decoupling has one job: keep the impedance of the power rail, as seen by the load, below a target value over the band of frequencies where the load’s current changes. This page builds the impedance of a bank of capacitors — each with its ESR, its own ESL and the inductance of its pads, traces and vias — adds the plane capacitance and spreading inductance, and checks the result against the target. It finds the anti-resonances that usually break a design, and can solve for the number of capacitors needed or the largest load step the bank supports.',
  },
  sections: [
    {
      title: 'Target impedance',
      html: `<p>If the load current steps by $\\Delta I$ and the rail may move by a fraction $r$ of its voltage $V$, the power distribution network must satisfy</p>
$$Z_t = \\frac{V\\,r}{\\Delta I}$$
<p>at every frequency where the current step has energy (Smith et al., 1999). The regulator usually holds the rail up to some tens to hundreds of kilohertz ($f_{lo}$); above a few tens to hundreds of megahertz the package and the die’s own capacitance take over ($f_{hi}$). Between them the board capacitors must keep $|Z| \\le Z_t$.</p>`,
    },
    {
      title: 'A mounted capacitor',
      html: `<p>A real capacitor is a series R-L-C:</p>
$$Z_{cap} = \\mathrm{ESR} + j\\omega(L_{ESL} + L_{mnt}) + \\frac{1}{j\\omega C}$$
<p>Below its self-resonant frequency $f_{SRF} = 1/(2\\pi\\sqrt{(L_{ESL} + L_{mnt})C})$ it is a capacitor; at $f_{SRF}$ its impedance falls to the ESR; above it, it is an inductor. $N$ identical parts in parallel divide the impedance by $N$. Above resonance only the inductance matters, so a capacitor’s value barely matters there and its <em>mounted</em> inductance is everything.</p>
<p>The datasheet ESL covers the part itself. The rest of the current loop — the pads, the traces to the vias and the vias down to the planes — is the mounting inductance, and is often larger than the ESL. The page estimates it in two parts, following Smith & Bogatin:</p>
<ul>
<li><strong>Pad-to-via traces</strong> of length $\\ell$ and width $w$, at height $h$ above the nearest plane, are short microstrips. Their inductance per length is $Z_{0,air}/c$, with $Z_{0,air}$ the Hammerstad–Jensen impedance of the strip in air, so $L_{tr} = 2\\ell\\,Z_{0,air}(w/h)/c$. That is roughly 0.3–0.7 nH per millimetre for typical traces.</li>
<li><strong>The via pair</strong>, two vias of diameter $d_v$ and centre spacing $s$ running down a depth $h$ to the planes, is a two-wire loop:
$$L_{via} = \\frac{\\mu_0 h}{\\pi}\\,\\mathrm{acosh}\\frac{s}{d_v}$$
which is the exact two-wire formula and, for $s \\gg d_v$, Smith & Bogatin’s rule of about 10 pH per mil of via length times $\\ln(s/r)$.</li>
</ul>
<p>$L_{mnt} = L_{tr} + L_{via}$. Short, wide traces, vias beside the pads, and planes close to the component side all shrink it.</p>`,
    },
    {
      title: 'The bank and its anti-resonances',
      html: `<p>All capacitor groups are in parallel. They reach the load through the planes’ spreading inductance $L_{sp}$, and the plane capacitance $C_p$ sits right at the load:</p>
$$Z = \\left[\\left(\\sum_i \\frac{N_i}{Z_{cap,i}}\\right)^{-1} + j\\omega L_{sp}\\right] \\parallel \\frac{1}{j\\omega C_p}$$
<p>Between the resonances of two groups, the larger capacitors have already turned inductive while the smaller ones are still capacitive. An inductance in parallel with a capacitance resonates, and the bank impedance peaks: an <em>anti-resonance</em>. Its height is set by the losses — roughly $L/(C\\cdot R_{total})$ — so a bank of very low-ESR capacitors with values far apart gives tall, narrow peaks. The cures are to add values in between (about one per decade or less), to use enough of each, and not to chase ever-lower ESR. The same happens between the smallest capacitors and the plane capacitance at the top of the band.</p>
<p>The page searches the band for the largest $|Z|$ (a 240-point logarithmic grid refined with a golden-section search), and lists every local peak near the band with its ratio to $Z_t$.</p>`,
    },
    {
      title: 'Solving',
      html: `<ul>
<li><strong>Check (default):</strong> computes $Z_t$ and the worst in-band impedance; the badge says whether the bank meets the target.</li>
<li><strong>Count of a group (◎ on N):</strong> the smallest whole number of capacitors in that group, others unchanged, that keeps $|Z| \\le Z_t$ across the band. Adding capacitors of one value lowers the bank impedance across the band, so the page doubles $N$ until it passes and then bisects; the answer passes and one fewer does not. Up to 10 000 parts are tried; if that is not enough the page says what limits it (often the spreading inductance at $f_{hi}$, or a frequency that group cannot reach).</li>
<li><strong>Largest load step (◎ on ΔI):</strong> $\\Delta I = V r / |Z|_{max}$.</li>
</ul>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>DC bias.</strong> Class II MLCCs (X5R, X7R) lose much of their capacitance under bias: a 10 µF 0603 at its rated voltage may give 3–4 µF. Enter the effective value.</li>
<li><strong>ESL by package.</strong> The package presets are typical values for standard MLCCs. Reverse-geometry (0204, 0306) and multi-terminal (X2Y, IDC) parts reach 50–150 pH. The best source is the datasheet’s self-resonant frequency: $L = 1/((2\\pi f_{SRF})^2 C)$.</li>
<li><strong>Placement.</strong> Above a few tens of megahertz the capacitors see the load through the plane spreading inductance, so distance matters less than mounting — but long, narrow traces to the vias are always costly.</li>
<li><strong>What is not modelled:</strong> the regulator’s output impedance, bulk electrolytics’ frequency-dependent ESR, the package and die, and the distributed (cavity) behaviour of the planes — see the plane-impedance calculator for that.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>L. D. Smith, R. E. Anderson, D. W. Forehand, T. J. Pelc, T. Roy, “Power distribution system design methodology and capacitor selection for modern CMOS technology,” <em>IEEE Trans. Advanced Packaging</em> 22(3), 1999, pp. 284–291.</li>
<li>L. D. Smith, E. Bogatin, <em>Principles of Power Integrity for PDN Design — Simplified</em>, Prentice Hall, 2017, ch. 7–9 (mounting inductance, anti-resonances, capacitor selection).</li>
<li>C. R. Paul, <em>Inductance: Loop and Partial</em>, Wiley-IEEE Press, 2010, §5.4 (two-wire loop inductance).</li>
<li>E. Hammerstad, Ø. Jensen, “Accurate models for microstrip computer-aided design,” <em>IEEE MTT-S Int. Microwave Symp. Digest</em>, 1980, pp. 407–409.</li>
<li>I. Novak, J. R. Miller, <em>Frequency-Domain Characterization of Power Distribution Networks</em>, Artech House, 2007.</li>
<li>H. W. Johnson, M. Graham, <em>High-Speed Digital Design</em>, Prentice Hall, 1993, ch. 8 (power systems, bypass capacitors).</li>
</ol>`,
    },
  ],
};
