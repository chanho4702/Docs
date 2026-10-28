# MovesEye 개발 설계 — 자빅스 관리 > 구성 현황 대시보드 & 도메인 KPI

> 작성 2026-08-26 · Claude · **v1.1 — 구현 완료분 반영**(§11에 구현 중 뒤집힌 결정) · 티켓 **ZM-118**
> 🔒 **격리 작업**(사용자: "다른 세션에서 큰 작업 중이니까 안 겹치게"): 레포별 git worktree
> `C:\worktrees\zm-118-be`(브랜치 `ZM-118`, base `3a33131`) · `C:\worktrees\zm-118-fe`(`ZM-118`, base `72c531b`).
> 런타임 **BE :3002 / FE :5175** (메인 :3000/:5173은 다른 세션, ZM-116은 :3001/:5174 사용 중).
> 메인 체크아웃(`C:\solutions\moveseye-be-spring`·`moveseyee_fe`)에는 **쓰지 않는다**.
> 관련 설계: [design_drilldown-restructure.md](solutions--%EC%84%A4%EA%B3%84-Zabbix-%EA%B4%80%EB%A6%AC-%EC%99%84%EC%A0%84-%EC%BB%A8%ED%85%8C%EC%9D%B4%EB%84%88-%EB%93%9C%EB%A6%B4%EB%8B%A4%EC%9A%B4-%EC%9E%AC%EA%B5%AC%EC%84%B1-%28A%EC%95%88-B%EC%95%88-%ED%9B%84%EA%B3%84%29.md)(호스트/템플릿 드릴다운) ·
> [design_propagation-lens.md](solutions--%EC%84%A4%EA%B3%84-%EC%A0%84%ED%8C%8C%28propagation%29-%EA%B0%80%EC%8B%9C%EC%84%B1-%EC%97%94%ED%8B%B0%ED%8B%B0-%EB%A0%8C%EC%A6%88-%28%EB%93%9C%EB%A6%B4%EB%8B%A4%EC%9A%B4-A%EC%95%88-%EC%9C%84-%EC%A6%9D%EB%B6%84%29.md)(아이템·트리거 렌즈) ·
> [devdesign_alert-management.md](solutions--%EA%B0%9C%EB%B0%9C-%EC%84%A4%EA%B3%84%EC%84%9C-%EC%95%8C%EB%A6%BC-%EA%B4%80%EB%A6%AC-%28Zabbix-%EC%95%A1%EC%85%98-%EB%AF%B8%EB%94%94%EC%96%B4-%ED%83%80%EC%9E%85%29.md)(알림 관리) ·
> [devdesign_asset-dashboard.md](solutions--MovesEye-%EA%B0%9C%EB%B0%9C-%EC%84%A4%EA%B3%84-%EC%9E%90%EC%82%B0-%EA%B4%80%EB%A6%AC-%EC%9E%90%EC%82%B0-%ED%98%84%ED%99%A9-%EB%8C%80%EC%8B%9C%EB%B3%B4%EB%93%9C-%28Asset-Overview-Dashboard%29.md)(자산 현황 — **형제 화면, 경계는 §0.3**)
> 데이터 실측: dev 프로필 :3000 BE 경유 실 Zabbix, 2026-08-26 (§1)

---

## 🎯 이 화면의 목적

> **관리자가 "우리 Zabbix에 무엇이 얼마나 만들어져 있고, 그게 어디에 붙어 있으며, 지금 제대로 연결·동작하는가"를 차트로 답하게 한다.**

자빅스 관리 메뉴에는 지금 **9개의 목록 화면**이 있다. 전부 "찾아서 고치는" 화면이고, **"전체가 어떤 상태인가"를 보여주는 화면이 하나도 없다.**
관리자는 호스트 관리에 들어가 76행짜리 표를 스크롤하며 "에이전트 빨간 게 몇 개더라"를 세고 있다.

이 설계는 그 공백을 두 층으로 메운다.

| 층 | 무엇 | 어디 |
|---|---|---|
| **① 통합 대시보드** | 전 도메인 크로스 뷰 — 도메인 간 비교, 감시 파이프라인, 전역 작업 큐 | 자빅스 관리 메뉴 **맨 앞** 신규 화면 `/zabbix-management/overview` |
| **② 도메인 대시보드 탭** | 그 도메인 **내부**의 분해 — 그룹별/타입별/상속별 분포 | 5개 관리 화면의 **첫 탭** |
| **③ KPI 밴드** | 목록 탭 상단 4~5개 숫자 — 지금 보고 있는 목록의 요약 | 각 목록 탭 상단 |

### 0.1 관리자가 이 화면에 와서 묻는 네 가지

| # | 질문 | 사용자 표현 | 답이 되는 축 |
|---|---|---|---|
| Q-A | **얼마나 만들어져 있나** | "이게 얼만큼 생성됐고" | 도메인별 총계 + 생성 vs **실사용** 대비 |
| Q-B | **어디에 있나** | "어디에 있고" | 호스트그룹·템플릿그룹·프록시·컨테이너(호스트 직접 vs 템플릿 상속) 분포 |
| Q-C | **연결 상태는 어떤가** | "연결상태는 어떻고" | agent available·인터페이스·템플릿 연결·아이템 수집 상태·액션↔미디어 배달 경로 |
| Q-D | **그래서 뭘 손봐야 하나** | (암묵) | 작업 큐 — 각 항목이 해당 목록의 **필터 딥링크**로 착지 |

### 0.2 🔴 모니터링 커버리지 화면과의 경계 (중복 금지)

`/zabbix-management/monitoring-coverage`가 이미 있고, `MonitoringCoverageSummaryDto`는 4가지 사각지대
(`noTemplate`·`collectingNothing`·`noTrigger`·`agentUnreachable`)를 **호스트 목록으로** 준다.

| 축 | 구성 현황(이 문서) | 모니터링 커버리지(기존) |
|---|---|---|
| **관점** | 구성물의 **분포·규모** ("22개 그룹에 76대가 이렇게 퍼져 있다") | 개별 호스트의 **결함 목록** ("이 12대가 문제다") |
| 대상 | 호스트·그룹·템플릿·아이템·트리거·액션·미디어 **전 도메인** | **호스트만** |
| 출력 | 차트 + 카운트 | 사유별 호스트 표 + AI 프롬프트 |
| 4대 사각지대 | ✅ **건수만**, 작업 큐 한 줄로 → 커버리지 화면 딥링크 | ✅ 본체(목록·해결 동선) |

