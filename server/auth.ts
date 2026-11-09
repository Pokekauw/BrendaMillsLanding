import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

function scrypt(password: string, salt: Buffer, keyLength: number, options: { N: number; r: number; p: number; maxmem: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, key) => error ? reject(error) : resolve(key));
  });
}
const PARAMS = { N: 16384, r: 8, p: 1, keyLength: 32, maxmem: 64 * 1024 * 1024 };
const SALT_FIELD = /^[A-Za-z0-9_-]{22}$/;
const KEY_FIELD = /^[A-Za-z0-9_-]{43}$/;

export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 256) {
    throw new Error("The admin password must contain between 12 and 256 characters.");
  }
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, PARAMS.keyLength, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![16384, 32768, 65536].includes(N) || r !== 8 || p !== 1 || !SALT_FIELD.test(parts[4]) || !KEY_FIELD.test(parts[5])) return false;
  if (typeof password !== "string" || password.length > 256) return false;
  try {
    const salt = Buffer.from(parts[4], "base64url");
    const expected = Buffer.from(parts[5], "base64url");
    if (salt.length !== 16 || expected.length !== 32) return false;
    const actual = await scrypt(password, salt, expected.length, { N, r, p, maxmem: 128 * 1024 * 1024 });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
