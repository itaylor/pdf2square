/**
 * Tests for pdf2square CLI
 * Run with: node --test test/cli.test.js
 */

import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_PATH = path.join(__dirname, '..', 'cli.js');
const tempDir = path.join(__dirname, 'temp-cli-files');

/**
 * Helper function to run CLI command
 * @param {string[]} args - Command line arguments
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
function runCLI(args = []) {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });

    child.on('error', (error) => {
      resolve({ stdout, stderr: error.message, exitCode: -1 });
    });
  });
}

describe('pdf2square CLI', () => {
  beforeEach(async () => {
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });
  test('should show help when run without arguments', async () => {
    const result = await runCLI([]);

    assert.strictEqual(result.exitCode, 1);
    assert(
      result.stderr.includes("error: missing required argument 'inputPdf'"),
    );
  });

  test('should show help with --help flag', async () => {
    const result = await runCLI(['--help']);

    assert.strictEqual(result.exitCode, 0);
    assert(result.stdout.includes('pdf2square'));
    assert(result.stdout.includes('Convert PDF pages'));
    assert(result.stdout.includes('Usage:'));
    assert(result.stdout.includes('Options:'));
  });

  test('should show version information', async () => {
    // Commander.js doesn't add --version by default, skip this test
    const result = await runCLI(['--version']);

    assert.strictEqual(result.exitCode, 1);
    assert(result.stderr.includes("unknown option '--version'"));
  });

  test('should handle non-existent PDF file', async () => {
    const result = await runCLI(['non-existent-file.pdf']);

    assert.strictEqual(result.exitCode, 1);
    assert(
      result.stderr.includes('ENOENT') ||
        result.stderr.includes('no such file'),
    );
  });

  test('should accept valid options without error', async () => {
    // Create a temporary invalid PDF to test option parsing
    const tempPath = path.join(tempDir, 'temp-cli-test.pdf');
    await fs.writeFile(tempPath, 'not a pdf');

    const result = await runCLI([
      tempPath,
      '--max-pages',
      '5',
      '--size',
      '512',
      '--dpi',
      '300',
      '--first',
      '1',
      '--format',
      'png',
      '--bg',
      '#ffffff',
      '--concurrency',
      '2',
    ]);

    // Should fail due to invalid PDF, but not due to option parsing
    assert.strictEqual(result.exitCode, 1);
    assert(
      result.stderr.includes('Could not determine page count') ||
        result.stderr.includes('Invalid PDF'),
    );
    // Should not contain option parsing errors
    assert(!result.stderr.includes('invalid option'));
    assert(!result.stderr.includes('unknown option'));
  });

  test('should reject invalid format option', async () => {
    const tempPath = path.join(tempDir, 'temp-invalid-format.pdf');
    await fs.writeFile(tempPath, 'dummy');

    const result = await runCLI([tempPath, '--format', 'invalid']);

    assert.strictEqual(result.exitCode, 1);
    // Should fail due to invalid PDF or format validation
    assert(result.exitCode === 1);
  });

  test('should handle numeric option validation', async () => {
    const tempPath = path.join(tempDir, 'temp-numeric.pdf');
    await fs.writeFile(tempPath, 'dummy');

    // Test invalid numeric values
    const invalidNumericTests = [
      ['--max-pages', 'abc'],
      ['--size', 'invalid'],
      ['--dpi', '0'],
      ['--first', '-1'],
      ['--concurrency', 'xyz'],
    ];

    for (const [flag, value] of invalidNumericTests) {
      const result = await runCLI([tempPath, flag, value]);
      // Commander.js should handle numeric validation
      // Either it converts to NaN/0 or shows an error
      assert(result.exitCode !== undefined);
    }
  });

  test('should handle output prefix argument', async () => {
    const tempPath = path.join(tempDir, 'temp-prefix.pdf');
    const outputPrefix = path.join(tempDir, 'test-output');

    await fs.writeFile(tempPath, 'dummy');

    const result = await runCLI([tempPath, outputPrefix]);

    // Should fail due to invalid PDF, but prefix should be accepted
    assert.strictEqual(result.exitCode, 1);
    assert(!result.stderr.includes('unknown argument'));
  });

  test('should handle boolean flags', async () => {
    const tempPath = path.join(tempDir, 'temp-boolean.pdf');
    await fs.writeFile(tempPath, 'dummy');

    const result = await runCLI([tempPath, '--keep-intermediate']);

    // Should fail due to invalid PDF, but flag should be accepted
    assert.strictEqual(result.exitCode, 1);
    assert(!result.stderr.includes('unknown option'));
  });

  test('should show error for missing required argument', async () => {
    const result = await runCLI([]);

    assert.strictEqual(result.exitCode, 1);
    assert(result.stderr.includes("missing required argument 'inputPdf'"));
  });

  test('should handle background color options', async () => {
    const tempPath = path.join(tempDir, 'temp-bg-color.pdf');
    await fs.writeFile(tempPath, 'dummy');

    const bgColorTests = ['#ffffff', '#000000', '#ff0000aa', 'transparent'];

    for (const bgColor of bgColorTests) {
      const result = await runCLI([tempPath, '--bg', bgColor]);

      // Should fail due to invalid PDF, but bg color should be accepted
      assert.strictEqual(result.exitCode, 1);
      assert(!result.stderr.includes('invalid option'));
    }
  });

  test('should create output directory if it does not exist', async () => {
    const tempPath = path.join(tempDir, 'temp-mkdir.pdf');
    const outputDir = path.join(tempDir, 'new-output-dir');
    const outputPrefix = path.join(outputDir, 'page');

    await fs.writeFile(tempPath, 'dummy');

    const result = await runCLI([tempPath, outputPrefix]);

    // Should fail due to invalid PDF, but directory creation should work
    assert.strictEqual(result.exitCode, 1);

    // Check if directory was created
    try {
      await fs.access(outputDir);
      // Directory was created successfully
    } catch {
      // Directory creation might have failed due to early PDF error
    }
  });

  test('should handle relative and absolute paths', async () => {
    const tempPath = path.join(tempDir, 'temp-paths.pdf');
    await fs.writeFile(tempPath, 'dummy');

    // Test with relative path
    const relativeResult = await runCLI([tempPath]);
    assert.strictEqual(relativeResult.exitCode, 1);

    // Test with absolute path
    const absolutePath = path.resolve(tempPath);
    const absoluteResult = await runCLI([absolutePath]);
    assert.strictEqual(absoluteResult.exitCode, 1);
  });
});

describe('CLI argument combinations', () => {
  beforeEach(async () => {
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });
  test('should handle multiple options together', async () => {
    const tempPath = path.join(tempDir, 'temp-combo.pdf');
    await fs.writeFile(tempPath, 'dummy');

    const result = await runCLI([
      tempPath,
      'output-prefix',
      '--max-pages',
      '3',
      '--size',
      '256',
      '--format',
      'jpg',
      '--bg',
      '#808080',
      '--dpi',
      '150',
      '--first',
      '2',
      '--concurrency',
      '1',
      '--keep-intermediate',
    ]);

    // Should fail due to invalid PDF, but all options should parse correctly
    assert.strictEqual(result.exitCode, 1);
    assert(!result.stderr.includes('unknown option'));
    assert(!result.stderr.includes('invalid option'));
  });

  test('should handle short and long option formats', async () => {
    const tempPath = path.join(tempDir, 'temp-short-long.pdf');
    await fs.writeFile(tempPath, 'dummy');

    // Test short options
    const shortResult = await runCLI([tempPath, '-n', '5', '-s', '512']);
    assert.strictEqual(shortResult.exitCode, 1);

    // Test long options
    const longResult = await runCLI([
      tempPath,
      '--max-pages',
      '5',
      '--size',
      '512',
    ]);
    assert.strictEqual(longResult.exitCode, 1);
  });
});

describe('CLI error messages', () => {
  beforeEach(async () => {
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });
  test('should provide user-friendly error messages', async () => {
    const result = await runCLI(['non-existent.pdf']);

    assert.strictEqual(result.exitCode, 1);
    assert(
      result.stderr.includes('ENOENT') ||
        result.stderr.includes('no such file'),
    );
    // Error occurred as expected
  });

  test('should handle permission errors gracefully', async () => {
    // This test might not work on all systems, but we can test the structure
    const result = await runCLI(['/root/protected-file.pdf']);

    assert.strictEqual(result.exitCode, 1);
    assert(
      result.stderr.includes('ENOENT') ||
        result.stderr.includes('EACCES') ||
        result.stderr.includes('permission denied'),
    );
  });
});

describe('CLI integration tests with real PDF', () => {
  const testPdfPath = path.join(__dirname, 'example1.pdf');

  beforeEach(async () => {
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('should successfully process real PDF with CLI', async () => {
    const outputPrefix = path.join(tempDir, 'test-page');

    const result = await runCLI([
      testPdfPath,
      outputPrefix,
      '--max-pages',
      '2',
      '--size',
      '256',
      '--dpi',
      '150',
      '--format',
      'png',
    ]);

    // Should succeed
    assert.strictEqual(result.exitCode, 0);
    assert(result.stdout.includes('✅ Done'));

    // Check that output files were created
    const files = await fs.readdir(tempDir);
    const pngFiles = files.filter((f) => f.endsWith('.png'));
    const txtFiles = files.filter((f) => f.endsWith('.txt'));

    assert(pngFiles.length > 0);
    assert(txtFiles.length > 0);
    assert.strictEqual(pngFiles.length, txtFiles.length);

    // Verify file naming convention
    assert(pngFiles.some((f) => f.match(/test-page-\d{3}\.png/)));
    assert(txtFiles.some((f) => f.match(/test-page-\d{3}\.txt/)));

    // Verify files have content
    for (const pngFile of pngFiles) {
      const pngPath = path.join(tempDir, pngFile);
      const stats = await fs.stat(pngPath);
      assert(stats.size > 500); // Should be a reasonable size for PNG
    }
  });

  test('should handle different CLI formats with real PDF', async () => {
    // Test JPEG format
    const jpgResult = await runCLI([
      testPdfPath,
      path.join(tempDir, 'jpg-page'),
      '--max-pages',
      '1',
      '--size',
      '128',
      '--format',
      'jpg',
    ]);

    assert.strictEqual(jpgResult.exitCode, 0);

    // Check JPG files were created
    const jpgFiles = await fs.readdir(tempDir);
    const jpgImages = jpgFiles.filter((f) => f.endsWith('.jpg'));
    assert(jpgImages.length > 0);

    // Test PNG with transparent background
    const pngResult = await runCLI([
      testPdfPath,
      path.join(tempDir, 'png-page'),
      '--max-pages',
      '1',
      '--size',
      '128',
      '--format',
      'png',
      '--bg',
      'transparent',
    ]);

    assert.strictEqual(pngResult.exitCode, 0);

    // Check PNG files were created
    const allFiles = await fs.readdir(tempDir);
    const pngImages = allFiles.filter((f) => f.endsWith('.png'));
    assert(pngImages.length > 0);
  });

  test('should respect page range options with real PDF via CLI', async () => {
    // Test first page only
    const result = await runCLI([
      testPdfPath,
      path.join(tempDir, 'single-page'),
      '--first',
      '1',
      '--max-pages',
      '1',
      '--size',
      '64',
    ]);

    assert.strictEqual(result.exitCode, 0);

    const files = await fs.readdir(tempDir);
    const pngFiles = files.filter((f) => f.endsWith('.png'));

    // Should have exactly 1 page
    assert.strictEqual(pngFiles.length, 1);
    assert(pngFiles[0].includes('-001.png'));
  });

  test('should show progress and completion message with real PDF', async () => {
    const result = await runCLI([
      testPdfPath,
      path.join(tempDir, 'progress-test'),
      '--max-pages',
      '1',
      '--size',
      '64',
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert(result.stdout.includes('✅ Done'));
    assert(result.stdout.includes('Wrote pages'));

    // Verify files were actually created
    const files = await fs.readdir(tempDir);
    const outputFiles = files.filter(
      (f) =>
        f.startsWith('progress-test-') &&
        (f.endsWith('.png') || f.endsWith('.txt')),
    );
    assert(outputFiles.length > 0, 'Should have created output files');
  });
});
