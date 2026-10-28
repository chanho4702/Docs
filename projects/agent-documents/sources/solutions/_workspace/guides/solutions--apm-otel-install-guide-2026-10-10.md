# MovesEye APM 연동 및 OpenTelemetry 설치 가이드

- 기준일: 2026-10-10
- 대상: MovesEye 관리자, 서버 설치 담당자, 애플리케이션 운영자
- 검증된 버전: OpenTelemetry Collector(otelcol-contrib) 0.159.0, OpenTelemetry Java Agent 2.31.1

이 문서는 운영 중인 애플리케이션을 MovesEye APM에 연결하는 방법을 처음부터 끝까지 순서대로 설명합니다. 순서대로 따라 하면 보통 30분 안에 첫 데이터가 화면에 들어옵니다.

화면의 '설치 가이드' 탭은 설치 환경에 맞춘 명령(사내 미러 주소, 설치 경로 등)을 보여 줍니다. 이 문서와 화면의 명령이 다르면 화면을 따르세요. 이 문서는 기본값 기준으로 쓰였습니다.

---

## 1. 전체 구조

MovesEye APM은 OpenTelemetry라는 표준 계측 방식을 씁니다. 애플리케이션이 직접 MovesEye로 데이터를 보내지 않고, 중간에 수집기(OpenTelemetry Collector)를 하나 둡니다.

```text
[애플리케이션 서버들]                [수집기 서버 1대]                       [MovesEye 서버]
 Java / .NET / Node / Python  ──▶  OpenTelemetry Collector  ──HTTPS──▶  <MovesEye 주소>/apm/otlp
   (OpenTelemetry 에이전트·SDK)       4317(gRPC) / 4318(HTTP)              수신 토큰으로 인증
```

데이터는 다음 순서로 흐릅니다.

1. 애플리케이션에 붙인 OpenTelemetry 에이전트가 요청 처리 시간, 오류, DB 호출, 트레이스 등을 모읍니다.
2. 에이전트는 모은 데이터를 같은 네트워크 안의 수집기로 보냅니다(4317 또는 4318 포트).
3. 수집기는 개인정보 마스킹, 트레이스 샘플링, 묶음 전송을 처리한 뒤 MovesEye로 보냅니다. MovesEye와 연결이 끊기면 디스크에 쌓아 두었다가 다시 보냅니다.
4. MovesEye는 수신 토큰과 라이선스를 확인한 뒤 데이터를 저장하고 화면에 보여 줍니다.

수집기를 꼭 거쳐야 하는 이유는 마스킹, 샘플링, 재전송 기능이 모두 수집기에 있기 때문입니다. 애플리케이션에서 MovesEye로 직접 보내는 구성은 지원하지 않습니다.

---

## 2. 시작하기 전에

### 2.1 준비물

| 항목 | 내용 |
|---|---|
| MovesEye 권한 | APM 편집 권한이 있는 관리자 계정 |
| 라이선스 | PREMIUM 라이선스에 APM 기능이 포함되어 있어야 합니다. 관리 콘솔 > 라이선스에서 확인할 수 있습니다. |
| 수집기 서버 1대 | Linux amd64(systemd), Windows 10 1803 이상 또는 Windows Server 2019 이상, macOS(Intel, Apple Silicon) 중 하나. 단일 실행 파일이라 Docker는 필요 없습니다. |
| 인터넷 접근 | 설치 파일을 GitHub에서 내려받습니다. 폐쇄망이면 사내 미러를 준비하세요. 미러 주소는 설치 설정에 등록하면 화면 명령에 반영됩니다. |
| 애플리케이션 재기동 | 에이전트를 붙이려면 애플리케이션을 한 번 재기동해야 합니다. 작업 시간을 미리 잡아 두세요. |

### 2.2 네트워크 포트

| 방향 | 포트 | 용도 |
|---|---|---|
| 애플리케이션 서버 → 수집기 | 4317/TCP | 데이터 전송(gRPC, 기본) |
| 애플리케이션 서버 → 수집기 | 4318/TCP | 데이터 전송(HTTP, 필요할 때만) |
| 수집기 → MovesEye | MovesEye 접속 포트(HTTPS면 443) | MovesEye로 데이터 전송 |
| 수집기 내부 | 13133/TCP (127.0.0.1) | 수집기 상태 확인용. 외부에 열 필요 없음 |
| 수집기 내부 | 8888/TCP (127.0.0.1) | 수집기 자체 지표. 외부에 열 필요 없음 |

수집기에서 MovesEye 쪽으로 나가는 연결만 있으면 됩니다. MovesEye가 수집기로 접속하는 일은 없습니다.

