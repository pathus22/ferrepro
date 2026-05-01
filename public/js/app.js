// Clock Initialization
function initClock() {
    const clockEl = document.getElementById('clock');
    setInterval(() => {
        const now = new Date();
        const options = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
        clockEl.textContent = now.toLocaleDateString('es-AR', options);
    }, 1000);
}

// Navigation Logic
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove active from all nav items
            navItems.forEach(nav => nav.classList.remove('active'));
            // Add active to clicked nav item
            item.classList.add('active');

            // Hide all views
            views.forEach(view => view.classList.add('hidden'));
            // Show target view
            const targetId = item.getAttribute('data-target');
            document.getElementById(targetId).classList.remove('hidden');

            if (targetId === 'view-products') {
                loadProductsAdmin();
            }
        });
    });
}

// Modal handling (TODOs)
function showTodoModal(actionName) {
    const modal = document.getElementById('todo-modal');
    document.getElementById('todo-modal-title').textContent = `TODO: ${actionName}`;
    document.getElementById('todo-modal-desc').textContent = `La acción "${actionName}" está pendiente de definición e implementación por parte del cliente. Revisa el archivo TODO.txt para más detalles.`;
    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('todo-modal').classList.add('hidden');
}

// Data Fetching Mocks
async function fetchProducts() {
    try {
        const response = await fetch('/api/products');
        if (!response.ok) throw new Error("Fallo al obtener productos");
        return await response.json();
    } catch(err) {
        console.error(err);
        return [];
    }
}

// Palabras que son nombres de unidad, no de presentación (para filtrar datos viejos en el campo units)
const UNIT_WORDS = new Set(['unidad', 'unidades', 'metro', 'metros', 'litro', 'litros', 'kg', 'par', 'rollo', 'pliego', 'tira']);

// Formatea la unidad de venta: "Caja x10 Unidades", "x1 Unidad", "x10 Metros", etc.
function formatSaleUnit(p) {
    const qty = p.sale_qty || 1;
    const rawUnit = (p.sale_unit || 'unidades').trim();
    const unit = rawUnit.charAt(0).toUpperCase() + rawUnit.slice(1);
    const raw = (p.units || '').trim().toLowerCase();
    // Ignorar si el campo tiene datos viejos: palabras de unidad o contiene dígitos (ej: "Caja x10", "unidad")
    const presentation = raw && !UNIT_WORDS.has(raw) && !/\d/.test(raw) ? (p.units || '').trim() : '';
    return presentation ? `${presentation} x${qty} ${unit}` : `x${qty} ${unit}`;
}

// Calcula el precio efectivo según cantidad (aplica el tier más alto que corresponda)
function getEffectivePrice(product, quantity) {
    const base = product.cost * (1 + product.profit_margin / 100);
    if (!product.scaled_prices || product.scaled_prices.length === 0) return base;
    const tier = product.scaled_prices
        .filter(t => t.quantity <= quantity)
        .sort((a, b) => b.quantity - a.quantity)[0];
    // discount_percentage almacena el margen % del tier
    return tier ? product.cost * (1 + tier.discount_percentage / 100) : base;
}

// Mostrador (POS) Logic
let currentProducts = [];

async function initPOS() {
    // Solo simulamos un seed si la DB está vacía, con un POST a /api/seed
    try {
        await fetch('/api/seed', { method: 'POST' }); // En producción esto se borra
    } catch(e) {}

    currentProducts = await fetchProducts();
    renderPOSProducts(currentProducts);

    const searchInput = document.getElementById('pos-search');
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = currentProducts.filter(p => 
            p.name.toLowerCase().includes(term) || 
            p.code.toLowerCase().includes(term)
        );
        renderPOSProducts(filtered);
    });
}

