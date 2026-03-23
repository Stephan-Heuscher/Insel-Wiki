// Insel-Wiki — Main Application Bootstrap
import { initAuth, onAuthChange, login, logout, isLoggedIn, canEdit, getCurrentUser, getAccessRequestLink, updateUserProfile } from './firebase/auth.js';
import { uploadAvatar } from './firebase/storage.js';
import { formatDefaultName } from './utils/string.js';
import { createPage, getPage, savePage, createHistorySnapshot, compactHistory, updatePageTitle, deletePage, restorePage, getDeletedPages, permanentlyDeletePage, getChildren, subscribeToPage } from './firebase/firestore.js';
import { createEditor, setContent, getMarkdown, setEditable, destroyEditor, createFormatToolbar, getProvider } from './editor/editor.js';
import { joinPage, leavePage, subscribeToPresence, getColorForEmail } from './firebase/presence.js';
import { initSidebar, setActivePage, getBreadcrumb } from './components/sidebar.js';
import { loadHistory, toggleHistoryPanel, closeHistoryPanel } from './components/history.js';
import { promptModal } from './components/modal.js';

// --- State ---
let currentPageId = null;
let currentPageUnsub = null;
let currentPresenceUnsub = null;
let currentSessionId = null;
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
const historyBtn = document.getElementById('history-btn');
const printBtn = document.getElementById('print-page-btn');
const addChildBtn = document.getElementById('add-child-btn');
const deletePageBtn = document.getElementById('delete-page-btn');
const requestAccessLink = document.getElementById('request-access-link');
const appEl = document.getElementById('app');
const editorContainer = document.getElementById('editor-container');
const editorEl = document.getElementById('editor');
const pageTitleInput = document.getElementById('page-title');
const saveStatus = document.getElementById('save-status');
const breadcrumbEl = document.getElementById('breadcrumb');
const collabCursorsEl = document.getElementById('collab-cursors');
const pageTreeEl = document.getElementById('page-tree');
const emptyState = document.getElementById('empty-state');
const userInfoEl = document.getElementById('user-info');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.getElementById('sidebar');

// --- Profile Modal Elements ---
const profileModal = document.getElementById('profile-modal');
const profileNameInput = document.getElementById('profile-name');
const profileAvatarFile = document.getElementById('profile-avatar-file');
const avatarPreviewContainer = document.getElementById('avatar-preview-container');
const avatarPreviewImg = document.getElementById('avatar-preview-img');
const profileSaveBtn = document.getElementById('profile-save-btn');
const profileCancelBtn = document.getElementById('profile-cancel-btn');

let selectedAvatarFile = null;

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
  if (addChildBtn) addChildBtn.addEventListener('click', () => handleNewPage(currentPageId));
  if (deletePageBtn) deletePageBtn.addEventListener('click', handleDeletePage);
  if (historyBtn) historyBtn.addEventListener('click', handleHistoryToggle);
  if (printBtn) printBtn.addEventListener('click', () => window.print());
  document.getElementById('close-history').addEventListener('click', closeHistoryPanel);
  document.getElementById('empty-new-page').addEventListener('click', () => handleNewPage(null));

  // Setup profile modal
  if (userInfoEl) userInfoEl.addEventListener('click', openProfileModal);
  if (profileCancelBtn) profileCancelBtn.addEventListener('click', closeProfileModal);
  if (profileSaveBtn) profileSaveBtn.addEventListener('click', handleProfileSave);
  
  if (profileAvatarFile) {
    profileAvatarFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        selectedAvatarFile = file;
        avatarPreviewImg.src = URL.createObjectURL(file);
        avatarPreviewContainer.style.display = 'flex';
      } else {
        selectedAvatarFile = null;
        avatarPreviewContainer.style.display = 'none';
      }
    });
  }

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
      const name = user.displayName || formatDefaultName(user.email);
      let innerHTML = '';
      if (user.photoURL) {
        innerHTML = `<img src="${user.photoURL}" class="user-avatar-img" alt="Avatar" onerror="this.onerror=null; this.src='/favicon.svg';">`;
      } else {
        innerHTML = `<div class="user-avatar-img" style="display:flex;align-items:center;justify-content:center;font-weight:600;color:#fff;background:var(--accent);font-size:0.75rem">${name.charAt(0).toUpperCase()}</div>`;
      }
      innerHTML += `<span>${name}</span>`;
      userInfoEl.innerHTML = innerHTML;
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
    if (userInfoEl) userInfoEl.innerHTML = '';
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

// --- Profile Modal logic ---
function openProfileModal() {
  const user = getCurrentUser();
  if (!user) return;
  profileNameInput.value = user.displayName || '';
  profileAvatarFile.value = '';
  selectedAvatarFile = null;
  if (user.photoURL) {
    avatarPreviewImg.src = user.photoURL;
    avatarPreviewImg.onerror = function() { this.onerror=null; this.src='/favicon.svg'; };
    avatarPreviewContainer.style.display = 'flex';
  } else {
    avatarPreviewContainer.style.display = 'none';
  }
  profileModal.classList.remove('hidden');
}

