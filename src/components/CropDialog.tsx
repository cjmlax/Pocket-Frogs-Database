import { useEffect, useRef, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { fetchImageObjectUrl, cropScreenshot } from '../api/adminSubmissions';

interface Point { x: number; y: number; }

// Interactive screenshot cropper. Loads the admin-gated image onto a canvas at
// natural resolution, lets the admin drag a region, and POSTs the normalized
// rectangle to the crop endpoint. Ported from the old server-rendered panel.
export default function CropDialog({
  id, screenshotUrl, onClose, onCropped,
}: {
  id: string;
  screenshotUrl: string;
  onClose: () => void;
  onCropped: () => void;
}) {
  const auth = useAuth();
  const idToken = auth.user?.id_token;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const startRef = useRef<Point | null>(null);
  const endRef = useRef<Point | null>(null);
  const draggingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!idToken) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    fetchImageObjectUrl(idToken, screenshotUrl)
      .then(url => {
        objectUrl = url;
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          imgRef.current = img;
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            draw();
          }
          setReady(true);
        };
        img.src = url;
      })
      .catch(() => setError('Could not load image'));
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idToken, screenshotUrl]);

  function draw() {
    const canvas = canvasRef.current, img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const s = startRef.current, e = endRef.current;
    if (!s || !e) return;
    const x = Math.min(s.x, e.x), y = Math.min(s.y, e.y);
    const w = Math.abs(e.x - s.x), h = Math.abs(e.y - s.y);
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, x, y, w, h, x, y, w, h); // punch the selection back through
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }

  function pos(e: React.MouseEvent): Point {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: Math.round((e.clientX - r.left) * c.width / r.width),
      y: Math.round((e.clientY - r.top) * c.height / r.height),
    };
  }

  async function apply() {
    const s = startRef.current, e = endRef.current, c = canvasRef.current;
    if (!s || !e || !c || !idToken) return;
    const x = Math.min(s.x, e.x), y = Math.min(s.y, e.y);
    const w = Math.abs(e.x - s.x), h = Math.abs(e.y - s.y);
    if (w < 5 || h < 5) { setError('Selection too small'); return; }
    setSaving(true); setError(null);
    try {
      await cropScreenshot(idToken, id, {
        left: x / c.width, top: y / c.height, right: (x + w) / c.width, bottom: (y + h) / c.height,
      });
      onCropped();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="crop-modal" onClick={e => e.stopPropagation()}>
        {error && <p className="search-error">{error}</p>}
        <canvas
          ref={canvasRef}
          className="crop-canvas"
          onMouseDown={e => { draggingRef.current = true; startRef.current = pos(e); endRef.current = { ...startRef.current }; draw(); }}
          onMouseMove={e => { if (draggingRef.current) { endRef.current = pos(e); draw(); } }}
          onMouseUp={e => { draggingRef.current = false; endRef.current = pos(e); draw(); }}
        />
        <div className="crop-footer">
          <span className="search-hint">{ready ? 'Drag to select crop region' : 'Loading…'}</span>
          <div className="crop-buttons">
            <button className="csv-btn" disabled={saving || !ready} onClick={apply}>
              {saving ? 'Cropping…' : 'Apply Crop'}
            </button>
            <button className="csv-btn" disabled={saving} onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
