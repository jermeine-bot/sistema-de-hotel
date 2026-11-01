import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(user, password) {
  if (!user?.passwordHash) return user?.password === password;
  const [salt, hash] = String(user.passwordHash).split(':');
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === derived.length && expected.equals(derived);
}

/**
 * Capa de persistencia. Usa node:sqlite (incluido en Node.js 22.13+), por lo que
 * no requiere compiladores ni dependencias nativas en Windows ni en Linux.
 */
export function createStore({ dbPath, seedFile, initialAdminPassword, logger = console }) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      user TEXT,
      action TEXT NOT NULL,
      collection TEXT NOT NULL,
      record_id TEXT,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_records_collection ON records(collection);
    CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at);
  `);

  const statements = {
    all: db.prepare('SELECT data FROM records WHERE collection = ? ORDER BY rowid'),
    get: db.prepare('SELECT data FROM records WHERE collection = ? AND id = ?'),
    put: db.prepare('INSERT INTO records(collection, id, data) VALUES(?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data'),
    remove: db.prepare('DELETE FROM records WHERE collection = ? AND id = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM records'),
    auditInsert: db.prepare('INSERT INTO audit(at, user, action, collection, record_id, detail) VALUES(?, ?, ?, ?, ?, ?)'),
    auditList: db.prepare('SELECT id, at AS fecha, user AS usuario, action AS accion, collection AS entidad, record_id AS entidadId, detail AS detalle FROM audit ORDER BY id DESC LIMIT ?'),
  };

  function all(collection) {
    return statements.all.all(collection).map((row) => JSON.parse(row.data));
  }

  function get(collection, id) {
    const row = statements.get.get(collection, String(id));
    return row ? JSON.parse(row.data) : undefined;
  }

  function put(collection, record) {
    if (record == null || record.id == null || record.id === '') {
      throw new Error('El registro debe tener un id');
    }
    statements.put.run(collection, String(record.id), JSON.stringify(record));
    return record;
  }

  function remove(collection, id) {
    return statements.remove.run(collection, String(id)).changes > 0;
  }

  function nextId(collection) {
    return all(collection).reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  }

  function audit({ user, action, collection, recordId, detail = '' }) {
    statements.auditInsert.run(new Date().toISOString(), user || 'sistema', action, collection, String(recordId ?? ''), detail);
  }

  function auditList(limit = 500) {
    return statements.auditList.all(Math.max(1, Math.min(2000, Number(limit) || 500)));
  }

  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* la transacción ya pudo haberse cerrado */ }
      throw error;
    }
  }

  function backup(directory) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const file = path.join(directory, `hotel-${stamp}.sqlite`);
    const escaped = file.replaceAll("'", "''");
    db.exec(`VACUUM INTO '${escaped}'`);
    return { archivo: path.basename(file), ruta: file, bytes: fs.statSync(file).size };
  }

  function listBackups(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory)
      .filter((name) => /\.sqlite$/i.test(name))
      .map((name) => {
        const full = path.join(directory, name);
        const stat = fs.statSync(full);
        return { archivo: name, ruta: full, bytes: stat.size, modificado: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.modificado.localeCompare(a.modificado));
  }

  function close() {
    try { db.close(); } catch { /* ya cerrada */ }
  }

  function importSeed() {
    if (statements.count.get().n > 0 || !seedFile || !fs.existsSync(seedFile)) return false;
    const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
    transaction(() => {
      for (const [collection, value] of Object.entries(seed)) {
        if (!Array.isArray(value)) continue;
        for (const row of value) put(collection, row);
      }
      if (seed.config) put('config', { id: 'main', ...seed.config });

      const users = all('usuarios');
      let generated = '';
      for (const user of users) {
        if (user.passwordHash) continue;
        if (user.usuario === 'admin' && !user.password) {
          generated = initialAdminPassword || randomBytes(12).toString('base64url');
          put('usuarios', { ...user, passwordHash: hashPassword(generated), password: undefined });
        } else if (user.password) {
          put('usuarios', { ...user, passwordHash: hashPassword(user.password), password: undefined });
        }
      }
      if (generated) {
        logger.info('──────────────────────────────────────────────────────────────');
        logger.info(` Contraseña inicial de admin: ${generated}`);
        logger.info(' Guárdela ahora. No se volverá a mostrar.');
        logger.info('──────────────────────────────────────────────────────────────');
      }
    });
    return true;
  }

  const seeded = importSeed();

  return { db, all, get, put, remove, nextId, audit, auditList, transaction, backup, listBackups, close, seeded };
}
