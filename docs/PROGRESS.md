# Décroche — Suivi du développement

Journal d'avancement du projet. Une entrée par session de travail ; les décisions
notables sont consignées pour ne pas avoir à les re-déduire du code.

## État des milestones

| Milestone | Contenu | État |
| --- | --- | --- |
| M1 — Socle | Moteur de règles, blocage DNR, interstitiels friction/blocage, options | ✅ Livré, validé manuellement le 2026-07-05 |
| M2 — Horaires et quotas | Plages horaires par règle, suivi du temps actif, quota/jour | ✅ Testé par Yassin le 2026-07-05, retours corrigés le 2026-07-06 |
| M3 — Mode strict | Verrouillage des règles, délai 24 h, incognito guidé | ✅ Livré le 2026-07-06, en attente du test manuel |
| M4 — Stats et streaks | Tableau de bord, mode discret (flou + PIN) | ⬜ |
| M5 — Finitions | Catégories prédéfinies, bouton panique, icônes définitives | ⬜ |

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
- **Bug remonté par Yassin après test réel** : le blocage semblait inopérant sur
  youtube.com. Deux causes : égalité de priorité DNR entre friction et blocage
  (départage arbitraire de Chrome), et allowance de 5 min posée par le test de
  friction qui outrepassait le blocage ajouté ensuite.
- **Décision** : hiérarchie de priorités explicite — friction (1) < allowance
  (100) < blocage (200). La règle la plus stricte gagne toujours ; durcir une
  règle révoque immédiatement les allowances concernées. Re-validé par Yassin.

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
- **Soutien** : `SUPPORT_LINKS { kofi, paypal }` — en attente des URLs de Yassin.
- **M3 — mode strict** : armement 24 h / 7 j / permanent ; règles verrouillées
  gelées (garde par miroir en storage.session — la v1 comparait à l'oldValue de
  l'événement et oscillait en restaurant le sabotage, leçon consignée) ;
  suppression et désarmement anticipé soumis à un délai de 24 h, échéances
  appliquées par alarme et au réveil ; vérification incognito guidée.
- Banc E2E : 39 étapes, 2 passes stables. Seuil d'inactivité rendu configurable
  (`settings.idleSeconds`) — nécessité du banc (headless = zéro input) devenue
  option produit.

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
