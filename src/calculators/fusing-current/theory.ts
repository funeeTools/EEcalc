import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Fusing current — how this calculator works',
    lead:
      'A large fault current heats a trace faster than the heat can leave it, until the copper melts and the trace opens. This page uses Onderdonk’s classic equation for that short-time heating, applied to the trace’s real cross-section (or to a round wire), and can solve for the fusing current, the time to fuse, or the size that fuses at a given current and time. It is an estimate for short pulses; the notes below explain where it stops being trustworthy.',
  },
  sections: [
    {
      title: 'Onderdonk’s equation',
      html: `<p>If no heat escapes during the pulse, all the $I^2R$ energy goes into raising the copper’s temperature. Copper’s resistivity grows in proportion to $T + 234$ °C, so integrating the heat balance from the starting temperature $T_a$ to the melting point $T_m$ gives a closed form, attributed to I. M. Onderdonk; its earliest known appearance is an article by Stauffacher in the June 1928 <em>General Electric Review</em>:</p>
$$I = A\\,\\sqrt{\\frac{\\log_{10}\\!\\left(\\dfrac{T_m - T_a}{234 + T_a} + 1\\right)}{33\\,t}}$$
<p>with $I$ in amperes, $A$ the cross-section in circular mils (1 cmil = $\\tfrac{\\pi}{4}$ mil² = 5.067 × 10⁻¹⁰ m²), $t$ the pulse length in seconds and temperatures in °C. The constant 33 collects copper’s density, specific heat and resistivity in these units; 234 °C is the temperature at which copper’s resistance would extrapolate to zero. For copper $T_m = 1083$ °C. The same relation appears in IEEE Std 80 for the short-time rating of copper grounding conductors.</p>
<p>Two consequences are worth remembering. The fusing current scales with the area, not with the perimeter, so a trace twice as wide fuses at twice the current. And it scales with $1/\\sqrt t$: a pulse 100 times shorter needs 10 times the current. Equivalently the melting integral $I^2 t$ is a constant of the conductor, which is the figure to compare with a fuse’s let-through $I^2 t$.</p>
<p>$T_m$ is capped at 1083 °C, because past melting the model has no latent heat and no liquid copper. Setting it lower turns the same equation into “time or current to reach a temperature”, for instance the ≈ 250–300 °C at which FR-4 begins to char and delaminate.</p>`,
    },
    {
      title: 'Applying it to a trace',
      html: `<p>A PCB trace is not round, but the equation only needs the area. For vertical walls $A = W\\,T$. Real etching undercuts the copper, so the top of the trace is narrower than the bottom. With an etch factor $EF$ (thickness divided by the undercut per side), each wall loses $T/EF$ at the top, and</p>
$$A = T\\,\\left(W - \\frac{T}{EF}\\right)$$
<p>where $W$ is the bottom (drawn) width. For 1 oz copper this barely matters, but for a narrow 3 oz trace with a 1:1 etch the area can drop by a third.</p>`,
    },
    {
      title: 'How far to trust it',
      html: `<ul>
<li><strong>Short pulses only.</strong> The equation assumes the copper keeps all its heat. On a circuit board heat flows quickly into the laminate and any nearby planes. Brooks and Adam’s measurements and simulations show Onderdonk applies to board traces for roughly the first 1–1.5 seconds; for longer overloads the trace survives longer, or needs more current, than predicted, and the exact fusing time becomes unpredictable. Their examples include a trace that took about half an hour to fail at a current just above its steady-state limit. The page warns beyond 1.5 s. With cooling corrections of their own, Brooks reports usable board estimates out to about 4–5 s (PCD&amp;F, 2023); those corrections are not implemented here.</li>
<li><strong>A lower bound for fusing, not a rating.</strong> Because cooling is ignored, the figure is the least current (or shortest time) that could melt the copper. It says nothing about continuous current: for that use IPC-2152 or the trace-width calculator.</li>
<li><strong>Reaching the melting point is not quite opening.</strong> Melting also needs the latent heat of fusion, and the molten copper must move before the circuit opens, so actual opening takes somewhat longer.</li>
<li><strong>The board fails first.</strong> Well below 1083 °C the laminate under the trace blisters, chars and delaminates, and may become conductive. A trace that “survives” a fault may still have ruined the board.</li>
</ul>`,
    },
    {
      title: 'Preece’s equation for wires',
      html: `<p>In the 1880s W. H. Preece measured the current that fuses fine bare wires hanging in air, and fitted</p>
$$I = a\\,d^{3/2},\\qquad a = 10244\\ \\text{for copper } (d \\text{ in inches})$$
<p>It has no time in it: it is the current at which the wire, with its normal cooling by convection and radiation, eventually reaches melting, roughly the steady-state limit. For a wire the page shows it beside Onderdonk; for a trace it is not meaningful, because a trace is cooled mainly by the board, which Preece’s wires never had. Preece’s numbers also scatter, and he counted a wire as fused when it glowed, so treat the result as indicative.</p>`,
    },
    {
      title: 'Solving',
      html: `<p>Click ◎ on $I$, $t$, $W$ or $d$. All solves use the same forward equation: the current and time come from it directly, and the width or diameter is found by a bracketed Brent search, so feeding the answer back reproduces the inputs. A solved width is the bottom width for the chosen etch profile. Widths and diameters are searched from 1 µm to 100 mm and times from 1 µs to 1 hour.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Designing a fusible trace</strong> is tempting but unreliable: the fusing current depends on the board, the copper thickness tolerance (plating adds 15–25 µm on outer layers), the etch and the fault’s rise time. Fit a real fuse where the protection matters, and keep a fusible link for last-resort protection only.</li>
<li><strong>Short-circuit survival</strong> is the more common use: check that a trace carries the fault current until the upstream fuse or the regulator’s current limit acts, with margin on the time.</li>
<li><strong>Vias</strong> often fuse before the trace: a 0.3 mm via with 25 µm plating has a barrel area of about 0.026 mm², similar to a 0.75 mm wide 1 oz trace.</li>
<li><strong>Thick copper and wide pours</strong> are effectively immune to short pulses but still need a continuous-current check.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>E. R. Stauffacher, “Short-time current carrying capacity of copper wire,” <em>General Electric Review</em>, June 1928 (Onderdonk’s equation).</li>
<li>D. Brooks, “Onderdonk’s and Preece’s equations: how do they compare?”, <em>Printed Circuit Design &amp; Fab</em>, June 2023.</li>
<li>IEEE Std 80-2013, <em>IEEE Guide for Safety in AC Substation Grounding</em>, §11.3 (short-time temperature rise of copper conductors, Tables 1–2).</li>
<li>D. Brooks, “Fusing current: when traces melt without a trace,” <em>Printed Circuit Design</em>, Dec. 1998.</li>
<li>D. Brooks, J. Adam, “How do traces fuse (melt)?”, <em>Signal Integrity Journal</em>, 2017.</li>
<li>D. Brooks, J. Adam, <em>PCB Design Guide to Via and Trace Currents and Temperatures</em>, Artech House, 2021 (App. G: derivation of Onderdonk’s equation).</li>
<li>W. H. Preece, “On the heating effects of electric currents,” <em>Proc. Royal Society of London</em> 36 (1884) 464–471; No. II, 43 (1888) 280–295.</li>
</ol>`,
    },
  ],
};
