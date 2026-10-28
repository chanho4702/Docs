# BE(:3000, dev 프로필=5433 도커 DB)를 gradlew bootRun으로 띄운다.
# - .env 정본은 moveseye-be-spring/.env (구 Nest .env와 CREDENTIAL_ENCRYPTION_KEY·JWT_SECRET이 다르다 — 섞으면 AEADBadTagException)
# - JAVA_HOME은 매번 지정(전역은 corretto 1.8)
# - 🔴 bootRun 중에는 같은 레포에서 gradlew test 금지(build/classes 재컴파일로 실행 중 JVM이 깨진다) — 테스트는 격리 워크트리에서
# usage: powershell -File C:\solutions\_tools\run_be_3000_dev.ps1   (또는 Start-Process로 백그라운드)
# 🔴 -Encoding UTF8 필수 — 5.1 기본(ANSI/cp949)으로 읽으면 한글로 끝나는 주석의 마지막 바이트가 뒤따르는
#    LF를 삼켜 다음 줄(예: JWT_SECRET=…)이 주석에 합쳐진다 → "JWT_SECRET must be at least 32 bytes"(2026-09-15 실측).
param([string]$Profile)
Get-Content "C:\solutions\moveseye-be-spring\.env" -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq '' -or $line.StartsWith('#')) { return }
  $idx = $line.IndexOf('=')
  if ($idx -lt 1) { return }
  $k = $line.Substring(0, $idx).Trim()
  $v = $line.Substring($idx + 1).Trim()
  if ($v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
  if ($v.StartsWith("'") -and $v.EndsWith("'")) { $v = $v.Substring(1, $v.Length - 2) }
  [Environment]::SetEnvironmentVariable($k, $v, 'Process')
}
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
# 프로필 선택(ZM-78): dev70(기본, =dev, 5433·Zabbix 7.0.6) / dev74(5434·Zabbix 7.4.15). usage: -Profile dev74
if (-not $Profile) { $Profile = "dev70" }
$env:SPRING_PROFILES_ACTIVE = $Profile
$env:PORT = "3000"
$env:SERVER_PORT = "3000"
Set-Location "C:\solutions\moveseye-be-spring"
# 🔴 --no-daemon: 이미 떠 있는 Gradle 데몬(다른 세션 빌드가 띄운 것)을 재사용하면 이 셸의 .env 환경변수가
#    데몬으로 넘어가지 않아 JWT_SECRET 등이 비어 "JWT_SECRET must be at least 32 bytes"로 기동이 죽는다(2026-09-15 실측).
& .\gradlew.bat bootRun -x test --console=plain --no-daemon
