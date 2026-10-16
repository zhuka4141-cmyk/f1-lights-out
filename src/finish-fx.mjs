import * as THREE from 'three';

// Two instanced streak buffers form upward cold-spark fountains at the finish.
// All particles are recycled; the effect adds two draw calls only while active.
export function createFinishSparks(scene, finishZ, mobile, reducedMotion) {
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const count = reducedMotion ? 100 : mobile ? 300 : 560;
  const positions = new Float32Array(count * 6), colors = new Float32Array(count * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true,
    transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  lines.frustumCulled = false; group.add(lines);
  const tips = new THREE.BufferGeometry(); tips.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const points = new THREE.Points(tips, new THREE.PointsMaterial({ color: '#fff4cd', size: .055,
    transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  points.frustumCulled = false; group.add(points);
  const particles = Array.from({ length: count }, (_, i) => ({
    // An initial burst is already tall on the first crossing frame; subsequent
    // particles keep the fountains flowing as the car passes beneath the arch.
    side: i % 2 ? 1 : -1, delay: i < count * .35 ? -.12 - Math.random() * .4 : Math.random() * 1.5, vx: (Math.random() - .5) * 1.5,
    vz: (Math.random() - .5) * 1.8, vy: 8 + Math.random() * 5, life: .55 + Math.random() * .65,
    trail: .012 + Math.random() * .035, phase: Math.random() * 6.28,
  }));
  let startedAt = null, active = false;
  function reset() { startedAt = null; active = false; group.visible = false; }
  return {
    start(now) { if (startedAt !== null) return; startedAt = now; active = true; },
    get active() { return active; },
    reset,
    update(now) {
      if (startedAt === null) return;
      const age = Math.max(0, (now - startedAt) / 1000);
      if (age > 2.9) { active = false; group.visible = false; return; }
      group.visible = true;
      particles.forEach((particle, i) => {
        const t = age - particle.delay, visible = t >= 0 && t < particle.life;
        const x = particle.side * 7.55 + particle.vx * t, z = finishZ - 1.5 + particle.vz * t;
        const y = visible ? .55 + particle.vy * t - 4.905 * t * t : -100;
        const tail = Math.max(0, t - particle.trail), offset = i * 6;
        positions[offset] = x; positions[offset + 1] = y; positions[offset + 2] = z;
        positions[offset + 3] = particle.side * 7.55 + particle.vx * tail;
        positions[offset + 4] = visible ? .55 + particle.vy * tail - 4.905 * tail * tail : -100;
        positions[offset + 5] = finishZ - 1.5 + particle.vz * tail;
        const brightness = Math.max(0, 1 - t / particle.life) * (.8 + .2 * Math.sin(t * 90 + particle.phase));
        colors[offset] = 1.5 * brightness; colors[offset + 1] = 1.4 * brightness; colors[offset + 2] = 1.05 * brightness;
        colors[offset + 3] = .8 * brightness; colors[offset + 4] = .59 * brightness; colors[offset + 5] = .22 * brightness;
        const tip = i * 3, tipPositions = tips.attributes.position.array;
        tipPositions[tip] = x; tipPositions[tip + 1] = y; tipPositions[tip + 2] = z;
      });
      geometry.attributes.position.needsUpdate = geometry.attributes.color.needsUpdate = true;
      tips.attributes.position.needsUpdate = true;
    },
  };
}
