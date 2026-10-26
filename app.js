(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const app = $('#app'), stage = $('#stage'), chat = $('#chat'), input = $('#input');
  const btnAct = $('#btnAct'), btnAttach = $('#btnAttach');
  const fileInput = $('#file'), preview = $('#preview'), dlg = $('#settings');

  const API = 'https://api.groq.com/openai/v1/chat/completions';
  
  // Modèles Groq mis à jour selon ton panneau (GPT OSS / Qwen)
  const FALLBACK_MODELS = [
    'gpt-oss-120b',
    'gpt-oss-20b',
    'qwen-3.8-27b',
    'llama-3.3-70b-versatile'
  ];

  const ACCENTS = {
    violet: { a: [139, 92, 246], b: [34, 211, 238] },
    cyan:   { a: [34, 211, 238], b: [59, 130, 246] },
    vert:   { a: [52, 211, 153], b: [34, 211, 238] },
    flamme: { a: [249, 115, 22], b: [236, 72, 153] },
    or:     { a: [251, 191, 36], b: [249, 115, 22] }
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} }
  };

  let settings = Object.assign(
    { apiKey: '', model: 'gpt-oss-120b', name: '', accent: 'violet', speak: false, persona: '', customKnowledge: '' },
    store.get('mnl_settings', {})
  );
  const saveSettings = () => store.set('mnl_settings', settings);

  let history = store.get('mnl_history', []);
  const persist = () => store.set('mnl_history', history.slice(-100));

  let controller = null;
  let busy = false, listening = false, speaking = false;

  // Orbe holographique
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

      let g = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, m / 2);
      g.addColorStop(0, rgba(col.a, 0.3 + 0.25 * energy));
      g.addColorStop(0.5, rgba(col.b, 0.08 + 0.08 * energy));
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

      ctx.lineWidth = 1;
      for (let i = 0; i < 2; i++) {
        ctx.strokeStyle = rgba(i ? col.b : col.a, 0.35);
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * (1.28 + i * 0.12), R * (0.42 + i * 0.1), t * (i ? -0.35 : 0.28) + i, 0, TAU);
        ctx.stroke();
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

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const md = (src) => esc(src).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

  const scrollDown = () => { chat.scrollTop = chat.scrollHeight; };
  const updateStage = () => stage.classList.toggle('small', chat.querySelector('.msg') !== null);

  function addMsg(role, text, opts = {}) {
    const el = document.createElement('div');
    el.className = 'msg ' + role + (opts.error ? ' error' : '');
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    el.appendChild(bubble);

    if (opts.typing) {
      bubble.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    } else {
      bubble.innerHTML = md(text);
    }
    chat.appendChild(el);
    updateStage();
    scrollDown();
    return { el, set(t) { bubble.innerHTML = md(t); }, done(t) { bubble.innerHTML = md(t); } };
  }

  function renderHistory() {
    chat.querySelectorAll('.msg').forEach(n => n.remove());
    history.forEach(m => addMsg(m.role, m.text));
    updateStage();
    scrollDown();
  }

  function systemPrompt() {
    let prompt = "Tu es MNL IA, un assistant personnel intelligent, souverain et ultra-rapide. " +
      (settings.name ? "L'utilisateur s'appelle " + settings.name + ". " : "") +
      (settings.persona ? "Personnalité : " + settings.persona + " " : "");
    
    if (settings.customKnowledge) {
      prompt += "\n\n[INSTRUCTIONS CRITIQUES ET BASE DE DONNÉES PRIVÉE DE L'UTILISATEUR] :\n" +
                "Utilise en priorité absolue les informations ci-dessous pour répondre aux questions, même si le modèle public hésite ou n'a pas l'information :\n" + 
                settings.customKnowledge;
    }
    return prompt;
  }

  async function streamWithFallback(messages, signal, onText) {
    const modelsToTry = [settings.model, ...FALLBACK_MODELS.filter(m => m !== settings.model)];
    
    let lastError = null;
    for (const currentModel of modelsToTry) {
      try {
        const res = await fetch(API, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + settings.apiKey
          },
          body: JSON.stringify({
            model: currentModel,
            messages: messages,
            temperature: 0.7,
            stream: true
          })
        });

        if (!res.ok) {
          throw new Error('Erreur HTTP ' + res.status);
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
            if (payload === '[DONE]') break;
            try {
              const j = JSON.parse(payload);
              const token = j.choices?.[0]?.delta?.content;
              if (token) {
                full += token;
                onText(full);
              }
            } catch {}
          }
        }
        return full;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error("Modèles indisponibles.");
  }

  async function send(raw) {
    const text = (raw || '').trim();
    if (!text || busy) return;
    if (!settings.apiKey) {
      toast('Ajoute ta clé API Groq dans les réglages');
      openSettings();
      return;
    }
    input.value = '';

    history.push({ role: 'user', content: text });
    addMsg('user', text);
    const bot = addMsg('model', '', { typing: true });
    busy = true;
    refreshState();
    controller = new AbortController();
    let partial = '';

    try {
      const apiMessages = [
        { role: 'system', content: systemPrompt() },
        ...history.map(m => ({ role: m.role, content: m.content }))
      ];

      const full = await streamWithFallback(apiMessages, controller.signal, (t) => {
        partial = t;
        bot.set(t);
        scrollDown();
      });

      history.push({ role: 'assistant', content: full });
      persist();
      bot.done(full);
    } catch (e) {
      history.pop();
      bot.el.remove();
      if (settings.customKnowledge) {
        addMsg('model', "⚠️ Réseau ralenti, mais voici ce que j'ai trouvé dans tes données personnelles enregistrées :\n\n" + settings.customKnowledge, { error: false });
      } else {
        addMsg('model', 'Erreur : ' + (e.message || 'Vérifie ta clé API Groq.'), { error: true });
      }
    } finally {
      controller = null;
      busy = false;
      refreshState();
    }
  }

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  });

  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input.value);
    }
  });

  btnAct.addEventListener('click', () => {
    if (busy && controller) controller.abort();
    else send(input.value);
  });

  $('#btnNew').addEventListener('click', () => {
    history = [];
    store.del('mnl_history');
    renderHistory();
  });

  function openSettings() {
    $('#setName').value = settings.name;
    $('#setKey').value = settings.apiKey;
    $('#setModel').value = settings.model;
    $('#setPersona').value = settings.persona;
    $('#setCustomKnowledge').value = settings.customKnowledge || '';
    $('#setSpeak').checked = settings.speak;
    if (!dlg.open) dlg.showModal();
  }

  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnCancel').addEventListener('click', () => dlg.close());
  $('#settingsForm').addEventListener('submit', () => {
    settings.apiKey = $('#setKey').value.trim();
    settings.model = $('#setModel').value;
    settings.name = $('#setName').value.trim();
    settings.persona = $('#setPersona').value.trim();
    settings.customKnowledge = $('#setCustomKnowledge').value.trim();
    settings.speak = $('#setSpeak'].checked;
    saveSettings();
    toast('Réglages & Mémoire enregistrés ✓');
  });

  applyAccent(settings.accent);
  renderHistory();
  refreshState();
  if (!settings.apiKey) setTimeout(openSettings, 500);
})();
