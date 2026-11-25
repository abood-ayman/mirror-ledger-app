import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, Compass, Pause, Play, Sparkles } from 'lucide-react';
import type { Language } from '../types/tracker';

type CameraPreset = 'overview' | 'astrolabe' | 'lanterns';
type SanctuaryMood = 'teal' | 'amber' | 'night';

const PRESET_VIEWS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  overview: { pos: [7.5, 4.8, 8.6], target: [0, 1.35, 0] },
  astrolabe: { pos: [2.8, 2.35, 3.3], target: [0, 1.65, 0] },
  lanterns: { pos: [-5.8, 2.8, 6.2], target: [0, 1.1, 0] },
};

const MOOD_PALETTE: Record<
  SanctuaryMood,
  { accentHex: number; fogHex: number; keyIntensity: number; crystalHex: number }
> = {
  teal: { accentHex: 0x00b8a9, fogHex: 0x0b1018, keyIntensity: 2.2, crystalHex: 0x00d8c6 },
  amber: { accentHex: 0xff6b35, fogHex: 0x160f0d, keyIntensity: 2.6, crystalHex: 0xff9157 },
  night: { accentHex: 0xa855f7, fogHex: 0x090a14, keyIntensity: 1.5, crystalHex: 0x9b6dff },
};

function createStoneReliefTextures(): {
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 256;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#c8c8c8';
  rCtx.fillRect(0, 0, size, size);

  // Subtle radial masonry rings + micro grain
  for (let i = 0; i < 1600; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const y = (Math.cos(i * 78.233) * 19341.23) % 1;
    const px = Math.abs(x) * size;
    const py = Math.abs(y) * size;
    const shade = 105 + ((i * 29) % 55);
    bCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
    bCtx.fillRect(px, py, 2.5, 2.5);
    const rShade = 165 + ((i * 17) % 60);
    rCtx.fillStyle = `rgb(${rShade},${rShade},${rShade})`;
    rCtx.fillRect(px, py, 3, 3);
  }

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(3, 3);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(3, 3);

  return { bumpMap, roughnessMap };
}

function createContactShadowDisc(radius: number): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    opacity: 0.5,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.015;
  return mesh;
}

function buildLanternProp(
  stoneMat: THREE.Material,
  slateMat: THREE.Material,
  brassMat: THREE.Material,
  glowMat: THREE.MeshStandardMaterial
): THREE.Group {
  const group = new THREE.Group();

  // 1. Stone foot base (bottom at y=0)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.22, 8), stoneMat);
  base.position.y = 0.11;
  group.add(base);

  // 2. Fluted pillar shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.88, 8), stoneMat);
  shaft.position.y = 0.66;
  group.add(shaft);

  // 3. Brass collar
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.08, 12), brassMat);
  collar.position.y = 1.14;
  group.add(collar);

  // 4. Inner emissive focus chamber
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.34, 8), glowMat);
  core.position.y = 1.35;
  group.add(core);

  // 5. Four corner brass struts framing lantern chamber
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.035), brassMat);
    strut.position.set(Math.cos(angle) * 0.21, 1.35, Math.sin(angle) * 0.21);
    group.add(strut);
  }

  // 6. Pagoda slate roof + finial
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.28, 8), slateMat);
  roof.position.y = 1.66;
  group.add(roof);

  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), brassMat);
  finial.position.y = 1.83;
  group.add(finial);

  return group;
}

