<#
.SYNOPSIS
    从本机已安装的 Codex 客户端中提取图标，保存为 assets/codex.ico

.DESCRIPTION
    图标属于 OpenAI 的商标资产，不在本项目 MIT 许可范围内。
    如果你 Fork 了本项目并希望避免分发他人商标，
    可以删除仓库里的 assets/codex.ico，让使用者运行本脚本自行提取。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\extract-icon.ps1
#>

$ErrorActionPreference = 'Stop'

$root      = Split-Path -Parent $MyInvocation.MyCommand.Path
$assetsDir = Join-Path $root 'assets'
$target    = Join-Path $assetsDir 'codex.ico'

if (-not (Test-Path $assetsDir)) {
    New-Item -ItemType Directory -Path $assetsDir | Out-Null
}

Write-Host '正在查找已安装的 Codex 客户端...' -ForegroundColor Cyan

$candidates = @()
$candidates += Get-ChildItem "$env:ProgramFiles\WindowsApps" -Directory -Filter 'OpenAI.Codex_*' -ErrorAction SilentlyContinue
$candidates += Get-ChildItem "${env:ProgramFiles(x86)}\WindowsApps" -Directory -Filter 'OpenAI.Codex_*' -ErrorAction SilentlyContinue
$candidates += Get-ChildItem "$env:LOCALAPPDATA\Programs" -Directory -Filter '*Codex*' -ErrorAction SilentlyContinue

if (-not $candidates -or $candidates.Count -eq 0) {
    Write-Host '没有找到 Codex 安装目录。' -ForegroundColor Red
    Write-Host '请确认已安装 Codex 桌面客户端，或自行准备一个 .ico 放到 assets/codex.ico。'
    exit 1
}

$found = $null
foreach ($dir in $candidates) {
    foreach ($rel in @('app\resources\icon-chatgpt.ico', 'resources\icon-chatgpt.ico', 'icon-chatgpt.ico')) {
        $p = Join-Path $dir.FullName $rel
        if (Test-Path $p) { $found = $p; break }
    }
    if ($found) { break }
}

if (-not $found) {
    Write-Host '找到了 Codex 目录，但里面没有 icon-chatgpt.ico。' -ForegroundColor Red
    Write-Host '可以手动在安装目录里找一个 .ico，复制为 assets\codex.ico。'
    exit 1
}

Copy-Item -LiteralPath $found -Destination $target -Force

$size = [math]::Round((Get-Item $target).Length / 1KB, 1)
Write-Host ''
Write-Host "已提取图标: $target ($size KB)" -ForegroundColor Green
Write-Host '重新编译后图标会被写入 exe：' -ForegroundColor DarkGray
Write-Host '  cd dotnet; dotnet publish -c Release -o ../app' -ForegroundColor DarkGray
