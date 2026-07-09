/**
 * Frontend API client — calls the backend REST API.
 * All requests go through Next.js rewrites so they're same-origin.
 */

const API_BASE = '/api/v1';

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string>),
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include', // send/receive httpOnly cookies
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ─── Auth ────────────────────────────────────────────
export const api = {
  auth: {
    login(email: string, password: string) {
      return request<{ profile: any }>('POST', '/auth/login', { email, password });
    },
    logout() {
      return request<{ success: boolean }>('POST', '/auth/logout');
    },
    me() {
      return request<{ profile: any }>('GET', '/auth/me');
    },
    signup(input: { name: string; email: string; password: string; role: string; team: string }) {
      return request<{ profile: any }>('POST', '/auth/signup', input);
    },
    updateProfile(input: { name?: string; photoURL?: string }) {
      return request<{ success: boolean }>('PUT', '/auth/profile', input);
    },
    updatePassword(password: string) {
      return request<{ success: boolean }>('PUT', '/auth/password', { password });
    },
  },

  // ─── Customers ────────────────────────────────────
  customers: {
    list(params?: { assignedSalesId?: string; team?: string }) {
      const qs = new URLSearchParams();
      if (params?.assignedSalesId) qs.set('assignedSalesId', params.assignedSalesId);
      if (params?.team) qs.set('team', params.team);
      const q = qs.toString();
      return request<{ customers: any[] }>('GET', `/customers${q ? `?${q}` : ''}`);
    },
    get(id: string) {
      return request<{ customer: any }>('GET', `/customers/${id}`);
    },
    create(data: any) {
      return request<{ customer: any }>('POST', '/customers', data);
    },
    update(id: string, data: any) {
      return request<{ success: boolean }>('PATCH', `/customers/${id}`, data);
    },
    delete(id: string) {
      return request<{ success: boolean }>('DELETE', `/customers/${id}`);
    },
    updatePriority(id: string, newPriority: string) {
      return request<{ success: boolean }>('PATCH', `/customers/${id}/priority`, { newPriority });
    },
    renameCompany(oldName: string, newName: string) {
      return request<{ success: boolean; count: number }>('POST', '/customers/rename-company', { oldName, newName });
    },
    deleteCompanyGroup(companyName: string) {
      return request<{ success: boolean; count: number }>('POST', '/customers/delete-company-group', { companyName });
    },
    search(q: string) {
      return request<{ results: any[] }>('GET', `/customers/search/global?q=${encodeURIComponent(q)}`);
    },
  },

  // ─── OCR Jobs ─────────────────────────────────────
  ocr: {
    createJob(imageUrl?: string) {
      return request<{ job: any }>('POST', '/ocr/jobs', { imageUrl });
    },
    listJobs(limit = 10) {
      return request<{ jobs: any[] }>('GET', `/ocr/jobs?limit=${limit}`);
    },
    getJob(id: string) {
      return request<{ job: any }>('GET', `/ocr/jobs/${id}`);
    },
  },

  // ─── Users ────────────────────────────────────────
  users: {
    list(params?: { role?: string; team?: string }) {
      const qs = new URLSearchParams();
      if (params?.role) qs.set('role', params.role);
      if (params?.team) qs.set('team', params.team);
      const q = qs.toString();
      return request<{ users: any[] }>('GET', `/users${q ? `?${q}` : ''}`);
    },
    listSales(team?: string) {
      return request<{ users: any[] }>('GET', `/users/sales${team ? `?team=${team}` : ''}`);
    },
    get(id: string) {
      return request<{ user: any }>('GET', `/users/${id}`);
    },
    create(data: any) {
      return request<{ user: any }>('POST', '/users', data);
    },
    update(id: string, data: any) {
      return request<{ success: boolean }>('PATCH', `/users/${id}`, data);
    },
    delete(id: string) {
      return request<{ success: boolean }>('DELETE', `/users/${id}`);
    },
    updatePassword(id: string, password: string) {
      return request<{ success: boolean }>('PUT', `/users/${id}/password`, { password });
    },
  },

  // ─── Notifications ────────────────────────────────
  notifications: {
    list() {
      return request<{ notifications: any[]; unreadCount: number }>('GET', '/notifications');
    },
    markRead(id: string) {
      return request<{ success: boolean }>('POST', `/notifications/${id}/read`);
    },
    markAllRead() {
      return request<{ success: boolean }>('POST', '/notifications/read-all');
    },
  },

  // ─── Activities ───────────────────────────────────
  activities: {
    list(limit = 50) {
      return request<{ activities: any[] }>('GET', `/activities?limit=${limit}`);
    },
    create(data: { action: string; targetId: string; targetName: string }) {
      return request<{ activity: any }>('POST', '/activities', data);
    },
  },

  // ─── Email Blasts ─────────────────────────────────
  emailBlasts: {
    list() {
      return request<{ emailBlasts: any[] }>('GET', '/email-blasts');
    },
    create(data: { subject: string; content: string; recipientFilter?: any }) {
      return request<{ emailBlast: any }>('POST', '/email-blasts', data);
    },
  },

  // ─── Media ────────────────────────────────────────
  media: {
    list() {
      return request<{ mediaAssets: any[] }>('GET', '/media');
    },
    upload(data: { dataUri: string; assetName?: string; tags?: string[] }) {
      return request<{ mediaAsset: any }>('POST', '/media/upload', data);
    },
    delete(id: string) {
      return request<{ success: boolean }>('DELETE', `/media/${id}`);
    },
  },

  // ─── Analyses ──────────────────────────────────────
  analyses: {
    list() {
      return request<{ analyses: any[] }>('GET', '/analyses');
    },
    get(id: string) {
      return request<{ analysis: any }>('GET', `/analyses/${id}`);
    },
    create(data: any) {
      return request<{ analysis: any }>('POST', '/analyses', data);
    },
    update(id: string, data: any) {
      return request<{ success: boolean }>('PATCH', `/analyses/${id}`, data);
    },
    delete(uniqueIdentifier: string) {
      return request<{ success: boolean }>('DELETE', '/analyses', { uniqueIdentifier });
    },
  },

  // ─── Companies ────────────────────────────────────
  companies: {
    get(id: string) {
      return request<{ company: any }>('GET', `/companies/${id}`);
    },
    upsert(data: any) {
      return request<{ company: any }>('POST', '/companies', data);
    },
  },

  // ─── Feature Flags ────────────────────────────────
  featureFlags: {
    list() {
      return request<{ featureFlags: any[] }>('GET', '/feature-flags');
    },
    update(id: string, isEnabled: boolean) {
      return request<{ success: boolean }>('PATCH', `/feature-flags/${id}`, { isEnabled });
    },
  },

  // ─── Reports ──────────────────────────────────────
  reports: {
    salesRanking(team?: string) {
      return request<{ distribution: any[] }>('GET', `/reports/sales-ranking${team ? `?team=${team}` : ''}`);
    },
  },
};
