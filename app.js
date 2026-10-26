/* MNL IA — assistant personnel propulsé par Google Gemini */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const app = $('#app'), stage = $('#stage'), chat = $('#chat'), input = $('#input');
  const btnAct = $('#btnAct'), btnAttach = $('#btnAttach');
  const fileInput = $('#file'), preview = $('#preview'), dlg = $('#settings');

  /* ================= Configuration ================= */
  const API = 'https://generativelanguage.googleapis.com/v1beta';
  // Modèles essayés dans l'ordre si la détection automatique ne donne rien
  const FALLBACKS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-4-argon',
                     'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];
  const ACCENTS = {
    violet: { a: [139, 92, 246], b: [34, 211, 238] },
    cyan:   { a: [34, 211, 238], b: [59, 130, 246] },
    vert:   { a: [52, 211, 153], b: [34, 211, 238] },
    flamme: { a: [249, 115, 22], b: [236, 72, 153] },
    or:     { a: [251, 191, 36], b: [249, 115, 22] }
  };

  /* ================= Stockage ================= */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  };

  let settings = Object.assign(
    { apiKey: '', model: 'auto', resolved: '', models: [], name: '', accent: 'violet', speak: false, persona: '' },
    store.get('mnl_settings', {})
  );
  if (!settings.model || settings.model === 'gemini-2.5-flash') settings.model = 'auto';
  if (!Array.isArray(settings.models)) settings.models = [];
  const saveSettings = () => store.set('mnl_settings', settings);

  let history = store.get('mnl_history', []);   // [{role:'user'|'model', text}]
  const persist = () => store.set('mnl_history', history.slice(-100));

  let pendingImage = null;   // {url, data, mime}
  let controller = null;
  let busy = false, listening = false, speaking = false;

  /* ================= Orbe vivant (canvas) ================= */
  const orb = (() => {
    const cv = $('#orb'), ctx = cv.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const N = 240, pts = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996323;
      pts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r, ph: Math.random() * 6.283 });
    }
    const targets = { idle: 0.22, listening: 0.8, thinking: 1, speaking: 0.65 };
    const speeds = { idle: 0.18, listening: 0.35, thinking: 1.5, speaking: 0.5 };
    let W = 0, H = 0, dpr = 1, t = 0, last = 0, state = 'idle', energy = 0.22, rotY = 0;
    let col = { a: [139, 92, 246], b: [34, 211, 238] };

    function resize() {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      cv.width = Math.max(1, Math.round(W * dpr));
      cv.height = Math.max(1, Math.round(H * dpr));
    }
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(cv);
    window.addEventListener('resize', resize);
    resize();

    const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
    const mix = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
    const TAU = Math.PI * 2;

    function draw(ms) {
      requestAnimationFrame(draw);
      if (!W || !H) return;
      const dt = Math.min(0.05, (ms - last) / 1000 || 0.016);
      last = ms;
      const k = reduce ? 0.3 : 1;
      t += dt * k;
      energy += (targets[state] - energy) * Math.min(1, dt * 4);
      rotY += dt * speeds[state] * k;

      const small = stage.classList.contains('small');
      const m = Math.min(W, H), cx = W / 2, cy = H / 2;
      const R = m * (small ? 0.36 : 0.3) * (1 + 0.035 * Math.sin(t * 1.7) + 0.05 * energy * Math.sin(t * 6.5));

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      // halo
      let g = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, m / 2);
      g.addColorStop(0, rgba(col.a, 0.3 + 0.25 * energy));
      g.addColorStop(0.5, rgba(col.b, 0.08 + 0.08 * energy));
      g.addColorStop(1, rgba(col.b, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // cœur
      g = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.05, cx, cy, R * 0.95);
      g.addColorStop(0, 'rgba(255,255,255,.85)');
      g.addColorStop(0.25, rgba(mix(col.a, [255, 255, 255], 0.35), 0.55));
      g.addColorStop(0.7, rgba(col.a, 0.28));
      g.addColorStop(1, rgba(col.b, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.95, 0, TAU); ctx.fill();

      // particules (sphère 3D)
      const cY = Math.cos(rotY), sY = Math.sin(rotY), cX = Math.cos(0.45), sX = Math.sin(0.45);
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        const w = 1 + 0.07 * energy * Math.sin(p.ph + t * 3 + p.y * 4);
        const x = p.x * w, y = p.y * w, z = p.z * w;
        const x1 = x * cY + z * sY, z1 = -x * sY + z * cY;
        const y1 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
        const persp = 1.8 / (1.8 - z2 * 0.5);
        const px = cx + x1 * R * persp * 1.05, py = cy + y1 * R * persp * 1.05;
        const depth = (z2 + 1) / 2;
        const s = (0.5 + 1.6 * depth) * (small ? 0.6 : 1) * persp * (1 + 0.5 * energy);
        ctx.fillStyle = rgba(mix(col.a, col.b, (p.y + 1) / 2), 0.15 + 0.8 * depth);
        ctx.beginPath(); ctx.arc(px, py, s, 0, TAU); ctx.fill();
      }

      // anneaux
      ctx.lineWidth = 1;
      for (let i = 0; i < 2; i++) {
        ctx.strokeStyle = rgba(i ? col.b : col.a, 0.35);
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * (1.28 + i * 0.12), R * (0.42 + i * 0.1), t * (i ? -0.35 : 0.28) + i, 0, TAU);
        ctx.stroke();
      }
      if (state === 'thinking') {
        ctx.setLineDash([4, 10]);
        ctx.strokeStyle = rgba(col.b, 0.6);
        ctx.beginPath(); ctx.arc(cx, cy, R * 1.5, t * 2, t * 2 + TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (state === 'listening' || state === 'speaking') {
        const sp = state === 'listening' ? 0.7 : 0.45;
        for (let i = 0; i < 3; i++) {
          const q = (t * sp + i / 3) % 1;
          ctx.strokeStyle = rgba(col.b, (1 - q) * 0.5);
          ctx.beginPath(); ctx.arc(cx, cy, R * (1.05 + q * 0.8), 0, TAU); ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    requestAnimationFrame(draw);

    return {
      setState(s) { state = s; },
      setColors(a, b) { col = { a, b }; }
    };
  })();

  function refreshState() {
    const s = listening ? 'listening' : busy ? 'thinking' : speaking ? 'speaking' : 'idle';
    orb.setState(s);
    app.dataset.state = s;
  }

  function applyAccent(name) {
    const c = ACCENTS[name] || ACCENTS.violet;
    const r = document.documentElement.style;
    r.setProperty('--a', 'rgb(' + c.a.join(',') + ')');
    r.setProperty('--b', 'rgb(' + c.b.join(',') + ')');
    r.setProperty('--a-rgb', c.a.join(','));
    r.setProperty('--b-rgb', c.b.join(','));
    orb.setColors(c.a, c.b);
  }

  /* ================= Utilitaires ================= */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function md(src) {
    const blocks = [];
    let t = esc(src).replace(/```(\w*)\n?([\s\S]*?)(```|$)/g, (m, lang, code) => {
      blocks.push('<pre><button class="copy" data-copy>Copier</button><code>' + code.replace(/\n$/, '') + '</code></pre>');
      return '\u0000' + (blocks.length - 1) + '\u0000';
    });
    t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    t = t.replace(/^### (.+)$/gm, '<h4>$1</h4>')
         .replace(/^## (.+)$/gm, '<h3>$1</h3>')
         .replace(/^# (.+)$/gm, '<h2>$1</h2>');
    t = t.replace(/(?:^|\n)((?:[-*] .+(?:\n|$))+)/g, (m, list) =>
      '\n\n<ul>' + list.trim().split('\n').map(l => '<li>' + l.replace(/^[-*] /, '') + '</li>').join('') + '</ul>\n\n');
    t = t.replace(/(?:^|\n)((?:\d+\. .+(?:\n|$))+)/g, (m, list) =>
      '\n\n<ol>' + list.trim().split('\n').map(l => '<li>' + l.replace(/^\d+\. /, '') + '</li>').join('') + '</ol>\n\n');
    t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
         .replace(/(^|[\s(>])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.split(/\n{2,}/).map(p => {
      const s = p.trim();
      if (!s) return '';
      if (/^<(h\d|ul|ol|pre)/.test(s) || /^\u0000\d+\u0000$/.test(s)) return s;
      return '<p>' + s.replace(/\n/g, '<br>') + '</p>';
    }).join('');
    return t.replace(/\u0000(\d+)\u0000/g, (m, i) => blocks[+i]);
  }

  const scrollDown = () => { chat.scrollTop = chat.scrollHeight; };
  const updateStage = () => stage.classList.toggle('small', chat.querySelector('.msg') !== null);

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copié ✓'); }
    catch { toast('Copie impossible'); }
  }

  chat.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (b) copy(b.parentElement.querySelector('code').innerText);
  });

  /* ================= Messages ================= */
  function addMsg(role, text, opts = {}) {
    const el = document.createElement('div');
    el.className = 'msg ' + role + (opts.error ? ' error' : '');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    el.appendChild(bubble);

    if (role === 'user') {
      if (opts.image) {
        const im = document.createElement('img');
        im.className = 'attached';
        im.src = opts.image;
        im.alt = '';
        bubble.appendChild(im);
      }
      bubble.appendChild(document.createTextNode(text));
    } else if (opts.typing) {
      bubble.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    } else {
      bubble.innerHTML = md(text);
      if (!opts.error) addTools(el, bubble, text);
    }
    chat.appendChild(el);
    updateStage();
    scrollDown();

    return {
      el,
      set(t) { bubble.innerHTML = md(t); },
      done(t) { bubble.innerHTML = md(t); addTools(el, bubble, t); }
    };
  }

  function addTools(el, bubble, text) {
    const bar = document.createElement('div');
    bar.className = 'tools';
    const c = document.createElement('button');
    c.textContent = 'Copier';
    c.onclick = (e) => { e.stopPropagation(); copy(text); };
    const s = document.createElement('button');
    s.textContent = 'Écouter';
    s.onclick = (e) => { e.stopPropagation(); speak(text); };
    bar.append(c, s);
    bubble.appendChild(bar);
    if (!el._tap) {
      el._tap = true;
      el.addEventListener('click', (e) => {
        if (e.target.closest('a,button,pre')) return;
        el.classList.toggle('open');
      });
    }
  }

  function renderHistory() {
    chat.querySelectorAll('.msg').forEach(n => n.remove());
    history.forEach(m => addMsg(m.role, m.text));
    updateStage();
    scrollDown();
  }

  /* ================= Voix ================= */
  let speakId = 0;
  function stopSpeech() {
    speakId++;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    speaking = false;
    refreshState();
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return toast('Lecture vocale indisponible');
    speechSynthesis.cancel();
    const clean = text.replace(/```[\s\S]*?```/g, ' ').replace(/[*#`_>\[\]]/g, '');
    const en = /\b(the|and|you|is|are|with)\b/i.test(clean) && !/\b(le|la|les|et|est|vous|je|des)\b/i.test(clean);
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = en ? 'en-US' : 'fr-FR';
    const id = ++speakId;
    u.onstart = () => { if (id === speakId) { speaking = true; refreshState(); } };
    u.onend = u.onerror = () => { if (id === speakId) { speaking = false; refreshState(); } };
    speechSynthesis.speak(u);
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;

  function toggleListen() {
    if (!SR) return toast('Dictée non disponible sur ce navigateur');
    if (listening) { rec.stop(); return; }
    if (busy) return;
    stopSpeech();
    rec = new SR();
    rec.lang = 'fr-FR';
    rec.interimResults = true;
    rec.continuous = false;
    const base = input.value;
    let heard = false;
    rec.onresult = (e) => {
      let t = '';
      for (const r of e.results) t += r[0].transcript;
      heard = true;
      input.value = (base + ' ' + t).trim();
      autosize();
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Autorise le micro pour parler');
    };
    rec.onend = () => {
      listening = false;
      refreshState();
      updateAct();
      if (heard && input.value.trim()) send(input.value, { voice: true });
    };
    try {
      rec.start();
      listening = true;
      refreshState();
      updateAct();
    } catch { toast('Micro indisponible'); }
  }

  /* ================= Image ================= */
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const u = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 1280 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const url = c.toDataURL('image/jpeg', 0.85);
        URL.revokeObjectURL(u);
        resolve({ url, data: url.split(',')[1], mime: 'image/jpeg' });
      };
      img.onerror = () => { URL.revokeObjectURL(u); reject(new Error('Image illisible')); };
      img.src = u;
    });
  }

  function clearImage() {
    pendingImage = null;
    preview.innerHTML = '';
    fileInput.value = '';
    updateAct();
  }

  btnAttach.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      pendingImage = await shrink(f);
      preview.innerHTML = '<div class="thumb"><img alt=""><button type="button" aria-label="Retirer">×</button></div>';
      preview.querySelector('img').src = pendingImage.url;
      preview.querySelector('button').onclick = clearImage;
      updateAct();
    } catch { toast("Impossible de lire l'image"); }
  });

  /* ================= Gemini ================= */
  class ApiError extends Error {
    constructor(status, msg) { super(msg); this.status = status; }
  }

  async function httpError(res) {
    let msg = '';
    try {
      const j = await res.json();
      msg = j.error?.message || '';
      if (j.error?.status) msg = j.error.status + ': ' + msg;
    } catch { /* ignore */ }
    return new ApiError(res.status, msg || 'HTTP ' + res.status);
  }

  const headers = () => ({ 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey });

  function rank(ids) {
    const score = (id) => {
      const v = parseFloat((id.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
      let s = v * 10;
      if (/flash/.test(id)) s += 6;
      if (/pro/.test(id)) s += 2;
      if (/lite/.test(id)) s -= 3;
      if (/preview|exp|thinking/.test(id)) s -= 4;
      if (/latest/.test(id)) s -= 1;
      return s;
    };
    return [...ids].sort((a, b) => score(b) - score(a));
  }

  // Demande à Google quels modèles cette clé peut vraiment utiliser
  async function discoverModels() {
    const ids = [];
    let token = '';
    for (let i = 0; i < 5; i++) {
      const res = await fetch(API + '/models?pageSize=200' + (token ? '&pageToken=' + encodeURIComponent(token) : ''),
        { headers: headers() });
      if (!res.ok) throw await httpError(res);
      const j = await res.json();
      for (const m of j.models || []) {
        if (!(m.supportedGenerationMethods || []).includes('generateContent')) continue;
        const id = (m.name || '').replace(/^models\//, '');
        if (!/^gemini/.test(id)) continue;
        if (/embedding|tts|image|live|audio|robotics|computer-use|native|aqa|learnlm/.test(id)) continue;
        ids.push(id);
      }
      token = j.nextPageToken;
      if (!token) break;
    }
    return rank(ids);
  }

  async function ensureModels(force) {
    if (!settings.apiKey) return;
    if (!force && settings.models.length) return;
    try {
      const ids = await discoverModels();
      if (ids.length) { settings.models = ids; saveSettings(); }
    } catch { /* la clé ou le réseau seront signalés à l'envoi */ }
  }

  function modelQueue() {
    const q = [];
    const add = (m) => { if (m && !q.includes(m)) q.push(m); };
    add(settings.model !== 'auto' ? settings.model : settings.resolved);
    settings.models.slice(0, 4).forEach(add);
    FALLBACKS.forEach(add);
    return q;
  }

  const modelGone = (e) => e instanceof ApiError && (
    e.status === 404 ||
    (e.status === 400 && /not found|not supported|no longer|deprecat|unavailable/i.test(e.message)) ||
    (e.status === 403 && /model/i.test(e.message) && /access|permission|not available/i.test(e.message))
  );

  function systemPrompt() {
    const date = new Date().toLocaleDateString('fr-FR', { dateStyle: 'full' });
    return "Tu es MNL IA, l'assistant personnel de l'utilisateur : élégant, chaleureux, direct et très compétent. " +
      (settings.name ? "Il s'appelle " + settings.name + ". " : '') +
      "Tu réponds dans sa langue (français par défaut), de façon courte et claire, et tu développes seulement si on te le demande. " +
      "Tu utilises le Markdown quand cela aide (listes, blocs de code). " +
      "Si on te demande qui tu es, tu réponds que tu es MNL IA, une intelligence artificielle. " +
      "Date du jour : " + date + "." +
      (settings.persona ? "\n\nInstructions de l'utilisateur : " + settings.persona : '');
  }

  async function streamOnce(model, contents, signal, onText) {
    const res = await fetch(API + '/models/' + encodeURIComponent(model) + ':streamGenerateContent?alt=sse', {
      method: 'POST',
      signal,
      headers: headers(),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt() }] },
        contents,
        generationConfig: { temperature: 0.9, topP: 0.95 }
      })
    });
    if (!res.ok) throw await httpError(res);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', full = '', blocked = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const j = JSON.parse(payload);
          if (j.promptFeedback?.blockReason) blocked = j.promptFeedback.blockReason;
          for (const p of j.candidates?.[0]?.content?.parts || []) {
            if (p.text && !p.thought) { full += p.text; onText(full); }
          }
        } catch { /* ligne partielle */ }
      }
    }
    if (!full) throw new Error(blocked ? 'Réponse bloquée (' + blocked + ')' : 'Réponse vide');
    return full;
  }

  async function generate(contents, signal, onText) {
    if (settings.model === 'auto' && !settings.resolved) await ensureModels(false);
    const queue = modelQueue();
    const wanted = queue[0];
    let lastErr = null;
    for (const model of queue) {
      try {
        const full = await streamOnce(model, contents, signal, onText);
        if (model !== wanted || (settings.model === 'auto' && settings.resolved !== model) ||
            (settings.model !== 'auto' && settings.model !== model)) {
          if (settings.model !== 'auto' && settings.model !== model) toast('Modèle indisponible, j\'utilise ' + model);
          settings.model = 'auto';
          settings.resolved = model;
          saveSettings();
        }
        return full;
      } catch (e) {
        if (modelGone(e)) { lastErr = e; continue; }
        throw e;
      }
    }
    throw new Error('Aucun modèle Gemini disponible avec cette clé.' + (lastErr ? ' (' + lastErr.message + ')' : ''));
  }

  function friendlyError(e) {
    const m = String(e.message || e);
    if (e instanceof ApiError) {
      if (e.status === 401) {
        return /ACCESS_TOKEN_TYPE_UNSUPPORTED|OAuth/i.test(m)
          ? "Google refuse cette clé depuis le navigateur (401). Crée-en une nouvelle dans AI Studio, puis recolle-la dans les réglages."
          : "Clé refusée (401). Vérifie-la dans les réglages.";
      }
      if (e.status === 403) return "Accès refusé (403). Vérifie ta clé et que la facturation est bien active.";
      if (e.status === 429) return "Limite atteinte pour le moment. Réessaie dans un instant.";
      if (e.status === 400 && /API key/i.test(m)) return "Clé invalide. Vérifie-la dans les réglages.";
    }
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Pas de connexion internet.";
    return m;
  }

  const keyProblem = (e) => e instanceof ApiError &&
    (e.status === 401 || e.status === 403 || (e.status === 400 && /API key/i.test(e.message)));

  /* ================= Envoi ================= */
  function setBusy(b) {
    busy = b;
    refreshState();
    updateAct();
  }

  async function send(raw, opts = {}) {
    const text = (raw || '').trim();
    if ((!text && !pendingImage) || busy) return;
    if (!settings.apiKey) {
      toast('Ajoute ta clé Gemini pour commencer');
      openSettings();
      return;
    }
    const img = pendingImage;
    clearImage();
    input.value = '';
    autosize();

    const userMsg = { role: 'user', text: text || 'Décris cette image.' };
    history.push(userMsg);
    const userUi = addMsg('user', userMsg.text, { image: img && img.url });
    const bot = addMsg('model', '', { typing: true });
    setBusy(true);
    controller = new AbortController();
    let partial = '';

    try {
      const contents = history.slice(-30).map((m, i, arr) => {
        const parts = [{ text: m.text }];
        if (img && i === arr.length - 1) parts.push({ inlineData: { mimeType: img.mime, data: img.data } });
        return { role: m.role, parts };
      });
      const full = await generate(contents, controller.signal, (t) => { partial = t; bot.set(t); scrollDown(); });
      history.push({ role: 'model', text: full });
      persist();
      bot.done(full);
      scrollDown();
      if (opts.voice || settings.speak) speak(full);
    } catch (e) {
      if (e.name === 'AbortError') {
        if (partial) { history.push({ role: 'model', text: partial }); persist(); bot.done(partial); }
        else { history.pop(); bot.el.remove(); userUi.el.remove(); input.value = userMsg.text; autosize(); updateStage(); }
      } else {
        history.pop();
        userUi.el.remove();
        bot.el.remove();
        input.value = userMsg.text;
        autosize();
        addMsg('model', friendlyError(e), { error: true });
        if (keyProblem(e)) setTimeout(openSettings, 500);
      }
    } finally {
      controller = null;
      setBusy(false);
    }
  }

  /* ================= Saisie ================= */
  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  }

  function updateAct() {
    const hasText = input.value.trim().length > 0 || !!pendingImage;
    const mode = busy ? 'stop' : hasText ? 'send' : SR ? 'mic' : 'send';
    btnAct.dataset.mode = mode;
    $('#icoMic').hidden = mode !== 'mic';
    $('#icoSend').hidden = mode !== 'send';
    $('#icoStop').hidden = mode !== 'stop';
    btnAct.classList.toggle('on', listening);
  }

  input.addEventListener('input', () => { autosize(); updateAct(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
      e.preventDefault();
      send(input.value);
    }
  });

  btnAct.addEventListener('click', () => {
    const mode = btnAct.dataset.mode;
    if (mode === 'stop') { if (controller) controller.abort(); }
    else if (mode === 'send') send(input.value);
    else toggleListen();
  });

  const orbEl = $('#orb');
  function orbTap() {
    if (busy) { if (controller) controller.abort(); return; }
    if (speaking) { stopSpeech(); return; }
    toggleListen();
  }
  orbEl.addEventListener('click', orbTap);
  orbEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); orbTap(); }
  });

  $('#btnNew').addEventListener('click', () => {
    if (busy && controller) controller.abort();
    stopSpeech();
    history = [];
    persist();
    renderHistory();
  });

  /* ================= Réglages ================= */
  function fillModels() {
    const sel = $('#setModel');
    sel.innerHTML = '';
    const auto = document.createElement('option');
    auto.value = 'auto';
    auto.textContent = 'Auto' + (settings.resolved ? ' · ' + settings.resolved : '');
    sel.appendChild(auto);
    const ids = settings.models.slice();
    if (settings.model !== 'auto' && !ids.includes(settings.model)) ids.push(settings.model);
    ids.forEach((id) => {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = id;
      sel.appendChild(o);
    });
    sel.value = settings.model;
  }

  function buildSwatches() {
    const box = $('#swatches');
    box.innerHTML = '';
    Object.keys(ACCENTS).forEach((name) => {
      const c = ACCENTS[name];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sw' + (settings.accent === name ? ' on' : '');
      b.title = name;
      b.setAttribute('aria-label', name);
      b.style.background = 'linear-gradient(135deg, rgb(' + c.a + '), rgb(' + c.b + '))';
      b.onclick = () => {
        settings.accent = name;
        saveSettings();
        applyAccent(name);
        buildSwatches();
      };
      box.appendChild(b);
    });
  }

  function openSettings() {
    $('#setName').value = settings.name;
    $('#setKey').value = settings.apiKey;
    $('#setPersona').value = settings.persona;
    $('#setSpeak').checked = settings.speak;
    fillModels();
    buildSwatches();
    if (!dlg.open) dlg.showModal();
    if (settings.apiKey && !settings.models.length) ensureModels(true).then(fillModels);
  }

  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnCancel').addEventListener('click', () => dlg.close());
  $('#settingsForm').addEventListener('submit', () => {
    const newKey = $('#setKey').value.trim();
    const keyChanged = newKey !== settings.apiKey;
    if (keyChanged) { settings.models = []; settings.resolved = ''; settings.model = 'auto'; }
    else settings.model = $('#setModel').value || 'auto';
    settings.apiKey = newKey;
    settings.name = $('#setName').value.trim();
    settings.persona = $('#setPersona').value.trim();
    settings.speak = $('#setSpeak').checked;
    saveSettings();
    updateGreeting();
    toast('Enregistré ✓');
    if (settings.apiKey && keyChanged) ensureModels(true);
  });
  $('#btnWipe').addEventListener('click', () => {
    if (!confirm("Effacer toute la conversation ?")) return;
    history = [];
    store.del('mnl_history');
    renderHistory();
    dlg.close();
  });

  /* ================= Installation PWA ================= */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $('#btnInstall').hidden = false;
  });
  $('#btnInstall').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $('#btnInstall').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('#btnInstall').hidden = true; toast('MNL IA installée ✓'); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  /* ================= Démarrage ================= */
  function updateGreeting() {
    const h = new Date().getHours();
    const hello = h < 5 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir';
    $('#greet').textContent = settings.name ? hello + ', ' + settings.name : hello;
  }

  applyAccent(settings.accent);
  updateGreeting();
  renderHistory();
  autosize();
  updateAct();
  refreshState();
  if (!settings.apiKey) setTimeout(openSettings, 900);
  else ensureModels(false);
})();
