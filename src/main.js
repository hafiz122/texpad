import { jsPDF } from 'jspdf';
import * as themeTools from './site-theme.js';
import { makeBellCurve, makeBellCurveLatex } from './bell-curve.js';
import './style.css';

const input = document.querySelector('#latex-input');
const vimToggle = document.querySelector('#vim-toggle');
const vimShell = document.querySelector('#vim-editor-shell');
const vimMount = document.querySelector('#vim-editor');
const vimTrail = document.querySelector('#vim-cursor-trail');
const vimHelp = document.querySelector('#vim-help');
const themeSelect = document.querySelector('#vim-theme');
const exampleButton = document.querySelector('#example-button');
const preview = document.querySelector('#preview-output');
const previewViewport = document.querySelector('.preview-scroll');
const previewState = document.querySelector('#preview-state');
const status = document.querySelector('#status');
const exportButtons = [...document.querySelectorAll('.export-button')];
const equationExportButtons = [...document.querySelectorAll('#equation-view .export-button')];
const curveExportButtons = [...document.querySelectorAll('.curve-export-button')];
const equationView = document.querySelector('#equation-view');
const curveView = document.querySelector('#curve-view');
const notesView = document.querySelector('#notes-view');
const equationLink = document.querySelector('#equation-link');
const curveLink = document.querySelector('#curve-link');
const notesLink = document.querySelector('#notes-link');
const curveMean = document.querySelector('#curve-mean');
const curveSigma = document.querySelector('#curve-sigma');
const curveLower = document.querySelector('#curve-lower');
const curveUpper = document.querySelector('#curve-upper');
const curvePreview = document.querySelector('#curve-preview');
const curvePreviewState = document.querySelector('#curve-preview-state');
const curveStatus = document.querySelector('#curve-status');
const curveInsertButton = document.querySelector('#curve-insert');
let notesApp;
let notesLoading;

const example = String.raw`\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}`;
const emptyMarkup = '<div class="empty-state"><p>Type an equation to see its preview.</p></div>';
let renderSequence = 0;
let renderTimer;
let renderedSvg = null;
let renderedOutput = null;
let renderedSize = null;
let exporting = false;
let vimView = null;
let getVimCM;
let vimModules;
let vimThemeTools;
let themeCompartment;
let selectedTheme = 'default';
let cursorColor = '#e0e2ea';
let cursorWash = 'rgba(224, 226, 234, 0.28)';
let cursorClear = 'rgba(224, 226, 234, 0)';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const trailContext = vimTrail.getContext('2d');
let cursorTarget = null;
let cursorPosition = null;
let cursorFrame = 0;
let lastCursorFrame = 0;
let cursorCanvasWidth = 0;
let cursorCanvasHeight = 0;
let cursorResizeObserver = null;

function getSource() {
  return vimView ? vimView.state.doc.toString() : input.value;
}

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
  for (const button of equationExportButtons) button.disabled = !enabled;
}

function curveValues() {
  if ([curveMean, curveSigma, curveLower, curveUpper].some((field) => field.validity.badInput)) {
    throw new Error('Enter numeric values for the bell curve.');
  }
  if (!curveMean.value || !curveSigma.value) throw new Error('Enter a mean and a standard deviation.');
  const lowerText = curveLower.value.trim();
  const upperText = curveUpper.value.trim();
  if (Boolean(lowerText) !== Boolean(upperText)) throw new Error('Enter both the lower and upper bounds, or leave both empty.');
  return {
    mean: Number(curveMean.value),
    sigma: Number(curveSigma.value),
    lower: lowerText ? Number(lowerText) : undefined,
    upper: upperText ? Number(upperText) : undefined,
  };
}

function updateCurve() {
  try {
    const { mean, sigma, lower, upper } = curveValues();
    const svg = makeBellCurve(mean, sigma, lower, upper);
    curvePreview.replaceChildren(svg);
    curvePreviewState.textContent = 'Ready';
    curveStatus.textContent = 'Bell curve ready to download.';
    curveStatus.dataset.kind = 'ready';
    for (const button of curveExportButtons) button.disabled = false;
    curveInsertButton.disabled = false;
  } catch (error) {
    curvePreview.replaceChildren();
    curvePreviewState.textContent = 'Check input';
    curveStatus.textContent = error.message;
    curveStatus.dataset.kind = 'error';
    for (const button of curveExportButtons) button.disabled = true;
    curveInsertButton.disabled = true;
  }
}

