import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { openDB } from 'idb';
import { templateFor } from './latex-templates.js';

const element = (id) => document.getElementById(id);
const list = element('notes-list');
const search = element('notes-search');
const picker = element('notes-select');
const empty = element('notes-empty');
const documentPanel = element('notes-document');
const nameInput = element('notes-name');
const bodyInput = element('notes-body');
const preview = element('notes-preview');
const pdfPreview = element('notes-pdf-preview');
const compileError = element('notes-compile-error');
const previewState = element('notes-preview-state');
const saveState = element('notes-save-state');
const storageWarning = element('notes-storage-warning');
const fileInput = element('notes-file');
const printArea = element('notes-print');
const deleteDialog = element('notes-delete-dialog');
const vimToggle = element('notes-vim-toggle');
const vimShell = element('notes-vim-shell');
const vimMount = element('notes-vim-editor');
const vimTrail = element('notes-vim-trail');
const templateSelect = element('notes-template');
const downloadButton = element('notes-download');
const printButton = element('notes-print-button');
const splitGrid = document.querySelector('.notes-editor-preview');
const divider = element('notes-divider');

let database;
let storageError = false;
let notes = new Map();
let activeId = null;
let revision = 0;
let saveTimer = 0;
let saveChain = Promise.resolve();
let renderTimer = 0;
let renderSequence = 0;
let vimView = null;
let vimModules;
let vimCompartment;
let vimHighlighting;
let cursor;
let getTheme;
let pendingDeleteId = null;
let pdfUrl = null;
let pdfBytes = null;
let editorWidth = 50;

function setEditorWidth(percent, persist = false) {
  const width = splitGrid.clientWidth;
  const minimum = width ? Math.min(50, Math.max(25, Math.ceil(26000 / width))) : 25;
  const maximum = width ? Math.max(50, Math.min(75, Math.floor(100 - 29200 / width))) : 75;
  editorWidth = Math.max(minimum, Math.min(maximum, Math.round(percent)));
  splitGrid.style.setProperty('--notes-editor-width', `${editorWidth}%`);
  divider.setAttribute('aria-valuemin', String(minimum));
  divider.setAttribute('aria-valuemax', String(maximum));
  divider.setAttribute('aria-valuenow', String(editorWidth));
  if (persist) {
    try { window.localStorage.setItem('texpad.editorWidth', String(editorWidth)); } catch { /* Storage may be disabled. */ }
  }
}

function activeNote() { return notes.get(activeId); }
function formatOf(note) { return note?.format === 'latex' ? 'latex' : 'markdown'; }
function titleOf(note) { return note.title.trim() || 'Untitled note'; }
function sortedNotes() { return [...notes.values()].sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title)); }

function setSaveState(message, kind = 'ready') {
  saveState.textContent = message;
  saveState.dataset.kind = kind;
}

function storageFailed() {
  storageError = true;
  storageWarning.hidden = false;
  setSaveState('Not saved — download the source file to keep this note.', 'error');
}

function rememberActive() {
  try { window.localStorage.setItem('texpad.lastNote', activeId || ''); } catch { /* Browser storage may be disabled. */ }
}

function renderNoteList() {
  const term = search.value.trim().toLowerCase();
  const filtered = sortedNotes().filter((note) =>
    !term || note.title.toLowerCase().includes(term) || note.body.toLowerCase().includes(term));
  list.replaceChildren();
  if (!filtered.length) {
    const item = document.createElement('li');
    item.className = 'notes-list-empty';
    item.textContent = notes.size ? 'No matching notes.' : 'No notes yet.';
    list.append(item);
  }
  for (const note of filtered) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.noteId = note.id;
    if (note.id === activeId) button.setAttribute('aria-current', 'true');
    const title = document.createElement('strong');
    title.textContent = titleOf(note);
    const date = document.createElement('small');
    date.textContent = new Date(note.updatedAt).toLocaleDateString();
    button.append(title, date);
    item.append(button);
    list.append(item);
  }
  picker.replaceChildren();
  for (const note of sortedNotes()) {
    const option = document.createElement('option');
    option.value = note.id;
    option.textContent = titleOf(note);
    picker.append(option);
  }
  picker.value = activeId || '';
  picker.disabled = !notes.size;
}

