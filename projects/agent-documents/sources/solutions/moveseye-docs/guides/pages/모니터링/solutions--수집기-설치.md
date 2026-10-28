---
title: 수집기 설치 (APM 온보딩)
doc_type: guide
menu_path: 모니터링 > 어플리케이션 모니터링 > 수집기 > 토큰·설정 / 설치 가이드 탭
route: /application-monitoring/collectors
audience: [관리자, 설치 담당자, 앱 운영자, 지원 담당자]
status: review
owner: MovesEye 팀
baseline: 2026-09-01
source_of_truth: moveseye-be-spring premium/apm/collector/install/ApmInstallGuideService.java, ApmInstallVersions.java, ApmInstallPaths.java, ApmCollectorProperties.java, src/main/resources/apm/collector-template.yaml
reviewed_at: 2026-09-28
---

# 수집기 설치 (APM 온보딩)

> **화면** 모니터링 > 어플리케이션 모니터링 > 수집기 (관리자 전용)
> **이 문서와 화면의 관계** 화면의 '설치 가이드' 탭은 서버가 만든 문구를 그대로 그린다. 이 문서는 그 문구의 문서판이다. 둘이 다르면 **화면이 정본**이다 — 화면은 설치본 설정(사내 미러 주소·큐 디렉터리·설치 경로)을 반영하지만 이 문서는 기본값만 적는다.
> **검증 조합** otelcol-contrib **0.159.0** · opentelemetry-javaagent **2.31.1**. 다른 버전은 검증되지 않았다.

## 시작 전에

### 준비물

| 항목 | 내용 |
|---|---|
| MovesEye 권한 | 관리자 계정(APM 편집 권한). 라이선스에 `APM` 기능(PREMIUM) 포함 |
| Collector를 둘 서버 1대 | Windows 10 1803 이상 / Windows Server 2019 이상(관리자 PowerShell 5.1), Linux amd64(systemd), 또는 macOS(Intel·Apple Silicon). 도커 불필요(단일 바이너리) |
| 네트워크 | 앱 서버 → Collector **4317**(gRPC) · **4318**(HTTP) 내부 통신. Collector → MovesEye 서버 주소로 **아웃바운드 HTTPS**. Collector 서버에서 내려받기 위한 GitHub 접근(폐쇄망은 사내 미러) |
| 앱 | 계측을 붙이고 **재기동**할 수 있어야 한다. Java는 코드 수정 없이 JVM 옵션 두 개 |

### 두 가지 원칙

- 🔴 **게이트웨이 Collector는 사이트당 1대만 둔다.** 두 대 이상이면 한 트레이스의 스팬이 갈라져 샘플링이 제대로 되지 않는다. 이중화가 필요하면 active-standby로 두고 전환 중 유실을 허용한다 — active-active는 지원 범위 밖이다. 여러 대가 같은 토큰으로 보내면 수집기별 지표가 서로 덮어쓴다.
- ℹ️ **앱은 MovesEye가 아니라 Collector로 보낸다**(LAN 내 4317/4318). MovesEye로 직접 보내는 구성은 지원하지 않는다 — 마스킹·샘플링·재시도 큐가 전부 Collector에 있다.

### 데이터가 오는 길

```text
 [앱 서버들]                     [Collector 서버 1대]                       [MovesEye 서버]
 Java -javaagent ──gRPC 4317──▶ otelcol-contrib 0.159.0 ──HTTPS/json──▶ <MovesEye 주소>/apm/otlp/v1/metrics
 .NET/Node/Python  (또는 4318)    · 마스킹·허용목록·배치                                     /v1/traces
                                  · tail 샘플링(느림·실패는 전부, 정상은 일부)                /v1/logs
                                  · 디스크 큐(못 보낸 것 보관)               · Bearer 수신 토큰 검사
                                  · 자기 상태 지표도 함께 보냄               · 라이선스(APM) 검사
                                  · (선택) 실시간 관제용 별도 전송           · 1분 표·스팬 표에 적재
```

## 1단계 — 토큰 발급과 설정 파일 받기 (MovesEye 화면)

수집기 > **토큰·설정** 탭.

1. **토큰 발급**을 누르고 라벨(어느 수집기인지 구분할 이름, 예: 본사 수집기)을 적는다. 범위는 `ingest`(수신)만 켠다. `deploy`(배포 마커 웹훅용)는 CI/CD에 넣을 토큰을 따로 발급한다 — 한 토큰에 둘을 묶으면 노출면이 달라 권하지 않는다.
2. **'설정 파일(yaml)도 함께 받기'를 켠 채** 발급한다. 켜 두면 토큰이 이미 채워진 완성본 yaml을 같은 응답으로 받는다.
3. 발급 결과 창에서 **토큰 원문을 복사하고 yaml을 내려받는다.** 🔴 이 창을 닫으면 토큰 원문을 다시 볼 수 없다 — 서버는 해시만 저장하므로 복구 경로가 없다. 잃어버리면 새로 발급하고 옛 토큰을 회수하는 수밖에 없다.
4. 창에 보이는 **수신 주소(endpoint)** 는 `<MovesEye 주소>/apm/otlp` 꼴이다. 뒤에 `/v1/metrics`를 붙이지 않는다 — exporter가 스스로 붙인다.

### 설정 파일 옵션 ('설정 파일 다시 만들기')

