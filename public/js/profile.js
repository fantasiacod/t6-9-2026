/**
 * Profile Module
 */
const Profile = {
    currentAvatar: null,
    async init() {
        await this.loadProfile();
        document.getElementById('profileForm')?.addEventListener('submit',(e)=>{e.preventDefault();this.updateProfile();});
        document.getElementById('passwordForm')?.addEventListener('submit',(e)=>{e.preventDefault();this.changePassword();});
        
        document.getElementById('profileAvatarContainer')?.addEventListener('click', () => {
            document.getElementById('profileAvatarInput').click();
        });
        
        document.getElementById('profileAvatarInput')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) { App.showError('Please select an image file.'); return; }
            
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_SIZE = 200;
                    let width = img.width; let height = img.height;
                    if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
                    else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    
                    Profile.currentAvatar = dataUrl;
                    const imgEl = document.getElementById('profileAvatarImg');
                    if (imgEl) { imgEl.src = dataUrl; imgEl.style.display = 'block'; }
                    const txtEl = document.getElementById('profileAvatarText');
                    if (txtEl) txtEl.style.display = 'none';
                    
                    // Auto-save the avatar immediately!
                    Profile.updateProfile();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    },
    async loadProfile() {
        try {
            const r = await API.get('/auth/me');
            if (!r.success) return;
            const u = r.data;
            document.getElementById('profileName').textContent = u.fullName;
            document.getElementById('profileJobTitle').textContent = u.jobTitle || 'No title';
            document.getElementById('profileRoleBadge').innerHTML = App.roleBadge(u.role?.name);
            document.getElementById('profileRoleBadge').className = '';
            document.getElementById('profileEmpId').textContent = u.employeeId;
            document.getElementById('profileUsername').textContent = u.username;
            document.getElementById('profileDept').textContent = u.department?.name || '—';
            document.getElementById('profileStatus').textContent = u.status;
            const si = document.getElementById('profileStatusIcon');
            si.style.color = u.status==='active'?'#43A047':'#E53935'; si.style.fontSize='10px';
            this.currentAvatar = u.avatarUrl || null;
            if (this.currentAvatar) {
                const imgEl = document.getElementById('profileAvatarImg');
                if (imgEl) { imgEl.src = this.currentAvatar; imgEl.style.display = 'block'; }
                const txtEl = document.getElementById('profileAvatarText');
                if (txtEl) txtEl.style.display = 'none';
            } else {
                const txtEl = document.getElementById('profileAvatarText');
                if (txtEl) { txtEl.textContent = (u.fullName||'U')[0].toUpperCase(); txtEl.style.display = 'block'; }
                const imgEl = document.getElementById('profileAvatarImg');
                if (imgEl) imgEl.style.display = 'none';
            }
            document.getElementById('profileFullName').value = u.fullName;
            document.getElementById('profileEmail').value = u.email;
            document.getElementById('profilePhone').value = u.phone || '';
        } catch {}
    },
    async updateProfile() {
        const data = { 
            full_name: document.getElementById('profileFullName').value, 
            email: document.getElementById('profileEmail').value, 
            phone: document.getElementById('profilePhone').value,
            avatar_url: this.currentAvatar
        };
        try {
            App.showLoading();
            const r = await API.put('/auth/profile', data);
            App.showSuccess(r.message || 'Profile updated successfully.');
            
            // Update local storage so header reflects changes immediately
            const cachedUser = JSON.parse(localStorage.getItem('user') || '{}');
            cachedUser.fullName = data.full_name;
            cachedUser.email = data.email;
            cachedUser.phone = data.phone;
            cachedUser.avatarUrl = data.avatar_url;
            localStorage.setItem('user', JSON.stringify(cachedUser));
            
            // Refresh data on screen
            this.loadProfile();
            
            // Manually update header avatar
            const avatarEl = document.getElementById('userAvatar');
            if (avatarEl) {
                if (data.avatar_url) {
                    avatarEl.innerHTML = `<img src="${data.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                } else {
                    avatarEl.textContent = (data.full_name || 'U')[0].toUpperCase();
                }
            }
        } catch(e) { 
            App.showError(e.message || 'Failed to update profile.'); 
        } finally {
            App.hideLoading();
        }
    },
    async changePassword() {
        const current_password = document.getElementById('currentPassword').value;
        const new_password = document.getElementById('newPassword').value;
        const confirm = document.getElementById('confirmPassword').value;
        
        if (!current_password) { App.showError('Current password is required'); return; }
        if (new_password !== confirm) { App.showError('Passwords do not match'); return; }
        if (new_password.length < 8) { App.showError('Min 8 characters'); return; }
        
        try {
            App.showLoading();
            const r = await API.put('/auth/password', { current_password, new_password });
            App.showSuccess(r.message || 'Password changed successfully.');
            document.getElementById('passwordForm').reset();
        } catch(e) {
            App.showError(e.message || 'Failed to change password.');
        } finally {
            App.hideLoading();
        }
    }
};
document.addEventListener('DOMContentLoaded', () => Profile.init());
