import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const files = [
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '..', '.env'),
  path.join(__dirname, '..', '..', '..', '.env'),
];

for (const file of files) {
  if (fs.existsSync(file)) dotenv.config({ path: file, override: false });
}

if (!process.env.GITHUB_REPO) {
  process.env.GITHUB_REPO = 'Muhammad-Husnain007/Ask-ai';
}
if (!process.env.MAIL_TO) {
  process.env.MAIL_TO = 'hasnainilyas007@gmail.com';
}
if (!process.env.REPO_ROOT) {
  process.env.REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
}
