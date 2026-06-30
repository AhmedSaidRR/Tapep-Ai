(function () {
'use strict';

/* ── DOM refs ──────────────────────────────────────────────────────────── */
const html              = document.documentElement;
const themeToggle       = document.getElementById('themeToggle');
const sidebarToggle     = document.getElementById('sidebarToggle');
const sidebar           = document.getElementById('sidebar');
const chatInner         = document.getElementById('chatInner');
const chatScroll        = document.getElementById('chatScroll');
const chatForm          = document.getElementById('chatForm');
const userMessageEl     = document.getElementById('userMessage');
const sendBtn           = document.getElementById('sendBtn');
const voiceBtn          = document.getElementById('voiceBtn');
const micIcon           = document.getElementById('micIcon');
const imageUpload       = document.getElementById('imageUpload');
const imagePreviewBar   = document.getElementById('imagePreviewBar');
const imagePreviewThumb = document.getElementById('imagePreviewThumb');
const imagePreviewName  = document.getElementById('imagePreviewName');
const clearImageBtn     = document.getElementById('clearImageBtn');
const newChatBtn        = document.getElementById('newChatBtn');
const clearHistoryBtn   = document.getElementById('clearHistoryBtn');
const exportPdfBtn      = document.getElementById('exportPdfBtn');
const quickSuggestions  = document.getElementById('quickSuggestions');
const chatInputBar      = document.getElementById('chatInputBar');
const profileDot        = document.getElementById('profileDot');
const toastContainer    = document.getElementById('toastContainer');
const remindersList     = document.getElementById('remindersList');

/* ── App State ─────────────────────────────────────────────────────────── */
let selectedImageFile  = null;
let activeTtsBtn       = null;
const sessionId        = 'mb_' + Date.now();

// ── 1. CONVERSATION MEMORY (persisted in localStorage) ─────────────────
const MAX_MEMORY = 16; // 8 exchanges
const conversationMemory = loadMemoryFromStorage();

function loadMemoryFromStorage() {
  try {
    const raw = localStorage.getItem('mb-conv-memory');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.slice(-MAX_MEMORY);
    }
  } catch (e) { console.warn('Failed to load conversation memory:', e); }
  return [];
}

function saveMemoryToStorage() {
  try { localStorage.setItem('mb-conv-memory', JSON.stringify(conversationMemory)); }
  catch (e) { console.warn('Failed to save conversation memory:', e); }
}

function pushMemory(role, content) {
  conversationMemory.push({ role, content });
  if (conversationMemory.length > MAX_MEMORY)
    conversationMemory.splice(0, conversationMemory.length - MAX_MEMORY);
  saveMemoryToStorage();
}

// ── CHAT MESSAGES PERSISTENCE ────────────────────────────────────────────
function saveChatMessages() {
  try {
    const msgs = [];
    chatInner.querySelectorAll('.message:not(#welcomeMsg)').forEach(el => {
      const isUser = el.classList.contains('user-message');
      const contentEl = el.querySelector('.message-content');
      const timeEl = el.querySelector('.message-time');
      const imgEl = isUser ? el.querySelector('.message-bubble img') : null;
      if (contentEl) {
        msgs.push({
          role: isUser ? 'user' : 'assistant',
          html: contentEl.innerHTML,
          text: contentEl.textContent,
          time: timeEl ? timeEl.textContent : '',
          img: imgEl ? imgEl.src : null,
        });
      }
    });
    localStorage.setItem('mb-chat-messages', JSON.stringify(msgs));
  } catch (e) { console.warn('Failed to save chat messages:', e); }
}

function restoreChatMessages() {
  try {
    const raw = localStorage.getItem('mb-chat-messages');
    if (!raw) return;
    const msgs = JSON.parse(raw);
    if (!Array.isArray(msgs) || !msgs.length) return;
    if (quickSuggestions) quickSuggestions.style.display = 'none';
    msgs.forEach(m => {
      if (m.role === 'user') {
        const div = document.createElement('div');
        div.className = 'message user-message';
        div.innerHTML = `
          <div class="message-bubble">
            <div class="message-content">${m.html}</div>
            ${m.img ? `<img src="${m.img}" style="max-width:170px;border-radius:10px;margin-top:0.5rem;display:block;" alt="uploaded"/>` : ''}
            <div class="message-footer"><span class="message-time">${escapeHtml(m.time)}</span></div>
          </div>`;
        chatInner.appendChild(div);
      } else {
        const ttsId = 'tts_r_' + Math.random().toString(36).slice(2);
        const div = document.createElement('div');
        div.className = 'message bot-message';
        div.innerHTML = `
          <div class="message-avatar">
            <img src="/static/doctor-avatar.png" alt="Tapep AI" onerror="this.src='https://placehold.co/32x32/1a73e8/fff?text=🏥'" />
          </div>
          <div class="message-bubble">
            <div class="message-content" dir="auto">${m.html}</div>
            <div class="message-footer">
              <button class="tts-btn" id="${ttsId}"><i class="fas fa-volume-up"></i> Listen</button>
              <span class="message-time">${escapeHtml(m.time)}</span>
            </div>
          </div>`;
        chatInner.appendChild(div);
        document.getElementById(ttsId).addEventListener('click', function() { speakText(m.text || '', this); });
        div.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
      }
    });
    scrollToBottom(false);
  } catch (e) { console.warn('Failed to restore chat messages:', e); }
}

// Restore chat messages on page load
restoreChatMessages();

// ── 2. HEALTH PROFILE & MULTI-PROFILES ──────────────────────────────────
let healthProfiles = {};
let activeProfileId = localStorage.getItem('mb-active-profile-id') || 'primary';

try {
  const savedProfiles = localStorage.getItem('mb-health-profiles');
  if (savedProfiles) {
    healthProfiles = JSON.parse(savedProfiles);
  } else {
    const oldProfile = localStorage.getItem('mb-health-profile');
    if (oldProfile) {
      healthProfiles['primary'] = JSON.parse(oldProfile);
    } else {
      healthProfiles['primary'] = {};
    }
    localStorage.setItem('mb-health-profiles', JSON.stringify(healthProfiles));
  }
} catch (e) {
  console.warn('Failed to load health profiles:', e);
  healthProfiles = { primary: {} };
}

let healthProfile = healthProfiles[activeProfileId] || healthProfiles['primary'] || {};

function updateProfileDot() {
  const hasProfile = healthProfile && Object.entries(healthProfile).some(([key, val]) => key !== 'dialect' && val && String(val).trim());
  profileDot.classList.toggle('active', !!hasProfile);
}
updateProfileDot();

function populateProfileSelector() {
  const select = document.getElementById('activeProfileSelect');
  if (!select) return;
  select.innerHTML = '';
  
  const defaultLabels = {
    primary: 'الملف الأساسي (أنت) — Primary',
    father: 'الأب — Father',
    mother: 'الأم — Mother',
    child: 'الابن / الابنة — Child'
  };

  Object.keys(healthProfiles).forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = defaultLabels[id] || id;
    if (id === activeProfileId) opt.selected = true;
    select.appendChild(opt);
  });
}

function fillFormFromActiveProfile() {
  if (healthProfile) {
    document.getElementById('pName').value      = healthProfile.name || '';
    document.getElementById('pAge').value       = healthProfile.age || '';
    document.getElementById('pGender').value    = healthProfile.gender || '';
    document.getElementById('pBlood').value     = healthProfile.blood_type || '';
    document.getElementById('pWeight').value    = healthProfile.weight || '';
    document.getElementById('pHeight').value    = healthProfile.height || '';
    document.getElementById('pConditions').value= healthProfile.conditions || '';
    document.getElementById('pMeds').value      = healthProfile.medications || '';
    document.getElementById('pAllergies').value = healthProfile.allergies || '';
    document.getElementById('pDialect').value   = healthProfile.dialect || '';
  } else {
    ['pName','pAge','pGender','pBlood','pWeight','pHeight','pConditions','pMeds','pAllergies','pDialect']
      .forEach(id => document.getElementById(id).value = '');
  }
}

function saveFormToActiveProfile() {
  if (!activeProfileId) return;
  healthProfiles[activeProfileId] = {
    name:       document.getElementById('pName').value.trim(),
    age:        document.getElementById('pAge').value.trim(),
    gender:     document.getElementById('pGender').value.trim(),
    blood_type: document.getElementById('pBlood').value.trim(),
    weight:     document.getElementById('pWeight').value.trim(),
    height:     document.getElementById('pHeight').value.trim(),
    conditions: document.getElementById('pConditions').value.trim(),
    medications:document.getElementById('pMeds').value.trim(),
    allergies:  document.getElementById('pAllergies').value.trim(),
    dialect:    document.getElementById('pDialect').value.trim(),
  };
  healthProfile = healthProfiles[activeProfileId];
  localStorage.setItem('mb-health-profiles', JSON.stringify(healthProfiles));
  localStorage.setItem('mb-health-profile', JSON.stringify(healthProfile));
}

window.switchActiveProfile = function(id) {
  saveFormToActiveProfile();
  activeProfileId = id;
  localStorage.setItem('mb-active-profile-id', id);
  healthProfile = healthProfiles[id] || {};
  fillFormFromActiveProfile();
  updateProfileDot();
};

// ── 3. MEDICATION REMINDERS ──────────────────────────────────────────────
let reminders = JSON.parse(localStorage.getItem('mb-reminders') || '[]');

function saveReminders() { localStorage.setItem('mb-reminders', JSON.stringify(reminders)); }

