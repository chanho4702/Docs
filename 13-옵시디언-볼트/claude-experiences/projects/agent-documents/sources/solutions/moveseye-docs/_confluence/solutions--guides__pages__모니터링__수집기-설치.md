# 수집기 설치 (APM 온보딩)

| 항목 | 내용 |
|---|---|
| 대상 독자 | 관리자, 설치 담당자, 앱 운영자, 지원 담당자 |
| 문서 상태 | review |
| 관리 주체 | MovesEye 팀 |
| 기준일 | 2026-09-01 |
| 최종 검토 | 2026-09-01 |
| 정본 위치 | moveseye-be-spring premium/apm/collector/install/ApmInstallGuideService.java, ApmInstallVersions.java, ApmCollectorProperties.java, src/main/resources/apm/collector-template.yaml, _workspace/features/apm/core/r1_apm-collector-roundtrip.md |

# 수집기 설치 (APM 온보딩)

> **화면** 모니터링 > 어플리케이션 모니터링 > 수집기 (관리자 전용)
> **이 문서와 화면의 관계** 화면의 '설치 가이드' 탭은 서버(`GET /apm/install-guide`)가 만든 문구를 그대로 그린다. 이 문서는 그 문구의 문서판이다. 둘이 다르면 **화면이 정본**이다 — 화면은 설치본 설정(사내 미러 주소·큐 디렉터리)을 반영하지만 이 문서는 기본값만 적는다.
> **검증 조합** otelcol-contrib **0.159.0** · opentelemetry-javaagent **2.31.1** (2026-08-31 round-trip 실측). 다른 버전은 검증되지 않았다.

## 시작 전에

### 준비물

| 항목 | 내용 |
|---|---|
| MovesEye 권한 | 관리자 계정. 라이선스에 `APM` 기능(PREMIUM) 포함 |
| Collector를 둘 서버 1대 | Windows 10 1803 이상 / Windows Server, 또는 Linux amd64. 도커 불필요(단일 바이너리) |
| 네트워크 | 앱 서버 → Collector **4317**(gRPC) · **4318**(HTTP) 내부 통신. Collector → MovesEye 서버 주소로 **아웃바운드 HTTPS**. Collector 서버에서 내려받기 위한 GitHub 접근(폐쇄망은 사내 미러) |
| 앱 | 계측을 붙이고 **재기동**할 수 있어야 한다. Java는 코드 수정 없이 JVM 옵션 한 줄 |

### 두 가지 원칙

- 🔴 **게이트웨이 Collector는 사이트당 1대만 둔다.** 두 대 이상이면 한 트레이스의 스팬이 갈라져, trace_id 일관 해싱(loadbalancing exporter 2계층) 없이는 tail 샘플링이 무의미해진다. 이중화가 필요하면 active-standby로 두고 전환 중 유실을 허용한다 — active-active는 지원 범위 밖이다. 여러 대가 같은 토큰으로 보내면 수집기별 지표가 서로 덮어쓴다.
- ℹ️ **앱은 MovesEye가 아니라 Collector로 보낸다**(LAN 내 4317/4318). MovesEye로 직접 보내는 구성은 지원하지 않는다 — 마스킹·샘플링·재시도 큐가 전부 Collector에 있다.

### 데이터가 오는 길

```text
 [앱 서버들]                     [Collector 서버 1대]                     [MovesEye 서버]
 Java -javaagent ──gRPC 4317──▶ otelcol-contrib 0.159.0 ──HTTPS/json──▶ <MovesEye 주소>/apm/otlp/v1/metrics
 .NET/Node/Python  (또는 4318)    · 마스킹·허용목록·배치                    · Bearer 수신 토큰 검사
                                  · 디스크 큐(못 보낸 것 보관)             · 라이선스(APM) 검사
                                  · 자기 상태 지표도 함께 보냄             · 1분 표에 적재
```

## 1단계 — 토큰 발급과 설정 파일 받기 (MovesEye 화면)

수집기 > **토큰·설정** 탭.

