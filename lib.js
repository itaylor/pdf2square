/**
 * pdf2square Library - Convert PDF pages to base64 encoded square images with extracted text
 * Backend: PDF.js (pdfjs-dist) + node-canvas (+ sharp for letterboxing)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createCanvas } from 'canvas';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
// PDF.js (legacy build recommended for Node)
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// Use bundled standard fonts to eliminate warnings
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const standardFontsPath = path.join(__dirname, 'standard_fonts');
// Point workerSrc at the installed worker bundle
// pdfjs.GlobalWorkerOptions.workerSrc = require.resolve(
//   "pdfjs-dist/legacy/build/pdf.worker.mjs",
// );

/**
 * @typedef {Object} ConvertedPDFPage
 * @property {number} pageNumber - Page number (1-based)
 * @property {string} originalPath - Path to the original PDF file
 * @property {string} base64EncodedImage - Base64 encoded image string (data URI)
 * @property {string} extractedText - Extracted text from the page
 */

/**
 * @typedef {Object} ConvertOptions
 * @property {number} [maxPages=10] - Maximum pages to convert
 * @property {number} [size=896] - Target square size in pixels
 * @property {number} [dpi=700] - Render DPI (converted to PDF.js scale via dpi/96)
 * @property {number} [first=1] - First page to convert (1-based)
 * @property {string} [format='png'] - Output format: 'png' or 'jpg'
 * @property {string} [bg='#ffffffff'] - Background color (letterbox). Hex #RRGGBB[AA] or 'transparent'
 * @property {number} [concurrency=4] - Max parallel page processes
 * @property {string} [standardFontDataUrl] - URL to standard fonts directory (auto-detected if not provided)
 */

/**
 * Convert PDF pages to base64 encoded square images with extracted text
 * @param {string} pathToPdf - Path to the input PDF file
 * @param {ConvertOptions} [options={}] - Conversion options
 * @returns {Promise<ConvertedPDFPage[]>} Array of converted pages
 */
export async function convert(pathToPdf, options = {}) {
  // Defaults
  const opts = {
    maxPages: 10,
    size: 896,
    dpi: 700, // high for crisp downsampling
    first: 1,
    format: 'png',
    bg: '#ffffffff',
    concurrency: 4,
    ...options,
  };

  // Resolve & load PDF
  const pdfAbs = path.resolve(pathToPdf);
  const data = await fs.readFile(pdfAbs);
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    // Node-friendly flags
    useWorkerFetch: false,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
    // Configure standard fonts path to eliminate warnings
    standardFontDataUrl: `file://${standardFontsPath}/`,
  });
  const pdf = await loadingTask.promise;

  const totalPages = pdf.numPages || 0;
  if (totalPages <= 0) {
    throw new Error('Could not determine page count. Is the PDF valid?');
  }

  const firstPage = Math.max(1, Number(opts.first));
  const lastPage = Math.min(totalPages, firstPage + Number(opts.maxPages) - 1);
  if (lastPage < firstPage) {
    throw new Error('No pages to convert with given first/maxPages options.');
  }

  const fmt = String(opts.format).toLowerCase();
  if (!['png', 'jpg', 'jpeg'].includes(fmt)) {
    throw new Error("Format must be 'png' or 'jpg'");
  }
  const bg = parseBackground(opts.bg, fmt);

  // Convert DPI to PDF.js scale (1.0 == 96 DPI)
  const scale = Number(opts.dpi) / 96;

  const limit = pLimit(Number(opts.concurrency) || 4);
  const jobs = [];
  for (let pageNum = firstPage; pageNum <= lastPage; pageNum++) {
    jobs.push(
      limit(async () => {
        const page = await pdf.getPage(pageNum);

        const canvasFactory = pdf.canvasFactory;
        const viewport = page.getViewport({ scale });
        const canvasAndContext = canvasFactory.create(
          viewport.width,
          viewport.height,
        );
        const renderContext = {
          canvasContext: canvasAndContext.context,
          viewport,
        };

        const renderTask = page.render(renderContext);
        await renderTask.promise;
        // Convert the canvas to an image buffer.
        const renderedPngBuffer = canvasAndContext.canvas.toBuffer('image/png');

        // Letterbox to square NxN using sharp (preserve transparency if PNG + bg transparent)
        const size = Number(opts.size);
        let finalBuffer;
        if (fmt === 'png') {
          finalBuffer = await sharp(renderedPngBuffer)
            .resize(size, size, { fit: 'contain', background: bg })
            .png()
            .toBuffer();
        } else {
          finalBuffer = await sharp(renderedPngBuffer)
            .resize(size, size, { fit: 'contain', background: bg })
            .jpeg({ quality: 95 })
            .toBuffer();
        }

        // Extract text via PDF.js
        const tc = await page.getTextContent();
        const extractedText = (tc.items || [])
          .map((it) => ('str' in it ? it.str : ''))
          .join('\n')
          .trim();

        const base64EncodedImage = `data:image/${
          fmt === 'jpg' ? 'jpeg' : fmt
        };base64,${finalBuffer.toString('base64')}`;

        return {
          pageNumber: pageNum,
          originalPath: pdfAbs,
          base64EncodedImage,
          extractedText,
        };
      }),
    );
  }

  const results = await Promise.all(jobs);
  results.sort((a, b) => a.pageNumber - b.pageNumber);
  return results;
}

/* ----------------- Helper Functions ----------------- */

// bg: "#RRGGBB" | "#RRGGBBAA" | "transparent"
function parseBackground(input, fmt) {
  const s = String(input).trim().toLowerCase();
  if (s === 'transparent' || s === '#0000') {
    if (fmt === 'png') {
      return { r: 0, g: 0, b: 0, alpha: 0 };
    } else {
      console.warn(
        '⚠️ JPEG cannot be transparent; using white background instead.',
      );
      return { r: 255, g: 255, b: 255, alpha: 1 };
    }
  }
  const hex = s.startsWith('#') ? s.slice(1) : s;
  if (![6, 8].includes(hex.length) || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error(
      "Invalid background color. Use '#RRGGBB', '#RRGGBBAA', or 'transparent'.",
    );
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, alpha: a };
}

// Minimal concurrency limiter
function pLimit(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}
