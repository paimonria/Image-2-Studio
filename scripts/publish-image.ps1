param(
  [string]$ImageName = "ghcr.io/pairmeng/image-2-studio",
  [string]$Tag = "",
  [string]$Platform = "linux/amd64",
  [string]$NpmRegistry = "https://mirrors.cloud.tencent.com/npm/",
  [string]$PnpmVersion = "11.1.2",
  [switch]$NoLatest
)

$ErrorActionPreference = "Stop"

function Get-DefaultTag {
  try {
    $shortSha = (git rev-parse --short HEAD 2>$null).Trim()
    if ($shortSha) {
      return $shortSha
    }
  } catch {
    # Fall through to a timestamp tag when git is unavailable.
  }

  return "local-" + (Get-Date -Format "yyyyMMddHHmmss")
}

if (-not $Tag) {
  $Tag = Get-DefaultTag
}

$tags = @("-t", "${ImageName}:${Tag}")
if (-not $NoLatest) {
  $tags += @("-t", "${ImageName}:latest")
}

Write-Host "Publishing Docker image:" -ForegroundColor Cyan
Write-Host "  image:    $ImageName"
Write-Host "  tag:      $Tag"
Write-Host "  platform: $Platform"
Write-Host "  registry: $NpmRegistry"
if (-not $NoLatest) {
  Write-Host "  latest:   ${ImageName}:latest"
}

docker buildx version | Out-Null

docker buildx build `
  --platform $Platform `
  --build-arg "NPM_REGISTRY=$NpmRegistry" `
  --build-arg "PNPM_VERSION=$PnpmVersion" `
  @tags `
  --push `
  .

Write-Host "Published ${ImageName}:${Tag}" -ForegroundColor Green
if (-not $NoLatest) {
  Write-Host "Published ${ImageName}:latest" -ForegroundColor Green
}
