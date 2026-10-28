---
type: reference
tags: [moveseye, zabbix, nexentire, manual, operations, reference, dmove]
created: 2026-06-05
updated: 2026-06-05
source: "[디무브] Zabbix 관리자 매뉴얼 (넥센타이어).pdf (44p, ZBX 7.0)"
---

# Zabbix 관리자 매뉴얼 (넥센타이어) — 정리

> DMOVE가 넥센타이어에 제공한 **Zabbix 7.0 관리자 운영 매뉴얼**(44p PDF) 정리본.
> [[projects/moveseye/moveseye|moveseye]] (MovesEye)가 프록시·시각화하는 **원천 시스템(Zabbix)** 의 운영 관점 지식. 화면 조작 절차 + 넥센타이어 특화 환경(프록시/알림/스크립트)을 담는다.
> 관련: [[projects/moveseye/moveseye-overview|moveseye-overview]] · [[projects/moveseye/2026-06-02-zabbix-sync-audit|2026-06-02-zabbix-sync-audit]] · [[projects/moveseye/host-group-feature/README|호스트그룹 기능]]

---

## 0. 개요 — Zabbix란
- 수천 대 서버·VM·네트워크 장비에서 수백만 메트릭을 실시간 수집·분석·시각화하는 오픈소스 모니터링 엔진. 손쉽게 확장 가능.
- 핵심 기능: **메트릭 수집 / 문제 감지 / 다채널 알림 / 데이터 시각화 / 통합 / 확장성**.

### 아키텍처 4요소
| 구성요소 | 역할 |
|---------|------|
| **SERVER** | 모니터링 수행의 중심. 프록시·에이전트와 상호작용, 트리거 계산, 알림 발송, 데이터 중앙 저장. 모든 구성/통계/운영 데이터를 보관하고 문제 발생 시 관리자에게 즉시 알림. |
| **PROXY** | 서버 대신 성능·가용성 데이터를 수집하고 수집 부하를 자체 처리하여 **서버를 오프로드**. 분산 모니터링을 중앙화·관리. |
| **AGENT** | 모니터링 대상에 배포되는 프로세스. 로컬 리소스(스토리지/메모리/프로세서 등)와 애플리케이션을 모니터링해 데이터를 서버에 보고. |
| **DB** | 수집 데이터·구성 정보·트리거·이벤트·알림 기록 등을 저장. |

### 핵심 객체 관계
- **호스트(Host)**: 모니터링 대상 장비/애플리케이션.
- **호스트 그룹(Host Group)**: 유사 성격 호스트의 묶음.
- **유저(User)**: Zabbix 로그인 계정.
- **유저 그룹(User Group)**: 유사 역할 사용자의 묶음.
- ⚠️ **권한은 「호스트 그룹 ↔ 사용자 그룹」 관계로 설정**된다. (MovesEye 권한 모델의 근간 — [[projects/moveseye/moveseye-overview|moveseye-overview]] 참고)

---

## 1. 접속 / 메뉴

### 로그인 (넥센타이어 환경)
- 주소: **`https://zabbix.nexentire.com`**
- 계정 발급/접근 이슈는 관리자에게 요청 → **DMOVE 서비스데스크 / support@dmove.kr**
- 브라우저 캐시로 인증정보 저장 → UI 편의 접근.

### 메뉴 — 일반 사용자 (Monitoring 영역)
- **대시보드**: 접근 가능한 대시보드 화면.
- 장애 이력 / 호스트별 현황 / 최근 데이터 현황 / 맵 UI.
- **장애 태그 중심 서비스 모니터링** 구성·현황 확인.
- 인벤토리 필드별 조회.
- Zabbix 내장(Built-in) 레포트 기능.

### 메뉴 — 관리자 (Data collection / 설정 영역)
- 트리거 해결 시 조건에 따라 **관련 장애 자동 해소**.
- **Maintenance(메인터넌스) 모드** 등록 — 해당 기간 장애 미탐지.
- 모니터링 **호스트** 등록.
- 모니터링 아이템 묶음인 **템플릿** 등록·관리.
- **호스트 그룹 / 템플릿 그룹** 생성·관리.
- 호스트 **자동 탐색(Discovery)** 기능.
- **Scripts** 실행 명령어 등록.
- 알림 발송 **매개체(Media type)** 등록 + 카테고리별 동작 설정·관리.

---

## 2. 모니터링 호스트 등록

### Host Group 생성
1. 좌측 내비 **Data collection → Host groups** → 우측 상단 "호스트 그룹 생성".
2. 팝업에 그룹 이름 입력 → 생성. 초록 알림이 뜨면 완료, 필터로 확인.
3. (대안) 호스트 편집 화면의 호스트 그룹 공란에 **기존에 없는 값을 타이핑하면 새 그룹이 즉석 추가**된다.
- ⚠️ **호스트 등록 시 호스트 그룹은 필수**. 등록 전에 적절한 그룹을 미리 만들거나 기존 그룹을 사용해야 함.

