// Structure de la base et données de départ, exécutées automatiquement si les tables manquent.
// Même contenu que schema.sql (gardé lisible à la racine du projet). Toutes les requêtes sont
// « si n'existe pas » / « ignorer si déjà présent » : les relancer ne modifie jamais des données existantes.

// Alertes (notifications sur téléphone) : abonnés et historique des envois
const TABLE_ABONNES = `CREATE TABLE IF NOT EXISTS abonnes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    villes TEXT NOT NULL DEFAULT '[]',
    sujets TEXT NOT NULL DEFAULT '[]',
    actif INTEGER NOT NULL DEFAULT 1,
    appareil TEXT,
    cree TEXT NOT NULL DEFAULT (datetime('now')),
    maj TEXT NOT NULL DEFAULT (datetime('now')),
    dernier_envoi TEXT,
    echecs INTEGER NOT NULL DEFAULT 0
  )`;
const TABLE_FICHIERS = `CREATE TABLE IF NOT EXISTS fichiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL,
    type TEXT NOT NULL,
    nom TEXT,
    taille INTEGER NOT NULL DEFAULT 0,
    data BLOB NOT NULL,
    cree TEXT NOT NULL DEFAULT (datetime('now'))
  )`;
const TABLE_EVENEMENTS = `CREATE TABLE IF NOT EXISTS evenements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    date TEXT NOT NULL,
    heures TEXT,
    lieu TEXT,
    ville TEXT,
    contact TEXT,
    notes TEXT,
    rappel INTEGER NOT NULL DEFAULT 1,
    statut TEXT NOT NULL DEFAULT 'prevu',
    cree TEXT NOT NULL DEFAULT (datetime('now'))
  )`;
const TABLE_SUIVI = `CREATE TABLE IF NOT EXISTS alertes_suivi (
    alerte_id INTEGER NOT NULL,
    cle TEXT NOT NULL,
    appareil TEXT NOT NULL DEFAULT 'autre',
    envoye INTEGER NOT NULL DEFAULT 0,
    recu INTEGER NOT NULL DEFAULT 0,
    ouvert INTEGER NOT NULL DEFAULT 0,
    maj TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (alerte_id, cle)
  )`;
