# Décroche

Extension Chrome (Manifest V3) — un compagnon de sevrage configurable, pas un simple
bloqueur. Un spectre de sévérité réglable par site : observer, freiner, limiter, bloquer.
Ton neutre et bienveillant, jamais culpabilisant. 100 % local, aucun serveur.

Voir [docs/DESIGN.md](docs/DESIGN.md) pour la conception complète.

## Installation (développement)

1. Ouvrir `chrome://extensions`
2. Activer le **Mode développeur** (en haut à droite)
3. Cliquer **Charger l'extension non empaquetée** et sélectionner ce dossier

Aucune étape de build : le code est du JavaScript vanilla en modules ES, chargé tel quel.

## Stack

- **JavaScript vanilla (modules ES), zéro bundler** : MV3 supporte les modules ES
  nativement (service worker `"type": "module"` et pages). Pas de build = rechargement
  instantané via `chrome://extensions`, pas de config à maintenir.
- **Tests** : `node --test` sur la logique pure (matching d'URL), sans dépendance.

```bash
npm test   # aucun npm install nécessaire
```

## Structure

```text
manifest.json
src/
  common/        # logique partagée : constantes, matching d'URL, accès storage
  background/    # service worker : moteur de règles DNR, allowances, navigation SPA
  pages/         # pages interstitielles (friction / blocage) et fermeture d'onglet
  options/       # gestion des règles
  popup/         # état du jour
tests/           # tests node:test de la logique pure
docs/            # conception
```

## Avancement

- [x] **M1 — Socle** : moteur de règles + blocage DNR + page intermédiaire
      (friction et blocage) + options basiques
- [x] **M2 — Horaires et quotas** (suivi du temps actif)
- [x] **M3 — Mode strict** (verrouillage, délai 24 h, incognito guidé)
- [x] **i18n FR/EN** dynamique (avancée depuis M5)
- [x] **M4 — Stats et streaks** (tableau de bord, mode discret)
- [ ] **M5 — Finitions** (catégories prédéfinies, bouton panique, i18n FR/EN)
