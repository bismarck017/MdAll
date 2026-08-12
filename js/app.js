/**
 * Main Application Logic & Coordinator
 * Handles UI interactions, Drag-and-Drop file ingestion, conversion dispatch,
 * live preview rendering, raw code editor synchronization, and settings management.
 */

import { convertTxtToMarkdown } from './converters/txtConverter.js';
import { convertJsonToMarkdown } from './converters/jsonConverter.js';
import { convertHtmlToMarkdown } from './converters/htmlConverter.js';
import { convertDocxToMarkdown } from './converters/docxConverter.js';
import { convertPdfToMarkdown } from './converters/pdfConverter.js';
import { downloadSingleMarkdown } from './utils/exporter.js';

// Application State
const state = {
    fileQueue: [],
    activeFileId: null,
    activeTab: 'preview', // 'preview' or 'editor'
    settings: {
        headingStyle: 'atx',
        bulletMarker: '-',
        codeBlockStyle: 'fenced',
        jsonFormat: 'auto',
        pdfPageBreak: 'hr'
    }
};

// DOM Element References
const elements = {
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    queueList: document.getElementById('queueList'),
    emptyState: document.getElementById('emptyState'),
    queueCount: document.getElementById('queueCount'),
    queueSearchInput: document.getElementById('queueSearchInput'),
    btnClearAll: document.getElementById('btnClearAll'),
    btnConvertAll: document.getElementById('btnConvertAll'),
    
    statCount: document.getElementById('statCount'),
    statSize: document.getElementById('statSize'),
    
    tabPreview: document.getElementById('tabPreview'),
    tabEditor: document.getElementById('tabEditor'),
    previewContainer: document.getElementById('previewContainer'),
    editorContainer: document.getElementById('editorContainer'),
    markdownPreview: document.getElementById('markdownPreview'),
    rawMarkdownTextarea: document.getElementById('rawMarkdownTextarea'),
    
    activeFileTitle: document.getElementById('activeFileTitle'),
    btnCopyMd: document.getElementById('btnCopyMd'),
    btnDownloadSingle: document.getElementById('btnDownloadSingle'),
    btnSettings: document.getElementById('btnSettings'),
    
    editorWordCount: document.getElementById('editorWordCount'),
    editorCharCount: document.getElementById('editorCharCount'),
    editorLineCount: document.getElementById('editorLineCount'),
    
    settingsModal: document.getElementById('settingsModal'),
    btnCloseSettings: document.getElementById('btnCloseSettings'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),
    
    settingHeadingStyle: document.getElementById('settingHeadingStyle'),
    settingBulletMarker: document.getElementById('settingBulletMarker'),
    settingCodeBlockStyle: document.getElementById('settingCodeBlockStyle'),
    settingJsonFormat: document.getElementById('settingJsonFormat'),
    settingPdfPageBreak: document.getElementById('settingPdfPageBreak')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initEventListeners();
    renderQueue();
});

function loadSettings() {
    const saved = localStorage.getItem('doc2md_settings');
    if (saved) {
        try {
            state.settings = { ...state.settings, ...JSON.parse(saved) };
        } catch (e) {
            console.error('Error loading settings from localStorage', e);
        }
    }
    // Populate settings modal UI
    elements.settingHeadingStyle.value = state.settings.headingStyle;
    elements.settingBulletMarker.value = state.settings.bulletMarker;
    elements.settingCodeBlockStyle.value = state.settings.codeBlockStyle;
    elements.settingJsonFormat.value = state.settings.jsonFormat;
    elements.settingPdfPageBreak.value = state.settings.pdfPageBreak;
}

function saveSettings() {
    state.settings.headingStyle = elements.settingHeadingStyle.value;
    state.settings.bulletMarker = elements.settingBulletMarker.value;
    state.settings.codeBlockStyle = elements.settingCodeBlockStyle.value;
    state.settings.jsonFormat = elements.settingJsonFormat.value;
    state.settings.pdfPageBreak = elements.settingPdfPageBreak.value;

    localStorage.setItem('doc2md_settings', JSON.stringify(state.settings));
    elements.settingsModal.classList.remove('open');

    // Re-process ready files with new settings if desired
    reconvertAllFiles();
}

