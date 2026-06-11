// Clock Initialization
function initClock() {
    const clockEl = document.getElementById('clock');
    const update = () => {
        const now = new Date();
        const options = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
        clockEl.textContent = now.toLocaleDateString('es-AR', options);
    };
    update();
    setInterval(update, 1000);
}

// ===== Responsive: drawer lateral y hoja de carrito (mobile) =====
function updateBackdrop() {
    const sidebarOpen = document.getElementById('sidebar').classList.contains('open');
    const cartOpen = document.getElementById('cart-panel')?.classList.contains('open');
    document.getElementById('backdrop').classList.toggle('show', sidebarOpen || cartOpen);
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    updateBackdrop();
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    updateBackdrop();
}

function toggleCartSheet() {
    document.getElementById('cart-panel').classList.toggle('open');
    updateBackdrop();
}

function closeCartSheet() {
    document.getElementById('cart-panel')?.classList.remove('open');
    updateBackdrop();
}

// Cierra drawer y hoja de carrito (click en el backdrop)
function closeOverlays() {
    closeSidebar();
    closeCartSheet();
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

            if (targetId === 'view-dashboard') {
                loadDashboard();
            } else if (targetId === 'view-products') {
                loadProductsAdmin();
            } else if (targetId === 'view-finances') {
                initCajaView();
            } else if (targetId === 'view-catalog') {
                loadCatalog();
            } else if (targetId === 'view-stock') {
                loadStock();
            } else if (targetId === 'view-orders') {
                loadOrders();
            } else if (targetId === 'view-corridors') {
                loadCorridors();
            } else if (targetId === 'view-settings') {
                loadCompany();
            }

            // En mobile, cerrar el drawer al navegar
            closeOverlays();
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

// Data Fetching
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
    return tier ? base * (1 - tier.discount_percentage / 100) : base;
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

function showProductInfo(p) {
    const base = p.cost * (1 + p.profit_margin / 100);
    const tiersRows = (p.scaled_prices && p.scaled_prices.length > 0)
        ? p.scaled_prices.map(t => {
            const tp = base * (1 - t.discount_percentage / 100);
            return `<div class="info-row">
                        <span class="k">A partir de ${t.quantity} u.</span>
                        <span class="v num"><strong>$${tp.toFixed(2)}</strong> <span class="k">(${t.discount_percentage}% desc.)</span></span>
                    </div>`;
          }).join('')
        : '<span class="k" style="font-size:0.85rem; color:var(--muted);">Sin precios escalonados</span>';

    const row = (label, value, num = false) => value
        ? `<div class="info-row">
               <span class="k">${label}</span>
               <span class="v${num ? ' num' : ''}">${value}</span>
           </div>`
        : '';

    document.getElementById('product-info-content').innerHTML = `
        <h2 class="info-title">${p.name}</h2>
        <p class="info-code">CÓD. ${p.code}</p>
        <div class="info-section">
            ${row('Marca', p.brand)}
            ${row('Categoría', p.category)}
            ${row('Proveedor', p.provider)}
            ${row('Otros', p.others)}
        </div>
        <div class="info-section">
            ${row('Costo', '$' + p.cost.toFixed(2), true)}
            ${row('Margen', p.profit_margin + '%', true)}
            ${row('Precio de venta', '<strong>$' + base.toFixed(2) + '</strong>', true)}
            ${row('Unidad de venta', formatSaleUnit(p))}
        </div>
        <div class="info-section">
            ${row('Stock', p.stock + ' u.', true)}
            ${row('Stock mínimo', p.min_stock ? p.min_stock + ' u.' : null, true)}
        </div>
        <div class="info-section">
            <div class="info-label">Precios por cantidad</div>
            ${tiersRows}
        </div>
    `;
    document.getElementById('product-info-modal').classList.remove('hidden');
}

function renderPOSProducts(products) {
    const container = document.getElementById('pos-products');
    container.innerHTML = '';

    if(products.length === 0) {
        container.innerHTML = '<p style="color:var(--muted); padding: 0.5rem;">No se encontraron productos.</p>';
        return;
    }

    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        const price = getEffectivePrice(p, 1);

        const tiersHtml = (p.scaled_prices && p.scaled_prices.length > 0)
            ? p.scaled_prices.map(t => {
                const base = p.cost * (1 + p.profit_margin / 100);
                const tp = base * (1 - t.discount_percentage / 100);
                return `${t.quantity}u: $${tp.toFixed(2)}`;
              }).join(' · ')
            : '';

        card.innerHTML = `
            <div class="pc-info">
                <span class="pc-code">CÓD. ${p.code}${p.brand ? ' · ' + p.brand : ''}</span>
                <span class="pc-name">${p.name}</span>
                <span class="pc-meta">Stock: ${p.stock} | Cat: ${p.category || '-'} | Prov: ${p.provider || '-'}</span>
                ${tiersHtml ? `<span class="pc-tiers">${tiersHtml}</span>` : ''}
            </div>
            <div class="pc-side">
                <button class="btn-icon pc-info-btn" id="info-btn-${p.id}" title="Ver detalle"><i class="ph ph-info"></i></button>
                <span class="product-price">$${price.toFixed(2)}</span>
                <span class="pc-unit">${formatSaleUnit(p)}</span>
            </div>
        `;
        card.onclick = () => { addToCart(p); };
        // Info button stops propagation so it doesn't add to cart
        card.querySelector(`#info-btn-${p.id}`).addEventListener('click', (e) => {
            e.stopPropagation();
            showProductInfo(p);
        });
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

// Actualiza contadores y total de la barra colapsada (mobile) y el badge del header
function updateCartIndicators(finalTotal) {
    const count = currentCart.reduce((sum, item) => sum + item.quantity, 0);
    const peekCount = document.getElementById('cart-peek-count');
    const peekTotal = document.getElementById('cart-peek-total');
    const badge = document.getElementById('cart-count-badge');
    if (peekCount) peekCount.textContent = count;
    if (peekTotal) peekTotal.textContent = `$${finalTotal.toFixed(2)}`;
    if (badge) badge.textContent = count === 1 ? '1 ítem' : `${count} ítems`;
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
        const discountAmountEl = document.getElementById('cart-discount-amount');
        if (discountAmountEl) discountAmountEl.textContent = '';
        updateCartIndicators(0);
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
        div.className = 'cart-item';

        div.innerHTML = `
            <div class="ci-info">
                <div class="ci-name">${item.product.name}</div>
                <div class="ci-meta">
                    $${price.toFixed(2)} · ${formatSaleUnit(item.product)}
                    ${hasDiscount ? `<span class="ci-tier-tag">▼ precio x cant.</span>` : ''}
                </div>
            </div>
            <div class="ci-controls">
                <input type="number" class="qty-input" value="${item.quantity}" min="0" onchange="updateCartItemQuantity(${item.product.id}, this.value)">
                <div class="ci-total">$${itemTotal.toFixed(2)}</div>
                <button class="btn-icon danger ci-remove" onclick="updateCartItemQuantity(${item.product.id}, 0)"><i class="ph ph-trash"></i></button>
            </div>
        `;
        container.appendChild(div);
    });

    // Descuento global del carrito
    const discountCheck = document.getElementById('cart-discount-check');
    const discountInput = document.getElementById('cart-discount-pct');
    const discountAmountEl = document.getElementById('cart-discount-amount');

    const discountEnabled = discountCheck?.checked || false;
    if (discountInput) discountInput.disabled = !discountEnabled;

    const discountPct = discountEnabled ? (parseFloat(discountInput?.value) || 0) : 0;
    const discountAmount = total * discountPct / 100;
    const finalTotal = total - discountAmount;

    if (discountAmountEl) {
        discountAmountEl.textContent = discountEnabled && discountAmount > 0
            ? `-$${discountAmount.toFixed(2)}`
            : '';
    }

    subtotalEl.textContent = `$${total.toFixed(2)}`;
    totalEl.textContent = `$${finalTotal.toFixed(2)}`;
    updateCartIndicators(finalTotal);
}


// ===== Cobro / Checkout =====
let selectedPayMethod = 'efectivo';

// Calcula ítems (con precio unitario efectivo + descuento global prorrateado) y totales del carrito
function getCartComputation() {
    let subtotal = 0;
    const lines = currentCart.map(item => {
        const price = getEffectivePrice(item.product, item.quantity);
        subtotal += price * item.quantity;
        return { item, price };
    });

    const discountCheck = document.getElementById('cart-discount-check');
    const discountInput = document.getElementById('cart-discount-pct');
    const discountEnabled = discountCheck?.checked || false;
    const discountPct = discountEnabled ? (parseFloat(discountInput?.value) || 0) : 0;
    const discountAmount = subtotal * discountPct / 100;
    const finalTotal = Math.round((subtotal - discountAmount) * 100) / 100;
    const factor = subtotal > 0 ? (subtotal - discountAmount) / subtotal : 1;

    const items = lines.map(l => ({
        product_id: l.item.product.id,
        quantity: l.item.quantity,
        unit_price: Math.round(l.price * factor * 100) / 100
    }));

    const count = currentCart.reduce((s, i) => s + i.quantity, 0);
    return { items, subtotal, discountPct, discountAmount, finalTotal, count };
}

let corridorDiscountApplied = false; // true si el descuento del carrito lo puso un corredor

function initCheckout() {
    document.querySelectorAll('#pay-methods .pay-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#pay-methods .pay-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            selectedPayMethod = chip.dataset.method;
            document.getElementById('cash-field').style.display =
                selectedPayMethod === 'efectivo' ? '' : 'none';
            const corridorField = document.getElementById('corridor-field');
            corridorField.style.display = selectedPayMethod === 'cuenta_corriente' ? '' : 'none';
            if (selectedPayMethod !== 'cuenta_corriente') {
                document.getElementById('checkout-corridor').value = '';
                clearCorridorDiscount();
            }
            refreshCheckoutTotal();
        });
    });
}

// Carga los corredores en el selector del checkout
async function loadCheckoutCorridors() {
    const sel = document.getElementById('checkout-corridor');
    try {
        const corridors = await fetch('/api/corridors').then(r => r.json());
        sel.innerHTML = '<option value="">— Seleccionar corredor —</option>' +
            corridors.map(c => `<option value="${c.id}" data-discount="${c.discount_percentage || 0}">${escapeHtml(c.name)}${c.discount_percentage ? ' · ' + c.discount_percentage + '% desc.' : ''}</option>`).join('');
    } catch (e) { /* opcional */ }
}

// Aplica el descuento del corredor elegido como descuento del carrito
function applyCorridorDiscount() {
    const sel = document.getElementById('checkout-corridor');
    const opt = sel.options[sel.selectedIndex];
    const disc = parseFloat(opt?.dataset.discount) || 0;
    const check = document.getElementById('cart-discount-check');
    const input = document.getElementById('cart-discount-pct');
    if (sel.value && disc > 0) {
        if (check) check.checked = true;
        if (input) { input.value = disc; input.disabled = false; }
        corridorDiscountApplied = true;
    } else {
        clearCorridorDiscount();
    }
    renderCart();
    refreshCheckoutTotal();
}