### 2.3 미리 알아 둘 원칙

- 수집기는 한 사이트(데이터센터, 망 구역)에 1대만 둡니다. 여러 대를 두면 하나의 트레이스가 여러 수집기로 나뉘어 들어가 샘플링이 제대로 되지 않습니다. 이중화가 필요하면 한 대를 대기용으로 두는 방식(active-standby)으로 운영하세요.
- 서비스 이름(`OTEL_SERVICE_NAME`)은 MovesEye 화면에 그대로 표시됩니다. 같은 서비스의 인스턴스는 모두 같은 이름을 쓰고, 운영과 개발 환경은 이름이 아니라 환경 속성으로 구분합니다.

---

## 3. 1단계: 수신 토큰 발급과 설정 파일 받기

수집기가 MovesEye로 데이터를 보낼 때 쓰는 토큰을 발급하고, 수집기 설정 파일(config.yaml)을 받습니다.

화면 위치: 화면 오른쪽 위 톱니바퀴 > 관리 콘솔 > APM 관리 > 수집기 > 토큰·설정 탭

1. '토큰 발급' 버튼을 누릅니다.
2. 라벨에 수집기를 구분할 이름을 적습니다. 예: 본사 IDC 수집기
3. 범위는 `ingest`(수신)만 선택합니다. `deploy`는 CI/CD에서 배포 이력을 남길 때 쓰는 범위이므로, 필요하면 별도 토큰으로 따로 발급합니다.
4. '설정 파일(yaml)도 함께 받기'가 켜져 있는지 확인합니다. 켜 두면 토큰이 이미 들어간 설정 파일을 바로 받을 수 있습니다.
5. 'MovesEye 주소'에 수집기가 접속할 MovesEye 주소를 넣습니다. 예: `https://moveseye.example.com`. 뒤에 `/apm/otlp`나 `/v1/metrics`는 붙이지 않습니다.
6. 수집기를 설치할 OS를 고릅니다. 나머지 옵션은 기본값 그대로 두는 것을 권장합니다.
7. '발급'을 누르면 결과 창이 뜹니다. 여기서 토큰 원문을 복사해 안전한 곳에 보관하고, 설정 파일을 `config.yaml` 이름으로 저장합니다.

> 주의: 결과 창을 닫으면 토큰 원문을 다시 볼 수 없습니다. 서버에는 토큰의 해시만 저장되기 때문입니다. 토큰을 잃어버렸다면 새로 발급하고 기존 토큰은 회수하세요.

설정 파일에는 토큰이 들어 있습니다. 메일이나 메신저로 돌리지 말고, Git 같은 형상관리 도구에도 올리지 마세요.

### 3.1 설정 파일 옵션

대부분 기본값으로 충분합니다. 바꿔야 할 때만 참고하세요.

| 옵션 | 설명 | 기본값 |
|---|---|---|
| MovesEye 주소 | 수집기가 데이터를 보낼 주소. `https://` 같은 스킴까지 적습니다. | 설치 설정값 |
| 수집기 OS | 큐 디렉터리 기본 경로와 설치 명령이 OS에 따라 달라집니다. | Linux |
| 느린 요청 기준(ms) | 이 시간보다 오래 걸린 요청의 트레이스는 항상 저장합니다. | 2000 |
| 정상 트레이스 저장 비율(%) | 느리지도 않고 오류도 없는 요청 중 몇 %를 저장할지 정합니다. | 2 |
| 메모리 상한(MiB) | 수집기가 쓸 최대 메모리입니다. 넘으면 잠시 새 데이터를 받지 않아 수집기가 죽는 것을 막습니다. | 512 |
| 디스크 큐 경로 | MovesEye로 아직 못 보낸 데이터를 쌓아 두는 곳입니다. | Linux `/var/lib/moveseye/otelcol-queue`, Windows `C:\ProgramData\moveseye\otelcol-queue` |
| 원문 SQL 보존 | 켜면 SQL 문의 값이 마스킹되지 않고 그대로 저장됩니다. 개인정보가 섞일 수 있어 장애 재현 같은 짧은 기간에만 켜세요. 누가 켰는지 감사 로그에 남습니다. | 꺼짐 |
| Kubernetes | 파드, 노드, 디플로이먼트 정보를 함께 수집합니다. | 꺼짐 |
| 실시간 스팬 전송 | 실시간 관제 화면용 전송 경로를 추가합니다. 서버 설정도 함께 켜야 합니다. | 꺼짐 |

