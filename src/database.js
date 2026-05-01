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
    `);
    console.log("Tablas inicializadas correctamente.");
}

initDB();

// Migraciones: columnas agregadas después del schema inicial
try { db.exec(`ALTER TABLE products ADD COLUMN sale_qty INTEGER DEFAULT 1`); } catch(e) {}
try { db.exec(`ALTER TABLE products ADD COLUMN sale_unit TEXT DEFAULT 'unidades'`); } catch(e) {}

module.exports = db;
