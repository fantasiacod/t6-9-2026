/**
 * Database Seeder
 * Creates demo data for testing: roles, permissions, departments, users, tasks
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('../config/database');

async function seed() {
    // ── DESTRUCTIVE GUARD ────────────────────────────────────
    // This seeder DELETES every user, task, note, issue, archive,
    // notification and audit log before inserting demo data.
    // It is for a first install on an EMPTY database only.
    // On a live system it would wipe real data, so it refuses to run
    // unless you explicitly pass --force.
    if (!process.argv.includes('--force')) {
        console.error('\n⛔  REFUSING TO RUN.\n');
        console.error('   This seeder DELETES ALL existing data:');
        console.error('   users, tasks, task notes, technical issues,');
        console.error('   archives, notifications, audit logs, departments.\n');
        console.error('   If this is a live system, DO NOT run it.');
        console.error('   Take a Supabase backup first.\n');
        console.error('   To proceed anyway on an empty database:');
        console.error('       node server/seeders/seed.js --force\n');
        process.exit(1);
    }

    console.log('🌱 Starting database seeder...\n');

    try {
        // ─── Clean existing data ────────────────────────────────
        console.log('🗑️  Cleaning existing data...');
        await supabaseAdmin.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabaseAdmin.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabaseAdmin.from('archives').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabaseAdmin.from('task_notes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabaseAdmin.from('tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabaseAdmin.from('technical_issues').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabaseAdmin.from('login_attempts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabaseAdmin.from('user_roles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabaseAdmin.from('user_permissions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabaseAdmin.from('role_permissions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabaseAdmin.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabaseAdmin.from('permissions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabaseAdmin.from('roles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabaseAdmin.from('departments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        console.log('   ✅ Data cleaned.\n');

        // ─── Create Roles ───────────────────────────────────────
        console.log('👤 Creating roles...');
        const { data: roles } = await supabaseAdmin.from('roles').insert([
            { name: 'admin', description: 'Full system access', is_system: true },
            { name: 'manager', description: 'Department management access', is_system: true },
            { name: 'employee', description: 'Basic employee access', is_system: true }
        ]).select();

        const roleMap = {};
        roles.forEach(r => roleMap[r.name] = r.id);
        console.log('   ✅ Roles created:', Object.keys(roleMap).join(', '));

        // ─── Create Permissions ─────────────────────────────────
        console.log('🔑 Creating permissions...');
        const permissionData = [
            // Users
            { name: 'create_users', category: 'users', description: 'Create new users' },
            { name: 'edit_users', category: 'users', description: 'Edit user details' },
            { name: 'delete_users', category: 'users', description: 'Delete users' },
            { name: 'suspend_users', category: 'users', description: 'Suspend/activate users' },
            { name: 'reset_passwords', category: 'users', description: 'Reset user passwords' },
            { name: 'view_users', category: 'users', description: 'View user list' },
            // Tasks
            { name: 'create_tasks', category: 'tasks', description: 'Create new tasks' },
            { name: 'assign_tasks', category: 'tasks', description: 'Assign tasks to employees' },
            { name: 'edit_tasks', category: 'tasks', description: 'Edit task details' },
            { name: 'close_tasks', category: 'tasks', description: 'Close/complete tasks' },
            { name: 'archive_tasks', category: 'tasks', description: 'Archive tasks' },
            { name: 'view_tasks', category: 'tasks', description: 'View tasks' },
            { name: 'change_task_status', category: 'tasks', description: 'Change task status' },
            { name: 'delete_tasks', category: 'tasks', description: 'Delete tasks' },
            // Reports
            { name: 'view_reports', category: 'reports', description: 'View reports' },
            { name: 'export_reports', category: 'reports', description: 'Export reports (CSV/PDF/Excel)' },
            { name: 'generate_reports', category: 'reports', description: 'Generate reports' },
            { name: 'export_pdf', category: 'reports', description: 'Export reports as PDF' },
            { name: 'export_excel', category: 'reports', description: 'Export reports as Excel' },
            { name: 'print_reports', category: 'reports', description: 'Print reports' },
            // Technical Issues
            { name: 'create_technical_issues', category: 'technical_issues', description: 'Report technical issues' },
            { name: 'resolve_technical_issues', category: 'technical_issues', description: 'Resolve technical issues' },
            { name: 'view_technical_issues', category: 'technical_issues', description: 'View technical issues' },
            { name: 'delete_technical_issues', category: 'technical_issues', description: 'Delete technical issues' },
            // Departments
            { name: 'create_departments', category: 'departments', description: 'Create departments' },
            { name: 'edit_departments', category: 'departments', description: 'Edit departments' },
            { name: 'delete_departments', category: 'departments', description: 'Delete departments' },
            { name: 'view_departments', category: 'departments', description: 'View departments' },
            // Roles
            { name: 'view_roles', category: 'roles', description: 'View roles and the permission matrix' },
            { name: 'manage_roles', category: 'roles', description: 'Manage roles' },
            { name: 'manage_permissions', category: 'roles', description: 'Manage permissions' },
            // Archives
            { name: 'view_archives', category: 'archives', description: 'View archived tasks and issues' },
            // Audit
            { name: 'view_audit_logs', category: 'audit', description: 'View audit logs' },
            // Settings
            { name: 'manage_settings', category: 'settings', description: 'Manage system settings and branding' },
            // Notifications
            { name: 'manage_notifications', category: 'notifications', description: 'Manage notifications' },
            // Data scope — replaces the old hardcoded admin/manager/employee scoping
            { name: 'view_all_data', category: 'scope', description: 'See data across every department' },
            { name: 'view_department_data', category: 'scope', description: 'See data for the whole department, not just own records' }
        ];

        const { data: permissions } = await supabaseAdmin.from('permissions').insert(permissionData).select();
        const permMap = {};
        permissions.forEach(p => permMap[p.name] = p.id);
        console.log(`   ✅ ${permissions.length} permissions created.`);

        // ─── Assign Permissions to Roles ────────────────────────
        console.log('🔗 Assigning permissions to roles...');

        // Admin gets ALL permissions
        const adminPerms = permissions.map(p => ({ role_id: roleMap.admin, permission_id: p.id }));
        await supabaseAdmin.from('role_permissions').insert(adminPerms);

        // Manager permissions — same set as before, plus the department
        // scope permission and the report permissions the UI referenced.
        const managerPermNames = [
            'create_tasks', 'assign_tasks', 'edit_tasks', 'close_tasks', 'view_tasks', 'change_task_status',
            'view_reports', 'export_reports', 'generate_reports', 'export_pdf', 'export_excel', 'print_reports',
            'create_technical_issues', 'view_technical_issues',
            'view_departments', 'view_users',
            'view_department_data'
        ];
        const managerPerms = managerPermNames.map(name => ({ role_id: roleMap.manager, permission_id: permMap[name] }));
        await supabaseAdmin.from('role_permissions').insert(managerPerms);

        // Employee permissions
        // Employee gets no scope permission at all, so it only ever sees its own records.
        const empPermNames = ['view_tasks', 'change_task_status', 'create_technical_issues', 'view_technical_issues', 'print_reports'];
        const empPerms = empPermNames.map(name => ({ role_id: roleMap.employee, permission_id: permMap[name] }));
        await supabaseAdmin.from('role_permissions').insert(empPerms);
        console.log('   ✅ Permissions assigned.');

        // ─── Create Departments ─────────────────────────────────
        console.log('🏢 Creating departments...');
        const { data: departments } = await supabaseAdmin.from('departments').insert([
            { name: 'IT Department', description: 'Information Technology and Systems', is_active: true },
            { name: 'HR Department', description: 'Human Resources and Recruitment', is_active: true },
            { name: 'Finance Department', description: 'Financial Operations and Accounting', is_active: true }
        ]).select();

        const deptMap = {};
        departments.forEach(d => deptMap[d.name] = d.id);
        console.log('   ✅ Departments created:', Object.keys(deptMap).join(', '));

        // ─── Create Users ───────────────────────────────────────
        console.log('👥 Creating users...');
        const passwordHash = await bcrypt.hash('Admin@123', 12);
        const managerHash = await bcrypt.hash('Manager@123', 12);
        const empHash = await bcrypt.hash('Employee@123', 12);

        const usersData = [
            { full_name: 'System Administrator', email: 'admin@enterprise.com', phone: '+966500000001',
              job_title: 'System Admin', employee_id: 'EMP001', username: 'admin',
              password_hash: passwordHash, department_id: deptMap['IT Department'], status: 'active' },
            { full_name: 'Ahmed Al-Rashid', email: 'ahmed@enterprise.com', phone: '+966500000002',
              job_title: 'IT Manager', employee_id: 'EMP002', username: 'ahmed.manager',
              password_hash: managerHash, department_id: deptMap['IT Department'], status: 'active' },
            { full_name: 'Sara Al-Qahtani', email: 'sara@enterprise.com', phone: '+966500000003',
              job_title: 'HR Manager', employee_id: 'EMP003', username: 'sara.manager',
              password_hash: managerHash, department_id: deptMap['HR Department'], status: 'active' },
            { full_name: 'Mohammed Al-Harbi', email: 'mohammed@enterprise.com', phone: '+966500000004',
              job_title: 'Software Developer', employee_id: 'EMP004', username: 'mohammed.emp',
              password_hash: empHash, department_id: deptMap['IT Department'], status: 'active' },
            { full_name: 'Fatima Al-Zahrani', email: 'fatima@enterprise.com', phone: '+966500000005',
              job_title: 'UI/UX Designer', employee_id: 'EMP005', username: 'fatima.emp',
              password_hash: empHash, department_id: deptMap['IT Department'], status: 'active' },
            { full_name: 'Omar Al-Otaibi', email: 'omar@enterprise.com', phone: '+966500000006',
              job_title: 'HR Specialist', employee_id: 'EMP006', username: 'omar.emp',
              password_hash: empHash, department_id: deptMap['HR Department'], status: 'active' },
            { full_name: 'Layla Al-Shammari', email: 'layla@enterprise.com', phone: '+966500000007',
              job_title: 'Financial Analyst', employee_id: 'EMP007', username: 'layla.emp',
              password_hash: empHash, department_id: deptMap['Finance Department'], status: 'active' }
        ];

        const { data: users } = await supabaseAdmin.from('users').insert(usersData).select();
        const userMap = {};
        users.forEach(u => userMap[u.username] = u.id);
        console.log(`   ✅ ${users.length} users created.`);

        // ─── Assign Roles to Users ──────────────────────────────
        console.log('🔗 Assigning roles to users...');
        await supabaseAdmin.from('user_roles').insert([
            { user_id: userMap['admin'], role_id: roleMap.admin },
            { user_id: userMap['ahmed.manager'], role_id: roleMap.manager },
            { user_id: userMap['sara.manager'], role_id: roleMap.manager },
            { user_id: userMap['mohammed.emp'], role_id: roleMap.employee },
            { user_id: userMap['fatima.emp'], role_id: roleMap.employee },
            { user_id: userMap['omar.emp'], role_id: roleMap.employee },
            { user_id: userMap['layla.emp'], role_id: roleMap.employee }
        ]);
        console.log('   ✅ Roles assigned.');

        // ─── Create Sample Tasks ────────────────────────────────
        console.log('📋 Creating sample tasks...');
        const today = new Date().toISOString().split('T')[0];
        const tasksData = [
            { title: 'Setup Server Infrastructure', description: 'Configure and deploy production servers',
              assigned_to: userMap['mohammed.emp'], created_by: userMap['ahmed.manager'],
              department_id: deptMap['IT Department'], priority: 'high', status: 'in_progress',
              progress: 50, work_days: 5, start_date: today },
            { title: 'Design New Landing Page', description: 'Create a modern landing page for the company website',
              assigned_to: userMap['fatima.emp'], created_by: userMap['ahmed.manager'],
              department_id: deptMap['IT Department'], priority: 'medium', status: 'new',
              progress: 0, work_days: 3, start_date: today },
            { title: 'Employee Onboarding Process', description: 'Prepare documentation for new employee onboarding',
              assigned_to: userMap['omar.emp'], created_by: userMap['sara.manager'],
              department_id: deptMap['HR Department'], priority: 'high', status: 'in_progress',
              progress: 50, work_days: 7, start_date: today },
            { title: 'Database Optimization', description: 'Optimize database queries and indexes',
              assigned_to: userMap['mohammed.emp'], created_by: userMap['ahmed.manager'],
              department_id: deptMap['IT Department'], priority: 'urgent', status: 'delayed',
              progress: 30, work_days: 2, start_date: today, delay_reason: 'Waiting for production access credentials' },
            { title: 'Q1 Financial Report Review', description: 'Review and validate Q1 financial reports',
              assigned_to: userMap['layla.emp'], created_by: userMap['admin'],
              department_id: deptMap['Finance Department'], priority: 'high', status: 'completed',
              progress: 100, work_days: 5, start_date: today, close_date: new Date().toISOString() }
        ];

        const { data: tasks } = await supabaseAdmin.from('tasks').insert(tasksData).select();
        console.log(`   ✅ ${tasks.length} tasks created.`);

        // ─── Create Sample Task Notes ───────────────────────────
        console.log('📝 Creating sample task notes...');
        if (tasks.length > 0) {
            await supabaseAdmin.from('task_notes').insert([
                { task_id: tasks[0].id, user_id: userMap['mohammed.emp'], content: 'Started working on server configuration. Provisioned 3 VMs.' },
                { task_id: tasks[0].id, user_id: userMap['ahmed.manager'], content: 'Great progress. Make sure to set up monitoring as well.' },
                { task_id: tasks[2].id, user_id: userMap['omar.emp'], content: 'Draft onboarding checklist completed. Waiting for review.' },
                { task_id: tasks[2].id, user_id: userMap['sara.manager'], content: 'Reviewed the checklist. Please add IT setup section.' }
            ]);
        }
        console.log('   ✅ Task notes created.');

        // ─── Create Sample Technical Issues ─────────────────────
        console.log('🔧 Creating sample technical issues...');
        await supabaseAdmin.from('technical_issues').insert([
            { title: 'Email Server Down', description: 'Company email server is not responding since morning',
              sender_id: userMap['mohammed.emp'], department_id: deptMap['IT Department'],
              priority: 'urgent', status: 'open' },
            { title: 'Printer Not Working', description: 'HP printer on 2nd floor is showing offline status',
              sender_id: userMap['omar.emp'], department_id: deptMap['HR Department'],
              priority: 'low', status: 'in_progress' },
            { title: 'VPN Access Issue', description: 'Cannot connect to VPN from home network',
              sender_id: userMap['layla.emp'], department_id: deptMap['Finance Department'],
              priority: 'medium', status: 'resolved', resolved_by: userMap['admin'],
              resolution_notes: 'VPN certificate was expired. Renewed and shared new configuration.' }
        ]);
        console.log('   ✅ Technical issues created.');

        // ─── Create Sample Notifications ────────────────────────
        console.log('🔔 Creating sample notifications...');
        await supabaseAdmin.from('notifications').insert([
            { user_id: userMap['mohammed.emp'], title: 'New Task Assigned', message: 'Task "Setup Server Infrastructure" has been assigned to you.', type: 'task' },
            { user_id: userMap['ahmed.manager'], title: 'Task Delayed', message: 'Task "Database Optimization" is delayed.', type: 'danger' },
            { user_id: userMap['admin'], title: 'New Technical Issue', message: 'Issue "Email Server Down" has been reported.', type: 'warning' }
        ]);
        console.log('   ✅ Notifications created.');

        console.log('\n✅ ═══════════════════════════════════════════');
        console.log('   Seeder completed successfully!');
        console.log('   ═══════════════════════════════════════════\n');
        console.log('   Default Credentials:');
        console.log('   ┌──────────────────┬─────────────────┬────────────┐');
        console.log('   │ Username         │ Password        │ Role       │');
        console.log('   ├──────────────────┼─────────────────┼────────────┤');
        console.log('   │ admin            │ Admin@123       │ Admin      │');
        console.log('   │ ahmed.manager    │ Manager@123     │ Manager    │');
        console.log('   │ sara.manager     │ Manager@123     │ Manager    │');
        console.log('   │ mohammed.emp     │ Employee@123    │ Employee   │');
        console.log('   │ fatima.emp       │ Employee@123    │ Employee   │');
        console.log('   │ omar.emp         │ Employee@123    │ Employee   │');
        console.log('   │ layla.emp        │ Employee@123    │ Employee   │');
        console.log('   └──────────────────┴─────────────────┴────────────┘\n');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Seeder failed:', error);
        process.exit(1);
    }
}

seed();
