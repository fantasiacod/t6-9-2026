/**
 * Global App Module — Loaded on all authenticated pages
 */
const App = {
    init() {
        if (!localStorage.getItem('token')) {
            window.location.href = '/';
            return;
        }
        const user = this.getUser();
        if (!user) {
            window.location.href = '/';
            return;
        }

        // Apply theme
        const theme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        this.updateThemeIcon(theme);

        // Set header user info
        const nameEl = document.getElementById('headerUserName');
        const roleEl = document.getElementById('headerUserRole');
        const avatarEl = document.getElementById('userAvatar');

        if (nameEl) nameEl.textContent = user.fullName || user.username || 'User';
        if (roleEl) {
            const rn = (user.role && user.role.name) ? user.role.name.toLowerCase() : '';
            const roleMap = { admin: 'مدير النظام', manager: 'مدير قسم', employee: 'موظف' };
            roleEl.textContent = roleMap[rn] || (user.role && user.role.name) || 'User';
        }
        if (avatarEl) {
            if (user.avatarUrl) {
                avatarEl.innerHTML = '<img src="' + user.avatarUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
            } else {
                avatarEl.textContent = (user.fullName || user.username || 'U')[0].toUpperCase();
            }
        }

        // Admin-only elements
        const isAdm = this.isAdmin();
        document.querySelectorAll('.admin-only').forEach(function(el) {
            el.style.display = isAdm ? '' : 'none';
        });

        // Manager-only elements (create task btn etc)
        const canCreate = isAdm || App.isManager() || App.hasPermission('create_tasks');
        document.querySelectorAll('.manager-only').forEach(function(el) {
            el.style.display = canCreate ? '' : 'none';
        });

        // Kick the user off a page they no longer have access to
        this.guardCurrentPage();

        // Hide sidebar links based on permissions
        const permissionMap = App.PAGE_PERMISSIONS;

        document.querySelectorAll('.sidebar-nav .nav-link').forEach(function(link) {
            const href = link.getAttribute('href');
            if (href && permissionMap[href]) {
                var reqPerms = Array.isArray(permissionMap[href]) ? permissionMap[href] : [permissionMap[href]];
                var hasAccess = reqPerms.some(function(p) { return App.hasPermission(p); });
                if (!isAdm && !hasAccess) {
                    link.style.display = 'none';
                } else if (!isAdm && hasAccess) {
                    link.style.display = ''; // unhide if it was hidden by admin-only
                }
            }
        });

        // Hide empty nav-sections
        document.querySelectorAll('.sidebar-nav .nav-section').forEach(function(section) {
            var next = section.nextElementSibling;
            var hasVisibleLink = false;
            while (next && !next.classList.contains('nav-section') && !next.classList.contains('nav-divider')) {
                if (next.classList.contains('nav-link') && next.style.display !== 'none') {
                    hasVisibleLink = true;
                    break;
                }
                next = next.nextElementSibling;
            }
            if (!hasVisibleLink) {
                section.style.display = 'none';
            } else {
                section.style.display = ''; // unhide if it has visible links
            }
        });

        // Active sidebar link
        const path = window.location.pathname;
        document.querySelectorAll('.sidebar-nav .nav-link').forEach(function(link) {
            link.classList.remove('active');
            const href = link.getAttribute('href');
            if (href && href !== '#' && href !== '/' && path.startsWith(href)) {
                link.classList.add('active');
            }
        });

        // Event listeners
        const themeBtn = document.getElementById('themeToggle');
        if (themeBtn) themeBtn.addEventListener('click', function() { App.toggleTheme(); });
        const sidebarBtn = document.getElementById('sidebarToggle');
        if (sidebarBtn) sidebarBtn.addEventListener('click', function() { App.toggleSidebar(); });
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', function(e) { e.preventDefault(); App.logout(); });

        // Notification badge
        this.updateNotificationBadge();
        setInterval(function() { App.updateNotificationBadge(); }, 30000);

        // Keep permissions live: poll the server so a change an admin
        // makes is applied to this session within a few seconds.
        setInterval(function() { App._refreshUser(); }, App.PERM_POLL_MS);
        window.addEventListener('focus', function() { App._refreshUser(); });

        // Load sidebar logos
        this.loadSidebarLogos();

        document.body.classList.add('loaded');

        // Refresh user from server (background, non-blocking)
        setTimeout(function() { App._refreshUser(); }, 500);
    },

    // How often the browser re-checks its permissions with the server.
    PERM_POLL_MS: 10000,

    // Single source of truth for which permission each page needs.
    // Used for both hiding sidebar links and blocking direct URL access.
    PAGE_PERMISSIONS: {
        '/tasks': ['view_tasks', 'create_tasks', 'edit_tasks'],
        '/task': ['view_tasks'],
        '/technical-issues': ['view_technical_issues', 'create_technical_issues'],
        '/reports': ['view_reports', 'generate_reports', 'export_reports'],
        '/archives': ['view_archives'],
        '/issues-archives': ['view_archives'],
        '/users': ['view_users', 'create_users', 'edit_users'],
        '/departments': ['view_departments'],
        '/roles': ['view_roles', 'manage_roles', 'manage_permissions'],
        '/audit-logs': ['view_audit_logs'],
        '/settings': ['manage_settings']
    },

    /**
     * Blocks direct URL access to a page the user has no permission for.
     * The API enforces this too — this just avoids showing an empty shell.
     */
    guardCurrentPage: function() {
        if (this.isAdmin()) return true;
        var path = window.location.pathname;
        var key = Object.keys(this.PAGE_PERMISSIONS).find(function(k) {
            return path === k || path.indexOf(k + '/') === 0;
        });
        if (!key) return true;

        var required = this.PAGE_PERMISSIONS[key];
        var allowed = (Array.isArray(required) ? required : [required])
            .some(function(p) { return App.hasPermission(p); });

        if (!allowed) {
            window.location.replace('/access-denied');
            return false;
        }
        return true;
    },

    _refreshUser: function() {
        var token = localStorage.getItem('token');
        if (!token) return;
        fetch('/api/auth/me', {
            headers: { 'Authorization': 'Bearer ' + token }
        })
        .then(function(r) {
            if (r.status === 401 || r.status === 403) {
                // Suspended / deleted / token revoked mid-session
                localStorage.clear();
                window.location.replace('/');
                return null;
            }
            return r.json();
        })
        .then(function(data) {
            if (!data || !data.success || !data.data) return;

            var current = App.getUser() || {};
            var next = data.data;

            // Compare the actual permission LIST, not the version field.
            // A stored session from before this update has no version
            // field, and comparing versions would force a needless reload.
            var oldPerms = (current.permissions || []).slice().sort().join('|');
            var newPerms = (next.permissions || []).slice().sort().join('|');

            localStorage.setItem('user', JSON.stringify(next));

            if (oldPerms !== newPerms) {
                // Permissions really changed while the page was open.
                // Leave the page first if it is no longer allowed,
                // otherwise reload so every control re-evaluates.
                if (App.guardCurrentPage()) window.location.reload();
            }
        })
        .catch(function() { /* silent */ });
    },

    getUser: function() {
        try { return JSON.parse(localStorage.getItem('user')); }
        catch(e) { return null; }
    },
    getUserRole: function() {
        var u = this.getUser();
        return (u && u.role && u.role.name) ? u.role.name.toLowerCase() : 'employee';
    },
    hasPermission: function(perm) {
        var u = this.getUser();
        if (!u) return false;
        var r = u.role && u.role.name ? u.role.name.toLowerCase() : '';
        if (r === 'admin') return true;
        if (u.permissions && u.permissions.indexOf('*') !== -1) return true;
        return u.permissions ? u.permissions.indexOf(perm) !== -1 : false;
    },
    isAdmin:    function() { return this.getUserRole() === 'admin'; },
    isManager:  function() { return this.getUserRole() === 'manager'; },
    isEmployee: function() { return this.getUserRole() === 'employee'; },

    toggleTheme: function() {
        var cur = document.documentElement.getAttribute('data-theme');
        var nxt = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nxt);
        localStorage.setItem('theme', nxt);
        this.updateThemeIcon(nxt);
    },
    updateThemeIcon: function(theme) {
        var btn = document.getElementById('themeToggle');
        if (btn) btn.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    },
    toggleSidebar: function() {
        var sb = document.getElementById('sidebar');
        if (sb) sb.classList.toggle('show');
    },
    showLoading: function() {
        var el = document.getElementById('loadingOverlay');
        if (el) el.classList.add('show');
    },
    hideLoading: function() {
        var el = document.getElementById('loadingOverlay');
        if (el) el.classList.remove('show');
    },

    lastNotifCount: 0,
    updateNotificationBadge: function() {
        var badge = document.getElementById('notifCount');
        if (!badge) return;
        API.get('/notifications/unread-count')
            .then(function(res) {
                if (res && res.success && res.data) {
                    var count = res.data.count || 0;
                    badge.textContent = count > 99 ? '99+' : count;
                    badge.style.display = count > 0 ? 'flex' : 'none';
                }
            })
            .catch(function() { /* silent */ });
    },

    logout: function() {
        Swal.fire({
            title: 'تسجيل الخروج؟',
            text: 'هل أنت متأكد من تسجيل الخروج؟',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'نعم، خروج',
            cancelButtonText: 'إلغاء',
            confirmButtonColor: '#ef4444'
        }).then(function(r) {
            if (r.isConfirmed) {
                API.post('/auth/logout').catch(function() {});
                localStorage.clear();
                window.location.href = '/';
            }
        });
    },

    formatDate: function(d) {
        if (!d) return '—';
        try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
        catch(e) { return d; }
    },
    formatDateTime: function(d) {
        if (!d) return '—';
        try { return new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
        catch(e) { return d; }
    },
    timeAgo: function(d) {
        if (!d) return '—';
        var s = Math.floor((Date.now() - new Date(d)) / 1000);
        if (s < 60) return 'الآن';
        if (s < 3600) return 'منذ ' + Math.floor(s / 60) + ' دقيقة';
        if (s < 86400) return 'منذ ' + Math.floor(s / 3600) + ' ساعة';
        return 'منذ ' + Math.floor(s / 86400) + ' يوم';
    },

    showSuccess: function(msg) {
        Swal.fire({ icon: 'success', title: 'تم بنجاح', text: msg, timer: 2500, showConfirmButton: false });
    },
    showError: function(msg) {
        Swal.fire({ icon: 'error', title: 'خطأ', text: msg, confirmButtonText: 'حسناً' });
    },
    confirmAction: function(msg) {
        return Swal.fire({
            title: 'تأكيد', text: msg, icon: 'warning',
            showCancelButton: true, confirmButtonText: 'نعم',
            cancelButtonText: 'إلغاء', confirmButtonColor: '#ef4444'
        }).then(function(r) { return r.isConfirmed; });
    },

    statusBadge: function(s) {
        if (!s) return '<span class="badge-status badge-unknown">—</span>';
        var map = {
            'new': 'جديد', 'in_progress': 'قيد التنفيذ', 'completed': 'مكتمل',
            'suspended': 'معلق', 'delayed': 'متأخر', 'pending_suspension': 'طلب تعليق',
            'pending_delay': 'طلب تأخير', 'archived': 'مؤرشف', 'open': 'مفتوح',
            'resolved': 'محلول', 'closed': 'مغلق', 'active': 'نشط', 'deleted': 'محذوف'
        };
        var label = map[s] || String(s).replace(/_/g, ' ');
        return '<span class="badge-status badge-' + s + '">' + label + '</span>';
    },
    priorityBadge: function(p) {
        if (!p) return '<span class="badge-priority badge-unknown">—</span>';
        var map = { low: 'منخفض', medium: 'متوسط', high: 'مرتفع', urgent: 'عاجل' };
        return '<span class="badge-priority badge-' + p + '">' + (map[p] || p) + '</span>';
    },
    roleBadge: function(r) {
        if (!r) return '<span class="badge-role badge-employee">موظف</span>';
        var n = r.toLowerCase();
        var map = { admin: 'مدير النظام', manager: 'مدير قسم', employee: 'موظف', it_admin: 'مسؤول تقني', supervisor: 'مشرف' };
        return '<span class="badge-role badge-' + n + '">' + (map[n] || n) + '</span>';
    },
    progressBar: function(val, status) {
        var p = Math.min(100, Math.max(0, Number(val) || 0));
        var cls = 'bg-success';
        if (status === 'delayed') cls = 'bg-danger';
        else if (status === 'suspended') cls = 'bg-secondary';
        else if (p < 100 && p > 0) cls = 'bg-warning';
        else if (p === 0) cls = 'bg-secondary';
        return '<div class="progress" style="height:8px;"><div class="progress-bar ' + cls + '" style="width:' + p + '%"></div></div><small class="text-muted">' + p + '%</small>';
    },

    loadSidebarLogos: function() {
        var area = document.getElementById('sidebarLogoArea');
        if (!area) return;
        API.get('/settings').then(function(r) {
            var s = (r && r.data) ? r.data : {};
            if (s.primary_color) {
                document.documentElement.style.setProperty('--green-500', s.primary_color);
                document.documentElement.style.setProperty('--green-600', s.primary_color);
            }
            if (s.sidebar_color) document.documentElement.style.setProperty('--bg-sidebar', s.sidebar_color);
            if (s.sidebar_text_color) document.documentElement.style.setProperty('--sidebar-text-color', s.sidebar_text_color);
            if (s.text_color) document.documentElement.style.setProperty('--text-primary', s.text_color);
            if (s.font_family) document.documentElement.style.setProperty('--font-primary', '"' + s.font_family + '", -apple-system, sans-serif');

            var logo1 = s.logo1_url, logo2 = s.logo2_url;
            var name1 = s.logo1_name || 'نظام إدارة المهام';
            var name2 = s.logo2_name || '';

            if (!logo1 && !logo2) {
                area.innerHTML = '<div class="sidebar-header"><div class="logo-icon"><i class="fas fa-tasks"></i></div><h4>' + name1 + '</h4><small>نظام إدارة المهام والدعم التقني</small></div>';
                return;
            }

            var logo1Html = logo1 ? '<img src="' + logo1 + '" class="sidebar-logo-img" alt="' + name1 + '">' : '<div class="sidebar-logo-icon"><i class="fas fa-tasks"></i></div>';
            var html = '<div class="sidebar-logos"><div class="sidebar-logo-item">' + logo1Html;
            if (name1) html += '<span class="sidebar-logo-name">' + name1 + '</span>';
            html += '</div>';
            if (logo2 || name2) {
                var logo2Html = logo2 ? '<img src="' + logo2 + '" class="sidebar-logo-img" alt="' + name2 + '">' : '<div class="sidebar-logo-icon"><i class="fas fa-flag"></i></div>';
                html += '<div class="sidebar-logo-divider"></div><div class="sidebar-logo-item">' + logo2Html;
                if (name2) html += '<span class="sidebar-logo-name">' + name2 + '</span>';
                html += '</div>';
            }
            html += '</div>';
            area.innerHTML = html;
        }).catch(function() {
            area.innerHTML = '<div class="sidebar-header"><div class="logo-icon"><i class="fas fa-tasks"></i></div><h4>نظام إدارة المهام</h4></div>';
        });
    }
};

document.addEventListener('DOMContentLoaded', function() { App.init(); });