function markEdited() {
  const note = activeNote();
  if (!note) return;
  note.updatedAt = Date.now();
  revision += 1;
  setSaveState(database ? 'Saving…' : 'Not saved — download the source file to keep this note.', database ? 'loading' : 'error');
  renderNoteList();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveCurrent(), 500);
}

function saveRecord(note) {
  if (!database) {
    storageFailed();
    return Promise.resolve();
  }
  const snapshot = { ...note };
  const savedRevision = revision;
  saveChain = saveChain.catch(() => {}).then(() => database.put('notes', snapshot));
  return saveChain.then(() => {
    storageError = false;
    storageWarning.hidden = true;
    if (snapshot.id === activeId && savedRevision === revision) setSaveState('Saved');
  }).catch(() => storageFailed());
}

function saveCurrent() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  const note = activeNote();
  return note ? saveRecord(note) : Promise.resolve();
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function markdownParser(math) {
  const parser = new Marked({ gfm: true, breaks: false });
  parser.use({
    renderer: {
      html(token) { return escapeHtml(token.text); },
      image(token) { return escapeHtml(token.text || 'Image omitted'); },
    },
    extensions: [
      {
        name: 'displayMath', level: 'block',
        start(source) { return source.indexOf('$$'); },
        tokenizer(source) {
          if (!source.startsWith('$$')) return;
          const line = /^\$\$([^\n]*?)\$\$[ \t]*(?:\n|$)/.exec(source);
          const multi = /^\$\$[ \t]*\n([\s\S]*?)\n\$\$[ \t]*(?:\n|$)/.exec(source);
          const match = multi || line;
          if (!match || !match[1].trim()) return;
          const index = math.push({ tex: match[1].trim(), display: true }) - 1;
          return { type: 'displayMath', raw: match[0], index };
        },
        renderer(token) { return `<div class="notes-math" data-display="true" data-math-index="${token.index}"></div>`; },
      },
      {
        name: 'inlineMath', level: 'inline',
        start(source) { return source.indexOf('$'); },
        tokenizer(source) {
          if (!source.startsWith('$') || source.startsWith('$$') || /\s/.test(source[1] || '')) return;
          for (let index = 1; index < source.length && source[index] !== '\n'; index += 1) {
            if (source[index] !== '$' || source[index - 1] === '\\' || /\s/.test(source[index - 1])) continue;
            const tex = source.slice(1, index);
            const mathIndex = math.push({ tex, display: false }) - 1;
            return { type: 'inlineMath', raw: source.slice(0, index + 1), index: mathIndex };
          }
        },
        renderer(token) { return `<span class="notes-math" data-math-index="${token.index}"></span>`; },
      },
    ],
  });
  return parser;
}

async function mathJaxReady() {
  if (document.readyState !== 'complete') {
    await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
  }
  if (!window.MathJax?.startup?.promise) throw new Error('MathJax could not load.');
  await window.MathJax.startup.promise;
  if (!window.MathJax.tex2svgPromise) throw new Error('MathJax could not load.');
}

function clearPdfPreview() {
  pdfBytes = null;
  pdfPreview.removeAttribute('src');
  pdfPreview.hidden = true;
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  pdfUrl = null;
}

async function renderLatexPreview(note, sequence) {
  previewState.textContent = 'Compiling LaTeX';
  printButton.disabled = true;
  try {
    const { compileLatex } = await import('./latex-compiler.js');
    const bytes = await compileLatex(note.body);
    if (sequence !== renderSequence || note.id !== activeId) return false;
    const nextUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    clearPdfPreview();
    pdfUrl = nextUrl;
    pdfBytes = bytes;
    pdfPreview.src = pdfUrl;
    pdfPreview.hidden = false;
    compileError.hidden = true;
    previewState.textContent = 'Ready · PDF';
    printButton.disabled = false;
    return true;
  } catch (error) {
    if (sequence !== renderSequence || note.id !== activeId) return false;
    clearPdfPreview();
    element('notes-compile-message').textContent = error.message || 'Check the LaTeX source.';
    element('notes-compile-log').textContent = error.log || String(error);
    compileError.hidden = false;
    previewState.textContent = 'Check LaTeX';
    return false;
  }
}

