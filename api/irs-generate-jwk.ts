import type { VercelRequest, VercelResponse } from '@vercel/node';
import forge from 'node-forge';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Protect with admin secret
  const adminSecret = req.headers['x-admin-secret'];
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    // 1. Generate 2048-bit RSA key pair
    const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });

    // 2. Create self-signed X.509 certificate (valid 2 years)
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
    cert.setIssuer(attrs); // Self-signed
    cert.setExtensions([
      { name: 'keyUsage', digitalSignature: true },
      { name: 'basicConstraints', cA: false },
    ]);
    cert.sign(keypair.privateKey, forge.md.sha256.create());

    // 3. Extract DER bytes for x5c and x5t
    const derBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const derBuffer = Buffer.from(derBytes, 'binary');
    const x5c = derBuffer.toString('base64'); // Standard base64 (NOT base64url)
    const x5tBuffer = crypto.createHash('sha1').update(derBuffer).digest();
    const x5t = base64urlEncode(x5tBuffer);

    // 4. Extract RSA modulus (n) and exponent (e) using Node.js crypto
    const publicKeyDer = forge.asn1.toDer(forge.pki.publicKeyToAsn1(keypair.publicKey)).getBytes();
    const publicKeyObj = crypto.createPublicKey({
      key: Buffer.from(publicKeyDer, 'binary'),
      format: 'der',
      type: 'spki',
    });
    const jwkFromCrypto = publicKeyObj.export({ format: 'jwk' });

    // 5. Build the IRS-compliant JWK
    const kid = crypto.randomUUID();
    const jwk = {
      kty: 'RSA',
      kid,
      use: 'sig',
      n: jwkFromCrypto.n,
      e: jwkFromCrypto.e, // "AQAB"
      x5c: [x5c],
      x5t,
    };

    const jwks = { keys: [jwk] };

    // 6. Export private key and certificate PEM
    const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);
    const certificatePem = forge.pki.certificateToPem(cert);

    return res.status(200).json({
      jwks,
      jwk,
      kid,
      privateKeyPem,
      certificatePem,
      instructions: {
        step1: "Save the 'jwks' object to a .json file (e.g., filershub-jwks.json) and upload it to IRS during Client ID registration.",
        step2: "Copy the 'privateKeyPem' value and add it as the Vercel environment variable IRS_PRIVATE_KEY_PEM.",
        step3: "Copy the 'kid' value and add it as the Vercel environment variable IRS_KID.",
        step4: "Register your redirect URI with IRS as: https://app.filershub.com/api/irs-callback",
        step5: "After receiving your IRS Client ID, add it as Vercel env vars IRS_CLIENT_ID and VITE_IRS_CLIENT_ID.",
        step6: "Delete api/irs-generate-jwk.ts from the codebase after you have saved the outputs.",
      },
    });
  } catch (error: any) {
    console.error('JWK Generation Error:', error);
    return res.status(500).json({ error: 'Failed to generate JWK', message: error.message });
  }
}

function base64urlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
