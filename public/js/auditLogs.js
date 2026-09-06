/**
 * Audit Logs Module
 */
const AuditLogs = {
    table: null,
    async init() {
        this.table = $('#auditTable').DataTable({responsive:true,order:[[0,'desc']],pageLength:15});
        await this.loadLogs();
    },
    async loadLogs(filters={}) {
        try { App.showLoading(); const r = await API.get('/audit-logs', {...filters,limit:200}); this.table.clear();
            (r.data||[]).forEach(a => { this.table.row.add([
                App.formatDateTime(a.created_at), a.username||'—', `<span class="badge bg-secondary">${a.action}</span>`,
                a.entity_type||'—', a.ip_address||'—',
                `<small class="text-muted">${a.details?JSON.stringify(a.details).slice(0,80):'—'}</small>`
            ]); }); this.table.draw();
        } catch{} finally { App.hideLoading(); }
    },
    applyFilters() { const f={};
        const a=document.getElementById('auditFilterAction')?.value; if(a)f.action=a;
        const e=document.getElementById('auditFilterEntity')?.value; if(e)f.entity_type=e;
        const df=document.getElementById('auditFilterFrom')?.value; if(df)f.date_from=df;
        const dt=document.getElementById('auditFilterTo')?.value; if(dt)f.date_to=dt;
        this.loadLogs(f);
    },
    resetFilters() { document.querySelectorAll('.filter-bar input, .filter-bar select').forEach(e=>e.value=''); this.loadLogs(); }
};
document.addEventListener('DOMContentLoaded', () => AuditLogs.init());
