# Construit l'agent de signature (programme natif .NET, quelques dizaines de Ko) puis l'installateur Inno Setup.
#   dist\DSIHubSignatureAgent.exe        : l'agent
#   dist\DSIHubSignatureAgent-Setup.exe  : l'installateur (si Inno Setup 6 est installé ; sinon -SansSetup)
# Aucun prérequis de compilation : csc.exe est livré avec Windows (.NET Framework 4.x).
param([switch]$SansSetup)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
Get-ChildItem $dist -File | ForEach-Object { try { Remove-Item $_.FullName -Force -ErrorAction Stop } catch { throw "Impossible de remplacer $($_.Name) : l'agent est-il lancé depuis dist ? (taskkill /IM DSIHubSignatureAgent.exe /F)" } }

# ── Icône du programme (même dessin que l'icône de la zone de notification), PNG 16/32/256 dans un fichier .ico
Add-Type -AssemblyName System.Drawing
function New-IconPng([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $k = $size / 32.0
  $g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(79, 70, 229))), [single]$k, [single]$k, [single](30 * $k), [single](30 * $k))
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [single](3 * $k))
  $g.DrawEllipse($pen, [single](6 * $k), [single](11 * $k), [single](9 * $k), [single](9 * $k))
  $g.DrawLine($pen, [single](15 * $k), [single](15 * $k), [single](26 * $k), [single](15 * $k))
  $g.DrawLine($pen, [single](22 * $k), [single](15 * $k), [single](22 * $k), [single](20 * $k))
  $g.DrawLine($pen, [single](26 * $k), [single](15 * $k), [single](26 * $k), [single](19 * $k))
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  , $ms.ToArray()
}
$sizes = 16, 32, 256
$pngs = $sizes | ForEach-Object { , (New-IconPng $_) }
$ico = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $ico
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]; $dim = if ($s -ge 256) { 0 } else { $s }
  $w.Write([byte]$dim); $w.Write([byte]$dim); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$pngs[$i].Length); $w.Write([uint32]$offset)
  $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $w.Write($p) }
$w.Flush()
$icoFile = Join-Path $dist 'agent.ico'
[System.IO.File]::WriteAllBytes($icoFile, $ico.ToArray())

# ── Compilation
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$exe = Join-Path $dist 'DSIHubSignatureAgent.exe'
& $csc /nologo /target:winexe /optimize+ /codepage:65001 "/win32icon:$icoFile" "/out:$exe" `
  /r:System.dll /r:System.Core.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll `
  (Join-Path $root 'Agent.cs')
if ($LASTEXITCODE -ne 0) { throw 'Compilation échouée.' }
Remove-Item $icoFile -Force
Write-Output ("Agent prêt : {0} ({1:N0} Ko)" -f $exe, ((Get-Item $exe).Length / 1KB))

# ── Installateur
if (-not $SansSetup) {
  $iscc = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe", "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $iscc) { throw 'Inno Setup 6 introuvable (ou lancez avec -SansSetup).' }
  Push-Location $root
  try { & $iscc /Q setup.iss; if ($LASTEXITCODE -ne 0) { throw 'Compilation du setup échouée.' } } finally { Pop-Location }
  $setup = Join-Path $dist 'DSIHubSignatureAgent-Setup.exe'
  Write-Output ("Installateur prêt : {0} ({1:N0} Ko)" -f $setup, ((Get-Item $setup).Length / 1KB))
}
