#!/usr/bin/env node
//
// Viatik environment encryption tool.
//
// Locks/unlocks the local environment file so a single team password can be
// shared without committing plaintext secrets.
//
//   node bin/secrets.mjs lock    # .env.local  -> .env.encrypted (committed)
//   node bin/secrets.mjs unlock  # .env.encrypted -> .env.local  (gitignored)
//
// Zero external dependencies: uses only the Node built-ins `crypto`, `readline`,
// `fs`, `path`, and `url`. Cipher: AES-256-GCM. Key derivation: PBKDF2-HMAC-SHA256.
//
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32; // 256-bit key
const IV_LEN = 12; // 96-bit IV recommended for GCM
const SALT_LEN = 16;
const ITERATIONS = 600_000; // OWASP recommendation for PBKDF2-HMAC-SHA256
const DIGEST = 'sha256';

// On-disk format. All payload fields are base64 (no '.' or newlines in the
// standard base64 alphabet), so '.' is a safe field separator.
const HEADER = 'VIATIK_ENV:1:';
const SEP = '.';

// Script lives in bin/; resolve all paths against the repository root so the
// commands work from any working directory.
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const ENV_FILE = path.join(PROJECT_ROOT, '.env.local');
const ENCRYPTED_FILE = path.join(PROJECT_ROOT, '.env.encrypted');

// Non-interactive password override for CI / scripting. Passwords are never
// echoed to the terminal regardless of how they are supplied.
const ENV_PASSWORD_VAR = 'SECRETS_PASSWORD';

// ──────────────────────────────────────────────────────────────────────────
// Crypto
// ──────────────────────────────────────────────────────────────────────────

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, DIGEST);
}

function encrypt(plaintext, password) {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return HEADER + [
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(SEP);
}

function decrypt(serialized, password) {
  if (!serialized.startsWith(HEADER)) {
    throw new Error('Unrecognized encrypted environment format.');
  }

  const fields = serialized.slice(HEADER.length).split(SEP);
  if (fields.length !== 4) {
    throw new Error('Encrypted environment is malformed.');
  }

  const [salt, iv, authTag, ciphertext] = fields.map((f) => Buffer.from(f, 'base64'));
  const key = deriveKey(password, salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return plaintext.toString('utf8');
}

// ──────────────────────────────────────────────────────────────────────────
// Prompt helpers
// ──────────────────────────────────────────────────────────────────────────

// Ask for a password without echoing the input to the terminal.
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // Hide every typed character while keeping the prompt itself visible.
    rl._writeToOutput = (stringToWrite) => {
      if (stringToWrite.startsWith(question)) {
        rl.output.write(stringToWrite);
      } else {
        rl.output.write(stringToWrite.replace(/[^\n\r]/g, '*'));
      }
    };

    rl.question(question, (answer) => {
      rl.output.write('\n');
      rl.close();
      resolve(answer);
    });
    rl.on('error', reject);
  });
}

async function resolvePassword({ confirm = false } = {}) {
  if (process.env[ENV_PASSWORD_VAR]) {
    return process.env[ENV_PASSWORD_VAR];
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      `No TTY detected and ${ENV_PASSWORD_VAR} is not set. ` +
        `Provide the password via the ${ENV_PASSWORD_VAR} environment variable.`
    );
  }
  const password = await promptHidden('Enter password: ');
  if (confirm) {
    const again = await promptHidden('Confirm password: ');
    if (password !== again) {
      throw new Error('Passwords do not match. Aborting.');
    }
  }
  return password;
}

// ──────────────────────────────────────────────────────────────────────────
// Commands
// ──────────────────────────────────────────────────────────────────────────

function cmdLock() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error(`ERROR: '${ENV_FILE}' not found. Nothing to encrypt.`);
    process.exit(1);
  }

  resolvePassword({ confirm: true }).then((password) => {
    const plaintext = fs.readFileSync(ENV_FILE, 'utf8');
    const serialized = encrypt(plaintext, password);
    fs.writeFileSync(ENCRYPTED_FILE, serialized + '\n');
    console.log(`Encrypted '${path.basename(ENV_FILE)}' -> '${path.basename(ENCRYPTED_FILE)}'.`);
    console.log(`Commit '${path.basename(ENCRYPTED_FILE)}' — never commit '${path.basename(ENV_FILE)}'.`);
  }).catch((err) => {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  });
}

function cmdUnlock({ force = false } = {}) {
  if (!fs.existsSync(ENCRYPTED_FILE)) {
    console.log(`No '${path.basename(ENCRYPTED_FILE)}' found — nothing to unlock.`);
    console.log('If you expected encrypted secrets, they may not have been committed.');
    return;
  }

  resolvePassword().then((password) => {
    if (fs.existsSync(ENV_FILE) && !force) {
      console.warn(`'${path.basename(ENV_FILE)}' already exists — leaving it untouched.`);
      console.warn(`Delete it or re-run with '--force' to overwrite from '${path.basename(ENCRYPTED_FILE)}'.`);
      return;
    }

    const serialized = fs.readFileSync(ENCRYPTED_FILE, 'utf8').trim();
    let plaintext;
    try {
      plaintext = decrypt(serialized, password);
    } catch (err) {
      console.error('ERROR: incorrect password or corrupted encrypted file.');
      console.error(`       ${err.message}`);
      process.exit(1);
    }

    fs.writeFileSync(ENV_FILE, plaintext, { mode: 0o600 });
    console.log(`Decrypted '${path.basename(ENCRYPTED_FILE)}' -> '${path.basename(ENV_FILE)}'.`);
  }).catch((err) => {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  });
}

function usage() {
  console.log(`Viatik environment encryption tool

Usage:
  node bin/secrets.mjs lock            Encrypt .env.local -> .env.encrypted
  node bin/secrets.mjs unlock [--force]  Decrypt .env.encrypted -> .env.local

Options:
  --force   Overwrite an existing .env.local when unlocking.
  ${ENV_PASSWORD_VAR}=...  Supply the password non-interactively (CI/scripts).

Files:
  ${path.basename(ENV_FILE)}        gitignored, holds real secrets.
  ${path.basename(ENCRYPTED_FILE)}  committed, safely encrypted with AES-256-GCM.

Notes:
  - Wrong passwords are rejected via the GCM authentication tag.
  - The derived key uses PBKDF2-HMAC-SHA256 (${ITERATIONS.toLocaleString('en-US')} iterations).
  - Each lock uses a fresh random salt and IV; re-locking produces new output.
`);
}

// ──────────────────────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────────────────────

const [command, ...args] = process.argv.slice(2);
const force = args.includes('--force');

switch (command) {
  case 'lock':
    cmdLock();
    break;
  case 'unlock':
    cmdUnlock({ force });
    break;
  case undefined:
  case '-h':
  case '--help':
  case 'help':
    usage();
    break;
  default:
    console.error(`Unknown command '${command}'. Run 'node bin/secrets.mjs --help'.`);
    process.exit(1);
}
