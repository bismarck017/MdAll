/**
 * File Export Utilities
 * Provides single file .md downloading.
 */

export function downloadSingleMarkdown(filename, content) {
    const mdFilename = filename.substring(0, filename.lastIndexOf('.')) || filename;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${mdFilename}.md`;
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
