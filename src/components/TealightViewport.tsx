import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface Props {
  positions: Float32Array | null;
  indices: Uint32Array | null;
  /** Light height and overall height in mm (z-up model coordinates). */
  lightZ: number;
  topZ: number;
  groundRadius: number;
  triangleCount: number;
  busy: boolean;
}

/**
 * Lit preview: the model (z-up from the generators) stands on a ground plane lit by a shadow-casting
 * point light at the flame / LED position. The room is otherwise dark, so what lands on the
 * ground is the shadow the printed part would throw.
 */
export const TealightViewport: React.FC<Props> = ({ positions, indices, lightZ, topZ, groundRadius, triangleCount, busy }) => {
  const host = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
    pivot: THREE.Group; light: THREE.PointLight; bulb: THREE.Mesh; ground: THREE.Mesh; model: THREE.Mesh | null;
  } | null>(null);

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

    stateRef.current = { scene, camera, controls, pivot, light, bulb, ground, model: null };
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
      s.pivot.remove(s.model);
      s.model.geometry.dispose();
      (s.model.material as THREE.Material).dispose();
      s.model = null;
    }
    if (!positions || !indices || !positions.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    s.pivot.add(mesh);
    s.model = mesh;
  }, [positions, indices]);

  return (
    <div className="relative w-full h-full min-h-[380px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
      <div ref={host} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
      <div className="absolute top-3 left-3 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs text-slate-300 pointer-events-none">
        lit preview · orbit to inspect
        <span className="text-slate-500"> | </span>
        <span className="text-slate-400">{triangleCount > 0 ? `${triangleCount.toLocaleString()} triangles` : 'awaiting generation'}</span>
      </div>
      {busy && (
        <div className="absolute top-3 right-3 flex items-center gap-2 bg-slate-900/85 px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs text-amber-300">
          <span className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" /> generating…
        </div>
      )}
    </div>
  );
};
