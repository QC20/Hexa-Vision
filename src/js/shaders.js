// ─────────────────────────────────────────────────────────────────────────────
// Hexa Vision — Shaders
//
// Surface shaders for the displaced icosahedron, and the HexaVision pass that
// turns the finished frame into a compound eye.
// ─────────────────────────────────────────────────────────────────────────────

export const RIPPLE_COUNT = 4;

// ─────────────────────────────────────────────────────────────────────────────
// Surface — Vertex
// ─────────────────────────────────────────────────────────────────────────────

export const surfaceVertexShader = /* glsl */ `
  #define RIPPLE_COUNT ${RIPPLE_COUNT}

  uniform float uTime;
  uniform float uFlowTime;
  uniform float uScale;
  uniform float uNoiseScale;
  uniform float uNoiseStrength;
  uniform float uDisplacementStrength;
  uniform vec4  uRipples[RIPPLE_COUNT]; // xyz = direction on the unit sphere, w = start time

  varying vec3 vNormal;
  varying float vShellPattern;
  varying float vRipple;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 uv, float timeOffset) {
    vec2 i = floor(uv);
    vec2 f = fract(uv);
    float a = hash(i + vec2(timeOffset));
    float b = hash(i + vec2(1.0, 0.0) + vec2(timeOffset));
    float c = hash(i + vec2(0.0, 1.0) + vec2(timeOffset));
    float d = hash(i + vec2(1.0, 1.0) + vec2(timeOffset));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // F2 - F1 Voronoi for a single animation keyframe.
  float voronoiAt(vec2 g, vec2 f, float key) {
    float minDist = 1.0;
    float secondMinDist = 1.0;

    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 lattice = vec2(x, y);
        vec2 perturbed = lattice + uNoiseStrength * (noise((g + lattice) * uNoiseScale, key) * 2.0 - 1.0);
        vec2 point = hash(g + perturbed) + perturbed - f;
        float dist = length(point);
        if (dist < minDist) {
          secondMinDist = minDist;
          minDist = dist;
        } else if (dist < secondMinDist) {
          secondMinDist = dist;
        }
      }
    }

    return secondMinDist - minDist;
  }

  // Keyframes sit on whole numbers of t, and fract(t) blends between them,
  // so the pattern morphs continuously without ever jumping.
  float voronoi(vec2 uv, float t) {
    vec2 g = floor(uv);
    vec2 f = fract(uv);
    float key = floor(t);
    float a = smoothstep(0.0, 1.0, fract(t));
    return mix(voronoiAt(g, f, key), voronoiAt(g, f, key + 1.0), a);
  }

  float triplanar(vec3 p, vec3 normal, float t) {
    vec3 blending = abs(normal);
    blending = normalize(max(blending, 0.00001));
    blending /= (blending.x + blending.y + blending.z);

    float x = voronoi(p.yz * uScale, t);
    float y = voronoi(p.xz * uScale, t);
    float z = voronoi(p.xy * uScale, t);

    return (x * blending.x + y * blending.y + z * blending.z);
  }

  // Rings that travel across the sphere from wherever it was touched.
  float ripple(vec3 dir) {
    float sum = 0.0;
    for (int i = 0; i < RIPPLE_COUNT; i++) {
      vec4 r = uRipples[i];
      float age = uTime - r.w;
      if (age < 0.0 || age > 5.0) continue;

      float angle = acos(clamp(dot(dir, r.xyz), -1.0, 1.0));
      float x = angle - age * 1.4;
      float trough = x + 0.3;
      float ring = exp(-x * x * 14.0) - 0.45 * exp(-trough * trough * 14.0);
      sum += ring * exp(-age * 0.7) * smoothstep(0.0, 0.08, age);
    }
    return sum;
  }

  void main() {
    vec3 displacedPosition = position;

    float patternValue = triplanar(position, normal, uFlowTime);
    vShellPattern = patternValue;

    float softPattern = smoothstep(0.2, 0.8, patternValue);
    float wave = ripple(normalize(position));
    vRipple = wave;

    float rippleLift = wave * 0.4 * (1.0 + softPattern * abs(uDisplacementStrength) * 0.5);
    displacedPosition += normal * (softPattern * uDisplacementStrength + rippleLift);

    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Surface — Fragment
// ─────────────────────────────────────────────────────────────────────────────

export const surfaceFragmentShader = /* glsl */ `
  uniform float uDepth;
  uniform vec3 uColor;
  uniform float uOutlineWidth;
  uniform vec3 uOutlineColor;
  uniform vec3 uSecondaryColor;

  varying vec3 vNormal;
  varying float vShellPattern;
  varying float vRipple;

  void main() {
    float steppedPattern = smoothstep(uOutlineWidth, uOutlineWidth + 0.2, vShellPattern);

    vec3 lightDirection = normalize(vec3(0.5, 0.5, 1.0));
    float lighting = dot(vNormal, lightDirection) * 0.5 + 0.5;

    vec3 baseColor = mix(uOutlineColor, uSecondaryColor, steppedPattern);
    float highlightIntensity = smoothstep(0.0, 0.5, vShellPattern);
    vec3 finalColor = baseColor + uColor * highlightIntensity * uDepth * lighting;

    // Ripples glow on their own so they still read on the dark side.
    vec3 rippleGlow = uColor * max(vRipple, 0.0) * 1.2;

    gl_FragColor = vec4(finalColor * lighting + rippleGlow, 1.0);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// HexaVision Pass
//
// A proper honeycomb: two offset rectangular grids, and each pixel picks the
// nearer centre. Each cell is shaded like a small lens with a darker rim and a
// little colour fringing. A soft fisheye follows the finger and swells the
// cells under it.
// ─────────────────────────────────────────────────────────────────────────────

export const hexPassVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const hexPassFragmentShader = /* glsl */ `
  varying vec2 vUv;

  uniform sampler2D tDiffuse;
  uniform vec2  uResolution;  // drawing buffer size in pixels
  uniform float uCellSize;    // cell width in drawing buffer pixels
  uniform float uFacet;       // 0 = flat cells, 1 = every cell shows its own little image
  uniform float uGap;         // dark border between cells
  uniform float uPrism;       // colour fringing inside each cell
  uniform float uMix;         // 0 = plain render, 1 = full compound eye
  uniform vec3  uLens;        // xy = centre in uv, z = strength
  uniform float uLensRadius;  // in units of screen height

  const vec2 HEX = vec2(1.0, 1.7320508);

  // xy = position inside the cell, zw = cell centre (both in cell units).
  vec4 hexCoords(vec2 p) {
    vec2 h = HEX * 0.5;
    vec2 a = mod(p, HEX) - h;
    vec2 b = mod(p - h, HEX) - h;
    vec2 local = dot(a, a) < dot(b, b) ? a : b;
    return vec4(local, p - local);
  }

  // 0 at the centre, 0.5 on the edge.
  float hexDist(vec2 p) {
    p = abs(p);
    return max(dot(p, normalize(HEX)), p.x);
  }

  void main() {
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);

    vec2 toLens = (vUv - uLens.xy) * aspect;
    float falloff = 1.0 - smoothstep(0.0, uLensRadius, length(toLens));
    vec2 uv = uLens.xy + (vUv - uLens.xy) * (1.0 - uLens.z * 0.55 * falloff);

    vec2 cellUv = vec2(uCellSize) / uResolution;
    vec4 hex = hexCoords(uv / cellUv);
    vec2 local = hex.xy;
    vec2 centerUv = hex.zw * cellUv;
    float edge = hexDist(local);

    vec2 sampleUv = centerUv + local * cellUv * uFacet * 6.0;
    vec2 fringe = local * cellUv * uPrism;

    vec3 color;
    color.r = texture2D(tDiffuse, sampleUv + fringe).r;
    color.g = texture2D(tDiffuse, sampleUv).g;
    color.b = texture2D(tDiffuse, sampleUv - fringe).b;

    float aa = 1.5 / uCellSize;
    float mask = 1.0 - smoothstep(0.5 - uGap - aa, 0.5 - uGap, edge);
    float rim = 1.0 - 0.55 * pow(edge * 2.0, 2.5);

    vec3 eye = color * mask * rim;
    vec3 plain = texture2D(tDiffuse, vUv).rgb;

    gl_FragColor = vec4(mix(plain, eye, uMix), 1.0);
  }
`;
