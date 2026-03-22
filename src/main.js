// Insel-Wiki — Main Application Bootstrap
import { initAuth, onAuthChange, login, logout, isLoggedIn, canEdit, getCurrentUser, getAccessRequestLink } from './firebase/auth.js';
import { createPage, getPage, savePage, createHistorySnapshot, compactHistory, updatePageTitle, deletePage, getChildren, subscribeToPage } from './firebase/firestore.js';
import { createEditor, setContent, getMarkdown, setEditable, destroyEditor, createFormatToolbar } from './editor/editor.js';
import { initSidebar, setActivePage, getBreadcrumb } from './components/sidebar.js';
import { loadHistory, toggleHistoryPanel, closeHistoryPanel } from './components/history.js';

// --- State ---
let currentPageId = null;
let currentPageUnsub = null;
let formatToolbar = null;
let historySnapshotInterval = null;
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// --- DOM Elements ---
const authOverlay = document.getElementById('auth-overlay');
const loginForm = document.getElementById('login-form');
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');
const requestAccessLink = document.getElementById('request-access-link');
const appEl = document.getElementById('app');
const editorContainer = document.getElementById('editor-container');
const editorEl = document.getElementById('editor');
const pageTitleInput = document.getElementById('page-title');
const saveStatus = document.getElementById('save-status');
const breadcrumbEl = document.getElementById('breadcrumb');
const pageTreeEl = document.getElementById('page-tree');
const emptyState = document.getElementById('empty-state');
const userInfoEl = document.getElementById('user-info');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.getElementById('sidebar');

// --- Initialize ---
async function init() {
  // Setup mailto link
  if (requestAccessLink) {
    requestAccessLink.href = getAccessRequestLink();
  }

  // Setup login form
  loginForm.addEventListener('submit', handleLogin);

  // Setup logout
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Setup sidebar toggle (mobile)
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }

  // Setup action buttons
  document.getElementById('new-page-btn').addEventListener('click', () => handleNewPage(null));
  document.getElementById('add-child-btn').addEventListener('click', () => handleNewPage(currentPageId));
  document.getElementById('delete-page-btn').addEventListener('click', handleDeletePage);
  document.getElementById('history-btn').addEventListener('click', handleHistoryToggle);
  document.getElementById('close-history').addEventListener('click', closeHistoryPanel);
  document.getElementById('empty-new-page').addEventListener('click', () => handleNewPage(null));

  // Title input — save on change
  pageTitleInput.addEventListener('input', debounce(() => {
    if (currentPageId && canEdit()) {
      updatePageTitle(currentPageId, pageTitleInput.value);
    }
  }, 800));

  // Init auth
  const user = await initAuth();

  // Auth state changes
  onAuthChange(handleAuthChange);

  // Setup hash-based routing
  window.addEventListener('hashchange', handleRoute);

  // Init sidebar (always, even for non-logged-in users for read-only tree)
  initSidebar(pageTreeEl, navigateToPage);

  // Initial route
  handleRoute();
}

