import * as THREE from 'three';
import { createDebrisMotion, sampleDebris } from './impact.mjs';

export function createCollisionEffects(scene, roadblocks, mobile, reducedMotion) {
  const effects = new THREE.Group(); effects.visible = false; scene.add(effects);
  const fragments = [];
  roadblocks.updateMatrixWorld(true);
  roadblocks.traverse(original => {
    if (!original.isMesh) return;
    // Detach authored parts of the downloaded model, retaining their shape.
    const geometry = original.geometry.index ? original.geometry.toNonIndexed() : original.geometry.clone();
    geometry.applyMatrix4(original.matrixWorld); geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    const halfSize = geometry.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(.5);
    geometry.translate(-center.x, -center.y, -center.z);
    const mesh = new THREE.Mesh(geometry, original.material);
    mesh.position.copy(center); mesh.castShadow = !mobile; mesh.receiveShadow = true;
    effects.add(mesh);
    fragments.push({ mesh, halfSize, origin: { x:center.x, y:center.y, z:center.z, floor:.36 + Math.min(.65, halfSize.y * .5) } });
  });
  function particleTexture(smoke) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    const pixels = context.createImageData(128, 128);
    const hash = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
    const noise = (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), sx),
        THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx), sy);
    };
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const u = x / 127, v = y / 127, radius = Math.hypot(u - .5, v - .5) * 2;
      const cloud = .55 * noise(u * 7, v * 7) + .3 * noise(u * 16, v * 16) + .15 * noise(u * 35, v * 35);
      const edge = radius + (cloud - .5) * .65;
      const density = Math.max(0, Math.min(1, (1 - edge) * 2.3)) * Math.max(0, 1 - radius ** 3);
      const hot = Math.max(0, 1 - edge * 1.5), i = (y * 128 + x) * 4;
      pixels.data[i] = 255;
      pixels.data[i + 1] = smoke ? 255 : 70 + 180 * hot;
      pixels.data[i + 2] = smoke ? 255 : 8 + 170 * hot ** 3;
      pixels.data[i + 3] = 255 * density * (smoke ? .4 + cloud * .6 : .65 + cloud * .35);
    }
    context.putImageData(pixels, 0, 0);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const glow = particleTexture(false), smokeMap = particleTexture(true);
  const makeParticles = (count, smoke) => Array.from({ length: count }, () => {
    const material = new THREE.SpriteMaterial({ map:smoke ? smokeMap : glow, color:smoke ? '#45433f' : '#ffffff',
      transparent:true, opacity:0, depthWrite:false, blending:THREE.NormalBlending, toneMapped:smoke });
    const sprite = new THREE.Sprite(material); effects.add(sprite);
    return { sprite, smoke };
  });
  const particles = [...makeParticles(mobile ? 13 : 21, false), ...makeParticles(mobile ? 11 : 19, true)];
  const sparkCount = mobile ? 65 : 110, sparkPositions = new Float32Array(sparkCount * 3);
  const sparkGeometry = new THREE.BufferGeometry(); sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  const sparkMaterial = new THREE.PointsMaterial({ map:glow, color:'#ffbd56', size:.14, transparent:true,
    blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial); sparks.frustumCulled = false; effects.add(sparks);
  const flash = new THREE.PointLight('#ff963b', 0, 28, 2); scene.add(flash);
  let state = null;
  const rotationMatrix = new THREE.Matrix4();
  return {
    start(now, { x, z, speed, engine = false }) {
      if (state) return;
      const strength = .35 + .65 * Math.min(1, Math.max(0, speed / 250));
      state = { startedAt:now, x, z, strength, engine, sparks:[] };
      roadblocks.visible = engine; effects.visible = true;
      fragments.forEach(fragment => {
        fragment.mesh.visible = !engine;
        if (!engine) fragment.motion = createDebrisMotion(fragment.origin, x, speed);
      });
      for (const p of particles) {
        Object.assign(p, { delay:Math.random() * (p.smoke ? .45 : .18), life:p.smoke ? 3.6 + Math.random() * 1.2 : .55 + Math.random() * .65,
          dx:(Math.random() - .5) * (p.smoke ? 5 : 4), dz:(Math.random() - .5) * 4,
          rise:p.smoke ? 2 + Math.random() * 2.3 : 1 + Math.random() * 2.8,
          size:p.smoke ? 2.3 + Math.random() * 2.6 : 1.4 + Math.random() * 2.6 });
        p.sprite.material.rotation = Math.random() * Math.PI * 2;
        p.sprite.material.opacity = 0;
      }
      for (let i = 0; i < sparkCount; i++) state.sparks.push({
        vx:(Math.random() - .5) * 23 * strength, vy:(3 + Math.random() * 12) * strength,
        vz:-(1 + Math.random() * 23) * strength, life:.6 + Math.random() * 1.5,
      });
      flash.position.set(x, 2.2, z + 1);
    },
    update(now) {
      if (!state) return null;
      const age = Math.max(0, (now - state.startedAt) / 1000), { x, z, strength } = state;
      fragments.forEach(({ mesh, motion, halfSize }) => {
        if (state.engine) return;
        const sample = sampleDebris(motion, age);
        mesh.position.set(sample.x, sample.y, sample.z); mesh.rotation.set(...sample.rotation);
        rotationMatrix.makeRotationFromEuler(mesh.rotation);
        const e = rotationMatrix.elements;
        const extent = Math.abs(e[1]) * halfSize.x + Math.abs(e[5]) * halfSize.y + Math.abs(e[9]) * halfSize.z;
        mesh.position.y = Math.max(mesh.position.y, .36 + extent);
      });
      particles.forEach(p => {
        const t = age - p.delay, progress = t / p.life;
        p.sprite.visible = progress >= 0 && progress < 1;
        if (!p.sprite.visible) return;
        const expansion = p.smoke ? .45 + progress * 1.8 : .35 + Math.sin(progress * Math.PI) * 1.15;
        p.sprite.scale.setScalar(p.size * expansion * strength);
        p.sprite.position.set(x + p.dx * (.35 + progress), 1 + t * p.rise, z + p.dz - t * 1.3);
        p.sprite.material.opacity = Math.sin(Math.PI * progress) * (p.smoke ? .6 : .95);
        if (!p.smoke) p.sprite.material.color.setRGB(1, 1 - .3 * progress, 1 - .75 * progress);
      });
      state.sparks.forEach((spark, i) => {
        const alive = age < spark.life;
        sparkPositions[i * 3] = x + spark.vx * age / (1 + age * .6);
        sparkPositions[i * 3 + 1] = alive ? Math.max(.38, 1.2 + spark.vy * age - 4.905 * age ** 2) : -100;
        sparkPositions[i * 3 + 2] = z + spark.vz * age / (1 + age * .5);
      });
      sparkGeometry.attributes.position.needsUpdate = true;
      sparkMaterial.opacity = Math.max(0, 1 - age / 2.2);
      flash.intensity = (reducedMotion ? 55 : 220) * strength * Math.exp(-age * 6);
      return age;
    },
    reset() {
      state = null; effects.visible = false; roadblocks.visible = true; flash.intensity = 0;
      particles.forEach(p => { p.sprite.material.opacity = 0; });
    },
  };
}
