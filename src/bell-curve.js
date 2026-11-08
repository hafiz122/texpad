const svgNS = 'http://www.w3.org/2000/svg';

function validateParameters(mean, sigma) {
  if (!Number.isFinite(mean) || !Number.isFinite(sigma) || sigma <= 0
    || Math.abs(mean) > 1e6 || sigma > 1e6 || sigma < 1e-6) {
    throw new Error('Enter a mean between −1,000,000 and 1,000,000 and a standard deviation from 0.000001 to 1,000,000.');
  }
}

function formatTick(value) {
  if (Math.abs(value) < 1e-10) return '0';
  return Number(value.toPrecision(5)).toString();
}

export function makeBellCurve(mean, sigma) {
  validateParameters(mean, sigma);

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('id', 'bell-curve-svg');
  svg.setAttribute('viewBox', '0 0 720 400');
  svg.setAttribute('width', '720');
  svg.setAttribute('height', '400');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Normal distribution with mean ${formatTick(mean)} and standard deviation ${formatTick(sigma)}`);

  const left = 58;
  const right = 684;
  const baseline = 318;
  const peakHeight = 218;
  const plotWidth = right - left;
  const x = (z) => left + (z + 4) * plotWidth / 8;
  const y = (z) => baseline - peakHeight * Math.exp(-z * z / 2);
  const points = Array.from({ length: 161 }, (_, index) => {
    const z = -4 + index / 20;
    return `${index ? 'L' : 'M'} ${x(z).toFixed(2)} ${y(z).toFixed(2)}`;
  }).join(' ');

  svg.innerHTML = `
    <rect width="720" height="400" fill="#ffffff"/>
    <text x="58" y="47" fill="#26312b" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700">Normal distribution</text>
    <text x="684" y="45" text-anchor="end" fill="#4d5a53" font-family="Arial, Helvetica, sans-serif" font-size="15">μ = ${formatTick(mean)}   σ = ${formatTick(sigma)}</text>
    <path d="M ${left} ${baseline} ${points} L ${right} ${baseline} Z" fill="#dce9f4"/>
    <path d="${points}" fill="none" stroke="#315f8d" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M ${left} ${baseline} H ${right}" stroke="#26312b" stroke-width="2"/>
    ${[-3, -2, -1, 0, 1, 2, 3].map((z) => `
      <path d="M ${x(z)} ${baseline} v 8" stroke="#26312b" stroke-width="2"/>
      <text x="${x(z)}" y="350" text-anchor="middle" fill="#26312b" font-family="Arial, Helvetica, sans-serif" font-size="14">${formatTick(mean + z * sigma)}</text>
    `).join('')}
    <text x="371" y="382" text-anchor="middle" fill="#4d5a53" font-family="Arial, Helvetica, sans-serif" font-size="14">Value</text>
  `;
  return svg;
}

function latexNumber(value) {
  const text = formatTick(value);
  const scientific = text.match(/^(-?\d+(?:\.\d+)?)e([+-]?\d+)$/);
  return scientific ? `${scientific[1]}\\times 10^{${Number(scientific[2])}}` : text;
}

export function makeBellCurveLatex(mean, sigma) {
  validateParameters(mean, sigma);
  const left = 12;
  const width = 296;
  const baseline = 43;
  const height = 93;
  const x = (z) => left + (z + 4) * width / 8;
  const y = (z) => baseline + height * Math.exp(-z * z / 2);
  const point = (px, py) => `(${px.toFixed(2)},${py.toFixed(2)})`;
  const curve = Array.from({ length: 64 }, (_, index) => {
    const z0 = -4 + index / 8;
    const z1 = z0 + 1 / 8;
    const zMid = (z0 + z1) / 2;
    const controlY = 2 * y(zMid) - (y(z0) + y(z1)) / 2;
    return `\\qbezier${point(x(z0), y(z0))}${point(x(zMid), controlY)}${point(x(z1), y(z1))}`;
  });
  const ticks = [-3, -2, -1, 0, 1, 2, 3].flatMap((z) => [
    `\\put(${x(z).toFixed(2)},39){\\line(0,1){8}}`,
    `\\put(${x(z).toFixed(2)},27){\\makebox(0,0){\\scriptsize $${latexNumber(mean + z * sigma)}$}}`,
  ]);

  return [
    '% Bell curve: vector graph drawn with standard LaTeX picture commands.',
    '\\begin{center}',
    '\\begingroup',
    '\\setlength{\\unitlength}{1pt}',
    '\\begin{picture}(320,166)',
    `\\put(160,154){\\makebox(0,0){\\small Normal distribution ($\\mu=${latexNumber(mean)}$, $\\sigma=${latexNumber(sigma)}$)}}`,
    '\\linethickness{0.45pt}',
    `\\put(${left},${baseline}){\\line(1,0){${width}}}`,
    ...ticks,
    '\\linethickness{0.95pt}',
    ...curve,
    '\\put(160,8){\\makebox(0,0){\\scriptsize Value}}',
    '\\end{picture}',
    '\\endgroup',
    '\\end{center}',
  ].join('\n');
}