### Host에 Host Group 연결
- 기존 호스트: 호스트 그룹 변경 가능. 남은 값은 **X 클릭으로 삭제** 후 새로 추가.
- 새 호스트: 공란에 직접 타이핑하거나 "선택" 클릭으로 추가.

### Host 추가 — 탭별 설정
**① Host 탭** (좌측 내비 Data collection → Hosts → 호스트 생성)

| 항목 | 설명 | 필수 |
|------|------|:---:|
| **Host name** | 에이전트 서버의 `zabbix_agent.conf` 의 `Hostname` 과 동일하게 입력 | ✅ |
| **Visible name** | 표시명(다른 이름 쓰고 싶을 때). 공란 시 Host name이 기본값 | |
| **Templates** | 호스트가 사용할 템플릿 설정 | |
| **Host groups** | 호스트 그룹 설정 | ✅ |
| **Interfaces** | 관제할 인터페이스 정보 | |
| **Proxy** | 감시용 서버에 프록시 설정. Zabbix상 필수는 아니나 **에이전트가 프록시를 바라보도록 설정되어 있어 실질적으로 필수** | ✅(실질) |

- 🔑 **넥센타이어 프록시 선택 규칙 (네트워크 대역 기준)**:
  - 마곡 대역 → **`mahok-pxy`**
  - 창녕 대역 → **`cp-pxy`**
  - 양평 대역 → **`yp-pxy`**

**② Tag 탭**: 태그 설정 (예: 서버 OS 등록).

**③ Macro 탭**: 변수값을 설정해 아이템/스크립트에서 커스텀 값 사용.
- `Host macros`: 호스트 개별 설정값.
- `Inherited and host macros`: 템플릿에서 설정한 매크로를 계승.
- ⚠️ 같은 매크로를 `Host macros`에 선언하면 **호스트 값이 우선** 적용.

**④ Inventory 탭**: 호스트 정보 기록란. Manual/Automatic 모드. **현재 구축 시스템은 Automatic(자동)** 으로 관리.

### Template 적용 / 링크 삭제
- 적용: 템플릿 그룹 선택(또는 키워드) → 템플릿 검색·클릭. 템플릿 공란에 키워드 직접 입력도 가능.
- 삭제: 호스트에 적용된 템플릿 링크 제거 시 **`Unlink and clear`** — ⚠️ 호스트 내 해당 템플릿의 **아이템·데이터가 모두 삭제**됨.

---

## 3. 데이터 수집

### 에이전트 수집 방식
| 방식 | 동작 | 포트 |
|------|------|------|
| **Active** | 에이전트 → 서버로 템플릿에 맞는 데이터 **전송** | **10051** |
| **Passive** | 서버 → 에이전트에 템플릿에 맞는 데이터 **요청** | **10050** |

### Item 생성
> Host: Data collection → Hosts / Template: Data collection → Template 에서 생성.

- **Name**: 아이템 이름
- **Type**: 데이터 수집 유형
- **Key**: 수집 식별자 (호스트 내 고유)
- **Type of information**: 데이터 유형 (unsigned / float / character / log / text)
- **Host Interface**: 수집 대상
- **Units**: 단위 (%, B, bps 등)
- **Update Interval**: 수집 주기

### Trigger 생성
- **Name**: 트리거 이름
- **Event name**: 장애 발생 시 표시될 이름
- **Operational data**: 장애 발생 시 조회된 데이터
- **Severity**: 장애 심각도
- **Expression**: 트리거 조건문 (장애 발생 조건)
- **OK event generation / Recovery expression**: 해결 조건문

---

## 4. 장애 시 활동 (Problems)

### 장애 확인 — 보기 모드
좌측 **Monitoring → Problems** 에서 서버·장비 장애 목록 확인.
- **Recent problems**: 미해결 + 최근 해결(해결 후 5분 표시).
- **Problems**: 미해결만.
- **History**: 모든 문제. 선택 시 우측 상단 **기간 설정** 활성화, 좌측 상단 깔대기 아이콘으로 필터 화면 복귀.

### 필터 옵션
- **Host groups / Hosts / Triggers / Problem**: 그룹·호스트·트리거명·장애명으로 필터(체크박스 다중 선택). 인라인 검색은 Global 단일 선택.
- **Severity**: 심각도별 필터.
- **Age less than**: 현재로부터 N일 이전까지.
- **Show symptoms**: 연관 문제 함께 확인.
- **Show suppressed problems**: 숨김 처리된 문제 표시.
- **Acknowledgement status**: 확인(ack) 여부로 필터.
- **Host inventory**: 인벤토리 값 필터.
- **Tags**: 트리거 태그값으로 다양한 옵션 필터.
- **Show tags / Tag name / Tag display priority**: 표시 태그 개수·축약·우선순위(특정 key 먼저 표시) 설정.
- **Show operational data**: `Separately`(별도 열) / `With problem name`(Problem 열에 함께).

### 표시 형태
- 기본 화면 / **Compact view**(압축) / **Show details**(상세).