function fitPreview() {
  if (!renderedOutput || !renderedSize) return;
  const style = getComputedStyle(preview);
  const availableWidth = previewViewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const availableHeight = previewViewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const scale = Math.max(0.35, Math.min(1, availableWidth / renderedSize.width, availableHeight / renderedSize.height));
  renderedOutput.style.fontSize = `${180 * scale}%`;
  previewState.textContent = scale < 0.99 ? `Ready · ${Math.round(scale * 100)}%` : 'Ready';
}

new ResizeObserver(fitPreview).observe(previewViewport);

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
  const math = normalizeMath(getSource());
  if (!math) {
    renderedSvg = null;
    renderedOutput = null;
    renderedSize = null;
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
    const bounds = svg.getBoundingClientRect();
    if (!bounds.width || !bounds.height) throw new Error('The equation has no visible size.');
    renderedSvg = svg;
    renderedOutput = output;
    renderedSize = { width: bounds.width, height: bounds.height };
    previewState.textContent = 'Ready';
    fitPreview();
    updateStatus('Equation ready to download.', 'ready');
    setDownloadsEnabled(true);
  } catch (error) {
    if (sequence !== renderSequence) return;
    renderedSvg = null;
    renderedOutput = null;
    renderedSize = null;
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
  renderedOutput = null;
  renderedSize = null;
  setDownloadsEnabled(false);
  renderTimer = setTimeout(() => renderMath(sequence), 220);
}

function sizeCursorCanvas() {
  const bounds = vimTrail.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  const width = Math.max(1, Math.round(bounds.width * ratio));
  const height = Math.max(1, Math.round(bounds.height * ratio));
  if (vimTrail.width !== width || vimTrail.height !== height) {
    vimTrail.width = width;
    vimTrail.height = height;
  }
  cursorCanvasWidth = bounds.width;
  cursorCanvasHeight = bounds.height;
  trailContext.setTransform(width / bounds.width, 0, 0, height / bounds.height, 0, 0);
  return bounds;
}

function hideSmoothCursor() {
  if (cursorFrame) cancelAnimationFrame(cursorFrame);
  cursorFrame = 0;
  lastCursorFrame = 0;
  cursorTarget = null;
  cursorPosition = null;
  vimShell.classList.remove('smooth-cursor-active');
  trailContext?.clearRect(0, 0, cursorCanvasWidth, cursorCanvasHeight);
}

function setCursorColor(hex) {
  cursorColor = hex;
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  cursorWash = `rgba(${channels.join(', ')}, 0.28)`;
  cursorClear = `rgba(${channels.join(', ')}, 0)`;
}

function drawSmoothCursor() {
  const cursor = cursorPosition;
  trailContext.clearRect(0, 0, cursorCanvasWidth, cursorCanvasHeight);
  const headX = cursor.x + cursor.width / 2;
  const headY = cursor.y + cursor.height / 2;
  const length = Math.hypot(headX - cursor.tailX, headY - cursor.tailY);
  if (length > 2) {
    const gradient = trailContext.createLinearGradient(cursor.tailX, cursor.tailY, headX, headY);
    gradient.addColorStop(0, cursorClear);
    gradient.addColorStop(1, cursorWash);
    trailContext.strokeStyle = gradient;
    trailContext.lineWidth = Math.max(3, cursor.width);
    trailContext.beginPath();
    trailContext.moveTo(cursor.tailX, cursor.tailY);
    trailContext.lineTo(headX, headY);
    trailContext.stroke();
  }
  if (cursor.insertMode) {
    trailContext.fillStyle = cursorColor;
    trailContext.fillRect(cursor.x, cursor.y, 2, cursor.height);
  } else {
    trailContext.fillStyle = cursorWash;
    trailContext.fillRect(cursor.x, cursor.y, cursor.width, cursor.height);
    trailContext.strokeStyle = cursorColor;
    trailContext.lineWidth = 1;
    trailContext.strokeRect(cursor.x + 0.5, cursor.y + 0.5, cursor.width - 1, cursor.height - 1);
  }
}

