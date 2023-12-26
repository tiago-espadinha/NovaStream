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
      data.users[idx] = user;
      writeRaw(data);
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

  async function getUser(id) {
    const raw = await command('GET', userKey(id));
    return raw ? JSON.parse(raw) : null;
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
      await command('SET', userKey(user.id), JSON.stringify(user));
      return true;
    },
    // XX: only overwrite an existing record, so a write racing a deletion can't bring it back.
    async putUser(user) {
      await command('SET', userKey(user.id), JSON.stringify(user), 'XX');
    },
    // One DEL for both keys, so a failure can't leave the email claimed by a missing account.
    async removeUser(user) {
      await command('DEL', userKey(user.id), emailIndexKey(user.email));
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

    async updateUser(id, patch) {
      const user = await backend.getUser(id);
      if (!user) return null;
      const updated = { ...user, ...patch };
      await backend.putUser(updated);
      return updated;
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
  addSavedMedia,
  removeSavedMedia,
  deleteUser,
} = store;
