// Functions to aid in the data conversion for WebAuthn
export function auto(data) {
	if (typeof data === 'string') {
		if (!isBase64any(data)) {
			data = stringToBase64url(data);
		}
		return base64urlToUint8Array(data);
	}
	else if (data instanceof Uint8Array) {
		return uint8ArrayToBase64url(data);
	}
	else if (data instanceof Array || data instanceof ArrayBuffer) {
		return uint8ArrayToBase64url(new Uint8Array(data));
	}
	throw ('AuthnTools: Convert error.');
}

// From Base64
export function isBase64any(test) {
	return new RegExp(/^(?:[A-Za-z0-9_\-+/]{4})*(?:[A-Za-z0-9_\-+/]{2}={0,2}|[A-Za-z0-9_\-+/]{3}={0,1})?$/).test(test) ? true : false;
}

export function isBase64url(test) {
	return new RegExp(/^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2}={0,2}|[A-Za-z0-9_-]{3}={0,1})?$/).test(test) ? true : false;
}

export function isBase64(test) {
	return new RegExp(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}={0,2}|[A-Za-z0-9+/]{3}={0,1})?$/).test(test) ? true : false;
}

// Base64 URL - Uint8Array
export function base64urlToUint8Array(base64url) {
	return base64ToUint8Array(base64urlToBase64(base64url));
}

export function uint8ArrayToBase64url(array) {
	return base64ToBase64url(uint8ArrayToBase64(array));
}

// Base64 - Uint8Array
export function base64ToUint8Array(base64) {
	var raw = window.atob(base64);
	var rawLength = raw.length;
	var array = new Uint8Array(new ArrayBuffer(rawLength));

	for (var i = 0; i < rawLength; i++) {
		array[i] = raw.charCodeAt(i);
	}
	return array;
}

export function uint8ArrayToBase64(array) {
	var string = String.fromCharCode.apply(null, new Uint8Array(array));
	return stringToBase64(string);
}

// Base64 URL - Base64
export function base64urlToBase64(base64url) {
	var base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
	while (base64.length % 4 != 0) {
		base64 += '=';
	}
	return base64;
}

export function base64ToBase64url(base64) {
	var base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=*$/, '');
	return base64url;
}

/**
 * Converts a {@link Uint8Array} to a {@link Number}.
 * @param {Uint8Array} array 
 * @param {number} length 
 * @returns {number}
 */
export function uint8ArrayToInt(array, length = 0) {
	if (length == 0) length = array.length;
	if (length == 0) throw ("Error zero length.");
	var dataView = new DataView(new ArrayBuffer(length));
	array.forEach((value, index) => dataView.setUint8(index, value));
	if (length == 1 || length == 2 || length == 4)
		return dataView['getUint' + (length * 8)]();
	else
		throw ("Error length " + length + " not supported.");
}

export function intToUint8Array(int, length = 0, reverse = false) {
	var array = new Uint8Array(length);
	for (let i = 0; i < array.length; i++) {
		var byte = int & 0xff;
		array[i] = byte;
		int = (int - byte) / 256;
	}
	return reverse ? array.reverse() : array;
}

// Uint8Array - Hex
export function uint8ArrayToHex(array) {
	return Array.from(new Uint8Array(array), function (byte) {
		return ('0' + (byte & 0xFF).toString(16)).slice(-2);
	}).join('');
}

export function hexToUint8Array(hex) {
	for (var bytes = [], c = 0; c < hex.length; c += 2)
		bytes.push(parseInt(hex.substr(c, 2), 16));
	return new Uint8Array(bytes);
}

// Base64 - String
export function base64ToString(base64) {
	return window.atob(base64);
}

export function stringToBase64(string) {
	return window.btoa(string);
}

// Base64 URL - String
export function base64urlToString(base64) {
	return base64ToString(base64urlToBase64(base64));
}

export function stringToBase64url(string) {
	return base64ToBase64url(stringToBase64(string));
}

// Auto to base64
export function autoToBase64url(value) {
	if (typeof value == 'string') {
		// If array as string
		if ((/^\s*\[(\s*\d+\s*,)*(\s*\d+\s*)+\]\s*$/).test(value)) {
			return uint8ArrayToBase64url(JSON.parse(value));
		}
		// Normal string
		return stringToBase64url(value);
	}
	throw ('AuthnTools: Convert error.');
}

