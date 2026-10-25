# larretgourmand.com — site + tableau de contrôle

Site statique hébergé sur **Cloudflare Pages**, avec des fonctions serveur (Pages Functions) et une base **D1**.
Coût : 0 €/mois (hors nom de domaine).

```
public/                      le site (un fichier HTML par URL)
  index.html                 page d'accueil (ancienne /optin)
  food-truck-traiteur.html   /food-truck-traiteur
  food-truck-entreprises.html, food-truck-mariage.html, food-truck-anniversaire.html
  mentions-legales.html      /mentions-legales
  admin/index.html           /admin : tableau de contrôle
  assets/site.css, site.js   style et script communs
  img/                       photos (jpg), favicon, image de partage og.jpg
  _redirects                 anciennes URLs ClickFunnels → nouvelles (301)
  _headers, robots.txt, sitemap.xml, 404.html
functions/
  _middleware.js             construit la carte et le carrousel depuis la base, met à jour prix / emplacements / bandeau
  api/state.js               GET /api/state
  api/devis.js               POST /api/devis : enregistre + envoie les mails (Resend)
  api/admin/[[route]].js     API du tableau de contrôle (jeton ADMIN_TOKEN) : burgers, photos, emplacements, dates, prix, demandes
  photos/[[path]].js         sert les photos envoyées depuis l'admin (stockées dans R2)
schema.sql                   structure et données initiales de la base
wrangler.toml                configuration Cloudflare
```

## Mise en ligne, pas à pas