function initEventListeners() {
    // Dropzone & File Input Events
    elements.dropzone.addEventListener('click', () => elements.fileInput.click());
    elements.dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropzone.classList.add('drag-over');
    });
    elements.dropzone.addEventListener('dragleave', () => {
        elements.dropzone.classList.remove('drag-over');
    });
    elements.dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropzone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFilesIngestion(Array.from(e.dataTransfer.files));
        }
    });

    elements.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFilesIngestion(Array.from(e.target.files));
            elements.fileInput.value = ''; // Reset input
        }
    });

    // Queue Search Filter
    elements.queueSearchInput.addEventListener('input', () => renderQueue());

    // Clear All
    elements.btnClearAll.addEventListener('click', () => {
        if (confirm('Clear all files from queue?')) {
            state.fileQueue = [];
            state.activeFileId = null;
            renderQueue();
            updateViewer();
        }
    });

    // Convert All
    elements.btnConvertAll.addEventListener('click', () => {
        reconvertAllFiles();
    });

    // View Tabs
    elements.tabPreview.addEventListener('click', () => switchTab('preview'));
    elements.tabEditor.addEventListener('click', () => switchTab('editor'));

    // Textarea Editing
    elements.rawMarkdownTextarea.addEventListener('input', (e) => {
        const activeFile = getActiveFile();
        if (activeFile) {
            activeFile.markdownContent = e.target.value;
            updateEditorStatusbar(e.target.value);
            renderLiveMarkdownPreview(e.target.value);
        }
    });

    // Copy & Export Buttons
    elements.btnCopyMd.addEventListener('click', handleCopyMarkdown);
    elements.btnDownloadSingle.addEventListener('click', () => {
        const activeFile = getActiveFile();
        if (activeFile && activeFile.markdownContent) {
            downloadSingleMarkdown(activeFile.name, activeFile.markdownContent);
        }
    });

    // Settings Modal
    elements.btnSettings.addEventListener('click', () => {
        elements.settingsModal.classList.add('open');
    });
    elements.btnCloseSettings.addEventListener('click', () => {
        elements.settingsModal.classList.remove('open');
    });
    elements.btnSaveSettings.addEventListener('click', saveSettings);
    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) {
            elements.settingsModal.classList.remove('open');
        }
    });
}

// Ingest files into memory & dispatch conversion
async function handleFilesIngestion(files) {
    const supportedExts = ['txt', 'json', 'html', 'htm', 'docx', 'pdf'];

    for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!supportedExts.includes(ext)) {
            alert(`File "${file.name}" is not supported. Supported: .txt, .json, .html, .docx, .pdf`);
            continue;
        }

        const fileObj = {
            id: 'file_' + Math.random().toString(36).substring(2, 9),
            file: file,
            name: file.name,
            size: file.size,
            ext: ext,
            status: 'converting', // 'converting', 'ready', 'error'
            markdownContent: '',
            errorMessage: ''
        };

        state.fileQueue.push(fileObj);
        if (!state.activeFileId) {
            state.activeFileId = fileObj.id;
        }
    }

    renderQueue();
    updateViewer();

    // Process conversion for all pending files
    for (const item of state.fileQueue) {
        if (item.status === 'converting') {
            await processFileConversion(item);
        }
    }
}

async function processFileConversion(item) {
    try {
        let mdResult = '';
        switch (item.ext) {
            case 'txt':
                mdResult = await convertTxtToMarkdown(item.file, state.settings);
                break;
            case 'json':
                mdResult = await convertJsonToMarkdown(item.file, state.settings);
                break;
            case 'html':
            case 'htm':
                mdResult = await convertHtmlToMarkdown(item.file, state.settings);
                break;
            case 'docx':
                mdResult = await convertDocxToMarkdown(item.file, state.settings);
                break;
            case 'pdf':
                mdResult = await convertPdfToMarkdown(item.file, state.settings);
                break;
            default:
                throw new Error('Unsupported format');
        }

        item.status = 'ready';
        item.markdownContent = mdResult;
    } catch (err) {
        console.error(`Error converting ${item.name}:`, err);
        item.status = 'error';
        item.errorMessage = err.message || 'Conversion failed';
    }

    renderQueue();
    if (state.activeFileId === item.id) {
        updateViewer();
    }
}

