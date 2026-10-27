# MNL IA

Ton assistant personnel (PWA) : modèles GPT via Groq, orbe vivant, conversation vocale plein écran, un Atelier pour lui apprendre tes méthodes, et un **noyau** : l'algorithme qui dirige sa façon de penser, écrit en français et modifiable par toi.

## Fichiers (tous à la racine du dépôt)

`index.html` · `style.css` · `app.js` · `sw.js` · `manifest.webmanifest` · `noyau.md` · `icon-192.png` · `icon-512.png` · `icon-maskable-512.png` · `README.md`

## Mise en ligne (GitHub Pages)

1. Ajoute les fichiers à la racine du dépôt (remplace les anciens).
2. Settings → Pages → Deploy from a branch → `main` / `(root)` → Save.
3. Ouvre `https://TON-PSEUDO.github.io/NOM-DU-DEPOT/` puis installe l'app
   (Android : menu ⋮ → Installer · iPhone : Partager → Sur l'écran d'accueil).

## Clé Groq

La clé n'est jamais écrite dans le code (un dépôt public la ferait copier). Deux façons de l'ajouter :

- Réglages (icône en haut à droite) → champ « Clé Groq ».
- Lien magique, une seule fois par appareil : ouvre `https://TON-PSEUDO.github.io/NOM-DU-DEPOT/#key=TA_CLE`.
  La clé est enregistrée sur l'appareil puis retirée de l'adresse.

Modèles GPT : `openai/gpt-oss-120b` et `openai/gpt-oss-20b`, détectés automatiquement. Si l'un atteint sa limite, MNL IA bascule seul sur l'autre.

## Le noyau (`noyau.md`)

C'est le cerveau. À chaque message, l'IA reçoit ce texte et l'exécute dans l'ordre : comprendre, rappeler, doser, agir, vérifier, apprendre, anticiper.
Pour changer sa façon de penser, tu modifies ce fichier (en français, sur GitHub), tu enregistres, tu rouvres l'app. Rien à programmer.

- La ligne « Noyau » dans l'Atelier confirme qu'il est chargé (touche-la pour le recharger).
- Variables remplacées à chaque message : `{{prenom}}` `{{date}}` `{{heure}}` `{{mode}}` `{{echanges}}` `{{memoire}}` `{{recherche_web}}` `{{modele}}`.
- Une section dont le titre contient « (non envoyé) » reste pour toi et n'est jamais transmise.
- Limite : 5 000 caractères envoyés. Plus il est court, moins il consomme ta clé.
- Si `noyau.md` est absent, l'app marche avec une version de base.

## Atelier (icône ✦)

Tu lui enseignes une méthode : un titre (« quand je dis… ») et les étapes. Chaque leçon peut être activée ou coupée, modifiée en la touchant, ou oubliée.
Dans la conversation, « retiens que… » crée aussi une leçon.

MNL IA peut aussi retenir seul (corrections, préférences, projets en cours), selon les règles du noyau : c'est écrit « appris seul » dans l'Atelier, et tu peux tout modifier ou effacer.

## Recherche web

Réglages → « Toujours chercher sur le web », ou dis simplement « cherche sur le web… », « les actualités… ». Elle utilise la recherche intégrée de Groq pour les modèles GPT et consomme plus de ta limite.

## Voix

Touche l'orbe (ou le bouton ondes) : conversation plein écran. Il écoute, répond à voix haute phrase par phrase, puis réécoute tout seul.
Touche l'orbe pour l'interrompre, la croix pour quitter. Demande Chrome ou Edge (Android, ordinateur).
