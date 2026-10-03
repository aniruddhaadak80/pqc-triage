import type { CryptoFamily } from "./types";

/**
 * Seed training set for the on-device multinomial Naive Bayes classifier. Each
 * entry is a phrase a security engineer would actually paste: an algorithm name,
 * a config string, or one line of code. Labels are the family the surface
 * belongs to, which is the only thing the classifier decides.
 */

export type TrainingExample = { text: string; label: CryptoFamily };

export const CLASS_LABELS: readonly CryptoFamily[] = [
  "hash",
  "mac",
  "symmetric-cipher",
  "stream-cipher",
  "kex-public",
  "signature-public",
  "password-hash",
  "kdf",
  "rng",
];

export const CLASS_LABELS_HUMAN: Record<CryptoFamily, string> = {
  hash: "hash function",
  mac: "message authentication code",
  "symmetric-cipher": "symmetric block or AEAD cipher",
  "stream-cipher": "stream cipher",
  "kex-public": "public key establishment",
  "signature-public": "public key signature",
  "password-hash": "password hash",
  kdf: "key derivation function",
  rng: "random number generation",
  unknown: "unclassified",
};

export const SEED_CORPUS: readonly TrainingExample[] = [
  // hash
  { text: "sha256 digest of the payload", label: "hash" },
  { text: "sha-256 hex fingerprint for the release", label: "hash" },
  { text: "md5 checksum for the downloaded asset", label: "hash" },
  { text: "hashlib.sha256 data integrity", label: "hash" },
  { text: "createHash('sha512') content address", label: "hash" },
  { text: "sha1 git object name", label: "hash" },
  { text: "sha3-256 hashing of the document body", label: "hash" },
  { text: "blake2b hash for the content address", label: "hash" },
  { text: "checksum comparison of the artefact bytes", label: "hash" },
  { text: "message digest used for deduplication", label: "hash" },
  { text: "ripemd160 digest of the block header", label: "hash" },

  // mac
  { text: "hmac sha256 signing of the webhook body", label: "mac" },
  { text: "createHmac('sha256', secret) request signature", label: "mac" },
  { text: "hmac-sha1 message authentication code for the api", label: "mac" },
  { text: "cmac aes128 authentication tag", label: "mac" },
  { text: "poly1305 one time authenticator", label: "mac" },
  { text: "gmac galois counter mode tag", label: "mac" },
  { text: "hmac verify the shared secret signature", label: "mac" },
  { text: "message authentication code for the queue message", label: "mac" },
  { text: "jwt with algorithm hs256", label: "mac" },
  { text: "hs512 signed service token", label: "mac" },

  // symmetric cipher
  { text: "aes 256 gcm encrypt the document at rest", label: "symmetric-cipher" },
  { text: "createCipheriv('aes-256-gcm', key, iv)", label: "symmetric-cipher" },
  { text: "aes-128-cbc encrypted volume", label: "symmetric-cipher" },
  { text: "EVP_aes_256_cbc disk encryption", label: "symmetric-cipher" },
  { text: "AES.MODE_ECB block cipher mode", label: "symmetric-cipher" },
  { text: "aes 128 gcm tls cipher suite", label: "symmetric-cipher" },
  { text: "sm4 block cipher for the archive", label: "symmetric-cipher" },
  { text: "3des encryption for the legacy protocol", label: "symmetric-cipher" },
  { text: "des encryption for the legacy protocol", label: "symmetric-cipher" },
  { text: "camellia 256 block cipher", label: "symmetric-cipher" },
  { text: "encrypt the field with aes gcm and a fresh nonce", label: "symmetric-cipher" },

  // stream cipher
  { text: "rc4 stream cipher for the legacy session", label: "stream-cipher" },
  { text: "chacha20 poly1305 aead stream cipher", label: "stream-cipher" },
  { text: "ARC4 encryption of the telnet session", label: "stream-cipher" },
  { text: "salsa20 stream cipher keystream", label: "stream-cipher" },
  { text: "chacha20 poly1305 nonce and counter for the tunnel", label: "stream-cipher" },

  // key exchange
  { text: "rsa 2048 key exchange for the tls handshake", label: "kex-public" },
  { text: "diffie hellman key agreement", label: "kex-public" },
  { text: "ecdh prime256v1 shared secret", label: "kex-public" },
  { text: "x25519 key exchange for the peer link", label: "kex-public" },
  { text: "ml-kem-768 post quantum key encapsulation", label: "kex-public" },
  { text: "kyber768 hybrid key exchange with x25519", label: "kex-public" },
  { text: "finite field diffie hellman 2048 group", label: "kex-public" },
  { text: "session ticket key rotation key establishment", label: "kex-public" },

  // signatures
  { text: "rsa signature rs256 for the jwt", label: "signature-public" },
  { text: "ecdsa p-256 signature verification", label: "signature-public" },
  { text: "es256 json web token algorithm", label: "signature-public" },
  { text: "ed25519 signature on the release artifact", label: "signature-public" },
  { text: "ml-dsa-65 post quantum signature", label: "signature-public" },
  { text: "slh-dsa hash based signature for long lived code", label: "signature-public" },
  { text: "code signing certificate chain validation", label: "signature-public" },
  { text: "x509 certificate authority signs the csr", label: "signature-public" },
  { text: "dilithium signature verification in the pki", label: "signature-public" },
  { text: "gpg detached signature for the package", label: "signature-public" },
  { text: "jwt with algorithm rs256", label: "signature-public" },
  { text: "ps256 signed assertion for the partner api", label: "signature-public" },

  // password hash
  { text: "bcrypt hash of the user password", label: "password-hash" },
  { text: "argon2id password hashing with memory cost", label: "password-hash" },
  { text: "scrypt password derivation for the login", label: "password-hash" },
  { text: "store the salted password hash in the users table", label: "password-hash" },
  { text: "compare the bcrypt digest on sign in", label: "password-hash" },

  // kdf
  { text: "pbkdf2 hmac sha256 600000 iterations", label: "kdf" },
  { text: "hkdf expand the session key material", label: "kdf" },
  { text: "pbkdf2 with sha1 for the legacy import", label: "kdf" },
  { text: "derive the wrapping key with hkdf sha256", label: "kdf" },
  { text: "key derivation function for the backup passphrase", label: "kdf" },

  // rng
  { text: "Math.random to generate the session token", label: "rng" },
  { text: "randombytes for the nonce and the salt", label: "rng" },
  { text: "generate an unseeded random password", label: "rng" },
  { text: "rand seed for the key material", label: "rng" },
  { text: "secure random number generator for the otp", label: "rng" },
  { text: "uuid v1 from a predictable random source", label: "rng" },
];

/** Words the model is not allowed to learn from, so punctuation noise cannot dominate. */
export const STOP_TOKENS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "this",
  "that",
  "use",
  "using",
  "used",
  "our",
  "its",
  "new",
  "get",
  "set",
  "key",
  "keys",
]);