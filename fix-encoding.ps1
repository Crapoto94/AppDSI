# Fix UTF-8 encoding issues in all TypeScript/JavaScript files

function Fix-FileEncoding {
  param([string]$filePath)

  try {
    $content = Get-Content $filePath -Raw -Encoding UTF8 -ErrorAction Stop
    $original = $content

    # Fix common UTF-8 encoding issues
    $content = $content -replace 'Ã©', 'é'
    $content = $content -replace 'Ã¨', 'è'
    $content = $content -replace 'ê', 'ê'
    $content = $content -replace 'Ã§', 'ç'
    $content = $content -replace 'Ã¹', 'ù'
    $content = $content -replace 'Ã¤', 'ä'
    $content = $content -replace 'Ã ', 'à'
    $content = $content -replace 'Ã´', 'ô'
    $content = $content -replace 'Ã®', 'î'
    $content = $content -replace 'Ã¢', 'â'
    $content = $content -replace 'ÃŠ', 'È'
    $content = $content -replace 'Ã‰', 'É'
    $content = $content -replace 'Å"', 'Œ'
    $content = $content -replace 'Æ'', 'œ'

    if ($content -ne $original) {
      $content | Set-Content $filePath -Encoding UTF8 -NoNewline
      return $true
    }
    return $false
  } catch {
    return $false
  }
}

# Fix all TypeScript/JavaScript files
$files = Get-ChildItem -Path 'C:\dev\AppDSI\frontend\src' -Recurse -Include '*.tsx', '*.ts', '*.jsx', '*.js'
$fixed = 0

foreach ($file in $files) {
  if (Fix-FileEncoding $file.FullName) {
    Write-Host "Fixed: $($file.Name)"
    $fixed++
  }
}

Write-Host "Total files fixed: $fixed"
