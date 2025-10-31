# pdf2square

Convert PDF pages to exactly square (NxN) images with letterboxing, plus extract
text from each page. Available as both a CLI tool and a JavaScript library.

## Features

- 📄 Convert PDF pages to square images (letterboxed to maintain aspect ratio)
- 🖼️ Support for PNG and JPEG output formats
- 📝 Extract text from each page
- 🎯 High DPI rendering for crisp text (configurable)
- ⚡ Concurrent processing for better performance
- 🎨 Customizable background colors (including transparency for PNG)
- 📚 Available as both CLI tool and programmatic library
- 🔤 Base64 encoded output for library usage

## Requirements

No system dependencies required - uses PDF.js for PDF processing and Sharp for
image manipulation.

## Installation

```bash
npm install pdf2square
```

Or for global CLI usage:

```bash
npm install -g pdf2square
```

## CLI Usage

### Basic Usage

```bash
# Convert PDF to 896x896 PNG images + text files  
pdf2square input.pdf

# Specify output prefix
pdf2square input.pdf output/page

# Convert with custom options
pdf2square input.pdf --size 512 --dpi 300 --format jpg
```

### CLI Options

| Option                  | Description                                     | Default   |
| ----------------------- | ----------------------------------------------- | --------- |
| `-n, --max-pages <int>` | Maximum pages to convert                        | 10        |
| `-s, --size <int>`      | Target square size in pixels                    | 896       |
| `--dpi <int>`           | Render DPI (higher = crisper text)              | 700       |
| `--first <int>`         | First page to convert (1-based)                 | 1         |
| `--format <fmt>`        | Output format: png or jpg                       | png       |
| `--bg <color>`          | Background color (#RRGGBB[AA] or 'transparent') | #ffffffff |
| `--concurrency <int>`   | Max parallel processes                          | 4         |
| `--keep-intermediate`   | Keep intermediate renders                       | false     |

### CLI Examples

```bash
# Convert first 5 pages to 512x512 JPEG with white background
pdf2square document.pdf --max-pages 5 --size 512 --format jpg --bg "#ffffff"

# Convert pages 3-7 with transparent background (PNG only)
pdf2square document.pdf --first 3 --max-pages 5 --bg transparent

# High DPI conversion for crisp text
pdf2square document.pdf --dpi 1000 --size 1024

# Process with higher concurrency
pdf2square document.pdf --concurrency 8
```

## Library Usage

### Basic Example

```javascript
import { convert } from 'pdf2square';

// Convert a PDF file to square images with extracted text
const results = await convert('./path/to/your/document.pdf');

results.forEach((page) => {
  console.log(`Page ${page.pageNumber}:`);
  console.log(`- Image: ${page.base64EncodedImage.substring(0, 50)}...`);
  console.log(`- Text: ${page.extractedText.substring(0, 100)}...`);
});
```

### API Reference

#### `convert(pathToPdf, options?)`

Converts PDF pages to base64 encoded square images with extracted text.

**Parameters:**

- `pathToPdf` (string): Path to the input PDF file
- `options` (object, optional): Conversion options

**Returns:** `Promise<ConvertedPDFPage[]>`

#### ConvertedPDFPage

```typescript
interface ConvertedPDFPage {
  pageNumber: number; // Page number (1-based)
  originalPath: string; // Path to the original PDF file
  base64EncodedImage: string; // Base64 encoded image with data URL prefix
  extractedText: string; // Extracted text from the page
}
```

#### ConvertOptions

```typescript
interface ConvertOptions {
  maxPages?: number; // Maximum pages to convert (default: 10)
  size?: number; // Target square size in pixels (default: 896)
  dpi?: number; // Render DPI (default: 700)
  first?: number; // First page to convert (default: 1)
  format?: 'png' | 'jpg'; // Output format (default: 'png')
  bg?: string; // Background color (default: '#ffffffff')
  concurrency?: number; // Max parallel processes (default: 4)
}
```

### Library Examples

#### Custom Options

```javascript
import { convert } from 'pdf2square';

const results = await convert('./path/to/document.pdf', {
  maxPages: 5,
  size: 512,
  dpi: 300,
  format: 'jpg',
  bg: '#ffffff',
  concurrency: 2,
});
```

#### Save Images to Files

```javascript
import { convert } from 'pdf2square';
import fs from 'node:fs/promises';

const results = await convert('./path/to/document.pdf');

for (const page of results) {
  // Extract base64 data (remove data URL prefix)
  const base64Data = page.base64EncodedImage.replace(
    /^data:image\/\w+;base64,/,
    '',
  );
  const buffer = Buffer.from(base64Data, 'base64');

  // Save image and text files
  await fs.writeFile(`page-${page.pageNumber}.png`, buffer);
  await fs.writeFile(`page-${page.pageNumber}.txt`, page.extractedText);
}
```

#### Web Service Integration

```javascript
import { convert } from 'pdf2square';

// Express.js route handler example
export async function processPDF(req, res) {
  try {
    // req.file.path comes from multer file upload middleware
    const results = await convert(req.file.path, {
      maxPages: 10,
      size: 896,
      format: 'png',
    });

    res.json({
      success: true,
      totalPages: results.length,
      pages: results.map((page) => ({
        pageNumber: page.pageNumber,
        image: page.base64EncodedImage,
        text: page.extractedText,
        textWordCount: page.extractedText.split(/\s+/).length,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
```

#### Batch Processing

```javascript
import { convert } from 'pdf2square';

async function processBatch(pdfPaths) {
  const results = [];

  for (const pdfPath of pdfPaths) {
    console.log(`Processing ${pdfPath}...`);

    try {
      const pages = await convert(pdfPath, {
        maxPages: 5,
        concurrency: 2, // Lower concurrency when processing multiple files
      });

      results.push({
        pdfPath,
        success: true,
        pageCount: pages.length,
        data: pages,
      });
    } catch (error) {
      console.error(`Failed to process ${pdfPath}:`, error.message);
      results.push({
        pdfPath,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
}

// Example usage:
// const results = await processBatch([
//   './documents/file1.pdf',
//   './documents/file2.pdf',
//   './documents/file3.pdf'
// ]);
```

## Output Format

### CLI Output Files

When using the CLI, files are saved with the following naming convention:

```
input.pdf → input-001.png, input-001.txt
          → input-002.png, input-002.txt
          → ...
```

### Library Output

The library returns base64 encoded images with data URL prefixes:

```javascript
{
  pageNumber: 1,
  originalPath: "/path/to/input.pdf",
  base64EncodedImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  extractedText: "This is the text content from page 1..."
}
```

## Background Colors

Supported background color formats:

- Hex colors: `#RRGGBB` or `#RRGGBBAA`
- Transparent: `transparent` (PNG only)
- Examples: `#ffffff`, `#ff0000aa`, `transparent`

Note: JPEG format cannot be transparent and will fallback to white background.

## Performance Tips

1. **Concurrency**: Adjust `--concurrency` based on your CPU cores and available
   memory
2. **DPI**: Higher DPI produces better text quality but increases processing
   time and memory usage
3. **Format**: JPEG is faster and produces smaller files than PNG but doesn't
   support transparency
4. **Page Range**: Use `--first` and `--max-pages` to process only the pages you
   need
5. **Memory**: Large PDFs with high DPI settings may require significant memory

## Error Handling

Common errors and solutions:

- **"Could not determine page count"**: PDF may be corrupted,
  password-protected, or invalid
- **"No pages to convert"**: Check `--first` and `--max-pages` parameters
- **"Invalid PDF structure"**: The file is not a valid PDF document
- **"Format must be 'png' or 'jpg'"**: Use a supported output format
- **"Invalid background color"**: Use hex format (#RRGGBB or #RRGGBBAA) or
  'transparent'
- **Memory errors**: Reduce DPI, page count, or concurrency settings

## TypeScript Support

The library includes TypeScript declarations for better development experience:

```typescript
import { convert, ConvertedPDFPage, ConvertOptions } from 'pdf2square';

const options: ConvertOptions = {
  maxPages: 5,
  size: 512,
  format: 'png',
  dpi: 300,
  bg: '#ffffff',
};

const results: ConvertedPDFPage[] = await convert(
  './path/to/document.pdf',
  options,
);

// Process results with full type safety
results.forEach((page: ConvertedPDFPage) => {
  console.log(
    `Page ${page.pageNumber}: ${page.extractedText.length} characters`,
  );
});
```

## License

MIT License - see LICENSE file for details.