토큰 발급 뒤에 옵션만 바꿔서 설정 파일을 다시 만들 수도 있습니다. 이때 받은 파일에는 토큰 자리에 `${RECEIVE_TOKEN}`이라는 글자가 남아 있으므로, 보관해 둔 토큰 원문으로 직접 바꿔 넣어야 합니다.

---

## 4. 2단계: 수집기(OpenTelemetry Collector) 설치

수집기 서버에서 진행합니다. 1단계에서 받은 `config.yaml`을 수집기 서버의 작업 폴더에 먼저 복사해 두세요.

어느 OS든 실행 옵션에 `--feature-gates=ottl.set.allowNil`이 들어갑니다. 실시간 관제 기능에 필요한 옵션이며, 실시간 관제를 쓰지 않아도 그대로 두면 됩니다.

### 4.1 Linux (systemd)

1. 수집기를 내려받습니다.

```bash
curl -L -o /tmp/otelcol-contrib.tar.gz \
  https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.159.0/otelcol-contrib_0.159.0_linux_amd64.tar.gz
```

2. 압축을 풀어 실행 파일을 설치합니다.

```bash
sudo install -d /usr/local/bin
sudo tar -xzf /tmp/otelcol-contrib.tar.gz -C /usr/local/bin otelcol-contrib
sudo chmod 755 /usr/local/bin/otelcol-contrib
```

3. 수집기 전용 계정을 만들고 설정 파일을 배치합니다. 설정 파일에 토큰이 있으므로 다른 사용자는 읽지 못하게 합니다.

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin otelcol 2>/dev/null
sudo install -d -m 750 -o root -g otelcol /etc/moveseye
sudo install -m 640 -o root -g otelcol config.yaml /etc/moveseye/collector.yaml
```

4. 디스크 큐 디렉터리를 만듭니다.

```bash
sudo install -d -m 700 -o otelcol -g otelcol /var/lib/moveseye/otelcol-queue
```

5. 포트가 비어 있는지 확인합니다. "포트 비어 있음"이 나오면 정상입니다.

```bash
sudo ss -ltnp | grep -E ':(4317|4318|13133)\s' || echo "포트 비어 있음"
```

방화벽을 쓰고 있다면 애플리케이션 서버에서 들어오는 4317, 4318 포트를 엽니다.

```bash
# firewalld
sudo firewall-cmd --permanent --add-port=4317/tcp --add-port=4318/tcp && sudo firewall-cmd --reload
# ufw
sudo ufw allow 4317/tcp && sudo ufw allow 4318/tcp
```

클라우드 VM이면 보안 그룹에서도 같은 포트를 애플리케이션 서버 대역에 열어 주세요.

6. systemd 서비스로 등록합니다.

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

7. 서비스를 시작하고 상태를 확인합니다. `active (running)`이 보이면 정상입니다.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now otelcol
systemctl status otelcol --no-pager
```

### 4.2 Windows

명령은 모두 관리자 권한으로 연 PowerShell(Windows PowerShell 5.1)에서 실행합니다. 명령 프롬프트(cmd)에서는 동작하지 않습니다. 같은 창에서 순서대로 실행하세요.

1. 수집기를 내려받습니다.

```powershell
$ProgressPreference = 'SilentlyContinue'
Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.159.0/otelcol-contrib_0.159.0_windows_amd64.tar.gz' -OutFile "$env:TEMP\otelcol-contrib.tar.gz"
```

2. 압축을 풉니다.

```powershell
New-Item -ItemType Directory -Force -Path "C:\Program Files\moveseye-collector" | Out-Null
tar -xzf "$env:TEMP\otelcol-contrib.tar.gz" -C "C:\Program Files\moveseye-collector"
```

3. 설정 파일을 배치합니다. `config.yaml`이 있는 폴더에서 실행하세요.

```powershell
New-Item -ItemType Directory -Force -Path "C:\ProgramData\moveseye" | Out-Null
Copy-Item -Path .\config.yaml -Destination "C:\ProgramData\moveseye\config.yaml" -Force
```

4. 디스크 큐 디렉터리를 만들고 SYSTEM과 Administrators만 접근하도록 권한을 제한합니다. 설정 파일에도 같은 권한을 걸어 두는 것을 권장합니다.

```powershell
New-Item -ItemType Directory -Force -Path "C:\ProgramData\moveseye\otelcol-queue" | Out-Null
icacls "C:\ProgramData\moveseye\otelcol-queue" /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F"
```

5. 포트를 확인하고 방화벽 규칙을 추가합니다. 첫 명령의 결과가 비어 있으면 포트가 비어 있는 것입니다.

