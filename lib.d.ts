/**
 * TypeScript declarations for pdf2square library
 *
 * Automatically configures PDF.js standard fonts to eliminate font warnings.
 */

export interface ConvertedPDFPage {
  /** Page number (1-based) */
  pageNumber: number;
  /** Path to the original PDF file */
  originalPath: string;
  /** Base64 encoded image string with data URL prefix */
  base64EncodedImage: string;
  /** Extracted text from the page */
  extractedText: string;
}

export interface ConvertOptions {
  /** Maximum pages to convert (default: 10) */
  maxPages?: number;
  /** Target square size in pixels (default: 896) */
  size?: number;
  /** Render DPI (converted to PDF.js scale via dpi/96; higher = crisper text; default: 700) */
  dpi?: number;
  /** First page to convert (1-based, default: 1) */
  first?: number;
  /** Output format: 'png' or 'jpg' (default: 'png') */
  format?: 'png' | 'jpg' | 'jpeg';
  /** Background color (letterbox). Hex #RRGGBB[AA] or 'transparent' (default: '#ffffffff') */
  bg?: string;
  /** Max parallel page processes (default: 4) */
  concurrency?: number;
}

/**
 * Convert PDF pages to base64 encoded square images with extracted text
 * @param pathToPdf Path to the input PDF file
 * @param options Conversion options
 * @returns Promise that resolves to array of converted pages
 */
export declare function convert(
  pathToPdf: string,
  options?: ConvertOptions,
): Promise<ConvertedPDFPage[]>;
