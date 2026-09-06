/**
 * Issue Archives Module
 */
const IssuesArchives = {
    table: null,
    async init() {
        this.table = $('#issuesTable').DataTable({responsive:true,order:[[0,'desc']],pageLength:10});
        await this.loadIssues();
    },
    async loadIssues() {
        try { App.showLoading(); 
            const r = await API.get('/technical-issues', { limit: 100, status: 'resolved,closed' }); 
            this.table.clear();
            this.issues = r.data || [];
            
            const user = App.getUser();
            const canDelete = App.isAdmin() || (user && user.permissions && user.permissions.includes('delete_tasks'));
            
            this.issues.forEach(i=>{ 
                let actions = `<button class="btn-sm-action view me-1" onclick="IssuesArchives.openViewModal('${i.id}')" title="View"><i class="fas fa-eye"></i></button>`;
                
                if (canDelete) {
                    actions += `<button class="btn-sm-action delete ms-1" onclick="IssuesArchives.deleteIssue('${i.id}')" title="Delete from Archive"><i class="fas fa-trash"></i></button>`;
                }

                this.table.row.add([i.issueNumber, i.title, i.sender?.full_name||'—', i.department?.name||'—',
                App.priorityBadge(i.priority), App.statusBadge(i.status), App.formatDate(i.createdAt), actions
            ]); }); this.table.draw();
        } catch{} finally { App.hideLoading(); }
    },
    async deleteIssue(id) {
        if(await App.confirmAction('هل أنت متأكد من حذف هذا البلاغ نهائياً من الأرشيف؟')) {
            try {
                await API.delete('/technical-issues/'+id);
                App.showSuccess('تم حذف البلاغ بنجاح');
                await this.loadIssues();
            } catch(e) {
                App.showError(e.message || 'فشل في عملية الحذف');
            }
        }
    },
    openViewModal(id) {
        const issue = this.issues.find(x => x.id === id);
        if (!issue) return;
        document.getElementById('viewIssueTitle').innerText = `${issue.issueNumber} - ${issue.title}`;
        document.getElementById('viewIssueDescription').innerText = issue.description;
        document.getElementById('viewIssueReporter').innerText = issue.sender?.full_name || '—';
        document.getElementById('viewIssueDepartment').innerText = issue.department?.name || '—';
        document.getElementById('viewIssuePriority').innerHTML = App.priorityBadge(issue.priority);
        document.getElementById('viewIssueStatus').innerHTML = App.statusBadge(issue.status);
        
        if (issue.status === 'resolved' || issue.status === 'closed') {
            document.getElementById('resolutionBlock').style.display = 'block';
            document.getElementById('viewIssueResolution').innerText = issue.resolutionNotes || '—';
        } else {
            document.getElementById('resolutionBlock').style.display = 'none';
        }
        new bootstrap.Modal(document.getElementById('viewIssueModal')).show();
    }
};
document.addEventListener('DOMContentLoaded', () => IssuesArchives.init());
