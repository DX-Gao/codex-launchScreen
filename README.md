# Dragon Splash Boot

给 Codex 桌面端换一个启动动画：**双击图标 → 全屏播一段动画 → Codex 就绪后画面真正淡出（透明度渐变，不是硬切黑）→ 开始干活。**

不修改系统设置、不替换快捷方式、不常驻后台、不需要管理员权限。

> Windows 10/11 x64 · 零运行时依赖（.NET Framework 4.8 系统自带）· MIT

---

## 特性

- **无控制台窗口**：`WinExe` 编译，双击就是动画，没有黑框一闪
- **并行启动**：动画起来 250ms 后就开始拉 Codex，不浪费那十几秒
- **渐变转场**：进场从黑中浮现，退场淡回全黑再关窗，不是硬切
- **末段循环**：视频播完但 Codex 还没好时，自动跳到最后 3.5 秒循环，画面一直在呼吸，不会僵在末帧
- **一键换动画**：网页面板里点一下，不用改代码
- **零依赖**：目标框架 .NET Framework 4.8，Win10/11 自带，用户不用装任何东西
- **体积小**：程序 1.3MB，四条 1080p 动画共 57MB

---

## 效果时间线

| 时间 | 发生什么 |
|---|---|
| 0ms | 全屏窗口出现，视频上方盖一层纯黑遮罩，画面全黑 |
| 视频首帧就绪 | 黑幕用 420ms 淡开，动画从黑中浮现 |
| 250ms | `shell:AppsFolder` 拉起 Codex，与动画并行 |
| ~2s | 检测到 Codex 主窗口就绪（`MainWindowHandle != 0`） |
| 动画结束 | 若 Codex 已就绪 → 黑幕 700ms 淡回全黑再关窗；若未就绪 → 末段循环等待 |
| 结束 | 窗口关闭，桌面交还给你 |

---

## 快速开始

### 克隆即用

本仓库已包含编译好的 `app/`，克隆后直接：

1. 双击 `app/CodexSplash.exe` —— 立刻播放当前选中的动画
2. 想固定入口：双击 `创建桌面快捷方式.vbs`，桌面会生成带图标的快捷方式

需要 .NET Framework 4.8，Windows 10/11 系统自带，不用装任何东西。

### 从源码构建

