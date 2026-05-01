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
        // Calculamos un precio venta de ejemplo (Costo + Margen) + IVA aprox
        const price = p.cost + (p.cost * p.profit_margin / 100);
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; width: 100%;">
                <div style="display: flex; flex-direction: column;">
                    <span class="product-code">Cód. ${p.code} | Marca: ${p.brand || '-'}</span>
                    <span class="product-name" style="margin: 0.25rem 0; font-size: 1.1rem;">${p.name}</span>
                    <span style="font-size: 0.8rem; color: var(--text-muted);">Stock: ${p.stock} | Cat: ${p.category || '-'} | Prov: ${p.provider || '-'}</span>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center;">
                    <span class="product-price">$${price.toFixed(2)}</span>
                </div>
            </div>
        `;
        card.onclick = () => {
            addToCart(p);
        };
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
        const price = item.product.cost + (item.product.cost * item.product.profit_margin / 100);
        const itemTotal = price * item.quantity;
        total += itemTotal;
        
        const div = document.createElement('div');
        div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-glass);';
        
        div.innerHTML = `
            <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 0.95rem;">${item.product.name}</div>
                <div style="color: var(--text-muted); font-size: 0.8rem;">$${price.toFixed(2)} c/u</div>
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
async function loadProductsAdmin() {
    const tbody = document.getElementById('admin-products-tbody');
    tbody.innerHTML = '<tr><td colspan="7">Cargando...</td></tr>';
    
    const products = await fetchProducts();
    tbody.innerHTML = '';

    products.forEach(p => {
        const price = p.cost + (p.cost * p.profit_margin / 100);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.code}</td>
            <td><strong>${p.name}</strong></td>
            <td>${p.brand || '-'}</td>
            <td>${p.provider || '-'}</td>
            <td>$${p.cost.toFixed(2)}</td>
            <td><span class="badge" style="background: rgba(16,185,129,0.2); color: var(--accent); padding: 4px 8px; border-radius: 4px;">${p.profit_margin}%</span></td>
            <td><strong>$${price.toFixed(2)}</strong></td>
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
    } else {
        title.textContent = 'Nuevo Producto';
        form.reset();
        document.getElementById('product-id').value = '';
    }
    
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
        others: document.getElementById('product-others').value
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
        
        document.getElementById('product-modal').classList.add('hidden');
        loadProductsAdmin(); // Reload table
        initPOS(); // Reload POS products
        
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

