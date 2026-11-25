/** WebGL2 海上视认渲染器: 编译着色器、管理 uniform、动画循环与资源释放 */

import { SEA_VERT, SEA_FRAG } from './shaders';

export interface SeaUniforms {
  haze: number;
  reflect: number;
  beam: number;
  transmission: number;
  intensity: number;
  sweep: number;
  lightColor: [number, number, number];
  sectorColor: [number, number, number];
  blocked: number;
}

export const DEFAULT_SEA_UNIFORMS: SeaUniforms = {
  haze: 0.35,
  reflect: 0.55,
  beam: 1,
  transmission: 1,
  intensity: 1,
  sweep: 0,
  lightColor: [1, 0.86, 0.55],
  sectorColor: [1, 1, 1],
  blocked: 0,
};

export class SeaRenderer {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private locs: Record<string, WebGLUniformLocation | null> = {};
  private raf = 0;
  private start = performance.now();
  private running = false;
  uniforms: SeaUniforms = { ...DEFAULT_SEA_UNIFORMS };
  /** 每帧回调, 用于从灯质时间轴更新 beam */
  onFrame?: (timeS: number) => void;
  failed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    let gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) {
      // 尝试 swiftshader/experimental
      gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    }
    if (!gl) {
      this.failed = true;
      return;
    }
    this.gl = gl;
    try {
      this.prog = this.buildProgram(SEA_VERT, SEA_FRAG);
      gl.useProgram(this.prog);
      for (const name of [
        'uRes', 'uTime', 'uHaze', 'uReflect', 'uBeam', 'uTransmission', 'uIntensity',
        'uSweep', 'uLightColor', 'uSectorColor', 'uBlocked',
      ]) {
        this.locs[name] = gl.getUniformLocation(this.prog, name);
      }
    } catch (e) {
      console.error('SeaRenderer shader error', e);
      this.failed = true;
    }
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl!;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      console.error(log, src);
      throw new Error('着色器编译失败: ' + log);
    }
    return sh;
  }
  private buildProgram(vs: string, fs: string): WebGLProgram {
    const gl = this.gl!;
    const p = gl.createProgram()!;
    gl.attachShader(p, this.compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this.compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('程序链接失败: ' + gl.getProgramInfoLog(p));
    return p;
  }

  resize() {
    const gl = this.gl;
    if (!gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  }

  startLoop() {
    if (!this.gl || this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
  dispose() {
    this.stop();
    if (this.gl && this.prog) this.gl.deleteProgram(this.prog);
  }

  render() {
    const gl = this.gl;
    if (!gl || !this.prog) return;
    this.resize();
    const t = (performance.now() - this.start) / 1000;
    this.onFrame?.(t);
    const u = this.uniforms;
    gl.useProgram(this.prog);
    gl.uniform2f(this.locs.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.locs.uTime, t);
    gl.uniform1f(this.locs.uHaze, u.haze);
    gl.uniform1f(this.locs.uReflect, u.reflect);
    gl.uniform1f(this.locs.uBeam, u.beam);
    gl.uniform1f(this.locs.uTransmission, u.transmission);
    gl.uniform1f(this.locs.uIntensity, u.intensity);
    gl.uniform1f(this.locs.uSweep, u.sweep + t * 0.25);
    gl.uniform3fv(this.locs.uLightColor, u.lightColor);
    gl.uniform3fv(this.locs.uSectorColor, u.sectorColor);
    gl.uniform1f(this.locs.uBlocked, u.blocked);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
