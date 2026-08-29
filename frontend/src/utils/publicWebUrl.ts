/**
 * Returns the public web origin used in shareable QR links.
 *
 * By default, QR links use the origin currently open in the browser: local
 * development creates local links, and a deployed page creates deployed links.
 * VITE_PUBLIC_WEB_URL is only for deployments that need one canonical public
 * origin (for example, a custom domain). Only an HTTP(S) origin is accepted;
 * paths and credentials are intentionally discarded.
 */
export function getPublicWebOrigin(currentOrigin: string): string | null {
  const configuredUrl = import.meta.env.VITE_PUBLIC_WEB_URL?.trim();
  if (!configuredUrl) return currentOrigin;

  try {
    const url = new URL(configuredUrl);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