> **규칙**: 구성 현황은 사각지대 **호스트 목록을 절대 그리지 않는다.** 건수를 보여주고 커버리지 화면으로 보낸다.
> 두 화면의 4대 사각지대 건수는 **같은 판정 함수**(`MonitoringCoverageService`)를 재사용해 어긋날 수 없게 한다(§6.4).

### 0.3 🔴 자산 현황 대시보드(ZM-116)와의 경계

| 축 | 구성 현황(이 문서) | 자산 현황(ZM-116) |
|---|---|---|
| **정본 데이터** | **Zabbix API 실시간** (host/template/item/trigger/action) | **우리 DB `asset` 스냅샷** + 품질 필드 |
| 세는 대상 | Zabbix **구성 오브젝트** | **자산**(Zabbix 등록분 + custom) |
| 기기분류 분포 | ✅ Zabbix 태그 `device_type` 원본 그대로 | ✅ `asset.device_type`(동기화된 사본) |
| 취득가·상각·소유자·만료 | ❌ 없음 | ✅ 본체 |
| 아이템/트리거/액션/미디어 | ✅ 본체 | ❌ 없음 |

> 두 화면 모두 "미분류 비율"을 보여주게 되는데(실측 80%), **정의가 다르다** — 여기는 *Zabbix 호스트 중* 태그 없는 비율, 저기는 *자산 레코드 중* 미분류 비율. 카드 부제에 데이터 출처를 명시해 같은 숫자로 오인하지 않게 한다.

---

## 1. 실측 (2026-08-26, dev BE :3000 경유 실 Zabbix)

> 설계의 모든 차트는 **이 표에 실제로 값이 있는 축**으로만 만들었다. "있을 법한 축"은 넣지 않는다.

### 1.1 규모

| 도메인 | 총계 | 조회 EP | 응답 |
|---|---:|---|---|
| 호스트 | **76** | `GET /hosts/manage?limit=1000` | 0.23s / 43KB |
| Zabbix 호스트그룹 | **22** | (호스트 응답의 `groups` 유니크) | — |
| DB 호스트그룹(우리 테이블) | **7** | `GET /users/host-groups` | 🔴 Zabbix 22와 **다름**(§1.4) |
| 템플릿 | **347** | `GET /zabbix-manage/templates` | 0.17s / 145KB(200건) |
| 템플릿그룹 | 12+ | (템플릿 응답의 `groups`, 200건 표본) | — |
| 아이템 | **7,891**(정의 뷰) / 11,834(호스트 `itemCount` 합) | `GET /zabbix-manage/items/lens` | 0.36s |
| 트리거 | **3,009**(정의 뷰) / 3,662(호스트 `triggerCount` 합) | `.../triggers/lens` | 0.36s |
| 액션 | **17** (트리거 11 · 디스커버리 3 · 내부 3 · 자동등록 0 · 서비스 0) | `GET /zabbix-manage/actions?eventsource=N` | 0.01s |
| 미디어 타입 | **46** (활성 11 / 비활성 35, 액션이 실제로 쓰는 것 **8**) | `GET /zabbix-manage/media-types` | 0.22s |
| 스크립트 | 6 | `GET /zabbix-manage/scripts` | 0.37s |
| 점검 기간 | **0** | `GET /zabbix-manage/maintenances` | 0.07s |
| 디스커버리 규칙(drule) | 2 | `GET /zabbix-manage/network-discovery/rules` | 0.21s |
| LLD 디스커버리 | 241(호스트 `discoveryCount` 합) | — | — |

> 🔴 **아이템 총계가 두 개다**: 렌즈 `total`(7,891)은 **정의 뷰**(LLD로 생성된 `flags=4` 제외), 호스트 `itemCount` 합(11,834)은 전부.
> 대시보드는 **둘 다 보여준다** — "정의 7,891 + 자동 생성 3,943"이 곧 LLD가 얼마나 일하고 있는지의 답이다. 한 숫자만 쓰면 반드시 "표랑 수가 다르다" 문의가 온다.

### 1.2 호스트 상태 분포 — 🔴 이 대시보드의 최대 발견

| 축 | 값 |
|---|---|
| `status` | 활성 74 / 비활성 2 |
| `agentAvailable` | **unavailable 44** · unknown 8 · available 9 · **필드 없음(=인터페이스 없음) 15** |
| `monitoredBy` | 프록시 67 (`ZabbixProxyDemo` 1대) / 서버 직접 9 |
| 인터페이스 (type, available) | agent(1): 정상 9 · 불통 44 · 미확인 8 / SNMP(2): 정상 2 · 불통 1 / JMX(4): 불통 2 |
| 인터페이스 0개 호스트 | **10** |
| `deviceType` | **미분류 61 (80%)** · server 14 · network 1 |
| 템플릿 연결 | 1개 51 · 2개 17 · 3개 6 · **0개 2** |
| 아이템 0개 호스트 | 1 |
| 트리거 0개 호스트 | 5 |
| 그룹 미소속 호스트 | 0 |

> **76대 중 실제로 에이전트가 붙어 있는 건 9대다.** 표로는 절대 안 보이고, 도넛 하나면 즉시 보인다. 이 화면의 존재 이유.

### 1.3 템플릿 — 🔴 두 번째 발견

| 축 | 값(첫 200건 표본) |
|---|---|
| 연결 호스트 **0개** | **183 / 200 (91.5%)** |
| 연결 1개 | 12 · 2개 1 · 3개 1 · 5개 1 · 9개 1 · **32개 1** |
| 템플릿그룹 상위 | Network devices 67 · Applications 50 · Cloud 29 · Server hardware 22 · OS 11 · Power 11 |

> 347개 중 실제 쓰이는 건 30개 남짓. "생성 vs 실사용" 대비 막대가 이 화면의 시그니처 차트가 된다.

### 1.4 🔴 호스트그룹이 두 벌이다

`GET /users/host-groups`(우리 DB `host_group` 테이블)는 **7행**, Zabbix 실물은 **22개**.
DB 테이블은 *우리가 등록·관리하는* 그룹이고, Zabbix에는 `Discovered hosts`·`Zabbix servers` 등 자동/기본 그룹이 더 있다.

