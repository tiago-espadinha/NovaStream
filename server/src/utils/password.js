import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

// A hash of a random value nobody knows, at SALT_ROUNDS, for sign-ins to emails with no account.
export const DUMMY_PASSWORD_HASH = '$2a$10$uHOg6APmq1FKaK.6Xbn5CO9yfuOIzKQIsgaSzwKJeWIy5CYNjiI3W';

export function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
