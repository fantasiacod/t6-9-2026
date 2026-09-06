/**
 * Departments Module
 */
const Departments = {
    async init() { await this.loadDepartments();
        document.getElementById('deptForm')?.addEventListener('submit',(e)=>{e.preventDefault();this.handleSubmit();}); },
    async loadDepartments() {
        try { App.showLoading(); const r = await API.get('/departments'); const grid = document.getElementById('departmentsGrid');
            if (!r.data?.length) { grid.innerHTML='<div class="col-12"><div class="empty-state"><i class="fas fa-building"></i><h5>No departments</h5></div></div>'; return; }
            grid.innerHTML = r.data.map(d=>`<div class="col-md-4 animate-fade-up"><div class="dept-card">
                <h5><i class="fas fa-building me-2 text-success"></i>${d.name} ${!d.isActive ? '<span class="badge bg-danger ms-2" style="font-size:0.6em;">معطل</span>' : ''}</h5>
                <p class="text-muted small">${d.description||'No description'}</p>
                <div class="dept-count mt-3"><span class="emp-count">${d.employeeCount}</span><span class="text-muted ms-2">Employees</span></div>
                <div class="mt-3">
                <button class="btn-sm-action primary" onclick="Departments.openAssignModal('${d.id}', '${d.name.replace(/'/g,"\\'")}')" title="Assign Employees"><i class="fas fa-users"></i></button>
                <button class="btn-sm-action edit" onclick="Departments.openEditModal('${d.id}','${d.name.replace(/'/g,"\\'")}','${(d.description||'').replace(/'/g,"\\'")}')" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="btn-sm-action warn" onclick="Departments.toggleStatus('${d.id}', ${d.isActive})" title="Toggle Active Status"><i class="fas ${d.isActive ? 'fa-ban' : 'fa-check'}"></i></button>
                <button class="btn-sm-action delete" onclick="Departments.deleteDepartment('${d.id}')" title="Delete"><i class="fas fa-trash"></i></button></div>
            </div></div>`).join('');
        } catch(e) { App.showError('Failed'); } finally { App.hideLoading(); }
    },
    openCreateModal() { document.getElementById('deptModalTitle').textContent='Add Department'; document.getElementById('deptForm').reset(); document.getElementById('deptId').value=''; new bootstrap.Modal(document.getElementById('deptModal')).show(); },
    openEditModal(id,name,desc) { document.getElementById('deptModalTitle').textContent='Edit Department'; document.getElementById('deptId').value=id; document.getElementById('deptName').value=name; document.getElementById('deptDescription').value=desc; new bootstrap.Modal(document.getElementById('deptModal')).show(); },
    async handleSubmit() {
        const id=document.getElementById('deptId').value; const data={name:document.getElementById('deptName').value,description:document.getElementById('deptDescription').value};
        try { if(id) await API.put('/departments/'+id,data); else await API.post('/departments',data);
            bootstrap.Modal.getInstance(document.getElementById('deptModal'))?.hide(); App.showSuccess(id?'Updated':'Created'); await this.loadDepartments();
        } catch(e) { App.showError(e.message||'Failed'); }
    },
    async deleteDepartment(id) { if(await App.confirmAction('Delete this department?')) { try { await API.delete('/departments/'+id); App.showSuccess('Deleted'); await this.loadDepartments(); } catch(e){App.showError(e.message);} } },
    async toggleStatus(id, currentStatus) {
        const action = currentStatus ? 'تعطيل' : 'تفعيل';
        if(await App.confirmAction(`هل أنت متأكد من ${action} هذا القسم؟`)) {
            try {
                await API.patch('/departments/'+id+'/status', { is_active: !currentStatus });
                App.showSuccess(`تم ${action} القسم بنجاح`);
                await this.loadDepartments();
            } catch(e){
                App.showError(e.message);
            }
        }
    },

    async openAssignModal(deptId, deptName) {
        document.getElementById('assignDeptId').value = deptId;
        document.getElementById('assignModalTitle').textContent = `Assign Employees to ${deptName}`;
        new bootstrap.Modal(document.getElementById('assignModal')).show();
        await this.loadDepartmentUsers(deptId);
    },
    async loadDepartmentUsers(deptId) {
        try {
            App.showLoading();
            const r = await API.get('/users', { limit: 1000 });
            const allUsers = r.data || [];
            
            const currentUsers = allUsers.filter(u => u.departmentId === deptId);
            const otherUsers = allUsers.filter(u => u.departmentId !== deptId);
            
            // Populate Dropdown
            const select = document.getElementById('unassignedUsersSelect');
            select.innerHTML = '<option value="">Select an employee...</option>' + 
                otherUsers.map(u => `<option value="${u.id}">${u.fullName} (${u.employeeId})</option>`).join('');
                
            // Populate Table
            const tbody = document.getElementById('currentEmployeesTableBody');
            tbody.innerHTML = currentUsers.map(u => `
                <tr>
                    <td>${u.fullName}</td>
                    <td>${u.employeeId}</td>
                    <td>${u.jobTitle || 'N/A'}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-danger" onclick="Departments.removeEmployee('${u.id}')"><i class="fas fa-user-minus"></i> Remove</button>
                    </td>
                </tr>
            `).join('') || `<tr><td colspan="4" class="text-center text-muted">No employees in this department.</td></tr>`;
            
        } catch(e) {
            App.showError('Failed to load users');
        } finally {
            App.hideLoading();
        }
    },
    async assignSelectedEmployee() {
        const userId = document.getElementById('unassignedUsersSelect').value;
        const deptId = document.getElementById('assignDeptId').value;
        if (!userId) return App.showError('Please select an employee.');
        
        try {
            App.showLoading();
            await API.patch(`/users/${userId}/department`, { department_id: deptId });
            App.showSuccess('Employee assigned successfully');
            await this.loadDepartmentUsers(deptId);
            this.loadDepartments(); // Update counts
        } catch(e) {
            App.showError(e.message || 'Failed to assign employee');
        } finally {
            App.hideLoading();
        }
    },
    async removeEmployee(userId) {
        if (!await App.confirmAction('Remove this employee from the department?')) return;
        const deptId = document.getElementById('assignDeptId').value;
        
        try {
            App.showLoading();
            await API.patch(`/users/${userId}/department`, { department_id: null });
            App.showSuccess('Employee removed successfully');
            await this.loadDepartmentUsers(deptId);
            this.loadDepartments(); // Update counts
        } catch(e) {
            App.showError(e.message || 'Failed to remove employee');
        } finally {
            App.hideLoading();
        }
    }
};
document.addEventListener('DOMContentLoaded', () => Departments.init());