**결정**: 구성 현황의 그룹 축은 **Zabbix 원본(22)** 을 정본으로 쓴다. 이 화면은 "Zabbix에 뭐가 있나"를 답하는 화면이므로.
DB 그룹 수는 KPI에 넣지 않는다(두 숫자를 나란히 두면 반드시 오해가 생긴다).

### 1.5 알림 배달 경로

| 축 | 값 |
|---|---|
| 액션(트리거) | 11 |
| 미디어 타입 46 중 **활성** | 11 |
| 미디어 타입 46 중 **액션이 실제로 참조** | **8** |
| 스크립트 | 6 (액션 참조 여부는 `usedByActions` 필드 보유) |

---

## 2. 화면 구조 (IA)

```
자빅스 관리
├ ▣ 구성 현황            ← 🆕 신규 메뉴 (맨 앞, 그룹 헤더 위 단독)
│   /zabbix-management/overview
│
├ [호스트]
│  ├ 호스트 관리          [대시보드*] [호스트] [호스트 그룹]      ← 첫 탭 신규
│  ├ 모니터링 커버리지     (변경 없음)
│  └ 템플릿 관리          [대시보드*] [템플릿] [템플릿 그룹]      ← 첫 탭 신규
├ [시그널]
│  ├ 아이템 렌즈          [대시보드*] [목록]                     ← 탭 구조 신규
│  ├ 트리거 렌즈          [대시보드*] [목록]                     ← 탭 구조 신규
│  ├ 네트워크 디스커버리   (변경 없음 — 규칙 2개뿐, 차트 불필요)
│  └ 알림 관리            [대시보드*] [액션] [미디어 타입] [점검 기간] [스크립트]
└ [시스템]
   └ 매크로 관리 등        (변경 없음)
```

### 2.1 🔴 탭 신설 시 지켜야 할 것

1. **기본 탭은 대시보드가 아니다.** `?tab=` 없이 들어오면 **기존 목록 탭**이 열린다.
   이유: 이 화면들은 "고치러" 오는 화면이고, 기존 북마크·딥링크·redirect 계보(`zabbix-legacy-redirect.ts`)가 전부 목록을 가정한다.
   대시보드는 `?tab=dashboard`로만 열린다. 탭 순서만 맨 앞.
2. **아이템/트리거 렌즈는 지금 탭이 없다.** 탭 컨테이너를 새로 씌우되, 위 규칙에 따라 `?tab` 없으면 목록이 그대로 렌더된다 → **기존 URL 100% 호환**.
3. 렌즈 페이지는 URL query에 필터를 많이 싣는다. 탭 전환 시 `TemplateManagementPage.handleTabChange`와 같이 **keyword·offset·필터를 비운다**.
4. `destroyInactiveTabPane` — 호스트 관리가 이미 쓴다. 대시보드 탭도 비활성 시 파기해 Zabbix 콜이 백그라운드로 남지 않게 한다.

---

## 3. 통합 대시보드 — `/zabbix-management/overview`

> 한 화면에 **차트 6 + KPI 8 + 작업 큐 1**. 스크롤 1.5화면 이내.

### 3.1 KPI 밴드 (상단 8칸, 2행)

| # | 라벨 | 값(실측) | 부제 | 클릭 |
|---|---|---:|---|---|
| 1 | 호스트 | 76 | 활성 74 · 비활성 2 | 호스트 관리 |
| 2 | 호스트그룹 | 22 | — | 호스트 관리 ?tab=host-group |
| 3 | 템플릿 | 347 | **사용 중 30** | 템플릿 관리 |
| 4 | 아이템 | 7,891 | + 자동 생성 3,943 | 아이템 렌즈 |
| 5 | 트리거 | 3,009 | + 자동 생성 653 | 트리거 렌즈 |
| 6 | 액션 | 17 | 활성 N | 알림 관리 |
| 7 | 미디어 타입 | 46 | **배달 가능 8** | 알림 관리 ?tab=media-types |
| 8 | 에이전트 연결 | **9 / 76** | 불통 44 · 미확인 8 | 커버리지 화면 |

### 3.2 차트

| # | 제목 | 형태 | 데이터 | 왜 이 형태인가 |
|---|---|---|---|---|
| C1 | **생성 vs 실사용** | 가로 그룹 막대 (도메인 5행 × 2계열) | 템플릿 347/30 · 미디어 46/8 · 액션 17/활성 · 스크립트 6/참조 · 아이템 7891/활성 | 이 화면의 시그니처. "만들어만 놓은 것"이 한눈에 |
| C2 | **호스트 연결 상태** | 도넛 (5조각) | available 9 · unavailable 44 · unknown 8 · 인터페이스 없음 10 · 비활성 2 | 합이 76으로 딱 떨어지는 **배타 분류**로 설계(§3.3) |
| C3 | **감시 파이프라인** | 가로 퍼널(누적 막대) | 전체 76 → 그룹 소속 76 → 템플릿 연결 74 → 아이템 보유 75 → 트리거 보유 71 → 에이전트 정상 9 | 단계별 이탈 수가 곧 작업 큐 |
| C4 | **호스트그룹별 호스트 수** | 가로 막대 상위 10 + 기타 | Linux servers 40 · Discovered hosts 34 · DB 7 … | "어디에 있나"의 직답 |
| C5 | **감시 주체** | 도넛 2조각 + 프록시별 막대 | 프록시 67(ZabbixProxyDemo) · 서버 직접 9 | 프록시 장애 = 67대 실명이라는 위험 노출 |
| C6 | **최근 구성 변경 추이** | 세로 막대(일별 14일, 엔티티별 스택) | `GET /zabbix-manage/change-logs` | 이미 있는 감사 로그 재사용(신규 집계 0) |

### 3.3 🔴 C2 배타 분류 규칙

Zabbix `agentAvailable`을 그대로 도넛에 넣으면 **합이 76이 안 된다**(필드 없는 호스트 15 + 인터페이스 없는 호스트 10이 겹침).
판정 순서를 고정한다 — **위에서 처음 맞는 것 하나만**:

```
1. status == 1                       → 비활성        (2)
2. interfaces 가 비어 있음            → 인터페이스 없음 (10)
3. agentAvailable == null            → 미확인        (…)
4. agentAvailable == 1               → 정상          (9)
5. agentAvailable == 2               → 불통          (44)
6. else (== 0)                       → 미확인
```

