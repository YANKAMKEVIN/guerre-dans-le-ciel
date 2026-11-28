# Rondes de critiques

Chaque version est jouée par des pilotes automatiques avant d'être confiée au joueur : `npm run build && npm run critiques` (ou `npm run critiques -- interface perf` pour quelques critiques). Le build est servi en local et joué dans Chromium (WebGL logiciel) ; le rapport va dans `tests/out/rapport.json`. Les durées sont en temps de jeu, comme sur une machine normale à 60 images par seconde. Depuis la migration TypeScript, les parties complètes sans rendu sont aussi jouées à chaque CI par le bot (`npm run bot`, voir `tests/bot`), avec le hasard figé par des graines.

## Ronde 1

| Critique | Avant | Correction | Après |
|---|---|---|---|
| Visée : quart de tour | 1,1 s | virage plus vif | 0,85 s |
| Visée : verrouillage, premier impact | 0,2 s, 0,5 s | aucune | 0,2 s, 0,5 s |
| Lisibilité : écran brûlé pendant un tir du Dragon | 13,6 % | feu moins éblouissant, étincelles d'impact atténuées | 2,4 à 2,9 % |
| Lisibilité : vue de la vallée | maisons 3D en cubes flottants sur les villages peints, arbres en pois verts | plus de maisons 3D dans la vallée, arbres seulement dans les forêts | la peinture se lit telle quelle |
| Performances : phase du Dragon | 336 appels de dessin, 973 000 triangles | segments en instances, contour des têtes seulement de près | 113 appels, 785 000 triangles |
| Son : crête pendant un combat chargé | 0,26 | aucune | pas de saturation |
| Durée : pilote moyen (Gardien) | 61 s, Dragon en 20 s | têtes à diadème (vulnérables gueule ouverte), vagues plus renforts, démons plus coriaces | 3 min 24, Dragon en 1 min 42 |
| Difficulté : débutant (Gardien) | 13 PV perdus en tout | tirs ennemis plus rapides et plus justes, régénération plus lente | victoire en 5 min 03, 57 PV au plus bas |
| Difficulté : débutant (Pèlerin) | non mesuré | | victoire en 4 min 34, 75 PV au plus bas |
| Difficulté : expert avec esquive et Jugement (Archange) | non mesuré | | victoire en 2 min 40, 49 PV au plus bas |

Étape intermédiaire : avec 3 boules de feu par tête, le débutant est mort au Dragon, avec 3 têtes restantes. Les salves sont revenues à 2 boules, un peu moins souvent.

La simplification des têtes du Dragon a été essayée puis abandonnée (trous dans le maillage).

## Ronde 2

| Critique | Avant | Correction | Après |
|---|---|---|---|
| Performances : vague 1 (1280×720) | 50 appels, 473 000 triangles | feuillus au-delà de 1 400 unités en icosaèdre simple (20 triangles au lieu de 80) | 50 appels, 210 000 triangles |
| Performances : phase du Dragon | 111 appels, 689 000 triangles | même correction | 112 appels, 427 000 triangles |
| Lisibilité : vue de la vallée | | | aucune différence visible sur la capture de la vague 1 |
| Lisibilité : écran brûlé pendant un tir du Dragon | 3,1 % | aucune | 2,8 % |

La critique « interface » vérifie que les feuillus proches gardent leur maillage fin et que ceux du lointain passent au maillage simple.

## Ronde 3

| Critique | Avant | Correction | Après |
|---|---|---|---|
| Difficulté : débutant (Gardien) | victoire en 5 min 03, 57 PV au plus bas (ronde 1) | Gardien encaisse 20 % de dégâts en plus (décision de Kevin) | pas fini : 32 PV au plus bas, jamais mort, mais bloqué 568 s en vague 3 sans atteindre le Dragon |
| Interface | 62/62 | contrôles des dégâts par difficulté et de l'aperçu de lien absolu | 64/64, aucune erreur |

Le blocage en vague 3 rejoint celui déjà vu avec le pilote moyen (306 s en vague III, ronde 2). Les dégâts reçus n'y sont pour rien : ils ne changent ni le nombre de démons ni la façon dont le pilote les vise. Reste à comprendre pourquoi les pilotes n'achèvent pas la vague 3 sur cette machine lente.

## Ronde 4 : le blocage en vague 3

Cause trouvée en rejouant les pilotes avec le hasard figé (graines), le temps de jeu accéléré et un relevé des positions : deux défauts se cumulaient.

- **Bug du jeu : démons hors d'atteinte.** Chaque démon garde une hauteur fixe par rapport à l'ange, jusqu'à 90 unités au-dessus ou 50 en dessous, sans aucune limite. Quand l'ange atteint son plafond (1 500), le jeu l'empêche de cabrer ; un démon resté au-dessus de lui, jusqu'à 21° plus haut, sort alors du cône de verrouillage (12,5°) pour de bon. Près du sol, un démon pouvait aussi passer sous le relief. Relevé de la graine 2 : 266 s en vague 3, ange à 1 500, dernier démon 87 unités au-dessus, jamais verrouillé. Le même blocage se reproduit sur `main` : le bug existait avant la ronde 3.
- **Limite du pilote : retard constant.** Le pilote corrigeait son cap en proportion de l'écart, avec un retard de réaction de 0,35 s pour le débutant. Face à un démon qui tourne autour de lui à 0,6 rad/s, il gardait 20° de retard, plus que le cône de verrouillage, et le poursuivait en cercle sans fin, à hauteur égale.

| Critique | Avant | Correction | Après |
|---|---|---|---|
| Démons atteignables | blocages en vague 3 sur 2 graines sur 3 (débutant, Gardien), et un en vague 1 sur `main` | hauteur des démons bornée entre le relief + 40 et le plafond − 40 | contrôle `demons_atteignables` dans la critique interface |
| Pilote : virage | retard constant de 20° derrière un démon qui tourne | terme intégral dans la correction de cap | vague 3 en 54 à 60 s sur les graines 1 et 2, victoires en 4 min 00 et 4 min 25 |
| Durée : pilote moyen (Gardien) | 306 s en vague 3, pas fini (ronde 2) | les deux corrections | victoire en 3 min 14, vague 3 en 45 s, Dragon en 1 min 17, 23 PV au plus bas |
| Difficulté : débutant (Gardien) | 568 s en vague 3, pas fini (ronde 3) | les deux corrections | 1re partie : mort en vague 3 à 2 min 04 (10 PV au plus bas avant) ; 2e partie : victoire en 4 min 35, vague 3 en 62 s, 54 PV au plus bas |
| Interface | 64/64 | contrôle demons_atteignables | 65/65, aucune erreur |

La graine 4 et la 1re partie du débutant meurent en vague 3 : c'est la difficulté de Gardien (20 % de dégâts en plus), plus un blocage.
