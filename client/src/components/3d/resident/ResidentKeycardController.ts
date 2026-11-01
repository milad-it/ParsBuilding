/**
 * ResidentKeycardController
 * 
 * 3D Holographic Resident Keycard:
 * - PBR Materials with sheen and metallic smart chip
 * - High-DPI 2D Persian canvas texture front face
 * - 180° elastic flip transition revealing payment details & QR
 * - Mouse and gyroscopic parallax tilt
 */
import * as THREE from 'three';
import { ThreeResourceManager } from '../core/ThreeResourceManager';
import { WebGLDetector } from '../core/WebGLDetector';
import { CanvasTextureGenerator } from '../core/CanvasTextureGenerator';

export interface KeycardData {
  complexName: string;
  residentName: string;
  unitNumber: number;
  floor?: number;
  balance: number;
  passCode: string;
  sheba: string;
  cardNumber: string;
  qrPayload: string;
}

export class ResidentKeycardController {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private animFrameId: number | null = null;

  private cardGroup: THREE.Group;
  private cardMesh!: THREE.Mesh;
  private isFlipped = false;
  private targetFlipAngle = 0;

  private mouseX = 0;
  private mouseY = 0;
  private targetTiltX = 0;
  private targetTiltY = 0;

  constructor(container: HTMLElement, data: KeycardData) {
    this.container = container;
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 280;

    // 1. Scene & Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 7.5);

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
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0x38bdf8, 1.8);
    keyLight.position.set(5, 5, 8);
    this.scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xf59e0b, 2.0, 10);
    rimLight.position.set(-5, -3, 4);
    this.scene.add(rimLight);

    // 4. Build Card Mesh
    this.cardGroup = new THREE.Group();
    this.scene.add(this.cardGroup);
    this.buildCard(data);

    // 5. Events & Render Loop
    this.bindEvents();
    this.startRenderLoop();
  }

  public flip(): void {
    this.isFlipped = !this.isFlipped;
    this.targetFlipAngle = this.isFlipped ? Math.PI : 0;
  }

  private buildCard(data: KeycardData): void {
    // Standard credit card aspect ratio ~ 1.586
    const cardWidth = 4.8;
    const cardHeight = 3.0;
    const cardDepth = 0.08;

    const geometry = new THREE.BoxGeometry(cardWidth, cardHeight, cardDepth);

    // Front Texture
    const frontTex = CanvasTextureGenerator.createPersianCardTexture({
      complexName: data.complexName,
      residentName: data.residentName,
      unitNumber: data.unitNumber,
      floor: data.floor,
      balance: data.balance,
      passCode: data.passCode,
      isOverdue: data.balance > 0
    });

    // Back Texture (Canvas for Sheba, Card, QR)
    const backCanvas = document.createElement('canvas');
    backCanvas.width = 1024;
    backCanvas.height = 640;
    const ctx = backCanvas.getContext('2d');
    if (ctx) {
      // Dark Magnetic Stripe Background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 1024, 640);

      // Magnetic Black Stripe
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 60, 1024, 110);

      // Signature & Info Strip
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(40, 210, 600, 70);

      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.font = 'bold 22px Vazirmatn, Tahoma, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('شماره شبا جهت واریز شارژ:', 960, 330);

      ctx.direction = 'ltr';
      ctx.textAlign = 'right';
      ctx.font = 'bold 26px monospace';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(data.sheba || 'IR000000000000000000000000', 960, 375);

      ctx.direction = 'rtl';
      ctx.font = 'bold 22px Vazirmatn, Tahoma, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('شماره کارت ساختمان:', 960, 440);

      ctx.direction = 'ltr';
      ctx.font = 'bold 28px monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(data.cardNumber || '۶۰۳۷-۹۹۷۵-۱۲۳۴-۵۶۷۸', 960, 485);

      // QR Code Representation Placeholder
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(80, 330, 220, 220);
      ctx.fillStyle = '#090d16';
      ctx.fillRect(100, 350, 60, 60);
      ctx.fillRect(220, 350, 60, 60);
      ctx.fillRect(100, 470, 60, 60);
      ctx.fillRect(180, 430, 40, 40);
      ctx.fillRect(230, 480, 40, 40);
    }

    const backTex = new THREE.CanvasTexture(backCanvas);
    backTex.colorSpace = THREE.SRGBColorSpace;

    // Materials array for BoxGeometry [right, left, top, bottom, front, back]
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.2 });
    const frontMat = new THREE.MeshStandardMaterial({
      map: frontTex,
      metalness: 0.25,
      roughness: 0.35
    });
    const backMat = new THREE.MeshStandardMaterial({
      map: backTex,
      metalness: 0.2,
      roughness: 0.4
    });

    const materials = [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat];
    this.cardMesh = new THREE.Mesh(geometry, materials);
    this.cardGroup.add(this.cardMesh);
  }

  private bindEvents(): void {
    const onMove = (e: MouseEvent) => {
      const rect = this.container.getBoundingClientRect();
      this.mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouseY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      this.targetTiltY = this.mouseX * 0.35;
      this.targetTiltX = -this.mouseY * 0.25;
    };

    const onLeave = () => {
      this.targetTiltX = 0;
      this.targetTiltY = 0;
    };

    this.container.addEventListener('mousemove', onMove);
    this.container.addEventListener('mouseleave', onLeave);
  }

  private startRenderLoop(): void {
    const animate = () => {
      this.animFrameId = requestAnimationFrame(animate);

      // Smooth flip rotation on Y axis
      this.cardGroup.rotation.y += (this.targetFlipAngle + this.targetTiltY - this.cardGroup.rotation.y) * 0.1;
      this.cardGroup.rotation.x += (this.targetTiltX - this.cardGroup.rotation.x) * 0.1;

      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  public dispose(): void {
    ThreeResourceManager.disposeScene(this.scene, this.renderer, this.animFrameId);
  }
}
