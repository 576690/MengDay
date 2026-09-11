Add-Type -AssemblyName System.Drawing
$outputRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'public'
foreach ($size in @(180,192,512)) {
  $bitmap = [System.Drawing.Bitmap]::new($size,$size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#5568ed'))
  $scale = $size / 512.0
  $graphics.ScaleTransform($scale,$scale)
  $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::White,34)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $points = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(124,334),[System.Drawing.PointF]::new(124,178),[System.Drawing.PointF]::new(256,300),[System.Drawing.PointF]::new(388,178),[System.Drawing.PointF]::new(388,334))
  $graphics.DrawLines($pen,$points)
  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#bac7ff'))
  $graphics.FillEllipse($brush,238,352,36,36)
  $name = if ($size -eq 180) {'apple-touch-icon.png'} else {"icon-$size.png"}
  $bitmap.Save((Join-Path $outputRoot $name),[System.Drawing.Imaging.ImageFormat]::Png)
  $brush.Dispose(); $pen.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
