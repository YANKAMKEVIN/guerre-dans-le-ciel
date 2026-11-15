# Guerre dans le Ciel

Jeu de combat aérien dans le navigateur (three.js) : un ange affronte trois vagues de démons au-dessus d'une vallée peinte, puis le grand dragon rouge à sept têtes d'Apocalypse 12.

> « Et il y eut guerre dans le ciel. Michel et ses anges combattirent contre le dragon. » Apocalypse 12:7

## Jouer

Le jeu est un site statique : `index.html` et ses fichiers à côté.

```bash
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000. Ouvrir `index.html` directement (`file://`) ne marche pas, car le navigateur bloque le chargement des modèles.

**Commandes** : souris ou ZQSD pour voler, clic ou Espace pour tirer, F ou clic droit pour le Jugement, E pour l'esquive, Maj pour accélérer, Échap pour la pause, M / N pour couper le son ou la musique. Sur écran tactile : joystick à gauche, boutons à droite.

## Contenu

- `index.html` : tout le jeu (rendu, combat, son et musique générés en code).
- `angel.json`, `demon.json` : maillages riggés (squelette et poids de peau) ; `dragon.json` : tête du Dragon. Leurs textures sont les fichiers `*-tex.png`.
- `valley.webp` : la vallée peinte qui sert de sol ; `keyart.webp` : l'image de référence, affichée à l'écran titre.
- `A-VALIDER.md` : la liste des points à valider en jouant.

Les modèles 3D ont été générés avec Higgsfield à partir d'images de référence, puis riggés par script.
