// Tiptap WYSIWYG Editor with Yjs collaboration
import { Editor } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Collaboration } from '@tiptap/extension-collaboration';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Image } from '@tiptap/extension-image';
import { Link } from '@tiptap/extension-link';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { CodeBlock } from '@tiptap/extension-code-block';
import * as Y from 'yjs';

// For Markdown conversion
import TurndownService from 'turndown';
import { marked } from 'marked';

let editor = null;
let ydoc = null;
let currentPageId = null;
let saveCallback = null;
let saveTimeout = null;

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// Collaboration colors for cursors
const CURSOR_COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#34d399',
  '#38bdf8', '#818cf8', '#c084fc', '#f472b6',
];

function getRandomColor() {
  return CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
}

/**
 * Initialize the editor for a given page
 */
export function createEditor(element, pageId, userName, onSave) {
  // Clean up previous editor
  destroyEditor();

  currentPageId = pageId;
  saveCallback = onSave;

  // Create Yjs document
  ydoc = new Y.Doc();

  const extensions = [
    StarterKit.configure({
      history: false, // Yjs handles undo/redo
      undoRedo: false, // Collaboration extension provides its own
      codeBlock: false, // We use the standalone extension
      link: false, // We configure Link separately below
    }),
    CodeBlock,
    Placeholder.configure({
      placeholder: 'Beginne hier zu schreiben…',
    }),
    Image.configure({
      inline: true,
    }),
    Link.configure({
      openOnClick: false,
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableCell,
    TableHeader,
    Collaboration.configure({
      document: ydoc,
    }),
  ];

  editor = new Editor({
    element,
    extensions,
    editorProps: {
      attributes: {
        class: 'tiptap',
      },
    },
    onUpdate: ({ editor: ed }) => {
      // Debounced auto-save
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        if (saveCallback && currentPageId) {
          const html = ed.getHTML();
          const markdown = turndown.turndown(html);
          saveCallback(currentPageId, markdown);
        }
      }, 1500);
    },
  });

  return editor;
}

/**
 * Set editor content from Markdown
 */
export function setContent(markdown) {
  if (!editor) return;
  const html = marked.parse(markdown || '');
  editor.commands.setContent(html, false);
}

/**
 * Get current content as Markdown
 */
export function getMarkdown() {
  if (!editor) return '';
  const html = editor.getHTML();
  return turndown.turndown(html);
}

/**
 * Get current content as HTML
 */
export function getHTML() {
  if (!editor) return '';
  return editor.getHTML();
}

/**
 * Set editor editable state
 */
export function setEditable(editable) {
  if (editor) {
    editor.setEditable(editable);
  }
}

/**
 * Destroy the editor instance
 */
export function destroyEditor() {
  clearTimeout(saveTimeout);
  if (editor) {
    editor.destroy();
    editor = null;
  }
  if (ydoc) {
    ydoc.destroy();
    ydoc = null;
  }
  currentPageId = null;
}

/**
 * Get the editor instance (for toolbar actions)
 */
export function getEditor() {
  return editor;
}

/**
 * Create the formatting toolbar HTML and bind actions
 */
export function createFormatToolbar(container) {
  const toolbar = document.createElement('div');
  toolbar.className = 'format-toolbar';
  toolbar.innerHTML = `
    <button class="format-btn" data-action="bold" title="Fett (Ctrl+B)"><b>B</b></button>
    <button class="format-btn" data-action="italic" title="Kursiv (Ctrl+I)"><i>I</i></button>
    <button class="format-btn" data-action="strike" title="Durchgestrichen">S̶</button>
    <button class="format-btn" data-action="code" title="Code">&lt;&gt;</button>
    <div class="divider"></div>
    <button class="format-btn" data-action="h1" title="Überschrift 1">H1</button>
    <button class="format-btn" data-action="h2" title="Überschrift 2">H2</button>
    <button class="format-btn" data-action="h3" title="Überschrift 3">H3</button>
    <div class="divider"></div>
    <button class="format-btn" data-action="bulletList" title="Aufzählung">•</button>
    <button class="format-btn" data-action="orderedList" title="Nummerierung">1.</button>
    <button class="format-btn" data-action="taskList" title="Aufgabenliste">☑</button>
    <div class="divider"></div>
    <button class="format-btn" data-action="blockquote" title="Zitat">❝</button>
    <button class="format-btn" data-action="codeBlock" title="Code-Block">▤</button>
    <button class="format-btn" data-action="horizontalRule" title="Trennlinie">—</button>
    <div class="divider"></div>
    <button class="format-btn" data-action="link" title="Link">🔗</button>
    <button class="format-btn" data-action="image" title="Bild">🖼</button>
  `;

  container.insertBefore(toolbar, container.firstChild);

  // Bind click events
  toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.format-btn');
    if (!btn || !editor) return;

    const action = btn.dataset.action;
    const chain = editor.chain().focus();

    switch (action) {
      case 'bold': chain.toggleBold().run(); break;
      case 'italic': chain.toggleItalic().run(); break;
      case 'strike': chain.toggleStrike().run(); break;
      case 'code': chain.toggleCode().run(); break;
      case 'h1': chain.toggleHeading({ level: 1 }).run(); break;
      case 'h2': chain.toggleHeading({ level: 2 }).run(); break;
      case 'h3': chain.toggleHeading({ level: 3 }).run(); break;
      case 'bulletList': chain.toggleBulletList().run(); break;
      case 'orderedList': chain.toggleOrderedList().run(); break;
      case 'taskList': chain.toggleTaskList().run(); break;
      case 'blockquote': chain.toggleBlockquote().run(); break;
      case 'codeBlock': chain.toggleCodeBlock().run(); break;
      case 'horizontalRule': chain.setHorizontalRule().run(); break;
      case 'link': {
        const url = prompt('URL eingeben:');
        if (url) chain.setLink({ href: url }).run();
        break;
      }
      case 'image': {
        const src = prompt('Bild-URL eingeben:');
        if (src) chain.setImage({ src }).run();
        break;
      }
    }

    updateToolbarState(toolbar);
  });

  // Update active states on selection change
  if (editor) {
    editor.on('selectionUpdate', () => updateToolbarState(toolbar));
    editor.on('transaction', () => updateToolbarState(toolbar));
  }

  return toolbar;
}

function updateToolbarState(toolbar) {
  if (!editor) return;
  toolbar.querySelectorAll('.format-btn').forEach((btn) => {
    const action = btn.dataset.action;
    let isActive = false;
    switch (action) {
      case 'bold': isActive = editor.isActive('bold'); break;
      case 'italic': isActive = editor.isActive('italic'); break;
      case 'strike': isActive = editor.isActive('strike'); break;
      case 'code': isActive = editor.isActive('code'); break;
      case 'h1': isActive = editor.isActive('heading', { level: 1 }); break;
      case 'h2': isActive = editor.isActive('heading', { level: 2 }); break;
      case 'h3': isActive = editor.isActive('heading', { level: 3 }); break;
      case 'bulletList': isActive = editor.isActive('bulletList'); break;
      case 'orderedList': isActive = editor.isActive('orderedList'); break;
      case 'taskList': isActive = editor.isActive('taskList'); break;
      case 'blockquote': isActive = editor.isActive('blockquote'); break;
      case 'codeBlock': isActive = editor.isActive('codeBlock'); break;
    }
    btn.classList.toggle('is-active', isActive);
  });
}
