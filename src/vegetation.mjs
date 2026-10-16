import * as THREE from 'three';
import { RULES } from './core.mjs';

// Cache the complete downloaded tree from multiple angles, keeping its dense crown.
// A reduced copy of that same model supplies nearby real-time shadows.
export function createVegetation(scene, shadowTree, atlas, metadata) {
  const plants = [], shadowMeshes = [], transform = new THREE.Object3D();
  const frustum = new THREE.Frustum(), view = new THREE.Matrix4(), sphere = new THREE.Sphere();
  atlas.colorSpace = THREE.SRGBColorSpace;
  const materials = Array.from({length:metadata.views*2},(_,index) => {
    const frame=index%metadata.views, mirrored=index>=metadata.views, map=atlas.clone();
    map.repeat.set((mirrored?-1:1)/metadata.columns,1/metadata.rows);
    map.offset.set(((frame%metadata.columns)+(mirrored?1:0))/metadata.columns,1-(Math.floor(frame/metadata.columns)+1)/metadata.rows);
    map.needsUpdate=true;
    return new THREE.SpriteMaterial({map,transparent:false,alphaTest:.3,alphaToCoverage:true,toneMapped:false,fog:true});
  });
  const rows = Math.ceil((RULES.distance + RULES.roadblockGap + 220) / 105) + 1;
  for (let i=0;i<rows;i++) {
    const z=10-i*105+Math.sin(i*2.7)*9;
    plants.push({x:-34-(i%3)*2,y:.3,z,scale:1.44+(i%4)*.055});
    if(i<4||i>9)plants.push({x:32+(i%3)*2,y:.3,z:z-27,scale:1.54+(i%3)*.05});
  }
  for(const plant of plants) {
    const sprite=new THREE.Sprite(materials[0]);
    sprite.position.set(plant.x,plant.y+metadata.centerY*plant.scale,plant.z);
    sprite.scale.setScalar(metadata.span*plant.scale); scene.add(sprite); plant.sprite=sprite;
  }
  let shadowCount=0, visibleTrees=0;
  shadowTree.updateMatrixWorld(true);
  shadowTree.traverse(source => {
    if(!source.isMesh)return;
    const geometry=source.geometry.clone().applyMatrix4(source.matrixWorld);
    const mesh=new THREE.InstancedMesh(geometry,source.material,plants.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count=0; mesh.castShadow=true;
    // Public hooks skip the color pass while retaining the model in the shadow
    // pass, so a second, sparse crown never overlaps the complete cached crown.
    mesh.onBeforeRender=()=>{mesh.count=0;};
    mesh.onAfterRender=()=>{mesh.count=shadowCount;};
    scene.add(mesh); shadowMeshes.push(mesh);
  });
  return {
    update(camera) {
      camera.updateMatrixWorld();
      view.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse); frustum.setFromProjectionMatrix(view);
      visibleTrees=0; shadowCount=0;
      for(const plant of plants) {
        const distance=Math.hypot(plant.x-camera.position.x,plant.z-camera.position.z);
        sphere.center.copy(plant.sprite.position); sphere.radius=metadata.span*plant.scale*.72;
        plant.sprite.visible=distance<810 && frustum.intersectsSphere(sphere);
        if(plant.sprite.visible) {
          const angle=Math.atan2(camera.position.x-plant.x,camera.position.z-plant.z);
          const frame=Math.min(metadata.views-1,Math.round(Math.abs(angle)/metadata.angleStep))+(angle<0?metadata.views:0);
          plant.sprite.material=materials[frame]; visibleTrees++;
        }
        if(distance<135) {
          transform.position.set(plant.x,plant.y,plant.z);transform.rotation.set(0,0,0);transform.scale.setScalar(plant.scale);transform.updateMatrix();
          for(const mesh of shadowMeshes)mesh.setMatrixAt(shadowCount,transform.matrix);
          shadowCount++;
        }
      }
      for(const mesh of shadowMeshes) {
        mesh.count=shadowCount;mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
      }
    },
    diagnostics:()=>({visibleTrees,shadowTrees:shadowCount}),
  };
}
