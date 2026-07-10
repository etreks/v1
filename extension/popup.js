/**
 * Selahe Extension — Popup Logic
 */

const statusBadge = document.getElementById('selahe-status-badge');
const syncRow = document.getElementById('sync-row');
const queueCountEl = document.getElementById('queue-count');
const syncNowBtn = document.getElementById('sync-now-btn');
const openSelaheBtn = document.getElementById('open-selahe-btn');
const gemSetupLink = document.getElementById('gem-setup-link');

// Check connection to Selahe
chrome.runtime.sendMessage({ type: 'CHECK_CONNECTION' }, (response) => {
  if (response && response.connected) {
    statusBadge.textContent = 'Connected';
    statusBadge.className = 'status-badge connected';
  } else {
    statusBadge.textContent = 'Offline';
    statusBadge.className = 'status-badge disconnected';
  }
});

// Check offline queue
chrome.storage.local.get(['offlineQueue'], (result) => {
  const queue = result.offlineQueue || [];
  if (queue.length > 0) {
    syncRow.style.display = 'flex';
    queueCountEl.textContent = `${queue.length} card${queue.length > 1 ? 's' : ''} waiting to sync`;
  }
});

// Sync now button
syncNowBtn.addEventListener('click', () => {
  syncNowBtn.textContent = 'Syncing...';
  syncNowBtn.disabled = true;

  chrome.storage.local.get(['offlineQueue'], async (result) => {
    const queue = result.offlineQueue || [];
    const stillFailing = [];

    for (const item of queue) {
      const res = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'SAVE_CARD', card: item.card }, resolve);
      });

      if (!res || !res.success) {
        stillFailing.push(item);
      }
    }

    chrome.storage.local.set({ offlineQueue: stillFailing });

    if (stillFailing.length === 0) {
      syncRow.style.display = 'none';
      syncNowBtn.textContent = 'Synced!';
    } else {
      queueCountEl.textContent = `${stillFailing.length} card${stillFailing.length > 1 ? 's' : ''} still pending`;
      syncNowBtn.textContent = 'Retry';
      syncNowBtn.disabled = false;
    }
  });
});

// Open Selahe app
openSelaheBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:3000' });
  window.close();
});

// Gem setup link — opens instructions in a new tab (we'll serve this from Selahe's server)
gemSetupLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'http://localhost:3000/gem-setup.html' });
  window.close();
});