> 실측에서 `agentAvailable == null`이 15인데 인터페이스 없는 호스트는 10이다 — **agent 인터페이스가 아닌 SNMP/JMX만 가진 호스트 5대**가 여기 낀다.
> 그래서 규칙 3의 라벨은 "미확인"이지 "인터페이스 없음"이 아니다. 툴팁에 "SNMP/JMX 전용 호스트 포함"을 적는다.

### 3.4 작업 큐 (하단 1개 카드, 표 아님 · 링크 목록)

| 사유 | 건수 | 착지 |
|---|---:|---|
| 템플릿 미연결 호스트 | 2 | 커버리지 `?category=noTemplate` |
| 아이템 0개 호스트 | 1 | 커버리지 `?category=collectingNothing` |
| 트리거 0개 호스트 | 5 | 커버리지 `?category=noTrigger` |
| 에이전트 불통 | 44 | 커버리지 `?category=agentUnreachable` |
| 미분류 호스트 | 61 | 호스트 관리 `?deviceType=notClassified` |
| 연결 호스트 0인 템플릿 | 317 | 템플릿 관리 `?tab=dashboard` (미사용 목록) |
| 액션이 참조하지 않는 활성 미디어 | 3 | 알림 관리 `?tab=media-types` |
| 점검 기간 미등록 | 0건 안내 | 알림 관리 `?tab=maintenance` |

---

## 4. 도메인 대시보드 탭 (5개)

> 통합 화면과 **같은 차트를 두 번 그리지 않는다**. 통합은 "도메인 간", 도메인 탭은 "도메인 내부 분해".
> 예외 하나: **연결 상태 도넛(C2)** 은 호스트 관리 탭에도 둔다 — 그 화면의 본론이라 없으면 이상하다. 대신 통합에는 요약, 도메인에는 **그룹별 교차**까지.

### 4.1 호스트 관리 > 대시보드

| # | 제목 | 형태 | 축 |
|---|---|---|---|
| H1 | 연결 상태 | 도넛 5조각 (§3.3 규칙) | 76 배타 분류 |
| H2 | **그룹 × 연결 상태** | 100% 누적 가로 막대 상위 10 그룹 | 어느 그룹이 통째로 불통인지 |
| H3 | 인터페이스 타입 | 세로 막대 | agent 61 · SNMP 3 · JMX 2 · IPMI 0 · 없음 10 |
| H4 | 기기 분류 | 도넛 | 미분류 61 · server 14 · network 1 (`device_classification` 마스터 색·순서 사용) |
| H5 | 템플릿 연결 개수 | 세로 막대 | 0개 2 · 1개 51 · 2개 17 · 3개 6 |
| H6 | 아이템/트리거 상위 10 호스트 | 가로 그룹 막대 | 수집 부하 편중 확인 |

### 4.2 템플릿 관리 > 대시보드

| # | 제목 | 형태 | 축 |
|---|---|---|---|
| T1 | **사용 여부** | 도넛 2조각 + 중앙 비율 | 미사용 317 / 사용 30 |
| T2 | 템플릿그룹별 개수 | 가로 막대 상위 10 | Network devices 67 … |
| T3 | 연결 호스트 상위 10 템플릿 | 가로 막대 | 32 · 9 · 5 · 3 · 2 · 1… |
| T4 | 템플릿 규모 상위 10 | 가로 그룹 막대(아이템/트리거) | 무거운 템플릿 식별 |
| T5 | **미사용 템플릿** | 표 (최대 20행 + 전체 보기) | 정리 대상 큐 — 목록 탭 딥링크 |

### 4.3 아이템 렌즈 > 대시보드

| # | 제목 | 형태 | 축 |
|---|---|---|---|
| I1 | 상태 | 도넛 | 활성/비활성 |
| I2 | **수집 상태** | 도넛 | 정상 / **지원 안 됨(state=1)** — 🔴 신규 집계(§6.3) |
| I3 | 정의 위치 | 도넛 | 템플릿 상속 / 호스트 직접 정의 / LLD 자동 생성 |
| I4 | 타입 분포 | 가로 막대 상위 10 | agent · SNMP · 계산 · 의존 · 트래퍼 … (`typeLabel` 재사용) |
| I5 | 값 타입 | 세로 막대 | float/char/log/uint/text |
| I6 | 수집 주기 | 세로 막대(구간) | 1m 미만 / 1m / 5m / 10m / 1h / 그 외 · 0(비수집) |

### 4.4 트리거 렌즈 > 대시보드

| # | 제목 | 형태 | 축 |
|---|---|---|---|
| R1 | 심각도 | 세로 막대 6칸 | `SEVERITY_BY_CODE` 팔레트 고정색 |
| R2 | 상태 | 도넛 | 활성/비활성 |
| R3 | 정의 위치 | 도넛 | 상속 / 직접 / LLD |
| R4 | 트리거 상위 10 호스트 | 가로 막대 | |
| R5 | 아이템 대비 트리거 비율 | KPI + 게이지 | 7,891 : 3,009 = 2.6:1 — "수집만 하고 감지 안 하는" 비율 |

### 4.5 알림 관리 > 대시보드

| # | 제목 | 형태 | 축 |
|---|---|---|---|
| A1 | **이벤트 소스별 액션** | 세로 누적 막대(활성/비활성) | 트리거 11 · 디스커버리 3 · 내부 3 · 자동등록 0 · 서비스 0 |
| A2 | **배달 경로** | 3단 퍼널 | 미디어 46 → 활성 11 → 액션 참조 8 |
| A3 | 미디어 타입 종류 | 도넛 | 웹훅 36 · 이메일 7 · 스크립트 2 · SMS 1 |
| A4 | 스크립트 | KPI 2 | 전체 6 / 액션 참조 N |
| A5 | 점검 기간 | KPI 2 + 안내 | 전체 0 / 진행 중 0 — 0이면 "등록된 점검 기간이 없어 점검 중에도 알림이 발송됩니다" 경고 |

> A2는 [ai-assistant-design](../12-%EC%98%A8%EB%B3%B4%EB%94%A9-%EA%B7%9C%EC%95%BD/solutions--%EB%AA%A8%EB%85%B8%EB%A0%88%ED%8F%AC-%EC%9E%91%EC%97%85-%EA%B7%9C%EC%95%BD.md) 알림 설정 툴의 "배달경로 3단 진단"과 **같은 판정**이다. 표현만 다르게(차트) 재사용한다.

---

## 5. KPI 밴드 (목록 탭 상단)