function clearCorridorDiscount() {
    if (!corridorDiscountApplied) return;
    const check = document.getElementById('cart-discount-check');
    const input = document.getElementById('cart-discount-pct');
    if (check) check.checked = false;
    if (input) input.value = '';
    corridorDiscountApplied = false;
    renderCart();
}

function refreshCheckoutTotal() {
    const c = getCartComputation();
    document.getElementById('checkout-total').textContent = `$${c.finalTotal.toFixed(2)}`;
    document.getElementById('checkout-items-hint').textContent =
        `${c.count} ${c.count === 1 ? 'artículo' : 'artículos'}` +
        (c.discountPct > 0 ? ` · ${c.discountPct}% descuento aplicado` : '');
}

function openCheckout() {
    if (currentCart.length === 0) return;
    const c = getCartComputation();

    document.getElementById('checkout-total').textContent = `$${c.finalTotal.toFixed(2)}`;
    document.getElementById('checkout-items-hint').textContent =
        `${c.count} ${c.count === 1 ? 'artículo' : 'artículos'}` +
        (c.discountPct > 0 ? ` · ${c.discountPct}% descuento aplicado` : '');

    // Reset de estado del modal
    selectedPayMethod = 'efectivo';
    document.querySelectorAll('.pay-chip').forEach(ch =>
        ch.classList.toggle('active', ch.dataset.method === 'efectivo'));
    document.getElementById('cash-field').style.display = '';
    document.getElementById('cash-received').value = '';
    document.getElementById('change-amount').textContent = '$0.00';
    document.getElementById('change-amount').classList.remove('insufficient');
    document.getElementById('checkout-fiscal').checked = false;
    document.getElementById('checkout-error').style.display = 'none';
    document.getElementById('checkout-confirm-btn').disabled = false;

    // Cuenta corriente: ocultar selector, resetear y cargar corredores
    document.getElementById('corridor-field').style.display = 'none';
    document.getElementById('checkout-corridor').value = '';
    corridorDiscountApplied = false;
    loadCheckoutCorridors();

    closeCartSheet(); // en mobile, ocultar la hoja del carrito detrás del modal
    document.getElementById('checkout-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('cash-received').focus(), 120);
}

function closeCheckout() {
    document.getElementById('checkout-modal').classList.add('hidden');
}

function updateChange() {
    const c = getCartComputation();
    const received = parseFloat(document.getElementById('cash-received').value) || 0;
    const change = received - c.finalTotal;
    const el = document.getElementById('change-amount');
    el.textContent = `$${(change > 0 ? change : 0).toFixed(2)}`;
    el.classList.toggle('insufficient', received > 0 && change < -0.001);
}

async function confirmSale() {
    const c = getCartComputation();
    const errEl = document.getElementById('checkout-error');
    const btn = document.getElementById('checkout-confirm-btn');
    if (c.items.length === 0) return;

    // Para efectivo, validar que lo recibido alcance (si se ingresó un monto)
    if (selectedPayMethod === 'efectivo') {
        const received = parseFloat(document.getElementById('cash-received').value);
        if (!isNaN(received) && received > 0 && received < c.finalTotal - 0.001) {
            errEl.textContent = 'El efectivo recibido es menor al total a cobrar.';
            errEl.style.display = 'block';
            return;
        }
    }

    // Para cuenta corriente, exigir un corredor
    let corridorId = null;
    if (selectedPayMethod === 'cuenta_corriente') {
        corridorId = parseInt(document.getElementById('checkout-corridor').value) || null;
        if (!corridorId) {
            errEl.textContent = 'Elegí un corredor para cargar la venta a su cuenta.';
            errEl.style.display = 'block';
            return;
        }
    }

    btn.disabled = true;
    errEl.style.display = 'none';

    try {
        const res = await fetch('/api/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: c.items,
                total: c.finalTotal,
                payment_method: selectedPayMethod,
                is_fiscal_ticket: document.getElementById('checkout-fiscal').checked,
                corridor_id: corridorId
            })
        });

        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            throw new Error(e.error || 'No se pudo registrar la venta');
        }
        const data = await res.json();

        // Tique automático: capturar el detalle ANTES de vaciar el carrito
        if (companyInfo && companyInfo.auto_ticket) {
            const snapshot = { comp: c, lines: cartToDocLines(c), saleNumber: data.id };
            printPosDocument('ticket', snapshot);
        }

        // Vaciar carrito y resetear descuento
        currentCart = [];
        const discountCheck = document.getElementById('cart-discount-check');
        const discountInput = document.getElementById('cart-discount-pct');
        if (discountCheck) discountCheck.checked = false;
        if (discountInput) discountInput.value = '';

        corridorDiscountApplied = false;
        closeCheckout();
        await initPOS();   // refresca catálogo con el stock ya descontado
        renderCart();
        const extra = selectedPayMethod === 'cuenta_corriente' ? ' · a cuenta corriente' : '';
        showToast(`Venta #${data.id} registrada · $${c.finalTotal.toFixed(2)}${extra}`);
    } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
        btn.disabled = false;
    }
}

// Toast de feedback (éxito / error)
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'ph-check-circle' : 'ph-warning-circle';
    toast.innerHTML = `<i class="ph ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3200);
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
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--muted);">Sin resultados</td></tr>';
        return;
    }

    products.forEach(p => {
        const price = p.cost * (1 + p.profit_margin / 100);
        const scaledBadge = p.has_scaled_prices
            ? `<span class="badge badge-scaled">Escalonado</span>`
            : '';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="num">${p.code}</td>
            <td><strong>${p.name}</strong></td>
            <td>${p.brand || '-'}</td>
            <td>${p.provider || '-'}</td>
            <td class="num">$${p.cost.toFixed(2)}</td>
            <td><span class="badge badge-margin">${p.profit_margin}%</span></td>
            <td class="num"><strong>$${price.toFixed(2)}</strong>${scaledBadge}</td>
            <td class="td-actions">
                <button class="btn-icon" onclick='showProductModal(${JSON.stringify(p)})'><i class="ph ph-pencil-simple"></i></button>
                <button class="btn-icon danger" onclick='deleteProduct(${p.id})'><i class="ph ph-trash"></i></button>
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
    document.querySelector('.avatar').textContent = 'M';
}

async function enterAsAdmin() {
    const passInput = document.getElementById('login-password');
    const errorMsg = document.getElementById('login-error');

    let ok = false;
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: passInput.value })
        });
        ok = res.ok && (await res.json()).ok;
    } catch (e) { ok = false; }

    if (ok) {
        currentUserRole = 'admin';
        document.getElementById('auth-overlay').classList.add('hidden');
        document.getElementById('admin-nav-section').style.display = 'block';
        errorMsg.style.display = 'none';

        document.getElementById('btn-change-admin').style.display = 'none';
        document.getElementById('btn-change-mostrador').style.display = 'inline-flex';

        // Update user info
        document.querySelector('.user-info .name').textContent = 'Usuario Activo';
        document.querySelector('.user-info .role').textContent = 'Admin';
        document.querySelector('.avatar').textContent = 'A';
        passInput.value = ''; // clear password

        // Mostrar el dashboard como pantalla de inicio del admin
        const dashNav = document.querySelector('[data-target="view-dashboard"]');
        if (dashNav) dashNav.click();

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
    const margin = parseFloat(document.getElementById('product-margin').value) || 0;
    const basePrice = cost * (1 + margin / 100);
    const input = document.getElementById(`tier-disc-${index}`);
    const preview = document.getElementById(`tier-preview-${index}`);
    if (!input || !preview) return;
    const d = parseFloat(input.value);
    preview.textContent = (!isNaN(d) && d >= 0 && basePrice > 0)
        ? `→ $${(basePrice * (1 - d / 100)).toFixed(2)}`
        : '';
}

function renderPriceTiers() {
    const container = document.getElementById('price-tiers-container');
    const btnAdd = document.getElementById('btn-add-tier');
    if (!container) return;

    const cost = parseFloat(document.getElementById('product-cost').value) || 0;
    const margin = parseFloat(document.getElementById('product-margin').value) || 0;
    const basePrice = cost * (1 + margin / 100);

    container.innerHTML = '';
    currentPriceTiers.forEach((tier, i) => {
        const d = parseFloat(tier.discount_percentage);
        const scaledPrice = (!isNaN(d) && d >= 0 && basePrice > 0) ? basePrice * (1 - d / 100) : null;

        const row = document.createElement('div');
        row.className = 'tier-row';
        row.innerHTML = `
            <span class="lbl">A partir de</span>
            <input type="number" class="form-input tier-input" min="1" value="${tier.quantity}" placeholder="Cant."
                onchange="updateTierField(${i}, 'quantity', this.value)">
            <span class="lbl">u. —</span>
            <input type="number" id="tier-disc-${i}" class="form-input tier-input" min="0" max="99.99" step="0.01" value="${tier.discount_percentage}" placeholder="%"
                oninput="updateTierPreview(${i})" onchange="updateTierField(${i}, 'discount_percentage', this.value)">
            <span class="lbl">% desc.</span>
            <span id="tier-preview-${i}" class="tier-preview">
                ${scaledPrice !== null ? '→ $' + scaledPrice.toFixed(2) : ''}
            </span>
            <button type="button" class="btn-icon danger tier-remove" onclick="removePriceTier(${i})">
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
        document.getElementById('product-min-stock').value = product.min_stock || 0;
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
        document.getElementById('product-min-stock').value = 0;
        document.getElementById('product-sale-qty').value = 1;
        document.getElementById('product-sale-unit').value = 'unidades';
        currentPriceTiers = [];
    }

    renderPriceTiers();
    loadCatalogLists();
    document.getElementById('product-modal').classList.remove('hidden');
}

// Llena los datalists de categoría / proveedor / marca para autocompletado en el modal
async function loadCatalogLists() {
    try {
        const [cats, provs] = await Promise.all([
            fetch('/api/categories').then(r => r.ok ? r.json() : []),
            fetch('/api/providers').then(r => r.ok ? r.json() : [])
        ]);
        fillDatalist('category-options', cats.map(c => c.name));
        fillDatalist('provider-options', provs.map(p => p.name));
        // Marcas: valores distintos de los productos ya cargados
        const brands = [...new Set((allProductsAdmin.length ? allProductsAdmin : currentProducts)
            .map(p => p.brand).filter(Boolean))].sort();
        fillDatalist('brand-options', brands);
    } catch (e) { /* autocompletado es opcional, no bloquea el alta */ }
}

