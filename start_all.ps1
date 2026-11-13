# Start all three services in separate PowerShell windows
Write-Host "Starting Tectonic Services..." -ForegroundColor Cyan

# 1. Backend Server on Port 8000
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Starting Tectonic Shared Backend (:8000)...' -ForegroundColor Green; python server.py"

# 2. Existing Frontend on Port 5173
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Starting Tectonic Agent Studio (:5173)...' -ForegroundColor Cyan; cd frontend; npm run dev"

# 3. New Frontend on Port 5174
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Starting Tectonic Agent Portal (:5174)...' -ForegroundColor Magenta; cd frontend_portal; npm run dev"

Write-Host "All 3 services launched:" -ForegroundColor Green
Write-Host "  * Shared Backend:          http://127.0.0.1:8000" -ForegroundColor White
Write-Host "  * Tectonic Agent Studio:   http://localhost:5173" -ForegroundColor White
Write-Host "  * Tectonic Agent Portal:   http://localhost:5174" -ForegroundColor White

