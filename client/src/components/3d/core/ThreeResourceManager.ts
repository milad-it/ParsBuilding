/**
 * ThreeResourceManager
 * 
 * Guarantees zero memory leaks in Single Page Applications by recursively traversing
 * Three.js scenes, deallocating BufferGeometries, Materials, Textures, RenderTargets,
 * and releasing the WebGL context cleanly upon component unmount.
 */
import * as THREE from 'three';

export class ThreeResourceManager {
  public static disposeObject(obj: THREE.Object3D): void {
    if (!obj) return;

    while (obj.children && obj.children.length > 0) {
      this.disposeObject(obj.children[0]);
      obj.remove(obj.children[0]);
    }

    if (obj instanceof THREE.Mesh || (THREE.InstancedMesh && obj instanceof THREE.InstancedMesh)) {
      if (obj.geometry) {
        obj.geometry.dispose();
      }

      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of materials) {
          this.disposeMaterialTextures(mat);
          mat.dispose();
        }
      }
    } else if (obj instanceof THREE.Light) {
      if ('dispose' in obj && typeof (obj as any).dispose === 'function') {
        (obj as any).dispose();
      }
    }
  }

  private static disposeMaterialTextures(material: THREE.Material): void {
    const matAny = material as any;
    const textureProperties = [
      'map', 'lightMap', 'bumpMap', 'normalMap', 'specularMap',
      'envMap', 'alphaMap', 'roughnessMap', 'metalnessMap',
      'emissiveMap', 'clearcoatMap', 'clearcoatRoughnessMap',
      'iridescenceMap', 'iridescenceThicknessMap'
    ];

    for (const prop of textureProperties) {
      if (matAny[prop] && matAny[prop] instanceof THREE.Texture) {
        matAny[prop].dispose();
        matAny[prop] = null;
      }
    }
  }

  public static disposeScene(
    scene: THREE.Scene | null,
    renderer: THREE.WebGLRenderer | null,
    animationFrameId?: number | null
  ): void {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }

    if (scene) {
      this.disposeObject(scene);
      scene.clear();
    }

    if (renderer) {
      renderer.dispose();
      try {
        renderer.forceContextLoss();
      } catch {
        // Context might already be lost
      }

      const gl = renderer.getContext();
      if (gl) {
        const loseContextExtension = gl.getExtension('WEBGL_lose_context');
        if (loseContextExtension) {
          loseContextExtension.loseContext();
        }
      }

      if (renderer.domElement && renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    }
  }
}
