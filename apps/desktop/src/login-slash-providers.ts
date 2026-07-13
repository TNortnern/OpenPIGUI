/** Providers shown by desktop `/login` (matches pi: OAuth + API-key setup). */
export function isLoginSlashProvider(provider: {
  readonly oauthSupported: boolean;
  readonly apiKeySetupSupported: boolean;
}): boolean {
  return provider.oauthSupported || provider.apiKeySetupSupported;
}
