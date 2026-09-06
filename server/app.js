/**
 * Enterprise Task Management & Technical Support System
 * Main Application Entry Point
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { apiLimiter } = require('./middleware/rateLimiter');
const { startArchiveCron } = require('./services/archiveService');

const app = express();

// ─── Security Middleware ────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());

// ─── Body Parsers ───────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Static Files ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── API Rate Limiting ──────────────────────────────────────
app.use('/api', apiLimiter);

// ─── API Routes ─────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/permissions', require('./routes/permissions'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/task-notes', require('./routes/taskNotes'));
app.use('/api/technical-issues', require('./routes/technicalIssues'));
app.use('/api/archives', require('./routes/archives'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/audit-logs', require('./routes/auditLogs'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/settings', require('./routes/settings'));

// ─── Page Routes (Serve HTML) ───────────────────────────────
const servePage = (page) => (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pages', `${page}.html`));
};

app.get('/dashboard', servePage('dashboard'));
app.get('/users', servePage('users'));
app.get('/departments', servePage('departments'));
app.get('/tasks', servePage('tasks'));
app.get('/task/:id', servePage('task-detail'));
app.get('/technical-issues', servePage('technical-issues'));
app.get('/issues-archives', servePage('issues-archives'));
app.get('/reports', servePage('reports'));
app.get('/archives', servePage('archives'));
app.get('/roles', servePage('roles'));
app.get('/audit-logs', servePage('audit-logs'));
app.get('/notifications', servePage('notifications'));
app.get('/profile', servePage('profile'));
app.get('/settings', servePage('settings'));
app.get('/access-denied', servePage('access-denied'));

// ─── Root → Login ───────────────────────────────────────────
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Global Error Handler ───────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[Server Error]', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error.',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ─── 404 Handler ────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found.' });
});

// ─── Start Server ───────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Enterprise Task Management System`);
    console.log(`   Server running on http://localhost:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);

    // Start auto-archive cron job
    startArchiveCron();
    
    // Start auto-overdue scheduler
    const { startScheduler } = require('./jobs/scheduler');
    startScheduler();
    
    // Load email settings from database
    const { loadEmailSettingsFromDB } = require('./config/email');
    loadEmailSettingsFromDB();
});

module.exports = app;
