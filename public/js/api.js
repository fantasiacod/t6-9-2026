/**
 * API Client Module — Centralized AJAX wrapper
 */
const API = {
    baseUrl: '/api',
    getToken() { return localStorage.getItem('token'); },
    getHeaders() {
        const h = { 'Content-Type': 'application/json' };
        const token = this.getToken();
        if (token) h['Authorization'] = 'Bearer ' + token;
        return h;
    },
    async request(method, endpoint, data = null, params = null) {
        let url = this.baseUrl + endpoint;
        if (params) {
            const qs = new URLSearchParams();
            Object.entries(params).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) qs.append(k, v); });
            const qsStr = qs.toString();
            if (qsStr) url += '?' + qsStr;
        }
        const options = { method, headers: this.getHeaders() };
        if (data && method !== 'GET') options.body = JSON.stringify(data);
        try {
            const res = await fetch(url, options);
            if (res.status === 401) { localStorage.clear(); window.location.href = '/'; return; }
            const json = await res.json();
            if (!res.ok) {
                if (json.errors && Array.isArray(json.errors)) {
                    json.message = json.errors.map(e => `- ${e.message}`).join('\n');
                }
                throw { status: res.status, ...json };
            }
            return json;
        } catch (err) {
            if (err.status === 401) { localStorage.clear(); window.location.href = '/'; return; }
            throw err;
        }
    },
    get(endpoint, params) { return this.request('GET', endpoint, null, params); },
    post(endpoint, data) { return this.request('POST', endpoint, data); },
    put(endpoint, data) { return this.request('PUT', endpoint, data); },
    patch(endpoint, data) { return this.request('PATCH', endpoint, data); },
    delete(endpoint) { return this.request('DELETE', endpoint); }
};
