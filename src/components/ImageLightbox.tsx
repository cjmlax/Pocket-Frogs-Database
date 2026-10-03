import { useState, useEffect } from 'react';

// Full-screen image viewer. With more than one image it becomes a carousel:
// prev/next buttons (wrapping), a position counter, and ←/→ keys. Esc or a
// click on the backdrop closes it.
export default function ImageLightbox({
  images, alt, onClose,
}: {
  images: string[];
  alt: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const many = images.length > 1;
  const step = (d: number) => setIndex(i => (i + d + images.length) % images.length);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (many && e.key === 'ArrowLeft') step(-1);
      else if (many && e.key === 'ArrowRight') step(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" aria-label="Close" onClick={onClose}>×</button>
      {many && (
        <button
          className="lightbox-nav lightbox-prev"
          aria-label="Previous screenshot"
          onClick={e => { e.stopPropagation(); step(-1); }}
        >‹</button>
      )}
      <img
        className="lightbox-image"
        src={images[index]}
        alt={many ? `${alt} ${index + 1} of ${images.length}` : alt}
        onClick={e => e.stopPropagation()}
      />
      {many && (
        <>
          <button
            className="lightbox-nav lightbox-next"
            aria-label="Next screenshot"
            onClick={e => { e.stopPropagation(); step(1); }}
          >›</button>
          <span className="lightbox-counter">{index + 1} / {images.length}</span>
        </>
      )}
    </div>
  );
}
