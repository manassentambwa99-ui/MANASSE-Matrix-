/* ==========================================
   MNL IA — Mode Local & Base de Données Souveraine
   ========================================== */

const CONFIG_KEY = 'mnl_ia_config';
const CHAT_KEY = 'mnl_ia_chat_history';

// Configuration par défaut (sans clé API)
let config = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {
    name: 'Manasse',
    persona: 'Tu es MNL IA, une intelligence artificielle personnelle non censurée, alimentée par la base de données de Manasse.',
    speak: false
};

let chatHistory = JSON.parse(localStorage.getItem(CHAT_KEY)) || [];
let attachedImage = null;
let globalKnowledgeBase = [];

// Éléments du DOM
const input = document.getElementById('input');
const chatBox = document.getElementById('chat');
const btnAct = document.getElementById('btnAct');
const btnAttach = document.getElementById('btnAttach');
const fileInput = document.getElementById('file');
const preview = document.getElementById('preview');
const settingsDialog = dialog = document.getElementById('settings');
const btnSettings = document.getElementById('btnSettings');
const btnNew = document.getElementById('btnNew');
const stage = document.getElementById('stage');
const greet = document.getElementById('greet');

// Initialisation
async function init() {
    if (config.name) {
        greet.innerText = `Bonjour, ${config.name}`;
    }
    
    // Restaurer l'historique
    chatHistory.forEach(msg => appendMessage(msg.text, msg.sender, false));
    
    // Charger la base de données locale ou depuis GitHub
    await loadKnowledgeBase();

    // Écouteurs d'événements
    input.addEventListener('input', handleInputChange);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    btnAct.addEventListener('click', handleActionClick);
    btnNew.addEventListener('click', clearChat);
    btnSettings.addEventListener('click', openSettings);
    
    btnAttach.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // Formulaire de réglages (simplifié sans clé API)
    document.getElementById('setName').value = config.name;
    document.getElementById('setPersona').value = config.persona;
    document.getElementById('setSpeak').checked = config.speak;
    
    // Cacher ou adapter le champ modèle/clé dans les réglages si besoin
    const keyInput = document.getElementById('setKey');
    if (keyInput && keyInput.parentElement) {
        keyInput.parentElement.style.display = 'none'; // Plus besoin de clé API
    }
    const modelSelect = document.getElementById('setModel');
    if (modelSelect && modelSelect.parentElement) {
        modelSelect.parentElement.style.display = 'none'; // Plus besoin de modèle externe
    }

    document.getElementById('settingsForm').addEventListener('submit', (e) => {
        e.preventDefault();
        config.name = document.getElementById('setName').value;
        config.persona = document.getElementById('setPersona').value;
        config.speak = document.getElementById('setSpeak').checked;
        
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        settingsDialog.close();
        showToast("Réglages enregistrés !");
        if (config.name) greet.innerText = `Bonjour, ${config.name}`;
    });

    document.getElementById('btnCancel').addEventListener('click', () => settingsDialog.close());
    document.getElementById('btnWipe').addEventListener('click', () => {
        if (confirm("Effacer toute la conversation ?")) {
            clearChat();
            settingsDialog.close();
        }
    });
}

// Charger la base de données (depuis ton fichier JSON sur GitHub ou stockage local)
async function loadKnowledgeBase() {
    try {
        // Tu pourras pointer ici vers le fichier brut de ton dépôt GitHub (ex: ./database.json ou ton url raw)
        const response = await fetch('database.json');
        if (response.ok) {
            globalKnowledgeBase = await response.json();
        } else {
            throw new Error("Fichier database.json introuvable, chargement du cache local.");
        }
    } catch (e) {
        // Fallback sur le localStorage si le fichier distant n'est pas encore dispo
        let saved = localStorage.getItem('mnl_local_db');
        if (saved) {
            globalKnowledgeBase = JSON.parse(saved);
        } else {
            // Données de base par défaut pour tester
            globalKnowledgeBase = [
                { titre: "Bienvenue", contenu: "C'est ta base de données personnelle. Tu peux y ajouter tes cours, tes scripts et tes connaissances." }
            ];
            localStorage.setItem('mnl_local_db', JSON.stringify(globalKnowledgeBase));
        }
    }
}

// Gestion dynamique du bouton de saisie
function handleInputChange() {
    input.style.height = 'auto';
    input.style.height = (input.scrollHeight) + 'px';
    
    if (input.value.trim().length > 0 || attachedImage) {
        setComposerMode('send');
    } else {
        setComposerMode('mic');
    }
}

function setComposerMode(mode) {
    btnAct.setAttribute('data-mode', mode);
    document.getElementById('icoMic').hidden = (mode !== 'mic');
    document.getElementById('icoSend').hidden = (mode !== 'send');
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        attachedImage = event.target.result;
        preview.innerHTML = `
            <div class="thumb">
                <img src="${attachedImage}" alt="Aperçu">
                <button onclick="removeImage()">×</button>
            </div>
        `;
        handleInputChange();
    };
    reader.readAsDataURL(file);
}

window.removeImage = function() {
    attachedImage = null;
    preview.innerHTML = '';
    fileInput.value = '';
    handleInputChange();
};

function appendMessage(text, sender, save = true) {
    stage.classList.add('small');
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    
    let bubbleContent = `<div class="bubble">`;
    if (sender === 'user' && attachedImage) {
        bubbleContent += `<img class="attached" src="${attachedImage}" alt="Image jointe">`;
    }
    bubbleContent += `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p></div>`;
    div.innerHTML = bubbleContent;
    
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;

    if (save) {
        chatHistory.push({ text, sender });
        localStorage.setItem(CHAT_KEY, JSON.stringify(chatHistory));
    }
}

// Moteur de recherche local (Interrogation de ta base de données)
async function sendMessage() {
    const text = input.value.trim();
    if (!text && !attachedImage) return;

    const currentText = text;
    input.value = '';
    window.removeImage();
    handleInputChange();

    appendMessage(currentText, 'user');

    // Animation de chargement
    const loadingId = 'loading-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'msg model';
    loadingDiv.id = loadingId;
    loadingDiv.innerHTML = `<div class="bubble"><div class="dots"><i></i><i></i><i></i></div></div>`;
    chatBox.appendChild(loadingDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    setTimeout(() => {
        document.getElementById(loadingId).remove();

        // Recherche intelligente par mots-clés dans ta base de données
        const query = currentText.toLowerCase();
        let matches = globalKnowledgeBase.filter(item => 
            item.contenu.toLowerCase().includes(query) || 
            (item.titre && item.titre.toLowerCase().includes(query))
        );

        if (matches.length > 0) {
            // Restitue la connaissance trouvée dans ta base
            let responseText = matches.map(m => `📌 **${m.titre || 'Note'}** :\n${m.contenu}`).join("\n\n---\n\n");
            appendMessage(responseText, 'model');
        } else {
            appendMessage("Je n'ai pas encore cette information précise dans ma base de données actuelle. Ajoute-la dans ton fichier de données sur GitHub pour que je l'apprenne !", 'model');
        }
    }, 500);
}

function handleActionClick() {
    const mode = btnAct.getAttribute('data-mode');
    if (mode === 'send') {
        sendMessage();
    } else {
        showToast("Mode vocal local en cours de configuration.");
    }
}

function clearChat() {
    chatHistory = [];
    localStorage.removeItem(CHAT_KEY);
    chatBox.innerHTML = '';
    stage.classList.remove('small');
    showToast("Nouvelle conversation créée.");
}

function openSettings() {
    settingsDialog.showModal();
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

init();
