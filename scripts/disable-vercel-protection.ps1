# Disable Vercel Deployment Protection for namezivobackend
# Get token: https://vercel.com/account/tokens

param(
    [string]$Project = "namezivobackend",
    [string]$Token = $env:VERCEL_TOKEN
)

if (-not $Token) {
    Write-Host "ERROR: Set VERCEL_TOKEN first" -ForegroundColor Red
    Write-Host '  $env:VERCEL_TOKEN = "your_token"'
    Write-Host "  .\scripts\disable-vercel-protection.ps1"
    exit 1
}

$uri = "https://api.vercel.com/v9/projects/$Project"
if ($env:VERCEL_TEAM_ID) {
    $uri += "?teamId=$($env:VERCEL_TEAM_ID)"
}

$body = '{"ssoProtection":null}'
$response = Invoke-RestMethod -Uri $uri -Method PATCH -Headers @{
    Authorization = "Bearer $Token"
    "Content-Type" = "application/json"
} -Body $body

Write-Host "Vercel Authentication disabled for: $Project" -ForegroundColor Green
Write-Host "Test: curl https://namezivobackend-pg3tgoh1b-vishalkashavs-projects.vercel.app/health"
