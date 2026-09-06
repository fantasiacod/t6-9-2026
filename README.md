# Enterprise Task Management & Technical Support System

A comprehensive enterprise-grade web application for task management, technical support ticketing, employee oversight, and departmental operations.

## 🚀 Features

- **Dashboard** — Interactive analytics with Chart.js (status, priority, timeline, department charts)
- **Task Management** — Full CRUD, status workflow (new → in_progress → completed/suspended/delayed → archived), notes/comments, progress tracking
- **Technical Issues** — Reporting, resolution tracking, priority-based management
- **User Management** — CRUD, suspend/activate, password reset
- **Departments** — CRUD with employee counts
- **Roles & Permissions** — Granular permission matrix (28 permissions, role-based assignment)
- **Reports** — Task, employee, department, delay, and issue reports with CSV export and print
- **Archives** — Automatic archiving of completed tasks (cron-based)
- **Audit Logs** — Complete action trail with IP tracking
- **Notifications** — Real-time notification system with unread counts
- **Dark/Light Mode** — Theme toggle with persistence
- **Responsive Design** — Mobile-first with Bootstrap 5.3
- **Security** — JWT authentication, RBAC, rate limiting, input validation

## 📋 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, JavaScript (Vanilla), Bootstrap 5.3 |
| Charts | Chart.js 4.x |
| Tables | DataTables 1.13.x |
| Alerts | SweetAlert2 |
| Backend | Node.js, Express.js |
| Database | Supabase (PostgreSQL) |
| Auth | JWT (jsonwebtoken) |
| Security | Helmet, CORS, bcryptjs, express-rate-limit |

## 🏗️ Project Structure

```
enterprise-task-system/
├── database/
│   ├── schema.sql              # Base PostgreSQL schema
│   └── permissions_upgrade.sql # Per-user permissions migration (run in Supabase)
├── server/
│   ├── app.js                  # Express entry point
│   ├── config/                 # database.js, jwt.js, email.js
│   ├── middleware/             # auth.js, rbac.js, validate.js, rateLimiter.js, auditLog.js
│   ├── routes/                 # one file per resource
│   ├── services/               # notification, archive, settings, n8n
│   ├── jobs/scheduler.js       # overdue-task scheduler
│   ├── utils/                  # helpers.js, permissions.js
│   ├── scripts/                # operational CLI tools (see below)
│   └── seeders/seed.js         # demo data seeder
├── public/
│   ├── index.html              # Login page
│   ├── css/style.css
│   ├── js/                     # one module per page + api.js, app.js, i18n.js
│   └── pages/                  # the authenticated HTML pages
├── _archive/                   # one-off scripts, NOT deployed (see _archive/README.md)
├── .env.example
├── .gitignore
├── zip.bat                     # packages the project for upload (excludes .env)
├── package.json
└── README.md
```

### Operational scripts

```bash
node server/scripts/check-db.js                        # print app_settings rows
node server/scripts/reset-password.js admin "NewPass1"  # emergency password reset
node server/scripts/add_roles.js                       # add supervisor / it_admin roles
```

> `_archive/` holds one-off build-time scripts that are no longer part of the
> application. It is excluded from git and from `zip.bat`. Safe to delete once
> you are confident you no longer need any of them.


## ⚡ Quick Start

### 1. Prerequisites
- Node.js v18+
- Supabase project (free tier works)

### 2. Setup

```bash
# Clone and enter project
cd enterprise-task-system

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### 3. Configure `.env`

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-secret-key-min-32-chars
```

### 4. Create Database

Run `database/schema.sql` in your Supabase SQL Editor to create all tables, indexes, triggers, and functions.

### 5. Seed Data

```bash
npm run seed
```

### 6. Start Server

```bash
npm run dev
```

Visit `http://localhost:3000`

## 👤 Default Credentials

| Username | Password | Role |
|----------|----------|------|
| admin | Admin@123 | Admin |
| ahmed.manager | Manager@123 | Manager |
| sara.manager | Manager@123 | Manager |
| mohammed.emp | Employee@123 | Employee |
| fatima.emp | Employee@123 | Employee |
| omar.emp | Employee@123 | Employee |
| layla.emp | Employee@123 | Employee |

## 🔐 Role Hierarchy

| Role | Access |
|------|--------|
| **Admin** | Full system access, all CRUD, user management, roles, audit logs |
| **Manager** | Department tasks, employee oversight, reports, issue viewing |
| **Employee** | Own tasks, status changes, issue reporting |

## 🎨 Design System

- **Color Palette**: Green (#1B5E20 → #C8E6C9), Gold (#B8860B → #FFE082), Neutrals
- **Typography**: Inter font family
- **Components**: Cards, badges, buttons, progress bars, timelines
- **Animations**: fadeIn, fadeInUp, slideInRight, pulse
- **Dark Mode**: Full dark theme with smooth transitions
- **Print**: Optimized print styles

## 📄 License

MIT License