기존 목록 탭 상단에 `Statistic` 4~5칸. **대시보드 API의 summary 블록만** 소비한다(별도 EP 없음).

| 화면/탭 | KPI |
|---|---|
| 호스트 관리 > 호스트 | 전체 76 · 활성 74 · 에이전트 정상 9 · 불통 44 · 미분류 61 |
| 호스트 관리 > 호스트 그룹 | 그룹 22 · 그룹당 평균 호스트 · 최대 그룹 · 빈 그룹 |
| 템플릿 관리 > 템플릿 | 전체 347 · 사용 중 30 · 미사용 317 · 그룹 12 |
| 템플릿 관리 > 템플릿 그룹 | 그룹 12 · 최대 그룹 67 |
| 아이템 렌즈 > 목록 | 정의 7,891 · 활성 N · 지원 안 됨 N · 자동 생성 3,943 |
| 트리거 렌즈 > 목록 | 정의 3,009 · 활성 N · 재해/장애 N |
| 알림 관리 > 액션 | 액션 17 · 활성 N · 이 소스 11 |
| 알림 관리 > 미디어 타입 | 46 · 활성 11 · 사용 8 |

> **KPI 밴드는 실패해도 목록을 막지 않는다.** 로딩 중 스켈레톤, 에러 시 밴드만 숨김(목록은 자기 쿼리로 이미 떠 있다).

---

## 6. BE 설계

### 6.1 엔드포인트 (신규 6, 전부 read-only · 관리자 전용)

| # | Method · Path | 응답 | 용도 |
|---|---|---|---|
| 1 | `GET /zabbix-manage/overview` | `ZabbixOverviewDto` | 통합 대시보드 |
| 2 | `GET /zabbix-manage/overview/hosts` | `HostOverviewDto` | 호스트 대시보드 탭 + 호스트 KPI |
| 3 | `GET /zabbix-manage/overview/templates` | `TemplateOverviewDto` | 템플릿 탭 + KPI |
| 4 | `GET /zabbix-manage/overview/items` | `ItemOverviewDto` | 아이템 탭 + KPI |
| 5 | `GET /zabbix-manage/overview/triggers` | `TriggerOverviewDto` | 트리거 탭 + KPI |
| 6 | `GET /zabbix-manage/overview/alerts` | `AlertOverviewDto` | 알림 탭 + KPI |

공통 쿼리: `?groupId=`(선택, 호스트그룹 스코프) · `?refresh=true`(캐시 무시).
권한: `AdminAccessChecker.requireAdmin` + `@VisitorIdCheck` — 기존 zabbixadmin 컨트롤러와 동일.
라이선스: 읽기 전용이므로 `allowsLiveQuery()` 게이트 대상(EXPIRED 구간에선 실시간 조회 차단 → 기존 포트 데코레이터가 처리, 별도 코드 없음).

