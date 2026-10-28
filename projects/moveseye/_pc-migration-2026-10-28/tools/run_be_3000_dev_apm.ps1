# BE(:3000, dev 프로필)를 **OTel javaagent를 붙여** 띄운다 — 로컬 APM 셀프 계측용.
# run_be_3000_dev.ps1과 동일하되 OTEL_* 환경변수 + OTEL_JAVAAGENT_JAR(build.gradle.kts의 bootRun 옵트인 훅)만 추가.
#
# 전제: Collector(otelcol 서비스)가 4317에서 듣고 있고, 그 config.yaml의 endpoint가 이 BE(:3000)를 가리킨다.
# 확인: 화면 애플리케이션 모니터링 › 서비스 목록에 `moveseye-be`(env local)가 1~2분 안에 나타난다.
# usage: powershell -File C:\solutions\_tools\run_be_3000_dev_apm.ps1
# 🔴 -Encoding UTF8 필수 — 5.1 기본(ANSI/cp949)으로 읽으면 한글로 끝나는 주석의 마지막 바이트가
#    뒤따르는 LF를 삼켜 다음 줄이 주석에 합쳐진다("JWT_SECRET must be at least 32 bytes").
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
$env:SPRING_PROFILES_ACTIVE = "dev"
$env:PORT = "3000"
$env:SERVER_PORT = "3000"

# ── OTel 자동계측 (설치 가이드 7.3절 Java 행과 같은 값) ──
$env:OTEL_JAVAAGENT_JAR = "C:\ProgramData\moveseye\otel\opentelemetry-javaagent.jar"   # 2.31.1
$env:OTEL_SERVICE_NAME = "moveseye-be"
$env:OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4317"                # Collector gRPC 수신
$env:OTEL_EXPORTER_OTLP_PROTOCOL = "grpc"
$env:OTEL_RESOURCE_ATTRIBUTES = "deployment.environment.name=local,service.version=0.0.1"
$env:OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE = "delta"          # 권장(극값·exemplar 정확도)
$env:OTEL_SEMCONV_STABILITY_OPT_IN = "database"                           # HikariCP 풀·db.client.* 지표
$env:OTEL_METRIC_EXPORT_INTERVAL = "10000"                                # 10초(기본 60초) — 로컬 확인 빠르게
# 🔴 자기 수신부로 보내는 OTLP 호출(otlphttp exporter → /apm/otlp)은 앱이 아니라 Collector가 하므로
#    자기 호출 루프는 생기지 않는다. 다만 BE→Zabbix HTTP 호출은 http.client 스팬으로 잡힌다(의도).

Set-Location "C:\solutions\moveseye-be-spring"
& .\gradlew.bat bootRun -x test --console=plain
