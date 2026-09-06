/**
 * Users Management Module
 * Fixed: Users disappearing after password reset
 */
const Users = {
    table: null,
    departments: [],
    roles: [],
    allUsers: [], // Keep a local cache of users to avoid disappearing

    async init() {
        await Promise.all([this.loadDepartments(), this.loadRoles()]);

        // Initialize DataTable
        this.table = $('#usersTable').DataTable({
            responsive: true,
            order: [[0, 'desc']],
            pageLength: 25,
            language: {
                emptyTable: 'لا يوجد مستخدمون',
                search: 'بحث:',
                lengthMenu: 'عرض _MENU_ سجل',
                info: 'عرض _START_ إلى _END_ من _TOTAL_ سجل',
                paginate: { previous: 'السابق', next: 'التالي' }
            }
        });

        await this.loadUsers();

        document.getElementById('userForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });
    },

    async loadDepartments() {
        try {
            const r = await API.get('/departments');
            this.departments = r.data || [];
            const sel = document.getElementById('departmentSelect');
            if (sel) {
                sel.innerHTML = '<option value="">اختر القسم</option>';
                this.departments.forEach(d => sel.innerHTML += `<option value="${d.id}">${d.name}</option>`);
            }
        } catch (e) {
            console.warn('[Users] Failed to load departments', e);
        }
    },

    async loadRoles() {
        try {
            const r = await API.get('/roles');
            this.roles = r.data || [];
            const sel = document.getElementById('roleSelect');
            if (sel) {
                sel.innerHTML = '<option value="">اختر الدور</option>';
                this.roles.forEach(ro => sel.innerHTML += `<option value="${ro.id}">${ro.description || ro.name}</option>`);
            }
        } catch (e) {
            console.warn('[Users] Failed to load roles', e);
        }
    },

    async loadUsers() {
        try {
            App.showLoading();
            const r = await API.get('/users', { limit: 5000 });
            this.allUsers = r.data || [];
            this._renderTable(this.allUsers);
        } catch(e) {
            App.showError('فشل تحميل بيانات المستخدمين');
            console.error('[Users] Load error:', e);
        } finally {
            App.hideLoading();
        }
    },

    _renderTable(users) {
        if (!this.table) return;
        this.table.clear();
        users.forEach((u, i) => {
            this.table.row.add([
                i + 1,
                u.employeeId || '—',
                u.fullName || '—',
                u.username || '—',
                u.email || '—',
                u.phone || '—',
                u.department?.name || '—',
                App.roleBadge(u.role?.name),
                App.statusBadge(u.status),
                `<button type="button" class="btn-sm-action edit" onclick="Users.openEditModal('${u.id}')" title="تعديل"><i class="fas fa-edit"></i></button>
                 <button type="button" class="btn-sm-action view" onclick="Users.openPermissionsModal('${u.id}')" title="صلاحيات المستخدم"><i class="fas fa-user-shield"></i></button>
                 <button type="button" class="btn-sm-action warn" onclick="Users.suspendUser('${u.id}','${u.status}')" title="${u.status === 'active' ? 'تعليق' : 'تفعيل'}"><i class="fas fa-ban"></i></button>
                 <button type="button" class="btn-sm-action view" onclick="Users.resetPassword('${u.id}')" title="تغيير كلمة المرور"><i class="fas fa-key"></i></button>
                 <button type="button" class="btn-sm-action delete" onclick="Users.deleteUser('${u.id}')" title="حذف"><i class="fas fa-trash"></i></button>`
            ]);
        });
        this.table.draw(false);
    },

    openCreateModal() {
        document.getElementById('userModalTitle').textContent = 'إضافة مستخدم';
        document.getElementById('userForm').reset();
        document.getElementById('userId').value = '';
        const prefix = document.getElementById('usernamePrefix');
        if (prefix) prefix.value = '';
        const pwdGroup = document.getElementById('passwordGroup');
        if (pwdGroup) pwdGroup.style.display = 'block';
        const pwdField = document.getElementById('passwordField');
        if (pwdField) pwdField.required = true;
        new bootstrap.Modal(document.getElementById('userModal')).show();
    },

    async openEditModal(id) {
        try {
            const r = await API.get('/users/' + id);
            const u = r.data;
            document.getElementById('userModalTitle').textContent = 'تعديل المستخدم';
            document.getElementById('userId').value = u.id;
            document.getElementById('fullName').value = u.fullName || '';
            document.getElementById('email').value = u.email || '';
            document.getElementById('phone').value = u.phone || '';
            document.getElementById('jobTitle').value = u.jobTitle || '';
            document.getElementById('employeeId').value = u.employeeId || '';
            const prefix = document.getElementById('usernamePrefix');
            if (prefix) prefix.value = '';
            document.getElementById('usernameField').value = u.username || '';
            document.getElementById('departmentSelect').value = u.departmentId || '';
            document.getElementById('roleSelect').value = u.role?.id || '';
            const pwdGroup = document.getElementById('passwordGroup');
            if (pwdGroup) pwdGroup.style.display = 'none';
            const pwdField = document.getElementById('passwordField');
            if (pwdField) pwdField.required = false;
            new bootstrap.Modal(document.getElementById('userModal')).show();
        } catch (e) {
            App.showError('فشل تحميل بيانات المستخدم');
        }
    },

    async handleFormSubmit() {
        const id = document.getElementById('userId').value;
        const prefix = document.getElementById('usernamePrefix')?.value.trim() || '';
        const baseUsername = document.getElementById('usernameField').value.trim();
        const fullUsername = (prefix + baseUsername).replace(/\s/g, '').toLowerCase();

        const data = {
            full_name: document.getElementById('fullName').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            job_title: document.getElementById('jobTitle').value,
            employee_id: document.getElementById('employeeId').value,
            username: fullUsername,
            department_id: document.getElementById('departmentSelect').value,
            role_id: document.getElementById('roleSelect').value
        };
        if (!id) data.password = document.getElementById('passwordField').value;

        try {
            App.showLoading();
            if (id) await API.put('/users/' + id, data);
            else await API.post('/users', data);
            bootstrap.Modal.getInstance(document.getElementById('userModal'))?.hide();
            App.showSuccess(id ? 'تم تحديث المستخدم' : 'تم إنشاء المستخدم');
            await this.loadUsers(); // Reload full list
        } catch(e) {
            App.showError(e.message || 'فشل حفظ بيانات المستخدم');
        } finally {
            App.hideLoading();
        }
    },

    async deleteUser(id) {
        if (await App.confirmAction('هل تريد حذف هذا المستخدم نهائياً؟')) {
            try {
                await API.delete('/users/' + id);
                App.showSuccess('تم حذف المستخدم');
                await this.loadUsers();
            } catch(e) {
                App.showError(e.message || 'فشل الحذف');
            }
        }
    },

    async suspendUser(id, status) {
        const action = status === 'active' ? 'تعليق' : 'تفعيل';
        if (await App.confirmAction(`هل تريد ${action} هذا المستخدم؟`)) {
            try {
                await API.patch('/users/' + id + '/suspend');
                App.showSuccess(`تم ${action} المستخدم بنجاح`);
                await this.loadUsers(); // Reload list fully - no partial update
            } catch(e) {
                App.showError(e.message || 'فشل تحديث حالة المستخدم');
            }
        }
    },

    async resetPassword(id) {
        const { value: pwd } = await Swal.fire({
            title: 'تغيير كلمة المرور',
            input: 'password',
            inputLabel: 'كلمة المرور الجديدة',
            inputPlaceholder: 'أدخل كلمة مرور جديدة (8 أحرف على الأقل)',
            showCancelButton: true,
            confirmButtonText: 'تغيير',
            cancelButtonText: 'إلغاء',
            inputValidator: v => {
                if (!v || v.length < 8) return 'يجب أن تكون كلمة المرور 8 أحرف على الأقل';
            }
        });
        if (pwd) {
            try {
                await API.patch('/users/' + id + '/reset-password', { new_password: pwd });
                App.showSuccess('تم تغيير كلمة المرور بنجاح');
                // DO NOT call loadUsers() here - just update the specific row
                // This prevents the table from re-rendering and "disappearing" effect
            } catch(e) {
                App.showError(e.message || 'فشل تغيير كلمة المرور');
            }
        }
    },

    // ─────────────────────────────────────────────────────────
    // Per-user permissions
    // Three states per permission:
    //   • من الدور   — inherited, no override stored
    //   • مسموح إضافي — 'allow' override
    //   • ممنوع       — 'deny' override (wins over the role)
    // ─────────────────────────────────────────────────────────
    _permUserId: null,
    _permMatrix: [],

    CATEGORY_LABELS: {
        users: 'المستخدمون', tasks: 'المهام', reports: 'التقارير',
        technical_issues: 'المشاكل التقنية', departments: 'الأقسام',
        roles: 'الأدوار والصلاحيات', archives: 'الأرشيف', audit: 'سجل التدقيق',
        settings: 'الإعدادات', notifications: 'الإشعارات', scope: 'نطاق البيانات'
    },

    async openPermissionsModal(userId) {
        try {
            App.showLoading();
            const r = await API.get('/users/' + userId + '/permissions');
            this._permUserId = userId;
            this._permMatrix = r.data.permissions || [];
            this._renderPermissionsModal(r.data);
        } catch (e) {
            App.showError(e.message || 'فشل تحميل صلاحيات المستخدم');
        } finally {
            App.hideLoading();
        }
    },

    _renderPermissionsModal(payload) {
        const grouped = payload.grouped || {};
        const u = payload.user || {};
        const roleNames = (u.roles || []).map(r => r.name).join('، ') || 'بدون دور';

        let body = '<p class="text-muted mb-3" style="font-size:.9rem">' +
            'الدور: <strong>' + roleNames + '</strong>. ' +
            'الصلاحيات الموروثة من الدور مؤشَّرة تلقائياً. أي تعديل هنا يخص هذا المستخدم وحده و<strong>يُطبَّق فوراً</strong>.' +
            '</p>';

        Object.keys(grouped).forEach(cat => {
            body += '<div class="mb-3"><h6 class="fw-bold">' + (this.CATEGORY_LABELS[cat] || cat) + '</h6>';
            grouped[cat].forEach(p => {
                const state = p.override || (p.fromRole ? 'role' : 'none');
                body +=
                    '<div class="d-flex justify-content-between align-items-center py-1 border-bottom">' +
                      '<div><div>' + (p.description || p.name) + '</div>' +
                        '<small class="text-muted">' + p.name + (p.fromRole ? ' • من الدور' : '') + '</small></div>' +
                      '<select class="form-select form-select-sm perm-select" style="width:auto" data-perm-id="' + p.id + '">' +
                        '<option value="none"' + (state === 'none' ? ' selected' : '') + '>' + (p.fromRole ? 'إزالة الإضافة' : 'غير مسموح') + '</option>' +
                        '<option value="role"' + (state === 'role' ? ' selected' : '') + '>حسب الدور' + (p.fromRole ? ' (مسموح)' : ' (غير مسموح)') + '</option>' +
                        '<option value="allow"' + (state === 'allow' ? ' selected' : '') + '>مسموح لهذا المستخدم</option>' +
                        '<option value="deny"' + (state === 'deny' ? ' selected' : '') + '>ممنوع لهذا المستخدم</option>' +
                      '</select>' +
                    '</div>';
            });
            body += '</div>';
        });

        Swal.fire({
            title: 'صلاحيات: ' + (u.fullName || u.username || ''),
            html: '<div style="max-height:60vh;overflow:auto;text-align:right">' + body + '</div>',
            width: '52rem',
            showCancelButton: true,
            confirmButtonText: 'حفظ الصلاحيات',
            cancelButtonText: 'إلغاء',
            preConfirm: () => {
                const allow = [], deny = [];
                document.querySelectorAll('.perm-select').forEach(sel => {
                    const id = sel.getAttribute('data-perm-id');
                    if (sel.value === 'allow') allow.push(id);
                    else if (sel.value === 'deny') deny.push(id);
                    else if (sel.value === 'none') {
                        // Explicitly not allowed: deny only if the role grants it
                        const p = Users._permMatrix.find(x => x.id === id);
                        if (p && p.fromRole) deny.push(id);
                    }
                });
                return { allow, deny };
            }
        }).then(async res => {
            if (!res.isConfirmed) return;
            try {
                App.showLoading();
                await API.put('/users/' + Users._permUserId + '/permissions', res.value);
                App.showSuccess('تم حفظ الصلاحيات. ستُطبَّق على المستخدم فوراً.');
            } catch (e) {
                App.showError(e.message || 'فشل حفظ الصلاحيات');
            } finally {
                App.hideLoading();
            }
        });
    },

    async standardizeUsernames() {
        const { value: prefix } = await Swal.fire({
            title: 'توحيد أسماء المستخدمين',
            text: 'أدخل الاسم الثابت الذي تريده (مثلاً: emp). سيتم تطبيق هذا المقطع الثابت متبوعاً بأرقام تسلسلية على جميع المستخدمين ما عدا مدير النظام.',
            input: 'text',
            inputPlaceholder: 'مثال: emp',
            showCancelButton: true,
            confirmButtonText: 'توحيد الآن',
            cancelButtonText: 'إلغاء',
            inputValidator: (v) => {
                if (!v) return 'يجب إدخال اسم ثابت.';
            }
        });

        if (prefix) {
            try {
                App.showLoading();
                const r = await API.patch('/users/standardize-usernames', { prefix: prefix.trim() });
                App.showSuccess(`تم تحديث أسماء الدخول لـ ${r.data?.updatedCount || 0} موظفاً بنجاح.`);
                await this.loadUsers();
            } catch (e) {
                App.showError(e.message || 'فشل التوحيد');
            } finally {
                App.hideLoading();
            }
        }
    }
};

document.addEventListener('DOMContentLoaded', () => Users.init());
