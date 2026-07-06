# Pauza — Privacy Policy

*Last updated: 2026-07-06 · [Version française ci-dessous](#pauza--politique-de-confidentialité)*

Pauza is a browser extension that helps you cut back on the websites that
hold you. It is designed around one principle: **everything stays on your
device.**

## What Pauza collects

**Nothing.** Pauza has no server, no account, no analytics, no telemetry,
no ads, and no third-party services. It never transmits any data anywhere.

## What Pauza stores — locally only

To do its job, Pauza keeps the following in your browser's local extension
storage (`chrome.storage`), on your device:

- the rules you create (site targets, severity, schedules, quotas);
- daily counters (visits, pauses, blocks, active minutes), kept for 90 days;
- your settings (language, discreet mode, optional PIN stored as a SHA-256
  hash, strict-mode state).

This data never leaves your device. Uninstalling the extension deletes it.
Pauza does not read, record, or transmit the content of the pages you visit,
nor your browsing history.

## Why Pauza needs its permissions

- **declarativeNetRequest** — intercept and redirect navigation to the sites
  *you* chose to limit, before the page loads. Interception rules are
  processed by the browser itself; Pauza does not see your traffic.
- **Access to all sites (`<all_urls>`)** — required so that *any* site you
  decide to target can be intercepted. Pauza only ever acts on the targets
  of your own rules.
- **tabs / webNavigation** — detect navigation to targeted sites (including
  single-page apps) and close or redirect the corresponding tab.
- **storage** — save your rules, counters and settings locally.
- **alarms** — wake up at schedule boundaries, quota expiry, or the end of
  a pause.
- **idle** — count only *active* time toward quotas (not time away from the
  keyboard).
- **notifications** — show a discreet local reminder shortly before a daily
  quota runs out.

## Changes

If a future version ever changes any of the above, this policy will be
updated and the change highlighted in the release notes. The "everything
stays on your device" principle is not up for revision.

## Contact

Questions or concerns: **zlababababan@gmail.com**

---

# Pauza — Politique de confidentialité

*Dernière mise à jour : 06/07/2026*

Pauza est une extension de navigateur qui t'aide à te détacher des sites qui
te retiennent. Elle est construite sur un principe : **tout reste sur ton
appareil.**

## Ce que Pauza collecte

**Rien.** Pauza n'a ni serveur, ni compte, ni statistiques d'usage, ni
télémétrie, ni publicité, ni service tiers. Aucune donnée n'est transmise,
nulle part, jamais.

## Ce que Pauza stocke — localement uniquement

Pour fonctionner, Pauza conserve dans le stockage local d'extension de ton
navigateur (`chrome.storage`), sur ton appareil :

- les règles que tu crées (sites ciblés, sévérité, horaires, quotas) ;
- des compteurs quotidiens (visites, pauses, blocages, minutes actives),
  conservés 90 jours ;
- tes réglages (langue, mode discret, PIN éventuel stocké sous forme de
  hachage SHA-256, état du mode strict).

Ces données ne quittent jamais ton appareil. Désinstaller l'extension les
supprime. Pauza ne lit, n'enregistre ni ne transmet le contenu des pages que
tu visites, ni ton historique de navigation.

## Pourquoi Pauza a besoin de ses permissions

- **declarativeNetRequest** — intercepter et rediriger la navigation vers les
  sites que *tu* as choisi de limiter, avant le chargement de la page. Les
  règles d'interception sont appliquées par le navigateur lui-même ; Pauza ne
  voit pas ton trafic.
- **Accès à tous les sites (`<all_urls>`)** — nécessaire pour que *n'importe
  quel* site que tu décides de cibler puisse être intercepté. Pauza n'agit
  que sur les cibles de tes propres règles.
- **tabs / webNavigation** — détecter la navigation vers les sites ciblés
  (y compris les applications monopages) et fermer ou rediriger l'onglet.
- **storage** — enregistrer localement tes règles, compteurs et réglages.
- **alarms** — se réveiller aux bornes horaires, à l'épuisement d'un quota ou
  à la fin d'une pause.
- **idle** — ne décompter que le temps *actif* des quotas (pas le temps passé
  loin du clavier).
- **notifications** — afficher un rappel local discret peu avant la fin d'un
  quota quotidien.

## Évolutions

Si une version future changeait quoi que ce soit à ce qui précède, cette
politique serait mise à jour et le changement signalé dans les notes de
version. Le principe « tout reste sur ton appareil » n'est pas négociable.

## Contact

Questions : **zlababababan@gmail.com**
