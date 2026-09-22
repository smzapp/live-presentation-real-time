import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Loads apps/api/.env into process.env. Imported first thing in main.ts:
// module decorators (e.g. JwtModule.register) read process.env while their
// files are being imported, so this has to run before AppModule loads.
// Variables already set in the real environment win over the file.
const envPath = resolve(import.meta.dirname, '..', '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);