1. **토큰 발급**을 누르고 라벨(어느 수집기인지 구분할 이름, 예: 본사 수집기)을 적는다.
2. **'설정 파일(yaml)도 함께 받기'를 켠 채** 발급한다. 켜 두면 토큰이 이미 채워진 완성본 yaml을 같은 응답으로 받는다.
3. 발급 결과 창에서 **토큰 원문을 복사하고 yaml을 내려받는다.** 🔴 이 창을 닫으면 토큰 원문을 다시 볼 수 없다 — 서버는 해시만 저장하므로 복구 경로가 없다. 잃어버리면 새로 발급하고 옛 토큰을 회수하는 수밖에 없다.
4. 창에 보이는 **수신 주소(endpoint)** 는 `<MovesEye 주소>/apm/otlp` 꼴이다. 뒤에 `/v1/metrics`를 붙이지 않는다 — exporter가 스스로 붙인다.

### 설정 파일 옵션 ('설정 파일 다시 만들기')

토큰을 발급한 뒤에도 설정 파일만 다시 만들 수 있다. 이때는 토큰 자리가 `${RECEIVE_TOKEN}` **자리표시로 남으므로** 발급 때 복사한 값을 손으로 넣어야 한다.

| 항목 | 뜻 | 기본 |
|---|---|---|
| MovesEye 주소 | 스킴 포함(예: `https://moveseye.example.com`). `/apm/otlp`는 서버가 붙이고, `/v1/metrics`를 붙여 오면 거절한다 | 설치본 힌트 |
| 수집기 OS | 큐 디렉터리 기본값과 설치 명령이 갈린다 | Linux |
| 느린 요청 임계(ms) | 이 시간을 넘는 트레이스는 샘플링에서 항상 남긴다(2단계) | 서버 기본값 |
| 정상 트레이스 표본(%) | 느리지도 실패하지도 않은 요청 중 남길 비율(2단계) | 서버 기본값 |
| 메모리 상한(MiB) | Collector 프로세스가 쓸 최대 메모리 | 서버 기본값 |
| 디스크 큐 경로 | 아직 보내지 못한 데이터가 쌓이는 곳. 비우면 OS별 기본값 — Linux `/var/lib/moveseye/otelcol-queue`, Windows `C:\ProgramData\moveseye\otelcol-queue` | 설치본 설정 |
| 원문 SQL 보존 | 🔴 켜면 리터럴 마스킹 프로세서가 빠져 **쿼리 원문이 그대로 저장된다.** 쿼리 값에 이름·연락처 같은 개인정보가 실려 올 수 있고, **누가 켰는지 감사 로그에 남는다.** 문제를 재현하는 동안에만 켜고 끝나면 되돌린다 | 마스킹(전역 기본값 따름) |

설정 파일에는 토큰이 들어 있다. **파일 권한을 제한하고 형상관리(git)에 올리지 않는다.**

## 2단계 — Collector 설치

아래는 화면 설치 가이드 탭의 Windows·Linux 6단계와 같은 명령이다. 다운로드 주소의 베이스(`https://github.com/open-telemetry`)는 설치본 설정으로 사내 미러로 바꿀 수 있으며, 그때는 **화면에 보이는 주소**를 쓴다. 미러는 베이스 뒤에 `/<저장소>/releases/download/v<버전>/<파일>` 경로 모양을 그대로 흉내 내면 된다.

### Windows (관리자 권한 명령 프롬프트)

Windows 10 1803 이상이면 `curl.exe`·`tar`가 기본 포함되어 있다.

| # | 단계 | 명령 |
|---|---|---|
| 1 | Collector 내려받기 | `curl.exe -L -o %TEMP%\otelcol-contrib.tar.gz https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.159.0/otelcol-contrib_0.159.0_windows_amd64.tar.gz` |
| 2 | 압축 해제 | `mkdir "C:\Program Files\moveseye-collector" & tar -xzf %TEMP%\otelcol-contrib.tar.gz -C "C:\Program Files\moveseye-collector"` |
| 3 | 설정 파일 배치 | `mkdir "C:\ProgramData\moveseye" & copy config.yaml "C:\ProgramData\moveseye\config.yaml"` |
| 4 | 큐 디렉터리 권한 제한 | `mkdir "C:\ProgramData\moveseye\otelcol-queue" & icacls "C:\ProgramData\moveseye\otelcol-queue" /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F"` |
| 5 | Windows 서비스 등록 | `sc.exe create otelcol binPath= "\"C:\Program Files\moveseye-collector\otelcol-contrib.exe\" --config \"C:\ProgramData\moveseye\config.yaml\"" start= auto DisplayName= "MovesEye OTel Collector"` |
| 6 | 서비스 시작 | `sc.exe start otelcol` |

