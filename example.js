/**
 * Example usage of pdf2square library
 *
 * This demonstrates how to use the convert function programmatically
 * to convert PDF pages to base64 encoded images with extracted text.
 */

import { convert } from './lib.js';
import path from 'node:path';

async function exampleUsage() {
  console.log('pdf2square Examples');
  console.log('===================\n');

  // Check if a PDF file was provided as command line argument
  const pdfFile = process.argv[2];

  if (!pdfFile) {
    console.log('Usage: node example.js <path-to-pdf-file>');
    console.log('\nExample: node example.js ./my-document.pdf');
    console.log(
      '\nThis will demonstrate various ways to use the pdf2square library.',
    );
    return;
  }

  try {
    // Example 1: Basic usage with default options
    console.log('Example 1: Basic usage with default options');
    console.log('-------------------------------------------');
    const basicResults = await convert(pdfFile);
    console.log(`✓ Converted ${basicResults.length} pages from: ${pdfFile}`);

    if (basicResults.length > 0) {
      const firstPage = basicResults[0];
      console.log(`  - First page: ${firstPage.pageNumber}`);
      console.log(
        `  - Image size: ~${
          Math.round(firstPage.base64EncodedImage.length / 1024)
        } KB (base64)`,
      );
      console.log(
        `  - Text length: ${firstPage.extractedText.length} characters`,
      );
      console.log(
        `  - Sample text: "${firstPage.extractedText.substring(0, 80)}..."`,
      );
    }

    // Example 2: Custom options
    console.log('\nExample 2: Custom options (smaller size, JPEG format)');
    console.log('----------------------------------------------------');
    const customResults = await convert(pdfFile, {
      maxPages: 3,
      size: 512,
      dpi: 300,
      first: 1,
      format: 'jpg',
      bg: '#ffffff',
      concurrency: 2,
    });

    console.log(
      `✓ Converted ${customResults.length} pages with custom options`,
    );
    console.log(`  - Format: JPEG, Size: 512x512px, DPI: 300`);

    // Example 3: Processing and analyzing results
    console.log('\nExample 3: Text analysis');
    console.log('------------------------');
    const analysisResults = await convert(pdfFile, { maxPages: 2 });

    for (const page of analysisResults) {
      const words = page.extractedText
        .split(/\s+/)
        .filter((word) => word.length > 0);
      const wordCount = words.length;
      const avgWordLength = words.length > 0
        ? (words.join('').length / words.length).toFixed(1)
        : 0;

      console.log(`  Page ${page.pageNumber}:`);
      console.log(`    - Words: ${wordCount}`);
      console.log(`    - Characters: ${page.extractedText.length}`);
      console.log(`    - Average word length: ${avgWordLength} chars`);
      console.log(
        `    - Image data size: ~${
          Math.round(page.base64EncodedImage.length / 1024)
        } KB`,
      );
    }

    // Example 4: High quality output with transparent background
    console.log('\nExample 4: High quality with transparent background');
    console.log('--------------------------------------------------');
    const highQualityResults = await convert(pdfFile, {
      maxPages: 1,
      size: 1024,
      dpi: 600,
      format: 'png',
      bg: 'transparent',
    });

    if (highQualityResults.length > 0) {
      console.log(`✓ Generated high-quality image: 1024x1024px @ 600 DPI`);
      console.log(`  - Transparent background (PNG format)`);
      console.log(
        `  - Image size: ~${
          Math.round(highQualityResults[0].base64EncodedImage.length / 1024)
        } KB`,
      );
    }
  } catch (error) {
    console.error('\n❌ Error converting PDF:', error.message);

    // Handle specific errors with helpful suggestions
    if (error.code === 'ENOENT') {
      console.error(
        '💡 The PDF file was not found. Please check the file path.',
      );
    } else if (error.message.includes('Could not determine page count')) {
      console.error(
        '💡 The PDF file may be corrupted, password-protected, or invalid.',
      );
    } else if (error.message.includes('Invalid PDF')) {
      console.error('💡 The file does not appear to be a valid PDF document.');
    } else if (error.message.includes('Format must be')) {
      console.error('💡 Use "png" or "jpg" for the format option.');
    } else if (error.message.includes('Invalid background color')) {
      console.error(
        '💡 Use hex colors (#RRGGBB or #RRGGBBAA) or "transparent".',
      );
    } else {
      console.error('💡 Check that the PDF file is valid and accessible.');
    }
  }
}

// Example 5: Using in a web service context (Express.js example)
async function webServiceExample(filePath, options = {}) {
  try {
    const results = await convert(filePath, {
      maxPages: 10,
      size: 896,
      format: 'png',
      concurrency: 2, // Lower concurrency for server environments
      ...options,
    });

    // Return structured response for API
    return {
      success: true,
      metadata: {
        originalFile: path.basename(filePath),
        totalPages: results.length,
        processedAt: new Date().toISOString(),
        options: { maxPages: 10, size: 896, format: 'png', ...options },
      },
      pages: results.map((page) => ({
        pageNumber: page.pageNumber,
        image: page.base64EncodedImage,
        text: page.extractedText,
        stats: {
          textLength: page.extractedText.length,
          wordCount: page.extractedText.split(/\s+/).filter((w) => w.length > 0)
            .length,
          imageSize: Math.round(page.base64EncodedImage.length / 1024),
        },
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: error.message,
        type: error.name || 'UnknownError',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// Example 6: Batch processing multiple PDFs
async function batchProcessExample(pdfPaths) {
  const results = [];

  for (const pdfPath of pdfPaths) {
    try {
      console.log(`Processing ${pdfPath}...`);
      const pages = await convert(pdfPath, {
        maxPages: 5,
        concurrency: 2, // Lower concurrency when processing multiple PDFs
      });

      results.push({
        pdfPath,
        success: true,
        pages: pages.length,
        data: pages,
      });
    } catch (error) {
      results.push({
        pdfPath,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  exampleUsage().catch((error) => {
    console.error('\n❌ Unhandled error:', error.message);
    process.exit(1);
  });
}

export { batchProcessExample, exampleUsage, webServiceExample };