async function reconvertAllFiles() {
    for (const item of state.fileQueue) {
        item.status = 'converting';
        await processFileConversion(item);
    }
}

function renderQueue() {
    const filterTerm = elements.queueSearchInput.value.toLowerCase().trim();
    const filteredQueue = state.fileQueue.filter(item => item.name.toLowerCase().includes(filterTerm));

    elements.queueCount.textContent = state.fileQueue.length;
    elements.btnClearAll.disabled = state.fileQueue.length === 0;
    elements.btnConvertAll.disabled = state.fileQueue.length === 0;

    // Calculate total stats
    const readyCount = state.fileQueue.filter(i => i.status === 'ready').length;
    const totalBytes = state.fileQueue.reduce((acc, i) => acc + i.size, 0);
    const totalKb = (totalBytes / 1024).toFixed(1);

    elements.statCount.textContent = `${readyCount}/${state.fileQueue.length} converted`;
    elements.statSize.textContent = `${totalKb} KB total`;

    if (filteredQueue.length === 0) {
        elements.emptyState.style.display = 'block';
        // Clear non-empty state elements
        const existingItems = elements.queueList.querySelectorAll('.queue-item');
        existingItems.forEach(el => el.remove());
        return;
    }

    elements.emptyState.style.display = 'none';

    // Build item cards
    const existingMap = new Map();
    elements.queueList.querySelectorAll('.queue-item').forEach(el => {
        existingMap.set(el.dataset.id, el);
    });

    // Remove obsolete nodes
    existingMap.forEach((node, id) => {
        if (!filteredQueue.some(i => i.id === id)) {
            node.remove();
        }
    });

    filteredQueue.forEach(item => {
        let card = existingMap.get(item.id);
        if (!card) {
            card = document.createElement('div');
            card.className = 'queue-item';
            card.dataset.id = item.id;
            card.addEventListener('click', () => {
                state.activeFileId = item.id;
                renderQueue();
                updateViewer();
            });
            elements.queueList.appendChild(card);
        }

        // Active state
        if (item.id === state.activeFileId) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }

        const sizeKb = (item.size / 1024).toFixed(1);
        let badgeHtml = '';
        if (item.status === 'converting') {
            badgeHtml = `<span class="status-badge status-converting">Converting...</span>`;
        } else if (item.status === 'ready') {
            badgeHtml = `<button class="btn-card-convert" data-convert-id="${item.id}" title="Click to re-process in browser">Converted</button>`;
        } else {
            badgeHtml = `<button class="btn-card-convert" data-convert-id="${item.id}" style="color:#ef4444; border-color:rgba(239,68,68,0.3);" title="Click to retry conversion">Retry Convert</button>`;
        }

        card.innerHTML = `
            <div class="item-left">
                <span class="item-ext-badge tag-${item.ext}">${item.ext}</span>
                <div class="item-meta">
                    <span class="item-name" title="${item.name}">${item.name}</span>
                    <span class="item-size">${sizeKb} KB</span>
                </div>
            </div>
            <div class="item-right">
                ${badgeHtml}
                <button class="btn-remove-item" title="Remove file" data-remove-id="${item.id}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `;

        const convertBtn = card.querySelector('.btn-card-convert');
        if (convertBtn) {
            convertBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                item.status = 'converting';
                renderQueue();
                processFileConversion(item);
            });
        }

        card.querySelector('.btn-remove-item').addEventListener('click', (e) => {
            e.stopPropagation();
            removeFileFromQueue(item.id);
        });
    });
}

function removeFileFromQueue(id) {
    state.fileQueue = state.fileQueue.filter(item => item.id !== id);
    if (state.activeFileId === id) {
        state.activeFileId = state.fileQueue.length > 0 ? state.fileQueue[0].id : null;
    }
    renderQueue();
    updateViewer();
}

