/**
 * RTF (.rtf) to Markdown Converter
 * Pure-JS, serverless (no external library required — RTF is a plain-text
 * control-word format, unlike PDF/XLSX which need a binary parser).
 *
 * Strategy: tokenize the RTF control stream, skip non-content destinations
 * (\fonttbl, \colortbl, \stylesheet, \info, \pict, headers/footers, etc.),
 * track bold state + font size per run, and split into lines on \par/\line.
 * Lines are then classified into headings/lists/body text using the same
 * "relative font size vs. document average" heuristic pdfConverter.js uses,
 * plus a bold-weighted boost since RTF headings are very often just bold text.
 *
 * KNOWN LIMITATIONS (best-effort, not a full RTF spec implementation):
 * - Tables (\trowd / \cell) are flattened to plain text, not Markdown tables.
 * - Embedded images/objects (\pict, \object) are dropped entirely.
 * - \uN unicode escapes are honored, but the mandatory ASCII fallback
 *   character that follows them is NOT automatically skipped (some RTF
 *   writers emit a single fallback char per \u — if you see stray "?" or
 *   duplicate characters, this is why).
 * - Nested field codes (\field, \fldinst, \fldrslt) are treated like normal
 *   text; hyperlink URLs are not extracted separately.
 */

export async function convertRtfToMarkdown(file, options = {}) {
    const rtfText = typeof file === 'string' ? file : await file.text();

    if (!rtfText || rtfText.indexOf('{\\rtf') === -1) {
        throw new Error('Input does not appear to be a valid RTF document.');
    }

    const lines = tokenizeRtf(rtfText);
    return formatRtfLines(lines, options);
}

// Destinations whose content should never appear in the output
const SKIPPED_DESTINATIONS = new Set([
    'fonttbl', 'colortbl', 'stylesheet', 'info', 'generator', 'pict', 'object',
    'header', 'footer', 'headerf', 'headerl', 'headerr', 'footerf', 'footerl',
    'footerr', 'filetbl', 'listtable', 'listoverridetable', 'revtbl',
    'xmlnstbl', 'themedata', 'colorschememapping', 'datastore', 'rsidtbl',
    'latentstyles', 'panose', 'falt', 'nonshppict', 'shppict', 'blipuid'
]);

/**
 * Walks the raw RTF character stream and produces a flat list of
 * { text, bold, fontSize } line records.
 */
function tokenizeRtf(rtf) {
    const len = rtf.length;
    let i = 0;
    let depth = 0;
    let bold = false;
    const groupStack = [];
    const fontSizeStack = [24]; // half-points; 24 = 12pt default
    let skipDepth = 0;
    let skipStartDepth = null;

    const lines = [];
    let buffer = '';

    function currentFontSize() {
        return fontSizeStack[fontSizeStack.length - 1];
    }

    function flushLine() {
        lines.push({ text: buffer.trim(), bold, fontSize: currentFontSize() });
        buffer = '';
    }

    function handleControlWord(word, num) {
        switch (word) {
            case 'par':
            case 'line':
            case 'row':
                flushLine();
                break;
            case 'tab':
                if (skipDepth === 0) buffer += '\t';
                break;
            case 'cell':
                if (skipDepth === 0) buffer += ' | ';
                break;
            case 'b':
                bold = (num === 0) ? false : true;
                break;
            case 'fs':
                if (num != null) fontSizeStack[fontSizeStack.length - 1] = num;
                break;
            case 'u':
                if (num != null && skipDepth === 0) {
                    const code = num < 0 ? num + 65536 : num;
                    buffer += String.fromCharCode(code);
                }
                break;
            case 'bullet':
                if (skipDepth === 0) buffer += '\u2022 ';
                break;
            default:
                if (SKIPPED_DESTINATIONS.has(word) && skipDepth === 0) {
                    skipDepth = 1;
                    skipStartDepth = depth;
                }
                break;
        }
    }

    while (i < len) {
        const ch = rtf[i];

        if (ch === '\\') {
            i++;
            const next = rtf[i];

            if (next === "'") {
                // Hex-escaped char, e.g. \'e9
                const hex = rtf.substr(i + 1, 2);
                i += 3;
                if (skipDepth === 0) {
                    buffer += String.fromCharCode(parseInt(hex, 16) || 0);
                }
                continue;
            }

            if (/[a-zA-Z]/.test(next)) {
                let word = '';
                while (i < len && /[a-zA-Z]/.test(rtf[i])) {
                    word += rtf[i];
                    i++;
                }
                let paramStr = '';
                let neg = false;
                if (rtf[i] === '-') { neg = true; i++; }
                while (i < len && /[0-9]/.test(rtf[i])) {
                    paramStr += rtf[i];
                    i++;
                }
                const num = paramStr ? (neg ? -parseInt(paramStr, 10) : parseInt(paramStr, 10)) : null;
                if (rtf[i] === ' ') i++; // optional single delimiter space
                handleControlWord(word, num);
                continue;
            }

            // Control symbols
            if (next === '\\' || next === '{' || next === '}') {
                if (skipDepth === 0) buffer += next;
                i++;
                continue;
            }
            if (next === '~') {
                if (skipDepth === 0) buffer += ' ';
                i++;
                continue;
            }
            if (next === '-' || next === '_') {
                if (skipDepth === 0 && next === '-') buffer += '-';
                i++;
                continue;
            }
            if (next === '*') {
                // \* marks the next destination as "ignorable if unknown" —
                // treat conservatively like a skip until we see the control word.
                i++;
                continue;
            }
            // Unrecognized control symbol: drop it
            i++;
            continue;
        }

        if (ch === '{') {
            depth++;
            groupStack.push(bold);
            fontSizeStack.push(currentFontSize());
            i++;
            continue;
        }

        if (ch === '}') {
            if (skipStartDepth !== null && depth === skipStartDepth) {
                skipDepth = 0;
                skipStartDepth = null;
            }
            bold = groupStack.pop() ?? bold;
            fontSizeStack.pop();
            depth--;
            i++;
            continue;
        }

        if (ch === '\r' || ch === '\n') { i++; continue; } // raw whitespace, not \par

        if (skipDepth === 0) buffer += ch;
        i++;
    }

    flushLine();
    return lines.filter((l, idx) => l.text !== '' || idx === lines.length - 1);
}

/**
 * Converts tokenized {text, bold, fontSize} lines into Markdown, using the
 * same relative-size heading heuristic as pdfConverter.js.
 */
function formatRtfLines(lines, options) {
    const nonEmpty = lines.filter(l => l.text.trim());
    if (nonEmpty.length === 0) return '';

    const avgFontSize = nonEmpty.reduce((sum, l) => sum + l.fontSize, 0) / nonEmpty.length;

    const out = [];
    for (const line of lines) {
        const text = line.text.trim();
        if (!text) continue;

        // Bold text gets a size boost for heading purposes — RTF headings
        // are frequently bold + only slightly larger than body text.
        const effectiveSize = line.bold ? line.fontSize * 1.15 : line.fontSize;

        if (effectiveSize >= avgFontSize * 1.5) {
            out.push(`\n# ${text}\n`);
        } else if (effectiveSize >= avgFontSize * 1.25) {
            out.push(`\n## ${text}\n`);
        } else if (effectiveSize >= avgFontSize * 1.1) {
            out.push(`\n### ${text}\n`);
        } else if (/^[•\*\-]\s/.test(text)) {
            out.push(`- ${text.replace(/^[•\*\-]\s*/, '')}`);
        } else if (/^\d+[\.\)]\s/.test(text)) {
            out.push(text);
        } else {
            out.push(text);
        }
    }

    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
