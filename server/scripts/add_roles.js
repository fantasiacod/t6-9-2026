const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { supabaseAdmin } = require('../config/database');

async function addRoles() {
    console.log('Adding new roles...');
    const roles = [
        { name: 'supervisor', description: 'مشرف قسم - يمتلك صلاحيات إدارة قسمه' },
        { name: 'it_admin', description: 'مسؤول تقني - يمتلك صلاحيات إدارة النظام التقنية والدعم' }
    ];

    for (const r of roles) {
        const { data, error } = await supabaseAdmin.from('roles').insert(r).select();
        if (error) {
            console.error(`Error adding role ${r.name}:`, error.message);
        } else {
            console.log(`Role ${r.name} added successfully.`);
        }
    }
}

addRoles().catch(console.error);
