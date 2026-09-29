import type { DomSiteAdapter } from './dom-adapter';
import type { SelectorGroup } from './types';

export interface SelectorCheck {
  selector: string;
  matches: number;
  error?: string;
}

export interface GroupReport {
  group: SelectorGroup;
  /** `ok`: some selector matched. `missing`: none did, which may be fine (e.g. no messages yet). */
  status: 'ok' | 'missing';
  winner?: string;
  checks: SelectorCheck[];
}

export interface DiagnosticsReport {
  site: string;
  /** Origin only; the path can contain a conversation id. */
  origin: string;
  extensionVersion: string;
  userAgent: string;
  groups: GroupReport[];
  lastInject?: ReturnType<DomSiteAdapter['lastInject']>;
}

/** Groups whose absence is expected on a fresh chat and should not read as a failure. */
export const OPTIONAL_GROUPS: SelectorGroup[] = [
  'userTurn',
  'assistantTurn',
  'attachment',
  'scrollContainer',
  'ignoreInMessage',
];

export function runDiagnostics(
  adapter: DomSiteAdapter,
  doc: Document,
  extensionVersion: string,
): DiagnosticsReport {
  const groups = (Object.keys(adapter.config.selectors) as SelectorGroup[])
    .filter((g) => g !== 'ignoreInMessage')
    .map((group): GroupReport => {
      const checks = adapter.config.selectors[group].map((selector): SelectorCheck => {
        try {
          return { selector, matches: doc.querySelectorAll(selector).length };
        } catch (err) {
          return { selector, matches: 0, error: String(err) };
        }
      });
      const winner = checks.find((c) => c.matches > 0)?.selector;
      return { group, status: winner ? 'ok' : 'missing', ...(winner ? { winner } : {}), checks };
    });
  const lastInject = adapter.lastInject();
  return {
    site: adapter.config.label,
    origin: doc.location?.origin ?? '',
    extensionVersion,
    userAgent: doc.defaultView?.navigator.userAgent ?? '',
    groups,
    ...(lastInject ? { lastInject } : {}),
  };
}

/** Plain-text report users can paste into a bug report. Contains selectors and counts only, no page text. */
export function formatDiagnostics(report: DiagnosticsReport): string {
  const lines = [
    `Tessera ${report.extensionVersion} diagnostics`,
    `Site: ${report.site} (${report.origin})`,
    `Browser: ${report.userAgent}`,
    '',
  ];
  for (const g of report.groups) {
    const optional = OPTIONAL_GROUPS.includes(g.group) ? ' (optional)' : '';
    lines.push(`${g.status === 'ok' ? 'OK     ' : 'MISSING'} ${g.group}${optional}`);
    for (const c of g.checks) {
      lines.push(
        `    ${c.matches > 0 ? '✓' : '✗'} ${c.selector}  [${c.matches}]${c.error ? ` error: ${c.error}` : ''}`,
      );
    }
  }
  if (report.lastInject) {
    lines.push(
      '',
      `Last import: ${report.lastInject.ok ? `accepted via ${report.lastInject.strategy}` : 'rejected'}`,
    );
    for (const a of report.lastInject.attempts) {
      lines.push(`    ${a.ok ? '✓' : '✗'} ${a.strategy}${a.reason ? `: ${a.reason}` : ''}`);
    }
  }
  return lines.join('\n');
}
