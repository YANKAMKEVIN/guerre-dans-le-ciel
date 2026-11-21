# Rondes de critiques

Chaque version est jouée par des pilotes automatiques avant d'être confiée au joueur (`cd tests && npm install && node critiques.js`). Les durées sont en temps de jeu, comme sur une machine normale à 60 images par seconde.

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