```powershell
Get-NetTCPConnection -State Listen -LocalPort 4317,4318,13133 -ErrorAction SilentlyContinue | Select-Object LocalPort,OwningProcess
if (-not (Get-NetFirewallRule -DisplayName "MovesEye OTel Collector" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName "MovesEye OTel Collector" -Direction Inbound -Protocol TCP -LocalPort 4317,4318 -Action Allow | Out-Null
}
```

6. Windows 서비스로 등록합니다. `-BinaryPathName` 값은 작은따옴표로 감싼 하나의 문자열이고, 그 안의 경로는 공백 때문에 큰따옴표로 감쌉니다. 그대로 복사해 쓰세요.

```powershell
New-Service -Name otelcol -DisplayName "MovesEye OTel Collector" -StartupType Automatic -BinaryPathName '"C:\Program Files\moveseye-collector\otelcol-contrib.exe" --config "C:\ProgramData\moveseye\config.yaml" --feature-gates=ottl.set.allowNil'
```

이미 같은 이름의 서비스가 있으면 `sc.exe delete otelcol`로 지운 뒤 다시 등록합니다.

7. 서비스를 시작합니다. Status가 `Running`이면 정상입니다.

```powershell
Start-Service otelcol
Get-Service otelcol
```

시작에 실패하면 이벤트 뷰어 > Windows 로그 > 응용 프로그램에서 `otelcol` 항목을 확인하세요.

### 4.3 macOS

Intel과 Apple Silicon은 실행 파일이 다릅니다. 아래 명령이 CPU 종류를 확인해서 맞는 파일을 받습니다.

```bash
# 1. 내려받기
ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')
curl -L -o /tmp/otelcol-contrib.tar.gz \
  https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.159.0/otelcol-contrib_0.159.0_darwin_${ARCH}.tar.gz

# 2. 설치
sudo install -d /usr/local/bin
sudo tar -xzf /tmp/otelcol-contrib.tar.gz -C /usr/local/bin otelcol-contrib
sudo chmod 755 /usr/local/bin/otelcol-contrib

# 3. 설정 파일 배치 (root만 읽을 수 있게)
sudo install -d -m 700 /usr/local/etc/moveseye
sudo install -m 600 config.yaml /usr/local/etc/moveseye/collector.yaml

# 4. 큐·로그 디렉터리 (큐 경로는 화면에 보이는 값 사용)
sudo install -d -m 700 <큐 경로>
sudo install -d -m 755 /usr/local/var/log/moveseye
```

LaunchDaemon으로 등록하고 시작합니다.

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

sudo chown root:wheel /Library/LaunchDaemons/com.moveseye.otelcol.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/com.moveseye.otelcol.plist
sudo launchctl kickstart -k system/com.moveseye.otelcol
```

브라우저로 내려받은 파일은 실행이 막힐 수 있습니다. 그럴 때는 `sudo xattr -d com.apple.quarantine /usr/local/bin/otelcol-contrib`로 풀어 줍니다. 로그는 `/usr/local/var/log/moveseye/otelcol.log`에 남습니다.

### 4.4 설치가 끝났는지 확인

수집기 서버에서 아래 명령을 실행해 HTTP 200이 나오면 수집기가 정상적으로 떠 있는 것입니다. Windows에서는 `curl` 대신 `curl.exe`를 쓰세요.

```bash
curl -i http://127.0.0.1:13133/
```

---

## 5. 3단계: 애플리케이션에 OpenTelemetry 붙이기

애플리케이션 서버에서 진행합니다. 언어와 관계없이 아래 공통 환경변수를 애플리케이션 프로세스에 넣고, 언어별 방법으로 에이전트를 붙인 뒤 재기동합니다.

### 5.1 공통 환경변수

`<...>`로 표시된 부분은 실제 값으로 바꿔 넣으세요.

| 환경변수 | 값 | 설명 |
|---|---|---|
| `OTEL_SERVICE_NAME` | `<서비스명>` | MovesEye에 표시될 서비스 이름입니다. 같은 서비스의 모든 인스턴스가 같은 값을 써야 합니다. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://<수집기 주소>:4317` | 데이터를 보낼 곳입니다. MovesEye 주소가 아니라 수집기 주소를 넣습니다. |
| `OTEL_RESOURCE_ATTRIBUTES` | `deployment.environment.name=<prod/stage/dev>,service.version=<버전>` | 환경과 버전입니다. 버전을 넣어야 배포 전후 비교가 됩니다. |
| `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE` | `delta` | 권장값입니다. 애플리케이션을 재기동해도 수치가 끊기지 않고, 최소·최대 응답시간이 정확히 저장됩니다. |
| `OTEL_BSP_SCHEDULE_DELAY` | `1000` | 트레이스를 모아 보내는 간격(ms)입니다. 실시간 관제를 쓸 때 권장합니다. |
| `OTEL_BSP_MAX_QUEUE_SIZE` | `2048` | 트레이스 전송 대기열 크기입니다. 트래픽이 많으면 늘립니다. |

