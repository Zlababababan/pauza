# LESSONS — journal d'auto-amélioration de Claude

Fichier destiné à Claude, pas aux humains. Il voyage de projet en projet : chaque
leçon doit donc être **générale et actionnable hors contexte** — pas de référence
à des fichiers ou fonctions d'un dépôt précis. Format : une leçon = un bloc daté
avec le déclencheur (ce qui s'est mal/bien passé) et la règle à appliquer.

Protocole : lire ce fichier en début de session. Ajouter une leçon quand (1) une
erreur a nécessité une correction, (2) une approche a rapporté plus que son coût,
(3) un piège d'environnement a coûté du temps. Fusionner plutôt que dupliquer ;
supprimer ce qui s'avère faux.

---

## 2026-07-05 — Vérifier en conditions réelles trouve ce que les tests unitaires ratent

**Déclencheur :** sur une extension navigateur, 6 tests unitaires verts et une relecture
attentive n'ont détecté ni un double comptage lié à un détour de navigation, ni un
conflit de priorités entre règles déclaratives. Un banc E2E (navigateur réel piloté,
flux complets) a trouvé le premier avant livraison ; l'utilisateur a trouvé le second
en 5 minutes d'usage réel.

**Règle :** pour tout livrable interactif, construire dès le premier jalon un moyen de
dérouler les flux réels de bout en bout, et y rejouer chaque bug utilisateur avant de
le déclarer corrigé. Les tests unitaires prouvent la logique, jamais l'intégration.

## 2026-07-05 — Les états temporaires survivent aux changements de configuration

**Déclencheur :** une autorisation temporaire (5 min) accordée sous une ancienne règle
restait valide après que l'utilisateur a durci la règle — le durcissement paraissait
« cassé » pendant la durée de l'autorisation. Diagnostic difficile car le bug est
invisible en repartant d'un état propre.

**Règle :** à chaque fois qu'un système accorde des dérogations/caches/sessions à durée
de vie propre, se demander explicitement : « que deviennent-elles quand la configuration
qui les a produites change ? ». Par défaut : les invalider quand leur source disparaît ou
se durcit. Et tester le scénario « config modifiée en cours de dérogation ».

## 2026-07-05 — Priorités implicites = comportement arbitraire

**Déclencheur :** deux règles déclaratives de même priorité matchant la même URL :
le moteur (Chrome DNR) départage arbitrairement. Le comportement variait selon l'ordre
de création des règles.

**Règle :** dès que deux mécanismes peuvent s'appliquer au même objet, définir une
hiérarchie explicite et documentée (ici : la contrainte la plus stricte gagne), la
coder dans les deux voies d'exécution s'il y en a plusieurs, et l'affirmer par un test.

## 2026-07-05 — Outillage navigateur : les flags disparaissent des builds grand public

**Déclencheur :** `--load-extension` ne fonctionne plus sur Chrome stable ≥ 137 (builds
brandés) — échec silencieux, aucune erreur, l'extension n'est juste pas chargée. Perdu
du temps à chercher le bug dans le code.

**Règle :** pour automatiser un navigateur, utiliser les builds prévus pour ça (Chrome
for Testing via `@puppeteer/browsers`, Chromium) plutôt que le navigateur installé.
Plus généralement : quand un outil échoue *silencieusement*, suspecter d'abord une
restriction de l'environnement, pas son propre code.

## 2026-07-05 — Après un échec attendu, l'état observé est celui d'avant

**Déclencheur :** dans un test E2E, une navigation volontairement en échec (DNS) laissait
`page.url()` sur l'URL *précédente* ; l'assertion « pas de redirection » échouait à tort
parce qu'elle lisait l'état du test d'avant. Autre variante le même jour : des `sed`
successifs sur un script généré l'ont corrompu silencieusement — le symptôme (extension
« qui ne charge pas ») pointait ailleurs.

**Règle :** toute assertion qui suit un échec attendu doit partir d'un contexte frais
(nouvelle page, nouveau processus, répertoire propre). Et ne pas éditer un fichier
généré par `sed` successifs : le réécrire entièrement dès la deuxième retouche.

## 2026-07-05 — Un bug rapporté par l'utilisateur cache souvent deux causes

**Déclencheur :** « le blocage ne fonctionne pas » avait deux causes indépendantes
(priorités égales + autorisation résiduelle). Corriger seulement la première aurait
laissé le symptôme réapparaître par intermittence.

**Règle :** après avoir trouvé UNE cause plausible, ne pas s'arrêter : rejouer le
scénario utilisateur complet (avec son historique probable, pas depuis un état neuf)
et vérifier que le symptôme est impossible, pas seulement improbable.