// --- Auth Handlers ---
function handleAuthChange(user) {
  if (user) {
    // Logged in
    authOverlay.classList.add('hidden');
    if (userInfoEl) {
      userInfoEl.textContent = user.email || 'Angemeldet';
    }
    // Enable/disable editing
    setEditable(canEdit());
    // Show/hide format toolbar based on edit permission
    if (formatToolbar) {
      formatToolbar.style.display = canEdit() ? 'flex' : 'none';
    }
    pageTitleInput.readOnly = !canEdit();
  } else {
    // Not logged in — show auth overlay
    authOverlay.classList.remove('hidden');
    if (userInfoEl) userInfoEl.textContent = '';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  loginError.classList.add('hidden');
  loginBtn.disabled = true;
  loginBtn.textContent = 'Anmelden…';

  try {
    await login(loginEmailInput.value, loginPasswordInput.value);
  } catch (err) {
    loginError.textContent = err.message || 'Anmeldung fehlgeschlagen.';
    loginError.classList.remove('hidden');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Anmelden';
  }
}

async function handleLogout() {
  await logout();
  window.location.hash = '';
}

// --- Routing ---
function handleRoute() {
  const hash = window.location.hash.replace('#/', '').replace('#', '');
  if (hash) {
    loadPage(hash);
  } else {
    showEmptyState();
  }
}

function navigateToPage(pageId) {
  window.location.hash = `#/${pageId}`;
  // Close mobile sidebar
  sidebar.classList.remove('open');
}

// --- Page Loading ---
async function loadPage(pageId) {
  // Snapshot the old page before leaving
  await snapshotCurrentPage();

  // Cleanup
  if (currentPageUnsub) {
    currentPageUnsub();
    currentPageUnsub = null;
  }
  clearInterval(historySnapshotInterval);
  closeHistoryPanel();

  currentPageId = pageId;
  setActivePage(pageId);

  // Show editor, hide empty state
  editorContainer.classList.remove('hidden');
  emptyState.classList.add('hidden');

  // Load page data
  const page = await getPage(pageId);
  if (!page) {
    showEmptyState();
    return;
  }

  // Set title
  pageTitleInput.value = page.title || '';

  // Create editor
  const userName = getCurrentUser()?.email || 'Gast';
  const ed = createEditor(editorEl, pageId, userName, handleSave);

  // Create format toolbar (once)
  if (!formatToolbar) {
    formatToolbar = createFormatToolbar(editorContainer);
    if (!canEdit()) {
      formatToolbar.style.display = 'none';
    }
  }

  // Set content
  setContent(page.content || '');
  setEditable(canEdit());
  pageTitleInput.readOnly = !canEdit();

  // Update breadcrumb
  updateBreadcrumb(pageId);

  // Set save status
  updateSaveStatus('saved');

  // Start periodic history snapshots (every 5 min while editing)
  historySnapshotInterval = setInterval(() => {
    snapshotCurrentPage();
  }, SNAPSHOT_INTERVAL_MS);

  // Snapshot on tab close / browser unload
  window.removeEventListener('beforeunload', snapshotCurrentPage);
  window.addEventListener('beforeunload', snapshotCurrentPage);

  // Subscribe to real-time updates for this page
  currentPageUnsub = subscribeToPage(pageId, (updatedPage) => {
    if (updatedPage && updatedPage.id === currentPageId) {
      // Update title if changed externally
      if (document.activeElement !== pageTitleInput && updatedPage.title !== pageTitleInput.value) {
        pageTitleInput.value = updatedPage.title || '';
      }
      updateBreadcrumb(pageId);
    }
  });
}

function showEmptyState() {
  snapshotCurrentPage();
  clearInterval(historySnapshotInterval);
  currentPageId = null;
  destroyEditor();
  editorContainer.classList.add('hidden');
  emptyState.classList.remove('hidden');
  breadcrumbEl.innerHTML = '';
}

/**
 * Create a history snapshot of the current page (if any content exists).
 * Called on page leave, periodically, and on browser unload.
 */
async function snapshotCurrentPage() {
  if (!currentPageId || !canEdit()) return;
  try {
    const markdown = getMarkdown();
    if (!markdown || markdown.trim().length === 0) return;
    const user = getCurrentUser();
    await createHistorySnapshot(
      currentPageId,
      markdown,
      pageTitleInput.value,
      user?.email || ''
    );
  } catch (err) {
    // Silent — don't block navigation for snapshot errors
    console.warn('[Insel-Wiki] Snapshot error:', err);
  }
}

// --- Save ---
async function handleSave(pageId, markdown) {
  if (!canEdit()) return;
  updateSaveStatus('saving');
  try {
    const user = getCurrentUser();
    await savePage(pageId, markdown, pageTitleInput.value, user?.email || '');
    updateSaveStatus('saved');
  } catch (err) {
    console.error('Save error:', err);
    updateSaveStatus('error');
  }
}

function updateSaveStatus(status) {
  if (!saveStatus) return;
  saveStatus.classList.remove('saving', 'error');
  switch (status) {
    case 'saving':
      saveStatus.textContent = 'Speichern…';
      saveStatus.classList.add('saving');
      break;
    case 'saved':
      saveStatus.textContent = 'Gespeichert';
      break;
    case 'error':
      saveStatus.textContent = 'Fehler beim Speichern';
      saveStatus.classList.add('error');
      break;
  }
}

// --- Breadcrumb ---
function updateBreadcrumb(pageId) {
  const trail = getBreadcrumb(pageId);
  breadcrumbEl.innerHTML = '';

  trail.forEach((page, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'breadcrumb-sep';
      sep.textContent = '›';
      breadcrumbEl.appendChild(sep);
    }

    const item = document.createElement('span');
    item.className = `breadcrumb-item${i === trail.length - 1 ? ' current' : ''}`;
    item.textContent = page.title || 'Ohne Titel';
    if (i < trail.length - 1) {
      item.addEventListener('click', () => navigateToPage(page.id));
    }
    breadcrumbEl.appendChild(item);
  });
}

// --- Page Actions ---
async function handleNewPage(parentId) {
  if (!canEdit()) return;
  const title = prompt('Seitentitel:', 'Neue Seite');
  if (!title) return;

  try {
    const user = getCurrentUser();
    const pageId = await createPage(title, parentId, user?.email || '');
    navigateToPage(pageId);
  } catch (err) {
    console.error('Error creating page:', err);
    alert('Fehler beim Erstellen der Seite.');
  }
}

async function handleDeletePage() {
  if (!canEdit() || !currentPageId) return;
  const confirmed = confirm('Diese Seite und alle Unterseiten wirklich löschen?');
  if (!confirmed) return;

  try {
    await deletePage(currentPageId);
    window.location.hash = '';
  } catch (err) {
    console.error('Error deleting page:', err);
    alert('Fehler beim Löschen der Seite.');
  }
}

async function handleHistoryToggle() {
  if (currentPageId) {
    toggleHistoryPanel();
    loadHistory(currentPageId);
    // Compact history in the background when viewing it
    compactHistory(currentPageId).catch(console.warn);
  }
}

// --- Utilities ---
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// --- Go! ---
init().catch(console.error);