환경 속성은 반드시 `deployment.environment.name`으로 적어야 합니다. 예전 이름인 `deployment.environment`만 쓰면 운영과 개발 데이터가 한 서비스로 합쳐집니다.

### 5.2 Java (Spring Boot, Tomcat, WAS 등)

Java는 코드를 고치지 않고 JVM 옵션만 추가하면 됩니다. MovesEye에서 검증한 방식입니다.

1. Java 에이전트를 내려받습니다.

Linux / macOS:

```bash
sudo install -d /opt/otel
sudo curl -L -o /opt/otel/opentelemetry-javaagent.jar \
  https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.31.1/opentelemetry-javaagent.jar
```

Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force -Path "C:\ProgramData\moveseye\otel" | Out-Null
Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.31.1/opentelemetry-javaagent.jar' -OutFile "C:\ProgramData\moveseye\otel\opentelemetry-javaagent.jar"
```

2. JVM 옵션 두 개를 추가합니다.

```bash
java -javaagent:/opt/otel/opentelemetry-javaagent.jar \
     -Dotel.instrumentation.http.server.emit-experimental-telemetry=true \
     -jar your-app.jar
```

두 번째 옵션은 현재 처리 중인 요청 수(액티브 요청)를 보내도록 켭니다. 빠지면 APM 개요와 서비스 화면의 액티브 요청 카드가 비어 있게 됩니다.

실행 방식별로 넣는 위치는 다음과 같습니다.

| 실행 방식 | 넣는 위치 |
|---|---|
| `java -jar`로 직접 실행 | 실행 명령에 바로 추가 |
| Tomcat | `bin/setenv.sh`(Windows는 `setenv.bat`)의 `CATALINA_OPTS` |
| 그 밖의 WAS | 해당 WAS의 JVM 옵션 설정(`JAVA_OPTS` 등) |
| Windows 서비스로 실행하는 JVM | 서비스의 JVM 인자. 경로에 공백이 있으면 큰따옴표로 감쌉니다. |

3. Java 전용 환경변수를 추가합니다.

| 환경변수 | 값 | 설명 |
|---|---|---|
| `OTEL_SEMCONV_STABILITY_OPT_IN` | `database` | DB 지표를 표준 이름으로 보냅니다. 빠지면 DB 호출 분석 화면이 비어 있습니다. |
| `OTEL_METRIC_EXPORT_INTERVAL` | `15000` | 선택 항목입니다. 지표 전송 간격(기본 60초)을 줄이고 싶을 때만 넣습니다. |

4. 애플리케이션을 재기동합니다. JVM 메모리, GC, 스레드, 커넥션 풀 지표는 따로 설정하지 않아도 함께 들어옵니다.

Linux에서 systemd로 띄우는 Spring Boot 애플리케이션이라면 서비스 파일에 다음처럼 넣으면 됩니다.

```ini
[Service]
Environment="OTEL_SERVICE_NAME=order-api"
Environment="OTEL_EXPORTER_OTLP_ENDPOINT=http://10.0.0.50:4317"
Environment="OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=prod,service.version=1.4.2"
Environment="OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta"
Environment="OTEL_SEMCONV_STABILITY_OPT_IN=database"
Environment="OTEL_BSP_SCHEDULE_DELAY=1000"
ExecStart=/usr/bin/java -javaagent:/opt/otel/opentelemetry-javaagent.jar -Dotel.instrumentation.http.server.emit-experimental-telemetry=true -jar /opt/app/order-api.jar
```

위 예시의 서비스명, 수집기 주소, 버전은 실제 값으로 바꿔 넣으세요.

### 5.3 .NET

.NET 자동 계측을 설치해 붙입니다. 아직 MovesEye에서 검증을 마치지 않은 방식이라, 적용 후 4단계 확인을 꼭 거쳐 주세요.

| 순서 | Windows (PowerShell) | Linux |
|---|---|---|
| 1. 설치 | 아래 PowerShell 명령 | `curl -sSfL https://raw.githubusercontent.com/open-telemetry/opentelemetry-dotnet-instrumentation/main/otel-dotnet-auto-install.sh -O && sh ./otel-dotnet-auto-install.sh` |
| 2. 실행 | `Register-OpenTelemetryForCurrentSession -OTelServiceName "<서비스명>"` 후 `dotnet YourApp.dll`. IIS는 `Register-OpenTelemetryForIIS` 후 IIS 재시작 | `. $HOME/.otel-dotnet-auto/instrument.sh && dotnet YourApp.dll` |

