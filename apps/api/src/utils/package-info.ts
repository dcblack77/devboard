import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedVersion: string | undefined;

/** Lee `version` de `package.json` sin usar import assertions (compatible con CJS/ESM/dev). */
export function getPackageVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const raw = readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    cachedVersion = pkg.version ?? '0.0.0';
  } catch {
    cachedVersion = '0.0.0';
  }
  return cachedVersion;
}