async function renderPreview() {
  const note = activeNote();
  const sequence = ++renderSequence;
  if (!note) return;
  if (formatOf(note) === 'latex') return renderLatexPreview(note, sequence);
  const math = [];
  const parser = markdownParser(math);
  const html = parser.parse(note.body);
  const safe = DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['img', 'style'], FORBID_ATTR: ['style'] });
  const content = document.createElement('div');
  content.innerHTML = safe;
  previewState.textContent = math.length ? 'Typesetting' : 'Ready';
  let errors = 0;
  if (math.length) {
    try {
      await mathJaxReady();
      const slots = content.querySelectorAll('[data-math-index]');
      for (const slot of slots) {
        if (sequence !== renderSequence || note.id !== activeId) return false;
        const item = math[Number(slot.dataset.mathIndex)];
        try {
          const output = await window.MathJax.tex2svgPromise(item.tex, { display: item.display });
          if (!output.querySelector('svg') || output.querySelector('[data-mml-node="merror"]')) throw new Error('Invalid math');
          slot.replaceChildren(output);
        } catch {
          errors += 1;
          const fallback = document.createElement('span');
          fallback.className = 'notes-math-error';
          fallback.textContent = `${item.tex} (check LaTeX)`;
          slot.replaceChildren(fallback);
        }
      }
    } catch {
      errors = math.length;
      for (const slot of content.querySelectorAll('[data-math-index]')) {
        const item = math[Number(slot.dataset.mathIndex)];
        slot.textContent = `${item.tex} (math preview unavailable)`;
        slot.classList.add('notes-math-error');
      }
    }
  }
  if (sequence !== renderSequence || note.id !== activeId) return false;
  preview.replaceChildren(...content.childNodes);
  if (!note.body.trim()) preview.textContent = 'Write a note to see its preview.';
  previewState.textContent = errors ? `${errors} math error${errors === 1 ? '' : 's'}` : 'Ready';
  return true;
}

