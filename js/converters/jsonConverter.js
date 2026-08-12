/**
 * JSON (.json) to Markdown Converter
 * Converts JSON into GitHub Flavored Markdown (GFM) tables for arrays of objects,
 * structured Markdown headings and bullet lists for objects, or fenced code blocks.
 */
export async function convertJsonToMarkdown(file, options = {}) {
    const rawText = await file.text();
    let data;

    try {
        data = JSON.parse(rawText);
    } catch (err) {
        // If invalid JSON, fallback to fenced code block
        return `\`\`\`json\n${rawText.trim()}\n\`\`\``;
    }

    if (options.jsonFormat === 'codeblock') {
        return `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
    }

    // Auto conversion mode
    return formatJsonValue(data, 1);
}

function formatJsonValue(val, depth = 1) {
    if (val === null || val === undefined) {
        return '_null_';
    }

    if (typeof val !== 'object') {
        return String(val);
    }

    // Case 1: Array of objects or primitives
    if (Array.isArray(val)) {
        if (val.length === 0) return '_Empty Array_';

        // Check if array contains flat objects suitable for a Markdown Table
        const isArrayOfFlatObjects = val.every(item => 
            item && typeof item === 'object' && !Array.isArray(item)
        );

        if (isArrayOfFlatObjects) {
            return convertArrayToMarkdownTable(val);
        }

        // Standard array of primitive items
        return val.map(item => `- ${formatJsonValue(item, depth + 1)}`).join('\n');
    }

    // Case 2: Object
    const keys = Object.keys(val);
    if (keys.length === 0) return '_Empty Object_';

    const lines = [];
    const headingPrefix = '#'.repeat(Math.min(depth, 6));

    for (const key of keys) {
        const itemVal = val[key];
        
        if (typeof itemVal === 'object' && itemVal !== null) {
            lines.push(`\n${headingPrefix} ${capitalize(key)}\n`);
            lines.push(formatJsonValue(itemVal, depth + 1));
        } else {
            lines.push(`- **${key}**: ${itemVal}`);
        }
    }

    return lines.join('\n').trim();
}

function convertArrayToMarkdownTable(arr) {
    // Extract unique headers across all objects in array
    const headers = [];
    arr.forEach(obj => {
        Object.keys(obj).forEach(k => {
            if (!headers.includes(k)) headers.push(k);
        });
    });

    if (headers.length === 0) return '_Empty Table_';

    // Construct Markdown Table
    const headerLine = `| ${headers.join(' | ')} |`;
    const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`;

    const rows = arr.map(obj => {
        const cells = headers.map(h => {
            const cellVal = obj[h];
            if (cellVal === null || cellVal === undefined) return '';
            if (typeof cellVal === 'object') return JSON.stringify(cellVal).replace(/\|/g, '\\|');
            return String(cellVal).replace(/\|/g, '\\|').replace(/\n/g, ' ');
        });
        return `| ${cells.join(' | ')} |`;
    });

    return [headerLine, separatorLine, ...rows].join('\n');
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).replace(/([A-Z])/g, ' $1');
}