function fillDatalist(id, values) {
    const dl = document.getElementById(id);
    if (!dl) return;
    dl.innerHTML = values.map(v => `<option value="${String(v).replace(/"/g, '&quot;')}">`).join('');
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
        min_stock: parseInt(document.getElementById('product-min-stock').value) || 0,
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
        await initPOS();
        // Actualizar productos del carrito con los datos recién guardados
        currentCart = currentCart.map(item => {
            const updated = currentProducts.find(p => p.id === item.product.id);
            return updated ? { ...item, product: updated } : item;
        });
        renderCart();

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

// ===== Caja e Historial (Finanzas) =====
const PAY_LABELS = {
    efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito',
    transferencia: 'Transferencia', cheque: 'Cheque', cuenta_corriente: 'Cuenta corriente'
};
const PAY_ICONS = {
    efectivo: 'ph-money', debito: 'ph-credit-card', credito: 'ph-credit-card',
    transferencia: 'ph-arrows-left-right', cheque: 'ph-scroll', cuenta_corriente: 'ph-user-list'
};

// Fecha de hoy en formato YYYY-MM-DD en hora LOCAL (no UTC)
function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function setCajaToday() {
    document.getElementById('caja-date').value = todayStr();
    loadCaja();
}

// Se llama al entrar a la vista: si no hay fecha elegida, usa hoy
function initCajaView() {
    const input = document.getElementById('caja-date');
    if (!input.value) input.value = todayStr();
    loadCashSession();
    loadCaja();
}

// ===== Caja: apertura / cierre (arqueo) =====
const cashFmt = n => `$${(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
let cashState = null;

async function loadCashSession() {
    const panel = document.getElementById('cash-panel');
    try {
        cashState = await fetch('/api/cash/current').then(r => r.json());
        renderCashPanel();
    } catch (e) {
        panel.innerHTML = '<p class="abm-empty" style="color:var(--red);">Error al cargar la caja</p>';
    }
}

function renderCashPanel() {
    const panel = document.getElementById('cash-panel');
    if (!cashState || !cashState.open) {
        panel.innerHTML = `
            <div class="cash-closed">
                <div class="cash-status"><i class="ph ph-lock-key"></i> <span>Caja cerrada</span></div>
                <div class="cash-open-form">
                    <div class="cash-input-group">
                        <span class="cash-prefix">$</span>
                        <input type="number" id="cash-opening" class="form-input" min="0" step="0.01" placeholder="Fondo inicial">
                    </div>
                    <button class="btn btn-primary" onclick="openCashSession()"><i class="ph ph-lock-key-open"></i> Abrir caja</button>
                </div>
            </div>`;
        return;
    }
    const s = cashState.session;
    panel.innerHTML = `
        <div class="cash-open">
            <div class="cash-status open"><i class="ph ph-lock-key-open"></i> <span>Caja abierta</span>
                <span class="cash-since">desde ${(s.opened_at || '').slice(0, 16)}</span>
            </div>
            <div class="cash-metrics">
                <div class="cash-metric"><span class="k">Fondo inicial</span><span class="mono">${cashFmt(s.opening_amount)}</span></div>
                <div class="cash-metric"><span class="k">Ventas efectivo</span><span class="mono">${cashFmt(cashState.cashSales)} <small>(${cashState.cashCount})</small></span></div>
                <div class="cash-metric accent"><span class="k">Efectivo esperado</span><span class="mono">${cashFmt(cashState.expected)}</span></div>
            </div>
            <button class="btn btn-secondary" onclick="openCashModal()"><i class="ph ph-lock-key"></i> Cerrar caja</button>
        </div>`;
}

async function openCashSession() {
    const amount = parseFloat(document.getElementById('cash-opening').value) || 0;
    try {
        const res = await fetch('/api/cash/open', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ opening_amount: amount })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo abrir la caja');
        await loadCashSession();
        showToast(`Caja abierta · fondo ${cashFmt(amount)}`);
    } catch (err) { showToast(err.message, 'error'); }
}

function openCashModal() {
    if (!cashState || !cashState.open) return;
    const s = cashState.session;
    document.getElementById('arqueo-opening').textContent = cashFmt(s.opening_amount);
    document.getElementById('arqueo-cash').textContent = cashFmt(cashState.cashSales);
    document.getElementById('arqueo-expected').textContent = cashFmt(cashState.expected);
    document.getElementById('arqueo-expected').dataset.value = cashState.expected;
    document.getElementById('cash-counted').value = '';
    document.getElementById('cash-notes').value = '';
    document.getElementById('arqueo-diff').textContent = '—';
    document.getElementById('arqueo-diff').classList.remove('negative');
    document.getElementById('cash-error').style.display = 'none';
    document.getElementById('cash-close-btn').disabled = false;
    document.getElementById('cash-close-modal').classList.remove('hidden');
}

function closeCashModal() {
    document.getElementById('cash-close-modal').classList.add('hidden');
}

function updateArqueoDiff() {
    const expected = parseFloat(document.getElementById('arqueo-expected').dataset.value) || 0;
    const counted = parseFloat(document.getElementById('cash-counted').value);
    const el = document.getElementById('arqueo-diff');
    if (!Number.isFinite(counted)) { el.textContent = '—'; el.classList.remove('negative'); return; }
    const diff = counted - expected;
    el.textContent = (diff >= 0 ? '+' : '') + cashFmt(diff);
    el.classList.toggle('negative', diff < -0.001);
}

async function confirmCloseCash() {
    const counted = parseFloat(document.getElementById('cash-counted').value);
    const errEl = document.getElementById('cash-error');
    const btn = document.getElementById('cash-close-btn');
    if (!Number.isFinite(counted) || counted < 0) {
        errEl.textContent = 'Ingresá el efectivo contado.';
        errEl.style.display = 'block';
        return;
    }
    btn.disabled = true;
    errEl.style.display = 'none';
    try {
        const res = await fetch('/api/cash/close', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ counted_amount: counted, notes: document.getElementById('cash-notes').value })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo cerrar la caja');
        closeCashModal();
        await loadCashSession();
        const diffTxt = data.difference === 0 ? 'sin diferencia'
            : (data.difference > 0 ? `sobra ${cashFmt(data.difference)}` : `falta ${cashFmt(-data.difference)}`);
        showToast(`Caja cerrada · ${diffTxt}`, data.difference < -0.001 ? 'error' : 'success');
    } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
        btn.disabled = false;
    }
}

// ===== Finanzas: pestañas (Gastos / Cuentas a pagar / Cheques) =====
function switchFinTab(tab) {
    document.querySelectorAll('.fin-tab').forEach(t => t.classList.toggle('active', t.dataset.fin === tab));
    document.querySelectorAll('.fin-section').forEach(s => s.classList.add('hidden'));
    document.getElementById('fin-' + tab).classList.remove('hidden');
    if (tab === 'caja') { loadCashSession(); loadCaja(); }
    else if (tab === 'gastos') loadExpenses();
    else if (tab === 'payables') loadPayables();
    else if (tab === 'checks') loadChecks();
}

// --- Gastos ---
async function loadExpenses() {
    const month = todayStr().slice(0, 7);
    try {
        const data = await fetch(`/api/expenses?month=${month}`).then(r => r.json());
        document.getElementById('gastos-stats').innerHTML = `
            <div class="stat-card stat-danger">
                <span class="stat-label"><i class="ph ph-receipt-x"></i> Gastos del mes</span>
                <span class="stat-value">${cashFmt(data.total)}</span>
                <span class="stat-sub">${data.items.length} ${data.items.length === 1 ? 'registro' : 'registros'}</span>
            </div>`;
        const tbody = document.getElementById('gastos-tbody');
        if (data.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">Sin gastos este mes.</td></tr>';
            return;
        }
        tbody.innerHTML = data.items.map(e => `
            <tr>
                <td class="num">${(e.expense_date || '').slice(0, 16)}</td>
                <td><strong>${escapeHtml(e.description)}</strong>${e.note ? '<div class="stock-sub">' + escapeHtml(e.note) + '</div>' : ''}</td>
                <td>${escapeHtml(e.category || '—')}</td>
                <td><span class="pay-badge"><i class="ph ${PAY_ICONS[e.payment_method] || 'ph-money'}"></i> ${PAY_LABELS[e.payment_method] || e.payment_method || '—'}</span></td>
                <td class="num"><strong style="color:var(--red);">${cashFmt(e.amount)}</strong></td>
                <td class="td-actions"><button class="btn-icon danger" onclick="deleteExpense(${e.id})"><i class="ph ph-trash"></i></button></td>
            </tr>`).join('');
    } catch (e) { showToast('Error al cargar gastos', 'error'); }
}

async function addExpense(e) {
    e.preventDefault();
    const payload = {
        description: document.getElementById('exp-desc').value,
        amount: parseFloat(document.getElementById('exp-amount').value),
        category: document.getElementById('exp-cat').value,
        payment_method: document.getElementById('exp-method').value
    };
    try {
        const res = await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo registrar');
        e.target.reset();
        await loadExpenses();
        showToast('Gasto registrado');
    } catch (err) { showToast(err.message, 'error'); }
}

async function deleteExpense(id) {
    if (!confirm('¿Eliminar este gasto?')) return;
    try {
        await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
        await loadExpenses();
        showToast('Gasto eliminado');
    } catch (e) { showToast('Error al eliminar', 'error'); }
}

// --- Cuentas a pagar ---
async function loadPayables() {
    try {
        const data = await fetch('/api/payables').then(r => r.json());
        document.getElementById('payables-stats').innerHTML = `
            <div class="stat-card ${data.pending > 0 ? 'stat-warn' : ''}">
                <span class="stat-label"><i class="ph ph-invoice"></i> Pendiente de pago</span>
                <span class="stat-value">${cashFmt(data.pending)}</span>
            </div>`;
        const tbody = document.getElementById('payables-tbody');
        if (data.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">No hay cuentas registradas.</td></tr>';
            return;
        }
        const today = todayStr();
        tbody.innerHTML = data.items.map(p => {
            const paid = p.status === 'pagado';
            const overdue = !paid && p.due_date && p.due_date < today;
            return `
            <tr>
                <td><strong>${escapeHtml(p.provider || '—')}</strong></td>
                <td>${escapeHtml(p.description || '—')}</td>
                <td class="num" ${overdue ? 'style="color:var(--red);"' : ''}>${p.due_date || '—'}${overdue ? ' ⚠' : ''}</td>
                <td class="num">${cashFmt(p.amount)}</td>
                <td><span class="stock-badge ${paid ? 'badge-ok' : 'badge-low'}">${paid ? 'Pagado' : 'Pendiente'}</span></td>
                <td class="td-actions">
                    ${paid ? '' : `<button class="btn btn-secondary btn-sm" onclick="payPayable(${p.id})"><i class="ph ph-check"></i> Pagar</button>`}
                    <button class="btn-icon danger" onclick="deletePayable(${p.id})"><i class="ph ph-trash"></i></button>
                </td>
            </tr>`;
        }).join('');
    } catch (e) { showToast('Error al cargar cuentas', 'error'); }
}

async function addPayable(e) {
    e.preventDefault();
    const payload = {
        provider: document.getElementById('pay-provider').value,
        description: document.getElementById('pay-desc').value,
        amount: parseFloat(document.getElementById('pay-amount').value),
        due_date: document.getElementById('pay-due').value
    };
    try {
        const res = await fetch('/api/payables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo registrar');
        e.target.reset();
        await loadPayables();
        showToast('Cuenta registrada');
    } catch (err) { showToast(err.message, 'error'); }
}

async function payPayable(id) {
    try {
        await fetch(`/api/payables/${id}/pay`, { method: 'POST' });
        await loadPayables();
        showToast('Cuenta marcada como pagada');
    } catch (e) { showToast('Error', 'error'); }
}

async function deletePayable(id) {
    if (!confirm('¿Eliminar esta cuenta?')) return;
    try {
        await fetch(`/api/payables/${id}`, { method: 'DELETE' });
        await loadPayables();
        showToast('Cuenta eliminada');
    } catch (e) { showToast('Error al eliminar', 'error'); }
}

// --- Cheques ---
const CHECK_STATUS = {
    cartera: { label: 'En cartera', cls: 'badge-low' },
    depositado: { label: 'Depositado', cls: 'badge-scaled' },
    cobrado: { label: 'Cobrado', cls: 'badge-ok' },
    entregado: { label: 'Entregado', cls: 'badge-ok' },
    rechazado: { label: 'Rechazado', cls: 'badge-out' }
};

async function loadChecks() {
    try {
        const data = await fetch('/api/checks').then(r => r.json());
        document.getElementById('checks-stats').innerHTML = `
            <div class="stat-card stat-accent">
                <span class="stat-label"><i class="ph ph-scroll"></i> Cheques en cartera</span>
                <span class="stat-value">${cashFmt(data.inWallet)}</span>
            </div>`;
        const tbody = document.getElementById('checks-tbody');
        if (data.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:1.5rem;">No hay cheques registrados.</td></tr>';
            return;
        }
        const today = todayStr();
        tbody.innerHTML = data.items.map(c => {
            const st = CHECK_STATUS[c.status] || CHECK_STATUS.cartera;
            const overdue = c.status === 'cartera' && c.due_date && c.due_date < today;
            const opts = ['cartera', 'depositado', 'cobrado', 'entregado', 'rechazado']
                .map(s => `<option value="${s}" ${s === c.status ? 'selected' : ''}>${CHECK_STATUS[s].label}</option>`).join('');
            return `
            <tr>
                <td>${c.type === 'emitido' ? 'Emitido' : 'Recibido'}</td>
                <td>${escapeHtml(c.bank || '—')}</td>
                <td class="num">${escapeHtml(c.number || '—')}</td>
                <td class="num" ${overdue ? 'style="color:var(--red);"' : ''}>${c.due_date || '—'}${overdue ? ' ⚠' : ''}</td>
                <td class="num">${cashFmt(c.amount)}</td>
                <td><span class="stock-badge ${st.cls}">${st.label}</span></td>
                <td class="td-actions">
                    <select class="form-input check-status-select" onchange="updateCheckStatus(${c.id}, this.value)">${opts}</select>
                    <button class="btn-icon danger" onclick="deleteCheck(${c.id})"><i class="ph ph-trash"></i></button>
                </td>
            </tr>`;
        }).join('');
    } catch (e) { showToast('Error al cargar cheques', 'error'); }
}

async function addCheck(e) {
    e.preventDefault();
    const payload = {
        type: document.getElementById('chk-type').value,
        bank: document.getElementById('chk-bank').value,
        number: document.getElementById('chk-number').value,
        amount: parseFloat(document.getElementById('chk-amount').value),
        due_date: document.getElementById('chk-due').value
    };
    try {
        const res = await fetch('/api/checks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo registrar');
        e.target.reset();
        await loadChecks();
        showToast('Cheque registrado');
    } catch (err) { showToast(err.message, 'error'); }
}

async function updateCheckStatus(id, status) {
    try {
        await fetch(`/api/checks/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
        await loadChecks();
        showToast('Estado actualizado');
    } catch (e) { showToast('Error', 'error'); }
}

