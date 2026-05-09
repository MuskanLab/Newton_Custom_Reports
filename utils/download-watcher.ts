import * as fs from 'fs';
import * as path from 'path';

export async function waitForFile(
  dir: string,
  predicate: (file: string) => boolean,
  timeoutMs = 120_000,
  pollMs = 1000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(dir)) {
      const hit = fs.readdirSync(dir).find(predicate);
      if (hit) return path.join(dir, hit);
    }
    await new Promise(r => setTimeout(r, pollMs));
  }
  throw new Error(`Timed out waiting for file in ${dir}`);
}

export function moveFile(src: string, destDir: string): string {
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(src));
  fs.renameSync(src, dest);
  return dest;
}