토큰을 발급한 뒤에도 설정 파일만 다시 만들 수 있다. 이때는 토큰 자리가 `${RECEIVE_TOKEN}` **자리표시로 남으므로** 발급 때 복사한 값을 손으로 넣어야 한다.

| 항목 | 뜻 | 기본 |
|---|---|---|
| MovesEye 주소 | 스킴 포함(예: `https://moveseye.example.com`). `/apm/otlp`는 서버가 붙이고, `/v1/metrics`를 붙여 오면 거절한다 | 설치본 힌트 |
| 수집기 OS | 큐 디렉터리 기본값과 설치 명령이 갈린다(Windows / Linux / macOS) | Linux |
| 느린 요청 임계(ms) | 이 시간을 넘는 트레이스는 샘플링에서 항상 남긴다 | 2000 |
| 정상 트레이스 표본(%) | 느리지도 실패하지도 않은 요청 중 남길 비율 | 2 |
| 메모리 상한(MiB) | Collector 프로세스가 쓸 최대 메모리. 넘으면 새 데이터를 잠시 거절해 자기 자신이 죽는 것을 막는다 | 512 |
| 디스크 큐 경로 | 아직 보내지 못한 데이터가 쌓이는 곳. 비우면 OS별 기본값 — Linux `/var/lib/moveseye/otelcol-queue`, Windows `C:\ProgramData\moveseye\otelcol-queue`, macOS는 설치본 설정 | 설치본 설정 |
| 원문 SQL 보존 | 🔴 켜면 리터럴 마스킹 프로세서가 빠져 **쿼리 원문이 그대로 저장된다.** 쿼리 값에 이름·연락처 같은 개인정보가 실려 올 수 있고, **누가 켰는지 감사 로그에 남는다.** 문제를 재현하는 동안에만 켜고 끝나면 되돌린다 | 전역 기본값 따름(마스킹) |
| Kubernetes | 켜면 파드·노드·디플로이먼트 정보와 재시작·OOM 관측이 yaml에 붙는다. 클러스터 권한(ServiceAccount) 안내가 함께 나온다 | 꺼짐 |
| 실시간 스팬 전송 | 실시간 관제 화면으로 곧바로 보내는 별도 전송 경로. 저장되는 데이터는 그대로다. 서버 쪽 스위치도 함께 켜야 한다(관리자 가이드 §8-1) | 꺼짐 |
| 기본 규칙 포함 | 템플릿의 마스킹·필터 프로세서 묶음. 끄고 추가 규칙도 없으면 그 프로세서가 빠진다 | 켜짐 |

화면에서 고르지 않는 고정값: 서버로 보내는 묶음 주기 5초(한 번에 최대 1024건) · gzip 압축 · JSON 인코딩(서버 파서가 JSON 전용) · 디스크 큐 5000건 · 전송 실패 재시도 최대 30분(429·5xx·네트워크 오류만 재시도, 401·403·413은 즉시 폐기).

설정 파일에는 토큰이 들어 있다. **파일 권한을 제한하고 형상관리(git)에 올리지 않는다.**

## 2단계 — Collector 설치

아래는 화면 설치 가이드 탭의 명령과 같다. 다운로드 주소의 베이스(`https://github.com/open-telemetry`)는 설치본 설정으로 사내 미러로 바꿀 수 있으며, 그때는 **화면에 보이는 주소**를 쓴다. 미러는 베이스 뒤에 `/<저장소>/releases/download/v<버전>/<파일>` 경로 모양을 그대로 흉내 내면 된다.

모든 OS의 실행줄에 `--feature-gates=ottl.set.allowNil`이 붙는다. 실시간 스팬 전송에 필요한 옵션이고, 안 쓰는 설치에서도 해롭지 않다. 빼면 실시간 관제가 조용히 안 된다.

### Windows (관리자 권한 PowerShell)

🔴 **관리자 권한 PowerShell**(Windows PowerShell 5.1)에서 실행한다. 명령 프롬프트(cmd)에서는 동작하지 않는다. 한 창에서 차례로 이어 실행한다.

| # | 단계 | 명령 |
|---|---|---|
| 1 | Collector 내려받기 | `$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.159.0/otelcol-contrib_0.159.0_windows_amd64.tar.gz' -OutFile "$env:TEMP\otelcol-contrib.tar.gz"` |
| 2 | 압축 해제 | `New-Item -ItemType Directory -Force -Path "C:\Program Files\moveseye-collector" \| Out-Null; tar -xzf "$env:TEMP\otelcol-contrib.tar.gz" -C "C:\Program Files\moveseye-collector"` |
| 3 | 설정 파일 배치 | `New-Item -ItemType Directory -Force -Path "C:\ProgramData\moveseye" \| Out-Null; Copy-Item -Path .\config.yaml -Destination "C:\ProgramData\moveseye\config.yaml" -Force` |
| 4 | 큐 디렉터리 권한 제한 | `New-Item -ItemType Directory -Force -Path "C:\ProgramData\moveseye\otelcol-queue" \| Out-Null; icacls "C:\ProgramData\moveseye\otelcol-queue" /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F"` |
| 5 | 포트 충돌 확인·방화벽 열기 | `Get-NetTCPConnection -State Listen -LocalPort 4317,4318,13133 -ErrorAction SilentlyContinue \| Select-Object LocalPort,OwningProcess,@{n='Process';e={(Get-Process -Id $_.OwningProcess).ProcessName}}; if (-not (Get-NetFirewallRule -DisplayName "MovesEye OTel Collector" -ErrorAction SilentlyContinue)) { New-NetFirewallRule -DisplayName "MovesEye OTel Collector" -Direction Inbound -Protocol TCP -LocalPort 4317,4318 -Action Allow \| Out-Null }` |
| 6 | Windows 서비스 등록 | `New-Service -Name otelcol -DisplayName "MovesEye OTel Collector" -StartupType Automatic -BinaryPathName '"C:\Program Files\moveseye-collector\otelcol-contrib.exe" --config "C:\ProgramData\moveseye\config.yaml" --feature-gates=ottl.set.allowNil'` |
| 7 | 서비스 시작 | `Start-Service otelcol; Get-Service otelcol` |

