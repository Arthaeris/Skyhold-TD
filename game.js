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
let hoverCell=null;
let accumulator=0;
let previousTick=state.tick;
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
    ui.showToast(tower.def.name+" · Level "+tower.level);
  }
}
const ui=createUI({
  onSelectTower:selectTowerType,
  onSelectElement:()=>{selectedTowerId=null;},
  onStartWave:()=>queue("StartWave"),
  onSell:()=>{const tower=selectedTower();if(tower)queue("SellTower",{corridorId:0,towerId:tower.id});},
  onUpgrade:()=>{const tower=selectedTower();if(tower)queue("UpgradeTower",{corridorId:0,towerId:tower.id});},
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
renderer.domElement.addEventListener("pointermove",event=>{
  const cell=floorCell(event);
  updatePreview(cell);
});
renderer.domElement.addEventListener("pointerleave",()=>updatePreview(null));
renderer.domElement.addEventListener("pointerdown",event=>{pointerDown={x:event.clientX,y:event.clientY,id:event.pointerId};});
renderer.domElement.addEventListener("pointerup",event=>{
  if(!pointerDown||Math.hypot(event.clientX-pointerDown.x,event.clientY-pointerDown.y)>12){pointerDown=null;return;}
  pointerDown=null;
  const id=towerHit(event);
  if(id!=null){selectTower(id);return;}
  const cell=floorCell(event);
  if(!cell)return;
  selectedTowerId=null;
  queue("BuildTower",{corridorId:0,towerType:selectedTowerType,gx:cell.c,gy:cell.r,masteryLevel:5});
});
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
    // Commands are applied by the same deterministic simulation step as Circle.
    state.events.length=0;
    const simDt=SIM_DT;
    step(state,commands,simDt);
    processEvents();
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
