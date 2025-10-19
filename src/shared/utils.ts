import { DoStep } from './types/do_agent';

export function parseActionFromResponse(response: string): any {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');
  return JSON.parse(jsonMatch[0]);
}

export function cleanSelector(selector: string): string {
  return selector.replace(/\[#([^]]+)\]/g, '#$1').replace(/\[.([^]]+)\]/g, '.$1');
}

export function parseSelector(selector: string): any {
  const parts: { element: string; id: string; classes: string[] } = { element: '', id: '', classes: [] };
  const match = selector.match(/([a-z]+)?(?:#([a-z0-9-]+))?(?:\.( [a-z0-9-]+)+)?/i);
  if (match) {
    parts.element = match[1] || '';
    parts.id = match[2] || '';
    parts.classes = match[3] ? match[3].split('.') : [];
  }
  return parts;
}

export function getSelectedProvider(): string {
  return 'anthropic';
}

export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}