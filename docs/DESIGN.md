# Décroche — Conception

## Vision

Un « compagnon de sevrage configurable », pas un simple bloqueur : un spectre de
sévérité réglable par site, pour couvrir deux publics à la fois — le procrastinateur
léger (réseaux sociaux, YouTube) ET les addictions sérieuses (porno, jeux d'argent).

Ton de l'interface : neutre, bienveillant, jamais culpabilisant.
Langue : FR/EN (i18n prévue, FR d'abord).

## Concept central : les « règles »

Une règle = cibles + comportement :

- **Cibles** : domaines, wildcards (`*.tiktok.com`), ou catégorie prédéfinie
- **Sévérité** (4 niveaux) :
  1. **Observer** → rien n'est bloqué, on compte les visites (prise de conscience)
  2. **Friction** → page intermédiaire avec délai + question d'intention + bouton
     « continuer quand même »
  3. **Quota** → accès libre jusqu'à X min/jour de temps actif, puis blocage
  4. **Blocage** → aucun accès
- **Action au blocage** (au choix par règle) : page intermédiaire OU fermeture d'onglet
- **Horaires** : plages + jours (ex. blocage 9h–18h en semaine)
- **Verrou** : règle verrouillable par le mode strict

**Mode strict** (orthogonal aux règles) : quand il est armé (durée choisie ou
permanent), les règles verrouillées ne peuvent plus être assouplies/supprimées ;
toute suppression demande un délai de 24 h. C'est un « soft lock » assumé (une
extension ne peut pas empêcher sa désinstallation — ne pas prétendre le contraire).

## Décisions techniques

- **declarativeNetRequest** pour l'interception (instantané, avant chargement de la
  page). Même l'action « fermeture d'onglet » passe par une redirection DNR vers une
  page de l'extension qui se ferme elle-même — jamais de flash du site bloqué.
- **webNavigation.onHistoryStateUpdated** en complément du DNR pour les SPA (bloquer
  des sections comme `youtube.com/shorts` sans navigation réseau). `onCommitted` sert
  aussi de filet pour les navigations bfcache (retour arrière sans requête réseau).
- **Suivi du temps actif** pour les quotas : APIs `tabs` + `idle` + focus fenêtre
  (seul l'onglet actif compte).
- **Service worker** : moteur de règles, horaires/quotas, état du mode strict.
- **Popup** : état du jour, streaks, bouton panique (« bloque tout pendant 1 h »).
- **Page d'options** : gestion des règles, catégories prédéfinies, mode strict.
- **Stockage 100 % local** (`chrome.storage`), aucun serveur. Mode discret prévu :
  noms de sites floutés dans les stats, PIN sur la page d'options (confidentialité
  vis-à-vis de l'entourage, pas sécurité).
- **Onboarding** : guider l'activation de l'extension en navigation privée (sinon
  trou béant du mode strict).

## Architecture M1

### Flux d'interception

1. Chaque règle `friction`/`blocage` est compilée en règles DNR dynamiques
   (une par cible) : `regexFilter` sur l'URL → `redirect.regexSubstitution` vers
   `interstitial.html?rid=…&mode=…&u=\0` (ou `closer.html` pour la fermeture
   d'onglet). L'URL bloquée est passée en dernier paramètre, brute (DNR n'encode pas).
2. Sur « Continuer quand même » (friction), la page interstitielle demande au service
   worker une **allowance** temporaire : règle DNR *de session* `allow` (priorité
   supérieure au redirect) + entrée dans `chrome.storage.session` + alarme d'expiration.
   Les règles de session disparaissent au redémarrage du navigateur — c'est voulu.
3. `webNavigation.onCommitted` / `onHistoryStateUpdated` couvrent ce que le DNR ne
   voit pas (SPA, bfcache) : même matching en JS, redirection de l'onglet vers
   l'interstitiel ou fermeture. Ces événements comptent aussi les visites pour la
   sévérité « observer » (à l'*entrée* sur le site, pas à chaque navigation interne).

### Modèle de données (`chrome.storage.local`)

```js
{
  rules: [{
    id: "uuid",
    name: "TikTok",
    targets: ["tiktok.com", "youtube.com/shorts"],
    severity: "observe" | "friction" | "quota" | "block",
    blockAction: "interstitial" | "closeTab",   // si severity = block
    frictionDelaySec: 10,                        // si severity = friction
    allowDurationMin: 5,                         // durée de l'accès après "continuer"
    schedule: null,      // M2 — { days: [1..5], ranges: [{from:"09:00",to:"18:00"}] }
    quotaMinutes: null,  // M2
    locked: false,       // M3
    enabled: true,
    createdAt: 1720000000000
  }],
  stats: {
    "2026-07-05": {
      "<ruleId>": { observed: 3, frictionShown: 2, continued: 1, blocked: 0 }
    }
  }
}
```

### Espace d'IDs DNR

- Règles dynamiques (compilées depuis les règles utilisateur) : IDs ≥ 1000,
  recompilation complète à chaque changement de `rules`.
- Règles de session (allowances) : IDs 1…999, alloués incrémentalement.

## Ordre de construction

1. **M1 — Socle** : moteur de règles + blocage DNR + page intermédiaire (friction et
   blocage) + options basiques (ajouter un site, sévérité, action). Déjà utilisable.
2. **M2 — Horaires et quotas** (suivi du temps actif).
3. **M3 — Mode strict** : verrouillage, délai 24 h, incognito guidé.
4. **M4 — Stats et streaks** : tableau de bord, mode discret.
5. **M5 — Finitions** : catégories prédéfinies, bouton panique, i18n FR/EN.

Chaque milestone est testable dans Chrome via « Charger l'extension non empaquetée ».
