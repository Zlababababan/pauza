# Pauza — Suivi du développement

Journal d'avancement du projet. Une entrée par session de travail ; les décisions
notables sont consignées pour ne pas avoir à les re-déduire du code.

## État des milestones

| Milestone | Contenu | État |
| --- | --- | --- |
| M1 — Socle | Moteur de règles, blocage DNR, interstitiels friction/blocage, options | ✅ Livré, validé manuellement le 2026-07-05 |
| M2 — Horaires et quotas | Plages horaires par règle, suivi du temps actif, quota/jour | ✅ Testé par le mainteneur le 2026-07-05, retours corrigés le 2026-07-06 |
| M3 — Mode strict | Verrouillage des règles, délai 24 h, incognito guidé | ✅ Testé par le mainteneur le 2026-07-06 (correctif UI cartes inclus) |
| M4 — Stats et streaks | Tableau de bord, mode discret (flou + PIN) | ✅ Livré le 2026-07-06, en attente du test manuel |
| M5 — Finitions | Catégories prédéfinies, bouton panique, icônes définitives | ✅ Livré le 2026-07-06, test manuel groupé avec M4 |

i18n FR/EN : livrée en avance (2026-07-06), sortie du périmètre M5.

Hors milestones (fil rouge) : bouton de soutien/dons discret ; préparation à une
future déclinaison mobile (voir « Portabilité » dans [DESIGN.md](DESIGN.md)).

## Journal

### 2026-07-05 — M1 livré et validé

- Socle complet : moteur DNR (redirect `regexSubstitution`), interstitiels
  friction/blocage, fermeture d'onglet sans flash, allowances de session,
  suivi SPA/bfcache, options, popup, stats du jour.
