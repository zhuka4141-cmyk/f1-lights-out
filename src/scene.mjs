import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { RGBELoader } from '../vendor/RGBELoader.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { RULES } from './core.mjs';
import { createRoadsideDetails } from './roadside.mjs';
import { createCollisionEffects } from './collision-fx.mjs';
import { createVegetation } from './vegetation.mjs';

const assetURL = file => new URL(`../assets/${file}`, import.meta.url).href;
const modelNames = ['formula2022', 'roadStraightLong', 'roadStartPositions', 'grass',
  'grandStandCovered', 'pitsGarage', 'pitsOffice', 'pitsOfficeRoof', 'lightPostLarge',
  'fenceStraight', 'barrierRed', 'barrierWhite', 'bannerTowerRed',
  'flagCheckers', 'overhead', 'overheadLights', 'roadblock', 'roadblock-light'];

// Existing downloaded meshes supply every model. Scanned assets have offline
// mesh optimization; their photographic PBR textures keep their full resolution.
export async function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const mobile = matchMedia('(max-width: 600px)').matches;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog('#bfcbd0', 250, 780);
  const camera = new THREE.PerspectiveCamera(52, 1, .35, 1100);
  const loader = new GLTFLoader(), textureLoader = new THREE.TextureLoader();
  const assets = {};
  const loadTexture = async (file, color = false) => {
    const texture = await textureLoader.loadAsync(assetURL(`textures/${file}`));
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  };
  const [asphalt, asphaltNormal, asphaltRough, metalNormal, metalRough,
    concrete, concreteNormal, concreteRough, grass, grassNormal, grassRough, environment] = await Promise.all([
    loadTexture('asphalt-color.jpg', true), loadTexture('asphalt-normal.jpg'), loadTexture('asphalt-roughness.jpg'),
    loadTexture('metal-normal.jpg'), loadTexture('metal-roughness.jpg'),
    loadTexture('concrete_wall_001-color.jpg', true), loadTexture('concrete_wall_001-normal.jpg'), loadTexture('concrete_wall_001-roughness.jpg'),
    loadTexture('aerial_grass_rock-color.jpg', true), loadTexture('aerial_grass_rock-normal.jpg'), loadTexture('aerial_grass_rock-roughness.jpg'),
    new RGBELoader().loadAsync(assetURL('textures/autumn-field.hdr')),
  ]);
  environment.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = environment; scene.background = environment;
  scene.backgroundBlurriness = .035;
  const ambient = new THREE.HemisphereLight('#dce8ff', '#6f7164', .24); scene.add(ambient);
  const sun = new THREE.DirectionalLight('#fff1dc', 3.4);
  sun.castShadow = true; sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 5, far: 175 });
  sun.shadow.normalBias = .025; sun.shadow.bias = -.00006; sun.shadow.radius = 2;
  const sunOffset = new THREE.Vector3(-52, 68, 35), shadowFocus = new THREE.Vector3();
  const shadowRight = new THREE.Vector3().crossVectors(sunOffset, new THREE.Vector3(0, 1, 0)).normalize();
  const shadowUp = new THREE.Vector3().crossVectors(shadowRight, sunOffset).normalize();
  const shadowTexel = 76 / sun.shadow.mapSize.x;
  scene.add(sun, sun.target);

  await Promise.all(modelNames.map(async name => {
    const { scene: model } = await loader.loadAsync(assetURL(`models/${name}.glb`));
    const box = new THREE.Box3().setFromObject(model), center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x; model.position.y -= box.min.y; model.position.z -= center.z;
    const wrapper = new THREE.Group(); wrapper.add(model); assets[name] = wrapper;
    const advertMeshes = [];
    model.traverse(mesh => {
      if (!mesh.isMesh) return;
      if (mesh.material.name === 'tankco') { advertMeshes.push(mesh); return; }
      mesh.castShadow = true; mesh.receiveShadow = true;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        material.envMapIntensity = .55;
        if (name === 'roadblock' || name === 'formula2022') continue;
        material.roughness = .8; material.metalness = .05;
        if (material.name === 'road') {
          material.color.set('#c0c3c4'); material.map = asphalt;
          material.normalMap = asphaltNormal; material.normalScale = new THREE.Vector2(.48, .48);
          material.roughnessMap = asphaltRough; material.roughness = 1; material.metalness = 0;
        } else if (material.name === 'grass') {
          material.color.set('#c0c9a0'); material.map = grass; material.normalMap = grassNormal;
          material.normalScale = new THREE.Vector2(.35, .35); material.roughnessMap = grassRough;
          material.roughness = 1; material.metalness = 0;
        } else if (name === 'fenceStraight' || name === 'lightPostLarge') {
          material.color.set('#737a7b'); material.roughness = .55; material.metalness = .78;
          material.normalMap = metalNormal; material.normalScale = new THREE.Vector2(.03, .03);
          material.roughnessMap = metalRough;
        } else if (name === 'barrierRed' || name === 'barrierWhite') {
          material.color.set(name === 'barrierRed' ? '#b72d23' : '#d7d5cc'); material.roughness = .95; material.metalness = 0;
        } else if (material.name === 'grey' || material.name === 'white') {
          material.color.set('#d2d6cf'); material.map = concrete; material.roughnessMap = concreteRough;
          material.normalMap = concreteNormal; material.normalScale = new THREE.Vector2(.2, .2);
          material.metalness = .04;
        } else if (material.name === 'glass') {
          material.color.set('#7c9da9'); material.roughness = .17; material.metalness = .12; material.envMapIntensity = 1.1;
        } else if (material.name === 'red') {
          material.color.set('#a52c23'); material.roughness = .68; material.metalness = 0;
        }
      }
    });
    advertMeshes.forEach(mesh => mesh.removeFromParent());
  }));

  const [barrierModel, fenceKit, fenceAlpha, shutterModel, treeModel, treeAlpha, redPaint, whitePaint, treeAtlas, treeMeta] = await Promise.all([
    loader.loadAsync(assetURL('models/photoreal/concrete_road_barrier_02/concrete_road_barrier_02_web.gltf')),
    loader.loadAsync(assetURL('models/photoreal/modular_chainlink_fence/modular_chainlink_fence_web.gltf')),
    textureLoader.loadAsync(assetURL('models/photoreal/modular_chainlink_fence/textures/modular_chainlink_fence_wire_alpha_1k.png')),
    loader.loadAsync(assetURL('models/photoreal/rollershutter_door/rollershutter_door_1k.gltf')),
    loader.loadAsync(assetURL('models/photoreal/jacaranda_tree/jacaranda_tree_shadow.gltf')),
    textureLoader.loadAsync(assetURL('models/photoreal/jacaranda_tree/textures/jacaranda_tree_leaves_alpha_1k.png')),
    textureLoader.loadAsync(assetURL('models/photoreal/concrete_road_barrier_02/textures/concrete_road_barrier_02_red_1k.jpg')),
    textureLoader.loadAsync(assetURL('models/photoreal/concrete_road_barrier_02/textures/concrete_road_barrier_02_white_1k.jpg')),
    textureLoader.loadAsync(assetURL('models/photoreal/jacaranda_tree/jacaranda_tree_atlas.webp')),
    fetch(assetURL('models/photoreal/jacaranda_tree/jacaranda_tree_atlas.json')).then(response => {
      if (!response.ok) throw Error('Tree atlas metadata could not be loaded');
      return response.json();
    }),
  ]);
  // Select the authored straight module, retaining its PBR textures and shape.
  const normalize = object => {
    const model = object.clone(true), bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.add(new THREE.Vector3(-center.x, -bounds.min.y, -center.z));
    const group = new THREE.Group(); group.add(model);
    model.traverse(mesh => {
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        material.envMapIntensity = .65;
        for (const value of Object.values(material)) if (value?.isTexture) value.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        if (material.name.includes('_wire') || material.name.endsWith('_leaves')) {
          const map = material.map, alpha = (material.name.includes('_wire') ? fenceAlpha : treeAlpha).clone();
          alpha.wrapS = map.wrapS; alpha.wrapT = map.wrapT; alpha.offset.copy(map.offset);
          alpha.repeat.copy(map.repeat); alpha.rotation = map.rotation; alpha.center.copy(map.center);
          alpha.flipY = map.flipY; alpha.anisotropy = map.anisotropy;
          material.alphaMap = alpha; material.alphaTest = material.name.endsWith('_leaves') ? .45 : .4; material.transparent = false;
          material.alphaToCoverage = true; material.depthWrite = true; material.side = THREE.DoubleSide;
          material.needsUpdate = true;
        }
      }
    });
    return group;
  };
  const barrierTemplate = normalize(barrierModel.scene);
  for (const [name, paint] of [['realBarrierRed', redPaint], ['realBarrierWhite', whitePaint]]) {
    assets[name] = barrierTemplate.clone(true);
    assets[name].traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.material = mesh.material.clone();
      const source = mesh.material.map, map = paint.clone();
      map.colorSpace = source.colorSpace; map.flipY = source.flipY;
      map.wrapS = source.wrapS; map.wrapT = source.wrapT; map.offset.copy(source.offset);
      map.repeat.copy(source.repeat); map.rotation = source.rotation; map.center.copy(source.center);
      map.anisotropy = source.anisotropy; map.needsUpdate = true;
      mesh.material.map = map; mesh.material.color.set('#ffffff');
    });
  }
  assets.realFence = normalize(fenceKit.scene.getObjectByName('modular_chainlink_fence_double'));
  assets.realShutter = normalize(shutterModel.scene.getObjectByName('rollershutter_door'));
  assets.realTree = normalize(treeModel.scene);
  const shutterSize = new THREE.Box3().setFromObject(assets.realShutter).getSize(new THREE.Vector3());

  const statics = new THREE.Group(); scene.add(statics);
  const place = (name, x, y, z, scale = 1, rotation = 0, target = statics) => {
    const object = assets[name].clone(true);
    if (Array.isArray(scale)) object.scale.set(...scale); else object.scale.setScalar(scale);
    object.position.set(x, y, z); object.rotation.y = rotation; target.add(object); return object;
  };
  const worldUV = (geometry, repeatSize = 8, scale = 1, projectSides = false) => {
    const position = geometry.attributes.position, normal = geometry.attributes.normal, uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i++) {
      let u = position.getX(i), v = position.getZ(i);
      if (projectSides && Math.abs(normal.getY(i)) < .65) {
        u = Math.abs(normal.getX(i)) > .65 ? position.getZ(i) : position.getX(i); v = position.getY(i);
      }
      uv[i * 2] = u * scale / repeatSize; uv[i * 2 + 1] = v * scale / repeatSize;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  };
  place('grass', 0, -.08, -650, [620, 1, 3200]).traverse(mesh => { if (mesh.isMesh) mesh.castShadow = false; });
  const sceneryLength = RULES.distance + RULES.roadblockGap + 220;
  for (let i = -2; i < Math.ceil(sceneryLength / 36); i++) {
    place(i >= 0 && i < 3 ? 'roadStartPositions' : 'roadStraightLong', 0, 0, -i * 36, 18)
      .traverse(mesh => { if (mesh.isMesh) mesh.castShadow = false; });
  }
  for (let i = 0; i < Math.ceil(sceneryLength / 22); i++) {
    const z = 14 - i * 22;
    place('grandStandCovered', -19, .05, z, 16, Math.PI / 2);
    if (i < 14 || i > 45) {
      place('pitsGarage', 18, .05, z, 14, -Math.PI / 2);
      for (const offset of [-3.6, 3.6]) place('realShutter', 10.85, .37, z + offset,
        [6 / shutterSize.x, 5.7 / shutterSize.y, 1], -Math.PI / 2);
      // The roof asset includes its office floor. Stacking a second office at
      // the same facade plane caused the moving camera's visible z-fighting.
      if (i % 2 === 0) place('pitsOfficeRoof', 19, 9.8, z, 14, -Math.PI / 2);
    }
    place('lightPostLarge', -11, .2, z - 6, 11, Math.PI / 2);
    place('lightPostLarge', 11, .2, z - 6, 11, -Math.PI / 2);
    for (const side of [-1, 1]) place('fenceStraight', side * 9.05, .36, z, [22, 6.4, 1.4], Math.PI / 2)
      .traverse(mesh => { if (mesh.isMesh) mesh.userData.detailKind = 'fence'; });
  }
  for (let i = 0; i < Math.ceil(sceneryLength / 4.5); i++) {
    const z = 18 - i * 4.5;
    for (const side of [-1, 1]) place(i % 2 ? 'barrierRed' : 'barrierWhite', side * 8.4, .36, z, [18, 1.12 / .1312, .72 / .123], Math.PI / 2)
      .traverse(mesh => { if (mesh.isMesh) mesh.userData.detailKind = 'barrier'; });
  }
  place('bannerTowerRed', -11, .1, -34, 13); place('bannerTowerRed', 11, .1, -34, 13, Math.PI);
  place('flagCheckers', -11, .2, 10, 9); place('flagCheckers', 11, .2, 10, 9);

  // Batch static copies by source mesh/material in instanced groups. UVs on
  // asphalt use the original tile positions, at an eight metre texture repeat.
  statics.updateMatrixWorld(true);
  const batches = new Map();
  statics.traverse(mesh => {
    if (!mesh.isMesh) return;
    const kind = mesh.userData.detailKind || '';
    const key = `${mesh.geometry.uuid}/${Array.isArray(mesh.material) ? mesh.material.map(m => m.uuid).join() : mesh.material.uuid}/${mesh.castShadow}/${kind}`;
    if (!batches.has(key)) batches.set(key, { geometry: mesh.geometry, material: mesh.material, matrices: [], shadow: mesh.castShadow, kind });
    batches.get(key).matrices.push(mesh.matrixWorld.clone());
  });
  scene.remove(statics);
  const proxyBatches = [], staticPools = [];
  for (const batch of batches.values()) {
    let geometry = batch.geometry;
    if (!batch.kind && !Array.isArray(batch.material) && ['road', 'grass', 'grey', 'white'].includes(batch.material.name)) {
      geometry = geometry.clone();
      const first = batch.matrices[0]; geometry.applyMatrix4(first);
      worldUV(geometry, batch.material.name === 'grey' || batch.material.name === 'white' ? 3 : 8, 1, true);
      geometry.applyMatrix4(first.clone().invert());
    }
    const instance = new THREE.InstancedMesh(geometry, batch.material, batch.matrices.length);
    instance.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    batch.matrices.forEach((matrix, i) => instance.setMatrixAt(i, matrix));
    instance.castShadow = batch.shadow; instance.receiveShadow = true;
    instance.computeBoundingSphere(); scene.add(instance);
    if (batch.kind) {
      batch.geometry.computeBoundingBox();
      const center = batch.geometry.boundingBox.getCenter(new THREE.Vector3());
      proxyBatches.push({ mesh:instance, kind:batch.kind, matrices:batch.matrices,
        centers:batch.matrices.map(matrix => center.clone().applyMatrix4(matrix).z) });
    } else {
      geometry.computeBoundingSphere();
      let distant = null;
      if (batch.shadow) {
        distant = new THREE.InstancedMesh(geometry,batch.material,batch.matrices.length);
        distant.instanceMatrix.setUsage(THREE.DynamicDrawUsage); distant.count = 0;
        distant.receiveShadow = true; distant.castShadow = false; scene.add(distant);
      }
      staticPools.push({mesh:instance, distant, matrices:batch.matrices,
        bounds:batch.matrices.map(matrix => geometry.boundingSphere.clone().applyMatrix4(matrix))});
    }
  }
  const roadside = createRoadsideDetails(scene, assets, proxyBatches, mobile);
  const vegetation = createVegetation(scene, assets.realTree, treeAtlas, treeMeta);
  let staticSection = null;
  function updateStaticVisibility(carZ) {
    const section = Math.floor(carZ / 11);
    if (staticSection === section) return;
    staticSection = section;
    for (const pool of staticPools) {
      let count = 0, distantCount = 0;
      pool.matrices.forEach((matrix,index) => {
        const {center,radius} = pool.bounds[index];
        // Keep every object that can appear before the existing fog becomes
        // opaque, plus offscreen casters behind the camera. No texture/DPR cut.
        if (center.z + radius <= carZ - 800 || center.z - radius >= carZ + 100) return;
        if (pool.distant && center.z + radius < carZ - 100) pool.distant.setMatrixAt(distantCount++,matrix);
        else pool.mesh.setMatrixAt(count++,matrix);
      });
      pool.mesh.count = count; pool.mesh.instanceMatrix.needsUpdate = true; pool.mesh.computeBoundingSphere();
      if (pool.distant) {
        pool.distant.count = distantCount; pool.distant.instanceMatrix.needsUpdate = true; pool.distant.computeBoundingSphere();
      }
    }
  }

  const laneX = (.32745 - .5) * 18, gridNose = (1 - .4228) * 18 + .32;
  // Merge the existing Formula meshes by material, preserving the downloaded
  // geometry. Photo roughness/normal detail and HDR reflections add surface depth.
  const sourceCar = assets.formula2022; sourceCar.updateMatrixWorld(true);
  const carMaterials = new Map();
  sourceCar.traverse(mesh => {
    if (!mesh.isMesh) return;
    const material = mesh.material;
    const painted = material.color.r > .02 && material.color.r > material.color.g * 4 && !material.name.startsWith('dial');
    const key = painted ? 'paint' : material.name === 'tyre' ? 'tyre' : material.color.r < .015 ? 'carbon' : material.color.getHexString();
    if (!carMaterials.has(key)) {
      const surface = new THREE.MeshPhysicalMaterial({ color: painted ? '#d52d21' : key === 'tyre' ? '#141716' : key === 'carbon' ? '#1b2227' : material.color,
        roughness: painted ? .3 : key === 'tyre' ? .92 : .52, metalness: painted ? .16 : key === 'carbon' ? .1 : .14,
        clearcoat: painted ? 1 : .05, clearcoatRoughness: .22, envMapIntensity: painted ? .7 : .4,
        roughnessMap: painted ? null : metalRough, normalMap: painted ? null : metalNormal,
        normalScale: new THREE.Vector2(key === 'tyre' ? .05 : .025, key === 'tyre' ? .05 : .025) });
      carMaterials.set(key, { material: surface, geometries: [] });
    }
    let geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if (geometry.index) { const expanded = geometry.toNonIndexed(); geometry.dispose(); geometry = expanded; }
    for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal'].includes(name)) geometry.deleteAttribute(name);
    worldUV(geometry); carMaterials.get(key).geometries.push(geometry);
  });
  const car = new THREE.Group();
  for (const { material, geometries } of carMaterials.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.castShadow = true; mesh.receiveShadow = true; car.add(mesh); geometries.forEach(g => g.dispose());
  }
  scene.add(car); car.scale.setScalar(1.24); car.rotation.y = Math.PI; car.position.set(laneX, .37, 13.47327555);
  car.position.z += gridNose - new THREE.Box3().setFromObject(car).min.z;
  const carStartZ = car.position.z, finishZ = gridNose - RULES.distance;
  const roadblockZ = finishZ - RULES.roadblockGap;

  const lights = [];
  const gantry = place('overhead', 0, .2, -13 + 13.47327555 - 2, [18, 15, 18], 0, scene);
  const signalRig = new THREE.Group(); scene.add(signalRig);
  // Preserve the original double lamp meshes from the project's downloaded kit.
  const lampTemplate = new THREE.Group(); assets.overheadLights.updateMatrixWorld(true);
  assets.overheadLights.traverse(mesh => {
    if (!mesh.isMesh || mesh.material.name !== 'red') return;
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), indices = [], p = geometry.attributes.position;
    for (let i = 0; i < geometry.index.count; i += 3) {
      const triangle = [geometry.index.getX(i), geometry.index.getX(i + 1), geometry.index.getX(i + 2)];
      if (triangle.every(index => p.getX(index) < -.075)) indices.push(...triangle);
    }
    geometry.setIndex(indices); geometry.translate(.1062, 0, .05);
    const lampBounds = new THREE.Box3(), vertex = new THREE.Vector3();
    for (const index of indices) lampBounds.expandByPoint(vertex.fromBufferAttribute(p, index));
    geometry.boundingBox = lampBounds;
    geometry.boundingSphere = lampBounds.getBoundingSphere(new THREE.Sphere());
    const surface = mesh.material.clone(); surface.color.set('#160b0c'); surface.emissive.set('#ff1608'); surface.emissiveIntensity = 0; surface.toneMapped = false;
    const lamp = new THREE.Mesh(geometry, surface); lamp.castShadow = true; lampTemplate.add(lamp);
  });
  for (let i = 0; i < 5; i++) {
    const housing = place('barrierWhite', (i - 2) * 1.35, 7, -10.8 + 13.47327555 - 2, [3.9, 13.4, 7], 0, signalRig);
    housing.traverse(mesh => { if (mesh.isMesh) mesh.material = new THREE.MeshStandardMaterial({ color: '#0c141a', roughness: .65, metalness: .25 }); });
    const object = lampTemplate.clone(true), surfaces = [];
    object.position.set((i - 2) * 1.35, .45, -11.35 + 13.47327555 - 2); object.scale.setScalar(12);
    object.traverse(mesh => { if (mesh.isMesh) { mesh.material = mesh.material.clone(); surfaces.push(mesh.material); } });
    signalRig.add(object); lights.push(surfaces);
  }
  signalRig.scale.set(1.35, 1.18, 1);
  const signalCenter = new THREE.Box3().setFromObject(signalRig).getCenter(new THREE.Vector3());
  const beamBounds = new THREE.Box3().setFromObject(gantry);
  signalRig.position.x -= signalCenter.x;
  signalRig.position.y += beamBounds.max.y - 1.3 - signalCenter.y;

  // Quaternius Traffic Barrier: original A frame and stripe triangles. Reuse
  // its existing horizontal rail as a second rail; add two Kenney warning lamps.
  const roadblock = assets.roadblock;
  const barrierBox = new THREE.Box3().setFromObject(roadblock), barrierSize = barrierBox.getSize(new THREE.Vector3());
  const barrierScale = 1.9 / barrierSize.y;
  roadblock.traverse(mesh => {
    if (!mesh.isMesh) return;
    let geometry = mesh.geometry.clone(); if (geometry.index) geometry = geometry.toNonIndexed();
    const uv = geometry.attributes.uv, colors = new Float32Array(geometry.attributes.position.count * 3), railIndices = [];
    for (let i = 0; i < uv.count; i += 3) {
      const u = (uv.getX(i) + uv.getX(i + 1) + uv.getX(i + 2)) / 3;
      const color = new THREE.Color(u < .03 ? '#7c8789' : u < .06 ? '#f6bb39' : '#111718');
      for (let k = i; k < i + 3; k++) color.toArray(colors, k * 3);
      if (u > .03) railIndices.push(i, i + 1, i + 2);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); worldUV(geometry, .5, 100 * barrierScale, true);
    mesh.geometry = geometry;
    mesh.material = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: .24, roughness: .65,
      roughnessMap: metalRough, normalMap: metalNormal, normalScale: new THREE.Vector2(.04, .04), envMapIntensity: .65 });
    const rail = new THREE.Mesh(geometry.clone(), mesh.material); rail.geometry.setIndex(railIndices);
    rail.position.copy(mesh.position); rail.quaternion.copy(mesh.quaternion); rail.scale.copy(mesh.scale);
    rail.position.y -= .64 / barrierScale; rail.castShadow = rail.receiveShadow = true;
    // Defer adding the copy until traversal ends.
    mesh.userData.secondRail = rail;
  });
  const railCopies = [];
  roadblock.traverse(mesh => { if (mesh.userData.secondRail) railCopies.push([mesh.parent, mesh.userData.secondRail]); });
  railCopies.forEach(([parent, rail]) => parent.add(rail));
  roadblock.traverse(mesh => { delete mesh.userData.secondRail; });
  // Reuse only the circular lens section of Kenney's existing warning marker.
  // Its original round face points along X, so rotate each copy towards Z.
  const warningTemplate = new THREE.Group(); assets['roadblock-light'].updateMatrixWorld(true);
  assets['roadblock-light'].traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), indices = [], position = geometry.attributes.position;
    const bounds = new THREE.Box3();
    for (let i = 0; i < geometry.index.count; i += 3) {
      const triangle = [geometry.index.getX(i), geometry.index.getX(i + 1), geometry.index.getX(i + 2)];
      if (triangle.every(index => position.getY(index) > .18)) {
        indices.push(...triangle); triangle.forEach(index => bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(position, index)));
      }
    }
    geometry.setIndex(indices); geometry.boundingBox = bounds; geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
    const lens = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({ color: '#ffb732', emissive: '#ff9d10', emissiveIntensity: .42, roughness: .28, metalness: .1, clearcoat: 1 }));
    const center = bounds.getCenter(new THREE.Vector3()); lens.position.set(-center.x, -bounds.min.y, -center.z);
    lens.castShadow = true; warningTemplate.add(lens);
  });
  assets['roadblock-light'] = warningTemplate;
  const roadblockRow = new THREE.Group(); scene.add(roadblockRow);
  for (let i = 0; i < 5; i++) {
    const width = barrierSize.x * barrierScale;
    const x = (i - 2) * (width + .08);
    place('roadblock', x, .35, roadblockZ, barrierScale, 0, roadblockRow);
    for (const side of [-1, 1]) {
      const warning = place('roadblock-light', x + side * width * .405, 2.19, roadblockZ, 1, Math.PI / 2, roadblockRow);
      const bounds = new THREE.Box3().setFromObject(warning), height = bounds.getSize(new THREE.Vector3()).y;
      warning.scale.setScalar(.39 / height);
      warning.traverse(mesh => {
        if (!mesh.isMesh) return;
        mesh.material = mesh.material.clone();
        if (mesh.material.name === 'yellow' || mesh.material.name === 'red') {
          mesh.material.color.set('#ffb32c'); mesh.material.emissive.set('#ff9e12'); mesh.material.emissiveIntensity = .8;
        }
      });
    }
  }
  // Align the visible front face with the physics collision plane exactly.
  roadblockRow.updateMatrixWorld(true);
  const frontZ = new THREE.Box3().setFromObject(roadblockRow).max.z;
  roadblockRow.position.z += roadblockZ - frontZ;
  const collisionFX = createCollisionEffects(scene, roadblockRow, mobile, reducedMotion);

  // Paint the finish band on a thin copy of the downloaded Kenney road surface.
  // Broad painted squares remain visible at speed and use the existing road mesh.
  const finishWidth = 4.5, rows = 6, columns = 24;
  const finishPaint = document.createElement('canvas'); finishPaint.width = 2048; finishPaint.height = 512;
  const paint = finishPaint.getContext('2d');
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      paint.fillStyle = (column + row) % 2 ? '#0c0c0c' : '#ffffff';
      paint.fillRect(column * finishPaint.width / columns, row * finishPaint.height / rows,
        Math.ceil(finishPaint.width / columns), Math.ceil(finishPaint.height / rows));
    }
  }
  const finishTexture = new THREE.CanvasTexture(finishPaint); finishTexture.colorSpace = THREE.SRGBColorSpace;
  finishTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const finishNormal = asphaltNormal.clone(), finishRough = asphaltRough.clone();
  finishNormal.repeat.set(18 / 8, finishWidth / 8); finishRough.repeat.copy(finishNormal.repeat);
  const finishMaterial = new THREE.MeshStandardMaterial({ map: finishTexture, roughness: 1,
    roughnessMap: finishRough, normalMap: finishNormal, normalScale: new THREE.Vector2(.16, .16),
    metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  // The edge nearest the arriving car is the shared 1250 m measuring plane.
  const finishLine = place('roadStraightLong', 0, .361, finishZ - finishWidth / 2, [18, .02, finishWidth / 2], 0, scene);
  finishLine.updateMatrixWorld(true);
  finishLine.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.visible = mesh.material.name === 'road';
    if (!mesh.visible) return;
    mesh.geometry = mesh.geometry.clone();
    const p = mesh.geometry.attributes.position, uv = new Float32Array(p.count * 2), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      uv[i * 2] = (v.x + 9) / 18; uv[i * 2 + 1] = (finishZ - v.z) / finishWidth;
    }
    mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    mesh.material = finishMaterial; mesh.castShadow = false; mesh.receiveShadow = true;
  });

  let lastLights = -1, lastTime = performance.now(), resultBlend = 0, dirty = true;
  let lastDistance = NaN, lastSkid = NaN, lastPhase = '', lastImpactAge = null;
  let renderedFrames = 0, skippedFrames = 0;
  const eye = new THREE.Vector3(), target = new THREE.Vector3(), alternateEye = new THREE.Vector3(), alternateTarget = new THREE.Vector3();
  function resize() {
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    camera.aspect = container.clientWidth / container.clientHeight;
    // Preserve enough horizontal view for all five lamps on portrait screens.
    camera.fov = container.clientWidth < 600
      ? Math.max(52, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(21)) / camera.aspect)))
      : 52;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  resize(); window.addEventListener('resize', resize);
  return {
    diagnostics() { return { calls:renderer.info.render.calls, triangles:renderer.info.render.triangles,
      renderedFrames, skippedFrames, ...roadside.diagnostics(), ...vegetation.diagnostics(),
      fence:assets.realFence.children.flatMap(group => { const materials = []; group.traverse(mesh => { if (mesh.isMesh) materials.push({ name:mesh.material.name, alpha:!!mesh.material.alphaMap }); }); return materials; }) }; },
    reset() {
      car.position.set(laneX, .37, carStartZ); car.rotation.y = Math.PI; resultBlend = 0; collisionFX.reset();
      dirty = true; lastDistance = NaN; lastSkid = NaN; lastImpactAge = null;
    },
    setLights(count) {
      if (count === lastLights) return; lastLights = count;
      dirty = true;
      lights.forEach((surfaces, i) => surfaces.forEach(material => { material.color.set(i < count ? '#ff2b20' : '#160b0c'); material.emissiveIntensity = i < count ? 2.1 : 0; }));
    },
    render(now, drive) {
      const dt = Math.min(.1, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
      const skid = drive.skidded ? 1 - Math.exp(-drive.skidTime * 3) : 0;
      const changed = drive.distance !== lastDistance || skid !== lastSkid;
      const engineBlown = drive.result?.type === 'engine-blown';
      const collision = drive.result?.type === 'collision' || engineBlown;
      const impactActive = collision && (lastImpactAge === null || lastImpactAge < 8);
      const orbiting = drive.phase === 'stopped' && !collision && resultBlend < 1;
      if (document.hidden || (!dirty && !changed && drive.phase === lastPhase && !orbiting && !impactActive)) {
        skippedFrames++; return;
      }
      car.position.z = carStartZ - drive.distance;
      car.position.x = laneX + skid * 2.8; car.rotation.y = Math.PI - skid * 1.15;
      roadside.update(car.position.z);
      updateStaticVisibility(car.position.z);
      const impactZ = engineBlown ? car.position.z : roadblockZ;
      if (collision) collisionFX.start(now, { x:car.position.x, z:impactZ, speed:drive.result.stats.outcomeSpeed, engine:engineBlown });
      const impactAge = collisionFX.update(now);
      lastImpactAge = impactAge;
      const narrow = container.clientWidth < 600;
      const vibration = !reducedMotion && drive.phase === 'driving' ? Math.sin(now * .048) * .008 * Math.min(drive.speed / 10, 1) : 0;
      eye.set(laneX, 3.65 + vibration, car.position.z + (narrow ? 11.7 : 10.3));
      target.set(laneX, 1.35, car.position.z - 22);
      if (impactAge !== null) {
        const blend = reducedMotion ? 1 : 1 - Math.exp(-impactAge * 3);
        eye.lerp(alternateEye.set(laneX + 5, 6, car.position.z + 14), blend);
        target.set(laneX, 2.2, impactZ - (engineBlown ? 0 : 4));
        if (!reducedMotion) {
          const shake = .14 * Math.exp(-impactAge * 7);
          eye.x += Math.sin(now * .17) * shake; eye.y += Math.cos(now * .21) * shake;
        }
      } else if (drive.phase === 'stopped') {
        resultBlend = reducedMotion ? 1 : Math.min(1, resultBlend + dt / .9);
        eye.lerp(alternateEye.set(laneX + 10, 8, car.position.z + 12), resultBlend);
        target.lerp(alternateTarget.set(laneX, 1, car.position.z - 4), resultBlend);
      }
      camera.position.copy(eye); camera.lookAt(target);
      vegetation.update(camera);
      // Snap the moving shadow camera to its texel grid instead of allowing
      // subpixel movement to make static buildings and their shadows shimmer.
      shadowFocus.set(laneX, 0, car.position.z - 8);
      for (const axis of [shadowRight, shadowUp]) {
        const projection = shadowFocus.dot(axis);
        shadowFocus.addScaledVector(axis, Math.round(projection / shadowTexel) * shadowTexel - projection);
      }
      sun.target.position.copy(shadowFocus); sun.position.copy(shadowFocus).add(sunOffset);
      // Camera/UI changes reuse the sharp shadow map. Moving cars and debris
      // still update it every rendered frame, at the original resolution.
      renderer.shadowMap.needsUpdate = changed || impactActive;
      renderer.render(scene, camera);
      renderedFrames++; dirty = false;
      lastDistance = drive.distance; lastSkid = skid; lastPhase = drive.phase;
    },
  };
}
