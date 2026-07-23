import { ATTRIBUTE_META, applyResult, calculateScore, createRng, evaluateCondition, newGameState, pickEvent, resolveEnding, validateData } from "./engine.js";
import { loadGameData } from "./data-loader.js";

const $ = id => document.getElementById(id);
const screens = [...document.querySelectorAll(".screen")];
let data, state, rng, talentPool = [], selectedTalents = [], baseAttributes = {}, pointsLeft = 20, autoTimer = null;
const settings = { animationSpeed: 1, autoSpeed: 1500, volume: .5, sound: true, ...JSON.parse(localStorage.getItem("returnlife.settings") || "{}") };

function showScreen(id) { screens.forEach(s => s.classList.toggle("active", s.id === id)); window.scrollTo({ top: 0, behavior: "smooth" }); }
function toast(message) { $("toast").textContent = message; $("toast").classList.add("show"); setTimeout(() => $("toast").classList.remove("show"), 1800); }
function shuffle(items, random) { return [...items].map(x => ({ x, n: random() })).sort((a,b) => a.n-b.n).map(v => v.x); }
function saveSettings() { localStorage.setItem("returnlife.settings", JSON.stringify(settings)); document.documentElement.style.setProperty("--speed", settings.animationSpeed); }
function startNewGame() {
  stopAuto(); state = newGameState(Date.now()); rng = createRng(state.seed); selectedTalents = []; baseAttributes = Object.fromEntries(Object.keys(ATTRIBUTE_META).map(k => [k, 0])); pointsLeft = 20;
  talentPool = shuffle(data.talents, rng).slice(0, 10); renderTalents(); showScreen("talent-screen");
}
function renderTalents() {
  $("talent-count").textContent = `${selectedTalents.length} / 3`;
  $("talent-confirm").disabled = selectedTalents.length !== 3;
  $("talent-grid").innerHTML = talentPool.map(t => {
    const selected = selectedTalents.includes(t.id);
    const excluded = !selected && selectedTalents.some(id => (data.talents.find(x => x.id === id)?.excludes || []).includes(t.id) || (t.excludes || []).includes(id));
    const bonus = Object.entries(t.attributes || {}).map(([k,v]) => `${ATTRIBUTE_META[k]?.name}${v > 0 ? "+" : ""}${v}`).join(" · ");
    return `<button class="talent-card ${selected ? "selected" : ""} ${excluded ? "disabled" : ""}" data-id="${t.id}" ${excluded ? "disabled" : ""}><header><h3>${t.name}</h3><span class="rarity">${["普通","稀有","传奇"][t.rarity-1] || "普通"}</span></header><p>${t.description}</p>${bonus ? `<small>${bonus}</small>` : ""}</button>`;
  }).join("");
  document.querySelectorAll(".talent-card").forEach(el => el.addEventListener("click", () => {
    const id = el.dataset.id;
    if (selectedTalents.includes(id)) selectedTalents = selectedTalents.filter(x => x !== id);
    else if (selectedTalents.length < 3) selectedTalents.push(id);
    else return toast("只能选择三项天赋");
    renderTalents();
  }));
}
function renderAttributes() {
  $("points-left").textContent = pointsLeft;
  $("attribute-confirm").disabled = pointsLeft !== 0;
  $("attribute-list").innerHTML = Object.entries(ATTRIBUTE_META).map(([key, meta]) => `<div class="attribute-row"><div class="attribute-name"><strong>${meta.name}</strong><small>${meta.hint}</small></div><div class="attribute-bar"><i style="width:${baseAttributes[key]*10}%"></i></div><div class="stepper"><button data-key="${key}" data-delta="-1" ${baseAttributes[key] <= 0 ? "disabled" : ""}>−</button><strong>${baseAttributes[key]}</strong><button data-key="${key}" data-delta="1" ${baseAttributes[key] >= 10 || pointsLeft <= 0 ? "disabled" : ""}>＋</button></div></div>`).join("");
  document.querySelectorAll(".stepper button").forEach(b => b.addEventListener("click", () => { const d=Number(b.dataset.delta); baseAttributes[b.dataset.key]+=d; pointsLeft-=d; renderAttributes(); }));
}
function beginLife() {
  state.talents = [...selectedTalents]; state.attributes = { ...baseAttributes };
  selectedTalents.forEach(id => { const t=data.talents.find(x=>x.id===id); applyResult({ attributes:t.attributes, addTags:t.tags }, state); });
  renderStatus(); showScreen("life-screen"); advanceYear();
}
function renderStatus() {
  $("current-age").textContent = Math.max(0,state.age);
  $("status-attributes").innerHTML = Object.entries(ATTRIBUTE_META).map(([k,m]) => `<div class="mini-attr"><span>${m.name}</span><strong>${state.attributes[k]}</strong></div>`).join("");
  $("status-talents").innerHTML = state.talents.map(id => `<i>${data.talents.find(t=>t.id===id)?.name || id}</i>`).join("");
  $("status-tags").innerHTML = state.tags.length ? state.tags.map(t => `<i>${t}</i>`).join("") : "<i>尚未形成</i>";
  if (location.search.includes("debug=1")) { $("debug-seed").textContent=`seed: ${state.seed}`; $("debug-age").value=state.age; }
}
function setEvent(event) {
  if (!event) return finishLife();
  state.currentEvent = event.id; state.occurred[event.id]=(state.occurred[event.id]||0)+1;
  $("event-age").textContent=state.age; $("event-year").textContent=`人生第 ${String(state.age+1).padStart(2,"0")} 页`;
  $("event-text").textContent=event.text; $("event-result").textContent=event.resultText || "";
  $("event-changes").innerHTML=""; $("choice-list").innerHTML="";
  if (event.choices?.length) {
    $("next-button").hidden=true;
    $("choice-list").innerHTML=event.choices.map((c,i) => { const reasons=[]; const ok=evaluateCondition(c.condition,state,reasons); return `<button class="choice-button" data-choice="${i}" ${ok?"":"disabled"}>${c.text}${ok?"":`<small>条件不足：${c.requirementText || reasons[0]}</small>`}</button>`; }).join("");
    document.querySelectorAll(".choice-button:not(:disabled)").forEach(b => b.addEventListener("click",()=>resolveEvent(event,event.choices[Number(b.dataset.choice)])));
  } else { $("next-button").hidden=false; resolveEvent(event); }
  renderStatus();
}
function resolveEvent(event, choice = null) {
  const result = choice?.result || event.result || {}; const changes=applyResult(result,state); const resultText=choice?.resultText || event.resultText || "";
  if (choice) { $("event-result").textContent=resultText; $("choice-list").innerHTML=""; $("next-button").hidden=false; }
  $("event-changes").innerHTML=changes.map(c=>`<span class="change ${c.delta>0?"positive":"negative"}">${ATTRIBUTE_META[c.key].name} ${c.delta>0?"+":""}${c.delta}</span>`).join("");
  state.history.push({ age:state.age,eventId:event.id,text:event.text,resultText,changes });
  renderHistory(); renderStatus();
  if (state.finished || state.attributes.health <= 0 || state.age >= 100) { state.finished=true; setTimeout(finishLife, 700/settings.animationSpeed); }
}
function advanceYear() {
  if (state.finished) return finishLife();
  state.age += 1;
  if (state.age > 100) { state.finished=true; return finishLife(); }
  const event=pickEvent(data.events,state,rng); setEvent(event);
}
function renderHistory() {
  $("history-list").innerHTML=[...state.history].reverse().slice(0,8).map(h=>`<div class="history-item"><strong>${h.age} 岁</strong><span>${h.text}</span></div>`).join("");
}
function finishLife() {
  stopAuto(); const ending=resolveEnding(data.endings,state); state.ending=ending?.id; const score=calculateScore(state,ending);
  $("ending-title").textContent=ending?.name || "无名人生"; $("ending-description").textContent=state.deathReason || ending?.description || "档案在这里合上。"; $("ending-score").textContent=score;
  $("ending-grade").textContent=score>=500?"传世人生":score>=350?"灿烂人生":score>=220?"值得纪念":"人间一程";
  $("ending-attributes").innerHTML=Object.entries(ATTRIBUTE_META).map(([k,m])=>`<div><span>${m.name}</span><strong>${state.attributes[k]}</strong></div>`).join("");
  const unlocked=new Set(JSON.parse(localStorage.getItem("returnlife.endings")||"[]")); if(ending) unlocked.add(ending.id);
  localStorage.setItem("returnlife.endings",JSON.stringify([...unlocked])); localStorage.setItem("returnlife.lastLife",JSON.stringify({...state,score})); showScreen("ending-screen");
}
function toggleAuto() {
  if(autoTimer) return stopAuto();
  $("auto-button").textContent="暂停播放";
  const tick=()=>{ if(state.finished||document.querySelector(".choice-button")) return stopAuto(); advanceYear(); autoTimer=setTimeout(tick,settings.autoSpeed); };
  autoTimer=setTimeout(tick,settings.autoSpeed);
}
function stopAuto(){ if(autoTimer) clearTimeout(autoTimer); autoTimer=null; const b=$("auto-button"); if(b)b.textContent="自动播放"; }
function openLastLife() {
  const last=JSON.parse(localStorage.getItem("returnlife.lastLife")||"null"); if(!last)return;
  state=last; const ending=data.endings.find(e=>e.id===last.ending); $("ending-title").textContent=ending?.name||"无名人生"; $("ending-description").textContent=ending?.description||""; $("ending-score").textContent=last.score||0; $("ending-grade").textContent="上一次人生";
  $("ending-attributes").innerHTML=Object.entries(ATTRIBUTE_META).map(([k,m])=>`<div><span>${m.name}</span><strong>${last.attributes[k]}</strong></div>`).join(""); showScreen("ending-screen");
}
function setupDebug() {
  if(!location.search.includes("debug=1")) return; $("debug-panel").hidden=false;
  $("debug-event").innerHTML=data.events.map(e=>`<option value="${e.id}">${e.id} · ${e.name}</option>`).join("");
  $("debug-apply").onclick=()=>{state.age=Number($("debug-age").value);renderStatus();toast("年龄已修改")};
  $("debug-trigger").onclick=()=>{const e=data.events.find(x=>x.id===$("debug-event").value);setEvent(e)};
  $("debug-output").textContent=`事件 ${data.events.length}\n天赋 ${data.talents.length}\n结局 ${data.endings.length}`;
}
function bindUI() {
  $("start-button").onclick=startNewGame; $("continue-button").onclick=openLastLife;
  $("talent-confirm").onclick=()=>{renderAttributes();showScreen("attribute-screen")}; $("attribute-back").onclick=()=>showScreen("talent-screen"); $("attribute-confirm").onclick=beginLife;
  $("next-button").onclick=advanceYear; $("auto-button").onclick=toggleAuto; $("restart-button").onclick=startNewGame; $("review-button").onclick=()=>{renderHistory();showScreen("life-screen")};
  $("settings-toggle").onclick=()=> $("settings-dialog").showModal(); $("sound-toggle").onclick=()=>{settings.sound=!settings.sound;$("sound-toggle").textContent=settings.sound?"♪":"×";saveSettings()};
  $("settings-dialog").addEventListener("close",()=>{settings.animationSpeed=Number($("animation-speed").value);settings.autoSpeed=Number($("auto-speed").value);settings.volume=Number($("volume-setting").value);saveSettings()});
  $("animation-speed").value=settings.animationSpeed;$("auto-speed").value=settings.autoSpeed;$("volume-setting").value=settings.volume;
}
async function init() {
  try { data=await loadGameData(); const errors=validateData(data); if(errors.length) throw new Error(errors.join("\n")); bindUI(); setupDebug(); saveSettings(); $("archive-number").textContent=String(JSON.parse(localStorage.getItem("returnlife.endings")||"[]").length+1).padStart(6,"0"); $("continue-button").hidden=!localStorage.getItem("returnlife.lastLife"); if(data.scenario){document.querySelector(".hero-title").innerHTML=`${data.scenario.protagonist}<br><em>荒诞人生</em>`;document.querySelector(".hero-copy").textContent=data.scenario.description;document.title=`${data.scenario.protagonist}的人生 · ReturnLife`;} showScreen("start-screen"); }
  catch(error){ $("loading-screen").innerHTML=`<p class="eyebrow">ARCHIVE ERROR</p><h1>档案无法打开</h1><p>${error.message.replaceAll("\n","<br>")}</p><p>请确认正在通过本地静态服务器访问。</p>`; console.error(error); }
}
init();
