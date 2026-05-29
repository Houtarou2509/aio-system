import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Camera } from 'lucide-react';

export interface CameraCaptureModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Called when user captures a photo. Receives the Blob. */
  onCapture: (blob: Blob) => void;
  /** Called when user cancels or closes the modal. */
  onClose: () => void;
  /** localStorage key for persisting the selected camera device ID */
  storageKey: string;
  /**
   * Default facing mode when no saved device exists.
   * Use 'environment' for asset photos (rear), 'user' for profile avatars (front).
   */
  defaultFacingMode?: 'environment' | 'user';
  /**
   * Capture mode: 'full' preserves aspect ratio (assets), 'square' center-crops to 256×256 (profiles).
   */
  captureMode?: 'full' | 'square';
  /**
   * Max dimension for 'full' mode. Defaults to 1280.
   * Ignored for 'square' mode (always 256×256).
   */
  maxDimension?: number;
  /** Max file size in bytes. Capture exceeding this will show an error. Defaults to 2MB. */
  maxFileSize?: number;
  /** Max width of the modal card. Defaults to 'max-w-md'. */
  maxWidth?: string;
  /**
   * External error state setter — if provided, secure-context and camera errors
   * are forwarded here so the parent can display them inline under the form field.
   * If not provided, errors are shown inside the modal.
   */
  onExternalError?: (msg: string | null) => void;
}

