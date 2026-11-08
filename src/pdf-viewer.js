import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export function createPdfViewer() {
  const element = (id) => document.getElementById(id);
  const root = element('notes-pdf-viewer');
  const scroll = element('notes-pdf-scroll');
  const pageHost = element('notes-pdf-page');
  const previous = element('notes-pdf-previous');
  const next = element('notes-pdf-next');
  const pageInput = element('notes-pdf-page-number');
  const pageCount = element('notes-pdf-page-count');
  const zoomOut = element('notes-pdf-zoom-out');
  const zoomIn = element('notes-pdf-zoom-in');
  const zoomLabel = element('notes-pdf-zoom-label');
  const fit = element('notes-pdf-fit');
  let loadingTask = null;
  let pdf = null;
  let renderTask = null;
  let pageNumber = 1;
  let zoom = 1;
  let generation = 0;
  let renderGeneration = 0;
  let lastWidth = 0;

  function updateControls() {
    const count = pdf?.numPages || 1;
    pageInput.max = String(count);
    pageInput.value = String(pageNumber);
    pageInput.disabled = !pdf;
    pageCount.textContent = `/ ${count}`;
    previous.disabled = !pdf || pageNumber <= 1;
    next.disabled = !pdf || pageNumber >= count;
    zoomOut.disabled = !pdf || zoom <= 0.5;
    zoomIn.disabled = !pdf || zoom >= 2.5;
    fit.disabled = !pdf || zoom === 1;
    zoomLabel.textContent = zoom === 1 ? 'Fit width' : `${Math.round(zoom * 100)}%`;
  }

  function clear() {
    generation += 1;
    renderGeneration += 1;
    renderTask?.cancel();
    renderTask = null;
    loadingTask?.destroy().catch(() => {});
    loadingTask = null;
    pdf = null;
    lastWidth = 0;
    pageNumber = 1;
    zoom = 1;
    pageHost.textContent = 'Compiling PDF…';
    root.hidden = true;
    updateControls();
  }

  async function renderPage() {
    if (!pdf) return;
    renderTask?.cancel();
    const current = ++renderGeneration;
    const page = await pdf.getPage(pageNumber);
    if (current !== renderGeneration) return;
    const natural = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(200, scroll.clientWidth - 32);
    const scale = availableWidth / natural.width * zoom;
    const cssViewport = page.getViewport({ scale });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2, 8192 / Math.max(cssViewport.width, cssViewport.height));
    const viewport = page.getViewport({ scale: scale * pixelRatio });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.style.width = `${cssViewport.width}px`;
    canvas.style.height = `${cssViewport.height}px`;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `PDF page ${pageNumber} of ${pdf.numPages}`);
    const task = page.render({ canvas, viewport });
    renderTask = task;
    try {
      await task.promise;
      if (current !== renderGeneration) return;
      pageHost.replaceChildren(canvas);
      scroll.scrollTop = 0;
      scroll.scrollLeft = 0;
    } catch (error) {
      if (current === renderGeneration) throw error;
    } finally {
      if (renderTask === task) renderTask = null;
    }
  }

  async function load(bytes) {
    clear();
    const current = generation;
    root.hidden = false;
    pageHost.textContent = 'Loading PDF…';
    loadingTask = getDocument({ data: new Uint8Array(bytes) });
    const documentProxy = await loadingTask.promise;
    if (current !== generation) {
      return false;
    }
    pdf = documentProxy;
    lastWidth = scroll.clientWidth;
    updateControls();
    await renderPage();
    return current === generation;
  }

  function changePage(value) {
    if (!pdf) return;
    const requested = Number(value);
    pageNumber = Number.isFinite(requested) ? Math.max(1, Math.min(pdf.numPages, Math.trunc(requested))) : pageNumber;
    updateControls();
    renderPage().catch(() => { pageHost.textContent = 'Could not render this PDF page.'; });
  }

  function changeZoom(value) {
    if (!pdf) return;
    zoom = Math.max(0.5, Math.min(2.5, value));
    updateControls();
    renderPage().catch(() => { pageHost.textContent = 'Could not render this PDF page.'; });
  }

  previous.addEventListener('click', () => changePage(pageNumber - 1));
  next.addEventListener('click', () => changePage(pageNumber + 1));
  pageInput.addEventListener('change', () => changePage(pageInput.value));
  zoomOut.addEventListener('click', () => changeZoom(zoom - 0.25));
  zoomIn.addEventListener('click', () => changeZoom(zoom + 0.25));
  fit.addEventListener('click', () => changeZoom(1));
  new ResizeObserver(() => {
    const width = scroll.clientWidth;
    if (!pdf || Math.abs(width - lastWidth) < 2) return;
    lastWidth = width;
    renderPage().catch(() => { pageHost.textContent = 'Could not render this PDF page.'; });
  }).observe(scroll);
  updateControls();
  return { load, clear };
}
