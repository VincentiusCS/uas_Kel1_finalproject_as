async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    ...options,
  });
  if (!res.ok) {
    let msg = 'Request failed';
    try {
      const data = await res.json();
      if (data && data.error) msg = data.error;
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

// UI helpers
function $(id) {
  return document.getElementById(id);
}

function show(el, visible) {
  el.hidden = !visible;
}

function setText(el, text) {
  el.textContent = text;
}

async function refreshSession() {
  try {
    const user = await api('/api/me');
    if (user) {
      onLoggedIn(user);
    } else {
      onLoggedOut();
    }
  } catch {
    onLoggedOut();
  }
}

function onLoggedOut() {
  show($('loginSection'), true);
  show($('dashboardSection'), false);
  setText($('currentRole'), 'Not logged in');
  $('currentRole').className = 'pill pill-muted';
  $('logoutBtn').hidden = true;
}

async function onLoggedIn(user) {
  show($('loginSection'), false);
  show($('dashboardSection'), true);
  $('logoutBtn').hidden = false;
  setText($('currentRole'), `${user.username} (${user.role})`);
  $('currentRole').className =
    'pill ' + (user.role === 'admin' ? 'pill-admin' : user.role === 'manager' ? 'pill-manager' : 'pill-user');

  // Role-based UI
  const canManageProducts = user.role === 'manager' || user.role === 'admin';
  const isAdmin = user.role === 'admin';

  show($('addProductBtn'), canManageProducts);
  show($('productForm'), false); // toggled by button
  show($('adminPanel'), isAdmin);

  // Load data
  await Promise.all([loadHealth(), loadMetrics(), loadProducts(), loadOrders()]);
  if (isAdmin) {
    await Promise.all([loadUsers(), loadLogs()]);
  }
}

// Monitoring
async function loadHealth() {
  try {
    const data = await api('/api/health');
    setText(
      $('healthStatus'),
      `Status: ${data.status.toUpperCase()} | Time: ${new Date(data.time).toLocaleString()}`
    );
    $('healthStatus').classList.toggle('ok', data.status === 'ok');
  } catch (e) {
    setText($('healthStatus'), 'Server not reachable');
    $('healthStatus').classList.remove('ok');
  }
}

async function loadMetrics() {
  try {
    const m = await api('/api/metrics');
    $('metrics').innerHTML = `
      <div class="metric-item"><span>Users</span><strong>${m.user_count}</strong></div>
      <div class="metric-item"><span>Products</span><strong>${m.product_count}</strong></div>
      <div class="metric-item"><span>Orders</span><strong>${m.order_count}</strong></div>
    `;
  } catch {
    $('metrics').innerHTML = '<span class="muted">Failed to load metrics.</span>';
  }
}

// Products
async function loadProducts() {
  const rows = await api('/api/products');
  const tbody = $('productsTable').querySelector('tbody');
  tbody.innerHTML = '';
  rows.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.id}</td>
      <td>${p.name}</td>
      <td>${p.sku}</td>
      <td>${p.quantity}</td>
    `;
    tbody.appendChild(tr);
  });

  // Fill select for orders
  const select = $('orderProduct');
  select.innerHTML = '';
  rows.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.sku})`;
    select.appendChild(opt);
  });
}

async function saveProduct(evt) {
  evt.preventDefault();
  const name = $('productName').value.trim();
  const sku = $('productSku').value.trim();
  const quantity = parseInt($('productQty').value || '0', 10);
  if (!name || !sku) return;

  try {
    await api('/api/products', {
      method: 'POST',
      body: JSON.stringify({ name, sku, quantity }),
    });
    $('productForm').reset();
    show($('productForm'), false);
    await loadProducts();
  } catch (e) {
    alert('Failed to save product: ' + e.message);
  }
}

