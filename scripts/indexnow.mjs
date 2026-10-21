// Reports every address of the live sitemap to IndexNow (Bing, Yandex, Seznam, Naver); Bing passes them on to its partners.
// No account needed: the key is a file on the website (public/<key>.txt). Run after a production deploy:
// node scripts/indexnow.mjs
const HOST = "kikucards.de";
const KEY = "5d762edc08fb28a60a438338024dab52";

const sitemap = await (await fetch(`https://${HOST}/sitemap.xml`)).text();
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
});
console.log(`IndexNow: ${urlList.length} Adressen, Antwort ${response.status} ${await response.text()}`);