function schedulePreview() {
  clearTimeout(renderTimer);
  renderSequence += 1;
  const latex = formatOf(activeNote()) === 'latex';
  previewState.textContent = latex ? 'Waiting to compile' : 'Updating';
  if (latex) printButton.disabled = true;
  renderTimer = window.setTimeout(renderPreview, latex ? 900 : 180);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadText(text, filename) {
  const type = filename.endsWith('.tex') ? 'application/x-tex;charset=utf-8' : 'text/markdown;charset=utf-8';
  downloadBlob(new Blob([text], { type }), filename);
}

function filenameFor(note) {
  const base = titleOf(note).normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'note';
  return `${base}.${formatOf(note) === 'latex' ? 'tex' : 'md'}`;
}

function attachCursor(view, getCM) {
  const context = vimTrail.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let target = null;
  let position = null;
  let frame = 0;
  let lastFrame = 0;
  let color = getTheme().colors.cursor;
  let width = 0;
  let height = 0;

  function hide() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    target = null;
    position = null;
    vimShell.classList.remove('smooth-cursor-active');
    context.clearRect(0, 0, width, height);
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    const headX = position.x + position.width / 2;
    const headY = position.y + position.height / 2;
    const channels = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16)).join(', ');
    if (Math.hypot(headX - position.tailX, headY - position.tailY) > 2) {
      const gradient = context.createLinearGradient(position.tailX, position.tailY, headX, headY);
      gradient.addColorStop(0, `rgba(${channels}, 0)`);
      gradient.addColorStop(1, `rgba(${channels}, 0.28)`);
      context.strokeStyle = gradient;
      context.lineWidth = Math.max(3, position.width);
      context.beginPath();
      context.moveTo(position.tailX, position.tailY);
      context.lineTo(headX, headY);
      context.stroke();
    }
    if (position.insertMode) {
      context.fillStyle = color;
      context.fillRect(position.x, position.y, 2, position.height);
    } else {
      context.fillStyle = `rgba(${channels}, 0.28)`;
      context.fillRect(position.x, position.y, position.width, position.height);
      context.strokeStyle = color;
      context.lineWidth = 1;
      context.strokeRect(position.x + 0.5, position.y + 0.5, position.width - 1, position.height - 1);
    }
  }

  function animate(time) {
    frame = 0;
    if (!target || !position) return;
    const elapsed = lastFrame ? Math.min(time - lastFrame, 48) : 16.7;
    lastFrame = time;
    const headEase = 1 - Math.exp(-elapsed / 52);
    const tailEase = 1 - Math.exp(-elapsed / 86);
    for (const key of ['x', 'y', 'width', 'height']) position[key] += (target[key] - position[key]) * headEase;
    position.tailX += (position.x + position.width / 2 - position.tailX) * tailEase;
    position.tailY += (position.y + position.height / 2 - position.tailY) * tailEase;
    position.insertMode = target.insertMode;
    draw();
    if (Math.hypot(target.x - position.x, target.y - position.y) > 0.15
      || Math.hypot(position.x + position.width / 2 - position.tailX, position.y + position.height / 2 - position.tailY) > 0.3
      || Math.abs(target.width - position.width) > 0.15 || Math.abs(target.height - position.height) > 0.15) {
      frame = requestAnimationFrame(animate);
    }
  }

  function update(snap = false) {
    if (!view.hasFocus || reducedMotion.matches) { hide(); return; }
    const caret = view.coordsAtPos(view.state.selection.main.head);
    if (!caret) return;
    const bounds = vimTrail.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    const canvasWidth = Math.max(1, Math.round(bounds.width * ratio));
    const canvasHeight = Math.max(1, Math.round(bounds.height * ratio));
    if (vimTrail.width !== canvasWidth || vimTrail.height !== canvasHeight) {
      vimTrail.width = canvasWidth;
      vimTrail.height = canvasHeight;
    }
    context.setTransform(vimTrail.width / bounds.width, 0, 0, vimTrail.height / bounds.height, 0, 0);
    width = bounds.width;
    height = bounds.height;
    const insertMode = Boolean(getCM(view)?.state.vim?.insertMode);
    const next = {
      x: caret.left - bounds.left,
      y: caret.top - bounds.top,
      width: insertMode ? 2 : Math.max(7, view.defaultCharacterWidth),
      height: Math.max(12, caret.bottom - caret.top),
      insertMode,
    };
    if (!position || snap || Math.hypot(next.x - position.x, next.y - position.y) > 260) {
      position = { ...next, tailX: next.x + next.width / 2, tailY: next.y + next.height / 2 };
    }
    target = next;
    vimShell.classList.add('smooth-cursor-active');
    if (!frame) frame = requestAnimationFrame(animate);
  }

  const observer = new ResizeObserver(() => update(true));
  observer.observe(vimShell);
  const focusIn = () => requestAnimationFrame(() => update(true));
  view.dom.addEventListener('focusin', focusIn);
  view.dom.addEventListener('focusout', hide);
  view.scrollDOM.addEventListener('scroll', focusIn, { passive: true });
  reducedMotion.addEventListener('change', focusIn);
  getCM(view)?.on('vim-mode-change', focusIn);
  requestAnimationFrame(() => update(true));
  return {
    update,
    setColor(value) { color = value; update(true); },
    destroy() {
      observer.disconnect();
      view.dom.removeEventListener('focusin', focusIn);
      view.dom.removeEventListener('focusout', hide);
      view.scrollDOM.removeEventListener('scroll', focusIn);
      reducedMotion.removeEventListener('change', focusIn);
      getCM(view)?.off('vim-mode-change', focusIn);
      hide();
    },
  };
}

