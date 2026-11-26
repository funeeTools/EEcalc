import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Current mirrors — how this calculator works',
    lead:
      'A current mirror copies the current in a diode-connected reference transistor into a second, matched transistor whose base or gate shares the same voltage. This page solves six classic mirrors (BJT basic, degenerated, Wilson and Widlar; MOSFET simple and cascode) with the large-signal device equations rather than the usual one-line approximations: it finds the reference resistor for a target current, the output current with its error from finite β and the Early effect, the output resistance and the lowest output voltage at which the mirror still works.',
  },
  sections: [
    {
      title: 'Device equations',
      html: `<p>Bipolar transistors in the forward-active region (the SPICE Gummel–Poon model without high-injection terms):</p>
$$I_C = A\\,I_S\\,e^{V_{BE}/V_T}\\left(1 + \\frac{V_{CE}}{V_A}\\right),\\qquad I_B = \\frac{A\\,I_S\\,e^{V_{BE}/V_T}}{\\beta},\\qquad V_T = \\frac{kT}{q}$$
<p>where $A$ is the relative emitter area (the mirror ratio $N$ for the output transistor). MOSFETs in saturation (square law, Shichman–Hodges):</p>
$$I_D = \\tfrac12 k'\\,\\frac{W}{L}\\,(V_{GS} - V_t)^2\\,(1 + \\lambda V_{DS})$$
<p>Each mirror is then solved exactly with Kirchhoff’s current law and the loop through the shared base or gate. For a PNP or PMOS source the same equations apply with voltages measured down from $V_{CC}$.</p>`,
    },
    {
      title: 'BJT mirrors',
      html: `<p><strong>Basic.</strong> The reference current feeds Q1’s collector and both bases, so with equal $V_{CE}$</p>
$$\\frac{I_{out}}{I_{ref}} = \\frac{N}{1 + (1+N)/\\beta}$$
<p>The Early effect adds a factor $(1 + V_{CE2}/V_A)/(1 + V_{BE}/V_A)$: the output current rises with output voltage, giving $R_{out} = r_o = (V_A + V_{CE})/I_C$.</p>
<p><strong>Emitter degeneration.</strong> Resistors $R_E$ in Q1 and $R_E/N$ in Q2 make the ratio depend on resistors rather than on $V_{BE}$ matching: a $V_{BE}$ mismatch $\\Delta V$ shifts the current by about $\\Delta V/(V_T + I_E R_E)$ instead of $\\Delta V/V_T$. The output resistance rises to $r_o[1 + g_m (R_E\\parallel r_\\pi)]$.</p>
<p><strong>Widlar.</strong> A resistor in Q2’s emitter only gives a much smaller output current without a huge resistor:</p>
$$V_T\\,\\ln\\frac{I_{C1}}{I_{C2}} = I_{E2}\\,R_E$$
<p>This is transcendental in $I_{C2}$; the page solves it (with base currents and the Early effect) by root finding, and solves it the other way for $R_E$. With $I_{ref} = 1$ mA, $I_{out} = 10$ µA and $V_T = 25$ mV the textbook answer is $R_E = 11.5$ kΩ.</p>
<p><strong>Wilson.</strong> A third transistor in the output feeds the base current back, so the error drops to second order and the output resistance rises to about $\\beta r_o/2$:</p>
$$\\frac{I_{out}}{I_{ref}} = 1 - \\frac{2}{\\beta^2 + 2\\beta + 2}\\qquad (V_A\\to\\infty)$$
<p>Q1 then sits at about $2V_{BE}$ and Q2 at $V_{BE}$, so with a finite Early voltage the mirror is off by roughly $V_{BE}/V_A$; the four-transistor “improved Wilson” equalises them.</p>`,
    },
    {
      title: 'MOSFET mirrors',
      html: `<p><strong>Simple.</strong> No gate current, so the only error is channel-length modulation:</p>
$$\\frac{I_{out}}{I_{ref}} = N\\,\\frac{1 + \\lambda V_{DS2}}{1 + \\lambda V_{GS}},\\qquad R_{out} \\approx \\frac{1}{\\lambda I_D},\\qquad V_{out,min} = V_{OV} = V_{GS} - V_t$$
<p><strong>Cascode.</strong> Two stacked diode-connected devices bias the gate of a cascode transistor at $2V_{GS}$, which holds the lower output device at $V_{DS} \\approx V_{GS}$, the same as the reference. The ratio becomes nearly exact and $R_{out} \\approx g_m r_o^2$, at the price of headroom: $V_{out,min} = V_{GS} + V_{OV} = V_t + 2V_{OV}$.</p>`,
    },
    {
      title: 'Reference resistor and solving',
      html: `<p>The reference branch carries $I_{ref} = (V_{CC} - V_{ref})/R_{ref}$, where $V_{ref}$ is the voltage across the diode-connected device(s): $V_{BE}$, $V_{BE} + I_E R_E$, $2V_{BE}$ (Wilson), $V_{GS}$ or $2V_{GS}$ (cascode). Because $V_{ref}$ depends on the current only logarithmically (BJT) or through a square root (MOSFET):</p>
<ul>
<li><strong>R<sub>ref</sub> for a target I<sub>ref</sub></strong> is exact: $R_{ref} = (V_{CC} - V_{ref}(I_{ref}))/I_{ref}$.</li>
<li><strong>Analysis from R<sub>ref</sub></strong> finds $I_{ref}$ by root finding on the same equation, so the two round-trip exactly.</li>
<li><strong>Widlar design</strong> takes the target $I_{ref}$ and $I_{out}$ and finds $R_E$ (root finding, $I_{out}$ falls monotonically with $R_E$) and then $R_{ref}$.</li>
</ul>
<p>The output resistance is the derivative of the large-signal output current with respect to the output voltage, evaluated numerically, so it includes every effect in the model. Nearest standard resistors are listed with the currents they give.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Matching is the real limit.</strong> $I_C \\propto e^{V_{BE}/V_T}$, so 1 mV of $V_{BE}$ mismatch is about 4 % of current. Discrete transistors differ by several mV and run at different temperatures; use a matched pair in one package (dual transistors) or degeneration of a few hundred mV.</li>
<li><strong>Compliance.</strong> Below the compliance voltage the output transistor saturates and the current collapses. The output characteristic graph starts at that limit.</li>
<li><strong>Self-heating.</strong> $V_{BE}$ falls by about 2 mV/°C; if Q2 dissipates more than Q1 it carries more current. Degeneration helps.</li>
<li><strong>Supply sensitivity.</strong> $I_{ref}$ follows $V_{CC}$ almost proportionally. For a supply-independent current use a reference (e.g. a zener or bandgap across a resistor) or a self-biased cell.</li>
<li><strong>What is left out.</strong> High-injection fall-off of β, the temperature dependence of $I_S$ and $V_t$, body effect in the cascode, and device mismatch.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>P. R. Gray, P. J. Hurst, S. H. Lewis, R. G. Meyer, <em>Analysis and Design of Analog Integrated Circuits</em>, 5th ed., Wiley, 2009, ch. 4 (current mirrors, Widlar, Wilson).</li>
<li>A. S. Sedra, K. C. Smith, <em>Microelectronic Circuits</em>, 7th ed., Oxford University Press, 2015, ch. 8 (Example 8.1: NMOS mirror; Widlar and Wilson sources).</li>
<li>B. Razavi, <em>Design of Analog CMOS Integrated Circuits</em>, 2nd ed., McGraw-Hill, 2017, ch. 5 (current mirrors).</li>
<li>Fairchild Semiconductor / onsemi, 2N3904 and 2N3906 SPICE models (I<sub>S</sub>, V<sub>AF</sub>) and data sheets (h<sub>FE</sub>, V<sub>CE(sat)</sub>, 625 mW TO-92 rating).</li>
</ul>`,
    },
  ],
};