### 알림 중지 — Maintenance
- **Name**: Maintenance 이름.
- **Maintenance type**:
  - `With data collection`: 데이터 수집 **유지**.
  - `No data collection`: 데이터 수집 **중지**.
- **Active since / Active till**: 활성화 일자.
- **Periods**: 실제 적용 주기/기간.
- **Host groups / Hosts / Tags**: 적용 범위.

---

## 5. 주요 커스텀 내용 및 가이드 (넥센타이어 특화)

### 임계치 수정 — Host
1. Data collection → Hosts → 호스트 이름 선택 → Host 편집.
2. 임계치 수정이 필요한 Trigger의 **조건문(Expression)** 확인.
3. Host 편집 화면 **Macros** 선택 → Trigger에 설정된 **매크로 value 수정**.

### 임계치 수정 — Template
1. Data collection → Template → 템플릿 이름 선택 → 편집.
2. Template의 Trigger 중 수정 대상의 조건문 확인.
3. Template 편집 화면 **Macros** 선택 → 매크로 value 수정.
- 💡 Host 매크로는 개별, Template 매크로는 **연결된 모든 호스트에 일괄** 영향(계승). 위 §2 Macro 우선순위 규칙과 함께 이해.

### Scripts — Service Port 관제
1. 좌측 **Monitoring → Hosts** 에서 포트 관제가 필요한 호스트 검색.
2. 해당 호스트 **Macro에 포트 번호 추가**.
3. **Script 실행**.

### 알람 발송 토픽 추가 (Jandi 연동)
> 새 알림 토픽방을 추가하는 절차. (예: 카테고리 `ai`)

1. **템플릿 복제**: 메인 템플릿을 복제해 토픽방 카테고리 이름으로 수정.
   - `Windows by Zabbix agent active – main` → `… – ai`
   - `Linux by Zabbix agent active – main` → `… – ai`
2. **트리거 수정**:
   - `SMS: server` 태그가 추가된 트리거에 **토픽 이름 추가** (예: `SMS: ai`).
   - Discovery의 Mounted filesystem 관련 **Trigger prototypes** 확인 후 추가.
3. **Jandi 토픽방 Webhook URL 추가** (Zabbix server 터미널):
   - `vi /usr/lib/zabbix/alertscripts/jandi.topic.properties`
   - 형식: `ai=https://wh.jandi.com/connect-api/webhook/<토픽방url>`
4. **같은 이름의 사용자 추가** (예: Username `ai`) → 사용자 **Media에 담당자 번호 추가**(문자 발송용).

### 스크립트 경로 (Zabbix Server)
**알림 스크립트** — `/usr/lib/zabbix/alertscripts`
- `alert.db.properties` — 알림 발송 내역 저장 DB 정보
- `jandi.topic.properties` — Jandi topic 정보
- `sms.db.properties` — SMS 발송 DB 정보
- `jandi-send-alert.py` — 알림 발송 스크립트

**네트워크 설정 백업 (Show run, 일자별 최신)** — `/usr/lib/zabbix/externalscripts`
- `cisco_backup.sh`, `show_run_backup.sh` — 네트워크 설정 백업
- `cleanup_show_run.sh` — 백업 파일 일별 최신화

**Service port 아이템·트리거 생성** — `/usr/lib/zabbix/externalscripts`
- `port_item_create_new.py`

**Syslog 관리 (2년 주기 삭제 + 파일명 IP→Hostname)** — `/usr/local/sbin`
- `cisco-log-rotate-by-date.sh` — syslog 2년 주기 삭제
- `discover_cisco_logs.sh` — syslog 파일명 HOSTNAME 변환

**API 속성 파일** — `/etc/zabbix`
- `api.env` — Zabbix 값 조회용 API url·token

**코드 백업 경로**
- `/usr/lib/zabbix/code_backup` — 테스트·이전 코드 히스토리 백업

---

## MovesEye 연결 포인트 (왜 이 매뉴얼이 중요한가)
- MovesEye는 이 Zabbix(넥센)의 **Host / Host Group / Item / Trigger / Problem** 객체를 JSON-RPC로 가져와 시각화한다 → 매뉴얼의 객체 모델이 곧 MovesEye 도메인 모델.
- **권한 모델**: Zabbix의 「호스트 그룹 ↔ 사용자 그룹」 관계가 MovesEye 접근제어의 근간 ([[projects/moveseye/moveseye-overview|moveseye-overview]] 미검증 항목).
- **Active/Passive·프록시 구조**(mahok/cp/yp-pxy)는 호스트 동기화·상태 해석 시 참고 ([[projects/moveseye/2026-06-02-zabbix-sync-audit|2026-06-02-zabbix-sync-audit]]).
- **Trigger/Severity/Tag** 구조는 호스트 그룹 안전도 계산·장애 분류 로직과 직결 ([[projects/moveseye/host-group-feature/README|호스트그룹]] · safety-logic).
- **알림 파이프라인**(Jandi/SMS, alertscripts)은 MovesEye 이벤트·알림 기능의 백엔드 실체.