// Serialize & Unserialize functions below is based on
// https://gist.github.com/jonathanlurie/04fa6343e64f750d03072ac92584b5df
export function serialize(obj) {
	let parseObject = function (value) {
		// Parse special arrays
		if (
			value instanceof Int8Array ||
			value instanceof Uint8Array ||
			value instanceof Uint8ClampedArray ||
			value instanceof Int16Array ||
			value instanceof Uint16Array ||
			value instanceof Int32Array ||
			value instanceof Uint32Array ||
			value instanceof Float32Array ||
			value instanceof Float64Array ||
			value instanceof ArrayBuffer
		) {
			var replacement = {
				constructor: value.constructor.name,
				data: Array.apply([], value instanceof ArrayBuffer ? new Uint8Array(value) : value),
				flag: 'FLAG_TYPED_ARRAY'
			}
			return replacement;
		}
		// Parse each array object
		else if (value instanceof Array) {
			let o = [];
			for (let i = 0; i < value.length; i++) {
				o.push(parseObject(value[i]));
			}
			return o;
		}
		// Parse objects
		else if (
			typeof value === 'object' && !(
				//typeof value === 'string' ||
				//typeof value === 'number' ||
				value instanceof Array ||
				//typeof value === 'boolean' ||
				value === null
			)
		) {
			let o = {};
			for (let i in value) {
				try {
					if (typeof value[i] !== 'function') {
						o[i] = parseObject(value[i]);
					}
				} catch (e) {
					console.log('Failed to parse item from object', i, value);
				};
			}
			return o;
		}
		return value;
	};
	return JSON.stringify(parseObject(obj));
}

export function unserialize(jsonStr) {
	return JSON.parse(jsonStr, function (key, value) {
		try {
			if (value.hasOwnProperty('flag') && value.flag === 'FLAG_TYPED_ARRAY') {
				if (value.constructor === 'ArrayBuffer')
					return new Uint8Array(value.data).buffer;
				return new window[value.constructor](value.data);
			}
		} catch (e) { }
		return value;
	});
}

export const ianaAlgorithms = {
	"-65535": "RSASSA-PKCS1-v1_5 using SHA-1",
	"-259": "RSASSA-PKCS1-v1_5 using SHA-512",
	"-258": "RSASSA-PKCS1-v1_5 using SHA-384",
	"-257": "RSASSA-PKCS1-v1_5 using SHA-256",
	"-47": "ECDSA using secp256k1 curve and SHA-256",
	//"-46" : "HSS/LMS hash-based digital signature",
	//"-45" : "256-bit SHAKE",
	//"-44" : "SHA-2 512-bit Hash",
	//"-43" : "SHA-2 384-bit Hash",
	"-42": "RSAES-OAEP w/ SHA-512",
	"-41": "RSAES-OAEP w/ SHA-256",
	"-40": "RSAES-OAEP w/ SHA-1",
	"-39": "RSASSA-PSS w/ SHA-512",
	"-38": "RSASSA-PSS w/ SHA-384",
	"-37": "RSASSA-PSS w/ SHA-256",
	"-36": "ECDSA w/ SHA-512",
	"-35": "ECDSA w/ SHA-384",
	//"-34" : "ECDH SS w/ Concat KDF and AES Key Wrap w/ 256-bit key",
	//"-33" : "ECDH SS w/ Concat KDF and AES Key Wrap w/ 192-bit key",
	//"-32" : "ECDH SS w/ Concat KDF and AES Key Wrap w/ 128-bit key",
	//"-31" : "ECDH ES w/ Concat KDF and AES Key Wrap w/ 256-bit key",
	//"-30" : "ECDH ES w/ Concat KDF and AES Key Wrap w/ 192-bit key",
	//"-29" : "ECDH ES w/ Concat KDF and AES Key Wrap w/ 128-bit key",
	//"-28" : "ECDH SS w/ HKDF - generate key directly",
	//"-27" : "ECDH SS w/ HKDF - generate key directly",
	//"-26" : "ECDH ES w/ HKDF - generate key directly",
	//"-25" : "ECDH ES w/ HKDF - generate key directly",
	//"-18" : "128-bit SHAKE",
	//"-17" : "SHA-2 512-bit Hash truncated to 256-bits",
	//"-16" : "SHA-2 256-bit Hash",
	//"-15" : "SHA-2 256-bit Hash truncated to 64-bits",
	//"-14" : "SHA-1 Hash",
	//"-13" : "Shared secret w/ AES-MAC 256-bit key",
	//"-12" : "Shared secret w/ AES-MAC 128-bit key",
	//"-11" : "Shared secret w/ HKDF and SHA-512",
	//"-10" : "Shared secret w/ HKDF and SHA-256",
	"-8": "EdDSA",
	"-7": "ECDSA w/ SHA-256",
	//"-6" : "Direct use of CEK",
	//"-5" : "AES Key Wrap w/ 256-bit key",
	//"-4" : "AES Key Wrap w/ 192-bit key",
	//"-3" : "AES Key Wrap w/ 128-bit key",
	//"1" : "AES-GCM mode w/ 128-bit key, 128-bit tag",
	//"2" : "AES-GCM mode w/ 192-bit key, 128-bit tag",
	//"3" : "AES-GCM mode w/ 256-bit key, 128-bit tag",
	//"4" : "HMAC w/ SHA-256 truncated to 64 bits",
	//"5" : "HMAC w/ SHA-256",
	//"6" : "HMAC w/ SHA-384",
	//"7" : "HMAC w/ SHA-512",
	//"10" : "AES-CCM mode 128-bit key, 64-bit tag, 13-byte nonce",
	//"11" : "AES-CCM mode 256-bit key, 64-bit tag, 13-byte nonce",
	//"12" : "AES-CCM mode 128-bit key, 64-bit tag, 7-byte nonce",
	//"13" : "AES-CCM mode 256-bit key, 64-bit tag, 7-byte nonce",
	//"14" : "AES-MAC 128-bit key, 64-bit tag",
	//"15" : "AES-MAC 256-bit key, 64-bit tag",
	//"24" : "ChaCha20/Poly1305 w/ 256-bit key, 128-bit tag",
	//"25" : "AES-MAC 128-bit key, 128-bit tag",
	//"26" : "AES-MAC 256-bit key, 128-bit tag",
	//"30" : "AES-CCM mode 128-bit key, 128-bit tag, 13-byte nonce",
	//"31" : "AES-CCM mode 256-bit key, 128-bit tag, 13-byte nonce",
	//"32" : "AES-CCM mode 128-bit key, 128-bit tag, 7-byte nonce",
	//"33" : "AES-CCM mode 256-bit key, 128-bit tag, 7-byte nonce"
};

