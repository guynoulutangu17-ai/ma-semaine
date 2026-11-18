# Ma semaine : état d'avancement

Dernière mise à jour : 18 novembre 2026 (mission 1).

## Mission 1 : connexion Google facultative et profil étudiant

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
- `sw.js` : `CACHE` passé de `ma-semaine-v11` à `ma-semaine-v12`, trois fichiers ajoutés au précache.

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

## Instructions pour la mission 2 (Cloud Firestore, synchronisation)

À ne commencer qu'après la configuration Firebase ci-dessus et un test réel de connexion.

1. Étendre `scripts/vendor-firebase.sh` / `vendor/firebase/entry.js` avec `firebase/firestore` (utiliser `initializeFirestore` avec cache persistant local, ex. `persistentLocalCache`), régénérer le module, ajouter son poids au précache de `sw.js`, bumper `CACHE`.
2. Modèle de données proposé : `users/{uid}` (profil : `university`, `level`, `updatedAt`) et `users/{uid}/data/{docId}` pour l'état de l'application. Inventorier d'abord les clés `localStorage` existantes : `ma-semaine-cls`, `ma-semaine-custom`, `l1a-planner-v2`, `l1b-planner-v2`, `l1c-planner-v2` (planning, notes, rappels, jours sans cours, thème, rappel .ics, rythme du minuteur), `ma-semaine-profile`. Le script principal lit aussi d'anciennes clés (`l1b-planner-v1`) comme repli : à conserver telles quelles.
3. Règles Firestore (obligatoires avant toute écriture) : un utilisateur ne lit et n'écrit que `users/{uid}/**` avec `request.auth.uid == uid`, et limiter la taille des documents.
4. Local-first : le stockage local reste la source de vérité de l'interface ; l'écriture cloud est différée (anti-rebond), tolérante au hors connexion, et ne bloque jamais l'interface.
5. Fusion à la première connexion : ne jamais écraser sans sauvegarde. Fusion par horodatage `updatedAt` par document ; en cas de conflit sur le planning ou les notes, garder la version la plus récente et conserver l'autre dans une copie de sauvegarde locale avant de remplacer ; proposer un choix à l'utilisateur si les deux côtés contiennent des données.
6. Migration sécurisée : sauvegarder (copie exportable) avant la première fusion, puis écrire en cloud, puis seulement ensuite marquer la migration comme terminée.
7. Changement de téléphone : après connexion sur un appareil vide, restaurer depuis le cloud, puis afficher un message de confirmation.
8. Ajouter dans `account.js` les points d'accroche : appeler la synchronisation depuis `onAuthStateChanged` (connexion), l'arrêter à la déconnexion, et déplacer la sauvegarde du profil vers Firestore (le stockage local reste le cache).
9. Tests : deux appareils simulés, hors connexion puis reconnexion, conflits, première migration, compte vide.

## Mission 3 (non commencée)

Pages « À propos de Ma semaine » et « Le développeur ». À placer de préférence dans le menu secondaire « Mon compte » ou un menu Paramètres cohérent.
