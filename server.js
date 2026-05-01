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

// Obtener todos los productos
app.get('/api/products', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM products ORDER BY name ASC');
        const products = stmt.all();
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear un producto
app.post('/api/products', (req, res) => {
    try {
        const { code, name, cost, profit_margin, stock, category, provider, brand, units, others } = req.body;
        const stmt = db.prepare('INSERT INTO products (code, name, cost, profit_margin, stock, category, provider, brand, units, others) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const result = stmt.run(code, name, cost || 0, profit_margin || 50, stock || 0, category || '', provider || '', brand || '', units || '', others || '');
        res.json({ id: result.lastInsertRowid, message: 'Producto creado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Editar un producto
app.put('/api/products/:id', (req, res) => {
    try {
        const { code, name, cost, profit_margin, stock, category, provider, brand, units, others } = req.body;
        const stmt = db.prepare('UPDATE products SET code = ?, name = ?, cost = ?, profit_margin = ?, stock = ?, category = ?, provider = ?, brand = ?, units = ?, others = ? WHERE id = ?');
        stmt.run(code, name, cost, profit_margin, stock, category, provider, brand, units, others, req.params.id);
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

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor local corriendo en http://localhost:${PORT}`);
});
