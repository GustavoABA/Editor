import { afterEach, describe, expect, it } from "bun:test";
import { generateUUID } from "../id";

const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(
	globalThis,
	"crypto",
);

afterEach(() => {
	if (originalCryptoDescriptor) {
		Object.defineProperty(globalThis, "crypto", originalCryptoDescriptor);
		return;
	}
	Reflect.deleteProperty(globalThis, "crypto");
});

describe("generateUUID", () => {
	it("uses the browser-compatible fallback when randomUUID is unavailable", () => {
		Object.defineProperty(globalThis, "crypto", {
			configurable: true,
			value: {
				getRandomValues(bytes: Uint8Array) {
					bytes.fill(0xab);
					return bytes;
				},
			},
		});

		expect(generateUUID()).toBe("abababab-abab-4bab-abab-abababababab");
	});

	it("still produces an RFC 4122 v4-shaped id without Web Crypto", () => {
		Object.defineProperty(globalThis, "crypto", {
			configurable: true,
			value: undefined,
		});

		expect(generateUUID()).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
	});
});
