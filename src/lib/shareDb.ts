export interface ShareComment {
  id: string;
  author: string;
  text: string;
  timestampMs: number; // millisecond timestamp relative to video start
  rating?: string; // reaction emoji
  createdAt: number;
}

export interface SharedVideoMeta {
  id: string;
  name: string;
  duration: number;
  compiledMimeType: string;
  createdAt: number;
}

const DB_NAME = 'VideoShareDB';
const STORE_NAME = 'videos';
const DB_VERSION = 1;

// Open IndexedDB connection
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Saves a compiled video blob and its metadata to IndexedDB
 */
export async function saveSharedVideo(
  id: string,
  name: string,
  blob: Blob | undefined,
  duration: number,
  compiledMimeType: string,
  youtubeUrl?: string,
  segments?: any[],
  zoomSettings?: any,
  type?: 'screen' | 'sandbox' | 'youtube'
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const record = {
      id,
      name,
      blob,
      duration,
      compiledMimeType,
      youtubeUrl,
      segments,
      zoomSettings,
      type,
      createdAt: Date.now(),
    };

    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves a shared video and its blob from IndexedDB
 */
export async function getSharedVideo(
  id: string
): Promise<{ 
  id: string; 
  name: string; 
  blob?: Blob; 
  duration: number; 
  compiledMimeType: string; 
  createdAt: number;
  youtubeUrl?: string;
  segments?: any[];
  zoomSettings?: any;
  type?: 'screen' | 'sandbox' | 'youtube';
} | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to retrieve video from IndexedDB', err);
    return null;
  }
}

/**
 * Gets comments for a specific shared video from localStorage
 */
export function getSharedVideoComments(videoId: string): ShareComment[] {
  const stored = localStorage.getItem(`video_comments_${videoId}`);
  if (!stored) {
    // Seed some high-fidelity default comments to make the experience feel rich and professional!
    const defaultComments: ShareComment[] = [
      {
        id: `c_seed_1`,
        author: 'Sarah Jenkins (Product Manager)',
        text: 'This auto-zoom makes the dashboard interaction so much clearer! I love how it draws focus instantly to the drop-down.',
        timestampMs: 2000,
        rating: '👏',
        createdAt: Date.now() - 1000 * 60 * 30, // 30 mins ago
      },
      {
        id: `c_seed_2`,
        author: 'Dave Miller (Technical Lead)',
        text: 'Visual explanation is spot on. Nice transition easing here! The cinematic speed feels very smooth.',
        timestampMs: 5000,
        rating: '🤯',
        createdAt: Date.now() - 1000 * 60 * 15, // 15 mins ago
      },
    ];
    localStorage.setItem(`video_comments_${videoId}`, JSON.stringify(defaultComments));
    return defaultComments;
  }
  return JSON.parse(stored);
}

/**
 * Saves a new comment to localStorage
 */
export function addSharedVideoComment(videoId: string, comment: ShareComment): ShareComment[] {
  const currentComments = getSharedVideoComments(videoId);
  const updated = [...currentComments, comment];
  localStorage.setItem(`video_comments_${videoId}`, JSON.stringify(updated));
  return updated;
}
