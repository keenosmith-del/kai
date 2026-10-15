import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt);
// OWASP's recommended scrypt parameters. Work is asynchronous.
const SCRYPT_OPTIONS = {
  N: 2 ** 17,
  r: 8,
  p: 1,
  maxmem: 256 * 1024 * 1024,
};

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const digest = await scrypt(password, salt, 64, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString("hex")}$${digest.toString("hex")}`;
}

export async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== "string") return false;
  const [algorithm, saltHex, expectedHex, extra] = storedHash.split("$");
  if (extra !== undefined || algorithm !== "scrypt" ||
      !/^[a-f\d]{32}$/i.test(saltHex ?? "") ||
      !/^[a-f\d]{128}$/i.test(expectedHex ?? "")) {
    return false;
  }
  const calculated = await scrypt(
    password,
    Buffer.from(saltHex, "hex"),
    64,
    SCRYPT_OPTIONS,
  );
  return timingSafeEqual(calculated, Buffer.from(expectedHex, "hex"));
}