function animateSmoothCursor(time) {
  cursorFrame = 0;
  if (!cursorTarget || !cursorPosition) return;
  const elapsed = lastCursorFrame ? Math.min(time - lastCursorFrame, 48) : 16.7;
  lastCursorFrame = time;
  const headEase = 1 - Math.exp(-elapsed / 52);
  const tailEase = 1 - Math.exp(-elapsed / 86);
  for (const key of ['x', 'y', 'width', 'height']) {
    cursorPosition[key] += (cursorTarget[key] - cursorPosition[key]) * headEase;
  }
  cursorPosition.tailX += (cursorPosition.x + cursorPosition.width / 2 - cursorPosition.tailX) * tailEase;
  cursorPosition.tailY += (cursorPosition.y + cursorPosition.height / 2 - cursorPosition.tailY) * tailEase;
  cursorPosition.insertMode = cursorTarget.insertMode;
  drawSmoothCursor();

  const headGap = Math.hypot(cursorTarget.x - cursorPosition.x, cursorTarget.y - cursorPosition.y);
  const tailGap = Math.hypot(cursorPosition.x + cursorPosition.width / 2 - cursorPosition.tailX,
    cursorPosition.y + cursorPosition.height / 2 - cursorPosition.tailY);
  if (headGap > 0.15 || tailGap > 0.3
    || Math.abs(cursorTarget.width - cursorPosition.width) > 0.15
    || Math.abs(cursorTarget.height - cursorPosition.height) > 0.15) {
    cursorFrame = requestAnimationFrame(animateSmoothCursor);
  }
}

function updateCursorTarget(view, snap = false) {
  if (!trailContext || !view || view !== vimView || !view.hasFocus || reducedMotion.matches) {
    hideSmoothCursor();
    return;
  }
  const caret = view.coordsAtPos(view.state.selection.main.head);
  if (!caret) return;
  const canvas = sizeCursorCanvas();
  const insertMode = Boolean(getVimCM(view)?.state.vim?.insertMode);
  const target = {
    x: caret.left - canvas.left,
    y: caret.top - canvas.top,
    width: insertMode ? 2 : Math.max(7, view.defaultCharacterWidth),
    height: Math.max(12, caret.bottom - caret.top),
    insertMode,
  };
  const jump = cursorPosition ? Math.hypot(target.x - cursorPosition.x, target.y - cursorPosition.y) : 0;
  if (!cursorPosition || snap || jump > 260) {
    cursorPosition = { ...target, tailX: target.x + target.width / 2, tailY: target.y + target.height / 2 };
  }
  cursorTarget = target;
  vimShell.classList.add('smooth-cursor-active');
  if (!cursorFrame) cursorFrame = requestAnimationFrame(animateSmoothCursor);
}

reducedMotion.addEventListener('change', () => updateCursorTarget(vimView, true));

function useTheme(name, persist = false) {
  const theme = themeTools.getTheme(name);
  selectedTheme = theme.name;
  themeSelect.value = theme.name;
  themeTools.applyTheme(document.documentElement, theme);
  document.querySelector('meta[name="theme-color"]').content = theme.site.page;
  setCursorColor(theme.colors.cursor);
  if (vimView) {
    vimView.dispatch({ effects: themeCompartment.reconfigure(vimThemeTools.themeHighlighting(theme)) });
    updateCursorTarget(vimView, true);
  }
  notesApp?.onTheme(theme);
  if (persist) {
    try { window.localStorage.setItem('texpad.vimTheme', theme.name); } catch { /* Storage may be disabled. */ }
  }
}

themeTools.fillThemePicker(themeSelect);
let savedTheme = 'default';
try { savedTheme = window.localStorage.getItem('texpad.vimTheme') || savedTheme; } catch { /* Storage may be disabled. */ }
useTheme(savedTheme);
themeSelect.addEventListener('change', () => {
  useTheme(themeSelect.value, true);
});

