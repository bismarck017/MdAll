/**
 * PDF (.pdf) to Markdown Converter
 * Uses Mozilla PDF.js (pdfjs-dist) to extract text layer from ArrayBuffer,
 * analyzes line positioning and font heights to infer headers, list items,
 * and page separators.
 */

export async function convertPdfToMarkdown(file, options = {}) {
    if (!window.pdfjsLib) {
        throw new Error('PDF.js library is not loaded.');
    }

    // Set worker source if not already configured
    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;

    const numPages = pdfDoc.numPages;
    const pageOutputs = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = processPdfPageText(textContent, pageNum, numPages, options);
        if (pageText.trim()) {
            pageOutputs.push(pageText);
        }
    }

    return pageOutputs.join('\n\n');
}

function processPdfPageText(textContent, pageNum, totalPages, options) {
    if (!textContent.items || textContent.items.length === 0) {
        return '';
    }

    // Group items by line based on Y coordinate (transform[5])
    const linesMap = new Map();

    for (const item of textContent.items) {
        const text = item.str;
        if (!text && !item.hasEOL) continue;

        // Y coordinate rounded to nearest 3px to cluster same-line text
        const y = Math.round(item.transform[5] / 3) * 3;
        const fontSize = Math.abs(item.transform[0]) || 10;
        const x = item.transform[4];

        if (!linesMap.has(y)) {
            linesMap.set(y, []);
        }
        linesMap.get(y).push({ text, x, fontSize });
    }

    // Sort lines by Y descending (PDF coordinates start from bottom-left)
    const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a);

    const formattedLines = [];
    let avgFontSize = 10;
    let totalFontCount = 0;

    // Calculate baseline average font size for header detection
    linesMap.forEach(items => {
        items.forEach(it => {
            if (it.text.trim()) {
                avgFontSize += it.fontSize;
                totalFontCount++;
            }
        });
    });
    if (totalFontCount > 0) avgFontSize = avgFontSize / totalFontCount;

    for (const y of sortedY) {
        const items = linesMap.get(y);
        // Sort items in line by X coordinate ascending
        items.sort((a, b) => a.x - b.x);

        const lineText = items.map(it => it.text).join(' ').replace(/\s+/g, ' ').trim();
        if (!lineText) continue;

        const maxLineFontSize = Math.max(...items.map(it => it.fontSize));

        // Detect Heading Level based on font size threshold
        if (maxLineFontSize >= avgFontSize * 1.5) {
            formattedLines.push(`\n# ${lineText}\n`);
        } else if (maxLineFontSize >= avgFontSize * 1.25) {
            formattedLines.push(`\n## ${lineText}\n`);
        } else if (maxLineFontSize >= avgFontSize * 1.1) {
            formattedLines.push(`\n### ${lineText}\n`);
        } else if (/^•|^\*|^-/.test(lineText)) {
            formattedLines.push(`- ${lineText.replace(/^[•\*-]\s*/, '')}`);
        } else if (/^\d+[\.\)]\s/.test(lineText)) {
            formattedLines.push(lineText);
        } else {
            formattedLines.push(lineText);
        }
    }

    const pageBody = formattedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    // Page Separator setting
    if (options.pdfPageBreak === 'space' || totalPages === 1) {
        return pageBody;
    } else {
        return `<!-- Page ${pageNum} -->\n${pageBody}\n\n---`;
    }
}
