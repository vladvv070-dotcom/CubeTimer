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
    $newImg.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $newImg.Dispose()
    $img.Dispose()
}

Resize-Image 'd:\ВЛАД\CubeTimer\images\settings.png' 'd:\ВЛАД\CubeTimer\images\settings.png' 64
Resize-Image 'd:\ВЛАД\CubeTimer\images\sessions.png' 'd:\ВЛАД\CubeTimer\images\sessions.png' 64
Resize-Image 'd:\ВЛАД\CubeTimer\images\statistics.png' 'd:\ВЛАД\CubeTimer\images\statistics.png' 64

$ico = [System.Drawing.Image]::FromFile('d:\ВЛАД\CubeTimer\images\favicon-32x32.png')
$ico.Save('d:\ВЛАД\CubeTimer\favicon.ico', [System.Drawing.Imaging.ImageFormat]::Icon)
$ico.Dispose()
