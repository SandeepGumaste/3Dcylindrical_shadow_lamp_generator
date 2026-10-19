import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface Props {
  preview: { positions: Float32Array; indices: Uint32Array } | null;
  /** LED position in the tray frame (z up from the mounting wall). */
  light: { x: number; y: number; z: number } | null;
  /** Width of the shadow image frame on the wall, mm; sizes the wall plane. */
  shadowSize: number;
  busy: boolean;
  stale?: boolean;
  onGenerate?: () => void;
}

/**
 * Lit preview of the box hanging on a wall. Model space is used directly (x right, y up, z towards
 * the viewer, the wall is the plane z = 0), so the shadow reads the same way round as on a real wall.
 */
export const BoxViewport: React.FC<Props> = ({ preview, light, shadowSize, busy, stale, onGenerate }) => {
  const host = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    scene: THREE.Scene; controls: OrbitControls; lamp: THREE.PointLight; bulb: THREE.Mesh; wall: THREE.Mesh; model: THREE.Mesh | null;
  } | null>(null);

  useEffect(() => {
    const el = host.current!;
    const w = el.clientWidth || 600, h = el.clientHeight || 400;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060a);
    const camera = new THREE.PerspectiveCamera(40, w / h, 1, 8000);
    camera.position.set(-120, -100, 950);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    el.innerHTML = '';
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(60, 20, 0);
    controls.maxDistance = 3000;

    scene.add(new THREE.AmbientLight(0xffffff, 0.06));
    const lamp = new THREE.PointLight(0xffc477, 3.2, 0, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.radius = 2;
    lamp.shadow.bias = -0.0004;
    lamp.shadow.normalBias = 0.15;
    lamp.shadow.camera.near = 0.5;
    lamp.shadow.camera.far = 4000;
    scene.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffe6a8 }));
    scene.add(bulb);

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.95, metalness: 0 }));
    wall.receiveShadow = true;
    scene.add(wall);

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
    stateRef.current = { scene, controls, lamp, bulb, wall, model: null };
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose();
      el.innerHTML = '';
      stateRef.current = null;
    };
  }, []);

  useEffect(() => {
    const s = stateRef.current;
    if (!s || !light) return;
    s.lamp.position.set(light.x, light.y, light.z);
    s.bulb.position.set(light.x, light.y, light.z);
    const size = Math.max(shadowSize * 1.6, 600);
    s.wall.scale.set(size, size, 1);
    s.wall.position.set(light.x, light.y, 0);
  }, [light, shadowSize]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    if (s.model) {
      s.scene.remove(s.model);
      s.model.geometry.dispose();
      (s.model.material as THREE.Material).dispose();
      s.model = null;
    }
    if (!preview || !preview.positions.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(preview.positions, 3));
    geo.setIndex(new THREE.BufferAttribute(preview.indices, 1));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    s.scene.add(mesh);
    s.model = mesh;
  }, [preview]);

  return (
    <div className="relative w-full h-full lg:min-h-[380px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
      <div ref={host} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
      <div className="absolute top-2 left-2 lg:top-3 lg:left-3 max-w-[70%] bg-slate-900/85 backdrop-blur-md px-2.5 py-1 lg:px-3 lg:py-1.5 rounded-lg border border-slate-700/60 text-[11px] lg:text-xs text-slate-300 pointer-events-none">
        <span className="max-lg:hidden">box on a wall · orbit to inspect<span className="text-slate-500"> | </span></span>
        <span className="text-slate-400">{preview ? 'lit preview' : 'awaiting generation'}</span>
      </div>
      {stale && !busy && (
        <div role="status" className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-md flex items-center gap-3 bg-amber-950/90 backdrop-blur-md px-3 py-2 rounded-xl border border-amber-500/50 shadow-xl text-xs text-amber-200">
          <span className="flex-1">Settings changed. This model is out of date; generate it again.</span>
          {onGenerate && (
            <button onClick={onGenerate} className="shrink-0 min-h-9 px-3 rounded-lg bg-amber-500/25 border border-amber-500/50 text-amber-100 hover:bg-amber-500/35">Generate</button>
          )}
        </div>
      )}
      {busy && (
        <div className="absolute top-2 right-2 lg:top-3 lg:right-3 flex items-center gap-2 bg-slate-900/85 px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs text-amber-300">
          <span className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" /> generating…
        </div>
      )}
    </div>
  );
};
