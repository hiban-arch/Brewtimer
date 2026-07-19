// Mengimpor pustaka idb untuk mempermudah manipulasi IndexedDB di Service Worker
importScripts('https://cdn.jsdelivr.net/npm/idb@7/build/umd.js');

const CACHE_NAME = 'brewtimer-v3'; // Naikkan versi cache agar browser mendeteksi pembaruan
const ASSETS = [
  'index.html',
  'manifest.json',
  'icon1.png'
];

// MASUKKAN URL WEB APP APPS SCRIPT ANDA DI SINI SEBAGAI PUSAT UTAMA
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyXFkCWdBlzNovfQyBlPrXFkA4PTRUU5yezoMNsfDeRTc5iFwZUrIdGel7d6plf-r8E/exec';

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
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Tahap Aktivasi: Hapus cache lama jika ada pembaruan versi
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => { if (key !== CACHE_NAME) return caches.delete(key); })
    )).then(() => self.clients.claim())
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
      // Menggunakan URL pusat yang sudah didefinisikan secara konsisten
      // Dan mengirimkan langsung objek data seduhan yang tersimpan
      await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data) 
      });
      
      // Jika sukses terkirim, hapus dari antrean lokal
      await db.delete('outbox', data.id);
      console.log('✓ Utang data offline berhasil disinkronkan ke Google Sheets!');
    } catch (err) {
      console.error('✗ Gagal sinkronisasi, akan dicoba lagi nanti:', err);
      throw err; 
    }
  }
}
