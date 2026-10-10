$ErrorActionPreference = 'Stop'
$log = Join-Path $PWD 'windows-package-smoke.log'
$installDir = Join-Path $env:RUNNER_TEMP 'GameBuddy-install-check'
$installer = @(Get-ChildItem dist/GameBuddy-Setup-*.exe)
if ($installer.Count -ne 1) { throw 'Expected exactly one Windows installer' }
$installedApp = Join-Path $installDir 'GameBuddy.exe'
$appProcess = $null
try {
  $setup = Start-Process -FilePath $installer[0].FullName -ArgumentList @('/S', "/D=$installDir") -Wait -PassThru
  if ($setup.ExitCode -ne 0) { throw "Installer exit code: $($setup.ExitCode)" }
  if (!(Test-Path $installedApp)) { throw 'Installed GameBuddy.exe missing' }
  'PASS: Windows silent install produced GameBuddy.exe' | Tee-Object -FilePath $log

  # Check installed ASAR dependencies using the installed Electron runtime.
  $probe = Join-Path $env:RUNNER_TEMP 'gamebuddy-installed-probe.cjs'
  @'
const path = require('node:path');
const root = process.argv[2];
require(path.join(root, 'harness/observation-store.js'));
const { readLlmConfig } = require(path.join(root, 'agent/llm/openai.js'));
const cfg = readLlmConfig({GAMEBUDDY_LLM_API_KEY:'ci-placeholder-not-a-key',GAMEBUDDY_LLM_BASE_URL:'https://example.invalid/v1',GAMEBUDDY_LLM_MODEL:'ci-probe',GAMEBUDDY_LLM_WIRE_API:'chat'});
if (!cfg.enabled || cfg.model !== 'ci-probe' || cfg.wireApi !== 'chat') throw new Error('LLM config parsing failed');
console.log('PASS: Installed dependencies and LLM configuration parsing (no network request)');
'@ | Set-Content -Path $probe -Encoding utf8
  $env:ELECTRON_RUN_AS_NODE = '1'
  & $installedApp $probe (Join-Path $installDir 'resources/app.asar') 2>&1 | Tee-Object -FilePath $log -Append
  if ($LASTEXITCODE -ne 0) { throw 'Installed runtime dependency probe failed' }
  Remove-Item Env:ELECTRON_RUN_AS_NODE

  $stdout = Join-Path $env:RUNNER_TEMP 'gamebuddy-startup.stdout.log'
  $stderr = Join-Path $env:RUNNER_TEMP 'gamebuddy-startup.stderr.log'
  $appProcess = Start-Process -FilePath $installedApp -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  Start-Sleep -Seconds 12
  $appProcess.Refresh()
  if ($appProcess.HasExited) { throw "Application exited early: $($appProcess.ExitCode)" }
  $errors = Get-Content $stderr -Raw -ErrorAction SilentlyContinue
  if ($errors -match 'Cannot find module|Error launching app|A JavaScript error occurred|Uncaught Exception') {
    throw "Application startup error: $errors"
  }
  'PASS: Installed application process remained running for 12 seconds' | Tee-Object -FilePath $log -Append
  'NOT TESTED: Game connection, real API calls, interactive UI and SmartScreen' | Tee-Object -FilePath $log -Append
} catch {
  "FAIL: $($_.Exception.Message)" | Tee-Object -FilePath $log -Append
  throw
} finally {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  if ($null -ne $appProcess -and !$appProcess.HasExited) {
    & taskkill /PID $appProcess.Id /T /F | Out-Null
  }
}
