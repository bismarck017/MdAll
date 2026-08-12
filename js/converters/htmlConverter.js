/**
 * HTML (.html) to Markdown Converter
 * Uses native browser DOMParser to sanitize HTML and TurndownService (with GFM plugin)
 * to output clean, standardized Markdown.
 */

export async function convertHtmlToMarkdown(file, options = {}) {
    const rawHtml = await file.text();
    return convertHtmlStringToMarkdown(rawHtml, options);
}

export function convertHtmlStringToMarkdown(rawHtml, options = {}) {
    if (!rawHtml || !rawHtml.trim()) return '';

    // 1. Parse raw HTML string into virtual DOM
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    // 2. Remove script, style, noscript, svg, and iframe elements
    const elementsToRemove = doc.querySelectorAll('script, style, noscript, iframe, svg, meta, link');
    elementsToRemove.forEach(el => el.remove());

    // Get cleaned body innerHTML or main element
    const cleanContent = doc.body ? doc.body.innerHTML : rawHtml;

    // 3. Initialize TurndownService with customizable settings
    const turndownService = new window.TurndownService({
        headingStyle: options.headingStyle || 'atx',
        bulletListMarker: options.bulletMarker || '-',
        codeBlockStyle: options.codeBlockStyle || 'fenced',
        emDelimiter: '*',
        strongDelimiter: '**'
    });

    // 4. Apply GFM plugin (tables, strikethrough, task lists)
    if (window.turndownPluginGfm) {
        turndownService.use(window.turndownPluginGfm.gfm);
    }

    // 5. Custom Rules
    // Keep images with alt text clean
    turndownService.addRule('cleanImages', {
        filter: 'img',
        replacement: function (content, node) {
            const alt = node.getAttribute('alt') || '';
            const src = node.getAttribute('src') || '';
            const title = node.getAttribute('title') || '';
            return src ? `![${alt}](${src}${title ? ` "${title}"` : ''})` : '';
        }
    });

    // Convert HTML string to Markdown
    let markdown = turndownService.turndown(cleanContent);

    // Normalize multiple blank lines
    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

    return markdown;
}
