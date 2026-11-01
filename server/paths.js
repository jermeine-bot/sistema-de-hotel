import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Raíz del proyecto (funciona igual en Windows y Linux). */
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function resolveFromRoot(value) {
  if (!value) return root;
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}

export function resolveDbPath(env = process.env) {
  return resolveFromRoot(env.DB_PATH || path.join('data', 'hotel.sqlite'));
}

export function resolveBackupDir(env = process.env) {
  return resolveFromRoot(env.BACKUP_DIR || 'backups');
}

export function resolveSeedPath(env = process.env) {
  return resolveFromRoot(env.SEED_PATH || path.join('data', 'seed.json'));
}