function closeProfileModal() {
  profileModal.classList.add('hidden');
}

async function handleProfileSave() {
  const newName = profileNameInput.value.trim() || null;
  profileSaveBtn.disabled = true;
  profileSaveBtn.textContent = 'Speichern...';
  
  try {
    const user = getCurrentUser();
    let newAvatarUrl = user.photoURL; // default to existing
    
    // Upload file if selected
    if (selectedAvatarFile) {
      profileSaveBtn.textContent = 'Bild hochladen...';
      newAvatarUrl = await uploadAvatar(selectedAvatarFile, user.uid);
    }
    
    profileSaveBtn.textContent = 'Profil wird aktualisiert...';
    const updatedUser = await updateUserProfile(newName, newAvatarUrl);
    closeProfileModal();
    // Provide a hint to reload or gracefully update presence in current session
    // Right now, rejoining page re-transmits the new data cleanly
    if (currentPageId) {
      leavePage();
      currentSessionId = await joinPage(currentPageId, updatedUser);
    }
  } catch (err) {
    console.error('Fehler beim Profil-Update:', err);
    alert('Profil konnte nicht aktualisiert werden. ' + (err.message || ''));
  } finally {
    profileSaveBtn.disabled = false;
    profileSaveBtn.textContent = 'Speichern';
  }
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
  if (currentPresenceUnsub) {
    currentPresenceUnsub();
    currentPresenceUnsub = null;
  }
  await leavePage();
  clearInterval(historySnapshotInterval);
  closeHistoryPanel();
  
  collabCursorsEl.innerHTML = '';

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
  const user = getCurrentUser();
  const userName = user?.displayName || formatDefaultName(user?.email);
  
  // Passed full user info to createEditor
  const fullUser = {
    name: userName,
    email: user?.email || '',
    photoURL: user?.photoURL || null,
    color: getColorForEmail(user?.email || 'Gast')
  };
  
  const ed = createEditor(editorEl, pageId, fullUser, handleSave);

  // Create format toolbar (once)
  if (!formatToolbar) {
    formatToolbar = createFormatToolbar(editorContainer);
    if (!canEdit()) {
      formatToolbar.style.display = 'none';
    }
  }

  // Defer content injection to the Yjs Provider load callback
  // It will only be injected if there is no pre-existing compressed Yjs state.
  let initialMarkdown = page.content || '';
  if (initialMarkdown.length > 100000) {
    initialMarkdown = initialMarkdown.substring(0, 100000);
    console.warn('[Insel-Wiki] Loaded content exceeded 100,000 characters and was truncated.');
  }
  window.pendingMarkdownInjection = initialMarkdown;
  
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

  // Handle unload scenario
  const handleUnload = () => {
    snapshotCurrentPage();
    leavePage();
  };
  window.removeEventListener('beforeunload', handleUnload);
  window.addEventListener('beforeunload', handleUnload);

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

  // Setup presence
  if (user) {
    currentSessionId = await joinPage(pageId, fullUser);
  }
  
  currentPresenceUnsub = subscribeToPresence(pageId, (users) => {
    renderPresence(users);
  });
}

function renderPresence(users) {
  if (!collabCursorsEl) return;
  collabCursorsEl.innerHTML = '';
  
  users.forEach(u => {
    const avatar = document.createElement('div');
    avatar.className = 'collab-avatar';
    avatar.style.backgroundColor = u.color;
    avatar.title = u.name || u.email;
    
    if (u.photoURL) {
      const img = document.createElement('img');
      img.src = u.photoURL;
      img.alt = u.name || u.initials;
      img.onerror = function() { this.onerror = null; this.src = '/favicon.svg'; };
      avatar.appendChild(img);
    } else {
      avatar.textContent = u.initials;
    }
    
    collabCursorsEl.appendChild(avatar);
  });
}

function showEmptyState() {
  snapshotCurrentPage();
  leavePage();
  if (currentPresenceUnsub) {
    currentPresenceUnsub();
    currentPresenceUnsub = null;
  }
  clearInterval(historySnapshotInterval);
  currentPageId = null;
  currentSessionId = null;
  destroyEditor();
  editorContainer.classList.add('hidden');
  emptyState.classList.remove('hidden');
  breadcrumbEl.innerHTML = '';
  if (collabCursorsEl) collabCursorsEl.innerHTML = '';
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
    const currentUser = getCurrentUser();
    await savePage(pageId, markdown, pageTitleInput.value, currentUser?.email || '');
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
  const title = await promptModal('Seitentitel eingeben:', 'z.B. Neue Seite', 'Neue Seite');
  if (!title) return;

  try {
    const currentUser = getCurrentUser();
    const pageId = await createPage(title, parentId, currentUser?.email || '');
    navigateToPage(pageId);
  } catch (err) {
    console.error('Error creating page:', err);
    alert('Fehler beim Erstellen der Seite.');
  }
}

async function handleDeletePage() {
  if (!canEdit() || !currentPageId) return;
  const confirmed = confirm('Diese Seite und alle Unterseiten in den Papierkorb verschieben?');
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
    // compactHistory(currentPageId).catch(console.warn);
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
