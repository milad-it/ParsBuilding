/**
 * WebGL Capability and Hardware Performance Detector
 */
export class WebGLDetector {
  private static isAvailableCache: boolean | null = null;

  public static isWebGLAvailable(): boolean {
    if (this.isAvailableCache !== null) {
      return this.isAvailableCache;
    }

    if (typeof window === 'undefined') {
      this.isAvailableCache = false;
      return false;
    }

    try {
      const canvas = document.createElement('canvas');
      const gl =
        canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl');
      this.isAvailableCache = !!gl;
    } catch {
      this.isAvailableCache = false;
    }

    return this.isAvailableCache;
  }

  public static prefersReducedMotion(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  public static getOptimalPixelRatio(): number {
    if (typeof window === 'undefined') return 1;
    return Math.min(window.devicePixelRatio || 1, 2.0);
  }
}
