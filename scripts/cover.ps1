# Gera icons/capa.jpg (capa leve da tela inicial) a partir de efb.jpg: powershell -File scriptsver.ps1 -root .
param([string]$root)
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile("$root\efb.jpg")
$w = 720; $h = [int]($src.Height * $w / $src.Width)
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
$g.DrawImage($src, 0, 0, $w, $h); $g.Dispose()
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$p = New-Object System.Drawing.Imaging.EncoderParameters 1
$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 82L
$bmp.Save("$root\icons\capa.jpg", $enc, $p); $bmp.Dispose(); $src.Dispose()