async function deleteCheck(id) {
    if (!confirm('¿Eliminar este cheque?')) return;
    try {
        await fetch(`/api/checks/${id}`, { method: 'DELETE' });
        await loadChecks();
        showToast('Cheque eliminado');
    } catch (e) { showToast('Error al eliminar', 'error'); }
}

async function loadCaja() {
    const date = document.getElementById('caja-date').value || todayStr();
    const tbody = document.getElementById('caja-tbody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--muted);">Cargando...</td></tr>';
    try {
        const sales = await fetch(`/api/sales?date=${date}`).then(r => r.json());
        renderCaja(sales);
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--red);">Error al cargar ventas</td></tr>';
    }
}

function renderCaja(sales) {
    const fmt = n => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // --- Resumen ---
    const count = sales.length;
    const total = sales.reduce((s, v) => s + v.total, 0);
    const average = count ? total / count : 0;
    const fiscalCount = sales.filter(v => v.is_fiscal_ticket).length;

    document.getElementById('caja-stats').innerHTML = `
        <div class="stat-card stat-accent">
            <span class="stat-label"><i class="ph ph-cash-register"></i> Total del día</span>
            <span class="stat-value">${fmt(total)}</span>
        </div>
        <div class="stat-card">
            <span class="stat-label"><i class="ph ph-receipt"></i> Ventas</span>
            <span class="stat-value">${count}</span>
        </div>
        <div class="stat-card">
            <span class="stat-label"><i class="ph ph-chart-bar"></i> Ticket promedio</span>
            <span class="stat-value">${fmt(average)}</span>
        </div>
        <div class="stat-card">
            <span class="stat-label"><i class="ph ph-stamp"></i> Tiques fiscales</span>
            <span class="stat-value">${fiscalCount}<span class="stat-sub"> / ${count}</span></span>
        </div>
    `;

    // --- Desglose por medio de pago ---
    const byMethod = {};
    sales.forEach(v => {
        const m = v.payment_method || 'efectivo';
        if (!byMethod[m]) byMethod[m] = { count: 0, total: 0 };
        byMethod[m].count++;
        byMethod[m].total += v.total;
    });
    const methodsEl = document.getElementById('caja-methods');
    methodsEl.innerHTML = Object.keys(byMethod).length === 0 ? '' :
        Object.entries(byMethod)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([m, d]) => `
                <div class="method-pill">
                    <i class="ph ${PAY_ICONS[m] || 'ph-money'}"></i>
                    <div>
                        <span class="method-name">${PAY_LABELS[m] || m}</span>
                        <span class="method-count">${d.count} ${d.count === 1 ? 'venta' : 'ventas'}</span>
                    </div>
                    <span class="method-total">${fmt(d.total)}</span>
                </div>
            `).join('');

    // --- Tabla de ventas ---
    const tbody = document.getElementById('caja-tbody');
    if (count === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--muted); padding:2rem;">No hay ventas registradas en esta fecha.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    sales.forEach((v, idx) => {
        const time = (v.sale_date || '').slice(11, 16) || '--:--';
        const itemCount = (v.items || []).reduce((s, it) => s + it.quantity, 0);
        const itemsList = (v.items || [])
            .map(it => `${it.quantity}× ${it.name || it.code || '—'} <span class="mono" style="color:var(--muted);">(${fmt(it.unit_price)})</span>`)
            .join('<br>');

        const tr = document.createElement('tr');
        tr.className = 'caja-row';
        tr.innerHTML = `
            <td class="num">${time}</td>
            <td>
                <button class="detail-toggle" onclick="toggleSaleDetail(${idx})">
                    <i class="ph ph-caret-right" id="caret-${idx}"></i>
                    ${itemCount} ${itemCount === 1 ? 'artículo' : 'artículos'}
                </button>
            </td>
            <td><span class="pay-badge"><i class="ph ${PAY_ICONS[v.payment_method] || 'ph-money'}"></i> ${PAY_LABELS[v.payment_method] || v.payment_method || '—'}</span></td>
            <td>${v.is_fiscal_ticket ? '<span class="badge badge-scaled" style="margin:0;">Fiscal</span>' : '<span style="color:var(--muted);">—</span>'}</td>
            <td class="num"><strong>${fmt(v.total)}</strong></td>
        `;
        tbody.appendChild(tr);

        const detail = document.createElement('tr');
        detail.className = 'caja-detail hidden';
        detail.id = `detail-${idx}`;
        detail.innerHTML = `<td colspan="5"><div class="detail-items">Venta #${v.id} · ${itemsList}</div></td>`;
        tbody.appendChild(detail);
    });
}

function toggleSaleDetail(idx) {
    const detail = document.getElementById(`detail-${idx}`);
    const caret = document.getElementById(`caret-${idx}`);
    if (!detail) return;
    const open = detail.classList.toggle('hidden');
    caret.className = open ? 'ph ph-caret-right' : 'ph ph-caret-down';
}

// ===== ABM de Categorías y Proveedores =====
let catalogCategories = [];
let catalogProviders = [];

async function loadCatalog() {
    try {
        [catalogCategories, catalogProviders] = await Promise.all([
            fetch('/api/categories').then(r => r.json()),
            fetch('/api/providers').then(r => r.json())
        ]);
        renderCatalogList('categories');
        renderCatalogList('providers');
    } catch (e) {
        showToast('Error al cargar el catálogo', 'error');
    }
}

// kind: 'categories' | 'providers'
function renderCatalogList(kind) {
    const isCat = kind === 'categories';
    const items = isCat ? catalogCategories : catalogProviders;
    const list = document.getElementById(isCat ? 'categories-list' : 'providers-list');
    document.getElementById(isCat ? 'cat-count' : 'prov-count').textContent = items.length;

    if (items.length === 0) {
        list.innerHTML = `<p class="abm-empty">Sin ${isCat ? 'categorías' : 'proveedores'} todavía.</p>`;
        return;
    }

    list.innerHTML = '';
    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'abm-item';
        row.innerHTML = `
            <span class="abm-name">${escapeHtml(item.name)}</span>
            <div class="abm-actions">
                <button class="btn-icon" title="Renombrar" onclick="editCatalogItem('${kind}', ${item.id})"><i class="ph ph-pencil-simple"></i></button>
                <button class="btn-icon danger" title="Eliminar" onclick="deleteCatalogItem('${kind}', ${item.id})"><i class="ph ph-trash"></i></button>
            </div>
        `;
        list.appendChild(row);
    });
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function addCategory(e) {
    e.preventDefault();
    const input = document.getElementById('new-category');
    await createCatalogItem('categories', input.value, input);
}

async function addProvider(e) {
    e.preventDefault();
    const input = document.getElementById('new-provider');
    await createCatalogItem('providers', input.value, input);
}