- 3단계: 🔴 설정 화면에서 내려받은 config.yaml을 두고, 안의 `${RECEIVE_TOKEN}` 자리에 발급 시 1회 표시된 토큰 원문을 넣는다(발급과 함께 받은 완성본이면 이미 채워져 있다).
- 4단계: 디스크 큐에는 마스킹 후 텔레메트리가 남는다. 상속을 끊고 SYSTEM·관리자만 접근하게 둔다. **설정 파일(config.yaml)에도 같은 제한을 건다.**
- 5단계: 🔴 `sc.exe`는 `binPath=` 와 `start=` 의 **등호 뒤에 공백**이 있어야 한다(등호 앞에는 없다). 경로에 공백이 있어 안쪽 큰따옴표를 이스케이프한다. nssm 같은 별도 도구는 필요하지 않다.
- 6단계: 실패하면 이벤트 뷰어 > Windows 로그 > 애플리케이션에서 `otelcol` 항목을 확인한다.

### Linux (systemd)

| # | 단계 | 명령 |
|---|---|---|
| 1 | Collector 내려받기 | `curl -L -o /tmp/otelcol-contrib.tar.gz https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.159.0/otelcol-contrib_0.159.0_linux_amd64.tar.gz` |
| 2 | 압축 해제 | `sudo tar -xzf /tmp/otelcol-contrib.tar.gz -C /usr/local/bin otelcol-contrib && sudo chmod 755 /usr/local/bin/otelcol-contrib` |
| 3 | 설정 파일 배치 | `sudo useradd --system --no-create-home --shell /usr/sbin/nologin otelcol 2>/dev/null; sudo install -d -m 750 -o root -g otelcol /etc/moveseye && sudo install -m 640 -o root -g otelcol config.yaml /etc/moveseye/collector.yaml` |
| 4 | 큐 디렉터리 권한 제한 | `sudo install -d -m 700 -o otelcol -g otelcol /var/lib/moveseye/otelcol-queue` |
| 5 | systemd 서비스 등록 | 아래 유닛 파일 |
| 6 | 서비스 시작 | `sudo systemctl daemon-reload && sudo systemctl enable --now otelcol && systemctl status otelcol --no-pager` |

```bash
sudo tee /etc/systemd/system/otelcol.service > /dev/null <<'UNIT'
[Unit]
Description=MovesEye OTel Collector
After=network-online.target

[Service]
ExecStart=/usr/local/bin/otelcol-contrib --config /etc/moveseye/collector.yaml
Restart=always
RestartSec=5
User=otelcol
Group=otelcol
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
UNIT
```

- 3단계: 🔴 설정 화면에서 내려받은 config.yaml을 두고, 안의 `${RECEIVE_TOKEN}` 자리에 발급 시 1회 표시된 토큰 원문을 넣는다. 토큰이 들어 있으므로 다른 사용자에게 읽기를 주지 않는다(640, root:otelcol).
- 4단계: 디스크 큐에는 마스킹 후 텔레메트리가 남는다 — 700으로 둔다.
- 5단계: Collector를 root로 돌리지 않기 위해 전용 계정 `otelcol`로 실행한다.

### 방화벽

| 방향 | 포트 | 용도 |
|---|---|---|
| 앱 서버 → Collector | 4317/TCP | OTLP gRPC (기본) |
| 앱 서버 → Collector | 4318/TCP | OTLP HTTP (`http/protobuf`를 쓸 때) |
| Collector → MovesEye | MovesEye 주소(HTTPS) | 수신 엔드포인트 `/apm/otlp/v1/*` |
| Collector 로컬 | 13133/TCP (127.0.0.1) | health check — 외부 개방 불필요 |
| Collector 로컬 | 8888/TCP (127.0.0.1) | 자기 지표 — 외부 개방 불필요 |

