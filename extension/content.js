/**
 * Selahe Extension — Content Script
 * Runs on gemini.google.com. Watches for Selahe action card signals in chat,
 * injects the Selahe overlay sidebar, and handles saving + ledger write-back.
 */

(function () {
  'use strict';

  // ─── Constants ───────────────────────────────────────────────────────────────
  const CARD_START = '[ACTION_CARD_START]';
  const CARD_END = '[ACTION_CARD_END]';

  let lastProcessedCard = null;
  let sidebarEl = null;
  let sidebarVisible = false;

  // ─── Selahe Floating Badge ────────────────────────────────────────────────────
  function injectFloatingBadge() {
    if (document.getElementById('selahe-badge')) return;

    const badge = document.createElement('div');
    badge.id = 'selahe-badge';
    badge.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2 C 14 4, 10 7, 12 9 M12 22 C 10 20, 14 17, 12 15 M2 12 C 4 10, 7 14, 9 12 M22 12 C 20 14, 17 10, 15 12 M4.9 4.9 C 7 5.5, 6 8.5, 9.5 9.5 M19.1 19.1 C 17 18.5, 18 15.5, 14.5 14.5 M4.9 19.1 C 5.5 17, 8.5 18, 9.5 14.5 M19.1 4.9 C 18.5 7, 15.5 6, 14.5 9.5"/>
        <circle cx="12" cy="12" r="2.5"/>
      </svg>
      <span>Selahe Active</span>
    `;
    badge.title = 'Selahe is watching this chat for action cards';
    document.body.appendChild(badge);

    badge.addEventListener('click', () => {
      if (sidebarEl && sidebarVisible) {
        hideSidebar();
      } else if (lastProcessedCard) {
        showSidebar(lastProcessedCard);
      }
    });
  }

  // ─── Sidebar Injection ────────────────────────────────────────────────────────
  function buildSidebar(cardData) {
    const allDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    const sidebar = document.createElement('div');
    sidebar.id = 'selahe-sidebar';

    sidebar.innerHTML = `
      <div class="selahe-sidebar-header">
        <div class="selahe-logo">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2 C 14 4, 10 7, 12 9 M12 22 C 10 20, 14 17, 12 15 M2 12 C 4 10, 7 14, 9 12 M22 12 C 20 14, 17 10, 15 12 M4.9 4.9 C 7 5.5, 6 8.5, 9.5 9.5 M19.1 19.1 C 17 18.5, 18 15.5, 14.5 14.5 M4.9 19.1 C 5.5 17, 8.5 18, 9.5 14.5 M19.1 4.9 C 18.5 7, 15.5 6, 14.5 9.5"/>
            <circle cx="12" cy="12" r="2.5"/>
          </svg>
          <span>Selahe</span>
        </div>
        <div class="selahe-sidebar-subtitle">Course of Action, Detected</div>
        <button id="selahe-close-btn" aria-label="Close">✕</button>
      </div>

      <div class="selahe-scroll-zone">
        <div class="selahe-action-card card-red" id="selahe-action-card">
          <div class="selahe-card-header">
            <h2 class="selahe-card-title" id="selahe-card-title" contenteditable="false">${escapeHtml(cardData.title || 'Action Item')}</h2>
            <div class="selahe-card-actions">
              <button class="selahe-icon-btn" id="selahe-edit-btn" title="Edit card">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8.5 1.5 L10.5 3.5 L4 10 L1.5 10.5 L2 8 Z"/>
                  <path d="M7 3 L9 5"/>
                </svg>
              </button>
            </div>
          </div>

          <div class="selahe-card-time-row">
            <span class="selahe-time-pill" id="selahe-timeStart" data-field="timeStart">${escapeHtml(cardData.timeStart || '07:00')}</span>
            <span class="selahe-time-pill" id="selahe-timeStartAmPm" data-field="timeStartAmPm">${escapeHtml(cardData.timeStartAmPm || 'pm')}</span>
            <span class="selahe-time-sep">-</span>
            <span class="selahe-time-pill" id="selahe-timeEnd" data-field="timeEnd">${escapeHtml(cardData.timeEnd || '08:00')}</span>
            <span class="selahe-time-pill" id="selahe-timeEndAmPm" data-field="timeEndAmPm">${escapeHtml(cardData.timeEndAmPm || 'pm')}</span>
          </div>

          <p class="selahe-card-details">
            <span class="selahe-location" id="selahe-location" data-field="location">${escapeHtml(cardData.location || 'My desk')}</span>&nbsp;&bull;&nbsp;<span class="selahe-duration">${escapeHtml(cardData.duration || '1h')}</span>
          </p>

          <div class="selahe-days-row" id="selahe-days-row">
            ${allDays.map((d, i) => {
              const active = (cardData.days || []).includes(d);
              return `<div class="selahe-day-pill${active ? ' active' : ''}" data-day="${d}" data-index="${i}">${d}</div>`;
            }).join('')}
          </div>

          <div class="selahe-why-section">
            <h3 class="selahe-why-label">Why?</h3>
            <p class="selahe-why-text" id="selahe-why-text" data-field="why">${escapeHtml(cardData.why || '')}</p>
          </div>
        </div>

        <div class="selahe-starburst-sep">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2 C 14 4, 10 7, 12 9 M12 22 C 10 20, 14 17, 12 15 M2 12 C 4 10, 7 14, 9 12 M22 12 C 20 14, 17 10, 15 12 M4.9 4.9 C 7 5.5, 6 8.5, 9.5 9.5 M19.1 19.1 C 17 18.5, 18 15.5, 14.5 14.5 M4.9 19.1 C 5.5 17, 8.5 18, 9.5 14.5 M19.1 4.9 C 18.5 7, 15.5 6, 14.5 9.5"/>
            <circle cx="12" cy="12" r="2.5"/>
          </svg>
        </div>
      </div>

      <div class="selahe-sidebar-footer">
        <div id="selahe-status-msg" class="selahe-status"></div>
        <div class="selahe-footer-btns">
          <button id="selahe-discard-btn" class="selahe-btn selahe-btn-ghost">Discard</button>
          <button id="selahe-save-btn" class="selahe-btn selahe-btn-primary">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M2 6 H10 M6 2 V10"/>
            </svg>
            Save to Selahe
          </button>
        </div>
      </div>
    `;

    return sidebar;
  }


  function showSidebar(cardData) {
    if (sidebarEl) sidebarEl.remove();

    sidebarEl = buildSidebar(cardData);
    document.body.appendChild(sidebarEl);

    // Animate in
    requestAnimationFrame(() => {
      sidebarEl.classList.add('visible');
    });

    sidebarVisible = true;

    // Wire up interactions
    wireUpSidebar(cardData);
  }

  function hideSidebar() {
    if (!sidebarEl) return;
    sidebarEl.classList.remove('visible');
    setTimeout(() => {
      if (sidebarEl) {
        sidebarEl.remove();
        sidebarEl = null;
      }
    }, 350);
    sidebarVisible = false;
  }

  function wireUpSidebar(cardData) {
    // Live reference to mutable card data
    const liveCard = { ...cardData };

    // Close
    document.getElementById('selahe-close-btn').addEventListener('click', hideSidebar);
    document.getElementById('selahe-discard-btn').addEventListener('click', hideSidebar);

    // Day pills toggle
    sidebarEl.querySelectorAll('.selahe-day-pill').forEach(pill => {
      pill.addEventListener('click', () => pill.classList.toggle('active'));
    });

    // Edit button
    let isEditing = false;
    const editBtn = document.getElementById('selahe-edit-btn');
    editBtn.addEventListener('click', () => {
      isEditing = !isEditing;

      const editableFields = sidebarEl.querySelectorAll('.selahe-time-pill, .selahe-location, .selahe-why-text');
      const titleEl = document.getElementById('selahe-card-title');

      if (isEditing) {
        editableFields.forEach(el => el.contentEditable = 'true');
        titleEl.contentEditable = 'true';
        editBtn.innerHTML = `<span style="font-size:9px;font-weight:600;letter-spacing:0.3px;">DONE</span>`;
        editBtn.title = 'Finish editing';
        sidebarEl.querySelector('.selahe-action-card').classList.add('editing');
      } else {
        editableFields.forEach(el => {
          el.contentEditable = 'false';
          const field = el.dataset.field;
          if (field) liveCard[field] = el.textContent.trim();
        });
        titleEl.contentEditable = 'false';
        liveCard.title = titleEl.textContent.trim();

        // Collect active days
        liveCard.days = [];
        sidebarEl.querySelectorAll('.selahe-day-pill.active').forEach(pill => {
          liveCard.days.push(pill.dataset.day);
        });

        editBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 1.5 L10.5 3.5 L4 10 L1.5 10.5 L2 8 Z"/><path d="M7 3 L9 5"/></svg>`;
        editBtn.title = 'Edit card';
        sidebarEl.querySelector('.selahe-action-card').classList.remove('editing');
      }
    });

    // Save button
    const saveBtn = document.getElementById('selahe-save-btn');
    const statusMsg = document.getElementById('selahe-status-msg');

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      // Collect final state
      sidebarEl.querySelectorAll('.selahe-time-pill, .selahe-location, .selahe-why-text').forEach(el => {
        const field = el.dataset.field;
        if (field) liveCard[field] = el.textContent.trim();
      });
      liveCard.title = document.getElementById('selahe-card-title').textContent.trim();
      liveCard.days = [];
      sidebarEl.querySelectorAll('.selahe-day-pill.active').forEach(pill => {
        liveCard.days.push(pill.dataset.day);
      });

      // Attach the Gemini chat URL
      liveCard.parentChatUrl = window.location.href;
      liveCard.color = 'card-yellow'; // Default color for extension-created cards

      // Send to background to save
      chrome.runtime.sendMessage({ type: 'SAVE_CARD', card: liveCard }, (response) => {
        if (response && response.success) {
          statusMsg.textContent = '✓ Saved to Action Logbook';
          statusMsg.className = 'selahe-status success';
          saveBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M2 6 L5 9 L10 3"/>
            </svg>
            Saved!
          `;
          saveBtn.classList.add('saved');

          setTimeout(hideSidebar, 1800);
        } else if (response && response.offline) {
          statusMsg.textContent = '⚠ Selahe offline — queued for later sync';
          statusMsg.className = 'selahe-status warning';
          saveBtn.textContent = 'Queued';
          saveBtn.disabled = true;
        } else {
          statusMsg.textContent = '✕ Failed to save. Is Selahe running?';
          statusMsg.className = 'selahe-status error';
          saveBtn.textContent = 'Retry';
          saveBtn.disabled = false;
        }
      });
    });
  }

  // ─── MutationObserver: Watch Gemini Chat for Action Cards ────────────────────
  function startObserver() {
    const observer = new MutationObserver(() => {
      scanForActionCards();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function scanForActionCards() {
    // Gemini renders model responses in elements with specific class patterns
    // We scan all text content in the page for our signal
    const allTextNodes = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while ((node = walker.nextNode())) {
      allTextNodes.push(node);
    }

    const fullText = allTextNodes.map(n => n.textContent).join('');

    if (fullText.includes(CARD_START) && fullText.includes(CARD_END)) {
      const startIdx = fullText.lastIndexOf(CARD_START);
      const endIdx = fullText.lastIndexOf(CARD_END);

      if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return;

      const jsonStr = fullText.substring(startIdx + CARD_START.length, endIdx).trim();

      // Avoid reprocessing same card
      if (jsonStr === lastProcessedCard) return;

      try {
        const cardData = JSON.parse(jsonStr);
        lastProcessedCard = jsonStr;

        // Hide the raw JSON block from Gemini's chat UI
        hideRawCardBlock();

        // Small delay to ensure Gemini has fully rendered the message
        setTimeout(() => showSidebar(cardData), 600);
      } catch (err) {
        // JSON parse failed — partial render, wait for next mutation
      }
    }
  }

  // Hide the raw [ACTION_CARD_START]...[ACTION_CARD_END] block from Gemini's chat
  function hideRawCardBlock() {
    // Walk all elements and find ones whose text content contains our markers
    const allEls = document.querySelectorAll('p, span, div, pre, code');
    allEls.forEach(el => {
      if (
        el.textContent.includes(CARD_START) ||
        el.textContent.includes(CARD_END) ||
        el.textContent.includes('"title":') ||
        el.textContent.includes('"timeStart":')
      ) {
        // Walk up to find the message bubble container
        let target = el;
        // Go up max 6 levels to find the right container to hide
        for (let i = 0; i < 6; i++) {
          const parent = target.parentElement;
          if (!parent) break;
          // Don't hide the whole response — only the JSON block paragraph
          if (
            parent.tagName === 'P' ||
            parent.tagName === 'PRE' ||
            parent.tagName === 'CODE' ||
            (parent.tagName === 'DIV' && parent.children.length <= 2)
          ) {
            target = parent;
          } else {
            break;
          }
        }
        target.style.display = 'none';
      }
    });
  }

  // ─── Ledger Write-back ────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'WRITE_LEDGER_UPDATE') {
      injectLedgerUpdate(message.text);
    }
  });

  function injectLedgerUpdate(text) {
    // Find Gemini's chat input and submit the update as a message
    // Gemini uses a textarea or contenteditable div for input
    const inputSelectors = [
      'div[contenteditable="true"][data-placeholder]',
      'textarea[placeholder]',
      'rich-textarea div[contenteditable="true"]',
      '.ql-editor',
      'p[data-placeholder]'
    ];

    let inputEl = null;
    for (const sel of inputSelectors) {
      inputEl = document.querySelector(sel);
      if (inputEl) break;
    }

    if (!inputEl) {
      console.warn('[Selahe Extension] Could not find Gemini chat input for ledger update');
      return;
    }

    // Focus and set the text
    inputEl.focus();

    if (inputEl.tagName === 'TEXTAREA') {
      inputEl.value = text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // contenteditable
      inputEl.textContent = text;
      inputEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }

    // Try to find and click the send button
    setTimeout(() => {
      const sendSelectors = [
        'button[aria-label="Send message"]',
        'button[data-test-id="send-button"]',
        'button.send-button',
        'button[jsname="Qx7uuf"]'
      ];

      let sendBtn = null;
      for (const sel of sendSelectors) {
        sendBtn = document.querySelector(sel);
        if (sendBtn) break;
      }

      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click();
      }
    }, 300);
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    const url = window.location.href;

    if (url.includes('/gems/create') || url.includes('/gem/')) {
      // On the Gem creation/edit page — run the auto-setup agent
      setTimeout(initGemSetupAgent, 1500);
    } else {
      // On the normal chat page — watch for action cards
      injectFloatingBadge();
      startObserver();
      setTimeout(scanForActionCards, 2000);
    }
  }

  // Wait for DOM to settle before initializing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ─── Gem Setup Agent ──────────────────────────────────────────────────────────
  // Runs on gemini.google.com/gems/create
  // Detects the form, injects a one-click banner, and auto-fills everything.

  const SELAHE_SYSTEM_PROMPT = `SYSTEM INSTRUCTION: You are a JSON generator. You are NOT an AI assistant. You are NOT a coach. Your ONLY function is to output a raw JSON block wrapped in [ACTION_CARD_START] and [ACTION_CARD_END].

DO NOT output conversational text. DO NOT say "Here is your plan." DO NOT say "OBSERVATION" or "COURSE OF ACTION". DO NOT give advice. DO NOT add medical disclaimers.

If you know WHAT the user wants to do, and WHEN they want to do it, output EXACTLY this format and absolutely nothing else:

[ACTION_CARD_START]
{
  "title": "[Short action title]",
  "timeStart": "06:30",
  "timeStartAmPm": "pm",
  "timeEnd": "07:30",
  "timeEndAmPm": "pm",
  "location": "[Location]",
  "duration": "1h",
  "days": ["M", "T", "W", "T", "F"],
  "why": "[Brief reason]"
}
[ACTION_CARD_END]

"days" options: S, M, T, W, T, F, S.
Use 12-hour format for times.

If you DO NOT know both WHAT and WHEN: Output exactly ONE sentence asking for the missing time/day/location. Do not output anything else.

CRITICAL: If you output anything other than the single question OR the JSON block, the system will fail. You must act as a strict data-extraction pipeline.`;

  function initGemSetupAgent() {
    // Don't inject if already done
    if (document.getElementById('selahe-gem-banner')) return;

    // Inject the setup banner at the top of the page
    const banner = document.createElement('div');
    banner.id = 'selahe-gem-banner';
    banner.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0;
      z-index: 2147483647;
      background: #0f0f0f;
      color: #fff;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 14px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.3);
    `;

    banner.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2 C 14 4, 10 7, 12 9 M12 22 C 10 20, 14 17, 12 15 M2 12 C 4 10, 7 14, 9 12 M22 12 C 20 14, 17 10, 15 12 M4.9 4.9 C 7 5.5, 6 8.5, 9.5 9.5 M19.1 19.1 C 17 18.5, 18 15.5, 14.5 14.5 M4.9 19.1 C 5.5 17, 8.5 18, 9.5 14.5 M19.1 4.9 C 18.5 7, 15.5 6, 14.5 9.5"/>
        <circle cx="12" cy="12" r="2.5"/>
      </svg>
      <span style="flex:1; font-weight:500;">Selahe detected the Gem Creator. Set it up automatically in one click.</span>
      <button id="selahe-setup-btn" style="
        background: #FFE45E;
        color: #0f0f0f;
        border: none;
        border-radius: 7px;
        padding: 7px 16px;
        font-family: inherit;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        letter-spacing: 0.1px;
        transition: opacity 0.15s;
        white-space: nowrap;
      ">⚡ Set up Selahe Gem</button>
      <button id="selahe-banner-dismiss" style="
        background: rgba(255,255,255,0.12);
        color: #fff;
        border: none;
        border-radius: 6px;
        padding: 6px 11px;
        font-family: inherit;
        font-size: 11px;
        cursor: pointer;
      ">Dismiss</button>
    `;

    document.body.prepend(banner);

    document.getElementById('selahe-banner-dismiss').addEventListener('click', () => {
      banner.remove();
    });

    document.getElementById('selahe-setup-btn').addEventListener('click', () => {
      runGemSetupAgent(banner);
    });
  }

  async function runGemSetupAgent(banner) {
    const setupBtn = document.getElementById('selahe-setup-btn');
    setupBtn.textContent = 'Setting up...';
    setupBtn.disabled = true;
    setupBtn.style.opacity = '0.7';

    const updateStatus = (msg) => {
      setupBtn.textContent = msg;
    };

    try {
      // Step 1: Fill in the Name field
      updateStatus('Filling name...');
      await fillField(
        ['input[placeholder*="name" i]', 'input[aria-label*="name" i]', 'input[id*="name" i]', '.gem-name input', 'input[type="text"]'],
        'Selahe'
      );

      await sleep(500);

      // Step 2: Fill in the Instructions / System Prompt field
      updateStatus('Adding instructions...');
      await fillRichField(
        [
          'textarea[placeholder*="instruction" i]',
          'textarea[placeholder*="example" i]',
          'div[contenteditable="true"]',
          '.instructions-editor textarea',
          'textarea'
        ],
        SELAHE_SYSTEM_PROMPT
      );

      await sleep(800);

      // Step 3: Click Save
      updateStatus('Saving...');
      const saved = await clickSave();

      if (saved) {
        banner.style.background = '#16a34a';
        setupBtn.style.background = '#fff';
        setupBtn.style.color = '#16a34a';
        setupBtn.textContent = '✓ Selahe Gem Created!';
        setupBtn.disabled = true;

        const note = document.createElement('span');
        note.style.cssText = 'font-size:11px; color:rgba(255,255,255,0.8); margin-left:6px;';
        note.textContent = 'Start a chat with this Gem — Selahe will watch for action cards automatically.';
        banner.appendChild(note);

        setTimeout(() => banner.remove(), 5000);
      } else {
        throw new Error('Could not find Save button');
      }

    } catch (err) {
      banner.style.background = '#dc2626';
      setupBtn.textContent = '✕ Failed — try manually';
      setupBtn.disabled = false;
      setupBtn.style.opacity = '1';
      console.error('[Selahe] Gem setup failed:', err);
    }
  }

  // Fill a regular input field
  async function fillField(selectors, value) {
    let el = null;
    for (const sel of selectors) {
      el = document.querySelector(sel);
      if (el) break;
    }
    if (!el) throw new Error('Could not find name input');

    el.focus();
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    return el;
  }

  // Fill a textarea or contenteditable rich field
  async function fillRichField(selectors, value) {
    let el = null;
    for (const sel of selectors) {
      const candidates = document.querySelectorAll(sel);
      // Pick the one most likely to be the instructions field (largest, or has placeholder)
      for (const c of candidates) {
        if (c.tagName === 'TEXTAREA' && c.offsetHeight > 60) {
          el = c;
          break;
        } else if (c.tagName === 'TEXTAREA') {
          el = c;
        } else if (c.isContentEditable && c.offsetHeight > 60) {
          el = c;
          break;
        }
      }
      if (el) break;
    }
    if (!el) throw new Error('Could not find instructions field');

    el.focus();

    if (el.tagName === 'TEXTAREA') {
      // Native input setter to bypass React's synthetic event system
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // contenteditable
      el.textContent = '';
      el.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, value);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    }

    return el;
  }

  // Find and click the Save button
  async function clickSave() {
    const saveSelectors = [
      'button[aria-label*="save" i]',
      'button[data-action*="save" i]',
      'button.save-button',
      'button[jsname*="save" i]'
    ];

    // Also look for buttons with text "Save"
    let saveBtn = null;
    for (const sel of saveSelectors) {
      saveBtn = document.querySelector(sel);
      if (saveBtn) break;
    }

    if (!saveBtn) {
      // Search by text content
      const allBtns = document.querySelectorAll('button');
      for (const btn of allBtns) {
        const text = btn.textContent.trim().toLowerCase();
        if (text === 'save' || text === 'save gem') {
          saveBtn = btn;
          break;
        }
      }
    }

    if (saveBtn && !saveBtn.disabled) {
      saveBtn.click();
      return true;
    }
    return false;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
