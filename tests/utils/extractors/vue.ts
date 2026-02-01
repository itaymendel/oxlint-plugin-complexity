/**
 * Extract script content from a Vue Single File Component (SFC).
 *
 * Supports:
 * - <script>
 * - <script setup>
 * - <script lang="ts">
 * - <script setup lang="ts">
 */
export function extractVueScript(content: string): { script: string; lang: 'ts' | 'js' } {
  const scriptMatch = content.match(/<script(\s+[^>]*)?>[\s\S]*?<\/script>/i);

  if (!scriptMatch) {
    throw new Error('No <script> block found in Vue file');
  }

  const fullScriptTag = scriptMatch[0];
  const attributes = scriptMatch[1] || '';

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