function getActiveFile() {
    return state.fileQueue.find(i => i.id === state.activeFileId);
}

function updateViewer() {
    const activeFile = getActiveFile();

    if (!activeFile) {
        elements.activeFileTitle.textContent = 'Select a file from queue';
        elements.btnCopyMd.disabled = true;
        elements.btnDownloadSingle.disabled = true;
        elements.rawMarkdownTextarea.value = '';
        elements.markdownPreview.innerHTML = `
            <div class="viewer-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <p>Select a converted file to view live formatted preview</p>
            </div>
        `;
        updateEditorStatusbar('');
        return;
    }

    elements.activeFileTitle.textContent = activeFile.name;
    const isReady = activeFile.status === 'ready';

    elements.btnCopyMd.disabled = !isReady;
    elements.btnDownloadSingle.disabled = !isReady;

    if (activeFile.status === 'converting') {
        elements.markdownPreview.innerHTML = `<div class="viewer-placeholder"><p>Converting document...</p></div>`;
        elements.rawMarkdownTextarea.value = 'Converting...';
        return;
    }

    if (activeFile.status === 'error') {
        elements.markdownPreview.innerHTML = `
            <div class="viewer-placeholder" style="color: var(--accent-rose);">
                <p>Error converting file: ${activeFile.errorMessage}</p>
            </div>
        `;
        elements.rawMarkdownTextarea.value = `Error: ${activeFile.errorMessage}`;
        return;
    }

    const mdContent = activeFile.markdownContent || '';
    elements.rawMarkdownTextarea.value = mdContent;
    updateEditorStatusbar(mdContent);
    renderLiveMarkdownPreview(mdContent);
}

function renderLiveMarkdownPreview(markdownText) {
    if (!window.marked) {
        elements.markdownPreview.textContent = markdownText;
        return;
    }

    if (!markdownText.trim()) {
        elements.markdownPreview.innerHTML = `<p style="color: var(--text-dim);">_Empty Markdown content_</p>`;
        return;
    }

    // Configure marked parsing options
    window.marked.setOptions({
        gfm: true,
        breaks: true
    });

    const parsedHtml = window.marked.parse(markdownText);
    elements.markdownPreview.innerHTML = parsedHtml;

    // Apply syntax highlighting to code blocks in live preview
    if (window.hljs) {
        elements.markdownPreview.querySelectorAll('pre code').forEach((block) => {
            window.hljs.highlightElement(block);
        });
    }
}

function updateEditorStatusbar(text) {
    const charCount = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lines = text ? text.split('\n').length : 0;

    elements.editorWordCount.textContent = `${words} words`;
    elements.editorCharCount.textContent = `${charCount} characters`;
    elements.editorLineCount.textContent = `${lines} lines`;
}

function switchTab(tabName) {
    state.activeTab = tabName;
    if (tabName === 'preview') {
        elements.tabPreview.classList.add('active');
        elements.tabEditor.classList.remove('active');
        elements.previewContainer.classList.add('active');
        elements.editorContainer.classList.remove('active');
    } else {
        elements.tabEditor.classList.add('active');
        elements.tabPreview.classList.remove('active');
        elements.editorContainer.classList.add('active');
        elements.previewContainer.classList.remove('active');
    }
}

function handleCopyMarkdown() {
    const activeFile = getActiveFile();
    if (!activeFile || !activeFile.markdownContent) return;

    navigator.clipboard.writeText(activeFile.markdownContent).then(() => {
        const textSpan = elements.btnCopyMd.querySelector('.btn-text-content');
        const origText = textSpan.textContent;
        textSpan.textContent = 'Copied!';
        elements.btnCopyMd.style.borderColor = 'var(--accent-emerald)';
        elements.btnCopyMd.style.color = 'var(--accent-emerald)';

        setTimeout(() => {
            textSpan.textContent = origText;
            elements.btnCopyMd.style.borderColor = '';
            elements.btnCopyMd.style.color = '';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy markdown: ', err);
    });
}
