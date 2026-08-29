Add-Type -AssemblyName System.Drawing
function Resize-Image {
    param(
        [string]$inFile,
        [string]$outFile,
        [int]$size
    )
    $img = [System.Drawing.Image]::FromFile($inFile)
    $newImg = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($newImg)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $size, $size)
    $img.Dispose()
    $newImg.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $newImg.Dispose()
}

Resize-Image 'd:\ВЛАД\CubeTimer\images\settings.png' 'd:\ВЛАД\CubeTimer\images\settings_resized.png' 64
Move-Item -Force 'd:\ВЛАД\CubeTimer\images\settings_resized.png' 'd:\ВЛАД\CubeTimer\images\settings.png'

Resize-Image 'd:\ВЛАД\CubeTimer\images\sessions.png' 'd:\ВЛАД\CubeTimer\images\sessions_resized.png' 64
Move-Item -Force 'd:\ВЛАД\CubeTimer\images\sessions_resized.png' 'd:\ВЛАД\CubeTimer\images\sessions.png'

Resize-Image 'd:\ВЛАД\CubeTimer\images\statistics.png' 'd:\ВЛАД\CubeTimer\images\statistics_resized.png' 64
Move-Item -Force 'd:\ВЛАД\CubeTimer\images\statistics_resized.png' 'd:\ВЛАД\CubeTimer\images\statistics.png'

$ico = [System.Drawing.Image]::FromFile('d:\ВЛАД\CubeTimer\images\favicon-32x32.png')
$ico.Save('d:\ВЛАД\CubeTimer\favicon.ico', [System.Drawing.Imaging.ImageFormat]::Icon)
$ico.Dispose()
