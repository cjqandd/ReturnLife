# ReturnLife

一个零依赖的 HTML 人生重开模拟器 Demo。游戏逻辑与剧情数据分离，后续可以只编辑 JSON 扩充剧本。

## 启动

由于浏览器不允许网页直接读取本地 JSON，请在项目目录启动任意静态服务器。

```powershell
python -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 剧本文件

- `data/talents.json`：天赋
- `data/events.json`：年龄事件与选择
- `data/endings.json`：结局

条件支持 `all`、`any`、`not`、属性比较、标签、天赋和已发生事件。结果支持属性变化、标签增删、后续事件、死亡与指定结局。所有引用使用稳定 ID。

默认剧本是许辰的幸福荒诞人生，剧情直接内嵌在 `index.html` 中。URL 加上 `?standard=1` 不会改变剧本；如需临时查看原通用事件，可使用 `?scenario=standard`。

URL 加上 `?debug=1` 可打开调试面板。
