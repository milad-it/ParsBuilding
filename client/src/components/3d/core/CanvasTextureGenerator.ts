/**
 * High-DPI Persian 2D Canvas Texture Generator
 */
import * as THREE from 'three';

export class CanvasTextureGenerator {
  public static createPersianCardTexture(data: {
    complexName: string;
    residentName: string;
    unitNumber: number;
    floor?: number;
    balance: number;
    passCode: string;
    isOverdue: boolean;
  }): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D Canvas context unsupported');

    // 1. Dark Brushed Obsidian Background
    const bgGradient = ctx.createLinearGradient(0, 0, 1024, 640);
    bgGradient.addColorStop(0, '#0f172a');
    bgGradient.addColorStop(0.5, '#1e293b');
    bgGradient.addColorStop(1, '#090d16');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 1024, 640);

    // 2. Subtle Micro-Pattern Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 1024; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 640);
      ctx.stroke();
    }
    for (let y = 0; y < 640; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1024, y);
      ctx.stroke();
    }

    // 3. Gold Accent Border
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, 976, 592);

    // 4. Gold Smart Chip Graphic
    const chipX = 820;
    const chipY = 220;
    const chipGrad = ctx.createLinearGradient(chipX, chipY, chipX + 110, chipY + 90);
    chipGrad.addColorStop(0, '#f59e0b');
    chipGrad.addColorStop(0.5, '#fef08a');
    chipGrad.addColorStop(1, '#d97706');
    ctx.fillStyle = chipGrad;
    ctx.beginPath();
    ctx.rect(chipX, chipY, 110, 90);
    ctx.fill();

    // Chip internal circuit traces
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.strokeRect(chipX + 15, chipY + 15, 80, 60);
    ctx.beginPath();
    ctx.moveTo(chipX + 15, chipY + 45);
    ctx.lineTo(chipX + 95, chipY + 45);
    ctx.moveTo(chipX + 55, chipY + 15);
    ctx.lineTo(chipX + 55, chipY + 75);
    ctx.stroke();

    // 5. Persian Typography (RTL)
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';

    // Header: Complex Name
    ctx.font = 'bold 36px Vazirmatn, Tahoma, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(data.complexName, 760, 100);

    ctx.font = '500 20px Vazirmatn, Tahoma, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('مجوز دیجیتال هوشمند تردد و سکونت', 760, 140);

    // Resident Full Name
    ctx.font = 'bold 42px Vazirmatn, Tahoma, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(data.residentName, 760, 310);

    // Unit & Floor Details
    ctx.font = '600 30px Vazirmatn, Tahoma, sans-serif';
    ctx.fillStyle = '#38bdf8';
    const floorStr = data.floor !== undefined ? `  —  طبقه ${data.floor}` : '';
    ctx.fillText(`واحد ${data.unitNumber}${floorStr}`, 760, 370);

    // Status Pill
    const pillY = 460;
    const pillColor = data.isOverdue ? '#ef4444' : '#10b981';
    ctx.fillStyle = pillColor;
    ctx.beginPath();
    ctx.rect(560, pillY, 200, 48);
    ctx.fill();

    ctx.font = 'bold 22px Vazirmatn, Tahoma, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(data.isOverdue ? 'دارای بدهی معوق' : 'وضعیت: تسویه', 660, pillY + 32);

    // Passcode & Security Badge
    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.font = '600 22px monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText(data.passCode, 60, 560);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    return texture;
  }
}
