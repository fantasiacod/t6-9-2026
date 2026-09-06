/**
 * JWT Configuration
 */
module.exports = {
    secret: process.env.JWT_SECRET || 'default-secret-change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    rememberMeExpiresIn: process.env.JWT_REMEMBER_ME_EXPIRES_IN || '7d'
};
