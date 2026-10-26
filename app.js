/* MNL IA — PWA propulsée par Google Gemini */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const chat = $('#chat'), input = $('#input'), welcome = $('#welcome');
  const btnSend = $('#btnSend'), btnMic = $('#btnMic'), btnAttach = $('#btnAttach');
  const fileInput = $('#file'), preview = $('#preview');
  const dlg = $('#settings'), statusEl = $('#status'), logoOrb = $('#logoOrb');

  /* ---------- Stockage ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  };

  let settings = Object.assign(
    { apiKey: '', model: 'gemini-2.5-flash', speak: false, persona: '' },
    store.get('mnl_settings', {})
  );
  let history = store.get('mnl_history', []);   // [{role:'user'|'model', text}]
  let pendingImage = null;                      // {url, data, mime}
  let controller = null;
  let busy = false;

  const persist = () => store.set('mnl_history', history.slice(-100));

  /* ---------- Utilitaires ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
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

  /* ---------- Messages ---------- */
  function addMsg(role, text, opts = {}) {
    welcome.hidden = true;
    const el = document.createElement('div');
    el.className = 'msg ' + role + (opts.error ? ' error' : '');
    if (role === 'model') {
      const o = document.createElement('div');
      o.className = 'orb mini';
      el.appendChild(o);
    }
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    el.appendChild(bubble);

    if (role === 'user') {
      if (opts.image) {
        const im = document.createElement('img');
        im.className = 'attached';
        im.src = opts.image;
        im.alt = 'Image jointe';
        bubble.appendChild(im);
      }
      bubble.appendChild(document.createTextNode(text));
    } else if (opts.typing) {
      bubble.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    } else {
      bubble.innerHTML = md(text);
      addTools(bubble, text);
    }
    chat.appendChild(el);
    scrollDown();

    return {
      el,
      set(t) { bubble.innerHTML = md(t); },
      done(t) { bubble.innerHTML = md(t); addTools(bubble, t); }
    };
  }

  function addTools(bubble, text) {
    const bar = document.createElement('div');
    bar.className = 'tools';
    const c = document.createElement('button');
    c.textContent = 'Copier';
    c.onclick = () => copy(text);
    const s = document.createElement('button');
    s.textContent = 'Lire';
    s.onclick = () => speak(text);
    bar.append(c, s);
    bubble.appendChild(bar);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copié ✓'); }
    catch { toast('Copie impossible'); }
  }

  chat.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (b) copy(b.parentElement.querySelector('code').innerText);
  });

  function renderHistory() {
    chat.querySelectorAll('.msg').forEach(n => n.remove());
    welcome.hidden = history.length > 0;
    history.forEach(m => addMsg(m.role, m.text));
    scrollDown();
  }

  /* ---------- Voix ---------- */
  function speak(text) {
    if (!('speechSynthesis' in window)) return toast('Lecture vocale non disponible');
    speechSynthesis.cancel();
    const clean = text.replace(/```[\s\S]*?```/g, ' ').replace(/[*#`_>\[\]]/g, '');
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'fr-FR';
    speechSynthesis.speak(u);
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false;
  if (!SR) btnMic.hidden = true;
  btnMic.addEventListener('click', () => {
    if (!SR) return;
    if (listening) { rec.stop(); return; }
    rec = new SR();
    rec.lang = 'fr-FR';
    rec.interimResults = true;
    rec.continuous = false;
    const base = input.value;
    rec.onresult = (e) => {
      let t = '';
      for (const r of e.results) t += r[0].transcript;
      input.value = (base + ' ' + t).trim();
      autosize();
    };
    rec.onend = () => { listening = false; btnMic.classList.remove('on'); };
    rec.onerror = () => { listening = false; btnMic.classList.remove('on'); toast('Micro indisponible'); };
    rec.start();
    listening = true;
    btnMic.classList.add('on');
  });

  /* ---------- Image ---------- */
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
  }

  btnAttach.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      pendingImage = await shrink(f);
      preview.innerHTML = '<div class="thumb"><img alt="Aperçu"><button type="button" aria-label="Retirer">×</button></div>';
      preview.querySelector('img').src = pendingImage.url;
      preview.querySelector('button').onclick = clearImage;
    } catch { toast("Impossible de lire l'image"); }
  });

  /* ---------- Gemini ---------- */
  function systemPrompt() {
    const date = new Date().toLocaleDateString('fr-FR', { dateStyle: 'full' });
    return "Tu es MNL IA, un assistant élégant, chaleureux et très compétent. " +
      "Tu réponds dans la langue de l'utilisateur (français par défaut), de façon claire, structurée et utile. " +
      "Tu utilises le Markdown (listes, titres, blocs de code) quand cela aide. " +
      "Si on te demande qui tu es, tu réponds que tu es MNL IA, une intelligence artificielle. " +
      "Date du jour : " + date + "." +
      (settings.persona ? "\n\nInstructions de l'utilisateur : " + settings.persona : '');
  }

  function friendlyError(e) {
    const m = String(e.message || e);
    if (/API key|API_KEY|HTTP 400.*key|HTTP 403/i.test(m)) return "Clé API refusée. Vérifie-la dans les réglages (⚙).";
    if (/HTTP 429/.test(m)) return "Quota atteint pour le moment. Réessaie dans un instant.";
    if (/HTTP 404/.test(m)) return "Modèle introuvable. Change le modèle dans les réglages (⚙).";
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Pas de connexion internet.";
    return "Oups : " + m;
  }

  async function streamGemini(contents, signal, onText) {
    const model = (settings.model || 'gemini-2.5-flash').trim();
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) + ':streamGenerateContent?alt=sse';
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt() }] },
        contents,
        generationConfig: { temperature: 0.9, topP: 0.95 }
      })
    });
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).error?.message || ''; } catch { /* ignore */ }
      throw new Error('HTTP ' + res.status + ' ' + msg);
    }
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

  function setBusy(b) {
    busy = b;
    $('#icoSend').hidden = b;
    $('#icoStop').hidden = !b;
    logoOrb.classList.toggle('think', b);
    statusEl.textContent = b ? 'MNL IA réfléchit…' : "Prête à t'aider";
  }

  async function send(raw) {
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

    const userMsg = { role: 'user', text: text || "Décris cette image." };
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
      const full = await streamGemini(contents, controller.signal, (t) => { partial = t; bot.set(t); scrollDown(); });
      history.push({ role: 'model', text: full });
      persist();
      bot.done(full);
      scrollDown();
      if (settings.speak) speak(full);
    } catch (e) {
      if (e.name === 'AbortError') {
        if (partial) { history.push({ role: 'model', text: partial }); persist(); bot.done(partial); }
        else { history.pop(); bot.el.remove(); userUi.el.remove(); input.value = userMsg.text; autosize(); }
      } else {
        history.pop();
        userUi.el.remove();
        bot.el.remove();
        input.value = userMsg.text;
        autosize();
        addMsg('model', friendlyError(e), { error: true });
        if (/clé|Clé/.test(friendlyError(e))) setTimeout(openSettings, 400);
      }
    } finally {
      setBusy(false);
      controller = null;
    }
  }

  /* ---------- Entrée ---------- */
  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
  }
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
      e.preventDefault();
      send(input.value);
    }
  });
  btnSend.addEventListener('click', () => {
    if (busy && controller) controller.abort();
    else send(input.value);
  });
  document.querySelectorAll('.chip').forEach(c =>
    c.addEventListener('click', () => send(c.dataset.q)));

  $('#btnNew').addEventListener('click', () => {
    if (busy && controller) controller.abort();
    speechSynthesis && speechSynthesis.cancel();
    history = [];
    persist();
    renderHistory();
    toast('Nouvelle discussion');
  });

  /* ---------- Réglages ---------- */
  function openSettings() {
    $('#setKey').value = settings.apiKey;
    $('#setModel').value = settings.model;
    $('#setPersona').value = settings.persona;
    $('#setSpeak').checked = settings.speak;
    if (!dlg.open) dlg.showModal();
  }
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnCancel').addEventListener('click', () => dlg.close());
  $('#settingsForm').addEventListener('submit', () => {
    settings = {
      apiKey: $('#setKey').value.trim(),
      model: $('#setModel').value.trim() || 'gemini-2.5-flash',
      persona: $('#setPersona').value.trim(),
      speak: $('#setSpeak').checked
    };
    store.set('mnl_settings', settings);
    toast('Réglages enregistrés ✓');
  });
  $('#btnWipe').addEventListener('click', () => {
    if (!confirm("Effacer tout l'historique de discussion ?")) return;
    history = [];
    store.del('mnl_history');
    renderHistory();
    dlg.close();
  });

  /* ---------- Installation PWA ---------- */
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
  window.addEventListener('appinstalled', () => { $('#btnInstall').hidden = true; toast('MNL IA installée 🎉'); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  /* ---------- Démarrage ---------- */
  const h = new Date().getHours();
  $('#greet').textContent = h < 5 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir';
  renderHistory();
  autosize();
  if (!settings.apiKey) setTimeout(() => { toast('Bienvenue ! Ajoute ta clé Gemini'); openSettings(); }, 700);
})();