async function toggleVimMode() {
  if (vimView) {
    const selection = vimView.state.selection.main;
    input.value = vimView.state.doc.toString();
    input.setSelectionRange(selection.from, selection.to,
      selection.anchor > selection.head ? 'backward' : 'forward');
    cursorResizeObserver?.disconnect();
    cursorResizeObserver = null;
    hideSmoothCursor();
    vimView.destroy();
    vimView = null;
    vimShell.hidden = true;
    vimHelp.hidden = true;
    input.hidden = false;
    vimToggle.setAttribute('aria-pressed', 'false');
    vimToggle.textContent = 'Vim mode: off';
    input.focus();
    return;
  }

  vimToggle.disabled = true;
  vimToggle.textContent = 'Loading Vim…';
  try {
    vimModules ??= Promise.all([import('codemirror'), import('@replit/codemirror-vim'), import('./vim-theme.js')]);
    const [{ basicSetup, EditorView }, { getCM, vim }, loadedVimThemeTools] = await vimModules;
    getVimCM = getCM;
    vimThemeTools = loadedVimThemeTools;
    const theme = themeTools.getTheme(selectedTheme);
    setCursorColor(theme.colors.cursor);
    themeCompartment = new vimThemeTools.Compartment();
    const backward = input.selectionDirection === 'backward';
    const selection = {
      anchor: backward ? input.selectionEnd : input.selectionStart,
      head: backward ? input.selectionStart : input.selectionEnd,
    };
    vimShell.hidden = false;
    input.hidden = true;
    vimHelp.hidden = false;
    vimView = new EditorView({
      doc: input.value,
      selection,
      extensions: [
        vim({ status: true }),
        basicSetup,
        vimThemeTools.latexLanguage,
        themeCompartment.of(vimThemeTools.themeHighlighting(theme)),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          'aria-label': 'Enter equation, Vim mode',
          'aria-describedby': 'vim-help input-help',
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) scheduleRender();
          if (update.selectionSet || update.docChanged) {
            requestAnimationFrame(() => updateCursorTarget(update.view));
          }
        }),
      ],
      parent: vimMount,
    });
    const view = vimView;
    cursorResizeObserver = new ResizeObserver(() => updateCursorTarget(view, true));
    cursorResizeObserver.observe(vimShell);
    view.scrollDOM.addEventListener('scroll', () => updateCursorTarget(view, true), { passive: true });
    view.dom.addEventListener('focusin', () => requestAnimationFrame(() => updateCursorTarget(view, true)));
    view.dom.addEventListener('focusout', hideSmoothCursor);
    getCM(view)?.on('vim-mode-change', () => {
      requestAnimationFrame(() => updateCursorTarget(view));
    });
    vimToggle.setAttribute('aria-pressed', 'true');
    vimToggle.textContent = 'Vim mode: on';
    view.focus();
    requestAnimationFrame(() => updateCursorTarget(view, true));
  } catch {
    vimModules = null;
    cursorResizeObserver?.disconnect();
    cursorResizeObserver = null;
    hideSmoothCursor();
    vimView?.destroy();
    vimView = null;
    vimShell.hidden = true;
    vimHelp.hidden = true;
    input.hidden = false;
    vimToggle.textContent = 'Vim mode: off';
    updateStatus('Vim mode could not load. Check your connection and try again.', 'error');
  } finally {
    vimToggle.disabled = false;
  }
}

function makeStandaloneSvg(svg, width, height) {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', `${width}px`);
  clone.setAttribute('height', `${height}px`);
  if (svg.id !== 'bell-curve-svg') {
    clone.setAttribute('style', 'color:#202a24');
    const glyphs = clone.querySelector('g');
    if (glyphs) {
      glyphs.setAttribute('fill', '#202a24');
      glyphs.setAttribute('stroke', '#202a24');
    }
  }
  return new XMLSerializer().serializeToString(clone);
}

