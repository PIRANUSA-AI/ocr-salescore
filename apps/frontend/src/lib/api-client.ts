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

function formatDate(value: any): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('id-ID');
}

function formatNotes(notes: any, formAnswers?: any[]): string {
  const parts: string[] = [];
  if (notes && typeof notes === 'object') {
    if (notes.manual?.trim()) parts.push(notes.manual);
    if (notes.webinar?.length) {
      parts.push(notes.webinar.map((w: any) => `[Webinar] ${w.text}`).join('; '));
    }
    if (notes.replyAssistant?.length) {
      parts.push(notes.replyAssistant.map((r: any) => `[AI] ${r.text}`).join('; '));
    }
  }
  if (formAnswers?.length) {
    const formData = formAnswers
      .filter((fa: any) => fa.answer && fa.answer.trim())
      .map((fa: any) => `${fa.question}: ${fa.answer}`)
      .join('\n');
    if (formData) parts.push(formData);
  }
  return parts.join('\n---\n');
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
    updatePassword(currentPassword: string, password: string) {
      return request<{ success: boolean }>('PUT', '/auth/password', { currentPassword, password });
    },
  },

  // ─── Customers ────────────────────────────────────
  customers: {
    list(params?: { assignedSalesId?: string; team?: string; event?: string; eventDate?: string; from?: string; to?: string }) {
      const qs = new URLSearchParams();
      if (params?.assignedSalesId) qs.set('assignedSalesId', params.assignedSalesId);
      if (params?.team) qs.set('team', params.team);
      if (params?.event) qs.set('event', params.event);
      if (params?.eventDate) qs.set('eventDate', params.eventDate);
      if (params?.from) qs.set('from', params.from);
      if (params?.to) qs.set('to', params.to);
      const q = qs.toString();
      return request<{ customers: any[] }>('GET', `/customers${q ? `?${q}` : ''}`);
    },
    get(id: string) {
      return request<{ customer: any }>('GET', `/customers/${id}`);
    },
    create(data: any) {
      return request<{ customer: any }>('POST', '/customers', data);
    },
    createManual(data: any) {
      return request<{ success: boolean; customerId: string; status: 'created' | 'updated' }>('POST', '/customers/manual', data);
    },
    bulkCreate(data: any[], creatorTeam: 'AEC' | 'MFG') {
      return request<{ success: boolean; created: number; updated: number; skipped: number; error?: string }>('POST', '/customers/bulk', { data, creatorTeam });
    },
    update(id: string, data: any) {
      return request<{ success: boolean }>('PATCH', `/customers/${id}`, data);
    },
    delete(id: string) {
      return request<{ success: boolean }>('DELETE', `/customers/${id}`);
    },
    assignNote(id: string, salesId: string, salesName: string, note: string) {
      return request<{ success: boolean }>('POST', `/customers/${id}/assign-note`, { salesId, salesName, note });
    },
    addGenerationHistory(id: string, historyItem: any) {
      return request<{ success: boolean }>('POST', `/customers/${id}/generation-history`, { historyItem });
    },
    analyzeOpportunities() {
      return request<{ tasks: any[] }>('POST', '/customers/opportunities/analyze');
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
    process(imageDataUri: string, team?: 'AEC' | 'MFG') {
      return request<{ job: any }>('POST', '/ocr/process', { imageDataUri, team });
    },
    listJobs(limit = 10) {
      return request<{ jobs: any[] }>('GET', `/ocr/jobs?limit=${limit}`);
    },
    getJob(id: string) {
      return request<{ job: any }>('GET', `/ocr/jobs/${id}`);
    },
    deleteJob(id: string) {
      return request<{ success: boolean }>('DELETE', `/ocr/jobs/${id}`);
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
    analyzeWebinar(data: any) {
      return request<any>('POST', '/analyses/webinar', data);
    },
    update(id: string, data: any) {
      return request<{ success: boolean }>('PATCH', `/analyses/${id}`, data);
    },
    delete(id: string) {
      return request<{ success: boolean }>('DELETE', `/analyses/${id}`);
    },
    assignProspects(id: string, data: { prospects: any[]; salesId: string; salesName: string }) {
      return request<{ success: boolean; count: number }>('POST', `/analyses/${id}/assign-prospects`, data);
    },
    generateTopics(id: string) {
      return request<{ success: boolean; recommendations?: any[]; error?: string }>('POST', `/analyses/${id}/topics`);
    },
    generateInsights(id: string) {
      return request<{ success: boolean; insights?: any; error?: string }>('POST', `/analyses/${id}/insights`);
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
    ocr(params?: { range?: string; team?: string; from?: string; to?: string; event?: string; eventDate?: string }) {
      const qs = new URLSearchParams();
      if (params?.range) qs.set('range', params.range);
      if (params?.team) qs.set('team', params.team);
      if (params?.from) qs.set('from', params.from);
      if (params?.to) qs.set('to', params.to);
      if (params?.event) qs.set('event', params.event);
      if (params?.eventDate) qs.set('eventDate', params.eventDate);
      const q = qs.toString();
      return request<{ report: any }>('GET', `/reports/ocr${q ? `?${q}` : ''}`);
    },
  },

  // ─── Client-side export helpers backed by API data ─────────────
  exports: {
    async customersToExcel(filters?: { team?: 'AEC' | 'MFG'; salesId?: string; pipelineStatus?: string; event?: string; eventDate?: string; from?: string; to?: string }) {
      const [customersRes, salesRes] = await Promise.all([
        api.customers.list({
          team: filters?.team,
          event: filters?.event,
          eventDate: filters?.eventDate,
          from: filters?.from,
          to: filters?.to,
        }),
        api.users.listSales(filters?.team),
      ]);

      const salesCodeByUid = new Map(salesRes.users.map((s: any) => [s.uid, s.salesCode || '']));
      const customers = customersRes.customers.filter((c: any) => {
        if (filters?.salesId && c.assignedSalesId !== filters.salesId) return false;
        if (filters?.pipelineStatus && c.pipelineStatus !== filters.pipelineStatus) return false;
        return true;
      });

      return {
        success: true,
        data: customers.map((c: any) => ({
          Nama: c.name,
          Email: c.email,
          Telepon: c.phone,
          Perusahaan: c.company,
          Jabatan: c.jobTitle,
          Tim: c.team,
          'Pipeline Status': c.pipelineStatus,
          Sales: c.assignedSalesName || 'Belum Ditugaskan',
          'Kode Sales': (c.assignedSalesId && salesCodeByUid.get(c.assignedSalesId)) || '',
          'Potensi Revenue': c.potentialRevenue || 0,
          Produk: c.products?.map((p: any) => p.name).join(', ') || '',
          Sumber: c.acquisitionContext?.source || '',
          Catatan: formatNotes(c.notes, c.formAnswers),
          Dibuat: formatDate(c.createdAt),
          Diupdate: formatDate(c.updatedAt),
        })),
      };
    },
    async pipelineReport(team?: 'AEC' | 'MFG') {
      const { customers } = await api.customers.list(team ? { team } : undefined);
      const pipelineBreakdown: Record<string, { count: number; value: number; customers: string[] }> = {};

      for (const c of customers as any[]) {
        const status = c.pipelineStatus;
        if (!pipelineBreakdown[status]) {
          pipelineBreakdown[status] = { count: 0, value: 0, customers: [] };
        }
        pipelineBreakdown[status].count++;
        pipelineBreakdown[status].value += c.potentialRevenue || 0;
        pipelineBreakdown[status].customers.push(`${c.name} (${c.company})`);
      }

      const totalCustomers = customers.length;
      const totalValue = (customers as any[]).reduce((sum, c) => sum + (c.potentialRevenue || 0), 0);
      const wonDeals = (customers as any[]).filter(c => c.pipelineStatus === 'Won');
      const wonValue = wonDeals.reduce((sum, c) => sum + (c.potentialRevenue || 0), 0);

      return {
        success: true,
        report: {
          generatedAt: new Date().toISOString(),
          team: team || 'All',
          summary: {
            totalCustomers,
            totalValue,
            wonDeals: wonDeals.length,
            wonValue,
            conversionRate: totalCustomers > 0 ? ((wonDeals.length / totalCustomers) * 100).toFixed(1) : '0.0',
          },
          pipelineBreakdown,
        },
      };
    },
  },
};
