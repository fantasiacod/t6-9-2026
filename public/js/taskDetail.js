/**
 * Task Detail Module
 */
const TaskDetail = {
    taskId: null, task: null,
    async init() {
        const pathParts = window.location.pathname.split('/');
        this.taskId = pathParts[pathParts.length - 1];
        if (!this.taskId || this.taskId === 'task') { App.showError('No task ID'); return; }
        await this.loadTask();
        document.getElementById('addNoteForm')?.addEventListener('submit', (e) => { e.preventDefault(); this.addNote(); });
    },
    async loadTask() {
        try { App.showLoading();
            const r = await API.get('/tasks/'+this.taskId);
            if (!r.success) { App.showError('Task not found'); return; }
            this.task = r.data; 
            this.renderTaskInfo(this.task); 
            if(this.renderActivityLog) this.renderActivityLog(this.task.activity || []);
            this.renderNotes(this.task.notes||[]); 
            this.renderActions(this.task);
        } catch(e) { App.showError('Failed to load task'); } finally { App.hideLoading(); }
    },
    renderActivityLog(activity) {
        const el = document.getElementById('activityTimeline');
        if (!el) return;
        if (!activity || !activity.length) {
            el.innerHTML = '<div class="empty-state"><i class="fas fa-history text-muted fs-4"></i><p class="mt-2 mb-0 small">لا توجد حركة مسجلة لهذه المهمة</p></div>';
            return;
        }

        const STATUS_AR = {
            new: 'جديدة', in_progress: 'جاري التنفيذ', completed: 'مكتملة',
            delayed: 'متأخرة', suspended: 'معلقة', archived: 'مؤرشفة',
            pending_delay: 'بانتظار الموافقة على التأخير',
            pending_suspension: 'بانتظار الموافقة على التعليق'
        };
        const statusName = s => STATUS_AR[s] || s || '—';
        const escapeHtml = s => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        let html = '';
        activity.forEach(a => {
            let icon = 'fa-info-circle';
            let color = 'text-primary';
            let text = a.action;
            let detailHtml = '';
            
            if (a.action === 'CREATE_TASK') { icon='fa-plus-circle'; color='text-success'; text='تم إنشاء المهمة'; }
            else if (a.action === 'CREATE_TASK_BULK') { icon='fa-plus-circle'; color='text-success'; text='تم إنشاء المهمة (توزيع جماعي)'; }
            else if (a.action === 'UPDATE_TASK_STATUS') {
                icon='fa-exchange-alt'; color='text-info';
                const s = a.details?.new_status || '';
                const sName = statusName(s);
                text = `تحديث حالة المهمة إلى: <span class="fw-bold">${sName}</span>`;

                if (s === 'completed') {
                    icon='fa-flag-checkered'; color='text-success';
                    text = 'تم إغلاق المهمة';
                    const closed = a.details?.close_date ? App.formatDateTime(a.details.close_date) : App.formatDateTime(a.created_at);
                    detailHtml += `<div class="mt-1 small"><i class="fas fa-clock me-1 text-muted"></i>تاريخ الإغلاق: <span class="fw-bold">${closed}</span></div>`;
                    if (a.details?.end_date) {
                        detailHtml += `<div class="mt-1 small text-muted">الموعد المحدد كان: ${App.formatDate(a.details.end_date)}</div>`;
                    }
                    detailHtml += a.details?.closed_late
                        ? `<div class="mt-1 small fw-bold text-danger"><i class="fas fa-triangle-exclamation me-1"></i>أُغلقت بعد الموعد المحدد</div>`
                        : `<div class="mt-1 small fw-bold text-success"><i class="fas fa-check me-1"></i>أُغلقت في الوقت المحدد</div>`;
                }
                if (a.details?.delay_reason) {
                    detailHtml += `<div class="mt-1 small"><i class="fas fa-comment-dots me-1 text-muted"></i>السبب: <span class="fw-bold">${escapeHtml(a.details.delay_reason)}</span></div>`;
                }
                if (a.details?.suspend_reason) {
                    detailHtml += `<div class="mt-1 small"><i class="fas fa-comment-dots me-1 text-muted"></i>سبب التعليق: <span class="fw-bold">${escapeHtml(a.details.suspend_reason)}</span></div>`;
                }
            }
            else if (a.action === 'SUBMIT_JUSTIFICATION') {
                icon='fa-file-alt'; color='text-warning'; text='تم رفع تبرير التأخير';
                detailHtml += `<div class="mt-1 small"><i class="fas fa-clock me-1 text-muted"></i>وقت الرفع: <span class="fw-bold">${App.formatDateTime(a.created_at)}</span></div>`;
                if (a.details?.delay_reason) {
                    detailHtml += `<div class="mt-1 small"><i class="fas fa-quote-right me-1 text-muted"></i>نص التبرير: <span class="fw-bold">${escapeHtml(a.details.delay_reason)}</span></div>`;
                }
                if (a.details?.end_date) {
                    detailHtml += `<div class="mt-1 small text-muted">الموعد المحدد كان: ${App.formatDate(a.details.end_date)}</div>`;
                }
                if (a.details?.days_late > 0) {
                    detailHtml += `<div class="mt-1 small fw-bold text-danger"><i class="fas fa-hourglass-half me-1"></i>المهمة متأخرة بـ ${a.details.days_late} يوم وقت رفع التبرير</div>`;
                }
            }
            else if (a.action === 'APPROVE_STATUS') {
                icon='fa-check-circle'; color='text-success'; text='تمت الموافقة على الطلب من قبل المدير';
                if (a.details?.delay_reason) {
                    detailHtml += `<div class="mt-1 small"><i class="fas fa-quote-right me-1 text-muted"></i>التبرير المعتمد: <span class="fw-bold">${escapeHtml(a.details.delay_reason)}</span></div>`;
                }
                if (a.details?.extra_days > 0) {
                    detailHtml += `<div class="mt-1 small fw-bold text-success"><i class="fas fa-calendar-plus me-1"></i>تمت إضافة ${a.details.extra_days} يوم كفترة إضافية</div>`;
                }
                if (a.details?.old_end_date && a.details?.new_end_date && a.details.old_end_date !== a.details.new_end_date) {
                    detailHtml += `<div class="mt-1 small"><i class="fas fa-calendar-day me-1 text-muted"></i>الموعد: <span class="text-decoration-line-through text-muted">${App.formatDate(a.details.old_end_date)}</span> ← <span class="fw-bold text-success">${App.formatDate(a.details.new_end_date)}</span></div>`;
                }
                if (a.details?.new_status) {
                    detailHtml += `<div class="mt-1 small text-muted">الحالة بعد الموافقة: ${statusName(a.details.new_status)}</div>`;
                }
            }
            else if (a.action === 'REJECT_STATUS') {
                icon='fa-times-circle'; color='text-danger'; text='تم رفض الطلب من قبل المدير';
                if (a.details?.delay_reason) {
                    detailHtml += `<div class="mt-1 small"><i class="fas fa-quote-right me-1 text-muted"></i>التبرير المرفوض: <span class="fw-bold">${escapeHtml(a.details.delay_reason)}</span></div>`;
                }
            }
            else if (a.action === 'ARCHIVE_TASK') { icon='fa-archive'; color='text-secondary'; text='تمت أرشفة المهمة'; }
            
            html += `<div class="timeline-item">
                <div class="timeline-meta">
                    <strong class="${color}"><i class="fas ${icon} me-1"></i>${text}</strong>
                    <span class="ms-2 text-muted small">${App.formatDateTime(a.created_at)}</span>
                </div>
                <div class="timeline-content small text-muted">بواسطة: ${a.username || 'النظام'}</div>
                ${detailHtml}
            </div>`;
        });
        el.innerHTML = html;
    },
    renderTaskInfo(t) {
        document.getElementById('taskDetailTitle').textContent = `Task #${t.taskNumber}`;
        document.getElementById('detailTaskNumber').textContent = '#'+t.taskNumber;
        document.getElementById('detailTitle').textContent = t.title;
        document.getElementById('detailDescription').textContent = t.description||'No description';
        document.getElementById('taskStatusBadge').innerHTML = App.statusBadge(t.status);
        document.getElementById('detailAssignedTo').textContent = t.assignedTo?.full_name||'—';
        document.getElementById('detailCreatedBy').textContent = t.createdBy?.full_name||'—';
        document.getElementById('detailStartDate').textContent = App.formatDate(t.startDate);
        document.getElementById('detailEndDate').textContent = App.formatDate(t.endDate);
        document.getElementById('detailCloseDate').textContent = App.formatDate(t.closeDate);
        document.getElementById('detailDepartment').textContent = t.department?.name||'—';
        document.getElementById('detailWorkDays').textContent = t.workDays + ' days';
        const pBar = document.getElementById('detailProgressBar');
        const p = Number(t.progress);
        
        pBar.style.width = p + '%';
        
        if (t.status === 'delayed') pBar.className = 'progress-bar bg-danger';
        else if (t.status === 'suspended') pBar.className = 'progress-bar bg-secondary';
        else if (p === 0) pBar.className = 'progress-bar bg-light border-end';
        else if (p < 100) pBar.className = 'progress-bar bg-warning';
        else pBar.className = 'progress-bar bg-success';
        
        document.getElementById('detailProgressText').textContent = p+'%';
        if (t.suspendReason) { document.getElementById('suspendReasonSection').style.display='block'; document.getElementById('detailSuspendReason').textContent=t.suspendReason; }
        if (t.delayReason) { document.getElementById('delayReasonSection').style.display='block'; document.getElementById('detailDelayReason').textContent=t.delayReason; }
    },
    renderNotes(notes) {
        const el = document.getElementById('notesTimeline');
        if (!notes.length) {
            el.innerHTML = '<div class="empty-state"><i class="fas fa-comment-slash"></i><h5>لا توجد ملاحظات بعد</h5><p>أضف أول ملاحظة أدناه</p></div>';
            return;
        }
        el.innerHTML = notes.map(n => `<div class="timeline-item">
            <div class="timeline-meta">
                <strong>${n.user?.fullName || 'غير معروف'}</strong> ${App.roleBadge(n.user?.role || 'employee')}
                <span>${App.formatDateTime(n.createdAt)}</span>
            </div>
            <div class="timeline-content">${n.content}</div>
            ${n.imageUrl ? `<div class="mt-2">
                <img src="${n.imageUrl}" class="note-image-preview" alt="صورة الملاحظة"
                    onclick="TaskDetail.openImageModal('${n.imageUrl}')"
                    style="max-height:180px;border-radius:8px;cursor:zoom-in;border:1px solid var(--border-color)">
            </div>` : ''}
        </div>`).join('');
    },
    renderActions(t) {
        const el = document.getElementById('taskActions'); let html = '';
        const role = App.getUserRole(); 
        const isAssigned = t.assignedTo?.id === App.getUser()?.id;
        const isAdmin = role === 'admin';
        
        // Allow assigned user OR Admin to update the task status
        if (isAssigned || isAdmin) {
            var isOverdue = false;
            if (t.status === 'delayed') isOverdue = true;
            else if (t.endDate && t.status === 'in_progress') {
                const todayStr = new Date().toISOString().split('T')[0];
                if (t.endDate < todayStr) isOverdue = true;
            }

            if (t.status==='new') html += `<button class="btn btn-primary-custom w-100 mb-2" onclick="TaskDetail.changeStatus('in_progress')"><i class="fas fa-play me-1"></i>بدء المهمة</button>`;
            
            if (t.status==='in_progress' || t.status==='delayed' || t.status==='pending_delay') {
                const needsManagerApproval = (t.status === 'pending_delay' || (t.status === 'delayed' && t.delayReason));
                
                if (isOverdue || needsManagerApproval) {
                    if (!isAdmin) {
                        html += `<div class="alert alert-danger py-2 small text-center"><i class="fas fa-exclamation-triangle"></i> المهمة متأخرة! لا يمكن الإغلاق حتى تمديد الوقت من قبل الإدارة.</div>`;
                        if (!needsManagerApproval) {
                            html += `<button class="btn btn-danger w-100 mb-2" onclick="TaskDetail.submitDelayJustification()"><i class="fas fa-exclamation-triangle me-1"></i>تقديم تبرير للتأخير</button>`;
                        }
                    } else {
                        // Admin can close or do whatever
                        html += `<button class="btn btn-success w-100 mb-2" onclick="TaskDetail.changeStatus('completed')"><i class="fas fa-check me-1"></i>إغلاق المهمة (صلاحية مدير)</button>`;
                        if (!needsManagerApproval) {
                            html += `<button class="btn btn-outline-danger w-100 mb-2" onclick="TaskDetail.submitDelayJustification()"><i class="fas fa-exclamation-triangle me-1"></i>رفع تبرير نيابة عن الموظف</button>`;
                        }
                    }
                } else {
                    html += `<button class="btn btn-success w-100 mb-2" onclick="TaskDetail.changeStatus('completed')"><i class="fas fa-check me-1"></i>إغلاق المهمة</button>`;
                    html += `<button class="btn btn-warning w-100 mb-2" onclick="TaskDetail.changeStatus('pending_suspension')"><i class="fas fa-pause me-1"></i>تعليق (طلب)</button>`;
                    html += `<button class="btn btn-danger w-100 mb-2" onclick="TaskDetail.changeStatus('pending_delay')"><i class="fas fa-exclamation me-1"></i>تأخير (طلب)</button>`;
                }
            }
            if (t.status==='suspended') html += `<button class="btn btn-primary-custom w-100 mb-2" onclick="TaskDetail.changeStatus('in_progress')"><i class="fas fa-play me-1"></i>استئناف المهمة</button>`;
            
            if (isAdmin && (t.status === 'completed' || t.status === 'closed' || t.status === 'archived')) {
                html += `<button class="btn btn-primary-custom w-100 mb-2" onclick="TaskDetail.changeStatus('in_progress')"><i class="fas fa-undo me-1"></i>إعادة فتح المهمة</button>`;
            }
            if (isAdmin) {
                html += `<button class="btn btn-danger w-100 mb-2" onclick="TaskDetail.deleteTask()"><i class="fas fa-trash me-1"></i>حذف المهمة</button>`;
            }
        }

        // Manager Approval Buttons for Pending Requests or Justified Delayed Tasks
        const needsManagerApproval = t.status === 'pending_suspension' || t.status === 'pending_delay' || (t.status === 'delayed' && t.delayReason);
        if ((role === 'manager' || role === 'admin') && needsManagerApproval) {
            html += `<hr class="my-2">`;
            html += `<p class="small text-muted mb-2 text-center fw-bold">بانتظار موافقة المدير</p>`;
            html += `<button class="btn btn-success w-100 mb-2" onclick="TaskDetail.approveStatus('approve')"><i class="fas fa-check-circle me-1"></i>موافقة على الطلب</button>`;
            html += `<button class="btn btn-danger w-100 mb-2" onclick="TaskDetail.approveStatus('reject')"><i class="fas fa-times-circle me-1"></i>رفض الطلب</button>`;
        } else if (needsManagerApproval) {
            // Show employee that it's waiting for approval
            html += `<hr class="my-2">`;
            html += `<div class="alert alert-info py-2 small text-center"><i class="fas fa-hourglass-half me-1"></i> بانتظار موافقة المدير على التبرير/الطلب</div>`;
        }

        if (role==='manager'||role==='admin') { html += `<button class="btn btn-gold w-100 mb-2" onclick="window.location.href='/tasks'"><i class="fas fa-arrow-left me-1"></i>العودة للمهام</button>`; }
        if (!html) html = '<p class="text-muted small">لا توجد إجراءات متاحة لهذه الحالة.</p>';
        el.innerHTML = html;
    },
    async changeStatus(status) {
        let reason = null;
        if (status === 'pending_suspension') {
            const {value} = await Swal.fire({title:'سبب التعليق', text:'سيتم إرسال هذا الطلب للمدير للموافقة.', input:'textarea',inputPlaceholder:'لماذا تريد تعليق هذه المهمة؟',showCancelButton:true,inputValidator:v=>{if(!v)return 'يرجى كتابة التبرير أولاً'}});
            if (!value) return; reason = value;
        }
        if (status === 'pending_delay') {
            const {value} = await Swal.fire({title:'سبب التأخير', text:'سيتم إرسال هذا الطلب للمدير للموافقة.', input:'textarea',inputPlaceholder:'لماذا تريد تأخير هذه المهمة؟',showCancelButton:true,inputValidator:v=>{if(!v)return 'يرجى كتابة التبرير أولاً'}});
            if (!value) return; reason = value;
        }
        try { App.showLoading();
            const data = { status }; if (reason && status==='pending_suspension') data.suspend_reason=reason; if (reason && status==='pending_delay') data.delay_reason=reason;
            await API.patch('/tasks/'+this.taskId+'/status', data);
            App.showSuccess('تم تحديث حالة المهمة بنجاح'); await this.loadTask();
        } catch(e) { App.showError(e.message||'حدث خطأ غير متوقع'); } finally { App.hideLoading(); }
    },
    async deleteTask() {
        const confirmed = await App.confirmAction('هل تريد حذف هذه المهمة نهائياً؟');
        if (confirmed) {
            try {
                App.showLoading();
                await API.delete('/tasks/' + this.taskId);
                App.showSuccess('تم الحذف بنجاح');
                window.location.href = '/tasks';
            } catch(e) {
                App.showError(e.message || 'فشل الحذف');
            } finally { App.hideLoading(); }
        }
    },
    async submitDelayJustification() {
        const {value} = await Swal.fire({
            title: 'تبرير التأخير', 
            text: 'المهمة متأخرة عن موعدها. يرجى تقديم مبرر واضح لسبب التأخير ليطلع عليه المدير.', 
            input: 'textarea',
            inputPlaceholder: 'السبب الحقيقي وراء تأخر إنجاز المهمة...',
            showCancelButton: true,
            inputValidator: v => { if(!v) return 'يرجى كتابة التبرير أولاً' }
        });
        if (!value) return;
        
        try { 
            App.showLoading();
            await API.post('/tasks/'+this.taskId+'/justification', { delay_reason: value });
            App.showSuccess('تم إرسال التبرير بنجاح'); 
            await this.loadTask();
        } catch(e) { 
            App.showError(e.message || 'حدث خطأ أثناء الإرسال'); 
        } finally { 
            App.hideLoading(); 
        }
    },
    async approveStatus(action) {
        let extraDays = 0;
        if (action === 'approve' && (this.task.status === 'pending_delay' || this.task.status === 'delayed')) {
            const {value} = await Swal.fire({
                title: 'تأكيد الموافقة',
                text: 'كم يوماً ترغب في إضافته لإنجاز المهمة؟ (إن لم تضف شيئاً سيُمدَّد الموعد يوماً واحداً على الأقل حتى لا تعود متأخرة فوراً)',
                input: 'select',
                inputOptions: {
                    '0': 'بدون إضافة (يوم واحد كحد أدنى)',
                    '1': 'يوم',
                    '2': 'يومين',
                    '3': 'ثلاثة أيام',
                    '4': 'أربعة أيام',
                    '5': 'خمسة أيام',
                    '6': 'ستة أيام',
                    '7': 'أسبوع',
                    '14': 'أسبوعين',
                    '21': 'ثلاثة أسابيع',
                    '30': 'شهر'
                },
                inputValue: '0',
                showCancelButton: true,
                confirmButtonText: 'موافق',
                cancelButtonText: 'إلغاء'
            });
            if (value === undefined) return; // cancelled
            extraDays = parseInt(value) || 0;
        } else if (action === 'approve' && this.task.status === 'pending_suspension') {
            const confirmed = await App.confirmAction('هل أنت متأكد من الموافقة على تعليق المهمة؟');
            if (!confirmed) return;
        } else if (action === 'reject') {
            const confirmed = await App.confirmAction('هل أنت متأكد من رفض هذا الطلب؟');
            if (!confirmed) return;
        }

        try {
            App.showLoading();
            await API.patch('/tasks/'+this.taskId+'/approve-status', { action, extraDays });
            App.showSuccess(action === 'approve' ? 'تمت الموافقة على الطلب بنجاح' : 'تم رفض الطلب بنجاح');
            await this.loadTask();
        } catch(e) { App.showError(e.message||'حدث خطأ غير متوقع'); } finally { App.hideLoading(); }
    },
    async addNote() {
        const content = document.getElementById('noteContent').value.trim();
        if (!content) { App.showError('يرجى كتابة ملاحظة أولاً'); return; }
        
        // Get image if attached
        const imgEl = document.getElementById('noteImagePreview');
        const imageUrl = (imgEl && imgEl.src && imgEl.src !== window.location.href) ? imgEl.src : null;
        
        try {
            await API.post('/task-notes/task/' + this.taskId, { content, image_url: imageUrl });
            // Reset form
            document.getElementById('noteContent').value = '';
            this.clearNoteImage();
            await this.loadTask();
            App.showSuccess('تمت إضافة الملاحظة بنجاح');
        } catch (e) {
            App.showError(e.message || 'حدث خطأ غير متوقع');
        }
    },
    previewNoteImage(input) {
        const file = input.files[0];
        if (!file) return;
        // Validate size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            App.showError('حجم الصورة يجب أن يكون أقل من 5 ميجابايت');
            input.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('noteImagePreview');
            const wrap = document.getElementById('noteImagePreviewWrap');
            preview.src = e.target.result;
            wrap.style.display = 'inline-block';
        };
        reader.readAsDataURL(file);
    },
    clearNoteImage() {
        const preview = document.getElementById('noteImagePreview');
        const wrap = document.getElementById('noteImagePreviewWrap');
        const input = document.getElementById('noteImageInput');
        if (preview) preview.src = '';
        if (wrap) wrap.style.display = 'none';
        if (input) input.value = '';
    },
    openImageModal(src) {
        Swal.fire({
            imageUrl: src,
            imageAlt: 'صورة الملاحظة',
            showConfirmButton: false,
            showCloseButton: true,
            width: 'auto',
            padding: '8px'
        });
    }
};
document.addEventListener('DOMContentLoaded', () => TaskDetail.init());
