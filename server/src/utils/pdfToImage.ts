import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);

/**
 * Convert the first page of a PDF file to a PNG image.
 * Uses pdftoppm (Poppler) which must be available on the system.
 * Returns the path to the generated PNG file.
 * Throws an Error if conversion fails.
 */
export async function convertPdfFirstPageToPng(
  pdfPath: string,
  outputDir: string,
  outputBaseName: string,
): Promise<string> {
  // pdftoppm appends .png automatically, so pass the full path without the extension
  const outputPathWithoutExt = path.join(outputDir, outputBaseName);
  const expectedOutputPath = outputPathWithoutExt + '.png';

  const args = ['-png', '-r', '200', '-singlefile', pdfPath, outputPathWithoutExt];

  try {
    const { stderr } = await execFileAsync('pdftoppm', args);

    // pdftoppm may write warnings to stderr but still succeed; only fail on non-zero exit
    // Verify the output file exists
    if (!fs.existsSync(expectedOutputPath)) {
      throw new Error(
        `pdftoppm completed but output file not found at: ${expectedOutputPath}${stderr ? ` stderr: ${stderr}` : ''}`,
      );
    }

    return path.resolve(expectedOutputPath);
  } catch (err: any) {
    // Re-throw our own errors directly
    if (err.message?.startsWith('pdftoppm completed')) {
      throw err;
    }

    const details = err.stderr || err.message || String(err);
    throw new Error(`Failed to convert PDF letterhead to image: ${details}`);
  }
}