### 1. Compte et outils (une fois)
1. Créer un compte sur https://dash.cloudflare.com (gratuit).
2. Installer Node.js (https://nodejs.org, version LTS), puis dans ce dossier : `npm install`.
3. Se connecter : `npx wrangler login` (ouvre le navigateur).

### 2. Base de données D1
```
npx wrangler d1 create larret-gourmand
```
Copier le `database_id` renvoyé dans `wrangler.toml` (ligne `database_id = "A_REMPLACER"`), puis créer les tables et les données de départ :
```
npx wrangler d1 execute larret-gourmand --remote --file=schema.sql
```

### 2 bis. Stockage des photos (R2)
```
npx wrangler r2 bucket create larret-gourmand-photos
```
(gratuit jusqu'à 10 Go ; c'est là que vont les photos envoyées depuis le tableau de contrôle).

### 3. Publier le site
Option A, en ligne de commande (le plus simple pour commencer) :
```
npx wrangler pages deploy public
```
À la première fois, Wrangler propose de créer le projet Pages : accepter le nom `larret-gourmand`.
Le site est en ligne sur `https://larret-gourmand.pages.dev` (adresse de test).

Option B, via GitHub : pousser ce dossier dans un dépôt, puis dans Cloudflare Pages > Create project > Connect to Git.
Build command : vide. Output directory : `public`. Chaque `git push` met le site à jour.

### 4. Variables et secrets
Cloudflare Pages > larret-gourmand > Settings > Variables and Secrets (environnement Production) :

| Nom | Valeur |
|---|---|
| `ADMIN_TOKEN` | une longue phrase secrète (c'est le mot de passe de /admin) |
| `RESEND_API_KEY` | clé API Resend (étape 5) |
| `MAIL_TO` | l'adresse qui reçoit les demandes (plusieurs possibles, séparées par des virgules) |
| `MAIL_FROM` | `L'Arrêt Gourmand <contact@larretgourmand.com>` |
| `TURNSTILE_SECRET` | optionnel, anti-spam (étape 7) |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | optionnels, notification Telegram à chaque demande (voir ci-dessous) |

Dans Settings > Functions, vérifier les liaisons : D1 `DB` → `larret-gourmand`, R2 `PHOTOS` → `larret-gourmand-photos` (normalement reprises de wrangler.toml).
Après avoir ajouté des variables, relancer un déploiement (Deployments > Retry, ou `npx wrangler pages deploy public`).

### 5. E-mails avec Resend (remplace Zapier)
1. Compte sur https://resend.com (gratuit : 3 000 mails/mois).
2. Domains > Add domain > `larretgourmand.com`. Resend affiche 3 enregistrements DNS (SPF, DKIM, éventuellement DMARC) à ajouter dans la zone DNS du domaine (chez Cloudflare après l'étape 6, c'est un clic « Add records »).
3. API Keys > Create : copier la clé dans `RESEND_API_KEY`.
4. Tester : envoyer une demande depuis le site. Elle apparaît dans /admin > Demandes, et un mail arrive sur `MAIL_TO`.

### 5 bis. Notification Telegram (optionnel, remplace ou complète les mails)
1. Dans Telegram, écrire à **@BotFather** → `/newbot` → choisir un nom et un identifiant → copier le *token*.
2. Écrire un message quelconque à ce nouveau bot (sinon il ne peut pas t'écrire).
3. Ouvrir `https://api.telegram.org/bot<TOKEN>/getUpdates` dans le navigateur et relever le `"chat":{"id":…}`.
4. Ajouter `TELEGRAM_BOT_TOKEN` (Secret) et `TELEGRAM_CHAT_ID` dans les variables Pages, redéployer.
Chaque demande arrive alors en notification sur le téléphone, avec un lien vers /admin. Les mails Resend restent facultatifs.

### 6. Brancher le nom de domaine
1. Cloudflare > Add a site > `larretgourmand.com` (plan Free). Cloudflare importe les DNS existants et donne 2 serveurs de noms.
2. Chez le registrar du domaine (là où il est payé), remplacer les serveurs de noms par ceux de Cloudflare. Propagation : de quelques minutes à 24 h.
3. Cloudflare Pages > larret-gourmand > Custom domains > ajouter `www.larretgourmand.com` et `larretgourmand.com`.
4. Dans Rules > Redirect Rules, rediriger `larretgourmand.com/*` vers `https://www.larretgourmand.com/$1` (301), pour garder une seule adresse comme aujourd'hui.

### 7. Anti-spam Turnstile (optionnel, recommandé)
Cloudflare > Turnstile > Add site > `larretgourmand.com`, type Managed. Copier la clé de site dans `public/index.html` (bloc commenté dans le formulaire, à décommenter) et la clé secrète dans `TURNSTILE_SECRET`.

### 8. Après la bascule
- Google Search Console : vérifier la propriété, envoyer `https://www.larretgourmand.com/sitemap.xml`.
- Vérifier que `/optin` redirige bien vers `/` (301).
- Google Tag Manager reste le même (GTM-N2TH4HN4), rien à changer.
- Fermer ClickFunnels et Zapier.

## Tableau de contrôle (/admin)
Ouvrir `https://www.larretgourmand.com/admin`, coller le jeton (`ADMIN_TOKEN`). Il reste mémorisé sur l'appareil.
Sur iPhone : Partager > « Sur l'écran d'accueil » pour l'avoir comme une appli.

- **Carte** : ajouter un burger (nom, accroche, composition, supplément, photo prise ou choisie depuis le téléphone), le modifier, le supprimer, changer l'ordre avec les flèches (le premier est mis en avant en grand), le retirer / remettre, le marquer « Épuisé ce soir » (se remet seul le lendemain). La carte du site, le carrousel du haut de page et les données structurées pour Google sont régénérés à partir de la base à chaque visite.
- **Emplacements** : suspendre un jour, modifier ville / lieu / lien carte / horaires, annuler ou déplacer une date précise.
- **Tarifs** : prix des formules et supplément par burger.
- **Bandeau** : message affiché en haut de toutes les pages.
- **Demandes** : les devis reçus, avec un statut.

Les changements sont visibles sur le site dans la minute (cache de 60 s).

## Modifier les textes
- Burgers, emplacements, prix, bandeau : depuis /admin, sans redéploiement.
- Tout le reste (textes des pages, suppléments frites, partenaires…) : directement dans les fichiers HTML de `public/`, puis `npx wrangler pages deploy public`.
- Les 7 photos de départ sont dans `public/img/` ; les photos ajoutées depuis l'admin vont dans R2 et sont servies sous `/photos/…`.
- Les burgers écrits en dur dans `index.html` ne servent que de secours si la base est injoignable : c'est la base qui fait foi.

## Tester en local
```
cp .dev.vars.example .dev.vars        # puis mettre un ADMIN_TOKEN
npx wrangler d1 execute larret-gourmand --local --file=schema.sql
npx wrangler pages dev public
```
Site sur http://localhost:8788, admin sur http://localhost:8788/admin.
(En local, mettre un `database_id` quelconque dans wrangler.toml si la base distante n'existe pas encore.)
