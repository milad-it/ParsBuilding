/**
 * BuildingMatrixController
 * 
 * Interactive 3D Isometric Status Matrix:
 * - Maps units to spatial cubicles stacked by floor
 * - Real-time color-coded materials by financial status
 * - Raycasting for hover tooltip detection
 * - Exploded floor view animation
 */
import * as THREE from 'three';
import { ThreeResourceManager } from '../core/ThreeResourceManager';
import { WebGLDetector } from '../core/WebGLDetector';

export interface UnitSpatialData {
  id: string;
  unitNumber: number;
  unitName?: string;
  floor: number;
  col: number;
  currentBalance: number;
  occType: 'OWNER_OCCUPIED' | 'TENANT_OCCUPIED' | 'VACANT';
  occupants: number;
}

export class BuildingMatrixController {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private animFrameId: number | null = null;

  private rootGroup: THREE.Group;
  private unitMeshes: Map<string, THREE.Mesh> = new Map();
  private floorGroups: Map<number, THREE.Group> = new Map();
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2(-999, -999);

  private hoveredMesh: THREE.Mesh | null = null;
  private onUnitHoverCallback?: (unit: UnitSpatialData | null, screenPos: { x: number; y: number } | null) => void;
  private onUnitClickCallback?: (unit: UnitSpatialData) => void;

  private isExploded = false;
  private explodeFactor = 0;
  private targetExplodeFactor = 0;

  constructor(
    container: HTMLElement,
    units: UnitSpatialData[],
    options?: {
      onHover?: (unit: UnitSpatialData | null, screenPos: { x: number; y: number } | null) => void;
      onClick?: (unit: UnitSpatialData) => void;
    }
  ) {
    this.container = container;
    this.onUnitHoverCallback = options?.onHover;
    this.onUnitClickCallback = options?.onClick;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;
    const aspect = width / height;
    const frustumSize = 18;

    // 1. Isometric Orthographic Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      1000
    );
    // Isometric angle: 45 deg yaw, ~35.264 deg pitch
    this.camera.position.set(20, 20, 20);
    this.camera.lookAt(0, 4, 0);

    // 2. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(WebGLDetector.getOptimalPixelRatio());
    container.appendChild(this.renderer.domElement);

    // 3. Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(15, 25, 10);
    this.scene.add(dirLight);

    // 4. Build Matrix Cubicles
    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);
    this.buildMatrix(units);

    // 5. Events & Render Loop
    this.bindEvents();
    this.startRenderLoop();
  }

  public setExploded(exploded: boolean): void {
    this.isExploded = exploded;
    this.targetExplodeFactor = exploded ? 1 : 0;
  }

  public updateUnits(units: UnitSpatialData[]): void {
    while (this.rootGroup.children.length > 0) {
      ThreeResourceManager.disposeObject(this.rootGroup.children[0]);
      this.rootGroup.remove(this.rootGroup.children[0]);
    }
    this.unitMeshes.clear();
    this.floorGroups.clear();
    this.buildMatrix(units);
  }

  private buildMatrix(units: UnitSpatialData[]): void {
    const boxGeo = new THREE.BoxGeometry(2.2, 1.4, 2.2);

    units.forEach((u) => {
      let floorGroup = this.floorGroups.get(u.floor);
      if (!floorGroup) {
        floorGroup = new THREE.Group();
        this.floorGroups.set(u.floor, floorGroup);
        this.rootGroup.add(floorGroup);

        // Add a subtle floor slab plate
        const slabGeo = new THREE.BoxGeometry(7, 0.15, 7);
        const slabMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          roughness: 0.8,
          metalness: 0.2
        });
        const slab = new THREE.Mesh(slabGeo, slabMat);
        slab.position.set(0, -0.75, 0);
        floorGroup.add(slab);
      }

      // Material color-coding
      let color = 0x10b981; // Emerald (settled/credit)
      let opacity = 0.95;
      let transparent = false;

      if (u.occType === 'VACANT') {
        color = 0x64748b;
        opacity = 0.4;
        transparent = true;
      } else if (u.currentBalance > 0) {
        color = 0xef4444; // Debt (Crimson)
      }

      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.3,
        metalness: 0.2,
        transparent,
        opacity
      });

      const mesh = new THREE.Mesh(boxGeo, mat);
      // Col 0, 1, 2, 3 layout in a 2x2 grid per floor
      const colX = (u.col % 2 === 0 ? -1.4 : 1.4);
      const colZ = (u.col < 2 ? -1.4 : 1.4);
      mesh.position.set(colX, 0, colZ);
      mesh.userData = u;

      floorGroup.add(mesh);
      this.unitMeshes.set(u.id, mesh);
    });
  }

  private bindEvents(): void {
    const onMove = (e: MouseEvent) => {
      const rect = this.container.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    };

    const onLeave = () => {
      this.mouse.x = -999;
      this.mouse.y = -999;
      if (this.hoveredMesh) {
        this.hoveredMesh.scale.set(1, 1, 1);
        this.hoveredMesh = null;
        this.onUnitHoverCallback?.(null, null);
      }
    };

    const onClick = () => {
      if (this.hoveredMesh && this.onUnitClickCallback) {
        this.onUnitClickCallback(this.hoveredMesh.userData as UnitSpatialData);
      }
    };

    this.container.addEventListener('mousemove', onMove);
    this.container.addEventListener('mouseleave', onLeave);
    this.container.addEventListener('click', onClick);
  }

  private startRenderLoop(): void {
    const animate = () => {
      this.animFrameId = requestAnimationFrame(animate);

      // Lerp explode animation
      this.explodeFactor += (this.targetExplodeFactor - this.explodeFactor) * 0.1;
      this.floorGroups.forEach((group, floor) => {
        group.position.y = floor * (2.0 + this.explodeFactor * 2.2);
      });

      // Raycasting for hover
      if (this.mouse.x > -2 && this.mouse.y > -2) {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const meshes = Array.from(this.unitMeshes.values());
        const intersects = this.raycaster.intersectObjects(meshes, false);

        if (intersects.length > 0) {
          const hit = intersects[0].object as THREE.Mesh;
          if (this.hoveredMesh !== hit) {
            if (this.hoveredMesh) this.hoveredMesh.scale.set(1, 1, 1);
            this.hoveredMesh = hit;
            this.hoveredMesh.scale.set(1.08, 1.08, 1.08);

            const rect = this.container.getBoundingClientRect();
            const hitPos = new THREE.Vector3();
            hit.getWorldPosition(hitPos);
            hitPos.project(this.camera);

            const screenX = ((hitPos.x + 1) * rect.width) / 2;
            const screenY = ((-hitPos.y + 1) * height) / 2;
            this.onUnitHoverCallback?.(hit.userData as UnitSpatialData, { x: screenX, y: screenY });
          }
        } else if (this.hoveredMesh) {
          this.hoveredMesh.scale.set(1, 1, 1);
          this.hoveredMesh = null;
          this.onUnitHoverCallback?.(null, null);
        }
      }

      this.renderer.render(this.scene, this.camera);
    };

    const height = this.container.clientHeight || 450;
    animate();
  }

  public dispose(): void {
    ThreeResourceManager.disposeScene(this.scene, this.renderer, this.animFrameId);
  }
}
