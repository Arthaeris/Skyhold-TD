import * as THREE from "three";
import { createPortState, fx, SIM_DT, cellToWorld, worldToCell, step } from "./sim/circle-adapter.js";
import { createScene } from "./render/scene.js";
import { createTerrain } from "./render/terrain.js";
import { createEntityRenderer } from "./render/models.js";
import { createUI } from "./ui.js";

const container=document.querySelector("#game-view");
const {scene,camera,renderer}=createScene(container);
const state=createPortState({mode:"loop",corridorCount:1,elements:["fire"]});
const cols=state.grid.cols,rows=state.grid.rows;
const terrain=createTerrain(scene,cols,rows);
const entities=createEntityRenderer(scene,cols,rows);
const field=state.players[0].corridors[0];

const floor=new THREE.Mesh(
  new THREE.PlaneGeometry(cols,rows),
  new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide})
);
floor.rotation.x=-Math.PI/2;
floor.position.y=0.015;
floor.name="build-floor";
scene.add(floor);

const preview=new THREE.Mesh(
  new THREE.BoxGeometry(2.9,0.08,2.9),
  new THREE.MeshBasicMaterial({color:0x85f0c5,transparent:true,opacity:0.34})
);
preview.visible=false;
scene.add(preview);
const previewEdge=new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(2.95,0.1,2.95)),
  new THREE.LineBasicMaterial({color:0xafffd9,transparent:true,opacity:0.9})
);
previewEdge.visible=false;
scene.add(previewEdge);

let selectedTowerType="fire_0";
let selectedTowerId=null;
let pointerDown=null;
let pinchStart=null;
let cameraTarget={x:0,z:0};
let accumulator=0;
const pendingCommands=[];
const raycaster=new THREE.Raycaster();
const pointer=new THREE.Vector2();
const clock=new THREE.Clock();

function selectedTower() {
  return field.towers.find(t=>t.id===selectedTowerId)||null;
}
function queue(type,payload={}) {
  pendingCommands.push({type,player:0,...payload});
}
function selectTowerType(id) {
  selectedTowerType=id;
  selectedTowerId=null;
  ui.showToast(globalThis.DB.TOWER_BY_ID[id]?.name+" selected");
}
function selectTower(id) {
  selectedTowerId=id;
  const tower=selectedTower();
  if(tower) {
    selectedTowerType=tower.def.id;
    ui.selectTowerType(tower.def.id);
    ui.showToast((globalThis.DB.TOWER_BY_ID[tower.def.id]?.name||tower.def.id)+" · Level "+tower.level);
  }
}
const ui=createUI({
  onSelectTower:selectTowerType,
  onSelectElement:element=>{selectedTowerId=null;selectedTowerType=globalThis.DB.TOWERS.find(t=>t.element===element)?.id||selectedTowerType;},
  onStartWave:()=>queue("StartWave"),
  onSell:()=>{const tower=selectedTower();if(tower)queue("SellTower",{corridorId:0,towerId:tower.id});},
  onUpgrade:()=>{const tower=selectedTower();if(tower)queue("UpgradeTower",{corridorId:0,towerId:tower.id});},
  onMutate:mutId=>{const tower=selectedTower();if(tower)queue("MutateTower",{corridorId:0,towerId:tower.id,mutId,masteryLevel:5});},
  onTargetMode:mode=>{const tower=selectedTower();if(tower)queue("SetTargetMode",{corridorId:0,towerId:tower.id,mode});}
});