async function startVim() {
  vimToggle.disabled = true;
  vimToggle.textContent = 'Loading Vim…';
  try {
    vimModules ??= Promise.all([
      import('codemirror'), import('@replit/codemirror-vim'), import('@codemirror/lang-markdown'),
      import('@codemirror/language'), import('@lezer/highlight'), import('@codemirror/state'),
      import('@codemirror/legacy-modes/mode/stex'),
    ]);
    const [{ basicSetup, EditorView }, { getCM, vim }, { markdown }, { HighlightStyle, syntaxHighlighting, StreamLanguage }, { tags }, { Compartment }, { stex }] = await vimModules;
    vimCompartment = new Compartment();
    vimHighlighting = (theme) => syntaxHighlighting(HighlightStyle.define([
      { tag: tags.heading, color: theme.colors.command, fontWeight: 'bold' },
      { tag: tags.strong, color: theme.colors.environment, fontWeight: 'bold' },
      { tag: tags.emphasis, color: theme.colors.text, fontStyle: 'italic' },
      { tag: tags.link, color: theme.colors.command, textDecoration: 'underline' },
      { tag: tags.url, color: theme.colors.number },
      { tag: tags.monospace, color: theme.colors.comment },
      { tag: tags.contentSeparator, color: theme.colors.delimiter },
      { tag: tags.keyword, color: theme.colors.command },
      { tag: tags.comment, color: theme.colors.comment },
      { tag: tags.number, color: theme.colors.number },
      { tag: tags.bracket, color: theme.colors.delimiter },
    ]));
    vimView = new EditorView({
      doc: bodyInput.value,
      selection: { anchor: bodyInput.selectionStart },
      extensions: [
        vim({ status: true }), basicSetup,
        formatOf(activeNote()) === 'latex' ? StreamLanguage.define(stex) : markdown(),
        vimCompartment.of(vimHighlighting(getTheme())),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': 'Note text, Vim mode' }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const note = activeNote();
            if (note) { note.body = update.state.doc.toString(); markEdited(); schedulePreview(); }
          }
          if (update.selectionSet || update.docChanged) requestAnimationFrame(() => cursor?.update());
        }),
      ],
      parent: vimMount,
    });
    vimShell.hidden = false;
    bodyInput.hidden = true;
    vimToggle.setAttribute('aria-pressed', 'true');
    vimToggle.textContent = 'Vim mode: on';
    cursor = attachCursor(vimView, getCM);
    vimView.focus();
  } catch {
    vimModules = null;
    vimView?.destroy();
    vimView = null;
    vimShell.hidden = true;
    bodyInput.hidden = false;
    vimToggle.textContent = 'Vim mode: off';
    setSaveState('Vim mode could not load. Your note is still available.', 'error');
  } finally {
    vimToggle.disabled = false;
  }
}

function stopVim() {
  if (!vimView) return;
  bodyInput.value = vimView.state.doc.toString();
  const position = vimView.state.selection.main.head;
  bodyInput.setSelectionRange(position, position);
  cursor?.destroy();
  cursor = null;
  vimView.destroy();
  vimView = null;
  vimMount.replaceChildren();
  vimShell.hidden = true;
  bodyInput.hidden = false;
  vimToggle.setAttribute('aria-pressed', 'false');
  vimToggle.textContent = 'Vim mode: off';
}

async function selectNote(id) {
  if (!notes.has(id) || id === activeId) return;
  await saveCurrent();
  const wasVim = Boolean(vimView);
  if (wasVim) stopVim();
  activeId = id;
  revision += 1;
  rememberActive();
  showActive();
  if (wasVim) await startVim();
}

function showActive() {
  const note = activeNote();
  clearTimeout(renderTimer);
  renderSequence += 1;
  clearPdfPreview();
  compileError.hidden = true;
  documentPanel.hidden = !note;
  empty.hidden = Boolean(note);
  if (note) {
    const latex = formatOf(note) === 'latex';
    element('notes-name-label').textContent = latex ? 'Draft name:' : 'Title:';
    nameInput.value = note.title;
    bodyInput.value = note.body;
    bodyInput.spellcheck = !latex;
    bodyInput.placeholder = latex ? 'Write LaTeX here.' : 'Write Markdown here. Use $...$ or $$...$$ for math.';
    element('notes-editor-help').textContent = latex
      ? 'Full LaTeX source. Edit \\title in the preamble to change the PDF title. Common packages are bundled.'
      : 'Markdown text; $...$ for inline math and $$...$$ for display math.';
    downloadButton.textContent = latex ? 'Download .tex' : 'Download .md';
    printButton.textContent = latex ? 'Download PDF' : 'Print / Save PDF';
    printButton.disabled = latex;
    preview.hidden = latex;
    bodyInput.setSelectionRange(0, 0);
    setSaveState(database && !storageError ? 'Saved' : 'Not saved — download the source file to keep this note.', database && !storageError ? 'ready' : 'error');
    renderPreview();
  }
  renderNoteList();
}

