/**
 * XML (.xml) to Markdown Converter
 * Uses the browser's native DOMParser (no external library needed).
 * Unlike PDF, XML has no visual layout to infer structure from — instead
 * this walks the element tree and infers Markdown structure from *nesting*:
 *   - Element depth maps to heading level (capped at h6)
 *   - Repeated sibling elements with the same tag name become a bullet list
 *     (or a table, if every sibling has the same set of child-element names —
 *     a common shape for record-like XML such as <items><item>...</item></items>)
 *   - Attributes render as inline `key="value"` annotations
 *   - Leaf text nodes render as plain paragraph text
 *
 * KNOWN LIMITATIONS (best-effort, not a general XML-to-prose translator):
 * - Mixed content (text interleaved with child elements at the same level)
 *   is flattened — child element output is appended after the text, not
 *   interleaved in original document order.
 * - XML namespaces are preserved in tag names as-is (e.g. "ns:tag") but are
 *   not resolved against their namespace URIs.
 * - CDATA sections are unwrapped and treated as plain text.
 * - Processing instructions and DOCTYPE declarations are dropped.
 */

export async function convertXmlToMarkdown(file, options = {}) {
    const xmlText = typeof file === 'string' ? file : await file.text();

    if (!window.DOMParser) {
        throw new Error('DOMParser is not available in this environment.');
    }

    const parser = new window.DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
        throw new Error('Failed to parse XML: ' + parserError.textContent.trim());
    }

    const root = doc.documentElement;
    if (!root) return '';

    const md = renderElement(root, 0, options);
    return md.replace(/\n{3,}/g, '\n\n').trim();
}

function localName(el) {
    return el.tagName || el.nodeName;
}

function getAttrString(el) {
    if (!el.attributes || el.attributes.length === 0) return '';
    const parts = [];
    for (const attr of el.attributes) {
        parts.push(`${attr.name}="${attr.value}"`);
    }
    return ` _(${parts.join(', ')})_`;
}

function directText(el) {
    let text = '';
    for (const node of el.childNodes) {
        if (node.nodeType === 3 /* TEXT_NODE */ || node.nodeType === 4 /* CDATA */) {
            text += node.textContent;
        }
    }
    return text.replace(/\s+/g, ' ').trim();
}

function childElements(el) {
    return Array.from(el.childNodes).filter(n => n.nodeType === 1 /* ELEMENT_NODE */);
}

/**
 * Groups consecutive same-tag siblings so repeated records (e.g. many
 * <item> under <items>) render as a list/table rather than N separate
 * headings.
 */
function groupConsecutiveByTag(elements) {
    const groups = [];
    for (const el of elements) {
        const tag = localName(el);
        const last = groups[groups.length - 1];
        if (last && last.tag === tag) {
            last.items.push(el);
        } else {
            groups.push({ tag, items: [el] });
        }
    }
    return groups;
}

/** True if every element has only leaf (text-only) children with the same tag set — a good fit for a Markdown table. */
function isTableable(elements) {
    if (elements.length < 2) return false;
    let referenceKeys = null;
    for (const el of elements) {
        const kids = childElements(el);
        if (kids.length === 0) return false;
        const keys = kids.map(localName).sort().join('|');
        if (kids.some(k => childElements(k).length > 0)) return false; // must be leaf children
        if (referenceKeys === null) {
            referenceKeys = keys;
        } else if (keys !== referenceKeys) {
            return false;
        }
    }
    return true;
}

function renderAsTable(elements) {
    const columns = childElements(elements[0]).map(localName);
    const headerRow = `| ${columns.join(' | ')} |`;
    const sepRow = `| ${columns.map(() => '---').join(' | ')} |`;
    const bodyRows = elements.map(el => {
        const kids = childElements(el);
        const cellFor = (col) => {
            const match = kids.find(k => localName(k) === col);
            const val = match ? directText(match) : '';
            return val.replace(/\|/g, '\\|');
        };
        return `| ${columns.map(cellFor).join(' | ')} |`;
    });
    return [headerRow, sepRow, ...bodyRows].join('\n');
}

function headingPrefix(depth) {
    const level = Math.min(depth + 1, 6);
    return '#'.repeat(level);
}

function renderElement(el, depth, options) {
    const tag = localName(el);
    const attrs = getAttrString(el);
    const kids = childElements(el);
    const text = directText(el);

    const lines = [];
    lines.push(`\n${headingPrefix(depth)} ${tag}${attrs}\n`);

    if (text) {
        lines.push(text);
    }

    if (kids.length > 0) {
        const groups = groupConsecutiveByTag(kids);
        for (const group of groups) {
            if (group.items.length >= 2 && isTableable(group.items)) {
                lines.push(`\n${headingPrefix(depth + 1)} ${group.tag} (${group.items.length})\n`);
                lines.push(renderAsTable(group.items));
            } else if (group.items.length >= 2 && group.items.every(it => childElements(it).length === 0)) {
                // Simple repeated leaf elements -> bullet list
                lines.push(`\n${headingPrefix(depth + 1)} ${group.tag}\n`);
                for (const item of group.items) {
                    const val = directText(item);
                    const itemAttrs = getAttrString(item);
                    lines.push(`- ${val}${itemAttrs}`);
                }
            } else {
                for (const item of group.items) {
                    lines.push(renderElement(item, depth + 1, options));
                }
            }
        }
    }

    return lines.join('\n');
}
