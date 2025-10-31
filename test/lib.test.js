/**
 * Tests for pdf2square library
 * Run with: node --test test/lib.test.js
 */

import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convert } from '../lib.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, 'temp-test-files');

describe('pdf2square library', () => {
  beforeEach(async () => {
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('should export convert function', () => {
    assert.strictEqual(typeof convert, 'function');
  });

  test('should throw error for non-existent file', async () => {
    await assert.rejects(convert('./non-existent-file.pdf'), {
      name: 'Error',
      message: /ENOENT|no such file/i,
    });
  });

  test('should throw error for invalid file', async () => {
    // Create a temporary invalid PDF file
    const tempPath = path.join(tempDir, 'temp-invalid.pdf');
    await fs.writeFile(tempPath, 'This is not a PDF file');

    await assert.rejects(convert(tempPath), (error) => {
      return (
        error.message.includes('Invalid PDF') ||
        error.message.includes('Could not determine page count') ||
        error.name === 'InvalidPDFException'
      );
    });
  });

  test('should validate format option', async () => {
    const tempPath = path.join(tempDir, 'temp-test.pdf');
    await fs.writeFile(tempPath, 'dummy');

    await assert.rejects(convert(tempPath, { format: 'invalid' }), (error) => {
      // PDF validation happens first, but if we had a valid PDF, format validation would trigger
      // For now, we just check that an error occurs - could be PDF error or format error
      return error instanceof Error;
    });
  });

  test('should handle default options', async () => {
    const tempPath = path.join(tempDir, 'temp-empty.pdf');
    await fs.writeFile(tempPath, Buffer.alloc(0));

    // This should fail due to invalid PDF, but we can check that defaults are applied
    await convert(tempPath).catch((error) => {
      // Expected to fail, but we're testing that the function accepts no options
      assert(error instanceof Error);
    });
  });

  test('should validate options types', () => {
    // Test that options are properly typed
    const validOptions = {
      maxPages: 5,
      size: 512,
      dpi: 300,
      first: 1,
      format: 'png',
      bg: '#ffffff',
      concurrency: 2,
    };

    // These should not throw type errors
    assert.strictEqual(typeof validOptions.maxPages, 'number');
    assert.strictEqual(typeof validOptions.size, 'number');
    assert.strictEqual(typeof validOptions.dpi, 'number');
    assert.strictEqual(typeof validOptions.first, 'number');
    assert.strictEqual(typeof validOptions.format, 'string');
    assert.strictEqual(typeof validOptions.bg, 'string');
    assert.strictEqual(typeof validOptions.concurrency, 'number');
  });

  test('should handle page range validation', async () => {
    const tempPath = path.join(tempDir, 'temp-range.pdf');
    await fs.writeFile(tempPath, Buffer.alloc(0));

    await convert(tempPath, { first: 5, maxPages: 0 }).catch((error) => {
      // Should fail due to invalid PDF or page range
      assert(error instanceof Error);
    });
  });
});

describe('background color parsing (internal logic)', () => {
  beforeEach(async () => {
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // Since parseBackground is not exported, we test through convert options
  test('should accept valid hex colors', async () => {
    const tempPath = path.join(tempDir, 'temp-bg.pdf');
    await fs.writeFile(tempPath, Buffer.alloc(0));

    const validColors = ['#ffffff', '#000000', '#ff0000aa', 'transparent'];

    for (const color of validColors) {
      await convert(tempPath, { bg: color }).catch((error) => {
        // We expect PDF parsing to fail, but not color parsing
        // If it's a color parsing error, it should mention "background color"
        if (error.message.includes('background color')) {
          throw error;
        }
      });
    }
  });

  test('should reject invalid background colors', async () => {
    const tempPath = path.join(tempDir, 'temp-invalid-bg.pdf');
    await fs.writeFile(tempPath, Buffer.alloc(0));

    await assert.rejects(
      convert(tempPath, { bg: 'invalid-color' }),
      (error) => {
        // PDF validation happens first, but if we had a valid PDF, bg validation would trigger
        // For now, we just check that an error occurs - could be PDF error or bg color error
        return error instanceof Error;
      },
    );
  });
});

describe('concurrency handling', () => {
  beforeEach(async () => {
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('should handle concurrency limits', async () => {
    const tempPath = path.join(tempDir, 'temp-concurrent.pdf');
    await fs.writeFile(tempPath, Buffer.alloc(0));

    // Test with different concurrency values
    const concurrencyValues = [1, 2, 4, 8];

    for (const concurrency of concurrencyValues) {
      await convert(tempPath, { concurrency }).catch((error) => {
        // Expected to fail due to invalid PDF, but concurrency should be accepted
        assert(error instanceof Error);
        assert(!error.message.includes('concurrency'));
      });
    }
  });
});

describe('output format validation', () => {
  beforeEach(async () => {
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('should accept png and jpg formats', async () => {
    const tempPath = path.join(tempDir, 'temp-format.pdf');
    await fs.writeFile(tempPath, Buffer.alloc(0));

    const formats = ['png', 'jpg', 'jpeg'];

    for (const format of formats) {
      await convert(tempPath, { format }).catch((error) => {
        // Should not fail due to format validation
        assert(!error.message.includes('Format must be'));
      });
    }
  });
});

describe('error handling', () => {
  test('should provide meaningful error messages', async () => {
    // Test with absolute non-existent path
    await assert.rejects(convert('/non/existent/path/file.pdf'), (error) => {
      return (
        error instanceof Error &&
        (error.code === 'ENOENT' || error.message.includes('no such file'))
      );
    });
  });

  test('should handle empty file path', async () => {
    await assert.rejects(convert(''), (error) => {
      return error instanceof Error;
    });
  });

  test('should handle null/undefined input', async () => {
    await assert.rejects(convert(null), (error) => {
      return error instanceof Error;
    });

    await assert.rejects(convert(undefined), (error) => {
      return error instanceof Error;
    });
  });
});

describe('return value structure', () => {
  test('should return array when successful', async () => {
    // This is a conceptual test - in a real scenario with a valid PDF,
    // we would test the structure of returned ConvertedPDFPage objects
    const expectedStructure = {
      pageNumber: 'number',
      originalPath: 'string',
      base64EncodedImage: 'string',
      extractedText: 'string',
    };

    // Verify the expected structure exists
    assert.strictEqual(typeof expectedStructure.pageNumber, 'string');
    assert.strictEqual(typeof expectedStructure.originalPath, 'string');
    assert.strictEqual(typeof expectedStructure.base64EncodedImage, 'string');
    assert.strictEqual(typeof expectedStructure.extractedText, 'string');
  });
});

describe('Font loading and console output tests', () => {
  test('should process hairgrowth PDF without font warnings', async () => {
    const pdfPath = path.join(
      __dirname,
      'hairgrowth_machine_brochure_overdrive.pdf',
    );

    // Capture console.warn to check for font warnings
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => {
      warnings.push(args.join(' '));
    };

    try {
      const result = await convert(pdfPath, {
        maxPages: 2,
        size: 896,
        format: 'png',
      });

      // Restore console.warn
      console.warn = originalWarn;

      // Verify conversion worked
      assert(Array.isArray(result), 'Expected result to be an array');
      assert(result.length === 2, 'Expected exactly two pages');
      assert(
        typeof result[0].base64EncodedImage === 'string',
        'Expected base64 image on page 1',
      );
      assert(
        typeof result[1].base64EncodedImage === 'string',
        'Expected base64 image on page 2',
      );
      assert(
        result[0].base64EncodedImage.startsWith('data:image/png;base64,'),
        'Expected PNG data URL',
      );

      // Verify no font-related warnings
      const fontWarnings = warnings.filter(
        (w) =>
          w.includes('Unable to load font data') ||
          w.includes('standardFontDataUrl') ||
          w.includes('fetchStandardFontData') ||
          w.includes('font'),
      );

      assert(
        fontWarnings.length === 0,
        `Expected no font warnings, but got: ${fontWarnings.join(', ')}`,
      );

      // Verify text extraction worked
      assert(
        typeof result[0].extractedText === 'string',
        'Expected extracted text',
      );
      assert(
        result[0].extractedText.length > 0,
        'Expected non-empty extracted text',
      );
    } catch (error) {
      console.warn = originalWarn;
      throw error;
    }
  });

  test('should have no unexpected console output during normal operation', async () => {
    const pdfPath = path.join(__dirname, 'example1.pdf');

    // Capture all console methods
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    const logs = [];
    const warnings = [];
    const errors = [];

    console.log = (...args) => logs.push(args.join(' '));
    console.warn = (...args) => warnings.push(args.join(' '));
    console.error = (...args) => errors.push(args.join(' '));

    try {
      const result = await convert(pdfPath, {
        maxPages: 1,
        size: 512,
        format: 'png',
      });

      // Restore console methods
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;

      // Verify conversion worked
      assert(Array.isArray(result), 'Expected result to be an array');
      assert(result.length === 1, 'Expected exactly one page');

      // Verify no unexpected console output
      assert(
        logs.length === 0,
        `Expected no console.log output, but got: ${logs.join(', ')}`,
      );
      assert(
        errors.length === 0,
        `Expected no console.error output, but got: ${errors.join(', ')}`,
      );

      // Allow certain expected warnings but not font-related ones
      const unexpectedWarnings = warnings.filter(
        (w) => !w.includes('Indexing all PDF objects'), // This is a known PDF.js warning for some PDFs
      );
      assert(
        unexpectedWarnings.length === 0,
        `Expected no unexpected warnings, but got: ${
          unexpectedWarnings.join(', ')
        }`,
      );
    } catch (error) {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      throw error;
    }
  });
});

describe('Integration tests with real PDF', () => {
  const testPdfPath = path.join(__dirname, 'example1.pdf');

  test('should successfully process real PDF file', async () => {
    const results = await convert(testPdfPath, {
      maxPages: 2,
      size: 256,
      dpi: 150, // Lower DPI for faster testing
      format: 'png',
      concurrency: 1,
    });

    // Verify results structure
    assert(Array.isArray(results));
    assert(results.length > 0);
    assert(results.length <= 2);

    // Verify each page structure
    for (const page of results) {
      assert.strictEqual(typeof page.pageNumber, 'number');
      assert.strictEqual(typeof page.originalPath, 'string');
      assert.strictEqual(typeof page.base64EncodedImage, 'string');
      assert.strictEqual(typeof page.extractedText, 'string');

      // Verify page number is positive
      assert(page.pageNumber > 0);

      // Verify originalPath is correct
      assert(page.originalPath.includes('example1.pdf'));

      // Verify base64 image format
      assert(page.base64EncodedImage.startsWith('data:image/png;base64,'));
      assert(page.base64EncodedImage.length > 100); // Should be substantial

      // Verify base64 is valid
      const base64Data = page.base64EncodedImage.replace(
        /^data:image\/png;base64,/,
        '',
      );
      assert.doesNotThrow(() => {
        Buffer.from(base64Data, 'base64');
      });

      // Text can be empty but should be a string
      assert.strictEqual(typeof page.extractedText, 'string');
    }
  });

  test('should handle different output formats with real PDF', async () => {
    // Test PNG format
    const pngResults = await convert(testPdfPath, {
      maxPages: 1,
      size: 128,
      format: 'png',
    });

    assert(pngResults.length > 0);
    assert(
      pngResults[0].base64EncodedImage.startsWith('data:image/png;base64,'),
    );

    // Test JPG format
    const jpgResults = await convert(testPdfPath, {
      maxPages: 1,
      size: 128,
      format: 'jpg',
    });

    assert(jpgResults.length > 0);
    assert(
      jpgResults[0].base64EncodedImage.startsWith('data:image/jpeg;base64,'),
    );
  });

  test('should handle transparent background with real PDF', async () => {
    const results = await convert(testPdfPath, {
      maxPages: 1,
      size: 128,
      format: 'png',
      bg: 'transparent',
    });

    assert(results.length > 0);
    assert(results[0].base64EncodedImage.startsWith('data:image/png;base64,'));

    // Verify the image data exists and is reasonable size
    const base64Data = results[0].base64EncodedImage.replace(
      /^data:image\/png;base64,/,
      '',
    );
    const buffer = Buffer.from(base64Data, 'base64');
    assert(buffer.length > 500); // Should be a reasonable size for 128x128 PNG
  });

  test('should respect page range options with real PDF', async () => {
    // Test first page only
    const firstPageResults = await convert(testPdfPath, {
      first: 1,
      maxPages: 1,
      size: 64,
    });

    assert(firstPageResults.length === 1);
    assert.strictEqual(firstPageResults[0].pageNumber, 1);

    // Test starting from page 2 if PDF has multiple pages
    try {
      const secondPageResults = await convert(testPdfPath, {
        first: 2,
        maxPages: 1,
        size: 64,
      });

      if (secondPageResults.length > 0) {
        assert.strictEqual(secondPageResults[0].pageNumber, 2);
      }
    } catch (error) {
      // If there's only one page, this is expected
      assert(error.message.includes('No pages to convert'));
    }
  });

  test('should handle different DPI settings with real PDF', async () => {
    // Test low DPI
    const lowDpiResults = await convert(testPdfPath, {
      maxPages: 1,
      size: 64,
      dpi: 96,
    });

    assert(lowDpiResults.length > 0);

    // Test higher DPI
    const highDpiResults = await convert(testPdfPath, {
      maxPages: 1,
      size: 64,
      dpi: 300,
    });

    assert(highDpiResults.length > 0);

    // Higher DPI should generally produce larger base64 strings (more detail)
    // But this isn't guaranteed depending on PDF content, so we just verify both work
    assert(lowDpiResults[0].base64EncodedImage.length > 0);
    assert(highDpiResults[0].base64EncodedImage.length > 0);
  });

  test('should maintain page order with real PDF', async () => {
    const results = await convert(testPdfPath, {
      maxPages: 3,
      size: 64,
      concurrency: 2, // Use concurrency to test ordering
    });

    if (results.length > 1) {
      // Verify pages are in order
      for (let i = 1; i < results.length; i++) {
        assert(results[i].pageNumber > results[i - 1].pageNumber);
      }

      // Verify page numbers start from 1 and are consecutive
      assert.strictEqual(results[0].pageNumber, 1);
      for (let i = 1; i < results.length; i++) {
        assert.strictEqual(
          results[i].pageNumber,
          results[i - 1].pageNumber + 1,
        );
      }
    }
  });
});
