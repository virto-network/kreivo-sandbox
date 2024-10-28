import * as CBOR from 'https://unpkg.com/cbor2@1.7.0/lib/index.js';

import {
  coseToDerEC,
  createCredentials,
  parseAuthenticatorData,
} from "./webauthn.js";

/** @type {PublicKeyCredential} */
let credential;

export async function onCreate(ev) {
  ev.preventDefault();

  try {
    credential = await createCredentials({
      id: Uint8Array.from([5, 6, 7, 8]),
      name: "john.doe@example.org",
      displayName: "John Doe",
    });

    console.log(credential.toJSON());

    /** @type {AuthenticatorAttestationResponse} */
    const response = credential.response;

    document
      .querySelector("#authenticate")
      .classList.remove("button-disabled");

    const clientDataJSON = response.clientDataJSON;
    const clientDataString = new TextDecoder().decode(clientDataJSON);
    const clientData = JSON.parse(clientDataString);

    const attestationObject = CBOR.decode(
      new Uint8Array(response.attestationObject)
    );

    console.log(attestationObject);

    const authData = parseAuthenticatorData(attestationObject.authData);
    // const der = coseToDerEC(
    //   authData.attestedCredentialData.credentialPublicKey
    // );

    // console.log(der);

    document.querySelector("#code").innerHTML = `// Registration result
${JSON.stringify(
      {
        ...credential,
        response: {
          attestationObject: {
            attStmt: attestationObject.attStmt,
            fmt: attestationObject.fmt,
            authData,
          },
          clientDataJSON: clientData,
        },
      },
      null,
      4
    )}`;
    document.querySelector(".code").classList.remove("hidden");
  } catch (error) {
    console.error(error);
  }
}

export async function onAuthenticate(ev) {
  ev.preventDefault();

  try {
    /** @type {Credential} */
    const assertion = await navigator.credentials.get({
      mediation: "silent",
      publicKey: {
        rpId: "localhost",
        challenge: Uint8Array.from([0, 1, 2, 3]),
        allowCredentials: [
          {
            type: "public-key",
            id: credential.rawId,
          },
        ],
      },
    });

    console.log(assertion);

    const clientDataJSON = assertion.response.clientDataJSON;
    const clientDataString = new TextDecoder().decode(clientDataJSON);
    const clientData = JSON.parse(clientDataString);

    const code = document.querySelector("#code").innerHTML;
    document.querySelector("#code").innerHTML = `${code}

// Authentication result
${JSON.stringify(
      {
        ...assertion,
        response: {
          ...assertion.response,
          clientDataJSON: clientData,
          signature: `0x${toHexString(
            new Uint8Array(assertion.response.signature)
          )}`,
        },
      },
      null,
      4
    )}`;
    document.querySelector(".code").classList.remove("hidden");
  } catch (error) {
    console.error(error);
  }
}