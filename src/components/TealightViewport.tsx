import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DEFAULT_VIEW_MODE, NO_CLIP, ViewMode, ViewToggles, createEnvironmentLight, createModel } from './viewMode';

interface Props {
  positions: Float32Array | null;
  indices: Uint32Array | null;
  /** Index count where snap-off supports start in `indices`; they are drawn in another colour. */
  supportFrom?: number;
  /** Light height and overall height in mm (z-up model coordinates). */
  lightZ: number;
  topZ: number;
  groundRadius: number;
  triangleCount: number;
  busy: boolean;
  /** Inputs changed since the model on screen was generated. */
  stale?: boolean;
  onGenerate?: () => void;
}

/**
 * Lit preview: the model (z-up from the generators) stands on a ground plane lit by a shadow-casting
 * point light at the flame / LED position. The room is otherwise dark, so what lands on the
 * ground is the shadow the printed part would throw.
 */
export const TealightViewport: React.FC<Props> = ({ positions, indices, lightZ, topZ, groundRadius, triangleCount, busy, stale, onGenerate, supportFrom }) => {
  const host = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
    pivot: THREE.Group; light: THREE.PointLight; bulb: THREE.Mesh; ground: THREE.Mesh; model: ReturnType<typeof createModel> | null;
    env: ReturnType<typeof createEnvironmentLight>; plane: THREE.Plane;
  } | null>(null);
  const [mode, setMode] = useState<ViewMode>(DEFAULT_VIEW_MODE);

  useEffect(() => {
    const el = host.current!;
    const w = el.clientWidth || 600, h = el.clientHeight || 400;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060a);

    const camera = new THREE.PerspectiveCamera(40, w / h, 1, 5000);
    camera.position.set(120, 150, 220);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.localClippingEnabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap; // PCF honours shadow.radius for soft edges
    el.innerHTML = '';
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 20, 0);
    controls.maxDistance = 1500;

    scene.add(new THREE.AmbientLight(0xffffff, 0.06));

    // z-up model space -> three's y-up: one proper rotation about X.
    const pivot = new THREE.Group();
    pivot.rotation.x = -Math.PI / 2;
    scene.add(pivot);

    const light = new THREE.PointLight(0xffc477, 3.2, 0, 0);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.radius = 2;
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.15;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 900;
    pivot.add(light);

    const env = createEnvironmentLight(scene, new THREE.Vector3(200, 320, 260));
    const plane = NO_CLIP();

    const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffe6a8 }));
    pivot.add(bulb);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1, 128),
      new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.95, metalness: 0 })
    );
    ground.receiveShadow = true;
    pivot.add(ground);

    let raf = 0;
    const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
    loop();

    const onResize = () => {
      const cw = el.clientWidth, ch = el.clientHeight;
      if (!cw || !ch) return;
      camera.aspect = cw / ch; camera.updateProjectionMatrix(); renderer.setSize(cw, ch);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    stateRef.current = { scene, camera, controls, pivot, light, bulb, ground, model: null, env, plane };
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose();
      el.innerHTML = '';
      stateRef.current = null;
    };
  }, []);

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.light.position.set(0, 0, lightZ);
    s.bulb.position.set(0, 0, lightZ);
    const R = Math.max(groundRadius * 1.25, 60);
    s.ground.scale.set(R, R, 1);
    s.controls.target.set(0, topZ / 2, 0);
  }, [lightZ, topZ, groundRadius]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    if (s.model) {
      s.pivot.remove(s.model.group);
      s.model.dispose();
      s.model = null;
    }
    if (!positions || !indices || !positions.length) return;
    const model = createModel(positions, indices, supportFrom, s.plane);
    model.setSlice(mode.slice);
    s.pivot.add(model.group);
    s.model = model;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, indices, supportFrom]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.light.visible = mode.shadowSim;
    s.bulb.visible = mode.shadowSim;
    s.ground.visible = mode.shadowSim;
    s.env.set(!mode.shadowSim);
    // Model y = 0 is world z = 0 (the pivot turns model y into -z); keep the far half so the cut faces the camera.
    if (mode.slice) { s.plane.normal.set(0, 0, -1); s.plane.constant = 0; } else { s.plane.normal.set(0, 0, 1); s.plane.constant = 1e9; }
    s.model?.setSlice(mode.slice);
  }, [mode]);

  return (
    <div className="relative w-full h-full lg:min-h-[380px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
      <div ref={host} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
      <div className="absolute top-2 left-2 lg:top-3 lg:left-3 max-w-[70%] bg-slate-900/85 backdrop-blur-md px-2.5 py-1 lg:px-3 lg:py-1.5 rounded-lg border border-slate-700/60 text-[11px] lg:text-xs text-slate-300 pointer-events-none">
        <span className="max-lg:hidden">lit preview · orbit to inspect<span className="text-slate-500"> | </span></span>
        <span className="text-slate-400">{triangleCount > 0 ? `${triangleCount.toLocaleString()} triangles` : 'awaiting generation'}</span>
      </div>
      {stale && !busy && (
        <div role="status" className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-md flex items-center gap-3 bg-amber-950/90 backdrop-blur-md px-3 py-2 rounded-xl border border-amber-500/50 shadow-xl text-xs text-amber-200">
          <span className="flex-1">Settings changed. This model is out of date; generate it again.</span>
          {onGenerate && (
            <button onClick={onGenerate} className="shrink-0 min-h-9 px-3 rounded-lg bg-amber-500/25 border border-amber-500/50 text-amber-100 hover:bg-amber-500/35">Generate</button>
          )}
        </div>
      )}
      <ViewToggles mode={mode} onChange={setMode} />
      {busy && (
        <div className="absolute top-12 right-2 lg:top-14 lg:right-3 flex items-center gap-2 bg-slate-900/85 px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs text-amber-300">
          <span className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" /> generating…
        </div>
      )}
    </div>
  );
};
