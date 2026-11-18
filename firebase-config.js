/* Config Web Firebase de « Ma semaine ».
   Vide = connexion Google désactivée ; l'application fonctionne normalement sans compte.
   Ces valeurs sont publiques par conception. Ne jamais mettre ici de clé privée ni de compte de service.
   Pour la remplir : voir IMPLEMENTATION_STATUS.md (ou .env.example + scripts/gen-firebase-config.mjs). */
window.MS_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
