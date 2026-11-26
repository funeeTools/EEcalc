import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Current dividers — how this calculator works',
    lead:
      'Branches in parallel share one voltage, so a current fed into them splits in proportion to each branch’s conductance. This page takes up to eight resistive branches, fed by an ideal current source or by a voltage source with its own resistance, and finds every branch current, share and power. It also solves for the branch resistance that takes a chosen share or current.',
  },
  sections: [
    {
      title: 'The current-division rule',
      html: `<p>Every branch sees the same node voltage $V$, so branch $j$ carries $I_j = V G_j$ with $G_j = 1/R_j$. The currents add up to the total (Kirchhoff’s current law), $I = V\\sum G$, which gives</p>
$$I_j = I\\,\\frac{G_j}{\\sum_m G_m} = I\\,\\frac{R_p}{R_j},\\qquad R_p = \\Big(\\sum_m \\frac{1}{R_m}\\Big)^{-1}$$
<p>For two branches this is the well-known “other resistor over the sum”: $I_1 = I\\,R_2/(R_1+R_2)$. The smallest resistor takes the largest share. Each branch dissipates $P_j = V^2/R_j$.</p>`,
    },
    {
      title: 'Current source or voltage source',
      html: `<p><strong>Current source.</strong> The total current is fixed, so the node voltage is $V = I R_p$. A current source can only hold its current up to its compliance voltage; the page warns when $V$ goes above 50 V.</p>
<p><strong>Voltage source with resistance $R_s$.</strong> The total current depends on the branches:</p>
$$V = \\frac{V_s}{1 + R_s\\sum G},\\qquad I = \\frac{V_s}{R_s + R_p}$$
<p>The shares $G_j/\\sum G$ do not depend on the source at all. What changes is the total: with $R_s = 0$ each branch draws $V_s/R_j$ on its own and adding a branch does not disturb the others. With a large $R_s$ the source behaves like a current source $V_s/R_s$.</p>`,
    },
    {
      title: 'Solving for a branch resistance',
      html: `<p>Click ◎ on a branch to make its resistance the unknown. The share and current boxes then belong to that branch: click ◎ on one of them to make it the target. With $G_o$ the conductance of the other branches, the inverses are exact:</p>
$$\\text{share } s:\\; G_k = G_o\\frac{s}{1-s}\\qquad \\text{current source: } G_k = \\frac{I_k G_o}{I - I_k}\\qquad \\text{voltage source: } G_k = \\frac{I_k(1 + R_sG_o)}{V_s - I_kR_s}$$
<p>A share must lie strictly between 0 and 100 %. With a current source a branch can take any current between zero and the source current; with a voltage source, at most $V_s/R_s$. Outside these limits no positive resistance works, and the page says which limit applies. The exact value is then rounded to the IEC 60063 values just below and above.</p>
<p>The classic use is an ammeter shunt: a meter movement of resistance $R_m$ and full-scale current $I_m$ is extended to a range $I$ by a shunt $R_{sh} = R_m I_m/(I - I_m)$. A 1 mA, 1 kΩ movement on a 1 A range needs 1.001 Ω.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Low-ohm branches.</strong> Wiring, solder and connector resistance (milliohms) sits in series with each branch. For shunts it can be a large part of the branch, so lay the branches out symmetrically and include the copper in $R$.</li>
<li><strong>Temperature.</strong> Branches that heat unequally drift apart through their TCR; a copper meter coil (about +0.39 %/K) and a manganin shunt (near zero) drift apart, which is why meters add a swamping resistor in series with the coil.</li>
<li><strong>AC.</strong> The rule holds for impedances, $I_j = I\\,Y_j/\\sum Y$, but the shares then become complex. This page is for resistive branches.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>C. K. Alexander, M. N. O. Sadiku, <em>Fundamentals of Electric Circuits</em>, 6th ed., McGraw-Hill, 2017, §2.6 (parallel resistors and current division) and §2.9 (ammeter design).</li>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015, §1.2.2.</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em>.</li>
<li>Vishay Draloric, <em>D/CRCW e3 Standard Thick Film Chip Resistors</em>, document 20035.</li>
</ul>`,
    },
  ],
};
