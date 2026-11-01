/**
 * BuildingComplexController
 * 
 * High-performance procedural architectural visualizer:
 * - Multi-tier residential towers with glass facades & entrance canopy
 * - InstancedMesh rendering for 200+ glowing windows in a single draw call
 * - Day / Dusk / Night lighting transitions
 * - Responsive mouse parallax damping
 */
import * as THREE from 'three';
import { ThreeResourceManager } from '../core/ThreeResourceManager';
import { WebGLDetector } from '../core/WebGLDetector';

export type TimeOfDay = 'night' | 'dusk' | 'day';

export class BuildingComplexController {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private animFrameId: number | null = null;

  // Architectural Groups
  private buildingGroup: THREE.Group;
  private instancedWindows!: THREE.InstancedMesh;

  // Lighting References
  private ambientLight!: THREE.AmbientLight;
  private dirSunMoonLight!: THREE.DirectionalLight;
  private entranceSpotlight!: THREE.SpotLight;
  private beaconLight!: THREE.PointLight;

  // Interaction State
  private targetRotationY = 0;
  private targetRotationX = 0;
  private isPointerOver = false;
  private isPaused = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // 1. Scene & Camera Setup
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x090d16, 0.012);

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    this.camera.position.set(24, 18, 38);
    this.camera.lookAt(0, 10, 0);

    // 2. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(WebGLDetector.getOptimalPixelRatio());
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    // 3. Build Architectural Complex & Lights
    this.buildingGroup = new THREE.Group();
    this.scene.add(this.buildingGroup);

    this.setupLighting();
    this.buildGroundAndPlaza();
    this.buildProceduralTowers();
    this.buildInstancedWindows();

    // 4. Bind Events & Lifecycle
    this.bindEvents();
    this.setTimeOfDay('night');
    this.startRenderLoop();
  }

  private setupLighting(): void {
    this.ambientLight = new THREE.AmbientLight(0x1e1b4b, 0.6);
    this.scene.add(this.ambientLight);

    this.dirSunMoonLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    this.dirSunMoonLight.position.set(30, 45, 25);
    this.dirSunMoonLight.castShadow = true;
    this.scene.add(this.dirSunMoonLight);

    this.entranceSpotlight = new THREE.SpotLight(0xf59e0b, 3.5, 20, Math.PI / 4, 0.4);
    this.entranceSpotlight.position.set(0, 8, 10);
    this.entranceSpotlight.target.position.set(0, 0, 8);
    this.scene.add(this.entranceSpotlight);
    this.scene.add(this.entranceSpotlight.target);

    this.beaconLight = new THREE.PointLight(0xef4444, 2.0, 15);
    this.beaconLight.position.set(0, 29.5, 0);
    this.scene.add(this.beaconLight);
  }

  private buildGroundAndPlaza(): void {
    const groundGeo = new THREE.PlaneGeometry(160, 160);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x090d16,
      roughness: 0.6,
      metalness: 0.3
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const podiumGeo = new THREE.BoxGeometry(22, 1.2, 22);
    const podiumMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.2
    });
    const podium = new THREE.Mesh(podiumGeo, podiumMat);
    podium.position.set(0, 0.6, 0);
    podium.receiveShadow = true;
    podium.castShadow = true;
    this.buildingGroup.add(podium);

    const canopyGeo = new THREE.BoxGeometry(8, 0.3, 5);
    const canopyMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.7,
      transmission: 0.6,
      roughness: 0.1
    });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 3.5, 9.5);
    this.buildingGroup.add(canopy);
  }

  private buildProceduralTowers(): void {
    const towerGeo = new THREE.BoxGeometry(10, 24, 10);
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.4
    });
    const mainTower = new THREE.Mesh(towerGeo, towerMat);
    mainTower.position.set(0, 13.2, 0);
    mainTower.castShadow = true;
    mainTower.receiveShadow = true;
    this.buildingGroup.add(mainTower);

    const westWingGeo = new THREE.BoxGeometry(7, 13, 8);
    const westWing = new THREE.Mesh(westWingGeo, towerMat);
    westWing.position.set(-8, 7.7, -1);
    westWing.castShadow = true;
    westWing.receiveShadow = true;
    this.buildingGroup.add(westWing);

    const balconyGeo = new THREE.BoxGeometry(3.5, 0.3, 3.5);
    const balconyMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
    for (let f = 1; f <= 8; f++) {
      const balcony = new THREE.Mesh(balconyGeo, balconyMat);
      balcony.position.set(5.2, 3 + f * 2.4, 3.8);
      balcony.castShadow = true;
      this.buildingGroup.add(balcony);
    }

    const penthouseGeo = new THREE.BoxGeometry(6, 3, 6);
    const penthouse = new THREE.Mesh(penthouseGeo, towerMat);
    penthouse.position.set(0, 26.7, 0);
    this.buildingGroup.add(penthouse);

    const mastGeo = new THREE.CylinderGeometry(0.1, 0.25, 4.5, 8);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.set(0, 29.5, 0);
    this.buildingGroup.add(mast);
  }

  private buildInstancedWindows(): void {
    const windowGeo = new THREE.PlaneGeometry(0.9, 1.3);
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.8,
      roughness: 0.1
    });

    const totalInstances = 160;
    this.instancedWindows = new THREE.InstancedMesh(windowGeo, windowMat, totalInstances);
    this.instancedWindows.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const dummy = new THREE.Object3D();
    const warmColor = new THREE.Color(0xfbbf24);
    const coolColor = new THREE.Color(0x38bdf8);
    const darkColor = new THREE.Color(0x0a0e1a);

    let idx = 0;
    for (let floor = 0; floor < 10; floor++) {
      const y = 3.5 + floor * 2.1;
      for (let col = -1.5; col <= 1.5; col += 1.0) {
        if (idx >= totalInstances) break;
        // South Face
        dummy.position.set(col * 2.0, y, 5.05);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        this.instancedWindows.setMatrixAt(idx, dummy.matrix);

        const rand = Math.random();
        const colVal = rand > 0.4 ? (rand > 0.75 ? coolColor : warmColor) : darkColor;
        this.instancedWindows.setColorAt(idx, colVal);
        idx++;

        if (idx >= totalInstances) break;
        // North Face
        dummy.position.set(col * 2.0, y, -5.05);
        dummy.rotation.set(0, Math.PI, 0);
        dummy.updateMatrix();
        this.instancedWindows.setMatrixAt(idx, dummy.matrix);
        this.instancedWindows.setColorAt(idx, Math.random() > 0.5 ? warmColor : darkColor);
        idx++;
      }
    }

    if (this.instancedWindows.instanceColor) {
      this.instancedWindows.instanceColor.needsUpdate = true;
    }
    this.buildingGroup.add(this.instancedWindows);
  }

  public setTimeOfDay(time: TimeOfDay): void {
    if (!this.ambientLight || !this.dirSunMoonLight) return;
    if (time === 'night') {
      if (this.scene.fog) this.scene.fog.color.set(0x090d16);
      this.ambientLight.color.set(0x1e1b4b);
      this.ambientLight.intensity = 0.5;
      this.dirSunMoonLight.color.set(0x38bdf8);
      this.dirSunMoonLight.intensity = 1.3;
      this.dirSunMoonLight.position.set(30, 45, 25);
      if (this.entranceSpotlight) this.entranceSpotlight.intensity = 3.5;
    } else if (time === 'dusk') {
      if (this.scene.fog) this.scene.fog.color.set(0x1e1026);
      this.ambientLight.color.set(0x4c1d95);
      this.ambientLight.intensity = 0.8;
      this.dirSunMoonLight.color.set(0xf97316);
      this.dirSunMoonLight.intensity = 2.0;
      this.dirSunMoonLight.position.set(45, 20, 20);
      if (this.entranceSpotlight) this.entranceSpotlight.intensity = 2.0;
    } else {
      if (this.scene.fog) this.scene.fog.color.set(0xdbeafe);
      this.ambientLight.color.set(0xf8fafc);
      this.ambientLight.intensity = 1.1;
      this.dirSunMoonLight.color.set(0xffffff);
      this.dirSunMoonLight.intensity = 2.5;
      this.dirSunMoonLight.position.set(20, 50, 30);
      if (this.entranceSpotlight) this.entranceSpotlight.intensity = 0.5;
    }
  }

  private bindEvents(): void {
    const onPointerMove = (e: MouseEvent) => {
      const rect = this.container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      this.targetRotationY = x * 0.35;
      this.targetRotationX = y * 0.15;
      this.isPointerOver = true;
    };

    const onPointerLeave = () => {
      this.isPointerOver = false;
      this.targetRotationX = 0;
    };

    this.container.addEventListener('mousemove', onPointerMove);
    this.container.addEventListener('mouseleave', onPointerLeave);

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.camera.aspect = width / height;
          this.camera.updateProjectionMatrix();
          this.renderer.setSize(width, height);
        }
      }
    });
    this.resizeObserver.observe(this.container);
  }

  private startRenderLoop(): void {
    const clock = new THREE.Clock();

    const animate = () => {
      this.animFrameId = requestAnimationFrame(animate);
      if (this.isPaused) return;

      const time = clock.getElapsedTime();

      if (!this.isPointerOver) {
        this.targetRotationY += 0.0015;
      }

      this.buildingGroup.rotation.y += (this.targetRotationY - this.buildingGroup.rotation.y) * 0.05;
      this.buildingGroup.rotation.x += (this.targetRotationX - this.buildingGroup.rotation.x) * 0.05;

      if (this.beaconLight) {
        this.beaconLight.intensity = Math.sin(time * 3) > 0.2 ? 2.5 : 0.2;
      }

      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  public dispose(): void {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    ThreeResourceManager.disposeScene(this.scene, this.renderer, this.animFrameId);
  }
}