function renderReminders() {
  remindersList.innerHTML = '';
  if (!reminders.length) {
    remindersList.innerHTML = '<p style="font-size:0.75rem;color:var(--mb-muted);text-align:center;padding:0.4rem 0">لا توجد تذكيرات</p>';
    return;
  }
  reminders.forEach((r, i) => {
    const el = document.createElement('div');
    el.className = 'reminder-item';
    el.innerHTML = `
      <span class="reminder-icon">💊</span>
      <div class="reminder-info">
        <div class="reminder-name">${escapeHtml(r.name)} ${r.dosage ? '— ' + escapeHtml(r.dosage) : ''}</div>
        <div class="reminder-meta">⏰ ${r.time} · ${freqLabel(r.freq)}${r.notes ? ' · ' + escapeHtml(r.notes) : ''}</div>
      </div>
      <button class="reminder-del" data-i="${i}" title="حذف"><i class="fas fa-trash-alt"></i></button>`;
    remindersList.appendChild(el);
  });
  remindersList.querySelectorAll('.reminder-del').forEach(btn => {
    btn.addEventListener('click', () => {
      reminders.splice(+btn.dataset.i, 1);
      saveReminders();
      renderReminders();
    });
  });
}
renderReminders();

function freqLabel(f) {
  return {daily:'يومياً',twice:'مرتين يومياً',three:'3 مرات',weekly:'أسبوعياً'}[f] || f;
}

function checkReminders() {
  if (!reminders.length) return;
  const now = new Date();
  const hhmm = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  reminders.forEach(r => {
    if (r.time === hhmm) {
      showToast('💊', `تذكير: ${r.name} ${r.dosage || ''} — ${freqLabel(r.freq)}`);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('💊 Tapep AI — تذكير الدواء', {
          body: `حان وقت: ${r.name} ${r.dosage || ''}`,
          icon: '/static/logo.png',
        });
      }
    }
  });
}
setInterval(checkReminders, 30000);
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

/* ══════════════════════════════════════════════════════════════════════════
   THEME
   ══════════════════════════════════════════════════════════════════════════ */
function applyTheme(t) {
  html.setAttribute('data-theme', t);
  localStorage.setItem('mb-theme', t);
  const hlTheme = document.getElementById('hljs-theme');
  if (hlTheme) hlTheme.href = t === 'dark'
    ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css'
    : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
}
applyTheme(localStorage.getItem('mb-theme') || 'light');
themeToggle.addEventListener('click', () =>
  applyTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

/* ══════════════════════════════════════════════════════════════════════════
   SIDEBAR
   ══════════════════════════════════════════════════════════════════════════ */
function isMobile() { return window.innerWidth < 769; }
function syncInputOffset() {
  const w = sidebar.classList.contains('collapsed') || isMobile() ? 0
    : parseInt(getComputedStyle(html).getPropertyValue('--mb-sidebar-width'));
  chatInputBar.style.left = w + 'px';
  imagePreviewBar.style.left = w + 'px';
}
sidebarToggle.addEventListener('click', () => { sidebar.classList.toggle('collapsed'); syncInputOffset(); });
if (isMobile()) sidebar.classList.add('collapsed');
syncInputOffset();
window.addEventListener('resize', syncInputOffset);

window.toggleSection = function(id) {
  const body = document.getElementById(id);
  const toggle = document.getElementById(id + 'Toggle');
  body.classList.toggle('open');
  if (toggle) toggle.classList.toggle('open');
};

/* ══════════════════════════════════════════════════════════════════════════
   UTILS
   ══════════════════════════════════════════════════════════════════════════ */
function getCurrentTime() { return new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }
document.getElementById('welcomeTime').textContent = getCurrentTime();
document.getElementById('sessionTime').textContent  = getCurrentTime();

function scrollToBottom(smooth = true) {
  setTimeout(() => {
    chatScroll.scrollTo({ top: chatScroll.scrollHeight + 150, behavior: smooth ? 'smooth' : 'auto' });
  }, 80);
}
function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

marked.setOptions({ breaks: true, gfm: true });
function renderMarkdown(c) {
  if (!c) return '';
  c = c.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
  try { return marked.parse(c); }
  catch { return '<p>' + escapeHtml(c) + '</p>'; }
}

function showToast(icon, msg, duration = 4000) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span class="toast-icon">${icon}</span><span>${escapeHtml(msg)}</span>`;
  toastContainer.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

/* ══════════════════════════════════════════════════════════════════════════
   TTS
   ══════════════════════════════════════════════════════════════════════════ */
function stopTts() {
  window.speechSynthesis && window.speechSynthesis.cancel();
  if (activeTtsBtn) {
    activeTtsBtn.innerHTML = '<i class="fas fa-volume-up"></i> Listen';
    activeTtsBtn.classList.remove('playing');
    activeTtsBtn = null;
  }
}
function speakText(text, btn) {
  if (!window.speechSynthesis) return;
  if (activeTtsBtn === btn) { stopTts(); return; }
  stopTts();
  const clean = text.replace(/[*#_`\[\]()|>]/g,'').replace(/- /g,' ').trim();
  const utter = new SpeechSynthesisUtterance(clean);
  const isAr  = /[\u0600-\u06FF]/.test(clean);
  utter.lang  = isAr ? 'ar-EG' : 'en-US';
  utter.rate  = 1.0;
  utter.onstart = () => { btn.innerHTML='<i class="fas fa-stop"></i> Stop'; btn.classList.add('playing'); activeTtsBtn=btn; };
  utter.onend = utter.onerror = () => { btn.innerHTML='<i class="fas fa-volume-up"></i> Listen'; btn.classList.remove('playing'); activeTtsBtn=null; };
  window.speechSynthesis.speak(utter);
}

/* ══════════════════════════════════════════════════════════════════════════
   MESSAGE BUILDERS
   ══════════════════════════════════════════════════════════════════════════ */
function addUserMessage(text, imgSrc = null) {
  if (quickSuggestions) quickSuggestions.style.display = 'none';
  const div = document.createElement('div');
  div.className = 'message user-message';
  div.innerHTML = `
    <div class="message-bubble">
      <div class="message-content">${escapeHtml(text)}</div>
      ${imgSrc ? `<img src="${imgSrc}" style="max-width:170px;border-radius:10px;margin-top:0.5rem;display:block;" alt="uploaded"/>` : ''}
      <div class="message-footer"><span class="message-time">${getCurrentTime()}</span></div>
    </div>`;
  chatInner.appendChild(div);
  scrollToBottom();
}

function addBotMessage(content) {
  const ttsId = 'tts_' + Date.now();
  const div = document.createElement('div');
  div.className = 'message bot-message';
  div.innerHTML = `
    <div class="message-avatar">
      <img src="/static/doctor-avatar.png" alt="Tapep AI" onerror="this.src='https://placehold.co/32x32/1a73e8/fff?text=🏥'" />
    </div>
    <div class="message-bubble">
      <div class="message-content" dir="auto">${renderMarkdown(content)}</div>
      <div class="message-footer">
        <button class="tts-btn" id="${ttsId}"><i class="fas fa-volume-up"></i> Listen</button>
        <span class="message-time">${getCurrentTime()}</span>
      </div>
    </div>`;
  chatInner.appendChild(div);
  document.getElementById(ttsId).addEventListener('click', function() { speakText(content, this); });
  div.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
  scrollToBottom();
  return div;
}

function createStreamingMessage() {
  const cid = 'sc_' + Date.now();
  const div = document.createElement('div');
  div.className = 'message bot-message';
  div.innerHTML = `
    <div class="message-avatar">
      <img src="/static/doctor-avatar.png" alt="MediBlaze AI" onerror="this.src='https://placehold.co/32x32/1a73e8/fff?text=🏥'" />
    </div>
    <div class="message-bubble">
      <div class="message-content streaming-cursor" id="${cid}" dir="auto"></div>
      <div class="message-footer" style="display:none" id="footer_${cid}">
        <button class="tts-btn" id="tts_${cid}"><i class="fas fa-volume-up"></i> Listen</button>
        <span class="message-time">${getCurrentTime()}</span>
      </div>
    </div>`;
  chatInner.appendChild(div);
  scrollToBottom();
  return { div, cid };
}

function finaliseStream(cid, accumulated) {
  const el = document.getElementById(cid);
  if (el) {
    el.innerHTML = renderMarkdown(accumulated.trim());
    el.classList.remove('streaming-cursor');
    el.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
  }
  const footer = document.getElementById('footer_' + cid);
  if (footer) {
    footer.style.display = 'flex';
    const btn = document.getElementById('tts_' + cid);
    if (btn) btn.addEventListener('click', function() { speakText(accumulated.trim(), this); });
  }
  scrollToBottom();
}

