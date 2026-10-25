/* Skyhold TD — render/post.js
   Post-processing adapted from Riftfall: a cheap mip-chain bloom, a depth-based ink outline that gives the
   voxels their drawn edge, a gentle colour grade and vignette. Riftfall's edge pass assumes a perspective
   camera; Skyhold's battlefield is orthographic, so depth is linear and edges use world-unit thresholds.
   Three quality tiers (auto-downgrading on slow devices, like Riftfall) keep phones smooth. */
import * as THREE from "three";

export const QUALITY = {
  2: { pr: 2, msaa: 4, shadow: 2048, bloom: 1, edges: 1, label: "High" },
  1: { pr: 1.5, msaa: 2, shadow: 1024, bloom: 1, edges: 1, label: "Medium" },
  0: { pr: 1, msaa: 0, shadow: 0, bloom: 0, edges: 0, label: "Low" },
};

export function createPost(renderer) {
  const FS = (() => {
    const s = new THREE.Scene(), c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    q.frustumCulled = false; s.add(q);
    return { draw(mat, target) { q.material = mat; renderer.setRenderTarget(target); renderer.render(s, c); } };
  })();
  const VERT = "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
  const fsMat = (frag, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false });

  const bright = fsMat(`uniform sampler2D tSrc; uniform float thr; varying vec2 vUv;
    void main() { vec3 c = texture2D(tSrc, vUv).rgb; float l = max(c.r, max(c.g, c.b));
      float k = clamp((l - thr + 0.5) / 1.0, 0.0, 1.0); k = k * k * 0.5; float w = max(k, l - thr) / max(l, 1e-4);
      gl_FragColor = vec4(min(c * w, vec3(10.0)), 1.0); }`, { tSrc: { value: null }, thr: { value: 1.2 } });
  const down = fsMat(`uniform sampler2D tSrc; uniform vec2 px; varying vec2 vUv;
    void main() { vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
      c += texture2D(tSrc, vUv + vec2(-px.x, -px.y)).rgb + texture2D(tSrc, vUv + vec2(px.x, -px.y)).rgb + texture2D(tSrc, vUv + vec2(-px.x, px.y)).rgb + texture2D(tSrc, vUv + vec2(px.x, px.y)).rgb;
      gl_FragColor = vec4(c / 8.0, 1.0); }`, { tSrc: { value: null }, px: { value: new THREE.Vector2() } });
  const up = fsMat(`uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 px; varying vec2 vUv;
    void main() { vec3 c = vec3(0.0);
      c += texture2D(tSrc, vUv + vec2(-px.x, 0.0)).rgb * 2.0 + texture2D(tSrc, vUv + vec2(px.x, 0.0)).rgb * 2.0;
      c += texture2D(tSrc, vUv + vec2(0.0, -px.y)).rgb * 2.0 + texture2D(tSrc, vUv + vec2(0.0, px.y)).rgb * 2.0;
      c += texture2D(tSrc, vUv + vec2(-px.x, -px.y)).rgb + texture2D(tSrc, vUv + vec2(px.x, -px.y)).rgb + texture2D(tSrc, vUv + vec2(-px.x, px.y)).rgb + texture2D(tSrc, vUv + vec2(px.x, px.y)).rgb;
      gl_FragColor = vec4(c / 12.0 + texture2D(tBase, vUv).rgb, 1.0); }`, { tSrc: { value: null }, tBase: { value: null }, px: { value: new THREE.Vector2() } });
  const final = fsMat(`uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tBloom;
    uniform vec2 texel; uniform float cnear, cfar, ink, bloomK, vig, edges, aspect, seed, flash, sat, ortho; uniform vec3 grade, flashCol;
    varying vec2 vUv;
    float lin(vec2 uv) { float z = texture2D(tDepth, uv).x;
      if (ortho > 0.5) return cnear + z * (cfar - cnear);
      z = z * 2.0 - 1.0; return 2.0 * cnear * cfar / (cfar + cnear - z * (cfar - cnear)); }
    void main() {
      vec3 col = texture2D(tColor, vUv).rgb;
      if (edges > 0.5) {
        float d0 = lin(vUv);
        float dl = lin(vUv - vec2(texel.x, 0.0)), dr = lin(vUv + vec2(texel.x, 0.0));
        float dd = lin(vUv - vec2(0.0, texel.y)), du = lin(vUv + vec2(0.0, texel.y));
        float far = max(max(dl, dr), max(dd, du)) - d0;
        float sil = smoothstep(0.35, 0.9, far);
        float crease = smoothstep(0.03, 0.09, abs(dl + dr - 2.0 * d0) + abs(dd + du - 2.0 * d0));
        float e = max(sil, crease * 0.45);
        if (d0 > cfar * 0.98) e = 0.0;
        col *= 1.0 - ink * e;
      }
      col += texture2D(tBloom, vUv).rgb * bloomK;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, sat) * grade;
      col = mix(col, flashCol, flash);
      vec2 q = (vUv - 0.5) * vec2(aspect, 1.0) * 1.4;
      col *= mix(1.0, smoothstep(1.25, 0.2, length(q)), vig);
      float n = fract(sin(dot(vUv * 913.7 + seed, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) / 255.0;
      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`, {
    tColor: { value: null }, tDepth: { value: null }, tBloom: { value: null }, texel: { value: new THREE.Vector2() },
    cnear: { value: 0.1 }, cfar: { value: 1000 }, ink: { value: 0.5 }, bloomK: { value: 0.42 }, vig: { value: 0.38 }, edges: { value: 1 },
    aspect: { value: 1 }, seed: { value: 0 }, grade: { value: new THREE.Vector3(1.02, 1.0, 1.04) }, sat: { value: 1.1 },
    flash: { value: 0 }, flashCol: { value: new THREE.Color(1, 0.2, 0.3) }, ortho: { value: 1 },
  });
  final.toneMapped = true;
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
  const rt = (W, H) => new THREE.WebGLRenderTarget(Math.max(1, W), Math.max(1, H), { type: THREE.HalfFloatType, depthBuffer: false });
  let main = null, w = 0, h = 0, msaa = -1;
  const chain = [];
  function make(W, H, samples) {
    if (main) { main.dispose(); chain.forEach((c) => c.dispose()); chain.length = 0; }
    main = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples, depthTexture: new THREE.DepthTexture(W, H) });
    let bw = W >> 1, bh = H >> 1;
    for (let i = 0; i < 5; i++) { chain.push(rt(bw, bh)); bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1); }
    for (let i = 0; i < 4; i++) chain.push(rt(chain[i].width, chain[i].height));
    w = W; h = H; msaa = samples;
  }
  const size = new THREE.Vector2();
  return {
    final,
    render(scene, camera, Q) {
      if (!Q.bloom && !Q.edges) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
      renderer.getDrawingBufferSize(size);
      if (!main || w !== size.x || h !== size.y || msaa !== Q.msaa) make(size.x, size.y, Q.msaa);
      renderer.setRenderTarget(main);
      renderer.render(scene, camera);
      let bloomTex = black;
      if (Q.bloom) {
        bright.uniforms.tSrc.value = main.texture;
        FS.draw(bright, chain[0]);
        for (let i = 1; i < 5; i++) { down.uniforms.tSrc.value = chain[i - 1].texture; down.uniforms.px.value.set(1 / chain[i - 1].width, 1 / chain[i - 1].height); FS.draw(down, chain[i]); }
        let src = chain[4];
        for (let i = 3; i >= 0; i--) {
          const dst = chain[5 + i];
          up.uniforms.tSrc.value = src.texture; up.uniforms.tBase.value = chain[i].texture; up.uniforms.px.value.set(1 / src.width, 1 / src.height);
          FS.draw(up, dst);
          src = dst;
        }
        bloomTex = src.texture;
      }
      const U = final.uniforms;
      U.tColor.value = main.texture; U.tDepth.value = main.depthTexture; U.tBloom.value = bloomTex;
      const k = Math.max(1, renderer.getPixelRatio() * 0.7);
      U.texel.value.set(k / size.x, k / size.y);
      U.cnear.value = camera.near; U.cfar.value = camera.far; U.aspect.value = size.x / size.y;
      U.ortho.value = camera.isOrthographicCamera ? 1 : 0;
      U.seed.value = (U.seed.value + 0.37) % 100;
      U.edges.value = Q.edges;
      FS.draw(final, null);
    },
    dispose() { if (main) main.dispose(); chain.forEach((c) => c.dispose()); },
  };
}