const TABLE_ALERTES = `CREATE TABLE IF NOT EXISTS alertes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sujet TEXT NOT NULL,
    titre TEXT NOT NULL,
    corps TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '/',
    villes TEXT NOT NULL DEFAULT '[]',
    cibles INTEGER NOT NULL DEFAULT 0,
    envoyes INTEGER NOT NULL DEFAULT 0,
    echecs INTEGER NOT NULL DEFAULT 0,
    curseur INTEGER NOT NULL DEFAULT 0,
    termine INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manuel',
    image TEXT,
    cree TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

export const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS burgers (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    accroche TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    photo TEXT NOT NULL DEFAULT '',
    supplement REAL NOT NULL DEFAULT 0,
    actif INTEGER NOT NULL DEFAULT 1,
    rupture_jusqua TEXT,
    ordre INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS emplacements (
    id TEXT PRIMARY KEY,
    jour INTEGER NOT NULL,
    ville TEXT NOT NULL,
    lieu TEXT NOT NULL,
    map_url TEXT,
    heures TEXT NOT NULL DEFAULT 'de 19h à 20h30',
    actif INTEGER NOT NULL DEFAULT 1,
    ordre INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS exceptions (
    date TEXT PRIMARY KEY,
    annule INTEGER NOT NULL DEFAULT 1,
    ville TEXT,
    lieu TEXT,
    map_url TEXT,
    heures TEXT,
    message TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS reglages (
    cle TEXT PRIMARY KEY,
    valeur TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS demandes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recu_le TEXT NOT NULL DEFAULT (datetime('now')),
    nom TEXT, tel TEXT, email TEXT,
    type TEXT, date_event TEXT, convives TEXT, lieu TEXT, message TEXT,
    moment TEXT, adresse TEXT, code_postal TEXT, ville TEXT,
    page TEXT,
    statut TEXT NOT NULL DEFAULT 'nouveau',
    mail_envoye INTEGER NOT NULL DEFAULT 0
  )`,
  TABLE_ABONNES,
  TABLE_ALERTES,
  TABLE_SUIVI,
  TABLE_FICHIERS,
  TABLE_EVENEMENTS,
  `CREATE TABLE IF NOT EXISTS devis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL UNIQUE,
    demande_id INTEGER,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    date_devis TEXT NOT NULL,
    client_nom TEXT, client_email TEXT, client_tel TEXT,
    event_date TEXT, event_moment TEXT, lieu TEXT,
    intro TEXT NOT NULL DEFAULT '[]',
    lignes TEXT NOT NULL DEFAULT '[]',
    mode TEXT NOT NULL DEFAULT 'ttc',
    total_ht REAL NOT NULL DEFAULT 0, tva REAL NOT NULL DEFAULT 0, total_ttc REAL NOT NULL DEFAULT 0, arrhes REAL NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'brouillon',
    email_objet TEXT, email_corps TEXT, envoye_le TEXT,
    pdf BLOB, pdf_token TEXT, pdf_maj TEXT,
    type TEXT NOT NULL DEFAULT 'devis', facture_de INTEGER, acompte REAL NOT NULL DEFAULT 0, payee_le TEXT,
    relance_le TEXT, relances INTEGER NOT NULL DEFAULT 0
  )`,
  `INSERT OR IGNORE INTO burgers (id, nom, accroche, description, photo, supplement, ordre) VALUES
    ('poulet',     'Le Poulet', 'Votre nouveau burger au poulet préféré !',
     'Un bun boulanger, du Poulet Français croustillant maison, du cheddar, une sauce Ranch maison, des oignons frits et du mesclun !', '/img/poulet.jpg', 0, 1),
    ('americain',  'L''Américain', 'Can I get some Burger ?',
     'Un bun boulanger, 150g de Bœuf Charolais Français, double cheddar, de la poitrine fumée, des oignons frits et une sauce burger !', '/img/americain.jpg', 1, 2),
    ('dragon',     'Le Dragon', '',
     'Un bun boulanger, 150g de Bœuf Charolais Français, du cheddar, des poivrons rouges épicés maison, une sauce épicée maison et du mesclun !', '/img/dragon.jpg', 0, 3),
    ('original',   'L''Original', 'Steak VG sur demande',
     'Un bun boulanger, 150g de Bœuf Charolais Français, du cheddar, des lamelles d''oignons rouges, des tranches de cornichons à l''aigre-douce, une tranche de tomate fraîche et du mesclun !', '/img/original.jpg', 0, 4),
    ('bbq',        'Le BBQ', 'Vous avez dit « une sauce BBQ » ?',
     'Un bun boulanger, 150g de Bœuf Charolais Français, du cheddar, des oignons frits, de la poitrine fumée, une sauce BBQ et du mesclun !', '/img/bbq.jpg', 0, 5),
    ('montagnard', 'Le Montagnard', 'Restez sur les pistes avec Le Montagnard !',
     'Un bun boulanger, 150g de Bœuf Charolais Français, du reblochon, de la poitrine fumée, des chips allumettes et du mesclun !', '/img/montagnard.jpg', 0, 6),
    ('myko',       'Le Myko', 'Le meilleur mélange sucré-salé dans un Burger !',
     'Un bun boulanger, 150g de Bœuf Charolais Français, du fromage de chèvre, de la poitrine fumée, du miel et du mesclun !', '/img/myko.jpg', 0, 7)`,
  `INSERT OR IGNORE INTO emplacements (id, jour, ville, lieu, map_url, ordre) VALUES
    ('mardi',    2, 'Triel-sur-Seine',       'Centre commercial des Châtelaines',                          'https://share.google/W1bbwJr7yw12RIJHI', 1),
    ('jeudi',    4, 'Verneuil-sur-Seine',    'Gare de Vernouillet Verneuil',                               'https://share.google/BpG23vPr2k8v9Eb2n', 2),
    ('vendredi', 5, 'Carrières-sous-Poissy', 'Angle Rue de la Reine Blanche et Chemin de Beauregard',      'https://share.google/NqgV3Ng4yHxsIs2em', 3),
    ('samedi',   6, 'Carrières-sous-Poissy', 'Place Saint-Blaise - Face à la pharmacie et à la Police Municipale', 'https://share.google/NqgV3Ng4yHxsIs2em', 4)`,
  `INSERT OR IGNORE INTO reglages (cle, valeur) VALUES
    ('prix_burger',        '11'),
    ('prix_menu_frites',   '13.5'),
    ('prix_menu_complet',  '15.5'),
    ('prix_frites',        '3.5'),
    ('sup_double',         '5'),
    ('sup_garniture',      '2'),
    ('frites_cheddar',     '2'),
    ('frites_cheddar_bacon', '3'),
    ('frites_cheddar_oignons', '2.5'),
    ('frites_complet',     '3.5'),
    ('frites_truffe',      '2'),
    ('bandeau',            ''),
    ('theme',              ''),
    ('theme_fx',           '1'),
    ('devis_email_objet',  'Votre devis L''Arrêt Gourmand – prestation du {date}'),
    ('devis_email_corps',  'Bonjour,

Nous vous remercions de l''intérêt que vous portez à nos services. Nous sommes encore disponibles à cette date, vous trouverez ci-joint un devis pour une prestation le {date} {moment}.

**Pour rappel, tous nos burgers sont préparés avec des steaks charolais de 150g, des pains boulangers et des fromages de qualité, et servis avec des frites maison.** Nous pourrons également nous adapter pour des demandes VG ou Halal si besoin.

Si ce devis vous convient, n''hésitez pas à nous le confirmer par mail afin que nous puissions poser une option sur la date en attendant la réception des arrhes.

Je reste à votre entière disposition pour toute question ou modification, par mail ou par téléphone au 06 83 82 71 49.

Cordialement,
Sylvain'),
    ('devis_facture_objet', 'Votre facture L''Arrêt Gourmand – prestation du {date}'),
    ('devis_facture_corps', 'Bonjour,

Nous vous remercions pour votre confiance. Vous trouverez ci-joint la facture n° {numero} correspondant à la prestation du {date} {moment}.

Montant total : {total}
Acompte déjà versé : {acompte}
**Reste à régler : {reste}**, par CB, chèque, espèces ou virement (coordonnées bancaires sur la facture).

Nous espérons que vous et vos convives avez passé un excellent moment, et restons à votre disposition pour une prochaine occasion.

Cordialement,
Sylvain'),
    ('devis_relance_objet', 'Votre devis L''Arrêt Gourmand – prestation du {date}'),
    ('devis_relance_corps', 'Bonjour,

Je me permets de revenir vers vous au sujet du devis n° {numero} pour votre prestation du {date} {moment}.

La date est encore disponible à ce jour : si vous souhaitez la réserver, il suffit de nous retourner le devis daté et signé avec la mention « Bon pour accord » et de verser les arrhes indiquées. N''hésitez pas si vous avez la moindre question ou si vous souhaitez ajuster la proposition.

Je reste à votre disposition par mail ou par téléphone au 06 83 82 71 49.

Cordialement,
Sylvain'),
    ('devis_contact_email','contact@larretgourmand.com'),
    ('devis_km_tarif',     '1'),
    ('schema_version',     '14')`,
];