async function createCatalogItem(kind, name, input) {
    name = name.trim();
    if (!name) return;
    try {
        const res = await fetch(`/api/${kind}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo crear');
        input.value = '';
        await loadCatalog();
        showToast(`${kind === 'categories' ? 'Categoría' : 'Proveedor'} agregado`);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function editCatalogItem(kind, id) {
    const items = kind === 'categories' ? catalogCategories : catalogProviders;
    const item = items.find(i => i.id === id);
    if (!item) return;
    const name = prompt('Nuevo nombre:', item.name);
    if (name === null) return;
    if (!name.trim()) { showToast('El nombre no puede estar vacío', 'error'); return; }
    try {
        const res = await fetch(`/api/${kind}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim() })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo renombrar');
        await loadCatalog();
        // El rename se propaga a productos: refrescar vistas dependientes
        currentProducts = await fetchProducts();
        showToast('Cambios guardados (también en los productos asociados)');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteCatalogItem(kind, id) {
    const items = kind === 'categories' ? catalogCategories : catalogProviders;
    const item = items.find(i => i.id === id);
    const label = kind === 'categories' ? 'la categoría' : 'el proveedor';
    if (!confirm(`¿Eliminar ${label} "${item ? item.name : ''}"?\nLos productos no se borran, solo se quita de la lista.`)) return;
    try {
        const res = await fetch(`/api/${kind}/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('No se pudo eliminar');
        await loadCatalog();
        showToast('Eliminado');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ===== Módulo de Stock =====
let stockProducts = [];
let stockFilter = 'all';

async function loadStock() {
    stockProducts = await fetchProducts();
    renderStockStats();
    renderStockTable();
}

// Clasifica un producto: 'out' (sin stock) | 'low' (bajo mínimo) | 'ok'
function stockStatus(p) {
    if (p.stock <= 0) return 'out';
    if (p.min_stock > 0 && p.stock <= p.min_stock) return 'low';
    return 'ok';
}

function renderStockStats() {
    const fmt = n => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const total = stockProducts.length;
    const out = stockProducts.filter(p => stockStatus(p) === 'out').length;
    const low = stockProducts.filter(p => stockStatus(p) === 'low').length;
    const invValue = stockProducts.reduce((s, p) => s + p.cost * Math.max(p.stock, 0), 0);

    document.getElementById('stock-stats').innerHTML = `
        <div class="stat-card">
            <span class="stat-label"><i class="ph ph-package"></i> Productos</span>
            <span class="stat-value">${total}</span>
        </div>
        <div class="stat-card ${low ? 'stat-warn' : ''}">
            <span class="stat-label"><i class="ph ph-warning"></i> Stock crítico</span>
            <span class="stat-value">${low}</span>
        </div>
        <div class="stat-card ${out ? 'stat-danger' : ''}">
            <span class="stat-label"><i class="ph ph-prohibit"></i> Sin stock</span>
            <span class="stat-value">${out}</span>
        </div>
        <div class="stat-card stat-accent">
            <span class="stat-label"><i class="ph ph-currency-circle-dollar"></i> Valor inventario (costo)</span>
            <span class="stat-value">${fmt(invValue)}</span>
        </div>
    `;
}

function setStockFilter(f) {
    stockFilter = f;
    document.querySelectorAll('#stock-filters .filter-tab')
        .forEach(t => t.classList.toggle('active', t.dataset.filter === f));
    renderStockTable();
}

function renderStockTable() {
    const tbody = document.getElementById('stock-tbody');
    const term = (document.getElementById('stock-search').value || '').toLowerCase();

    let list = stockProducts.filter(p => {
        const st = stockStatus(p);
        if (stockFilter === 'low' && st !== 'low') return false;
        if (stockFilter === 'out' && st !== 'out') return false;
        return true;
    });
    if (term) {
        list = list.filter(p =>
            p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term));
    }

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:2rem;">Sin productos en esta vista.</td></tr>';
        return;
    }

    const badges = {
        out: '<span class="stock-badge badge-out">Sin stock</span>',
        low: '<span class="stock-badge badge-low">Crítico</span>',
        ok: '<span class="stock-badge badge-ok">OK</span>'
    };

    tbody.innerHTML = '';
    list.sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
        const st = stockStatus(p);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="num">${p.code}</td>
            <td><strong>${escapeHtml(p.name)}</strong><div class="stock-sub">${escapeHtml(p.category || '—')}</div></td>
            <td class="num"><span class="stock-qty ${st}">${p.stock}</span></td>
            <td class="num">${p.min_stock || '—'}</td>
            <td>${badges[st]}</td>
            <td class="td-actions">
                <button class="btn btn-secondary btn-sm" onclick='openStockModal(${JSON.stringify(p)})'><i class="ph ph-sliders"></i> Ajustar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Modal de ajuste de stock ---
let stockMoveType = 'entrada';

function openStockModal(p) {
    document.getElementById('stock-modal-id').value = p.id;
    document.getElementById('stock-modal-prod').textContent = `${p.name} · Cód. ${p.code}`;
    document.getElementById('stock-modal-current').textContent = p.stock;
    document.getElementById('stock-modal-current').dataset.stock = p.stock;
    document.getElementById('stock-modal-qty').value = 1;
    document.getElementById('stock-modal-reason').value = '';
    document.getElementById('stock-modal-error').style.display = 'none';
    document.getElementById('stock-modal-confirm').disabled = false;
    setStockMoveType('entrada');
    document.getElementById('stock-modal').classList.remove('hidden');
}

function closeStockModal() {
    document.getElementById('stock-modal').classList.add('hidden');
}

function setStockMoveType(type) {
    stockMoveType = type;
    document.querySelectorAll('.move-chip')
        .forEach(c => c.classList.toggle('active', c.dataset.move === type));
    const label = document.getElementById('stock-qty-label');
    label.textContent = type === 'entrada' ? 'Cantidad a ingresar'
        : type === 'salida' ? 'Cantidad a retirar'
        : 'Nuevo valor de stock';
    updateStockPreview();
}

function updateStockPreview() {
    const current = parseInt(document.getElementById('stock-modal-current').dataset.stock) || 0;
    const qty = parseInt(document.getElementById('stock-modal-qty').value) || 0;
    let result;
    if (stockMoveType === 'entrada') result = current + qty;
    else if (stockMoveType === 'salida') result = current - qty;
    else result = qty;
    const el = document.getElementById('stock-modal-result');
    el.textContent = result;
    el.classList.toggle('negative', result < 0);
}

async function confirmStockAdjust() {
    const id = document.getElementById('stock-modal-id').value;
    const qty = parseInt(document.getElementById('stock-modal-qty').value);
    const reason = document.getElementById('stock-modal-reason').value;
    const errEl = document.getElementById('stock-modal-error');
    const btn = document.getElementById('stock-modal-confirm');

    if (!Number.isFinite(qty) || qty < 0) {
        errEl.textContent = 'Ingresá una cantidad válida.';
        errEl.style.display = 'block';
        return;
    }

    btn.disabled = true;
    errEl.style.display = 'none';
    try {
        const res = await fetch(`/api/products/${id}/stock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: stockMoveType, quantity: qty, reason })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo ajustar el stock');

        closeStockModal();
        await loadStock();          // refresca tabla y tarjetas
        currentProducts = await fetchProducts(); // mantiene el POS al día
        showToast(`Stock actualizado: ${data.stock} u.`);
    } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
        btn.disabled = false;
    }
}

function initStockModal() {
    document.querySelectorAll('.move-chip').forEach(chip => {
        chip.addEventListener('click', () => setStockMoveType(chip.dataset.move));
    });
}

// ===== Módulo de Pedidos a Proveedor =====
const ORDER_STATUS = {
    pendiente: { label: 'Pendiente', cls: 'badge-low' },
    recibido_parcial: { label: 'Recibido parcial', cls: 'badge-scaled' },
    recibido: { label: 'Recibido', cls: 'badge-ok' }
};
const money = n => `$${(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function loadOrders() {
    await Promise.all([loadSuggestions(), loadOrdersList()]);
}

// --- Sugerencias de reposición ---
async function loadSuggestions() {
    const container = document.getElementById('suggest-content');
    container.innerHTML = '<p class="abm-empty">Cargando...</p>';
    try {
        const groups = await fetch('/api/restock-suggestions').then(r => r.json());
        const totalProducts = groups.reduce((s, g) => s + g.items.length, 0);
        document.getElementById('suggest-count').textContent = totalProducts;

        if (groups.length === 0) {
            container.innerHTML = '<p class="abm-empty"><i class="ph ph-check-circle" style="color:var(--green);"></i> No hay productos por debajo del mínimo. Todo en orden.</p>';
            return;
        }

        container.innerHTML = groups.map(g => `
            <div class="suggest-group">
                <div class="suggest-group-head">
                    <div>
                        <i class="ph ph-truck"></i>
                        <strong>${escapeHtml(g.provider)}</strong>
                        <span class="suggest-prod-count">${g.items.length} ${g.items.length === 1 ? 'producto' : 'productos'}</span>
                    </div>
                    <button class="btn btn-primary btn-sm" onclick='openOrderDraft(${JSON.stringify(g).replace(/'/g, "&#39;")})'>
                        <i class="ph ph-plus"></i> Generar pedido
                    </button>
                </div>
                <div class="suggest-items">
                    ${g.items.map(p => `
                        <div class="suggest-item">
                            <span class="suggest-name">${escapeHtml(p.name)} <span class="suggest-code">${p.code}</span></span>
                            <span class="suggest-stock ${p.stock <= 0 ? 'out' : 'low'}">Stock: ${p.stock}${p.min_stock ? ' / mín ' + p.min_stock : ''}</span>
                            <span class="suggest-qty">sugerido: <strong>${p.suggested}</strong></span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    } catch (e) {
        container.innerHTML = '<p class="abm-empty" style="color:var(--red);">Error al cargar sugerencias</p>';
    }
}

// --- Listado de pedidos ---
async function loadOrdersList() {
    const tbody = document.getElementById('orders-tbody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);">Cargando...</td></tr>';
    try {
        const orders = await fetch('/api/purchase-orders').then(r => r.json());
        if (orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:1.5rem;">Todavía no hay pedidos registrados.</td></tr>';
            return;
        }
        tbody.innerHTML = '';
        orders.forEach(o => {
            const st = ORDER_STATUS[o.status] || ORDER_STATUS.pendiente;
            const date = (o.created_at || '').slice(0, 16).replace('T', ' ');
            const canReceive = o.status !== 'recibido';
            const canDelete = o.status === 'pendiente';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="num">#${o.id}</td>
                <td class="num">${date}</td>
                <td>${escapeHtml(o.provider || '—')}</td>
                <td class="num">${o.item_count} (${o.total_qty} u.)</td>
                <td><span class="stock-badge ${st.cls}">${st.label}</span></td>
                <td class="num">${money(o.total)}</td>
                <td class="td-actions">
                    <button class="btn-icon" title="Imprimir / PDF" onclick="printOrder(${o.id})"><i class="ph ph-printer"></i></button>
                    ${canReceive ? `<button class="btn-icon" title="Recibir mercadería" style="color:var(--green);" onclick="openReceiveModal(${o.id})"><i class="ph ph-package"></i></button>` : ''}
                    ${canDelete ? `<button class="btn-icon danger" title="Eliminar" onclick="deleteOrder(${o.id})"><i class="ph ph-trash"></i></button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--red);">Error al cargar pedidos</td></tr>';
    }
}

// --- Borrador de pedido (modal editable) ---
let orderDraft = { provider: '', items: [] };

function openOrderDraft(group) {
    orderDraft = {
        provider: group.provider,
        items: group.items.map(p => ({
            product_id: p.id, code: p.code, name: p.name, stock: p.stock,
            quantity: p.suggested, cost: p.cost
        }))
    };
    document.getElementById('order-modal-provider').textContent = group.provider;
    document.getElementById('order-error').style.display = 'none';
    document.getElementById('order-save-btn').disabled = false;
    renderOrderItems();
    document.getElementById('order-modal').classList.remove('hidden');
}

