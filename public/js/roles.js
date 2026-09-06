/**
 * Roles & Permissions Module — Glowing Toggles UI
 */
const Roles = {
    roles: [], permissions: {},
    async init() {
        await this.loadData();
        document.getElementById('roleForm')?.addEventListener('submit', (e) => { e.preventDefault(); this.createRole(); });
    },
    async loadData() {
        try {
            App.showLoading();
            const [rolesRes, permsRes] = await Promise.all([API.get('/roles'), API.get('/permissions')]);
            this.roles = rolesRes.data || [];
            this.permissions = permsRes.data || {};
            this.render();
        } catch (e) {
            App.showError('فشل تحميل الأدوار والصلاحيات');
        } finally {
            App.hideLoading();
        }
    },
    getCategoryLabel(cat) {
        const labels = {
            tasks: '📋 المهام', users: '👥 المستخدمون', reports: '📊 التقارير',
            technical_issues: '🔧 البلاغات التقنية', departments: '🏢 الأقسام',
            roles: '🛡️ الأدوار والصلاحيات', audit: '📜 سجلات المراقبة',
            notifications: '🔔 الإشعارات', archives: '🗄️ الأرشيف', notes: '📝 الملاحظات'
        };
        return labels[cat] || cat.replace(/_/g, ' ').toUpperCase();
    },
    render() {
        const container = document.getElementById('rolesContainer');
        if (!container) return;
        container.innerHTML = this.roles.map(role => {
            const permIds = role.permissions?.filter(p => p != null).map(p => p.id) || [];
            const isAdmin = role.name === 'admin';
            let permHtml = '';

            Object.entries(this.permissions).forEach(([cat, perms]) => {
                permHtml += `<div class="perm-category">
                    <div class="perm-category-title">${this.getCategoryLabel(cat)}</div>
                    <div class="perm-toggles-grid">`;
                perms.forEach(p => {
                    const isActive = isAdmin || permIds.includes(p.id);
                    const stateClass = isActive ? 'active' : 'inactive';
                    const disabledAttr = isAdmin ? 'disabled' : '';
                    const disabledClass = isAdmin ? 'perm-disabled' : '';
                    permHtml += `
                    <label class="perm-toggle ${stateClass} ${disabledClass}" title="${p.name}">
                        <input type="checkbox" style="display:none"
                            data-role="${role.id}" data-perm="${p.id}"
                            ${isActive ? 'checked' : ''} ${disabledAttr}
                            onchange="Roles.toggleState(this)">
                        <span class="perm-toggle-icon">
                            <i class="fas ${isActive ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                        </span>
                        <span class="perm-toggle-label">${p.description || p.name}</span>
                    </label>`;
                });
                permHtml += `</div></div>`;
            });

            return `<div class="col-12 col-xl-4 col-lg-6 animate-fade-up">
                <div class="role-card data-card">
                    <div class="role-card-header">
                        <div class="role-card-title">
                            ${App.roleBadge(role.name)}
                            <span class="role-name-text">${role.description || role.name}</span>
                        </div>
                        <span class="role-perm-count">
                            <i class="fas fa-key me-1"></i>${isAdmin ? 'كل الصلاحيات' : permIds.length + ' صلاحية'}
                        </span>
                    </div>
                    <div class="role-card-body">${permHtml}</div>
                    <div class="role-card-footer">
                        ${!isAdmin
                            ? `<button type="button" class="btn btn-primary-custom btn-sm w-100" onclick="Roles.savePermissions('${role.id}')">
                                <i class="fas fa-save me-2"></i>حفظ الصلاحيات
                               </button>`
                            : `<div class="text-center text-muted small"><i class="fas fa-crown me-1 text-warning"></i>المدير يملك جميع الصلاحيات تلقائياً</div>`
                        }
                    </div>
                </div>
            </div>`;
        }).join('');
    },
    toggleState(cb) {
        const label = cb.closest('label');
        const icon = label.querySelector('.perm-toggle-icon i');
        if (cb.checked) {
            label.classList.remove('inactive'); label.classList.add('active');
            icon.classList.remove('fa-times-circle'); icon.classList.add('fa-check-circle');
        } else {
            label.classList.remove('active'); label.classList.add('inactive');
            icon.classList.remove('fa-check-circle'); icon.classList.add('fa-times-circle');
        }
    },
    async savePermissions(roleId) {
        const checkboxes = document.querySelectorAll(`input[data-role="${roleId}"]:checked`);
        const permIds = Array.from(checkboxes).map(cb => cb.dataset.perm);
        try {
            App.showLoading();
            await API.post('/roles/' + roleId + '/permissions', { permission_ids: permIds });
            App.showSuccess('تم حفظ الصلاحيات بنجاح');
            await this.loadData();
        } catch (e) {
            App.showError(e.message || 'فشل الحفظ');
        } finally {
            App.hideLoading();
        }
    },
    openCreateModal() {
        document.getElementById('roleForm').reset();
        new bootstrap.Modal(document.getElementById('roleModal')).show();
    },
    async createRole() {
        const name = document.getElementById('roleName').value.trim();
        const description = document.getElementById('roleDesc').value.trim();
        if (!name) return App.showError('اسم الدور مطلوب');
        try {
            App.showLoading();
            await API.post('/roles', { name, description });
            bootstrap.Modal.getInstance(document.getElementById('roleModal'))?.hide();
            App.showSuccess('تم إنشاء الدور بنجاح');
            await this.loadData();
        } catch (e) {
            App.showError(e.message || 'فشل الإنشاء');
        } finally {
            App.hideLoading();
        }
    }
};
document.addEventListener('DOMContentLoaded', () => Roles.init());
