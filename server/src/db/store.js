// A minimal JSON-file "database" so auth + saved media work out of the box with zero
// setup. This is a stand-in, not a real database — swap it for Postgres/Prisma (see the
// project guide's Phase 3) once you're past prototyping. Every function here is the only
// place that touches the file, so that swap only touches this module.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data.json');

function readRaw() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = { users: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeRaw(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export function findUserByEmail(email) {
  const data = readRaw();
  return data.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export function findUserById(id) {
  const data = readRaw();
  return data.users.find((u) => u.id === id) ?? null;
}

export function createUser(user) {
  const data = readRaw();
  data.users.push(user);
  writeRaw(data);
  return user;
}

export function updateUser(id, patch) {
  const data = readRaw();
  const idx = data.users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  data.users[idx] = { ...data.users[idx], ...patch };
  writeRaw(data);
  return data.users[idx];
}

export function addSavedMedia(userId, media) {
  const data = readRaw();
  const user = data.users.find((u) => u.id === userId);
  if (!user) return null;
  const exists = user.savedMedia.some((m) => m.id === media.id);
  if (!exists) user.savedMedia.push({ ...media, savedAt: new Date().toISOString() });
  writeRaw(data);
  return user.savedMedia;
}

export function removeSavedMedia(userId, mediaId) {
  const data = readRaw();
  const user = data.users.find((u) => u.id === userId);
  if (!user) return null;
  user.savedMedia = user.savedMedia.filter((m) => m.id !== mediaId);
  writeRaw(data);
  return user.savedMedia;
}