- 2단계: `tar`는 Windows 10 1803 이상·Windows Server 2019 이상에 기본 포함되어 있다.
- 3단계: 🔴 설정 화면에서 내려받은 config.yaml을 **현재 폴더에 두고** 실행한다. 안의 `${RECEIVE_TOKEN}` 자리에 발급 시 1회 표시된 토큰 원문을 넣는다(발급과 함께 받은 완성본이면 이미 채워져 있다).
- 4단계: 디스크 큐에는 마스킹 후 텔레메트리가 남는다. 상속을 끊고 SYSTEM·관리자만 접근하게 둔다. **설정 파일(config.yaml)에도 같은 제한을 건다.**
- 5단계: 앞부분은 4317·4318·13133을 듣는 프로세스 목록(비어 있으면 정상), 뒷부분은 방화벽 인바운드 규칙(이미 있으면 건너뜀). 13133은 127.0.0.1에만 묶여 있어 규칙에 넣지 않는다. 다른 방화벽 제품을 쓰면 거기서 같은 포트를 연다.
- 6단계: 🔴 `-BinaryPathName`은 **작은따옴표로 감싼 한 문자열**이다 — 안쪽 큰따옴표는 경로에 공백이 있어 필요하다. nssm 같은 별도 도구는 필요하지 않다. 이미 등록돼 있으면 `Remove-Service otelcol`(5.1에서는 `sc.exe delete otelcol`) 뒤 다시 등록한다.
- 7단계: Status가 Running이면 성공. 실패하면 이벤트 뷰어 > Windows 로그 > 애플리케이션에서 `otelcol` 항목을 확인한다.

### Linux (systemd)

| # | 단계 | 명령 |
|---|---|---|
| 1 | Collector 내려받기 | `curl -L -o /tmp/otelcol-contrib.tar.gz https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.159.0/otelcol-contrib_0.159.0_linux_amd64.tar.gz` |
| 2 | 압축 해제 | `sudo install -d /usr/local/bin && sudo tar -xzf /tmp/otelcol-contrib.tar.gz -C /usr/local/bin otelcol-contrib && sudo chmod 755 /usr/local/bin/otelcol-contrib` |
| 3 | 설정 파일 배치 | `sudo useradd --system --no-create-home --shell /usr/sbin/nologin otelcol 2>/dev/null; sudo install -d -m 750 -o root -g otelcol /etc/moveseye && sudo install -m 640 -o root -g otelcol config.yaml /etc/moveseye/collector.yaml` |
| 4 | 큐 디렉터리 권한 제한 | `sudo install -d -m 700 -o otelcol -g otelcol /var/lib/moveseye/otelcol-queue` |
| 5 | 포트 충돌 확인·방화벽 열기 | `sudo ss -ltnp \| grep -E ':(4317\|4318\|13133)\s' \|\| echo "포트 비어 있음"` |
| 6 | systemd 서비스 등록 | 아래 유닛 파일 |
| 7 | 서비스 시작 | `sudo systemctl daemon-reload && sudo systemctl enable --now otelcol && systemctl status otelcol --no-pager` |

