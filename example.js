/**
 * Example usage of pdf2square library
 *
 * This demonstrates how to use the convert function programmatically
 * to convert PDF pages to base64 encoded images with extracted text.
 */

import { convert } from './lib.js';
import path from 'node:path';

async function exampleUsage() {
  try {
    // Example 1: Basic usage with default options
    console.log('Example 1: Basic usage');
    const basicResults = await convert('./test.pdf');
    console.log(`Converted ${basicResults.length} pages`);

    basicResults.forEach((page) => {
      console.log(`Page ${page.pageNumber}:`);
      console.log(`- Image: ${page.base64EncodedImage.substring(0, 50)}...`);
      console.log(`- Text: ${page.extractedText.substring(0, 100)}...`);
      console.log('---');
    });

    // Example 2: Custom options
    console.log('\nExample 2: Custom options');
    const customResults = await convert('./test.pdf', {
      maxPages: 5,
      size: 512,
      dpi: 300,
      first: 2,
      format: 'jpg',
      bg: '#ffffff',
      concurrency: 2
    });

    console.log(`Converted ${customResults.length} pages with custom options`);

    // Example 3: Processing results
    console.log('\nExample 3: Processing results');
    const results = await convert('./test.pdf', { maxPages: 3 });

    // Save images to files (if needed)
    for (const page of results) {
      // Extract base64 data
      const base64Data = page.base64EncodedImage.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // You could save to file if needed:
      // await fs.writeFile(`page-${page.pageNumber}.png`, buffer);

      console.log(`Page ${page.pageNumber} processed: ${buffer.length} bytes`);
    }

    // Example 4: Text analysis
    console.log('\nExample 4: Text analysis');
    const textResults = await convert('./test.pdf', { maxPages: 1 });

    for (const page of textResults) {
      const wordCount = page.extractedText.split(/\s+/).filter(word => word.length > 0).length;
      console.log(`Page ${page.pageNumber}: ${wordCount} words extracted`);
      console.log(`First 200 characters: ${page.extractedText.substring(0, 200)}`);
    }

  } catch (error) {
    console.error('Error converting PDF:', error.message);

    // Handle specific errors
    if (error.message.includes('pdfinfo')) {
      console.error('Make sure poppler-utils is installed on your system');
    } else if (error.message.includes('Could not determine page count')) {
      console.error('The PDF file may be corrupted or invalid');
    }
  }
}

// Example 5: Using in a web service context
async function webServiceExample(pdfBuffer, options = {}) {
  try {
    // Save buffer to temp file first (in real app, you might use a temp file)
    const tempPath = './temp-pdf.pdf';
    // await fs.writeFile(tempPath, pdfBuffer); // Uncomment if using buffer

    const results = await convert(tempPath, {
      maxPages: 10,
      size: 896,
      format: 'png',
      ...options
    });

    // Return structured response for API
    return {
      success: true,
      totalPages: results.length,
      pages: results.map(page => ({
        pageNumber: page.pageNumber,
        image: page.base64EncodedImage,
        text: page.extractedText,
        textLength: page.extractedText.length
      }))
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
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
        concurrency: 2 // Lower concurrency when processing multiple PDFs
      });

      results.push({
        pdfPath,
        success: true,
        pages: pages.length,
        data: pages
      });

    } catch (error) {
      results.push({
        pdfPath,
        success: false,
        error: error.message
      });
    }
  }

  return results;
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  exampleUsage().catch(console.error);
}

export { exampleUsage, webServiceExample, batchProcessExample };