/* ── Indicators ─────────────────────────────────────────────────────────── */
function showTypingIndicator() {
  removeIndicator('typingIndicator');
  const div = document.createElement('div');
  div.className = 'message bot-message'; div.id = 'typingIndicator';
  div.innerHTML = `
    <div class="message-avatar"><img src="/static/doctor-avatar.png" onerror="this.src='https://placehold.co/32x32/1a73e8/fff?text=🏥'" /></div>
    <div class="indicator-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  chatInner.appendChild(div);
  scrollToBottom();
}
function showToolIndicator(toolName, message) {
  removeIndicator('toolIndicator');
  const icon = toolName.includes('web') ? '🔍' : toolName.includes('vision') ? '👁️' : '📚';
  const div = document.createElement('div');
  div.className = 'message bot-message'; div.id = 'toolIndicator';
  div.innerHTML = `
    <div class="message-avatar"><img src="/static/doctor-avatar.png" onerror="this.src='https://placehold.co/32x32/1a73e8/fff?text=🏥'" /></div>
    <div class="indicator-bubble">
      <span style="font-size:1rem">${icon}</span>
      <span class="tool-label">${escapeHtml(message || 'Processing…')}</span>
      <div class="search-dots"><span></span><span></span><span></span></div>
    </div>`;
  chatInner.appendChild(div);
  scrollToBottom();
}
function removeIndicator(id) { const el = document.getElementById(id); if (el) el.remove(); }

/* ══════════════════════════════════════════════════════════════════════════
   STREAMING CHAT (with memory + profile)
   ══════════════════════════════════════════════════════════════════════════ */
async function handleStreamingResponse(userText) {
  setInputEnabled(false);
  showTypingIndicator();
  stopTts();

  let streamDiv = null, cid = null, accumulated = '', firstContent = true;

  try {
    const body = {
      message: userText,
      session_id: sessionId,
      history: conversationMemory.slice(),
      health_profile: healthProfile || null,
    };

    const res = await fetch('/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Network error ' + res.status);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let data; try { data = JSON.parse(line.slice(6)); } catch { continue; }
        switch (data.type) {
          case 'start': break;
          case 'tool_start': removeIndicator('typingIndicator'); showToolIndicator(data.tool_name, data.message); break;
          case 'tool_end':   removeIndicator('toolIndicator'); break;
          case 'response_start': removeIndicator('typingIndicator'); removeIndicator('toolIndicator'); break;
          case 'content':
            if (data.content) {
              if (firstContent) {
                removeIndicator('typingIndicator'); removeIndicator('toolIndicator');
                const c = createStreamingMessage(); streamDiv=c.div; cid=c.cid; firstContent=false;
              }
              accumulated += data.content;
              const el = document.getElementById(cid);
              if (el) { el.innerHTML = renderMarkdown(accumulated); scrollToBottom(false); }
            }
            break;
          case 'complete':
            if (cid) finaliseStream(cid, accumulated);
            pushMemory('user', userText);
            pushMemory('assistant', accumulated.trim());
            saveChatMessages();
            break;
          case 'error':
            removeIndicator('typingIndicator'); removeIndicator('toolIndicator');
            addBotMessage(data.content || 'Sorry, an error occurred.');
            break;
        }
      }
    }
  } catch (err) {
    removeIndicator('typingIndicator'); removeIndicator('toolIndicator');
    addBotMessage('⚠️ Connection error. Please check your network and try again.');
    console.error('Stream error:', err);
  } finally {
    setInputEnabled(true);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   IMAGE STREAM
   ══════════════════════════════════════════════════════════════════════════ */
async function handleImageStream(formData) {
  setInputEnabled(false);
  showToolIndicator('vision', '👁️ Analyzing your medical image…');
  stopTts();

  let streamDiv = null, cid = null, accumulated = '', firstContent = true;
  try {
    const res = await fetch('/chat/image/stream', { method: 'POST', body: formData });
    const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let data; try { data = JSON.parse(line.slice(6)); } catch { continue; }
        switch (data.type) {
          case 'tool_start': removeIndicator('typingIndicator'); showToolIndicator(data.tool_name, data.message); break;
          case 'tool_end':   removeIndicator('toolIndicator'); break;
          case 'response_start': removeIndicator('typingIndicator'); removeIndicator('toolIndicator'); break;
          case 'content':
            if (data.content) {
              if (firstContent) {
                removeIndicator('typingIndicator'); removeIndicator('toolIndicator');
                const c = createStreamingMessage(); streamDiv=c.div; cid=c.cid; firstContent=false;
              }
              accumulated += data.content;
              const el = document.getElementById(cid);
              if (el) { el.innerHTML = renderMarkdown(accumulated); scrollToBottom(false); }
            }
            break;
          case 'complete': if (cid) finaliseStream(cid, accumulated); saveChatMessages(); break;
          case 'error':
            removeIndicator('typingIndicator'); removeIndicator('toolIndicator');
            addBotMessage(data.content || 'Image analysis failed.');
            break;
        }
      }
    }
  } catch (err) {
    removeIndicator('typingIndicator'); removeIndicator('toolIndicator');
    addBotMessage('⚠️ Failed to analyze image. Please try again.');
  } finally {
    setInputEnabled(true);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   FORM SUBMIT
   ══════════════════════════════════════════════════════════════════════════ */
chatForm.addEventListener('submit', async function(e) {
  e.preventDefault();
  const text = userMessageEl.value.trim();
  if (!text && !selectedImageFile) return;
  if (selectedImageFile) {
    const previewSrc = imagePreviewThumb.src;
    addUserMessage(text || '📷 Medical image for analysis', previewSrc);
    userMessageEl.value = '';
    const fd = new FormData();
    fd.append('image', selectedImageFile);
    fd.append('message', text);
    clearImage();
    await handleImageStream(fd);
  } else {
    addUserMessage(text);
    userMessageEl.value = '';
    await handleStreamingResponse(text);
  }
});

/* Quick chips */
document.querySelectorAll('.quick-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const msg = chip.getAttribute('data-msg');
    if (msg) { userMessageEl.value = msg; chatForm.dispatchEvent(new Event('submit')); }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   IMAGE UPLOAD
   ══════════════════════════════════════════════════════════════════════════ */
imageUpload.addEventListener('change', function() {
  const file = this.files[0]; if (!file) return;
  selectedImageFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    imagePreviewThumb.src = e.target.result;
    imagePreviewName.textContent = file.name;
    imagePreviewBar.style.display = 'block';
  };
  reader.readAsDataURL(file);
});
function clearImage() {
  selectedImageFile = null; imageUpload.value = '';
  imagePreviewBar.style.display = 'none';
  imagePreviewThumb.src = ''; imagePreviewName.textContent = '';
}
clearImageBtn.addEventListener('click', clearImage);

/* ══════════════════════════════════════════════════════════════════════════
   VOICE INPUT
   ══════════════════════════════════════════════════════════════════════════ */
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRec) {
  const rec = new SpeechRec(); rec.continuous=false; rec.interimResults=false; rec.lang='ar-EG';
  let listening = false;
  voiceBtn.addEventListener('click', () => {
    if (listening) { rec.stop(); }
    else { try { stopTts(); rec.start(); } catch(e){} }
  });
  rec.onstart = () => { listening=true; voiceBtn.classList.add('listening'); micIcon.className='fas fa-stop'; };
  rec.onresult = e => { userMessageEl.value = e.results[0][0].transcript; };
  rec.onend = rec.onerror = () => { listening=false; voiceBtn.classList.remove('listening'); micIcon.className='fas fa-microphone'; };
} else { voiceBtn.style.display='none'; }

/* ══════════════════════════════════════════════════════════════════════════
   INPUT CONTROL
   ══════════════════════════════════════════════════════════════════════════ */
function setInputEnabled(on) {
  userMessageEl.disabled = !on; sendBtn.disabled = !on;
  if (on) userMessageEl.focus();
}

/* ══════════════════════════════════════════════════════════════════════════
   MULTI-CHAT SESSIONS
   ══════════════════════════════════════════════════════════════════════════ */
const MAX_SAVED_CHATS = 30;

// Load saved chats array from localStorage
function getSavedChats() {
  try { return JSON.parse(localStorage.getItem('mb-saved-chats') || '[]'); }
  catch { return []; }
}

// Persist saved chats array
function setSavedChats(arr) {
  try { localStorage.setItem('mb-saved-chats', JSON.stringify(arr)); }
  catch (e) { console.warn('Failed to save chats:', e); }
}

// Generate a short title from the first user message text
function generateChatTitle(msgs) {
  const first = (msgs || []).find(m => m.role === 'user');
  if (!first) return 'محادثة طبية';
  const txt = (first.text || first.html || '').replace(/<[^>]*>/g, '').trim();
  return txt.length > 45 ? txt.slice(0, 45) + '…' : (txt || 'محادثة طبية');
}

// Save the CURRENT open chat (messages + memory) as a new entry, only if it has content
function archiveCurrentChat() {
  const msgs = [];
  chatInner.querySelectorAll('.message:not(#welcomeMsg)').forEach(el => {
    const isUser = el.classList.contains('user-message');
    const contentEl = el.querySelector('.message-content');
    const timeEl = el.querySelector('.message-time');
    const imgEl = isUser ? el.querySelector('.message-bubble img') : null;
    if (contentEl) {
      msgs.push({
        role: isUser ? 'user' : 'assistant',
        html: contentEl.innerHTML,
        text: contentEl.textContent,
        time: timeEl ? timeEl.textContent : '',
        img: imgEl ? imgEl.src : null,
      });
    }
  });

  if (!msgs.length) return; // nothing to save

  const saved = getSavedChats();
  const entry = {
    id: 'chat_' + Date.now(),
    title: generateChatTitle(msgs),
    date: new Date().toLocaleDateString('ar-EG', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }),
    msgs,
    memory: conversationMemory.slice(),
  };
  saved.unshift(entry); // newest first
  if (saved.length > MAX_SAVED_CHATS) saved.pop();
  setSavedChats(saved);
  renderSavedChats();
}

// Render saved chats list in sidebar
function renderSavedChats() {
  const container = document.getElementById('sidebarSessions');
  if (!container) return;

  // Keep the "Current Session" item
  const currentItem = document.getElementById('currentSessionItem');
  container.innerHTML = '';
  if (currentItem) container.appendChild(currentItem);

  const saved = getSavedChats();
  if (!saved.length) {
    const empty = document.createElement('p');
    empty.className = 'sessions-empty';
    empty.textContent = 'لا توجد محادثات محفوظة بعد';
    container.appendChild(empty);
    return;
  }

  saved.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'session-item';
    item.dataset.id = entry.id;
    item.innerHTML = `
      <span class="session-icon">💬</span>
      <span class="session-label">
        <span class="session-title">${escapeHtml(entry.title)}</span>
        <span class="session-date">${escapeHtml(entry.date)}</span>
      </span>
      <button class="session-del" title="حذف" data-id="${entry.id}"><i class="fas fa-trash"></i></button>`;

    // Click item → load that chat (read-only view)
    item.addEventListener('click', (e) => {
      if (e.target.closest('.session-del')) return;
      loadSavedChat(entry);
    });

    // Delete button
    item.querySelector('.session-del').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSavedChat(entry.id);
    });

    container.appendChild(item);
  });
}

// Load a saved chat into the chat area (view mode)
function loadSavedChat(entry) {
  // Mark current session as inactive
  document.getElementById('currentSessionItem')?.classList.remove('active');
  document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
  const targetItem = document.querySelector(`.session-item[data-id="${entry.id}"]`);
  if (targetItem) targetItem.classList.add('active');

  // Clear chat area
  chatInner.querySelectorAll('.message:not(#welcomeMsg)').forEach(m => m.remove());
  if (quickSuggestions) quickSuggestions.style.display = 'none';

  // Render saved messages
  entry.msgs.forEach(m => {
    if (m.role === 'user') {
      const div = document.createElement('div');
      div.className = 'message user-message';
      div.innerHTML = `
        <div class="message-bubble">
          <div class="message-content">${m.html}</div>
          ${m.img ? `<img src="${m.img}" style="max-width:170px;border-radius:10px;margin-top:0.5rem;display:block;" alt="uploaded"/>` : ''}
          <div class="message-footer"><span class="message-time">${escapeHtml(m.time)}</span></div>
        </div>`;
      chatInner.appendChild(div);
    } else {
      const ttsId = 'tts_s_' + Math.random().toString(36).slice(2);
      const div = document.createElement('div');
      div.className = 'message bot-message';
      div.innerHTML = `
        <div class="message-avatar">
          <img src="/static/doctor-avatar.png" alt="Tabeeb AI" onerror="this.src='https://placehold.co/32x32/1a73e8/fff?text=🏥'"/>
        </div>
        <div class="message-bubble">
          <div class="message-content" dir="auto">${m.html}</div>
          <div class="message-footer">
            <button class="tts-btn" id="${ttsId}"><i class="fas fa-volume-up"></i> Listen</button>
            <span class="message-time">${escapeHtml(m.time)}</span>
          </div>
        </div>`;
      chatInner.appendChild(div);
      document.getElementById(ttsId)?.addEventListener('click', function() { speakText(m.text || '', this); });
      div.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
    }
  });

  scrollToBottom(false);
  if (isMobile()) sidebar.classList.add('collapsed');
  showToast('📂', `تم فتح: ${entry.title}`);
}

// Delete a saved chat by id
function deleteSavedChat(id) {
  let saved = getSavedChats();
  saved = saved.filter(c => c.id !== id);
  setSavedChats(saved);
  renderSavedChats();
  showToast('🗑️', 'تم حذف المحادثة');
}

// Render on page load
renderSavedChats();

/* ══════════════════════════════════════════════════════════════════════════
   SIDEBAR ACTIONS
   ══════════════════════════════════════════════════════════════════════════ */
newChatBtn.addEventListener('click', () => {
  // Save current chat before clearing
  archiveCurrentChat();

  // Reset to current session
  document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
  document.getElementById('currentSessionItem')?.classList.add('active');

  // Clear chat area
  chatInner.querySelectorAll('.message:not(#welcomeMsg)').forEach(m => m.remove());
  if (quickSuggestions) quickSuggestions.style.display = 'flex';
  conversationMemory.length = 0;
  saveMemoryToStorage();
  localStorage.removeItem('mb-chat-messages');
  userMessageEl.value = ''; stopTts(); clearImage(); setInputEnabled(true);
  if (isMobile()) sidebar.classList.add('collapsed');
  showToast('💬', 'تم حفظ المحادثة وبدء محادثة جديدة');
});

clearHistoryBtn.addEventListener('click', async () => {
  try { await fetch(`/conversation/${sessionId}`, { method: 'DELETE' }); } catch {}
  // Clear but don't archive (explicit clear)
  chatInner.querySelectorAll('.message:not(#welcomeMsg)').forEach(m => m.remove());
  if (quickSuggestions) quickSuggestions.style.display = 'flex';
  conversationMemory.length = 0;
  saveMemoryToStorage();
  localStorage.removeItem('mb-chat-messages');
  document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
  document.getElementById('currentSessionItem')?.classList.add('active');
  userMessageEl.value = ''; stopTts(); clearImage(); setInputEnabled(true);
  showToast('🗑️', 'تم مسح المحادثة الحالية');
});

/* ══════════════════════════════════════════════════════════════════════════
   HEALTH PROFILE MODAL
   ══════════════════════════════════════════════════════════════════════════ */
function openModal(target) {
  const m = typeof target === 'string' ? document.getElementById(target) : target;
  if (m) {
    m.classList.add('open');
    document.addEventListener('keydown', closeOnEsc);
  }
}
function closeModal(target) {
  const m = typeof target === 'string' ? document.getElementById(target) : target;
  if (m) {
    m.classList.remove('open');
    document.removeEventListener('keydown', closeOnEsc);
  }
}
function closeOnEsc(e) { if (e.key==='Escape') { document.querySelectorAll('.modal-overlay.open').forEach(m=>closeModal(m)); } }

// Click outside modal box to close
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
});

document.getElementById('openProfileModal').addEventListener('click', () => {
  populateProfileSelector();
  fillFormFromActiveProfile();
  openModal('profileModal');
});

document.getElementById('addNewProfileBtn').addEventListener('click', (e) => {
  e.preventDefault();
  const name = prompt('أدخل اسم أو صلة قرابة صاحب الملف الجديد (مثال: الأخت، الجد، محمد):');
  if (!name || !name.trim()) return;
  const cleanName = name.trim();
  if (healthProfiles[cleanName]) {
    showToast('⚠️', 'الملف موجود بالفعل');
    return;
  }
  
  healthProfiles[cleanName] = { name: cleanName };
  localStorage.setItem('mb-health-profiles', JSON.stringify(healthProfiles));
  
  populateProfileSelector();
  window.switchActiveProfile(cleanName);
  showToast('👤', `تم إنشاء ملف جديد لـ: ${cleanName}`);
});

document.getElementById('closeProfileModal').addEventListener('click', () => closeModal('profileModal'));
document.getElementById('cancelProfileBtn').addEventListener('click', () => closeModal('profileModal'));

document.getElementById('saveProfileBtn').addEventListener('click', () => {
  saveFormToActiveProfile();
  updateProfileDot();
  closeModal('profileModal');
  showToast('✅', `تم حفظ الملف الصحي لـ (${healthProfile.name || activeProfileId}) بنجاح`);
});

document.getElementById('clearProfileBtn').addEventListener('click', () => {
  if (!confirm(`هل أنت متأكد من مسح الملف الصحي لـ (${healthProfile.name || activeProfileId})؟`)) return;
  
  if (activeProfileId === 'primary') {
    healthProfiles['primary'] = {};
    healthProfile = {};
  } else {
    delete healthProfiles[activeProfileId];
    activeProfileId = 'primary';
    localStorage.setItem('mb-active-profile-id', 'primary');
    healthProfile = healthProfiles['primary'] || {};
  }
  
  localStorage.setItem('mb-health-profiles', JSON.stringify(healthProfiles));
  localStorage.setItem('mb-health-profile', JSON.stringify(healthProfiles['primary']));
  
  populateProfileSelector();
  fillFormFromActiveProfile();
  updateProfileDot();
  showToast('🗑️', 'تم مسح الملف بنجاح');
});

/* ══════════════════════════════════════════════════════════════════════════
   SYMPTOM CHECKER
   ══════════════════════════════════════════════════════════════════════════ */
const SYMPTOMS = {
  'عام — General 🌡️':          ['Fever / حمى','Fatigue / تعب','Chills / قشعريرة','Night sweats / تعرق ليلي','Weight loss / فقدان وزن','Loss of appetite / فقدان شهية','Weakness / ضعف عام'],
  'الرأس والرقبة — Head 🧠':    ['Headache / صداع','Dizziness / دوار','Migraine / شقيقة','Neck stiffness / تصلب رقبة','Sore throat / التهاب حلق','Ear pain / ألم أذن','Vision changes / تغير رؤية'],
  'الصدر — Chest 🫀':           ['Chest pain / ألم صدر','Shortness of breath / ضيق تنفس','Rapid heartbeat / تسارع قلب','Persistent cough / سعال مستمر','Coughing blood / سعال بدم','Wheezing / أزيز'],
  'الجهاز الهضمي — Digestive 🫃':['Nausea / غثيان','Vomiting / قيء','Abdominal pain / ألم بطن','Diarrhea / إسهال','Constipation / إمساك','Bloating / انتفاخ','Blood in stool / دم بالبراز'],
  'العضلات والعظام — Joints 🦴': ['Joint pain / ألم مفاصل','Back pain / ألم ظهر','Muscle aches / ألم عضلي','Muscle weakness / ضعف عضلي','Swollen joints / تورم مفاصل'],
  'الجلد — Skin 🩹':             ['Rash / طفح جلدي','Itching / حكة','Skin discoloration / تغير لون جلد','Swelling / تورم','Jaundice / يرقان','Dry skin / جفاف جلد'],
  'الأعصاب — Neurological 🧬':  ['Confusion / ارتباك','Memory loss / فقدان ذاكرة','Numbness / تنميل','Tremors / رعشة','Seizures / نوبات','Difficulty speaking / صعوبة كلام'],
  'الصحة النفسية — Mental 🧘':  ['Anxiety / قلق','Depression / اكتئاب','Insomnia / أرق','Mood swings / تقلب مزاج','Panic attacks / نوبات هلع','Poor concentration / ضعف تركيز'],
};

let selectedSymptoms = new Set();
let selectedSeverity = '';

function buildSymptomUI() {
  const cont = document.getElementById('symptomCategories');
  cont.innerHTML = '';
  Object.entries(SYMPTOMS).forEach(([cat, symptoms]) => {
    const div = document.createElement('div'); div.className = 'symptom-category';
    div.innerHTML = `<div class="symptom-cat-title">${cat}</div><div class="symptom-chips-row" id="cat_${cat.replace(/\W+/g,'_')}"></div>`;
    cont.appendChild(div);
    const row = div.querySelector('.symptom-chips-row');
    symptoms.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'symptom-chip' + (selectedSymptoms.has(s) ? ' selected' : '');
      btn.textContent = s;
      btn.addEventListener('click', () => toggleSymptom(s, btn));
      row.appendChild(btn);
    });
  });
}

function toggleSymptom(s, btn) {
  if (selectedSymptoms.has(s)) { selectedSymptoms.delete(s); btn.classList.remove('selected'); }
  else { selectedSymptoms.add(s); btn.classList.add('selected'); }
  updateSelectedBar();
}

function updateSelectedBar() {
  const bar = document.getElementById('selectedSymptomsBar');
  const hint = document.getElementById('selectedBarHint');
  bar.innerHTML = '';
  if (!selectedSymptoms.size) {
    const p = document.createElement('p'); p.id='selectedBarHint';
    p.textContent='اختر أعراضك من القائمة أدناه — Select your symptoms below';
    bar.appendChild(p); return;
  }
  selectedSymptoms.forEach(s => {
    const pill = document.createElement('span'); pill.className='symptom-pill';
    pill.innerHTML = escapeHtml(s) + ' <span style="opacity:0.7">×</span>';
    pill.addEventListener('click', () => {
      selectedSymptoms.delete(s);
      document.querySelectorAll('.symptom-chip').forEach(c => { if (c.textContent.trim()===s) c.classList.remove('selected'); });
      updateSelectedBar();
    });
    bar.appendChild(pill);
  });
  document.getElementById('symptomCount').textContent = selectedSymptoms.size + ' symptom(s) selected';
}

['Mild','Moderate','Severe'].forEach(level => {
  const btn = document.getElementById('sev' + level);
  btn.addEventListener('click', () => {
    document.querySelectorAll('.severity-btn').forEach(b => b.className='severity-btn');
    btn.classList.add('selected-' + level.toLowerCase());
    selectedSeverity = btn.getAttribute('data-severity');
  });
});

document.getElementById('symptomSearch').addEventListener('input', function() {
  const q = this.value.toLowerCase();
  document.querySelectorAll('.symptom-chip').forEach(chip => {
    chip.style.display = chip.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
  document.querySelectorAll('.symptom-category').forEach(cat => {
    const visible = [...cat.querySelectorAll('.symptom-chip')].some(c => c.style.display !== 'none');
    cat.style.display = visible ? '' : 'none';
  });
});

document.getElementById('clearSymptomsBtn').addEventListener('click', () => {
  selectedSymptoms.clear(); selectedSeverity = '';
  document.querySelectorAll('.symptom-chip').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.severity-btn').forEach(b => b.className='severity-btn');
  document.getElementById('symptomDuration').value = '';
  document.getElementById('symptomCount').textContent = '0 symptoms selected';
  updateSelectedBar();
});

document.getElementById('submitSymptomsBtn').addEventListener('click', () => {
  if (!selectedSymptoms.size) { showToast('⚠️','الرجاء اختيار عرض واحد على الأقل'); return; }
  const symptomList = [...selectedSymptoms].join('، ');
  const sev = selectedSeverity ? `\n🌡️ شدة الأعراض: ${selectedSeverity}` : '';
  const dur = document.getElementById('symptomDuration').value;
  const durStr = dur ? `\n📅 المدة: ${dur} يوم/أيام` : '';
  const msg = `لدي الأعراض التالية:\n${symptomList}${sev}${durStr}\n\nما هي الأمراض المحتملة؟ وما الذي أفعله؟`;
  closeModal('symptomModal');
  userMessageEl.value = msg;
  chatForm.dispatchEvent(new Event('submit'));
  selectedSymptoms.clear(); selectedSeverity = '';
  document.querySelectorAll('.symptom-chip').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.severity-btn').forEach(b => b.className='severity-btn');
  document.getElementById('symptomDuration').value='';
  updateSelectedBar();
});

document.getElementById('openSymptomModal').addEventListener('click', () => {
  buildSymptomUI(); updateSelectedBar();
  document.getElementById('symptomCount').textContent = '0 symptoms selected';
  openModal('symptomModal');
});
document.getElementById('closeSymptomModal').addEventListener('click', () => closeModal('symptomModal'));

/* ══════════════════════════════════════════════════════════════════════════
   MEDICATION REMINDERS MODAL
   ══════════════════════════════════════════════════════════════════════════ */
document.getElementById('openReminderModal').addEventListener('click', () => {
  document.getElementById('remMedName').value = '';
  document.getElementById('remDosage').value  = '';
  document.getElementById('remTime').value    = '';
  document.getElementById('remNotes').value   = '';
  openModal('reminderModal');
});
document.getElementById('closeReminderModal').addEventListener('click', () => closeModal('reminderModal'));
document.getElementById('cancelReminderBtn').addEventListener('click', () => closeModal('reminderModal'));

document.getElementById('saveReminderBtn').addEventListener('click', () => {
  const name = document.getElementById('remMedName').value.trim();
  const time = document.getElementById('remTime').value;
  if (!name) { showToast('⚠️', 'أدخل اسم الدواء'); return; }
  if (!time) { showToast('⚠️', 'حدد وقت التذكير'); return; }
  reminders.push({
    name, dosage: document.getElementById('remDosage').value.trim(),
    time, freq: document.getElementById('remFreq').value,
    notes: document.getElementById('remNotes').value.trim(),
    id: Date.now(),
  });
  saveReminders(); renderReminders(); closeModal('reminderModal');
  showToast('⏰', `تم حفظ تذكير: ${name} في ${time}`);
});

/* ══════════════════════════════════════════════════════════════════════════
   EXPORT — Browser Print (supports Arabic/RTL perfectly)
   ══════════════════════════════════════════════════════════════════════════ */
exportPdfBtn.addEventListener('click', () => {
  const messages = chatInner.querySelectorAll('.message');
  if (messages.length <= 1) { showToast('ℹ️', 'لا توجد محادثة للتصدير'); return; }

  let rows = '';
  messages.forEach(msg => {
    const isUser  = msg.classList.contains('user-message');
    const content = msg.querySelector('.message-content');
    const time    = msg.querySelector('.message-time');
    if (!content) return;

    const text = content.innerText || content.textContent || '';
    const ts   = time ? time.textContent : '';
    const role = isUser ? '👤 أنت' : '🏥 MediBlaze AI';
    const cls  = isUser ? 'user-block' : 'bot-block';

    rows += `
      <div class="msg-block ${cls}">
        <div class="msg-role">${role} <span class="msg-time">${ts}</span></div>
        <div class="msg-text">${escapeHtml(text)}</div>
      </div>`;
  });

  const dateStr = new Date().toLocaleString('ar-EG');
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>MediBlaze — تقرير الاستشارة</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body {
      font-family:'Cairo',Arial,sans-serif;
      direction:rtl; text-align:right;
      background:#fff; color:#1a202c;
      padding:24px; max-width:820px; margin:0 auto;
    }
    .report-header {
      background:linear-gradient(135deg,#1a73e8,#0d47a1);
      color:#fff; padding:18px 22px; border-radius:10px;
      margin-bottom:20px;
    }
    .report-header h1 { font-size:18px; margin-bottom:4px; }
    .report-header p  { font-size:11px; opacity:0.82; }
    .msg-block {
      margin-bottom:14px; padding:12px 16px;
      border-radius:8px; page-break-inside:avoid;
    }
    .bot-block  { background:#f0f9f8; border-right:4px solid #26a69a; }
    .user-block { background:#f0f4fb; border-right:4px solid #1a73e8; }
    .msg-role {
      font-size:11px; font-weight:700; color:#718096;
      margin-bottom:6px; display:flex; justify-content:space-between;
    }
    .msg-time { font-size:10px; font-weight:400; color:#a0aec0; }
    .msg-text { font-size:12.5px; line-height:1.75; white-space:pre-wrap; word-break:break-word; }
    .disclaimer {
      margin-top:24px; padding-top:12px;
      border-top:1px solid #e2e8f0;
      font-size:10px; color:#a0aec0; text-align:center;
    }
    @media print {
      body { padding:10px; }
      .report-header { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .bot-block,.user-block { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>🏥 MediBlaze AI — تقرير الاستشارة الطبية</h1>
    <p>📅 ${dateStr} — للأغراض التعليمية فقط</p>
  </div>
  ${rows}
  <div class="disclaimer">
    ⚠️ هذا التقرير لأغراض تعليمية فقط ولا يُغني عن استشارة طبيب مختص.
    MediBlaze AI — Educational purposes only.
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 600);
    };
  <\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { showToast('⚠️', 'السماح بالنوافذ المنبثقة لفتح التقرير'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
  showToast('📄', 'جاري فتح التقرير — اختر "حفظ كـ PDF" من نافذة الطباعة');
});

/* ══════════════════════════════════════════════════════════════════════════
   WELLNESS TRACKER (HYDRATION & STEPS)
   ══════════════════════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════════════════════
   HEALTH CALCULATORS
   ══════════════════════════════════════════════════════════════════════════ */
document.getElementById('openCalcModal').addEventListener('click', () => openModal('calcModal'));
document.getElementById('closeCalcModal').addEventListener('click', () => closeModal('calcModal'));

document.querySelectorAll('.calc-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.calc-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.calc-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

function showCalcResult(containerId, html) {
  const el = document.getElementById(containerId);
  el.style.display = 'block';
  el.innerHTML = html;
}

window.sendCalcToChat = function(text) {
  closeModal('calcModal');
  userMessageEl.value = text;
  chatForm.dispatchEvent(new Event('submit'));
};

window.calcBMI = function() {
  const w = parseFloat(document.getElementById('bmiWeight').value);
  const h = parseFloat(document.getElementById('bmiHeight').value);
  if (!w || !h || w <= 0 || h <= 0) { showToast('⚠️', 'أدخل الوزن والطول'); return; }

  const bmi = w / Math.pow(h / 100, 2);
  let cat, color, emoji, advice;
  if      (bmi < 18.5) { cat='نقص وزن — Underweight';  color='#3b82f6'; emoji='🟦'; advice='قد تحتاج لزيادة السعرات واستشارة أخصائي تغذية.'; }
  else if (bmi < 25)   { cat='وزن طبيعي — Normal';      color='#22c55e'; emoji='🟢'; advice='ممتاز! حافظ على وزنك بالتغذية المتوازنة والتمرين.'; }
  else if (bmi < 30)   { cat='زيادة وزن — Overweight';   color='#f59e0b'; emoji='🟡'; advice='يُنصح بتحسين النظام الغذائي وزيادة النشاط البدني.'; }
  else                  { cat='سمنة — Obese';          color='#ef4444'; emoji='🟥'; advice='استشر طبيبك لوضع خطة علاجية مناسبة.'; }

  const pct = Math.min(100, Math.max(0, ((bmi - 15) / 25) * 100));
  showCalcResult('bmiResult', `
    <div class="calc-card" style="border-left-color:${color}">
      <div class="calc-main">${emoji} <span style="font-size:2rem;font-weight:700;color:${color}">${bmi.toFixed(1)}</span> <span style="font-size:0.85rem;color:var(--mb-muted)">kg/m²</span></div>
      <div class="calc-cat" style="color:${color}">${cat}</div>
      <div class="calc-bar-wrap">
        <div class="calc-bar-track">
          <div class="calc-bar-zones">
            <div style="flex:3.5;background:#3b82f6"></div>
            <div style="flex:6.5;background:#22c55e"></div>
            <div style="flex:5;background:#f59e0b"></div>
            <div style="flex:10;background:#ef4444"></div>
          </div>
          <div class="calc-bar-needle" style="left:${pct}%"></div>
        </div>
        <div class="calc-bar-labels"><span>15</span><span>18.5</span><span>25</span><span>30</span><span>40+</span></div>
      </div>
      <p class="calc-advice">💡 ${advice}</p>
      <button class="btn btn-ghost" style="width:100%;margin-top:0.5rem;font-size:0.8rem" onclick="sendCalcToChat('BMI حسبته = ${bmi.toFixed(1)} kg/m² (فئة: ${cat}). ماذا يعني هذا وما هي نصائحك لي؟')"><i class="fas fa-comment-medical"></i> اسأل المساعد عن نتيجتي</button>
    </div>`);
};

window.calcCalories = function() {
  const w  = parseFloat(document.getElementById('calWeight').value);
  const h  = parseFloat(document.getElementById('calHeight').value);
  const a  = parseFloat(document.getElementById('calAge').value);
  const g  = document.getElementById('calGender').value;
  const af = parseFloat(document.getElementById('calActivity').value);
  if (!w || !h || !a) { showToast('⚠️', 'أدخل جميع البيانات'); return; }

  const bmr  = g === 'm'
    ? (10 * w) + (6.25 * h) - (5 * a) + 5
    : (10 * w) + (6.25 * h) - (5 * a) - 161;
  const tdee = Math.round(bmr * af);
  const lose = Math.round(tdee - 500);
  const gain = Math.round(tdee + 500);

  showCalcResult('calResult', `
    <div class="calc-card" style="border-left-color:#f59e0b">
      <div class="calc-main">🔥 <span style="font-size:2rem;font-weight:700;color:#f59e0b">${tdee.toLocaleString()}</span> <span style="font-size:0.85rem;color:var(--mb-muted)">سعرة/يوم</span></div>
      <div class="calc-cat" style="color:#f59e0b">احتياجك اليومي للحفاظ على الوزن</div>
      <div class="calc-goals">
        <div class="calc-goal-item" style="color:#ef4444">🔽 <strong>${lose.toLocaleString()}</strong> سعرة/يوم<br><small>خسارة ~0.5 كج/أسبوع</small></div>
        <div class="calc-goal-item" style="color:#22c55e">⚖️ <strong>${tdee.toLocaleString()}</strong> سعرة/يوم<br><small>ثبات الوزن</small></div>
        <div class="calc-goal-item" style="color:#3b82f6">🔼 <strong>${gain.toLocaleString()}</strong> سعرة/يوم<br><small>زيادة ~0.5 كج/أسبوع</small></div>
      </div>
      <p class="calc-advice">💡 المعدل الأساسي (BMR): ${Math.round(bmr).toLocaleString()} سعرة</p>
      <button class="btn btn-ghost" style="width:100%;margin-top:0.5rem;font-size:0.8rem" onclick="sendCalcToChat('احتياجي اليومي من السعرات = ${tdee} سعرة. BMR = ${Math.round(bmr)}. ما هي أفضل خطة غذائية لي؟')"><i class="fas fa-comment-medical"></i> اسأل المساعد عن خطة غذائية</button>
    </div>`);
};

window.calcIdealWeight = function() {
  const h = parseFloat(document.getElementById('iwHeight').value);
  const g = document.getElementById('iwGender').value;
  if (!h || h < 100) { showToast('⚠️', 'أدخل الطول'); return; }

  const inchesOver5ft = ((h / 2.54) - 60);
  const base = g === 'm' ? 50 : 45.5;
  const iw   = Math.max(base, base + (2.3 * inchesOver5ft));
  const low  = (iw * 0.95).toFixed(1);
  const high = (iw * 1.05).toFixed(1);

  const bm2  = g === 'm'
    ? 56.2 + (1.41 * (h / 2.54 - 60))
    : 53.1 + (1.36 * (h / 2.54 - 60));
  const avg  = ((iw + bm2) / 2).toFixed(1);

  showCalcResult('iwResult', `
    <div class="calc-card" style="border-left-color:#8b5cf6">
      <div class="calc-main">⚖️ <span style="font-size:2rem;font-weight:700;color:#8b5cf6">${low} — ${high}</span> <span style="font-size:0.85rem;color:var(--mb-muted)">كيلوغرام</span></div>
      <div class="calc-cat" style="color:#8b5cf6">نطاق الوزن المثالي لطولك ${h} سم</div>
      <p class="calc-advice">💡 متوسط المعادلات (Devine + Miller): <strong>${avg} kg</strong></p>
      <button class="btn btn-ghost" style="width:100%;margin-top:0.5rem;font-size:0.8rem" onclick="sendCalcToChat('وزني المثالي حسب طولي ${h} سم = ${low}-${high} كج. كيف أصل لهذا الوزن بشكل صحيح؟')"><i class="fas fa-comment-medical"></i> كيف أصل لهذا الوزن؟</button>
    </div>`);
};

window.calcBodyFat = function() {
  const w = parseFloat(document.getElementById('bfWeight').value);
  const h = parseFloat(document.getElementById('bfHeight').value);
  const a = parseFloat(document.getElementById('bfAge').value);
  const g = document.getElementById('bfGender').value;
  if (!w || !h || !a) { showToast('⚠️', 'أدخل جميع البيانات'); return; }

  const bmi = w / Math.pow(h / 100, 2);
  const sex  = g === 'm' ? 1 : 0;
  const bf   = (1.2 * bmi) + (0.23 * a) - (10.8 * sex) - 5.4;
  const bfR  = Math.max(0, Math.min(60, bf)).toFixed(1);

  let cat, color, emoji;
  if (g === 'm') {
    if      (bf < 6)  { cat='أساسي — Essential'; color='#f59e0b'; emoji='⚠️'; }
    else if (bf < 14) { cat='رياضي — Athlete';   color='#22c55e'; emoji='🏅'; }
    else if (bf < 18) { cat='لياقة — Fitness';   color='#3b82f6'; emoji='💧'; }
    else if (bf < 25) { cat='طبيعي — Average';  color='#22c55e'; emoji='🟢'; }
    else              { cat='سمنة — Obese';    color='#ef4444'; emoji='🟥'; }
  } else {
    if      (bf < 14) { cat='أساسي — Essential'; color='#f59e0b'; emoji='⚠️'; }
    else if (bf < 21) { cat='رياضي — Athlete';   color='#22c55e'; emoji='🏅'; }
    else if (bf < 25) { cat='لياقة — Fitness';   color='#3b82f6'; emoji='💧'; }
    else if (bf < 32) { cat='طبيعي — Average';  color='#22c55e'; emoji='🟢'; }
    else              { cat='سمنة — Obese';    color='#ef4444'; emoji='🟥'; }
  }
  const ffm = (w * (1 - bf / 100)).toFixed(1);
  const fm  = (w * (bf / 100)).toFixed(1);

  showCalcResult('bfResult', `
    <div class="calc-card" style="border-left-color:${color}">
      <div class="calc-main">${emoji} <span style="font-size:2rem;font-weight:700;color:${color}">${bfR}%</span></div>
      <div class="calc-cat" style="color:${color}">${cat}</div>
      <div class="calc-goals">
        <div class="calc-goal-item">👊 <strong>${fm} kg</strong><br><small>كتلة دهنية</small></div>
        <div class="calc-goal-item">🦴 <strong>${ffm} kg</strong><br><small>كتلة عضلية + عظام</small></div>
      </div>
      <p class="calc-advice">💡 النتيجة تقديرية بناءً على BMI. للدقة استخدم DEXA أو طي المقاومة.</p>
      <button class="btn btn-ghost" style="width:100%;margin-top:0.5rem;font-size:0.8rem" onclick="sendCalcToChat('نسبة الدهون عندي = ${bfR}% (فئة: ${cat}). كتلة عضلية = ${ffm} كج. كيف أحسن نسبة دهوني؟')"><i class="fas fa-comment-medical"></i> كيف أحسن هذه النسبة؟</button>
    </div>`);
};

/* ── Init ──────────────────────────────────────────────────────────────────────── */
userMessageEl.focus();

// ── PWA: Register Service Worker ──────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { scope: '/' })
    .then(reg => console.log('[MediBlaze PWA] Service Worker registered:', reg.scope))
    .catch(err => console.warn('[MediBlaze PWA] SW registration failed:', err));
}

// ── PWA: Install Button & Banner Logic ────────────────────────────────────────
let deferredInstallPrompt = null;
const installBtn         = document.getElementById('installPwaBtn');
const installBanner      = document.getElementById('installBanner');
const installBannerBtn   = document.getElementById('installBannerBtn');
const installBannerClose = document.getElementById('installBannerClose');
const iosModal           = document.getElementById('iosInstallModal');
const androidModal       = document.getElementById('androidInstallModal');
const closeIosModal      = document.getElementById('closeIosModal');
const closeAndroidModal  = document.getElementById('closeAndroidModal');

const isIOS             = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
                        || (navigator.standalone === true);
const isMobileDevice    = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

function showInstallUI() {
  if (installBtn)    installBtn.style.display  = 'flex';
  if (installBanner) installBanner.style.display = 'block';
}
function hideInstallUI() {
  if (installBtn)    installBtn.style.display  = 'none';
  if (installBanner) installBanner.style.display = 'none';
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

function onInstallClick() {
  if (isIOS) {
    openModal(iosModal);
  } else if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => {
      deferredInstallPrompt = null;
      hideInstallUI();
    });
  } else {
    openModal(androidModal);
  }
}

if (installBtn)       installBtn.addEventListener('click', onInstallClick);
if (installBannerBtn) installBannerBtn.addEventListener('click', onInstallClick);

if (installBannerClose) {
  installBannerClose.addEventListener('click', () => {
    hideInstallUI();
    sessionStorage.setItem('installBannerDismissed', '1');
  });
}
if (closeIosModal)     closeIosModal.addEventListener('click', () => closeModal(iosModal));
if (closeAndroidModal) closeAndroidModal.addEventListener('click', () => closeModal(androidModal));

[iosModal, androidModal].forEach(m => {
  if (m) m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); });
});

if (isMobileDevice && !isInStandaloneMode && !sessionStorage.getItem('installBannerDismissed')) {
  showInstallUI();
}

window.addEventListener('appinstalled', () => hideInstallUI());


/* ══════════════════════════════════════════════════════════════════════════
   LAB REPORT SCANNER
   ══════════════════════════════════════════════════════════════════════════ */
const openLabScannerModalBtn = document.getElementById('openLabScannerModal');
const closeLabScannerModalBtn = document.getElementById('closeLabScannerModal');
const cancelLabScannerBtn = document.getElementById('cancelLabScannerBtn');
const labScannerModal = document.getElementById('labScannerModal');
const labUploadZone = document.getElementById('labUploadZone');
const labFileInput = document.getElementById('labFileInput');
const labPreviewRow = document.getElementById('labPreviewRow');
const labPreviewImg = document.getElementById('labPreviewImg');
const labFilename = document.getElementById('labFilename');
const removeLabFileBtn = document.getElementById('removeLabFileBtn');
const analyzeLabBtn = document.getElementById('analyzeLabBtn');
const labSpinIcon = document.getElementById('labSpinIcon');
const labResultsSection = document.getElementById('labResultsSection');
const labResultsBody = document.getElementById('labResultsBody');
const labSummaryText = document.getElementById('labSummaryText');
const sendLabToChatBtn = document.getElementById('sendLabToChatBtn');

let selectedLabFile = null;
let lastLabAnalysisData = null;

if (openLabScannerModalBtn) {
  openLabScannerModalBtn.addEventListener('click', () => {
    resetLabScannerModal();
    openModal('labScannerModal');
  });
}
if (closeLabScannerModalBtn) {
  closeLabScannerModalBtn.addEventListener('click', () => {
    closeModal('labScannerModal');
  });
}
if (cancelLabScannerBtn) {
  cancelLabScannerBtn.addEventListener('click', () => {
    closeModal('labScannerModal');
  });
}

// Upload zone drag & drop
if (labUploadZone) {
  labUploadZone.addEventListener('click', () => labFileInput.click());
  labUploadZone.addEventListener('dragover', (e) => { e.preventDefault(); labUploadZone.classList.add('dragover'); });
  labUploadZone.addEventListener('dragleave', () => labUploadZone.classList.remove('dragover'));
  labUploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    labUploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleLabFileSelection(e.dataTransfer.files[0]);
  });
}

if (labFileInput) {
  labFileInput.addEventListener('change', function() {
    if (this.files.length) handleLabFileSelection(this.files[0]);
  });
}

function handleLabFileSelection(file) {
  if (!file.type.startsWith('image/')) {
    showToast('⚠️', 'الرجاء اختيار ملف صورة فقط (PNG, JPG, JPEG)');
    return;
  }
  selectedLabFile = file;
  labFilename.textContent = file.name;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    labPreviewImg.src = e.target.result;
    labUploadZone.style.display = 'none';
    labPreviewRow.style.display = 'flex';
    analyzeLabBtn.disabled = false;
  };
  reader.readAsDataURL(file);
}

if (removeLabFileBtn) {
  removeLabFileBtn.addEventListener('click', () => {
    selectedLabFile = null;
    labFileInput.value = '';
    labUploadZone.style.display = 'flex';
    labPreviewRow.style.display = 'none';
    labPreviewImg.src = '';
    analyzeLabBtn.disabled = true;
  });
}

function resetLabScannerModal() {
  selectedLabFile = null;
  if (labFileInput) labFileInput.value = '';
  if (labUploadZone) labUploadZone.style.display = 'flex';
  if (labPreviewRow) labPreviewRow.style.display = 'none';
  if (labPreviewImg) labPreviewImg.src = '';
  if (analyzeLabBtn) analyzeLabBtn.disabled = true;
  if (labSpinIcon) labSpinIcon.style.display = 'none';
  if (labResultsSection) labResultsSection.style.display = 'none';
  if (sendLabToChatBtn) sendLabToChatBtn.style.display = 'none';
  document.getElementById('labNotes').value = '';
  lastLabAnalysisData = null;
}

if (analyzeLabBtn) {
  analyzeLabBtn.addEventListener('click', async () => {
    if (!selectedLabFile) return;
    
    analyzeLabBtn.disabled = true;
    labSpinIcon.style.display = 'inline-block';
    
    const formData = new FormData();
    formData.append('image', selectedLabFile);
    formData.append('notes', document.getElementById('labNotes').value.trim());
    
    try {
      const res = await fetch('/api/lab-scanner/analyze', {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) {
        let errMsg = 'فشل في تحليل التقرير الطبي، يرجى المحاولة لاحقاً.';
        try {
          const errData = await res.json();
          if (errData && errData.detail) errMsg = errData.detail;
        } catch (e) {}
        throw new Error(errMsg);
      }
      const data = await res.json();
      
      lastLabAnalysisData = data;
      renderLabResults(data);
      
    } catch (err) {
      console.error(err);
      showToast('❌', err.message);
      analyzeLabBtn.disabled = false;
    } finally {
      labSpinIcon.style.display = 'none';
    }
  });
}

function renderLabResults(data) {
  labResultsBody.innerHTML = '';
  
  if (!data.indicators || !data.indicators.length) {
    labResultsBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1rem;color:var(--mb-muted)">لم يتم استخراج أي مؤشرات مخبرية.</td></tr>';
  } else {
    data.indicators.forEach(ind => {
      const tr = document.createElement('tr');
      
      let statusClass = 'status-normal';
      let statusLabel = 'طبيعي';
      if (ind.status === 'High') { statusClass = 'status-high'; statusLabel = 'مرتفع'; }
      else if (ind.status === 'Low') { statusClass = 'status-low'; statusLabel = 'منخفض'; }
      
      tr.innerHTML = `
        <td style="padding:0.75rem;font-weight:600">${escapeHtml(ind.parameter)}</td>
        <td style="padding:0.75rem">${escapeHtml(ind.value)} <span style="font-size:0.7rem;color:var(--mb-muted)">${escapeHtml(ind.unit)}</span></td>
        <td style="padding:0.75rem;color:var(--mb-muted)">${escapeHtml(ind.reference_range)}</td>
        <td style="padding:0.75rem"><span class="lab-status-badge ${statusClass}">${statusLabel}</span></td>
        <td style="padding:0.75rem;font-size:0.75rem;line-height:1.4">${escapeHtml(ind.interpretation)}</td>
      `;
      labResultsBody.appendChild(tr);
    });
  }
  
  labSummaryText.textContent = data.summary || 'لا يوجد ملخص عام.';
  labResultsSection.style.display = 'block';
  sendLabToChatBtn.style.display = 'inline-block';
}

if (sendLabToChatBtn) {
  sendLabToChatBtn.addEventListener('click', () => {
    if (!lastLabAnalysisData) return;
    
    closeModal('labScannerModal');
    
    let reportStr = `أود مشاركة نتائج تحليلي الطبي معك:\\n`;
    lastLabAnalysisData.indicators.forEach(ind => {
      reportStr += `- **${ind.parameter}**: ${ind.value} ${ind.unit} (المعدل الطبيعي: ${ind.reference_range}) -> [حالة: ${ind.status}]\\n`;
    });
    reportStr += `\\n**الخلاصة المبدئية**: ${lastLabAnalysisData.summary}\\n\\nما رأيك في هذه النتائج؟ وما هي توجيهاتك الطبية ونمطي الغذائي والحياتي المناسبين؟`;
    
    userMessageEl.value = reportStr;
    chatForm.dispatchEvent(new Event('submit'));
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   DRUG INTERACTION CHECKER
   ══════════════════════════════════════════════════════════════════════════ */
const openInteractionModalBtn = document.getElementById('openInteractionModal');
const closeInteractionModalBtn = document.getElementById('closeInteractionModal');
const cancelInteractionBtn = document.getElementById('cancelInteractionBtn');
const interactionModal = document.getElementById('interactionModal');
const autofillMedsBtn = document.getElementById('autofillMedsBtn');
const drugInputsContainer = document.getElementById('drugInputsContainer');
const addDrugInputBtn = document.getElementById('addDrugInputBtn');
const checkInteractionsBtn = document.getElementById('checkInteractionsBtn');
const interactionSpinIcon = document.getElementById('interactionSpinIcon');
const interactionResultsSection = document.getElementById('interactionResultsSection');
const interactionsContainer = document.getElementById('interactionsContainer');
const interactionSummaryText = document.getElementById('interactionSummaryText');
const sendInteractionsToChatBtn = document.getElementById('sendInteractionsToChatBtn');

let lastInteractionReport = null;

if (openInteractionModalBtn) {
  openInteractionModalBtn.addEventListener('click', () => {
    resetDrugCheckerModal();
    openModal('interactionModal');
  });
}
if (closeInteractionModalBtn) {
  closeInteractionModalBtn.addEventListener('click', () => {
    closeModal('interactionModal');
  });
}
if (cancelInteractionBtn) {
  cancelInteractionBtn.addEventListener('click', () => {
    closeModal('interactionModal');
  });
}

if (addDrugInputBtn) {
  addDrugInputBtn.addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'drug-input-row';
    row.style.display = 'flex';
    row.style.gap = '0.5rem';
    row.innerHTML = `
      <input class="form-input drug-name-input" type="text" placeholder="اسم الدواء..." />
      <button type="button" class="btn btn-danger delete-drug-btn" style="padding:0.4rem;width:38px"><i class="fas fa-trash"></i></button>
    `;
    drugInputsContainer.appendChild(row);
    row.querySelector('.delete-drug-btn').addEventListener('click', () => row.remove());
  });
}

if (autofillMedsBtn) {
  autofillMedsBtn.addEventListener('click', () => {
    const medsVal = healthProfile.medications || '';
    if (!medsVal.trim()) {
      showToast('ℹ️', 'لم تقم بتسجيل أي أدوية في ملفك الصحي بعد.');
      return;
    }
    
    const list = medsVal.split(/[,;\n]+/).map(m => m.replace(/[\d\s]+mg|mg|mcg|g/gi, '').trim()).filter(Boolean);
    if (!list.length) return;
    
    drugInputsContainer.innerHTML = '';
    list.forEach((med, idx) => {
      const row = document.createElement('div');
      row.className = 'drug-input-row';
      row.style.display = 'flex';
      row.style.gap = '0.5rem';
      
      const deleteBtn = idx >= 1
        ? `<button type="button" class="btn btn-danger delete-drug-btn" style="padding:0.4rem;width:38px"><i class="fas fa-trash"></i></button>`
        : `<div style="width:38px"></div>`;
        
      row.innerHTML = `
        <input class="form-input drug-name-input" type="text" value="${escapeHtml(med)}" />
        ${deleteBtn}
      `;
      drugInputsContainer.appendChild(row);
      
      const del = row.querySelector('.delete-drug-btn');
      if (del) del.addEventListener('click', () => row.remove());
    });
    
    showToast('✨', 'تم استيراد أدويتك من ملفك الصحي بنجاح!');
  });
}

function resetDrugCheckerModal() {
  drugInputsContainer.innerHTML = `
    <div class="drug-input-row" style="display:flex;gap:0.5rem">
      <input class="form-input drug-name-input" type="text" placeholder="مثال: Aspirin" />
      <div style="width:38px"></div>
    </div>
    <div class="drug-input-row" style="display:flex;gap:0.5rem">
      <input class="form-input drug-name-input" type="text" placeholder="مثال: Ibuprofen" />
      <div style="width:38px"></div>
    </div>
  `;
  if (interactionResultsSection) interactionResultsSection.style.display = 'none';
  if (sendInteractionsToChatBtn) sendInteractionsToChatBtn.style.display = 'none';
  if (checkInteractionsBtn) checkInteractionsBtn.disabled = false;
  if (interactionSpinIcon) interactionSpinIcon.style.display = 'none';
  lastInteractionReport = null;
}

if (checkInteractionsBtn) {
  checkInteractionsBtn.addEventListener('click', async () => {
    const inputs = [...drugInputsContainer.querySelectorAll('.drug-name-input')];
    const meds = inputs.map(i => i.value.trim()).filter(Boolean);
    
    if (meds.length < 2) {
      showToast('⚠️', 'الرجاء إدخال اسم دواءين على الأقل للتحقق.');
      return;
    }
    
    checkInteractionsBtn.disabled = true;
    interactionSpinIcon.style.display = 'inline-block';
    
    try {
      const res = await fetch('/api/meds/check-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medications: meds })
      });
      
      if (!res.ok) {
        let errMsg = 'فشل في فحص تعارضات الأدوية، يرجى المحاولة لاحقاً.';
        try {
          const errData = await res.json();
          if (errData && errData.detail) errMsg = errData.detail;
        } catch (e) {}
        throw new Error(errMsg);
      }
      const data = await res.json();
      
      lastInteractionReport = data;
      renderInteractionResults(data);
      
    } catch (err) {
      console.error(err);
      showToast('❌', err.message);
      checkInteractionsBtn.disabled = false;
    } finally {
      interactionSpinIcon.style.display = 'none';
    }
  });
}

function renderInteractionResults(data) {
  interactionsContainer.innerHTML = '';
  
  if (!data.interactions || !data.interactions.length) {
    interactionsContainer.innerHTML = `
      <div class="interaction-card sev-safe">
        <div class="interaction-card-header">
          <span>🟢 لا توجد تعارضات معروفة</span>
          <span class="interaction-severity-badge">Safe</span>
        </div>
        <p class="interaction-description">جميع الأدوية المدرجة تبدو آمنة للاستخدام المتزامن. يرجى دائماً مراجعة الصيدلاني أو الطبيب عند تناول أي تركيبة علاجية جديدة.</p>
      </div>
    `;
  } else {
    data.interactions.forEach(item => {
      const card = document.createElement('div');
      
      let sevClass = 'sev-safe';
      if (item.severity.includes('Major') || item.severity.includes('🔴')) sevClass = 'sev-major';
      else if (item.severity.includes('Moderate') || item.severity.includes('🟡')) sevClass = 'sev-moderate';
      
      card.className = `interaction-card ${sevClass}`;
      card.innerHTML = `
        <div class="interaction-card-header">
          <span>🔄 ${escapeHtml(item.drugs.join(' ↔️ '))}</span>
          <span class="interaction-severity-badge">${escapeHtml(item.severity)}</span>
        </div>
        <p class="interaction-description">${escapeHtml(item.description)}</p>
        <p class="interaction-recommendation">💡 توصية: ${escapeHtml(item.recommendation)}</p>
      `;
      interactionsContainer.appendChild(card);
    });
  }
  
  interactionSummaryText.textContent = data.summary || 'لا يوجد ملخص عام.';
  interactionResultsSection.style.display = 'block';
  sendInteractionsToChatBtn.style.display = 'inline-block';
}

if (sendInteractionsToChatBtn) {
  sendInteractionsToChatBtn.addEventListener('click', () => {
    if (!lastInteractionReport) return;
    
    closeModal('interactionModal');
    
    let reportStr = `أريد استشارتك حول تعارضات الأدوية التالية:\\n`;
    if (lastInteractionReport.interactions && lastInteractionReport.interactions.length) {
      lastInteractionReport.interactions.forEach(item => {
        reportStr += `- **${item.drugs.join(' مع ')}**: خطورة [${item.severity}] -> ${item.description}. توصية: ${item.recommendation}\\n`;
      });
    } else {
      reportStr += `لقد قمت بفحص الأدوية وظهرت آمنة تماماً.\\n`;
    }
    reportStr += `\\n**خلاصة التقرير**: ${lastInteractionReport.summary}\\n\\nما هي الاحتياطات الطبية الإضافية التي يجب علي اتخاذها؟`;
    
    userMessageEl.value = reportStr;
    chatForm.dispatchEvent(new Event('submit'));
  });
}


})(); // IIFE