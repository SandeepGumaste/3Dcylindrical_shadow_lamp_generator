import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ShadowComparison } from '../geometry/tealightShade';

/**
 * Exact (pure geometry, not the shadow map) check: the generated wall field forward-projected onto
 * the table, next to the thresholded input. Third pane shows disagreement.
 */
export const TableInset: React.FC<{ comparison: ShadowComparison | null }> = ({ comparison }) => {
  const [open, setOpen] = useState(false);
  const refs = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];

  useEffect(() => {
    if (!comparison) return;
    const { size, projected, target, valid } = comparison;
    const draw = (cv: HTMLCanvasElement | null, px: (i: number) => [number, number, number]) => {
      if (!cv) return;
      cv.width = size; cv.height = size;
      const ctx = cv.getContext('2d')!;
      const img = ctx.createImageData(size, size);
      for (let i = 0; i < size * size; i++) {
        const [r, g, b] = px(i);
        img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    };
    const lit: [number, number, number] = [255, 214, 140];
    const dark: [number, number, number] = [18, 20, 28];
    draw(refs[0].current, (i) => (target[i] ? lit : dark));
    draw(refs[1].current, (i) => (projected[i] ? lit : dark));
    draw(refs[2].current, (i) => {
      if (!valid[i]) return [40, 44, 56];
      if (projected[i] === target[i]) return [30, 60, 40];
      return projected[i] ? [90, 160, 255] : [255, 90, 90]; // blue: extra light, red: missing light
    });
  }, [comparison, open]);

  const cell = (i: number, label: string) => (
    <figure className="flex flex-col gap-1 items-center min-w-0">
      <canvas ref={refs[i]} className="w-full aspect-square rounded-lg border border-slate-700 bg-slate-950 [image-rendering:pixelated]" />
      <figcaption className="text-[11px] text-slate-400">{label}</figcaption>
    </figure>
  );

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60">
      <button
        type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 p-3 text-left"
      >
        <span className="flex items-center gap-1.5">
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
          <h3 className="text-xs font-semibold text-slate-200">Table shadow check</h3>
        </span>
        <span className="text-[11px] text-slate-400">
          {comparison ? `IoU ${(comparison.iou * 100).toFixed(1)}% (annulus, ribs excluded)` : 'no data'}
        </span>
      </button>
      {open && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3 px-3 pb-3">
          {cell(0, 'input')}
          {cell(1, 'projected')}
          {cell(2, 'difference')}
        </div>
      )}
    </div>
  );
};
