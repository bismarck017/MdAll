/**
 * CSV (.csv) to Markdown Converter
 * Pure-JS, serverless — no external library needed. Implements an
 * RFC 4180-style parser (quoted fields, embedded commas/newlines, escaped
 * "" quotes) and renders the result as a single Markdown table, the way
 * xlsxConverter.js renders a sheet.
 *
 * KNOWN LIMITATIONS (best-effort):
 * - Delimiter auto-detection only sniffs comma / semicolon / tab from the
 *   first line; pass options.delimiter to force one explicitly.
 * - Ragged rows (inconsistent column counts) are padded/truncated to match
 *   the header row's column count rather than rejected.
 * - No type inference — every cell renders as its literal text.
 */

export async function convertCsvToMarkdown(file, options = {}) {
    const csvText = typeof file === 'string' ? file : await file.text();
    if (!csvText || !csvText.trim()) return '';

    const delimiter = options.delimiter || sniffDelimiter(csvText);
    const rows = parseCsv(csvText, delimiter);

    return processCsvRows(rows, options);
}

function sniffDelimiter(text) {
    const firstLine = text.split(/\r\n|\r|\n/, 1)[0] || '';
    const candidates = [',', ';', '\t', '|'];
    let best = ',';
    let bestCount = -1;
    for (const c of candidates) {
        const count = firstLine.split(c).length - 1;
        if (count > bestCount) {
            bestCount = count;
            best = c;
        }
    }
    return best;
}

/**
 * RFC 4180-style CSV parser: handles quoted fields containing the
 * delimiter, newlines, and escaped double-quotes ("").
 */
function parseCsv(text, delimiter) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    const len = text.length;

    while (i < len) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
                i++;
                continue;
            }
            field += ch;
            i++;
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
            i++;
            continue;
        }

        if (ch === delimiter) {
            row.push(field);
            field = '';
            i++;
            continue;
        }

        if (ch === '\r') {
            i++;
            continue;
        }

        if (ch === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
            i++;
            continue;
        }

        field += ch;
        i++;
    }

    // Flush trailing field/row (files without a final newline)
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    // Drop fully-blank trailing rows produced by a trailing newline
    while (rows.length > 0 && rows[rows.length - 1].every(c => c === '')) {
        rows.pop();
    }

    return rows;
}

function processCsvRows(rows, options) {
    if (rows.length === 0) return '';

    const useFirstRowAsHeader = options.hasHeader !== false; // default true
    const colCount = rows.reduce((max, r) => Math.max(max, r.length), 1);

    const escapeCell = (val) => String(val ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>').trim();

    const normalizeRow = (row) => {
        const padded = row.slice(0, colCount);
        while (padded.length < colCount) padded.push('');
        return padded.map(escapeCell);
    };

    let headerCells;
    let bodyRows;

    if (useFirstRowAsHeader) {
        headerCells = normalizeRow(rows[0]);
        bodyRows = rows.slice(1);
    } else {
        headerCells = Array.from({ length: colCount }, (_, i) => `Column ${i + 1}`);
        bodyRows = rows;
    }

    if (bodyRows.length === 0 && !useFirstRowAsHeader) {
        return '';
    }

    const headerLine = `| ${headerCells.join(' | ')} |`;
    const sepLine = `| ${headerCells.map(() => '---').join(' | ')} |`;
    const bodyLines = bodyRows.map(r => `| ${normalizeRow(r).join(' | ')} |`);

    return [headerLine, sepLine, ...bodyLines].join('\n');
}
