// Sidebar component — hierarchical page tree with real-time updates
import { subscribeToPages, createPage } from '../firebase/firestore.js';
import { canEdit } from '../firebase/auth.js';

let allPages = [];
let unsubscribe = null;
let onNavigateCallback = null;
let activePageId = null;
let searchFilter = '';

/**
 * Initialize sidebar and start listening to page changes
 */
export function initSidebar(treeContainer, onNavigate) {
  onNavigateCallback = onNavigate;

  // Listen to real-time page updates
  unsubscribe = subscribeToPages((pages) => {
    allPages = pages;
    renderTree(treeContainer);
  });

  // Search filtering
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchFilter = e.target.value.toLowerCase();
      renderTree(treeContainer);
    });
  }
}

/**
 * Set the active page (highlight in tree)
 */
export function setActivePage(pageId) {
  activePageId = pageId;
  const treeContainer = document.getElementById('page-tree');
  if (treeContainer) renderTree(treeContainer);
}

/**
 * Get all pages (for breadcrumb building etc.)
 */
export function getAllPages() {
  return allPages;
}

/**
 * Build a breadcrumb trail for a page
 */
export function getBreadcrumb(pageId) {
  const trail = [];
  let current = allPages.find((p) => p.id === pageId);
  while (current) {
    trail.unshift(current);
    current = current.parentId
      ? allPages.find((p) => p.id === current.parentId)
      : null;
  }
  return trail;
}

/**
 * Render the hierarchical tree
 */
function renderTree(container) {
  const filteredPages = searchFilter
    ? allPages.filter((p) => p.title && p.title.toLowerCase().includes(searchFilter))
    : allPages;

  // Build tree from flat list
  const rootPages = searchFilter
    ? filteredPages
    : filteredPages.filter((p) => !p.parentId);

  container.innerHTML = '';

  if (rootPages.length === 0) {
    container.innerHTML = `
      <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
        ${searchFilter ? 'Keine Ergebnisse' : 'Noch keine Seiten'}
      </div>
    `;
    return;
  }

  rootPages.forEach((page) => {
    container.appendChild(createTreeItem(page, filteredPages));
  });
}

/**
 * Create a tree item element (recursive)
 */
function createTreeItem(page, allFilteredPages) {
  const children = searchFilter
    ? []
    : allFilteredPages.filter((p) => p.parentId === page.id);
  const hasChildren = children.length > 0;

  const item = document.createElement('div');
  item.className = 'tree-node';

  const row = document.createElement('div');
  row.className = `tree-item${page.id === activePageId ? ' active' : ''}`;
  row.dataset.pageId = page.id;

  // Expand button
  if (hasChildren) {
    const expandBtn = document.createElement('button');
    expandBtn.className = 'expand-btn expanded';
    expandBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 18l6-6-6-6"/></svg>`;
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      expandBtn.classList.toggle('expanded');
      const childContainer = item.querySelector('.tree-children');
      if (childContainer) {
        childContainer.classList.toggle('collapsed');
      }
    });
    row.appendChild(expandBtn);
  } else {
    const spacer = document.createElement('span');
    spacer.style.width = '18px';
    spacer.style.display = 'inline-block';
    spacer.style.flexShrink = '0';
    row.appendChild(spacer);
  }

  // Page icon
  const icon = document.createElement('span');
  icon.className = 'page-icon';
  icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  row.appendChild(icon);

  // Page name
  const name = document.createElement('span');
  name.className = 'page-name';
  name.textContent = page.title || 'Ohne Titel';
  row.appendChild(name);

  row.addEventListener('click', () => {
    if (onNavigateCallback) onNavigateCallback(page.id);
  });

  item.appendChild(row);

  // Render children
  if (hasChildren) {
    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children';
    children.forEach((child) => {
      childContainer.appendChild(createTreeItem(child, allFilteredPages));
    });
    item.appendChild(childContainer);
  }

  return item;
}

/**
 * Destroy sidebar listener
 */
export function destroySidebar() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
