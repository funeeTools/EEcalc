import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'PCB stack-up — how this calculator works',
    lead:
      'A multilayer board is built from copper foils, cores (cured laminate with copper on both sides) and prepreg (uncured glass-and-resin sheets that bond them when the board is pressed). This page adds the layers up against a target thickness, checks that the build is mirror-symmetric, finds the plane each signal layer returns its current through, and gives the single-ended impedance of a trace on every signal layer with closed-form line models.',
  },
  sections: [
    {
      title: 'Thickness',
      html: `<p>The finished thickness over the outer copper is the sum of every copper layer and every dielectric:</p>
$$T_{board} = \\sum_{k=1}^{n} T_{cu,k} + \\sum_{k=1}^{n-1} H_k$$
<p>and the solder mask adds its thickness on both sides. Fabricators usually hold ±10 % on boards thicker than about 1 mm. Click ◎ on one dielectric’s thickness and the page solves it so the stack meets the target exactly — normally the central core, which is the easiest to change.</p>
<p>Prepreg thickness is a <i>pressed</i> value: during lamination the resin flows into the copper-free areas of the neighbouring layers, so a prepreg next to a sparse signal layer ends up thinner than one between two planes. Use your fabricator’s pressed thicknesses, which account for that.</p>`,
    },
    {
      title: 'Symmetry and copper balance',
      html: `<p>Copper and glass-epoxy expand differently with temperature. If the upper half of the board is not a mirror image of the lower half, the two halves shrink by different amounts after lamination and the board bows and twists — during pressing and again in every reflow. IPC-6012 allows 0.75 % bow and twist for boards carrying surface-mount parts. The page compares each layer with its mirror image about the centre:</p>
<ul><li>copper thickness (within 2 %),</li><li>copper density: a plane (or a signal layer with a copper pour) opposite a sparse signal layer leaves a copper imbalance,</li><li>dielectric thickness (within 2 %), εr (within 1 %) and type (core opposite core, prepreg opposite prepreg).</li></ul>
<p>Pairs that break symmetry are marked ≠ in the drawing and listed in the Symmetry table.</p>`,
    },
    {
      title: 'Reference planes',
      html: `<p>A signal’s return current flows in the nearest plane, directly under the trace. For each signal layer the page takes the nearest GND or power plane above and below it; another signal layer in between is passed over (its copper counted as dielectric), which is the usual dual-stripline arrangement. An outer layer with one plane is a microstrip; an inner layer between two planes is a stripline (centred or off-centre); an inner layer with a plane on one side only is an embedded microstrip, with the laminate on its other side as a cover. A signal referenced to a power plane needs decoupling (or stitching capacitors) wherever its return current has to move to ground.</p>`,
    },
    {
      title: 'Impedance models',
      html: `<p><b>Microstrip</b> (one plane): Hammerstad and Jensen’s closed form with their strip-thickness correction, the same model as the Microstrip page (0.2 % against their numerical reference for $0.01 \\le W/H \\le 100$). The cover above the trace — the solder mask on an outer layer, the laminate out to the board surface on an inner (embedded) layer — is added as on the Controlled Impedance page: Wan and Hoorfar’s multilayer filling factor gives the share $\\Delta q$ of the bare line’s air field that the cover takes over, and the effective permittivity rises by $\\Delta q\\,(\\varepsilon_{cover} - 1)$ (Bahl and Stuchly), with $Z_0 = Z_{0,air}/\\sqrt{\\varepsilon_{eff}}$. Measured on that page against a two-dimensional field solution, it reads 0.5–2.1 % high for solder mask (the model has no mask down the trace side walls) and 1.4–2.8 % high for embedded lines; the bare value is quoted in the notes for comparison.</p>
<p><b>Stripline</b> (a plane on each side, the trace $H_1$ from one and $H_2$ from the other): the offset-stripline model of the Asymmetric Stripline page. Its thin-strip part comes from Cohn’s broadside-coupled stripline — the odd mode of a broadside pair puts a virtual ground plane on the mid-plane, so one strip of the pair is exactly an off-centre stripline — with a correction that makes the centred case equal Cohn’s exact conformal-mapping result,</p>
$$Z_{0,centred} = \\frac{\\eta_0}{4\\sqrt{\\varepsilon_r}}\\,\\frac{K(\\operatorname{sech}\\,\\pi W/2b)}{K(\\tanh\\,\\pi W/2b)},\\qquad b = H_1 + T + H_2,$$
<p>and copper thickness added through the image method (Wadell): each face of the strip sees a centred line of spacing $2H_k + T$. That page reports it within +0…2.6 % of a two-dimensional field solution for offsets up to $H_2 = 5H_1$. The simpler “two centred half-lines in parallel”, $1/Z_0 = \\tfrac12[1/Z_{0}(2H_1+T) + 1/Z_{0}(2H_2+T)]$, was checked for this page against a finite-difference solution as well; it overestimates $Z_0$ by up to 7 % for narrow, strongly offset strips, so it is not used.</p>
<p><b>Mixed dielectrics.</b> When the dielectrics between a trace and its planes differ, they are combined into one εr by the series (capacitance-weighted) mean $\\sum H_k / \\sum (H_k/\\varepsilon_{r,k})$, which is exact for the field under a wide strip and a good approximation for typical FR-4 prepreg/core pairs whose εr differ by a few percent.</p>
<p><b>Not modelled:</b> trapezoidal etching, resin-rich areas next to the trace, and frequency dependence of εr. For controlled-impedance builds, the fabricator’s field solver and coupon measurements are the reference; this page is for planning the stack.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Put every high-speed signal layer next to a solid plane, and keep the dielectric to that plane thin: crosstalk and loop inductance both fall with it.</li>
<li>A thin dielectric between a power and a ground plane gives a low-inductance plane capacitor for decoupling.</li>
<li>Dual striplines (two signal layers between the same pair of planes) save layers; route them at right angles to each other and give them a thicker separation than their distance to the planes.</li>
<li>The width for a target impedance on each layer is listed in the results; check that it is at least the fabricator’s minimum trace width, and that the outer-layer width is plated up (so add the plating to the outer copper thickness).</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>E. O. Hammerstad and Ø. Jensen, “Accurate models for microstrip computer-aided design”, IEEE MTT-S Int. Microwave Symp. Digest, 1980, pp. 407–409.</li>
<li>H. A. Wheeler, “Transmission-line properties of a strip line between parallel planes”, <i>IEEE Trans. MTT</i> 26(11), 1978, pp. 866–876.</li>
<li>S. B. Cohn, “Characteristic impedances of broadside-coupled strip transmission lines”, <i>IRE Trans. MTT</i> 8(6), 1960, pp. 633–637 (offset stripline as one strip of a broadside pair).</li>
<li>B. C. Wadell, <i>Transmission Line Design Handbook</i>, Artech House, 1991, §3.6 (image-method thickness terms for offset stripline).</li>
<li>C. Wan and A. Hoorfar, “Improved design equations for multilayer microstrip lines”, <i>IEEE Microwave and Guided Wave Letters</i> 10(6), 2000, pp. 223–224; I. J. Bahl and S. S. Stuchly, “Analysis of a microstrip covered with a lossy dielectric”, <i>IEEE Trans. MTT</i> 28(2), 1980, pp. 104–109 (mask and embedded cover).</li>
<li>S. B. Cohn, “Characteristic impedance of the shielded-strip transmission line”, <i>IRE Trans. MTT</i> 2, 1954, pp. 52–57 (exact zero-thickness stripline, used to calibrate the finite-difference check).</li>
<li>IPC-6012E, <i>Qualification and Performance Specification for Rigid Printed Boards</i>, IPC, 2020 (bow and twist).</li>
<li>IPC-2221B, <i>Generic Standard on Printed Board Design</i>, IPC, 2012 (multilayer construction).</li>
</ol>`,
    },
  ],
};
