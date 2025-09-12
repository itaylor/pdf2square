/**
 * pdf2square Library - Convert PDF pages to base64 encoded square images with extracted text
 *
 * This library provides the core functionality of pdf2square as a programmatic API,
 * returning base64 encoded images and extracted text instead of writing files.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Poppler } from "node-poppler";
import sharp from "sharp";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

/**
 * @typedef {Object} ConvertedPDFPage
 * @property {number} pageNumber - Page number (1-based)
 * @property {string} originalPath - Path to the original PDF file
 * @property {string} base64EncodedImage - Base64 encoded image string
 * @property {string} extractedText - Extracted text from the page
 */

/**
 * @typedef {Object} ConvertOptions
 * @property {number} [maxPages=10] - Maximum pages to convert
 * @property {number} [size=896] - Target square size in pixels
 * @property {number} [dpi=700] - Poppler render DPI (higher = crisper text)
 * @property {number} [first=1] - First page to convert (1-based)
 * @property {string} [format='png'] - Output format: 'png' or 'jpg'
 * @property {string} [bg='#ffffffff'] - Background color (letterbox). Hex #RRGGBB[AA] or 'transparent'
 * @property {number} [concurrency=4] - Max parallel page processes
 */

/**
 * Convert PDF pages to base64 encoded square images with extracted text
 * @param {string} pathToPdf - Path to the input PDF file
 * @param {ConvertOptions} [options={}] - Conversion options
 * @returns {Promise<ConvertedPDFPage[]>} Array of converted pages
 */
export async function convert(pathToPdf, options = {}) {
  // Set defaults
  const opts = {
    maxPages: 10,
    size: 896,
    dpi: 700,
    first: 1,
    format: 'png',
    bg: '#ffffffff',
    concurrency: 4,
    ...options
  };

  // Create temporary directory for intermediate files
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'pdf2square-'));

  try {
    // Resolve PDF path
    const pdfAbs = path.resolve(pathToPdf);

    // Determine total pages via pdfinfo (Poppler)
    const totalPages = await getPdfPages(pdfAbs);
    if (totalPages <= 0) {
      throw new Error("Could not determine page count. Is the PDF valid?");
    }

    const firstPage = Math.max(1, Number(opts.first));
    const lastPage = Math.min(totalPages, firstPage + Number(opts.maxPages) - 1);

    if (lastPage < firstPage) {
      throw new Error("No pages to convert with given first/maxPages options.");
    }

    // Render to PNG (intermediate) via pdftocairo through node-poppler
    const poppler = new Poppler();
    const tempBaseName = 'temp-pdf';

    await poppler.pdfToCairo(pdfAbs, tempDir, {
      pngFile: true,
      singleFile: false,
      firstPageToConvert: firstPage,
      lastPageToConvert: lastPage,
      resolutionXAxis: Number(opts.dpi),
      resolutionYAxis: Number(opts.dpi),
    });

    // Collect rendered intermediate files
    const files = await listPagePngs(tempDir, tempBaseName, firstPage, lastPage);

    // Prepare background + output format
    const size = Number(opts.size);
    const fmt = String(opts.format).toLowerCase();
    if (!["png", "jpg", "jpeg"].includes(fmt)) {
      throw new Error("Format must be 'png' or 'jpg'");
    }
    const bg = parseBackground(opts.bg, fmt);

    // Concurrency limiter
    const limit = pLimit(Number(opts.concurrency) || 4);

    // Process each page: letterbox image and extract text
    const results = await Promise.all(
      files.map(({ name, page }) =>
        limit(async () => {
          const inPath = path.join(tempDir, name);

          // 1) Process image to base64
          const img = sharp(inPath);
          const pipeline = img.resize(size, size, {
            fit: "contain",
            background: bg,
          });

          let buffer;
          if (fmt === "png") {
            buffer = await pipeline.png().toBuffer();
          } else {
            buffer = await pipeline.jpeg({ quality: 95 }).toBuffer();
          }

          const base64EncodedImage = `data:image/${fmt === 'jpg' ? 'jpeg' : fmt};base64,${buffer.toString('base64')}`;

          // 2) Extract text for this page
          const textBuffer = await poppler.pdfToText(pdfAbs, undefined, {
            firstPageToConvert: page,
            lastPageToConvert: page,
          });

          const extractedText = textBuffer.toString('utf8').trim();

          return {
            pageNumber: page,
            originalPath: pdfAbs,
            base64EncodedImage,
            extractedText
          };
        })
      )
    );

    // Sort results by page number
    results.sort((a, b) => a.pageNumber - b.pageNumber);

    return results;

  } finally {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`Warning: Could not clean up temporary directory ${tempDir}:`, err.message);
    }
  }
}

/* ----------------- Helper Functions ----------------- */

async function getPdfPages(pdfPath) {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [pdfPath]);
    const m = stdout.match(/Pages:\s+(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
  } catch {
    throw new Error(
      "Failed to run pdfinfo. Make sure poppler-utils is installed."
    );
  }
}

async function listPagePngs(dir, base, first, last) {
  const entries = await fs.readdir(dir);
  const rx = new RegExp(`^${escapeRegex(base)}-(\\d+)\\.png$`);
  return entries
    .map((name) => {
      const m = name.match(rx);
      return m ? { name, page: Number(m[1]) } : null;
    })
    .filter(Boolean)
    .filter(({ page }) => page >= first && page <= last)
    .sort((a, b) => a.page - b.page);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// bg: "#RRGGBB" | "#RRGGBBAA" | "transparent"
function parseBackground(input, fmt) {
  const s = String(input).trim().toLowerCase();
  if (s === "transparent" || s === "#0000") {
    if (fmt === "png") {
      return { r: 0, g: 0, b: 0, alpha: 0 };
    } else {
      console.warn(
        "⚠️ JPEG cannot be transparent; using white background instead."
      );
      return { r: 255, g: 255, b: 255, alpha: 1 };
    }
  }
  const hex = s.startsWith("#") ? s.slice(1) : s;
  if (![6, 8].includes(hex.length) || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error(
      "Invalid background color. Use '#RRGGBB', '#RRGGBBAA', or 'transparent'."
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