export function CameraCaptureModal({
  open,
  onCapture,
  onClose,
  storageKey,
  defaultFacingMode = 'environment',
  captureMode = 'full',
  maxDimension = 1280,
  maxFileSize = 2 * 1024 * 1024,
  maxWidth = 'max-w-md',
  onExternalError,
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => {
    return localStorage.getItem(storageKey) || '';
  });
  const [switching, setSwitching] = useState(false);

  // ── Helpers ──

  const stopStream = useCallback((s: MediaStream | null) => {
    if (s) s.getTracks().forEach(t => t.stop());
  }, []);

  const showError = useCallback((msg: string) => {
    setError(msg);
    onExternalError?.(msg);
  }, [onExternalError]);

  const clearError = useCallback(() => {
    setError(null);
    onExternalError?.(null);
  }, [onExternalError]);

  // ── Enumerate devices ──

  const enumerateDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = all.filter(d => d.kind === 'videoinput');
      setDevices(videoInputs);
      return videoInputs;
    } catch {
      return [];
    }
  }, []);

  // ── Start camera ──

  const startCamera = useCallback(async (deviceId?: string) => {
    clearError();
    if (!window.isSecureContext) {
      const secureUrl = `https://${window.location.host}${window.location.pathname}`;
      const isPrivateIp = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(window.location.hostname);
      showError(
        isPrivateIp
          ? `Camera is blocked on HTTP LAN/IP addresses. Use ${secureUrl} or localhost to take a photo.`
          : `Camera requires HTTPS or localhost. Use ${secureUrl} to take a photo.`
      );
      return;
    }
    try {
      const constraints: MediaStreamConstraints = { audio: false };
      if (deviceId) {
        constraints.video = { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 640 } };
      } else {
        constraints.video = { facingMode: defaultFacingMode, width: { ideal: 640 }, height: { ideal: 640 } };
      }
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(s);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s; }, 0);
      // Re-enumerate to get labels (browser hides labels until permission granted)
      const inputs = await enumerateDevices();
      // Save the actual device used
      const usedTrack = s.getVideoTracks()[0];
      if (usedTrack) {
        const usedDeviceId = usedTrack.getSettings().deviceId || deviceId || '';
        if (usedDeviceId && usedDeviceId !== selectedDeviceId) {
          setSelectedDeviceId(usedDeviceId);
          localStorage.setItem(storageKey, usedDeviceId);
        }
      }
      // Fill in labels if blank
      if (inputs.length > 0) setDevices(inputs);
      setSwitching(false);
    } catch (err: any) {
      setSwitching(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showError('Camera permission denied. You can still upload a photo.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        showError('No camera found on this device. You can still upload a photo.');
      } else if (err.name === 'NotReadableError' || err.name === 'SourceUnavailableError') {
        showError('Camera is already in use by another application. You can still upload a photo.');
      } else if (err.name === 'OverconstrainedError') {
        // Saved device no longer exists — clear and retry once without deviceId
        localStorage.removeItem(storageKey);
        setSelectedDeviceId('');
        if (deviceId) {
          // Retry without the saved deviceId
          startCamera();
        } else {
          showError('Selected camera is not available. You can still upload a photo.');
        }
      } else {
        showError('Camera is not available. You can still upload a photo.');
      }
    }
  }, [defaultFacingMode, storageKey, selectedDeviceId, enumerateDevices, showError, clearError]);

  // ── Open / close lifecycle ──

  useEffect(() => {
    if (open) {
      startCamera(selectedDeviceId || undefined);
    } else {
      stopStream(stream);
      setStream(null);
      clearError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopStream(stream); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Actions ──

  const handleClose = () => {
    stopStream(stream);
    setStream(null);
    clearError();
    onClose();
  };

  const handleSwitchDevice = async (deviceId: string) => {
    if (deviceId === selectedDeviceId) return;
    setSwitching(true);
    stopStream(stream);
    setStream(null);
    setSelectedDeviceId(deviceId);
    localStorage.setItem(storageKey, deviceId);
    await startCamera(deviceId);
  };

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (captureMode === 'square') {
      // Profile avatar: center-crop to 256×256 square
      const size = Math.min(video.videoWidth, video.videoHeight);
      canvas.width = 256;
      canvas.height = 256;
      const sx = (video.videoWidth - size) / 2;
      const sy = (video.videoHeight - size) / 2;
      ctx.drawImage(video, sx, sy, size, size, 0, 0, 256, 256);
    } else {
      // Asset: full-frame, preserve aspect ratio
      let outW = video.videoWidth;
      let outH = video.videoHeight;
      if (outW > maxDimension || outH > maxDimension) {
        const scale = maxDimension / Math.max(outW, outH);
        outW = Math.round(outW * scale);
        outH = Math.round(outH * scale);
      }
      canvas.width = outW;
      canvas.height = outH;
      ctx.drawImage(video, 0, 0, outW, outH);
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      if (blob.size > maxFileSize) {
        showError('Captured image is too large. Try again or upload instead.');
        return;
      }
      stopStream(stream);
      setStream(null);
      clearError();
      onCapture(blob);
    }, 'image/jpeg', 0.9);
  };

  // ── Render ──

  if (!open) return null;

  // Build device label
  const deviceLabel = (d: MediaDeviceInfo, idx: number) => d.label || `Camera ${idx + 1}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full ${maxWidth} overflow-hidden`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700" style={{ background: '#012061' }}>
          <h3 className="text-sm font-bold text-white">Take Photo</h3>
          <button type="button" onClick={handleClose} className="text-white/70 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4">
          {/* Camera selector — show when 2+ devices */}
          {devices.length > 1 && (
            <div className="mb-3">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Camera</label>
              <select
                value={selectedDeviceId}
                onChange={(e) => handleSwitchDevice(e.target.value)}
                disabled={switching}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#f8931f]/40"
              >
                {devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>{deviceLabel(d, i)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Video preview */}
          <div className="relative rounded-lg overflow-hidden bg-black aspect-square">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            {switching && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="text-white text-sm">Switching camera…</span>
              </div>
            )}
          </div>

          {/* Error inside modal */}
          {error && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Camera className="w-3 h-3 shrink-0" />{error}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-3 mt-4">
            <button type="button" onClick={handleClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
            <button type="button" onClick={handleCapture} disabled={!stream || switching} className="px-4 py-2 text-sm font-semibold text-white bg-[#f8931f] rounded-lg hover:bg-[#e07e0a] flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
              <Camera className="w-3.5 h-3.5" /> Capture
            </button>
          </div>
        </div>
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}