Collector에서 MovesEye로는 **아웃바운드만** 필요하다. MovesEye에서 Collector로 들어오는 연결은 없다.

## 3단계 — 앱 계측

스택이 달라도 **앞의 세 환경변수는 같다**(서비스 식별의 정본). 앱 프로세스에 넣고, 꺾쇠 자리표시(`<...>`)는 실제 값으로 바꾼다 — 그럴듯한 예시값을 그대로 붙이면 아무 데이터도 안 온다.

### 공통 환경변수 3개

| 이름 | 값 | 왜 필요한가 |
|---|---|---|
| `OTEL_SERVICE_NAME` | `<서비스명>` | 🔴 이 값이 MovesEye의 서비스 이름이 된다. 인스턴스마다 같아야 하고, 환경이 다르면 이름이 아니라 아래 환경 속성으로 가른다 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://<collector-host>:4317` | 🔴 앱은 MovesEye가 아니라 **Collector**로 보낸다(gRPC 4317). MovesEye 주소를 여기 넣으면 인증이 없어 전부 버려진다 |
| `OTEL_RESOURCE_ATTRIBUTES` | `deployment.environment.name=<prod\|stage\|dev>,service.version=<버전>` | 환경과 버전. 버전이 있어야 배포 직후 수신 끊김 유예(10분)와 배포 전후 비교가 된다. 🔴 `deployment.environment.name`으로 적는다 — 구 이름 `deployment.environment`만 보내면 환경을 못 갈라 prod와 stage가 한 서비스로 합쳐진다 |

### Java (Spring · Tomcat · WAS · Jira 등) — ✅ 실측

앱을 고칠 필요는 없다.

| # | 단계 | 명령·설명 |
|---|---|---|
| 1 | 자동계측 에이전트 내려받기 | `curl -L -o opentelemetry-javaagent.jar https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.31.1/opentelemetry-javaagent.jar` (Windows는 `curl.exe`). 검증 버전은 **2.31.1** |
| 2 | JVM 옵션에 에이전트 추가 | `java -javaagent:/opt/otel/opentelemetry-javaagent.jar -jar your-app.jar` — jar를 둔 실제 경로로 바꾼다. Tomcat·WAS는 `JAVA_OPTS`(또는 `setenv.sh`/`CATALINA_OPTS`)에 같은 `-javaagent` 옵션을 추가하고 재기동한다 |
| 3 | 앱 재기동 | 재기동 후 1~2분이면 MovesEye 서비스 목록에 나타난다. JVM 메모리·GC·스레드·커넥션 풀은 별도 설정 없이 함께 온다 |

Java 추가 환경변수:

| 이름 | 값 | 왜 필요한가 |
|---|---|---|
| `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE` | `delta` | 🔴 권장. 히스토그램·카운터가 증분으로 와서 1분 적재가 차분 없이 끝나고 앱 재기동 리셋 문제가 사라진다. 빠뜨려도 데이터는 받는다(CUMULATIVE도 처리) |
| `OTEL_SEMCONV_STABILITY_OPT_IN` | `database` | DB 지표를 표준 이름(`db.client.operation.duration`)으로 보낸다. 없으면 구 이름으로 와서 DB 화면이 빈다 |
| `OTEL_METRIC_EXPORT_INTERVAL` | `15000` | 선택. 기본 60초보다 촘촘하게 보고 싶을 때만 |

### .NET — ⚠️ 실측 전

`OTEL_DOTNET_AUTO_*` 환경변수로 동작하는 자동계측이다.

