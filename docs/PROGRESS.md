# Décroche — Suivi du développement

Journal d'avancement du projet. Une entrée par session de travail ; les décisions
notables sont consignées pour ne pas avoir à les re-déduire du code.

## État des milestones

| Milestone | Contenu | État |
|---|---|---|
| M1 — Socle | Moteur de règles, blocage DNR, interstitiels friction/blocage, options | ✅ Livré, validé manuellement le 2026-07-05 |
| M2 — Horaires et quotas | Plages horaires par règle, suivi du temps actif, quota/jour | 🚧 En cours |
| M3 — Mode strict | Verrouillage des règles, délai 24 h, incognito guidé | ⬜ |
| M4 — Stats et streaks | Tableau de bord, mode discret (flou + PIN) | ⬜ |
| M5 — Finitions | Catégories prédéfinies, bouton panique, i18n FR/EN, icônes définitives | ⬜ |

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
