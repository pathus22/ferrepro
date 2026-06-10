const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./src/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
        const { code, name, cost, profit_margin, stock, category, provider, brand, units, others, sale_qty, sale_unit } = req.body;
        const stmt = db.prepare('INSERT INTO products (code, name, cost, profit_margin, stock, category, provider, brand, units, others, sale_qty, sale_unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const result = stmt.run(code, name, cost || 0, profit_margin || 50, stock || 0, category || '', provider || '', brand || '', units || '', others || '', sale_qty || 1, sale_unit || 'unidades');
        res.json({ id: result.lastInsertRowid, message: 'Producto creado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Editar un producto
app.put('/api/products/:id', (req, res) => {
    try {
        const { code, name, cost, profit_margin, stock, category, provider, brand, units, others, sale_qty, sale_unit } = req.body;
        const stmt = db.prepare('UPDATE products SET code = ?, name = ?, cost = ?, profit_margin = ?, stock = ?, category = ?, provider = ?, brand = ?, units = ?, others = ?, sale_qty = ?, sale_unit = ? WHERE id = ?');
        stmt.run(code, name, cost, profit_margin, stock, category, provider, brand, units, others, sale_qty || 1, sale_unit || 'unidades', req.params.id);
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
        const insertSale = db.prepare(
            'INSERT INTO sales (total, payment_method, is_fiscal_ticket, corridor_id) VALUES (?, ?, ?, ?)'
        );
        const insertItem = db.prepare(
            'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
        );
        const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

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
                insertItem.run(id, it.product_id, parseInt(it.quantity), it.unit_price);
                updateStock.run(parseInt(it.quantity), it.product_id);
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

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor local corriendo en http://localhost:${PORT}`);
});