| # | 단계 | Windows (PowerShell) | Linux |
|---|---|---|---|
| 1 | 자동계측 설치 | `$module = (New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/open-telemetry/opentelemetry-dotnet-instrumentation/main/OpenTelemetry.DotNet.Auto.psm1'); New-Module -ScriptBlock ([scriptblock]::Create($module)) \| Import-Module; Install-OpenTelemetryCore` | `curl -sSfL https://raw.githubusercontent.com/open-telemetry/opentelemetry-dotnet-instrumentation/main/otel-dotnet-auto-install.sh -O && sh ./otel-dotnet-auto-install.sh` |
| 2 | 앱을 계측과 함께 실행 | `Register-OpenTelemetryForCurrentSession -OTelServiceName "<서비스명>"; dotnet YourApp.dll` — IIS로 호스팅한다면 `Register-OpenTelemetryForIIS`를 쓰고 IIS를 재시작 | `. $HOME/.otel-dotnet-auto/instrument.sh && dotnet YourApp.dll` |
| 3 | 앱 재기동 | ⚠️ .NET 런타임 지표(GC·스레드풀)는 아직 MovesEye 수신 허용목록에 없어 화면의 런타임 탭이 비어 있을 수 있다. HTTP·DB 지표는 정상 | |

추가 환경변수: `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta`(🔴 권장 — 이유는 Java와 같다), `OTEL_DOTNET_AUTO_TRACES_ENABLED_INSTRUMENTATIONS=AspNetCore,HttpClient,SqlClient`(필요한 계측만 켜면 부하가 줄어든다. 생략하면 전부 켜진다).

### Node.js — ⚠️ 실측 전

| # | 단계 | 명령·설명 |
|---|---|---|
| 1 | 패키지 설치 | `npm install --save @opentelemetry/api @opentelemetry/auto-instrumentations-node` |
| 2 | 계측을 먼저 로드해 실행 | `node --require @opentelemetry/auto-instrumentations-node/register app.js` — 🔴 `--require`는 앱 코드보다 먼저 실행돼야 한다. 뒤에 두면 이미 로드된 모듈이 계측되지 않아 아무 데이터도 안 온다 |
| 3 | 앱 재기동 | ⚠️ Node 런타임 지표(event loop 지연 등)는 아직 수신 허용목록에 없다. HTTP·DB 지표는 정상 |

추가 환경변수: `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta`(🔴 권장), `OTEL_EXPORTER_OTLP_PROTOCOL=grpc`(Collector의 4317로 보낼 때. `http/protobuf`를 쓰려면 4318로 바꾼다).

### Python — ⚠️ 실측 전

| # | 단계 | 명령·설명 |
|---|---|---|
| 1 | 패키지 설치 | `pip install opentelemetry-distro opentelemetry-exporter-otlp && opentelemetry-bootstrap -a install` — `opentelemetry-bootstrap`이 설치된 라이브러리에 맞는 계측 패키지를 골라 넣는다 |
| 2 | 래퍼로 실행 | `opentelemetry-instrument python app.py` — gunicorn·uvicorn도 같은 방식으로 앞에 붙인다(예: `opentelemetry-instrument gunicorn app:api`) |
| 3 | 앱 재기동 | ⚠️ Python 런타임 지표는 아직 수신 허용목록에 없다. HTTP·DB 지표는 정상 |

추가 환경변수: Node와 같다(`…TEMPORALITY_PREFERENCE=delta`, `OTEL_EXPORTER_OTLP_PROTOCOL=grpc`).

### Go — ⚠️ 실측 전 · 수동 계측

🔴 Go는 자동계측(에이전트)이 없다. 코드에서 SDK를 초기화하고 핸들러를 `otelhttp`로 감싸야 한다.

| # | 단계 | 명령·설명 |
|---|---|---|
| 1 | SDK 추가 | `go get go.opentelemetry.io/otel go.opentelemetry.io/otel/sdk go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp` |
| 2 | 초기화 코드 추가 | `handler := otelhttp.NewHandler(mux, "http.server")` — MeterProvider를 `otlpmetricgrpc` exporter로 만들고 `http.server.request.duration` 히스토그램을 내보내면 MovesEye 화면이 그대로 채워진다 |
| 3 | 앱 재빌드·재기동 | ⚠️ 수동 계측이라 어떤 지표가 오는지는 작성한 코드에 달려 있다 |