Windows 설치 명령:

```powershell
$module = (New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/open-telemetry/opentelemetry-dotnet-instrumentation/main/OpenTelemetry.DotNet.Auto.psm1')
New-Module -ScriptBlock ([scriptblock]::Create($module)) | Import-Module
Install-OpenTelemetryCore
```

.NET 전용 환경변수:

| 환경변수 | 값 | 설명 |
|---|---|---|
| `OTEL_SEMCONV_STABILITY_OPT_IN` | `http,database` | 꼭 넣어 주세요. HTTP와 DB 지표를 표준 이름으로 보냅니다. |
| `OTEL_DOTNET_AUTO_TRACES_ENABLED_INSTRUMENTATIONS` | `AspNetCore,HttpClient,SqlClient` | 선택 항목입니다. 필요한 계측만 켜서 부하를 줄입니다. 생략하면 전부 켜집니다. |

현재 .NET 런타임 지표(GC, 스레드 풀)는 MovesEye가 받지 않습니다. 런타임 탭은 비어 있을 수 있고, HTTP, DB, 트레이스는 정상으로 보입니다.

### 5.4 Node.js

아직 MovesEye에서 검증을 마치지 않은 방식입니다.

```bash
# 1. 패키지 설치
npm install --save @opentelemetry/api @opentelemetry/auto-instrumentations-node

# 2. 계측을 먼저 불러온 뒤 앱 실행
node --require @opentelemetry/auto-instrumentations-node/register app.js
```

`--require` 옵션은 반드시 앱 파일보다 앞에 둡니다. 뒤에 두면 이미 불러온 모듈이 계측되지 않아 데이터가 오지 않습니다. PM2를 쓰면 `node_args`에 같은 옵션을 넣으면 됩니다.

Node.js 전용 환경변수:

| 환경변수 | 값 | 설명 |
|---|---|---|
| `OTEL_SEMCONV_STABILITY_OPT_IN` | `http,database` | 꼭 넣어 주세요. 없으면 HTTP 지표가 예전 이름과 단위로 나갑니다. |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `grpc` | 수집기의 4317로 보낼 때 씁니다. `http/protobuf`를 쓰려면 주소를 4318로 바꿉니다. |

### 5.5 Python

아직 MovesEye에서 검증을 마치지 않은 방식입니다.

```bash
# 1. 패키지 설치 (설치된 라이브러리에 맞는 계측 패키지를 자동으로 넣어 줍니다)
pip install opentelemetry-distro opentelemetry-exporter-otlp
opentelemetry-bootstrap -a install

# 2. 실행 명령 앞에 opentelemetry-instrument를 붙입니다
opentelemetry-instrument python app.py
opentelemetry-instrument gunicorn app:api
```

환경변수는 Node.js와 같습니다(`OTEL_SEMCONV_STABILITY_OPT_IN=http,database`, `OTEL_EXPORTER_OTLP_PROTOCOL=grpc`).

Python은 계측 라이브러리가 액티브 요청의 메서드 값을 비워서 보내기 때문에, 화면에서 '(미지정)'으로 묶여 표시됩니다. 설정으로 바꿀 수 있는 부분은 아닙니다.

### 5.6 Go

Go는 자동 계측이 아니라 코드에 직접 SDK를 넣는 방식입니다. 아직 MovesEye에서 검증을 마치지 않았습니다.

```bash
go get go.opentelemetry.io/otel go.opentelemetry.io/otel/sdk \
  go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc \
  go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp
```

HTTP 핸들러를 `otelhttp.NewHandler(mux, "http.server")`로 감싸고, MeterProvider를 `otlpmetricgrpc` exporter로 만들어 등록합니다. 어떤 지표가 들어오는지는 작성한 코드에 따라 달라집니다. 환경변수는 `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta`, `OTEL_EXPORTER_OTLP_PROTOCOL=grpc`를 넣습니다.

---

## 6. 4단계: 연결 확인

아래 순서대로 확인합니다. 처음으로 실패한 단계에 원인이 있습니다.