function renderOrderItems() {
    const container = document.getElementById('order-items');
    if (orderDraft.items.length === 0) {
        container.innerHTML = '<p class="abm-empty">No quedan ítems en el pedido.</p>';
    } else {
        container.innerHTML = '';
        orderDraft.items.forEach((it, i) => {
            const row = document.createElement('div');
            row.className = 'order-row';
            row.innerHTML = `
                <span class="order-prod"><strong>${escapeHtml(it.name)}</strong><span class="order-code">${it.code}</span></span>
                <span class="num">${it.stock}</span>
                <input type="number" class="form-input order-input" min="1" value="${it.quantity}" onchange="updateOrderItem(${i}, 'quantity', this.value)">
                <input type="number" class="form-input order-input" min="0" step="0.01" value="${it.cost}" onchange="updateOrderItem(${i}, 'cost', this.value)">
                <span class="num order-subtotal" id="order-sub-${i}">${money(it.quantity * it.cost)}</span>
                <button class="btn-icon danger" title="Quitar" onclick="removeOrderItem(${i})"><i class="ph ph-x"></i></button>
            `;
            container.appendChild(row);
        });
    }
    updateOrderTotal();
}

function updateOrderItem(i, field, value) {
    orderDraft.items[i][field] = field === 'cost' ? (parseFloat(value) || 0) : (parseInt(value) || 0);
    const sub = document.getElementById(`order-sub-${i}`);
    if (sub) sub.textContent = money(orderDraft.items[i].quantity * orderDraft.items[i].cost);
    updateOrderTotal();
}

function removeOrderItem(i) {
    orderDraft.items.splice(i, 1);
    renderOrderItems();
}

function updateOrderTotal() {
    const total = orderDraft.items.reduce((s, it) => s + it.quantity * it.cost, 0);
    document.getElementById('order-total').textContent = money(total);
}

function closeOrderModal() {
    document.getElementById('order-modal').classList.add('hidden');
}

async function saveOrder() {
    const errEl = document.getElementById('order-error');
    const btn = document.getElementById('order-save-btn');
    const items = orderDraft.items.filter(it => it.quantity > 0);
    if (items.length === 0) {
        errEl.textContent = 'El pedido no tiene ítems con cantidad válida.';
        errEl.style.display = 'block';
        return;
    }
    btn.disabled = true;
    errEl.style.display = 'none';
    try {
        const res = await fetch('/api/purchase-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: orderDraft.provider,
                items: items.map(it => ({ product_id: it.product_id, quantity: it.quantity, cost: it.cost }))
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo guardar el pedido');
        closeOrderModal();
        await loadOrders();
        showToast(`Pedido #${data.id} creado`);
    } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
        btn.disabled = false;
    }
}

