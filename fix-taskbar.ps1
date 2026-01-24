$path = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StuckRects3'
$settings = (Get-ItemProperty -Path $path).Settings
$settings[8] = 2
Set-ItemProperty -Path $path -Name Settings -Value $settings
Stop-Process -Name explorer -Force
Write-Host "Taskbar auto-hide disabled successfully!"
