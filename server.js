const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./src/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Contraseña de administrador (hash + verificación) =====
function hashPassword(pw) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(pw), salt, 32).toString('hex');
    return `${salt}:${hash}`;
}
function verifyPassword(pw, stored) {
    if (!stored || !stored.includes(':')) return false;
    const [salt, hash] = stored.split(':');
    const test = crypto.scryptSync(String(pw), salt, 32).toString('hex');
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(test, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Seed de la contraseña por defecto ("admin") si todavía no hay ninguna configurada
try {
    const cfg = db.prepare('SELECT admin_password_hash FROM company_info WHERE id = 1').get();
    if (cfg && !cfg.admin_password_hash) {
        db.prepare('UPDATE company_info SET admin_password_hash = ? WHERE id = 1').run(hashPassword('admin'));
        console.log('Contraseña de admin inicial: "admin" (cambiala en Configuración).');
    }
} catch (e) { /* la columna se crea en database.js */ }

app.use(cors());
app.use(express.json({ limit: '6mb' })); // 6mb para permitir el logo en base64
app.use(express.static(path.join(__dirname, 'public')));

// ===== BACKUP AUTOMÁTICO DE LA BASE DE DATOS =====
const BACKUP_DIR = path.join(__dirname, 'backups');
const BACKUP_KEEP = 30;            // cuántos backups conservar
const BACKUP_EVERY_MS = 6 * 60 * 60 * 1000; // cada 6 horas

function stamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function backupDatabase() {
    try {
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const dest = path.join(BACKUP_DIR, `ferreteria-${stamp()}.sqlite`);
        await db.backup(dest); // backup online seguro de better-sqlite3
        // Rotación: conservar solo los últimos BACKUP_KEEP
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('ferreteria-') && f.endsWith('.sqlite'))
            .sort();
        while (files.length > BACKUP_KEEP) {
            fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
        }
        return dest;
    } catch (err) {
        console.error('Backup falló:', err.message);
        throw err;
    }
}

// Backup al arrancar (a los 5s) y cada 6 horas
setTimeout(() => backupDatabase().then(d => console.log('Backup inicial:', path.basename(d))).catch(() => {}), 5000);
setInterval(() => backupDatabase().catch(() => {}), BACKUP_EVERY_MS);

// Registra un nombre en categories/providers si todavía no existe (auto-sync al guardar productos)
function ensureNamed(table, name) {
    if (!name || !String(name).trim()) return;
    const n = String(name).trim();
    const exists = db.prepare(`SELECT 1 FROM ${table} WHERE name = ?`).get(n);
    if (!exists) db.prepare(`INSERT INTO ${table} (name) VALUES (?)`).run(n);
}

// Registra un cambio de costo en el historial (solo si el costo realmente cambió)
function logCostChange(productId, oldCost, newCost, source) {
    const o = +(oldCost || 0), n = +(newCost || 0);
    if (Math.abs(o - n) < 0.001) return;
    db.prepare(
        'INSERT INTO cost_history (product_id, cost, previous_cost, source) VALUES (?, ?, ?, ?)'
    ).run(productId, n, o, source);
}

// APIS BÁSICAS - MOCKS

// Obtener todos los productos (incluye precios escalonados)
app.get('/api/products', (req, res) => {
    try {
        const products = db.prepare('SELECT * FROM products ORDER BY name ASC').all();
        const getPrices = db.prepare(
            'SELECT quantity, discount_percentage FROM product_prices WHERE product_id = ? ORDER BY quantity ASC'
        );
        products.forEach(p => { p.scaled_prices = getPrices.all(p.id); });
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear un producto
app.post('/api/products', (req, res) => {
    try {
        const { code, name, cost, profit_margin, stock, min_stock, category, provider, brand, units, others, sale_qty, sale_unit } = req.body;
        const stmt = db.prepare('INSERT INTO products (code, name, cost, profit_margin, stock, min_stock, category, provider, brand, units, others, sale_qty, sale_unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const result = stmt.run(code, name, cost || 0, profit_margin || 50, stock || 0, min_stock || 0, category || '', provider || '', brand || '', units || '', others || '', sale_qty || 1, sale_unit || 'unidades');
        ensureNamed('categories', category);
        ensureNamed('providers', provider);
        if (cost > 0) logCostChange(result.lastInsertRowid, 0, cost, 'alta');
        res.json({ id: result.lastInsertRowid, message: 'Producto creado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Editar un producto
app.put('/api/products/:id', (req, res) => {
    try {
        const { code, name, cost, profit_margin, stock, min_stock, category, provider, brand, units, others, sale_qty, sale_unit } = req.body;
        const prev = db.prepare('SELECT cost FROM products WHERE id = ?').get(req.params.id);
        const stmt = db.prepare('UPDATE products SET code = ?, name = ?, cost = ?, profit_margin = ?, stock = ?, min_stock = ?, category = ?, provider = ?, brand = ?, units = ?, others = ?, sale_qty = ?, sale_unit = ? WHERE id = ?');
        stmt.run(code, name, cost, profit_margin, stock, min_stock || 0, category, provider, brand, units, others, sale_qty || 1, sale_unit || 'unidades', req.params.id);
        ensureNamed('categories', category);
        ensureNamed('providers', provider);
        if (prev) logCostChange(req.params.id, prev.cost, cost, 'edición');
        res.json({ message: 'Producto actualizado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar un producto
app.delete('/api/products/:id', (req, res) => {
    try {
        const stmt = db.prepare('DELETE FROM products WHERE id = ?');
        stmt.run(req.params.id);
        res.json({ message: 'Producto eliminado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Guardar precios escalonados de un producto (reemplaza todos)
app.post('/api/products/:id/prices', (req, res) => {
    try {
        const id = req.params.id;
        const tiers = (req.body.tiers || [])
            .slice(0, 3)
            .filter(t => t.quantity > 0 && t.discount_percentage > 0);

        const deleteOld = db.prepare('DELETE FROM product_prices WHERE product_id = ?');
        const insertNew = db.prepare(
            'INSERT INTO product_prices (product_id, quantity, discount_percentage) VALUES (?, ?, ?)'
        );
        const updateFlag = db.prepare('UPDATE products SET has_scaled_prices = ? WHERE id = ?');

        db.transaction(() => {
            deleteOld.run(id);
            tiers.forEach(t => insertNew.run(id, t.quantity, t.discount_percentage));
            updateFlag.run(tiers.length > 0 ? 1 : 0, id);
        })();

        res.json({ message: 'Precios escalonados guardados' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== CATEGORÍAS =====

app.get('/api/categories', (req, res) => {
    try {
        res.json(db.prepare('SELECT * FROM categories ORDER BY name ASC').all());
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/categories', (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
        if (db.prepare('SELECT 1 FROM categories WHERE name = ?').get(name))
            return res.status(409).json({ error: 'Esa categoría ya existe' });
        const r = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
        res.json({ id: r.lastInsertRowid, message: 'Categoría creada' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/categories/:id', (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
        const old = db.prepare('SELECT name FROM categories WHERE id = ?').get(req.params.id);
        if (!old) return res.status(404).json({ error: 'Categoría no encontrada' });
        db.transaction(() => {
            db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, req.params.id);
            // Propagar el rename a los productos que la usaban
            db.prepare('UPDATE products SET category = ? WHERE category = ?').run(name, old.name);
        })();
        res.json({ message: 'Categoría actualizada' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/categories/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
        res.json({ message: 'Categoría eliminada' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== PROVEEDORES =====

app.get('/api/providers', (req, res) => {
    try {
        res.json(db.prepare('SELECT * FROM providers ORDER BY name ASC').all());
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/providers', (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
        if (db.prepare('SELECT 1 FROM providers WHERE name = ?').get(name))
            return res.status(409).json({ error: 'Ese proveedor ya existe' });
        const { general_iva, general_discount } = req.body;
        const r = db.prepare('INSERT INTO providers (name, general_iva, general_discount) VALUES (?, ?, ?)')
            .run(name, general_iva ?? 21.0, general_discount ?? 0.0);
        res.json({ id: r.lastInsertRowid, message: 'Proveedor creado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/providers/:id', (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
        const old = db.prepare('SELECT name FROM providers WHERE id = ?').get(req.params.id);
        if (!old) return res.status(404).json({ error: 'Proveedor no encontrado' });
        const { general_iva, general_discount } = req.body;
        db.transaction(() => {
            db.prepare('UPDATE providers SET name = ?, general_iva = ?, general_discount = ? WHERE id = ?')
                .run(name, general_iva ?? 21.0, general_discount ?? 0.0, req.params.id);
            db.prepare('UPDATE products SET provider = ? WHERE provider = ?').run(name, old.name);
        })();
        res.json({ message: 'Proveedor actualizado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/providers/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM providers WHERE id = ?').run(req.params.id);
        res.json({ message: 'Proveedor eliminado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== VENTAS =====

// Registrar una venta: guarda sale + sale_items y descuenta stock (transacción atómica)
app.post('/api/sales', (req, res) => {
    try {
        const { items, total, payment_method, is_fiscal_ticket, corridor_id } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'El carrito está vacío' });
        }
        if (typeof total !== 'number' || total < 0) {
            return res.status(400).json({ error: 'Total inválido' });
        }

        const getProduct = db.prepare('SELECT id, name, stock FROM products WHERE id = ?');
        // sale_date en hora local (no UTC) para que la caja por día sea correcta en AR (UTC-3)
        const insertSale = db.prepare(
            "INSERT INTO sales (total, payment_method, is_fiscal_ticket, corridor_id, sale_date) VALUES (?, ?, ?, ?, datetime('now', 'localtime'))"
        );
        const insertItem = db.prepare(
            'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
        );
        const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
        const logMovement = db.prepare(
            "INSERT INTO stock_movements (product_id, type, quantity, stock_after, reason) VALUES (?, 'venta', ?, ?, ?)"
        );

        const saleId = db.transaction(() => {
            // Validar que todos los productos existan antes de tocar nada
            for (const it of items) {
                const qty = parseInt(it.quantity);
                if (!getProduct.get(it.product_id)) {
                    throw new Error(`El producto ${it.product_id} ya no existe`);
                }
                if (!Number.isFinite(qty) || qty <= 0) {
                    throw new Error('Cantidad inválida en un ítem');
                }
            }

            const sale = insertSale.run(
                total,
                payment_method || 'efectivo',
                is_fiscal_ticket ? 1 : 0,
                corridor_id || null
            );
            const id = sale.lastInsertRowid;

            for (const it of items) {
                const qty = parseInt(it.quantity);
                const prod = getProduct.get(it.product_id);
                insertItem.run(id, it.product_id, qty, it.unit_price);
                updateStock.run(qty, it.product_id);
                logMovement.run(it.product_id, -qty, prod.stock - qty, `Venta #${id}`);
            }
            return id;
        })();

        res.json({ id: saleId, message: 'Venta registrada' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Listar ventas (historial; opcional ?date=YYYY-MM-DD para filtrar por día)
app.get('/api/sales', (req, res) => {
    try {
        let rows;
        if (req.query.date) {
            rows = db.prepare(
                "SELECT * FROM sales WHERE date(sale_date) = ? ORDER BY sale_date DESC"
            ).all(req.query.date);
        } else {
            rows = db.prepare('SELECT * FROM sales ORDER BY sale_date DESC LIMIT 200').all();
        }
        const getItems = db.prepare(
            `SELECT si.quantity, si.unit_price, p.code, p.name
             FROM sale_items si LEFT JOIN products p ON p.id = si.product_id
             WHERE si.sale_id = ?`
        );
        rows.forEach(s => { s.items = getItems.all(s.id); });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== STOCK =====

// Ajustar stock de un producto y registrar el movimiento (transacción atómica)
// body: { type: 'entrada'|'salida'|'ajuste', quantity, reason }
app.post('/api/products/:id/stock', (req, res) => {
    try {
        const { type, quantity, reason } = req.body;
        const qty = parseInt(quantity);
        if (!['entrada', 'salida', 'ajuste'].includes(type)) {
            return res.status(400).json({ error: 'Tipo de movimiento inválido' });
        }
        if (!Number.isFinite(qty) || qty < 0) {
            return res.status(400).json({ error: 'Cantidad inválida' });
        }

        const prod = db.prepare('SELECT id, stock FROM products WHERE id = ?').get(req.params.id);
        if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });

        // Calcular nuevo stock y delta según el tipo
        let newStock, delta;
        if (type === 'entrada') { delta = qty; newStock = prod.stock + qty; }
        else if (type === 'salida') { delta = -qty; newStock = prod.stock - qty; }
        else { newStock = qty; delta = qty - prod.stock; } // ajuste = fijar a un valor

        const result = db.transaction(() => {
            db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, prod.id);
            db.prepare(
                'INSERT INTO stock_movements (product_id, type, quantity, stock_after, reason) VALUES (?, ?, ?, ?, ?)'
            ).run(prod.id, type, delta, newStock, (reason || '').trim() || null);
            return newStock;
        })();

        res.json({ stock: result, message: 'Stock actualizado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Fijar el stock mínimo de un producto
app.put('/api/products/:id/min-stock', (req, res) => {
    try {
        const min = parseInt(req.body.min_stock);
        if (!Number.isFinite(min) || min < 0) {
            return res.status(400).json({ error: 'Stock mínimo inválido' });
        }
        const r = db.prepare('UPDATE products SET min_stock = ? WHERE id = ?').run(min, req.params.id);
        if (r.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json({ message: 'Stock mínimo actualizado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Historial de movimientos de un producto (últimos 50)
app.get('/api/products/:id/movements', (req, res) => {
    try {
        const rows = db.prepare(
            'SELECT * FROM stock_movements WHERE product_id = ? ORDER BY id DESC LIMIT 50'
        ).all(req.params.id);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Ficha completa de un producto: datos + historial de costos + movimientos de stock
app.get('/api/products/:id/detail', (req, res) => {
    try {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
        if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
        product.scaled_prices = db.prepare(
            'SELECT quantity, discount_percentage FROM product_prices WHERE product_id = ? ORDER BY quantity ASC'
        ).all(product.id);
        const costHistory = db.prepare(
            'SELECT cost, previous_cost, source, changed_at FROM cost_history WHERE product_id = ? ORDER BY id DESC LIMIT 50'
        ).all(req.params.id);
        const movements = db.prepare(
            'SELECT type, quantity, stock_after, reason, created_at FROM stock_movements WHERE product_id = ? ORDER BY id DESC LIMIT 50'
        ).all(req.params.id);
        res.json({ product, costHistory, movements });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== PEDIDOS A PROVEEDOR =====

// Sugerencias de reposición: productos sin stock o en/bajo el mínimo, agrupados por proveedor.
// suggested = cantidad sugerida a pedir para llegar a 2x el mínimo (o 1 si no hay mínimo).
app.get('/api/restock-suggestions', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT id, code, name, provider, stock, min_stock, cost
            FROM products
            WHERE stock <= 0 OR (min_stock > 0 AND stock <= min_stock)
            ORDER BY provider COLLATE NOCASE, name COLLATE NOCASE
        `).all();

        const groups = {};
        rows.forEach(p => {
            const prov = (p.provider && p.provider.trim()) ? p.provider.trim() : 'Sin proveedor';
            if (!groups[prov]) groups[prov] = [];
            const target = p.min_stock > 0 ? p.min_stock * 2 : 1;
            const suggested = Math.max(target - p.stock, 1);
            groups[prov].push({ ...p, suggested });
        });

        res.json(Object.entries(groups).map(([provider, items]) => ({ provider, items })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Listar pedidos (con conteo de ítems)
app.get('/api/purchase-orders', (req, res) => {
    try {
        const orders = db.prepare('SELECT * FROM purchase_orders ORDER BY id DESC').all();
        const stats = db.prepare(
            'SELECT COUNT(*) c, COALESCE(SUM(quantity),0) q FROM purchase_order_items WHERE order_id = ?'
        );
        orders.forEach(o => { const s = stats.get(o.id); o.item_count = s.c; o.total_qty = s.q; });
        res.json(orders);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Detalle de un pedido (con sus ítems)
app.get('/api/purchase-orders/:id', (req, res) => {
    try {
        const order = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
        order.items = db.prepare(`
            SELECT poi.*, p.code, p.name, p.stock
            FROM purchase_order_items poi LEFT JOIN products p ON p.id = poi.product_id
            WHERE poi.order_id = ?`).all(order.id);
        res.json(order);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Crear pedido
app.post('/api/purchase-orders', (req, res) => {
    try {
        const { provider, items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'El pedido no tiene ítems' });
        }
        const valid = items.filter(it => parseInt(it.quantity) > 0);
        if (valid.length === 0) return res.status(400).json({ error: 'Ninguna cantidad válida' });

        const total = valid.reduce((s, it) => s + (parseFloat(it.cost) || 0) * parseInt(it.quantity), 0);
        const insOrder = db.prepare("INSERT INTO purchase_orders (provider, status, total) VALUES (?, 'pendiente', ?)");
        const insItem = db.prepare('INSERT INTO purchase_order_items (order_id, product_id, quantity, cost) VALUES (?, ?, ?, ?)');

        const id = db.transaction(() => {
            const r = insOrder.run(provider || 'Sin proveedor', total);
            const oid = r.lastInsertRowid;
            valid.forEach(it => insItem.run(oid, it.product_id, parseInt(it.quantity), parseFloat(it.cost) || 0));
            return oid;
        })();

        res.json({ id, message: 'Pedido creado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Recibir mercadería (parcial o total): suma stock, registra movimiento y costo de compra
app.post('/api/purchase-orders/:id/receive', (req, res) => {
    try {
        const order = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
        if (order.status === 'recibido') return res.status(400).json({ error: 'El pedido ya fue recibido por completo' });

        const received = req.body.items || []; // [{ item_id, qty_received }]
        const getItem = db.prepare('SELECT * FROM purchase_order_items WHERE id = ? AND order_id = ?');
        const getProd = db.prepare('SELECT id, stock, cost FROM products WHERE id = ?');
        const updItem = db.prepare('UPDATE purchase_order_items SET qty_received = qty_received + ? WHERE id = ?');
        const updStock = db.prepare(
            "UPDATE products SET stock = stock + ?, cost = ?, previous_cost = ?, last_cost_update = datetime('now','localtime') WHERE id = ?"
        );
        const logMov = db.prepare(
            "INSERT INTO stock_movements (product_id, type, quantity, stock_after, reason) VALUES (?, 'entrada', ?, ?, ?)"
        );

        const applied = db.transaction(() => {
            let count = 0;
            for (const r of received) {
                const qty = parseInt(r.qty_received);
                if (!Number.isFinite(qty) || qty <= 0) continue;
                const item = getItem.get(r.item_id, order.id);
                if (!item) continue;
                const prod = getProd.get(item.product_id);
                if (!prod) continue;
                const newStock = prod.stock + qty;
                // Registrar costo de compra solo si el pedido trae un costo > 0
                const newCost = item.cost > 0 ? item.cost : prod.cost;
                updStock.run(qty, newCost, prod.cost, item.product_id);
                updItem.run(qty, item.id);
                logMov.run(item.product_id, qty, newStock, `Recepción pedido #${order.id}`);
                logCostChange(item.product_id, prod.cost, newCost, 'compra');
                count++;
            }

            // Recalcular estado del pedido
            const its = db.prepare('SELECT quantity, qty_received FROM purchase_order_items WHERE order_id = ?').all(order.id);
            const allDone = its.every(i => i.qty_received >= i.quantity);
            const anyDone = its.some(i => i.qty_received > 0);
            const status = allDone ? 'recibido' : (anyDone ? 'recibido_parcial' : 'pendiente');
            db.prepare(
                "UPDATE purchase_orders SET status = ?, received_at = CASE WHEN ? = 'recibido' THEN datetime('now','localtime') ELSE received_at END WHERE id = ?"
            ).run(status, status, order.id);
            return count;
        })();

        if (applied === 0) return res.status(400).json({ error: 'No se indicó ninguna cantidad a recibir' });
        res.json({ message: 'Recepción registrada' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Eliminar pedido (solo si sigue pendiente, sin mercadería recibida)
app.delete('/api/purchase-orders/:id', (req, res) => {
    try {
        const order = db.prepare('SELECT status FROM purchase_orders WHERE id = ?').get(req.params.id);
        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
        if (order.status !== 'pendiente') {
            return res.status(400).json({ error: 'No se puede eliminar un pedido con mercadería ya recibida' });
        }
        db.transaction(() => {
            db.prepare('DELETE FROM purchase_order_items WHERE order_id = ?').run(req.params.id);
            db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(req.params.id);
        })();
        res.json({ message: 'Pedido eliminado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== CORREDORES Y CUENTA CORRIENTE =====

// Saldo (deuda) de un corredor = ventas a cuenta corriente - pagos recibidos
function corridorBalance(id) {
    const charges = db.prepare(
        "SELECT COALESCE(SUM(total),0) t FROM sales WHERE corridor_id = ? AND payment_method = 'cuenta_corriente'"
    ).get(id).t;
    const payments = db.prepare(
        'SELECT COALESCE(SUM(amount),0) t FROM corridor_payments WHERE corridor_id = ?'
    ).get(id).t;
    return { charges, payments, balance: charges - payments };
}

// Listar corredores con su saldo
app.get('/api/corridors', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM corridors ORDER BY name COLLATE NOCASE').all();
        rows.forEach(c => { c.balance = corridorBalance(c.id).balance; });
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Detalle de un corredor: datos + saldo + estado de cuenta (ventas y pagos con saldo corrido)
app.get('/api/corridors/:id', (req, res) => {
    try {
        const c = db.prepare('SELECT * FROM corridors WHERE id = ?').get(req.params.id);
        if (!c) return res.status(404).json({ error: 'Corredor no encontrado' });
        const bal = corridorBalance(c.id);

        const sales = db.prepare(
            "SELECT id, sale_date AS date, total FROM sales WHERE corridor_id = ? AND payment_method = 'cuenta_corriente'"
        ).all(c.id).map(s => ({ type: 'venta', date: s.date, ref: `Venta #${s.id}`, debit: s.total, credit: 0 }));

        const payments = db.prepare(
            'SELECT id, created_at AS date, amount, method, note FROM corridor_payments WHERE corridor_id = ?'
        ).all(c.id).map(p => ({
            type: 'pago', date: p.date,
            ref: `Pago${p.method ? ' (' + p.method + ')' : ''}${p.note ? ' · ' + p.note : ''}`,
            debit: 0, credit: p.amount
        }));

        // Ordenar cronológicamente y calcular saldo corrido
        const movements = [...sales, ...payments].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        let running = 0;
        movements.forEach(m => { running += m.debit - m.credit; m.balance = running; });

        res.json({ ...c, ...bal, movements });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Crear corredor
app.post('/api/corridors', (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
        const { discount_percentage, is_particular_builder, phone, notes } = req.body;
        const r = db.prepare(
            'INSERT INTO corridors (name, discount_percentage, is_particular_builder, phone, notes) VALUES (?, ?, ?, ?, ?)'
        ).run(name, discount_percentage || 0, is_particular_builder ? 1 : 0, (phone || '').trim(), (notes || '').trim());
        res.json({ id: r.lastInsertRowid, message: 'Corredor creado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Editar corredor
app.put('/api/corridors/:id', (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
        const { discount_percentage, is_particular_builder, phone, notes } = req.body;
        const r = db.prepare(
            'UPDATE corridors SET name = ?, discount_percentage = ?, is_particular_builder = ?, phone = ?, notes = ? WHERE id = ?'
        ).run(name, discount_percentage || 0, is_particular_builder ? 1 : 0, (phone || '').trim(), (notes || '').trim(), req.params.id);
        if (r.changes === 0) return res.status(404).json({ error: 'Corredor no encontrado' });
        res.json({ message: 'Corredor actualizado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Eliminar corredor (solo si no tiene ventas ni pagos)
app.delete('/api/corridors/:id', (req, res) => {
    try {
        const hasSales = db.prepare('SELECT 1 FROM sales WHERE corridor_id = ? LIMIT 1').get(req.params.id);
        const hasPays = db.prepare('SELECT 1 FROM corridor_payments WHERE corridor_id = ? LIMIT 1').get(req.params.id);
        if (hasSales || hasPays) {
            return res.status(400).json({ error: 'No se puede eliminar: el corredor tiene movimientos registrados' });
        }
        db.prepare('DELETE FROM corridors WHERE id = ?').run(req.params.id);
        res.json({ message: 'Corredor eliminado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Registrar un pago / cobranza de un corredor
app.post('/api/corridors/:id/payments', (req, res) => {
    try {
        const amount = parseFloat(req.body.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ error: 'Importe inválido' });
        }
        const c = db.prepare('SELECT id FROM corridors WHERE id = ?').get(req.params.id);
        if (!c) return res.status(404).json({ error: 'Corredor no encontrado' });
        const { method, note } = req.body;
        db.prepare('INSERT INTO corridor_payments (corridor_id, amount, method, note) VALUES (?, ?, ?, ?)')
            .run(req.params.id, amount, (method || 'efectivo'), (note || '').trim());
        res.json({ message: 'Pago registrado', balance: corridorBalance(req.params.id).balance });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== DASHBOARD / ESTADÍSTICAS =====

app.get('/api/dashboard', (req, res) => {
    try {
        const num = v => (v || 0);
        const todayStr = db.prepare("SELECT date('now','localtime') d").get().d;
        const curMonth = db.prepare("SELECT strftime('%Y-%m','now','localtime') m").get().m;
        const prevMonth = db.prepare("SELECT strftime('%Y-%m', date('now','localtime','start of month','-1 month')) m").get().m;

        // KPIs
        const today = db.prepare("SELECT COALESCE(SUM(total),0) t, COUNT(*) c FROM sales WHERE date(sale_date) = ?").get(todayStr);
        const month = db.prepare("SELECT COALESCE(SUM(total),0) t, COUNT(*) c FROM sales WHERE strftime('%Y-%m', sale_date) = ?").get(curMonth);
        const prev = db.prepare("SELECT COALESCE(SUM(total),0) t FROM sales WHERE strftime('%Y-%m', sale_date) = ?").get(prevMonth);

        // Ganancia estimada del mes (precio de venta - costo actual del producto)
        const profit = db.prepare(`
            SELECT COALESCE(SUM((si.unit_price - p.cost) * si.quantity), 0) g
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            LEFT JOIN products p ON p.id = si.product_id
            WHERE strftime('%Y-%m', s.sale_date) = ?
        `).get(curMonth).g;

        // Ventas por día (últimos 14 días), rellenando los días sin ventas
        const rows = db.prepare(`
            SELECT date(sale_date) d, COALESCE(SUM(total),0) t, COUNT(*) c
            FROM sales WHERE date(sale_date) >= date('now','localtime','-13 days')
            GROUP BY date(sale_date)
        `).all();
        const byDay = {};
        rows.forEach(r => { byDay[r.d] = { total: r.t, count: r.c }; });
        const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const base = new Date(todayStr + 'T12:00:00');
        const daily = [];
        for (let i = 13; i >= 0; i--) {
            const dt = new Date(base);
            dt.setDate(dt.getDate() - i);
            const key = fmt(dt);
            daily.push({ date: key, total: byDay[key] ? byDay[key].total : 0, count: byDay[key] ? byDay[key].count : 0 });
        }

        // Top productos del mes (por cantidad)
        const topProducts = db.prepare(`
            SELECT p.code, p.name, SUM(si.quantity) qty, SUM(si.quantity * si.unit_price) revenue
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            LEFT JOIN products p ON p.id = si.product_id
            WHERE strftime('%Y-%m', s.sale_date) = ?
            GROUP BY si.product_id
            ORDER BY qty DESC LIMIT 8
        `).all(curMonth);

        // Desglose por medio de pago (mes)
        const byMethod = db.prepare(`
            SELECT payment_method method, COUNT(*) count, COALESCE(SUM(total),0) total
            FROM sales WHERE strftime('%Y-%m', sale_date) = ?
            GROUP BY payment_method ORDER BY total DESC
        `).all(curMonth);

        // Extras de otros módulos
        const lowStock = db.prepare("SELECT COUNT(*) c FROM products WHERE stock <= 0 OR (min_stock > 0 AND stock <= min_stock)").get().c;
        const charges = db.prepare("SELECT COALESCE(SUM(total),0) t FROM sales WHERE payment_method='cuenta_corriente'").get().t;
        const payments = db.prepare("SELECT COALESCE(SUM(amount),0) t FROM corridor_payments").get().t;

        const monthChange = prev.t > 0 ? ((month.t - prev.t) / prev.t) * 100 : null;

        res.json({
            today: { total: num(today.t), count: num(today.c) },
            month: { total: num(month.t), count: num(month.c), avg: month.c ? month.t / month.c : 0, profit: num(profit) },
            prevMonthTotal: num(prev.t),
            monthChange,
            daily,
            topProducts,
            byMethod,
            extras: { lowStock: num(lowStock), corridorDebt: num(charges - payments) }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== DATOS DE LA EMPRESA (CONFIGURACIÓN) =====

// Obtener los datos de la ferretería
app.get('/api/company', (req, res) => {
    try {
        const row = db.prepare('SELECT * FROM company_info WHERE id = 1').get();
        res.json(row || {});
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Guardar/actualizar los datos de la ferretería (fila única id=1)
app.put('/api/company', (req, res) => {
    try {
        const { name, cuit, iva_condition, address, phone, email, logo, footer_note, auto_ticket } = req.body;
        db.prepare(`
            UPDATE company_info SET
                name = ?, cuit = ?, iva_condition = ?, address = ?,
                phone = ?, email = ?, logo = ?, footer_note = ?, auto_ticket = ?
            WHERE id = 1
        `).run(
            (name || '').trim(), (cuit || '').trim(), (iva_condition || '').trim(), (address || '').trim(),
            (phone || '').trim(), (email || '').trim(), logo || '', (footer_note || '').trim(), auto_ticket ? 1 : 0
        );
        res.json({ message: 'Datos guardados' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== CAJA: APERTURA / CIERRE (ARQUEO) =====

// Efectivo esperado = fondo inicial + ventas en efectivo - gastos en efectivo (desde la apertura)
function expectedCash(session) {
    const cash = db.prepare(
        "SELECT COALESCE(SUM(total),0) t, COUNT(*) c FROM sales WHERE payment_method = 'efectivo' AND sale_date >= ?"
    ).get(session.opened_at);
    const exp = db.prepare(
        "SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE payment_method = 'efectivo' AND expense_date >= ?"
    ).get(session.opened_at);
    return {
        cashSales: cash.t, cashCount: cash.c, cashExpenses: exp.t,
        expected: session.opening_amount + cash.t - exp.t
    };
}

// Estado de la caja: sesión abierta (si hay) con el efectivo esperado calculado
app.get('/api/cash/current', (req, res) => {
    try {
        const s = db.prepare("SELECT * FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1").get();
        if (!s) return res.json({ open: false });
        const calc = expectedCash(s);
        res.json({ open: true, session: s, ...calc });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Abrir caja
app.post('/api/cash/open', (req, res) => {
    try {
        const existing = db.prepare("SELECT 1 FROM cash_sessions WHERE status = 'open' LIMIT 1").get();
        if (existing) return res.status(400).json({ error: 'Ya hay una caja abierta' });
        const opening = parseFloat(req.body.opening_amount) || 0;
        if (opening < 0) return res.status(400).json({ error: 'El fondo inicial no puede ser negativo' });
        const r = db.prepare("INSERT INTO cash_sessions (opening_amount, status) VALUES (?, 'open')").run(opening);
        res.json({ id: r.lastInsertRowid, message: 'Caja abierta' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Cerrar caja (arqueo): registra el efectivo contado y la diferencia
app.post('/api/cash/close', (req, res) => {
    try {
        const s = db.prepare("SELECT * FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1").get();
        if (!s) return res.status(400).json({ error: 'No hay una caja abierta' });
        const counted = parseFloat(req.body.counted_amount);
        if (!Number.isFinite(counted) || counted < 0) return res.status(400).json({ error: 'Importe contado inválido' });
        const { expected } = expectedCash(s);
        const difference = counted - expected;
        db.prepare(`
            UPDATE cash_sessions SET status='closed', closed_at=datetime('now','localtime'),
                counted_amount=?, expected_amount=?, difference=?, notes=? WHERE id=?
        `).run(counted, expected, difference, (req.body.notes || '').trim(), s.id);
        res.json({ message: 'Caja cerrada', expected, counted, difference });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Historial de cierres de caja
app.get('/api/cash/history', (req, res) => {
    try {
        res.json(db.prepare("SELECT * FROM cash_sessions WHERE status='closed' ORDER BY id DESC LIMIT 60").all());
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== BACKUP MANUAL =====
app.post('/api/backup', async (req, res) => {
    try {
        const dest = await backupDatabase();
        res.json({ message: 'Backup creado', file: path.basename(dest) });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo crear el backup: ' + err.message });
    }
});

app.get('/api/backups', (req, res) => {
    try {
        if (!fs.existsSync(BACKUP_DIR)) return res.json([]);
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('ferreteria-') && f.endsWith('.sqlite'))
            .map(f => {
                const st = fs.statSync(path.join(BACKUP_DIR, f));
                return { file: f, size: st.size, mtime: st.mtime };
            })
            .sort((a, b) => b.mtime - a.mtime);
        res.json(files);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== AUTENTICACIÓN (ADMIN) =====

app.post('/api/auth/login', (req, res) => {
    try {
        const cfg = db.prepare('SELECT admin_password_hash FROM company_info WHERE id = 1').get();
        const ok = verifyPassword(req.body.password || '', cfg && cfg.admin_password_hash);
        res.json({ ok: !!ok });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/auth/password', (req, res) => {
    try {
        const { current, new_password } = req.body;
        const cfg = db.prepare('SELECT admin_password_hash FROM company_info WHERE id = 1').get();
        if (!verifyPassword(current || '', cfg && cfg.admin_password_hash)) {
            return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
        }
        const np = String(new_password || '');
        if (np.length < 4) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres' });
        db.prepare('UPDATE company_info SET admin_password_hash = ? WHERE id = 1').run(hashPassword(np));
        res.json({ message: 'Contraseña actualizada' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== RESTAURAR DB DESDE UN BACKUP =====
// Copia los datos del backup a la base viva usando ATTACH (sin cerrar la conexión).
app.post('/api/restore', (req, res) => {
    try {
        const file = String(req.body.file || '');
        if (!/^ferreteria-[0-9-]+\.sqlite$/.test(file)) {
            return res.status(400).json({ error: 'Nombre de backup inválido' });
        }
        const src = path.join(BACKUP_DIR, file);
        if (!fs.existsSync(src)) return res.status(404).json({ error: 'Backup no encontrado' });

        // Resguardo de seguridad del estado actual antes de restaurar (copia de archivo
        // síncrona: no abre transacción en la conexión viva, journal_mode = delete)
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
        try { fs.copyFileSync(path.join(__dirname, 'ferreteria.sqlite'), path.join(BACKUP_DIR, `pre-restore-${stamp()}.sqlite`)); } catch (e) {}

        const tables = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).all().map(t => t.name);

        db.exec(`ATTACH DATABASE '${src.replace(/'/g, "''")}' AS bak`);
        try {
            const tx = db.transaction(() => {
                // defer_foreign_keys SÍ se puede activar dentro de la transacción: difiere
                // el chequeo de FK hasta el COMMIT, cuando el estado ya es consistente.
                db.pragma('defer_foreign_keys = ON');
                for (const t of tables) {
                    const inBak = db.prepare("SELECT 1 FROM bak.sqlite_master WHERE type='table' AND name=?").get(t);
                    if (!inBak) continue;
                    const liveCols = db.pragma(`table_info("${t}")`).map(c => c.name);
                    const bakCols = db.pragma(`bak.table_info("${t}")`).map(c => c.name);
                    const common = liveCols.filter(c => bakCols.includes(c));
                    if (common.length === 0) continue;
                    const cols = common.map(c => `"${c}"`).join(',');
                    db.exec(`DELETE FROM main."${t}"`);
                    db.exec(`INSERT INTO main."${t}" (${cols}) SELECT ${cols} FROM bak."${t}"`);
                }
            });
            tx();
        } finally {
            db.exec('DETACH DATABASE bak');
        }
        res.json({ message: 'Base restaurada desde ' + file });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo restaurar: ' + err.message });
    }
});

// ===== GASTOS / EGRESOS =====

app.get('/api/expenses', (req, res) => {
    try {
        let rows;
        if (req.query.month) {
            rows = db.prepare("SELECT * FROM expenses WHERE strftime('%Y-%m', expense_date) = ? ORDER BY expense_date DESC").all(req.query.month);
        } else {
            rows = db.prepare('SELECT * FROM expenses ORDER BY expense_date DESC LIMIT 200').all();
        }
        const total = rows.reduce((s, e) => s + e.amount, 0);
        res.json({ items: rows, total });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/expenses', (req, res) => {
    try {
        const { description, amount, category, payment_method, note } = req.body;
        if (!description || !String(description).trim()) return res.status(400).json({ error: 'Descripción obligatoria' });
        const amt = parseFloat(amount);
        if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Importe inválido' });
        const r = db.prepare(
            'INSERT INTO expenses (description, amount, category, payment_method, note) VALUES (?, ?, ?, ?, ?)'
        ).run(String(description).trim(), amt, (category || '').trim(), payment_method || 'efectivo', (note || '').trim());
        res.json({ id: r.lastInsertRowid, message: 'Gasto registrado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/expenses/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
        res.json({ message: 'Gasto eliminado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== CUENTAS A PAGAR =====

app.get('/api/payables', (req, res) => {
    try {
        const rows = db.prepare("SELECT * FROM payables ORDER BY (status='pagado'), due_date IS NULL, due_date ASC, id DESC").all();
        const pending = rows.filter(p => p.status === 'pendiente').reduce((s, p) => s + p.amount, 0);
        res.json({ items: rows, pending });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/payables', (req, res) => {
    try {
        const { provider, description, amount, due_date } = req.body;
        const amt = parseFloat(amount);
        if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Importe inválido' });
        const r = db.prepare(
            'INSERT INTO payables (provider, description, amount, due_date) VALUES (?, ?, ?, ?)'
        ).run((provider || '').trim(), (description || '').trim(), amt, (due_date || '').trim() || null);
        res.json({ id: r.lastInsertRowid, message: 'Cuenta registrada' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/payables/:id/pay', (req, res) => {
    try {
        const r = db.prepare("UPDATE payables SET status='pagado', paid_at=datetime('now','localtime') WHERE id=?").run(req.params.id);
        if (r.changes === 0) return res.status(404).json({ error: 'Cuenta no encontrada' });
        res.json({ message: 'Marcada como pagada' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/payables/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM payables WHERE id = ?').run(req.params.id);
        res.json({ message: 'Cuenta eliminada' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== CHEQUES =====

app.get('/api/checks', (req, res) => {
    try {
        const rows = db.prepare("SELECT * FROM checks ORDER BY (status IN ('cobrado','entregado','rechazado')), due_date IS NULL, due_date ASC, id DESC").all();
        const inWallet = rows.filter(c => c.status === 'cartera').reduce((s, c) => s + c.amount, 0);
        res.json({ items: rows, inWallet });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/checks', (req, res) => {
    try {
        const { bank, number, amount, due_date, type, note } = req.body;
        const amt = parseFloat(amount);
        if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Importe inválido' });
        const r = db.prepare(
            'INSERT INTO checks (bank, number, amount, due_date, type, note) VALUES (?, ?, ?, ?, ?, ?)'
        ).run((bank || '').trim(), (number || '').trim(), amt, (due_date || '').trim() || null, type === 'emitido' ? 'emitido' : 'recibido', (note || '').trim());
        res.json({ id: r.lastInsertRowid, message: 'Cheque registrado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/checks/:id/status', (req, res) => {
    try {
        const valid = ['cartera', 'depositado', 'cobrado', 'entregado', 'rechazado'];
        if (!valid.includes(req.body.status)) return res.status(400).json({ error: 'Estado inválido' });
        const r = db.prepare('UPDATE checks SET status=? WHERE id=?').run(req.body.status, req.params.id);
        if (r.changes === 0) return res.status(404).json({ error: 'Cheque no encontrado' });
        res.json({ message: 'Estado actualizado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/checks/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM checks WHERE id = ?').run(req.params.id);
        res.json({ message: 'Cheque eliminado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Direcciones IPv4 de la red local (para acceder desde tablets / celulares)
function lanAddresses() {
    const nets = require('os').networkInterfaces();
    const out = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            if (net.family === 'IPv4' && !net.internal) out.push(net.address);
        }
    }
    return out;
}

// Iniciar servidor (0.0.0.0 = accesible desde otros dispositivos de la red local)
app.listen(PORT, '0.0.0.0', () => {
    const ips = lanAddresses();
    console.log('');
    console.log('  ===================================================');
    console.log('   FerrePro - Servidor en marcha');
    console.log('  ===================================================');
    console.log(`   En esta PC:           http://localhost:${PORT}`);
    if (ips.length) {
        console.log('   Desde tablet/celular: ' + ips.map(ip => `http://${ip}:${PORT}`).join('\n                         '));
    } else {
        console.log('   (No se detectó una IP de red local; conectá la PC al Wi-Fi/red)');
    }
    console.log('  ===================================================');
    console.log('   Para detener el sistema, cerrá esta ventana.');
    console.log('');
});
