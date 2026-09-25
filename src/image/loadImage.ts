import { GrayImage, ImageAdjustments } from '../types';
import { rgbaToGrayscale } from './grayscale';

export interface ProcessImageOptions {
  targetResolution?: number; // default 512
  adjustments?: Partial<ImageAdjustments>;
  cropAspect?: number; // width / height
}

/**
 * Loads an image from a File, Blob, or URL and extracts a normalized GrayImage.
 */
export async function loadImageToGray(
  source: File | Blob | string,
  options: ProcessImageOptions = {}
): Promise<{ grayImage: GrayImage; previewUrl: string }> {
  let url = '';
  let shouldRevoke = false;

  const isSvg =
    (source instanceof File && (source.type.includes('svg') || source.name.toLowerCase().endsWith('.svg'))) ||
    (source instanceof Blob && source.type.includes('svg')) ||
    (typeof source === 'string' && (source.trim().startsWith('<svg') || source.trim().startsWith('<?xml')));

  if (isSvg) {
    let svgText = '';
    if (typeof source === 'string') {
      svgText = source;
    } else {
      svgText = await source.text();
    }

    try {
      if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        if (svgEl) {
          if (!svgEl.getAttribute('xmlns')) {
            svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          }
          const viewBox = svgEl.getAttribute('viewBox');
          let vbW = 512;
          let vbH = 512;
          if (viewBox) {
            const parts = viewBox.trim().split(/[\s,]+/).map(Number);
            if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
              vbW = parts[2];
              vbH = parts[3];
            }
          }
          if (!svgEl.getAttribute('width') || svgEl.getAttribute('width')?.includes('%')) {
            svgEl.setAttribute('width', vbW.toString());
          }
          if (!svgEl.getAttribute('height') || svgEl.getAttribute('height')?.includes('%')) {
            svgEl.setAttribute('height', vbH.toString());
          }

          const serialized = new XMLSerializer().serializeToString(svgEl);
          const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
          url = URL.createObjectURL(blob);
          shouldRevoke = true;
        } else {
          const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
          url = URL.createObjectURL(blob);
          shouldRevoke = true;
        }
      } else {
        const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
        url = URL.createObjectURL(blob);
        shouldRevoke = true;
      }
    } catch {
      const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      url = URL.createObjectURL(blob);
      shouldRevoke = true;
    }
  } else if (typeof source === 'string') {
    url = source;
  } else {
    url = URL.createObjectURL(source);
    shouldRevoke = true;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(new Error('Failed to load SVG / image: ' + e));
    img.src = url;
  });

  const res = options.targetResolution ?? 512;
  const adj = options.adjustments ?? {};

  // Setup canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get 2D canvas context');

  // Compute square or fit dimensions
  canvas.width = res;
  canvas.height = res;

  // Clear canvas transparently so alpha channels can be properly extracted
  ctx.clearRect(0, 0, res, res);

  ctx.save();
  ctx.translate(res / 2, res / 2);

  // Rotation
  if (adj.rotation) {
    ctx.rotate((adj.rotation * Math.PI) / 180);
  }

  // Flip horizontal
  if (adj.flipHorizontal) {
    ctx.scale(-1, 1);
  }

  // Draw image fitting nicely into target square
  const naturalW = img.naturalWidth || res;
  const naturalH = img.naturalHeight || res;
  const imgAspect = naturalW / naturalH;
  let drawW = res;
  let drawH = res;

  if (imgAspect > 1) {
    drawH = res;
    drawW = res * imgAspect;
  } else {
    drawW = res;
    drawH = res / imgAspect;
  }

  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();

  const imgData = ctx.getImageData(0, 0, res, res);
  const grayImage = rgbaToGrayscale(imgData.data, res, res, adj);

  const previewDataUrl = canvas.toDataURL('image/png');

  if (shouldRevoke) {
    URL.revokeObjectURL(url);
  }

  return {
    grayImage,
    previewUrl: previewDataUrl,
  };
}

/**
 * Creates a synthetic test image (e.g. dragon silhouette, circle, mandala, stripes)
 */
