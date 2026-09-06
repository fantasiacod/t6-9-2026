/**
 * Reports Module
 */
const Reports = {
    currentType: 'tasks', currentData: [],
    async init() {
        document.querySelectorAll('#reportTabs .nav-link').forEach(tab => {
            tab.addEventListener('click', (e) => { 
                e.preventDefault();
                document.querySelectorAll('#reportTabs .nav-link').forEach(t=>t.classList.remove('active'));
                tab.classList.add('active'); 
                this.currentType = tab.dataset.type; 
            });
        });
        
        if(App.isAdmin()) { 
            try { 
                const r = await API.get('/departments'); 
                (r.data||[]).forEach(d => document.getElementById('rFilterDept')?.insertAdjacentHTML('beforeend',`<option value="${d.id}">${d.name}</option>`)); 
            } catch{} 
        }

        try {
            const r = await API.get('/users', { limit: 100 });
            (r.data||[]).forEach(u => document.getElementById('rFilterEmployee')?.insertAdjacentHTML('beforeend', `<option value="${u.id}">${u.fullName} (${u.employeeId})</option>`));
        } catch{}
    },
    async generateReport() {
        const filters = {};
        const df=document.getElementById('rFilterDateFrom')?.value; if(df)filters.date_from=df;
        const dt=document.getElementById('rFilterDateTo')?.value; if(dt)filters.date_to=dt;
        const dept=document.getElementById('rFilterDept')?.value; if(dept)filters.department_id=dept;
        const emp=document.getElementById('rFilterEmployee')?.value; if(emp)filters.assigned_to=emp;
        const st=document.getElementById('rFilterStatus')?.value; if(st)filters.status=st;
        const pr=document.getElementById('rFilterPriority')?.value; if(pr)filters.priority=pr;
        try { 
            App.showLoading(); 
            const r = await API.get('/reports/'+this.currentType, filters);
            this.currentData = r.data||[];
            if (r.summary) this.renderSummary(r.summary);
            this.renderTable(this.currentData);
            document.getElementById('exportButtons').style.setProperty('display','flex','important');
            document.getElementById('reportCard').style.display='block';
        } catch(e) { 
            App.showError(Lang.t('Failed to generate report') || 'Failed to generate report'); 
        } finally { 
            App.hideLoading(); 
        }
    },
    renderSummary(s) {
        const el=document.getElementById('reportSummary'); if(!el||!s) return; el.style.display='grid';
        el.innerHTML = `<div class="stat-card"><div class="stat-icon green"><i class="fas fa-list"></i></div><div class="stat-info"><h3>${s.total||0}</h3><p data-i18n="txt_auto_47">Total</p></div></div>
            <div class="stat-card"><div class="stat-icon gold"><i class="fas fa-check"></i></div><div class="stat-info"><h3>${s.completed||0}</h3><p data-i18n="txt_auto_28">Completed</p></div></div>
            <div class="stat-card"><div class="stat-icon red"><i class="fas fa-clock"></i></div><div class="stat-info"><h3>${s.delayed||0}</h3><p data-i18n="txt_auto_49">Delayed</p></div></div>
            <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-percentage"></i></div><div class="stat-info"><h3>${s.completionRate||0}%</h3><p data-i18n="txt_auto_107">Completion</p></div></div>`;
        Lang.updatePage();
    },
    selectedColumns: [],
    _lastType: null,
    renderTable(data) {
        if(!data.length) { document.getElementById('reportBody').innerHTML=`<tr><td colspan="10" class="text-center" data-i18n="lbl_no_data">No data</td></tr>`; return; }
        
        let allCols = Object.keys(data[0]).filter(c => c !== 'id');
        
        // Initialize checkboxes if first render for this data
        if (!this.selectedColumns || this.selectedColumns.length === 0 || this._lastType !== this.currentType) {
            this.selectedColumns = [...allCols];
            this._lastType = this.currentType;
            
            // Build Checkboxes UI
            const container = document.getElementById('columnCheckboxes');
            if (container) {
                container.innerHTML = allCols.map(c => `
                    <div class="form-check form-check-inline">
                        <input class="form-check-input col-toggle-chk" type="checkbox" id="chk_col_${c}" value="${c}" checked onchange="Reports.toggleColumn('${c}')">
                        <label class="form-check-label" for="chk_col_${c}">${Lang.t(c)||c.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}</label>
                    </div>
                `).join('');
                document.getElementById('columnSelectorContainer').style.setProperty('display','block','important');
            }
        }
        
        // Filter cols based on selected
        const cols = allCols.filter(c => this.selectedColumns.includes(c));

        document.getElementById('reportHead').innerHTML='<tr>'+cols.map(c=>`<th>${Lang.t(c)||c.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}</th>`).join('')+'</tr>';
        document.getElementById('reportBody').innerHTML=data.map(row=>'<tr>'+cols.map(c=> {
            let val = row[c] || '—';
            // Translate status and priority if exists
            if (c === 'status' || c === 'priority') {
                const key = Lang.t(val);
                val = key !== val ? key : val;
            }
            if (c === 'title' && row.id) {
                val = `<a href="/task/${row.id}" class="fw-bold">${val}</a>`;
            }
            return `<td>${val}</td>`;
        }).join('')+'</tr>').join('');
        Lang.updatePage();
    },
    toggleColumn(col) {
        const chk = document.getElementById('chk_col_' + col);
        if (chk.checked) {
            if (!this.selectedColumns.includes(col)) this.selectedColumns.push(col);
        } else {
            this.selectedColumns = this.selectedColumns.filter(c => c !== col);
        }
        // Preserve order
        const allCols = Object.keys(this.currentData[0]).filter(c => c !== 'id');
        this.selectedColumns.sort((a, b) => allCols.indexOf(a) - allCols.indexOf(b));
        this.renderTable(this.currentData);
    },
    
    // Check if report should be grouped by department
    shouldGroup() {
        const deptFilter = document.getElementById('rFilterDept')?.value;
        return !deptFilter && this.currentData.length > 0 && this.currentData[0].hasOwnProperty('department');
    },

    getGroupedData() {
        const groups = {};
        this.currentData.forEach(row => {
            const dept = row.department || 'General';
            if (!groups[dept]) groups[dept] = [];
            groups[dept].push(row);
        });
        return groups;
    },

    getSignatureData() {
        // GM Signature (Optional)
        const gmTitle = document.getElementById('gmTitleInput')?.value.trim();
        const gmName = document.getElementById('gmNameInput')?.value.trim();

        // Issuer Signature (Opposite Side)
        const user = App.getUser();
        const issuerTitle = (user && user.jobTitle) ? user.jobTitle : (Lang.current === 'ar' ? 'مُصدر التقرير' : 'Report Issued By');
        const issuerName = user ? (user.fullName || user.username) : '_______________________';

        return { gmTitle, gmName, issuerTitle, issuerName };
    },

    async exportExcel() {
        if(!this.currentData.length) return;
        try {
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Enterprise TMS';
            workbook.created = new Date();
            
            const sheet = workbook.addWorksheet(this.currentType.toUpperCase(), {
                views: [{ rightToLeft: Lang.current === 'ar' }]
            });

            // 1. Report Header
            sheet.mergeCells('A1:G2');
            const titleCell = sheet.getCell('A1');
            titleCell.value = (Lang.current === 'ar' ? 'نظام إدارة المهام - تقرير ' : 'Enterprise TMS - Report ') + this.currentType.toUpperCase();
            titleCell.font = { name: 'Arial', family: 4, size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
            titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
            titleCell.fill = { type: 'pattern', pattern:'solid', fgColor:{ argb:'FF1A2035' } };

            sheet.addRow([]); // empty row

            const isGrouped = this.shouldGroup();
            let baseCols = this.selectedColumns.filter(c => c !== 'department' && c !== 'id');
            
            // Define columns
            const excelCols = baseCols.map(c => ({
                header: Lang.t(c) || c.replace(/([A-Z])/g,' $1').toUpperCase(),
                key: c,
                width: 20
            }));

            if (!isGrouped && this.selectedColumns.includes('department')) {
                excelCols.unshift({ header: Lang.current === 'ar' ? 'القسم' : 'Department', key: 'department', width: 20 });
            }

            sheet.columns = excelCols;

            // Style headers
            sheet.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            sheet.getRow(4).fill = { type: 'pattern', pattern:'solid', fgColor:{ argb:'FFD4AF37' } };
            sheet.getRow(4).alignment = { horizontal: 'center' };

            if (isGrouped) {
                const groups = this.getGroupedData();
                for (const [dept, rows] of Object.entries(groups)) {
                    const row = sheet.addRow([Lang.current === 'ar' ? `القسم: ${dept}` : `Department: ${dept}`]);
                    row.font = { bold: true, size: 12 };
                    row.fill = { type: 'pattern', pattern:'solid', fgColor:{ argb:'FFF0F2F5' } };
                    sheet.mergeCells(`A${row.number}:G${row.number}`);
                    
                    rows.forEach(r => sheet.addRow(r));
                    sheet.addRow([]);
                }
            } else {
                this.currentData.forEach(r => sheet.addRow(r));
            }

            // Style all data rows
            sheet.eachRow((row, rowNumber) => {
                if (rowNumber > 4) {
                    row.eachCell((cell) => {
                        cell.border = {
                            top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'}
                        };
                        cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    });
                }
            });

            // Add Signatures at the end
            sheet.addRow([]);
            sheet.addRow([]);
            const sig = this.getSignatureData();
            
            // Excel Signature Layout
            let titles = [];
            let names = [];
            
            if (sig.gmName) {
                titles = [sig.gmTitle, '', '', '', '', sig.issuerTitle];
                names = [sig.gmName, '', '', '', '', sig.issuerName];
            } else {
                titles = ['', '', '', '', '', sig.issuerTitle];
                names = ['', '', '', '', '', sig.issuerName];
            }

            const sigTitleRow = sheet.addRow(titles);
            sigTitleRow.font = { bold: true, size: 14 };
            const sigNameRow = sheet.addRow(names);
            sigNameRow.font = { italic: true, size: 12 };
            
            // Generate buffer and save
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, `Report_${this.currentType}_${new Date().toISOString().slice(0,10)}.xlsx`);

        } catch (e) {
            console.error(e);
            App.showError('Failed to generate Excel file');
        }
    },
    
    printReport() { 
        if(!this.currentData.length) return;
        const printArea = document.getElementById('printArea');
        const isGrouped = this.shouldGroup();
        const sig = this.getSignatureData();
        const title = Lang.current === 'ar' ? 'تقرير النظام' : 'System Report';
        const date = new Date().toLocaleDateString(Lang.current === 'ar' ? 'ar-SA' : 'en-US');

        let html = `
            <div class="print-header">
                <div class="print-logo">
                    <i class="fas fa-tasks"></i>
                    <h2>Enterprise TMS</h2>
                </div>
                <div class="print-meta">
                    <strong>${title}</strong><br>
                    ${Lang.current === 'ar' ? 'تاريخ:' : 'Date:'} ${date}
                </div>
            </div>
        `;

        if (isGrouped) {
            const groups = this.getGroupedData();
            const cols = this.selectedColumns.filter(c => c !== 'department' && c !== 'id');
            
            for (const [dept, rows] of Object.entries(groups)) {
                html += `
                    <div class="print-dept-header">${Lang.current === 'ar' ? 'القسم:' : 'Department:'} ${dept}</div>
                    <table class="print-table">
                        <thead>
                            <tr>${cols.map(c=>`<th>${Lang.t(c)||c}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${rows.map(row=>'<tr>'+cols.map(c=>`<td>${Lang.t(row[c])||row[c]||'—'}</td>`).join('')+'</tr>').join('')}
                        </tbody>
                    </table>
                `;
            }
        } else {
            const cols = this.selectedColumns.filter(c => c !== 'id');
            html += `
                <table class="print-table">
                    <thead>
                        <tr>${cols.map(c=>`<th>${Lang.t(c)||c}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${this.currentData.map(row=>'<tr>'+cols.map(c=>`<td>${Lang.t(row[c])||row[c]||'—'}</td>`).join('')+'</tr>').join('')}
                    </tbody>
                </table>
            `;
        }

        html += `
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

        printArea.innerHTML = html;
        setTimeout(() => { 
            window.print(); 
            setTimeout(() => { printArea.innerHTML = ''; }, 1000);
        }, 200);
    }
};

document.addEventListener('DOMContentLoaded', () => Reports.init());