async function createNote(title, body, format) {
  await saveCurrent();
  const wasVim = Boolean(vimView);
  if (wasVim) stopVim();
  const now = Date.now();
  const note = { id: crypto.randomUUID(), title, body, format, createdAt: now, updatedAt: now };
  notes.set(note.id, note);
  activeId = note.id;
  revision += 1;
  rememberActive();
  showActive();
  await saveRecord(note);
  if (wasVim) await startVim();
  else nameInput.focus();
}

function newNote() {
  const template = templateFor(templateSelect.value);
  return createNote(template.title, template.body, template.format);
}

function requestDelete() {
  const note = activeNote();
  if (!note) return;
  pendingDeleteId = note.id;
  element('notes-delete-message').textContent = `Delete “${titleOf(note)}”? This cannot be undone.`;
  deleteDialog.showModal();
  element('notes-delete-cancel').focus();
}

async function deleteNote() {
  const note = notes.get(pendingDeleteId);
  deleteDialog.close();
  pendingDeleteId = null;
  if (!note || note.id !== activeId) return;
  await saveCurrent();
  if (database) {
    try { await database.delete('notes', note.id); }
    catch { storageFailed(); return; }
  }
  if (vimView) stopVim();
  notes.delete(note.id);
  activeId = sortedNotes()[0]?.id || null;
  revision += 1;
  rememberActive();
  showActive();
}

async function importNote(file) {
  if (!file) return;
  if (file.size > 2_000_000) { setSaveState('Source file is too large to import.', 'error'); return; }
  try {
    const body = await file.text();
    const format = /\.tex$/i.test(file.name) ? 'latex' : 'markdown';
    const title = file.name.replace(/\.(md|tex)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Imported note';
    await createNote(title.slice(0, 120), body, format);
  } catch {
    setSaveState('Could not read the source file.', 'error');
  } finally {
    fileInput.value = '';
  }
}

async function printNote() {
  const note = activeNote();
  if (!note) return;
  if (formatOf(note) === 'latex') {
    if (pdfBytes) downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), filenameFor(note).replace(/\.tex$/, '.pdf'));
    return;
  }
  clearTimeout(renderTimer);
  if (!await renderPreview() || note.id !== activeId) return;
  const heading = document.createElement('h1');
  heading.textContent = titleOf(note);
  const content = preview.cloneNode(true);
  content.removeAttribute('id');
  content.classList.add('print-content');
  printArea.replaceChildren(heading, content);
  document.body.classList.add('printing-note');
  if (document.fonts?.load) await document.fonts.load('11pt "Latin Modern Roman"').catch(() => {});
  window.print();
}

function switchNoteTab(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'ArrowLeft' || event.key === 'Home' ? 'edit' : 'preview';
  const tab = element(`notes-${next}-tab`);
  tab.click();
  tab.focus();
}

