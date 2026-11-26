import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Zener shunt regulators — how this calculator works',
    lead:
      'A resistor from an unregulated supply feeds a node held up by a zener diode in reverse breakdown; the load hangs from the same node. The page sizes the resistor so the zener keeps conducting at the worst corner (lowest input, heaviest load), then checks every corner of the input range, the load range and the zener’s voltage tolerance for regulation and dissipation.',
  },
  sections: [
    {
      title: 'Zener model',
      html: `<p>In breakdown a zener behaves like a battery in series with a small resistance, its incremental (dynamic) resistance $r_z$:</p>
$$V_Z = V_{Z0} + r_z I_Z,\\qquad V_{Z0} = V_{ZT} - r_z I_{ZT}$$
<p>$V_{ZT}$ is the datasheet zener voltage at the test current $I_{ZT}$, and $r_z$ is the datasheet $Z_{ZT}$, measured at the same current. The straight line is a good description from a few tenths of $I_{ZT}$ upwards. Towards the knee current $I_{ZK}$ the curve bends: the datasheet’s $Z_{ZK}$ there is several to almost a hundred times $Z_{ZT}$ (1N4733A: 550 Ω against 7 Ω), so a design that runs the zener close to the knee regulates much worse than the line predicts.</p>
<p>The tolerance band (±5 % for 1N47xxA and BZX84C parts) shifts the whole line up or down. The page evaluates both ends.</p>`,
    },
    {
      title: 'Operating point',
      html: `<p>Kirchhoff’s current law at the output node, with the load drawing $I_L$:</p>
$$\\frac{V_{in}-V_{out}}{R} = I_Z + I_L \\;\\Rightarrow\\; I_Z = \\frac{V_{in} - V_{Z0} - R\\,I_L}{R + r_z},\\qquad V_{out} = V_{Z0} + r_zI_Z$$
<p>If that gives $I_Z < 0$, the zener is out of breakdown: the regulator has dropped out and $V_{out} = V_{in} - R\\,I_L$.</p>
<p>Small changes at the input and the load reach the output through the divider formed by $R$ and $r_z$:</p>
$$\\frac{\\partial V_{out}}{\\partial V_{in}} = \\frac{r_z}{R + r_z}\\quad(\\text{line regulation}),\\qquad \\frac{\\partial V_{out}}{\\partial I_L} = -\\frac{R\\,r_z}{R + r_z} = -(R\\parallel r_z)\\quad(\\text{load regulation})$$
<p>A small $r_z$ against $R$ means good line regulation; the output resistance is roughly $r_z$ itself.</p>`,
    },
    {
      title: 'Designing R and the worst cases',
      html: `<p>The zener current is smallest at the lowest input, the heaviest load and the highest zener voltage. Setting it equal to the chosen minimum $I_{Z,min}$ there gives the largest usable resistor:</p>
$$R = \\frac{V_{in,min} - V_{Z,hi}(I_{Z,min})}{I_{Z,min} + I_{L,max}},\\qquad V_{Z,hi}(I) = V_{ZT}(1+t) - r_zI_{ZT} + r_zI$$
<p>When solving for $R$ the page then takes the next <em>smaller</em> standard value, so the zener current can only rise. The same equation solved for the load gives the largest load a given resistor supports:</p>
$$I_{L,max} = \\frac{V_{in,min} - V_{Z,hi}(I_{Z,min})}{R} - I_{Z,min}$$
<p>The zener dissipates most at the highest input with the lightest load, because then it absorbs nearly all the resistor current; the resistor dissipates most at the highest input:</p>
$$P_{Z,max} = V_{out}I_Z\\big|_{V_{in,max},\\,I_{L,min}},\\qquad P_{R,max} = \\frac{(V_{in,max}-V_{out})^2}{R}$$
<p>Each of the eight corners ($V_{in}$ low/high × load min/max × $V_Z$ low/high) is listed in the Tables tab. Both solutions are exact closed forms of the same equations the page uses for analysis, so a solved value fed back reproduces its target.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Choosing I<sub>Z,min</sub>.</strong> Keep it well above $I_{ZK}$; 10–25 % of $I_{ZT}$ keeps $r_z$ close to its datasheet value. Very low currents also make the zener noisy.</li>
<li><strong>Power ratings.</strong> Datasheet power is at 25 °C with ideal heat sinking (Vishay rates the 1N47xxA at 1.3 W with the leads held at ambient 4 mm from the body; onsemi rates the SOT-23 BZX84 at 250 mW on an FR-5 board). It falls linearly to zero at the maximum junction temperature, so design for about half.</li>
<li><strong>Temperature coefficient.</strong> Zeners below about 5 V have a negative coefficient, those above about 6 V a positive one; parts near 5.1–5.6 V drift least. Self-heating at high current shifts $V_Z$ too.</li>
<li><strong>Light loads waste power.</strong> The shunt regulator draws its full current all the time. For more than a few tens of milliamps, or a wide input range, let the zener drive the base of an emitter follower, or use a linear or switching regulator.</li>
<li><strong>Precision.</strong> For a reference better than a few percent use a shunt reference IC (TL431, LM4040): dynamic impedance below 1 Ω and 0.1–1 % initial accuracy.</li>
<li><strong>Ripple.</strong> Input ripple reaches the output scaled by the line regulation factor $r_z/(R+r_z)$. A capacitor across the zener helps at high frequencies.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>A. S. Sedra, K. C. Smith, <em>Microelectronic Circuits</em>, 7th ed., Oxford University Press, 2015: §4.4, zener diodes, the piecewise-linear model and the shunt regulator (6.8 V, $r_z$ = 20 Ω worked example).</li>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015: zener diodes and simple regulators (ch. 1) and voltage references (ch. 9).</li>
<li>Vishay Semiconductors, <em>1N4728A to 1N4761A Zener Diodes</em>, datasheet doc. 85816, rev. 2.7, 2024.</li>
<li>onsemi, <em>BZX84C2V4LT1 Series Zener Voltage Regulators</em>, datasheet BZX84C2V4LT1/D, rev. 24.</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em>.</li>
</ul>`,
    },
  ],
};
