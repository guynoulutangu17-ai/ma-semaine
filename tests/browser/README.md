# Tests navigateur (Playwright + Chrome)

Ces tests utilisent un **SDK Firebase simulé** (`fakefs.js`) et un « cloud » en mémoire : ils valident la logique de
l'application (fusion, hors connexion, comptes séparés), **pas** Firebase ni Google. Ils ne remplacent pas un test réel.

Préparation : créer un dossier `S` contenant `www/ma-semaine` (lien vers ce dépôt) et y copier `fakefs.js`, puis :
`S=<dossier> python3 test-account.py` et `S=<dossier> python3 test-sync.py` (Chrome attendu dans `/usr/bin/google-chrome`).
Les tests unitaires du moteur de fusion : `node tests/sync-core.test.js`.