export async function initNotes(options) {
  getTheme = options.getTheme;
  let savedWidth = 50;
  try { savedWidth = Number(window.localStorage.getItem('texpad.editorWidth')) || 50; } catch { /* Storage may be disabled. */ }
  setEditorWidth(savedWidth);
  new ResizeObserver(() => setEditorWidth(editorWidth)).observe(splitGrid);
  let activePointer = null;
  const splitAtPointer = (event) => {
    const bounds = splitGrid.getBoundingClientRect();
    if (bounds.width) setEditorWidth(100 * (event.clientX - bounds.left) / bounds.width);
  };
  divider.addEventListener('pointerdown', (event) => {
    if (activePointer !== null) return;
    activePointer = event.pointerId;
    divider.setPointerCapture(event.pointerId);
    document.body.classList.add('notes-resizing');
    splitAtPointer(event);
    event.preventDefault();
  });
  window.addEventListener('pointermove', (event) => {
    if (event.pointerId === activePointer) splitAtPointer(event);
  });
  const endSplit = (event) => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    document.body.classList.remove('notes-resizing');
    setEditorWidth(editorWidth, true);
  };
  window.addEventListener('pointerup', endSplit);
  window.addEventListener('pointercancel', endSplit);
  divider.addEventListener('lostpointercapture', endSplit);
  divider.addEventListener('keydown', (event) => {
    const next = { ArrowLeft: editorWidth - 5, ArrowRight: editorWidth + 5, Home: 25, End: 75 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setEditorWidth(next, true);
  });
  search.addEventListener('input', renderNoteList);
  list.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-note-id]');
    if (button) selectNote(button.dataset.noteId);
  });
  picker.addEventListener('change', () => selectNote(picker.value));
  element('notes-new').addEventListener('click', () => newNote());
  element('notes-new-mobile').addEventListener('click', () => newNote());
  element('notes-new-empty').addEventListener('click', () => newNote());
  element('notes-delete').addEventListener('click', requestDelete);
  element('notes-delete-cancel').addEventListener('click', () => deleteDialog.close());
  element('notes-delete-confirm').addEventListener('click', deleteNote);
  deleteDialog.addEventListener('close', () => { pendingDeleteId = null; });
  nameInput.addEventListener('input', () => {
    const note = activeNote();
    if (note) { note.title = nameInput.value; markEdited(); }
  });
  bodyInput.addEventListener('input', () => {
    const note = activeNote();
    if (note) { note.body = bodyInput.value; markEdited(); schedulePreview(); }
  });
  vimToggle.addEventListener('click', async () => {
    if (vimView) { stopVim(); bodyInput.focus(); }
    else await startVim();
  });
  element('notes-import').addEventListener('click', () => fileInput.click());
  element('notes-import-empty').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => importNote(fileInput.files[0]));
  downloadButton.addEventListener('click', () => {
    const note = activeNote();
    if (note) downloadText(note.body, filenameFor(note));
  });
  printButton.addEventListener('click', printNote);
  for (const tab of ['edit', 'preview']) {
    element(`notes-${tab}-tab`).addEventListener('click', () => {
      documentPanel.dataset.tab = tab;
      element('notes-edit-tab').setAttribute('aria-selected', String(tab === 'edit'));
      element('notes-preview-tab').setAttribute('aria-selected', String(tab === 'preview'));
      element('notes-edit-tab').tabIndex = tab === 'edit' ? 0 : -1;
      element('notes-preview-tab').tabIndex = tab === 'preview' ? 0 : -1;
    });
  }
  element('notes-edit-tab').addEventListener('keydown', switchNoteTab);
  element('notes-preview-tab').addEventListener('keydown', switchNoteTab);
  documentPanel.dataset.tab = 'edit';
  element('notes-preview-tab').tabIndex = -1;
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveCurrent(); });
  window.addEventListener('pagehide', () => saveCurrent());
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-note'));
  try {
    database = await openDB('texpad-notes', 1, {
      upgrade(db) { db.createObjectStore('notes', { keyPath: 'id' }); },
    });
    notes = new Map((await database.getAll('notes')).map((note) => [note.id, note]));
  } catch { storageFailed(); }
  let lastNote = null;
  try { lastNote = window.localStorage.getItem('texpad.lastNote'); } catch { /* Browser storage may be disabled. */ }
  activeId = notes.has(lastNote) ? lastNote : sortedNotes()[0]?.id || null;
  showActive();
  return {
    onTheme(theme) {
      if (vimView) {
        vimView.dispatch({ effects: vimCompartment.reconfigure(vimHighlighting(theme)) });
        cursor?.setColor(theme.colors.cursor);
      }
    },
  };
}
