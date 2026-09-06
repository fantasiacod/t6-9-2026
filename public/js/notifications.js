/**
 * Notifications Module
 */
const Notifications = {
    async init() { await this.loadNotifications(); },
    async loadNotifications() {
        try {
            App.showLoading();
            const r = await API.get('/notifications', { limit: 100 });
            const el = document.getElementById('notificationsList');
            if (!r.data?.length) {
                el.innerHTML = `<div class="empty-state py-5 text-center">
                    <i class="fas fa-bell-slash fa-3x mb-3" style="color:var(--text-muted)"></i>
                    <h5>لا توجد إشعارات</h5><p class="text-muted">أنت في حالة تحديث كامل!</p>
                </div>`;
                return;
            }
            el.innerHTML = r.data.map(n => {
                const icon = this.getIcon(n.type);
                return `<div class="notification-item ${n.is_read ? '' : 'unread'}" onclick="Notifications.toggleDetails('${n.id}', '${n.reference_type}', '${n.reference_id}')">
                    <div class="notification-icon" style="background:${icon.bg}"><i class="${icon.cls}" style="color:${icon.color}"></i></div>
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between align-items-start">
                            <strong class="small">${n.title}</strong>
                            <small class="text-muted ms-2 flex-shrink-0">${App.timeAgo(n.created_at)}</small>
                        </div>
                        <p class="mb-0 small text-muted">${n.message}</p>
                        <div id="notif-desc-${n.id}" class="mt-2 p-2 rounded" style="display:none;font-size:0.85rem;border-left:3px solid ${icon.color};background:var(--bg-secondary)"></div>
                    </div>
                </div>`;
            }).join('');
        } catch (e) {
            console.error(e);
        } finally {
            App.hideLoading();
        }
    },
    async markAsRead(id) {
        try { await API.patch('/notifications/' + id + '/read'); App.updateNotificationBadge(); } catch {}
    },
    async toggleDetails(id, refType, refId) {
        this.markAsRead(id);
        const item = document.querySelector(`[onclick*="'${id}'"]`);
        if (item) item.classList.remove('unread');

        const descEl = document.getElementById('notif-desc-' + id);
        if (!descEl) return;

        if (descEl.style.display === 'block') { descEl.style.display = 'none'; return; }
        if (descEl.innerHTML !== '') { descEl.style.display = 'block'; return; }

        try {
            descEl.innerHTML = '<span class="text-muted"><i class="fas fa-spinner fa-spin me-1"></i>جاري التحميل...</span>';
            descEl.style.display = 'block';
            let description = 'لا توجد تفاصيل إضافية.';
            if (refType === 'technical_issue' && refId && refId !== 'null') {
                const r = await API.get('/technical-issues/' + refId);
                if (r.data) description = r.data.description;
            } else if (refType === 'task' && refId && refId !== 'null') {
                const r = await API.get('/tasks/' + refId);
                if (r.data) description = r.data.description;
            } else { descEl.style.display = 'none'; return; }
            descEl.innerHTML = `<strong>التفاصيل:</strong><br><span style="white-space:pre-wrap">${description}</span>`;
        } catch {
            descEl.innerHTML = '<span class="text-danger">فشل تحميل التفاصيل</span>';
        }
    },
    // "تحديد كل كمقروء" = حذف جميع الإشعارات
    async deleteAll() {
        const result = await Swal.fire({
            title: 'حذف جميع الإشعارات',
            text: 'هل تريد حذف جميع الإشعارات نهائياً؟',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'نعم، احذف الكل',
            cancelButtonText: 'إلغاء',
            confirmButtonColor: '#E53935'
        });
        if (!result.isConfirmed) return;
        try {
            await API.delete('/notifications/all');
            App.showSuccess('تم حذف جميع الإشعارات');
            await this.loadNotifications();
            App.updateNotificationBadge();
        } catch (e) {
            App.showError(e.message || 'فشل الحذف');
        }
    },
    getIcon(type) {
        const map = {
            task: { cls: 'fas fa-tasks', color: '#4CAF50', bg: '#E8F5E9' },
            success: { cls: 'fas fa-check-circle', color: '#43A047', bg: '#E8F5E9' },
            warning: { cls: 'fas fa-exclamation-triangle', color: '#FF9800', bg: '#FFF3E0' },
            danger: { cls: 'fas fa-times-circle', color: '#E53935', bg: '#FFEBEE' },
            info: { cls: 'fas fa-info-circle', color: '#1E88E5', bg: '#E3F2FD' }
        };
        return map[type] || map.info;
    }
};
document.addEventListener('DOMContentLoaded', () => Notifications.init());
