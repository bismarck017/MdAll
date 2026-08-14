/**
 * Excel (.xlsx) to Markdown Converter
 * Uses SheetJS (window.XLSX, https://cdnjs.cloudflare.com/ajax/libs/xlsx)
 * to parse the workbook, then renders each sheet as a Markdown table —
 * the tabular equivalent of how pdfConverter.js renders each PDF page.
 *
 * Load SheetJS in the host page before calling this, e.g.:
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
 *
 * KNOWN LIMITATIONS (best-effort):
 * - Merged cells are not un-merged/expanded; only the anchor cell's value
 *   is shown, other cells in the merge render empty.
 * - Cell formatting (bold, colors, number formats) is not carried over —
 *   values are rendered via each cell's formatted display string.
 * - Embedded charts/images are dropped.
 * - Formulas are rendered as their last calculated value, not the formula
 *   text (SheetJS default behavior when a workbook was saved with cached
 *   results).
 */

export async function convertXlsxToMarkdown(file, options = {}) {
    if (!window.XLSX) {
        throw new Error('SheetJS (window.XLSX) library is not loaded.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

    const sheetNames = workbook.SheetNames;
    const sheetOutputs = [];

    sheetNames.forEach((sheetName, idx) => {
        const sheet = workbook.Sheets[sheetName];
        const rows = window.XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            raw: false,
            defval: ''
        });
        const sheetMd = processSheet(sheetName, rows, idx, sheetNames.length, options);
        if (sheetMd.trim()) {
            sheetOutputs.push(sheetMd);
        }
    });

    return sheetOutputs.join('\n\n');
}

function processSheet(sheetName, rows, sheetIdx, totalSheets, options) {
    // Drop fully-empty trailing rows/columns that sheet_to_json sometimes
    // includes based on the sheet's declared dimensions.
    const trimmedRows = trimEmptyEdges(rows);

    const heading = `## ${sheetName}`;

    if (trimmedRows.length === 0) {
        return `${heading}\n\n_(empty sheet)_`;
    }

    const table = rowsToMarkdownTable(trimmedRows, options);

    if (options.xlsxSheetBreak === 'space' || totalSheets === 1) {
        return `${heading}\n\n${table}`;
    } else {
        return `<!-- Sheet ${sheetIdx + 1}: ${sheetName} -->\n${heading}\n\n${table}\n\n---`;
    }
}

function trimEmptyEdges(rows) {
    const isRowEmpty = (row) => !row || row.every(cell => String(cell ?? '').trim() === '');

    let start = 0;
    let end = rows.length - 1;
    while (start <= end && isRowEmpty(rows[start])) start++;
    while (end >= start && isRowEmpty(rows[end])) end--;

    const sliced = rows.slice(start, end + 1);

    const maxCols = sliced.reduce((max, row) => Math.max(max, row.length), 0);
    let lastNonEmptyCol = -1;
    for (let c = 0; c < maxCols; c++) {
        if (sliced.some(row => String(row[c] ?? '').trim() !== '')) {
            lastNonEmptyCol = c;
        }
    }

    return sliced.map(row => row.slice(0, lastNonEmptyCol + 1));
}

function rowsToMarkdownTable(rows, options) {
    const useFirstRowAsHeader = options.xlsxHeaderRow !== false; // default true

    const escapeCell = (val) => String(val ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>').trim();

    const colCount = rows.reduce((max, row) => Math.max(max, row.length), 1);

    const normalizeRow = (row) => {
        const padded = [...row];
        while (padded.length < colCount) padded.push('');
        return padded.map(escapeCell);
    };

    let headerCells;
    let bodyRows;

    if (useFirstRowAsHeader) {
        headerCells = normalizeRow(rows[0]);
        bodyRows = rows.slice(1);
        // If the "header" row is actually blank, fall back to generic column labels
        if (headerCells.every(c => c === '')) {
            headerCells = Array.from({ length: colCount }, (_, i) => `Column ${i + 1}`);
            bodyRows = rows;
        }
    } else {
        headerCells = Array.from({ length: colCount }, (_, i) => `Column ${i + 1}`);
        bodyRows = rows;
    }

    const headerLine = `| ${headerCells.join(' | ')} |`;
    const sepLine = `| ${headerCells.map(() => '---').join(' | ')} |`;
    const bodyLines = bodyRows.map(row => `| ${normalizeRow(row).join(' | ')} |`);

    return [headerLine, sepLine, ...bodyLines].join('\n');
}
