# Ma semaine : état d'avancement

Dernière mise à jour : 19 novembre 2026 (missions 1 et 2).

## Mission 1 : connexion Google facultative et profil étudiant (terminée)

### Ce qui a été fait

- Bouton « Mon compte » (icône personne) dans l'en-tête, à côté du bouton de thème. Les trois rubriques (Horaire, Étude, Rentrée) et la navigation n'ont pas été modifiées.
- Fenêtre « Mon compte », dans le style de la fenêtre d'import d'horaire (mêmes couleurs, cartes arrondies, boutons, polices).
  - Sans compte : texte rassurant et bouton « Continuer avec Google ».
  - Connecté : photo Google (ou initiale), nom, Gmail, carte « Profil étudiant » (Université, Promotion ou niveau d'études, modifiables), boutons Enregistrer et Se déconnecter.
- Authentification : Firebase Authentication, fournisseur Google, fenêtre pop-up (`signInWithPopup`), choix du compte à chaque fois. Session conservée par Firebase (stockage local du navigateur). Déconnexion à tout moment.
- Erreurs gérées : fenêtre fermée ou annulée (silencieux), pop-up bloqué, réseau absent, domaine non autorisé, Google non activé, trop de tentatives, compte désactivé, stockage bloqué, module impossible à charger (bouton « Réessayer »). Aucune erreur ne bloque l'application.
- Tant que `firebase-config.js` est vide : le module Firebase n'est même pas chargé, le bouton Google est désactivé avec un message clair. Aucune connexion n'est simulée.
- Profil étudiant conservé localement dans la clé `ma-semaine-profile` (`{university, level, updatedAt}`). Il reste après une déconnexion. Aucune autre clé de stockage n'est lue ni modifiée.

### Architecture retenue

Application statique, sans étape de build, déployée telle quelle par GitHub Pages (branche `main`, racine). Cette contrainte a été conservée.

- `account.js` : toute la logique compte + profil + interface (script classique, `defer`). Indépendant du script principal minifié de `index.html`.
- Firebase Auth est compilé une fois en un seul module local (`vendor/firebase/firebase-auth.js`, 114 Ko, Firebase 13.4.0), comme déjà fait pour Tesseract : aucun code chargé depuis un site tiers, et le module est précaché pour le mode hors connexion.
- Le module n'est chargé que si Firebase est configuré, pendant un temps d'inactivité après le démarrage (ou à l'ouverture de « Mon compte »).
- Les chaînes affichées venant de Google (nom, e-mail) sont écrites avec `textContent`, jamais en HTML.

### Fichiers

Nouveaux :

- `account.js`
- `firebase-config.js` : configuration Web Firebase, **vide pour l'instant** (valeurs publiques par conception)
- `.env.example` : paramètres à renseigner
- `scripts/gen-firebase-config.mjs` : génère `firebase-config.js` depuis `.env`
- `scripts/vendor-firebase.sh` : régénère le module Firebase local
- `vendor/firebase/firebase-auth.js`, `entry.js`, `VERSIONS.json`
- `.gitignore` (ignore `.env` et `node_modules/`)
- `IMPLEMENTATION_STATUS.md`

Modifiés :

- `index.html` : deux balises `<script>` ajoutées avant `</body>` et quelques règles CSS ajoutées à la fin de la feuille de style (préfixes `.acct-*`, `.gbtn`, `.imp-ok`). Rien d'autre.
- `sw.js` : `CACHE` passé de `ma-semaine-v11` à `ma-semaine-v12` (devenu `v13` en mission 2), trois fichiers ajoutés au précache.

### Ce que Guy doit configurer dans Firebase (non fait, aucun accès au projet)

1. Console Firebase (https://console.firebase.google.com) : créer un projet (ou en choisir un), sans Google Analytics si inutile.
2. Ajouter une application **Web** (icône `</>`) et copier la « Configuration SDK ».
3. Authentication > Méthode de connexion > activer **Google**, choisir l'e-mail d'assistance du projet.
4. Authentication > Paramètres > **Domaines autorisés** : ajouter `guynoulutangu17-ai.github.io` (le domaine seul, sans `/ma-semaine/`). `localhost` y est déjà pour les tests.
5. Remplir la configuration, au choix :
   - copier `.env.example` en `.env`, le remplir, puis `node scripts/gen-firebase-config.mjs` ; ou
   - éditer directement `firebase-config.js` (champs `apiKey`, `authDomain`, `projectId`, `appId`, et si présents `storageBucket`, `messagingSenderId`).
6. Changer le numéro de `CACHE` dans `sw.js` (v13, etc.), commit et push sur `main`.
7. Ne jamais ajouter de clé privée ni de compte de service dans le dépôt. La clé `apiKey` Web n'est pas un secret ; la sécurité repose sur les domaines autorisés et, en mission 2, sur les règles Firestore.

### Tests réalisés (Chrome 153.0.8010.12 sans interface, écran 390×780, site servi sous `/ma-semaine/` comme sur GitHub Pages)

28 vérifications automatisées, toutes réussies :

| Test | Résultat |
|---|---|
| Ouverture sans compte, onglets Horaire / Étude / Rentrée | OK |
| Ouverture de « Mon compte » ne crée ni ne modifie aucune clé de stockage | OK |
| Note existante conservée après rechargement | OK |
| Firebase non configuré : bouton Google désactivé, message clair, aucune erreur JS | OK |
| Firebase « configuré » (valeurs factices) avec le **vrai** module local : chargement correct, bouton actif, aucune erreur JS | OK |
| Erreurs (fenêtre fermée, pop-up bloqué, réseau, domaine non autorisé) : bon message, application jamais bloquée | OK, avec module Firebase simulé |
| Connexion, affichage nom et e-mail, modification et enregistrement du profil, conservation après rechargement, déconnexion, profil gardé après déconnexion | OK, avec module Firebase simulé |
| Hors connexion : cache v12 contient `account.js`, la config et le module Firebase ; l'application et la fenêtre compte s'ouvrent sans réseau | OK |
| Chemins relatifs sous `/ma-semaine/` (aucun chemin absolu ajouté) | OK |

Deux défauts trouvés et corrigés pendant les tests : la touche Échap ne fermait pas la fenêtre quand le bouton Google était désactivé, et l'initiale de l'avatar était mal alignée.

### Non testé (à vérifier par Guy une fois Firebase configuré)

- **Une vraie connexion Google** : impossible ici (pas de projet Firebase, accès réseau limité). Les scénarios de connexion ont été testés avec un module simulé, qui valide l'interface et la logique de l'application, pas Google ni Firebase.
- La conservation d'une vraie session Firebase entre deux ouvertures (assurée par Firebase, non vérifiée de bout en bout).
- Le comportement de la fenêtre pop-up sur un vrai téléphone Android, y compris l'application installée en PWA.
- L'installation PWA, les rappels, l'import par photo, le Pomodoro : le code de ces fonctions n'a pas été modifié, mais seuls les onglets, la note et le chargement ont été exercés ici.

### Problèmes ou points d'attention

- Choix de la fenêtre pop-up plutôt que la redirection : `signInWithRedirect` est peu fiable sur GitHub Pages avec un `authDomain` en `firebaseapp.com` (partitionnement du stockage des navigateurs récents). Si des téléphones bloquent les pop-up, le message l'explique ; ne pas passer à la redirection sans héberger le domaine d'authentification.
- La photo de profil vient de `googleusercontent.com` : elle ne s'affiche pas hors connexion (l'initiale la remplace).
- Le script principal de `index.html` est minifié et n'a pas été touché. Pour toute intégration profonde en mission 2, préférer des événements ou des fonctions exposées par `account.js` plutôt que de modifier ce script.

## Mission 2 : sauvegarde cloud et synchronisation (code terminé, non testé avec un vrai Firebase)

**Important : la synchronisation réelle n'a pas pu être testée.** Aucun projet Firebase n'est configuré (`firebase-config.js` est vide) et l'émulateur Firestore ne peut pas être téléchargé depuis l'environnement de travail. Tant que Firebase n'est pas configuré, rien de tout cela ne s'active : l'application fonctionne comme avant, sans compte.

### Ce qui a été fait

- Sauvegarde automatique dans `users/{uid}/sync/state` (un seul document par étudiant) dès qu'un compte est connecté : classe (`ma-semaine-cls`), horaire personnalisé (`ma-semaine-custom`), profil (université, promotion) et, pour chaque classe A, B, C, tout l'état (`l1a|l1b|l1c-planner-v2`) : notes, rappels, cours annulés (`off`, `offDay`), séances terminées (`done`), progression, planning de révision (`plan`), tâches et questions (`q`), thème, rappel .ics, rythme du minuteur.
- Rien n'a été ajouté à l'état existant de l'application : `sync.js` surveille les écritures locales et lit les mêmes clés.
- Écritures groupées : une seule écriture 3 secondes après la dernière modification, en transaction, et aucune écriture s'il n'y a rien de nouveau.
- Fusion à trois voies par élément et par champ (local, dernière version synchronisée, cloud) dans `sync-core.js` : les rappels gardent leurs identifiants, pas de doublon, les suppressions sont propagées par marqueurs (purgés après 180 jours), la modification l'emporte sur une suppression concurrente, deux notes modifiées en même temps sont **toutes deux conservées**, et toute version écartée est mise de côté (`ma-semaine-conflicts`, exportable via « Copies de sécurité »).
- Première connexion : copie de sécurité des données locales (`ma-semaine-premerge`), fusion, puis relecture du cloud pour vérifier que chaque donnée y est avant de considérer la migration terminée. Répétable sans doublon.
- Hors connexion : les données restent locales, un statut « Modifications en attente » s'affiche, nouvelles tentatives espacées (5 s à 5 min) et reprise automatique au retour du réseau.
- Deux appareils : un écouteur détecte les changements, les mises à jour du cloud sont appliquées sans jamais écraser une modification locale faite entre-temps (rechargement automatique au démarrage ou quand l'application est en arrière-plan, sinon bouton « Appliquer les mises à jour »).
- Carte « Sauvegarde » dans « Mon compte » : Synchronisé, Synchronisation en cours, Modifications en attente, Erreur de synchronisation, date de dernière synchronisation réussie, « Synchroniser maintenant ». « Synchronisé » n'apparaît que si l'envoi a été confirmé.
- Déconnexion sûre (avec confirmation) : envoi final, mise à l'abri locale de ce qui n'a pas pu être envoyé (restaurée à la reconnexion avec le même compte), puis retrait des données du téléphone. Le compte et le cloud ne sont jamais supprimés. Un autre compte ne voit rien de l'ancien.
- Firestore est compilé **sans cache persistant** (mémoire seulement) : aucune donnée de compte ne reste dans IndexedDB sur un appareil partagé. La copie hors connexion est le stockage local de l'application, retiré à la déconnexion.

### Nouveaux fichiers et modifications

Nouveaux : `sync-core.js` (fusion, validation), `sync.js` (Firestore, hors connexion, comptes), `firestore.rules`, `firebase.json`, `tests/` (`sync-core.test.js`, `firestore-rules.test.mjs`, `browser/`).
Modifiés : `account.js` (carte Sauvegarde, déconnexion sûre, démarrage de la synchro), `index.html` (2 balises script, CSS `.sync-*`), `sw.js` (cache `v13`, nouveaux fichiers), `vendor/firebase/*` (module recompilé avec Firestore, 580 Ko, chargé seulement si Firebase est configuré, mis en cache à la première utilisation).

### Règles de sécurité Firestore (`firestore.rules`)

- Lecture et écriture uniquement sur `users/{uid}/sync/state` et seulement si `request.auth.uid == uid`. Tout le reste est refusé. Aucune règle publique.
- Écriture : champs limités à `v`, `leaves`, `rev`, `updatedAt` ; `leaves` doit être une table de 3000 entrées au plus ; `rev` doit augmenter d'exactement 1 ; `updatedAt` doit être l'heure du serveur.
- Suppression refusée (se déconnecter ne supprime jamais le compte ni ses données).
- Limite connue : les règles ne peuvent pas inspecter chaque entrée. Le contenu est donc validé par l'application à la lecture (`fromRemote` rejette les clés, types et tailles inattendus). Firestore limite aussi un document à 1 Mo.
- À faire dans la console : **publier ces règles** (copier `firestore.rules` dans Firestore > Règles > Publier, ou `firebase deploy --only firestore:rules`). Sans cela, la base est refusée ou, selon le mode choisi à la création, trop ouverte : choisir le **mode production** à la création.

### Opérations qui nécessitent ton intervention (en plus de celles de la mission 1)

1. Console Firebase > Firestore Database > Créer une base de données, **mode production**, région proche (ex. `europe-west`).
2. Publier `firestore.rules` (voir ci-dessus).
3. Remplir `firebase-config.js` (étapes de la mission 1, déjà décrites plus haut), vérifier le domaine `guynoulutangu17-ai.github.io` dans Authentication, puis pousser sur `main`.
4. Tester pour de vrai (voir liste ci-dessous), puis, si tout est bon, rien d'autre : la synchronisation démarre dès la première connexion.

### Tests réalisés

**Tests réels : aucun** (pas de projet Firebase, émulateur indisponible).

Tests **simulés**, avec un SDK Firebase simulé et un cloud en mémoire partagé entre plusieurs appareils virtuels (Chrome, écran 390×780) :

- 13 tests unitaires du moteur de fusion (`node tests/sync-core.test.js`) : restauration complète, première fusion sans doublon et répétable, deux notes modifiées en même temps, suppressions et marqueurs, séances liées au planning, conflits, modification contre suppression, validation des données reçues, clé locale illisible jamais écrasée.
- 33 tests navigateur de synchronisation : migration des données locales (copie de sécurité, vérification, aucune écriture si rien ne change), sauvegarde groupée (3 frappes, une seule écriture), restauration sur un « nouveau téléphone » (note, rappels et leurs identifiants, cours annulé, séances faites, thème, classe, profil), deux appareils (rappels, séances, cours annulés fusionnés, suppression propagée, notes simultanées conservées), hors connexion (statut jamais « Synchronisé », rien d'écrit, reprise au retour du réseau), séparation de deux comptes et déconnexion (données retirées du téléphone, cloud intact, modifications non envoyées mises à l'abri puis retrouvées).
- 28 tests de non-régression de la mission 1 (sans compte, erreurs de connexion, profil, hors connexion), adaptés à la nouvelle déconnexion.
- Contrôle avec le **vrai** module Firebase compilé : il se charge et initialise Firestore (`getFirestore`, `doc`) sans erreur ; aucune requête réelle n'a été envoyée.
- Les règles Firestore : `tests/firestore-rules.test.mjs` est écrit (17 vérifications) mais **n'a pas pu être exécuté** (émulateur non téléchargeable). À lancer : `npx firebase-tools emulators:exec --only firestore "node tests/firestore-rules.test.mjs"` après `npm i --no-save @firebase/rules-unit-testing firebase firebase-tools` (Java requis).

### À vérifier une fois Firebase configuré (tests réels)

1. Connexion Google réelle sur Android (Chrome) et en PWA installée.
2. Premier appareil : changer l'horaire, écrire une note, cocher des séances, ajouter un rappel ; vérifier dans la console Firestore le document `users/<uid>/sync/state` et l'état « Synchronisé ».
3. Second appareil (ou navigateur privé) avec le même compte : tout doit être restauré, rappels sans doublon.
4. Mode avion : modifier, constater « Modifications en attente », rétablir le réseau, constater l'envoi.
5. Règles : exécuter le test de l'émulateur, puis essayer depuis la console de lire `users/<autre uid>` (doit être refusé).
6. Deux comptes sur le même téléphone : se déconnecter, se connecter avec un autre compte, vérifier qu'aucune donnée du premier n'apparaît.

### Points d'attention

- Les modifications d'un autre appareil sont appliquées par un rechargement de la page, déclenché au démarrage ou quand l'application passe en arrière-plan ; en cours d'utilisation, un bouton « Appliquer les mises à jour » est proposé pour ne pas interrompre une saisie. Un garde-fou limite à 3 rechargements par minute.
- Une séance cochée est repérée par sa position dans le planning du jour. Si deux appareils modifient le même planning, la version la plus récente gagne et les séances cochées suivent ce planning ; la version écartée est mise de côté, jamais perdue en silence.
- Plusieurs onglets ouverts en même temps sur le même navigateur ne sont pas coordonnés entre eux (les transactions Firestore les protègent côté cloud).
- Un document Firestore est limité à 1 Mo ; l'application s'arrête proprement (erreur affichée, données locales intactes) au-delà de 3000 entrées.
- Suppression définitive du compte et des données cloud : non prévue dans cette mission.

## Refonte visuelle (19 novembre 2026)

Nouveau design d'après l'image de référence, **couleurs d'origine conservées** (variables de `index.html` inchangées).

- `ui.css` (nouveau) : surcharge la feuille de style de `index.html`, chargé juste après. Pour revenir à l'ancien aspect, retirer la balise `<link rel="stylesheet" href="ui.css">`.
- `ui.js` (nouveau, petit) : sépare « date » et « professeur » dans la carte du prochain cours (avec icônes) ; la cloche ramène aux rappels du jour.
- `index.html` : en-tête réorganisé (logo, classe, cloche, avatar), onglet « Rentrée » renommé **« Notes »** (identifiants, notes et liste « à repérer » inchangés), bouton « Cours annulé » renommé « Annuler ce cours » (l'étiquette « Cours annulé » désigne un cours réellement annulé). Aucun autre changement du script principal.
- Compte à rebours **heures, minutes, secondes** conservé dans la carte du prochain cours, ainsi que la frise horaire.
- **Thème Clair / Sombre / Automatique** : le bouton de thème d'origine reste le moteur (même réglage, même enregistrement avec les données de la classe, même synchronisation), mais il est masqué. Le choix se fait dans « Mon compte », section **Apparence**, accessible avec ou sans compte.
- `account.js` : bouton avatar (initiale ou photo) à côté de la cloche, section Apparence.
- `sw.js` : cache `v15`, `ui.css` et `ui.js` ajoutés au précache.
- Tests : `tests/browser/test-ui.py` (28 vérifications : 360, 390 et 768 px, pas de défilement horizontal, thèmes et enregistrement, cloche, onglet Notes, données intactes, annulation et rétablissement d'un cours). Suites existantes rejouées : 28/28 (compte), 33/33 (synchronisation, simulée), 13/13 (fusion).
- Non vérifié : rendu sur de vrais téléphones Android (contrôlé par captures Chrome à 360, 390 et 768 px, thèmes clair et sombre).

## Mission 3 (non commencée)

Pages « À propos de Ma semaine » et « Le développeur ». À placer de préférence dans le menu secondaire « Mon compte » ou un menu Paramètres cohérent.
