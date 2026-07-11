/**
 * Selahe - Interactive Client-Side Logic
 * Integrates Gemini 2.5 Pro API key integration, local filesystem storage (via Node API),
 * and action items checklist.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- UI Elements ---
  const body = document.documentElement;

  const sidebarToggle = document.getElementById('sidebar-toggle');
  const mainSidebar = document.getElementById('main-sidebar');
  const mainHeaderTitle = document.getElementById('main-header-title');

  const landingState = document.getElementById('landing-state');
  const chatState = document.getElementById('chat-state');
  const logbookState = document.getElementById('logbook-state');
  const logbookContent = document.getElementById('logbook-content');
  const landingForm = document.getElementById('landing-form');
    const feelingInput = document.getElementById('feeling-input');
    const landingSubmit = document.querySelector('.search-submit');
    const chatSubmit = document.querySelector('.chat-submit-btn');

    function updateSendButtonVisibility(inputEl, buttonEl) {
      if (!inputEl || !buttonEl) return;
      if (inputEl.value.trim().length > 0) {
        buttonEl.classList.add('visible');
      } else {
        buttonEl.classList.remove('visible');
      }
    }

  const toggleStatsBtn = document.getElementById('toggle-stats-btn');
  const statsState = document.getElementById('stats-state');
  let currentMonthIndex = 0;

  const openLogbookBtn = document.getElementById('open-logbook-btn');
  if (openLogbookBtn) {
    openLogbookBtn.addEventListener('click', () => {
    landingState.style.display = 'none';
    chatState.style.display = 'none';
    if (statsState) statsState.style.display = 'none';
    logbookState.style.display = 'block';

    if (toggleStatsBtn) {
      toggleStatsBtn.style.display = 'none';
      toggleStatsBtn.classList.remove('active');
    }

    if (mainHeaderTitle) {
      mainHeaderTitle.style.display = 'none';
    }
    openLogbookBtn.classList.add('active');

    activeSessionId = null;
    renderHistoryPanel(); // Clear highlight on active chat items

    // Update URL
    if (window.location.pathname !== '/action') {
      history.pushState(null, '', '/action');
    }

    // Always re-render to catch newest tasks
    window.renderLogbook();
  });
  }

  const logbookMiniBtn = document.getElementById('logbook-mini-btn');
  if (logbookMiniBtn) {
    logbookMiniBtn.addEventListener('click', () => {
      // Toggle to logbook state
      landingState.style.display = 'none';
      chatState.style.display = 'none';
      logbookState.style.display = 'flex';

      // Update sidebar styling
      if (openLogbookBtn) openLogbookBtn.classList.add('active');
      logbookMiniBtn.classList.add('active');
      const activeItems = historyListContainer.querySelectorAll('.history-item.active');
      activeItems.forEach(item => item.classList.remove('active'));
      activeSessionId = null;

      if (mainHeaderTitle) mainHeaderTitle.textContent = 'Action Logbook';

      renderLogbook();
    });
  }

  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInputField = document.getElementById('chat-input-field');

  const historyListContainer = document.getElementById('history-list-container');

  const suggestionTags = document.querySelectorAll('.suggestion-tag');

  // --- Settings Modal Elements ---
  const settingsModal = document.getElementById('settings-modal');
  const closeSettingsModalBtn = document.getElementById('close-settings-modal');

  const geminiApiKeyInput = document.getElementById('gemini-api-key');
  const geminiModelSelect = document.getElementById('gemini-model-select');
  const toggleGeminiKeyVisibilityBtn = document.getElementById('toggle-gemini-key-visibility');
  const saveApiKeyBtn = document.getElementById('save-api-key-btn');
  const apiStatusBadge = document.getElementById('api-status-badge');
  const syncStatusBadge = document.getElementById('sync-status-badge');

  const usagePromptTokens = document.getElementById('usage-prompt-tokens');
  const usageCompletionTokens = document.getElementById('usage-completion-tokens');
  const usageEstCost = document.getElementById('usage-est-cost');
  const usageApiRequests = document.getElementById('usage-api-requests');
  const creditsRemainingText = document.getElementById('credits-remaining-text');
  const creditsProgressFill = document.getElementById('credits-progress-fill');
  const resetUsageBtn = document.getElementById('reset-usage-btn');

  // --- State Variables ---
  let activeSessionId = null;
  let chatSessions = {}; // format: { sessionId: { id, title, messages: [] } }
  let taskList = []; // format: [ { id, text, completed: false } ]
  let geminiApiKey = '';
  let geminiModel = 'gemini-2.5-flash';
  let usageStats = {
    promptTokens: 0,
    completionTokens: 0,
    requests: 0,
    cost: 0.0
  };

  // --- Supabase Config & State ---
  const supabaseUrl = 'https://fkrfyqbozwijzstcnyaq.supabase.co';
  const supabaseAnonKey = 'sb_publishable_PJW2BcphY2-E-CKDM62rcw_OcpCJXwb';
  let supabase = null;
  let currentUser = null;

  if (window.supabase) {
    supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  } else {
    console.warn("Supabase client SDK not loaded");
  }

  // --- Fallback Simulated Database ---
  // These are first-turn probing questions only. NO Action Card is generated here.
  // Cards are ONLY generated by Gemini after extracting real details from the user.
  const feelingDatabase = {
    overwhelmed: {
      probe: "What specifically is overwhelming you right now — is it one big thing, or a pile of smaller things stacking up?"
    },
    unmotivated: {
      probe: "What's the thing you're trying to start but can't? And what do you think is stopping you — is it unclear what to do, or does it just feel pointless right now?"
    },
    anxious: {
      probe: "What's the specific thing your mind keeps circling back to? Is it something coming up soon, or something more ongoing?"
    },
    excited: {
      probe: "What are you excited about? Tell me what you want to do — and what's the main thing you're afraid might distract you or get in the way?"
    },
    frustrated: {
      probe: "What's blocking you? Describe the exact situation — what were you trying to do, and what happened instead?"
    },
    sad: {
      probe: "What's going on? You don't have to explain everything — just tell me what's weighing on you the most right now."
    },
    default: {
      probe: "Tell me more. What's the specific thing on your mind — what do you want to do, and what's getting in the way?"
    }
  };


  // --- Initializers & Event Listeners ---
  initTheme();
  initLocalStorage();
  renderHistoryPanel();
  updateUsageUI();
  updateAPIStatusBadge();
  loadFromServer(); // Fetch conversations from local files

  // Handle Initial Routing
  const currentPath = window.location.pathname;
  if (currentPath === '/action') {
    // Show logbook on load
    landingState.style.display = 'none';
    chatState.style.display = 'none';
    logbookState.style.display = 'block';
    if (mainHeaderTitle) mainHeaderTitle.style.display = 'none';
    if (openLogbookBtn) openLogbookBtn.classList.add('active');
    window.renderLogbook();
  } else if (currentPath.startsWith('/app/')) {
    const sessionId = currentPath.split('/app/')[1];
    if (chatSessions[sessionId]) {
      restoreSession(sessionId);
    } else {
      startFresh(true);
    }
  } else {
    startFresh(true);
  }

  // Brand Title Home Link
  const brandTitle = document.getElementById('brand-title');
  if (brandTitle) {
    brandTitle.addEventListener('click', () => {
      startFresh();
    });
  }

  // --- Sidebar Toggle Logic ---
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      if (mainSidebar) {
        mainSidebar.classList.toggle('expanded');

        // Show Action Logbook title in header if expanded
        if (mainHeaderTitle) {
          mainHeaderTitle.style.display = mainSidebar.classList.contains('expanded') ? 'block' : 'none';
        }
      }
    });
  }

  // Suggestion tags
  suggestionTags.forEach(tag => {
    tag.addEventListener('click', () => {
      const feeling = tag.getAttribute('data-feeling');
      const text = tag.textContent;
      startChatWithFeeling(text, feeling);
    });
  });

  // Form Submissions
  landingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = feelingInput.value.trim();
    if (!text) return;
    feelingInput.value = '';
    updateSendButtonVisibility(feelingInput, landingSubmit);
    startChatWithFeeling(text);
  });

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInputField.value.trim();
    if (!text) return;
    chatInputField.value = '';
    updateSendButtonVisibility(chatInputField, chatSubmit);

    addMessageToActiveSession('user', text);
    handleAIResponse(text);
  });

  // Bind input visibility togglers
  if (feelingInput && landingSubmit) {
    feelingInput.addEventListener('input', () => updateSendButtonVisibility(feelingInput, landingSubmit));
  }
  if (chatInputField && chatSubmit) {
    chatInputField.addEventListener('input', () => updateSendButtonVisibility(chatInputField, chatSubmit));
  }

  // Add task listener removed

  // --- Settings Modal Trigger ---
  closeSettingsModalBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });

  // Save Settings configurations
  saveApiKeyBtn.addEventListener('click', () => {
    geminiApiKey = geminiApiKeyInput.value.trim();
    geminiModel = geminiModelSelect.value;

    localStorage.setItem('selahe_gemini_api_key', geminiApiKey);
    localStorage.setItem('selahe_gemini_model', geminiModel);

    updateAPIStatusBadge();
    alert('Configurations saved successfully.');
  });

  // Visibility Toggles
  toggleGeminiKeyVisibilityBtn.addEventListener('click', () => {
    const isPassword = geminiApiKeyInput.type === 'password';
    geminiApiKeyInput.type = isPassword ? 'text' : 'password';
  });

  resetUsageBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all token and credit usage counters?')) {
      usageStats = { promptTokens: 0, completionTokens: 0, requests: 0, cost: 0.0 };
      localStorage.setItem('selahe_usage_stats', JSON.stringify(usageStats));
      updateUsageUI();
    }
  });

  // --- Theme Functions ---
  function initTheme() {
    const savedTheme = localStorage.getItem('selahe-theme') || 'light';
    setTheme(savedTheme);
  }

  function setTheme(theme) {
    body.setAttribute('data-theme', theme);
    localStorage.setItem('selahe-theme', theme);
  }

  // --- Local Storage Initialization ---
  function initLocalStorage() {
    chatSessions = JSON.parse(localStorage.getItem('selahe_sessions')) || {};
    taskList = JSON.parse(localStorage.getItem('selahe_tasks')) || [];

    // Migrate legacy tasks without deleting orphaned ones synchronously on load (to avoid race conditions with loadFromServer)
    taskList.forEach(task => {
      if (!task.sessionId && task.cardData && task.cardData.title) {
        const matchingSessionId = Object.keys(chatSessions).find(id => {
          return chatSessions[id].actionTitle === task.cardData.title || chatSessions[id].title === task.cardData.title;
        });
        if (matchingSessionId) {
          task.sessionId = matchingSessionId;
        }
      }
    });

    syncTasksToStorage(taskList);

    // Load API Key from local storage or default to empty
    geminiApiKey = localStorage.getItem('selahe_gemini_api_key') || '';
    geminiApiKeyInput.value = geminiApiKey;

    // Load gemini model (defaulting to gemini-2.5-flash to prevent 429)
    geminiModel = localStorage.getItem('selahe_gemini_model') || 'gemini-2.5-flash';
    geminiModelSelect.value = geminiModel;

    usageStats = JSON.parse(localStorage.getItem('selahe_usage_stats')) || {
      promptTokens: 0,
      completionTokens: 0,
      requests: 0,
      cost: 0.0
    };
  }

  function updateAPIStatusBadge() {
    if (geminiApiKey.length > 0) {
      apiStatusBadge.textContent = "Active";
      apiStatusBadge.className = "api-badge status-active";
    } else {
      apiStatusBadge.textContent = "Not Configured";
      apiStatusBadge.className = "api-badge status-inactive";
    }
  }

  // --- Local Filesystem Syncing ---
  async function loadFromServer() {
    try {
      const resSess = await fetch('/api/sessions');
      if (resSess.ok) {
        const data = await resSess.json();
        if (data && Object.keys(data).length > 0) {
          chatSessions = data;
          localStorage.setItem('selahe_sessions', JSON.stringify(chatSessions));

          // --- Task Self-Healing / Auto-Restore Logic ---
          let savedTasks = JSON.parse(localStorage.getItem('selahe_tasks')) || [];
          let hasRestored = false;

          Object.keys(chatSessions).forEach(sid => {
            const session = chatSessions[sid];
            if (!session.hasSavedCard) return;

            const taskExists = savedTasks.some(t => t.sessionId === sid);
            if (!taskExists) {
              const actionMsg = session.messages.find(m => m.actionCardData);
              if (actionMsg && actionMsg.actionCardData) {
                const cardData = actionMsg.actionCardData;
                const title = cardData.title || session.title || 'Task';
                const timeStart = cardData.timeStart || '';
                const timeStartAmPm = cardData.timeStartAmPm || '';
                const timeEnd = cardData.timeEnd || '';
                const timeEndAmPm = cardData.timeEndAmPm || '';
                const location = cardData.location || '';
                const taskText = `${title} (${timeStart}${timeStartAmPm} - ${timeEnd}${timeEndAmPm} • ${location})`;

                // Reconstruct completions from messages text
                const completions = [];
                session.messages.forEach(msg => {
                  if (msg.text && msg.text.includes('**Done task on')) {
                    const match = msg.text.match(/\*\*Done task on (\d+) ([a-zA-Z]+)/);
                    if (match) {
                      const day = parseInt(match[1]);
                      const monthName = match[2];
                      const monthsMap = {
                        'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
                        'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
                      };
                      const month = monthsMap[monthName];
                      if (month !== undefined) {
                        const d = new Date(2026, month, day);
                        completions.push(dateToDateString(d));
                      }
                    }
                  }
                });

                // Fallback to active date if empty
                if (completions.length === 0 && cardData.status === 'completed') {
                  const sessionTime = parseInt(session.id.split('_')[1]) || Date.now();
                  completions.push(dateToDateString(new Date(sessionTime)));
                }

                savedTasks.push({
                  id: 'task_' + (session.id.split('_')[1] || Date.now()),
                  text: taskText,
                  cardData: cardData,
                  date: parseInt(session.id.split('_')[1]) || Date.now(),
                  sessionId: sid,
                  cardId: actionMsg.timestamp,
                  completions: completions
                });
                hasRestored = true;
              }
            }
          });

          if (hasRestored) {
            syncTasksToStorage(savedTasks);
          }

          renderHistoryPanel();
        }
      }
      handleRouting(true); // Handle initial route load based on URL

      // Update sync badge to reflect server communication is active
      syncStatusBadge.textContent = "v1/data (Connected)";
      syncStatusBadge.className = "api-badge status-active";

    } catch (e) {
      console.warn("Unable to contact local server API. Running in Local Browser Cache Mode.", e);
      syncStatusBadge.textContent = "Local Browser Only";
      syncStatusBadge.className = "api-badge status-inactive";
    }
  }

  async function syncSessionsToServer() {
    // 1. Always update local storage cache first
    localStorage.setItem('selahe_sessions', JSON.stringify(chatSessions));
    renderHistoryPanel();

    // 2. Write to local filesystem via node API
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatSessions)
      });
    } catch (err) {
      console.error("Failed to write sessions to filesystem", err);
    }

    // 3. Write to Supabase if logged in
    if (supabase && currentUser) {
      for (const sid of Object.keys(chatSessions)) {
        await saveSessionToSupabase(sid, chatSessions[sid]);
      }
    }
  }

  async function syncTasksToStorage(savedTasks) {
    taskList = savedTasks;
    localStorage.setItem('selahe_tasks', JSON.stringify(savedTasks));
    if (supabase && currentUser) {
      for (const t of savedTasks) {
        await saveTaskToSupabase(t);
      }
    }
  }

  function updateProfileUI(user) {
    const bottomContainer = document.getElementById('sidebar-bottom-profile');
    if (!bottomContainer) return;

    if (!user) {
      // Show Google Login button
      bottomContainer.innerHTML = `
        <div class="user-profile-container" id="user-profile-container">
          <button id="google-login-btn" class="google-login-btn" aria-label="Sign In with Google">
            <svg class="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path fill="#EA4335" d="M12 5.04c1.62 0 3.08.56 4.22 1.65l3.15-3.15C17.45 1.76 14.94 1 12 1 7.37 1 3.42 3.66 1.48 7.55l3.86 3C6.26 7.74 8.9 5.04 12 5.04z"/>
              <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.34H12v4.44h6.44c-.28 1.47-1.11 2.71-2.36 3.55l3.67 2.84c2.14-1.97 3.74-4.87 3.74-8.49z"/>
              <path fill="#FBBC05" d="M5.34 14.75A7.16 7.16 0 0 1 4.96 12c0-.97.16-1.92.48-2.81L1.48 6.19A11.96 11.96 0 0 0 0 12c0 2.11.55 4.1 1.5 5.86l3.84-3.11z"/>
              <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.67-2.84c-1.01.68-2.31 1.09-4.29 1.09-3.1 0-5.74-2.7-6.66-5.51l-3.84 3.11C3.42 20.34 7.37 23 12 23z"/>
            </svg>
            <span class="login-btn-text">Sign In with Google</span>
          </button>
        </div>
      `;

      const loginBtn = document.getElementById('google-login-btn');
      if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
          if (supabase) {
            await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: window.location.origin
              }
            });
          }
        });
      }
    } else {
      // Show User Profile Card
      const userMeta = user.user_metadata || {};
      const avatarUrl = userMeta.avatar_url || 'logo.png';
      const displayName = userMeta.full_name || user.email.split('@')[0];
      const email = user.email;

      bottomContainer.innerHTML = `
        <div class="user-profile-container logged-in" id="user-profile-container">
          <div class="user-avatar-wrapper">
            <img id="user-avatar" src="${avatarUrl}" alt="User Avatar" class="user-avatar-img">
          </div>
          <div class="user-info-text">
            <span id="user-display-name" class="user-display-name">${displayName}</span>
            <span id="user-email" class="user-email">${email}</span>
          </div>
          <button id="logout-btn" class="logout-btn" aria-label="Sign Out" title="Sign Out">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      `;

      const logoutBtn = document.getElementById('logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
          if (supabase) {
            await supabase.auth.signOut();
          }
        });
      }
    }
  }

  async function syncDataFromSupabase() {
    if (!supabase || !currentUser) return;
    try {
      // 1. Fetch sessions
      const { data: dbSessions, error: sessErr } = await supabase
        .from('selahe_sessions')
        .select('*')
        .eq('user_id', currentUser.id);

      if (!sessErr && dbSessions) {
        const newSessions = {};
        dbSessions.forEach(row => {
          newSessions[row.id] = {
            id: row.id,
            title: row.title,
            messages: row.messages,
            hasSavedCard: row.messages.some(m => m.actionCardData)
          };
        });
        chatSessions = newSessions;
        localStorage.setItem('selahe_sessions', JSON.stringify(chatSessions));
      }

      // 2. Fetch tasks
      const { data: dbTasks, error: taskErr } = await supabase
        .from('selahe_tasks')
        .select('*')
        .eq('user_id', currentUser.id);

      if (!taskErr && dbTasks) {
        taskList = dbTasks.map(row => {
          let taskObj;
          try {
            taskObj = JSON.parse(row.text);
          } catch {
            taskObj = {
              id: row.id,
              text: row.text,
              completions: [],
              cardData: { title: row.text, status: row.completed ? 'completed' : 'pending' }
            };
          }
          return taskObj;
        });
        localStorage.setItem('selahe_tasks', JSON.stringify(taskList));
      }

      // Sync any tasks from local server extension cache to Supabase
      try {
        const resLocalTasks = await fetch('/api/tasks');
        if (resLocalTasks.ok) {
          const localTasks = await resLocalTasks.json();
          if (Array.isArray(localTasks) && localTasks.length > 0) {
            for (const t of localTasks) {
              await saveTaskToSupabase(t);
              if (!taskList.some(existing => existing.id === t.id)) {
                taskList.push(t);
              }
            }
            await fetch('/api/tasks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify([])
            });
            localStorage.setItem('selahe_tasks', JSON.stringify(taskList));
          }
        }
      } catch (localErr) {
        console.warn("Could not sync local extension tasks:", localErr);
      }

      renderHistoryPanel();
      if (window.renderLogbook) window.renderLogbook();
    } catch (e) {
      console.error("Supabase sync failed:", e);
    }
  }

  async function saveSessionToSupabase(sessionId, sessionObj) {
    if (!supabase || !currentUser) return;
    try {
      await supabase
        .from('selahe_sessions')
        .upsert({
          id: sessionId,
          user_id: currentUser.id,
          title: sessionObj.title || 'Chat Session',
          messages: sessionObj.messages
        });
    } catch (err) {
      console.error("Failed to save session to Supabase:", err);
    }
  }

  async function saveTaskToSupabase(taskObj) {
    if (!supabase || !currentUser) return;
    try {
      await supabase
        .from('selahe_tasks')
        .upsert({
          id: taskObj.id,
          user_id: currentUser.id,
          text: JSON.stringify(taskObj),
          completed: taskObj.cardData?.status === 'completed' || false
        });
    } catch (err) {
      console.error("Failed to save task to Supabase:", err);
    }
  }

  async function deleteTaskFromSupabase(taskId) {
    if (!supabase || !currentUser) return;
    try {
      await supabase
        .from('selahe_tasks')
        .delete()
        .eq('id', taskId)
        .eq('user_id', currentUser.id);
    } catch (err) {
      console.error("Failed to delete task from Supabase:", err);
    }
  }

  // Set up Supabase Auth listener
  if (supabase) {
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session && session.user) {
        currentUser = session.user;
        updateProfileUI(currentUser);
        await syncDataFromSupabase();
      } else {
        currentUser = null;
        updateProfileUI(null);
        initLocalStorage();
        renderHistoryPanel();
        updateUsageUI();
      }
    });
  }

  // --- Token Dashboard ---
  function trackTokenUsage(prompt, completion) {
    usageStats.requests += 1;
    usageStats.promptTokens += prompt;
    usageStats.completionTokens += completion;

    // Cost calculation based on active model
    let cost = 0.0;
    if (geminiModel === 'gemini-2.5-pro') {
      cost = (prompt * 1.25 / 1000000) + (completion * 5.00 / 1000000);
    } else {
      cost = (prompt * 0.075 / 1000000) + (completion * 0.30 / 1000000);
    }
    usageStats.cost += cost;

    localStorage.setItem('selahe_usage_stats', JSON.stringify(usageStats));
    updateUsageUI();
  }

  function updateUsageUI() {
    usagePromptTokens.textContent = usageStats.promptTokens.toLocaleString();
    usageCompletionTokens.textContent = usageStats.completionTokens.toLocaleString();
    usageApiRequests.textContent = usageStats.requests.toLocaleString();
    usageEstCost.textContent = '$' + usageStats.cost.toFixed(4);

    const limit = 10.0;
    const remaining = Math.max(0, limit - usageStats.cost);
    const percentRemaining = Math.round((remaining / limit) * 100);

    creditsRemainingText.textContent = `${percentRemaining}% remaining`;
    creditsProgressFill.style.width = percentRemaining + '%';

    if (percentRemaining < 20) {
      creditsProgressFill.style.backgroundColor = '#ef4444';
    } else if (percentRemaining < 50) {
      creditsProgressFill.style.backgroundColor = '#f59e0b';
    } else {
      creditsProgressFill.style.backgroundColor = 'var(--accent-color)';
    }
  }

  // --- Chat Flow Functions ---
  function startChatWithFeeling(inputText, explicitFeeling = null) {
    const sessionId = 'session_' + Date.now();
    activeSessionId = sessionId;

    const title = inputText.length > 28 ? inputText.substring(0, 25) + '...' : inputText;

    chatSessions[sessionId] = {
      id: sessionId,
      title: title,
      actionTitle: title,
      messages: []
    };

    if (window.location.pathname !== '/app/' + sessionId) {
      history.pushState(null, '', '/app/' + sessionId);
    }

    if (mainHeaderTitle) mainHeaderTitle.textContent = title;

    landingState.style.display = 'none';
    chatState.style.display = 'flex';
    chatMessages.innerHTML = '';

    addMessageToActiveSession('user', inputText);

    const feeling = explicitFeeling || detectFeeling(inputText);
    handleAIResponse(inputText, feeling);
  }

  function addMessageToActiveSession(sender, text, actionData = null, actionCardData = null) {
    if (!activeSessionId) return;

    const messageObj = {
      sender,
      text,
      timestamp: Date.now(),
      actionData,
      actionCardData
    };

    if (actionCardData && actionCardData.title) {
      chatSessions[activeSessionId].actionTitle = actionCardData.title;
      chatSessions[activeSessionId].title = actionCardData.title;
      if (mainHeaderTitle) mainHeaderTitle.textContent = actionCardData.title;
      renderHistoryPanel(); // refresh sidebar to show new dynamic name
    }

    chatSessions[activeSessionId].messages.push(messageObj);
    renderMessage(messageObj);
    syncSessionsToServer();
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function renderMessage(messageObj) {
    const msgElement = document.createElement('div');
    msgElement.classList.add('message', messageObj.sender);

    const bubble = document.createElement('div');
    bubble.classList.add('message-bubble');
    // Render basic markdown: **bold** and line breaks (guard against null text)
    const rawText = messageObj.text || '';
    bubble.innerHTML = rawText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    msgElement.appendChild(bubble);

    if (messageObj.sender === 'ai' && messageObj.actionCardData) {
      const cardData = messageObj.actionCardData;

      // Build card using innerHTML to exactly match the React component structure
      const card = document.createElement('div');
      card.classList.add('action-card');
      card.dataset.cardId = messageObj.timestamp;

      // displayDays for UI, dataDays for the JSON schema
      const displayDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      const dataDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
      const activeDays = cardData.days || [];

      let displayTitle = cardData.title || 'Action Item';

      // Check if any card has been saved for this session
      const savedTasks = JSON.parse(localStorage.getItem('selahe_tasks')) || [];
      const sessionTasks = savedTasks.filter(t => t.sessionId === activeSessionId);
      const isAnyCardSaved = sessionTasks.length > 0;
      const isThisCardSaved = sessionTasks.some(t => t.cardId === messageObj.timestamp);

      let addBtnHTML = '';
      if (isThisCardSaved) {
        // Show disabled tick icon
        addBtnHTML = `
          <button class="action-card-btn add-btn" disabled style="opacity: 0.5; cursor: default;" title="Added to Logbook">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#373737" stroke-width="1.5" stroke-linecap="round">
              <path d="M2 6 L5 9 L10 3"/>
            </svg>
          </button>
        `;
      } else if (isAnyCardSaved) {
        // Hide or disable the add button if another card is already saved
        addBtnHTML = `
          <button class="action-card-btn add-btn" disabled style="opacity: 0.2; cursor: not-allowed;" title="Only one card can be saved per chat">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#373737" stroke-width="1.2" stroke-linecap="round">
              <path d="M2 6 H10 M6 2 V10"/>
            </svg>
          </button>
        `;
      } else {
        // Normal add button
        addBtnHTML = `
          <button class="action-card-btn add-btn" aria-label="Add to Logbook" title="Add to Logbook">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#373737" stroke-width="1.2" stroke-linecap="round">
              <path d="M2 6 H10 M6 2 V10"/>
            </svg>
          </button>
        `;
      }

      card.innerHTML = `
        <div class="action-card-header">
          <h2 class="action-card-title">${displayTitle}</h2>
          <div class="action-card-icons">
            <button class="action-card-btn edit-btn" aria-label="Edit" title="Edit">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#373737" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8.5 1.5 L10.5 3.5 L4 10 L1.5 10.5 L2 8 Z"/>
                <path d="M7 3 L9 5"/>
              </svg>
            </button>
            ${addBtnHTML}
          </div>
        </div>

        <div class="action-card-time-row">
          <span class="action-card-time-pill" data-field="timeStart">${cardData.timeStart || '07:00'}</span>
          <span class="action-card-time-pill" data-field="timeStartAmPm">${cardData.timeStartAmPm || 'pm'}</span>
          <span class="action-card-time-sep">-</span>
          <span class="action-card-time-pill" data-field="timeEnd">${cardData.timeEnd || '08:00'}</span>
          <span class="action-card-time-pill" data-field="timeEndAmPm">${cardData.timeEndAmPm || 'pm'}</span>
        </div>

        <p class="action-card-details">
          <span class="action-card-location" data-field="location">${cardData.location || 'My desk'}</span>&nbsp;&bull;&nbsp;<span class="action-card-duration">${cardData.duration || '1h'}</span>
        </p>

        <div class="action-card-days">
          ${displayDays.map((d, i) => {
            const isActive = activeDays.includes(dataDays[i]) || activeDays.includes(d);
            return `<div class="action-card-day${isActive ? ' active' : ''}" data-index="${i}">${d}</div>`;
          }).join('')}
        </div>

        <div class="action-card-why-section">
          <h3 class="action-card-why-label">Why?</h3>
          <p class="action-card-why-text">${cardData.why || ''}</p>
        </div>
      `;

      // Day toggle on click
      card.querySelectorAll('.action-card-day').forEach(dayEl => {
        dayEl.addEventListener('click', () => {
          dayEl.classList.toggle('active');
          const dayIndex = parseInt(dayEl.dataset.index);
          const dayCode = dataDays[dayIndex];
          
          if (!cardData.days) cardData.days = [];
          
          if (dayEl.classList.contains('active')) {
            if (!cardData.days.includes(dayCode)) {
              cardData.days.push(dayCode);
            }
          } else {
            cardData.days = cardData.days.filter(d => d !== dayCode);
          }
          
          // If this card is currently saved in logbook, update its days in tasks
          let savedTasks = JSON.parse(localStorage.getItem('selahe_tasks')) || [];
          const taskIndex = savedTasks.findIndex(t => t.sessionId === activeSessionId && t.cardId === messageObj.timestamp);
          if (taskIndex !== -1) {
            savedTasks[taskIndex].cardData.days = cardData.days;
            syncTasksToStorage(savedTasks);
            
            // Re-render logbook view if currently open
            if (logbookState && logbookState.style.display === 'block') {
              window.renderLogbook();
            }
          }
          syncSessionsToServer();
        });
      });

      // Edit button toggle
      let isEditing = false;
      const editBtn = card.querySelector('.edit-btn');
      // Store original CSS text so we can revert it
      const originalCssText = editBtn.style.cssText;

      editBtn.addEventListener('click', () => {
        isEditing = !isEditing;
        card.classList.toggle('editing', isEditing);

        if (isEditing) {
          // Make fields editable
          card.querySelectorAll('.action-card-time-pill, .action-card-location').forEach(el => {
            el.contentEditable = 'true';
          });
          card.querySelector('.action-card-why-text').contentEditable = 'true';
          card.querySelector('.action-card-title').contentEditable = 'true';

          // Visual feedback: Turn into a "Save" pill
          editBtn.innerHTML = `Save`;
          editBtn.style.width = 'auto';
          editBtn.style.height = '18px';
          editBtn.style.padding = '0 6px';
          editBtn.style.borderRadius = '3px';
          editBtn.style.backgroundColor = '#373737';
          editBtn.style.color = 'white';
          editBtn.style.fontSize = '10px';
          editBtn.style.fontWeight = '500';
          editBtn.style.border = 'none';
          editBtn.style.fontFamily = 'Inter, sans-serif';

          editBtn.title = 'Save changes';
        } else {
          // Extract new values from DOM
          const newTitle = card.querySelector('.action-card-title').textContent.trim();
          const newTimeStart = card.querySelector('[data-field="timeStart"]')?.textContent.trim() || '';
          const newTimeStartAmPm = card.querySelector('[data-field="timeStartAmPm"]')?.textContent.trim() || '';
          const newTimeEnd = card.querySelector('[data-field="timeEnd"]')?.textContent.trim() || '';
          const newTimeEndAmPm = card.querySelector('[data-field="timeEndAmPm"]')?.textContent.trim() || '';
          const newLocation = card.querySelector('[data-field="location"]')?.textContent.trim() || '';
          const newWhy = card.querySelector('.action-card-why-text').textContent.trim();

          const hasChanges = 
            newTitle !== oldCopy.title ||
            newTimeStart !== oldCopy.timeStart ||
            newTimeStartAmPm !== oldCopy.timeStartAmPm ||
            newTimeEnd !== oldCopy.timeEnd ||
            newTimeEndAmPm !== oldCopy.timeEndAmPm ||
            newLocation !== oldCopy.location ||
            newWhy !== oldCopy.why;

          const daysChanged = JSON.stringify(cardData.days || []) !== JSON.stringify(oldCopy.days || []);
          const isChanged = hasChanges || daysChanged;

          // Lock elements
          card.querySelectorAll('.action-card-time-pill, .action-card-location').forEach(el => {
            el.contentEditable = 'false';
          });
          card.querySelector('.action-card-why-text').contentEditable = 'false';
          card.querySelector('.action-card-title').contentEditable = 'false';

          // Update dataset
          cardData.title = newTitle;
          cardData.timeStart = newTimeStart;
          cardData.timeStartAmPm = newTimeStartAmPm;
          cardData.timeEnd = newTimeEnd;
          cardData.timeEndAmPm = newTimeEndAmPm;
          cardData.location = newLocation;
          cardData.why = newWhy;

          if (isChanged) {
            if (!cardData.history) cardData.history = [];
            const lastEditTime = cardData.lastEditTime || messageObj.timestamp;
            cardData.history.push({
              cardData: oldCopy,
              dateRange: {
                start: lastEditTime,
                end: Date.now()
              }
            });
            cardData.lastEditTime = Date.now();
          }

          // Sync title changes directly to active session object and header
          if (activeSessionId && chatSessions[activeSessionId]) {
            chatSessions[activeSessionId].actionTitle = newTitle;
            chatSessions[activeSessionId].title = newTitle;
            if (mainHeaderTitle) mainHeaderTitle.textContent = newTitle;
          }

          // If this card is currently saved in logbook, update its entire dataset in tasks
          let savedTasks = JSON.parse(localStorage.getItem('selahe_tasks')) || [];
          const taskIndex = savedTasks.findIndex(t => t.sessionId === activeSessionId && t.cardId === messageObj.timestamp);
          if (taskIndex !== -1) {
            const oldStatus = savedTasks[taskIndex].cardData.status || 'pending';
            savedTasks[taskIndex].cardData = { ...cardData, status: oldStatus };

            const timeStart = card.querySelector('[data-field="timeStart"]')?.textContent.trim() || '';
            const timeStartAmPm = card.querySelector('[data-field="timeStartAmPm"]')?.textContent.trim() || '';
            const timeEnd = card.querySelector('[data-field="timeEnd"]')?.textContent.trim() || '';
            const timeEndAmPm = card.querySelector('[data-field="timeEndAmPm"]')?.textContent.trim() || '';
            const location = card.querySelector('[data-field="location"]')?.textContent.trim() || '';
            savedTasks[taskIndex].text = `${newTitle} (${timeStart}${timeStartAmPm} - ${timeEnd}${timeEndAmPm} • ${location})`;

            syncTasksToStorage(savedTasks);

            // Re-render logbook view if currently open
            if (logbookState && logbookState.style.display === 'block') {
              window.renderLogbook();
            }
          }

          // Re-render sidebar to reflect name change instantly
          renderHistoryPanel();

          // Revert to original edit icon
          editBtn.style.cssText = originalCssText;
          editBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#373737" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 1.5 L10.5 3.5 L4 10 L1.5 10.5 L2 8 Z"/><path d="M7 3 L9 5"/></svg>`;
          editBtn.title = 'Edit';
          syncSessionsToServer();
        }
      });

      // Add/Plus button action: add task to logbook checklist
      const addBtn = card.querySelector('.add-btn');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          const title = card.querySelector('.action-card-title').textContent.trim();
          const timeStart = card.querySelector('[data-field="timeStart"]')?.textContent.trim() || '';
          const timeStartAmPm = card.querySelector('[data-field="timeStartAmPm"]')?.textContent.trim() || '';
          const timeEnd = card.querySelector('[data-field="timeEnd"]')?.textContent.trim() || '';
          const timeEndAmPm = card.querySelector('[data-field="timeEndAmPm"]')?.textContent.trim() || '';
          const location = card.querySelector('[data-field="location"]')?.textContent.trim() || '';
          const taskText = `${title} (${timeStart}${timeStartAmPm} - ${timeEnd}${timeEndAmPm} • ${location})`;

          // Save full cardData to persistent storage with default status
          cardData.status = 'pending';
          let savedTasks = JSON.parse(localStorage.getItem('selahe_tasks')) || [];
          savedTasks.push({
            id: 'task_' + Date.now(),
            text: taskText,
            cardData: cardData,
            date: Date.now(),
            sessionId: activeSessionId,
            cardId: messageObj.timestamp, // Lock logbook task to this specific chat message card
            completions: [] // Initialize completions array
          });
          syncTasksToStorage(savedTasks);

          // Mark the chat session as saved and update its title to this card
          if (activeSessionId && chatSessions[activeSessionId]) {
            chatSessions[activeSessionId].hasSavedCard = true;
            chatSessions[activeSessionId].actionTitle = cardData.title;
            chatSessions[activeSessionId].title = cardData.title;
            if (mainHeaderTitle) mainHeaderTitle.textContent = cardData.title;
            syncSessionsToServer();
            renderHistoryPanel(); // refresh sidebar
          }

          // Disable and checkmark this specific save button
          addBtn.disabled = true;
          addBtn.style.opacity = 0.5;
          addBtn.style.cursor = 'default';
          addBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#373737" stroke-width="1.5" stroke-linecap="round"><path d="M2 6 L5 9 L10 3"/></svg>`;
          addBtn.title = 'Added to Logbook';

          // Disable save button on all other cards generated in this session
          document.querySelectorAll('.action-card').forEach(c => {
            if (c.dataset.cardId !== String(messageObj.timestamp)) {
              const otherAddBtn = c.querySelector('.add-btn');
              if (otherAddBtn) {
                otherAddBtn.disabled = true;
                otherAddBtn.style.opacity = '0.2';
                otherAddBtn.style.cursor = 'not-allowed';
                otherAddBtn.title = 'Only one card can be saved per chat';
              }
            }
          });
        });
      }

      msgElement.appendChild(card);

      // Starburst logo separator
      const starburstSep = document.createElement('div');
      starburstSep.classList.add('starburst-separator');
      starburstSep.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2 C 14 4, 10 7, 12 9 M12 22 C 10 20, 14 17, 12 15 M2 12 C 4 10, 7 14, 9 12 M22 12 C 20 14, 17 10, 15 12 M4.9 4.9 C 7 5.5, 6 8.5, 9.5 9.5 M19.1 19.1 C 17 18.5, 18 15.5, 14.5 14.5 M4.9 19.1 C 5.5 17, 8.5 18, 9.5 14.5 M19.1 4.9 C 18.5 7, 15.5 6, 14.5 9.5"/>
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      `;
      msgElement.appendChild(starburstSep);
    }

    chatMessages.appendChild(msgElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function detectFeeling(text) {
    const textLower = text.toLowerCase();
    if (matchKeywords(textLower, ['overwhelm', 'stress', 'stuck', 'too much', 'heavy', 'drown', 'pile', 'deadline'])) return 'overwhelmed';
    if (matchKeywords(textLower, ['lazy', 'motivation', 'start', 'procrastinate', 'tired', 'sluggish', 'bored', 'unmotivated'])) return 'unmotivated';
    if (matchKeywords(textLower, ['anxious', 'scared', 'worry', 'panic', 'fear', 'nervous', 'interview', 'future'])) return 'anxious';
    if (matchKeywords(textLower, ['excite', 'happy', 'pumped', 'hype', 'good', 'joy', 'creative'])) return 'excited';
    if (matchKeywords(textLower, ['angry', 'mad', 'frustrate', 'annoy', 'hate', 'pissed', 'furious'])) return 'frustrated';
    if (matchKeywords(textLower, ['sad', 'cry', 'lonely', 'grief', 'depressed', 'down', 'hurt', 'blue'])) return 'sad';
    return 'default';
  }

  function matchKeywords(text, keywords) {
    return keywords.some(keyword => text.includes(keyword));
  }

  function handleAIResponse(userText, detectedFeeling = null) {
    const typingIndicator = document.createElement('div');
    typingIndicator.classList.add('message', 'ai', 'typing-element');
    typingIndicator.innerHTML = `
      <div class="message-bubble">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    `;
    chatMessages.appendChild(typingIndicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (geminiApiKey.length > 0) {
      callGeminiAPI(userText, typingIndicator, chatSessions[activeSessionId]?.messages || []);
    } else {
      // Fallback: simulated responses
      const feeling = detectedFeeling || detectFeeling(userText);
      const databaseMatch = feelingDatabase[feeling] || feelingDatabase['default'];

      setTimeout(() => {
        if (typingIndicator) typingIndicator.remove();
        // In simulated mode: just ask the first probing question.
        // Action Cards are ONLY generated by Gemini after it extracts real details from the user.
        const question = databaseMatch.probe || "Tell me more. What's the specific situation on your mind?";
        addMessageToActiveSession('ai', question, null, null);
      }, 1000);
    }
  }

  // --- Gemini API Generation Call ---
  async function callGeminiAPI(prompt, typingIndicator, conversationHistory = []) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

    const systemPrompt = `You are Selahe — a fast, direct, unbiased reflection machine. Not a therapist. Not a friend. A tool that converts what the user says into a clear Course of Action.

RULES (follow strictly, no exceptions):
- Ask AT MOST ONE question per turn. Never chain multiple questions in one response.
- If the user has already told you what they want to do AND when — generate the Action Card immediately. Do not ask for more.
- If the user expresses a clear intent ("I want to go to the gym tomorrow at 6PM") — that's enough. Make the card.
- If critical info is genuinely missing (no "what" or no "when") — ask ONE short question to get it, then stop.
- Never ask WHY if the user hasn't volunteered it. You can infer a brief "why" from context.
- Keep all conversational text under 2 short sentences. Be direct, not warm.
- You are not diagnosing anyone. You are just converting intent into a structured commitment.

When you have enough information, output a Course of Action Card using this exact JSON format:
[ACTION_CARD_START]
{
  "title": "Go to the Gym",
  "timeStart": "06:00",
  "timeStartAmPm": "pm",
  "timeEnd": "07:00",
  "timeEndAmPm": "pm",
  "location": "Gym",
  "duration": "1h",
  "days": ["We", "Th", "Fr"],
  "why": "I want to start going to the gym consistently to push myself and increase my confidence."
}
[ACTION_CARD_END]

"days" must be an array using these exact abbreviations: "Su", "Mo", "Tu", "We", "Th", "Fr", "Sa". 
If the user specifies a number of days (e.g., "6 times a week"), output exactly that many distinct days.
Write the "why" in the first-person from the user's perspective (e.g., "I want to...", "I committed to...").
If duration is not mentioned, estimate it reasonably based on the activity. If location is not mentioned, infer from context or use a sensible default.
IMPORTANT: Always use 12-hour format for timeStart and timeEnd (e.g. "06:00", "08:30") and set timeStartAmPm/timeEndAmPm correctly. Never use 24-hour format (e.g. never use "18:00").`;

    // Build the multi-turn conversation history for Gemini
    const historyParts = conversationHistory
      .filter(m => m.sender === 'user' || (m.sender === 'ai' && m.text && !m.actionCardData))
      .slice(-10) // last 10 messages for context
      .map(m => ({ role: m.sender === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));

    // Remove the last message (current prompt) since we send it separately
    if (historyParts.length > 0 && historyParts[historyParts.length - 1].role === 'user') {
      historyParts.pop();
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [
            ...historyParts,
            { role: 'user', parts: [{ text: prompt }] }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API returned status code ${response.status}`);
      }

      const data = await response.json();
      const aiResponseText = data.candidates[0].content.parts[0].text;

      const promptTokens = data.usageMetadata.promptTokenCount || 0;
      const completionTokens = data.usageMetadata.candidatesTokenCount || 0;
      trackTokenUsage(promptTokens, completionTokens);

      let cleanText = aiResponseText;
      let actionCardData = null;

      if (aiResponseText.includes('[ACTION_CARD_START]') && aiResponseText.includes('[ACTION_CARD_END]')) {
        const parts = aiResponseText.split('[ACTION_CARD_START]');
        cleanText = parts[0].trim();
        const jsonPart = parts[1].split('[ACTION_CARD_END]')[0].trim();
        try {
          actionCardData = JSON.parse(jsonPart);
        } catch (jsonErr) {
          console.error("Could not parse dynamic Action Card JSON:", jsonPart, jsonErr);
        }
      }

      if (typingIndicator) typingIndicator.remove();
      addMessageToActiveSession('ai', cleanText, null, actionCardData);

    } catch (error) {
      console.error('Gemini API call failed:', error);
      if (typingIndicator) typingIndicator.remove();

      let errMsg = `Apologies — couldn't reach the Gemini API. Check your API key in Settings. Error: ${error.message}`;
      if (error.message.includes('429')) {
        if (geminiModel === 'gemini-2.5-flash') {
          errMsg = `Rate limit hit (429). Gemini 2.5 Flash allows 15 requests/min and 1500/day on the Free Tier. Wait a moment and try again, or check your quota at aistudio.google.com.`;
        } else {
          errMsg = `Rate limit hit (429). Gemini 2.5 Pro allows only 2 requests/min on the Free Tier. Open Settings and switch to Gemini 2.5 Flash for a much higher limit.`;
        }
      }

      addMessageToActiveSession('ai', errMsg);
    }
  }

  function startFresh(skipHistory = false) {
    if (!skipHistory && window.location.pathname !== '/') {
      history.pushState(null, '', '/');
    }
    activeSessionId = null;
    chatState.style.display = 'none';
    if (logbookState) logbookState.style.display = 'none';
    if (statsState) statsState.style.display = 'none';
    landingState.style.display = 'flex';
    feelingInput.value = '';
    updateSendButtonVisibility(feelingInput, landingSubmit);

    if (toggleStatsBtn) {
      toggleStatsBtn.style.display = 'none';
      toggleStatsBtn.classList.remove('active');
    }

    if (mainHeaderTitle) {
      mainHeaderTitle.style.display = 'none';
    }

    if (openLogbookBtn) openLogbookBtn.classList.remove('active');

    const activeItems = historyListContainer.querySelectorAll('.history-item.active');
    activeItems.forEach(item => item.classList.remove('active'));
  }

  // --- Sidebar Session Panel Functions ---
  function dateToDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function isTaskActiveOnDate(task, date) {
    if (!task.cardData || !task.cardData.days) return false;
    
    // Check if the date is before the task's creation date (we don't show history before creation)
    const taskCreatedDate = new Date(task.date || Date.now());
    // Normalize to midnight for comparison
    const compareDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const createdMidnight = new Date(taskCreatedDate.getFullYear(), taskCreatedDate.getMonth(), taskCreatedDate.getDate());
    if (compareDate < createdMidnight) return false;

    const displayDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const dataDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    
    const dayOfWeekIndex = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const displayDay = displayDays[dayOfWeekIndex];
    const dataDay = dataDays[dayOfWeekIndex];
    
    return task.cardData.days.includes(displayDay) || task.cardData.days.includes(dataDay);
  }

  function getVirtualTasks() {
    const savedTasks = JSON.parse(localStorage.getItem('selahe_tasks')) || [];
    if (savedTasks.length === 0) return [];

    let hasMigration = false;

    // Perform migrations in-place for any missing completions array
    savedTasks.forEach(task => {
      if (!task.completions) {
        task.completions = [];
        if (task.cardData && task.cardData.status === 'completed') {
          const d = new Date(task.date || Date.now());
          task.completions.push(dateToDateString(d));
        }
        hasMigration = true;
      }
    });

    if (hasMigration) {
      syncTasksToStorage(savedTasks);
    }

    // Find the oldest task date
    let oldestTimestamp = Date.now();
    savedTasks.forEach(t => {
      if (t.date && t.date < oldestTimestamp) {
        oldestTimestamp = t.date;
      }
    });

    const startDate = new Date(oldestTimestamp);
    startDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const virtualTasks = [];

    // Loop from startDate to today (inclusive)
    let currentDate = new Date(startDate.getTime());
    while (currentDate <= today) {
      const dateStr = dateToDateString(currentDate);
      
      savedTasks.forEach(task => {
        if (isTaskActiveOnDate(task, currentDate)) {
          const isCompleted = task.completions && task.completions.includes(dateStr);
          virtualTasks.push({
            taskId: task.id,
            sessionId: task.sessionId,
            text: task.text,
            cardData: {
              ...task.cardData,
              status: isCompleted ? 'completed' : 'pending'
            },
            dateStr: dateStr,
            dateTimestamp: currentDate.getTime(),
            isCompleted: isCompleted,
            originalTask: task
          });
        }
      });

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return virtualTasks;
  }

  function renderHistoryPanel() {
    if (!historyListContainer) return;
    historyListContainer.innerHTML = '';

    const virtualTasks = getVirtualTasks();
    if (virtualTasks.length === 0) {
      historyListContainer.innerHTML = '<div class="history-empty">No saved chats yet. Generate and save an action card to start your ledger.</div>';
      return;
    }

    const grouped = {};
    
    // Sort virtual tasks descending by date
    virtualTasks.sort((a, b) => b.dateTimestamp - a.dateTimestamp);

    virtualTasks.forEach(vt => {
      const d = new Date(vt.dateTimestamp);
      const day = d.getDate();
      const month = d.toLocaleString('default', { month: 'long' });
      const weekday = d.toLocaleString('default', { weekday: 'long' });
      const dateHeaderStr = `${day} ${month}, ${weekday}`;

      if (!grouped[dateHeaderStr]) grouped[dateHeaderStr] = [];
      grouped[dateHeaderStr].push(vt);
    });

    Object.keys(grouped).forEach(dateHeaderStr => {
      const dateHeader = document.createElement('div');
      dateHeader.classList.add('history-date-header');
      dateHeader.textContent = dateHeaderStr;
      historyListContainer.appendChild(dateHeader);

      grouped[dateHeaderStr].forEach(vt => {
        const item = document.createElement('div');
        item.classList.add('history-item');
        if (activeSessionId === vt.sessionId) item.classList.add('active');

        item.addEventListener('click', () => {
          if (vt.sessionId) restoreSession(vt.sessionId);
        });

        const d = new Date(vt.dateTimestamp);
        const today = new Date();
        const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
        
        let dotColor = '#FFE100'; // Yellow (pending today)
        if (vt.isCompleted) {
          dotColor = '#1882FF'; // Blue (completed)
        } else if (!isToday) {
          dotColor = '#FF612A'; // Orange (past due)
        }

        const innerWrapper = document.createElement('div');
        innerWrapper.style.display = 'flex';
        innerWrapper.style.alignItems = 'center';
        innerWrapper.style.flex = '1';
        innerWrapper.style.minWidth = '0';

        const dotWrapper = document.createElement('div');
        dotWrapper.style.width = '20px';
        dotWrapper.style.height = '20px';
        dotWrapper.style.display = 'flex';
        dotWrapper.style.alignItems = 'center';
        dotWrapper.style.justifyContent = 'center';
        dotWrapper.style.flexShrink = '0';

        const dot = document.createElement('div');
        dot.classList.add('history-dot');
        dot.style.backgroundColor = dotColor;
        dotWrapper.appendChild(dot);
        innerWrapper.appendChild(dotWrapper);

        const titleSpan = document.createElement('span');
        titleSpan.classList.add('history-item-title');
        titleSpan.textContent = vt.cardData.title || 'Course of Action';
        innerWrapper.appendChild(titleSpan);

        item.appendChild(innerWrapper);

        const moreBtn = document.createElement('button');
        moreBtn.classList.add('history-item-more');
        moreBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/></svg>`;

        const dropdown = document.createElement('div');
        dropdown.classList.add('history-item-dropdown');

        const renameOpt = document.createElement('button');
        renameOpt.classList.add('history-dropdown-item');
        renameOpt.textContent = 'Rename';
        renameOpt.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.remove('show');
          const newName = prompt('Rename this action card:', vt.cardData.title);
          if (newName && newName.trim()) {
            const trimmedName = newName.trim();
            if (vt.sessionId && chatSessions[vt.sessionId]) {
              chatSessions[vt.sessionId].actionTitle = trimmedName;
              chatSessions[vt.sessionId].title = trimmedName;
              syncSessionsToServer();
            }
            let savedTasks = JSON.parse(localStorage.getItem('selahe_tasks')) || [];
            const taskIndex = savedTasks.findIndex(t => t.id === vt.taskId);
            if (taskIndex !== -1) {
              savedTasks[taskIndex].cardData.title = trimmedName;
              syncTasksToStorage(savedTasks);
            }
            if (activeSessionId === vt.sessionId && mainHeaderTitle) {
              mainHeaderTitle.textContent = trimmedName;
            }
            renderHistoryPanel();
            if (logbookState && logbookState.style.display === 'block') {
              window.renderLogbook();
            }
          }
        });

        const deleteOpt = document.createElement('button');
        deleteOpt.classList.add('history-dropdown-item', 'delete');
        deleteOpt.textContent = 'Delete chat';
        deleteOpt.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.classList.remove('show');
          if (confirm('Are you sure you want to delete this chat session?')) {
            deleteSession(vt.sessionId);
          }
        });

        dropdown.appendChild(renameOpt);
        dropdown.appendChild(deleteOpt);

        moreBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isShowing = dropdown.classList.contains('show');
          document.querySelectorAll('.history-item-dropdown').forEach(d => d.classList.remove('show'));
          if (!isShowing) dropdown.classList.add('show');
        });

        item.appendChild(moreBtn);
        item.appendChild(dropdown);
        historyListContainer.appendChild(item);
      });
    });
  }

  function restoreSession(sessionId, skipHistory = false) {
    const session = chatSessions[sessionId];
    if (!session) return;

    if (!skipHistory && window.location.pathname !== '/app/' + sessionId) {
      history.pushState(null, '', '/app/' + sessionId);
    }

    activeSessionId = sessionId;
    renderHistoryPanel(); // Highlight this chat in the sidebar and de-highlight others
    
    landingState.style.display = 'none';
    if (logbookState) logbookState.style.display = 'none';
    if (statsState) statsState.style.display = 'none';
    chatState.style.display = 'flex';

    if (toggleStatsBtn) {
      toggleStatsBtn.style.display = 'flex';
      toggleStatsBtn.classList.remove('active');
    }

    const displayTitle = session.actionTitle || (actionMsg && actionMsg.actionCardData && actionMsg.actionCardData.title) || session.title || 'Chat';
    if (mainHeaderTitle) {
      mainHeaderTitle.textContent = displayTitle;
      mainHeaderTitle.style.display = 'block';
    }

    if (openLogbookBtn) openLogbookBtn.classList.remove('active');

    chatMessages.innerHTML = '';
    session.messages.forEach(msg => {
      renderMessage(msg);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (window.innerWidth <= 768) {
      if (mainSidebar) {
        mainSidebar.classList.remove('expanded');
        if (mainHeaderTitle) mainHeaderTitle.style.display = 'none';
      }
    }

    renderHistoryPanel();
  }

  function deleteSession(sessionId) {
    const oldSavedTasks = JSON.parse(localStorage.getItem('selahe_tasks')) || [];
    delete chatSessions[sessionId];
    syncSessionsToServer();

    // Cascading deletion: remove all Action Cards in the logbook belonging to this session
    const updatedTasks = oldSavedTasks.filter(t => t.sessionId !== sessionId);
    syncTasksToStorage(updatedTasks);

    // Delete from Supabase
    if (supabase && currentUser) {
      const tasksToDelete = oldSavedTasks.filter(t => t.sessionId === sessionId);
      for (const t of tasksToDelete) {
        deleteTaskFromSupabase(t.id);
      }
      supabase.from('selahe_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', currentUser.id)
        .catch(err => console.error("Failed to delete session from Supabase:", err));
    }

    // Refresh logbook view if currently open
    if (logbookState && logbookState.style.display === 'block') {
      window.renderLogbook();
    }

    if (activeSessionId === sessionId) {
      startFresh();
    }
  }

  // --- Logbook Render Function ---
  window.renderLogbook = function () {
    if (!logbookContent) return;
    logbookContent.innerHTML = '';

    const virtualTasks = getVirtualTasks();

    if (virtualTasks.length === 0) {
      logbookContent.innerHTML = '<div style="color:var(--text-muted); font-size:14px;">No action cards saved yet. Generate one in chat and click the + icon to add it.</div>';
      return;
    }

    const grouped = {};
    
    // Sort descending by date
    virtualTasks.sort((a, b) => b.dateTimestamp - a.dateTimestamp);

    virtualTasks.forEach(vt => {
      const d = new Date(vt.dateTimestamp);
      const day = d.getDate();
      const month = d.toLocaleString('default', { month: 'long' });
      const weekday = d.toLocaleString('default', { weekday: 'long' });
      const dateStr = `${day} ${month}, ${weekday}`;
      
      if (!grouped[dateStr]) grouped[dateStr] = [];
      grouped[dateStr].push(vt);
    });

    Object.keys(grouped).forEach(dateStr => {
      const groupDiv = document.createElement('div');
      groupDiv.classList.add('logbook-date-group');

      const header = document.createElement('div');
      header.classList.add('logbook-date-header');
      header.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
        ${dateStr}
      `;

      header.addEventListener('click', () => {
        groupDiv.classList.toggle('collapsed');
      });

      const gridDiv = document.createElement('div');
      gridDiv.classList.add('logbook-grid');

      grouped[dateStr].forEach(vt => {
        const cardData = vt.cardData;
        const isCompleted = vt.isCompleted;
        const cardClass = isCompleted ? 'card-blue' : 'card-yellow';
        
        const card = document.createElement('div');
        card.classList.add('action-card', cardClass);
        if (isCompleted) card.classList.add('completed');
        card.style.margin = '0';
        card.style.maxWidth = '100%';
        card.style.position = 'relative';

        const displayDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        const dataDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        const activeDays = cardData.days || [];
        
        // Find which weekday index vt is on
        const vtDate = new Date(vt.dateTimestamp);
        const vtDayIndex = vtDate.getDay();

        // Calculate start of the week (Sunday) for vtDate
        const startOfWeek = new Date(vtDate.getFullYear(), vtDate.getMonth(), vtDate.getDate());
        startOfWeek.setDate(startOfWeek.getDate() - vtDayIndex);

        const daysHTML = displayDays.map((d, i) => {
          const isActive = activeDays.includes(dataDays[i]) || activeDays.includes(d);
          
          // Get the actual date for this weekday index in the same week
          const loopDate = new Date(startOfWeek.getTime());
          loopDate.setDate(startOfWeek.getDate() + i);
          const loopDateStr = dateToDateString(loopDate);
          
          // Check if it was completed on that day of the week
          let isPunched = vt.originalTask.completions && vt.originalTask.completions.includes(loopDateStr);

          // A card on date D should only show completions up to date D (no future leaks!)
          if (loopDate > vtDate) {
            isPunched = false;
          }

          return `<div class="action-card-day${isActive ? ' active' : ''}${isPunched ? ' punched' : ''}" data-index="${i}" style="cursor:default;"><span>${d}</span></div>`;
        }).join('');

        let displayTitle = cardData.title || 'Action Item';

        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px;">
            <h2 class="action-card-title" style="margin-top:0;">${displayTitle}</h2>
            <button class="status-toggle-btn"></button>
          </div>
          <div class="action-card-time-row">
            <span class="action-card-time-pill">${cardData.timeStart || ''}</span>
            <span class="action-card-time-pill">${cardData.timeStartAmPm || ''}</span>
            <span style="color:#777;">-</span>
            <span class="action-card-time-pill">${cardData.timeEnd || ''}</span>
            <span class="action-card-time-pill">${cardData.timeEndAmPm || ''}</span>
          </div>
          <p class="action-card-details">
            <span class="action-card-location">${cardData.location || ''}</span>&nbsp;&bull;&nbsp;<span class="action-card-duration">${cardData.duration || ''}</span>
          </p>
          <div class="action-card-days" style="margin-top:12px;">${daysHTML}</div>
          <div class="action-card-why-section" style="margin-top:16px;">
            <h3 class="action-card-why-label">Why?</h3>
            <p class="action-card-why-text" style="font-size:12px; margin-bottom:0;">${cardData.why || ''}</p>
          </div>
        `;

        const statusBtn = card.querySelector('.status-toggle-btn');

        statusBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          
          // Toggle local classes for smooth transition
          const nowCompleted = card.classList.toggle('completed');
          card.classList.toggle('card-yellow');
          card.classList.toggle('card-blue');
          
          const todayDayEl = card.querySelector(`.action-card-day[data-index="${vtDayIndex}"]`);
          if (todayDayEl) {
            todayDayEl.classList.toggle('punched', nowCompleted);
          }
          
          // Update selahe_tasks completions list
          let savedTasks = JSON.parse(localStorage.getItem('selahe_tasks')) || [];
          const taskIndex = savedTasks.findIndex(t => t.id === vt.taskId);
          if (taskIndex !== -1) {
            if (!savedTasks[taskIndex].completions) savedTasks[taskIndex].completions = [];
            
            if (nowCompleted) {
              if (!savedTasks[taskIndex].completions.includes(vt.dateStr)) {
                savedTasks[taskIndex].completions.push(vt.dateStr);
              }
            } else {
              savedTasks[taskIndex].completions = savedTasks[taskIndex].completions.filter(c => c !== vt.dateStr);
            }
            
            syncTasksToStorage(savedTasks);
            
            // Log to server if completing today
            const todayStr = dateToDateString(new Date());
            if (nowCompleted && vt.dateStr === todayStr) {
              const today = new Date();
              const dateStrFormatted = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
              fetch('/api/ledger-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: vt.taskId, dateStr: dateStrFormatted })
              }).catch(err => console.warn('Could not log ledger update:', err));
            }

            // Re-render sidebar immediately
            renderHistoryPanel();

            // Quietly redraw logbook after the transition completes to update other days' punch cards
            setTimeout(() => {
              window.renderLogbook();
            }, 350);
          }
        });

        gridDiv.appendChild(card);
      });

      groupDiv.appendChild(header);
      groupDiv.appendChild(gridDiv);
      logbookContent.appendChild(groupDiv);
    });
  }

  // --- Stats Toggle Listener & Rendering Logic ---
  if (toggleStatsBtn) {
    toggleStatsBtn.addEventListener('click', () => {
      if (!statsState) return;
      const isStatsOpen = statsState.style.display === 'block';
      if (isStatsOpen) {
        // Switch back to Chat
        statsState.style.display = 'none';
        chatState.style.display = 'flex';
        toggleStatsBtn.classList.remove('active');
      } else {
        // Switch to Stats
        chatState.style.display = 'none';
        statsState.style.display = 'block';
        toggleStatsBtn.classList.add('active');
        renderStats();
      }
    });
  }

  function renderStats() {
    if (!statsState) return;

    // Load active task
    const savedTasks = JSON.parse(localStorage.getItem('selahe_tasks')) || [];
    const activeTask = savedTasks.find(t => t.sessionId === activeSessionId);

    const statsWrapper = statsState.querySelector('.stats-wrapper');
    if (!activeTask) {
      statsWrapper.innerHTML = `
        <div style="color:var(--text-muted); font-size:14px; text-align:center; padding: 60px 20px;">
          No active action card found for this chat. Create and save an action card to view statistics.
        </div>
      `;
      return;
    }

    // Restore the standard stats layout if a task exists
    statsWrapper.innerHTML = `
      <!-- Calendar Section -->
      <div class="stats-calendar-section">
        <h2 class="stats-section-title">Calendar</h2>
        <div class="month-carousel-container">
          <button class="carousel-arrow left-arrow" id="month-prev-btn">&lt;</button>
          <div class="month-carousel-viewport" id="month-carousel-viewport">
            <!-- Monthly grids populated dynamically -->
          </div>
          <button class="carousel-arrow right-arrow" id="month-next-btn">&gt;</button>
        </div>
      </div>

      <!-- History Section -->
      <div class="stats-history-section">
        <h2 class="stats-section-title">History</h2>
        <div class="history-card">
          <div class="chart-container" id="history-chart-container">
            <!-- Dynamic bar chart -->
          </div>
        </div>
      </div>

      <!-- Evolvement Timeline Section -->
      <div class="stats-evolvement-section">
        <h2 class="stats-section-title">Action card History and Evolvement</h2>
        <div class="evolvement-timeline" id="evolvement-timeline">
          <!-- Timeline elements -->
        </div>
      </div>
    `;

    // Rebind navigation buttons
    const monthPrevBtn = document.getElementById('month-prev-btn');
    const monthNextBtn = document.getElementById('month-next-btn');
    if (monthPrevBtn) {
      monthPrevBtn.addEventListener('click', () => {
        currentMonthIndex--;
        renderStatsCalendar(activeTask);
      });
    }
    if (monthNextBtn) {
      monthNextBtn.addEventListener('click', () => {
        currentMonthIndex++;
        renderStatsCalendar(activeTask);
      });
    }

    // Render components
    renderStatsCalendar(activeTask);
    renderStatsChart(activeTask);
    renderStatsEvolvement(activeTask);
  }

  function renderStatsCalendar(task) {
    const viewport = document.getElementById('month-carousel-viewport');
    if (!viewport) return;
    viewport.innerHTML = '';

    const today = new Date();
    const monthsToRender = [-1, 0, 1]; // Left, Middle, Right months

    monthsToRender.forEach(offset => {
      const baseDate = new Date();
      // Adjust year/month based on currentMonthIndex + offset
      baseDate.setMonth(baseDate.getMonth() + currentMonthIndex + offset);
      
      const year = baseDate.getFullYear();
      const month = baseDate.getMonth();
      const monthName = baseDate.toLocaleString('default', { month: 'long' });
      
      const monthBlock = document.createElement('div');
      monthBlock.classList.add('month-block');
      
      const title = document.createElement('h3');
      title.classList.add('month-block-title');
      title.textContent = `${monthName}`;
      monthBlock.appendChild(title);
      
      const grid = document.createElement('div');
      grid.classList.add('calendar-grid');
      
      // Headers
      const weekHeaders = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      weekHeaders.forEach(wh => {
        const headerEl = document.createElement('div');
        headerEl.classList.add('calendar-header-day');
        headerEl.textContent = wh;
        grid.appendChild(headerEl);
      });
      
      // Spacers
      const firstDay = new Date(year, month, 1);
      const firstDayIndex = firstDay.getDay();
      for (let i = 0; i < firstDayIndex; i++) {
        const spacer = document.createElement('div');
        spacer.classList.add('calendar-day-cell', 'empty');
        grid.appendChild(spacer);
      }
      
      // Days of the month
      const numDays = new Date(year, month + 1, 0).getDate();
      for (let d = 1; d <= numDays; d++) {
        const cell = document.createElement('div');
        cell.classList.add('calendar-day-cell');
        
        const span = document.createElement('span');
        span.textContent = d;
        cell.appendChild(span);
        
        const cellDate = new Date(year, month, d);
        const cellDateStr = dateToDateString(cellDate);
        
        const isCompleted = task.completions && task.completions.includes(cellDateStr);
        
        const dayOfWeekIndex = cellDate.getDay();
        const weekDaysMap = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
        const dayOfWeekStr = weekDaysMap[dayOfWeekIndex];
        const isWeekdayActive = task.cardData.days && task.cardData.days.includes(dayOfWeekStr);
        
        const taskCreatedDate = new Date(task.date || Date.now());
        const compareDate = new Date(year, month, d);
        const createdMidnight = new Date(taskCreatedDate.getFullYear(), taskCreatedDate.getMonth(), taskCreatedDate.getDate());
        const isAfterCreation = compareDate >= createdMidnight;
        
        if (isCompleted) {
          cell.classList.add('punched-done');
        } else if (isAfterCreation && isWeekdayActive) {
          const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          if (compareDate >= todayMidnight) {
            cell.classList.add('active-commit');
          }
        }
        
        grid.appendChild(cell);
      }
      
      monthBlock.appendChild(grid);
      viewport.appendChild(monthBlock);
    });
  }

  function renderStatsChart(task) {
    const container = document.getElementById('history-chart-container');
    if (!container) return;
    container.innerHTML = '';
    
    // Previous two months and current month
    const months = [];
    for (let i = -2; i <= 0; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        label: d.toLocaleString('default', { month: 'long' }),
        prefix: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      });
    }
    
    // Calculate counts
    const completions = task.completions || [];
    let maxCount = 1;
    months.forEach(m => {
      m.count = completions.filter(c => c.startsWith(m.prefix)).length;
      if (m.count > maxCount) maxCount = m.count;
    });
    
    // Render bars
    months.forEach(m => {
      const barWrapper = document.createElement('div');
      barWrapper.classList.add('chart-bar-wrapper');
      
      const value = document.createElement('span');
      value.classList.add('chart-bar-value');
      value.textContent = m.count;
      barWrapper.appendChild(value);
      
      const bar = document.createElement('div');
      bar.classList.add('chart-bar');
      const height = (m.count / maxCount) * 120;
      barWrapper.appendChild(bar);
      
      const label = document.createElement('span');
      label.classList.add('chart-bar-label');
      label.textContent = m.label;
      barWrapper.appendChild(label);
      
      container.appendChild(barWrapper);
      
      setTimeout(() => {
        bar.style.height = `${height}px`;
      }, 50);
    });
  }

  function renderStatsEvolvement(task) {
    const timeline = document.getElementById('evolvement-timeline');
    if (!timeline) return;
    timeline.innerHTML = '';

    const historyList = [];

    // 1. Current Active Version
    historyList.push({
      cardData: task.cardData,
      activeRange: {
        start: task.lastEditTime || task.date || Date.now(),
        end: Date.now()
      },
      isLatest: true
    });

    // 2. Historical Versions
    if (task.cardData.history && Array.isArray(task.cardData.history)) {
      const reversedHistory = [...task.cardData.history].reverse();
      reversedHistory.forEach(h => {
        historyList.push({
          cardData: h.cardData,
          activeRange: h.dateRange,
          isLatest: false
        });
      });
    }

    // 3. De-duplicate/merge consecutive history items that have identical card configurations
    const deduplicated = [];
    historyList.forEach(item => {
      if (deduplicated.length === 0) {
        deduplicated.push(item);
        return;
      }
      
      const prev = deduplicated[deduplicated.length - 1];
      const isDuplicate = 
        item.cardData.title === prev.cardData.title &&
        item.cardData.timeStart === prev.cardData.timeStart &&
        item.cardData.timeStartAmPm === prev.cardData.timeStartAmPm &&
        item.cardData.timeEnd === prev.cardData.timeEnd &&
        item.cardData.timeEndAmPm === prev.cardData.timeEndAmPm &&
        item.cardData.location === prev.cardData.location &&
        item.cardData.why === prev.cardData.why &&
        JSON.stringify(item.cardData.days || []) === JSON.stringify(prev.cardData.days || []);

      if (isDuplicate) {
        // Merge date ranges (keep the widest boundaries)
        prev.activeRange.start = Math.min(prev.activeRange.start, item.activeRange.start);
        prev.activeRange.end = Math.max(prev.activeRange.end, item.activeRange.end);
      } else {
        deduplicated.push(item);
      }
    });

    // 4. Render Timeline Items
    deduplicated.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.classList.add('timeline-item');

      const marker = document.createElement('div');
      marker.classList.add('timeline-marker');
      itemEl.appendChild(marker);

      // Card Preview Column
      const cardCol = document.createElement('div');
      cardCol.classList.add('timeline-card-col');
      cardCol.innerHTML = renderEvolvementCard(item.cardData);
      itemEl.appendChild(cardCol);

      // Calendars Column
      const calCol = document.createElement('div');
      calCol.classList.add('timeline-calendar-col');

      const startD = new Date(item.activeRange.start);
      const endD = new Date(item.activeRange.end);

      let cur = new Date(startD.getFullYear(), startD.getMonth(), 1);
      const last = new Date(endD.getFullYear(), endD.getMonth(), 1);

      while (cur <= last) {
        calCol.innerHTML += renderMiniCalendarHTML(cur.getFullYear(), cur.getMonth(), task, item.activeRange);
        cur.setMonth(cur.getMonth() + 1);
      }

      itemEl.appendChild(calCol);
      timeline.appendChild(itemEl);
    });
  }

  function renderEvolvementCard(cardData) {
    const title = cardData.title || 'Gym';
    const timeStart = cardData.timeStart || '06:30';
    const timeStartAmPm = cardData.timeStartAmPm || 'pm';
    const timeEnd = cardData.timeEnd || '07:30';
    const timeEndAmPm = cardData.timeEndAmPm || 'pm';
    const location = cardData.location || 'JMD Gym';
    const duration = cardData.duration || '1h';
    const activeDays = cardData.days || [];
    const why = cardData.why || '';

    const displayDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const dataDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    const daysHTML = displayDays.map((d, i) => {
      const isActive = activeDays.includes(dataDays[i]);
      return `<div class="action-card-day${isActive ? ' active' : ''}" style="cursor:default;"><span>${d}</span></div>`;
    }).join('');

    return `
      <div class="action-card card-blue" style="cursor:default; margin:0; pointer-events:none;">
        <div class="action-card-header">
          <div class="action-card-title">${title}</div>
          <div class="status-circle" style="width:16px; height:16px; border-radius:50%; background-color:#373737; opacity:0.3;"></div>
        </div>
        <div class="action-card-time-row">
          <div class="action-card-time-pill">${timeStart}</div>
          <div class="action-card-time-pill">${timeStartAmPm}</div>
          <span style="color:#373737; opacity:0.4;">-</span>
          <div class="action-card-time-pill">${timeEnd}</div>
          <div class="action-card-time-pill">${timeEndAmPm}</div>
        </div>
        <div class="action-card-details">
          <span class="action-card-location">${location}</span>
          <span class="action-card-bullet">•</span>
          <span class="action-card-duration">${duration}</span>
        </div>
        <div class="action-card-days">
          ${daysHTML}
        </div>
        <div class="action-card-why">
          <div class="action-card-why-label" style="font-size: 11px;">Why?</div>
          <div class="action-card-why-text" style="font-size: 11px;">${why}</div>
        </div>
      </div>
    `;
  }

  function renderMiniCalendarHTML(year, month, task, activeRange) {
    const baseDate = new Date(year, month, 1);
    const monthName = baseDate.toLocaleString('default', { month: 'long' });
    
    const weekHeaders = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const headersHTML = weekHeaders.map(wh => `<div class="calendar-header-day">${wh}</div>`).join('');
    
    const firstDayIndex = baseDate.getDay();
    let daysHTML = '';
    for (let i = 0; i < firstDayIndex; i++) {
      daysHTML += `<div class="calendar-day-cell empty"></div>`;
    }
    
    const numDays = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= numDays; d++) {
      const cellDate = new Date(year, month, d);
      const cellDateStr = dateToDateString(cellDate);
      
      const startOfDay = new Date(year, month, d).getTime();
      const endOfDay = new Date(year, month, d, 23, 59, 59, 999).getTime();
      const isWithinRange = endOfDay >= activeRange.start && startOfDay <= activeRange.end;
      
      const isCompleted = task.completions && task.completions.includes(cellDateStr) && isWithinRange;
      
      const dayOfWeekIndex = cellDate.getDay();
      const weekDaysMap = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
      const dayOfWeekStr = weekDaysMap[dayOfWeekIndex];
      const isWeekdayActive = task.cardData.days && task.cardData.days.includes(dayOfWeekStr);
      
      let classes = '';
      if (isCompleted) {
        classes = ' punched-done';
      } else if (isWithinRange && isWeekdayActive) {
        classes = ' active-commit';
      }
      
      daysHTML += `<div class="calendar-day-cell${classes}"><span>${d}</span></div>`;
    }
    
    return `
      <div class="month-block">
        <h3 class="month-block-title" style="font-size: 13px; margin-bottom: 12px; color: #373737;">${monthName}</h3>
        <div class="calendar-grid" style="gap: 4px 2px;">
          ${headersHTML}
          ${daysHTML}
        </div>
      </div>
    `;
  }

  // Document click listener to close dropdowns
  document.addEventListener('click', () => {
    document.querySelectorAll('.history-item-dropdown').forEach(d => d.classList.remove('show'));
  });
});
