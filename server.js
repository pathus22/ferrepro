const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./src/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Registra un nombre en categories/providers si todavía no existe (auto-sync al guardar productos)
function ensureNamed(table, name) {
    if (!name || !String(name).trim()) return;
    const n = String(name).trim();
    const exists = db.prepare(`SELECT 1 FROM ${table} WHERE name = ?`).get(n);
    if (!exists) db.prepare(`INSERT INTO ${table} (name) VALUES (?)`).run(n);
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
        res.json({ id: result.lastInsertRowid, message: 'Producto creado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Editar un producto
app.put('/api/products/:id', (req, res) => {
    try {
        const { code, name, cost, profit_margin, stock, min_stock, category, provider, brand, units, others, sale_qty, sale_unit } = req.body;
        const stmt = db.prepare('UPDATE products SET code = ?, name = ?, cost = ?, profit_margin = ?, stock = ?, min_stock = ?, category = ?, provider = ?, brand = ?, units = ?, others = ?, sale_qty = ?, sale_unit = ? WHERE id = ?');
        stmt.run(code, name, cost, profit_margin, stock, min_stock || 0, category, provider, brand, units, others, sale_qty || 1, sale_unit || 'unidades', req.params.id);
        ensureNamed('categories', category);
        ensureNamed('providers', provider);
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

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor local corriendo en http://localhost:${PORT}`);
});
