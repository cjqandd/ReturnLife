export async function loadGameData() {
  const files = ["talents", "events", "endings"];
  const responses = await Promise.all(files.map(name => fetch(`data/${name}.json`).then(r => {
    if (!r.ok) throw new Error(`${name}.json 加载失败（${r.status}）`);
    return r.json();
  })));
  return Object.fromEntries(files.map((name, i) => [name, responses[i]]));
}
