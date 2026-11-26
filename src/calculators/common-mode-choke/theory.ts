import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Common-mode chokes — how this calculator works',
    lead:
      'A common-mode choke is two equal windings on one high-permeability core, wound so that the wanted (differential) current produces opposing fluxes that cancel, while noise current flowing the same way on both lines sees the full inductance. This page finds the turns or core needed for an inductance, models the common-mode impedance with its self-resonance and core loss, the differential (leakage) inductance, and the insertion loss both give in a source/load system such as the CISPR 17 50 Ω test.',
  },
  sections: [
    {
      title: 'Turns and inductance',
      html: `<p>Core makers give the inductance factor $A_L$, the inductance of one turn on that core, so for $N$ turns</p>
$$L = A_L N^2,\\qquad N = \\sqrt{L/A_L}$$
<p>$A_L = \\mu_0\\mu_r A_e/\\ell_e$ already contains the permeability and the core geometry. In high-µ ferrite (µᵣ ≈ 5 000–15 000) the permeability, and so $A_L$, falls above a few hundred kHz, and the tolerance is often ±25–30 %, so treat the computed $L$ as nominal.</p>`,
    },
    {
      title: 'Common and differential mode',
      html: `<p>Each winding has self-inductance $L$; the coupling between them is $k$, so the mutual inductance is $M = kL$. With both lines tied together (common mode), each winding carries half the current in the same sense and</p>
$$L_{CM} = \\frac{L+M}{2} = \\frac{L(1+k)}{2}\\;\\approx\\;L$$
<p>Round the differential loop the two windings are in series and opposing:</p>
$$L_{DM} = 2(L-M) = 2L(1-k)$$
<p>Data sheets give the leakage inductance measured on one winding with the other shorted, $L_{lk} = L(1-k^2)$. The page takes it as a percentage of $L$, finds $k = \\sqrt{1-L_{lk}/L}$, and from that $L_{DM}$ (which is very nearly $L_{lk}$ itself). A sectional toroidal winding gives about 0.5–2 %, enough to act as a small differential-mode inductor; a bifilar winding couples much better and gives almost none.</p>`,
    },
    {
      title: 'Impedance and self-resonance',
      html: `<p>A real choke is fitted well by a parallel R–L–C: the inductance, the capacitance between turns $C_p$, and a resistance $R_p$ for core loss. Adding half the winding resistance (the two windings are in parallel for common mode):</p>
$$Z_{CM} = \\frac{R_{dc}}{2} + \\Big(\\frac{1}{j\\omega L_{CM}} + \\frac{1}{R_p} + j\\omega C_p\\Big)^{-1}$$
$$f_r = \\frac{1}{2\\pi\\sqrt{L_{CM}C_p}}$$
<p>Below $f_r$ the choke is inductive and $|Z|$ rises at 20 dB/decade; at $f_r$ it peaks at about $R_p$; above it the capacitance takes over and $|Z|$ falls. If you know $f_r$ from a data-sheet curve, $C_p = 1/\\big((2\\pi f_r)^2L\\big)$. The differential path is modelled as $Z_{DM} = 2R_{dc} + j\\omega L_{DM}$.</p>`,
    },
    {
      title: 'Insertion loss',
      html: `<p>CISPR 17 defines a filter’s insertion loss as the ratio of the load voltage without and with the filter between a given source and load. For a series impedance $Z$ between resistive $Z_s$ and $Z_l$:</p>
$$IL = 20\\log_{10}\\left|\\frac{Z_s + Z + Z_l}{Z_s + Z_l}\\right|$$
<p>The standard test uses 50 Ω at both ends (both lines tied together for common mode). Because a product’s noise source and LISN are not 50 Ω, CISPR 17 also gives an “approximate worst case” with 0.1 Ω and 100 Ω. A choke on its own is a series element, so only $Z_s + Z_l$ matters: the 0.1 Ω / 100 Ω worst case (100.1 Ω in total) gives almost exactly the 50 Ω / 50 Ω result, and the worst-case setups only change the answer for filters with shunt capacitors. A series choke works best when $Z_s + Z_l$ is low; against a high-impedance source a shunt capacitor (Y-capacitor) does more.</p>`,
    },
    {
      title: 'Core flux',
      html: `<p>Differential current ideally produces no net flux. Common-mode current $I_{CM}$ flows through all $N$ turns of each winding in the same sense, so Faraday’s law gives the peak flux density</p>
$$\\hat B = \\frac{L\\,\\hat I_{CM}}{N A_e} = \\frac{A_L N \\hat I_{CM}}{A_e}$$
<p>With high-µ ferrite this saturates at surprisingly small currents, which is why chokes are rated for limited CM current. Leakage flux from the differential current can also saturate parts of the core at high line currents; that depends on the winding layout and is not modelled here.</p>`,
    },
    {
      title: 'Solving',
      html: `<p>$L = A_L N^2$ is solved in closed form for whichever of $L$, $N$ or $A_L$ is unknown. A solved $N$ is usually fractional; the page shows the inductance after rounding up to whole turns.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Choose $L$ for the attenuation needed at the lowest frequency of the band (150 kHz for conducted emissions), then check that $f_r$ is not so low that the choke is capacitive across most of the band.</li>
<li>Above a few MHz the manufacturer’s measured $|Z|(f)$ curve is better than any L–C model, because µ′ falls and µ″ (loss) rises with frequency.</li>
<li>Many filters use two chokes in series: a high-µ one for 150 kHz–5 MHz and a small, low-capacitance one for 30 MHz and above.</li>
<li>Copper loss is $2I_{DM}^2R_{dc}$: the differential current flows through both windings.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>C. R. Paul, <em>Introduction to Electromagnetic Compatibility</em>, 2nd ed., Wiley, 2006, ch. 6 (conducted emissions, power-supply filters, common-mode chokes).</li>
<li>M. J. Nave, <em>Power Line Filter Design for Switched-Mode Power Supplies</em>, Van Nostrand Reinhold, 1991 (leakage inductance as differential-mode inductance).</li>
<li>H. W. Ott, <em>Electromagnetic Compatibility Engineering</em>, Wiley, 2009, ch. 3 (common-mode chokes) and ch. 14 (conducted emissions).</li>
<li>CISPR 17:2011, <em>Methods of measurement of the suppression characteristics of passive EMC filtering devices</em>.</li>
<li>TDK Electronics, <em>Ferrites and accessories</em> data book (definitions of $A_L$, $A_e$, $\\ell_e$).</li>
</ul>`,
    },
  ],
};
