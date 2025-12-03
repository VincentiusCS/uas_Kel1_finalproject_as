## Inventory Management System – Server Administration Final Project

A simple **web-based Inventory Management System** built for a server administration scenario:

- **Container / server base**: Node.js + Express + SQLite (can easily run in a container).
- **IDP-style login / roles**:
  - `user` – view inventory, create requests.
  - `manager` – approve/reject requests, manage stock, view reports.
  - `admin` – full access (users, config, logs, monitoring).
- **Monitoring & logs**:
  - `/api/health`, `/api/metrics` – basic server and database monitoring.
  - `app_logs` table + `audit.log` file + `access.log` (HTTP access via morgan).
- **Scenario**: **client** = browser SPA, **server** = Node/Express REST API + SQLite database.

---

### 1. Project Structure

- `package.json` – Node project config, dependencies and scripts.
- `src/server.js` – Express server, API routes, SQLite DB, session-based auth, logging.
- `public/index.html` – Single-page frontend UI.
- `public/app.js` – Frontend logic, calls backend APIs, role-based UI.
- `public/styles.css` – Modern dark UI styling.
- `data.db` – SQLite database (auto-created on first run).
- `audit.log`, `access.log` – log files (auto-created).

---

### 2. Installation & Running

From the project root (where `package.json` is located):

```bash
npm install
npm start    # or: npm run dev  (with auto-reload if nodemon installed globally)
```

Then open your browser to:

```text
http://localhost:3000
```

SQLite DB (`data.db`) and logs will be created automatically in the project root.

---

### 3. Seeded Demo Accounts (IDP / Roles)

On first run, three accounts are automatically created:

- **Admin**: `admin` / `admin123`
- **Manager**: `manager` / `manager123`
- **User**: `user` / `user123`

These are enough to **demonstrate your “idp / login” requirements** with different permission levels.
You can add more users in the **Admin → Users** panel in the UI.

---

### 4. Backend API Overview (Server Side)

**Auth / Session**

- `POST /api/login` – Session login using username/password (SQLite `users` table).
- `POST /api/logout` – Destroys the session.
- `GET /api/me` – Returns current logged-in user (`id`, `username`, `role`) or `null`.

**Inventory / Products**

- `GET /api/products` – (auth required) List all products.
- `POST /api/products` – (roles: `manager`, `admin`) Create product (name, sku, quantity).
- `PUT /api/products/:id` – (roles: `manager`, `admin`) Update product.

**Orders / Requests**

- `GET /api/orders` – (auth required)
  - `user` sees only their own requests.
  - `manager` / `admin` see all requests.
- `POST /api/orders` – (roles: `user`, `manager`, `admin`) Create a new inventory request.
- `POST /api/orders/:id/approve` – (roles: `manager`, `admin`) Approve request and decrement stock.
- `POST /api/orders/:id/reject` – (roles: `manager`, `admin`) Reject request.

**Admin & Logs**

- `GET /api/users` – (role: `admin`) List all users and roles.
- `POST /api/users` – (role: `admin`) Create new user (username, password, role).
- `GET /api/logs` – (role: `admin`) Last 100 application log entries from `app_logs` table.

**Monitoring / Health**

- `GET /api/health` – Checks DB availability, returns `{ status: 'ok', time: ... }` or error.
- `GET /api/metrics` – Returns `{ user_count, product_count, order_count }`.

All important actions (login, create user, add product, approve/reject order, etc.) are logged to:

- `audit.log` file (simple text log).
- `app_logs` table (viewable in the Admin → Logs tab).

---

### 5. Frontend Walkthrough (Client Side)

Open `http://localhost:3000` – you get a single-page dashboard:

- **Login panel**:
  - Enter credentials (e.g. `admin/admin123`).
  - On success, the top-right pill shows the logged user and role.

- **System Monitoring**:
  - Shows `/api/health` and `/api/metrics` results (users, products, orders count).
  - Auto-refreshes every 15 seconds (simulates simple monitoring dashboard).

- **Inventory (Product catalog + stock)**:
  - All roles can **view** list of products.
  - **Manager/Admin** can click **“+ New Product”**, fill form, and create new products.

- **Requests / Orders**:
  - All authenticated roles can create **requests** for products.
  - `user` sees only their own requests.
  - `manager` / `admin` see all requests, with **Approve / Reject** buttons.
  - Approving a request automatically decreases product stock.

- **Admin Panel** (visible only for `admin`):
  - **Users tab**: list users and create new ones (username/password/role).
  - **Logs tab**: view last 100 application log entries from `app_logs`.

---

### 6. How This Fits Your Final Project Brief

- **Setup server / container base**:
  - Single Node.js service (`src/server.js`) with SQLite DB; easy to put into Docker.
- **Login (IDP) with roles**:
  - Three core roles (`user`, `manager`, `admin`) with clear permissions:
    - View-only vs. approve vs. full admin configuration.
- **Monitoring**:
  - `GET /api/health` and `GET /api/metrics` plus visible monitoring card in the UI.
- **Logs**:
  - `audit.log` + `access.log` files on disk.
  - `app_logs` table for querying logs from the Admin UI.
- **Scenario: client / server**:
  - Client = browser SPA (`public/index.html` + `public/app.js`).
  - Server = Node + Express REST API with session-based authentication and SQLite storage.

You can now extend this (e.g. Dockerfile, reverse proxy config, more reports) to match any extra
requirements from your lecturer, but it is already a complete, working demonstration system.


