import { Route } from '../types';

function extractRouteNumber(value: string): number | null {
  const match = value.match(/(\d+)/);
  if (!match) return null;
  const num = Number.parseInt(match[1], 10);
  return Number.isNaN(num) ? null : num;
}

/**
 * Sorts bus routes naturally by route number (e.g. TB-01, TB-02, ..., TB-10).
 */
export function sortRoutesByOrder(routes: Route[]): Route[] {
  return [...routes].sort((a, b) => {
    const codeA = (a.code || '').trim();
    const codeB = (b.code || '').trim();

    const numA = extractRouteNumber(codeA) ?? extractRouteNumber(a.name || '');
    const numB = extractRouteNumber(codeB) ?? extractRouteNumber(b.name || '');

    if (numA !== null && numB !== null && numA !== numB) {
      return numA - numB;
    }

    const codeCmp = codeA.localeCompare(codeB, 'vi', { numeric: true, sensitivity: 'base' });
    if (codeCmp !== 0) return codeCmp;

    return (a.name || '').localeCompare(b.name || '', 'vi', {
      numeric: true,
      sensitivity: 'base',
    });
  });
}
