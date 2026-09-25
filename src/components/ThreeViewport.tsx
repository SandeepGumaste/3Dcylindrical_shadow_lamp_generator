import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LightConfig, LampConfig, GrayImage } from '../types';
import { RotateCw, Eye, Grid, Flame, Sun, Camera, Sparkles } from 'lucide-react';

interface ThreeViewportProps {
  positions: Float32Array | null;
  normals: Float32Array | null;
  indices: Uint32Array | null;
  triangleCount: number;
  lamp: LampConfig;
  light: LightConfig;
  simulatedShadow?: GrayImage | null;
  onLightChange?: (pos: { x: number; y: number; z: number }) => void;
  isGenerating?: boolean;
}

export const ThreeViewport: React.FC<ThreeViewportProps> = ({
  positions,
  normals,
  indices,
  triangleCount,
  lamp,
  light,
  simulatedShadow,
  onLightChange,
  isGenerating = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const lampMeshRef = useRef<THREE.Mesh | null>(null);
  const ledMarkerRef = useRef<THREE.Group | null>(null);
  const flameMeshRef = useRef<THREE.Mesh | null>(null);
  const screenMeshRef = useRef<THREE.Mesh | null>(null);
  const tableDiskMeshRef = useRef<THREE.Mesh | null>(null);
  const pointLightRef = useRef<THREE.PointLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const dirLight1Ref = useRef<THREE.DirectionalLight | null>(null);
  const dirLight2Ref = useRef<THREE.DirectionalLight | null>(null);

  const [wireframe, setWireframe] = useState(false);
  const [materialType, setMaterialType] = useState<'solid' | 'translucent' | 'clay'>('solid');
  const [lightingMode, setLightingMode] = useState<'candle' | 'studio'>('candle');
  const [showProjectionWall, setShowProjectionWall] = useState(true);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 500;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0c12);
    sceneRef.current = scene;

    // Camera: default to perspective angle looking at both lamp and tabletop shadow
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 3000);
    camera.position.set(140, 190, 240);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 1200;
    controls.minDistance = 20;
    controls.target.set(0, lamp.height / 2, 0);
    controlsRef.current = controls;

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.18);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    // Directional studio lights
    const dirLight1 = new THREE.DirectionalLight(0xfff6eb, 0.25);
    dirLight1.position.set(200, 300, 200);
    scene.add(dirLight1);
    dirLight1Ref.current = dirLight1;

    const dirLight2 = new THREE.DirectionalLight(0x7090b0, 0.15);
    dirLight2.position.set(-200, 150, -200);
    scene.add(dirLight2);
    dirLight2Ref.current = dirLight2;

    // Virtual Internal Candle / LED Point Light
    const pointLight = new THREE.PointLight(0xffb74d, 5.0, 600, 1.2);
    pointLight.position.set(light.position.x, light.position.y, light.position.z);
    pointLight.castShadow = true;
    pointLight.shadow.mapSize.width = 1024;
    pointLight.shadow.mapSize.height = 1024;
    pointLight.shadow.bias = -0.001;
    scene.add(pointLight);
    pointLightRef.current = pointLight;

    // LED / Candle Flame Marker
    const ledGroup = new THREE.Group();
    // Inner bright core
    const flameGeom = new THREE.ConeGeometry(2.5, 6, 16);
    flameGeom.rotateX(Math.PI);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xfff0a8 });
    const flameMesh = new THREE.Mesh(flameGeom, flameMat);
    flameMesh.position.y = 1;
    ledGroup.add(flameMesh);
    flameMeshRef.current = flameMesh;

    // Outer warm flame halo
    const haloGeom = new THREE.SphereGeometry(4.5, 16, 16);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.45,
    });
    ledGroup.add(new THREE.Mesh(haloGeom, haloMat));

    // Outer glow aura
    const auraGeom = new THREE.SphereGeometry(10, 16, 16);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xffaa22,
      transparent: true,
      opacity: 0.15,
      wireframe: true,
    });
    ledGroup.add(new THREE.Mesh(auraGeom, auraMat));

    ledGroup.position.set(light.position.x, light.position.y, light.position.z);
    scene.add(ledGroup);
    ledMarkerRef.current = ledGroup;

    // Tabletop Radial Surface Plane (for 360° tabletop candle shadow projection)
    const tableRadius = light.tableRadius || 240;
    const tableDiskGeom = new THREE.CircleGeometry(tableRadius, 128);
    const tableDiskMat = new THREE.MeshStandardMaterial({
      color: 0x11141c,
      roughness: 0.85,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    const tableDiskMesh = new THREE.Mesh(tableDiskGeom, tableDiskMat);
    tableDiskMesh.rotation.x = -Math.PI / 2;
    tableDiskMesh.position.y = -0.05;
    tableDiskMesh.receiveShadow = true;
    scene.add(tableDiskMesh);
    tableDiskMeshRef.current = tableDiskMesh;

    // Outer ambient floor grid ring
    const gridHelper = new THREE.GridHelper(tableRadius * 2.8, 56, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -0.15;
    scene.add(gridHelper);

    // Projection Wall / Screen Behind Lamp (+Z)
    const screenGeom = new THREE.PlaneGeometry(
      light.projectionWidth * 1.25,
      light.projectionHeight * 1.25
    );
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x181c26,
      roughness: 0.8,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const screenMesh = new THREE.Mesh(screenGeom, screenMat);
    screenMesh.position.set(0, light.projectionHeight / 2, light.projectionDistance);
    screenMesh.receiveShadow = true;
    scene.add(screenMesh);
    screenMeshRef.current = screenMesh;

    // Animation Loop with subtle realistic candle flicker
    let animId = 0;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Soft candle flicker in candle mode
      if (pointLightRef.current && flameMeshRef.current) {
        if (lightingMode === 'candle') {
          const flicker = Math.sin(elapsed * 7) * 0.08 + Math.cos(elapsed * 13) * 0.05;
          pointLightRef.current.intensity = 4.8 + flicker * 2;
          flameMeshRef.current.scale.set(1 + flicker * 0.4, 1 + flicker * 0.6, 1 + flicker * 0.4);
        } else {
          pointLightRef.current.intensity = 2.5;
          flameMeshRef.current.scale.set(1, 1, 1);
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize observer
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      container.innerHTML = '';
    };
  }, []);

  // Update lighting mode (Candlelight vs Studio)
  useEffect(() => {
    if (!ambientLightRef.current || !dirLight1Ref.current || !dirLight2Ref.current || !sceneRef.current) return;

    if (lightingMode === 'candle') {
      sceneRef.current.background = new THREE.Color(0x08090f);
      ambientLightRef.current.intensity = 0.12;
      dirLight1Ref.current.intensity = 0.15;
      dirLight2Ref.current.intensity = 0.1;
      if (pointLightRef.current) {
        pointLightRef.current.color.setHex(0xffaa33);
      }
    } else {
      sceneRef.current.background = new THREE.Color(0x111624);
      ambientLightRef.current.intensity = 0.6;
      dirLight1Ref.current.intensity = 0.85;
      dirLight2Ref.current.intensity = 0.4;
      if (pointLightRef.current) {
        pointLightRef.current.color.setHex(0xfff8ee);
      }
    }
  }, [lightingMode]);

  // Update LED position and Projection Screen position when props change
  useEffect(() => {
    if (pointLightRef.current) {
      pointLightRef.current.position.set(light.position.x, light.position.y, light.position.z);
    }
    if (ledMarkerRef.current) {
      ledMarkerRef.current.position.set(light.position.x, light.position.y, light.position.z);
    }
    if (screenMeshRef.current) {
      screenMeshRef.current.position.set(0, light.projectionHeight / 2, light.projectionDistance);
      screenMeshRef.current.visible = light.target === 'vertical_wall' && showProjectionWall;
    }
    if (tableDiskMeshRef.current) {
      tableDiskMeshRef.current.visible = light.target === 'tabletop';
    }
  }, [light, showProjectionWall]);

  // Render optical projected shadow texture directly onto the 3D tabletop / wall
  useEffect(() => {
    if (!simulatedShadow) return;

    const { width, height, pixels } = simulatedShadow;
    const isTabletop = light.target === 'tabletop';
    const lampRadius = lamp.diameter / 2;
    const tableRadius = light.tableRadius || 220;

    // Create high-res offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let py = 0; py < height; py++) {
      const v = (py + 0.5) / height;
      const z = (v - 0.5) * 2 * tableRadius;

      for (let px = 0; px < width; px++) {
        const u = (px + 0.5) / width;
        const x = (u - 0.5) * 2 * tableRadius;
        const r = Math.sqrt(x * x + z * z);
        const idx = py * width + px;
        const pIdx = idx * 4;

        if (isTabletop) {
          if (r > tableRadius) {
            // Outside table perimeter: dark slate
            data[pIdx] = 10;
            data[pIdx + 1] = 12;
            data[pIdx + 2] = 18;
            data[pIdx + 3] = 255;
            continue;
          }

          if (r <= lampRadius) {
            // Inside lamp base: dark occluded shadow
            data[pIdx] = 7;
            data[pIdx + 1] = 8;
            data[pIdx + 2] = 12;
            data[pIdx + 3] = 255;
            continue;
          }

          // Light intensity from simulation (0 = shadow, 1 = illuminated)
          const simVal = Math.max(0, Math.min(1, pixels[idx]));

          // Realistic inverse distance optical falloff from candle
          const distNorm = (r - lampRadius) / (tableRadius * 0.4);
          const falloff = 1 / (1 + Math.pow(Math.max(0, distNorm), 1.15));

          if (simVal > 0.02) {
            // Glowing warm candlelight
            const lightLevel = simVal * falloff;
            const red = Math.round(255 * Math.min(1, 0.4 + 0.6 * lightLevel));
            const green = Math.round(195 * Math.min(1, 0.2 + 0.8 * lightLevel));
            const blue = Math.round(85 * Math.min(1, 0.1 + 0.9 * lightLevel));

            data[pIdx] = red;
            data[pIdx + 1] = green;
            data[pIdx + 2] = blue;
            data[pIdx + 3] = 255;
          } else {
            // Dark silhouette shadow (solid plastic blocking light)
            data[pIdx] = 12;
            data[pIdx + 1] = 14;
            data[pIdx + 2] = 20;
            data[pIdx + 3] = 255;
          }
        } else {
          // Vertical Wall Mode
          const simVal = Math.max(0, Math.min(1, pixels[idx]));
          const red = Math.round(255 * (0.1 + 0.9 * simVal));
          const green = Math.round(200 * (0.1 + 0.9 * simVal));
          const blue = Math.round(110 * (0.1 + 0.9 * simVal));

          data[pIdx] = red;
          data[pIdx + 1] = green;
          data[pIdx + 2] = blue;
          data[pIdx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    if (isTabletop && tableDiskMeshRef.current) {
      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        emissiveMap: texture,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: lightingMode === 'candle' ? 0.75 : 0.35,
        roughness: 0.8,
        metalness: 0.05,
        side: THREE.DoubleSide,
      });
      tableDiskMeshRef.current.material = mat;
    } else if (!isTabletop && screenMeshRef.current) {
      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        emissiveMap: texture,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.7,
        roughness: 0.7,
        side: THREE.DoubleSide,
      });
      screenMeshRef.current.material = mat;
    }
  }, [simulatedShadow, light.target, light.tableRadius, lamp.diameter, lightingMode]);

  // Update Lamp Mesh when geometry buffers change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove existing lamp mesh
    if (lampMeshRef.current) {
      scene.remove(lampMeshRef.current);
      lampMeshRef.current.geometry.dispose();
      if (Array.isArray(lampMeshRef.current.material)) {
        lampMeshRef.current.material.forEach((m) => m.dispose());
      } else {
        lampMeshRef.current.material.dispose();
      }
      lampMeshRef.current = null;
    }

    if (!positions || !normals || !indices || positions.length === 0) {
      return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    // Material options: Realistic 3D print filament (Ivory White PLA, Terracotta, or Translucent)
    let material: THREE.Material;

    if (materialType === 'translucent') {
      material = new THREE.MeshPhysicalMaterial({
        color: 0xfdfcf7,
        roughness: 0.3,
        transmission: 0.55,
        thickness: lamp.wallThickness,
        wireframe,
        side: THREE.DoubleSide,
      });
    } else if (materialType === 'clay') {
      material = new THREE.MeshStandardMaterial({
        color: 0xd97736,
        roughness: 0.75,
        metalness: 0.05,
        wireframe,
        side: THREE.DoubleSide,
      });
    } else {
      // Solid White Silk PLA
      material = new THREE.MeshStandardMaterial({
        color: 0xf4f5f7,
        roughness: 0.32,
        metalness: 0.1,
        wireframe,
        side: THREE.DoubleSide,
      });
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    lampMeshRef.current = mesh;

    // Adjust camera target to center of lamp
    if (controlsRef.current) {
      controlsRef.current.target.set(0, lamp.height / 2, 0);
    }
  }, [positions, normals, indices, wireframe, materialType, lamp.height, lamp.wallThickness]);

  const resetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.set(140, 190, 240);
    controlsRef.current.target.set(0, lamp.height / 2, 0);
    controlsRef.current.update();
  };

  const setViewAngle = (view: 'front' | 'top' | 'side' | 'perspective') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const h = lamp.height / 2;
    if (view === 'top') {
      // Top-Down Photo Match View
      cameraRef.current.position.set(0, 340, 0.1);
    } else if (view === 'front') {
      cameraRef.current.position.set(0, h, 280);
    } else if (view === 'side') {
      cameraRef.current.position.set(280, h, 0);
    } else {
      cameraRef.current.position.set(140, 190, 240);
    }
    controlsRef.current.target.set(0, h, 0);
    controlsRef.current.update();
  };

  return (
    <div className="relative w-full h-full min-h-[440px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col">
      {/* 3D Canvas Container */}
      <div ref={containerRef} className="w-full flex-1 cursor-grab active:cursor-grabbing" />

      {/* Floating Viewport Controls Header */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs text-slate-300 shadow-lg">
          <span className="flex items-center gap-1.5 font-medium text-slate-200">
            <span className={`w-2 h-2 rounded-full ${lightingMode === 'candle' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
            3D Shadow Lamp Viewport
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">
            {triangleCount > 0 ? `${triangleCount.toLocaleString()} Triangles` : 'Awaiting Generation'}
          </span>
        </div>

        {/* Quick View and Lighting Toggles */}
        <div className="flex items-center gap-1.5 pointer-events-auto bg-slate-900/85 backdrop-blur-md p-1 rounded-lg border border-slate-700/60 shadow-lg">
          {/* Lighting Mode: Candlelight (Photo Match) vs Studio PLA */}
          <button
            onClick={() => setLightingMode(lightingMode === 'candle' ? 'studio' : 'candle')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
              lightingMode === 'candle'
                ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/20'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
            title="Toggle between Candlelight (Photo Match) and Studio Inspection lighting"
          >
            {lightingMode === 'candle' ? (
              <>
                <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span>Candle Glow (Photo)</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-300" />
                <span>Studio PLA</span>
              </>
            )}
          </button>

          <span className="w-px h-4 bg-slate-700 mx-0.5" />

          {/* Filament Material */}
          <button
            onClick={() => setMaterialType('solid')}
            className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
              materialType === 'solid'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="White Silk PLA Filament"
          >
            PLA
          </button>
          <button
            onClick={() => setMaterialType('translucent')}
            className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
              materialType === 'translucent'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Translucent Filament"
          >
            Glow
          </button>
          <button
            onClick={() => setWireframe(!wireframe)}
            className={`p-1.5 text-xs rounded transition-colors ${
              wireframe
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Wireframe Mesh"
          >
            <Grid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowProjectionWall(!showProjectionWall)}
            className={`p-1.5 text-xs rounded transition-colors ${
              showProjectionWall
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Projection Screen in 3D"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={resetCamera}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded transition-colors"
            title="Reset Camera View"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Floating Bottom Toolbar with View Snap Buttons */}
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 pointer-events-auto bg-slate-900/85 backdrop-blur-md px-2 py-1 rounded-lg border border-slate-700/60 text-xs text-slate-400 shadow-lg">
        <span className="text-[11px] font-mono text-slate-500 mr-1 flex items-center gap-1">
          <Camera className="w-3 h-3 text-slate-400" />
          Camera:
        </span>
        <button
          onClick={() => setViewAngle('top')}
          className="px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 font-medium border border-amber-500/40 flex items-center gap-1 shadow-sm"
          title="Top-down view showing full 360° tabletop radial shadow, matching user's photo"
        >
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>Top (Like Photo)</span>
        </button>
        <button
          onClick={() => setViewAngle('perspective')}
          className="px-2 py-0.5 rounded hover:bg-slate-800 hover:text-slate-200"
        >
          Angle
        </button>
        <button
          onClick={() => setViewAngle('front')}
          className="px-2 py-0.5 rounded hover:bg-slate-800 hover:text-slate-200"
        >
          Front
        </button>
        <button
          onClick={() => setViewAngle('side')}
          className="px-2 py-0.5 rounded hover:bg-slate-800 hover:text-slate-200"
        >
          Side
        </button>
      </div>

      {/* Tea light indicator & coordinates */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2 pointer-events-none bg-slate-900/85 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-700/60 text-[11px] font-mono text-slate-400 shadow-lg">
        <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400 animate-pulse" />
        <span>
          Tea Light: ({light.position.x}, {light.position.y}, {light.position.z}) mm
        </span>
      </div>

      {/* Generating Overlay */}
      {isGenerating && (
        <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20">
          <div className="w-10 h-10 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-200 tracking-wide animate-pulse">
            Raytracing & Generating 3D Watertight Lamp Mesh...
          </p>
        </div>
      )}
    </div>
  );
};
