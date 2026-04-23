// @ts-nocheck
import { assetsApi, Asset } from './api';

const API_BASE = '/api';

export const labelsApi = {
  generate: async (assetId: string, format: string, barcodeType: string, fields?: string[]) => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_BASE}/labels/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ assetId, format, barcodeType, fields }),
    });
    if (!res.ok) throw new Error('Label generation failed');
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), '_blank');
  },
  batch: async (assetIds: string[], format: string, barcodeType: string, fields?: string[]) => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_BASE}/labels/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ assetIds, format, barcodeType, fields }),
    });
    if (!res.ok) throw new Error('Batch generation failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'labels.zip';
    a.click();
  },
  preview: (assetId: string, format: string, barcodeType: string) => {
    const token = localStorage.getItem('accessToken');
    return `${API_BASE}/labels/preview/${assetId}?format=${format}&barcodeType=${barcodeType}&token=${token}`;
  },
  listTemplates: async () => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_BASE}/labels/templates`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await res.json();
    if (!d.success) throw new Error(d.error?.message);
    return d.data;
  },
  createTemplate: async (data: any) => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_BASE}/labels/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    const d = await res.json();
    if (!d.success) throw new Error(d.error?.message);
    return d.data;
  },
  updateTemplate: async (id: string, data: any) => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_BASE}/labels/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    const d = await res.json();
    if (!d.success) throw new Error(d.error?.message);
    return d.data;
  },
  deleteTemplate: async (id: string) => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_BASE}/labels/templates/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    const d = await res.json();
    if (!d.success) throw new Error(d.error?.message);
    return d.data;
  },
};

export const guestApi = {
  createToken: async (assetId: string, expiresAt?: string, maxAccess?: number) => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_BASE}/guest/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ assetId, expiresAt, maxAccess }),
    });
    const d = await res.json();
    if (!d.success) throw new Error(d.error?.message);
    return d.data;
  },
  listTokens: async (assetId?: string) => {
    const token = localStorage.getItem('accessToken');
    const url = assetId ? `${API_BASE}/guest/tokens?assetId=${assetId}` : `${API_BASE}/guest/tokens`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const d = await res.json();
    if (!d.success) throw new Error(d.error?.message);
    return d.data;
  },
  revokeToken: async (id: string) => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API_BASE}/guest/tokens/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    const d = await res.json();
    if (!d.success) throw new Error(d.error?.message);
    return d.data;
  },
  getAsset: async (guestToken: string) => {
    const res = await fetch(`${API_BASE}/guest/a/${guestToken}`);
    const d = await res.json();
    if (!d.success) throw new Error(d.error?.message);
    return d.data;
  },
};