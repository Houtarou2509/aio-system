import { useState, useCallback } from 'react';
import { ApiError } from '../lib/api';

export interface AgreementPreviewState {
  blobUrl: string | null;
  loading: boolean;
  filename: string;
  personnelId?: string;
  personnelName?: string;
  agreementDocumentId?: string;
  signedPdfPath?: string | null;
  signedUploadedAt?: string | null;
}

export const initialPreviewState: AgreementPreviewState = {
  blobUrl: null,
  loading: false,
  filename: 'agreement.pdf',
};

export function useAgreementPreview() {
  const [preview, setPreview] = useState<AgreementPreviewState>(initialPreviewState);

  const openPreview = useCallback(async (params: Record<string, any>) => {
    setPreview({
      blobUrl: null,
      loading: true,
      filename: 'agreement.pdf',
      personnelId: params.personnelId || undefined,
      personnelName: params.personnelName || undefined,
      agreementDocumentId: params.agreementDocumentId || undefined,
      signedPdfPath: params.signedPdfPath || null,
      signedUploadedAt: params.signedUploadedAt || null,
    });

    try {
      const token = localStorage.getItem('accessToken');
      let res = await fetch('/api/agreements/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/pdf',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(params),
      });

      if (res.status === 401) {
        const rt = localStorage.getItem('refreshToken');
        if (rt) {
          const refreshRes = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rt }),
          });
          const refreshData = await refreshRes.json();
          if (refreshData.success) {
            localStorage.setItem('accessToken', refreshData.data.accessToken);
            localStorage.setItem('refreshToken', refreshData.data.refreshToken);
            res = await fetch('/api/agreements/pdf', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/pdf',
                Authorization: `Bearer ${refreshData.data.accessToken}`,
              },
              body: JSON.stringify(params),
            });
          }
        }
      }

      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const typedBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
      const url = URL.createObjectURL(typedBlob);
      const pName = params.personnelName || 'unknown';
      setPreview(prev => ({
        ...prev,
        blobUrl: url,
        loading: false,
        filename: `agreement-${pName.replace(/\s+/g, '-').toLowerCase()}.pdf`,
      }));
    } catch (e: any) {
      setPreview(prev => ({ ...prev, blobUrl: null, loading: false }));
      alert(e instanceof ApiError ? e.message : 'Failed to generate agreement preview');
    }
  }, []);

  const closePreview = useCallback(() => {
    setPreview(prev => {
      if (prev.blobUrl) {
        setTimeout(() => URL.revokeObjectURL(prev.blobUrl!), 100);
      }
      return { ...initialPreviewState };
    });
  }, []);

  return { preview, openPreview, closePreview };
}