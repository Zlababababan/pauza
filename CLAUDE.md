# Pauza — instructions projet

Extension Chrome MV3 « compagnon de sevrage » : conception dans `docs/DESIGN.md`,
avancement et décisions dans `docs/PROGRESS.md` (à tenir à jour à chaque session),
recette de vérification dans `.claude/skills/verify/SKILL.md`.

## Conventions

- JavaScript vanilla, modules ES, zéro bundler : le dépôt EST l'extension.
  Les scripts d'outillage Node en CommonJS prennent l'extension `.cjs`.
- Interface et textes produit en français, ton neutre et bienveillant, jamais
  culpabilisant (i18n FR/EN prévue en M5). Échanges avec le mainteneur en français.
- Livraison milestone par milestone (plan dans `README.md`). Chaque livraison :
  vérifiée au banc E2E (`node tools/e2e.cjs`), commits par unité cohérente, puis
  **attendre le test manuel du mainteneur** avant d'enchaîner.
- Extension gratuite pour toujours, jamais encombrante, 100 % local. Pas de pub,
  pas de télémétrie, pas de vente de données. Le code doit rester portable vers
  d'autres navigateurs (mobile un jour) : APIs WebExtension standard autant que
  possible, spécificités Chrome isolées.

## Auto-amélioration

Lis `.claude/LESSONS.md` en début de session et applique ce qui s'y trouve.
Quand une leçon générale émerge (erreur corrigée, approche qui a payé, piège
d'environnement), ajoute-la — formulée pour être réutilisable dans n'importe
quel projet, ce fichier est destiné à voyager de dépôt en dépôt.
