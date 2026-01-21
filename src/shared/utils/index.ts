export * from './navigation';

export function escapeXml(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function shrinkUrl(fullUrl: string) {
  try {
    const { hostname, pathname } = new URL(fullUrl);
    
    if (!pathname || pathname === '/') {
      return hostname;
    }

    return `${hostname}...`;
  } catch (e) {
    return fullUrl;
  }
}