```bash
sudo tee /etc/systemd/system/otelcol.service > /dev/null <<'UNIT'
[Unit]
Description=MovesEye OTel Collector
After=network-online.target

[Service]
ExecStart=/usr/local/bin/otelcol-contrib --config /etc/moveseye/collector.yaml --feature-gates=ottl.set.allowNil
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
- 5단계: 앱 서버에서 들어오는 4317/tcp·4318/tcp만 열면 된다. firewalld면 `sudo firewall-cmd --permanent --add-port=4317/tcp --add-port=4318/tcp && sudo firewall-cmd --reload`, ufw면 `sudo ufw allow 4317/tcp && sudo ufw allow 4318/tcp`. 둘 다 없으면 열 것도 없다. 클라우드 VM은 보안 그룹에서도 같은 포트를 앱 서브넷에 연다. 13133은 127.0.0.1에만 묶여 있어 열지 않는다.
- 6단계: Collector를 root로 돌리지 않기 위해 전용 계정 `otelcol`로 실행한다.

### macOS (LaunchDaemon)

Intel과 Apple Silicon은 바이너리가 다르다. 1단계 명령이 `uname -m`으로 골라 받는다. 경로는 Homebrew 관례(`/usr/local`)를 따르되 brew로 설치하지는 않는다.

| # | 단계 | 명령 |
|---|---|---|
| 1 | Collector 내려받기 | `ARCH=$(uname -m \| sed 's/x86_64/amd64/;s/aarch64/arm64/') && curl -L -o /tmp/otelcol-contrib.tar.gz https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.159.0/otelcol-contrib_0.159.0_darwin_${ARCH}.tar.gz` |
| 2 | 압축 해제 | `sudo install -d /usr/local/bin && sudo tar -xzf /tmp/otelcol-contrib.tar.gz -C /usr/local/bin otelcol-contrib && sudo chmod 755 /usr/local/bin/otelcol-contrib` |
| 3 | 설정 파일 배치 | `sudo install -d -m 700 /usr/local/etc/moveseye && sudo install -m 600 config.yaml /usr/local/etc/moveseye/collector.yaml` |
| 4 | 큐·로그 디렉터리 권한 제한 | `sudo install -d -m 700 <큐 경로> && sudo install -d -m 755 /usr/local/var/log/moveseye` (큐 경로는 화면에 보이는 값) |
| 5 | 포트 충돌 확인·방화벽 | `sudo lsof -nP -iTCP:4317 -iTCP:4318 -iTCP:13133 -sTCP:LISTEN \|\| echo "포트 비어 있음"` |
| 6 | LaunchDaemon 등록 | 아래 plist |
| 7 | 서비스 시작 | `sudo chown root:wheel /Library/LaunchDaemons/com.moveseye.otelcol.plist && sudo launchctl bootstrap system /Library/LaunchDaemons/com.moveseye.otelcol.plist && sudo launchctl kickstart -k system/com.moveseye.otelcol && sudo launchctl print system/com.moveseye.otelcol \| head -n 20` |

```bash
sudo tee /Library/LaunchDaemons/com.moveseye.otelcol.plist > /dev/null <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.moveseye.otelcol</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/otelcol-contrib</string>
    <string>--config</string>
    <string>/usr/local/etc/moveseye/collector.yaml</string>
    <string>--feature-gates=ottl.set.allowNil</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/usr/local/var/log/moveseye/otelcol.log</string>
  <key>StandardErrorPath</key><string>/usr/local/var/log/moveseye/otelcol.log</string>
