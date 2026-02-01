/**
 * Extract script content from a Svelte component.
 *
 * Supports:
 * - <script>
 * - <script lang="ts">
 *
 * Ignores <script context="module"> blocks as they contain module-level
 * exports rather than component instance logic.
 */
export function extractSvelteScript(content: string): { script: string; lang: 'ts' | 'js' } {
  // Match <script> blocks that are NOT context="module"
  // The regex captures the attributes (group 1) and ensures we skip module scripts
  const scriptRegex = /<script(\s+[^>]*)?>[\s\S]*?<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(content)) !== null) {
    const attributes = match[1] || '';

    // Skip module-level scripts (context="module")
    if (/context\s*=\s*["']?module["']?/i.test(attributes)) {
      continue;
    }

    const fullScriptTag = match[0];

    // Extract lang attribute (supports lang="ts" or lang=ts)
    const langMatch = attributes.match(/lang=["']?(ts|typescript)["']?/i);
    const lang: 'ts' | 'js' = langMatch ? 'ts' : 'js';

    // Extract content between script tags
    const script = fullScriptTag
      .replace(/<script[^>]*>/i, '')
      .replace(/<\/script>/i, '')
      .trim();

    return { script, lang };
  }

  throw new Error('No instance <script> block found in Svelte file');
}
