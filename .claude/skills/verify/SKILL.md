---
name: verify
description: Vérifie l'extension Pauza en conditions réelles — Chrome for Testing headless piloté par puppeteer-core, flux friction/blocage/SPA déroulés de bout en bout.
---

# Vérifier l'extension Pauza

## Recette qui marche

```bash
# Une fois par machine :
npm i --no-save puppeteer-core
npx -y @puppeteer/browsers install chrome@stable --path .chrome

# À chaque vérification :
node tools/e2e.cjs        # 16 étapes, exit 0 si tout passe
npm test                  # logique pure (matching) — complément, pas la preuve
```

## Gotchas appris à la dure

- **Chrome stable ≥ 137 a retiré `--load-extension`** (builds brandés Google).
  Le Chrome installé sur la machine ne charge PLUS d'extension non empaquetée en
  ligne de commande. Il faut le build **Chrome for Testing** (téléchargé dans
  `.chrome/`, gitignoré). Symptôme sinon : aucune cible `service_worker` en CDP
  et liste d'extensions vide, sans aucun message d'erreur.
- Le nouveau headless (`headless: 'new'`) charge les extensions MV3 sans souci.
- L'ID d'extension se récupère depuis l'URL de la cible CDP `service_worker` ;
  `target.worker()` donne un handle pour `evaluate()` dans le service worker
  (lecture/écriture `chrome.storage`, inspection des règles DNR).
- Le DNR intercepte **avant le DNS** : les cibles de test peuvent être des
  domaines fictifs (`blocked.test`) — aucun réseau requis. Pour les flux qui
  chargent réellement une page (allowance après friction, SPA pushState), le
  script lance un serveur HTTP local sur `127.0.0.1:8123`.
- Le dépôt est en `"type": "module"` : les scripts outillage CommonJS doivent
  être en `.cjs`.

## Ce que couvre tools/e2e.cjs (M1)

Options (ajout de règle via le formulaire + rejet de cible invalide),
compilation DNR, friction (délai, continuer, allowance qui outrepasse le DNR),
blocage interstitiel, fermeture d'onglet, interception SPA par pushState,
non-sur-blocage des domaines voisins, compteurs de stats, rendu du popup,
captures d'écran des interstitiels. À étendre à chaque milestone (M2 quotas :
avancer l'horloge ou réduire le quota à 1 min ; M3 mode strict : tenter de
supprimer une règle verrouillée).
