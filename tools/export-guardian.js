import { writeFile } from 'node:fs/promises';
import { readGuardianModule } from './studios.js';

await writeFile(new URL('../src/guardian-art.js', import.meta.url), await readGuardianModule());
