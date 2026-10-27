/* MNL IA — assistant personnel (Groq · modèles GPT) */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const app = $('#app'), stage = $('#stage'), chat = $('#chat'), input = $('#input');
  const btnAct = $('#btnAct'), dlg = $('#settings'), lab = $('#lab');

  /* ================= Configuration ================= */
  const API = 'https://api.groq.com/openai/v1';
  const PREFERRED = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
  // Budgets (en caractères) : ils gardent chaque requête sous les limites de Groq
  const CORE_BUDGET = 5000;    // noyau.md (l'algorithme)
  const MEM_BUDGET = 4000;     // leçons de l'Atelier
  const HIST_BUDGET = 8000;    // conversation récente
  // Balises invisibles : ⟦retenir: titre | contenu⟧ (apprentissage) et 【…】 (renvois de la recherche web)
  const TAG_RETENIR = /⟦\s*retenir\s*:\s*([^⟧|]{1,80}?)\s*\|\s*([^⟧]{1,500}?)\s*⟧/g;
  // Demande explicite de recherche (« cherche sur le web », « les actualités »…) ; « boutique en ligne » seul ne déclenche rien
  const WEB_TRIGGER = /\b(sur (?:le )?(?:web|internet|google)|(?:cherche|recherche|trouve)[- ](?:moi|le|la|les|ça|ca|des?|un|une|\w+) .*?\ben ligne|cherche[- ]moi|recherche[- ]moi|(?:les |des |l['’])?derni[èe]res? (?:nouvelles|infos?|actus?|actualit[ée]s?)|(?:les |l['’])actualit[ée]s?)\b/i;
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

  store.del('mnl_settings'); // ancienne version (Gemini) : on la supprime, y compris l'ancienne clé

  let settings = Object.assign(
    { apiKey: '', model: 'auto', resolved: '', models: [], name: '', accent: 'violet', speak: false, persona: '', voice: '', web: false },
    store.get('mnl_groq', {})
  );
  if (!Array.isArray(settings.models)) settings.models = [];
  const saveSettings = () => store.set('mnl_groq', settings);

  let convo = store.get('mnl_history', []);          // [{role:'user'|'model', text}]
  const persist = () => store.set('mnl_history', convo.slice(-100));

  let lessons = store.get('mnl_lessons', []);        // [{id, title, text, on, ts}]
  const saveLessons = () => store.set('mnl_lessons', lessons);

  let controller = null;
  let busy = false, listening = false, speaking = false;
  let voiceOn = false, voicePaused = false;

  /* ================= Noyau : l'algorithme de pensée (noyau.md) ================= */
  let core = { text: '', state: 'none', size: 0 };   // state : ok | cut | cache | none
  let coreReady = Promise.resolve();                 // les réponses attendent que le noyau soit lu

  // Retire les commentaires et les sections « (non envoyé) », puis borne la taille
  function cleanCore(raw) {
    const noComments = raw.replace(/<!--[\s\S]*?-->/g, '');
    const kept = noComments.split(/^(?=## )/m).filter(p => !/^## .*\(non envoyé\)/i.test(p));
    let text = kept.join('').trim();
    let cut = false;
    if (text.length > CORE_BUDGET) {
      const head = text.slice(0, CORE_BUDGET);
      const k = head.lastIndexOf('\n');
      text = (k > CORE_BUDGET * 0.6 ? head.slice(0, k) : head).trim();
      cut = true;
    }
    return { text, cut };
  }

  function coreLabel() {
    const kc = (core.size / 1000).toFixed(1).replace('.', ',');
    if (core.state === 'ok') return 'Noyau chargé · ' + kc + ' k car.  ↻';
    if (core.state === 'cut') return 'Noyau trop long : coupé à ' + (CORE_BUDGET / 1000) + ' k car.  ↻';
    if (core.state === 'cache') return 'Noyau : copie hors-ligne · ' + kc + ' k car.  ↻';
    return 'Noyau introuvable : version de base  ↻';
  }
  const paintCore = () => { const b = $('#coreTxt'); if (b) b.textContent = coreLabel(); };

  async function loadCore() {
    let raw = '', fromNet = false;
    try {
      const r = await fetch('noyau.md', { cache: 'no-store' });
      if (r.ok) {
        const t = await r.text();
        if (t.trim() && !/<html|<!doctype/i.test(t.slice(0, 300))) { raw = t; fromNet = true; }
      }
    } catch { /* hors-ligne */ }
    if (fromNet) store.set('mnl_core', raw);
    else raw = store.get('mnl_core', '');
    if (!raw) { core = { text: '', state: 'none', size: 0 }; paintCore(); return core; }
    const c = cleanCore(raw);
    core = { text: c.text, state: !fromNet ? 'cache' : c.cut ? 'cut' : 'ok', size: c.text.length };
    paintCore();
    return core;
  }

  /* ================= Orbe vivant (canvas) ================= */
  const orb = (() => {
    const cv = $('#orb'), ctx = cv.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const N = 260, pts = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996323;
      pts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r, ph: Math.random() * 6.283 });
    }
    const targets = { idle: 0.22, listening: 0.8, thinking: 1, speaking: 0.7 };
    const speeds = { idle: 0.18, listening: 0.35, thinking: 1.5, speaking: 0.5 };
    let W = 0, H = 0, dpr = 1, t = 0, last = 0, state = 'idle', energy = 0.22, rotY = 0, kick = 0;
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
      kick = Math.max(0, kick - dt * 3.2);
      energy += (targets[state] - energy) * Math.min(1, dt * 4);
      const e = Math.min(1.4, energy + kick * 0.6);
      rotY += dt * speeds[state] * k;

      const voice = app.classList.contains('voice');
      const mini = !voice && stage.classList.contains('small');
      // en mode voix : l'orbe monte pour laisser la place aux sous-titres en bas
      const m = voice ? Math.min(W, H * 0.8) : Math.min(W, H), cx = W / 2, cy = voice ? H * 0.4 : H / 2;
      const base = voice ? 0.34 : mini ? 0.36 : 0.3;
      const R = m * base * (1 + 0.035 * Math.sin(t * 1.7) + 0.05 * e * Math.sin(t * 6.5));

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      let g = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, Math.max(m / 2, R * 1.9));
      g.addColorStop(0, rgba(col.a, 0.3 + 0.25 * e));
      g.addColorStop(0.5, rgba(col.b, 0.08 + 0.08 * e));
      g.addColorStop(1, rgba(col.b, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      g = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.05, cx, cy, R * 0.95);
      g.addColorStop(0, 'rgba(255,255,255,.85)');
      g.addColorStop(0.25, rgba(mix(col.a, [255, 255, 255], 0.35), 0.55));
      g.addColorStop(0.7, rgba(col.a, 0.28));
      g.addColorStop(1, rgba(col.b, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.95, 0, TAU); ctx.fill();

      const cY = Math.cos(rotY), sY = Math.sin(rotY), cX = Math.cos(0.45), sX = Math.sin(0.45);
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        const w = 1 + 0.07 * e * Math.sin(p.ph + t * 3 + p.y * 4);
        const x = p.x * w, y = p.y * w, z = p.z * w;
        const x1 = x * cY + z * sY, z1 = -x * sY + z * cY;
        const y1 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
        const persp = 1.8 / (1.8 - z2 * 0.5);
        const px = cx + x1 * R * persp * 1.05, py = cy + y1 * R * persp * 1.05;
        const depth = (z2 + 1) / 2;
        const s = (0.5 + 1.6 * depth) * (mini ? 0.6 : voice ? 1.25 : 1) * persp * (1 + 0.5 * e);
        ctx.fillStyle = rgba(mix(col.a, col.b, (p.y + 1) / 2), 0.15 + 0.8 * depth);
        ctx.beginPath(); ctx.arc(px, py, s, 0, TAU); ctx.fill();
      }

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
      setColors(a, b) { col = { a, b }; },
      pulse(v) { kick = Math.min(1, Math.max(kick, v || 1)); }
    };
  })();

  const VLABELS = { listening: "Je t'écoute", thinking: 'Je réfléchis', speaking: 'Je parle' };

  function refreshState() {
    const s = listening ? 'listening' : busy ? 'thinking' : speaking ? 'speaking' : 'idle';
    orb.setState(s);
    app.dataset.state = s;
    if (voiceOn) $('#vstate').textContent = VLABELS[s] || (voicePaused ? 'Touche pour parler' : '…');
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
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
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
    s.onclick = (e) => { e.stopPropagation(); speakText(text); };
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
    convo.forEach(m => addMsg(m.role, m.text));
    updateStage();
    scrollDown();
  }

  /* ================= Voix : lecture ================= */
  const hasTTS = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

  const EN_WORDS = new Set('the and you your with this that for are was have will would what how can not but from they their there about just like'.split(' '));
  const FR_WORDS = new Set('le la les des une un est et que pour pas vous je tu il elle nous sur dans avec ce cette sont mais comme plus aussi très bien'.split(' '));
  function guessLang(text) {
    const words = text.toLowerCase().match(/[a-zàâçéèêëîïôûùüÿ']+/g) || [];
    let en = 0, fr = 0;
    for (const w of words) { if (EN_WORDS.has(w)) en++; if (FR_WORDS.has(w)) fr++; }
    return en > fr + 1 ? 'en-US' : 'fr-FR';
  }

  const tts = (() => {
    let voices = [], queue = [], active = false, gen = 0, idleCb = null;

    function load() { if (hasTTS) voices = speechSynthesis.getVoices() || []; }
    if (hasTTS) { load(); speechSynthesis.onvoiceschanged = () => { load(); fillVoices(); }; }

    const norm = (l) => (l || '').replace('_', '-').toLowerCase();
    function score(v, lang) {
      const n = v.name.toLowerCase();
      let s = 0;
      if (/natural|neural|online|premium|enhanced|studio|wavenet/.test(n)) s += 6;
      if (/google/.test(n)) s += 3;
      if (norm(v.lang) === lang.toLowerCase()) s += 2;
      if (v.default) s += 1;
      if (/compact|espeak|novelty|robot/.test(n)) s -= 4;
      return s;
    }
    function pick(lang) {
      const pre = lang.slice(0, 2).toLowerCase();
      const pool = voices.filter(v => norm(v.lang).startsWith(pre));
      if (settings.voice) {
        const chosen = pool.find(v => v.voiceURI === settings.voice || v.name === settings.voice);
        if (chosen) return chosen;
      }
      return pool.sort((a, b) => score(b, lang) - score(a, lang))[0] || null;
    }

    function finish() {
      const cb = idleCb;
      idleCb = null;
      if (cb) cb();
    }

    function next() {
      if (!queue.length) {
        active = false;
        speaking = false;
        refreshState();
        finish();
        return;
      }
      const item = queue.shift();
      const my = gen;
      try {
        const u = new SpeechSynthesisUtterance(item.text);
        u.lang = item.lang;
        const v = pick(item.lang);
        if (v) u.voice = v;
        u.rate = 1.04;
        u.onstart = () => {
          if (my !== gen) return;
          speaking = true;
          refreshState();
          if (voiceOn) setCaption(item.text, 'ai');
        };
        u.onboundary = () => { if (my === gen) orb.pulse(0.9); };
        u.onend = u.onerror = () => { if (my === gen) next(); };
        active = true;
        speaking = true;
        refreshState();
        speechSynthesis.speak(u);
      } catch {
        // la voix ne doit jamais casser la réponse écrite
        queue = [];
        active = false;
        speaking = false;
        refreshState();
        finish();
      }
    }

    return {
      voices() { return voices; },
      say(text) {
        if (!hasTTS || !text) return;
        queue.push({ text, lang: guessLang(text) });
        if (!active) next();
      },
      stop() {
        gen++;
        queue = [];
        idleCb = null;
        active = false;
        if (hasTTS) { try { speechSynthesis.cancel(); } catch { /* ignore */ } }
        speaking = false;
        refreshState();
      },
      whenIdle(cb) {
        if (!hasTTS || (!active && !queue.length)) { cb(); return; }
        idleCb = cb;
      },
      unlock() {
        if (!hasTTS) return;
        try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch { /* ignore */ }
      }
    };
  })();

  function speakable(seg, inCode) {
    const parts = seg.split('```');
    let out = '', inside = inCode;
    parts.forEach((p, i) => { if (i > 0) inside = !inside; if (!inside) out += ' ' + p; });
    out = out.replace(/`([^`]*)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[*_~]/g, '')
      .replace(/[#>|]/g, ' ')
      .replace(/^\s*[-•]\s+/gm, '')
      .replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
    return /[\p{L}\p{N}]/u.test(out) ? out : '';
  }

  function splitLong(text, max = 200) {
    const out = [];
    let s = text;
    while (s.length > max) {
      let cut = s.lastIndexOf(', ', max);
      if (cut < 40) cut = s.lastIndexOf(' ', max);
      if (cut < 40) cut = max;
      out.push(s.slice(0, cut + 1).trim());
      s = s.slice(cut + 1).trim();
    }
    if (s) out.push(s);
    return out;
  }

  // Lit la réponse au fur et à mesure qu'elle arrive, phrase par phrase
  function makeSpeaker() {
    let pos = 0;
    return {
      feed(full, final) {
        for (;;) {
          const rest = full.slice(pos);
          if (!rest.trim()) { pos = full.length; return; }
          let end = -1;
          const re = final ? /[.!?…]+["'»)\]]*(?:\s|$)|\n+/g : /[.!?…]+["'»)\]]*\s|\n+/g;
          let m;
          while ((m = re.exec(rest))) {
            const e = m.index + m[0].length;
            if (e >= 28) { end = e; break; }
          }
          if (end < 0) {
            if (!final) return;
            end = rest.length;
          }
          const seg = rest.slice(0, end);
          const start = pos;
          pos += end;
          const inCode = ((full.slice(0, start).match(/```/g) || []).length % 2) === 1;
          const text = speakable(seg, inCode);
          if (text) splitLong(text).forEach(t => tts.say(t));
          if (pos >= full.length) return;
        }
      }
    };
  }

  function speakText(text) {
    if (!hasTTS) return toast('Lecture vocale indisponible');
    tts.stop();
    makeSpeaker().feed(text, true);
  }

  /* ================= Voix : conversation plein écran ================= */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, wake = null, emptyTries = 0, enteredFs = false;

  function setCaption(text, cls) {
    const c = $('#vcap');
    c.textContent = text || '';
    c.className = cls || '';
  }

  async function enterVoice() {
    if (voiceOn) return;
    if (!settings.apiKey) { toast('Ajoute ta clé Groq pour commencer'); openSettings(); return; }
    if (!SR) { toast('La conversation vocale demande Chrome ou Edge'); return; }
    tts.unlock();
    voiceOn = true;
    voicePaused = false;
    emptyTries = 0;
    app.classList.add('voice');
    setCaption('', '');
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch { /* ignore */ }
    if (!document.fullscreenElement && document.fullscreenEnabled && !isFullscreenApp()) {
      try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); enteredFs = true; } catch { /* ignore */ }
    }
    refreshState();
    listen();
  }

  function exitVoice() {
    if (!voiceOn) return;
    voiceOn = false;
    voicePaused = false;
    if (rec) { try { rec.abort(); } catch { /* ignore */ } rec = null; }
    listening = false;
    if (controller) controller.abort();
    tts.stop();
    app.classList.remove('voice');
    setCaption('', '');
    if (wake) { try { wake.release(); } catch { /* ignore */ } wake = null; }
    if (enteredFs && document.fullscreenElement) { try { document.exitFullscreen(); } catch { /* ignore */ } }
    enteredFs = false;
    refreshState();
    updateAct();
    scrollDown();
  }

  function listen() {
    if (!voiceOn || busy || speaking || listening) return;
    voicePaused = false;
    const r = new SR();
    r.lang = 'fr-FR';
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    let text = '', fatal = false;
    r.onresult = (e) => {
      let t = '';
      for (const x of e.results) t += x[0].transcript;
      text = t.trim();
      setCaption(text, 'me');
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { fatal = true; toast('Autorise le micro pour parler'); }
      else if (e.error === 'audio-capture') { fatal = true; toast('Micro introuvable'); }
      else if (e.error === 'network') { fatal = true; toast('La dictée a besoin d\'internet'); }
    };
    r.onend = () => {
      if (rec === r) rec = null;
      listening = false;
      refreshState();
      if (!voiceOn) return;
      if (text) { emptyTries = 0; send(text, { voice: true }); }
      else if (!fatal && ++emptyTries < 4) setTimeout(listen, 350);
      else { voicePaused = true; refreshState(); }
    };
    try {
      r.start();
      rec = r;
      listening = true;
      refreshState();
    } catch {
      voicePaused = true;
      toast('Micro indisponible');
      refreshState();
    }
  }

  function orbTap() {
    if (!voiceOn) { enterVoice(); return; }
    if (speaking || busy) {
      if (controller) controller.abort();
      tts.stop();
      setTimeout(listen, 300);
    } else if (listening) {
      if (rec) rec.stop();
    } else {
      emptyTries = 0;
      listen();
    }
  }

  const orbEl = $('#orb');
  orbEl.addEventListener('click', orbTap);
  orbEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); orbTap(); }
  });
  $('#vClose').addEventListener('click', exitVoice);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && voiceOn && !dlg.open && !lab.open) exitVoice(); });

  /* ================= Plein écran ================= */
  function isFullscreenApp() { return window.matchMedia('(display-mode: fullscreen)').matches; }
  const btnFs = $('#btnFs');
  if (!(document.fullscreenEnabled && document.documentElement.requestFullscreen) || isFullscreenApp()) btnFs.hidden = true;
  btnFs.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => toast('Plein écran refusé'));
  });
  document.addEventListener('fullscreenchange', () => {
    btnFs.classList.toggle('on', !!document.fullscreenElement);
    if (!document.fullscreenElement) enteredFs = false;
  });

  /* ================= Atelier : apprendre à MNL IA ================= */
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let editing = null, labRec = null;

  const lessonSize = (l) => l.title.length + l.text.length + 6;
  const memUsed = () => lessons.filter(l => l.on).reduce((n, l) => n + lessonSize(l), 0);

  function lessonsBlock() {
    const parts = [];
    let used = 0;
    lessons.filter(l => l.on).sort((a, b) => b.ts - a.ts).forEach((l) => {
      const t = '### ' + l.title + '\n' + l.text;
      if (used + t.length > MEM_BUDGET) return;
      parts.push(t);
      used += t.length;
    });
    return parts.join('\n\n');
  }

  function renderLab() {
    const ul = $('#lessons');
    ul.innerHTML = '';
    const sorted = lessons.slice().sort((a, b) => b.ts - a.ts);
    if (!sorted.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Rien encore. Apprends-moi ta première chose.';
      ul.appendChild(li);
    }
    sorted.forEach((l) => {
      const li = document.createElement('li');
      li.className = 'les' + (l.on ? '' : ' off') + (editing === l.id ? ' editing' : '') + (l.auto ? ' auto' : '');
      li.dataset.id = l.id;
      const body = document.createElement('button');
      body.type = 'button';
      body.className = 'les-body';
      const h = document.createElement('b');
      h.textContent = l.title;
      const p = document.createElement('span');
      p.textContent = l.text;
      body.append(h, p);
      const tg = document.createElement('input');
      tg.type = 'checkbox';
      tg.className = 'tg';
      tg.checked = l.on;
      tg.title = 'Actif';
      tg.setAttribute('aria-label', 'Actif');
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.title = 'Oublier';
      del.setAttribute('aria-label', 'Oublier');
      del.textContent = '×';
      li.append(body, tg, del);
      ul.appendChild(li);
    });
    const pct = Math.min(100, Math.round(memUsed() / MEM_BUDGET * 100));
    $('#memBar').style.width = pct + '%';
    $('#mem').classList.toggle('full', memUsed() > MEM_BUDGET);
    $('#memTxt').textContent = memUsed() > MEM_BUDGET
      ? 'Mémoire pleine : désactive des leçons'
      : pct + ' % de ma mémoire utilisée';
    paintCore();
  }

  function resetLabForm() {
    editing = null;
    $('#lTitle').value = '';
    $('#lText').value = '';
    $('#lSave').textContent = 'Apprendre';
    $('#lCancel').hidden = true;
  }

  function addLesson(title, text) {
    lessons.push({ id: uid(), title: title.slice(0, 80), text: text.trim(), on: true, ts: Date.now() });
    saveLessons();
    renderLab();
  }

  // Leçon retenue par l'IA elle-même (balise ⟦retenir: …⟧) : bornée, dédoublonnée, marquée « auto »
  const flat = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  function learnAuto(titleRaw, textRaw) {
    const title = titleRaw.replace(/\s+/g, ' ').trim().slice(0, 80);
    const text = textRaw.replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!title || !text) return false;
    const ft = flat(title), fx = flat(text);
    const same = lessons.find(l => flat(l.title) === ft ||
      (fx.length >= 24 && (flat(l.text).includes(fx.slice(0, 40)) || fx.includes(flat(l.text).slice(0, 40)))));
    if (same) {
      if (same.text === text) return false;
      same.text = text; same.on = true; same.auto = true; same.ts = Date.now();
    } else {
      if (memUsed() + title.length + text.length + 6 > MEM_BUDGET) { toast('Ma mémoire est pleine : fais du tri dans l\'Atelier'); return false; }
      lessons.push({ id: uid(), title, text, on: true, auto: true, ts: Date.now() });
    }
    saveLessons();
    renderLab();
    return true;
  }

  $('#lessons').addEventListener('click', (e) => {
    const li = e.target.closest('.les');
    if (!li) return;
    const l = lessons.find(x => x.id === li.dataset.id);
    if (!l) return;
    if (e.target.closest('.del')) {
      if (!confirm('Oublier « ' + l.title + ' » ?')) return;
      lessons = lessons.filter(x => x !== l);
      if (editing === l.id) resetLabForm();
      saveLessons();
      renderLab();
    } else if (e.target.closest('.tg')) {
      l.on = e.target.checked;
      saveLessons();
      renderLab();
    } else if (e.target.closest('.les-body')) {
      editing = l.id;
      $('#lTitle').value = l.title;
      $('#lText').value = l.text;
      $('#lSave').textContent = 'Mettre à jour';
      $('#lCancel').hidden = false;
      renderLab();
      $('#lText').focus();
    }
  });

  $('#labForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('#lText').value.trim();
    let title = $('#lTitle').value.trim();
    if (!text) { toast('Explique-moi d\'abord comment faire'); return; }
    if (!title) title = text.replace(/\s+/g, ' ').slice(0, 42) + (text.length > 42 ? '…' : '');
    if (editing) {
      const l = lessons.find(x => x.id === editing);
      if (l) { l.title = title.slice(0, 80); l.text = text; l.ts = Date.now(); delete l.auto; saveLessons(); }
    } else {
      addLesson(title, text);
    }
    resetLabForm();
    renderLab();
    toast('Appris ✓');
  });
  $('#lCancel').addEventListener('click', () => { resetLabForm(); renderLab(); });

  $('#lMic').addEventListener('click', () => {
    if (!SR) return toast('Dictée indisponible ici');
    const btn = $('#lMic'), el = $('#lText');
    if (labRec) { labRec.stop(); return; }
    const r = new SR();
    r.lang = 'fr-FR';
    r.interimResults = true;
    r.continuous = false;
    const base = el.value ? el.value.replace(/\s*$/, ' ') : '';
    r.onresult = (e) => { let t = ''; for (const x of e.results) t += x[0].transcript; el.value = base + t; };
    r.onend = () => { labRec = null; btn.classList.remove('on'); };
    r.onerror = () => { /* onend suit */ };
    try { r.start(); labRec = r; btn.classList.add('on'); } catch { /* ignore */ }
  });

  function openLab() {
    renderLab();
    if (!lab.open) lab.showModal();
  }
  $('#btnLab').addEventListener('click', openLab);
  $('#labClose').addEventListener('click', () => lab.close());
  lab.addEventListener('close', () => { if (labRec) labRec.stop(); resetLabForm(); });

  // « Retiens que… » dit dans la conversation : MNL IA l'apprend aussi
  const TEACH = /^\s*(?:retiens(?:\s+bien)?(?:\s+que)?|souviens-toi(?:\s+que)?|mémorise(?:\s+que)?|apprends\s+que|note\s+que|n['’]oublie\s+pas(?:\s+que)?)\s*[:,\-–]?\s*([\s\S]{6,})$/i;

  /* ================= Groq (modèles GPT) ================= */
  class ApiError extends Error {
    constructor(status, msg) { super(msg); this.status = status; }
  }

  async function httpError(res) {
    let msg = '';
    try { const j = await res.json(); msg = j.error?.message || ''; } catch { /* ignore */ }
    return new ApiError(res.status, msg || 'HTTP ' + res.status);
  }

  const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.apiKey });

  function rankModels(ids) {
    return [...ids].sort((a, b) => {
      const i = PREFERRED.indexOf(a), j = PREFERRED.indexOf(b);
      if (i !== -1 || j !== -1) return (i === -1 ? 99 : i) - (j === -1 ? 99 : j);
      return b.localeCompare(a);
    });
  }

  // Demande à Groq quels modèles GPT cette clé peut utiliser
  async function ensureModels(force) {
    if (!settings.apiKey) return { ok: false };
    if (!force && settings.models.length) return { ok: true };
    try {
      const res = await fetch(API + '/models', { headers: authHeaders() });
      if (!res.ok) return { ok: false, status: res.status };
      const j = await res.json();
      const ids = (j.data || []).map(m => m.id).filter(id => /gpt-oss/i.test(id) && !/safeguard/i.test(id));
      if (ids.length) { settings.models = rankModels(ids); saveSettings(); }
      return { ok: true };
    } catch { return { ok: false, status: 0 }; }
  }

  function modelQueue() {
    const q = [];
    const add = (m) => { if (m && !q.includes(m)) q.push(m); };
    add(settings.model !== 'auto' ? settings.model : settings.resolved);
    settings.models.forEach(add);
    PREFERRED.forEach(add);
    return q;
  }

  const retriable = (e) => e instanceof ApiError && (
    [404, 413, 429].includes(e.status) || e.status >= 500 ||
    (e.status === 400 && /decommission|not found|does not exist|no longer|not supported/i.test(e.message)) ||
    (e.status === 403 && /model/i.test(e.message))
  );

  const fillVars = (text, ctx) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in ctx ? ctx[k] : ''));

  function systemPrompt(voice, web) {
    const now = new Date();
    const who = settings.name || "l'utilisateur";
    const model = settings.resolved || PREFERRED[0];
    const dateTxt = now.toLocaleDateString('fr-FR', { dateStyle: 'full' });
    const ctx = {
      prenom: who,
      date: dateTxt,
      heure: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      mode: voice ? 'voix' : 'écrit',
      echanges: String(convo.filter(m => m.role === 'user').length),
      memoire: Math.min(100, Math.round(memUsed() / MEM_BUDGET * 100)) + ' %',
      recherche_web: web ? 'disponible pour cette demande' : 'indisponible',
      modele: model
    };
    let s;
    if (core.text) {
      s = "Tu es MNL IA. Ci-dessous, ton noyau : l'algorithme de pensée que tu exécutes à chaque message, dans l'ordre. " +
        "Il est écrit à la première personne (« je » = toi). Suis-le à la lettre.\n\n" + fillVars(core.text, ctx);
    } else {
      s = "Tu es MNL IA, l'assistant personnel de " + who + " : élégant, chaleureux, direct, très compétent et fiable. " +
        "Tu réponds dans sa langue (français par défaut), de façon courte et claire, et tu développes seulement si on te le demande. " +
        "Tu utilises le Markdown quand cela aide. Tu ne prétends jamais avoir fait ce que tu n'as pas fait, et tu n'inventes jamais un fait. " +
        "Si on te demande qui tu es : MNL IA, une intelligence artificielle personnelle qui tourne sur un modèle GPT open source (" + model + ") via Groq. " +
        "Date du jour : " + dateTxt + ".";
    }
    const learned = lessonsBlock();
    if (learned) {
      s += "\n\n## Ce que " + who + " m'a appris\n(Méthodes et faits : à appliquer à la lettre quand ils touchent la demande.)\n\n" + learned;
    }
    if (settings.persona) s += "\n\n## Personnalité souhaitée\n" + settings.persona;
    if (voice) {
      s += "\n\n## Mode voix\nTu parles à voix haute : une à trois phrases courtes et naturelles, sans markdown, sans liste, sans symboles, sans émojis. " +
        "Dis les nombres et les unités comme à l'oral.";
    }
    return s;
  }

  function buildMessages(voice, web) {
    const tail = [];
    let used = 0;
    for (let i = convo.length - 1; i >= 0; i--) {
      const m = convo[i];
      used += m.text.length;
      if (used > HIST_BUDGET && tail.length >= 1) break;
      tail.unshift({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text });
    }
    while (tail.length > 1 && tail[0].role === 'assistant') tail.shift();
    return [{ role: 'system', content: systemPrompt(voice, web) }, ...tail];
  }

  // Ce que l'utilisateur voit/entend : sans balises ⟦…⟧ (même incomplètes) ni renvois 【…】 de la recherche web
  function visible(t) {
    let v = t.replace(/⟦[^⟧]*⟧/g, '');
    let cut = v.length !== t.length;
    const i = v.indexOf('⟦');
    if (i >= 0) { v = v.slice(0, i); cut = true; }
    v = v.replace(/【[^】]*】/g, '').replace(/【[^】]*$/, '');
    return cut ? v.replace(/\s+$/, '') : v;
  }

  async function streamOnce(model, messages, signal, onText, opts) {
    const web = !!opts.web;
    const body = {
      model, messages, stream: !web, temperature: 0.8,
      max_completion_tokens: opts.voice ? 500 : 1500,
      include_reasoning: false,
      reasoning_effort: (opts.voice || web) ? 'low' : 'medium'
    };
    if (web) { body.tools = [{ type: 'browser_search' }]; body.tool_choice = 'auto'; }
    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(API + '/chat/completions', {
        method: 'POST', signal, headers: authHeaders(), body: JSON.stringify(body)
      });
      if (res.ok) break;
      const err = await httpError(res);
      if (err.status === 400 || err.status === 422) {
        if ('reasoning_effort' in body && /reasoning/i.test(err.message)) {
          delete body.include_reasoning;
          delete body.reasoning_effort;
          continue;
        }
        if (body.tools && /tool|browser|search/i.test(err.message)) {
          delete body.tools;
          delete body.tool_choice;
          body.stream = true;
          opts.webFailed = true;
          continue;
        }
      }
      throw err;
    }

    if (!body.stream) {                       // recherche web : réponse complète d'un coup
      const j = await res.json();
      const text = j.choices?.[0]?.message?.content || '';
      if (!text.trim()) throw new Error('Réponse vide, réessaie.');
      onText(text);
      return text;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', full = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let j;
        try { j = JSON.parse(payload); } catch { continue; }
        if (j.error) throw new ApiError(500, j.error.message || 'Erreur du serveur');
        const piece = j.choices?.[0]?.delta?.content;
        if (piece) { full += piece; onText(full); }
      }
    }
    if (!full.trim()) throw new Error('Réponse vide, réessaie.');
    return full;
  }

  async function generate(messages, signal, onText, opts) {
    if (settings.model === 'auto' && !settings.resolved) await ensureModels(false);
    const queue = modelQueue();
    let lastErr = null;
    for (const model of queue) {
      try {
        const full = await streamOnce(model, messages, signal, onText, opts);
        if (settings.model !== 'auto' && settings.model !== model) {
          toast('Modèle indisponible, j\'utilise ' + model);
          settings.model = 'auto';
        }
        if (settings.resolved !== model) { settings.resolved = model; saveSettings(); }
        return full;
      } catch (e) {
        if (retriable(e)) { lastErr = e; continue; }
        throw e;
      }
    }
    throw lastErr || new Error('Aucun modèle GPT disponible avec cette clé.');
  }

  function waitText(msg) {
    const m = /try again in\s+([\d.]+)\s*(ms|s|m)/i.exec(msg || '');
    if (!m) return '';
    let s = parseFloat(m[1]);
    if (m[2].toLowerCase() === 'ms') s /= 1000;
    if (m[2].toLowerCase() === 'm') s *= 60;
    return ' (environ ' + Math.max(1, Math.ceil(s)) + ' s)';
  }

  function friendlyError(e) {
    const m = String(e.message || e);
    if (e instanceof ApiError) {
      if (e.status === 401) return 'Clé refusée par Groq. Vérifie-la dans les réglages.';
      if (e.status === 403) return 'Accès refusé par Groq. Vérifie ta clé et ton compte.';
      if (e.status === 429) return 'Limite Groq atteinte, réessaie dans un instant' + waitText(m) + '.';
      if (e.status === 413) return 'Conversation trop longue pour la limite de Groq. Démarre une nouvelle conversation ou désactive des leçons.';
      if (e.status >= 500) return 'Groq ne répond pas pour le moment, réessaie.';
    }
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Pas de connexion internet.';
    return m;
  }

  const keyProblem = (e) => e instanceof ApiError && (e.status === 401 || e.status === 403);

  /* ================= Envoi ================= */
  function setBusy(b) {
    busy = b;
    refreshState();
    updateAct();
  }

  async function send(raw, opts = {}) {
    const text = (raw || '').trim();
    if (!text || busy) return;
    if (!settings.apiKey) {
      toast('Ajoute ta clé Groq pour commencer');
      openSettings();
      return;
    }
    tts.stop();
    input.value = '';
    autosize();

    const tm = TEACH.exec(text);
    if (tm) {
      const body = tm[1].trim();
      addLesson(body.replace(/\s+/g, ' ').slice(0, 42) + (body.length > 42 ? '…' : ''), body);
      toast('Appris ✓');
    }

    convo.push({ role: 'user', text });
    const userUi = addMsg('user', text);
    const bot = addMsg('model', '', { typing: true });
    setBusy(true);
    controller = new AbortController();
    const talk = !!(opts.voice || settings.speak);
    const speaker = makeSpeaker();
    const web = !!(settings.web || WEB_TRIGGER.test(text));
    const gopts = Object.assign({}, opts, { web });
    let partial = '';
    if (voiceOn) setCaption(web ? 'Je cherche sur le web…' : '', web ? 'ai' : '');

    try {
      await coreReady;
      const raw = await generate(buildMessages(!!opts.voice, web), controller.signal, (t) => {
        const v = visible(t);
        partial = v;
        bot.set(v);
        scrollDown();
        if (talk) { try { speaker.feed(v, false); } catch { /* voix indisponible */ } }
      }, gopts);

      // Apprentissage : balises ⟦retenir: titre | contenu⟧ écrites par l'IA en fin de réponse
      let learned = 0;
      for (const m of raw.matchAll(TAG_RETENIR)) { if (learnAuto(m[1], m[2])) learned++; }
      const shown = visible(raw).trim() || (learned ? 'Retenu.' : '');
      if (!shown) throw new Error('Réponse vide, réessaie.');

      convo.push({ role: 'model', text: shown });
      persist();
      bot.done(shown);
      scrollDown();
      if (learned) toast('Retenu ✓');
      else if (gopts.webFailed) toast('Recherche web indisponible : réponse sans recherche');
      if (talk) {
        try { speaker.feed(shown, true); } catch { /* voix indisponible */ }
        if (voiceOn) tts.whenIdle(() => { if (voiceOn && !busy) setTimeout(listen, 300); });
      }
    } catch (e) {
      tts.stop();
      if (e.name === 'AbortError') {
        if (partial) { convo.push({ role: 'model', text: partial }); persist(); bot.done(partial); }
        else {
          convo.pop(); bot.el.remove(); userUi.el.remove(); updateStage();
          if (!opts.voice) { input.value = text; autosize(); }
        }
      } else {
        convo.pop();
        userUi.el.remove();
        bot.el.remove();
        const msg = friendlyError(e);
        addMsg('model', msg, { error: true });
        if (voiceOn) { setCaption(msg, 'err'); voicePaused = true; }
        else { input.value = text; autosize(); }
        if (keyProblem(e)) setTimeout(() => { if (voiceOn) exitVoice(); openSettings(); }, 600);
      }
    } finally {
      controller = null;
      setBusy(false);
      updateAct();
    }
  }

  /* ================= Saisie ================= */
  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  }

  function updateAct() {
    const mode = busy ? 'stop' : input.value.trim() ? 'send' : 'voice';
    btnAct.dataset.mode = mode;
    $('#icoVoice').hidden = mode !== 'voice';
    $('#icoSend').hidden = mode !== 'send';
    $('#icoStop').hidden = mode !== 'stop';
  }

  input.addEventListener('input', () => { autosize(); updateAct(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
      e.preventDefault();
      tts.unlock();
      send(input.value);
    }
  });

  btnAct.addEventListener('click', () => {
    const mode = btnAct.dataset.mode;
    if (mode === 'stop') { if (controller) controller.abort(); }
    else if (mode === 'send') { tts.unlock(); send(input.value); }
    else enterVoice();
  });

  $('#btnNew').addEventListener('click', () => {
    if (busy && controller) controller.abort();
    tts.stop();
    convo = [];
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
    const ids = rankModels(Array.from(new Set([...settings.models, ...PREFERRED])));
    if (settings.model !== 'auto' && !ids.includes(settings.model)) ids.push(settings.model);
    ids.forEach((id) => {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = id;
      sel.appendChild(o);
    });
    sel.value = settings.model;
  }

  function fillVoices() {
    const sel = $('#setVoice');
    const fr = tts.voices().filter(v => (v.lang || '').toLowerCase().startsWith('fr'));
    $('#voiceField').hidden = !fr.length;
    sel.innerHTML = '';
    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = 'Auto (la meilleure)';
    sel.appendChild(auto);
    fr.forEach((v) => {
      const o = document.createElement('option');
      o.value = v.voiceURI || v.name;
      o.textContent = v.name;
      sel.appendChild(o);
    });
    sel.value = settings.voice;
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
    $('#setWeb').checked = settings.web;
    fillModels();
    fillVoices();
    buildSwatches();
    if (!dlg.open) dlg.showModal();
    if (settings.apiKey && !settings.models.length) ensureModels(true).then(fillModels);
  }

  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnCancel').addEventListener('click', () => dlg.close());
  $('#settingsForm').addEventListener('submit', async () => {
    const newKey = $('#setKey').value.trim();
    const keyChanged = newKey !== settings.apiKey;
    if (keyChanged) { settings.models = []; settings.resolved = ''; settings.model = 'auto'; }
    else settings.model = $('#setModel').value || 'auto';
    settings.apiKey = newKey;
    settings.name = $('#setName').value.trim();
    settings.persona = $('#setPersona').value.trim();
    settings.speak = $('#setSpeak').checked;
    settings.web = $('#setWeb').checked;
    settings.voice = $('#setVoice').value;
    saveSettings();
    updateGreeting();
    if (!newKey) { toast('Enregistré ✓'); return; }
    if (!/^gsk_/.test(newKey)) { toast('Une clé Groq commence par gsk_'); return; }
    if (keyChanged) {
      const r = await ensureModels(true);
      toast(r.ok ? 'Connecté à Groq ✓' : r.status === 401 ? 'Clé refusée par Groq' : 'Enregistré (Groq injoignable pour le moment)');
    } else toast('Enregistré ✓');
  });
  $('#btnWipe').addEventListener('click', () => {
    if (!confirm('Effacer toute la conversation ?')) return;
    convo = [];
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

  // Lien de configuration : https://ton-site/#key=gsk_...  (la clé reste sur l'appareil, jamais dans le dépôt)
  let linked = false;
  const km = /[#&]key=([^&]+)/.exec(location.hash);
  if (km) {
    try {
      const k = decodeURIComponent(km[1]).trim();
      if (k && k !== settings.apiKey) {
        settings.apiKey = k;
        settings.models = [];
        settings.resolved = '';
        settings.model = 'auto';
        saveSettings();
        linked = true;
      }
    } catch { /* ignore */ }
    try { window.history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }
  }

  coreReady = loadCore();
  $('#coreTxt').addEventListener('click', async () => {
    coreReady = loadCore();
    const c = await coreReady;
    toast(c.state === 'ok' ? 'Noyau rechargé ✓' : c.state === 'cut' ? 'Noyau rechargé, mais trop long : coupé'
      : c.state === 'cache' ? 'Hors-ligne : copie gardée' : 'Noyau introuvable (noyau.md)');
  });

  applyAccent(settings.accent);
  updateGreeting();
  renderHistory();
  autosize();
  updateAct();
  refreshState();
  if (!settings.apiKey) setTimeout(openSettings, 900);
  else ensureModels(linked).then((r) => { if (linked) toast(r.ok ? 'Connecté à Groq ✓' : 'Clé enregistrée'); });
})();