async function rasterize(svg, size) {
  const width = Math.ceil(size.width);
  const height = Math.ceil(size.height);
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

async function download(format, kind = 'equation') {
  const curve = kind === 'bell-curve';
  const svg = curve ? curvePreview.querySelector('svg') : renderedSvg;
  const size = curve ? { width: 720, height: 400 } : renderedSize;
  if (!svg || !size || exporting) return;
  const buttons = curve ? curveExportButtons : equationExportButtons;
  const report = (message, state) => {
    if (curve) {
      curveStatus.textContent = message;
      curveStatus.dataset.kind = state;
    } else updateStatus(message, state);
  };
  exporting = true;
  for (const button of buttons) button.disabled = true;
  report(`Preparing ${format.toUpperCase()}…`, 'loading');
  try {
    const { canvas, logicalWidth, logicalHeight } = await rasterize(svg, size);
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
      pdf.save(`texpad-${kind}.pdf`);
    } else {
      const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
      const blob = await blobFromCanvas(canvas, mimeType, 0.94);
      downloadBlob(blob, `texpad-${kind}.${format}`);
    }
    report(`${format.toUpperCase()} downloaded.`, 'ready');
  } catch (error) {
    report(error.message || `Could not download ${format.toUpperCase()}.`, 'error');
  } finally {
    exporting = false;
    for (const button of buttons) button.disabled = curve ? !curvePreview.querySelector('svg') : !renderedSvg;
  }
}

input.addEventListener('input', scheduleRender);
vimToggle.addEventListener('click', toggleVimMode);
exampleButton.addEventListener('click', () => {
  if (vimView) {
    vimView.dispatch({ changes: { from: 0, to: vimView.state.doc.length, insert: example } });
    vimView.focus();
  } else {
    input.value = example;
    input.focus();
    scheduleRender();
  }
});
for (const button of exportButtons) {
  button.addEventListener('click', () => download(button.dataset.format, button.classList.contains('curve-export-button') ? 'bell-curve' : 'equation'));
}
curveMean.addEventListener('input', updateCurve);
curveSigma.addEventListener('input', updateCurve);
curveLower.addEventListener('input', updateCurve);
curveUpper.addEventListener('input', updateCurve);
curveInsertButton.addEventListener('click', async () => {
  curveInsertButton.disabled = true;
  try {
    const { mean, sigma, lower, upper } = curveValues();
    const latex = makeBellCurveLatex(mean, sigma, lower, upper);
    const app = await loadNotes();
    const result = await app.insertBellCurve(latex);
    if (!result.ok) throw new Error(result.message);
    window.location.hash = '#notes';
    await showWorkspace();
    requestAnimationFrame(() => app.focusEditor());
  } catch (error) {
    curveStatus.textContent = error.message || 'Could not insert the bell curve.';
    curveStatus.dataset.kind = 'error';
  } finally {
    curveInsertButton.disabled = !curvePreview.querySelector('svg');
  }
});
updateCurve();

async function loadNotes() {
  if (notesApp) return notesApp;
  notesLoading ??= import('./notes.js').then(({ initNotes }) => initNotes({ getTheme: () => themeTools.getTheme(selectedTheme) }));
  try {
    notesApp = await notesLoading;
    return notesApp;
  } catch (error) {
    notesLoading = null;
    throw error;
  }
}

async function showWorkspace() {
  const notesMode = window.location.hash === '#notes';
  const curveMode = window.location.hash === '#curve';
  equationView.hidden = notesMode || curveMode;
  curveView.hidden = !curveMode;
  notesView.hidden = !notesMode;
  equationLink.setAttribute('aria-current', notesMode || curveMode ? 'false' : 'page');
  curveLink.setAttribute('aria-current', curveMode ? 'page' : 'false');
  notesLink.setAttribute('aria-current', notesMode ? 'page' : 'false');
  document.title = notesMode ? 'Texpad · Study notes' : curveMode ? 'Texpad · Bell curve' : 'Texpad · Math to PDF, PNG, JPG';
  if (notesMode && !notesApp) {
    try {
      await loadNotes();
    } catch {
      notesLoading = null;
      document.querySelector('#notes-empty').textContent = 'Notes could not load. Reload the page and try again.';
    }
  }
}

window.addEventListener('hashchange', showWorkspace);
showWorkspace();
