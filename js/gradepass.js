import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Correção de cor no estilo arcade: mais saturação, mais contraste e vinheta nos cantos.
// Fica depois do bloom, antes do OutputPass — só ajusta a imagem final, sem precisar do buffer de profundidade.
export class GradePass extends Pass {
  constructor() {
    super();
    this.uniforms = { tDiffuse: { value: null } };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(vec3(lum), c, 1.22);
          c = (c - 0.5) * 1.1 + 0.5;
          vec2 d = vUv - 0.5;
          float vig = smoothstep(0.95, 0.35, dot(d, d) * 2.1);
          c *= mix(0.8, 1.0, vig);
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
        }`,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) { renderer.setRenderTarget(null); this.fsQuad.render(renderer); }
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); this.fsQuad.render(renderer); }
  }
  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}
