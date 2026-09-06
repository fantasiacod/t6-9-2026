/**
 * Tasks Management Module
 */
const Tasks = {
    table: null,
    usersList: [],

    init: async function() {
        this.table = $('#tasksTable').DataTable({
            responsive: true,
            order: [[0, 'desc']],
            pageLength: 25,
            language: {
                emptyTable: 'لا توجد مهام',
                search: 'بحث:',
                lengthMenu: 'عرض _MENU_ سجل',
                info: 'عرض _START_ إلى _END_ من _TOTAL_ سجل',
                infoEmpty: 'لا توجد بيانات',
                paginate: { previous: 'السابق', next: 'التالي' },
                zeroRecords: 'لا توجد نتائج'
            }
        });

        await this.loadEmployees();
        await this.loadTasks();

        var form = document.getElementById('taskForm');
        if (form) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                Tasks.handleSubmit();
            });
        }

        var deptSel = document.getElementById('taskDepartment');
        if (deptSel) {
            deptSel.addEventListener('change', function() {
                Tasks.renderEmployeeOptions(this.value);
            });
        }
    },

    loadEmployees: async function() {
        try {
            var r = await API.get('/users', { limit: 1000 });
            this.usersList = r.data || [];
            this.renderEmployeeOptions();
            this.renderEmployeeFilter();
        } catch(e) {
            this.usersList = [];
        }
    },

    renderEmployeeFilter: function() {
        var sel = document.getElementById('filterAssignedTo');
        if (!sel) return;
        sel.innerHTML = '<option value="">الجميع</option>';
        this.usersList.forEach(function(u) {
            var name = (u.fullName || u.username || '') + (u.employeeId ? ' (' + u.employeeId + ')' : '');
            sel.innerHTML += '<option value="' + u.id + '">' + name + '</option>';
        });
    },

    renderEmployeeOptions: function(deptId) {
        var sel = document.getElementById('taskAssignTo');
        if (!sel) return;
        sel.innerHTML = '<option value="">— اختر موظف —</option>';

        if (!App.isEmployee()) {
            sel.innerHTML += '<option value="ALL" style="font-weight:bold">📋 الجميع (مهمة جماعية)</option>';
        }

        var list = this.usersList;
        if (deptId) {
            list = list.filter(function(u) { return u.departmentId === deptId; });
        }

        list.forEach(function(u) {
            var name = (u.fullName || u.username || '') + (u.employeeId ? ' (' + u.employeeId + ')' : '');
            sel.innerHTML += '<option value="' + u.id + '">' + name + '</option>';
        });
    },

    loadTasks: async function(filters) {
        try {
            App.showLoading();
            var params = Object.assign({ limit: 200 }, filters || {});
            var r = await API.get('/tasks', params);
            var tasks = r.data || [];

            this.table.clear();

            var user = App.getUser();
            var perms = (user && user.permissions) ? user.permissions : [];
            var isAdm = App.isAdmin();
            var canDelete = isAdm || perms.indexOf('delete_tasks') !== -1;
            var canArchive = isAdm || perms.indexOf('archive_tasks') !== -1;

            tasks.forEach(function(t) {
                var assigneeName = '—';
                if (t.assignedTo) {
                    assigneeName = t.assignedTo.full_name || t.assignedTo.fullName || '—';
                }

                var actions = '<a href="/task/' + t.id + '" class="btn-sm-action view" title="عرض"><i class="fas fa-eye"></i></a>';
                if (canArchive && (t.status === 'completed' || t.status === 'closed')) {
                    actions += ' <button class="btn-sm-action" style="background:var(--warning,#f59e0b);color:white;" onclick="Tasks.archiveTask(\'' + t.id + '\')" title="أرشفة"><i class="fas fa-archive"></i></button>';
                }
                if (canDelete) {
                    actions += ' <button class="btn-sm-action delete" onclick="Tasks.deleteTask(\'' + t.id + '\')" title="حذف"><i class="fas fa-trash"></i></button>';
                }

                var rowNode = Tasks.table.row.add([
                    t.taskNumber || '—',
                    '<a href="/task/' + t.id + '" class="fw-bold">' + (t.title || '—') + '</a>',
                    assigneeName,
                    App.statusBadge(t.status),
                    App.progressBar(t.progress, t.status),
                    App.formatDate(t.startDate),
                    App.formatDate(t.endDate),
                    actions
                ]).node();
                
                // Check if task is overdue (delayed status, or endDate has passed and not completed/suspended)
                var isOverdue = false;
                if (t.status === 'delayed') {
                    isOverdue = true;
                } else if (t.endDate && ['completed', 'closed', 'archived', 'suspended'].indexOf(t.status) === -1) {
                    var todayStr = new Date().toISOString().split('T')[0];
                    if (t.endDate < todayStr) {
                        isOverdue = true;
                    }
                }
                
                if (isOverdue) {
                    rowNode.classList.add('table-danger');
                }
            });

            this.table.draw(false);
        } catch(e) {
            console.error('[Tasks] loadTasks error:', e);
            App.showError(e.message || 'فشل تحميل المهام');
        } finally {
            App.hideLoading();
        }
    },

    openCreateModal: function() {
        document.getElementById('taskModalTitle').textContent = 'إنشاء مهمة جديدة';
        document.getElementById('taskForm').reset();
        document.getElementById('taskId').value = '';
        var emailCb = document.getElementById('sendByEmail');
        var waCb = document.getElementById('sendByWhatsapp');
        if (emailCb) emailCb.checked = false;
        if (waCb) waCb.checked = false;
        this.renderEmployeeOptions();
        new bootstrap.Modal(document.getElementById('taskModal')).show();
    },

    handleSubmit: async function() {
        var id = document.getElementById('taskId').value;
        var assignTo = document.getElementById('taskAssignTo').value;

        if (!assignTo) {
            return App.showError('يجب اختيار الموظف المكلف بالمهمة');
        }

        var titleEl = document.getElementById('taskTitle');
        var title = titleEl ? titleEl.value.trim() : '';
        if (!title) return App.showError('عنوان المهمة مطلوب');

        var data = {
            title: title,
            description: (document.getElementById('taskDescription') || {}).value || '',
            assigned_to: assignTo,
            priority: 'medium',
            work_days: document.getElementById('taskWorkDays').value
        };

        var deptEl = document.getElementById('taskDepartment');
        if (deptEl && deptEl.value) data.department_id = deptEl.value;

        var sendMethod = [];
        var emailCb = document.getElementById('sendByEmail');
        var waCb = document.getElementById('sendByWhatsapp');
        if (emailCb && emailCb.checked) sendMethod.push('email');
        if (waCb && waCb.checked) sendMethod.push('whatsapp');
        if (sendMethod.length > 0) data.send_method = sendMethod;

        try {
            App.showLoading();
            if (id) {
                await API.put('/tasks/' + id, data);
                App.showSuccess('تم تحديث المهمة بنجاح');
            } else {
                await API.post('/tasks', data);
                App.showSuccess('تم إنشاء المهمة بنجاح');
            }
            var modal = bootstrap.Modal.getInstance(document.getElementById('taskModal'));
            if (modal) modal.hide();
            await this.loadTasks();
        } catch(e) {
            App.showError(e.message || 'فشل حفظ المهمة');
        } finally {
            App.hideLoading();
        }
    },

    archiveTask: async function(id) {
        var confirmed = await App.confirmAction('هل تريد نقل هذه المهمة إلى الأرشيف؟');
        if (confirmed) {
            try {
                await API.post('/tasks/' + id + '/archive');
                App.showSuccess('تم الأرشفة بنجاح');
                await Tasks.loadTasks();
            } catch(e) {
                App.showError(e.message || 'فشل الأرشفة');
            }
        }
    },

    deleteTask: async function(id) {
        var confirmed = await App.confirmAction('هل تريد حذف هذه المهمة نهائياً؟');
        if (confirmed) {
            try {
                await API.delete('/tasks/' + id);
                App.showSuccess('تم الحذف بنجاح');
                await Tasks.loadTasks();
            } catch(e) {
                App.showError(e.message || 'فشل الحذف');
            }
        }
    },

    applyFilters: function() {
        var f = {};
        var s = document.getElementById('filterStatus');    if (s && s.value) f.status = s.value;
        var p = document.getElementById('filterPriority');  if (p && p.value) f.priority = p.value;
        var d = document.getElementById('filterDepartment'); if (d && d.value) f.department_id = d.value;
        var a = document.getElementById('filterAssignedTo'); if (a && a.value) f.assigned_to = a.value;
        var df = document.getElementById('filterDateFrom'); if (df && df.value) f.date_from = df.value;
        var dt = document.getElementById('filterDateTo');   if (dt && dt.value) f.date_to = dt.value;
        Tasks.loadTasks(f);
    },

    resetFilters: function() {
        document.querySelectorAll('.filter-bar select, .filter-bar input[type="date"]').forEach(function(e) { e.value = ''; });
        Tasks.loadTasks();
    }
};

document.addEventListener('DOMContentLoaded', function() { Tasks.init(); });
