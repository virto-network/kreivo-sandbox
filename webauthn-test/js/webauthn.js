import * as CBOR from 'https://unpkg.com/cbor2@1.7.0/lib/index.js';
import * as authnTools from './authn-tools.js';

import { randomGenerateChallenge } from './random.js';

/**
 * 
 * @param {PublicKeyCredentialUserEntity} user
 * @param {BufferSource} challenge
 * @param {PublicKeyCredentialEntity} rp
 * @param {PublicKeyCredentialParameters[]} pubKeyCredParams
 * @param {AttestationConveyancePreference} attestation
 * @param {AuthenticatorSelectionCriteria} authenticatorSelection
 * @param {AuthenticationExtensionsClientInputs} extensions
 * @returns {Credential}
 */
export async function createCredentials(
  user,
  challenge = randomGenerateChallenge(),
  rp = { name: 'Virto Network' },
  pubKeyCredParams = [
    // ECDSA w/ SHA-256
    { type: "public-key", alg: -7 },
  ],
  attestation = "indirect",
  authenticatorSelection = {
    residentKey: "required",
    // Kept for backwards compatibility reasons
    requireResidentKey: true,
    userVerification: "required",
  },
  extensions = {
    uvm: true,
  },

) {
  const credential = await navigator.credentials.create({
    publicKey: {
      rp,
      user,
      challenge,
      pubKeyCredParams,
      attestation,
      authenticatorSelection,
      extensions,
    }
  });

  if (credential !== null) {
    return credential;
  }

  throw new Error("Credential not created");
}

/**
 * 
 * @param {ArrayBuffer} authData 
 * @returns {Object}
 */
export function parseAuthenticatorData(authData) {
  // Unpack authenticator data
  // https://www.w3.org/TR/webauthn/#authenticator-data
  var authenticatorData = {};
  authenticatorData.rpIdHash = authnTools.auto(authData.slice(0, 32));
  authenticatorData.flags = authnTools
    .uint8ArrayToInt(authData.slice(32, 32 + 1))
    .toString(2);
  authenticatorData.signCount = authnTools.uint8ArrayToInt(
    authData.slice(32 + 1, 32 + 1 + 4)
  );

  // AttestedCredentialData
  authenticatorData.attestedCredentialData = {};
  authenticatorData.attestedCredentialData.aaguid = authnTools.auto(
    authData.slice(32 + 1 + 4, 32 + 1 + 4 + 16)
  );
  authenticatorData.attestedCredentialData.credentialIdLength =
    authnTools.uint8ArrayToInt(
      authData.slice(32 + 1 + 4 + 16, 32 + 1 + 4 + 16 + 2)
    );
  var length =
    authenticatorData.attestedCredentialData.credentialIdLength;
  authenticatorData.attestedCredentialData.credentialId = authnTools.auto(
    authData.slice(32 + 1 + 4 + 16 + 2, 32 + 1 + 4 + 16 + 2 + length)
  );
  var lastCBORObjects = CBOR.decode(
    authData.slice(32 + 1 + 4 + 16 + 2 + length, authData.length)
  );
  authenticatorData.attestedCredentialData.credentialPublicKey =
    lastCBORObjects;
  if (lastCBORObjects.length > 1)
    authenticatorData.attestedCredentialData.extensions =
      lastCBORObjects[1];

  var pubkey =
    authenticatorData.attestedCredentialData.credentialPublicKey;
  for (let i in pubkey) {
    if (pubkey.hasOwnProperty(i) && pubkey[i] instanceof Uint8Array) {
      pubkey[i] = authnTools.auto(pubkey[i]);
    }
  }

  return authenticatorData;
}

// Function to encode the COSE public key into DER format
export function coseToDerEC(coseKey) {
  // Extract X and Y coordinates from the COSE key
  const x = authnTools.base64urlToUint8Array(coseKey["-2"]);
  const y = authnTools.base64urlToUint8Array(coseKey["-3"]);

  // Construct uncompressed public key (0x04 || X || Y)
  const uncompressedKey = new Uint8Array(1 + x.length + y.length);
  uncompressedKey[0] = 0x04; // Indicates uncompressed point format
  uncompressedKey.set(x, 1);
  uncompressedKey.set(y, 1 + x.length);

  // ASN.1 encoding (manual)
  const ecPublicKeyOID = "06072a8648ce3d0201"; // OID for ecPublicKey
  const prime256v1OID = "06082a8648ce3d030107"; // OID for P-256 (prime256v1)

  // BIT STRING prefix for the public key
  const bitStringPrefix =
    "03" +
    (uncompressedKey.length + 1).toString(16).padStart(2, "0") +
    "00";

  // Sequence encoding
  const publicKeyHex =
    "30" +
    (
      ecPublicKeyOID.length / 2 +
      prime256v1OID.length / 2 +
      bitStringPrefix.length / 2 +
      uncompressedKey.length
    )
      .toString(16)
      .padStart(2, "0") +
    "30" +
    (ecPublicKeyOID.length / 2 + prime256v1OID.length / 2)
      .toString(16)
      .padStart(2, "0") +
    ecPublicKeyOID +
    prime256v1OID +
    bitStringPrefix +
    toHexString(uncompressedKey);

  return publicKeyHex; // Return the DER-encoded EC public key as a hex string
}