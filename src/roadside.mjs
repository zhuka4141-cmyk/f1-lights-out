import * as THREE from 'three';

// A small moving pool of the downloaded, unmodified photogrammetry meshes.
// Distant Kenney instances are restored as the detailed section moves on.
export function createRoadsideDetails(scene, assets, proxyBatches, mobile) {
  const pools = [], segments = { barrier: [], fence: [] };
  const transform = new THREE.Object3D(), hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < 330; i++) {
    for (const side of [-1, 1]) segments.barrier.push({ x:side * 8.4, y:.36, z:18 - i * 4.5 });
  }
  // Eight straight modules fill each 22 m section, without stretching diamonds.
  for (let section = 0; section < 64; section++) {
    for (let i = 0; i < 8; i++) {
      for (const side of [-1, 1]) segments.fence.push({ x:side * 9.05, y:.36, z:14 - section * 22 - 11 + (i + .5) * 2.75 });
    }
  }
  const behind = mobile ? 22 : 30, ahead = mobile ? 55 : 77;
  for (const [kind, template] of [['barrier', assets.realBarrier], ['fence', assets.realFence]]) {
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
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      mesh.count = 0; scene.add(mesh); meshes.push(mesh);
    });
    pools.push({ kind, scale, meshes });
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
      const selected = segments[pool.kind].filter(detailed);
      pool.meshes.forEach(mesh => { mesh.count = selected.length; });
      selected.forEach((segment, index) => {
        transform.position.set(segment.x, segment.y, segment.z);
        transform.rotation.set(0, Math.PI / 2, 0); transform.scale.copy(pool.scale); transform.updateMatrix();
        pool.meshes.forEach(mesh => mesh.setMatrixAt(index, transform.matrix));
      });
      pool.meshes.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
      for (const batch of proxyBatches.filter(batch => batch.kind === pool.kind)) {
        batch.matrices.forEach((matrix, index) => batch.mesh.setMatrixAt(index, near(batch.centers[index]) ? hidden : matrix));
        batch.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
  return { update };
}
