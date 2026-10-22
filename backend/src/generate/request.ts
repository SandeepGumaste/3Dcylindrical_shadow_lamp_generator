import type { GenerateRequest, Mode, Output } from '../contracts/api';
import type { GrayImage } from '../contracts/outputs';
import { DEFAULT_TEALIGHT_PARAMS, validateTealightParams } from '../geometry/tealightShade';
import { DEFAULT_BOWL_PARAMS, validateBowlParams } from '../geometry/shadowBowl';
import { DEFAULT_BOX_PARAMS, validateBoxParams } from '../geometry/box/rimProfile';
import { DEFAULT_SHADOW_WALL_PARAMS, validateShadowWallParams } from '../geometry/shadowWall/shadowWall';
import { DEFAULT_HEIGHT, validateBracketParams } from '../geometry/lightSource/bracket';

export const GRAY_SIZE = 512;
const GRAY_BYTES = GRAY_SIZE * GRAY_SIZE * 4;

/** An error the caller caused; routes turn it into a JSON response with this status. */
export class RequestError extends Error {
  constructor(public status: 400 | 413 | 422, message: string, public errors: string[] = [message]) {
    super(message);
  }
}

export interface ParsedRequest {
  mode: Mode;
  image?: GrayImage;
  panel?: GrayImage;
  params: any;
  output: Output;
  fit: boolean;
}

export function encodeGray(img: GrayImage): string {
  return Buffer.from(img.pixels.buffer, img.pixels.byteOffset, img.pixels.byteLength).toString('base64');
}

export function decodeGray(b64: string): GrayImage {
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length !== GRAY_BYTES) throw new RequestError(400, `The image must be ${GRAY_SIZE} x ${GRAY_SIZE} 32-bit values.`);
  const pixels = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i];
    if (!(v >= 0 && v <= 1)) throw new RequestError(400, 'The image has values outside 0 to 1.');
  }
  return { width: GRAY_SIZE, height: GRAY_SIZE, pixels };
}

interface ModeSpec {
  defaults: Record<string, unknown>;
  extra?: string[];
  validate: (p: any) => string[];
  needsImage: boolean;
}
const MODES: Record<Mode, ModeSpec> = {
  tealight: { defaults: DEFAULT_TEALIGHT_PARAMS as any, extra: ['ribAngles'], validate: validateTealightParams, needsImage: true },
  bowl: { defaults: DEFAULT_BOWL_PARAMS as any, validate: validateBowlParams, needsImage: true },
  box: { defaults: DEFAULT_BOX_PARAMS as any, validate: validateBoxParams, needsImage: true },
  wall: { defaults: DEFAULT_SHADOW_WALL_PARAMS as any, validate: validateShadowWallParams, needsImage: true },
  light: { defaults: { height: DEFAULT_HEIGHT }, validate: validateBracketParams, needsImage: false },
};

const fail = (status: 400 | 422, ...errors: string[]) => ({ ok: false as const, status, errors });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function mergeParams(spec: ModeSpec, given: unknown): { params: any } | { error: string } {
  if (given !== undefined && !isObject(given)) return { error: 'params must be an object' };
  const out: Record<string, unknown> = { ...spec.defaults };
  const src = given ?? {};
  for (const key of Object.keys(spec.defaults)) {
    if (!Object.hasOwn(src, key)) continue;
    const v = (src as Record<string, unknown>)[key];
    const want = typeof spec.defaults[key];
    if (typeof v !== want) return { error: `Setting "${key}" must be a ${want}.` };
    if (typeof v === 'number' && !Number.isFinite(v)) return { error: `Setting "${key}" must be a finite number.` };
    if (typeof v === 'string' && v.length > 32) return { error: `Setting "${key}" is too long.` };
    out[key] = v;
  }
  for (const key of spec.extra ?? []) {
    if (!Object.hasOwn(src, key)) continue;
    const v = (src as Record<string, unknown>)[key];
    if (!Array.isArray(v) || v.length > 64 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) return { error: `Setting "${key}" must be a list of finite numbers.` };
    out[key] = v;
  }
  return { params: out };
}

function parseOutput(o: unknown): Output | null {
  if (o === 'preview' || o === 'stl' || o === 'svg' || o === 'zip') return o;
  if (isObject(o) && typeof o.part === 'string' && /^[a-z0-9-]{1,40}$/.test(o.part)) return { part: o.part };
  return null;
}

function parseImage(ref: unknown, label: string): GrayImage {
  if (!isObject(ref) || ref.kind !== 'gray' || ref.width !== GRAY_SIZE || ref.height !== GRAY_SIZE || typeof ref.pixels !== 'string') {
    throw new RequestError(400, `${label} must be a ${GRAY_SIZE} x ${GRAY_SIZE} gray image.`);
  }
  return decodeGray(ref.pixels);
}

export function parseRequest(raw: unknown): { ok: true; req: ParsedRequest } | { ok: false; status: 400 | 422; errors: string[] } {
  if (!isObject(raw)) return fail(400, 'The request must be a JSON object.');
  const mode = raw.mode as Mode;
  if (typeof mode !== 'string' || !Object.hasOwn(MODES, mode)) return fail(400, 'Unknown mode.');
  const spec = MODES[mode];
  const output = parseOutput(raw.output);
  if (!output) return fail(400, 'Unknown output.');
  if (raw.fit !== undefined && typeof raw.fit !== 'boolean') return fail(400, 'fit must be true or false.');

  const merged = mergeParams(spec, raw.params);
  if ('error' in merged) return fail(400, merged.error);

  let image: GrayImage | undefined;
  let panel: GrayImage | undefined;
  try {
    if (spec.needsImage) {
      if (raw.image === undefined) return fail(400, 'An image is required.');
      image = parseImage(raw.image, 'image');
      if (mode === 'box' && raw.panel !== undefined) panel = parseImage(raw.panel, 'panel');
    }
  } catch (e) {
    if (e instanceof RequestError) return fail(400, ...e.errors);
    throw e;
  }

  const errors = spec.validate(merged.params);
  if (errors.length) return fail(422, ...errors);
  return { ok: true, req: { mode, image, panel, params: merged.params, output, fit: raw.fit === true } };
}