function worldPointer(event) {
  const bounds=renderer.domElement.getBoundingClientRect();
  pointer.x=((event.clientX-bounds.left)/bounds.width)*2-1;
  pointer.y=-((event.clientY-bounds.top)/bounds.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
}
function floorCell(event) {
  worldPointer(event);
  const hit=raycaster.intersectObject(floor,false)[0];
  if(!hit)return null;
  const cell=worldToCell(hit.point.x,hit.point.z,cols,rows);
  if(cell.c<0||cell.c>=cols||cell.r<0||cell.r>=rows)return null;
  return cell;
}
function towerHit(event) {
  worldPointer(event);
  const objects=[];
  for(const group of entities.towers.values()) objects.push(group);
  const hits=raycaster.intersectObjects(objects,true);
  for(const hit of hits) {
    let obj=hit.object;
    while(obj&&!obj.userData.towerId)obj=obj.parent;
    if(obj?.userData.towerId!=null)return obj.userData.towerId;
  }
  return null;
}
function updatePreview(cell) {
  hoverCell=cell;
  if(!cell) {preview.visible=false;previewEdge.visible=false;return;}
  const p=cellToWorld(cell.c,cell.r,cols,rows);
  preview.position.set(p.x,0.055,p.z);
  previewEdge.position.set(p.x,0.07,p.z);
  const value=field.grid[cell.r*cols+cell.c];
  const valid=value===0;
  preview.material.color.set(valid?0x85f0c5:0xff637d);
  previewEdge.material.color.set(valid?0xafffd9:0xff637d);
  preview.visible=true;previewEdge.visible=true;
}
const activePointers=new Map();
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function pinchDistance() {
  const pts=[...activePointers.values()];
  if(pts.length<2)return 0;
  return Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
}
function panCamera(dx,dy) {
  const bounds=renderer.domElement.getBoundingClientRect();
  const worldPerPixelX=(camera.right-camera.left)/(camera.zoom*Math.max(1,bounds.width));
  const worldPerPixelZ=(camera.top-camera.bottom)/(camera.zoom*Math.max(1,bounds.height));
  cameraTarget.x-=dx*worldPerPixelX;
  cameraTarget.z-=dy*worldPerPixelZ;
  camera.position.x=cameraTarget.x;
  camera.position.z=cameraTarget.z+16;
  camera.lookAt(cameraTarget.x,0,cameraTarget.z);
}
renderer.domElement.addEventListener("pointermove",event=>{
  if(activePointers.has(event.pointerId))activePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(activePointers.size>=2){
    if(!pinchStart)pinchStart={distance:pinchDistance(),zoom:camera.zoom};
    const distance=pinchDistance();
    if(pinchStart.distance>0){
      camera.zoom=clamp(pinchStart.zoom*(distance/pinchStart.distance),1,2.6);
      camera.updateProjectionMatrix();
    }
    updatePreview(null);
    return;
  }
  if(pointerDown&&pointerDown.id===event.pointerId){
    const dx=event.clientX-pointerDown.lastX,dy=event.clientY-pointerDown.lastY;
    if(Math.hypot(event.clientX-pointerDown.startX,event.clientY-pointerDown.startY)>12)pointerDown.moved=true;
    if(pointerDown.moved)panCamera(dx,dy);
    pointerDown.lastX=event.clientX;pointerDown.lastY=event.clientY;
  }
  updatePreview(floorCell(event));
});
renderer.domElement.addEventListener("pointerleave",()=>{if(activePointers.size===0)updatePreview(null);});
renderer.domElement.addEventListener("pointerdown",event=>{
  activePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  try{renderer.domElement.setPointerCapture(event.pointerId);}catch{}
  if(activePointers.size===1){
    pointerDown={id:event.pointerId,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:false};
  }else{
    if(pointerDown)pointerDown.moved=true;
    pinchStart={distance:pinchDistance(),zoom:camera.zoom};
    updatePreview(null);
  }
});
renderer.domElement.addEventListener("pointerup",event=>{
  const pointerCount=activePointers.size;
  activePointers.delete(event.pointerId);
  if(pointerCount>1){pointerDown=null;pinchStart=null;updatePreview(null);return;}
  if(!pointerDown||pointerDown.id!==event.pointerId||pointerDown.moved){pointerDown=null;return;}
  pointerDown=null;
  const id=towerHit(event);
  if(id!=null){selectTower(id);return;}
  const cell=floorCell(event);
  if(!cell)return;
  selectedTowerId=null;
  queue("BuildTower",{corridorId:0,towerType:selectedTowerType,gx:cell.c,gy:cell.r,masteryLevel:5});
});
renderer.domElement.addEventListener("pointercancel",event=>{
  activePointers.delete(event.pointerId);pointerDown=null;pinchStart=null;updatePreview(null);
});
renderer.domElement.addEventListener("wheel",event=>{
  event.preventDefault();
  camera.zoom=clamp(camera.zoom*Math.exp(-event.deltaY*0.001),1,2.6);
  camera.updateProjectionMatrix();
},{passive:false});
renderer.domElement.addEventListener("contextmenu",event=>event.preventDefault());

function processEvents() {
  for(const event of state.events) {
    if(event.kind==="reject") {
      ui.showToast(event.reason==="funds"?"Not enough gold.":event.reason==="noRoom"?"Can't build there — keep a route open.":"That action was rejected.");
    } else if(event.kind==="wave") {
      ui.showToast("Wave "+event.wave+(event.boss?" · BOSS WAVE":"")+" incoming");
    } else if(event.kind==="waveClear") {
      ui.showToast("Wave "+event.wave+" cleared · +"+event.bonus+" gold");
    } else if(event.kind==="leak") {
      ui.showToast("An enemy escaped · -1 life");
    } else if(event.kind==="defeat") {
      ui.showToast("The corridor has fallen.");
    } else if(event.kind==="victory") {
      ui.showToast("Nexus defended. Victory!");
    } else if(event.kind==="endboss") {
      ui.showToast("The Sealed One has entered the corridor!");
    }
  }
}
function animate() {
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),0.1);
  accumulator+=dt;
  let guard=0;
  while(accumulator>=1/30&&guard++<5) {
    const commands=pendingCommands.splice(0,pendingCommands.length);
    const towersBefore=field.towers.length;
    const selectedBefore=selectedTower();
    const levelBefore=selectedBefore?.level||0;
    const mutationsBefore=selectedBefore?.mutations?.join(",")||"";
    step(state,commands,SIM_DT);
    processEvents();
    if(commands.some(c=>c.type==="BuildTower")&&field.towers.length>towersBefore){
      ui.showToast((globalThis.DB.TOWER_BY_ID[commands.find(c=>c.type==="BuildTower").towerType]?.name||"Tower")+" placed");
    }
    if(commands.some(c=>c.type==="UpgradeTower")&&selectedBefore&&selectedBefore.level>levelBefore)ui.showToast("Tower upgraded to level "+selectedBefore.level);
    if(commands.some(c=>c.type==="SellTower")&&selectedBefore&&!field.towers.some(t=>t.id===selectedBefore.id))ui.showToast("Tower sold");
    if(commands.some(c=>c.type==="MutateTower")&&selectedBefore&&selectedBefore.mutations.join(",")!==mutationsBefore)ui.showToast("Mutation applied");
    accumulator-=1/30;
  }
  const currentField=state.players[0].corridors[0];
  terrain.update(currentField);
  entities.sync(state,currentField);
  ui.render(state,selectedTower());
  renderer.render(scene,camera);
}
animate();

console.info("Skyhold TD Circle port initialized",{
  grid:cols+"x"+rows,
  towers:globalThis.DB.TOWERS.length,
  elements:globalThis.DB.ELEMENT_ORDER.length,
  simulation:"Circle deterministic fixed-step core"
});
