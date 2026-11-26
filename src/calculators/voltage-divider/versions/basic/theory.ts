import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Voltage divider, Basic version',
    lead:
      'The bare two-resistor divider with nothing connected to the output. Give any three of $V_{in}$, $V_{out}$, $R_1$ and $R_2$ and the page finds the fourth. For a loaded output, standard resistor values or tolerance, switch to the Standard version with the version button beside the title.',
  },
  sections: [
    {
      title: 'The divider equation',
      html: `<p>The same current flows through $R_1$ and $R_2$, so the output across $R_2$ is</p>
$$V_{out} = V_{in}\\,\\frac{R_2}{R_1 + R_2}, \\qquad I = \\frac{V_{in}}{R_1 + R_2}$$
<p>With $k = V_{out}/V_{in}$, each unknown has an exact inverse:</p>
$$R_1 = R_2\\left(\\frac{1}{k}-1\\right),\\qquad R_2 = R_1\\frac{k}{1-k},\\qquad V_{in} = V_{out}\\frac{R_1+R_2}{R_2}$$
<p>A passive divider needs $0 < k < 1$. The output resistance seen by whatever reads $V_{out}$ is $R_1 \\parallel R_2$; keep any load at least 99 times larger for under 1 % error.</p>`,
    },
  ],
};
