param(
  [string]$ProxyServer = "http://172.17.45.120:7890",
  [string]$Url = "https://www.perplexity.ai/",
  [string]$ProfileDir = "$env:TEMP\edge-perplexity-profile"
)

$arguments = @(
  "--user-data-dir=$ProfileDir",
  "--proxy-server=$ProxyServer",
  $Url
)

Start-Process msedge.exe -ArgumentList $arguments
