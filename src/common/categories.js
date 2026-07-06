// Catégories prédéfinies : listes de domaines curées, référencées dans les
// cibles d'une règle par un jeton « @id » (ex. "@social"). Le jeton est stocké
// tel quel dans rule.targets et résolu à chaque parsing : une mise à jour de
// ces listes profite automatiquement aux règles existantes.
//
// Domaines uniquement (les sous-domaines sont couverts par le matching) ;
// les listes visent les sites majeurs, pas l'exhaustivité — l'utilisateur
// peut toujours compléter cible par cible.

export const CATEGORIES = {
  social: [
    'facebook.com',
    'instagram.com',
    'tiktok.com',
    'x.com',
    'twitter.com',
    'snapchat.com',
    'reddit.com',
    'threads.net',
    'pinterest.com',
    'tumblr.com',
    'bsky.app',
    'discord.com',
  ],
  video: [
    'youtube.com',
    'twitch.tv',
    'kick.com',
    'netflix.com',
    'primevideo.com',
    'disneyplus.com',
    'dailymotion.com',
    'crunchyroll.com',
  ],
  news: [
    'lemonde.fr',
    'lefigaro.fr',
    'liberation.fr',
    'leparisien.fr',
    'bfmtv.com',
    'francetvinfo.fr',
    '20minutes.fr',
    'cnews.fr',
    'news.google.com',
    'bbc.com',
    'cnn.com',
    'nytimes.com',
  ],
  shopping: [
    'amazon.fr',
    'amazon.com',
    'aliexpress.com',
    'temu.com',
    'shein.com',
    'vinted.fr',
    'ebay.fr',
    'ebay.com',
    'cdiscount.com',
    'leboncoin.fr',
    'etsy.com',
    'wish.com',
  ],
  adult: [
    'pornhub.com',
    'xvideos.com',
    'xnxx.com',
    'xhamster.com',
    'redtube.com',
    'youporn.com',
    'spankbang.com',
    'onlyfans.com',
    'chaturbate.com',
    'stripchat.com',
    'livejasmin.com',
  ],
  gambling: [
    'winamax.fr',
    'betclic.fr',
    'unibet.fr',
    'unibet.com',
    'pmu.fr',
    'zebet.fr',
    'fdj.fr',
    'pokerstars.fr',
    'pokerstars.com',
    'bwin.fr',
    'bet365.com',
    'stake.com',
    'netbet.fr',
  ],
};

/**
 * Identifiant de catégorie si `raw` est un jeton "@id" connu, sinon null.
 * Tolère espaces et majuscules ("@Social " → "social").
 */
export function categoryId(raw) {
  const m = /^@([a-z]+)$/.exec(String(raw ?? '').trim().toLowerCase());
  return m && CATEGORIES[m[1]] ? m[1] : null;
}