function renderPOSProducts(products) {
    const container = document.getElementById('pos-products');
    container.innerHTML = '';
    
    if(products.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted)">No se encontraron productos.</p>';
        return;
    }

    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        const price = getEffectivePrice(p, 1);

        const tiersHtml = (p.scaled_prices && p.scaled_prices.length > 0)
            ? p.scaled_prices.map(t => {
                const tp = p.cost * (1 + t.discount_percentage / 100);
                return `${t.quantity}u: $${tp.toFixed(2)}`;
              }).join(' · ')
            : '';

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; width: 100%;">
                <div style="display: flex; flex-direction: column;">
                    <span class="product-code">Cód. ${p.code} | Marca: ${p.brand || '-'}</span>
                    <span class="product-name" style="margin: 0.25rem 0; font-size: 1.1rem;">${p.name}</span>
                    <span style="font-size: 0.8rem; color: var(--text-muted);">Stock: ${p.stock} | Cat: ${p.category || '-'} | Prov: ${p.provider || '-'}</span>
                    ${tiersHtml ? `<span style="font-size: 0.78rem; color: var(--accent); margin-top: 0.2rem;">${tiersHtml}</span>` : ''}
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 0.25rem;">
                    <span class="product-price">$${price.toFixed(2)}</span>
                    <span style="font-size: 0.78rem; color: var(--text-muted);">${formatSaleUnit(p)}</span>
                </div>
            </div>
        `;
        card.onclick = () => { addToCart(p); };
        container.appendChild(card);
    });
}

// Cart Logic
let currentCart = [];

function addToCart(product) {
    const existing = currentCart.find(item => item.product.id === product.id);
    if (existing) {
        existing.quantity++;
    } else {
        currentCart.push({ product: product, quantity: 1 });
    }
    renderCart();
}

function updateCartItemQuantity(productId, quantity) {
    const item = currentCart.find(i => i.product.id === productId);
    if (item) {
        const qty = parseInt(quantity);
        item.quantity = isNaN(qty) ? 1 : qty;
        if (item.quantity <= 0) {
            currentCart = currentCart.filter(i => i.product.id !== productId);
        }
    }
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items');
    const subtotalEl = document.getElementById('cart-subtotal');
    const totalEl = document.getElementById('cart-total');
    
    if (currentCart.length === 0) {
        container.innerHTML = `
            <div class="empty-cart">
                <i class="ph ph-shopping-cart"></i>
                <p>No hay artículos</p>
            </div>
        `;
        subtotalEl.textContent = '$0.00';
        totalEl.textContent = '$0.00';
        return;
    }
    
    container.innerHTML = '';
    let total = 0;
    
    currentCart.forEach(item => {
        const price = getEffectivePrice(item.product, item.quantity);
        const basePrice = item.product.cost * (1 + item.product.profit_margin / 100);
        const hasDiscount = price < basePrice - 0.001;
        const itemTotal = price * item.quantity;
        total += itemTotal;

        const div = document.createElement('div');
        div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-glass);';

        div.innerHTML = `
            <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 0.95rem;">${item.product.name}</div>
                <div style="color: var(--text-muted); font-size: 0.8rem;">
                    $${price.toFixed(2)} · ${formatSaleUnit(item.product)}
                    ${hasDiscount ? `<span style="color: var(--accent); margin-left: 0.3rem; font-size: 0.75rem;">▼ precio x cant.</span>` : ''}
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <input type="number" value="${item.quantity}" min="0" style="width: 50px; padding: 0.25rem; border-radius: 4px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-glass); color: white; text-align: center;" onchange="updateCartItemQuantity(${item.product.id}, this.value)">
                <div style="font-weight: 600; width: 70px; text-align: right;">$${itemTotal.toFixed(2)}</div>
                <button class="btn-icon" style="width: 24px; height: 24px; color: #ef4444; font-size: 1rem;" onclick="updateCartItemQuantity(${item.product.id}, 0)"><i class="ph ph-trash"></i></button>
            </div>
        `;
        container.appendChild(div);
    });
    
    subtotalEl.textContent = `$${total.toFixed(2)}`;
    totalEl.textContent = `$${total.toFixed(2)}`;
}


// Administración de Productos Logic
let allProductsAdmin = [];

async function loadProductsAdmin() {
    const tbody = document.getElementById('admin-products-tbody');
    tbody.innerHTML = '<tr><td colspan="8">Cargando...</td></tr>';

    allProductsAdmin = await fetchProducts();

    // Resetear buscador al recargar
    const searchInput = document.getElementById('admin-search');
    if (searchInput) searchInput.value = '';

    renderProductsAdminTable(allProductsAdmin);
}

function filterProductsAdmin(term) {
    const t = term.toLowerCase();
    const filtered = allProductsAdmin.filter(p =>
        p.name.toLowerCase().includes(t) ||
        p.code.toLowerCase().includes(t) ||
        (p.brand || '').toLowerCase().includes(t) ||
        (p.provider || '').toLowerCase().includes(t)
    );
    renderProductsAdminTable(filtered);
}

function renderProductsAdminTable(products) {
    const tbody = document.getElementById('admin-products-tbody');
    tbody.innerHTML = '';

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--text-muted);">Sin resultados</td></tr>';
        return;
    }

    products.forEach(p => {
        const price = p.cost * (1 + p.profit_margin / 100);
        const scaledBadge = p.has_scaled_prices
            ? `<span style="background: rgba(16,185,129,0.15); color: var(--accent); padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; margin-left: 6px;">Escalonado</span>`
            : '';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.code}</td>
            <td><strong>${p.name}</strong></td>
            <td>${p.brand || '-'}</td>
            <td>${p.provider || '-'}</td>
            <td>$${p.cost.toFixed(2)}</td>
            <td><span class="badge" style="background: rgba(16,185,129,0.2); color: var(--accent); padding: 4px 8px; border-radius: 4px;">${p.profit_margin}%</span></td>
            <td><strong>$${price.toFixed(2)}</strong>${scaledBadge}</td>
            <td>
                <button class="btn-icon" style="width: 32px; height: 32px; font-size: 1rem;" onclick='showProductModal(${JSON.stringify(p)})'><i class="ph ph-pencil-simple"></i></button>
                <button class="btn-icon" style="width: 32px; height: 32px; font-size: 1rem; color: #ef4444;" onclick='deleteProduct(${p.id})'><i class="ph ph-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Auth / Login Mocks
let currentUserRole = 'mostrador'; // default

function enterAsMostrador() {
    currentUserRole = 'mostrador';
    document.getElementById('auth-overlay').classList.add('hidden');
    document.getElementById('admin-nav-section').style.display = 'none';
    
    document.getElementById('btn-change-admin').style.display = 'inline-flex';
    document.getElementById('btn-change-mostrador').style.display = 'none';
    
    // Select first nav item (mostrador)
    const posNav = document.querySelector('[data-target="view-pos"]');
    if (posNav) posNav.click();
    
    // Update user info
    document.querySelector('.user-info .name').textContent = 'Mostrador';
    document.querySelector('.user-info .role').textContent = 'Vendedor';
}

function enterAsAdmin() {
    const passInput = document.getElementById('login-password');
    const errorMsg = document.getElementById('login-error');
    
    if (passInput.value === 'test') {
        currentUserRole = 'admin';
        document.getElementById('auth-overlay').classList.add('hidden');
        document.getElementById('admin-nav-section').style.display = 'block';
        errorMsg.style.display = 'none';
        
        document.getElementById('btn-change-admin').style.display = 'none';
        document.getElementById('btn-change-mostrador').style.display = 'inline-flex';
        
        // Update user info
        document.querySelector('.user-info .name').textContent = 'Usuario Activo';
        document.querySelector('.user-info .role').textContent = 'Admin';
        passInput.value = ''; // clear password
        
    } else {
        errorMsg.style.display = 'block';
    }
}

// Precios escalonados — estado y lógica del modal
let currentPriceTiers = [];

function addPriceTier() {
    if (currentPriceTiers.length >= 3) return;
    currentPriceTiers.push({ quantity: '', discount_percentage: '' });
    renderPriceTiers();
}

function removePriceTier(index) {
    currentPriceTiers.splice(index, 1);
    renderPriceTiers();
}

function updateTierField(index, field, value) {
    currentPriceTiers[index][field] = value === '' ? '' : parseFloat(value);
    // No re-renderizar: evita perder el foco durante la escritura
}

function updateTierPreview(index) {
    const cost = parseFloat(document.getElementById('product-cost').value) || 0;
    const input = document.getElementById(`tier-margin-${index}`);
    const preview = document.getElementById(`tier-preview-${index}`);
    if (!input || !preview) return;
    const m = parseFloat(input.value);
    preview.textContent = (!isNaN(m) && m >= 0 && cost > 0)
        ? `→ $${(cost * (1 + m / 100)).toFixed(2)}`
        : '';
}

function renderPriceTiers() {
    const container = document.getElementById('price-tiers-container');
    const btnAdd = document.getElementById('btn-add-tier');
    if (!container) return;

    const cost = parseFloat(document.getElementById('product-cost').value) || 0;

    container.innerHTML = '';
    currentPriceTiers.forEach((tier, i) => {
        const m = parseFloat(tier.discount_percentage);
        const scaledPrice = (!isNaN(m) && m >= 0 && cost > 0) ? cost * (1 + m / 100) : null;

        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;';
        row.innerHTML = `
            <span style="font-size: 0.82rem; color: var(--text-muted); white-space: nowrap;">A partir de</span>
            <input type="number" min="1" value="${tier.quantity}" placeholder="Cant."
                style="width: 65px; padding: 0.4rem; border-radius: 6px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-glass); color: var(--text-main); font-family: inherit; font-size: 0.85rem; text-align: center;"
                onchange="updateTierField(${i}, 'quantity', this.value)">
            <span style="font-size: 0.82rem; color: var(--text-muted); white-space: nowrap;">u. —</span>
            <input type="number" id="tier-margin-${i}" min="0" max="999" step="0.01" value="${tier.discount_percentage}" placeholder="%"
                style="width: 65px; padding: 0.4rem; border-radius: 6px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-glass); color: var(--text-main); font-family: inherit; font-size: 0.85rem; text-align: center;"
                oninput="updateTierPreview(${i})" onchange="updateTierField(${i}, 'discount_percentage', this.value)">
            <span style="font-size: 0.82rem; color: var(--text-muted);">% margen</span>
            <span id="tier-preview-${i}" style="font-size: 0.85rem; color: var(--accent); font-weight: 600; min-width: 70px;">
                ${scaledPrice !== null ? '→ $' + scaledPrice.toFixed(2) : ''}
            </span>
            <button type="button" class="btn-icon" style="width: 24px; height: 24px; color: #ef4444; font-size: 0.9rem; margin-left: auto;" onclick="removePriceTier(${i})">
                <i class="ph ph-trash"></i>
            </button>
        `;
        container.appendChild(row);
    });

    if (btnAdd) btnAdd.style.display = currentPriceTiers.length >= 3 ? 'none' : '';
}

// Product CRUD functions
function showProductModal(product = null) {
    const title = document.getElementById('product-modal-title');
    const form = document.getElementById('product-form');

    if (product) {
        title.textContent = 'Editar Producto';
        document.getElementById('product-id').value = product.id;
        document.getElementById('product-code').value = product.code;
        document.getElementById('product-name').value = product.name;
        document.getElementById('product-cost').value = product.cost;
        document.getElementById('product-margin').value = product.profit_margin;
        document.getElementById('product-stock').value = product.stock;
        document.getElementById('product-category').value = product.category || '';
        document.getElementById('product-brand').value = product.brand || '';
        document.getElementById('product-provider').value = product.provider || '';
        document.getElementById('product-units').value = product.units || '';
        document.getElementById('product-others').value = product.others || '';
        document.getElementById('product-sale-qty').value = product.sale_qty || 1;
        document.getElementById('product-sale-unit').value = product.sale_unit || 'unidades';
        currentPriceTiers = (product.scaled_prices || []).map(t => ({ ...t }));
    } else {
        title.textContent = 'Nuevo Producto';
        form.reset();
        document.getElementById('product-id').value = '';
        document.getElementById('product-sale-qty').value = 1;
        document.getElementById('product-sale-unit').value = 'unidades';
        currentPriceTiers = [];
    }

    renderPriceTiers();
    document.getElementById('product-modal').classList.remove('hidden');
}

async function saveProduct(e) {
    e.preventDefault();

    const id = document.getElementById('product-id').value;
    const product = {
        code: document.getElementById('product-code').value,
        name: document.getElementById('product-name').value,
        cost: parseFloat(document.getElementById('product-cost').value) || 0,
        profit_margin: parseFloat(document.getElementById('product-margin').value) || 0,
        stock: parseInt(document.getElementById('product-stock').value) || 0,
        category: document.getElementById('product-category').value,
        brand: document.getElementById('product-brand').value,
        provider: document.getElementById('product-provider').value,
        units: document.getElementById('product-units').value,
        others: document.getElementById('product-others').value,
        sale_qty: parseInt(document.getElementById('product-sale-qty').value) || 1,
        sale_unit: document.getElementById('product-sale-unit').value || 'unidades'
    };

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/products/${id}` : '/api/products';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(product)
        });

        if (!response.ok) throw new Error("Fallo al guardar producto");

        const data = await response.json();
        const productId = id || data.id;

        // Guardar precios escalonados
        const validTiers = currentPriceTiers.filter(t => t.quantity > 0 && t.discount_percentage > 0);
        await fetch(`/api/products/${productId}/prices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tiers: validTiers })
        });

        currentPriceTiers = [];
        document.getElementById('product-modal').classList.add('hidden');
        loadProductsAdmin();
        initPOS();

    } catch (err) {
        alert("Error al guardar: " + err.message);
    }
}

async function deleteProduct(id) {
    if (!confirm('¿Estás seguro de que quieres eliminar este producto?')) return;
    
    try {
        const response = await fetch(`/api/products/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error("Fallo al eliminar producto");
        
        loadProductsAdmin(); // Reload table
        initPOS(); // Reload POS products
    } catch (err) {
        alert("Error al eliminar: " + err.message);
    }
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initNavigation();
    initPOS();
    
    // Handle enter key in password field
    document.getElementById('login-password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            enterAsAdmin();
        }
    });
});

