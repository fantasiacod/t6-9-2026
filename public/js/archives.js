/**
 * Archives Module
 */
const Archives = {
    table: null,
    async init() {
        this.table = $('#archivesTable').DataTable({responsive:true,order:[[5,'desc']],pageLength:10});
        await Promise.all([this.loadEmployees(), this.loadDepartments()]);
        await this.loadArchives();
    },
    async loadDepartments() {
        try {
            const r = await API.get('/departments',{limit:100});
            const sel = document.getElementById('aFilterDept');
            if(sel) {
                (r.data||[]).forEach(d => sel.insertAdjacentHTML('beforeend', `<option value="${d.id}">${d.name}</option>`));
            }
        } catch{}
    },
    async loadEmployees() {
        try {
            const r = await API.get('/users',{limit:100});
            const sel = document.getElementById('aFilterEmployee');
            if(sel) {
                (r.data||[]).forEach(u => sel.insertAdjacentHTML('beforeend', `<option value="${u.id}">${u.fullName} (${u.employeeId})</option>`));
            }
        } catch{}
    },
    applyFilters() {
        this.loadArchives();
    },
    async loadArchives() {
        try { 
            App.showLoading(); 
            const filters = { limit:100 };
            const empId = document.getElementById('aFilterEmployee')?.value;
            const deptId = document.getElementById('aFilterDept')?.value;
            const fromDate = document.getElementById('aFilterDateFrom')?.value;
            const toDate = document.getElementById('aFilterDateTo')?.value;
            if (empId) filters.assigned_to = empId;
            if (deptId) filters.department_id = deptId;
            if (fromDate) filters.from_date = fromDate;
            if (toDate) filters.to_date = toDate;

            const r = await API.get('/archives', filters); 
            this.table.clear();
            const user = App.getUser();
            const canDelete = App.isAdmin() || (user && user.permissions && user.permissions.includes('delete_tasks'));
            (r.data||[]).forEach(a=>{ const t=a.task;
                const titleHtml = `<a href="/task/${t.id}" class="fw-bold">${t.title}</a>`;

                const actions = `<a href="/task/${t.id}" class="btn-sm-action view" title="عرض التفاصيل"><i class="fas fa-eye"></i></a>` + (canDelete ? ` <button class="btn-sm-action delete" onclick="Archives.deleteTask('${t.id}')" title="Delete from Archive"><i class="fas fa-trash"></i></button>` : '');
                const rowNode = this.table.row.add([t.taskNumber, titleHtml, t.assignedTo?.full_name||'—', t.department?.name||'—',
                    App.formatDate(t.closeDate), App.formatDate(a.archivedAt), actions ]).node();
            }); this.table.draw();
            this.currentData = r.data || [];
        } catch{} finally { App.hideLoading(); }
    },
    async deleteTask(id) {
        if(await App.confirmAction('هل أنت متأكد من حذف هذه المهمة نهائياً من الأرشيف؟')) {
            try {
                await API.delete('/tasks/'+id);
                App.showSuccess('تم حذف المهمة من الأرشيف بنجاح.');
                await this.loadArchives();
            } catch(e) {
                App.showError(e.message || 'فشل في عملية الحذف');
            }
        }
    },
    getSignatureData() {
        const gmTitle = document.getElementById('gmTitleInput')?.value.trim();
        const gmName = document.getElementById('gmNameInput')?.value.trim();
        const user = App.getUser();
        const issuerTitle = (user && user.jobTitle) ? user.jobTitle : (Lang.current === 'ar' ? 'مُصدر التقرير' : 'Report Issued By');
        const issuerName = user ? (user.fullName || user.username) : '_______________________';
        return { gmTitle, gmName, issuerTitle, issuerName };
    },
    printArchives() {
        if (!this.currentData || this.currentData.length === 0) {
            App.showError(Lang.current === 'ar' ? 'لا توجد بيانات لطباعتها' : 'No data to print');
            return;
        }

        const area = document.getElementById('printArea');
        const sig = this.getSignatureData();
        const reportTitle = Lang.current === 'ar' ? 'تقرير الأرشيف' : 'Archives Report';
        const dateStr = App.formatDateTime(new Date());

        let html = `
            <div class="print-header" style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2c3e50; padding-bottom: 20px;">
                <h1 style="color: #2c3e50; margin: 0 0 10px 0; font-size: 24px;">${Lang.current === 'ar' ? 'نظام إدارة المهام المؤسسي' : 'Enterprise Task Management System'}</h1>
                <h2 style="color: #7f8c8d; margin: 0 0 15px 0; font-size: 18px;">${reportTitle}</h2>
                <div style="display: flex; justify-content: space-between; font-size: 14px; color: #555;">
                    <div><strong>${Lang.current === 'ar' ? 'تاريخ التقرير:' : 'Date:'}</strong> ${dateStr}</div>
                </div>
            </div>
            <table class="table table-bordered print-table" style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <thead>
                    <tr style="background-color: #f8f9fa;">
                        <th style="padding: 10px; border: 1px solid #dee2e6;">${Lang.t('lbl_task_hash')}</th>
                        <th style="padding: 10px; border: 1px solid #dee2e6;">${Lang.t('lbl_title')}</th>
                        <th style="padding: 10px; border: 1px solid #dee2e6;">${Lang.t('lbl_assigned_to')}</th>
                        <th style="padding: 10px; border: 1px solid #dee2e6;">${Lang.t('lbl_department')}</th>
                        <th style="padding: 10px; border: 1px solid #dee2e6;">${Lang.t('txt_auto_28')}</th>
                    </tr>
                </thead>
                <tbody>
        `;

        this.currentData.forEach(a => {
            const t = a.task;
            let isDelayed = false;
            if (t.endDate) {
                const end = new Date(t.endDate);
                const closeOrArchive = t.closeDate ? new Date(t.closeDate) : new Date(a.archivedAt);
                end.setHours(0,0,0,0);
                closeOrArchive.setHours(0,0,0,0);
                if (closeOrArchive > end) {
                    isDelayed = true;
                }
            }
            const titleStr = isDelayed ? `${t.title} (متأخرة)` : t.title;
            const bg = isDelayed ? 'background-color: #f8d7da;' : '';

            html += `
                <tr style="${bg}">
                    <td style="padding: 8px; border: 1px solid #dee2e6;">${t.taskNumber}</td>
                    <td style="padding: 8px; border: 1px solid #dee2e6; color: ${isDelayed ? '#dc3545' : 'inherit'}; font-weight: ${isDelayed ? 'bold' : 'normal'}">${titleStr}</td>
                    <td style="padding: 8px; border: 1px solid #dee2e6;">${t.assignedTo?.full_name||'—'}</td>
                    <td style="padding: 8px; border: 1px solid #dee2e6;">${t.department?.name||'—'}</td>
                    <td style="padding: 8px; border: 1px solid #dee2e6;">${App.formatDate(t.closeDate)}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
            
            <div class="print-signatures" style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 60px;">
                ${sig.gmName ? `
                <div class="print-sign-box" style="text-align: center; min-width: 250px;">
                    <h3 style="margin: 0 0 5px 0; font-size: 1.5rem; font-weight: bold;">${sig.gmTitle}</h3>
                    <span class="line" style="border-top: 1px solid #000; width: 200px; margin: 40px auto 0 auto; display: block;"></span>
                    <div style="margin-top: 10px; font-weight: bold; font-size: 1.1rem;">${sig.gmName}</div>
                </div>
                ` : '<div></div>'}
                
                <div class="print-sign-box" style="text-align: center; min-width: 250px;">
                    <h3 style="margin: 0 0 5px 0; font-size: 1.3rem; font-weight: bold;">${sig.issuerTitle}</h3>
                    <span class="line" style="border-top: 1px solid #000; width: 200px; margin: 40px auto 0 auto; display: block;"></span>
                    <div style="margin-top: 10px; font-weight: bold; font-size: 1.1rem;">${sig.issuerName}</div>
                </div>
            </div>
        `;

        area.innerHTML = html;
        setTimeout(() => { 
            window.print(); 
            setTimeout(() => { area.innerHTML = ''; }, 1000);
        }, 200);
    }
};
document.addEventListener('DOMContentLoaded', () => Archives.init());
