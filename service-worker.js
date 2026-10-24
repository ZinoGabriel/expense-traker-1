// ==========================================
// 🚀 SPENDGUARD OFFLINE PROGRESSIVE ENGINE
// Calibration: August 2026 Core Build
// ==========================================

const CACHE_NAME = 'spendguard-cache-v72';

// The layout files that must be saved locally to run the app offline
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './signup.html',
  './dashboard.html',
  './style.css',
  './dashboard.js',
  './supabase-config.js',
  './currency-data.js',
  './manifest.json'
];

// 📥 1. INSTALLATION EVENT: Locks your layout components into device hardware storage
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('⚙️ SpendGuard Storage: Caching application shell layouts...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(function() {
        return self.skipWaiting();
      })
  );
});

// 🔄 2. ACTIVATION EVENT: Wipes out old cache versions when you update your software
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cache) {
          if (cache !== CACHE_NAME) {
            console.log('🧹 SpendGuard Storage: Clearing outdated asset fragments...');
            return caches.delete(cache);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// 📡 3. FETCH INTERCEPTOR MECHANIC: Intercepts network calls to serve cached files instantly
self.addEventListener('fetch', function(event) {
  if (new URL(event.request.url).pathname.endsWith('/supabase-config.js')) {
    return;
  }

  // Bypasses cloud tracking sheet URLs so your active POST integrations do not hit storage traps
  if (event.request.url.includes('://google.com') || event.request.url.includes('google.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(function(cachedResponse) {
        if (cachedResponse) {
          // Serve assets right out of the local device memory slot for rapid loading
          return cachedResponse;
        }
        
        // If file is not in local cache, reach across the web to pull it down safely
        return fetch(event.request).then(function(networkResponse) {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          // Dynamically clone and add new layout resources to cache lines on the go
          var responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        });
      }).catch(function() {
        // Fallback option in case a page link breaks completely offline
        if (event.request.mode === 'navigate') {
          return caches.match('./dashboard.html');
        }
      })
  );
});

// ==========================================
// 🔔 4. PUSH NOTIFICATIONS - Auto-capture bank alerts
// ==========================================
self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const data = event.data.json();
      
      // Extract SMS data from bank notification
      const smsText = data.sms || data.message || data.text || '';
      
      if (smsText) {
        // Store in IndexedDB for processing
        const dbRequest = indexedDB.open('spendguard_sms', 1);
        
        dbRequest.onsuccess = function(e) {
          const db = e.target.result;
          const transaction = db.transaction(['incoming_sms'], 'readwrite');
          const store = transaction.objectStore('incoming_sms');
          
          store.add({
            sms: smsText,
            timestamp: new Date().toISOString(),
            processed: false
          });
        };
        
        // Show notification to user
        event.waitUntil(
          self.registration.showNotification('💰 SpendGuard: Expense Detected', {
            body: smsText.substring(0, 100) + (smsText.length > 100 ? '...' : ''),
            icon: './manifest.json',
            badge: './manifest.json',
            tag: 'bank-alert',
            requireInteraction: false
          })
        );
      }
    } catch (err) {
      console.error('Push notification error:', err);
    }
  }
});

// ==========================================
// 5. BACKGROUND SYNC - Handle queued SMS processing
// ==========================================
self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-expenses') {
    event.waitUntil(
      (async function() {
        try {
          const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open('spendguard_sms', 1);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });

          const transaction = db.transaction(['incoming_sms'], 'readwrite');
          const store = transaction.objectStore('incoming_sms');
          const unprocessed = await new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result.filter(item => !item.processed));
            req.onerror = () => reject(req.error);
          });

          // Notify all open clients about new SMS
          const clients = await self.clients.matchAll();
          clients.forEach(client => {
            client.postMessage({
              type: 'NEW_SMS_BATCH',
              smsMessages: unprocessed
            });
          });
        } catch (err) {
          console.error('Sync error:', err);
        }
      })()
    );
  }
});

// ==========================================
// 6. MESSAGE HANDLER - Receive SMS from clients
// ==========================================
self.addEventListener('message', function(event) {
  if (event.data.type === 'SMS_PROCESSED') {
    // Mark SMS as processed in database
    const dbRequest = indexedDB.open('spendguard_sms', 1);
    
    dbRequest.onsuccess = function(e) {
      const db = e.target.result;
      const transaction = db.transaction(['incoming_sms'], 'readwrite');
      const store = transaction.objectStore('incoming_sms');
      
      const updateReq = store.getAll();
      updateReq.onsuccess = function() {
        updateReq.result.forEach(item => {
          if (item.sms === event.data.sms) {
            item.processed = true;
            store.put(item);
          }
        });
      };
    };
  }
});
