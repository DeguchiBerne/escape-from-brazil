# Gera favicon e ícones do Android a partir de efb.jpg: powershell -File scripts/icons.ps1 -root .
param([string]$root)
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile("$root\efb.jpg")

# Recorte quadrado em volta do senador a cavalo. "full" é o que o ícone adaptativo do
# Android recebe (108dp, a máscara mostra só o miolo de 72dp); "safe" é esse miolo.
$cx = 672; $cy = 1140; $full = 1150; $safe = [int]($full * 72 / 108)

function Save([int]$size, [int]$crop, [string]$path, [bool]$round) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'AntiAlias'; $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  if ($round) {
    $r = [int]($size * 0.18); $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddArc(0, 0, 2*$r, 2*$r, 180, 90); $p.AddArc($size-2*$r, 0, 2*$r, 2*$r, 270, 90)
    $p.AddArc($size-2*$r, $size-2*$r, 2*$r, 2*$r, 0, 90); $p.AddArc(0, $size-2*$r, 2*$r, 2*$r, 90, 90)
    $p.CloseFigure(); $g.SetClip($p)
  }
  $rect = New-Object System.Drawing.Rectangle ([int]($cx - $crop/2)), ([int]($cy - $crop/2)), $crop, $crop
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $size, $size), $rect, 'Pixel')
  $g.Dispose()
  New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
}


# Web: favicon e ícone para "adicionar à tela inicial".
Save 32 $safe "$root\icons\favicon-32.png" $true
Save 180 $safe "$root\icons\apple-touch-icon.png" $false
Save 192 $safe "$root\icons\icon-192.png" $true
Save 512 $safe "$root\icons\icon-512.png" $true

# Android: legado (arredondado) + primeiro plano do adaptativo, por densidade.
$res = "$root\android\app\src\main\res"
foreach ($d in @(@('mdpi',1), @('hdpi',1.5), @('xhdpi',2), @('xxhdpi',3), @('xxxhdpi',4))) {
  Save ([int](48 * $d[1])) $safe "$res\mipmap-$($d[0])\ic_launcher.png" $true
  Save ([int](108 * $d[1])) $full "$res\mipmap-$($d[0])\ic_launcher_foreground.png" $false
}
$src.Dispose()
