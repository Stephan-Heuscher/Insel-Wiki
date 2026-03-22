// Firestore CRUD operations for wiki pages
import { db } from './config.js';
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

const PAGES_COLLECTION = 'pages';

/**
 * Create a new page
 */
export async function createPage(title, parentId = null, createdBy = '') {
  const pagesRef = collection(db, PAGES_COLLECTION);
  
  // Get next order number for siblings
  const siblings = await getChildren(parentId);
  const order = siblings.length;

  const docRef = await addDoc(pagesRef, {
    title,
    content: '',
    parentId,
    order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy,
  });

  return docRef.id;
}

/**
 * Get a single page by ID
 */
export async function getPage(pageId) {
  const docRef = doc(db, PAGES_COLLECTION, pageId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

/**
 * Get children of a page (or root pages if parentId is null)
 */
export async function getChildren(parentId = null) {
  const pagesRef = collection(db, PAGES_COLLECTION);
  const q = query(
    pagesRef,
    where('parentId', '==', parentId),
    orderBy('order', 'asc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Save page content (Markdown) and push a history snapshot
 */
export async function savePage(pageId, content, title, savedBy = '') {
  const pageRef = doc(db, PAGES_COLLECTION, pageId);

  // Update the page
  const updates = { updatedAt: serverTimestamp() };
  if (content !== undefined) updates.content = content;
  if (title !== undefined) updates.title = title;
  await updateDoc(pageRef, updates);

  // Push history snapshot
  if (content !== undefined) {
    const historyRef = collection(db, PAGES_COLLECTION, pageId, 'history');
    await addDoc(historyRef, {
      content,
      title: title || '',
      savedBy,
      savedAt: serverTimestamp(),
    });
  }
}

/**
 * Update page title only
 */
export async function updatePageTitle(pageId, title) {
  const pageRef = doc(db, PAGES_COLLECTION, pageId);
  await updateDoc(pageRef, { title, updatedAt: serverTimestamp() });
}

/**
 * Delete a page and all its children recursively
 */
export async function deletePage(pageId) {
  // Delete children first
  const children = await getChildren(pageId);
  for (const child of children) {
    await deletePage(child.id);
  }

  // Delete history subcollection
  const historyRef = collection(db, PAGES_COLLECTION, pageId, 'history');
  const historySnaps = await getDocs(historyRef);
  for (const snap of historySnaps.docs) {
    await deleteDoc(snap.ref);
  }

  // Delete the page itself
  const pageRef = doc(db, PAGES_COLLECTION, pageId);
  await deleteDoc(pageRef);
}

/**
 * Get history entries for a page
 */
export async function getHistory(pageId) {
  const historyRef = collection(db, PAGES_COLLECTION, pageId, 'history');
  const q = query(historyRef, orderBy('savedAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Subscribe to the full page tree in real time
 * Returns an unsubscribe function
 */
export function subscribeToPages(callback) {
  const pagesRef = collection(db, PAGES_COLLECTION);
  const q = query(pagesRef, orderBy('order', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const pages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(pages);
  });
}

/**
 * Subscribe to a single page in real time
 */
export function subscribeToPage(pageId, callback) {
  const pageRef = doc(db, PAGES_COLLECTION, pageId);
  return onSnapshot(pageRef, (snapshot) => {
    if (snapshot.exists()) {
      callback({ id: snapshot.id, ...snapshot.data() });
    } else {
      callback(null);
    }
  });
}

/**
 * Format a Firestore timestamp for display
 */
export function formatTimestamp(ts) {
  if (!ts) return '';
  const date = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
  return date.toLocaleString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