| 순서 | 확인할 것 | 방법 | 정상일 때 |
|---|---|---|---|
| 1 | 수집기가 떠 있는가 | 수집기 서버에서 `curl -i http://127.0.0.1:13133/` | HTTP 200 |
| 2 | MovesEye가 데이터를 받고 있는가 | 관리 콘솔 > APM 관리 > 수집기 > 상태 탭 > '최근 60초 수신 확인'에서 토큰을 고르고 '지금 확인' | '받고 있음' 표시 |
| 3 | 서비스가 화면에 보이는가 | 1~2분 뒤 사이드바 애플리케이션 모니터링 > 서비스 | 설정한 서비스 이름이 목록에 있음 |

애플리케이션을 재기동하고 서비스 목록에 나타나기까지 보통 1~2분이 걸립니다. 지표 전송 주기(기본 60초)와 1분 단위 집계 때문입니다.

MovesEye 서버를 방금 재기동했다면 2번 확인에서 '판정 불가'가 나올 수 있습니다. 1~2분 뒤 다시 확인하세요.

### 6.1 수집기 로그 보는 법

위 확인으로 원인이 잡히지 않으면 수집기 로그를 봅니다.

| OS | 명령 또는 위치 |
|---|---|
| Linux | `journalctl -u otelcol -n 200 --no-pager` |
| Windows | 이벤트 뷰어 > Windows 로그 > 응용 프로그램 > otelcol |
| macOS | `tail -n 200 /usr/local/var/log/moveseye/otelcol.log` |

---

## 7. 5단계(선택): 알람 규칙 설정

데이터가 들어오기 시작하면 알람 규칙을 만들어 둡니다.

화면 위치: 관리 콘솔 > APM 관리 > 알람 규칙

| 알람 종류 | 언제 울리나 |
|---|---|
| 오류율 | 서비스의 오류 비율이 기준을 넘을 때 |
| 응답시간 p95 | 요청 95%의 응답시간이 기준을 넘을 때 |
| 수신 끊김 | 서비스에서 데이터가 일정 시간 들어오지 않을 때 |
| 수집기 전송 실패 | 수집기가 MovesEye로 데이터를 보내지 못할 때 |
| 액티브 요청 급증 | 처리 중인 요청 수가 갑자기 늘 때 |
| SLO 버짓 소진 | SLO 오류 예산이 빠르게 소진될 때 |
| 요청 걸림 | 오래 끝나지 않는 요청이 생길 때(Java 확장 필요) |

처음에는 '수집기 전송 실패'와 '수신 끊김'부터 만들어 두는 것을 권장합니다. 연동이 끊긴 것을 가장 먼저 알려 주는 알람입니다.

발생한 알람은 사이드바 애플리케이션 모니터링 > 장애 및 에러에서 확인할 수 있습니다.

---

## 8. 문제 해결

### 8.1 수집기 로그에 찍힌 응답 코드별 조치

로그에 `Permanent error`와 함께 응답 코드가 찍혀 있으면 아래 표를 보세요. 401, 403, 413은 재시도 없이 바로 버려지므로 빨리 조치해야 합니다.

| 코드 | 원인 | 조치 |
|---|---|---|
| 401 | 토큰이 틀렸거나 회수되었습니다. | 설정 파일의 `Authorization: Bearer` 값을 확인합니다. `${RECEIVE_TOKEN}` 글자가 그대로 남아 있지 않은지 봅니다. |
| 403 | 라이선스에 APM이 없거나 만료되었습니다. 또는 `deploy` 전용 토큰을 넣었습니다. | 관리 콘솔 > 라이선스를 확인합니다. 토큰 범위에 `ingest`가 있는지 봅니다. |
| 413 | 한 번에 보낸 데이터가 8MB를 넘었습니다. | 보통은 생기지 않습니다. 생기면 설정 파일의 `send_batch_max_size`를 줄입니다. |
| 429, 503 | MovesEye 서버가 잠시 바쁘거나 재기동 중입니다. | 수집기가 알아서 다시 보냅니다(최대 30분). MovesEye 서버 상태를 확인합니다. |
| 400, 415 | 데이터 형식 오류입니다. | 화면에서 받은 설정 파일이 아닌 다른 설정을 쓴 경우입니다. 화면에서 받은 설정 파일로 되돌립니다. |

### 8.2 서비스가 목록에 나오지 않을 때

