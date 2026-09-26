param(
    [Parameter(Mandatory=$true)]
    [string]$PrinterName,

    [string]$DataPath,

    [string]$ImagePath
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

if (-not [System.Drawing.Printing.PrinterSettings]::InstalledPrinters.Contains($PrinterName)) {
    throw "A impressora '$PrinterName' nao foi encontrada no Windows."
}

function Get-ScfText {
    param($Value)
    if ($null -eq $Value) { return "" }
    return ([string]$Value).Trim()
}

function New-ScfFont {
    param(
        [string]$Name,
        [double]$Size,
        [System.Drawing.FontStyle]$Style
    )

    return [System.Drawing.Font]::new(
        $Name,
        [single]$Size,
        $Style,
        [System.Drawing.GraphicsUnit]::Point
    )
}

function Convert-ScfDataImageToBitmap {
    param([string]$DataImage)

    if ([string]::IsNullOrWhiteSpace($DataImage)) {
        return $null
    }

    $match = [regex]::Match(
        $DataImage,
        '^data:image/(?:png|jpeg|jpg);base64,(.+)$',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    if (-not $match.Success) {
        return $null
    }

    $bytes = [Convert]::FromBase64String(
        ($match.Groups[1].Value -replace '\s', '')
    )

    $stream = New-Object System.IO.MemoryStream(,$bytes)
    try {
        $temp = [System.Drawing.Image]::FromStream($stream)
        try {
            # Copia para desacoplar a imagem do MemoryStream.
            return [System.Drawing.Bitmap]::new($temp)
        }
        finally {
            $temp.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Invoke-ScfCashReceiptPrint {
    param(
        $Data,
        [string]$TargetPrinter
    )

    $rows = @()
    if ($null -ne $Data.rows) {
        $rows = @($Data.rows)
    }

    $title = Get-ScfText $Data.title
    if ([string]::IsNullOrWhiteSpace($title)) {
        $title = "COMPROVANTE DE CAIXA"
    }

    $signature = Get-ScfText $Data.signature
    if ([string]::IsNullOrWhiteSpace($signature)) {
        $signature = "ASSINATURA DO OPERADOR"
    }

    $estimatedHeight = 260
    foreach ($row in $rows) {
        $label = Get-ScfText $row.label
        $value = Get-ScfText $row.value
        $full = ($row.full -eq $true)

        if ($full) {
            $estimatedHeight += 34 + ([Math]::Max(0, [Math]::Ceiling($value.Length / 42.0) - 1) * 16)
        }
        else {
            $estimatedHeight += 23
        }
    }

    $paperHeightHundredths = [Math]::Max(500, [Math]::Min(2200, [int]$estimatedHeight))

    $document = New-Object System.Drawing.Printing.PrintDocument
    $document.PrintController = New-Object System.Drawing.Printing.StandardPrintController
    $document.PrinterSettings.PrinterName = $TargetPrinter

    if (-not $document.PrinterSettings.IsValid) {
        throw "A fila '$TargetPrinter' existe, mas o driver nao foi considerado valido."
    }

    $document.DocumentName = "e-fisco comprovante de caixa"
    $document.OriginAtMargins = $false

    $paper = [System.Drawing.Printing.PaperSize]::new(
        "Bobina 80mm e-fisco",
        315,
        $paperHeightHundredths
    )

    $document.DefaultPageSettings.PaperSize = $paper
    $document.DefaultPageSettings.Margins = [System.Drawing.Printing.Margins]::new(0, 0, 0, 0)

    $fontName = "Arial"
    $fontTitle = New-ScfFont $fontName 10.0 ([System.Drawing.FontStyle]::Bold)
    $fontLabel = New-ScfFont $fontName 7.4 ([System.Drawing.FontStyle]::Bold)
    $fontValue = New-ScfFont $fontName 7.4 ([System.Drawing.FontStyle]::Regular)
    $fontValueBold = New-ScfFont $fontName 7.4 ([System.Drawing.FontStyle]::Bold)
    $fontSignature = New-ScfFont $fontName 7.2 ([System.Drawing.FontStyle]::Bold)

    $center = [System.Drawing.StringFormat]::new()
    $center.Alignment = [System.Drawing.StringAlignment]::Center
    $center.LineAlignment = [System.Drawing.StringAlignment]::Near
    $center.Trimming = [System.Drawing.StringTrimming]::Word

    $left = [System.Drawing.StringFormat]::new()
    $left.Alignment = [System.Drawing.StringAlignment]::Near
    $left.LineAlignment = [System.Drawing.StringAlignment]::Near
    $left.Trimming = [System.Drawing.StringTrimming]::Word

    $right = [System.Drawing.StringFormat]::new()
    $right.Alignment = [System.Drawing.StringAlignment]::Far
    $right.LineAlignment = [System.Drawing.StringAlignment]::Near
    $right.Trimming = [System.Drawing.StringTrimming]::Word

    $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::Black, [single]0.7)
    $brush = [System.Drawing.Brushes]::Black

    $handler = [System.Drawing.Printing.PrintPageEventHandler]{
        param($sender, $e)

        $g = $e.Graphics
        $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

        $bounds = $e.MarginBounds
        if ($bounds.Width -le 0) {
            $bounds = $e.PageBounds
        }

        $contentWidth = [Math]::Min(268, [Math]::Max(1, $bounds.Width - 2))
        $x = [single]$bounds.Left
        $y = [single]($bounds.Top + 4)

        function Draw-CenterWrapped([string]$text, $font, [single]$after, [ref]$YRef) {
            if ([string]::IsNullOrWhiteSpace($text)) { return }
            $currentY = [single]$YRef.Value
            $size = $g.MeasureString($text, $font, [int]$contentWidth, $center)
            $h = [single][Math]::Ceiling($size.Height)
            $rect = [System.Drawing.RectangleF]::new($x, $currentY, [single]$contentWidth, [single]($h + 2))
            $g.DrawString($text, $font, $brush, $rect, $center)
            $YRef.Value = [single]($currentY + $h + 2 + $after)
        }

        function Draw-LeftWrapped([string]$text, $font, [single]$after, [ref]$YRef) {
            if ([string]::IsNullOrWhiteSpace($text)) { return }
            $currentY = [single]$YRef.Value
            $size = $g.MeasureString($text, $font, [int]$contentWidth, $left)
            $h = [single][Math]::Ceiling($size.Height)
            $rect = [System.Drawing.RectangleF]::new($x, $currentY, [single]$contentWidth, [single]($h + 2))
            $g.DrawString($text, $font, $brush, $rect, $left)
            $YRef.Value = [single]($currentY + $h + 2 + $after)
        }

        function Draw-LeftRight([string]$label, [string]$value, [ref]$YRef) {
            $currentY = [single]$YRef.Value
            $leftWidth = [single]($contentWidth * 0.47)
            $rightWidth = [single]($contentWidth - $leftWidth)
            $labelSize = $g.MeasureString($label, $fontLabel, [int]$leftWidth, $left)
            $valueSize = $g.MeasureString($value, $fontValueBold, [int]$rightWidth, $right)
            $h = [single][Math]::Max([Math]::Ceiling($labelSize.Height), [Math]::Ceiling($valueSize.Height))
            $h = [single][Math]::Max($h, 14)

            $rectL = [System.Drawing.RectangleF]::new($x, $currentY, $leftWidth, [single]($h + 2))
            $rectR = [System.Drawing.RectangleF]::new([single]($x + $leftWidth), $currentY, $rightWidth, [single]($h + 2))

            $g.DrawString($label, $fontLabel, $brush, $rectL, $left)
            $g.DrawString($value, $fontValueBold, $brush, $rectR, $right)
            $YRef.Value = [single]($currentY + $h + 4)
        }

        function Draw-Rule([single]$before, [single]$after, [ref]$YRef) {
            $currentY = [single]$YRef.Value + $before
            $g.DrawLine($pen, $x, $currentY, [single]($x + $contentWidth), $currentY)
            $YRef.Value = [single]($currentY + $after)
        }

        Draw-CenterWrapped $title $fontTitle 3 ([ref]$y)
        Draw-Rule 1 6 ([ref]$y)

        foreach ($row in $rows) {
            $label = (Get-ScfText $row.label).ToUpperInvariant()
            $value = Get-ScfText $row.value

            if ([string]::IsNullOrWhiteSpace($label) -and [string]::IsNullOrWhiteSpace($value)) {
                continue
            }

            if ($row.full -eq $true) {
                Draw-LeftWrapped $label $fontLabel 0 ([ref]$y)
                Draw-LeftWrapped $value $fontValue 4 ([ref]$y)
            }
            else {
                Draw-LeftRight $label $value ([ref]$y)
            }
        }

        Draw-Rule 2 28 ([ref]$y)

        $lineWidth = [single]($contentWidth * 0.78)
        $lineX = [single]($x + (($contentWidth - $lineWidth) / 2.0))
        $g.DrawLine($pen, $lineX, $y, [single]($lineX + $lineWidth), $y)
        $y += 5
        Draw-CenterWrapped $signature $fontSignature 2 ([ref]$y)

        $e.HasMorePages = $false
    }

    $document.add_PrintPage($handler)

    try {
        $document.Print()
        Write-Output ("OK|CASH_RECEIPT|{0}|rows={1}" -f $TargetPrinter, $rows.Count)
    }
    finally {
        $document.remove_PrintPage($handler)
        $fontTitle.Dispose()
        $fontLabel.Dispose()
        $fontValue.Dispose()
        $fontValueBold.Dispose()
        $fontSignature.Dispose()
        $pen.Dispose()
        $center.Dispose()
        $left.Dispose()
        $right.Dispose()
        $document.Dispose()
    }
}

function Invoke-ScfNativeReceiptPrint {
    param(
        [string]$JsonPath,
        [string]$TargetPrinter
    )

    if (-not (Test-Path -LiteralPath $JsonPath)) {
        throw "Dados estruturados do cupom nao encontrados: $JsonPath"
    }

    $json = Get-Content -LiteralPath $JsonPath -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($json)) {
        throw "Arquivo JSON do cupom esta vazio."
    }

    $data = $json | ConvertFrom-Json
    if ($null -eq $data) {
        throw "JSON do cupom invalido."
    }

    $receiptKind = (Get-ScfText $data.receiptKind).ToUpperInvariant()
    if ($receiptKind -eq "CAIXA") {
        Invoke-ScfCashReceiptPrint -Data $data -TargetPrinter $TargetPrinter
        return
    }

    # F6 | VENDA INTERNA: usa o mesmo renderer térmico nativo do Electron,
    # porém com identidade de comprovante de pagamento e sem elementos fiscais.
    $isInternalSale = ($receiptKind -eq "VENDA_INTERNA")

    $items = @()
    if ($null -ne $data.items) {
        $items = @($data.items)
    }

    $payments = @()
    if ($null -ne $data.payments) {
        $payments = @($data.payments)
    }

    $additionalInfoLines = 0
    $additionalText = Get-ScfText $data.additionalInfo
    if ($additionalText) {
        $additionalInfoLines = [Math]::Max(1, [Math]::Ceiling($additionalText.Length / 48.0))
    }

    # NFC-e em contingencia: campos opcionais do recibo estruturado.
    # Permanecem vazios no fluxo normal/ONLINE e, portanto, nao alteram
    # a impressao atualmente aprovada.
    $copyLabel = Get-ScfText $data.copyLabel
    $contingencyMessage = Get-ScfText $data.contingencyMessage

    $contingencyLines = 0
    if ($copyLabel) {
        $contingencyLines += 1
    }
    if ($contingencyMessage) {
        $contingencyLines += [Math]::Max(
            1,
            [Math]::Ceiling($contingencyMessage.Length / 48.0)
        )
    }

    # Altura estimada da pagina em centesimos de polegada.
    # Bobina: calculamos so o necessario, com folga pequena no rodape.
    if ($isInternalSale) {
        # Sem bloco fiscal/QR: cupom interno pode ser sensivelmente menor.
        $estimatedHeight = 560 + ($items.Count * 45) + ($payments.Count * 22) + ($additionalInfoLines * 18)
        $paperHeightHundredths = [Math]::Max(500, [Math]::Min(1800, [int]$estimatedHeight))
    }
    else {
        $estimatedHeight = 850 + ($items.Count * 45) + ($payments.Count * 22) + ($additionalInfoLines * 18) + ($contingencyLines * 18)
        $paperHeightHundredths = [Math]::Max(650, [Math]::Min(2400, [int]$estimatedHeight))
    }

    $document = New-Object System.Drawing.Printing.PrintDocument
    $document.PrintController = New-Object System.Drawing.Printing.StandardPrintController
    $document.PrinterSettings.PrinterName = $TargetPrinter

    if (-not $document.PrinterSettings.IsValid) {
        throw "A fila '$TargetPrinter' existe, mas o driver nao foi considerado valido."
    }

    $document.DocumentName = if ($isInternalSale) {
        "e-fisco comprovante de pagamento - venda interna"
    }
    else {
        "e-fisco NFC-e texto nativo"
    }
    $document.OriginAtMargins = $false

    # 80 mm ~= 315 centesimos de polegada.
    $paper = [System.Drawing.Printing.PaperSize]::new(
        "Bobina 80mm e-fisco",
        315,
        $paperHeightHundredths
    )

    $document.DefaultPageSettings.PaperSize = $paper
    $document.DefaultPageSettings.Margins = [System.Drawing.Printing.Margins]::new(0, 0, 0, 0)

    $fontName = "Arial"
    $fontTitle = New-ScfFont $fontName 9.2 ([System.Drawing.FontStyle]::Bold)
    $fontSub = New-ScfFont $fontName 7.2 ([System.Drawing.FontStyle]::Bold)
    $fontBody = New-ScfFont $fontName 7.4 ([System.Drawing.FontStyle]::Regular)
    $fontBodyBold = New-ScfFont $fontName 7.4 ([System.Drawing.FontStyle]::Bold)
    $fontSmall = New-ScfFont $fontName 6.6 ([System.Drawing.FontStyle]::Regular)
    $fontSmallBold = New-ScfFont $fontName 6.6 ([System.Drawing.FontStyle]::Bold)
    $fontTotal = New-ScfFont $fontName 8.4 ([System.Drawing.FontStyle]::Bold)

    $qrBitmap = if ($isInternalSale) {
        $null
    }
    else {
        Convert-ScfDataImageToBitmap (Get-ScfText $data.qrImageBase64)
    }

    $center = [System.Drawing.StringFormat]::new()
    $center.Alignment = [System.Drawing.StringAlignment]::Center
    $center.LineAlignment = [System.Drawing.StringAlignment]::Near
    $center.Trimming = [System.Drawing.StringTrimming]::Word

    $centerNoWrap = [System.Drawing.StringFormat]::new()
    $centerNoWrap.Alignment = [System.Drawing.StringAlignment]::Center
    $centerNoWrap.LineAlignment = [System.Drawing.StringAlignment]::Near
    $centerNoWrap.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter
    $centerNoWrap.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap

    $left = [System.Drawing.StringFormat]::new()
    $left.Alignment = [System.Drawing.StringAlignment]::Near
    $left.LineAlignment = [System.Drawing.StringAlignment]::Near
    $left.Trimming = [System.Drawing.StringTrimming]::Word

    $right = [System.Drawing.StringFormat]::new()
    $right.Alignment = [System.Drawing.StringAlignment]::Far
    $right.LineAlignment = [System.Drawing.StringAlignment]::Near

    $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::Black, [single]0.7)
    $brush = [System.Drawing.Brushes]::Black

    $handler = [System.Drawing.Printing.PrintPageEventHandler]{
        param($sender, $e)

        $g = $e.Graphics
        # Preto/branco nativo: evita cinza fraco de antialias em impressora termica.
        $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

        # Mesma referencia que o teste aprovado: area real informada pelo driver.
        $bounds = $e.MarginBounds
        if ($bounds.Width -le 0) {
            $bounds = $e.PageBounds
        }

        # Area segura de ~68 mm, ancorada na esquerda imprimivel.
        # Evita repetir o corte na borda direita observado no helper de imagem.
        $contentWidth = [Math]::Min(268, [Math]::Max(1, $bounds.Width - 2))
        $x = [single]$bounds.Left
        $y = [single]($bounds.Top + 3)

        function Draw-CenterLine([string]$text, $font, [single]$extraAfter, [ref]$YRef) {
            if ([string]::IsNullOrWhiteSpace($text)) { return }
            $currentY = [single]$YRef.Value
            $size = $g.MeasureString($text, $font, [int]$contentWidth, $center)
            $h = [single][Math]::Ceiling($size.Height)
            $rect = [System.Drawing.RectangleF]::new($x, $currentY, [single]$contentWidth, [single]($h + 2))
            $g.DrawString($text, $font, $brush, $rect, $center)
            $YRef.Value = [single]($currentY + $h + 2 + $extraAfter)
        }

        function Draw-CenterSingleLine([string]$text, $font, [single]$extraAfter, [ref]$YRef) {
            if ([string]::IsNullOrWhiteSpace($text)) { return }
            $currentY = [single]$YRef.Value
            $size = $g.MeasureString($text, $font)
            $h = [single][Math]::Ceiling($size.Height)
            $rect = [System.Drawing.RectangleF]::new($x, $currentY, [single]$contentWidth, [single]($h + 1))
            $g.DrawString($text, $font, $brush, $rect, $centerNoWrap)
            $YRef.Value = [single]($currentY + $h + 1 + $extraAfter)
        }

        function Draw-LeftWrapped([string]$text, $font, [single]$extraAfter, [ref]$YRef) {
            if ([string]::IsNullOrWhiteSpace($text)) { return }
            $currentY = [single]$YRef.Value
            $size = $g.MeasureString($text, $font, [int]$contentWidth, $left)
            $h = [single][Math]::Ceiling($size.Height)
            $rect = [System.Drawing.RectangleF]::new($x, $currentY, [single]$contentWidth, [single]($h + 2))
            $g.DrawString($text, $font, $brush, $rect, $left)
            $YRef.Value = [single]($currentY + $h + 2 + $extraAfter)
        }

        function Draw-LeftRight([string]$leftText, [string]$rightText, $font, [single]$extraAfter, [ref]$YRef) {
            $currentY = [single]$YRef.Value
            $leftWidth = [single]($contentWidth * 0.67)
            $rightWidth = [single]($contentWidth - $leftWidth)
            $h = [single][Math]::Ceiling($g.MeasureString("Ag", $font).Height + 1)

            $rectL = [System.Drawing.RectangleF]::new($x, $currentY, $leftWidth, $h)
            $rectR = [System.Drawing.RectangleF]::new([single]($x + $leftWidth), $currentY, $rightWidth, $h)

            $g.DrawString($leftText, $font, $brush, $rectL, $left)
            $g.DrawString($rightText, $font, $brush, $rectR, $right)
            $YRef.Value = [single]($currentY + $h + $extraAfter)
        }

        function Draw-ItemColumns([string]$colItem, [string]$colCode, [string]$colUn, [string]$colVlUn, $font, [single]$extraAfter, [ref]$YRef) {
            $currentY = [single]$YRef.Value
            $wItem = [single]30
            $wCode = [single]116
            $wUn = [single]30
            $wVlUn = [single]($contentWidth - $wItem - $wCode - $wUn)
            if ($wVlUn -lt 44) { $wVlUn = 44 }
            $h = [single][Math]::Ceiling($g.MeasureString('Ag', $font).Height + 1)

            $rectItem = [System.Drawing.RectangleF]::new($x, $currentY, $wItem, $h)
            $rectCode = [System.Drawing.RectangleF]::new([single]($x + $wItem), $currentY, $wCode, $h)
            $rectUn = [System.Drawing.RectangleF]::new([single]($x + $wItem + $wCode), $currentY, $wUn, $h)
            $rectVlUn = [System.Drawing.RectangleF]::new([single]($x + $wItem + $wCode + $wUn), $currentY, $wVlUn, $h)

            $g.DrawString($colItem, $font, $brush, $rectItem, $left)
            $g.DrawString($colCode, $font, $brush, $rectCode, $left)
            $g.DrawString($colUn, $font, $brush, $rectUn, $centerNoWrap)
            $g.DrawString($colVlUn, $font, $brush, $rectVlUn, $right)
            $YRef.Value = [single]($currentY + $h + $extraAfter)
        }

        function Draw-Rule([single]$before, [single]$after, [ref]$YRef) {
            $currentY = [single]$YRef.Value + $before
            $g.DrawLine($pen, $x, $currentY, [single]($x + $contentWidth), $currentY)
            $YRef.Value = [single]($currentY + $after)
        }

        Draw-CenterLine (Get-ScfText $data.company) $fontTitle 0 ([ref]$y)

        $cnpjHeader = Get-ScfText $data.cnpj
        $ieHeader = Get-ScfText $data.ie
        $documentosHeader = @(
            $cnpjHeader
            $ieHeader
        ) | Where-Object {
            -not [string]::IsNullOrWhiteSpace($_)
        }

        if ($documentosHeader.Count -gt 0) {
            Draw-CenterLine ([string]::Join("   ", $documentosHeader)) $fontSmall 0 ([ref]$y)
        }

        Draw-CenterLine (Get-ScfText $data.address1) $fontSmall 0 ([ref]$y)
        Draw-CenterLine (Get-ScfText $data.address2) $fontSmall 1 ([ref]$y)

        Draw-Rule 2 5 ([ref]$y)
        if ($isInternalSale) {
            Draw-CenterLine "COMPROVANTE DE PAGAMENTO" $fontTitle 1 ([ref]$y)
        }
        else {
            Draw-CenterLine "DANFE NFC-e" $fontTitle 0 ([ref]$y)
            Draw-CenterLine "DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR ELETRONICA" $fontSmall 1 ([ref]$y)

            if ($copyLabel) {
                Draw-CenterLine $copyLabel $fontSub 1 ([ref]$y)
            }

            if ($contingencyMessage) {
                Draw-CenterLine $contingencyMessage $fontBodyBold 2 ([ref]$y)
            }
        }
        Draw-Rule 2 4 ([ref]$y)

        Draw-ItemColumns "ITEM" "CODIGO" "UN" "VL UN." $fontSmallBold 2 ([ref]$y)

        foreach ($item in $items) {
            $itemNo = Get-ScfText $item.item
            $code = Get-ScfText $item.code
            $description = (Get-ScfText $item.description).ToUpperInvariant()
            $qty = Get-ScfText $item.qty
            $unit = Get-ScfText $item.unit
            $unitValue = Get-ScfText $item.unitValue

            $qtyDisplay = $qty
            if ([string]::IsNullOrWhiteSpace($qtyDisplay)) {
                $qtyDisplay = $unit
            }

            Draw-ItemColumns $itemNo $code $qtyDisplay $unitValue $fontBody 0 ([ref]$y)
            Draw-LeftWrapped $description $fontBody 3 ([ref]$y)
        }

        Draw-Rule 1 4 ([ref]$y)
        Draw-LeftRight "TOTAL R$" (Get-ScfText $data.total) $fontTotal 3 ([ref]$y)

        foreach ($payment in $payments) {
            Draw-LeftRight ((Get-ScfText $payment.label).ToUpperInvariant()) (Get-ScfText $payment.value) $fontBody 1 ([ref]$y)
        }

        Draw-Rule 2 4 ([ref]$y)
        Draw-LeftWrapped "TRIBUTOS APROXIMADOS - LEI 12.741/2012" $fontSmallBold 1 ([ref]$y)
        Draw-LeftRight "PIS" (Get-ScfText $data.taxPis) $fontSmall 0 ([ref]$y)
        Draw-LeftRight "ICMS" (Get-ScfText $data.taxIcms) $fontSmall 0 ([ref]$y)
        Draw-LeftRight "COFINS" (Get-ScfText $data.taxCofins) $fontSmall 0 ([ref]$y)
        Draw-LeftRight "TOTAL APROX. IMPOSTOS" (Get-ScfText $data.taxTotal) $fontSmallBold 2 ([ref]$y)

        if ($additionalText) {
            Draw-LeftWrapped "INFORMACOES COMPLEMENTARES" $fontSmallBold 0 ([ref]$y)
            Draw-LeftWrapped $additionalText $fontSmall 2 ([ref]$y)
        }

        Draw-Rule 2 4 ([ref]$y)
        Draw-CenterLine (Get-ScfText $data.docLine) $fontSmallBold 1 ([ref]$y)

        if (-not $isInternalSale) {
            Draw-CenterLine (Get-ScfText $data.auth) $fontSmall 1 ([ref]$y)
        }

        $saleOperator = ((Get-ScfText $data.saleNumber) + "   " + (Get-ScfText $data.operator)).Trim()
        Draw-CenterLine $saleOperator $fontSmall 5 ([ref]$y)

        if (-not $isInternalSale) {
            Draw-CenterLine "Consulte pela Chave de Acesso em" $fontSmall 0 ([ref]$y)
            Draw-CenterLine (Get-ScfText $data.consultUrl) $fontSmall 3 ([ref]$y)
            Draw-CenterLine "CHAVE DE ACESSO" $fontSmallBold 0 ([ref]$y)
            Draw-CenterLine (Get-ScfText $data.accessKey) $fontSmall 5 ([ref]$y)

            if ($null -ne $qrBitmap) {
                # 32 mm ~= 126 centesimos de polegada. PNG 256x256: preserva os modulos.
                $qrSize = [single][Math]::Min(126, $contentWidth - 18)
                $qrX = [single]($x + (($contentWidth - $qrSize) / 2.0))
                $dest = [System.Drawing.RectangleF]::new($qrX, $y, $qrSize, $qrSize)
                $g.DrawImage($qrBitmap, $dest)
                $y += $qrSize + 7
            }
            else {
                Draw-CenterLine "QR CODE INDISPONIVEL" $fontBodyBold 5 ([ref]$y)
            }
        }

        Draw-CenterLine (Get-ScfText $data.consumer) $fontBodyBold 1 ([ref]$y)

        if ($isInternalSale) {
            Draw-CenterLine "VENDA INTERNA" $fontSmallBold 4 ([ref]$y)
        }
        else {
            Draw-CenterLine (Get-ScfText $data.nfce) $fontSmallBold 4 ([ref]$y)
        }

        Draw-CenterLine "Obrigado! Volte Sempre!" $fontBodyBold 2 ([ref]$y)

        if (-not $isInternalSale) {
            # Aviso ICMS: 6,6 pt Regular, quebra natural e alinhamento central.
            Draw-CenterLine (Get-ScfText $data.warning) $fontSmall 4 ([ref]$y)
        }

        $e.HasMorePages = $false
    }

    $document.add_PrintPage($handler)

    try {
        $document.Print()
        if ($isInternalSale) {
            Write-Output ("OK|NATIVE_TEXT_INTERNAL|{0}|items={1}|width68mm" -f $TargetPrinter, $items.Count)
        }
        else {
            Write-Output ("OK|NATIVE_TEXT_QR|{0}|items={1}|width68mm" -f $TargetPrinter, $items.Count)
        }
    }
    finally {
        $document.remove_PrintPage($handler)
        if ($null -ne $qrBitmap) { $qrBitmap.Dispose() }
        $fontTitle.Dispose()
        $fontSub.Dispose()
        $fontBody.Dispose()
        $fontBodyBold.Dispose()
        $fontSmall.Dispose()
        $fontSmallBold.Dispose()
        $fontTotal.Dispose()
        $pen.Dispose()
        $center.Dispose()
        $centerNoWrap.Dispose()
        $left.Dispose()
        $right.Dispose()
        $document.Dispose()
    }
}

function Invoke-ScfImageFallbackPrint {
    param(
        [string]$Path,
        [string]$TargetPrinter
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Imagem do cupom nao encontrada: $Path"
    }

    $source = $null
    $document = $null

    try {
        $source = [System.Drawing.Bitmap]::FromFile($Path)
        if ($source.Width -le 0 -or $source.Height -le 0) {
            throw "Imagem do cupom invalida."
        }

        $document = New-Object System.Drawing.Printing.PrintDocument
        $document.PrintController = New-Object System.Drawing.Printing.StandardPrintController
        $document.PrinterSettings.PrinterName = $TargetPrinter

        if (-not $document.PrinterSettings.IsValid) {
            throw "A fila '$TargetPrinter' existe, mas o driver nao foi considerado valido."
        }

        $document.DocumentName = "e-fisco NFC-e fallback imagem"
        $document.OriginAtMargins = $false

        $paperWidthHundredths = 315
        $estimatedHeight = [int][Math]::Ceiling(
            $paperWidthHundredths * ([double]$source.Height / [double]$source.Width)
        )
        $paperHeightHundredths = [Math]::Max(250, [Math]::Min(3000, $estimatedHeight + 35))

        $paper = [System.Drawing.Printing.PaperSize]::new(
            "Bobina 80mm e-fisco",
            $paperWidthHundredths,
            $paperHeightHundredths
        )

        $document.DefaultPageSettings.PaperSize = $paper
        $document.DefaultPageSettings.Margins = [System.Drawing.Printing.Margins]::new(0, 0, 0, 0)

        $handler = [System.Drawing.Printing.PrintPageEventHandler]{
            param($sender, $e)

            $bounds = $e.MarginBounds
            if ($bounds.Width -le 0) {
                $bounds = $e.PageBounds
            }

            $targetWidth = [Math]::Min(268, [Math]::Max(1, $bounds.Width - 2))
            $scale = [double]$targetWidth / [double]$source.Width
            $targetHeight = [int][Math]::Round($source.Height * $scale)

            $target = [System.Drawing.Rectangle]::new(
                $bounds.Left,
                $bounds.Top,
                $targetWidth,
                $targetHeight
            )

            $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
            $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $e.Graphics.DrawImage($source, $target)
            $e.HasMorePages = $false
        }

        $document.add_PrintPage($handler)
        try {
            $document.Print()
            Write-Output ("OK|IMAGE_FALLBACK|{0}" -f $TargetPrinter)
        }
        finally {
            $document.remove_PrintPage($handler)
        }
    }
    finally {
        if ($null -ne $source) { $source.Dispose() }
        if ($null -ne $document) { $document.Dispose() }
    }
}

if (-not [string]::IsNullOrWhiteSpace($DataPath)) {
    Invoke-ScfNativeReceiptPrint -JsonPath $DataPath -TargetPrinter $PrinterName
    exit 0
}

if (-not [string]::IsNullOrWhiteSpace($ImagePath)) {
    Invoke-ScfImageFallbackPrint -Path $ImagePath -TargetPrinter $PrinterName
    exit 0
}

throw "Informe -DataPath (texto nativo) ou -ImagePath (fallback)."