export function createSyntheticTestImage(
  size = 512,
  type: 'dragon' | 'wolf' | 'celestial' | 'circle' | 'mandala' | 'stripes' = 'dragon'
): GrayImage {
  // Headless / Node.js test environment fallback when DOM canvas is not present
  if (typeof document === 'undefined') {
    const pixels = new Float32Array(size * size);
    pixels.fill(1.0); // white background
    const cx = size / 2;
    const cy = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x - cx) / (size * 0.4);
        const dy = (y - cy) / (size * 0.4);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const wing = Math.abs(dx) * 1.5 - dy * 0.5;
        const isSilhouette = dist < 0.65 && (wing < 0.85 || Math.abs(dx) < 0.28 || (dy > 0 && Math.abs(dx) < 0.5));
        if (isSilhouette) {
          pixels[y * size + x] = 0.0; // black silhouette
        }
      }
    }
    return { width: size, height: size, pixels };
  }

  if (type === 'dragon') {
    // Generate dragon silhouette using 2D canvas path matching the user's photo
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // White background = light opening
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const s = size / 512; // scale factor

      // Black silhouette = dragon shadow
      ctx.fillStyle = '#000000';
      ctx.beginPath();

      // Dragon Head and Horns (Top)
      ctx.moveTo(cx, cy - 140 * s);
      ctx.quadraticCurveTo(cx - 15 * s, cy - 165 * s, cx - 25 * s, cy - 190 * s); // left horn
      ctx.quadraticCurveTo(cx - 12 * s, cy - 165 * s, cx - 5 * s, cy - 150 * s);
      ctx.quadraticCurveTo(cx - 35 * s, cy - 145 * s, cx - 45 * s, cy - 130 * s); // snout
      ctx.quadraticCurveTo(cx - 30 * s, cy - 125 * s, cx - 18 * s, cy - 120 * s); // jaw
      ctx.quadraticCurveTo(cx - 28 * s, cy - 80 * s, cx - 15 * s, cy - 40 * s); // neck

      // Left Wing
      ctx.quadraticCurveTo(cx - 80 * s, cy - 100 * s, cx - 180 * s, cy - 160 * s); // wing top tip
      ctx.quadraticCurveTo(cx - 155 * s, cy - 100 * s, cx - 200 * s, cy - 70 * s); // wing finger 1
      ctx.quadraticCurveTo(cx - 150 * s, cy - 40 * s, cx - 170 * s, cy + 10 * s); // wing finger 2
      ctx.quadraticCurveTo(cx - 120 * s, cy + 10 * s, cx - 110 * s, cy + 45 * s); // wing finger 3
      ctx.quadraticCurveTo(cx - 80 * s, cy + 25 * s, cx - 45 * s, cy + 30 * s); // wing base

      // Body & Tail (curling around bottom)
      ctx.quadraticCurveTo(cx - 75 * s, cy + 90 * s, cx - 70 * s, cy + 160 * s); // tail outer left
      ctx.quadraticCurveTo(cx - 45 * s, cy + 215 * s, cx + 5 * s, cy + 225 * s); // tail bottom curve
      ctx.quadraticCurveTo(cx + 45 * s, cy + 220 * s, cx + 55 * s, cy + 175 * s); // tail inner right
      // Tail arrow tip / spade
      ctx.lineTo(cx + 70 * s, cy + 170 * s);
      ctx.lineTo(cx + 85 * s, cy + 155 * s);
      ctx.lineTo(cx + 65 * s, cy + 150 * s);
      ctx.lineTo(cx + 50 * s, cy + 130 * s);
      ctx.quadraticCurveTo(cx + 40 * s, cy + 160 * s, cx + 25 * s, cy + 185 * s);
      ctx.quadraticCurveTo(cx - 35 * s, cy + 180 * s, cx - 40 * s, cy + 130 * s);
      ctx.quadraticCurveTo(cx - 40 * s, cy + 70 * s, cx - 10 * s, cy + 40 * s);

      // Right Wing
      ctx.quadraticCurveTo(cx + 40 * s, cy + 30 * s, cx + 70 * s, cy + 45 * s);
      ctx.quadraticCurveTo(cx + 100 * s, cy + 15 * s, cx + 130 * s, cy + 20 * s);
      ctx.quadraticCurveTo(cx + 120 * s, cy - 35 * s, cx + 160 * s, cy - 65 * s);
      ctx.quadraticCurveTo(cx + 125 * s, cy - 95 * s, cx + 150 * s, cy - 150 * s); // right wing tip
      ctx.quadraticCurveTo(cx + 60 * s, cy - 90 * s, cx + 15 * s, cy - 40 * s); // right wing base

      // Neck and Head right side
      ctx.quadraticCurveTo(cx + 25 * s, cy - 80 * s, cx + 15 * s, cy - 120 * s);
      ctx.quadraticCurveTo(cx + 25 * s, cy - 150 * s, cx + 18 * s, cy - 180 * s); // right horn
      ctx.quadraticCurveTo(cx + 8 * s, cy - 155 * s, cx, cy - 140 * s);
      ctx.closePath();
      ctx.fill();

      // Extract pixel luminance
      const imgData = ctx.getImageData(0, 0, size, size);
      const data = imgData.data;
      const pixels = new Float32Array(size * size);
      for (let i = 0; i < pixels.length; i++) {
        pixels[i] = data[i * 4] / 255;
      }
      return { width: size, height: size, pixels };
    }
  }

  if (type === 'wolf') {
    // Howling wolf silhouette on cliff with crescent moon
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const s = size / 512;

      ctx.fillStyle = '#000000';
      ctx.beginPath();

      // Cliff base
      ctx.moveTo(cx - 200 * s, cy + 210 * s);
      ctx.lineTo(cx - 180 * s, cy + 120 * s);
      ctx.lineTo(cx - 90 * s, cy + 90 * s);
      ctx.lineTo(cx - 20 * s, cy + 85 * s); // cliff ledge
      ctx.lineTo(cx + 40 * s, cy + 60 * s); // paw perch

      // Wolf front legs
      ctx.lineTo(cx + 35 * s, cy + 20 * s);
      ctx.lineTo(cx + 45 * s, cy - 25 * s); // chest
      ctx.lineTo(cx + 60 * s, cy - 70 * s); // throat
      ctx.lineTo(cx + 75 * s, cy - 120 * s); // chin pointing up-right
      ctx.lineTo(cx + 65 * s, cy - 145 * s); // snout howling
      ctx.lineTo(cx + 40 * s, cy - 130 * s); // nose
      ctx.lineTo(cx + 25 * s, cy - 120 * s); // forehead
      ctx.lineTo(cx + 10 * s, cy - 150 * s); // ear tip
      ctx.lineTo(cx + 5 * s, cy - 110 * s); // behind ear
      ctx.lineTo(cx - 20 * s, cy - 80 * s); // neck
      ctx.lineTo(cx - 50 * s, cy - 35 * s); // back
      ctx.lineTo(cx - 80 * s, cy + 15 * s); // haunch
      ctx.lineTo(cx - 110 * s, cy + 70 * s); // tail root
      ctx.quadraticCurveTo(cx - 140 * s, cy + 110 * s, cx - 125 * s, cy + 160 * s); // tail tip
      ctx.quadraticCurveTo(cx - 110 * s, cy + 115 * s, cx - 90 * s, cy + 85 * s); // tail inner
      ctx.lineTo(cx - 60 * s, cy + 85 * s); // hind leg
      ctx.lineTo(cx - 40 * s, cy + 85 * s);
      ctx.lineTo(cx + 80 * s, cy + 140 * s);
      ctx.lineTo(cx + 180 * s, cy + 210 * s);
      ctx.closePath();
      ctx.fill();

      // Full/Crescent Moon behind wolf
      ctx.beginPath();
      ctx.arc(cx - 110 * s, cy - 100 * s, 60 * s, 0, Math.PI * 2);
      ctx.fill();

      const imgData = ctx.getImageData(0, 0, size, size);
      const data = imgData.data;
      const pixels = new Float32Array(size * size);
      for (let i = 0; i < pixels.length; i++) {
        pixels[i] = data[i * 4] / 255;
      }
      return { width: size, height: size, pixels };
    }
  }

  if (type === 'celestial') {
    // Sun and Moon with stars
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const s = size / 512;

      ctx.fillStyle = '#000000';

      // Center Crescent Moon
      ctx.beginPath();
      ctx.arc(cx, cy, 110 * s, -Math.PI * 0.45, Math.PI * 0.75, false);
      ctx.arc(cx + 35 * s, cy - 15 * s, 95 * s, Math.PI * 0.75, -Math.PI * 0.45, true);
      ctx.closePath();
      ctx.fill();

      // Radiant Stars / Sun rays around
      for (let i = 0; i < 12; i++) {
        const angle = (i * Math.PI * 2) / 12;
        const r1 = 150 * s;
        const r2 = 185 * s;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1, 10 * s, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle + 0.26) * r2, cy + Math.sin(angle + 0.26) * r2, 6 * s, 0, Math.PI * 2);
        ctx.fill();
      }

      const imgData = ctx.getImageData(0, 0, size, size);
      const data = imgData.data;
      const pixels = new Float32Array(size * size);
      for (let i = 0; i < pixels.length; i++) {
        pixels[i] = data[i * 4] / 255;
      }
      return { width: size, height: size, pixels };
    }
  }

  const pixels = new Float32Array(size * size);
  const center = size / 2;
  const radius = size * 0.35;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (type === 'circle') {
        const edge = Math.max(0, Math.min(1, radius - dist + 1));
        pixels[idx] = edge;
      } else if (type === 'mandala') {
        const angle = Math.atan2(dy, dx);
        const petal = Math.cos(angle * 8) * 0.3 + 0.7;
        const inRadius = dist < radius * petal;
        pixels[idx] = inRadius ? 1.0 : 0.0;
      } else {
        // Stripes
        pixels[idx] = Math.sin((x / size) * Math.PI * 12) > 0 ? 1 : 0;
      }
    }
  }

  return { width: size, height: size, pixels };
}