1. 6장의 확인을 1번부터 다시 해 봅니다.
2. 서비스 이름이 `unknown_service`로 들어왔다면 `OTEL_SERVICE_NAME`이 빠진 것입니다. 이 경우 수집기 > 등록·설정 탭의 '이름 없는 앱'에 표시됩니다. 환경변수를 넣고 재기동하세요.
3. 수집기 > 등록·설정 탭에서 '새 서비스 등록 방식'을 확인합니다. '승인 대기'면 승인 대기 목록에서 승인해야 데이터가 저장됩니다. '사전 등록만'이면 서비스를 먼저 등록해야 합니다.
4. 운영과 개발이 한 서비스로 합쳐져 보이면 `deployment.environment` 대신 `deployment.environment.name`을 썼는지 확인합니다.
5. `otelcol-contrib`라는 이름은 수집기 자신의 지표라서 서비스 목록이 아닌 수집기 화면에 나옵니다. 정상입니다.

### 8.3 서비스는 보이는데 트레이스가 거의 없을 때

정상 요청은 기본값으로 2%만 저장됩니다. 트래픽이 적은 서비스는 느린 요청이나 오류가 생겨야 트레이스가 보입니다. 더 많이 보고 싶으면 '정상 트레이스 저장 비율'을 올려 설정 파일을 다시 만들고 수집기를 재시작하세요. 서비스 맵은 5분 단위로 그려서 최대 8분 정도 늦게 반영됩니다.

### 8.4 수집기가 기동하자마자 멈출 때

로그에 `address already in use`가 있으면 포트가 겹친 것입니다. 해당 포트를 쓰는 프로그램을 옮기거나, 설정 파일의 `receivers.otlp.protocols.grpc.endpoint`(기본 0.0.0.0:4317)와 `http.endpoint`(기본 0.0.0.0:4318)를 빈 포트로 바꿉니다. 이때 애플리케이션의 `OTEL_EXPORTER_OTLP_ENDPOINT`도 같은 포트로 맞춰야 합니다.

설정 파일을 직접 고친 뒤 기동이 안 된다면 `otelcol-contrib validate --config <설정 파일>`로 문법을 먼저 검사하세요. 가능하면 직접 고치지 말고 화면에서 옵션을 바꿔 설정 파일을 다시 받는 편이 안전합니다.

### 8.5 큐 디렉터리 용량이 계속 늘어날 때

MovesEye로 보내지 못한 데이터가 쌓이고 있다는 뜻입니다. 6장 2번 확인과 수집기 로그의 응답 코드를 보세요. 원인을 해결하면 큐는 저절로 비워집니다. 정리가 꼭 필요하면 수집기를 먼저 중지한 뒤 파일을 지웁니다. 실행 중에 지우면 안 됩니다. 디스크 여유 공간은 큐 크기의 2배 이상 확보해 두세요.

---

## 9. 운영 중 주의할 점

- 라이선스가 만료되면 MovesEye가 수신을 거부하고, 그 사이 데이터는 디스크 큐에도 남지 않고 바로 사라집니다. 수집기 화면 위쪽에 만료 예정 안내가 뜨므로 그 전에 갱신하세요.
- 토큰을 회수하면 그 즉시 해당 토큰으로 오는 데이터가 거부됩니다. 토큰을 바꿀 때는 새 토큰으로 설정 파일을 먼저 교체하고, 수집기를 재시작한 뒤 옛 토큰을 회수하세요.
- 수집기와 Java 에이전트 버전은 임의로 올리지 마세요. 0.159.0과 2.31.1 조합만 검증되어 있습니다.
- MovesEye가 업데이트되어 설정 파일 옵션이 바뀌어도, 이미 설치된 수집기에는 자동으로 반영되지 않습니다. 기존 설정 파일을 백업한 뒤 화면에서 다시 받아 교체하고 수집기를 재시작하세요. 이때 큐 디렉터리는 지우지 않습니다.
- '원문 SQL 보존'을 켰다면 작업이 끝난 뒤 꼭 다시 꺼 주세요.

---

## 부록. 설치 체크리스트

- [ ] 라이선스에 APM이 포함되어 있다
- [ ] 수집기 서버를 정했고, 애플리케이션 서버에서 4317 포트로 접근할 수 있다
- [ ] 수집기 서버에서 MovesEye 주소로 HTTPS 접속이 된다
- [ ] 수신 토큰을 발급하고 원문을 안전하게 보관했다
- [ ] 설정 파일(config.yaml)을 받아 수집기 서버에 배치했다
- [ ] 수집기를 서비스로 등록했고 `curl http://127.0.0.1:13133/`이 200을 돌려준다
- [ ] 애플리케이션에 에이전트와 공통 환경변수를 넣고 재기동했다
- [ ] 상태 탭 '최근 60초 수신 확인'에서 '받고 있음'을 확인했다
- [ ] 서비스 목록에 서비스가 보인다
- [ ] '수집기 전송 실패', '수신 끊김' 알람 규칙을 만들었다
