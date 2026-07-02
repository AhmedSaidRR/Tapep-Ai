/* ══════════════════════════════════════════════════════════════════════════
   Tabeeb AI — Supabase Authentication & Cloud Sync
   Login · Register · Logout · Cloud Save (chats, health profiles, reminders)
   ══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL  = 'https://uwnzvosddakjctajhklr.supabase.co'; // ✅ Correct: .co not .com
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3bnp2b3NkZGFramN0YWpoa2xyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjUyNjQsImV4cCI6MjA5ODQwMTI2NH0.bJ82UlT4xWkWM7SZ3FIZJnWx3JgOj-qBt0QyH1pw1gE';

const _supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let _currentUser = null;

/* ── helpers ──────────────────────────────────────────────────────────── */
function _showAuthToast(icon, msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span class="toast-icon">${icon}</span><span>${msg}</span>`;
  document.getElementById('toastContainer')?.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

function _updateNavbar(user) {
  const btn   = document.getElementById('authBtn');
  const label = document.getElementById('authBtnLabel');
  if (!btn || !label) return;
  if (user) {
    const email = user.email || '';
    const name  = email.split('@')[0];
    label.textContent = name;
    btn.title = `مرحباً ${name} — اضغط لتسجيل الخروج`;
    btn.classList.add('logged-in');
  } else {
    label.textContent = 'دخول';
    btn.title = 'تسجيل الدخول';
    btn.classList.remove('logged-in');
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   AUTH MODAL HTML  (injected dynamically)
   ══════════════════════════════════════════════════════════════════════════ */
function _injectAuthModal() {
  if (document.getElementById('authModal')) return;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'authModal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
  <div class="modal-box" style="max-width:420px">
    <div class="modal-header">
      <span class="modal-title" id="authModalTitle">🔐 تسجيل الدخول</span>
      <button class="modal-close" id="closeAuthModal" aria-label="Close"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body">

      <!-- Tabs -->
      <div class="auth-tabs">
        <button class="auth-tab active" id="tabLogin" onclick="switchAuthTab('login')">
          <i class="fas fa-sign-in-alt"></i> دخول
        </button>
        <button class="auth-tab" id="tabRegister" onclick="switchAuthTab('register')">
          <i class="fas fa-user-plus"></i> تسجيل جديد
        </button>
      </div>

      <!-- Login Panel -->
      <div id="panelLogin" class="auth-panel active">
        <div class="auth-welcome">
          <div class="auth-icon">🏥</div>
          <p>أدخل بياناتك للوصول إلى محادثاتك وملفك الصحي من أي جهاز</p>
        </div>
        <div class="form-group">
          <label class="form-label">📧 البريد الإلكتروني</label>
          <input class="form-input" id="loginEmail" type="email" placeholder="example@gmail.com" />
        </div>
        <div class="form-group">
          <label class="form-label">🔑 كلمة المرور</label>
          <input class="form-input" id="loginPassword" type="password" placeholder="••••••••" />
        </div>
        <div id="loginError" class="auth-error" style="display:none"></div>
        <button class="btn btn-primary auth-submit-btn" id="loginSubmitBtn" onclick="doLogin()">
          <i class="fas fa-sign-in-alt"></i> دخول
        </button>
        <p class="auth-hint">نسيت كلمة المرور؟ <a href="#" onclick="doResetPassword()">استعادة</a></p>
      </div>

      <!-- Register Panel -->
      <div id="panelRegister" class="auth-panel">
        <div class="auth-welcome">
          <div class="auth-icon">✨</div>
          <p>أنشئ حساباً مجانياً لحفظ محادثاتك وملفك الصحي على السحابة</p>
        </div>
        <div class="form-group">
          <label class="form-label">📧 البريد الإلكتروني</label>
          <input class="form-input" id="regEmail" type="email" placeholder="example@gmail.com" />
        </div>
        <div class="form-group">
          <label class="form-label">🔑 كلمة المرور</label>
          <input class="form-input" id="regPassword" type="password" placeholder="8 أحرف على الأقل" />
        </div>
        <div class="form-group">
          <label class="form-label">🔑 تأكيد كلمة المرور</label>
          <input class="form-input" id="regConfirm" type="password" placeholder="أعد كتابة كلمة المرور" />
        </div>
        <div id="regError" class="auth-error" style="display:none"></div>
        <button class="btn btn-primary auth-submit-btn" id="regSubmitBtn" onclick="doRegister()">
          <i class="fas fa-user-plus"></i> إنشاء حساب
        </button>
      </div>

    </div>
  </div>`;
  document.body.appendChild(modal);

  // Close handlers
  document.getElementById('closeAuthModal').addEventListener('click', () => {
    modal.classList.remove('open');
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.remove('open');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') modal.classList.remove('open');
  });
}

/* ── Tab switching ────────────────────────────────────────────────────── */
window.switchAuthTab = function(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab' + (tab === 'login' ? 'Login' : 'Register')).classList.add('active');
  document.getElementById('panel' + (tab === 'login' ? 'Login' : 'Register')).classList.add('active');
  document.getElementById('authModalTitle').textContent =
    tab === 'login' ? '🔐 تسجيل الدخول' : '✨ إنشاء حساب جديد';
};

/* ── Login ────────────────────────────────────────────────────────────── */
window.doLogin = async function() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  const btn      = document.getElementById('loginSubmitBtn');
  errEl.style.display = 'none';

  if (!email || !password) {
    errEl.textContent = '⚠️ أدخل البريد الإلكتروني وكلمة المرور';
    errEl.style.display = 'block'; return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الدخول…';

  const { data, error } = await _supa.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> دخول';

  if (error) {
    errEl.textContent = '❌ ' + (error.message.includes('Invalid') ? 'البريد أو كلمة المرور غلط' : error.message);
    errEl.style.display = 'block';
  } else {
    document.getElementById('authModal').classList.remove('open');
    _showAuthToast('✅', `مرحباً ${data.user.email.split('@')[0]}! تم تسجيل الدخول`);
  }
};

