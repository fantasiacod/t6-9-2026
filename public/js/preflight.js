/**
 * Preflight Script — Runs synchronously in <head> BEFORE any rendering
 * Prevents Flash of Unstyled Content (FOUC) by applying theme/direction immediately
 */
(function() {
    try {
        // Apply theme immediately from localStorage
        const theme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);

        // Apply language direction
        const lang = localStorage.getItem('lang') || 'ar';
        if (lang === 'ar') {
            document.documentElement.setAttribute('dir', 'rtl');
            document.documentElement.setAttribute('lang', 'ar');
        } else {
            document.documentElement.setAttribute('dir', 'ltr');
            document.documentElement.setAttribute('lang', 'en');
        }

        // If no token, redirect to login immediately (prevents any flash)
        const isLoginPage = window.location.pathname === '/' || window.location.pathname === '/login';
        if (!isLoginPage && !localStorage.getItem('token')) {
            document.documentElement.style.display = 'none';
            window.location.replace('/');
        }
    } catch(e) {}
})();
