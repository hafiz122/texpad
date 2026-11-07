let compilerPromise;
let compileQueue = Promise.resolve();

async function getCompiler() {
  compilerPromise ??= import('@typeward/texlive-wasm').then(({ PdfLatex }) => {
    const base = import.meta.env.BASE_URL;
    return new PdfLatex({
      enginePath: `${base}texlive-wasm/pdflatex/emscripten/pdflatex.wasm`,
      bundleUrl: `${base}texlive-wasm/texmf-core-pdflatex.bin`,
    });
  }).catch((error) => {
    compilerPromise = null;
    throw error;
  });
  return compilerPromise;
}

function errorFromLog(log) {
  const lines = log.split('\n');
  const index = lines.findIndex((line) => line.startsWith('! '));
  const message = index < 0 ? 'LaTeX could not compile this document.' : lines.slice(index, index + 4).join('\n').trim();
  const error = new Error(message);
  error.log = log;
  return error;
}

export function compileLatex(source) {
  const operation = compileQueue.catch(() => {}).then(async () => {
    const compiler = await getCompiler();
    let result;
    try {
      result = await compiler.compile({
        mainTex: 'note.tex',
        files: [{ path: 'note.tex', content: source }],
        timeoutMs: 45000,
      });
    } catch (error) {
      await compiler.dispose().catch(() => {});
      compilerPromise = null;
      throw error;
    }
    const pdf = result.outputs.get('note.pdf');
    if (result.exitCode !== 0 || !pdf) throw errorFromLog(result.log || '');
    return pdf;
  });
  compileQueue = operation.catch(() => {});
  return operation;
}
