// User records (accounts, saved media, collections). Two backends behind the same async API:
// - Upstash Redis over its REST API when UPSTASH_REDIS_REST_URL/TOKEN (or the KV_REST_API_*
//   names Vercel's marketplace injects) are set — needed on Vercel, whose filesystem is
//   read-only and wiped between invocations.
// - Otherwise a local JSON file, so development works with zero setup.
// Routes only use the functions exported at the bottom; nothing else touches storage.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, 'data.json');

const emailKey = (email) => email.toLowerCase();

// The password hash and session version change only through updateCredentials. Data writes
// hold a copy read earlier, which may predate a password change, so they never write these.
function splitAuth(user) {
  const { passwordHash, sessionVersion, ...data } = user;
  return { auth: { passwordHash, sessionVersion }, data };
}

export function createFileBackend(dbPath = DEFAULT_DB_PATH) {
  function readRaw() {
    if (!fs.existsSync(dbPath)) {
      const initial = { users: [] };
      fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
      return initial;
    }
    return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  }

  function writeRaw(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  }

  return {
    async getUser(id) {
      return readRaw().users.find((u) => u.id === id) ?? null;
    },
    async getUserByEmail(email) {
      return readRaw().users.find((u) => emailKey(u.email) === emailKey(email)) ?? null;
    },
    async insertUser(user) {
      const data = readRaw();
      if (data.users.some((u) => emailKey(u.email) === emailKey(user.email))) return false;
      data.users.push(user);
      writeRaw(data);
      return true;
    },
    async putUser(user) {
      const data = readRaw();
      const idx = data.users.findIndex((u) => u.id === user.id);
      if (idx === -1) return;
      const { auth } = splitAuth(data.users[idx]);
      data.users[idx] = { ...user, ...auth };
      writeRaw(data);
    },
    async putAuth(id, auth) {
      const data = readRaw();
      const idx = data.users.findIndex((u) => u.id === id);
      if (idx === -1) return false;
      data.users[idx] = { ...data.users[idx], ...auth };
      writeRaw(data);
      return true;
    },
    async removeUser(user) {
      const data = readRaw();
      const remaining = data.users.filter((u) => u.id !== user.id);
      if (remaining.length === data.users.length) return;
      writeRaw({ ...data, users: remaining });
    },
  };
}

export function createRedisBackend({ url, token, fetchImpl = fetch }) {
  async function command(...args) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(`Redis ${args[0]} failed: ${body.error || res.status}`);
    return body.result;
  }

  const userKey = (id) => `user:${id}`;
  const emailIndexKey = (email) => `user-email:${emailKey(email)}`;
  const authKey = (id) => `user-auth:${id}`;

  // Records written before the auth key existed carry the auth fields inline; once the auth
  // key exists it wins.
  async function getUser(id) {
    const [raw, rawAuth] = await command('MGET', userKey(id), authKey(id));
    if (!raw) return null;
    const user = JSON.parse(raw);
    return rawAuth ? { ...splitAuth(user).data, ...JSON.parse(rawAuth) } : user;
  }

  return {
    getUser,
    async getUserByEmail(email) {
      const id = await command('GET', emailIndexKey(email));
      return id ? getUser(id) : null;
    },
    async insertUser(user) {
      // Claiming the email first makes duplicate registrations fail atomically.
      const claimed = await command('SET', emailIndexKey(user.email), user.id, 'NX');
      if (claimed !== 'OK') return false;
      const { auth, data } = splitAuth(user);
      await command('MSET', userKey(user.id), JSON.stringify(data), authKey(user.id), JSON.stringify(auth));
      return true;
    },
    // NX moves an older record's inline auth fields to the auth key, and does nothing once a
    // password change has written it. XX: only overwrite an existing record, so a write racing
    // a deletion can't bring it back, nor leave an auth key behind.
    async putUser(user) {
      const { auth, data } = splitAuth(user);
      await command('SET', authKey(user.id), JSON.stringify(auth), 'NX');
      const saved = await command('SET', userKey(user.id), JSON.stringify(data), 'XX');
      if (saved !== 'OK') await command('DEL', authKey(user.id));
    },
    // The record check comes after the write, so a deletion in between can't leave it behind.
    async putAuth(id, auth) {
      await command('SET', authKey(id), JSON.stringify(auth));
      if (await command('EXISTS', userKey(id))) return true;
      await command('DEL', authKey(id));
      return false;
    },
    // One DEL for all keys, so a failure can't leave the email claimed by a missing account.
    async removeUser(user) {
      await command('DEL', userKey(user.id), emailIndexKey(user.email), authKey(user.id));
    },
  };
}

function backendFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? createRedisBackend({ url, token }) : createFileBackend();
}

export function createStore(backend) {
  return {
    findUserByEmail: (email) => backend.getUserByEmail(email),
    findUserById: (id) => backend.getUser(id),

    /** Resolves to the user, or null when the email is already registered. */
    async createUser(user) {
      return (await backend.insertUser(user)) ? user : null;
    },

    /** Data fields only: a password hash or session version in the patch is ignored. */
    async updateUser(id, patch) {
      const user = await backend.getUser(id);
      if (!user) return null;
      const updated = { ...user, ...splitAuth(patch).data };
      await backend.putUser(updated);
      return updated;
    },

    /** Resolves to the updated user, or null when it doesn't exist. */
    async updateCredentials(id, { passwordHash, sessionVersion }) {
      if (!(await backend.putAuth(id, { passwordHash, sessionVersion }))) return null;
      return backend.getUser(id);
    },

    async addSavedMedia(userId, media) {
      const user = await backend.getUser(userId);
      if (!user) return null;
      if (!user.savedMedia.some((m) => m.id === media.id)) {
        user.savedMedia.push({ ...media, savedAt: new Date().toISOString() });
        await backend.putUser(user);
      }
      return user.savedMedia;
    },

    async removeSavedMedia(userId, mediaId) {
      const user = await backend.getUser(userId);
      if (!user) return null;
      user.savedMedia = user.savedMedia.filter((m) => m.id !== mediaId);
      await backend.putUser(user);
      return user.savedMedia;
    },

    /** Removes the account with everything stored on it; resolves to false when it didn't exist. */
    async deleteUser(id) {
      const user = await backend.getUser(id);
      if (!user) return false;
      await backend.removeUser(user);
      return true;
    },
  };
}

const store = createStore(backendFromEnv());

export const {
  findUserByEmail,
  findUserById,
  createUser,
  updateUser,
  updateCredentials,
  addSavedMedia,
  removeSavedMedia,
  deleteUser,
} = store;
