const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('accessToken');
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || 'Request failed');
  return data;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number } | null;
}

export interface Asset {
  id: string;
  name: string;
  type: string;
  manufacturer?: string;
  serialNumber?: string;
  purchasePrice?: number;
  purchaseDate?: string;
  status: string;
  location?: string;
  assignedTo?: string;
  propertyNumber?: string;
  remarks?: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Assignment {
  id: string;
  assetId: string;
  userId?: string;
  assignedTo?: string;
  assignedAt: string;
  returnedAt?: string;
  condition?: string;
  notes?: string;
  user?: { id: string; username: string; email: string };
}

export interface AssetStats {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  byLocation: Record<string, number>;
}

export interface AssetFilters {
  type?: string;
  status?: string;
  location?: string;
  assignedTo?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
}

// Assets API
export const assetsApi = {
  list: (filters: AssetFilters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== '') params.set(k, String(v)); });
    return request<PaginatedResponse<Asset>>(`/assets?${params}`);
  },
  get: (id: string) => request<{ data: Asset & { assignments: Assignment[]; maintenanceLogs: any[] } }>(`/assets/${id}`),
  create: (data: Partial<Asset>) => request<{ data: Asset }>('/assets', { method: 'POST', body: JSON.stringify(data) }),
  createWithImage: async (formData: FormData) => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch('/api/assets', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
    if (!res.ok) throw new Error('Failed to create asset');
    return res.json();
  },
  update: (id: string, data: Partial<Asset>) => request<{ data: Asset }>(`/assets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateWithImage: async (id: string, formData: FormData) => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`/api/assets/${id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: formData });
    if (!res.ok) throw new Error('Failed to update asset');
    return res.json();
  },
  delete: (id: string) => request<{ data: Asset }>(`/assets/${id}`, { method: 'DELETE' }),
  bulkStatus: (ids: string[], status: string) => request<{ data: { updated: number } }>('/assets/bulk-status', { method: 'PATCH', body: JSON.stringify({ ids, status }) }),
  bulkDelete: (ids: string[]) => request<{ data: { deleted: number } }>('/assets/bulk-delete', { method: 'DELETE', body: JSON.stringify({ ids }) }),
  uploadImage: async (id: string, file: File) => {
    const token = localStorage.getItem('accessToken');
    const form = new FormData();
    form.append('image', file);
    const res = await fetch(`${API_BASE}/assets/${id}/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Upload failed');
    return data;
  },
  history: (id: string, page = 1, limit = 20) =>
    request<PaginatedResponse<Assignment>>(`/assets/${id}/history?page=${page}&limit=${limit}`),
  stats: () => request<{ data: AssetStats }>('/assets/stats'),
};

// Users API (for dropdowns)
export const usersApi = {
  list: () => request<{ data: { id: string; username: string; email: string; role: string }[] }>('/users'),
};

// Maintenance API
export interface MaintenanceLog {
  id: string;
  assetId: string;
  technicianName: string;
  description: string;
  cost: number;
  date: string;
  createdAt: string;
}

export const maintenanceApi = {
  list: (assetId: string, page = 1, limit = 20) => request<PaginatedResponse<MaintenanceLog>>(`/assets/${assetId}/maintenance?page=${page}&limit=${limit}`),
  create: (assetId: string, data: Partial<MaintenanceLog>) => request<{ data: MaintenanceLog }>(`/assets/${assetId}/maintenance`, { method: 'POST', body: JSON.stringify(data) }),
  update: (assetId: string, logId: string, data: Partial<MaintenanceLog>) => request<{ data: MaintenanceLog }>(`/assets/${assetId}/maintenance/${logId}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (assetId: string, logId: string) => request<{ data: { deleted: boolean } }>(`/assets/${assetId}/maintenance/${logId}`, { method: 'DELETE' }),
};

// Audit API
export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  performedById: string;
  performedAt: string;
  ipAddress: string | null;
  performedBy?: { id: string; username: string };
}

export interface AuditFilters {
  entityType?: string;
  entityId?: string;
  action?: string;
  performedBy?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export const auditApi = {
  list: (filters: AuditFilters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== '') params.set(k, String(v)); });
    return request<PaginatedResponse<AuditLogEntry>>(`/audit?${params}`);
  },
  timeline: (entityId: string) => request<{ data: AuditLogEntry[] }>(`/audit/${entityId}`),
  revert: (id: string) => request<{ data: { reverted: boolean; field: string; revertedTo: string } }>(`/audit/${id}/revert`, { method: 'POST' }),
  exportCsv: (filters: AuditFilters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== '') params.set(k, String(v)); });
    window.open(`/api/audit/export?${params}`, '_blank');
  },
};