// Orders
async function loadOrders() {
  const rows = await api('/api/orders');
  const tbody = $('ordersTable').querySelector('tbody');
  tbody.innerHTML = '';
  const userRoleText = $('currentRole').textContent;
  const isManagerOrAdmin = /manager|admin/.test(userRoleText);

  rows.forEach((o) => {
    const tr = document.createElement('tr');
    const actions =
      isManagerOrAdmin && o.status === 'pending'
        ? `<button class="btn btn-small" data-approve="${o.id}">Approve</button>
           <button class="btn btn-small btn-danger" data-reject="${o.id}">Reject</button>`
        : '';
    tr.innerHTML = `
      <td>${o.id}</td>
      <td>${o.product_name}</td>
      <td>${o.quantity}</td>
      <td><span class="status status-${o.status}">${o.status}</span></td>
      <td>${o.requester}</td>
      <td>${actions}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function createOrder(evt) {
  evt.preventDefault();
  const productId = parseInt($('orderProduct').value, 10);
  const qty = parseInt($('orderQty').value || '1', 10);
  if (!productId || qty <= 0) return;
  try {
    await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, quantity: qty }),
    });
    $('orderForm').reset();
    await loadOrders();
    await loadProducts(); // stock may change after approvals
  } catch (e) {
    alert('Failed to create request: ' + e.message);
  }
}

async function handleOrderAction(evt) {
  const t = evt.target;
  const approveId = t.getAttribute('data-approve');
  const rejectId = t.getAttribute('data-reject');
  if (!approveId && !rejectId) return;

  try {
    if (approveId) {
      await api(`/api/orders/${approveId}/approve`, { method: 'POST' });
    } else if (rejectId) {
      await api(`/api/orders/${rejectId}/reject`, { method: 'POST' });
    }
    await loadOrders();
    await loadProducts();
  } catch (e) {
    alert('Failed to update order: ' + e.message);
  }
}

// Admin
async function loadUsers() {
  const rows = await api('/api/users');
  const tbody = $('usersTable').querySelector('tbody');
  tbody.innerHTML = '';
  rows.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.username}</td>
      <td>${u.role}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadLogs() {
  const rows = await api('/api/logs');
  const tbody = $('logsTable').querySelector('tbody');
  tbody.innerHTML = '';
  rows.forEach((l) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(l.timestamp).toLocaleString()}</td>
      <td>${l.username || '-'}</td>
      <td>${l.action}</td>
      <td>${l.details || ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function createUser(evt) {
  evt.preventDefault();
  const username = $('newUsername').value.trim();
  const password = $('newPassword').value.trim();
  const role = $('newRole').value;
  if (!username || !password) return;
  try {
    await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({ username, password, role }),
    });
    $('userForm').reset();
    await loadUsers();
  } catch (e) {
    alert('Failed to create user: ' + e.message);
  }
}

// Tabs in admin panel
function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabs.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const id = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-content').forEach((el) => {
        el.classList.toggle('hidden', el.id !== id);
      });
      if (id === 'logsTab') {
        loadLogs();
      }
    });
  });
}

// Auth handlers
async function handleLogin(evt) {
  evt.preventDefault();
  const username = $('username').value.trim();
  const password = $('password').value.trim();
  if (!username || !password) return;
  $('loginError').textContent = '';
  try {
    const user = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    $('loginForm').reset();
    onLoggedIn(user);
  } catch (e) {
    $('loginError').textContent = e.message;
  }
}

async function handleLogout() {
  try {
    await api('/api/logout', { method: 'POST' });
  } catch (_) {
    // ignore
  }
  onLoggedOut();
}

// Initialization
window.addEventListener('DOMContentLoaded', () => {
  $('loginForm').addEventListener('submit', handleLogin);
  $('logoutBtn').addEventListener('click', handleLogout);
  $('addProductBtn').addEventListener('click', () => {
    const form = $('productForm');
    show(form, form.hidden);
  });
  $('productForm').addEventListener('submit', saveProduct);
  $('orderForm').addEventListener('submit', createOrder);
  $('ordersTable').addEventListener('click', handleOrderAction);
  $('userForm').addEventListener('submit', createUser);
  initTabs();

  // Periodic monitoring refresh
  setInterval(() => {
    loadHealth();
    loadMetrics();
  }, 15000);

  refreshSession();
});


