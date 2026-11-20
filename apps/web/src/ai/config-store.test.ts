import { expect, test } from "bun:test";
import {
  decryptConfiguration, encryptConfiguration, publicProviderConfiguration,
  type AIProviderConfiguration,
} from "./config-store";

process.env.BETTER_AUTH_SECRET = "only-for-test-secret-with-32-characters";

test("encrypted credentials decrypt on host but are redacted from API views", () => {
  const original: AIProviderConfiguration = {
    allowPaid: true,
    accounts: [{ provider: "moonshot", model: "test-model", key: "TEST-SECRET-PRIVATE",
      enabled: true, priority: 10 }],
  };
  const encrypted = encryptConfiguration(original);
  expect(JSON.stringify(encrypted)).not.toContain("TEST-SECRET-PRIVATE");
  expect(decryptConfiguration(encrypted)).toEqual(original);
  const publicView = publicProviderConfiguration(original);
  expect(JSON.stringify(publicView)).not.toContain("TEST-SECRET-PRIVATE");
  expect(publicView.accounts[0].configured).toBe(true);
});

test("tampered provider vault is rejected by AES-GCM", () => {
  const value = encryptConfiguration({ allowPaid: false, accounts: [] });
  expect(() => decryptConfiguration({ ...value, ciphertext: "bm90LXZhbGlkLWNpcGhlcnRleHQ=" })).toThrow();
});
