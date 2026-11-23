import { expect, test } from "bun:test";
import { sha256Hex } from "./checksum";

test("computes standard SHA-256 vectors without requiring a secure browser context", () => {
	const encoder = new TextEncoder();
	expect(sha256Hex(encoder.encode("").buffer)).toBe(
		"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
	);
	expect(sha256Hex(encoder.encode("abc").buffer)).toBe(
		"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
	);
	expect(
		sha256Hex(
			encoder.encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")
				.buffer,
		),
	).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
});
