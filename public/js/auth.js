/**
 * Auth Module — Login page logic
 */
const Auth = {
    init() {
        if (localStorage.getItem('token')) { window.location.href = '/dashboard'; return; }
        document.getElementById('loginForm')?.addEventListener('submit', (e) => { e.preventDefault(); this.login(); });
        document.getElementById('togglePassword')?.addEventListener('click', () => this.togglePassword());
        document.getElementById('forgotPasswordLink')?.addEventListener('click', (e) => { e.preventDefault(); this.forgotPassword(); });
        this.loadPublicSettings();
        document.body.classList.add('loaded');
    },
    async loadPublicSettings() {
        try {
            const res = await fetch('/api/settings/public');
            const json = await res.json();
            if (json.success && json.data) {
                const s = json.data;
                // Apply primary color
                if (s.primary_color) {
                    document.documentElement.style.setProperty('--green-500', s.primary_color);
                    document.documentElement.style.setProperty('--green-600', s.primary_color);
                    document.documentElement.style.setProperty('--primary-custom', s.primary_color);
                }
                if (s.sidebar_text_color) {
                    document.documentElement.style.setProperty('--sidebar-text-color', s.sidebar_text_color);
                }
                if (s.text_color) {
                    document.documentElement.style.setProperty('--text-primary', s.text_color);
                }
                if (s.font_family) {
                    document.documentElement.style.setProperty('--font-primary', `"${s.font_family}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`);
                }
                // Apply login logo
                if (s.login_logo_url) {
                    const container = document.getElementById('loginLogoContainer');
                    if (container) {
                        container.innerHTML = `<img src="${s.login_logo_url}" alt="Logo" style="max-height: 120px; max-width: 100%; object-fit: contain;">`;
                    }
                }
            }
        } catch (e) {
            console.error('Failed to load public settings:', e);
        }
    },
    async login() {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('rememberMe').checked;
        if (!username || !password) { this.showError('Please enter username and password.'); return; }
        const btn = document.getElementById('loginBtn');
        document.getElementById('loginText').style.display = 'none';
        document.getElementById('loginSpinner').style.display = 'inline';
        btn.disabled = true;
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, remember_me: rememberMe })
            });
            const data = await res.json();
            if (data.success) {
                localStorage.setItem('token', data.data.token);
                localStorage.setItem('user', JSON.stringify(data.data.user));
                window.location.href = '/dashboard';
            } else {
                this.showError(data.message || 'Login failed.');
            }
        } catch (err) {
            this.showError('Server connection error. Please try again.');
        } finally {
            document.getElementById('loginText').style.display = 'inline';
            document.getElementById('loginSpinner').style.display = 'none';
            btn.disabled = false;
        }
    },
    togglePassword() {
        const input = document.getElementById('password');
        const icon = document.querySelector('#togglePassword i');
        if (input.type === 'password') { input.type = 'text'; icon.className = 'fas fa-eye-slash'; }
        else { input.type = 'password'; icon.className = 'fas fa-eye'; }
    },
    async forgotPassword() {
        const { value: email } = await Swal.fire({
            title: 'Forgot Password', input: 'email', inputLabel: 'Enter your email address',
            inputPlaceholder: 'email@example.com', showCancelButton: true, confirmButtonText: 'Reset',
            inputValidator: (v) => { if (!v) return 'Email is required'; }
        });
        if (email) {
            try {
                const res = await fetch('/api/auth/forgot-password', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await res.json();
                Swal.fire({ icon: 'info', title: 'Check Email', text: data.message || 'If the email exists, instructions have been sent.' });
            } catch { Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to process request.' }); }
        }
    },
    showError(msg) {
        const el = document.getElementById('loginError');
        document.getElementById('errorText').textContent = msg;
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 5000);
    }
};
document.addEventListener('DOMContentLoaded', () => Auth.init());