export const ianaAlgorithmsSecurity = [
	{ priority: 90, name: 'PS512', code: -39, description: 'RSASSA-PSS w/ SHA-512', recommended: true },
	{ priority: 90, name: 'ES512', code: -36, description: 'ECDSA w/ SHA-512', recommended: true },
	{ priority: 90, name: 'EdDSA', code: -8, description: 'EdDSA', recommended: true },
	{ priority: 90, name: 'RSAES-OAEP w/ SHA-512', code: -42, description: 'RSAES-OAEP w/ SHA-512', recommended: true },
	{ priority: 90, name: 'RS512', code: -259, description: 'RSASSA-PKCS1-v1_5 using SHA-512', recommended: false },
	{ priority: 60, name: 'PS384', code: -38, description: 'RSASSA-PSS w/ SHA-384', recommended: true },
	{ priority: 60, name: 'ES384', code: -35, description: 'ECDSA w/ SHA-384', recommended: true },
	{ priority: 60, name: 'RS384', code: -258, description: 'RSASSA-PKCS1-v1_5 using SHA-384', recommended: false },
	{ priority: 30, name: 'RSAES-OAEP w/ SHA-256', code: -41, description: 'RSAES-OAEP w/ SHA-256', recommended: true },
	{ priority: 30, name: 'PS256', code: -37, description: 'RSASSA-PSS w/ SHA-256', recommended: true },
	{ priority: 30, name: 'ES256', code: -7, description: 'ECDSA w/ SHA-256', recommended: true },
	{ priority: 30, name: 'ES256K', code: -47, description: 'ECDSA using secp256k1 curve and SHA-256', recommended: false },
	{ priority: 30, name: 'RS256', code: -257, description: 'RSASSA-PKCS1-v1_5 using SHA-256', recommended: false },
	{ priority: 25, name: 'RSAES-OAEP w/ RFC 8017 default parameters', code: -40, description: 'RSAES-OAEP w/ SHA-1', recommended: true },
	{ priority: 25, name: 'RS1', code: -65535, description: 'RSASSA-PKCS1-v1_5 using SHA-1', recommended: false, deprecated: true },
	{ priority: 25, name: 'WalnutDSA', code: -260, description: 'WalnutDSA signature', recommended: false }
];
