# MNL IA ✨

Assistant IA installable (PWA) propulsé par Google Gemini. Interface animée, réponses en direct, voix, images, hors-ligne pour l'interface.

## Fichiers (tous à la racine du dépôt)

- `index.html`
- `style.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `icon-192.png`
- `icon-512.png`
- `icon-maskable-512.png`
- `README.md`

## Mettre en ligne avec GitHub Pages

1. Crée un dépôt GitHub et ajoute tous les fichiers ci-dessus à la racine.
2. Va dans **Settings → Pages**.
3. Source : **Deploy from a branch**, branche **main**, dossier **/ (root)**, puis **Save**.
4. Après 1 à 2 minutes, ton app est sur `https://TON-PSEUDO.github.io/NOM-DU-DEPOT/`.
5. Ouvre ce lien sur ton téléphone, puis installe l'app :
   - Android : menu ⋮ → **Installer l'application**
   - iPhone : **Partager → Sur l'écran d'accueil**

## Clé API Gemini

Au premier lancement, ouvre **⚙ Réglages** et colle ta clé Gemini
(création gratuite sur https://aistudio.google.com/apikey).

La clé est enregistrée uniquement dans ton navigateur (localStorage). Elle n'est **pas** écrite dans le code,
sinon n'importe qui pourrait la copier depuis ton dépôt public et épuiser ton quota.

## Personnaliser

- Nom, ton et personnalité : fonction `systemPrompt()` dans `app.js`, ou champ « Personnalité » dans les réglages.
- Couleurs : variables `--a`, `--b`, `--c` en haut de `style.css`.
- Modèle : champ « Modèle » dans les réglages (par défaut `gemini-2.5-flash`).
