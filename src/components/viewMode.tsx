import React from 'react';
import * as THREE from 'three';
import { Lightbulb, Scissors } from 'lucide-react';

export interface ViewMode {
  /** On: only the lamp's own light, so the ground shows the shadow. Off: outside light shows the model. */
  shadowSim: boolean;
  /** Cut the model in half with a vertical plane to show the cross section. */
  slice: boolean;
}

export const DEFAULT_VIEW_MODE: ViewMode = { shadowSim: true, slice: false };

/** Colour of the flat fill seen through the cut (the inside faces of the clipped shell). */
const SECTION_COLOR = 0xd9822b;

/** Outside light for inspecting the model: a soft sky/ground fill plus a key light. Created switched off. */
export function createEnvironmentLight(parent: THREE.Object3D, keyPosition: THREE.Vector3) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x445066, 1.1);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.copy(keyPosition);
  hemi.visible = false;
  key.visible = false;
  parent.add(hemi, key);
  return {
    hemi, key,
    set(on: boolean) { hemi.visible = on; key.visible = on; },
  };
}

/**
 * The printed part as two meshes sharing one geometry: the lit surface, and a flat-coloured copy of its
 * inside faces that only shows through the cut and reads as the cross section.
 */
export function createModelMeshes(geo: THREE.BufferGeometry, plane: THREE.Plane) {
  const lit = new THREE.MeshStandardMaterial({
    color: 0xf4f1ea, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide, clippingPlanes: [plane], clipShadows: true,
  });
  lit.shadowSide = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, lit);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const sectionMat = new THREE.MeshBasicMaterial({ color: SECTION_COLOR, side: THREE.BackSide, clippingPlanes: [plane] });
  const section = new THREE.Mesh(geo, sectionMat);
  section.visible = false;

  const group = new THREE.Group();
  group.add(mesh, section);

  return {
    group,
    setSlice(on: boolean) {
      lit.side = on ? THREE.FrontSide : THREE.DoubleSide;   // back faces are drawn by the section mesh instead
      lit.needsUpdate = true;
      section.visible = on;
    },
    dispose() { geo.dispose(); lit.dispose(); sectionMat.dispose(); },
  };
}

/** A plane that clips nothing, for when the slice is off. */
export const NO_CLIP = (): THREE.Plane => new THREE.Plane(new THREE.Vector3(0, 0, 1), 1e9);

const Btn: React.FC<{ on: boolean; onClick: () => void; label: string; title: string; children: React.ReactNode }> = ({ on, onClick, label, title, children }) => (
  <button
    type="button" onClick={onClick} aria-pressed={on} title={title}
    className={`flex items-center gap-1.5 min-h-8 px-2.5 rounded-lg border text-[11px] lg:text-xs backdrop-blur-md ${on
      ? 'bg-amber-500/25 border-amber-500/60 text-amber-100'
      : 'bg-slate-900/85 border-slate-700/60 text-slate-300 hover:bg-slate-800'}`}>
    {children}
    <span>{label}</span>
  </button>
);

export const ViewToggles: React.FC<{ mode: ViewMode; onChange: (m: ViewMode) => void }> = ({ mode, onChange }) => (
  <div className="absolute top-2 right-2 lg:top-3 lg:right-3 flex items-center gap-1.5">
    <Btn on={mode.shadowSim} onClick={() => onChange({ ...mode, shadowSim: !mode.shadowSim })} label={mode.shadowSim ? 'Shadow sim on' : 'Shadow sim off'}
      title={mode.shadowSim ? 'Turn off: light the model from outside' : 'Turn on: only the lamp light, shows the shadow'}>
      <Lightbulb className="w-3.5 h-3.5" />
    </Btn>
    <Btn on={mode.slice} onClick={() => onChange({ ...mode, slice: !mode.slice })} label="Slice"
      title="Cut the model in half to see the cross section">
      <Scissors className="w-3.5 h-3.5" />
    </Btn>
  </div>
);
