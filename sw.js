// Mengimpor pustaka idb untuk mempermudah manipulasi IndexedDB di Service Worker
importScripts('https://cdn.jsdelivr.net/npm/idb@7/build/umd.js');

const CACHE_NAME = 'brewtimer-v2';
const ASSETS = [
  'index.html',
  'manifest.json'
  'icon.png'
];

// Inisialisasi Database Lokal di Service Worker
const dbPromise = idb.openDB('brew-offline-db', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('outbox')) {
      db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
    }
  },
});

// Tahap Install: Simpan aset utama ke dalam Cache browser
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Tahap Aktivasi: Hapus cache lama jika ada pembaruan versi
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => { if (key !== CACHE_NAME) return caches.delete(key); })
    ))
  );
});

// Strategi Cache: Ambil dari cache dulu untuk file lokal
self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('script.google.com')) return; // Abaikan request Google Sheets
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => cachedResponse || fetch(e.request))
  );
});

// --- FITUR UTAMA: SINKRONISASI OTOMATIS SAAT ONLINE ---
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-history') {
    e.waitUntil(kirimUtangDataKeSheets());
  }
});

async function kirimUtangDataKeSheets() {
  const db = await dbPromise;
  const semuaUtangData = await db.getAll('outbox');

  for (const data of semuaUtangData) {
    try {
      // Kirim ke Google Sheets URL yang tersimpan di dalam objek data
      await fetch(data.url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.payload)
      });
      
      // Jika sukses terkirim, hapus dari antrean lokal
      await db.delete('outbox', data.id);
      console.log('✓ Utang data offline berhasil disinkronkan ke Google Sheets!');
    } catch (err) {
      console.error('✗ Gagal sinkronisasi, akan dicoba lagi nanti:', err);
      throw err; // Lempar eror agar sistem Sync mencoba lagi nanti saat sinyal stabil
    }
  }
}
