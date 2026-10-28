# 설계서 — Zabbix 에이전트 설치 가이드 (Agent Install Guide)

- 작성: 2026-08-24
- 상태: **v1.1 — 구현+커밋 완료(2026-08-24, `5d88bb5` #ZM-113, master 미푸시). 검수 문서 `_workspace/reviews/review_agent-install-guide.md`**
- 구현 중 설계 변경(§10): Windows/macOS URL은 서버 풀버전이 아니라 **`{major}-latest` 공식 별칭** 사용 — CDN이 구 패치 바이너리를 정리해서(7.0.6 MSI/pkg HEAD 404 실측) 풀버전 URL이 성립하지 않는다. Linux는 설계대로 풀버전(전 조합 HEAD 200 실측).
- 배경: 설치형 제품 특성상 고객 서버에 우리가 직접 에이전트를 설치해줄 수 없다. "가이드 따라 복붙하면 설치 완료 → 제품에서 호스트 등록"까지 이어지는 화면을 만든다. [[zabbix-wrapper-principle]] 부합 — Zabbix가 못 해주는 것(우리 서버 정보가 박힌 맞춤 안내, 문의 방지)만 메꾼다.
- 방향 확정(사용자, 2026-08-24): **A안 — 다운로드 링크 + 반입 가이드로 폐쇄망 지원.** 패키지 셀프호스팅(B안)은 설치 번들 작업과 묶어 2차.

---

## 1. 목표 / 비목표

**목표 (1차)**
- 화면에서 OS·배포판·아키텍처·모드(온라인/폐쇄망)를 고르면 **복붙 가능한 명령 블록**을 생성한다.
- 명령에는 **우리 Zabbix 서버 주소·서버 버전에 맞는 패키지**가 미리 박혀 나온다 (고객이 `Server=`, 버전, 아키텍처를 고민할 일 없음).
- 폐쇄망: **정확한 파일 다운로드 URL**(관리자 PC에서 받아 반입) + 반입 후 설치 절차.
- 설치 확인(서비스 상태·10050 방화벽) → **호스트 등록 화면으로 연결**되는 완결 흐름.

**비목표 (2차 이후로 명시적으로 미룸)**
- B안: 제품 서버가 패키지 파일 직접 호스팅 (설치 번들 자체가 전무 — [[architecture-onprem-scaleout-audit]] — 번들 만들 때 같이)
- Zabbix autoregistration 액션 자동 구성 (설치만 하면 자동 편입)
- PSK/TLS 암호화 설정 (MSI `ENABLEPSK` 등 파라미터 존재 확인됨 — 확장 여지 있음)
- Zabbix Proxy 경유 구성, Debian·SUSE·raspbian 등 추가 배포판

---

## 2. 실측 사실 (2026-08-24)

| 항목 | 값 | 출처 |
|---|---|---|
| dev Zabbix 서버 버전 | **7.0.6** | `apiinfo.version` 실호출 (dmove.co.kr, 무인증) |
| repo.zabbix.com 버전 디렉토리 | 1.8 ~ **8.0** 존재 | 디렉토리 리스팅 |
| 7.0 LTS 최신 패치 | 7.0.29 (2026-08-03) | cdn.zabbix.com binaries |
| RHEL rpm 패턴 | `zabbix-agent2-{ver}-release{N}.el{8,9}.x86_64.rpm` / release 패키지 `zabbix-release-latest-7.0.el9.noarch.rpm` | repo 리스팅 |
| Ubuntu deb 패턴 | `zabbix-agent2_{ver}-1+ubuntu{20.04,22.04,24.04}_amd64.deb` / release `zabbix-release_latest_7.0+ubuntu{V}_all.deb` | repo 리스팅 |
| Windows MSI | `zabbix_agent2-{ver}-windows-amd64-openssl.msi`, `msiexec /qn SERVER= SERVERACTIVE= HOSTNAME=` 무인 설치 지원 | cdn + 공식 문서 |
| macOS pkg | **arm64만 존재**(7.0.29 기준, Intel 없음), **agent2 없음(구형 agent만)**. conf `/usr/local/etc/zabbix/zabbix_agentd.conf`, launchd `com.zabbix.zabbix_agentd` | cdn + 공식 문서 |

🔴 **URL 생성 핵심 트릭 — 에이전트 버전 = 서버 풀버전.** `apiinfo.version`이 주는 풀버전(예 7.0.6)으로 패키지 URL을 만들면 그 버전 디렉토리는 반드시 존재한다(서버가 릴리즈됐으니). 최신 패치를 추측하는 것보다 안전하고, 서버≥에이전트 호환 권고와도 부합.

🔴 rpm 파일명의 `release{N}`은 버전마다 다르다(대부분 `release1`, 가끔 `release2`). deb는 `-1+`이 일관적. → 폐쇄망 rpm 링크는 `release1` 기본 생성 + **디렉토리 리스팅 링크를 항상 병기**(파일이 없으면 디렉토리에서 클릭).

---

## 3. UX 설계

### 3.1 화면 형태: 전용 페이지 (마법사 아님, 한 페이지 세로 흐름)

라우트: **`/zabbix-management/agent-install-guide`** (adminOnly)

- 🔴 `/zabbix-management/host-management/agent-guide`로 하지 않는다 — `/host-management/:hostid` 동적 라우트와 이웃이 되어 매칭 순서에 의존하게 됨. 형제 경로로 원천 차단.
- 페이지 선택 상태(os, mode)는 **URL query state** (`?os=rhel9&mode=offline`) — [[fe-page-remount-on-navigate]] (navigate마다 페이지 리마운트, 로컬 useState는 소실됨).

### 3.2 페이지 구성 (세로 5단계, 한 화면)

```
① 대상 선택
   [OS 세그먼트] Linux(RHEL 계열) | Linux(Ubuntu) | Windows | macOS
   [하위 선택]  RHEL: el8/el9 · Ubuntu: 20.04/22.04/24.04 · Windows: amd64 고정 · macOS: Apple Silicon 고정
   [모드 토글]  온라인(인터넷 가능) | 폐쇄망(인터넷 불가)

② 연결 정보 확인
   Zabbix 서버 주소 [입력 필드, 기본값 자동] ⓘ 에이전트가 접속할 주소입니다. 도메인/프록시 구성이면 실제 수신 주소로 수정하세요.
   호스트 이름     [입력 필드]              ⓘ 이후 호스트 등록 시 같은 이름을 사용해야 합니다(액티브 체크 매칭).

③ 설치
   (모드·OS에 따른 명령 블록 — §4 템플릿. 폐쇄망이면 다운로드 링크 + 반입 안내 선행)

④ 설정 · 기동 · 확인
   (conf 수정 sed → 서비스 기동 → 상태 확인 → 방화벽 10050 오픈)

⑤ 제품에 등록
   체크리스트(서비스 running, 10050 리슨) + [호스트 등록으로 이동] 버튼
   → /zabbix-management/host-management?tab=host (등록 폼에서 이름=②의 호스트 이름, IP=서버 IP 안내 문구)
```

- 모든 명령 블록에 값이 실시간 치환됨 — ②에서 주소/호스트명 바꾸면 ③④ 블록 갱신.
- 호스트 이름 미입력 시: 명령 블록에 `{호스트이름}` 플레이스홀더 강조 + 복사 시 경고 토스트(막지는 않음).

### 3.3 진입점 (3곳)

1. **호스트 관리 탭 버튼** — `HostTab.tsx:478-484` `DmoveTableFilter`의 `button` 슬롯. 기존 "호스트 등록" primary 옆에 default 버튼 "에이전트 설치 가이드" (`<Space>`로 감싸 나란히).
2. **등록 결과 화면의 트러블슈팅** — `HostCreateResultStep.tsx:81-89`. livecheck에서 `agent.state === "unavailable"`일 때 이미 뜨는 경고 Alert의 `action`으로 "설치 가이드 보기" 버튼. **가장 문맥이 맞는 진입점.**
3. **페이지 도움말** — `page-guide.ts` ENTRIES에 이 페이지 자체의 가이드 추가 (기존 도움말 축과 결 맞춤).

설정 메뉴(⚙ `SETTINGS_ENTRIES`)에는 넣지 않는다 — 설정이 아니라 작업 가이드이고, 호스트 등록 문맥에 붙는 게 맞다.

### 3.4 연결 정보 기본값 (BE 무수정으로 해결)

| 값 | 출처 | 비고 |
|---|---|---|
| Zabbix 서버 주소 기본값 | `GET /settings/zabbix` → `value.url`에서 **호스트만 추출** (예 `https://dmove.co.kr/zabbix/api_jsonrpc.php` → `dmove.co.kr`) | 기존 EP·FE 훅(`setting.api.ts getZabbixInfoDetail`) 재사용. 비밀값은 이미 마스킹됨 |
| Zabbix 서버 버전 | `GET /home/system-status` → `dataSources[].detail` (HealthPort.check()가 `apiinfo.version` 결과를 detail에 실음, Redis 30s 캐시) | ⚠️ detail이 순수 버전 문자열인지 구현 시 실측(§8-1). 파싱 실패 시 폴백 `7.0` + "버전 자동 감지 실패" 안내 배너 |

🔴 **API URL 호스트 ≠ 에이전트 수신 주소일 수 있다** (웹 프론트가 프록시 뒤일 때). 그래서 자동 기본값 + **편집 가능 필드 + 안내문**이 설계의 일부다. 기본값을 진실로 강제하지 않는다.

→ **1차 BE 코드 수정 0.** 신규 EP는 §8-1 실측이 어긋날 때만 (그 경우 `GET /zabbix-manage/agent-guide/context` `{zabbixVersion, suggestedServerHost}` 신설, HealthPort 경유 — app이 engine-zabbix 직접 참조 금지 원칙 준수).

---

## 4. 명령 템플릿 사양 (생성 로직의 정본)

치환 변수: `{VER}`=서버 풀버전(7.0.6), `{MAJOR}`=7.0, `{SERVER}`=②주소, `{HOSTNAME}`=②호스트명, `{EL}`=8|9, `{UBU}`=20.04|22.04|24.04

### 4.1 Linux — RHEL 계열 (agent2)

**온라인**
```bash
sudo rpm -Uvh https://repo.zabbix.com/zabbix/{MAJOR}/rhel/{EL}/x86_64/zabbix-release-latest-{MAJOR}.el{EL}.noarch.rpm
sudo dnf clean all
sudo dnf install -y zabbix-agent2
```

**폐쇄망** — 아래 링크를 인터넷 가능한 PC에서 받아 서버로 반입:
- 파일: `https://repo.zabbix.com/zabbix/{MAJOR}/rhel/{EL}/x86_64/zabbix-agent2-{VER}-release1.el{EL}.x86_64.rpm`
- (링크가 404면) 목록에서 선택: `https://repo.zabbix.com/zabbix/{MAJOR}/rhel/{EL}/x86_64/` — `zabbix-agent2-{VER}-…` 파일
```bash
sudo rpm -ivh zabbix-agent2-*.rpm
```
(agent2는 Go 정적 빌드에 가까워 표준 시스템 라이브러리 외 의존성이 없음 — 오프라인 rpm 단독 설치 통과)

**공통: 설정·기동·확인·방화벽**
```bash
sudo sed -i -e 's/^Server=.*/Server={SERVER}/' \
            -e 's/^ServerActive=.*/ServerActive={SERVER}/' \
            -e 's/^Hostname=.*/Hostname={HOSTNAME}/' /etc/zabbix/zabbix_agent2.conf
sudo systemctl enable --now zabbix-agent2
systemctl status zabbix-agent2 --no-pager
```
```bash
sudo firewall-cmd --permanent --add-port=10050/tcp && sudo firewall-cmd --reload
```

### 4.2 Linux — Ubuntu (agent2)

**온라인**
```bash
wget https://repo.zabbix.com/zabbix/{MAJOR}/ubuntu/pool/main/z/zabbix-release/zabbix-release_latest_{MAJOR}+ubuntu{UBU}_all.deb
sudo dpkg -i zabbix-release_latest_{MAJOR}+ubuntu{UBU}_all.deb
sudo apt update
sudo apt install -y zabbix-agent2
```

**폐쇄망**
- 파일: `https://repo.zabbix.com/zabbix/{MAJOR}/ubuntu/pool/main/z/zabbix/zabbix-agent2_{VER}-1+ubuntu{UBU}_amd64.deb`
- 폴백 목록: `https://repo.zabbix.com/zabbix/{MAJOR}/ubuntu/pool/main/z/zabbix/`
```bash
sudo dpkg -i zabbix-agent2_*.deb
```

**공통**: 4.1과 동일 sed(`/etc/zabbix/zabbix_agent2.conf`) + `systemctl enable --now zabbix-agent2` + `sudo ufw allow 10050/tcp`

### 4.3 Windows (agent2 MSI, amd64) — 관리자 PowerShell

**온라인**
```powershell
Invoke-WebRequest -Uri "https://cdn.zabbix.com/zabbix/binaries/stable/{MAJOR}/{VER}/zabbix_agent2-{VER}-windows-amd64-openssl.msi" -OutFile "$env:TEMP\zabbix_agent2.msi"
msiexec /i "$env:TEMP\zabbix_agent2.msi" /qn SERVER={SERVER} SERVERACTIVE={SERVER} HOSTNAME={HOSTNAME}
```

**폐쇄망** — MSI 파일 링크만 주고 반입 후 `msiexec` 줄만 실행.

**확인**
```powershell
Get-Service "Zabbix Agent 2"
```
⚠️ MSI의 방화벽 규칙 자동 추가 여부는 구현 시 확인(§8-2). 미추가면 `netsh advfirewall firewall add rule name="Zabbix Agent" dir=in action=allow protocol=TCP localport=10050` 병기.

### 4.4 macOS (구형 agent, Apple Silicon 한정) — 2순위 지원

화면에 명시: *"Apple Silicon(M1 이후) 전용. Intel Mac용 공식 패키지는 제공되지 않습니다."*
```bash
curl -O https://cdn.zabbix.com/zabbix/binaries/stable/{MAJOR}/{VER}/zabbix_agent-{VER}-macos-arm64-openssl.pkg
sudo installer -pkg zabbix_agent-{VER}-macos-arm64-openssl.pkg -target /
sudo sed -i '' -e 's/^Server=.*/Server={SERVER}/' \
               -e 's/^ServerActive=.*/ServerActive={SERVER}/' \
               -e 's/^Hostname=.*/Hostname={HOSTNAME}/' /usr/local/etc/zabbix/zabbix_agentd.conf
sudo launchctl kickstart -k system/com.zabbix.zabbix_agentd
```
폐쇄망: pkg 링크 반입 후 동일. (macOS conf 기본값에 해당 라인이 주석(`# Server=`)일 가능성 — 구현 시 sed 패턴을 주석 포함형으로 검증, §8-3)

---

## 5. FE 구현 설계

**신규 파일**
| 파일 | 내용 |
|---|---|
| `src/pages/zabbix-management/agent-install-guide/AgentInstallGuidePage.tsx` | 페이지 본체 (5단계 세로 흐름) |
| `src/pages/zabbix-management/agent-install-guide/commandTemplates.ts` | §4 템플릿의 코드 정본 — 순수 함수 `(ctx) => CommandSection[]`, **UI 무관·단위테스트 대상** |
| `src/components/CommandBlock/CommandBlock.tsx` | 멀티라인 명령 표시 + 복사 버튼 공용 컴포넌트 (기존에 없음 — antd `Paragraph copyable`은 한 줄용. `navigator.clipboard.writeText` + 실패 폴백) |
| `src/hooks/useAgentGuideContext.ts` | `getZabbixInfoDetail` + `getSystemStatus` 조합 → `{serverHost, version, versionDetected}` |

**수정 파일**
- `src/constants/routes.ts` — `PATH_ZABBIX_MANAGEMENT.agentInstallGuide`
- `src/routes/routes.tsx` — 라우트 추가 (`adminOnly`). 🔴 절대경로 자식 라우트를 부모 블록에 넣으면 앱 전체가 안 뜸([[design-system-and-help]]) — 형제 라우트로.
- `HostTab.tsx` — 버튼 추가 (진입점 1)
- `HostCreateResultStep.tsx` — Alert action 추가 (진입점 2)
- `src/constants/page-guide.ts` + `locales/kr.json`·`en.json` — 도움말 엔트리·`agent_install_guide.*` 네임스페이스 (파일은 `kr.json`이지 `ko` 아님)

**스타일**: 명령 블록 다크모드 — 팔레트 토큰 사용, 하드코딩 색 금지.

**테스트**: `commandTemplates.ts` 단위테스트가 본체 — OS×모드 전 조합의 URL·sed 라인 스냅샷 + 치환 누락(`{` 잔존) 검사. 실행은 `npx jest`.

---

## 6. 폐쇄망 흐름 상세 (A안)

1. 화면에서 "폐쇄망" 토글 → 설치 명령 대신 **다운로드 카드**: 정확한 파일 URL(복사 버튼) + 404 대비 디렉토리 폴백 링크 + 파일명 확인 문구(아키텍처·버전).
2. 반입 안내 한 단락: "인터넷이 가능한 PC에서 위 파일을 받아 USB/파일서버 등 사내 절차로 대상 서버에 복사하세요."
3. 이후 설치·설정·기동·확인 명령은 온라인과 동일 블록 재사용 (설치 줄만 `rpm -ivh`/`dpkg -i`/`msiexec`/`installer`).
4. Windows·macOS는 원래 단일 파일이라 온라인/폐쇄망 차이가 다운로드 방법뿐 — 템플릿 공유.

---

## 7. QA 계획

- **정적**: `commandTemplates` 단위테스트(위) + lint/빌드.
- **URL 실재성**: 전 조합(rhel{8,9} rpm/release, ubuntu{3종} deb/release, windows msi, macos pkg — 서버 버전 7.0.6 기준 약 12개)을 HEAD 요청으로 200 확인하는 일회성 스크립트(스크래치패드). 이게 이 기능의 실질 QA 핵심.
- **functional-qa**: 페이지 렌더, OS/모드 전환 시 블록 갱신, 복사 동작, 진입점 2곳 내비게이션, query state 유지(새로고침).
- **실서버 설치 검증**: VM 1대(가능하면 Ubuntu)에서 생성된 명령 그대로 완주 → 호스트 등록 → livecheck agent available 확인. 환경 없으면 사용자에게 수동 검증 요청으로 이관.

## 8. 구현 시 확인 항목 (착수 첫 단계)

1. `GET /home/system-status` `dataSources[].detail`이 순수 버전 문자열("7.0.6")인지 실측 — 아니면 신규 컨텍스트 EP(§3.4)로 전환.
2. Windows MSI가 방화벽 인바운드 규칙을 자동 추가하는지.
3. macOS: {VER}(7.0.6) 시점 pkg에 amd64가 있는지(7.0.29는 arm64만) / conf 기본값의 `Server=` 라인이 주석인지.
4. `HostCreateResultStep`의 Alert `action` prop 수용 형태.

## 9. 구현 결과 (2026-08-24 — §8 확인 항목 전건 해소)

| §8 항목 | 결과 |
|---|---|
| 1. system-status `detail` 포맷 | ✅ 실측 확정 — `{type:"zabbix", status:"UP", detail:"7.0.6", endpoint:"https://dmove.co.kr"}` (로그인 후 curl). 코드도 확인: `ZabbixHealthAdapter.version()`이 순수 버전 문자열만 detail에 싣는다(형식 이탈 시 null). 신규 BE EP 불필요 확정 |
| 2. Windows MSI 방화벽 | 확인 회피로 해소 — "방화벽 허용(사용 시)" 단계로 `netsh advfirewall` 명령을 항상 병기(안 쓰면 무시하면 되는 안내) |
| 3. macOS amd64 / conf 주석 | 7.0.6엔 pkg 자체가 없음(macos amd64 tar.gz만) → **`{major}-latest` arm64 pkg 별칭 채택**. Hostname 주석 가능성은 Linux/macOS 공통으로 `grep -q '^Hostname=' \|\| tee -a` append 보강으로 해소 |
| 4. HostCreateResultStep Alert | `action` prop 지원 확인, 버튼 추가 완료 |

**🔴 핵심 발견 — CDN `{major}/latest/` 별칭**: `zabbix_agent2-7.0-latest-windows-amd64-openssl.msi`처럼 major만으로 조립되는 안정 URL이 공식 제공된다(디렉토리 리스팅 실측). Windows/macOS는 전부 이걸 쓴다. 같은 major면 서버-에이전트 호환.

**산출물**: FE 신규 4(AgentInstallGuidePage·commandTemplates·CommandBlock·useAgentGuideContext) + 수정 7(routes.ts/routes.tsx/HostTab/HostCreateResultStep/page-guide/queryKey/i18n 2종) + 테스트 16건(`agent-install-guide.test.ts`). tsc 클린, ESLint 클린, 전체 스위트 1098 pass(선재 실패 1: AiAssistantPage URL 미러링 — 본 변경과 접점 0). 브라우저 렌더는 Chrome 확장 미연결로 미검증.

## 10. 2차 로드맵 (기록만)

- **B안 셀프호스팅**: 설치 번들에 패키지 동봉 + BE 정적 서빙 → 폐쇄망에서 `curl -O http://<제품서버>/agent-packages/...` 한 줄. 링크 생성부만 교체하면 되도록 `commandTemplates.ts`에서 **URL 생성을 별도 함수로 분리**해 둔다. 재배포 라이선스(GPL/AGPL 소스 고지) 검토 필요.
- autoregistration 액션 자동 구성, PSK 암호화, Debian/SUSE, Proxy 경유.