</dict>
</plist>
PLIST
```

- 2단계: 브라우저로 내려받은 파일이면 Gatekeeper 격리 표식이 붙어 실행이 막힌다 — `sudo xattr -d com.apple.quarantine /usr/local/bin/otelcol-contrib`로 뗀다. curl로 받았으면 붙지 않는다.
- 3단계: 🔴 LaunchDaemon은 **root로 돈다.** 설정 파일을 root 전용(600)으로 잠그는 것이 다른 로그인 사용자가 토큰을 읽지 못하게 하는 유일한 장치다.
- 5단계: macOS 응용 프로그램 방화벽이 켜져 있으면 첫 기동 때 '들어오는 연결 허용' 팝업이 뜬다. 데몬이라 팝업을 못 보면 `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/otelcol-contrib --unblockapp /usr/local/bin/otelcol-contrib`로 허용한다.
- 6단계: 시스템 도메인(`/Library/LaunchDaemons`)에 두어야 로그인 여부와 무관하게 부팅 때 뜬다. KeepAlive라 죽으면 launchd가 다시 띄운다.
- 7단계: 이미 등록돼 있으면 `sudo launchctl bootout system/com.moveseye.otelcol` 뒤 다시 실행한다. plist 소유자가 root가 아니면 launchd가 거부한다. 로그는 `/usr/local/var/log/moveseye/otelcol.log`.

### 포트가 이미 쓰이고 있을 때

포트 확인 단계 출력에 프로세스(PID)가 보이면 그 포트를 다른 프로그램이 쓰는 것이다. 그 프로그램을 옮길 수 없으면 config.yaml에서 `receivers.otlp.protocols.grpc.endpoint`(0.0.0.0:4317)·`http.endpoint`(0.0.0.0:4318)를 빈 포트로 바꾸고, 앱의 `OTEL_EXPORTER_OTLP_ENDPOINT`도 **같은 포트**로 맞춘다. 13133이 겹치면 `extensions.health_check.endpoint`를 바꾸고 4단계 검증의 curl 주소도 같이 바꾼다. 🔴 Collector가 기동 직후 죽으면서 로그에 `address already in use`가 찍히면 이 충돌이다.

### 방화벽 요약

| 방향 | 포트 | 용도 |
|---|---|---|
| 앱 서버 → Collector | 4317/TCP | OTLP gRPC (기본) |
| 앱 서버 → Collector | 4318/TCP | OTLP HTTP (`http/protobuf`를 쓸 때) |
| Collector → MovesEye | MovesEye 주소(HTTPS, 기본 443) | 수신 엔드포인트 `/apm/otlp/v1/*`. MovesEye 서버는 이미 듣고 있으니 따로 열 것이 없다 |
| Collector 로컬 | 13133/TCP (127.0.0.1) | health check — 외부 개방 불필요 |
| Collector 로컬 | 8888/TCP (127.0.0.1) | 자기 지표 — 외부 개방 불필요 |

Collector에서 MovesEye로는 **아웃바운드만** 필요하다. MovesEye에서 Collector로 들어오는 연결은 없다. 인터넷 방향은 내려받기 단계 말고는 필요 없다.

## 3단계 — 앱 계측

스택이 달라도 **앞의 공통 환경변수는 같다**(서비스 식별의 정본). 앱 프로세스에 넣고, 꺾쇠 자리표시(`<...>`)는 실제 값으로 바꾼다 — 그럴듯한 예시값을 그대로 붙이면 아무 데이터도 안 온다.

### 공통 환경변수 5개

| 이름 | 값 | 왜 필요한가 |
|---|---|---|
| `OTEL_SERVICE_NAME` | `<서비스명>` | 🔴 이 값이 MovesEye의 서비스 이름이 된다. 인스턴스마다 같아야 하고, 환경이 다르면 이름이 아니라 아래 환경 속성으로 가른다 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://<collector-host>:4317` | 🔴 앱은 MovesEye가 아니라 **Collector**로 보낸다(gRPC 4317). MovesEye 주소를 여기 넣으면 인증이 없어 전부 버려진다 |
| `OTEL_RESOURCE_ATTRIBUTES` | `deployment.environment.name=<prod\|stage\|dev>,service.version=<버전>` | 환경과 버전. 버전이 있어야 배포 직후 수신 끊김 유예(10분)·배포 자동 감지·배포 전후 비교가 된다. 🔴 `deployment.environment.name`으로 적는다 — 구 이름 `deployment.environment`만 보내면 환경을 못 갈라 prod와 stage가 한 서비스로 합쳐진다 |
| `OTEL_BSP_SCHEDULE_DELAY` | `1000` | 실시간 관제용 권장값. 앱이 끝난 요청을 모아 보내는 대기를 1초로 줄인다(기본 5초). 네트워크·큐 대기가 더해지므로 화면 도착 시간을 보장하지는 않는다 |
| `OTEL_BSP_MAX_QUEUE_SIZE` | `2048` | 위 대기 큐의 시작값. 피크 부하와 메모리에 맞춰 조정한다. 앱 로그의 스팬 폐기 경고와 함께 본다 |

### Java (Spring · Tomcat · WAS · Jira 등) — ✅ 검증됨

앱을 고칠 필요는 없다. 에이전트 경로는 Linux/macOS `/opt/otel`, Windows `C:\ProgramData\moveseye\otel`이 기본이다(화면 설정을 따른다).

| # | 단계 | 명령·설명 |
|---|---|---|
| 1 | 자동계측 에이전트 내려받기 | Linux/macOS `sudo install -d /opt/otel && sudo curl -L -o /opt/otel/opentelemetry-javaagent.jar https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.31.1/opentelemetry-javaagent.jar` · Windows(PowerShell) `New-Item -ItemType Directory -Force -Path "C:\ProgramData\moveseye\otel" \| Out-Null; Invoke-WebRequest -UseBasicParsing -Uri '<같은 URL>' -OutFile "C:\ProgramData\moveseye\otel\opentelemetry-javaagent.jar"`. 검증 버전은 **2.31.1** |
| 2 | JVM 옵션 **두 개** 추가 | `java -javaagent:/opt/otel/opentelemetry-javaagent.jar -Dotel.instrumentation.http.server.emit-experimental-telemetry=true -jar your-app.jar`. 🔴 두 번째 옵션은 **액티브 요청(동시에 처리 중인 요청 수)** 지표를 켠다 — 빼면 개요와 서비스 화면의 액티브 요청 카드가 계속 빈 채로 남는다. Tomcat·WAS는 `JAVA_OPTS`(또는 `setenv.sh`/`CATALINA_OPTS`)에 같은 두 옵션을 넣고 재기동한다. Windows 서비스로 띄운 JVM은 서비스의 JVM 인자에 넣고, 경로에 공백이 있으면 큰따옴표로 감싼다 |
| 3 | 앱 재기동 | 재기동 후 1~2분(export 주기 + 1분 버킷)이면 MovesEye 서비스 목록에 나타난다. JVM 메모리·GC·스레드·커넥션 풀은 별도 설정 없이 함께 온다 |

Java 추가 환경변수:

| 이름 | 값 | 왜 필요한가 |
|---|---|---|
| `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE` | `delta` | 🔴 권장. 지표를 누적값이 아니라 구간 증분으로 보낸다. 앱을 재기동해도 수치가 끊기지 않고 최소/최대 지연과 exemplar 값이 정확하게 저장된다. 빠뜨려도 데이터는 받지만 최소/최대 지연은 비고 실시간 화면의 '느린 엔드포인트'는 근삿값을 쓴다 |
| `OTEL_SEMCONV_STABILITY_OPT_IN` | `database` | DB 지표를 표준 이름(`db.client.operation.duration`)으로 보낸다. 없으면 옛 이름으로 와서 DB 화면이 빈다 |
| `OTEL_METRIC_EXPORT_INTERVAL` | `15000` | 선택. 기본 60초보다 촘촘하게 보고 싶을 때만 |

진행 중 요청 목록·요청 걸림 알람까지 쓰려면 MovesEye 자바 확장 jar를 `-Dotel.javaagent.extensions=`로 추가로 붙인다(관리자 가이드 §8-2). 확장이 없어도 위 세 화면 외에는 전부 동작한다.

### .NET — ⚠️ 검증 전

`OTEL_DOTNET_AUTO_*` 환경변수로 동작하는 자동계측이다.

| # | 단계 | Windows (PowerShell) | Linux |
|---|---|---|---|
| 1 | 자동계측 설치 | `$module = (New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/open-telemetry/opentelemetry-dotnet-instrumentation/main/OpenTelemetry.DotNet.Auto.psm1'); New-Module -ScriptBlock ([scriptblock]::Create($module)) \| Import-Module; Install-OpenTelemetryCore` | `curl -sSfL https://raw.githubusercontent.com/open-telemetry/opentelemetry-dotnet-instrumentation/main/otel-dotnet-auto-install.sh -O && sh ./otel-dotnet-auto-install.sh` |
| 2 | 앱을 계측과 함께 실행 | `Register-OpenTelemetryForCurrentSession -OTelServiceName "<서비스명>"; dotnet YourApp.dll` — IIS로 호스팅한다면 `Register-OpenTelemetryForIIS`를 쓰고 IIS를 재시작 | `. $HOME/.otel-dotnet-auto/instrument.sh && dotnet YourApp.dll` |
| 3 | 앱 재기동 | ⚠️ .NET 런타임 지표(GC·스레드풀)는 아직 MovesEye가 받지 않아 런타임 탭이 비어 있을 수 있다. HTTP·DB·트레이스는 정상 | |

.NET 추가 환경변수: 🔴 `OTEL_SEMCONV_STABILITY_OPT_IN=http,database`(**꼭 넣는다** — 없으면 HTTP·DB 지표가 옛 이름으로 나가고, MovesEye가 옛 이름도 받아 주지만 임시 호환이라 계측 버전이 올라가면 먼저 끊긴다) · `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta`(🔴 권장, 이유는 Java와 같다) · `OTEL_DOTNET_AUTO_TRACES_ENABLED_INSTRUMENTATIONS=AspNetCore,HttpClient,SqlClient`(필요한 계측만 켜면 부하가 줄어든다. 생략하면 전부 켜진다).

### Node.js — ⚠️ 검증 전

| # | 단계 | 명령·설명 |
|---|---|---|
| 1 | 패키지 설치 | `npm install --save @opentelemetry/api @opentelemetry/auto-instrumentations-node` |
| 2 | 계측을 먼저 로드해 실행 | `node --require @opentelemetry/auto-instrumentations-node/register app.js` — 🔴 `--require`는 앱 코드보다 먼저 실행돼야 한다. 뒤에 두면 이미 로드된 모듈이 계측되지 않아 아무 데이터도 안 온다 |
| 3 | 앱 재기동 | ⚠️ Node 런타임 지표(event loop 지연 등)는 아직 MovesEye가 받지 않아 런타임 탭이 비어 있다. HTTP·DB·트레이스는 정상 |

Node 추가 환경변수: 🔴 `OTEL_SEMCONV_STABILITY_OPT_IN=http,database`(**꼭 넣는다** — 없으면 HTTP 계측이 옛 이름·밀리초 단위로 보내고, `database`까지 함께 넣어야 DB 지표도 표준 이름으로 온다) · `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta`(🔴 권장) · `OTEL_EXPORTER_OTLP_PROTOCOL=grpc`(Collector의 4317로 보낼 때. `http/protobuf`를 쓰려면 4318로 바꾼다).

### Python — ⚠️ 검증 전

| # | 단계 | 명령·설명 |
|---|---|---|
| 1 | 패키지 설치 | `pip install opentelemetry-distro opentelemetry-exporter-otlp && opentelemetry-bootstrap -a install` — `opentelemetry-bootstrap`이 설치된 라이브러리에 맞는 계측 패키지를 골라 넣는다 |
| 2 | 래퍼로 실행 | `opentelemetry-instrument python app.py` — gunicorn·uvicorn도 같은 방식으로 앞에 붙인다(예: `opentelemetry-instrument gunicorn app:api`) |
| 3 | 앱 재기동 | ⚠️ Python 런타임 지표는 아직 MovesEye가 받지 않아 런타임 탭이 비어 있다. HTTP·DB·트레이스는 정상. ℹ️ 액티브 요청 수는 Python 계측이 메서드 값을 비워 보내 화면에서 '(미지정)'으로 묶인다 — 계측 쪽 동작이라 설정으로 바꿀 수 없다 |

Python 추가 환경변수: Node와 같다.

### Go — ⚠️ 검증 전 · 수동 계측

🔴 Go는 이 가이드에서 **수동 계측**이다. 코드에서 SDK를 초기화하고 핸들러를 `otelhttp`로 감싼다. OpenTelemetry에 eBPF 기반 Go 자동계측이 따로 있지만 Linux 전용이고 MovesEye가 검증한 절차가 아니다.

| # | 단계 | 명령·설명 |
|---|---|---|
| 1 | SDK 추가 | `go get go.opentelemetry.io/otel go.opentelemetry.io/otel/sdk go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp` |
| 2 | 초기화 코드 추가 | `handler := otelhttp.NewHandler(mux, "http.server")` — MeterProvider를 `otlpmetricgrpc` exporter로 만들고 `http.server.request.duration` 히스토그램을 내보내면 MovesEye 화면이 그대로 채워진다 |
| 3 | 앱 재빌드·재기동 | ⚠️ 수동 계측이라 어떤 지표가 오는지는 작성한 코드에 달려 있다 |

Go 추가 환경변수: `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta` · `OTEL_EXPORTER_OTLP_PROTOCOL=grpc`.

## 4단계 — 60초 검증

🔴 **순서가 곧 진단이다.** Collector가 떠 있나 → MovesEye가 받고 있나 → 화면에 보이나. 실패한 첫 단계가 곧 원인이다.

| # | 확인 | 방법 | 판정 |
|---|---|---|---|
| 1 | Collector가 떠 있는지 | Collector 서버에서 `curl -i http://127.0.0.1:13133/` (Windows `curl.exe`) | **200**이면 살아 있다. 연결이 거부되면 서비스가 안 떴거나 설정 파일 문법 오류 — 로그를 본다(4번). 로그에 `address already in use`가 있으면 포트 충돌 — 2단계의 '포트가 이미 쓰이고 있을 때' |
| 2 | MovesEye가 받고 있는지 (최근 60초) | 수집기 > 상태 탭 > **최근 60초 수신 확인**의 '지금 확인' | `받고 있음`이면 받고 있다. ⚠️ 이 값은 서버 프로세스 메모리 기반이라 MovesEye를 방금 재기동했으면 비어 있다 — '판정 불가(서버 재기동 직후)'가 보이면 1~2분 뒤 다시 |
| 3 | 화면에 보이는지 | 1~2분 뒤 어플리케이션 모니터링 > 서비스 목록 | 안 보이면 등록·설정 탭의 등록 방식이 '승인'인지 확인 — 그 모드에서는 '승인 대기'에 쌓인다 |
| 4 | Collector 로그 읽는 법 (위 셋이 애매할 때) | Windows: 이벤트 뷰어 > Windows 로그 > 애플리케이션 > otelcol · Linux: `journalctl -u otelcol -n 200 --no-pager` · macOS: `tail -n 200 /usr/local/var/log/moveseye/otelcol.log` | 아래 응답 코드 표 |

## 문제 해결

### Collector 로그의 응답 코드

`Permanent error`와 함께 찍힌 코드가 원인이다. **401·403·413은 재시도 없이 즉시 버려진다.** 반면 429·503은 백오프 재시도라 잠깐이면 저절로 복구된다.

| 코드 | 뜻 | 조치 |
|---|---|---|
| **401** | 토큰이 틀렸거나 회수됐다 | 설정 파일의 `Authorization: Bearer …` 값 확인. `${RECEIVE_TOKEN}` 자리표시가 그대로 남아 있지 않은지 본다(그대로 배포하면 Collector는 기동에 성공한 채 인증에 실패하고 화면에는 '데이터가 안 온다'로만 보인다). 필요하면 재발급 |
| **403** | APM 기능 미보유 또는 **라이선스 만료** | 설정 > 라이선스에서 프리미엄 모듈 `APM` 포함 여부·만료일 확인. 아래 '라이선스 만료' 참조 |
| **413** | 배치가 8MB를 넘었다 | 실측 배치는 수십 KB라 보통 안 걸린다. 걸리면 설정의 `send_batch_max_size`를 줄인다 |
| 429 · 503 | 일시 과부하·서버 장애·재기동 | Collector가 알아서 재시도한다(디스크 큐 보존, 배치당 최대 30분). MovesEye 서버 상태를 본다 |
| 415 · 400 | Content-Type 또는 JSON 형식 오류 | 우리 템플릿(`encoding: json`)이 아닌 설정을 쓴 경우. 화면에서 만든 yaml로 되돌린다 |

### 라이선스 만료 — 데이터는 즉시 사라진다

🔴 라이선스가 만료되면 수신이 403이 되고, OTLP exporter는 403을 영구 실패로 보아 재시도 없이 **즉시 폐기**한다. 만료된 순간부터 데이터가 사라지며 **디스크 큐에도 남지 않는다.** 나중에 갱신해도 그 사이 데이터는 돌아오지 않는다.

- 만료 전에 갱신한다. 수집기 화면 상단에 "라이선스 만료까지 N일" 배너가 뜬다.
- 만료가 예정돼 있고 갱신하지 않을 것이면 **수집기를 중지하고 큐를 비운다**: (1) 앱의 계측을 끄거나 그대로 두고 (2) Collector 서비스 중지 — Windows `Stop-Service otelcol`, Linux `sudo systemctl stop otelcol`, macOS `sudo launchctl bootout system/com.moveseye.otelcol` (3) 큐 디렉터리 안 파일 삭제 (4) 수집기 화면에서 토큰 회수. 배너의 '토큰 전체 회수' 버튼은 (4)를 한 번에 한다.
- Collector를 계속 돌리면 앱은 계속 보내고 Collector는 계속 거부당하며 로그가 403으로 채워진다.

### 서비스가 목록에 안 보인다

1. 4단계 검증을 1번부터 다시 한다.
2. 서비스 이름이 **`unknown_service`** 로 왔다 — 앱에 `OTEL_SERVICE_NAME`이 없다. 이 이름은 등록이 거부되고 등록·설정 탭의 '이름 없는 앱'에 보인다. 환경변수를 넣고 앱을 재기동한다.
3. 등록 방식이 **승인**이면 등록·설정 탭의 승인 대기 목록에서 승인한다. **사전 등록만**이면 먼저 서비스를 등록해야 받아 준다.
4. prod와 stage가 **한 서비스로 합쳐졌다** — `deployment.environment.name`이 아니라 구 이름 `deployment.environment`를 썼다. 속성 이름을 고치고 재기동한다.
5. Collector 자기 지표(`service.name=otelcol-contrib`)는 서비스로 등록되지 않고 수집기 탭에 나타난다 — 정상이다.
6. 상세 절차와 상태 뜻은 [어플리케이션 모니터링 — 자주 묻는 것](solutions--%EC%95%A0%ED%94%8C%EB%A6%AC%EC%BC%80%EC%9D%B4%EC%85%98-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81.md#자주-묻는-것).

### 서비스는 보이는데 트레이스·서비스 맵이 비어 있다

- 수집기 상태 탭의 폐기 통계에 트레이스 신호가 `SIGNAL_NOT_SUPPORTED`·샘플링 드롭으로 쌓이는지 본다.
- 정상 요청은 설정한 표본 비율(기본 2%)만 남는다. 트래픽이 적은 서비스는 느린 요청·오류가 생겨야 트레이스가 보인다. 비율을 올려 설정 파일을 다시 만든다.
- 서비스 맵은 5분마다 접어 그려 최대 8분 늦다.

### 큐 디렉터리가 커진다

MovesEye로 보내지 못한 데이터가 쌓이는 곳이다(마스킹 **후** 데이터만 남는다). 커지고 있으면 Collector → MovesEye 구간이 막힌 것이다 — 4단계 2번(수신 확인)과 로그의 응답 코드를 본다. 원인을 고치면 저절로 비워진다. 정리가 필요하면 Collector를 **중지한 뒤** 디렉터리 안 파일을 지운다 — 켜진 채 지우지 않는다. 디스크 여유는 큐 파일 크기의 2배 이상 둔다(기동 시 정리 과정에서 파일 두 벌이 잠시 공존한다).

### Windows 서비스가 등록되지 않는다

`New-Service`의 `-BinaryPathName`은 작은따옴표로 감싼 한 문자열이고 안쪽 경로는 큰따옴표다. 이미 같은 이름이 있으면 `Remove-Service otelcol`(PowerShell 5.1은 `sc.exe delete otelcol`) 뒤 다시 등록한다. 표의 명령을 그대로 복사한다.

### 설정 파일을 손봤더니 Collector가 안 뜬다

`otelcol-contrib validate --config <파일>`로 문법을 먼저 검사한다. 화면에서 만든 yaml은 검증된 템플릿이므로 **직접 편집하지 말고** 옵션을 바꿔 다시 만드는 것이 안전하다. `encoding: json`은 서버 파서가 json 전용이라 바꾸면 415가 난다. 원문 SQL 보존을 켜면 `transform/sql` 프로세서가 정의와 파이프라인 양쪽에서 빠지는데, 한쪽만 손으로 지우면 기동을 거부한다.

## 운영 중 알아 둘 것

- **토큰 회수**는 즉시다. 회수하는 순간 그 토큰으로 오는 수신이 전부 거부되고 그 사이 데이터는 재시도 없이 버려진다. 수집기 설정 파일을 새 토큰으로 교체한 뒤 회수한다. 회수한 토큰은 보존 기간(기본 180일) 뒤 목록에서도 자동 삭제된다.
- **설정 파일이 바뀐 릴리스**를 받았을 때(화면이 새 옵션을 보여 주기 시작했을 때) 이미 설치된 Collector에는 자동 반영되지 않는다. 상태 탭에서 수신이 정상이고 전송 실패가 늘지 않는 때를 골라, 현재 yaml을 백업하고 토큰·설정 탭에서 설정을 **다시 만들어**(토큰은 그대로) 교체한 뒤 Collector를 재시작한다. 실패하면 백업을 되돌린다. 🔴 큐 디렉터리는 어떤 경우에도 지우지 않는다 — 쌓인 배치가 곧 데이터다.
- **버전은 올리지 않는다.** 0.159.0 / 2.31.1은 검증한 조합이다. 다른 버전은 검증되지 않았고, 특히 Collector는 릴리스에 별칭이 없어 풀버전 URL만 있다.
- **원문 SQL 보존**을 켜 둔 상태로 잊지 않는다. 등록·설정 탭에 마지막으로 바꾼 사람이 표시된다.
- **MovesEye 서버의 PostgreSQL**도 튜닝 대상이다(Collector가 아니라 DB). `work_mem = 64MB`(조회 속도를 가장 크게 좌우) · `shared_buffers` = 물리 메모리의 25% · `maintenance_work_mem = 1GB` · `max_wal_size = 4GB`. `work_mem`만은 `ALTER SYSTEM SET work_mem='64MB'; SELECT pg_reload_conf();`로도 된다. 접속·정렬마다 잡히는 값이라 무한정 올리지 않는다.
- Collector 자체의 운영(업그레이드·모니터링 대행)은 MovesEye가 하지 않는다. 상태 탭의 큐 적체·전송 실패와 알람 규칙 '수집기 전송 실패'로 이상을 잡는 데까지다.

## 관련 문서

- [어플리케이션 모니터링 (APM)](solutions--%EC%95%A0%ED%94%8C%EB%A6%AC%EC%BC%80%EC%9D%B4%EC%85%98-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81.md) — 화면 설명·상태 5종·알람 규칙·Zabbix 액션 연결
- [라이선스](../%EC%84%A4%EC%A0%95/solutions--%EB%9D%BC%EC%9D%B4%EC%84%A0%EC%8A%A4.md) — 프리미엄 모듈·만료
- [관리자 가이드](../../solutions--%EA%B4%80%EB%A6%AC%EC%9E%90-%EA%B0%80%EC%9D%B4%EB%93%9C.md) — 실시간 관제 스위치·자바 확장·동시 시청 상한
- [문제 해결 가이드](../../solutions--%EB%AC%B8%EC%A0%9C-%ED%95%B4%EA%B2%B0.md)