// Crée les tables et les données de départ (sans toucher à ce qui existe déjà)
export async function ensureSchema(env) {
  await env.DB.batch(STATEMENTS.map((s) => env.DB.prepare(s)));
  await applyMigrations(env);
}

// Mises à jour appliquées une seule fois sur une base déjà en ligne (numérotées, dans l'ordre).
// Une base neuve reçoit directement le schéma complet ; une base existante rattrape les versions manquantes.
export const SCHEMA_VERSION = 14;
export const MIGRATIONS = {
  1: ['ALTER TABLE demandes ADD COLUMN moment TEXT'],
  2: ['ALTER TABLE demandes ADD COLUMN adresse TEXT', 'ALTER TABLE demandes ADD COLUMN code_postal TEXT', 'ALTER TABLE demandes ADD COLUMN ville TEXT',
      `INSERT OR IGNORE INTO reglages (cle, valeur) VALUES ('sup_double','5'),('sup_garniture','2'),('frites_cheddar','2'),('frites_cheddar_bacon','3'),('frites_cheddar_oignons','2.5'),('frites_complet','3.5'),('frites_truffe','2')`],
  3: [`UPDATE burgers SET nom = 'Le Poulet' WHERE id = 'poulet' AND nom = 'Burger au poulet'`],
  4: [`CREATE TABLE IF NOT EXISTS devis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL UNIQUE,
    demande_id INTEGER,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    date_devis TEXT NOT NULL,
    client_nom TEXT, client_email TEXT, client_tel TEXT,
    event_date TEXT, event_moment TEXT, lieu TEXT,
    intro TEXT NOT NULL DEFAULT '[]',
    lignes TEXT NOT NULL DEFAULT '[]',
    mode TEXT NOT NULL DEFAULT 'ttc',
    total_ht REAL NOT NULL DEFAULT 0, tva REAL NOT NULL DEFAULT 0, total_ttc REAL NOT NULL DEFAULT 0, arrhes REAL NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'brouillon',
    email_objet TEXT, email_corps TEXT, envoye_le TEXT
  )`,
      `INSERT OR IGNORE INTO reglages (cle, valeur) VALUES ('devis_email_objet','Votre devis L''Arrêt Gourmand – prestation du {date}'),('devis_email_corps','Bonjour,

Nous vous remercions de l''intérêt que vous portez à nos services. Nous sommes encore disponibles à cette date, vous trouverez ci-joint un devis pour une prestation le {date} {moment}.

**Pour rappel, tous nos burgers sont préparés avec des steaks charolais de 150g, des pains boulangers et des fromages de qualité, et servis avec des frites maison.** Nous pourrons également nous adapter pour des demandes VG ou Halal si besoin.

Si ce devis vous convient, n''hésitez pas à nous le confirmer par mail afin que nous puissions poser une option sur la date en attendant la réception des arrhes.

Je reste à votre entière disposition pour toute question ou modification, par mail ou par téléphone au 06 83 82 71 49.

Cordialement,
Sylvain'),('devis_contact_email','contact@larretgalette.com'),('devis_km_tarif','1')`],
  5: [`UPDATE reglages SET valeur = 'Bonjour,

Nous vous remercions de l''intérêt que vous portez à nos services. Nous sommes encore disponibles à cette date, vous trouverez ci-joint un devis pour une prestation le {date} {moment}.

**Pour rappel, tous nos burgers sont préparés avec des steaks charolais de 150g, des pains boulangers et des fromages de qualité, et servis avec des frites maison.** Nous pourrons également nous adapter pour des demandes VG ou Halal si besoin.

Si ce devis vous convient, n''hésitez pas à nous le confirmer par mail afin que nous puissions poser une option sur la date en attendant la réception des arrhes.

Je reste à votre entière disposition pour toute question ou modification, par mail ou par téléphone au 06 83 82 71 49.

Cordialement,
Sylvain' WHERE cle = 'devis_email_corps' AND valeur = 'Bonjour,

Nous vous remercions de l''intérêt que vous portez à nos services. Nous sommes encore disponibles à cette date, vous trouverez ci-joint un devis pour une prestation le {date} {moment}.

Pour rappel, tous nos burgers sont préparés avec des steaks charolais de 150g, des pains boulangers et des fromages de qualité, et servis avec des frites maison. Nous pourrons également nous adapter pour des demandes VG ou Halal si besoin.

Si ce devis vous convient, n''hésitez pas à nous le confirmer par mail afin que nous puissions poser une option sur la date en attendant la réception des arrhes.

Je reste à votre entière disposition pour toute question ou modification, par mail ou par téléphone au 06 83 82 71 49.

Cordialement,
Sylvain'`],
  6: ['ALTER TABLE devis ADD COLUMN pdf BLOB', 'ALTER TABLE devis ADD COLUMN pdf_token TEXT', 'ALTER TABLE devis ADD COLUMN pdf_maj TEXT'],
  7: ["INSERT OR IGNORE INTO reglages (cle, valeur) VALUES ('theme', ''), ('theme_fx', '1')"],
  8: [TABLE_ABONNES, TABLE_ALERTES],
  9: [TABLE_SUIVI],
  10: ['ALTER TABLE alertes ADD COLUMN image TEXT'],
  11: [TABLE_FICHIERS],
  12: ["ALTER TABLE devis ADD COLUMN type TEXT NOT NULL DEFAULT 'devis'", 'ALTER TABLE devis ADD COLUMN facture_de INTEGER', 'ALTER TABLE devis ADD COLUMN acompte REAL NOT NULL DEFAULT 0', 'ALTER TABLE devis ADD COLUMN payee_le TEXT', 'ALTER TABLE devis ADD COLUMN relance_le TEXT', 'ALTER TABLE devis ADD COLUMN relances INTEGER NOT NULL DEFAULT 0',
    `INSERT OR IGNORE INTO reglages (cle, valeur) VALUES
    ('devis_facture_objet', 'Votre facture L''Arrêt Gourmand – prestation du {date}'),
    ('devis_facture_corps', 'Bonjour,

Nous vous remercions pour votre confiance. Vous trouverez ci-joint la facture n° {numero} correspondant à la prestation du {date} {moment}.

Montant total : {total}
Acompte déjà versé : {acompte}
**Reste à régler : {reste}**, par CB, chèque, espèces ou virement (coordonnées bancaires sur la facture).

Nous espérons que vous et vos convives avez passé un excellent moment, et restons à votre disposition pour une prochaine occasion.

Cordialement,
Sylvain'),
    ('devis_relance_objet', 'Votre devis L''Arrêt Gourmand – prestation du {date}'),
    ('devis_relance_corps', 'Bonjour,

Je me permets de revenir vers vous au sujet du devis n° {numero} pour votre prestation du {date} {moment}.

La date est encore disponible à ce jour : si vous souhaitez la réserver, il suffit de nous retourner le devis daté et signé avec la mention « Bon pour accord » et de verser les arrhes indiquées. N''hésitez pas si vous avez la moindre question ou si vous souhaitez ajuster la proposition.

Je reste à votre disposition par mail ou par téléphone au 06 83 82 71 49.

Cordialement,
Sylvain')`],
  13: [TABLE_EVENEMENTS],
  14: ["UPDATE abonnes SET sujets = replace(sujets, '\"concours\"', '\"offres\"')", "UPDATE reglages SET valeur = 'contact@larretgourmand.com' WHERE cle = 'devis_contact_email'"],
};
export async function applyMigrations(env, from = 0) {
  for (let v = from + 1; v <= SCHEMA_VERSION; v++) {
    for (const sql of MIGRATIONS[v] || []) {
      try { await env.DB.prepare(sql).run(); }
      catch (e) { if (!/duplicate column/i.test(String(e?.message || e))) throw e; }
    }
  }
  await env.DB.prepare("INSERT INTO reglages (cle, valeur) VALUES ('schema_version', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").bind(String(SCHEMA_VERSION)).run();
}
