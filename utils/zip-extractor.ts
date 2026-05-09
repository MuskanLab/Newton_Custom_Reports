import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

/**
 * Extract the first CSV entry from a ZIP into destDir.
 * Returns the absolute path of the extracted CSV.
 */
export async function extractFirstCsv(zipPath: string, destDir: string): Promise<string> {
  fs.mkdirSync(destDir, { recursive: true });

  const zip = new AdmZip(zipPath);
  const csvEntry = zip.getEntries().find(
    e => !e.isDirectory && e.entryName.toLowerCase().endsWith('.csv')
  );
  if (!csvEntry) {
    throw new Error(`No CSV file found inside ZIP: ${zipPath}`);
  }

  const outPath = path.join(destDir, path.basename(csvEntry.entryName));
  fs.writeFileSync(outPath, csvEntry.getData());
  return outPath;
}

/**
 * Find a ZIP file in `dir` whose basename contains the given keyword
 * (case-insensitive). Useful for locating Daily/Weekly/Monthly/NoTimeDimension ZIPs.
 */
export function findZipByKeyword(dir: string, keyword: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const kw = keyword.toLowerCase();
  const hit = fs.readdirSync(dir).find(
    f => f.toLowerCase().endsWith('.zip') && f.toLowerCase().includes(kw)
  );
  return hit ? path.join(dir, hit) : null;
}
