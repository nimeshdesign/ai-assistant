/**
 * Self-host the OCR engine: copy the Tesseract worker, the LSTM WebAssembly builds and
 * the English language data into public/ocr/. Without this, tesseract.js downloads them
 * from a public CDN at runtime — we don't want a third-party dependency (or any network
 * request) in the screen-reading path. Runs automatically before `dev` and `build`.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'ocr');

const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));
const tesseract = pkgDir('tesseract.js');
const core = pkgDir('tesseract.js-core');
const eng = pkgDir('@tesseract.js-data/eng');

const files = [
  [join(tesseract, 'dist', 'worker.min.js'), join(out, 'worker.min.js')],
  // LSTM-only engine builds (plain, SIMD, relaxed-SIMD); tesseract.js picks one at runtime.
  ...['tesseract-core-lstm', 'tesseract-core-simd-lstm', 'tesseract-core-relaxedsimd-lstm'].flatMap((n) => [
    [join(core, `${n}.wasm.js`), join(out, 'core', `${n}.wasm.js`)],
    [join(core, `${n}.wasm`), join(out, 'core', `${n}.wasm`)],
  ]),
  // "best_int": the accurate LSTM model, integer-quantised for speed.
  [join(eng, '4.0.0_best_int', 'eng.traineddata.gz'), join(out, 'lang', 'eng.traineddata.gz')],
];

let copied = 0;
for (const [from, to] of files) {
  if (!existsSync(from)) throw new Error(`OCR asset missing: ${from}`);
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  copied++;
}
console.log(`OCR assets ready in public/ocr (${copied} copied, ${files.length - copied} up to date)`);