추가 환경변수: Node와 같다.

## 4단계 — 60초 검증

🔴 **순서가 곧 진단이다.** Collector가 떠 있나 → MovesEye가 받고 있나 → 화면에 보이나. 실패한 첫 단계가 곧 원인이다.

| # | 확인 | 방법 | 판정 |
|---|---|---|---|
| 1 | Collector가 떠 있는지 | Collector 서버에서 `curl -i http://127.0.0.1:13133/` (Windows `curl.exe`) | **200**이면 살아 있다. 연결이 거부되면 서비스가 안 떴거나 설정 파일 문법 오류 — Windows는 이벤트 뷰어 > 애플리케이션, Linux는 `journalctl -u otelcol -n 100` |
| 2 | MovesEye가 받고 있는지 (최근 60초) | 수집기 > 상태 탭 > **최근 60초 수신 확인**의 '지금 확인'(`GET /apm/ingest/recent?tokenId=…`) | `수신 있음`이면 받고 있다. ⚠️ 이 값은 서버 프로세스 메모리 기반이라 MovesEye를 방금 재기동했으면 비어 있다 — '판정 불가(서버 재기동 직후)'가 보이면 1분 뒤 다시 |
| 3 | 화면에 보이는지 | 1~2분 뒤 어플리케이션 모니터링 > 서비스 목록 | 안 보이면 등록·설정 탭의 등록 방식이 '승인'인지 확인 — 그 모드에서는 '승인 대기'에 쌓인다 |
| 4 | Collector 로그 읽는 법 (위 셋이 애매할 때) | Windows: 이벤트 뷰어 > Windows 로그 > 애플리케이션 > otelcol / Linux: `journalctl -u otelcol -n 200 --no-pager` | 아래 응답 코드 표 |

## 문제 해결

### Collector 로그의 응답 코드

`Permanent error`와 함께 찍힌 코드가 원인이다. **401·403·413은 재시도 없이 즉시 버려진다.** 반면 429·503은 백오프 재시도라 잠깐이면 저절로 복구된다.

| 코드 | 뜻 | 조치 |
|---|---|---|
| **401** | 토큰이 틀렸거나 회수됐다 | 설정 파일의 `Authorization: Bearer …` 값 확인. `${RECEIVE_TOKEN}` 자리표시가 그대로 남아 있지 않은지 본다(그대로 배포하면 Collector는 기동에 성공한 채 인증에 실패하고 화면에는 '데이터가 안 온다'로만 보인다). 필요하면 재발급 |
| **403** | APM 기능 미보유 또는 **라이선스 만료** | 설정 > 라이선스에서 프리미엄 모듈 `APM` 포함 여부·만료일 확인. 아래 '라이선스 만료' 참조 |
| **413** | 배치가 8MB를 넘었다 | 실측 배치는 수십 KB라 보통 안 걸린다. 걸리면 설정의 `send_batch_max_size`를 줄인다 |
| 429 · 503 | 일시 과부하·서버 장애 | Collector가 알아서 재시도한다(디스크 큐 보존, 최대 30분). MovesEye 서버 상태를 본다 |
| 415 · 400 | Content-Type 또는 JSON 형식 오류 | 우리 템플릿(`encoding: json`)이 아닌 설정을 쓴 경우. 화면에서 만든 yaml로 되돌린다 |

### 라이선스 만료 — 데이터는 즉시 사라진다

🔴 라이선스가 만료되면 수신이 403이 되고, OTLP exporter는 403을 영구 실패로 보아 재시도 없이 **즉시 폐기**한다(실측). 만료된 순간부터 데이터가 사라지며 **디스크 큐에도 남지 않는다.** 나중에 갱신해도 그 사이 데이터는 돌아오지 않는다.

