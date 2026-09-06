const { supabaseAdmin } = require('../config/database');

/**
 * Fetch a single setting by key
 */
async function getSetting(key) {
    try {
        const { data, error } = await supabaseAdmin
            .from('system_settings')
            .select('value')
            .eq('key', key)
            .single();
        
        if (error) {
            console.error(`[SettingsService] Error fetching setting ${key}:`, error.message);
            return null;
        }
        return data ? data.value : null;
    } catch (err) {
        console.error(`[SettingsService] Exception fetching setting ${key}:`, err.message);
        return null;
    }
}

/**
 * Fetch all settings as a key-value object
 */
async function getAllSettings() {
    try {
        const { data, error } = await supabaseAdmin
            .from('system_settings')
            .select('*');
            
        if (error) {
            console.error('[SettingsService] Error fetching all settings:', error.message);
            return {};
        }
        
        const settings = {};
        if (data) {
            data.forEach(item => {
                settings[item.key] = item.value;
            });
        }
        return settings;
    } catch (err) {
        console.error('[SettingsService] Exception fetching all settings:', err.message);
        return {};
    }
}

/**
 * Update multiple settings
 * @param {Object} settingsObj Key-value pairs of settings to update
 */
async function updateSettings(settingsObj) {
    try {
        for (const [key, value] of Object.entries(settingsObj)) {
            const { error } = await supabaseAdmin
                .from('system_settings')
                .update({ value, updated_at: new Date().toISOString() })
                .eq('key', key);
                
            if (error) {
                console.error(`[SettingsService] Error updating setting ${key}:`, error.message);
            }
        }
        return true;
    } catch (err) {
        console.error('[SettingsService] Exception updating settings:', err.message);
        return false;
    }
}

module.exports = {
    getSetting,
    getAllSettings,
    updateSettings
};
