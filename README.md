# Guerre dans le Ciel

Jeu de combat aérien dans le navigateur (three.js) : un ange affronte trois vagues de démons au-dessus d'une vallée peinte, puis le grand dragon rouge à sept têtes d'Apocalypse 12.

> « Et il y eut guerre dans le ciel. Michel et ses anges combattirent contre le dragon. » Apocalypse 12:7

## Jouer

- GitHub Pages (après la première CI verte sur `main`, une fois Pages activé, voir plus bas) : https://yankamkevin.github.io/guerre-dans-le-ciel/
- Ancienne version publiée (artifact claude.ai, version monolithique d'avant la migration) : https://claude.ai/artifact/KbZa9JpCU3RQqC14gcvtWM

**Commandes** : souris ou ZQSD pour voler, clic ou Espace pour tirer, F ou clic droit pour le Jugement, E pour l'esquive, Maj pour accélérer, Échap ou P pour la pause, M / N pour couper le son ou la musique. Sur écran tactile : joystick à gauche, boutons à droite.

Trois difficultés : Pèlerin, Gardien (par défaut, 20 % de dégâts en plus depuis le 21/11), Archange.

## Développer

Node 20 ou plus.

```bash
npm ci
npm run dev        # serveur de développement Vite
npm run check      # typecheck + lint + tests + bot + build (ce que la CI exige)
npm run e2e        # parcours Playwright sur le build (npm run build avant)
```

| Commande | Rôle |
|---|---|
| `npm run typecheck` | TypeScript strict (`strict`, `noUncheckedIndexedAccess`) |
| `npm run lint` | ESLint (typescript-eslint) ; la simulation n'a droit ni au DOM ni à `Math.random` |
| `npm test` | tests unitaires Vitest (`tests/unit`) |
| `npm run bot` | le pilote automatique joue des parties entières sans rendu, dans les trois difficultés (`tests/bot`) |
| `npm run build` | build de production dans `dist/` (chemins relatifs : marche à la racine comme en sous-dossier) |
| `npm run e2e` | Playwright, Chromium en WebGL logiciel : bureau et téléphone en paysage avec de vrais appuis tactiles |

Pour les e2e en local, le port vaut 5847 par défaut (`E2E_PORT` pour en changer) ; `PW_CHROMIUM_PATH` permet d'utiliser un Chromium déjà installé.

## Architecture

```
index.html            gabarit HTML et style (aucun script en ligne, aucun CDN)
public/               modèles riggés (.json), textures, vallée peinte, image de titre
src/
  main.ts             relie tout et lance la boucle
  sim/                simulation pure et déterministe : aucun DOM, aucun rendu, aucun son
    world.ts          état d'une partie, pas fixe (1/120 s), vagues, verrouillage, score, événements
    player.ts         vol de l'ange, esquive, tir
    combat.ts         traits, boules de feu, Jugement, têtes touchées
    demons.ts         démons (altitude bornée : jamais hors d'atteinte)
    dragon.ts         corps du Dragon et ses sept têtes
    terrain.ts        relief procédural et relief déduit de la vallée peinte
    bot.ts            pilote automatique (porté des critiques) et partie complète sans rendu
    score.ts config.ts rng.ts math.ts types.ts
  render/             three.js : ciel, nuages volumétriques, sol et forêts, ange, démons, Dragon, effets, qualité auto
  audio/              son et musique générés (Web Audio)
  input/              clavier, souris, joystick tactile, boutons
  ui/                 HUD, invites, écrans, pause quand l'onglet est caché
  save/               sauvegarde versionnée
tests/unit/           Vitest : simulation, sauvegarde, qualité, architecture…
tests/bot/            parties complètes jouées par le bot
tests/e2e/            Playwright
tests/critiques/      anciennes critiques chiffrées (outil manuel, voir CRITIQUES.md)
```

La simulation avance à pas fixe avec un hasard à graine : une même graine et les mêmes commandes rejouent exactement la même partie. Elle émet des événements (éclats, sons, mots d'impact, apparition d'un démon…) que le rendu, l'audio et l'interface consomment. Aucun module ne dépasse 400 lignes (vérifié par un test).

### Sauvegarde

Une seule clé `gdc-save` : `{ version: 1, settings: { music, sfx, sens, invY, diff }, records: { best: [3], won: [3] } }`.

- Au premier lancement, elle est construite à partir des anciennes clés (`gdc-vol`, `gdc-set`, `gdc-diff`, `gdc-won`, `gdc-best`), qui restent en place.
- JSON illisible : la valeur est mise de côté dans `gdc-save-corrupt`, puis on repart des anciennes clés ou des valeurs par défaut.
- Valeurs hors bornes ou de mauvais type : corrigées à la lecture et à l'écriture.
- `localStorage` absent ou refusé (navigation privée, quota) : repli en mémoire, le jeu continue.

### Performances mobiles

- `devicePixelRatio` plafonné (1,75 sur ordinateur, 1,3 au doigt) ;
- qualité automatique par crans (nuages à plus basse résolution, puis définition) quand les images ralentissent durablement ;
- pause automatique quand l'onglet est caché ;
- objets préalloués (traits, boules de feu, particules, visuels de démons) : rien n'est créé image par image dans la boucle.

## CI et déploiement

`.github/workflows/ci.yml` bloque sur : typecheck, lint, tests, bot, build, puis e2e Playwright.
`.github/workflows/pages.yml` publie `dist/` sur GitHub Pages après une CI verte sur `main`. **À faire une fois** : Settings > Pages > Source : « GitHub Actions ».

## Contenu

- `public/angel.json`, `public/demon.json` : maillages riggés (squelette et poids de peau) ; `public/dragon.json` : tête du Dragon. Leurs textures sont les fichiers `*-tex.png`.
- `public/valley.webp` : la vallée peinte qui sert de sol ; `public/keyart.webp` : l'image de référence, affichée à l'écran titre.
- `A-VALIDER.md` : la liste des points à valider en jouant ; `CRITIQUES.md` : les rondes de critiques chiffrées.

**Aperçu des liens** : `og:url` pointe vers l'artifact claude.ai ; `og:image` vers `public/keyart.webp` servie par raw.githubusercontent.com (branche `main`), car un aperçu exige une adresse d'image absolue et publique. Renommer `public/keyart.webp`, la branche `main` ou rendre le dépôt privé casse l'aperçu.

Les modèles 3D ont été générés avec Higgsfield à partir d'images de référence, puis riggés par script.
