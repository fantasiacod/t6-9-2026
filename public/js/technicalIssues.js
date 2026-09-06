/**
 * Technical Issues Module
 */
const TechnicalIssues = {
    table: null,
    async init() {
        this.table = $('#issuesTable').DataTable({responsive:true,order:[[0,'desc']],pageLength:10});
        await this.loadIssues();
        document.getElementById('issueForm')?.addEventListener('submit',(e)=>{e.preventDefault();this.createIssue();});
        document.getElementById('resolveForm')?.addEventListener('submit',(e)=>{e.preventDefault();this.resolveIssue();});
    },
    async loadIssues() {
        try { App.showLoading(); 
            const statusFilter = 'open,in_progress';
            
            const r = await API.get('/technical-issues', { limit: 100, status: statusFilter }); 
            this.table.clear();
            this.issues = r.data || [];
            
            this.issues.forEach(i=>{ 
                let actions = `<button class="btn-sm-action view me-1" onclick="TechnicalIssues.openViewModal('${i.id}')" title="View"><i class="fas fa-eye"></i></button>`;
                
                if (App.isAdmin()) {
                    actions += `<button class="btn-sm-action edit" onclick="TechnicalIssues.openResolveModal('${i.id}')" title="Resolve"><i class="fas fa-wrench"></i></button>`;
                }

                this.table.row.add([i.issueNumber, i.title, i.sender?.full_name||'—', i.department?.name||'—',
                App.priorityBadge(i.priority), App.statusBadge(i.status), App.formatDate(i.createdAt), actions
            ]); }); this.table.draw();
        } catch{} finally { App.hideLoading(); }
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
    },
    openCreateModal() { document.getElementById('issueForm').reset(); new bootstrap.Modal(document.getElementById('issueModal')).show(); },
    async createIssue() {
        const data = {title:document.getElementById('issueTitle').value, description:document.getElementById('issueDescription').value, priority:document.getElementById('issuePriority').value};
        try { await API.post('/technical-issues',data); bootstrap.Modal.getInstance(document.getElementById('issueModal'))?.hide(); App.showSuccess('Issue reported'); await this.loadIssues();
        } catch(e) { App.showError(e.message||'Failed'); }
    },
    openResolveModal(id) { document.getElementById('resolveIssueId').value=id; document.getElementById('resolveForm').reset(); document.getElementById('resolveIssueId').value=id; new bootstrap.Modal(document.getElementById('resolveModal')).show(); },
    async resolveIssue() {
        const id=document.getElementById('resolveIssueId').value;
        const data={status:document.getElementById('resolveStatus').value,resolution_notes:document.getElementById('resolveNotes').value};
        try { await API.patch('/technical-issues/'+id+'/status',data); bootstrap.Modal.getInstance(document.getElementById('resolveModal'))?.hide(); App.showSuccess('Updated'); await this.loadIssues();
        } catch(e) { App.showError(e.message||'Failed'); }
    }
};
document.addEventListener('DOMContentLoaded', () => TechnicalIssues.init());
