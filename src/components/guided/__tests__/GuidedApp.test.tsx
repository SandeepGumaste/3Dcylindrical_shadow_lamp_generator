import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GuidedApp } from '../GuidedApp';
import { DEFAULT_TEALIGHT_PARAMS } from '../../../geometry/tealightShade';
import type { TealightController } from '../../../hooks/useTealightGenerator';

const noop = () => {};
const result = {
  positions: new Float32Array(0), indices: new Uint32Array(0), triangleCount: 1234, ms: 321, warnings: ['1 feature(s) were dropped.'],
  check: { watertight: true, errors: [] as string[] }, mapSvg: '<svg/>', comparison: null, ribSuggestion: undefined, lightZ: 25, topZ: 60, groundRadius: 150,
};
const controller = (o: Partial<TealightController> = {}): TealightController => ({
  mode: 'tealight', tParams: { ...DEFAULT_TEALIGHT_PARAMS }, bParams: {}, setTealight: noop, setBowl: noop,
  sampleId: 'hanuman', selectSample: noop, upload: noop, imageName: 'hanuman', image: null, result: null, stale: false, busy: false,
  errors: [], runError: null, generate: noop, reset: noop, download: noop, downloadMap: noop, ...o,
} as unknown as TealightController);
const render = (c: TealightController, startStep: number) => renderToStaticMarkup(<GuidedApp c={c} onSwitch={noop} startStep={startStep} />);
const button = (html: string, cls: string) => html.match(new RegExp(`<button[^>]*class="${cls}"[^>]*>[^<]*`))?.[0] ?? '';

describe('guided view states', () => {
  it('shows a settings error once, as an alert, and blocks Generate', () => {
    const html = render(controller({ errors: ['Flame Height must be below Height.'], result: result as never }), 3);
    expect(html.match(/Flame Height must be below Height\./g)).toHaveLength(1);
    expect(html.match(/role="alert"/g)).toHaveLength(1);
    expect(button(html, 'big')).toContain('disabled');
    expect(button(html, 'next')).toContain('disabled');
  });

  it('shows the error in every step, in the part that stays on screen', () => {
    for (const step of [0, 1, 2, 3]) {
      const html = render(controller({ errors: ['Height must be above 10 mm.'] }), step);
      expect(html, `step ${step}`).toContain('Height must be above 10 mm.');
      expect(html.indexOf('Height must be above 10 mm.'), `step ${step}`).toBeGreaterThan(html.indexOf('class="foot"'));
    }
  });

  it('hides the watertight status while settings are invalid', () => {
    const html = render(controller({ errors: ['Height must be above 10 mm.'], result: result as never }), 3);
    expect(html).not.toContain('Watertight');
  });

  it('marks the status as the previous model when settings have changed, and says "preview", not "left"', () => {
    const html = render(controller({ result: result as never, stale: true }), 3);
    expect(html).toContain('Watertight');
    expect(html).toContain('previous model');
    expect(html).toContain('the preview');
    expect(html).not.toContain('on the left');
    expect(html).toContain('Regenerate 3D model');
  });

  it('turns the last-step button into a disabled "Generated" once the model is current', () => {
    const current = button(render(controller({ result: result as never }), 3), 'next');
    expect(current).toContain('Generated');
    expect(current).toContain('disabled');
    const stale = button(render(controller({ result: result as never, stale: true }), 3), 'next');
    expect(stale).toContain('Regenerate 3D model');
    expect(stale).not.toContain('disabled');
    const none = button(render(controller(), 3), 'next');
    expect(none).toContain('Generate 3D model');
    expect(none).not.toContain('disabled');
  });

  it('does not announce the whole card as a live region', () => {
    expect(render(controller(), 0)).not.toContain('aria-live');
  });

  it('gives the step heading a focus target', () => {
    expect(render(controller(), 1)).toMatch(/<h2[^>]*tabindex="-1"/);
  });
});
