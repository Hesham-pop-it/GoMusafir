// A software authenticator for tests: an ES256 platform passkey that builds the JSON the browser would send
// (attestation "none" for registration, a signed assertion for login). No network, no browser.
const crypto = require('node:crypto');

// Minimal CBOR writer: unsigned/negative ints, byte strings, text strings, maps.
function cbor(value) {
  const head = (major, n) => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 256) return Buffer.from([(major << 5) | 24, n]);
    return Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
  };
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (typeof value === 'string') { const b = Buffer.from(value); return Buffer.concat([head(3, b.length), b]); }
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
  const entries = Object.entries(value);
  return Buffer.concat([head(5, entries.length), ...entries.flatMap(([k, v]) => [cbor(/^-?\d+$/.test(k) ? Number(k) : k), cbor(v)])]);
}

function mockAuthenticator({ rpId, origin, counter = 0, userVerified = true, backedUp = false } = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credId = crypto.randomBytes(32);
  const self = { id: credId.toString('base64url'), counter, rpId, origin, userVerified, backedUp };
  const rpHash = id => crypto.createHash('sha256').update(id).digest();
  const flags = extra => (0x01 | (self.userVerified ? 0x04 : 0) | (self.backedUp ? 0x08 | 0x10 : 0) | extra);
  const clientData = (type, challenge, originOverride) => Buffer.from(JSON.stringify({ type, challenge, origin: originOverride || self.origin, crossOrigin: false }));
  const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };

  self.create = (options, { originOverride, rpIdOverride } = {}) => {
    const cose = cbor({ 1: 2, 3: -7, '-1': 1, '-2': Buffer.from(jwk.x, 'base64url'), '-3': Buffer.from(jwk.y, 'base64url') });
    const idLen = Buffer.alloc(2); idLen.writeUInt16BE(credId.length);
    const authData = Buffer.concat([rpHash(rpIdOverride || self.rpId), Buffer.from([flags(0x40)]), u32(self.counter), Buffer.alloc(16), idLen, credId, cose]);
    return {
      id: self.id, rawId: self.id, type: 'public-key', clientExtensionResults: {}, authenticatorAttachment: 'platform',
      response: {
        clientDataJSON: clientData('webauthn.create', options.challenge, originOverride).toString('base64url'),
        attestationObject: cbor({ fmt: 'none', attStmt: {}, authData }).toString('base64url'), transports: ['internal'],
      },
    };
  };

  self.get = (options, { originOverride, bump = 1, signWith } = {}) => {
    self.counter += bump;
    const authData = Buffer.concat([rpHash(self.rpId), Buffer.from([flags(0)]), u32(self.counter)]);
    const cd = clientData('webauthn.get', options.challenge, originOverride);
    const signature = crypto.sign('sha256', Buffer.concat([authData, crypto.createHash('sha256').update(cd).digest()]), signWith || privateKey);
    return {
      id: self.id, rawId: self.id, type: 'public-key', clientExtensionResults: {}, authenticatorAttachment: 'platform',
      response: { clientDataJSON: cd.toString('base64url'), authenticatorData: authData.toString('base64url'), signature: signature.toString('base64url'), userHandle: '' },
    };
  };
  return self;
}

module.exports = { mockAuthenticator, cbor };
