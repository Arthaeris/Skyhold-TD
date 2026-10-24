import { fx } from "./sim/circle-adapter.js";

const DB=globalThis.DB;
const elementOrder=DB.ELEMENT_ORDER;
const starter=new Set(DB.availableElements({}));
const icons=Object.fromEntries(elementOrder.map(id=>[id,DB.ELEMENTS[id].icon]));
const esc=(s)=>String(s).replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));

export function createUI({onSelectTower,onSelectElement,onStartWave,onSell,onUpgrade,onTargetMode,onDismissIntro}) {
  const gold=document.querySelector("#gold-value"),lives=document.querySelector("#lives-value"),wave=document.querySelector("#wave-value");
  const waveButton=document.querySelector("#wave-button"),hint=document.querySelector("#hint"),toast=document.querySelector("#toast");
  const intro=document.querySelector("#intro-card"),elementOptions=document.querySelector("#element-options"),towerOptions=document.querySelector("#tower-options");
  const buildTitle=document.querySelector("#build-title"),phaseLabel=document.querySelector("#phase-label");
  const sellButton=document.querySelector("#sell-button"),upgradeButton=document.querySelector("#upgrade-button");
  const targetMode=document.querySelector("#target-mode");
  let currentElement="fire",selectedTowerType="fire_0",toastTimer=null;
  const unlocked=DB.availableElements({});

  function showToast(message) {
    toast.textContent=message;toast.classList.add("visible");
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove("visible"),2100);
  }
  function renderElements() {
    elementOptions.innerHTML=elementOrder.map(id=>{
      const el=DB.ELEMENTS[id],available=unlocked.includes(id);
      return '<button class="element-option '+(id===currentElement?'selected':'')+'" data-element="'+id+'" style="--element:'+el.color+'" '+(!available?'disabled title="Unlock through elemental mastery"':'')+'><span>'+el.icon+'</span><small>'+el.name+'</small></button>';
    }).join("");
    elementOptions.querySelectorAll("[data-element]").forEach(btn=>btn.addEventListener("click",()=>{
      if(btn.disabled)return;
      currentElement=btn.dataset.element;
      renderElements();renderTowers();
      onSelectElement(currentElement);
    }));
  }
  function renderTowers() {
    const el=DB.ELEMENTS[currentElement];
    buildTitle.textContent=el.name.toUpperCase()+" TOWERS";
    const towers=DB.TOWERS.filter(t=>t.element===currentElement);
    if(towers.length&&!towers.some(t=>t.id===selectedTowerType))selectedTowerType=towers[0].id;
    towerOptions.innerHTML=towers.map(t=>{
      const selected=t.id===selectedTowerType;
      return '<button class="tower-option '+(selected?'selected':'')+'" data-tower="'+esc(t.id)+'" style="--element:'+el.color+'" aria-pressed="'+selected+'"><span class="tower-glyph">'+el.icon+'</span><span class="tower-copy"><b>'+esc(t.name)+'</b><small>'+t.cost+' gold · T'+t.tier+'</small></span><span class="tower-level">'+(t.slot+1)+'</span></button>';
    }).join("");
    towerOptions.querySelectorAll("[data-tower]").forEach(btn=>btn.addEventListener("click",()=>{
      selectedTowerType=btn.dataset.tower;
      towerOptions.querySelectorAll("[data-tower]").forEach(b=>{b.classList.toggle("selected",b===btn);b.setAttribute("aria-pressed",String(b===btn));});
      onSelectTower(selectedTowerType);
      hint.textContent="Tap an open grid cell to place "+DB.TOWER_BY_ID[selectedTowerType].name+".";
    }));
  }
  renderElements();renderTowers();
  document.querySelector("#dismiss-intro").addEventListener("click",()=>{intro.classList.add("hidden");onDismissIntro?.();});
  waveButton.addEventListener("click",()=>onStartWave());
  sellButton.addEventListener("click",()=>onSell());
  upgradeButton.addEventListener("click",()=>onUpgrade());
  targetMode.addEventListener("change",()=>onTargetMode(targetMode.value));
  window.addEventListener("keydown",e=>{
    if(e.repeat||e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;
    if(e.key==="Escape"){intro.classList.add("hidden");showToast("Tap a tower card to return to build mode.");}
    if(["1","2","3","4","5"].includes(e.key)){
      const tower=DB.TOWERS.filter(t=>t.element===currentElement)[Number(e.key)-1];
      if(tower)towerOptions.querySelector('[data-tower="'+tower.id+'"]')?.click();
    }
    if(e.key.toLowerCase()===" "||e.key==="Enter"){e.preventDefault();if(!waveButton.disabled)waveButton.click();}
  });

  function render(state,selectedTower) {
    const player=state.players[0],field=player.corridors[0];
    gold.textContent=state.economy==="shared"?player.gold:player.essence[currentElement];
    lives.textContent=player.lives;wave.textContent=player.wave;
    phaseLabel.textContent=player.phase==="wave"?"WAVE IN PROGRESS":player.phase==="prep"?"FINAL BOSS READY":player.phase.toUpperCase()+" PHASE";
    waveButton.disabled=player.phase==="wave"||player.phase==="victory"||player.phase==="defeat"||state.finished;
    waveButton.innerHTML=player.phase==="prep"?'SUMMON FINAL BOSS <span>⚔</span>':player.phase==="wave"?'WAVE IN PROGRESS <span>…</span>':player.wave?'NEXT WAVE <span>→</span>':'START WAVE <span>→</span>';
    sellButton.disabled=!selectedTower;
    upgradeButton.disabled=!selectedTower||selectedTower.level>=state.bal.maxLevel;
    if(player.phase==="wave")hint.textContent="Defend the corridor! Towers follow Circle targeting and status rules.";
    else if(player.phase==="defeat")hint.textContent="The corridor has fallen. Refresh to start a new run.";
    else if(player.phase==="victory")hint.textContent="The Nexus is secure. Victory!";
    else if(player.phase==="prep")hint.textContent="All regular waves cleared. Summon the final boss.";
    else if(player.wave>0)hint.textContent="Build a maze without sealing the route, upgrade towers, then launch the next wave.";
    targetMode.value=selectedTower?.targetMode||"first";
    if(selectedTower){
      sellButton.textContent="SELL +"+Math.floor(totalInvested(state,selectedTower)*state.bal.sellRefund);
      upgradeButton.textContent=selectedTower.level>=state.bal.maxLevel?"MAX LEVEL":"UPGRADE · "+getUpgradeCost(state,selectedTower);
    }else{
      sellButton.textContent="SELL SELECTED";upgradeButton.textContent="UPGRADE";
    }
  }
  function totalInvested(state,tower){
    let total=tower.def.cost;
    for(let level=1;level<tower.level;level++)total+=getUpgradeCost(state,tower,level);
    return total;
  }
  function getUpgradeCost(state,tower,level=tower.level){
    const base=fx.fromFloat(tower.def.cost);
    let cost=fx.mul(fx.mul(base,state.bal.scaling.upgradeCostBase),fx.ONE);
    let growth=fx.ONE;
    for(let i=1;i<level;i++)growth=fx.mul(growth,state.bal.scaling.costGrowth);
    return Math.round(fx.toFloat(fx.mul(cost,growth)));
  }
  return {render,showToast,selectTowerType:(id)=>{selectedTowerType=id;currentElement=DB.TOWER_BY_ID[id]?.element||currentElement;renderElements();renderTowers();},get selectedTowerType(){return selectedTowerType;},get currentElement(){return currentElement;}};
}