async function deleteOrder(id) {
    if (!confirm(`¿Eliminar el pedido #${id}? Esta acción no se puede deshacer.`)) return;
    try {
        const res = await fetch(`/api/purchase-orders/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo eliminar');
        await loadOrders();
        showToast('Pedido eliminado');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// --- Recepción de mercadería ---
let receiveOrder = null;

async function openReceiveModal(id) {
    try {
        receiveOrder = await fetch(`/api/purchase-orders/${id}`).then(r => r.json());
        document.getElementById('receive-order-num').textContent = `#${receiveOrder.id}`;
        document.getElementById('receive-error').style.display = 'none';
        document.getElementById('receive-confirm-btn').disabled = false;

        const container = document.getElementById('receive-items');
        container.innerHTML = '';
        receiveOrder.items.forEach((it, i) => {
            const pending = it.quantity - it.qty_received;
            const row = document.createElement('div');
            row.className = 'receive-row';
            row.innerHTML = `
                <span class="order-prod"><strong>${escapeHtml(it.name || '—')}</strong><span class="order-code">${it.code || ''}</span></span>
                <span class="num">${it.quantity}</span>
                <span class="num">${it.qty_received}</span>
                <input type="number" class="form-input order-input" min="0" max="${pending}" value="${pending}" data-item="${it.id}" id="receive-qty-${i}">
            `;
            container.appendChild(row);
        });
        document.getElementById('receive-modal').classList.remove('hidden');
    } catch (e) {
        showToast('Error al abrir el pedido', 'error');
    }
}

function fillReceiveAll() {
    if (!receiveOrder) return;
    receiveOrder.items.forEach((it, i) => {
        const input = document.getElementById(`receive-qty-${i}`);
        if (input) input.value = it.quantity - it.qty_received;
    });
}

function closeReceiveModal() {
    document.getElementById('receive-modal').classList.add('hidden');
    receiveOrder = null;
}

async function confirmReceive() {
    const errEl = document.getElementById('receive-error');
    const btn = document.getElementById('receive-confirm-btn');
    const items = [];
    document.querySelectorAll('#receive-items input[data-item]').forEach(inp => {
        const qty = parseInt(inp.value) || 0;
        if (qty > 0) items.push({ item_id: parseInt(inp.dataset.item), qty_received: qty });
    });
    if (items.length === 0) {
        errEl.textContent = 'Indicá al menos una cantidad a recibir.';
        errEl.style.display = 'block';
        return;
    }
    btn.disabled = true;
    errEl.style.display = 'none';
    try {
        const res = await fetch(`/api/purchase-orders/${receiveOrder.id}/receive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo registrar la recepción');
        closeReceiveModal();
        await loadOrders();
        currentProducts = await fetchProducts(); // POS al día con el stock nuevo
        showToast('Recepción registrada · stock actualizado');
    } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
        btn.disabled = false;
    }
}

// --- Impresión / PDF de un pedido (ventana imprimible, sin dependencias) ---
async function printOrder(id) {
    try {
        const o = await fetch(`/api/purchase-orders/${id}`).then(r => r.json());
        const rows = o.items.map(it => `
            <tr>
                <td>${it.code || ''}</td>
                <td>${escapeHtml(it.name || '')}</td>
                <td style="text-align:right;">${it.quantity}</td>
                <td style="text-align:right;">${money(it.cost)}</td>
                <td style="text-align:right;">${money(it.quantity * it.cost)}</td>
            </tr>`).join('');
        const win = window.open('', '_blank', 'width=800,height=900');
        win.document.write(`
            <html><head><title>Pedido #${o.id}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 30px; color: #1a1a1a; }
                h1 { margin: 0 0 4px; }
                .muted { color: #666; font-size: 13px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { padding: 8px 10px; border-bottom: 1px solid #ddd; font-size: 14px; }
                th { text-align: left; background: #f4f4f4; }
                tfoot td { font-weight: bold; border-top: 2px solid #333; }
                .head { display: flex; justify-content: space-between; align-items: flex-start; }
            </style></head><body>
            <div class="head">
                <div>
                    <h1>Pedido de compra #${o.id}</h1>
                    <div class="muted">Proveedor: <strong>${escapeHtml(o.provider || '—')}</strong></div>
                    <div class="muted">Fecha: ${(o.created_at || '').slice(0, 16)}</div>
                </div>
                <div style="text-align:right;"><strong>FerrePro</strong><br><span class="muted">Pedido a proveedor</span></div>
            </div>
            <table>
                <thead><tr><th>Código</th><th>Descripción</th><th style="text-align:right;">Cant.</th><th style="text-align:right;">Costo u.</th><th style="text-align:right;">Subtotal</th></tr></thead>
                <tbody>${rows}</tbody>
                <tfoot><tr><td colspan="4" style="text-align:right;">TOTAL</td><td style="text-align:right;">${money(o.total)}</td></tr></tfoot>
            </table>
            <p class="muted" style="margin-top:40px;">Generado por FerrePro</p>
            </body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 350);
    } catch (e) {
        showToast('Error al generar el documento', 'error');
    }
}

// ===== Módulo de Corredores y Cuenta Corriente =====
let corridorsList = [];
let currentCorridorDetail = null;

async function loadCorridors() {
    const tbody = document.getElementById('corridors-tbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);">Cargando...</td></tr>';
    try {
        corridorsList = await fetch('/api/corridors').then(r => r.json());
        renderCorridorStats();
        renderCorridorsTable();
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--red);">Error al cargar corredores</td></tr>';
    }
}

function renderCorridorStats() {
    const totalDeuda = corridorsList.reduce((s, c) => s + Math.max(c.balance, 0), 0);
    const conDeuda = corridorsList.filter(c => c.balance > 0.001).length;
    document.getElementById('corridor-stats').innerHTML = `
        <div class="stat-card">
            <span class="stat-label"><i class="ph ph-users-three"></i> Corredores</span>
            <span class="stat-value">${corridorsList.length}</span>
        </div>
        <div class="stat-card ${conDeuda ? 'stat-warn' : ''}">
            <span class="stat-label"><i class="ph ph-user-list"></i> Con deuda</span>
            <span class="stat-value">${conDeuda}</span>
        </div>
        <div class="stat-card stat-accent">
            <span class="stat-label"><i class="ph ph-currency-circle-dollar"></i> Deuda total por cobrar</span>
            <span class="stat-value">${money(totalDeuda)}</span>
        </div>
    `;
}

function renderCorridorsTable() {
    const tbody = document.getElementById('corridors-tbody');
    if (corridorsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">Todavía no hay corredores. Creá el primero con "Nuevo Corredor".</td></tr>';
        return;
    }
    tbody.innerHTML = '';
    corridorsList.forEach(c => {
        const debt = c.balance > 0.001;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(c.name)}</strong></td>
            <td>${c.is_particular_builder ? '<span class="stock-badge badge-scaled">Obra particular</span>' : '<span style="color:var(--muted);">Corredor</span>'}</td>
            <td class="num">${c.discount_percentage ? c.discount_percentage + '%' : '—'}</td>
            <td>${escapeHtml(c.phone || '—')}</td>
            <td class="num"><span class="${debt ? 'stock-qty out' : 'stock-qty ok'}">${money(c.balance)}</span></td>
            <td class="td-actions">
                <button class="btn btn-secondary btn-sm" onclick="openCorridorDetail(${c.id})"><i class="ph ph-receipt"></i> Cuenta</button>
                <button class="btn-icon" title="Editar" onclick='openCorridorModal(${JSON.stringify(c)})'><i class="ph ph-pencil-simple"></i></button>
                <button class="btn-icon danger" title="Eliminar" onclick="deleteCorridor(${c.id})"><i class="ph ph-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- ABM corredor ---
function openCorridorModal(corridor = null) {
    const form = document.getElementById('corridor-form');
    form.reset();
    document.getElementById('corridor-error').style.display = 'none';
    if (corridor && corridor.id) {
        document.getElementById('corridor-modal-title').textContent = 'Editar Corredor';
        document.getElementById('corridor-id').value = corridor.id;
        document.getElementById('corridor-name').value = corridor.name;
        document.getElementById('corridor-discount').value = corridor.discount_percentage || 0;
        document.getElementById('corridor-phone').value = corridor.phone || '';
        document.getElementById('corridor-builder').checked = !!corridor.is_particular_builder;
        document.getElementById('corridor-notes').value = corridor.notes || '';
    } else {
        document.getElementById('corridor-modal-title').textContent = 'Nuevo Corredor';
        document.getElementById('corridor-id').value = '';
    }
    document.getElementById('corridor-modal').classList.remove('hidden');
}

function closeCorridorModal() {
    document.getElementById('corridor-modal').classList.add('hidden');
}

async function saveCorridor(e) {
    e.preventDefault();
    const id = document.getElementById('corridor-id').value;
    const errEl = document.getElementById('corridor-error');
    const payload = {
        name: document.getElementById('corridor-name').value,
        discount_percentage: parseFloat(document.getElementById('corridor-discount').value) || 0,
        phone: document.getElementById('corridor-phone').value,
        is_particular_builder: document.getElementById('corridor-builder').checked,
        notes: document.getElementById('corridor-notes').value
    };
    try {
        const res = await fetch(id ? `/api/corridors/${id}` : '/api/corridors', {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
        closeCorridorModal();
        await loadCorridors();
        showToast(id ? 'Corredor actualizado' : 'Corredor creado');
    } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
    }
}

async function deleteCorridor(id) {
    const c = corridorsList.find(x => x.id === id);
    if (!confirm(`¿Eliminar al corredor "${c ? c.name : ''}"?`)) return;
    try {
        const res = await fetch(`/api/corridors/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo eliminar');
        await loadCorridors();
        showToast('Corredor eliminado');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// --- Detalle / estado de cuenta ---
async function openCorridorDetail(id) {
    try {
        currentCorridorDetail = await fetch(`/api/corridors/${id}`).then(r => r.json());
        const c = currentCorridorDetail;
        document.getElementById('cd-name').textContent = c.name;
        const subParts = [];
        if (c.is_particular_builder) subParts.push('Obra particular');
        if (c.discount_percentage) subParts.push(`${c.discount_percentage}% de descuento`);
        if (c.phone) subParts.push(`Tel: ${escapeHtml(c.phone)}`);
        document.getElementById('cd-sub').innerHTML = subParts.join(' · ') || 'Sin datos adicionales';
        const balEl = document.getElementById('cd-balance');
        balEl.textContent = money(c.balance);
        balEl.classList.toggle('debt', c.balance > 0.001);
        document.getElementById('cd-pay-amount').value = '';
        document.getElementById('cd-pay-note').value = '';
        renderStatement(c.movements);
        document.getElementById('corridor-detail-modal').classList.remove('hidden');
    } catch (e) {
        showToast('Error al abrir la cuenta', 'error');
    }
}

function renderStatement(movements) {
    const tbody = document.getElementById('cd-statement');
    if (!movements || movements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1rem;">Sin movimientos.</td></tr>';
        return;
    }
    tbody.innerHTML = movements.map(m => `
        <tr>
            <td class="num">${(m.date || '').slice(0, 16)}</td>
            <td>${escapeHtml(m.ref)}</td>
            <td class="num">${m.debit ? money(m.debit) : '—'}</td>
            <td class="num" style="color:var(--green);">${m.credit ? money(m.credit) : '—'}</td>
            <td class="num"><strong>${money(m.balance)}</strong></td>
        </tr>
    `).join('');
}

function closeCorridorDetail() {
    document.getElementById('corridor-detail-modal').classList.add('hidden');
    currentCorridorDetail = null;
}

async function registerPayment() {
    if (!currentCorridorDetail) return;
    const amount = parseFloat(document.getElementById('cd-pay-amount').value);
    if (!Number.isFinite(amount) || amount <= 0) {
        showToast('Ingresá un importe válido', 'error');
        return;
    }
    const note = document.getElementById('cd-pay-note').value;
    try {
        const res = await fetch(`/api/corridors/${currentCorridorDetail.id}/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, method: 'efectivo', note })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo registrar el pago');
        showToast(`Cobranza registrada · ${money(amount)}`);
        await openCorridorDetail(currentCorridorDetail.id); // refrescar estado de cuenta
        loadCorridors(); // refrescar saldos de la tabla detrás
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Lista de precios personalizada del corredor (precio con su descuento) → imprimible
async function printPriceList() {
    if (!currentCorridorDetail) return;
    const c = currentCorridorDetail;
    const disc = c.discount_percentage || 0;
    try {
        const products = await fetchProducts();
        const rows = products.map(p => {
            const base = p.cost * (1 + p.profit_margin / 100);
            const price = base * (1 - disc / 100);
            return `<tr>
                <td>${p.code}</td>
                <td>${escapeHtml(p.name)}</td>
                <td style="text-align:right;">${money(base)}</td>
                <td style="text-align:right;"><strong>${money(price)}</strong></td>
            </tr>`;
        }).join('');
        const win = window.open('', '_blank', 'width=820,height=900');
        win.document.write(`
            <html><head><title>Lista de precios - ${escapeHtml(c.name)}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 30px; color: #1a1a1a; }
                h1 { margin: 0 0 4px; } .muted { color:#666; font-size:13px; }
                table { width:100%; border-collapse:collapse; margin-top:18px; }
                th,td { padding:7px 10px; border-bottom:1px solid #ddd; font-size:13px; }
                th { text-align:left; background:#f4f4f4; }
            </style></head><body>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                    <h1>Lista de precios</h1>
                    <div class="muted">Corredor: <strong>${escapeHtml(c.name)}</strong>${disc ? ' · Descuento ' + disc + '%' : ''}</div>
                </div>
                <div style="text-align:right;"><strong>FerrePro</strong></div>
            </div>
            <table>
                <thead><tr><th>Código</th><th>Descripción</th><th style="text-align:right;">Precio lista</th><th style="text-align:right;">Precio ${escapeHtml(c.name)}</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <p class="muted" style="margin-top:30px;">Generado por FerrePro</p>
            </body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 350);
    } catch (e) {
        showToast('Error al generar la lista', 'error');
    }
}

// ===== Configuración: datos de la empresa =====
let companyInfo = {};   // cache global, usado por los documentos
let pendingLogo = '';   // logo seleccionado (data URL) aún sin guardar

async function fetchCompany() {
    try { companyInfo = await fetch('/api/company').then(r => r.json()) || {}; }
    catch (e) { companyInfo = {}; }
    return companyInfo;
}

async function loadCompany() {
    await fetchCompany();
    const c = companyInfo;
    document.getElementById('company-name').value = c.name || '';
    document.getElementById('company-cuit').value = c.cuit || '';
    document.getElementById('company-iva').value = c.iva_condition || 'Responsable Inscripto';
    document.getElementById('company-address').value = c.address || '';
    document.getElementById('company-phone').value = c.phone || '';
    document.getElementById('company-email').value = c.email || '';
    document.getElementById('company-footer').value = c.footer_note || '';
    document.getElementById('company-auto-ticket').checked = !!c.auto_ticket;
    pendingLogo = c.logo || '';
    renderLogoPreview();
    loadBackups();
}

// ===== Backups =====
async function loadBackups() {
    const list = document.getElementById('backup-list');
    try {
        const backups = await fetch('/api/backups').then(r => r.json());
        if (!backups || backups.length === 0) {
            list.innerHTML = '<p class="abm-empty">Todavía no hay copias. El primer backup se crea unos segundos después de iniciar el servidor.</p>';
            document.getElementById('backup-last').textContent = '';
            return;
        }
        const last = new Date(backups[0].mtime);
        document.getElementById('backup-last').textContent = `Última copia: ${last.toLocaleString('es-AR')}`;
        const kb = n => `${Math.round(n / 1024).toLocaleString('es-AR')} KB`;
        list.innerHTML = backups.slice(0, 12).map(b => `
            <div class="backup-item">
                <i class="ph ph-file-archive"></i>
                <span class="backup-name mono">${b.file}</span>
                <span class="backup-size mono">${kb(b.size)}</span>
                <button class="btn btn-secondary btn-sm" onclick="restoreBackup('${b.file}')"><i class="ph ph-clock-counter-clockwise"></i> Restaurar</button>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<p class="abm-empty" style="color:var(--red);">Error al listar copias</p>';
    }
}

async function createBackup() {
    try {
        const res = await fetch('/api/backup', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo crear el backup');
        await loadBackups();
        showToast('Backup creado: ' + data.file);
    } catch (err) { showToast(err.message, 'error'); }
}

async function restoreBackup(file) {
    if (!confirm(`¿Restaurar la base desde "${file}"?\n\nSe reemplazarán TODOS los datos actuales por los de esa copia.\n(Se hace un resguardo automático del estado actual antes de restaurar.)`)) return;
    try {
        const res = await fetch('/api/restore', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo restaurar');
        showToast('Base restaurada. Recargando...');
        setTimeout(() => location.reload(), 1200);
    } catch (err) { showToast(err.message, 'error'); }
}

// Cambio de contraseña de administrador
async function changePassword(e) {
    e.preventDefault();
    const cur = document.getElementById('pass-current').value;
    const nw = document.getElementById('pass-new').value;
    const cf = document.getElementById('pass-confirm').value;
    const errEl = document.getElementById('pass-error');
    if (nw.length < 4) { errEl.textContent = 'La nueva contraseña debe tener al menos 4 caracteres.'; errEl.style.display = 'block'; return; }
    if (nw !== cf) { errEl.textContent = 'Las contraseñas nuevas no coinciden.'; errEl.style.display = 'block'; return; }
    try {
        const res = await fetch('/api/auth/password', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current: cur, new_password: nw })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo cambiar la contraseña');
        document.getElementById('password-form').reset();
        errEl.style.display = 'none';
        showToast('Contraseña actualizada');
    } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
    }
}

function renderLogoPreview() {
    const box = document.getElementById('logo-preview');
    if (pendingLogo) {
        box.innerHTML = `<img src="${pendingLogo}" alt="Logo">`;
    } else {
        box.innerHTML = '<span class="logo-placeholder"><i class="ph ph-image-square"></i><br>Sin logo</span>';
    }
}

function onLogoSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) {
        showToast('El logo es muy pesado (máx. ~2 MB)', 'error');
        e.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = () => { pendingLogo = reader.result; renderLogoPreview(); };
    reader.readAsDataURL(file);
    e.target.value = '';
}

function clearLogo() {
    pendingLogo = '';
    renderLogoPreview();
}

async function saveCompany(e) {
    e.preventDefault();
    const payload = {
        name: document.getElementById('company-name').value,
        cuit: document.getElementById('company-cuit').value,
        iva_condition: document.getElementById('company-iva').value,
        address: document.getElementById('company-address').value,
        phone: document.getElementById('company-phone').value,
        email: document.getElementById('company-email').value,
        footer_note: document.getElementById('company-footer').value,
        auto_ticket: document.getElementById('company-auto-ticket').checked,
        logo: pendingLogo
    };
    try {
        const res = await fetch('/api/company', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'No se pudieron guardar los datos');
        }
        companyInfo = { ...payload };
        showToast('Datos de la empresa guardados');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ===== Documentos del POS: presupuesto / tique =====
// Convierte el carrito actual en líneas para el documento (precio unit. con descuento prorrateado)
function cartToDocLines(comp) {
    return currentCart.map(item => {
        const price = getEffectivePrice(item.product, item.quantity);
        const factor = comp.subtotal > 0 ? (comp.finalTotal / comp.subtotal) : 1;
        const unit = price * factor;
        return { code: item.product.code, name: item.product.name, qty: item.quantity, unit, sub: unit * item.quantity };
    });
}

// type: 'presupuesto' | 'ticket'. saleData (opcional) = { comp, lines, saleNumber } para venta ya confirmada
async function printPosDocument(type, saleData) {
    let comp, lines;
    if (saleData) {
        comp = saleData.comp;
        lines = saleData.lines;
    } else {
        if (currentCart.length === 0) {
            showToast('El carrito está vacío', 'error');
            return;
        }
        comp = getCartComputation();
        lines = cartToDocLines(comp);
    }
    // Asegurar datos de empresa frescos
    if (!companyInfo || !companyInfo.name) await fetchCompany();
    const c = companyInfo || {};
    const saleNumber = saleData ? saleData.saleNumber : null;

    const isTicket = type === 'ticket';
    const title = isTicket ? 'TIQUE / COMPROBANTE NO FISCAL' : 'PRESUPUESTO';
    const fmt = n => `$${(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const companyLines = [
        c.cuit ? `CUIT: ${escapeHtml(c.cuit)}` : '',
        c.iva_condition ? escapeHtml(c.iva_condition) : '',
        c.address ? escapeHtml(c.address) : '',
        [c.phone ? 'Tel: ' + escapeHtml(c.phone) : '', c.email ? escapeHtml(c.email) : ''].filter(Boolean).join(' · ')
    ].filter(Boolean).join('<br>');

    const rows = lines.map(l => `
        <tr>
            <td>${l.code || ''}</td>
            <td>${escapeHtml(l.name)}</td>
            <td class="r">${l.qty}</td>
            <td class="r">${fmt(l.unit)}</td>
            <td class="r">${fmt(l.sub)}</td>
        </tr>`).join('');

    const discountRow = comp.discountPct > 0
        ? `<tr><td colspan="4" class="r">Descuento (${comp.discountPct}%)</td><td class="r">-${fmt(comp.discountAmount)}</td></tr>`
        : '';

    // Ancho: ticket angosto (80mm) / presupuesto A4
    const pageCss = isTicket
        ? '@page { size: 80mm auto; margin: 4mm; } body { width: 72mm; }'
        : '@page { size: A4; margin: 16mm; }';

    const win = window.open('', '_blank', isTicket ? 'width=380,height=720' : 'width=820,height=900');
    win.document.write(`
        <html><head><title>${title}</title>
        <style>
            ${pageCss}
            * { box-sizing: border-box; }
            body { font-family: ${isTicket ? "'Courier New', monospace" : 'Arial, sans-serif'}; color:#111; background:#fff; padding:${isTicket ? '0' : '10px'}; font-size:${isTicket ? '12px' : '14px'}; }
            .head { display:flex; align-items:center; gap:14px; ${isTicket ? 'flex-direction:column; text-align:center; gap:4px;' : ''} border-bottom:2px solid #222; padding-bottom:10px; margin-bottom:10px; }
            .logo { ${isTicket ? 'max-width:120px; max-height:70px;' : 'max-width:120px; max-height:90px;'} object-fit:contain; }
            .cname { font-size:${isTicket ? '15px' : '20px'}; font-weight:bold; }
            .muted { color:#555; font-size:${isTicket ? '11px' : '12px'}; line-height:1.45; }
            .doc-title { text-align:${isTicket ? 'center' : 'right'}; }
            .doc-title h2 { margin:0; font-size:${isTicket ? '13px' : '17px'}; letter-spacing:1px; }
            .meta { ${isTicket ? 'text-align:center;' : 'display:flex; justify-content:space-between;'} margin:8px 0; font-size:${isTicket ? '11px' : '13px'}; color:#444; }
            table { width:100%; border-collapse:collapse; margin-top:8px; }
            th,td { padding:${isTicket ? '3px 2px' : '7px 8px'}; font-size:${isTicket ? '11px' : '13px'}; border-bottom:1px solid ${isTicket ? '#ccc' : '#ddd'}; text-align:left; }
            th { background:${isTicket ? 'transparent' : '#f3f3f3'}; ${isTicket ? 'border-bottom:1px dashed #888;' : ''} }
            td.r, th.r { text-align:right; }
            tfoot td { font-weight:bold; font-size:${isTicket ? '13px' : '15px'}; border-top:2px solid #333; border-bottom:none; }
            .footer-note { margin-top:16px; text-align:center; color:#666; font-size:${isTicket ? '11px' : '12px'}; font-style:italic; }
        </style></head><body>
        <div class="head">
            ${c.logo ? `<img class="logo" src="${c.logo}">` : ''}
            <div style="flex:1;">
                <div class="cname">${escapeHtml(c.name || 'Mi Ferretería')}</div>
                <div class="muted">${companyLines}</div>
            </div>
            <div class="doc-title"><h2>${title}</h2></div>
        </div>
        <div class="meta">
            <span>${saleNumber ? 'Comprobante Nº ' + saleNumber + ' · ' : ''}Fecha: ${new Date().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            <span>${comp.count} ${comp.count === 1 ? 'artículo' : 'artículos'}</span>
        </div>
        <table>
            <thead><tr><th>Cód.</th><th>Descripción</th><th class="r">Cant.</th><th class="r">P. Unit.</th><th class="r">Subtotal</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot>
                ${discountRow}
                <tr><td colspan="4" class="r">TOTAL</td><td class="r">${fmt(comp.finalTotal)}</td></tr>
            </tfoot>
        </table>
        ${c.footer_note ? `<div class="footer-note">${escapeHtml(c.footer_note)}</div>` : ''}
        ${!isTicket ? '<div class="footer-note">Documento no válido como factura.</div>' : ''}
        </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 350);
}

// ===== Dashboard / Estadísticas =====
async function loadDashboard() {
    try {
        const d = await fetch('/api/dashboard').then(r => r.json());
        renderDashKpis(d);
        renderDashChart(d.daily);
        renderDashTop(d.topProducts);
        renderDashMethods(d.byMethod);
    } catch (e) {
        document.getElementById('dash-kpis').innerHTML = '<p class="abm-empty" style="color:var(--red);">Error al cargar el dashboard</p>';
    }
}

function renderDashKpis(d) {
    const fmt = n => `$${(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    let changeHtml = '';
    if (d.monthChange !== null && d.monthChange !== undefined) {
        const up = d.monthChange >= 0;
        changeHtml = `<span class="stat-sub" style="color:${up ? 'var(--green)' : 'var(--red)'};">
            <i class="ph ${up ? 'ph-trend-up' : 'ph-trend-down'}"></i> ${up ? '+' : ''}${d.monthChange.toFixed(1)}% vs mes anterior</span>`;
    } else {
        changeHtml = '<span class="stat-sub">sin datos del mes anterior</span>';
    }

    document.getElementById('dash-kpis').innerHTML = `
        <div class="stat-card stat-accent">
            <span class="stat-label"><i class="ph ph-cash-register"></i> Ventas de hoy</span>
            <span class="stat-value">${fmt(d.today.total)}</span>
            <span class="stat-sub">${d.today.count} ${d.today.count === 1 ? 'venta' : 'ventas'}</span>
        </div>
        <div class="stat-card">
            <span class="stat-label"><i class="ph ph-calendar"></i> Ventas del mes</span>
            <span class="stat-value">${fmt(d.month.total)}</span>
            ${changeHtml}
        </div>
        <div class="stat-card">
            <span class="stat-label"><i class="ph ph-chart-line-up"></i> Ganancia estimada (mes)</span>
            <span class="stat-value">${fmt(d.month.profit)}</span>
            <span class="stat-sub">${d.month.count} ventas · ticket prom. ${fmt(d.month.avg)}</span>
        </div>
        <div class="stat-card ${d.extras.lowStock ? 'stat-warn' : ''}">
            <span class="stat-label"><i class="ph ph-warning"></i> Alertas</span>
            <span class="stat-value">${d.extras.lowStock}</span>
            <span class="stat-sub">prod. a reponer${d.extras.corridorDebt > 0 ? ' · ' + fmt(d.extras.corridorDebt) + ' por cobrar' : ''}</span>
        </div>
    `;
}

function renderDashChart(daily) {
    const el = document.getElementById('dash-chart');
    const max = Math.max(...daily.map(d => d.total), 1);
    const fmt = n => `$${(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
    const dayLabel = ds => {
        const parts = ds.split('-');
        return `${parts[2]}/${parts[1]}`;
    };
    el.innerHTML = daily.map(d => {
        const h = Math.round((d.total / max) * 100);
        return `
            <div class="bar-col" title="${dayLabel(d.date)} · ${fmt(d.total)} (${d.count} v.)">
                <div class="bar-value">${d.total > 0 ? fmt(d.total) : ''}</div>
                <div class="bar" style="height:${d.total > 0 ? Math.max(h, 2) : 0}%"></div>
                <div class="bar-label">${dayLabel(d.date)}</div>
            </div>`;
    }).join('');
}

function renderDashTop(top) {
    const el = document.getElementById('dash-top');
    if (!top || top.length === 0) {
        el.innerHTML = '<p class="abm-empty">Sin ventas este mes todavía.</p>';
        return;
    }
    const fmt = n => `$${(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const maxQty = Math.max(...top.map(t => t.qty), 1);
    el.innerHTML = top.map((t, i) => `
        <div class="top-row">
            <span class="top-rank">${i + 1}</span>
            <div class="top-info">
                <div class="top-name">${escapeHtml(t.name || t.code || '—')}</div>
                <div class="top-bar-track"><div class="top-bar" style="width:${Math.round((t.qty / maxQty) * 100)}%"></div></div>
            </div>
            <div class="top-stats">
                <span class="top-qty">${t.qty} u.</span>
                <span class="top-rev">${fmt(t.revenue)}</span>
            </div>
        </div>
    `).join('');
}

function renderDashMethods(methods) {
    const el = document.getElementById('dash-methods');
    if (!methods || methods.length === 0) {
        el.innerHTML = '<p class="abm-empty">Sin ventas este mes todavía.</p>';
        return;
    }
    const fmt = n => `$${(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const total = methods.reduce((s, m) => s + m.total, 0) || 1;
    el.innerHTML = methods.map(m => {
        const pct = Math.round((m.total / total) * 100);
        const label = PAY_LABELS[m.method] || m.method || '—';
        const icon = PAY_ICONS[m.method] || 'ph-money';
        return `
            <div class="method-bar-row">
                <div class="method-bar-head">
                    <span><i class="ph ${icon}"></i> ${label}</span>
                    <span class="mono">${fmt(m.total)} <span style="color:var(--muted);">(${pct}%)</span></span>
                </div>
                <div class="method-bar-track"><div class="method-bar-fill" style="width:${pct}%"></div></div>
            </div>
        `;
    }).join('');
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initNavigation();
    initCheckout();
    initStockModal();
    fetchCompany();   // precargar datos de la empresa para presupuestos/tiques
    initPOS();

    // Handle enter key in password field
    document.getElementById('login-password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            enterAsAdmin();
        }
    });

    // Al volver a desktop, limpiar estados de overlays mobile
    window.addEventListener('resize', () => {
        if (window.innerWidth > 1023) closeSidebar();
        if (window.innerWidth > 860) closeCartSheet();
    });
});
