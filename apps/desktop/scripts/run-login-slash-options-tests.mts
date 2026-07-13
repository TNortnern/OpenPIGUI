import assert from "node:assert/strict";
import { isLoginSlashProvider } from "../src/login-slash-providers.ts";

assert.equal(isLoginSlashProvider({ oauthSupported: true, apiKeySetupSupported: false }), true);
assert.equal(isLoginSlashProvider({ oauthSupported: false, apiKeySetupSupported: true }), true);
assert.equal(isLoginSlashProvider({ oauthSupported: true, apiKeySetupSupported: true }), true);
assert.equal(isLoginSlashProvider({ oauthSupported: false, apiKeySetupSupported: false }), false);

// Cursor (pi-cursor-sdk) is API-key only — must appear in /login.
assert.equal(isLoginSlashProvider({ oauthSupported: false, apiKeySetupSupported: true }), true);

console.log("login-slash-options tests passed");