需要 [.NET SDK 8](https://dotnet.microsoft.com/download/dotnet/8.0)：

```bash
dotnet publish dotnet/CodexSplash.csproj -c Release -o app
```

然后双击 `创建桌面快捷方式.vbs`。

---

## 换成你自己的动画

**1. 把 mp4 丢进 `media/`**

要求：H.264 + AAC，16:9 或任意比例（播放器会自动补黑边，不会拉伸）。

**2. 编辑 `launcher.json`**

```json
{
  "animations": [
    {
      "id": "e",
      "name": "E · 我的开场",
      "desc": "一句话说明",
      "file": "media/e-我的开场.mp4",
      "duration": 9.5
    }
  ]
}
```

`duration` 要填准确——它用来算末段循环的起点，也用于兜底超时。

**3. 切换**

双击 `设置面板.bat`，在浏览器里点选即可。

---

## 配置说明

```json
{
  "current": "b",          // 当前使用哪条动画
  "volume": 0.85,
  "waitForApp": true,      // false = 播完就收，不等应用
  "maxWaitMs": 60000,      // 等太久强制收场
  "fadeOutMs": 700,        // 淡出时长
  "appLaunch": {
    "enabled": true,
    "mode": "appsFolder",  // appsFolder = 商店应用；exe = 普通程序
    "target": "OpenAI.Codex_2p2nqsd0c76g0!App",
    "processName": "ChatGPT.exe",
    "path": "",
    "args": []
  }
}
```

### 为什么是 appsFolder 模式

Codex 桌面端是 **MSIX（微软商店）安装包**，装在 `C:\Program Files\WindowsApps\`，该目录有权限保护，**不能按 exe 路径直接启动**。正确方式是用应用 ID：

```
explorer.exe shell:AppsFolder\OpenAI.Codex_2p2nqsd0c76g0!App
```

在自己的机器上查 ID：

```powershell
Get-StartApps | Where-Object { $_.Name -like "*Codex*" }
```

`processName` 是用于判断"是否启动完成"的进程名。Codex 打包在 ChatGPT 桌面端里，所以是 `ChatGPT.exe`——用自己的程序时改成对应的名字。

普通 exe 程序：`mode` 改 `"exe"`，填 `path`，`processName` 改成它自己的进程名。

---

## 工作原理

```
双击快捷方式
  └─ CodexSplash.exe（WPF，无控制台）
       ├─ 读 launcher.json，选中 current 那条动画
       ├─ 全屏播放（MediaElement，contain 模式，任意比例不拉伸）
       ├─ 250ms 后 shell:AppsFolder 拉起 Codex
       ├─ 每 300ms 检查：
       │    · 视频播完了吗？（MediaEnded → 末段循环）
       │    · Codex 有主窗口了吗？（MainWindowHandle != 0）
       ├─ 两个都满足 → 黑幕 0→1 淡 700ms 盖住画面
       └─ 关窗退出
```

日志写在 `logs/splash.log`，出问题先看这个（双击 `查看日志.bat`）。

---

## 常见问题

**双击没反应 / 不出动画**
看 `logs/splash.log`。常见原因是 `launcher.json` 路径不对，或媒体文件缺失。

**Codex 起来了但动画不收**
`processName` 可能不匹配。用任务管理器看真实进程名，改 `appLaunch.processName`。
或者把 `waitForApp` 设为 `false`，变成"播完就收"。

**动画收得太早/太晚**
调 `fadeOutMs`（淡出时长）和 `maxWaitMs`（最长等待）。

**Windows 提示"已保护你的电脑"**
exe 未做代码签名，这是所有开源 Windows 工具的常态。点"更多信息 → 仍要运行"。
不要从非官方渠道下载本项目的 exe。

**视频不播放 / 黑屏**
视频需要 H.264 编码。Windows N 版等缺少媒体组件的系统可能无法播放。

---

## 已知限制

- 仅支持 **Windows**（WPF）
- **退场是"淡到黑"，不是窗口整体变透明**。原因很关键：
  WPF 一旦让窗口半透明（`Window.Opacity < 1` 或 `AllowsTransparency="True"`），
  会切到分层窗口模式，`MediaElement` 的视频画面就不再参与合成，
  表现为"时间轴在走、日志正常，但屏幕一片黑"。
  所以转场只能做在窗口内部的黑幕层上，桌面不会从动画里透出来。
- 不用 `WindowState="Maximized"`：无边框窗口最大化时会把不可见边框算进尺寸，
  窗口被撑得比屏幕宽，居中播放的画面会整体偏移。这里按主屏尺寸精确铺满。
- 不做 DWM 缩略图嵌入——那个效果需要为每条视频手工标定"屏幕矩形关键帧"，
  本项目走"就绪即淡出"，换来任意视频即插即用
- 快捷方式需要手动创建，不会像某些工具那样自动扫描替换系统里的 `.lnk`

---

## 许可

- **代码**：[MIT](LICENSE)
- **`assets/codex.ico`**：OpenAI 的商标资产，**不在 MIT 范围内**，仅为本地视觉一致性而保留。
  Fork 或分发前建议替换，或让使用者运行 `extract-icon.ps1` 从自己已安装的客户端提取。
- **`media/*.mp4`**：角色形象源自社区同人创作（CC BY-NC-SA 4.0），**仅限非商业使用**。

细节见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

本项目与 OpenAI 无隶属关系，未获其背书。

---

## 致谢

- [dragon-codex-boot](https://github.com/yushua0808-cpu/dragon-codex-boot) —— 最初的灵感来源
- 「溟月」原案 © 上善无形 · DeepSeek 娘二创 © ZipZipPipe
