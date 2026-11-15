// Prints a demo key in the base58 form Phantom's "Import private key" expects.
// Usage: node scripts/key-to-base58.js scripts/.demo-keys/grantee1.json
// The output is a private key. Paste it into Phantom only, and don't share it.
const fs = require("fs");
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}
const bytes = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
console.log(base58(bytes));
