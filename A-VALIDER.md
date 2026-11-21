# Guerre dans le Ciel : à valider au réveil

Jeu : https://claude.ai/artifact/KbZa9JpCU3RQqC14gcvtWM

## Fait cette nuit

1. **Son et musique**, entièrement générés dans le navigateur, sans fichier audio :
   - trois thèmes : menu (chœur doux), vagues (chœur, harpe, cloches, timbales), Dragon (cuivres, ostinato, tambours de guerre) ;
   - effets : traits de lumière, impacts, explosions, rugissements, boules de feu, esquive, Jugement, vent qui suit la vitesse ;
   - jingles de victoire et de défaite, accord de chœur à chaque vague ;
   - réverbération de cathédrale sur l'ensemble.
2. **Réglages** : curseurs Musique et Effets dans le menu et dans la pause (mémorisés), M coupe tout, N coupe la musique.
3. **Pause** : Échap ou P ; pause automatique quand on change d'onglet.
4. **Écran de chargement** : le bouton reste inactif tant que les modèles et la vallée ne sont pas chargés (15 s maximum).
5. **Téléphone** : joystick à gauche, boutons Frapper / Jugement / Esquive / Élan à droite, bouton pause ; qualité réduite automatiquement. Testé en émulation Pixel 7 paysage, pas sur un vrai téléphone.
6. **Trois difficultés** : Pèlerin, Gardien (par défaut), Archange. Elles changent les dégâts reçus, la cadence de tir ennemie et la vie des têtes.
7. **Fin de partie** : durée, combo max, démons terrassés, têtes abattues et record par difficulté (mémorisé).
8. **Ombres des nuages** projetées sur la vallée.
9. **Bug corrigé** : en mode « joueur moyen », le pilote automatique restait bloqué sur la dernière tête du Dragon. Les traits verrouillés s'incurvent maintenant vers leur cible, tirer sur le corps entame la tête la plus proche, et le Dragon se rapproche à mesure qu'il perd ses têtes.

## Tests faits

- Pilote automatique « réflexes parfaits » (esquive + Jugement) : victoire en environ 4 min 30 s, 11 points de vie perdus.
- Pilote « joueur moyen » (vise et tire seulement) : bloqué plus de 5 minutes sur la dernière tête avant la correction ; après correction, victoire en environ 4 min 20 s (Dragon abattu en 1 min 30 s), 37 points de vie perdus au pire, en Gardien.
- Niveaux sonores mesurés dans les trois thèmes, sans saturation ; aucune erreur de script.

## À valider ou corriger (par ordre d'importance)

1. **Écouter la musique et les effets** : je ne peux pas les écouter moi-même. Volume, ambiance, sons agaçants ?
2. **Difficulté en Gardien** : les pilotes automatiques perdent très peu de vie, donc le jeu est peut-être trop facile pour vous.
   → Décidé le 21/11 : Gardien encaisse 20 % de dégâts en plus (coefficient 1,2 dans `DIFF`, au lieu de 1 ; Pèlerin 0,6 et Archange 1,4 inchangés). À rejouer pour confirmer le ressenti.
3. **Fluidité** sur votre machine, surtout pendant la phase du Dragon (nuages + sept têtes).
4. **Sur téléphone** : la prise en main du joystick et la taille des boutons.
5. **L'arrivée du Dragon** se fait par en dessous, depuis la vallée : est-ce assez spectaculaire ?
