import '@testing-library/jest-dom';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock HTMLCanvasElement.getContext for 2D & WebGL in JSDOM
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (contextType: string, ...args: any[]): any {
  if (contextType === '2d') {
    return {
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: new Array(4) }),
      putImageData: () => {},
      createImageData: () => [],
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      fillText: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      strokeRect: () => {},
      rect: () => {},
      fill: () => {},
      roundRect: () => {},
      createLinearGradient: () => ({
        addColorStop: () => {}
      }),
      measureText: (text: string) => ({ width: text.length * 10 }),
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      direction: 'rtl',
      textAlign: 'right'
    };
  }
  if (contextType === 'webgl' || contextType === 'webgl2' || contextType === 'experimental-webgl') {
    const glTarget: any = {
      VERSION: 7938,
      RENDERER: 7937,
      VENDOR: 7936,
      SHADING_LANGUAGE_VERSION: 35724,
      MAX_COMBINED_TEXTURE_IMAGE_UNITS: 35661,
      MAX_VERTEX_TEXTURE_IMAGE_UNITS: 35660,
      MAX_TEXTURE_IMAGE_UNITS: 34930,
      MAX_TEXTURE_SIZE: 3379,
      MAX_CUBE_MAP_TEXTURE_SIZE: 34076,
      MAX_VERTEX_ATTRIBS: 34921,
      MAX_VERTEX_UNIFORM_VECTORS: 36347,
      MAX_FRAGMENT_UNIFORM_VECTORS: 36348,
      MAX_RENDERBUFFER_SIZE: 34024,
      SCISSOR_BOX: 3088,
      VIEWPORT: 2978,
      BLEND: 3042,
      DEPTH_TEST: 2929,
      CULL_FACE: 2884,
      POLYGON_OFFSET_FILL: 32823,
      SAMPLE_ALPHA_TO_COVERAGE: 32926,
      SCISSOR_TEST: 3089,
      STENCIL_TEST: 2960,
      COMPILE_STATUS: 35713,
      LINK_STATUS: 35714,
      ACTIVE_UNIFORMS: 35718,
      ACTIVE_ATTRIBUTES: 35721,
      canvas: this,
      getExtension: (name: string) => {
        if (name === 'WEBGL_lose_context') {
          return { loseContext: () => {} };
        }
        return null;
      },
      getParameter: (param: number) => {
        if (!param || param === 7938) return 'WebGL 2.0';
        if (param === 7937) return 'WebKit WebGL';
        if (param === 7936) return 'WebKit';
        if (param === 35724) return 'WebGL GLSL ES 3.00';
        if (param === 3088 || param === 2978) return new Int32Array([0, 0, 800, 600]);
        if (param === 34076 || param === 3379) return 16384;
        if (param === 34930 || param === 35660 || param === 34921) return 16;
        if (param === 35661) return 32;
        if (param === 36347 || param === 36348) return 1024;
        if (param === 3386) return new Int32Array([16384, 16384]);
        if (param === 34024) return 16;
        return 1;
      },
      getShaderPrecisionFormat: () => ({ rangeMin: 1, rangeMax: 1, precision: 1 }),
      getProgramInfoLog: () => '',
      getShaderInfoLog: () => '',
      getActiveUniform: () => null,
      getActiveAttrib: () => null,
      getProgramParameter: (_prog: any, param: number) => {
        if (param === 35714) return true; // LINK_STATUS
        if (param === 35718) return 0; // ACTIVE_UNIFORMS
        if (param === 35721) return 0; // ACTIVE_ATTRIBUTES
        return true;
      },
      getShaderParameter: (_shader: any, param: number) => {
        if (param === 35713) return true; // COMPILE_STATUS
        return true;
      }
    };

    return new Proxy(glTarget, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return (..._args: any[]) => ({});
      }
    });
  }
  return null;
};

