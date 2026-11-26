/**
 * Local (no-AI) analysis of text read from the screen by OCR.
 * Fast heuristics decide whether the text contains an interview question, code or an error,
 * and extract the most likely question plus keywords. Only ambiguous text needs the AI.
 */

export type ScreenTextKind = 'question' | 'code' | 'error' | 'other' | 'empty';

export interface ScreenTextAnalysis {
  kind: ScreenTextKind;
  /** Best candidate question, cleaned up. */
  question: string | null;
  /** All question candidates found (best first). */
  questions: string[];
  hasCode: boolean;
  hasError: boolean;
  language: string | null;
  /** The code block, when code was found. */
  code: string | null;
  keywords: string[];
  /** 'high' = safe to act on locally; 'low' = ask the AI to confirm. */
  confidence: 'high' | 'low';
}

const INTERROGATIVE =
  /^(what|why|how|when|where|which|who|whom|whose|is|are|can|could|would|should|do|does|did|will|have|has)\b/i;
const IMPERATIVE =
  /^(explain|describe|define|tell me|walk me through|write|implement|design|create|build|compare|list|give|find|reverse|sort|check|return|given|discuss|differentiate|what's|how's)\b/i;
const QUESTION_PREFIX = /^(q(uestion)?\s*\d*\s*[:.)-]|\d+\s*[.)]|[-•*>]\s*)\s*/i;
/** Speaker or label before a sentence: "Interviewer: …", "Next: …", "Task 2: …". */
const LABEL_PREFIX = /^[A-Za-z][\w .'-]{0,24}:\s+(?=[A-Z])/;

const CODE_LINE: RegExp[] = [
  /[{};]\s*$/,
  /^\s*(function|const|let|var|class|def|public|private|protected|static|return|import|export|from|for|while|if|else|elif|try|catch|async|await|interface|type|enum|package|#include|using|fn|func)\b/,
  /=>|===|!==|\+\+|--|&&|\|\||::|->/,
  /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|FROM|WHERE|JOIN)\b/i,
  /^\s{2,}\S/, // indented
  /\w+\([^)]*\)\s*[{:;]?\s*$/, // call or signature at end of line
];

const ERROR_PATTERNS: RegExp[] = [
  /\b(TypeError|ReferenceError|SyntaxError|RangeError|ValueError|KeyError|IndexError|AttributeError|NullPointerException|IllegalArgumentException|SegmentationFault)\b/,
  /\bTraceback \(most recent call last\)/,
  /\bUncaught\b|\bUnhandled( promise)? rejection\b/i,
  /^\s*at\s+\S+.*:\d+:\d+\)?\s*$/m, // JS stack frame
  /\b(Error|Exception):\s+\S/,
  /\bline \d+, in\b/,
];