- 만료 전에 갱신한다. 수집기 화면 상단에 "라이선스 만료까지 N일" 배너가 뜬다.
- 만료가 예정돼 있고 갱신하지 않을 것이면 **수집기를 중지하고 큐를 비운다**: (1) 앱의 계측을 끄거나 그대로 두고 (2) Collector 서비스 중지 — Windows `sc.exe stop otelcol`, Linux `sudo systemctl stop otelcol` (3) 큐 디렉터리(`C:\ProgramData\moveseye\otelcol-queue` / `/var/lib/moveseye/otelcol-queue`) 안 파일 삭제 (4) 수집기 화면에서 토큰 회수. 배너의 '토큰 전체 회수' 버튼은 (4)를 한 번에 한다.
- Collector를 계속 돌리면 앱은 계속 보내고 Collector는 계속 거부당하며 로그가 403으로 채워진다.

### 서비스가 목록에 안 보인다

1. 4단계 검증을 1번부터 다시 한다.
2. 서비스 이름이 **`unknown_service`** 로 왔다 — 앱에 `OTEL_SERVICE_NAME`이 없다. 이 이름은 등록이 거부되고 폐기 통계에 `UNKNOWN_SERVICE`로 잡힌다. 환경변수를 넣고 앱을 재기동한다.
3. 등록 방식이 **승인**이면 등록·설정 탭의 승인 대기 목록에서 승인한다. **사전 등록만**이면 먼저 서비스를 등록해야 받아 준다.
4. prod와 stage가 **한 서비스로 합쳐졌다** — `deployment.environment.name`이 아니라 구 이름 `deployment.environment`를 썼다. 속성 이름을 고치고 재기동한다.
5. Collector 자기 지표(`service.name=otelcol-contrib`)는 서비스로 등록되지 않고 수집기 탭에 나타난다 — 정상이다.
6. 상세 절차와 상태 뜻은 **어플리케이션 모니터링 — 자주 묻는 것**.

### 큐 디렉터리가 커진다

MovesEye로 보내지 못한 데이터가 쌓이는 곳이다(마스킹 **후** 데이터만 남는다). 커지고 있으면 Collector → MovesEye 구간이 막힌 것이다 — 4단계 2번(수신 확인)과 로그의 응답 코드를 본다. 원인을 고치면 저절로 비워진다(재시도 최대 30분). 정리가 필요하면 Collector를 **중지한 뒤** 디렉터리 안 파일을 지운다 — 켜진 채 지우지 않는다.

### Windows 서비스가 등록되지 않는다

`sc.exe create`의 `binPath=`·`start=` **등호 뒤 공백**을 확인한다. 경로에 공백(`Program Files`)이 있어 안쪽 큰따옴표를 `\"`로 이스케이프해야 한다. 표의 명령을 그대로 복사한다.

### 설정 파일을 손봤더니 Collector가 안 뜬다

`otelcol-contrib validate --config <파일>`로 문법을 먼저 검사한다. 화면에서 만든 yaml은 검증된 템플릿이므로 **직접 편집하지 말고** 옵션을 바꿔 다시 만드는 것이 안전하다. `encoding: json`은 서버 파서가 json 전용이라 바꾸면 415가 난다.

## 운영 중 알아 둘 것

- **토큰 회수**는 즉시다. 회수하는 순간 그 토큰으로 오는 수신이 전부 거부되고 그 사이 데이터는 재시도 없이 버려진다. 수집기 설정 파일을 새 토큰으로 교체한 뒤 회수한다.
- **버전은 올리지 않는다.** 0.159.0 / 2.31.1은 round-trip을 실측한 조합이다. 다른 버전은 검증되지 않았고, 특히 Collector는 릴리스에 별칭이 없어 풀버전 URL만 있다.
- **원문 SQL 보존**을 켜 둔 상태로 잊지 않는다. 등록·설정 탭에 마지막으로 바꾼 사람이 표시된다.
- Collector 자체의 운영(업그레이드·모니터링 대행)은 MovesEye가 하지 않는다. 상태 탭의 큐 적체·전송 실패와 알람 규칙 '수집기 전송 실패'로 이상을 잡는 데까지다.

## 관련 문서

- **어플리케이션 모니터링 (APM)** — 화면 설명·상태 5종·알람 규칙·Zabbix 액션 연결
- **라이선스** — 프리미엄 모듈·만료
- **관리자 가이드**
- **문제 해결 가이드**
