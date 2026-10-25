// Structure de la base et données de départ, exécutées automatiquement si les tables manquent.
// Même contenu que schema.sql (gardé lisible à la racine du projet). Toutes les requêtes sont
// « si n'existe pas » / « ignorer si déjà présent » : les relancer ne modifie jamais des données existantes.

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
    moment TEXT,
    page TEXT,
    statut TEXT NOT NULL DEFAULT 'nouveau',
    mail_envoye INTEGER NOT NULL DEFAULT 0
  )`,
  `INSERT OR IGNORE INTO burgers (id, nom, accroche, description, photo, supplement, ordre) VALUES
    ('poulet',     'Burger au poulet', 'Votre nouveau burger au poulet préféré !',
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
    ('bandeau',            '')`,
];

// Crée les tables et les données de départ (sans toucher à ce qui existe déjà)
export async function ensureSchema(env) {
  await env.DB.batch(STATEMENTS.map((s) => env.DB.prepare(s)));
  await applyMigrations(env);
}

// Colonnes ajoutées après la première mise en ligne. Chaque ligne est ignorée si la colonne existe déjà.
export const MIGRATIONS = [
  'ALTER TABLE demandes ADD COLUMN moment TEXT',
];
export async function applyMigrations(env) {
  for (const sql of MIGRATIONS) {
    try { await env.DB.prepare(sql).run(); }
    catch (e) { if (!/duplicate column/i.test(String(e?.message || e))) throw e; }
  }
}
