' Dragon Splash Boot - 创建桌面快捷方式
' 双击本文件一次，桌面上就会出现一个带 Codex 图标的启动入口
Option Explicit

Dim fso, sh, base, desk, exePath, lnkPath, sc

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

base = fso.GetParentFolderName(WScript.ScriptFullName)
desk = sh.SpecialFolders("Desktop")
exePath = base & "\app\CodexSplash.exe"

If Not fso.FileExists(exePath) Then
    MsgBox "找不到播放器：" & vbCrLf & exePath & vbCrLf & vbCrLf & _
           "请先在 dotnet 目录执行：" & vbCrLf & _
           "  dotnet publish -c Release -r win-x64 --self-contained false -o ../app", _
           16, "Dragon Splash Boot"
    WScript.Quit 1
End If

lnkPath = desk & "\Codex.lnk"
If fso.FileExists(lnkPath) Then
    lnkPath = desk & "\Codex (启动动画).lnk"
End If

Set sc = sh.CreateShortcut(lnkPath)
sc.TargetPath = exePath
sc.WorkingDirectory = base
sc.IconLocation = exePath & ",0"
sc.Description = "Codex · 带启动动画"
sc.WindowStyle = 1
sc.Save

MsgBox "已创建桌面快捷方式：" & vbCrLf & vbCrLf & _
       lnkPath & vbCrLf & vbCrLf & _
       "双击它：播放启动动画 → Codex 就绪 → 画面淡出。" & vbCrLf & _
       "全程无黑窗口，图标就是 Codex 自己的。", 64, "Dragon Splash Boot"
