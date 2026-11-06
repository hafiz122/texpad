import { jsPDF } from 'jspdf';
import './style.css';

const input = document.querySelector('#latex-input');
const exampleButton = document.querySelector('#example-button');
const preview = document.querySelector('#preview-output');
const previewState = document.querySelector('#preview-state');
const status = document.querySelector('#status');
const exportButtons = [...document.querySelectorAll('.export-button')];

const example = String.raw`\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}`;
const emptyMarkup = '<div class="empty-state"><p>Type an equation to see its preview.</p></div>';
let renderSequence = 0;
let renderTimer;
let renderedSvg = null;
let exporting = false;

function normalizeMath(source) {
  let math = source.trim();
  const wrappers = [
    [/^\$\$([\s\S]*)\$\$$/, 1],
    [/^\$([\s\S]*)\$$/, 1],
    [/^\\\[([\s\S]*)\\\]$/, 1],
    [/^\\\(([\s\S]*)\\\)$/, 1],
  ];

  for (const [pattern, group] of wrappers) {
    const match = math.match(pattern);
    if (match) {
      math = match[group].trim();
      break;
    }
  }
  return math;
}

function updateStatus(message, kind = 'idle') {
  status.textContent = message;
  status.dataset.kind = kind;
}

function setDownloadsEnabled(enabled) {
  for (const button of exportButtons) button.disabled = !enabled;
}

async function mathJaxReady() {
  if (document.readyState !== 'complete') {
    await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
  }
  if (!window.MathJax?.startup?.promise) {
    throw new Error('MathJax could not load. Check your connection and reload the page.');
  }
  await window.MathJax.startup.promise;
  if (typeof window.MathJax.tex2svgPromise !== 'function') {
    throw new Error('MathJax could not load. Check your connection and reload the page.');
  }
}

async function renderMath(sequence) {
  const math = normalizeMath(input.value);
  if (!math) {
    renderedSvg = null;
    preview.innerHTML = emptyMarkup;
    previewState.textContent = 'Waiting for input';
    updateStatus('Enter an equation to begin.');
    setDownloadsEnabled(false);
    return;
  }

  previewState.textContent = 'Typesetting';
  updateStatus('Typesetting equation…', 'loading');
  try {
    await mathJaxReady();
    const output = await window.MathJax.tex2svgPromise(math, { display: true });
    if (sequence !== renderSequence) return;

    const svg = output.querySelector('svg');
    const hasMathError = output.querySelector('[data-mml-node="merror"], [data-mml-node="mtext"][fill="red"][stroke="red"]');
    if (!svg || hasMathError) {
      throw new Error('Check the LaTeX syntax and try again.');
    }
    preview.replaceChildren(output);
    renderedSvg = svg;
    previewState.textContent = 'Ready';
    updateStatus('Equation ready to download.', 'ready');
    setDownloadsEnabled(true);
  } catch (error) {
    if (sequence !== renderSequence) return;
    renderedSvg = null;
    preview.innerHTML = '<p class="error-state">This equation could not be typeset. Check the LaTeX and try again.</p>';
    previewState.textContent = 'Check input';
    updateStatus(error.message || 'Could not typeset the equation.', 'error');
    setDownloadsEnabled(false);
  }
}

function scheduleRender() {
  const sequence = ++renderSequence;
  clearTimeout(renderTimer);
  renderedSvg = null;
  setDownloadsEnabled(false);
  renderTimer = setTimeout(() => renderMath(sequence), 220);
}

function makeStandaloneSvg(svg, width, height) {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', `${width}px`);
  clone.setAttribute('height', `${height}px`);
  clone.setAttribute('style', 'color:#202a24');
  const glyphs = clone.querySelector('g');
  if (glyphs) {
    glyphs.setAttribute('fill', '#202a24');
    glyphs.setAttribute('stroke', '#202a24');
  }
  return new XMLSerializer().serializeToString(clone);
}

async function rasterize(svg) {
  const bounds = svg.getBoundingClientRect();
  const width = Math.ceil(bounds.width);
  const height = Math.ceil(bounds.height);
  if (!width || !height) throw new Error('The equation has no visible size to export.');

  const padding = 32;
  const logicalWidth = width + padding * 2;
  const logicalHeight = height + padding * 2;
  const scale = Math.min(3, 8192 / Math.max(logicalWidth, logicalHeight));
  if (scale < 1) throw new Error('This equation is too large to export as an image.');

  const svgBlob = new Blob([makeStandaloneSvg(svg, width, height)], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Could not prepare the equation image.'));
      image.src = svgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(logicalWidth * scale);
    canvas.height = Math.ceil(logicalHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image export is unavailable in this browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, padding * scale, padding * scale, width * scale, height * scale);
    return { canvas, logicalWidth, logicalHeight };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function blobFromCanvas(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not create the image file.'));
    }, mimeType, quality);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function download(format) {
  if (!renderedSvg || exporting) return;
  exporting = true;
  setDownloadsEnabled(false);
  updateStatus(`Preparing ${format.toUpperCase()}…`, 'loading');
  try {
    const { canvas, logicalWidth, logicalHeight } = await rasterize(renderedSvg);
    if (format === 'pdf') {
      const pageWidth = logicalWidth * 0.75;
      const pageHeight = logicalHeight * 0.75;
      const pdf = new jsPDF({
        orientation: pageWidth > pageHeight ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [pageWidth, pageHeight],
        compress: true,
      });
      pdf.addImage(canvas, 'PNG', 0, 0, pageWidth, pageHeight);
      pdf.save('texpad-equation.pdf');
    } else {
      const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
      const blob = await blobFromCanvas(canvas, mimeType, 0.94);
      downloadBlob(blob, `texpad-equation.${format}`);
    }
    updateStatus(`${format.toUpperCase()} downloaded.`, 'ready');
  } catch (error) {
    updateStatus(error.message || `Could not download ${format.toUpperCase()}.`, 'error');
  } finally {
    exporting = false;
    setDownloadsEnabled(Boolean(renderedSvg));
  }
}

input.addEventListener('input', scheduleRender);
exampleButton.addEventListener('click', () => {
  input.value = example;
  input.focus();
  scheduleRender();
});
for (const button of exportButtons) {
  button.addEventListener('click', () => download(button.dataset.format));
}