> **왜 6개로 쪼개나**: ① 도메인 탭은 자기 것만 로드(아이템 탭 열었다고 액션 콜 하지 않는다) ② 실패 격리 — 미디어 타입 조회가 죽어도 호스트 차트는 뜬다 ③ 캐시 TTL을 도메인별로 다르게(§6.5).
> 통합 EP(#1)는 6개 집계기를 **병렬 호출**해 요약분만 뽑는다(각 도메인의 full DTO를 그대로 싣지 않는다 — 응답이 수십 KB가 된다).

### 6.2 집계 전략 — 도메인별

| 도메인 | Zabbix 콜 | 비용(실측/추정) |
|---|---|---|
| 호스트 | `host.get` 1콜 (output: hostid,name,status,monitored_by,proxyid + selectInterfaces + selectHostGroups + selectParentTemplates + selectTags) — **`MonitoringCoverageService`와 같은 형태** | 76대 0.23s. 5,000대여도 1콜 |
| 호스트그룹 | 위 응답의 `groups`에서 유도 + `hostgroup.get`(빈 그룹 포착용) 1콜 | 무시 가능 |
| 템플릿 | `template.get` 1콜 (output 최소 + selectHosts:count + selectItems:count + selectTriggers:count + selectTemplateGroups) | 347개 0.17s |
| 아이템 | **`item.get` countOutput ×N** (§6.3) | 축별 count 콜 |
| 트리거 | `trigger.get` countOutput ×N | 동일 |
| 액션 | `action.get` ×5 (eventsource별) — Zabbix가 eventsource 필터를 요구 | 5콜, 각 0.01s |
| 미디어 | `mediatype.get` 1콜 + 위 액션 응답에서 참조 카운트 | 0.22s |
| 스크립트/점검기간 | 각 1콜 | 0.4s / 0.07s |

### 6.3 🔴 아이템·트리거 집계 — countOutput 다중 콜

**문제**: 아이템 7,891건은 전건을 받아 앱에서 세도 되지만(실측 0.36s), 고객사가 50만 건이면 그 전략은 무너진다.
Zabbix API에는 `GROUP BY`가 없다. 축별 분포를 얻는 유일한 방법은 **축 값마다 `countOutput` 콜**이다.

**결정**: 축당 콜 수를 **미리 정해진 상수로 고정**한다.

| 축 | 콜 수 | 값 |
|---|---:|---|
| 상태 | 2 | status 0/1 |
| 수집 상태 | 2 | state 0/1 |
| 정의 위치 | 3 | flags 0(직접·상속) / 4(LLD 생성) + templated 여부 |
| 타입 | 10 | 실측 상위 10종만. 나머지는 (전체 − 합) = "기타" |
| 값 타입 | 5 | 0~4 |
| 주기 구간 | 0 | 🔴 **countOutput 불가** — `delay`는 문자열이라 범위 필터가 없다 |
| **합계** | **22콜** | + 전체 1콜 |

> 🔴 **I6(수집 주기 분포)의 처리**: countOutput으로 못 만든다. 두 선택지 중 —
> **(채택) 전건 ID+delay 조회 1콜** (`output:["itemid","delay"]`). 7,891건에 ~200KB, 실측 렌즈 1단계와 같은 비용(0.3s대).
> 단 **`app.overview.item-scan-cap`(기본 100,000) 초과 시 이 차트만 "규모가 커서 생략됨"으로 비활성화**하고 나머지 21콜 집계는 정상 제공한다.
> 이 상한은 §8의 대규모 대비와 같은 축이다. 폴백 없이 조용히 틀린 수를 보여주는 것보다 **명시적으로 못 그렸다고 말하는 편**을 택한다(§D7 원칙).

22콜은 각각 Zabbix DB의 `SELECT COUNT(*)`이라 개별로는 싸지만 **직렬로 돌리면 왕복 지연이 쌓인다.**
→ `CompletableFuture`로 **동시 6**까지 병렬(Zabbix 서버 부하 상한). 실측 규모에서 총 0.5s 내 예상.

### 6.4 🔴 4대 사각지대는 커버리지 서비스를 재사용

`MonitoringCoverageService.diagnose(groupId, includeDisabled)`를 그대로 호출해 `summary`만 쓴다.
**같은 host.get 응답으로 판정하므로 두 화면의 숫자가 갈릴 수 없다.**
단 커버리지 서비스는 자체 host.get을 한 번 더 하므로 통합 EP에서는 **호스트 집계와 커버리지 판정이 같은 응답을 공유**하도록 내부 메서드를 하나 분리한다:

```
HostSnapshot fetch(groupId, includeDisabled)     // host.get 1콜 — 신규 공용
├─ HostOverviewAggregator.aggregate(snapshot)    // 이 설계
└─ MonitoringCoverageService.judge(snapshot)     // 기존 판정 로직 추출(동작 무변경)
```

> 기존 `diagnose()`는 시그니처·응답 그대로 두고 내부만 `fetch`+`judge`로 쪼갠다. **커버리지 화면·기존 테스트에 영향 0**이어야 한다.

### 6.5 캐시

| 도메인 | TTL | 근거 |
|---|---:|---|
| 호스트·호스트그룹 | 60s | agent available이 실시간 축이라 짧게 |
| 템플릿·아이템·트리거 | 300s | 구성은 자주 안 바뀐다 |
| 액션·미디어·스크립트·점검기간 | 300s | 동일 |

- 키: `zbxOverview:{domain}:{groupId|all}`. Redis 사용(BE에 이미 있음).
- `?refresh=true`면 무시하고 재조회 후 갱신 — 화면 우상단 새로고침 버튼이 이걸 부른다.
- 응답에 `collectedAt`(ISO) 포함 → 화면에 "N초 전 기준" 표기. **캐시된 데이터를 실시간인 척 하지 않는다.**
- 🔴 **쓰기 직후 무효화는 하지 않는다.** 호스트/템플릿 CRUD EP에 캐시 무효화를 심으면 결합이 늘고, 60s/300s면 사용자가 새로고침 버튼으로 해결 가능하다. 대신 대시보드 탭 진입 시 `staleTime`을 TTL과 맞춘다.

### 6.6 DTO 스케치 (핵심만)

```java
public record ZabbixOverviewDto(
    Instant collectedAt,
    OverviewCountsDto counts,          // 도메인별 total/inUse 8쌍
    List<BucketDto> hostConnectivity,  // §3.3 배타 5분류
    List<FunnelStepDto> pipeline,      // 6단계
    List<BucketDto> topHostGroups,     // 상위 10 + 기타
    List<BucketDto> monitoredBy,
    List<ChangeLogBucketDto> recentChanges,
    List<ActionItemDto> queue,         // 작업 큐 8행 (code·count·deepLink)
    List<String> degraded              // 🔴 실패/생략된 섹션 코드
) {}

public record BucketDto(String code, String label, long count) {}
```

> 🔴 **`degraded`가 핵심 계약**이다. 일부 Zabbix 콜이 실패하거나 상한으로 생략되면 **전체를 500으로 떨어뜨리지 않고** 해당 섹션만 비우고 코드를 싣는다. FE는 그 카드에만 "이 항목은 불러오지 못했습니다"를 띄운다.
> `label`은 BE가 채우지 않는다(빈 문자열) — **i18n은 FE 책임**. `code`만 계약. (BE 한국어 고정 라벨은 액션 요약 선례가 있으나, 차트 범례는 언어 전환 대상이라 FE에서 번역한다.)

### 6.7 테스트

- `ZabbixOverviewServiceTest` — Zabbix 서비스 목킹, §3.3 배타 분류 경계(인터페이스 없음 vs available null vs SNMP 전용) 전 케이스.
- `ItemOverviewAggregatorTest` — "기타 = 전체 − 상위 10 합"이 음수가 되지 않는지, countOutput 응답이 문자열/숫자 양쪽일 때(선례: `ZabbixItemServiceImpl.countOutput` 파싱) .
- `MonitoringCoverageServiceTest` — **기존 테스트가 그대로 통과해야 한다**(리팩터링 무회귀 증명).
- 상한 초과 시 `degraded`에 코드가 실리고 200으로 응답하는지.

---

## 7. FE 설계

### 7.1 신규 파일

```
src/pages/zabbix-management/overview/
  ZabbixOverviewPage.tsx           // 통합 대시보드
  components/
    OverviewKpiBand.tsx            // §3.1 8칸 (도메인 탭 KPI와 공용)
    UsageComparisonChart.tsx       // C1 생성 vs 실사용
    ConnectivityDonut.tsx          // C2 (호스트 탭 H1과 공용)
    MonitoringFunnel.tsx           // C3
    ConfigActionQueue.tsx          // 작업 큐
  overview.scss
src/pages/zabbix-management/host-management/HostDashboardTab.tsx
src/pages/zabbix-management/item-template-management/TemplateDashboardTab.tsx
src/pages/zabbix-management/entity-lens/ItemLensDashboardTab.tsx
src/pages/zabbix-management/entity-lens/TriggerLensDashboardTab.tsx
src/pages/zabbix-management/alert-management/AlertDashboardTab.tsx
src/components/Chart/OverviewChartCard.tsx   // 공용 카드 셸(제목·툴팁·degraded·빈 상태)
src/hooks/useZabbixOverview.ts               // 6개 훅
src/services/zabbix-overview.api.ts
src/types/zabbix-overview.ts
```

### 7.2 규약 준수 체크리스트

- [ ] `useDmoveQuery` — 인터셉터가 2겹 벗기므로 **소비자는 payload 직접 수신**([[fe-usedmovequery-unwrap]]).
- [ ] 차트는 `ReactECharts` + `useEchartsTheme` + `getPalette().CHART_SERIES` **순서대로 고정 배정**(순환·랜덤 금지, palette.ts:10).
- [ ] 심각도 색은 `SEVERITY_BY_CODE`. **색만으로 구분하지 않는다** — 라벨 병기([[design-system-and-help]]).
- [ ] 탭 상태는 URL query(`?tab=`) — 로컬 `useState` 금지([[fe-page-remount-on-navigate]]).
- [ ] `DmoveTable` 사용 시 `loading` prop 필수([[fe-dmovetable-loading-spinner]]).
- [ ] i18n 키는 `zabbix_overview.*` 루트 하나. 브레드크럼이 URL 세그먼트(`overview`)를 `_`로 바꿔 키로 쓰므로 **`overview.title`이 다른 네임스페이스와 충돌하지 않는지 확인**([[ai-account-monitoring-design]] 교훈).
- [ ] 차트 컨테이너 div는 로딩/Empty 분기 **바깥에** 항상 렌더([[fe-rgl-usecontainerwidth-ref-first-render]]).
- [ ] 도움말(`page-guide.ts`)에 신규 화면 1건 + 탭 5건 추가.
- [ ] `navSearchEntries.ts`에 "구성 현황" 검색 진입점 추가.

### 7.3 차트 유형 결정

> ZM-116 자산 대시보드는 "차트 전부 막대"로 갔다. 여기는 **도넛을 허용**한다 — 이유: 배타 5분류(연결 상태)·2분류(사용 여부)처럼 **합이 전체와 같고 조각이 5개 이하**인 축이 이 도메인의 본론이기 때문. 그 조건을 벗어나면(6조각 이상, 합≠전체) 무조건 막대.

| 조건 | 형태 |
|---|---|
| 배타 분류, 조각 ≤5, 합=전체 | 도넛(중앙에 총계) |
| 순위 비교, 항목 >5 | **가로** 막대(라벨 길이 때문) |
| 시계열 | 세로 막대 |
| 단계별 이탈 | 가로 퍼널(누적 막대로 구현) |
| 단일 비율 | KPI 숫자 + 진행 바 |

### 7.4 클릭 → 딥링크

모든 차트 조각·막대는 클릭 가능. 착지는 **기존 목록의 기존 필터 파라미터**만 쓴다(신규 필터 추가 금지 — 추가가 필요하면 그 차트를 빼거나 링크를 뺀다).

| 차트 | 착지 |
|---|---|
| C2/H1 연결 상태 | 호스트 관리 `?tab=host&available=2` (🔴 §9-Q1: 현재 이 필터가 없다) |
| C4/H2 그룹 | 호스트 관리 `?tab=host&groupId=…` |
| H4 기기분류 | 호스트 관리 `?tab=host&deviceType=…` |
| T1/T5 미사용 템플릿 | 템플릿 관리 목록(정렬만) |
| I1~I5 | 아이템 렌즈 `?status=&type=&…` (렌즈는 필터가 이미 풍부) |
| R1 심각도 | 트리거 렌즈 `?priority=` |
| A1 액션 | 알림 관리 `?tab=actions&source=N` |

---

## 8. 대규모 환경 대비

실측은 호스트 76 / 아이템 7.9천이다. 고객사는 **호스트 수천 · 아이템 수십만**일 수 있다.

| 규모 축 | 우리 전략 | 한계 |
|---|---|---|
| 호스트 | host.get 1콜 — 5,000대면 응답 ~3MB, 2~4s 예상 | 캐시 60s가 흡수. 10,000대 초과면 `?groupId` 스코프 안내 |
| 템플릿 | template.get 1콜 + count 서브셀렉트 | 수천 개까지 안전 |
| 아이템/트리거 | **countOutput 22콜**(규모 무관 상수 비용) | ✅ 스케일 안전 |
| 아이템 주기 분포(I6) | 전건 delay 스캔 | 🔴 `item-scan-cap` 초과 시 **차트만 생략** + `degraded` |
| 액션/미디어 | 상수 콜 | 안전 |

> **원칙**: 이 화면은 규모가 커질수록 **차트가 사라질 수는 있어도 느려지거나 틀리지는 않는다.**

---

## 9. 미결 → 결정(기본값)

| # | 쟁점 | 결정 |
|---|---|---|
| Q1 | 연결 상태 클릭 딥링크에 필요한 호스트 목록 필터(`available`)가 **현재 없다** | **차트는 만들고 링크는 1차에 뺀다.** 필터 추가는 별건(호스트 목록 필터 확장). 툴팁에 "커버리지 화면에서 목록 확인" 안내 |
| Q2 | 통합 화면 메뉴 라벨 | **"구성 현황"** (i18n `zabbix_overview.menu`). "대시보드"는 홈 위젯 대시보드와 혼동 |
| Q3 | 기본 탭 | **목록 유지**. 대시보드는 `?tab=dashboard`로만 (§2.1) |
| Q4 | 홈 위젯으로도 노출? | **M2 이후**. 1차 범위 밖 |
| Q5 | `groupId` 스코프 필터 | **통합 화면에만** 둔다. 도메인 탭은 그 화면의 기존 필터를 쓴다 |
| Q6 | 자동 새로고침 | **없음**. 수동 버튼 + `collectedAt` 표기 (Zabbix 부하 최소) |
| Q7 | 아이템 "총계 두 개"(7,891 vs 11,834) | **둘 다 표기** — 주 숫자는 정의(7,891), 부제에 "+ 자동 생성 3,943" |
| Q8 | 네트워크 디스커버리 대시보드 | **안 만든다**(규칙 2개) |
| Q9 | 매크로·점검기간 대시보드 | 점검 기간은 알림 관리 탭에 KPI만(A5). 매크로는 없음 |

---

## 10. 마일스톤

| M | 범위 | 산출 |
|---|---|---|
| **M1** | BE EP 6 + 집계기 + 캐시 + 테스트 | `_workspace/contract_zabbix-overview.md` |
| **M2** | FE 통합 대시보드 화면 (§3 전체) | 라우트·메뉴·i18n·도움말 |
| **M3** | FE 도메인 탭 5개 (§4) | 탭 컨테이너 신설 2건(렌즈) 포함 |
| **M4** | KPI 밴드 8곳 (§5) | |
| **M5** | 정적 QA(경계면) + 런타임 QA(:3002/:5175 브라우저) | `_workspace/reviews/review_zabbix-config-overview.md` |

> 커밋은 사용자 승인 후. 메시지 관례 `#ZM-118 [FEAT] … -2026-08-26`. 푸시하지 않는다.

---

## 11. 구현 중 뒤집힌 결정 (v1.1, 2026-08-26 구현 완료 시점)

> 설계 v1을 그대로 만들지 못한 지점들이다. 전부 **실측이 문서를 뒤집은** 경우라, 되돌리지 말 것.

| # | 설계 v1 | 실제 구현 | 왜 |
|---|---|---|---|
| R-1 | 경로 `/zabbix-management/overview` | **`/configuration-overview`**, i18n 루트도 `configuration_overview` | 브레드크럼이 URL 세그먼트를 `_`로 바꿔 i18n 키로 쓴다(`useBreadcrumbs.translateSegment`). `overview`는 우리가 소유하지 않은 일반 명사라 충돌 위험 — 세그먼트와 네임스페이스를 일치시켰다 |
| R-2 | C1 "생성 vs 실사용" = 가로 **그룹 막대** | **도메인별 비율 진행바**(`UsageComparison.tsx`) | 아이템 11,834 vs 스크립트 6이 같은 축에 놓이면 작은 도메인이 전부 0에 붙는다(실제로 그렇게 그려졌다). 이 카드의 질문은 "몇 개인가"가 아니라 "몇이나 쓰이나"이므로 비율이 본체 |
| R-3 | usage의 아이템 `inUse` = 활성 | **정상 수집(state=0)** | 활성은 11,793/11,834로 거의 전부라 막대가 무의미했다. 정작 3,568개가 "지원되지 않음"이었다 |
| R-4 | 아이템 총계를 "정의 7,891 + 자동 생성 3,943"으로 표기 | **"정의 7,891 / 호스트 수집 11,834"** 두 수를 나란히 | 렌즈 정의 뷰는 `inherited:false`+`flags:0`이라 상속 사본도 빠진다. 단순 뺄셈이 성립하지 않아 "자동 생성 3,943"은 틀린 문구였다 |
| R-5 | 파이프라인을 커버리지 요약에서 유도 | **호스트 스냅샷에서 누적 교집합으로 직접 계산** | 단계별 독립 판정이면 `withTemplate 72 < withItem 73`이 나와 퍼널이 깨진다(실측에서 실제로 나왔다) |
| R-6 | `emptyGroups`(빈 그룹만) | **`groups`(Zabbix 그룹 전체 + count)** | 그룹 스코프 선택지가 필요했는데, 우리 DB `host_group`(7행)을 쓰면 Zabbix에만 있는 그룹 23개를 고를 수 없다 |
| R-7 | 아이템 축별 countOutput 22콜 | **정의 전건 스캔 1콜 + countOutput 10콜** | `output`을 4필드로 줄이면 7,891건이 수백 KB라 타입·값타입·주기를 한 번에 센다. 축마다 콜하는 것보다 싸고 정확 |
| R-8 | 트리거 대시보드에 "트리거 많은 호스트 상위 10" | **뺐다** | 호스트 스냅샷에 이미 있는 정보다. 트리거 EP가 호스트 전건을 또 읽을 이유가 없어 호스트 대시보드가 답하게 두었다 |
| R-9 | (없음) | **차트 애니메이션 전면 off** | 카드가 8~10개씩 한 화면에 있으면 동시에 움직여 읽기 나쁘다. 부수 효과로 자동화 캡처도 완성 상태로 찍힌다 |

### 11.1 🔴 구현 중 실측으로 잡은 함정

1. **`countRaw`는 `countOutput`을 넣어 주지 않는다.** 호출자가 넣어야 한다. 빠뜨리면 Zabbix가 목록을 돌려주고 파서가 0으로 읽어 **에러 없이 모든 수가 0**이 되고 응답도 10초로 느려진다.
2. **`definedInHost`와 출처의 `direct`는 같은 집합**(호스트에 있고·상속 아니고·LLD 아님) — 콜을 두 번 하지 않는다.
3. **기존 페이지 테스트가 QueryClientProvider 없이 렌더한다.** KPI 밴드(react-query 훅)를 페이지에 넣으면 즉시 깨진다 → 테스트에서 대시보드 탭·KPI 밴드를 목 처리했다(4개 파일).
4. **`value_type` 5(binary)가 실제로 나온다**(Zabbix 7.0). 기존 `item_template_management.value_type_labels`에 없어 우리 키로 폴백한다.

### 11.2 검증 상태

| 항목 | 상태 |
|---|---|
| BE 단위 테스트 | ✅ 32건 green(신규 `HostOverviewAggregatorTest`·`ItemOverviewAggregatorTest`·`DelayBucketsTest`·`HostSnapshotReaderTest` + 커버리지 무회귀) |
| BE 실서버 응답 | ✅ EP 6개 200, 통합 1.6s / 캐시 히트 0.24s, `degraded` 빈 배열 |
| FE 타입 | ✅ `tsc --noEmit` 통과 |
| FE 테스트 | ✅ 1,305 passed / 2 failed — **두 건 모두 선재 실패**(`TriggerFormDrawer`는 메인 체크아웃에서도 동일하게 실패, `AiAssistantPage`는 이 작업과 무관한 URL 미러링) |
| FE 브라우저 | ✅ 통합 화면 + 도메인 탭 5개 + 목록 KPI 밴드, 한국어/영어 양쪽 |
| 그룹 스코프·딥링크·다크 모드 | ✅ 확인(그룹 선택 시 전 지표 재계산, 그룹 막대 클릭 → 호스트 목록 필터 착지) |
| 커버리지 화면 무회귀 | ✅ 확인(사각지대 건수가 대시보드 작업 큐와 일치) |
| 캐시 무효화 실동작 | ✅ 확인(구성 변경 → `collectedAt` 즉시 갱신, 생성·삭제 양쪽) |
| 코덱스 검수 | ✅ 🔴6·🟡6 중 9건 반영, 5건은 근거를 달아 보류 — [review_zabbix-config-overview.md](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/solutions--%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-%EC%9E%90%EB%B9%85%EC%8A%A4-%EA%B4%80%EB%A6%AC-%EA%B5%AC%EC%84%B1-%ED%98%84%ED%99%A9-%EB%8C%80%EC%8B%9C%EB%B3%B4%EB%93%9C-%EB%8F%84%EB%A9%94%EC%9D%B8-KPI-%28ZM-118%29.md) §7 |
| 미검증 | `degraded` 실제 발생 시 화면, 규모 상한 초과 경로, 대규모 환경 부하 |
