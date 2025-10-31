#!/usr/bin/env node
/**
 * pdf2square - Convert PDF pages to exact NxN images with letterboxing,
 * and emit per-page text files with matching names.
 *
 * Default behaviors:
 *  - outPrefix is optional: if omitted, uses the PDF's basename in the same folder.
 *  - Up to 10 pages, 896x896 PNG, high DPI (700) render for crisp text.
 *
 * No system dependencies required - uses PDF.js for PDF processing.
 *
 * Examples:
 *   pdf2square input.pdf             # writes input-001.png/.txt, input-002.png/.txt, ...
 *   pdf2square input.pdf out/page    # explicit prefix
 *   pdf2square input.pdf --dpi 800 --bg transparent
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { convert } from './lib.js';

// Helper function for parsing integers
function parseIntSafe(value) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number: ${value}`);
  }
  return parsed;
}

const program = new Command()
  .name('pdf2square')
  .description(
    'Convert PDF pages to exactly NxN images (letterboxed) + per-page text using PDF.js + Sharp',
  )
  .argument('<inputPdf>', 'Input PDF file')
  .argument(
    '[outPrefix]',
    'Output path/prefix (default: <pdf_basename> next to input)',
  )
  .option(
    '-n, --max-pages <int>',
    'Maximum pages to convert (default 10)',
    parseIntSafe,
    10,
  )
  .option(
    '-s, --size <int>',
    'Target square size in pixels (default 896)',
    parseIntSafe,
    896,
  )
  .option(
    '--dpi <int>',
    'Render DPI (higher = crisper text; default 700)',
    parseIntSafe,
    700,
  )
  .option('--first <int>', 'First page to convert (1-based)', parseIntSafe, 1)
  .option('--format <fmt>', 'Output format: png|jpg (default png)', 'png')
  .option(
    '--bg <hex|transparent>',
    "Background color (letterbox). Hex #RRGGBB[AA] or 'transparent'",
    '#ffffffff',
  )
  .option(
    '--concurrency <int>',
    'Max parallel page processes (default 4)',
    parseIntSafe,
    4,
  )
  .option('--keep-intermediate', 'Keep intermediate renders', false)
  .showHelpAfterError()
  .parse(process.argv);

const opts = program.opts();
const [inputPdf, outPrefixArg] = program.args;

(async () => {
  try {
    // Resolve default outPrefix if omitted: <dir_of_pdf>/<basename_without_ext>
    const pdfAbs = path.resolve(inputPdf);
    const pdfDir = path.dirname(pdfAbs);
    const pdfBase = path.parse(pdfAbs).name;

    const outPrefix = outPrefixArg
      ? path.resolve(outPrefixArg)
      : path.join(pdfDir, pdfBase);

    // Ensure folder exists
    const outDir = path.dirname(outPrefix);
    await fs.mkdir(outDir, { recursive: true });

    // Use the library to convert PDF to base64 images and text
    const results = await convert(pdfAbs, {
      maxPages: opts.maxPages,
      size: opts.size,
      dpi: opts.dpi,
      first: opts.first,
      format: opts.format,
      bg: opts.bg,
      concurrency: opts.concurrency,
    });

    if (results.length === 0) {
      throw new Error('No pages were converted.');
    }

    // Write results to files (maintaining same naming convention)
    const base = path.basename(outPrefix);
    const fmt = String(opts.format).toLowerCase();

    await Promise.all(
      results.map(async (result) => {
        const pageSuffix = String(result.pageNumber).padStart(3, '0');
        const imgOut = path.join(
          outDir,
          `${base}-${pageSuffix}.${fmt === 'jpg' ? 'jpg' : fmt}`,
        );
        const txtOut = path.join(outDir, `${base}-${pageSuffix}.txt`);

        // Extract base64 data and write image file
        const base64Match = result.base64EncodedImage.match(
          /^data:image\/[^;]+;base64,(.+)$/,
        );
        if (base64Match) {
          const imageBuffer = Buffer.from(base64Match[1], 'base64');
          await fs.writeFile(imgOut, imageBuffer);
        }

        // Write text file
        await fs.writeFile(txtOut, result.extractedText);
      }),
    );

    const firstPage = results[0].pageNumber;
    const lastPage = results[results.length - 1].pageNumber;
    console.log(`✅ Done. Wrote pages ${firstPage}-${lastPage} → ${outDir}`);
  } catch (err) {
    console.error('❌', err.message || err, err.stack || '');
    process.exit(1);
  }
})();

/* ----------------- helpers (now provided by lib.js) ----------------- */
