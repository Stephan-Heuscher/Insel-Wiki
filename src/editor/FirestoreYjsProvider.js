import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { db } from '../firebase/config.js';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp, 
  Bytes,
  doc,
  setDoc,
  deleteDoc
} from 'firebase/firestore';

export class FirestoreYjsProvider {
  constructor(pageId, ydoc, user) {
    this.ydoc = ydoc;
    this.doc = ydoc; // Explicitly expose `doc` for Tiptap CollaborationCursor extension
    this.pageId = pageId;
    this.awareness = new awarenessProtocol.Awareness(ydoc);
    this.clientId = this.awareness.clientID;
    
    // Initialize awareness state for ourselves
    this.awareness.setLocalStateField('user', {
      name: user?.name || 'Gast',
      color: user?.color || this.getRandomColor(),
      photoURL: user?.photoURL || null
    });

    this.updatesRef = collection(db, 'pages', pageId, 'yjs_updates');
    this.awarenessRef = collection(db, 'pages', pageId, 'yjs_awareness');

    this.unsubUpdates = null;
    this.unsubAwareness = null;

    this.init();
  }

  getRandomColor() {
    const colors = ['#f87171', '#fb923c', '#fbbf24', '#34d399', '#38bdf8', '#818cf8', '#c084fc', '#f472b6'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  init() {
    // 1. Sync Document Updates
    this.ydoc.on('update', (update, origin) => {
      // Don't echo updates we just applied from Firestore
      if (origin !== this) {
        addDoc(this.updatesRef, {
          update: Bytes.fromUint8Array(update),
          timestamp: serverTimestamp(),
          clientId: this.clientId
        }).catch(err => console.error('[FirestoreYjs] update error:', err));
      }
    });

    const qUpdates = query(this.updatesRef, orderBy('timestamp', 'asc'));
    this.unsubUpdates = onSnapshot(qUpdates, (snapshot) => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const data = change.doc.data();
          // Apply updates from other clients
          if (data.clientId !== this.clientId && data.update) {
            const updateArr = data.update.toUint8Array();
            Y.applyUpdate(this.ydoc, updateArr, this);
          }
        }
      });
    }, err => {
      console.error('[FirestoreYjs] snapshot error:', err);
    });

    // 2. Sync Awareness (Cursors & Selections)
    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      if (origin === 'local') {
        const state = awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.clientId]);
        const docRef = doc(this.awarenessRef, this.clientId.toString());
        setDoc(docRef, {
          state: Bytes.fromUint8Array(state),
          updatedAt: serverTimestamp()
        }).catch(() => {});
      }
    });

    this.unsubAwareness = onSnapshot(this.awarenessRef, (snapshot) => {
      snapshot.docChanges().forEach(change => {
        const data = change.doc.data();
        if (change.doc.id !== this.clientId.toString() && data.state) {
          if (change.type === 'added' || change.type === 'modified') {
            const stateArr = data.state.toUint8Array();
            awarenessProtocol.applyAwarenessUpdate(this.awareness, stateArr, this);
          } else if (change.type === 'removed') {
             awarenessProtocol.removeAwarenessStates(this.awareness, [Number(change.doc.id)], this);
          }
        }
      });
    });

    // Cleanup when browser tab closes
    this.handleUnload = () => this.destroy();
    window.addEventListener('beforeunload', this.handleUnload);
  }

  destroy() {
    if (this.unsubUpdates) this.unsubUpdates();
    if (this.unsubAwareness) this.unsubAwareness();
    window.removeEventListener('beforeunload', this.handleUnload);

    // Remove awareness doc from Firestore
    try {
      const docRef = doc(this.awarenessRef, this.clientId.toString());
      deleteDoc(docRef).catch(() => {});
    } catch(e) {}
    
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.clientId], 'local');
  }
}
