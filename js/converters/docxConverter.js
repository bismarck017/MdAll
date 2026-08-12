/**
 * DOCX (.docx) to Markdown Converter
 * Uses Mammoth.js browser build to extract HTML from arrayBuffer,
 * then converts HTML to standardized Markdown via Turndown.
 */
import { convertHtmlStringToMarkdown } from './htmlConverter.js';

export async function convertDocxToMarkdown(file, options = {}) {
    if (!window.mammoth) {
        throw new Error('Mammoth.js library is not loaded.');
    }

    // Ingest DOCX file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Convert DOCX ArrayBuffer to HTML
    const result = await window.mammoth.convertToHtml({ arrayBuffer });
    const htmlOutput = result.value;

    if (!htmlOutput || !htmlOutput.trim()) {
        return '_Empty DOCX document_';
    }

    // Pass extracted HTML through Turndown standardizer
    return convertHtmlStringToMarkdown(htmlOutput, options);
}
