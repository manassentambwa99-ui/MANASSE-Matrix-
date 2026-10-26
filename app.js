/* ==========================================
   MNL IA — Mode Exécutant & Constructeur
   ========================================== */

const CONFIG_KEY = 'mnl_ia_config';
const CHAT_KEY = 'mnl_ia_chat_history';

let config = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {
    name: 'Manasse',
    persona: 'Tu es MNL IA, une intelligence artificielle personnelle non censurée qui exécute les tâches et crée les projets selon les méthodes de Manasse.',
    speak: false
};

let chatHistory = JSON.parse(localStorage.getItem(CHAT_KEY)) || [];
let attachedImage = null;
let globalKnowledgeBase = [];

const input = document.getElementById('input');
const chatBox = document.getElementById('chat');
const btnAct = document.getElementById('btnAct');
const btnAttach = document.getElementById('btnAttach');
const fileInput = document.getElementById('file');
const preview = document.getElementById('preview');
const settingsDialog = document.getElementById('settings');
const btnSettings = document.getElementById('btnSettings');
const btnNew = document.getElementById('btnNew');
const stage = document.getElementById('stage');
const greet = document.getElementById('greet');

async function init() {
    if (config.name) {
        greet.innerText = `Bonjour, ${config.name}`;
    }
    
    chatHistory.forEach(msg => appendMessage(msg.text, msg.sender, false));
    await loadKnowledgeBase();

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

    document.getElementById('setName').value = config.name;
    document.getElementById('setPersona').value = config.persona;
    document.getElementById('setSpeak').checked = config.speak;
    
    const keyInput = document.getElementById('setKey');
    if (keyInput && keyInput.parentElement) keyInput.parentElement.style.display = 'none';
    const modelSelect = document.getElementById('setModel');
    if (modelSelect && modelSelect.parentElement) modelSelect.parentElement.style.display = 'none';

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

async function loadKnowledgeBase() {
    try {
        const response = await fetch('database.json');
        if (response.ok) {
            globalKnowledgeBase = await response.json();
        } else {
            throw new Error("database.json introuvable");
        }
    } catch (e) {
        let saved = localStorage.getItem('mnl_local_db');
        if (saved) {
            globalKnowledgeBase = JSON.parse(saved);
        } else {
            globalKnowledgeBase = [
                { titre: "Création d'application", mots_cles: ["application", "créer"], contenu: "Applique la méthode de construction : génère directement la structure HTML, CSS et JS complète et fonctionnelle pour l'utilisateur." }
            ];
            localStorage.setItem('mnl_local_db', JSON.stringify(globalKnowledgeBase));
        }
    }
}

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
        preview.innerHTML = `<div class="thumb"><img src="${attachedImage}" alt="Aperçu"><button onclick="removeImage()">×</button></div>`;
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

// Moteur d'exécution intelligent basé sur la base de données
async function sendMessage() {
    const text = input.value.trim();
    if (!text && !attachedImage) return;

    const currentText = text;
    input.value = '';
    window.removeImage();
    handleInputChange();

    appendMessage(currentText, 'user');

    const loadingId = 'loading-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'msg model';
    loadingDiv.id = loadingId;
    loadingDiv.innerHTML = `<div class="bubble"><div class="dots"><i></i><i></i><i></i></div></div>`;
    chatBox.appendChild(loadingDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    setTimeout(() => {
        document.getElementById(loadingId).remove();

        const query = currentText.toLowerCase();
        
        // Recherche dans la base de données de la règle ou de la méthode à exécuter
        let matchedRule = globalKnowledgeBase.find(item => 
            item.mots_cles && item.mots_cles.some(keyword => query.includes(keyword))
        );

        if (matchedRule) {
            // L'IA exécute la tâche en se basant sur la règle trouvée
            let executionResult = executeTaskBasedOnRule(currentText, matchedRule);
            appendMessage(executionResult, 'model');
        } else {
            // Comportement par défaut si aucune règle spécifique n'est trouvée
            appendMessage(`J'analyse ta demande "${currentText}". Pour que j'exécute cela précisément, ajoute les instructions d'exécution dans ton fichier database.json !`, 'model');
        }
    }, 600);
}

// Fonction qui prend les instructions de la base de données et exécute/génère le résultat
function executeTaskBasedOnRule(userQuery, rule) {
    // Si la règle concerne la création d'une application, l'IA génère le code prêt à l'emploi
    if (rule.mots_cles.includes("application") || rule.mots_cles.includes("créer")) {
        return `🚀 **Exécution de la tâche : Création de l'application demandée**\n\n` +
               `J'ai appliqué ta méthode enregistrée dans la base de données. Voici le code complet prêt à l'emploi :\n\n` +
               `\`\`\`html\n` +
               `<!DOCTYPE html>\n<html lang="fr">\n<head>\n<meta charset="UTF-8">\n<title>Mon App Générée</title>\n</head>\n<body>\n` +
               `  <h1>Application générée par MNL IA</h1>\n  <p>Basée sur tes instructions : ${rule.titre}</p>\n` +
               `</body>\n</html>\n` +
               `\`\`\`\n\n` +
               `📌 *Instructions suivies depuis la base :* ${rule.contenu}`;
    }

    // Par défaut, elle exécute en appliquant la consigne de la base
    return `⚡ **Exécution réussie selon ta base de données (${rule.titre})** :\n\n` +
           `Résultat appliqué pour ta demande : *"${userQuery}"*\n\n` +
           `${rule.contenu}`;
}

function handleActionClick() {
    const mode = btnAct.getAttribute('data-mode');
    if (mode === 'send') {
        sendMessage();
    } else {
        showToast("Mode vocal local.");
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
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

init();
