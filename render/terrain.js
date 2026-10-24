import * as THREE from "three";
import { bestNeighbor, NB } from "../sim/circle-pathfind.js";

const palette = {
  grass: 0x507e58, grassLight: 0x659b65, dirt: 0x614653, dirtLight: 0x8d5d57,
  path: 0xb5a078, pathLight: 0xe6cc91, stone: 0x69718b, crystal: 0x9e72f2
};

function instanced(scene, color, items, box=[1,1,1], y=0) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(...box),
    new THREE.MeshLambertMaterial({color}),
    Math.max(items.length,1)
  );
  const dummy = new THREE.Object3D();
  items.forEach((p,i)=>{
    dummy.position.set(p.x,p.y ?? y,p.z);
    dummy.scale.set(p.sx ?? 1,p.sy ?? 1,p.sz ?? 1);
    dummy.rotation.y = p.ry || 0;
    dummy.updateMatrix();
    mesh.setMatrixAt(i,dummy.matrix);
  });
  mesh.count = items.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export function createTerrain(scene, cols, rows) {
  const x0 = -(cols-1)/2, z0 = -(rows-1)/2;
  const floor = [];
  const edge = [];
  for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
    const x=x0+c,z=z0+r;
    floor.push({x,y:-0.12,z,sy:0.24});
    if (c===0 || r===0 || c===cols-1 || r===rows-1) edge.push({x,y:-0.38,z,sy:0.38});
  }
  instanced(scene,palette.grass,floor,[1,1,1]);
  const gridPoints=[];
  for(let c=0;c<=cols;c++){
    const x=-cols/2+c;
    gridPoints.push(new THREE.Vector3(x,0.012,-rows/2),new THREE.Vector3(x,0.012,rows/2));
  }
  for(let r=0;r<=rows;r++){
    const z=-rows/2+r;
    gridPoints.push(new THREE.Vector3(-cols/2,0.012,z),new THREE.Vector3(cols/2,0.012,z));
  }
  const gridGeometry=new THREE.BufferGeometry().setFromPoints(gridPoints);
  const gridLines=new THREE.LineSegments(gridGeometry,new THREE.LineBasicMaterial({color:0x294b3e,transparent:true,opacity:0.68}));
  scene.add(gridLines);
  instanced(scene,palette.dirt,edge,[1,1,1]);
  const trim = [];
  for (let r=0;r<rows;r+=5) {
    trim.push({x:x0-0.65,y:-0.25,z:z0+r,sx:0.3,sy:0.2,sz:0.9});
    trim.push({x:-x0+0.65,y:-0.25,z:z0+r,sx:0.3,sy:0.2,sz:0.9});
  }
  instanced(scene,palette.dirtLight,trim,[1,1,1]);

  const gate = new THREE.Group();
  const gateMat = new THREE.MeshLambertMaterial({color:0xff8c55,emissive:0x8b2d16,emissiveIntensity:0.6});
  for (const x of [-1,0,1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.55,1.7,0.55),gateMat);
    post.position.set(x,0.72,z0+1.0);
    gate.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.3,0.45,0.55),gateMat);
  lintel.position.set(0,1.65,z0+1.0);
  gate.add(lintel);
  scene.add(gate);

  const exit = new THREE.Group();
  const exitMat = new THREE.MeshLambertMaterial({color:0x9e72f2,emissive:0x5530b0,emissiveIntensity:0.8});
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1,0.18,4,8),exitMat);
  ring.position.set(0,1.1,z0);
  exit.add(ring);
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.65,0.65,0.65),exitMat);
  core.position.set(0,1.1,z0);
  exit.add(core);
  scene.add(exit);

  const cloudMat = new THREE.MeshLambertMaterial({color:0xc4c8ee,transparent:true,opacity:0.32});
  for (const [x,y,z,s] of [[-18,-1,-12,1.6],[18,-2,4,2],[-12,-2,20,1.8],[12,-1,-24,1.4]]) {
    const cloud = new THREE.Mesh(new THREE.BoxGeometry(3.4,0.6,1.8),cloudMat);
    cloud.position.set(x,y,z); cloud.scale.setScalar(s); scene.add(cloud);
  }

  let signature = "";
  let pathMesh = null;
  let obstacleMesh = null;
  let gridMesh = null;

  function update(field) {
    let sig = "";
    for (let i=0;i<field.grid.length;i++) sig += field.grid[i];
    if (sig === signature) return;
    signature = sig;
    if (pathMesh) {scene.remove(pathMesh);pathMesh.geometry.dispose();pathMesh.material.dispose();}
    if (obstacleMesh) {scene.remove(obstacleMesh);obstacleMesh.geometry.dispose();obstacleMesh.material.dispose();}
    if (gridMesh) {scene.remove(gridMesh);gridMesh.geometry.dispose();gridMesh.material.dispose();}

    const path = [];
    let c=field.entrance.c, r=field.entrance.r;
    const seen = new Set();
    for (let i=0;i<cols*rows;i++) {
      const id=r*cols+c;
      if (seen.has(id)) break;
      seen.add(id);
      path.push({x:x0+c,y:0.035,z:z0+r,sx:0.76,sy:0.08,sz:0.76});
      if (c===field.exit.c && r===field.exit.r) break;
      const k=bestNeighbor(field,cols,rows,c,r);
      if (k==null) break;
      c+=NB[k][0]; r+=NB[k][1];
    }
    pathMesh=instanced(scene,palette.path,path,[1,1,1]);
    const blocks=[];
    const marks=[];
    for (let rr=0;rr<rows;rr++) for (let cc=0;cc<cols;cc++) {
      const value=field.grid[rr*cols+cc];
      if (value===1) blocks.push({x:x0+cc,y:0.38,z:z0+rr,sx:0.76,sy:0.8,sz:0.76});
      if (value!==0) marks.push({x:x0+cc,y:0.012,z:z0+rr,sx:0.92,sy:0.025,sz:0.92});
    }
    obstacleMesh=instanced(scene,palette.stone,blocks,[1,1,1]);
    gridMesh=instanced(scene,0x91bd91,marks,[1,1,1]);
  }
  return {update};
}
