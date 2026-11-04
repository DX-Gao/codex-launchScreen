# 第三方资源与权利声明

本仓库的 **代码** 采用 MIT 许可证（见 `LICENSE`）。
但以下资源**不在 MIT 许可范围内**，请在使用、分发或二次开发前阅读。

---

## 1. `assets/codex.ico`

- **来源**：从本机安装的 OpenAI Codex 桌面客户端中提取
  （`%ProgramFiles%\WindowsApps\OpenAI.Codex_*\app\resources\icon-chatgpt.ico`）
- **权利归属**：OpenAI 的商标与图形资产
- **本仓库中的用途**：仅用于让本地启动器在视觉上与 Codex 保持一致
- **限制**：**不属于 MIT 许可范围**。如果你要 Fork 或分发本项目，建议自行替换为自有图标，
  或让使用者用 `extract-icon.ps1` 从自己已安装的客户端中提取。
- 本项目与 OpenAI 无任何隶属关系，也未获得其背书。

## 2. `media/*.mp4`

- 这些启动动画为配合本项目演示而生成。
- 其中的角色形象「白龙娘 / 蓝色大肥鱼」源自中文互联网社区的同人创作：
  - 原角色设计「溟月」© 上善无形（B 站）
  - DeepSeek 娘二创 © ZipZipPipe（B 站），协议 **CC BY-NC-SA 4.0**
- 因此这些视频**仅限非商业用途**，转载或再创作需保留署名并以相同协议共享。
- 如果你要商业使用，请替换为自有素材，或直接删除 `media/` 后放入自己的视频。

## 3. 依赖

| 依赖 | 许可 |
|---|---|
| .NET Framework 4.8（系统自带） | Microsoft 最终用户许可 |
| System.Text.Json | MIT |
| Microsoft.NETFramework.ReferenceAssemblies（仅构建时） | MIT |

## 4. 免责

本项目通过 `shell:AppsFolder` 启动本机已安装的应用，**不修改**系统设置、不替换快捷方式、
不安装任何常驻服务。若你要集成到自己的分发版本中，请自行评估合规性。
