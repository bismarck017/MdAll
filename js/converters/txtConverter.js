/**
 * Plain Text (.txt) to Markdown Converter
 * Reads text content, sanitizes line breaks (\r\n -> \n), cleans trailing whitespace,
 * and formats double line breaks into clean Markdown paragraphs.
 */
export async function convertTxtToMarkdown(file) {
    const rawText = await file.text();
    if (!rawText || !rawText.trim()) {
        return '';
    }

    // Normalize Windows/Mac line endings to Unix \n
    let normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Split into paragraphs by double newlines or consecutive empty lines
    const paragraphs = normalized.split(/\n{2,}/);

    const cleanedParagraphs = paragraphs.map(p => {
        // Within each paragraph, collapse single line breaks into a single space unless it looks like a list
        const lines = p.split('\n').map(l => l.trim());
        
        // If lines look like list items or headings, keep them separated by newlines
        const isListOrHeader = lines.every(l => 
            /^[-*+]\s/.test(l) || /^\d+\.\s/.test(l) || /^#+\s/.test(l) || l === ''
        );

        if (isListOrHeader) {
            return lines.join('\n');
        } else {
            return lines.filter(Boolean).join(' ');
        }
    });

    return cleanedParagraphs.join('\n\n').trim();
}
