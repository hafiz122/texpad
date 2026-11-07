const study = String.raw`\documentclass[11pt,a4paper]{article}
\usepackage{amsmath,amssymb}

\title{Study Notes}
\author{}
\date{\today}

\begin{document}
\maketitle

\section{Topic}
Write your notes here.

\subsection{Key idea}
Explain the idea in your own words.

\begin{equation*}
  \int_0^1 x^2\,dx = \frac{1}{3}
\end{equation*}

\end{document}
`;

const problems = String.raw`\documentclass[11pt,a4paper]{article}
\usepackage{amsmath,amssymb}

\title{Problem Set}
\author{}
\date{\today}

\begin{document}
\maketitle

\section*{Exercise 1}
\textbf{Problem.} Write the question here.

\textbf{Solution.} Show each step.
\begin{align*}
  f(x) &= x^2 \\
  f'(x) &= 2x
\end{align*}

\end{document}
`;

const article = String.raw`\documentclass[11pt,a4paper]{article}
\usepackage{amsmath,amssymb}

\title{Untitled Document}
\author{}
\date{}

\begin{document}
\maketitle

Start writing here.

\end{document}
`;

export const noteTemplates = {
  study: { title: 'Study notes', format: 'latex', body: study },
  problems: { title: 'Problem set', format: 'latex', body: problems },
  article: { title: 'Article', format: 'latex', body: article },
  markdown: { title: 'Untitled note', format: 'markdown', body: '' },
};

export function templateFor(key) {
  return noteTemplates[key] || noteTemplates.study;
}
