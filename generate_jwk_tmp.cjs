const forge = require('node-forge');
const crypto = require('crypto');

const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
const cert = forge.pki.createCertificate();
cert.publicKey = keypair.publicKey;
cert.serialNumber = '01';
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 2);
const attrs = [
  { name: 'commonName', value: 'FilersHub IRS ISP' },
  { name: 'organizationName', value: 'FilersHub LLC' },
  { name: 'countryName', value: 'US' },
];
cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.setExtensions([
  { name: 'keyUsage', digitalSignature: true },
  { name: 'basicConstraints', cA: false },
]);
cert.sign(keypair.privateKey, forge.md.sha256.create());

const derBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
const derBuffer = Buffer.from(derBytes, 'binary');
const x5c = derBuffer.toString('base64');
const x5t = crypto.createHash('sha1').update(derBuffer).digest().toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const publicKeyObj = crypto.createPublicKey({
  key: Buffer.from(forge.asn1.toDer(forge.pki.publicKeyToAsn1(keypair.publicKey)).getBytes(), 'binary'),
  format: 'der',
  type: 'spki',
});
const jwkFromCrypto = publicKeyObj.export({ format: 'jwk' });

const kid = crypto.randomUUID();
const jwk = {
  kty: 'RSA',
  kid,
  use: 'sig',
  n: jwkFromCrypto.n,
  e: 'AQAB',
  x5c: [x5c],
  x5t,
};

console.log('---START_JWKS---');
console.log(JSON.stringify({ keys: [jwk] }, null, 2));
console.log('---END_JWKS---');
console.log('---START_KEY---');
console.log(forge.pki.privateKeyToPem(keypair.privateKey).trim());
console.log('---END_KEY---');
console.log('---START_KID---');
console.log(kid);
console.log('---END_KID---');
