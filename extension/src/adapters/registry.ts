import { chatgptConfig } from './configs/chatgpt';
import { claudeConfig } from './configs/claude';
import { geminiConfig } from './configs/gemini';
import { mockConfig } from './configs/mock';
import { createDomAdapter, type DomAdapterOptions, type DomSiteAdapter } from './dom-adapter';
import type { SiteConfig } from './types';

export const SITE_CONFIGS: SiteConfig[] = [chatgptConfig, claudeConfig, geminiConfig, mockConfig];

export function adapterFor(url: URL, options?: DomAdapterOptions): DomSiteAdapter | undefined {
  for (const config of SITE_CONFIGS) {
    const adapter = createDomAdapter(config, options);
    if (adapter.matches(url)) return adapter;
  }
  return undefined;
}
