

export function isLikelyUrl(input: string): boolean {
  const trimmed = input.trim();
  
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return true;
  }
  
  const tldPattern = /\.(com|org|net|io|dev|co|app|edu|gov|me|info|biz|tv|cc|ai|xyz)($|\/)/i;
  if (tldPattern.test(trimmed)) {
    return true;
  }
  
  if (trimmed.includes('.') && !trimmed.includes(' ') && trimmed.length > 3) {
    return true;
  }
  
  if (trimmed.startsWith('localhost') || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(trimmed)) {
    return true;
  }
  
  return false;
}