export function Sanctuary3DPanel({ lang }: { lang: Language }) {
  const isAr = lang === 'ar';
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [preset, setPreset] = useState<CameraPreset>('overview');
  const [mood, setMood] = useState<SanctuaryMood>('teal');
  const [isSpinning, setIsSpinning] = useState(true);
  const [dockOpen, setDockOpen] = useState(true);
  const [softwareMode, setSoftwareMode] = useState(false);

  const stateRef = useRef<{
    preset: CameraPreset;
    mood: SanctuaryMood;
    spinning: boolean;
    needsTransition: boolean;
  }>({
    preset: 'overview',
    mood: 'teal',
    spinning: true,
    needsTransition: false,
  });

  useEffect(() => {
    stateRef.current.preset = preset;
    stateRef.current.needsTransition = true;
  }, [preset]);

  useEffect(() => {
    stateRef.current.mood = mood;
  }, [mood]);

  useEffect(() => {
    stateRef.current.spinning = isSpinning;
  }, [isSpinning]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 720;
    const height = container.clientHeight || 440;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });

    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    const isSoftwareGl = /swiftshader|llvmpipe|softpipe|mesa|software/i.test(rendererStr);
    setSoftwareMode(isSoftwareGl);

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(MOOD_PALETTE.teal.fogHex);
    scene.fog = new THREE.FogExp2(MOOD_PALETTE.teal.fogHex, 0.036);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 80);
    camera.position.set(...PRESET_VIEWS.overview.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.4;
    controls.maxDistance = 16;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.target.set(...PRESET_VIEWS.overview.target);

    // Warm/cool contrast lighting
    const hemi = new THREE.HemisphereLight(0x8fb8de, 0x1a1a22, 0.75);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffd6a5, 2.2);
    keyLight.position.set(6, 10, 5);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 26;
      const d = 8;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
    }
    scene.add(keyLight);

    const coreGlowLight = new THREE.PointLight(MOOD_PALETTE.teal.accentHex, 2.4, 9);
    coreGlowLight.position.set(0, 1.85, 0);
    scene.add(coreGlowLight);

    // Procedural materials with roughness contrast & CanvasTexture micro-relief
    const { bumpMap, roughnessMap } = createStoneReliefTextures();
    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0x0b0f16,
      roughness: 0.94,
      metalness: 0.02,
      bumpMap,
      bumpScale: 0.04,
      roughnessMap,
    });
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x2a313b,
      roughness: 0.85,
      metalness: 0.06,
      bumpMap,
      bumpScale: 0.03,
    });
    const slateMat = new THREE.MeshStandardMaterial({
      color: 0x1f252e,
      roughness: 0.65,
      metalness: 0.15,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd9a85c,
      roughness: 0.26,
      metalness: 0.86,
    });
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x00d8c6,
      emissive: 0x008b80,
      emissiveIntensity: 0.85,
      roughness: 0.12,
      metalness: 0.22,
    });
    const lanternCoreMat = new THREE.MeshStandardMaterial({
      color: 0xffb385,
      emissive: 0xff6b35,
      emissiveIntensity: 1.4,
      roughness: 0.35,
      metalness: 0.05,
    });

    // Ground horizon courtyard (disjoint Y offsets >= 0.02 to prevent Z-fighting)
    const ground = new THREE.Mesh(new THREE.CircleGeometry(36, 48), terrainMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = !isSoftwareGl;
    scene.add(ground);

    const plinthOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.95, 0.24, 12),
      stoneMat
    );
    plinthOuter.position.y = 0.12;
    plinthOuter.receiveShadow = !isSoftwareGl;
    scene.add(plinthOuter);

    const plinthInlay = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.15, 0.04, 24),
      slateMat
    );
    plinthInlay.position.y = 0.26;
    scene.add(plinthInlay);

    // Composite Astrolabe Hero Assembly (8+ distinct parts, grounded on plinth y=0.28)
    const astrolabeGroup = new THREE.Group();
    astrolabeGroup.position.y = 0.28;

    const pedestalBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.86, 0.3, 12),
      slateMat
    );
    pedestalBase.position.y = 0.15;
    astrolabeGroup.add(pedestalBase);

    const pedestalRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.66, 0.045, 12, 32),
      brassMat
    );
    pedestalRim.rotation.x = Math.PI / 2;
    pedestalRim.position.y = 0.31;
    astrolabeGroup.add(pedestalRim);

    const meridianStand = new THREE.Mesh(
      new THREE.TorusGeometry(1.18, 0.055, 14, 48, Math.PI * 1.45),
      slateMat
    );
    meridianStand.rotation.z = -Math.PI * 0.225;
    meridianStand.position.y = 1.48;
    astrolabeGroup.add(meridianStand);

    const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.036, 14, 48), brassMat);
    ringOuter.position.y = 1.48;
    astrolabeGroup.add(ringOuter);

    const ringMid = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.028, 12, 42), brassMat);
    ringMid.position.y = 1.48;
    astrolabeGroup.add(ringMid);

    const ringInner = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.024, 12, 36), brassMat);
    ringInner.position.y = 1.48;
    astrolabeGroup.add(ringInner);

    const crystalCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), crystalMat);
    crystalCore.position.y = 1.48;
    astrolabeGroup.add(crystalCore);

    const crownNeedle = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 8), brassMat);
    crownNeedle.position.y = 2.74;
    astrolabeGroup.add(crownNeedle);

    scene.add(astrolabeGroup);

    // 4 Corner Focus Lanterns + Contact Shadow Discs
    const lanternAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
    lanternAngles.forEach((angle) => {
      const dist = 4.35;
      const lx = Math.cos(angle) * dist;
      const lz = Math.sin(angle) * dist;
      const lantern = buildLanternProp(stoneMat, slateMat, brassMat, lanternCoreMat);
      lantern.position.set(lx, 0, lz);
      lantern.rotation.y = -angle;
      scene.add(lantern);

      const shadowDisc = createContactShadowDisc(0.58);
      shadowDisc.position.set(lx, 0.015, lz);
      scene.add(shadowDisc);
    });

    // InstancedMesh stone pebbles framing the outer courtyard ring
    const pebbleCount = 48;
    const pebbleGeom = new THREE.DodecahedronGeometry(0.14, 0);
    const pebbleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.05,
    });
    const pebbles = new THREE.InstancedMesh(pebbleGeom, pebbleMat, pebbleCount);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < pebbleCount; i++) {
      const a = (i / pebbleCount) * Math.PI * 2 + (i % 3) * 0.04;
      const r = 3.25 + ((i * 7) % 10) * 0.28;
      const scale = 0.75 + ((i * 13) % 7) * 0.09;
      dummy.position.set(Math.cos(a) * r, 0.08 * scale, Math.sin(a) * r);
      dummy.rotation.set(i * 0.5, i * 0.9, 0);
      dummy.scale.set(scale * 1.2, scale * 0.7, scale);
      dummy.updateMatrix();
      pebbles.setMatrixAt(i, dummy.matrix);
      const shade = 0.08 + ((i * 19) % 12) * 0.008;
      color.setRGB(shade, shade * 1.05, shade * 1.15);
      pebbles.setColorAt(i, color);
    }
    pebbles.instanceMatrix.needsUpdate = true;
    if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
    scene.add(pebbles);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const desiredPos = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();
    let rafId = 0;
    let timerId = 0;
    let disposed = false;
    let lastTime = performance.now();

    const stepAndRender = (now: number) => {
      if (disposed) return;
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const palette = MOOD_PALETTE[stateRef.current.mood];
      (scene.background as THREE.Color).lerp(new THREE.Color(palette.fogHex), 1 - Math.exp(-4 * dt));
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.copy(scene.background as THREE.Color);
      }
      crystalMat.color.lerp(new THREE.Color(palette.crystalHex), 1 - Math.exp(-5 * dt));
      crystalMat.emissive.lerp(new THREE.Color(palette.accentHex), 1 - Math.exp(-5 * dt));
      coreGlowLight.color.copy(crystalMat.emissive);
      keyLight.intensity = THREE.MathUtils.damp(keyLight.intensity, palette.keyIntensity, 4, dt);

      if (stateRef.current.spinning) {
        ringOuter.rotation.y += dt * 0.35;
        ringOuter.rotation.x += dt * 0.14;
        ringMid.rotation.x += dt * 0.45;
        ringMid.rotation.z += dt * 0.2;
        ringInner.rotation.y -= dt * 0.65;
        crystalCore.rotation.y += dt * 0.85;
        crystalCore.position.y = 1.48 + Math.sin(now * 0.0022) * 0.07;
      }

      if (stateRef.current.needsTransition) {
        const view = PRESET_VIEWS[stateRef.current.preset];
        desiredPos.set(...view.pos);
        desiredTarget.set(...view.target);
        const factor = 1 - Math.exp(-5.5 * dt);
        camera.position.lerp(desiredPos, factor);
        controls.target.lerp(desiredTarget, factor);
        if (
          camera.position.distanceTo(desiredPos) < 0.03 &&
          controls.target.distanceTo(desiredTarget) < 0.03
        ) {
          stateRef.current.needsTransition = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      const scheduleNext = () => {
        if (disposed) return;
        rafId = requestAnimationFrame(stepAndRender);
      };

      if (isSoftwareGl) {
        timerId = window.setTimeout(scheduleNext, 120);
      } else {
        scheduleNext();
      }
    };

    rafId = requestAnimationFrame(stepAndRender);

    const observer = new ResizeObserver(() => {
      if (!container || disposed) return;
      const w = container.clientWidth || 720;
      const h = container.clientHeight || 440;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    observer.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
      observer.disconnect();
      controls.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative rounded-[20px] overflow-hidden border border-[#2A2A2A] bg-[#0B1018] max-w-full">
      {/* Dedicated WebGL Mount */}
      <div
        ref={mountRef}
        data-testid="sanctuary-3d-canvas"
        aria-label={isAr ? 'مشهد الملاذ ثلاثي الأبعاد' : '3D Astrolabe Focus Sanctuary'}
        className="w-full max-w-full overflow-hidden h-[440px] md:h-[520px] cursor-grab active:cursor-grabbing [&>canvas]:max-w-full"
      />

      {/* Top Corner Readout (Opaque / Solid rgba fill - zero backdrop-filter over WebGL) */}
      <div className="pointer-events-none absolute top-3 start-3 end-3 flex items-start justify-between gap-2">
        <div className="pointer-events-auto bg-[#0F0F0F]/92 border border-[#2A2A2A] rounded-2xl px-3.5 py-2">
          <div className="text-xs font-extrabold text-white flex items-center gap-1.5">
            <Sparkles size={14} className="text-[#00B8A9]" />
            <span>{isAr ? 'ملاذ الإسطرلاب الهادئ' : 'Astrolabe Courtyard Sanctuary'}</span>
          </div>
          <div className="text-[11px] text-[#A1A1AA]">
            {isAr
              ? 'اسحب للتدوير أو استخدم المقربة السفلية'
              : 'Drag to orbit · Scroll to zoom'}
            {softwareMode ? ' · Eco Render' : ''}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsSpinning((s) => !s)}
          aria-label={isSpinning ? (isAr ? 'إيقاف الحركة' : 'Pause motion') : isAr ? 'تشغيل الحركة' : 'Resume motion'}
          className="pointer-events-auto w-10 h-10 rounded-full bg-[#0F0F0F]/92 border border-[#2A2A2A] hover:border-[#00B8A9] text-white flex items-center justify-center transition"
        >
          {isSpinning ? <Pause size={15} /> : <Play size={15} />}
        </button>
      </div>

      {/* Collapsible Bottom Control Dock (zero backdrop-blur) */}
      <div className="pointer-events-none absolute bottom-3 inset-x-3 flex justify-center">
        <div className="pointer-events-auto bg-[#0F0F0F]/94 border border-[#2A2A2A] rounded-2xl p-2.5 shadow-xl max-w-full">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#00B8A9] px-1">
              <Compass size={14} />
              <span>{isAr ? 'التحكم بالمشهد' : 'Scene Controls'}</span>
            </div>
            <button
              type="button"
              aria-expanded={dockOpen}
              onClick={() => setDockOpen((o) => !o)}
              className="w-8 h-8 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-[#A1A1AA] hover:text-white"
              aria-label={dockOpen ? 'Collapse controls' : 'Expand controls'}
            >
              {dockOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          </div>

          {dockOpen && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'overview', ar: 'نظرة شاملة', en: 'Overview' },
                  { id: 'astrolabe', ar: 'قلب الإسطرلاب', en: 'Astrolabe' },
                  { id: 'lanterns', ar: 'الفوانيس', en: 'Lanterns' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPreset(item.id)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-extrabold border transition"
                  style={{
                    backgroundColor: preset === item.id ? '#00B8A9' : '#1A1A1A',
                    borderColor: preset === item.id ? '#00B8A9' : '#2A2A2A',
                    color: preset === item.id ? '#0F0F0F' : '#E4E4E7',
                  }}
                >
                  {isAr ? item.ar : item.en}
                </button>
              ))}

              <span className="h-4 w-px bg-[#2A2A2A] mx-0.5 hidden sm:inline-block" />

              {(
                [
                  { id: 'teal', ar: 'فجر هادئ', en: 'Dawn Teal', hex: '#00B8A9' },
                  { id: 'amber', ar: 'دفء المساء', en: 'Warm Amber', hex: '#FF6B35' },
                  { id: 'night', ar: 'ليل عميق', en: 'Night Calm', hex: '#A855F7' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMood(m.id)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-extrabold border transition"
                  style={{
                    backgroundColor: mood === m.id ? `${m.hex}24` : '#1A1A1A',
                    borderColor: mood === m.id ? m.hex : '#2A2A2A',
                    color: mood === m.id ? m.hex : '#A1A1AA',
                  }}
                >
                  {isAr ? m.ar : m.en}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
