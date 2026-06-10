const Database = require('better-sqlite3');
const path = require('path');

// Inicializar la base de datos (crea o lee database.sqlite en la raiz)
const db = new Database(path.join(__dirname, '..', 'ferreteria.sqlite'), { verbose: console.log });

// Inicializar tablas
function initDB() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS providers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            general_iva REAL DEFAULT 21.0,
            general_discount REAL DEFAULT 0.0
        );

        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            provider TEXT,
            category TEXT,
            brand TEXT,
            units TEXT,
            others TEXT,
            cost REAL NOT NULL DEFAULT 0.0,
            profit_margin REAL NOT NULL DEFAULT 50.0,
            stock INTEGER DEFAULT 0,
            min_stock INTEGER DEFAULT 0,
            last_cost_update DATETIME DEFAULT CURRENT_TIMESTAMP,
            previous_cost REAL DEFAULT 0.0,
            has_scaled_prices BOOLEAN DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS product_prices (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             product_id INTEGER NOT NULL,
             quantity INTEGER NOT NULL,
             discount_percentage REAL NOT NULL,
             FOREIGN KEY (product_id) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS corridors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            is_particular_builder BOOLEAN DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            total REAL NOT NULL,
            sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            corridor_id INTEGER,
            payment_method TEXT,
            is_fiscal_ticket BOOLEAN DEFAULT 0,
            FOREIGN KEY (corridor_id) REFERENCES corridors(id)
        );

        CREATE TABLE IF NOT EXISTS sale_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            unit_price REAL NOT NULL,
            FOREIGN KEY (sale_id) REFERENCES sales(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS stock_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            type TEXT NOT NULL,                 -- entrada / salida / ajuste / venta
            quantity INTEGER NOT NULL,          -- delta aplicado (negativo si resta)
            stock_after INTEGER NOT NULL,
            reason TEXT,
            created_at DATETIME DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (product_id) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS purchase_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT,
            status TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente / recibido_parcial / recibido
            total REAL DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now','localtime')),
            received_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS purchase_order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            qty_received INTEGER NOT NULL DEFAULT 0,
            cost REAL NOT NULL DEFAULT 0,
            FOREIGN KEY (order_id) REFERENCES purchase_orders(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        );
    `);
    console.log("Tablas inicializadas correctamente.");
}

initDB();

// Migraciones: columnas agregadas después del schema inicial
try { db.exec(`ALTER TABLE products ADD COLUMN sale_qty INTEGER DEFAULT 1`); } catch(e) {}
try { db.exec(`ALTER TABLE products ADD COLUMN sale_unit TEXT DEFAULT 'unidades'`); } catch(e) {}

// Sincronizar categorías y proveedores a partir de los productos ya cargados
// (inserta solo los que falten; corre en cada arranque sin duplicar)
try {
    const insCat = db.prepare(
        "INSERT INTO categories (name) SELECT @n WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = @n)"
    );
    db.prepare("SELECT DISTINCT category AS name FROM products WHERE category IS NOT NULL AND TRIM(category) != ''")
        .all().forEach(c => insCat.run({ n: c.name.trim() }));

    const insProv = db.prepare(
        "INSERT INTO providers (name) SELECT @n WHERE NOT EXISTS (SELECT 1 FROM providers WHERE name = @n)"
    );
    db.prepare("SELECT DISTINCT provider AS name FROM products WHERE provider IS NOT NULL AND TRIM(provider) != ''")
        .all().forEach(p => insProv.run({ n: p.name.trim() }));
} catch (e) { console.error('Sync categorías/proveedores:', e.message); }

module.exports = db;
