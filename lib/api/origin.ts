/** Native fetch needs an absolute URL; Expo's development host serves API routes too. */
export function resolveApiUrl(path: string, configuredOrigin: string | undefined, developmentHost: string | undefined, native: boolean, development: boolean) {
  const origin = configuredOrigin?.trim().replace(/\/+$/, '');
  if (origin) return `${origin}${path}`;
  if (!native) return path;
  if (development && developmentHost) {
    try {
      const host = developmentHost.includes('://') ? developmentHost : `http://${developmentHost}`;
      const url = new URL(host);
      if (url.protocol === 'http:' || url.protocol === 'https:') return `${url.origin}${path}`;
    } catch { /* Give the same actionable error as a missing host. */ }
  }
  throw new Error('Context cannot reach its API server. Set EXPO_PUBLIC_API_URL to the server address and restart the app.');
}
