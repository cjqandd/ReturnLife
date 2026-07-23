export const ATTRIBUTE_META = {
  charm: { name: "颜值", hint: "外貌与气质" },
  intelligence: { name: "智力", hint: "理解与学习" },
  health: { name: "体质", hint: "健康与耐力" },
  wealth: { name: "家境", hint: "资源与起点" },
  happiness: { name: "快乐", hint: "感受幸福的能力" }
};
export const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
export function hashSeed(value) {
  let h = 2166136261;
  for (const char of String(value)) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function createRng(seed) {
  let state = hashSeed(seed) || 1;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function newGameState(seed = Date.now()) {
  return { seed: String(seed), age: -1, attributes: Object.fromEntries(Object.keys(ATTRIBUTE_META).map(k => [k, 0])), talents: [], tags: [], history: [], occurred: {}, queue: [], currentEvent: null, ending: null, finished: false };
}
function compare(actual, op, expected) {
  return ({ eq: actual === expected, neq: actual !== expected, gt: actual > expected, gte: actual >= expected, lt: actual < expected, lte: actual <= expected })[op];
}
export function evaluateCondition(condition, state, explain = []) {
  if (!condition || Object.keys(condition).length === 0) return true;
  if (condition.all) return condition.all.every(c => evaluateCondition(c, state, explain));
  if (condition.any) return condition.any.some(c => evaluateCondition(c, state, explain));
  if (condition.not) return !evaluateCondition(condition.not, state, explain);
  let passed = true;
  if (condition.attribute) passed = compare(state.attributes[condition.attribute] ?? 0, condition.op || "gte", condition.value);
  else if (condition.hasTag) passed = state.tags.includes(condition.hasTag);
  else if (condition.missingTag) passed = !state.tags.includes(condition.missingTag);
  else if (condition.hasTalent) passed = state.talents.includes(condition.hasTalent);
  else if (condition.eventOccurred) passed = Boolean(state.occurred[condition.eventOccurred]);
  else if (condition.age) {
    const ageRule = typeof condition.age === "object" ? condition.age : condition;
    passed = compare(state.age, ageRule.op || condition.op || "gte", ageRule.value ?? condition.value);
  }
  else passed = false;
  if (!passed) explain.push(JSON.stringify(condition));
  return passed;
}
export function applyResult(result = {}, state) {
  const changes = [];
  for (const [key, delta] of Object.entries(result.attributes || {})) {
    const before = state.attributes[key] ?? 0;
    state.attributes[key] = clamp(before + delta);
    if (state.attributes[key] !== before) changes.push({ key, delta: state.attributes[key] - before });
  }
  for (const tag of result.addTags || []) if (!state.tags.includes(tag)) state.tags.push(tag);
  for (const tag of result.removeTags || []) state.tags = state.tags.filter(t => t !== tag);
  for (const id of result.queueEvents || []) state.queue.push(id);
  if (result.death) { state.finished = true; state.deathReason = result.death; }
  if (result.ending) { state.finished = true; state.forcedEnding = result.ending; }
  return changes;
}
export function eligibleEvents(events, state) {
  return events.filter(event => {
    if (state.age < event.ageMin || state.age > event.ageMax) return false;
    if (!event.repeatable && state.occurred[event.id]) return false;
    return evaluateCondition(event.condition, state);
  });
}
export function weightedPick(items, rng) {
  if (!items.length) return null;
  const total = items.reduce((sum, x) => sum + Math.max(0, x.weight ?? 1), 0);
  if (total <= 0) return items[0];
  let roll = rng() * total;
  for (const item of items) { roll -= Math.max(0, item.weight ?? 1); if (roll < 0) return item; }
  return items.at(-1);
}
export function pickEvent(events, state, rng) {
  if (state.queue.length) {
    const queuedId = state.queue.shift();
    const queued = events.find(e => e.id === queuedId);
    if (queued) return queued;
  }
  return weightedPick(eligibleEvents(events, state), rng) || events.find(e => e.id === "fallback");
}
export function resolveEnding(endings, state) {
  if (state.forcedEnding) return endings.find(e => e.id === state.forcedEnding);
  return endings.filter(e => evaluateCondition(e.condition, state)).sort((a, b) => (b.priority || 0) - (a.priority || 0))[0] || endings.find(e => e.id === "ordinary_life");
}
export function calculateScore(state, ending) {
  const attrs = Object.values(state.attributes).reduce((a, b) => a + b, 0);
  const years = Math.min(state.age, 100) * 2;
  const variety = Object.keys(state.occurred).length * 2;
  return Math.max(0, Math.round(attrs + years + variety + (ending?.scoreBonus || 0)));
}
export function validateData({ talents, events, endings }) {
  const errors = [], check = (items, type) => {
    const ids = new Set();
    items.forEach((item, i) => { if (!item.id || !item.name) errors.push(`${type}[${i}] 缺少 id 或 name`); if (ids.has(item.id)) errors.push(`${type} 存在重复 ID：${item.id}`); ids.add(item.id); });
    return ids;
  };
  const talentIds = check(talents, "talents"), eventIds = check(events, "events"), endingIds = check(endings, "endings");
  talents.forEach(t => (t.excludes || []).forEach(id => { if (!talentIds.has(id)) errors.push(`天赋 ${t.id} 引用了不存在的互斥天赋 ${id}`); }));
  events.forEach(e => {
    [...(e.result?.queueEvents || []), ...(e.choices || []).flatMap(c => c.result?.queueEvents || [])].forEach(id => { if (!eventIds.has(id)) errors.push(`事件 ${e.id} 引用了不存在的事件 ${id}`); });
    [e.result?.ending, ...(e.choices || []).map(c => c.result?.ending)].filter(Boolean).forEach(id => { if (!endingIds.has(id)) errors.push(`事件 ${e.id} 引用了不存在的结局 ${id}`); });
  });
  return errors;
}