/* ── Register ─────────────────────────────────────────────────────────── */
window.doRegister = async function() {
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm  = document.getElementById('regConfirm').value;
  const errEl    = document.getElementById('regError');
  const btn      = document.getElementById('regSubmitBtn');
  errEl.style.display = 'none';

  if (!email || !password) {
    errEl.textContent = '⚠️ أدخل البريد الإلكتروني وكلمة المرور';
    errEl.style.display = 'block'; return;
  }
  if (password.length < 8) {
    errEl.textContent = '⚠️ كلمة المرور لازم تكون 8 أحرف على الأقل';
    errEl.style.display = 'block'; return;
  }
  if (password !== confirm) {
    errEl.textContent = '⚠️ كلمتا المرور غير متطابقتين';
    errEl.style.display = 'block'; return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري إنشاء الحساب…';

  const { data, error } = await _supa.auth.signUp({ email, password });

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-user-plus"></i> إنشاء حساب';

  if (error) {
    errEl.textContent = '❌ ' + (error.message.includes('already') ? 'البريد مسجل مسبقاً، جرب الدخول' : error.message);
    errEl.style.display = 'block';
  } else {
    document.getElementById('authModal').classList.remove('open');
    if (data.session) {
      _showAuthToast('🎉', `تم إنشاء حسابك بنجاح! مرحباً ${email.split('@')[0]}`);
    } else {
      _showAuthToast('📧', 'تم إرسال رابط التأكيد لبريدك الإلكتروني — تحقق من الإيميل');
    }
  }
};

/* ── Reset Password ───────────────────────────────────────────────────── */
window.doResetPassword = async function() {
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) {
    _showAuthToast('⚠️', 'أدخل البريد الإلكتروني أولاً'); return;
  }
  await _supa.auth.resetPasswordForEmail(email);
  _showAuthToast('📧', 'تم إرسال رابط استعادة كلمة المرور لبريدك');
};

/* ── Logout ───────────────────────────────────────────────────────────── */
window.doLogout = async function() {
  await _supa.auth.signOut();
  _currentUser = null;
  _updateNavbar(null);
  _showAuthToast('👋', 'تم تسجيل الخروج بنجاح');
};

/* ══════════════════════════════════════════════════════════════════════════
   CLOUD SYNC — Save & Load user data from Supabase
   ══════════════════════════════════════════════════════════════════════════ */

// Save a chat session to Supabase
async function _cloudSaveChat(entry) {
  if (!_currentUser) return;
  try {
    // Upsert session
    const { data: session, error: sErr } = await _supa
      .from('chat_sessions')
      .upsert({ id: entry.supaId || undefined, user_id: _currentUser.id, title: entry.title, updated_at: new Date().toISOString() },
               { onConflict: 'id' })
      .select('id')
      .single();
    if (sErr || !session) return;

    // Insert messages
    const msgs = entry.msgs.map(m => ({
      session_id:   session.id,
      role:         m.role,
      content_html: m.html || '',
      content_text: m.text || '',
      msg_time:     m.time || '',
    }));
    await _supa.from('chat_messages').upsert(msgs);
  } catch (e) { console.warn('Cloud save chat failed:', e); }
}

// Load all chat sessions from Supabase
async function _cloudLoadChats() {
  if (!_currentUser) return;
  try {
    const { data: sessions } = await _supa
      .from('chat_sessions')
      .select('id, title, created_at')
      .eq('user_id', _currentUser.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (!sessions?.length) return;

    // Merge with localStorage — avoid duplicates by supaId
    const local   = getSavedChats ? getSavedChats() : [];
    const localIds = local.map(c => c.supaId).filter(Boolean);

    const newEntries = sessions
      .filter(s => !localIds.includes(s.id))
      .map(s => ({
        id:     'cloud_' + s.id,
        supaId: s.id,
        title:  s.title,
        date:   new Date(s.created_at).toLocaleDateString('ar-EG', { day:'numeric', month:'short' }),
        msgs:   [], // lazy load on click
        memory: [],
        fromCloud: true,
      }));

    if (newEntries.length) {
      const merged = [...newEntries, ...local].slice(0, 30);
      if (typeof setSavedChats === 'function') setSavedChats(merged);
      if (typeof renderSavedChats === 'function') renderSavedChats();
    }
  } catch (e) { console.warn('Cloud load chats failed:', e); }
}

/* ══════════════════════════════════════════════════════════════════════════
   AUTH STATE LISTENER — runs whenever login/logout happens
   ══════════════════════════════════════════════════════════════════════════ */
_supa.auth.onAuthStateChange(async (event, session) => {
  _currentUser = session?.user || null;
  _updateNavbar(_currentUser);

  if (event === 'SIGNED_IN') {
    _showAuthToast('☁️', 'جاري تحميل بياناتك من السحابة…');
    await _cloudLoadChats();
    _showAuthToast('✅', 'تم تحميل بياناتك بنجاح');
  }

  if (event === 'SIGNED_OUT') {
    _updateNavbar(null);
  }
});

/* ── Auth Button click handler ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  _injectAuthModal();

  const authBtn = document.getElementById('authBtn');
  if (authBtn) {
    authBtn.addEventListener('click', () => {
      if (_currentUser) {
        // Show logout confirm
        if (confirm(`تسجيل الخروج من حساب ${_currentUser.email}؟`)) {
          doLogout();
        }
      } else {
        document.getElementById('authModal').classList.add('open');
      }
    });
  }
});
