import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Wire gauge — how this calculator works',
    lead:
      'This page converts between American Wire Gauge, diameter and cross-section (including the IEC 60228 metric sizes), works out the DC resistance of a copper or aluminium conductor at its operating temperature, and the voltage drop and power lost over a cable run. It can pick the smallest gauge or metric size that keeps the drop within a limit, and for whole AWG sizes it quotes the NEC building-wiring ampacity table with its conditions.',
  },
  sections: [
    {
      title: 'The AWG scale',
      html: `<p>AWG is a geometric series defined by two fixed points: 4/0 (written 0000) is 0.4600 in and 36 AWG is 0.0050 in, with 39 steps between them. ASTM B258 therefore gives</p>
$$d_n = 0.005\\ \\text{in}\\times 92^{(36-n)/39}$$
<p>with $n = 0, -1, -2, -3$ for 1/0, 2/0, 3/0 and 4/0. Each gauge step changes the diameter by $92^{1/39} \\approx 1.1229$, so three gauges halve or double the area and six gauges halve or double the diameter. Ten gauges change the area (and resistance) by almost exactly 10×. Area follows as $A = \\pi d^2/4$; in North America it is also given in circular mils, $(d/\\text{mil})^2$, and large conductors in kcmil.</p>
<p>The standard rounds the tabulated diameters to 0.0001 in; this page uses the unrounded formula, a difference of well under 1 % above about 30 AWG.</p>`,
    },
    {
      title: 'Resistance, voltage drop and loss',
      html: `<p>The DC resistance per length is $R' = \\rho(T)/A$, with the resistivity corrected linearly for temperature:</p>
$$\\rho(T) = \\rho_{20}\\,[1 + \\alpha_{20}(T - 20\\ ^\\circ\\text{C})]$$
<p>Annealed copper (IEC 60028, the International Annealed Copper Standard) has $\\rho_{20} = 1/58\\ \\Omega\\cdot\\text{mm}^2/\\text{m} = 17.241\\ \\text{n}\\Omega\\cdot\\text{m}$ and $\\alpha_{20} = 0.00393/\\text{K}$; hard-drawn aluminium 1350 (61 % IACS, IEC 60889) has $28.264\\ \\text{n}\\Omega\\cdot\\text{m}$ and $0.00403/\\text{K}$. A conductor at 75 °C has about 22 % more resistance than at 20 °C.</p>
<p>A circuit drops voltage in both its supply and return conductors, so for a one-way length $\\ell$</p>
$$\\Delta V = I\\,R'\\,(2\\ell),\\qquad P = I^2 R'\\,(2\\ell),\\qquad \\Delta V\\% = 100\\,\\Delta V/V_s$$
<p>Choose “one conductor” for a chassis return or to look at a single wire.</p>`,
    },
    {
      title: 'Metric sizes (IEC 60228)',
      html: `<p>Cable outside North America is sold by nominal cross-section: 0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25 mm² and up. IEC 60228 does not fix the area of these conductors; it fixes their maximum DC resistance at 20 °C (for example 7.41 Ω/km for 2.5 mm² plain copper, class 2 stranded). A real 2.5 mm² conductor may therefore be a few percent smaller than 2.5 mm². The Tables tab lists both the nominal-area resistance and the standard’s maximum, so you can use whichever your design rules require.</p>`,
    },
    {
      title: 'Ampacity guide',
      html: `<p>How much current a wire may carry is set by how hot its insulation may run, not by its resistance alone, and depends on the installation. This page quotes one published table only, for whole AWG sizes: NEC (NFPA 70) Table 310.16 (310.15(B)(16) before the 2020 edition), allowable ampacity of insulated copper and aluminium conductors with at most three current-carrying conductors in a raceway, cable or earth, at 30 °C ambient. It gives the 75 °C and 90 °C insulation columns for 14 AWG – 4/0 copper and 12 AWG – 4/0 aluminium. Most terminals are rated 75 °C, so the 75 °C column is normally the limit; small conductors are further limited by NEC 240.4(D) (15, 20 and 30 A overcurrent protection for 14, 12 and 10 AWG copper).</p>
<p>The table does not apply to metric sizes, chassis or harness wiring, free air, bundles of more than three conductors or higher ambients; those use other tables and derating factors (NEC 310.15, IEC 60364-5-52, SAE AS50881 for aerospace harnesses), which are not reproduced here.</p>`,
    },
    {
      title: 'Solving for the size',
      html: `<p>Click ◎ on the voltage drop to make it a limit. The page then picks:</p>
<ul>
<li><strong>AWG form</strong> — the thinnest whole gauge from 56 to 4/0 whose drop stays within the limit;</li>
<li><strong>Cross-section form</strong> — the smallest IEC 60228 size from 0.5 to 300 mm² that does;</li>
<li><strong>Diameter form</strong> — the exact diameter, $A = \\rho(T)\\,I\\,(2\\ell) / (\\Delta V_{max})$.</li>
</ul>
<p>The size is chosen on voltage drop only: check the ampacity as well, since a short heavy-current run can meet a drop limit with a wire that overheats.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Use the conductor temperature.</strong> A wire loaded near its rating runs at 60–90 °C, so its resistance is 15–30 % above the 20 °C value.</li>
<li><strong>Stranded wire</strong> has about 2 % more resistance per length than solid wire of the same gauge, because the strands are laid helically.</li>
<li><strong>Low-voltage DC suffers most.</strong> The same 0.5 V drop is 0.2 % of 230 V but 4 % of 12 V; size 12 V and 24 V runs for voltage drop, not ampacity.</li>
<li><strong>AC at high frequency</strong> crowds into the surface (skin effect). At mains frequency it is negligible below about 50 mm² copper; at kHz–MHz use the skin-depth calculators.</li>
<li><strong>Connections add resistance</strong>: crimps, fuses, switches and connectors can rival a short run of wire.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>ASTM B258-18, <em>Standard Specification for Standard Nominal Diameters and Cross-Sectional Areas of AWG Sizes of Solid Round Wires Used as Electrical Conductors</em>, ASTM International.</li>
<li>IEC 60028:1925, <em>International standard of resistance for copper</em>.</li>
<li>IEC 60889:1987, <em>Hard-drawn aluminium wire for overhead line conductors</em>.</li>
<li>IEC 60228:2004, <em>Conductors of insulated cables</em> (nominal sizes and maximum resistance).</li>
<li>NFPA 70, <em>National Electrical Code</em>, 2017 ed., Table 310.15(B)(16) (Table 310.16 in the 2020 and 2023 editions); §240.4(D); Chapter 9 Table 8 (conductor properties).</li>
</ul>`,
    },
  ],
};