const LANGUAGE_HINTS: [string, RegExp][] = [
  ['sql', /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|WITH)\b[\s\S]*\b(FROM|INTO|SET|TABLE|AS)\b/im],
  ['python', /^\s*(def|class)\s+\w+.*:\s*$|^\s*(elif|import \w+$|from \w+ import)|\bself\.|\bprint\(/m],
  ['java', /\b(public|private) (static )?(void|int|String|boolean)\b|System\.out\.print/],
  ['typescript', /\b(interface|type)\s+\w+\s*(=|{)|:\s*(string|number|boolean)\b|<\w+>\(/],
  ['javascript', /\b(const|let|var)\s+\w+\s*=|=>|function\s*\w*\s*\(|console\.log|document\.|require\(/],
  ['go', /\bfunc\s+\w+\(|:=|\bpackage main\b/],
  ['csharp', /\busing System\b|\bConsole\.WriteLine\b|\bnamespace\s+\w+/],
  ['cpp', /#include\s*<|std::|cout\s*<</],
  ['html', /<\/?(div|span|html|body|head|button|input|form|ul|li)\b[^>]*>/i],
  ['css', /^[.#]?[\w-]+\s*\{[\s\S]*?:\s*[^;]+;/m],
];

/** Technology keywords worth surfacing (lowercase match on word boundaries). */
const KEYWORDS = [
  'javascript', 'typescript', 'react', 'redux', 'next.js', 'node.js', 'express', 'mongodb', 'mysql', 'postgresql', 'sql',
  'html', 'css', 'flexbox', 'grid', 'closure', 'closures', 'promise', 'promises', 'async', 'await', 'event loop', 'hooks',
  'usestate', 'useeffect', 'usememo', 'usecallback', 'virtual dom', 'jwt', 'oauth', 'rest', 'api', 'graphql', 'cors',
  'csrf', 'xss', 'index', 'indexes', 'transaction', 'join', 'joins', 'normalization', 'cache', 'caching', 'load balancer',
  'microservices', 'docker', 'kubernetes', 'git', 'rebase', 'merge', 'ci/cd', 'testing', 'recursion', 'array', 'linked list',
  'hash map', 'stack', 'queue', 'tree', 'graph', 'bfs', 'dfs', 'dynamic programming', 'big o', 'complexity', 'sorting',
  'binary search', 'prototype', 'inheritance', 'scope', 'hoisting', 'generics', 'interface', 'middleware', 'streams',
  'debounce', 'throttle', 'memoization', 'ssr', 'ssg', 'websocket', 'authentication', 'authorization', 'python', 'java',
];

/** Common OCR mistakes: fancy quotes, stray pipes, ligatures, broken spacing. */
export function cleanOcrText(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\|\s?/, '').replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * OCR often puts a blank line after most lines of monospaced code (not always every one).
 * When most of the gaps between code lines are blank, they're an artefact — drop them;
 * code with only the occasional blank line keeps its real spacing.
 */
export function tidyOcrCode(code: string): string {
  const lines = code.trim().split('\n');
  const content = lines.filter((l) => l.trim()).length;
  const blank = lines.length - content;
  const gaps = content - 1;
  if (content >= 3 && gaps > 0 && blank / gaps >= 0.6 && !/\n[ \t]*\n[ \t]*\n/.test(code)) {
    return lines.filter((l) => l.trim()).join('\n');
  }
  return code;
}

function isCodeLine(line: string): boolean {
  if (!line.trim()) return false;
  return CODE_LINE.some((re) => re.test(line));
}

function tidyQuestion(q: string): string {
  return q
    .trim()
    .replace(QUESTION_PREFIX, '')
    .replace(LABEL_PREFIX, '')
    .replace(/:\s*$/, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([?.,!])/g, '$1')
    .trim();
}

/**
 * Imperatives ("Implement…") need 4+ words, which filters out UI labels like "Create new file".
 * When code is on screen, a 3-word task ("Find the bug") is accepted too.
 */
function looksLikeQuestion(sentence: string, codeOnScreen: boolean): boolean {
  const s = tidyQuestion(sentence);
  if (s.length < 10 || s.length > 400) return false;
  const words = s.split(' ').length;
  if (words < 3) return false;
  if (s.endsWith('?')) return true;
  return IMPERATIVE.test(s) && words >= (codeOnScreen ? 3 : 4);
}

/**
 * Find question candidates. OCR wraps long questions across lines, so prose lines are
 * joined into paragraphs first and then split into sentences.
 */
function findQuestions(lines: string[], codeOnScreen: boolean): string[] {
  const paragraphs: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) paragraphs.push(buf.join(' '));
    buf = [];
  };
  for (const line of lines) {
    if (!line.trim() || isCodeLine(line)) flush();
    else buf.push(line.trim());
  }
  flush();

  const out: { q: string; score: number }[] = [];
  for (const p of paragraphs) {
    // Split into sentences but keep the terminating punctuation.
    const sentences = p.match(/[^.?!]+[?!.]?/g) ?? [p];
    for (const raw of sentences) {
      const s = tidyQuestion(raw);
      if (!looksLikeQuestion(s, codeOnScreen)) continue;
      let score = 0;
      if (s.split(' ').length < 5) score -= 1; // "Any questions so far?" is rarely the real question
      if (s.endsWith('?')) score += 3;
      if (INTERROGATIVE.test(s)) score += 2;
      if (IMPERATIVE.test(s)) score += 2;
      if (s.length >= 20 && s.length <= 200) score += 1;
      out.push({ q: s, score });
    }
  }
  return out.sort((a, b) => b.score - a.score).map((x) => x.q);
}

function extractKeywords(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const found = KEYWORDS.filter((k) => new RegExp(`[^a-z0-9]${k.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}[^a-z0-9]`).test(lower));
  // Prefer specific terms ("event loop") over generic ones ("api").
  return [...new Set(found)].sort((a, b) => b.length - a.length).slice(0, 8);
}

export function analyzeScreenText(input: string): ScreenTextAnalysis {
  const text = cleanOcrText(input);
  const base = { questions: [] as string[], hasCode: false, hasError: false, language: null, code: null, keywords: [] as string[] };
  if (text.replace(/\W/g, '').length < 8) {
    return { ...base, kind: 'empty', question: null, confidence: 'high' };
  }

  const lines = text.split('\n');
  const nonEmpty = lines.filter((l) => l.trim());
  const codeLines = nonEmpty.filter(isCodeLine);
  const hasCode = codeLines.length >= 3 && codeLines.length / nonEmpty.length >= 0.3;
  const hasError = ERROR_PATTERNS.some((re) => re.test(text));
  const language = hasCode ? (LANGUAGE_HINTS.find(([, re]) => re.test(text))?.[0] ?? null) : null;

  let code: string | null = null;
  if (hasCode) {
    const first = lines.findIndex(isCodeLine);
    const last = lines.length - 1 - [...lines].reverse().findIndex(isCodeLine);
    code = tidyOcrCode(lines.slice(first, last + 1).join('\n').trim());
  }

  const questions = findQuestions(lines, hasCode);
  const question = questions[0] ?? null;
  const keywords = extractKeywords(text);
  const result = { ...base, questions, hasCode, hasError, language, code, keywords };

  if (question) {
    const explicit = question.endsWith('?');
    // One clear question mark, a sensible length and not buried in a wall of text → act locally.
    const confident = explicit && question.length <= 300 && nonEmpty.length <= 40;
    return { ...result, kind: 'question', question, confidence: confident ? 'high' : 'low' };
  }
  if (hasError) return { ...result, kind: 'error', question: null, confidence: 'high' };
  if (hasCode) return { ...result, kind: 'code', question: null, confidence: 'high' };
  // Prose without an obvious question: might still be one (OCR can drop "?").
  return { ...result, kind: 'other', question: null, confidence: 'low' };
}
