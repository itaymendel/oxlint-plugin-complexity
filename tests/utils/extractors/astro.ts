/**
 * Extract frontmatter script content from an Astro component.
 *
 * Astro uses --- fenced frontmatter for component logic:
 * ```astro
 * ---
 * // This is the script content
 * import { foo } from './utils';
 * const greeting = computeGreeting();
 * ---
 * <html>{greeting}</html>
 * ```
 *
 * Frontmatter is always TypeScript by default in Astro.
 */
export function extractAstroScript(content: string): { script: string; lang: 'ts' | 'js' } {
  // Match content between --- fences at the start of the file
  // The frontmatter must start at the beginning of the file
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (!frontmatterMatch) {
    throw new Error('No frontmatter (---) block found in Astro file');
  }

  const script = frontmatterMatch[1].trim();

  // Astro frontmatter is always TypeScript
  return { script, lang: 'ts' };
}
