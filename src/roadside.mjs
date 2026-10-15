import * as THREE from 'three';

// A small moving pool of optimized, downloaded photogrammetry meshes.
// Distant Kenney instances are restored as the detailed section moves on.
export function createRoadsideDetails(scene, assets, proxyBatches, mobile) {
  const pools = [], segments = { barrier: [], fence: [] };
  const transform = new THREE.Object3D();
  for (let i = 0; i < 330; i++) {
    for (const side of [-1, 1]) segments.barrier.push({ x:side * 8.4, y:.36, z:18 - i * 4.5, color:i % 2 ? 'red' : 'white' });
  }
  // Eight straight modules fill each 22 m section, without stretching diamonds.
  for (let section = 0; section < 64; section++) {
    for (let i = 0; i < 8; i++) {
      for (const side of [-1, 1]) segments.fence.push({ x:side * 9.05, y:.36, z:14 - section * 22 - 11 + (i + .5) * 2.75 });
    }
  }
  const behind = mobile ? 22 : 30, ahead = mobile ? 55 : 77;
  for (const [kind, template, color] of [['barrier', assets.realBarrierWhite, 'white'], ['barrier', assets.realBarrierRed, 'red'], ['fence', assets.realFence, null]]) {
    template.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(template), size = bounds.getSize(new THREE.Vector3());
    const length = kind === 'barrier' ? 4.5 : 2.75;
    const scale = new THREE.Vector3(length / size.x, kind === 'barrier' ? 1.12 / size.y : 3.2 / size.y,
      kind === 'barrier' ? .72 / size.z : 1.4);
    const capacity = kind === 'barrier' ? 72 : 112;
    const meshes = [];
    template.traverse(source => {
      if (!source.isMesh) return;
      const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
      const mesh = new THREE.InstancedMesh(geometry, source.material, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.count = 0; scene.add(mesh); meshes.push(mesh);
    });
    pools.push({ kind, color, scale, meshes });
  }
  let lastSection = null;
  function update(carZ) {
    const section = Math.floor((14 - carZ) / 22);
    if (section === lastSection) return;
    lastSection = section;
    const center = 14 - section * 22;
    const near = z => z >= center - ahead && z <= center + behind;
    for (const pool of pools) {
      // Keep complete fence proxy sections together at the detail boundary.
      const detailed = segment => near(pool.kind === 'fence' ? 14 - Math.round((14 - segment.z) / 22) * 22 : segment.z);
      const selected = segments[pool.kind].filter(segment => detailed(segment) && (!pool.color || segment.color === pool.color));
      pool.meshes.forEach(mesh => { mesh.count = selected.length; });
      selected.forEach((segment, index) => {
        transform.position.set(segment.x, segment.y, segment.z);
        transform.rotation.set(0, Math.PI / 2, 0); transform.scale.copy(pool.scale); transform.updateMatrix();
        pool.meshes.forEach(mesh => mesh.setMatrixAt(index, transform.matrix));
      });
      pool.meshes.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); });
    }
    for (const batch of proxyBatches) {
      let count = 0;
      batch.matrices.forEach((matrix, index) => {
        const z = batch.centers[index];
        if (!near(z) && z > carZ - 795 && z < carZ + 95) batch.mesh.setMatrixAt(count++, matrix);
      });
      batch.mesh.count = count; batch.mesh.instanceMatrix.needsUpdate = true; batch.mesh.computeBoundingSphere();
    }
  }
  return { update, diagnostics:() => ({ detailedBarriers:pools.filter(p=>p.kind==='barrier').reduce((n,p)=>n+p.meshes[0].count,0) }) };
}
