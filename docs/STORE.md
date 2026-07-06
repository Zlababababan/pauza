# Pauza — Fiche Chrome Web Store

Tout ce qui se copie-colle dans la [console développeur](https://chrome.google.com/webstore/devconsole).
Langue par défaut de la fiche : **anglais** ; ajouter ensuite chaque langue via
« Add language ». Le résumé (« summary ») est limité à 132 caractères — les
textes ci-dessous respectent la limite (ce sont les mêmes que `_locales`).

- **Nom** (toutes langues) : `Pauza`
- **Catégorie** : Productivity
- **Archive** : `node tools/package.cjs` → `dist/pauza-<version>.zip`
- **Captures** : `node tools/screenshots.cjs` → `dist/screenshots/<langue>/`
- **Privacy policy** (en ligne) :
  `https://github.com/Zlababababan/pauza/blob/main/docs/PRIVACY.md`

## Onglet Privacy — à remplir en anglais

**Single purpose** :

> Pauza has a single purpose: helping users limit their own use of websites
> they choose. It intercepts navigation to user-selected sites and applies the
> behaviour the user configured (visit counting, a reflection pause, a daily
> time quota, a schedule, or blocking). It has no other function and no data
> leaves the device.

**Justification des permissions** :

- `declarativeNetRequest` — Intercepts and redirects navigation to the sites
  the user chose to limit, before the page loads. Interception rules are
  compiled exclusively from the user's own rules.
- `host_permissions: <all_urls>` — Users can target any website with their
  rules, so the extension must be able to intercept navigation on any host
  the user chooses. It only ever acts on user-defined targets and never reads
  page content.
- `tabs` — Redirect or close the tab showing a site the user blocked, and
  identify the active tab to count active time toward the user's daily quotas.
- `webNavigation` — Detect single-page-app navigations (history.pushState)
  and back/forward-cache restores that bypass network interception, so the
  user's rules also apply to app-like sites such as youtube.com/shorts.
- `storage` — Store the user's rules, local statistics and settings on the
  device. Nothing is transmitted anywhere.
- `alarms` — Re-evaluate rules at schedule boundaries, daily-quota expiry,
  temporary-access expiry and at the end of the one-hour panic pause.
- `idle` — Count only active time toward daily quotas; time away from the
  device is not counted.
- `notifications` — Show a local, discreet reminder about five minutes before
  a daily quota runs out.
- Remote code : **No, I am not using remote code** (aucun code distant,
  aucune dépendance externe).

**Data usage** : cocher « This item does not collect or use user data » —
aucune collecte, tout est local (voir PRIVACY.md).

---

## English (langue par défaut)

**Summary** : A caring companion to cut back on sites that pull you in:
observe, add friction, set limits or block — at your pace, guilt-free.

**Description** :

Pauza is a caring companion that helps you cut back on the sites that hold you — not just another blocker.

Pick a severity for each site:
• Observe — nothing is blocked; visits are simply counted so you can see your patterns.
• Friction — a few seconds' pause and one question before you enter. You can always continue.
• Quota — free access up to X minutes of active time per day, then paused until tomorrow.
• Block — no access, with a kind pause page (or the tab closes — your choice).

To go further:
• Schedules — apply a rule only at certain times, or make a site available only inside a time window.
• Predefined categories — social networks, video, news, shopping, adult content, gambling — added in one click.
• Strict mode — lock your rules: softening or deleting them requires a 24-hour delay.
• Panic button — block every tracked site for one hour, in one click.
• Statistics & streaks — a clear dashboard of your last 14 days and your clean-day streaks.
• Discreet mode — blurred site names and an optional PIN, for privacy from people around you.
• Available in 7 languages: English, French, Spanish, German, Italian, Portuguese, Polish.

Private by design: no account, no server, no ads, no telemetry. Everything stays on your device. Free, forever.

And the tone matters: Pauza never guilt-trips you. Landing on a paused page is not a failure — the detour is already done.

## Français

**Summary** : Compagnon de sevrage : observe, freine ou bloque les sites qui
te retiennent — à ton rythme, sans culpabilisation.

**Description** :

Pauza est un compagnon bienveillant pour te détacher des sites qui te retiennent — pas un simple bloqueur.

Choisis une sévérité par site :
• Observer — rien n'est bloqué ; les visites sont simplement comptées pour voir tes habitudes.
• Friction — quelques secondes de pause et une question avant d'entrer. Tu peux toujours continuer.
• Quota — accès libre jusqu'à X minutes de temps actif par jour, puis pause jusqu'au lendemain.
• Blocage — aucun accès, avec une page de pause bienveillante (ou fermeture de l'onglet, au choix).

Pour aller plus loin :
• Horaires — applique une règle seulement à certains moments, ou rends un site disponible uniquement dans une plage.
• Catégories prédéfinies — réseaux sociaux, vidéo, actualités, shopping, contenu adulte, jeux d'argent — en un clic.
• Mode strict — verrouille tes règles : les assouplir ou les supprimer demande un délai de 24 h.
• Bouton panique — bloque tous tes sites suivis pendant une heure, en un clic.
• Statistiques et séries — un tableau de bord clair de tes 14 derniers jours et tes séries de jours réussis.
• Mode discret — noms de sites floutés et PIN facultatif, pour la confidentialité vis-à-vis de l'entourage.
• Disponible en 7 langues : français, anglais, espagnol, allemand, italien, portugais, polonais.

Privé par conception : pas de compte, pas de serveur, pas de pub, pas de télémétrie. Tout reste sur ton appareil. Gratuit, pour toujours.

Et le ton compte : Pauza ne culpabilise jamais. Atterrir sur une page de pause n'est pas un échec — le détour est déjà fait.

## Español

**Summary** : Un compañero amable para reducir los sitios que te atrapan:
observa, frena, limita o bloquea — a tu ritmo, sin culpa.

**Description** :

Pauza es un compañero amable que te ayuda a reducir los sitios que te atrapan — no es un bloqueador más.

Elige una severidad para cada sitio:
• Observar — no se bloquea nada; las visitas simplemente se cuentan para que veas tus hábitos.
• Fricción — unos segundos de pausa y una pregunta antes de entrar. Siempre puedes continuar.
• Cuota — acceso libre hasta X minutos de tiempo activo al día, luego pausa hasta el día siguiente.
• Bloqueo — sin acceso, con una página de pausa amable (o cierre de la pestaña, tú eliges).

Para ir más lejos:
• Horarios — aplica una regla solo en ciertos momentos, o haz que un sitio esté disponible solo dentro de una franja.
• Categorías predefinidas — redes sociales, vídeo, noticias, compras, contenido adulto, juegos de azar — en un clic.
• Modo estricto — protege tus reglas: suavizarlas o eliminarlas requiere un plazo de 24 h.
• Botón de pánico — bloquea todos tus sitios seguidos durante una hora, en un clic.
• Estadísticas y rachas — un panel claro de tus últimos 14 días y tus rachas de días logrados.
• Modo discreto — nombres de sitios difuminados y PIN opcional, privacidad frente a tu entorno.
• Disponible en 7 idiomas: español, inglés, francés, alemán, italiano, portugués, polaco.

Privado por diseño: sin cuenta, sin servidor, sin publicidad, sin telemetría. Todo se queda en tu dispositivo. Gratis, para siempre.

Y el tono importa: Pauza nunca te hace sentir culpable. Aterrizar en una página de pausa no es un fracaso — el desvío ya está hecho.

## Deutsch

**Summary** : Ein wohlwollender Begleiter gegen Seiten, die dich festhalten:
beobachten, bremsen, begrenzen oder blockieren — ohne Schuldgefühle.

**Description** :

Pauza ist ein wohlwollender Begleiter, der dir hilft, dich von Seiten zu lösen, die dich festhalten — kein gewöhnlicher Blocker.

Wähle für jede Seite eine Stufe:
• Beobachten — nichts wird blockiert; Besuche werden nur gezählt, damit du deine Muster siehst.
• Innehalten — ein paar Sekunden Pause und eine Frage vor dem Betreten. Du kannst immer weitermachen.
• Limit — freier Zugang bis X Minuten aktiver Zeit pro Tag, danach Pause bis morgen.
• Blockieren — kein Zugang, mit einer freundlichen Pausenseite (oder der Tab schließt sich — deine Wahl).

Für mehr:
• Zeitfenster — wende eine Regel nur zu bestimmten Zeiten an, oder mache eine Seite nur in einem Zeitfenster verfügbar.
• Vordefinierte Kategorien — soziale Netzwerke, Video, Nachrichten, Shopping, Inhalte für Erwachsene, Glücksspiel — mit einem Klick.
• Strikter Modus — sperre deine Regeln: Lockern oder Löschen braucht eine Frist von 24 Stunden.
• Panik-Knopf — blockiere alle begleiteten Seiten für eine Stunde, mit einem Klick.
• Statistiken & Serien — ein klares Dashboard der letzten 14 Tage und deine Serien gelungener Tage.
• Diskreter Modus — unscharfe Seitennamen und optionale PIN, Privatsphäre gegenüber deinem Umfeld.
• In 7 Sprachen verfügbar: Deutsch, Englisch, Französisch, Spanisch, Italienisch, Portugiesisch, Polnisch.

Privat by design: kein Konto, kein Server, keine Werbung, keine Telemetrie. Alles bleibt auf deinem Gerät. Kostenlos, für immer.

Und der Ton zählt: Pauza macht dir nie Vorwürfe. Auf einer Pausenseite zu landen ist kein Scheitern — der Umweg ist schon geschafft.

## Italiano

**Summary** : Un compagno gentile per ridurre i siti che ti trattengono:
osserva, rallenta, limita o blocca — al tuo ritmo, senza colpe.

**Description** :

Pauza è un compagno gentile che ti aiuta a staccarti dai siti che ti trattengono — non il solito blocker.

Scegli una severità per ogni sito:
• Osservare — non si blocca nulla; le visite vengono solo contate, per vedere le tue abitudini.
• Riflessione — qualche secondo di pausa e una domanda prima di entrare. Puoi sempre continuare.
• Limite — accesso libero fino a X minuti di tempo attivo al giorno, poi pausa fino a domani.
• Blocco — nessun accesso, con una pagina di pausa gentile (o chiusura della scheda — scegli tu).

Per andare oltre:
• Fasce orarie — applica una regola solo in certi momenti, o rendi un sito disponibile solo in una fascia.
• Categorie predefinite — social network, video, notizie, shopping, contenuti per adulti, gioco d'azzardo — in un clic.
• Modalità rigorosa — proteggi le tue regole: ammorbidirle o eliminarle richiede un preavviso di 24 ore.
• Pulsante panico — blocca tutti i siti seguiti per un'ora, con un clic.
• Statistiche e serie — un pannello chiaro degli ultimi 14 giorni e le tue serie di giornate riuscite.
• Modalità discreta — nomi dei siti sfocati e PIN facoltativo, riservatezza verso chi ti sta intorno.
• Disponibile in 7 lingue: italiano, inglese, francese, spagnolo, tedesco, portoghese, polacco.

Privato per costruzione: niente account, niente server, niente pubblicità, niente telemetria. Tutto resta sul tuo dispositivo. Gratuito, per sempre.

E il tono conta: Pauza non ti colpevolizza mai. Atterrare su una pagina di pausa non è un fallimento — la deviazione è già fatta.

## Português

**Summary** : Um companheiro gentil para reduzir os sites que te prendem:
observe, desacelere, limite ou bloqueie — no seu ritmo, sem culpa.

**Description** :

O Pauza é um companheiro gentil que ajuda você a se desprender dos sites que te prendem — não é só mais um bloqueador.

Escolha uma severidade para cada site:
• Observar — nada é bloqueado; as visitas são apenas contadas para você ver seus hábitos.
• Fricção — alguns segundos de pausa e uma pergunta antes de entrar. Você sempre pode continuar.
• Limite — acesso livre até X minutos de tempo ativo por dia, depois pausa até o dia seguinte.
• Bloqueio — nenhum acesso, com uma página de pausa acolhedora (ou fechamento da aba — você escolhe).

Para ir além:
• Horários — aplique uma regra só em certos momentos, ou deixe um site disponível só dentro de uma janela.
• Categorias predefinidas — redes sociais, vídeo, notícias, compras, conteúdo adulto, jogos de azar — em um clique.
• Modo estrito — proteja suas regras: afrouxá-las ou excluí-las exige um prazo de 24 horas.
• Botão de pânico — bloqueie todos os sites acompanhados por uma hora, em um clique.
• Estatísticas e sequências — um painel claro dos últimos 14 dias e suas sequências de dias bem-sucedidos.
• Modo discreto — nomes de sites desfocados e PIN opcional, privacidade em relação a quem está por perto.
• Disponível em 7 idiomas: português, inglês, francês, espanhol, alemão, italiano, polonês.

Privado por concepção: sem conta, sem servidor, sem anúncios, sem telemetria. Tudo fica no seu dispositivo. Gratuito, para sempre.

E o tom importa: o Pauza nunca faz você se sentir culpado. Cair numa página de pausa não é um fracasso — o desvio já foi feito.

## Polski

**Summary** : Życzliwy towarzysz w ograniczaniu stron, które cię wciągają:
obserwuj, hamuj, ograniczaj lub blokuj — w swoim tempie, bez winy.

**Description** :

Pauza to życzliwy towarzysz, który pomaga ci uwolnić się od stron, które cię wciągają — to nie jest kolejny zwykły bloker.

Wybierz poziom dla każdej strony:
• Obserwacja — nic nie jest blokowane; wizyty są tylko liczone, żebyś widział swoje nawyki.
• Zastanowienie — kilka sekund pauzy i jedno pytanie przed wejściem. Zawsze możesz kontynuować.
• Limit — swobodny dostęp do X minut aktywnego czasu dziennie, potem pauza do jutra.
• Blokada — brak dostępu, z życzliwą stroną pauzy (albo zamknięciem karty — twój wybór).

Aby pójść dalej:
• Godziny — stosuj regułę tylko w wybranych porach, albo udostępniaj stronę tylko w oknie czasowym.
• Gotowe kategorie — media społecznościowe, wideo, wiadomości, zakupy, treści dla dorosłych, hazard — jednym kliknięciem.
• Tryb ścisły — zabezpiecz swoje reguły: ich łagodzenie lub usuwanie wymaga 24 godzin zwłoki.
• Przycisk paniki — zablokuj wszystkie obserwowane strony na godzinę, jednym kliknięciem.
• Statystyki i serie — czytelny panel ostatnich 14 dni i twoje serie udanych dni.
• Tryb dyskretny — rozmyte nazwy stron i opcjonalny PIN, prywatność wobec otoczenia.
• Dostępne w 7 językach: polskim, angielskim, francuskim, hiszpańskim, niemieckim, włoskim, portugalskim.

Prywatność od podstaw: bez konta, bez serwera, bez reklam, bez telemetrii. Wszystko zostaje na twoim urządzeniu. Za darmo, na zawsze.

A ton ma znaczenie: Pauza nigdy nie obwinia. Trafienie na stronę pauzy to nie porażka — objazd już za tobą.