- Banc E2E (`tools/e2e.cjs`) : Chrome for Testing headless piloté par
  puppeteer-core. A détecté un vrai bug avant livraison (double comptage
  « observer » après détour par l'interstitiel).
- **Bug remonté par le mainteneur après test réel** : le blocage semblait inopérant sur
  youtube.com. Deux causes : égalité de priorité DNR entre friction et blocage
  (départage arbitraire de Chrome), et allowance de 5 min posée par le test de
  friction qui outrepassait le blocage ajouté ensuite.
- **Décision** : hiérarchie de priorités explicite — friction (1) < allowance
  (100) < blocage (200). La règle la plus stricte gagne toujours ; durcir une
  règle révoque immédiatement les allowances concernées. Re-validé par le mainteneur.

### 2026-07-05 — Pré-M2

- Docs de suivi (ce fichier), CLAUDE.md, doc d'auto-amélioration portable
  (`.claude/LESSONS.md`).
- Soutien/dons : lien discret dans les options et le popup, affiché seulement si
  `SUPPORT_URL` est renseignée dans `src/common/constants.js` (à remplir quand le
  compte Ko-fi/GitHub Sponsors existera). Décision : jamais de pub ni de vente de
  données — contradictoire avec un produit anti-addiction et la promesse « 100 %
  local ». Voir la section monétisation ci-dessous.
- M2 en cours : horaires + quotas.

### 2026-07-05 — M2 livré (en attente du test manuel)

- **Horaires** : `schedule = { days, ranges }` par règle, logique pure dans
  `src/common/schedule.js` (plages nocturnes 22h→6h gérées, rattachées au jour du
  début). Le DNR étant statique, une alarme `engine-sync` recompile aux bornes
  (prochaine borne horaire ou minuit).
- **Quotas** : temps actif = onglet actif + fenêtre au premier plan + non-idle
  (60 s). Segments persistés en `storage.session` (survivent aux siestes du
  service worker), tick 1/min pendant le suivi. Épuisement → recompilation DNR
  puis balayage des onglets déjà ouverts vers l'interstitiel « quota » ; rappel
  discret (~5 min avant, une fois/jour/règle) via notification.
- UI : quota et horaires dans le formulaire d'options, temps restant dans le
  popup, interstitiel mode quota.
- Icônes générées (placeholder, définitives en M5) ; permissions `idle` et
  `notifications` ajoutées.
- Banc E2E : 26/26, dont horaires dans/hors plage, épuisement de quota en
  conditions réelles et préséance blocage > allowance > friction.

### 2026-07-06 — Retours M2 corrigés, i18n, M3 livré

- **Retour 1 (quota + horaires)** : la plage d'une règle quota est désormais une
  fenêtre de DISPONIBILITÉ — site fermé en dehors (nouveau mode `offhours`,
  avec heure de réouverture affichée), quota décompté dedans. Pour
  friction/blocage, la plage reste une fenêtre d'application. Rejoué au banc.
- **Retour 2 (bouton « Reprendre où j'en étais »)** : détection du rebond
  (retour arrière vers une page elle-même bloquée) et du retour inefficace →
  repli vers un onglet vierge. Rejoué au banc.
- **i18n FR/EN dynamique** : dictionnaires maison (`src/common/locales/`),
  `chrome.i18n` étant figé sur la langue du navigateur. Sélecteur discret dans
  popup et options, préférence en storage, FR par défaut et langue de référence.
- **Soutien** : `SUPPORT_LINKS { kofi, paypal }` — en attente des URLs du mainteneur.
- **M3 — mode strict** : armement 24 h / 7 j / permanent ; règles verrouillées
  gelées (garde par miroir en storage.session — la v1 comparait à l'oldValue de
  l'événement et oscillait en restaurant le sabotage, leçon consignée) ;
  suppression et désarmement anticipé soumis à un délai de 24 h, échéances
  appliquées par alarme et au réveil ; vérification incognito guidée.
- Banc E2E : 39 étapes, 2 passes stables. Seuil d'inactivité rendu configurable
  (`settings.idleSeconds`) — nécessité du banc (headless = zéro input) devenue
  option produit.

### 2026-07-06 — M4 livré (tableau de bord, streaks, mode discret)

- M3 validé par le mainteneur (correctif : cartes de règles enroulables, la date sort
  du bouton d'annulation de suppression).
- **Streaks** : « jours propres » par sévérité (observe : 0 visite ; friction :
  0 poursuite ; quota : non épuisé ; blocage : 0 tentative), série courante +
  record, logique pure dans `src/common/streaks.js`.
- **Tableau de bord** (`src/dashboard/`) : une carte par règle — streak,
  colonnes des 14 derniers jours, tooltips, ligne de quota, totaux 7/30 j,
  vue tableau. Couleur de données `#1f8a5c`/`#35a271` validée par le
  validateur dataviz (chroma, bande de luminosité, contraste) sur les deux
  surfaces — l'accent UI `#3d6b5c` « lisait gris » pour des marques de données.
- **Mode discret** : noms floutés (clic pour révéler) dans popup et tableau de
  bord ; PIN 4-8 chiffres sur la page d'options (SHA-256 local — rideau de
  confidentialité assumé, pas un coffre).
- Rétention des historiques stats/usage portée à 90 jours.
- Liens de soutien : le mainteneur fournira Ko-fi + PayPal en fin de projet.
- Banc E2E : 49 étapes.

### 2026-07-06 — M5 livré (catégories, bouton panique, icônes)

- M4 en attente de test manuel (plusieurs jours) : M5 lancé en parallèle sur
  décision du mainteneur, tout sera testé ensemble.
- **Catégories prédéfinies** : jeton `@id` (ex. `@social`) stocké tel quel dans
  `rule.targets`, résolu à chaque parsing dans `parsedTargets` — DNR, suivi SPA
  et quotas couverts d'un coup, et les listes (curées dans
  `src/common/categories.js`) s'enrichiront avec les mises à jour de
  l'extension sans toucher aux règles existantes. Six catégories : réseaux
  sociaux, vidéo/streaming, actualités, shopping, contenu adulte, jeux
  d'argent. Chips cliquables dans le formulaire d'options (le textarea reste la
  source de vérité), noms traduits sur les cartes et partout où la première
  cible sert de nom (`ruleDisplayName`).
- **Bouton panique** (popup, avec confirmation) : toutes les cibles suivies —
  règles suspendues comprises, c'est le sens du bouton — bloquées 1 h.
  Décisions : non annulable (il expire seul ; `isPanicActive` fait foi, le
  storage n'est pas nettoyé à l'échéance), toujours l'interstitiel (jamais de
  fermeture d'onglet), priorité DNR 300 au-dessus des allowances et du blocage,
  même préséance côté SPA, balayage des onglets ouverts au déclenchement
  (mécanique du quota épuisé).
- **Icônes définitives** : anneau ouvert vers le haut-droit + fragment qui
  s'échappe (« décrocher », plus un spinner), SVG paramétré par taille dans
  `tools/gen-icons.cjs`.
- Banc E2E : 62 étapes, 2 passes stables. Piège rejoué : le test d'expiration
  de la panique doit viser une cible friction vierge, pas une cible ayant reçu
  une allowance plus tôt dans le banc.
- Liens de soutien : toujours en attente des URLs Ko-fi/PayPal du mainteneur
  (`SUPPORT_LINKS` prêt dans `src/common/constants.js`).

### 2026-07-06 — Retours M5 : catégories internationales, renommage en Pauza

- **Catégories enrichies** (retour le mainteneur) : ajout d'une quarantaine de sites
  internationaux (VK, Weibo, Douyin, Bilibili, Hulu, Max, Guardian, Spiegel,
  El País, Al Jazeera, Alibaba, Walmart, MercadoLibre, 888, William Hill,
  DraftKings, 1xBet…). Les listes restent « majors d'abord », complétables
  règle par règle.
- **Renommage : Décroche → Pauza** (décision le mainteneur, objectif diffusion
  internationale). « Décroche » : accent intapable hors AZERTY, sens opaque
  hors francophonie ; « Unhook » (traduction littérale) déjà pris par une
  extension YouTube connue, « Pausa » déjà pris (overlay de respiration pour
  ChatGPT). « Pauza » : pause en polonais/tchèque/croate/roumain/serbe,
  transparent dans les autres langues, aucune collision trouvée sur le Web
  Store (vérifié par le mainteneur). Renommé partout (manifest, UI, locales, docs,
  slugs internes) ; le dossier du dépôt garde son nom.
- À la publication : fiche store EN par défaut + localisation FR (`_locales`
  pour le nom/description du manifest), README en anglais, port Firefox/AMO.

### 2026-07-06 — Ko-fi branché, 7 langues, drapeaux

- **Soutien** : `SUPPORT_LINKS.kofi = https://ko-fi.com/zlababababan` (fourni
  par le mainteneur — à confirmer par un clic, Ko-fi bloque la vérification
  automatisée). PayPal volontairement laissé désactivé.
- **i18n élargie** : espagnol, allemand, italien, portugais (BR-neutre) et
  polonais, en plus du FR (référence) et de l'anglais. Test de parité
  (`tests/locales.test.js`) : mêmes clés que le FR et mêmes placeholders
  `{param}` clé par clé — le repli clé-par-clé vers le FR reste le filet.
  Pluriel polonais simplifié (forme 2–4), compromis v1 assumé.
- **Drapeaux** dans le sélecteur de langue (emoji dans les libellés).
  Limite connue : Windows affiche les emoji drapeaux en paires de lettres
  (« FR », « GB ») — rendu correct sur macOS/Linux/Android.

### 2026-07-06 — Préparation 1.0.0 (Chrome Web Store)

- M4 + M5 validés par le mainteneur (correctifs éventuels différés).
- **Manifest 1.0.0** : description localisée via `_locales` (mécanisme Chrome,
  indépendant de l'i18n maison — il pilote chrome://extensions et la fiche
  store), `default_locale: en` comme demandé (anglais par défaut, tout
  traduit). 8 dossiers : en, fr, es, de, it, pl, pt_BR, pt_PT (« pt » nu
  n'est pas une locale Chrome valide). Limite : 132 caractères.
- **`docs/PRIVACY.md`** (EN + FR) : zéro collecte, tout local, permissions
  justifiées. À publier en ligne (le store exige une URL) — le dépôt n'a pas
  encore de remote GitHub, c'est le préalable.
- **`docs/STORE.md`** : fiche complète à copier-coller — résumé + description
  en 7 langues, single purpose et justifications de permissions en anglais,
  déclaration « ne collecte aucune donnée ».
- **`tools/package.cjs`** : zip store propre (manifest, src, icons, _locales
  — 240 Ko), via bsdtar (Compress-Archive produit des archives non standard ;
  piège : un chemin absolu Windows « D:\… » est lu par bsdtar comme un hôte
  distant, d'où chemins relatifs + cwd).
- **`tools/screenshots.cjs`** : 4 captures 1280×800 par langue (FR, EN) avec
  données de démo — options, tableau de bord, popup mis en scène,
  interstitiel.
- Banc : 46 tests unitaires, E2E 62/62 (l'extension charge avec le manifest
  localisé).
- Reste pour publier : pousser le dépôt sur GitHub (URL privacy), créer le
  compte développeur (5 $), suivre `docs/STORE.md`.

## Monétisation — pistes retenues

Contraintes posées : extension gratuite pour toujours, jamais encombrante,
stockage 100 % local (donc rien qui exige un serveur ou un compte).

1. **Dons** (retenu, implémenté) : lien discret vers Ko-fi / GitHub Sponsors /
   Liberapay. Zéro friction, cohérent avec l'éthique du produit.
2. **Version « supporter » cosmétique** (piste M5+) : thèmes, icônes alternatives
   — débloqués après un don, sans jamais toucher aux fonctionnalités de sevrage.
   Les paiements Chrome Web Store n'existent plus (fermés en 2022) ; passer par
   ExtensionPay ou un simple code reçu après don.
3. **Sponsoring / subventions** (piste) : le créneau santé numérique / bien-être
   attire des bourses (fondations, programmes open source).
4. ❌ **Écartés** : publicité et revente de données (contraires au produit et à la
   promesse de confidentialité), abonnement bloquant des fonctionnalités.
