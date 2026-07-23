export async function loadGameData() {
  const files = ["talents", "events", "endings"];
  const responses = await Promise.all(files.map(name => fetch(`data/${name}.json`).then(r => {
    if (!r.ok) throw new Error(`${name}.json 加载失败（${r.status}）`);
    return r.json();
  })));
  const gameData = Object.fromEntries(files.map((name, i) => [name, responses[i]]));
  const requestedScenario = new URLSearchParams(location.search).get("scenario");
  const scenario = requestedScenario === "standard" ? null : (requestedScenario || "xuchen");
  if (scenario) {
    const embedded = document.getElementById(`scenario-${scenario}`);
    let temporary;
    if (embedded) {
      temporary = JSON.parse(embedded.textContent);
    } else {
      const response = await fetch(`data/temp-${scenario}.json`);
      if (!response.ok) throw new Error(`临时剧本 ${scenario} 加载失败（${response.status}）`);
      temporary = await response.json();
    }
    gameData.events = temporary.events;
    gameData.endings = temporary.endings;
    gameData.scenario = temporary;
  }
  return gameData;
}
