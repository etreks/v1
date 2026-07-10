/**
 * Selahe Extension — Background Service Worker
 * Handles communication between content scripts, popup, and Selahe server.
 */

const SELAHE_URL = 'http://localhost:3000';

// Check if Selahe server is reachable
async function checkSelaheConnection() {
  try {
    const res = await fetch(`${SELAHE_URL}/api/sessions`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_CONNECTION') {
    checkSelaheConnection().then(connected => {
      sendResponse({ connected });
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'SAVE_CARD') {
    saveCardToSelahe(message.card).then(result => {
      sendResponse(result);
    });
    return true;
  }

  if (message.type === 'INJECT_LEDGER_UPDATE') {
    // Find the Gemini tab with the matching URL and inject the ledger message
    const { chatUrl, updateText } = message;
    chrome.tabs.query({}, (tabs) => {
      const geminiTab = tabs.find(t => t.url && t.url.startsWith(chatUrl));
      if (geminiTab) {
        chrome.tabs.sendMessage(geminiTab.id, {
          type: 'WRITE_LEDGER_UPDATE',
          text: updateText
        });
        sendResponse({ success: true });
      } else {
        // Tab not open — save to pending queue in storage
        chrome.storage.local.get(['pendingLedgerUpdates'], (result) => {
          const pending = result.pendingLedgerUpdates || [];
          pending.push({ chatUrl, updateText, timestamp: Date.now() });
          chrome.storage.local.set({ pendingLedgerUpdates: pending });
        });
        sendResponse({ success: false, queued: true });
      }
    });
    return true;
  }
});

// When a Gemini tab is activated or updated, check for pending ledger updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('gemini.google.com')) {
    chrome.storage.local.get(['pendingLedgerUpdates'], (result) => {
      const pending = result.pendingLedgerUpdates || [];
      const remaining = [];

      pending.forEach(update => {
        if (tab.url.startsWith(update.chatUrl)) {
          // This tab matches a pending update — inject it
          chrome.tabs.sendMessage(tabId, {
            type: 'WRITE_LEDGER_UPDATE',
            text: update.updateText
          });
        } else {
          remaining.push(update);
        }
      });

      chrome.storage.local.set({ pendingLedgerUpdates: remaining });
    });
  }
});

async function saveCardToSelahe(card) {
  try {
    // Fetch existing tasks
    const tasksRes = await fetch(`${SELAHE_URL}/api/tasks`);
    const existingTasks = tasksRes.ok ? await tasksRes.json() : [];

    const tasks = Array.isArray(existingTasks) ? existingTasks : [];
    const newTask = {
      id: 'ext_task_' + Date.now(),
      text: `${card.title} (${card.timeStart}${card.timeStartAmPm} - ${card.timeEnd}${card.timeEndAmPm} • ${card.location})`,
      cardData: card,
      date: Date.now(),
      source: 'gemini_extension',
      parentChatUrl: card.parentChatUrl || null
    };

    tasks.push(newTask);

    const saveRes = await fetch(`${SELAHE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tasks)
    });

    if (saveRes.ok) {
      return { success: true };
    } else {
      throw new Error('Server returned error');
    }
  } catch (err) {
    // Fallback: save to extension local storage
    chrome.storage.local.get(['offlineQueue'], (result) => {
      const queue = result.offlineQueue || [];
      queue.push({ card, timestamp: Date.now() });
      chrome.storage.local.set({ offlineQueue: queue });
    });
    return { success: false, offline: true, error: err.message };
  }
}

// On startup, try to flush any offline queue
chrome.runtime.onStartup.addListener(flushOfflineQueue);
chrome.runtime.onInstalled.addListener(flushOfflineQueue);

async function flushOfflineQueue() {
  const connected = await checkSelaheConnection();
  if (!connected) return;

  chrome.storage.local.get(['offlineQueue'], async (result) => {
    const queue = result.offlineQueue || [];
    if (queue.length === 0) return;

    const stillFailing = [];
    for (const item of queue) {
      const res = await saveCardToSelahe(item.card);
      if (!res.success && !res.offline) {
        // Server error, not offline
      } else if (res.offline) {
        stillFailing.push(item);
      }
    }

    chrome.storage.local.set({ offlineQueue: stillFailing });
  });
}
