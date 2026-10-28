# APM P3 계약 — SLO · 홈 위젯 · 합성 감시 · 메시징 · 배치 · 리포트 (2026-09-07, BE 구현 완료 · FE 미착수)

> **이 문서가 FE 정본이다.** `features/apm/core/contract_apm-read-api.md`는 P1·P2(§1~§11)를 담고 있고, P3는
> 분량이 커서 여기로 갈랐다. 저쪽에는 참조 한 줄만 있다.
>
> | 물결 | WBS | 이 문서 |
> |---|---|---|
> | P3 1차 (2026-09-07) | 4.1 SLO · 4.5 홈 위젯 3종 | §1 · §2 |
> | **P3 2차 (2026-09-07)** | **2.6·2.7 합성 감시 · 4.2 메시징 · 4.3 배치** | **§3 · §4 · §5** |
> | **P3 3차 (2026-09-07)** | **4.4 APM 리포트 배치(기존 리포트 체계 편입)** | **§8** |
>
> ⚠️ 2차 물결에서 **기존 §3(권한)·§4(구현 상태)가 §6·§7로 밀렸다** — 새 도메인 셋을 뒤에 붙이면
> 관련 없는 절이 화면 명세 사이에 끼어 읽기 순서가 깨진다. (BE 코드의 `근거: §n` 주석은 함께 고쳤다.)
>
> ⚠️ **3차 물결의 §8은 §7(구현 상태) 뒤에 붙였다** — 이번에는 번호를 밀지 않았다. §6·§7을 또
> 옮기면 이미 그 번호를 가리키는 BE 코드 주석과 이 문서의 상호 참조가 한 번 더 흔들린다.
> 🔴 **§8은 EP가 `/apm/*`이 아니라 `/admin/reports*`다**(리포트 관리 화면에 편입) — §8.0을 먼저 읽을 것.
>
> 설계 정본 `features/apm/core/devdesign_apm.md` §7("V38 (P3)" 행)·§8.1(SLO·합성 감시·메시징/배치 행)·§9 ·
> 화면 명세 `features/apm/core/devdesign_apm-screens-wbs.md` §3.13·§3.15·§3.16·§3.17·§3.21 ·
> WS-2 2.3b·2.6·2.7 · WS-4 4.1·4.2·4.3·4.5.

## 0. 공통 (P1·P2와 동일 — 다시 적는 것은 이 문서만 보고도 붙일 수 있게)

- 전부 `Feature.APM`(`FeatureInterceptor`) + 권한(§3). 응답은 전역 envelope `{status, code, data}`
  (FE `useDmoveQuery`가 2겹 언랩 → 소비자는 `data` 직접).
- 시간: `from`·`to`는 **ms 에폭**, `step`은 **초**. 시각 필드는 ISO-8601 UTC 문자열, 시계열 점의 `ts`는 ms 에폭.
- **거부는 HTTP 200 + body `code:403`**(401만 실제 상태 코드). 없는 리소스도 200 + body `code:404`.
- 🔴 **`null`은 전부 "모름"이지 0이 아니다.** 이 계약에서 특히 중요하다 — SLI·버짓·번 레이트가
  `null`인 것은 "요청이 0건이었다"이지 "0%"가 아니다. 0으로 그리면 **조용한 서비스가 매일 완전
  장애로 보이고**, 100%로 그리면 죽어 있던 시간이 완벽한 시간이 된다.
- 🔴 **필수 쿼리 파라미터를 빠뜨려도 500이 아니다** (2026-09-07 QA D1 반영). 이 계약이 이 레포에서
  `required` 쿼리 파라미터를 처음 쓴 자리라 그때 드러났다 — `GlobalExceptionHandler`에
  `MissingServletRequestParameterException` 매핑이 없어 catch-all로 빠져 **실제 HTTP 500 +
  `{statusCode,message}`** 가 나갔다(FE가 읽지도 분기하지도 못하고, 클라이언트 실수가 서버 장애로
  로그에 쌓였다). 지금은 EP마다 **계약이 약속한 코드**가 그대로 나온다:
  `/apm/messaging/series` → `APM_MESSAGING_DESTINATION_REQUIRED`(400) ·
  `/apm/jobs/runs` → `APM_JOB_NOT_FOUND`(404) ·
  `/admin/reports/apm/detail` → `APM_REPORT_PERIOD_INVALID`(400).
  그 밖의 EP에서 필수 파라미터가 빠지면 전역 그물이 **200 + `code:400` + `INVALID_DATA`**로 받는다.

---

# §1. SLO (메뉴 10 · WBS 4.1)

## 1.1 EP 표

| 메서드 | 경로 | 권한 | 응답 `data` |
|---|---|---|---|
| GET | `/apm/slos?service={serviceUid}` | `apm.view` | `SloRow[]` |
| GET | `/apm/slos/{sloUid}` | `apm.view` | `SloDetail` |
| GET | `/apm/slos/{sloUid}/series?from&to&step` | `apm.view` | `SloSeries` |
| POST | `/apm/slos` | `apm.edit` | `SloRow` |
| PUT | `/apm/slos/{sloUid}` | `apm.edit` | `SloRow` |
| DELETE | `/apm/slos/{sloUid}` | `apm.edit` | `{ deleted: true }` |

`service` 쿼리는 **서비스 UUID**다(이름 아님). 비우면 전체.

## 1.2 타입

```ts
type SloRow = {
  sloUid: string;              // 불변 식별자. URL·Zabbix 아이템 키가 쓴다
  serviceUid: string | null;   // 서비스가 지워지는 중이면 null(그 행은 곧 사라진다)
  serviceName: string | null;  // 표시명
  name: string;                // 한 서비스 안에서 유일(대소문자 무시)
  sliKind: 'AVAILABILITY' | 'LATENCY';
  target: number;              // % (예 99.9). 🔴 항상 0 < target < 100
  windowDays: 7 | 30;
  latencyThresholdMs: number | null;  // LATENCY일 때만 값이 있다
  enabled: boolean;

  windowFromMs: number;        // 창 시작(ms 에폭)
  windowToMs: number;          // 창 끝 = 조회 시각

  measuredFromMs: number;      // 🔴 **실제로 잰** 구간의 시작. 롤업 버킷 격자 때문에 windowFromMs보다 늦을 수 있다
  measuredToMs: number;        // 🔴 실제로 잰 구간의 끝. 롤업이 밀리면 windowToMs보다 이르다

  sliPct: number | null;       // 🔴 null = 잴 수 없었다(요청 0건 등)
  requests: number;            // 창 안 **전체** 요청 수
  measured: number;            // 🔴 **SLI의 분모** = 잴 수 있었던 요청 수. requests와 다를 수 있다
  mixedBounds: boolean;        // 🔴 관측의 일부가 분모에서 빠졌다(부분 관측) → 배지 필요
  good: number;                // 좋은 요청 수. 🔴 LATENCY는 버킷 보간이라 소수다
  errorBudgetTotal: number | null;   // 허용 실패 건수 = (1-목표)×measured. 🔴 반올림하지 않는다
  errorBudgetUsed: number;           // 실제 실패 건수
  budgetRemainingPct: number | null; // 🔴 음수 가능(예산 초과분)

  burn1h: number | null;       // 최근 1시간 번 레이트(배수)
  burn6h: number | null;       // 최근 6시간
  burn5m: number | null;       // 🔴 SRE 표 ①의 **확인 창**('아직도 나쁜가')
  burn30m: number | null;      // 🔴 SRE 표 ②의 확인 창
  burnCondition: 'FAST' | 'SLOW' | 'NONE' | 'UNKNOWN';  // 지금 넘긴 SRE 조건
  status: 'OK' | 'WARN' | 'BREACH' | 'UNKNOWN';

  burnAlert: {
    enabled: boolean;
    threshold: number;         // 🔴 **빠른 줄(1h+5m)**의 임계(배수). 기본은 창에서 계산 — 30일 14.4 · **7일 3.36**
    slowThreshold: number;     // = threshold / 2.4. 🔴 서버가 계산해 준다(FE가 다시 하지 말 것)
    maxThreshold: number;      // 🔴 = 1/(1-목표). **이 값 이상은 서버가 거절한다**(폼의 상한, 배타)
    ruleUid: string | null;    // 알람 규칙 화면·발화 이력이 쓰는 식별자
    zabbixSynced: boolean;     // 🔴 false면 값을 밀어도 아무도 안 울린다 → 배지 필요
    zabbixError: string | null;
  };

  createdAt: string; updatedAt: string;   // ISO-8601 UTC
};

type SloDetail = {
  row: SloRow;
  calendar: {                  // 오름차순(과거→현재). 🔴 최대 30칸, 빈 날은 **행이 없다**
    day: string;               // 'YYYY-MM-DD'(로컬 날짜)
    good: number;
    total: number;             // 🔴 **SLI의 분모** = 잴 수 있었던 요청 수
    requests: number | null;   // 그날 전체 요청 수. 🔴 V53 이전에 굳은 행은 null(0이 아니다)
    mixedBounds: boolean;      // 🔴 그날의 SLI가 부분 관측인가
    sliPct: number | null;
    budgetRemainingPct: number | null;   // 🔴 그날 **끝** 시점의 값(오늘 칸은 **조회 시점의 롤링 창**)
    burn1h: number | null;               // 🔴 그날 마지막 1시간
    burn6h: number | null;
    today: boolean;            // 아직 끝나지 않은 하루
    finalized: boolean;        // 🔴 하루가 끝난 뒤 굳힌 값인가. false면 진행분이라 하루 전체가 아니다
    measuredUntil: string | null;  // 그 하루 안에서 어디까지 쟀나. V53 이전 행은 null
    staleDefinition: boolean;  // 🔴 이 칸을 잰 기준이 지금 SLO 설정과 다른가(되계산하지 않는다)
    target: number | null;     // 계산 당시의 목표(%)
    windowDays: number | null; // 계산 당시의 롤링 창
    latencyThresholdMs: number | null;   // 계산 당시의 지연 임계
    computedAt: string;
  }[];
};

type SloSeries = {
  step: number;                // 초. 🔴 **실제로 쓴 값**이라 요청과 다를 수 있다
  target: number;              // 차트의 markLine
  errorBudgetTotal: number | null;   // 번다운의 분모
  points: {
    ts: number;                // 칸 시작(ms 에폭)
    sliPct: number | null;     // 🔴 그 칸만의 SLI(칸마다 독립)
    requests: number;          // 0 가능 — 🔴 요청 없는 칸도 점으로 온다
    measured: number;          // 🔴 그 칸의 SLI 분모. requests보다 작으면 그 차이가 못 잰 요청이다
    mixedBounds: boolean;      // 🔴 그 칸이 부분 관측인가(표·스냅샷과 같은 규칙)
    budgetRemainingPct: number | null; // 🔴 창 시작부터 **누적**. 단조 감소
  }[];
};
```

### 요청 본문 (POST · PUT 공통)

```ts
type SloUpsert = {
  serviceUid?: string;   // 생성 필수 · 🔴 수정 시 무시(못 바꾼다)
  sliKind?: 'AVAILABILITY' | 'LATENCY';  // 생성 필수 · 🔴 수정 시 무시
  name?: string;
  target?: number;       // %
  windowDays?: 7 | 30;
  latencyThresholdMs?: number;   // LATENCY면 생성 시 필수
  enabled?: boolean;             // 생성 시 미지정이면 true
  burnAlertEnabled?: boolean;    // 생성 시 미지정이면 **false**
  burnAlertThreshold?: number;   // 1시간 창 임계. 미지정이면 기존 값 유지, 없으면 14.4.
                                 // 🔴 burnAlertEnabled=false면 **무시된다**(아래)
};
```

**수정은 부분 수정**이다 — 안 보낸 필드는 기존 값을 유지한다. 🔴 `burnAlertThreshold`를 안 보내면
**기존 임계가 그대로 남는다**(기본값으로 되돌아가지 않는다).

### 🔴 알람이 꺼져 있으면 `burnAlertThreshold`는 **버려진다** (2026-09-07 QA D8 — 계약 명시)

임계는 `apm_slo`가 아니라 **`apm_alert_rule` 행**에 산다(`apm_slo`에는 번 관련 컬럼이 없다).
`burnAlertEnabled:false`면 그 행이 아예 없으므로 **저장할 곳 자체가 없다**.

```jsonc
POST /apm/slos  { …, "burnAlertEnabled": false, "burnAlertThreshold": 1 }
→ 200. 응답 burnAlert.threshold = 14.4 (기본값). 그 뒤 목록·상세 어디에도 1은 남지 않는다.
```

**400으로 거절하지 않기로 했다** — FE는 알람을 끌 때 임계를 보내지 않고(§R-13), 값을 저장할
자리를 만들면 "꺼져 있는 알람의 임계"라는 두 번째 진실이 생겨 켤 때 어느 값을 쓸지가 또 갈린다.

🔴 **FE 할 일**: 알람 스위치가 꺼지면 임계 입력을 **함께 비활성화**할 것. 활성인 채로 두면
사용자가 저장 후 값이 바뀐 것을 보게 된다.
⚠️ 그래도 **검증은 한다** — 꺼진 채로 범위 밖 값을 보내면 `APM_ALERT_RULE_INVALID_THRESHOLD`다
(버려질 값인데 400이라 어색하지만, 통과시키면 "이 값은 유효하다"는 신호가 되어 더 나쁘다).

## 1.3 🔴 FE가 반드시 지켜야 할 열한 가지

1. **`sliPct`·`budgetRemainingPct`·`burn1h/6h`의 `null`은 "모름"이다.** 0으로 그리지 말 것.
   그때 `status`는 `UNKNOWN`이고, 배지도 회색이어야 한다(초록 아님 — "수집이 끊긴 것"과
   "완벽한 것"이 같은 색이 되면 안 된다).
2. **`budgetRemainingPct`는 음수가 된다.** `-320%`는 "예산의 4.2배를 태웠다"는 뜻이다.
   게이지·막대는 **화면에서** 0으로 자르되 **숫자는 사실대로** 보여 줄 것.
3. **`burnAlert.slowThreshold`를 다시 계산하지 말 것.** 서버가 `threshold / 2.4`로 내려 준다.
   두 곳에서 계산하면 SRE 표의 쌍(14.4↔6)이 갈리는 날이 온다.
4. **번 레이트 알람은 SLO 화면에서만 켠다.** 알람 규칙 화면(`POST /apm/alert-rules`)으로
   `SLO_BURN`을 만들면 **거절**된다(`APM_ALERT_RULE_SCOPE_INVALID`) — 대상이 서비스가 아니라
   SLO라 거기서는 고를 축이 없다.
5. **캘린더의 빈 날은 행이 없다.** 0으로 채우면 "완전 장애였던 날"로 칠해진다 → **회색 빈 칸**.
   `today: true`인 칸은 **진행 중**이라 다른 칸과 같은 색으로 칠하면 새벽에 본 오늘이 늘
   유난히 좋거나 나빠 보인다.
6. **`series`의 두 곡선은 y축이 다르다.** `sliPct`는 칸마다 독립(오르내림), `budgetRemainingPct`는
   누적이라 **단조 감소**다. 올라가면 그건 버그다.
7. **`step`은 응답 값을 쓸 것.** 보존 때문에 해상도가 승격되면 요청보다 굵어진다(30일 창에
   60초를 요구해도 1시간 단이다).
8. **삭제는 스냅샷 400일치를 함께 지운다.** "잠시 안 보고 싶다"는 `enabled: false`가 맞다 —
   확인 모달이 그 차이를 안내해야 한다.
9. 🔴 **`requests`와 `measured`는 다른 수다** (2026-09-07 신설). `measured`가 SLI의 분모이고
   `requests`는 그 구간에 들어온 요청 전부다. 둘이 갈리면 `mixedBounds: true`이고, 그때 화면은
   **"요청 N건 중 M건만 측정"** 같은 배지를 띄워야 한다 — 안 그러면 *정상 100건 + 측정 불가
   9,900건*이 **SLI 100%**로 보인다(그게 이 필드가 생긴 이유다).
10. 🔴 **`measuredFromMs`/`measuredToMs`가 창과 다를 수 있다.** 롤업 버킷 격자(시작)와 롤업
   지연(끝) 때문이다. 정상 운영에서는 `measuredToMs === windowToMs`이고, 다르면 그만큼의
   최근 구간이 아직 버짓에 반영되지 않았다는 뜻이다 — 툴팁에 적을 것.
11. 🔴 **번 레이트는 네 개다.** 판정은 `(burn1h > T AND burn5m > T) OR (burn6h > T/2.4 AND
   burn30m > T/2.4)`이고, 지금 어느 줄이 넘었는지는 `burnCondition`이 말한다. 확인 창(5m·30m)은
   **"아직도 나쁜가"**를 묻는 값이라 크기로 순위를 매기지 말 것.

## 1.4 정의 — 숫자가 무엇을 세는가

| 항목 | 정의 |
|---|---|
| **SLI (AVAILABILITY)** | `성공 요청 / 전체 요청`. 실패 = `status_class = '5xx'`(가용성 판정과 **같은 정의**). 🔴 **4xx는 실패가 아니다** — 클라이언트 잘못을 서버의 약속 위반으로 세면 봇 트래픽 하나가 SLO를 깨뜨린다 |
| **SLI (LATENCY)** | `임계 이하 응답 / **잴 수 있었던** 요청`. 히스토그램 버킷 누적이고, 임계가 버킷을 가로지르면 **균등 분포로 보간**(Apdex와 같은 규약). 🔴 `+∞` 버킷은 절대 세지 않는다. 🔴 분모는 `measured`다 — 히스토그램이 없거나 경계가 갈린 조각은 분모에서 빠지고 `mixedBounds`가 선다 |
| **measured vs requests** | 🔴 `measured` ≤ `requests`. AVAILABILITY는 언제나 같고, LATENCY만 갈릴 수 있다. 차이가 곧 **우리가 못 잰 요청**이다 |
| **오차 예산** | `(1 - target/100) × measured`. 🔴 반올림하지 않는다 |
| **남은 버짓 %** | `(허용 실패 - 실제 실패) / 허용 실패 × 100` |
| **번 레이트** | `창 안의 나쁜 비율 / (1 - target)`. 🔴 창 길이는 식에 들어가지 않는다 — 창은 "얼마나 최근의 속도인가"만 정한다 |
| **창** | 지금부터 거슬러 센 롤링 창(`windowDays × 24시간`). 🔴 **날짜 경계로 자르지 않는다** — 새로고침마다 값이 조금씩 움직이는 것이 정상이다 |
| **status** | `UNKNOWN`(버짓을 못 잼) → `BREACH`(남은 버짓 ≤ 0) → `WARN`(남은 버짓 < 25% **또는** 지금 번 중) → `OK`. 🔴 WARN 조건이 OR인 것이 중요하다: 버짓 90%가 남았어도 1시간째 14.4배로 태우면 **오늘 안에 다 쓴다** |

### 🔴 가용성 SLI ≠ 서비스 화면의 `availability24hPct`

저쪽은 **5분 칸**을 세고(한 칸이 UP이면 1), 이쪽은 **요청**을 센다. 초당 1000건이 5분간 전부
500을 뱉은 서비스는 스트립에서 칸 하나만 잃지만 SLI에서는 30만 건을 잃는다. **요청 가중이
SRE의 SLO 정의**이고 스트립은 "그 시각에 살아 있었나"라는 다른 질문에 답한다 — 두 숫자가
다르다고 버그가 아니다. 화면에 둘을 나란히 놓지 말 것.

### ⚠️ 캘린더 합계와 표의 SLI는 정확히 같지 않다

표는 **롤링 창**(지금부터 30×24시간), 캘린더는 **자정으로 잘린 날짜**들이다. 오후에 보면
반나절이 어긋난다. 두 숫자를 더해 맞추려 하지 말 것 — 창의 정의가 다르고 둘 다 맞다.

### 🔴 정의를 바꾸면 **그날 이후만** 새 기준이다 — 과거는 되계산하지 않는다 (3차 검수 #5)

`target`·`windowDays`·`latencyThresholdMs`를 고치면 `def_version`이 오르고, **그 뒤에 굳는 일
스냅샷만** 새 기준으로 계산된다. 이미 굳은 날은 그대로다(감사 관점 — "지난주에 우리가 본 값"을
사후에 바꾸지 않는다. 되계산하려 해도 원자료 5m 롤업은 30일만 산다).

- **롤링 창의 SLI**(이 화면)는 창 안에 정의 변경이 끼면 **두 기준의 날이 섞인 값**이다.
  임계를 100ms → 500ms로 바꾸면 같은 200ms 요청이 앞 며칠엔 실패, 뒤 며칠엔 성공으로 세어져 있다.
- **리포트**(§8.3)는 그 사실을 `slos[].definitionChanged: true`로 **명시해서 싣는다**.
  이 화면에도 같은 안내가 필요하면 `apm_slo_snapshot`의 기준 컬럼을 노출하는 EP가 있어야 한다
  — 지금은 없다(캘린더가 날짜별 `target`을 이미 들고 있으니 그것으로 대신할 수 있다).

## 1.5 번 레이트 알람 — 멀티윈도우 (WBS 2.3b)

- **kind는 기존 `SLO_BURN`이다.** 설계·WBS의 `SLO_BURN_RATE`는 **같은 것의 다른 표기**이고
  BE가 별칭으로 받는다. 🔴 계약 enum과 Zabbix 아이템 키 접미사가 이미 `slo_burn`이라
  **이름을 바꾸지 않았다**(바꾸면 만들어진 아이템의 이력이 끊기고 FE enum 매칭이 빗나간다).
- **아이템 키**: `apm.slo_burn[<slo_uid>]` — 🔴 서비스 UUID가 아니라 **SLO UUID**다.
- **발화 조건 (🔴 2026-09-07 개정 — SRE 원문대로 고쳤다)**:
  ```
  ( burn1h > T      AND  burn5m  > T      )     ← 빠른 소진: 즉시 페이지
  OR
  ( burn6h > T/2.4  AND  burn30m > T/2.4  )     ← 느린 소진: 몇 시간에 걸쳐 샌다
  ```
  - 🔴 **두 줄은 OR다.** 예전 구현은 두 줄을 AND로 묶어 `burn1h = burn6h = 10`인 **지속 장애가
    발화하지 않았다**(1시간 조건이 14.4를 못 넘어서). 두 줄은 서로 다른 알람이다.
  - 🔴 **AND는 줄 *안*에 있다.** 긴 창(1h·6h)이 "심각한가"를, 짧은 확인 창(5m·30m)이 **"아직도
    나쁜가"**를 묻는다. 확인 창이 없으면 1시간 창의 기억 때문에 **이미 복구된 장애로 최대
    1시간을 더 울린다**.
  - 한 줄의 값이 하나라도 `null`이면 그 줄만 판정하지 않는다(다른 줄은 그대로 본다).
- **기본 임계는 창 길이에서 계산한다**: `0.02 × windowDays × 24` → **30일 14.4 · 7일 3.36**.
  🔴 7일 창에 14.4를 쓰면 "1시간에 예산의 2%"가 아니라 **약 8.57%**다(예전 구현의 오류).
- 🔴 **임계 상한 = `1/(1-목표)`**(`burnAlert.maxThreshold`). 모든 요청이 실패해도 번 레이트는
  이 값을 넘지 못하므로, 이 값 **이상**을 임계로 두면 **영원히 발화하지 않는다**. 서버가
  거절한다(`APM_ALERT_RULE_INVALID_THRESHOLD`). 예: 목표 90% → 최대 10 → 기본 14.4는 무효라
  서버가 **최대의 절반**(5)을 기본값으로 준다.
- **임계 하한은 1이고 1은 허용한다**. 판정이 `초과`라 1로 두어도 자동 발화가 아니다.
  ⚠️ 예전 코드는 `<= 1`로 **1까지 거절**했다(계약 문구와 어긋나 있었다) — 지금은 계약대로다.
- 🔴 **Zabbix 아이템 `apm.slo_burn[<slo_uid>]`의 값 규약** (트리거는 `>0`):

  | 값 | 뜻 | 트리거 |
  |---|---|---|
  | `> 0` | 위반 중. 값은 **발화한 줄의 긴 창** 번 레이트(빠른 줄이면 1h, 느린 줄만이면 6h) | 발화 |
  | `0` | **쟀고 정상**이다 | 해소 |
  | `-1` | 🔴 **측정 불가**(요청 0건·히스토그램 경계 혼재) | 해소(발화 안 함) |

  - 🔴 `-1`은 2026-09-07 신설이다. 전에는 측정 불가일 때 **아무것도 밀지 않아** 아이템의 마지막
    양수가 남았고, 트리거가 참인 채 유지돼 **"수집이 끊겼다"가 "계속 타는 중"으로** 보였다.
    반대로 0을 밀면 "괜찮다"가 되어 가장 나쁜 순간에 조용해진다 — 그래서 셋째 값이다.
  - 🔴 **어느 줄이 넘었는지는 값으로 구분되지 않는다**(같은 축의 번 레이트라서). 그 정보는
    `SloRow.burnCondition`과 서버 로그가 말한다 — 아이템 값에 코드를 섞으면 그 이력을 더 이상
    "번 레이트"라고 부를 수 없다.
  - ⚠️ 그래서 `apm.slo_burn[...]` 이력은 대부분 0이고 발화 구간에만 값이 뜬다 —
    **그 그래프를 "번 레이트 추이"로 읽으면 안 된다**(추이는 SLO 화면의 번다운 곡선이다).
- **드리프트 해소 THEIRS는 막힌다**(`APM_ALERT_RESYNC_MODE_INVALID`) — 트리거 상수가 항상 0이라
  채택하면 임계가 0이 된다. `STALE`과 같은 이유.
- **SLO를 끄면 5분 안에 조용해진다**: `targetsOf`가 빈 목록을 주고 고아 정리가 트리거를 내린다.
  규칙 행은 남는다(지우는 것은 SLO 삭제 경로).

## 1.6 오류 코드 (신설 6)

| code | body code | 언제 |
|---|---|---|
| `APM_SLO_NOT_FOUND` | 404 | 없는 `sloUid`(형식 오류도 같은 코드) |
| `APM_SLO_KIND_UNSUPPORTED` | 400 | `sliKind`가 `AVAILABILITY`·`LATENCY` 둘 다 아니다 |
| `APM_SLO_INVALID_TARGET` | 400 | 🔴 `0 < target < 100`이 아니다. **100을 막는 것은 위생이 아니다** — 오차 예산이 0이라 버짓·번 레이트가 0으로 나누는 식이 되고 화면에 `Infinity`가 뜬다 |
| `APM_SLO_INVALID_WINDOW` | 400 | 창이 7·30이 아니다 |
| `APM_SLO_LATENCY_THRESHOLD_REQUIRED` | 400 | LATENCY인데 `latencyThresholdMs`가 없거나 0 이하. 🔴 기본값을 지어내지 않는다 |
| `APM_SLO_NAME_REQUIRED` | 400 | 이름이 비었거나 120자 초과 |
| `APM_SLO_DUPLICATE` | **409** | 같은 서비스에 같은 이름(대소문자 무시) |

기존 재사용: `APM_SERVICE_NOT_FOUND`(404), `APM_ALERT_RULE_SCOPE_INVALID`(400 — 알람 화면에서
`SLO_BURN`을 만들려 할 때), `APM_ALERT_RULE_INVALID_THRESHOLD`(400 — 번 임계 ≤ 1).

## 1.7 예시 JSON

> ✅ **2026-09-07: 표본 파일이 생겼다**(FE 요청 R-1). 아래 인라인 예시 대신
> `moveseye-be-spring/src/test/resources/apm/contract/` 의 파일을 정본으로 쓸 것 —
> `slos.json` · `slo-detail.json` · `slo-series.json` ·
> `widget-status-summary.json` · `widget-slow-services.json` · `widget-alerts.json`.
> 이 여섯은 `ApmContractFixtureTest`가 **실제 응답 DTO를 직렬화해 대조**하므로,
> 응답 모양이 바뀌면 BE 테스트가 먼저 깨진다.
> ⚠️ 아래 인라인 예시는 **V53 이전 필드 집합**이라 새 필드(`measured`·`mixedBounds`·
> `measuredFromMs/ToMs`·`burn5m/30m`·`burnCondition`·`maxThreshold`·`finalized` …)가 빠져 있다.


<details><summary><code>GET /apm/slos</code></summary>

```json
{
  "status": "success", "code": 200,
  "data": [
    {
      "sloUid": "3f6b1c22-9a01-4c1e-9a10-1d2e3f405060",
      "serviceUid": "aaaaaaaa-0000-4000-8000-000000000001",
      "serviceName": "결제 API",
      "name": "가용성 99.9%",
      "sliKind": "AVAILABILITY",
      "target": 99.9, "windowDays": 30, "latencyThresholdMs": null, "enabled": true,
      "windowFromMs": 1770000000000, "windowToMs": 1772592000000,
      "sliPct": 99.8, "requests": 10000, "good": 9980.0,
      "errorBudgetTotal": 10.0, "errorBudgetUsed": 20.0, "budgetRemainingPct": -100.0,
      "burn1h": 2.0, "burn6h": 1.4, "status": "BREACH",
      "burnAlert": {
        "enabled": true, "threshold": 14.4, "slowThreshold": 6.0,
        "ruleUid": "9c2f0a11-5555-4444-8888-777766665555",
        "zabbixSynced": true, "zabbixError": null
      },
      "createdAt": "2026-08-01T00:00:00.000Z", "updatedAt": "2026-09-07T01:00:00.000Z"
    },
    {
      "sloUid": "7d8e9f00-1111-4222-8333-444455556666",
      "serviceUid": "bbbbbbbb-0000-4000-8000-000000000002",
      "serviceName": "주문 API",
      "name": "지연 500ms",
      "sliKind": "LATENCY",
      "target": 99.0, "windowDays": 7, "latencyThresholdMs": 500, "enabled": true,
      "windowFromMs": 1771987200000, "windowToMs": 1772592000000,
      "sliPct": null, "requests": 0, "good": 0.0,
      "errorBudgetTotal": null, "errorBudgetUsed": 0.0, "budgetRemainingPct": null,
      "burn1h": null, "burn6h": null, "status": "UNKNOWN",
      "burnAlert": {
        "enabled": false, "threshold": 14.4, "slowThreshold": 6.0,
        "ruleUid": null, "zabbixSynced": false, "zabbixError": null
      },
      "createdAt": "2026-09-05T00:00:00.000Z", "updatedAt": "2026-09-05T00:00:00.000Z"
    }
  ]
}
```

두 번째 행이 **"모름"의 표준 모양**이다 — 요청 0건이라 SLI·버짓·번 레이트가 전부 `null`이고
`status`는 `UNKNOWN`이다. 🔴 이 행을 초록으로 칠하면 안 된다.

</details>

<details><summary><code>GET /apm/slos/{uid}</code>의 <code>calendar</code></summary>

```json
"calendar": [
  { "day": "2026-09-04", "good": 9995.0, "total": 10000, "sliPct": 99.95,
    "budgetRemainingPct": 50.0, "burn1h": 0.5, "burn6h": 0.4,
    "today": false, "computedAt": "2026-09-05T00:50:00.000Z" },
  { "day": "2026-09-06", "good": 9980.0, "total": 10000, "sliPct": 99.8,
    "budgetRemainingPct": -100.0, "burn1h": 20.0, "burn6h": 8.0,
    "today": false, "computedAt": "2026-09-07T00:50:00.000Z" },
  { "day": "2026-09-07", "good": 4000.0, "total": 4000, "sliPct": 100.0,
    "budgetRemainingPct": 62.5, "burn1h": null, "burn6h": null,
    "today": true, "computedAt": "2026-09-07T10:00:00.000Z" }
]
```

🔴 **`2026-09-05`가 없다** — 그날은 트래픽이 0건이라 스냅샷을 굳히지 않았다. 화면은 그 칸을
**회색 빈 칸**으로 그려야 한다(0으로 채우면 완전 장애로 보인다).
🔴 마지막 칸은 `today: true`이고 `burn1h/6h`가 `null`이다 — 오늘 칸은 조회 시점에 다시 재는데
번 레이트는 "그날 끝" 기준 값이라 아직 존재하지 않는다.

</details>

## 1.8 배치·보존 (FE가 알아야 할 것만)

- **일 스냅샷 배치** `apm_slo_snapshot`, 매일 **00:50**. 어제를 확정하고, 오늘 진행분을 쓰고,
  창 안에서 빠진 날을 백필한다(🔴 **5m 롤업 보존 30일 안쪽만** — 그 밖은 원본이 없어 0을
  굳히게 되고 그 0은 캘린더에 **없는 사고**로 박힌다).
- 🔴 **`finalized`(2026-09-07 신설)**: 백필 판정이 "행이 있나"에서 **"확정됐나"**로 바뀌었다.
  D일 00:50에 쓴 50분치 진행분이 D+1 배치 실패 뒤 **하루 전체로 영구히 굳던** 문제를 막는다.
  미확정 행은 다음 회차가 다시 계산하고, **확정된 행은 절대 미확정으로 돌아가지 않는다**
  (돌아가면 보존이 지난 뒤 매일 밤 조금씩 작아진다).
- 🔴 **재계산 정책**: 과거 스냅샷은 **되계산하지 않는다**(감사 관점 — "지난주에 우리가 본 값"을
  사후에 바꾸지 않는다). 대신 행이 **당시 설정**(`target`·`windowDays`·`latencyThresholdMs` +
  정의 버전)을 갖고 있어, 지금 설정과 다르면 `staleDefinition: true`로 알린다. 화면은 그 칸에
  "다른 기준으로 잰 값" 배지를 띄우면 된다.
- 🔴 **화면의 오늘 칸은 스냅샷을 쓰지 않는다** — 조회 시점에 다시 잰다. 배치가 새벽 한 번만
  돌기 때문에, 그러지 않으면 오늘 칸이 하루 종일 00:50의 (사실상 빈) 값으로 굳어 있다.
- **보존 400일**(`apm_retention` 잡의 `sloSnapshots` 단계). 🔴 이 400일이 **캘린더가 볼 수 있는
  과거의 상한**이다 — 5m 롤업이 30일이라 되계산이 안 된다.

---

# §2. 홈 위젯 3종 (WBS 4.5 · 7.19)

## 2.1 카탈로그 등록

BE `HomeWidgetType`에 **3종**을 더했다(카탈로그가 18 → **21종**). FE 사본
`src/constants/homeWidgets.ts`·`src/types/home.ts`·`src/pages/home/widgets/registry.tsx`와
i18n 키(`home.widget.catalog.<code>.title|description`)를 맞춰야 한다.

| code | pinned | unique | adminOnly | 기본 w×h | 기본 세트 |
|---|---|---|---|---|---|
| `apm_status` | — | ✔ | **아니다** | 6×8 | ❌ |
| `apm_slow_services` | — | ✔ | **아니다** | 4×8 | ❌ |
| `apm_alerts` | — | ✔ | **아니다** | 6×10 | ❌ |

- 🔴 **`adminOnly`가 아니다.** APM의 권한 축은 역할이 아니라 **DMOVE 권한 `apm.view`**이고
  기본값이 **열림**이다(§3). 홈 카탈로그에는 그 축이 없어서 `adminOnly` 불리언으로는 표현할 수
  없다 — 그래서 **카탈로그는 열어 두고 거부는 EP가** 한다(200 + body `code:403`).
  ⚠️ 카탈로그에서 아예 감추려면 FE `isHomeWidgetTypeVisible`에 `permissions.apm.view`를 태운다
  (`ai_monitor_cost`가 `AI_MONITOR_ENABLED`로 하는 것과 같은 자리).
- 🔴 **기본 세트(`HomeWidgetDefaults`)에는 넣지 않았다.** 수집기를 설치하지 않은 설치본(대다수)에서
  홈에 빈 카드가 생긴다 — `cloud_fleet`·`ai_monitor_cost`와 같은 규칙이다.

## 2.2 EP 표

| 메서드 | 경로 | 권한 | 응답 `data` |
|---|---|---|---|
| GET | `/apm/widgets/status-summary?limit=5` | `apm.view` | `StatusWidget` |
| GET | `/apm/widgets/slow-services?limit=5` | `apm.view` | `SlowServicesWidget` |
| GET | `/apm/widgets/alerts?limit=5` | `apm.view` | `AlertsWidget` |
| GET | `/apm/widgets/traffic-totals` | `apm.view` | `TrafficWidget` — 2026-09-15(ZM-122) 추가. 개요 `totals`와 같은 계산(요청/s·오류율·p95·활성 + 직전 창), 홈 기본 세트의 `apm_traffic_kpi`가 쓴다 |

`limit` 기본 5, 상한 20.

🔴 **`GET /apm/overview`를 위젯에 쓰지 말 것.** 저쪽은 목록 한 벌 + 합계 **두 벌**(현재·직전 창)
+ 히트맵을 만들어 **서비스 목록보다 비싸고**, 홈은 그것을 카드마다 폴링한다.

ℹ️ **폴링 비용(2026-09-07 개선)**: 세 EP가 공유하는 계산(서비스 목록 한 벌, SLO 표 한 벌)에
**30초 공용 캐시**가 붙었고, SLO 표는 서비스 축 배치 질의로 바뀌어 **질의 수가 SLO 수와
무관**해졌다. 홈이 30초 주기로 세 카드를 함께 폴링해도 계산은 한 번이다.
⚠️ 캐시는 **권한과 무관한 값만** 담는다(APM 권한은 EP 진입에서 판정하며 데이터 필터가 아니다).

## 2.3 타입

```ts
type StatusWidget = {
  summary: { total: number; up: number; degraded: number; down: number;
             stale: number; unknown: number };   // 도넛
  errorTop: { serviceUid: string; displayName: string; errorRatePct: number }[];
  windowMinutes: number;   // 🔴 서버가 정한 창. "최근 N분" 문구는 **이 값으로** 만들 것
};

type SlowServicesWidget = {
  services: { serviceUid: string; displayName: string; p95Ms: number;
              status: 'UP'|'DEGRADED'|'DOWN'|'STALE'|'UNKNOWN' }[];
  windowMinutes: number;
};

type AlertsWidget = {
  alerts: {                       // 이미 터진 것
    eventId: number;
    serviceUid: string | null; displayName: string | null;   // 수집기 축이면 null
    kind: string;                 // 계약 표기(P95_LATENCY 등)
    thresholdUnit: 'pct'|'ms'|'min'|'count'|'ratio'|'';
    value: number | null;
    firedAt: string;
    resolvedAt: string | null;    // 🔴 null = 아직 열려 있다
  }[];
  sloRisks: {                     // 곧 터질 것
    sloUid: string;
    serviceUid: string | null; displayName: string | null;
    name: string;
    sliKind: 'AVAILABILITY' | 'LATENCY';
    target: number;
    budgetRemainingPct: number | null;   // 🔴 음수 가능
    burn1h: number | null;
    status: 'WARN' | 'BREACH';           // 🔴 OK·UNKNOWN은 오지 않는다
  }[];
  windowMinutes: number;
};
```

## 2.4 🔴 FE가 반드시 지켜야 할 다섯 가지

1. **"최근 N분"을 지어내지 말 것.** 홈에는 시간 선택기가 없어 서버가 창을 정하고
   `windowMinutes`로 내려 준다(현재 60). 하드코딩하면 서버가 창을 바꾸는 순간 문구가 거짓이 된다.
2. **`errorTop`·`services`에서 빠진 서비스가 있는 것이 정상이다.** 오류율·p95를 **잴 수 없는**
   서비스는 순위에서 뺀다 — 0으로 채우면 조용한 서비스가 "완벽한 서비스"로 목록을 채우고,
   "가장 느린 서비스"에 트래픽 없는 서비스가 뜬다.
3. **느린 서비스의 색은 `status`로 칠할 것 — ms로 기준을 만들지 말 것.** "느리다"의 임계는
   서비스마다 다르고(`apm_service.slow_threshold_ms`) 판정은 서버가 이미 했다.
   ⚠️ **p95 1위인데 `UP`인 경우가 정상이다**(그 서비스에는 느리지 않다).
4. **`alerts`와 `sloRisks`는 성질이 반대다.** 전자는 과거("밤새 뭐가 났나"), 후자는 미래
   ("오늘 뭐가 날 것 같은가"). 한 카드 안에서 **구획을 나눠** 보여 줄 것.
5. **`sloRisks`가 비어 있는 것과 SLO가 없는 것은 다르다.** 이 목록에는 `WARN`·`BREACH`만 온다 —
   "위험한 것이 없다"는 뜻이지 "SLO를 안 쓴다"가 아니다. 빈 상태 문구를 그렇게 쓸 것.

⚠️ **`alerts`는 창 안에 *발화한* 것만이다.** 창 이전에 나서 아직 열려 있는 알람은 나오지 않는다
(개요 위젯과 같은 정의). "지금 열려 있는 것 전부"는 알람 화면(메뉴 12)의 몫이다.

---

# §3. 합성 감시 (메뉴 9 · WBS 2.6·2.7)

> 설계 `devdesign_apm.md` §8.1 "합성 감시" 행 · §9 · 화면 `devdesign_apm-screens-wbs.md` §3.16 ·
> 서비스 상세 합성 탭 §3.13.

## 3.0 이 메뉴만 원천이 Zabbix다 — 무엇이 그로부터 따라오는가

APM의 다른 모든 시그널은 OTel Collector로 들어오지만 **합성 감시만 Zabbix의 웹 시나리오**다
(설계 §9: 이미 있고 실사용 중이라서). 그래서 FE가 알아야 할 성질이 셋 생긴다.

1. **정본이 우리 DB가 아니다.** 이름·단계·주기는 매번 Zabbix에서 읽는다. Zabbix UI에서 바꾸면
   즉시 우리 화면에 반영된다(반대도 마찬가지). 우리가 저장하는 것은 **서비스 연결 한 줄**뿐이다.
2. **창이 Zabbix history 보존에 잘린다.** 30일 캘린더를 물어도 그 아이템의 보존이 7일이면
   **7일치만** 온다. 그래서 캘린더는 `coveredDays`를 함께 준다 — 🔴 **빈 날을 0%로 채우지 말 것**.
3. **시나리오가 사라질 수 있다.** Zabbix에서 지워도 우리 연결 행은 남는다 → `orphaned: true`.

## 3.1 EP 표

| 메서드 | 경로 | 권한 | 응답 `data` |
|---|---|---|---|
| GET | `/apm/synthetics?service={serviceUid}&hostId=` | `apm.view` | `SyntheticRow[]` |
| GET | `/apm/synthetics/{httptestId}` | `apm.view` | `SyntheticDetail` |
| GET | `/apm/synthetics/{httptestId}/results?from&to` | `apm.view` | `SyntheticResults` |
| GET | `/apm/synthetics/{httptestId}/calendar?days` | `apm.view` | `SyntheticCalendar` |
| GET | `/apm/synthetics/proxies` | `apm.view` | `SyntheticProxies` |
| GET | `/apm/synthetics/error-catalog` | `apm.view` | `SyntheticReason[]` |
| POST | `/apm/synthetics` | `apm.edit` | `SyntheticDetail` |
| PUT | `/apm/synthetics/{httptestId}` | `apm.edit` | `SyntheticDetail` |
| DELETE | `/apm/synthetics/{httptestId}` | `apm.edit` | `{ deleted, httptestId }` |
| GET | `/apm/services/{uid}/synthetics` | `apm.view` | `SyntheticBound[]` |
| POST | `/apm/services/{uid}/synthetics/bind` | `apm.edit` | `SyntheticBound` |
| POST | `/apm/services/{uid}/synthetics/unbind` | `apm.edit` | `{ unbound, httptestId }` |

**설계서와 다른 점 3가지**(전부 의도적, 근거는 §7.1):
- `GET /apm/synthetics/{id}` **단건 조회를 추가**했다(설계 표에 없다). 수정 폼이 단계의
  `httpStepId`까지 되돌려 보내야 하는데 목록에는 그 값이 없고, 목록에 다 실으면 시나리오 수 ×
  단계 수만큼의 JSON을 목록이 늘 헛되이 받는다.
- `bind`/`unbind`가 **POST + 본문**이다(경로에 id를 넣지 않는다).
- `error-catalog`·`proxies`는 **조회 권한**이다(관리 폼의 선택지이지만 비밀값이 없다).

## 3.2 타입

```ts
type SyntheticRow = {
  httptestId: string;          // Zabbix httptestid. URL·수정·삭제의 식별자
  name: string;                // Zabbix 정본
  hostId: string;
  hostName: string | null;
  delaySec: number | null;     // 표시용. 되돌려 보낼 값은 delayRaw다. 🔴 매크로면 null
  delayRaw: string;            // "1m" 또는 "{$INTERVAL}" 등 Zabbix 표기 원문
  proxyId: string | null;      // 🔴 monitoredBy='PROXY'일 때만 값이 있다
  proxyName: string | null;    // 〃
  monitoredBy: 'SERVER' | 'PROXY' | 'PROXY_GROUP' | 'UNKNOWN';  // 🔴 실행 위치 판정 축
  proxyGroupId: string | null; // PROXY_GROUP일 때만. 🔴 그룹 **이름은 알 수 없다**
  locationName: string;        // 🔴 화면에 그대로 쓰는 이름. 절대 null이 아니다
                               //    ('Zabbix server' | 프록시 이름 | '프록시 그룹' | '확인 불가')
  enabled: boolean;            // 🔴 Zabbix status=0 이 활성이다(BE가 뒤집어 준다)
  stepCount: number;
  firstUrl: string | null;
  tags: string[];              // "k=v" 또는 값 없는 "k"

  lastStatus: 'OK' | 'FAILED' | 'UNKNOWN';
  lastCheckedAtMs: number | null;
  lastReason: SyntheticReason | null;   // 성공·미실행이면 null
  lastFailedStepNo: number | null;      // 🔴 0은 성공이라 여기 오지 않는다

  availability24hPct: number | null;    // 🔴 이력이 없으면 null (0%가 아니다)
  checks24h: number;                    // 가용성의 분모 = **관측된** 실행 수

  // 🔴 "이 가용성을 믿어도 되는가" — 분모 규약은 그대로 두고 신뢰도를 따로 말한다.
  //    이 넷이 없으면 **23시간 전 성공 한 점**도 OK·100%로 보인다.
  expectedChecks24h: number | null;     // 주기로 따진 기대 실행 수. 주기가 매크로면 null
  coveragePct: number | null;           // checks24h / expectedChecks24h ×100 → **수집 공백**
  staleSeconds: number | null;          // 마지막 관측이 몇 초 전인가
  stale: boolean;                       // 🔴 주기의 3배(최소 5분) 초과 = 수집이 끊겼다
  truncated: boolean;                   // 🔴 조회 상한에 걸려 값이 잘렸다(수집 공백이 **아니다**)

  p95Ms: number | null;
  p95WindowMinutes: number;             // 🔴 60 — 가용성 창(24h)과 **다르다**

  boundServiceUid: string | null;
  boundServiceName: string | null;
  boundLabel: string | null;
};

type SyntheticReason = {
  code: string;      // NONE | UNKNOWN | TIMEOUT | DNS_FAILED | CONNECT_REFUSED | PROXY_UNAVAILABLE
                     // | TLS_CERT_EXPIRED | TLS_HOSTNAME_MISMATCH | TLS_CERT_INVALID
                     // | STATUS_CODE_MISMATCH | REQUIRED_PATTERN_MISSING | TOO_MANY_REDIRECTS
                     // | EMPTY_RESPONSE | RECEIVE_FAILED | AUTH_FAILED
  title: string;     // 한 줄 요약(한국어)
  hint: string | null;   // 무엇을 해 볼 것인가. 🔴 없으면 null — 지어내지 않는다
  raw: string | null;    // 🔴 Zabbix 원문. 분류된 사유에도 **언제나** 함께 온다
};

type SyntheticDetail = {
  httptestId: string; name: string;
  hostId: string; hostName: string | null;   // 🔴 hostId는 수정으로 바꿀 수 없다
  delay: string; delaySec: number | null;   // 🔴 delay는 매크로일 수 있다 → delaySec=null
  retries: number | null; agent: string;
  proxyId: string | null; proxyName: string | null;   // 읽기 전용. PROXY일 때만
  monitoredBy: 'SERVER' | 'PROXY' | 'PROXY_GROUP' | 'UNKNOWN';
  locationName: string;                               // 🔴 null이 아니다
  enabled: boolean;
  authentication: 'NONE' | 'BASIC' | 'NTLM' | 'KERBEROS' | 'DIGEST';
  httpUser: string | null;
  httpPasswordSet: boolean;    // 🔴 값 자체는 절대 내려오지 않는다
  httpProxy: string | null;    // 시나리오 자체의 HTTP 프록시(Zabbix 프록시와 다르다)
  variables: Record<string, string>;
  headers: Record<string, string>;
  tags: string[];
  steps: SyntheticStep[];      // no 오름차순
  boundServiceUid: string | null; boundLabel: string | null;
};

type SyntheticStep = {
  httpStepId: string | null;   // 🔴 기존 단계는 **그대로 되돌려 보낼 것**(아래 §3.3-1)
  name: string;                // 🔴 결과 아이템 키의 축
  no: number;                  // 🔴 배열 순서가 아니라 이 숫자가 순서다
  url: string;
  statusCodes: string | null;  // "200" 또는 "200,201-204". null = 검사 안 함
  required: string | null;     // 정규식. null = 검사 안 함
  timeout: string | null;      // "15s"
  queryFields: Record<string, string>;
  headers: Record<string, string>;
  variables: Record<string, string>;
  postsRaw: string | null;     // postType=RAW일 때만 (그 외엔 null)
  postFields: Record<string, string>;  // postType=FORM일 때만 (그 외엔 {})
  postType: 'FORM' | 'RAW';    // 🔴 Zabbix는 posts의 **타입**으로 형식을 정한다(아래 §3.3-10)
  followRedirects: boolean;
  retrieveMode: 'BODY' | 'HEADERS' | 'BOTH';
};

type SyntheticResults = {
  httptestId: string; fromMs: number; toMs: number;
  truncated: boolean;          // 🔴 조회 상한에 걸려 잘렸다 — 창을 좁힐 것.
                               //    **수집 공백이 아니다**(그쪽은 coveragePct·stale)
  steps: {
    name: string; no: number;
    points: { ts: number; responseMs: number | null; code: number | null; bps: number | null }[];
    p95Ms: number | null;
  }[];
  failures: {
    ts: number;
    failedStepNo: number | null; failedStepName: string | null;
    reason: SyntheticReason;
  }[];                          // 최근순
  availabilityPct: number | null; checks: number; p95Ms: number | null;
  expectedChecks: number | null;   // 창 길이 / 주기
  coveragePct: number | null;      // checks / expectedChecks → 수집 공백
  staleSeconds: number | null;     // 🔴 창이 아니라 **지금** 기준이다
  stale: boolean;
};

type SyntheticCalendar = {
  httptestId: string; days: number;
  coveredDays: number;          // 🔴 days보다 작은 것이 정상(Zabbix history 보존)
  truncated: boolean;           // 🔴 조회 상한에 걸려 앞쪽 날짜만 찼을 수 있다 → days를 줄일 것
  calendar: { day: string; checks: number; failures: number;
              availabilityPct: number;
              expectedChecks: number | null;   // 그날 기대 실행 수(86400/주기)
              coveragePct: number | null;      // 🔴 낮으면 초록 칸이어도 하루를 대표하지 못한다
                                               //    (오늘 칸은 진행 중이라 자연히 낮다)
              today: boolean }[];              // 🔴 측정 없는 날은 **행이 없다**
  byProxy: { proxyId: string | null; proxyName: string;
             monitoredBy: 'SERVER' | 'PROXY' | 'PROXY_GROUP' | 'UNKNOWN';
             proxyGroupId: string | null;
             httptestId: string; name: string;
             self: boolean; availabilityPct: number | null; checks: number }[];
};

type SyntheticProxies = {
  locations: { proxyId: string | null;      // 🔴 null이 '서버'라는 뜻이 **아니다** — 그룹도 null
               proxyName: string;           // 'Zabbix server' | 프록시 이름 | '프록시 그룹' | '확인 불가'
               monitoredBy: 'SERVER' | 'PROXY' | 'PROXY_GROUP' | 'UNKNOWN';  // 🔴 판정 축
               proxyGroupId: string | null;
               hostCount: number; scenarioCount: number;
               hosts: { hostId: string; hostName: string }[] }[];   // 위치당 최대 200
                              // 순서: 서버 → 프록시들 → 프록시 그룹들 → 확인 불가
};

type SyntheticBound = {
  httptestId: string; label: string | null;
  orphaned: boolean;            // 🔴 true면 아래 값이 전부 null이다
  name: string | null; hostName: string | null; firstUrl: string | null;
  proxyName: string | null;
  monitoredBy: 'SERVER' | 'PROXY' | 'PROXY_GROUP' | 'UNKNOWN' | null;
  locationName: string | null;  // orphaned면 null
  enabled: boolean | null;
  lastStatus: 'OK' | 'FAILED' | 'UNKNOWN' | null;
  lastCheckedAtMs: number | null; lastReason: SyntheticReason | null;
  availability24hPct: number | null; checks24h: number;
  expectedChecks24h: number | null; coveragePct: number | null;
  staleSeconds: number | null; stale: boolean; truncated: boolean;
  p95Ms: number | null; p95WindowMinutes: number;
};
```

### 요청 본문 (POST · PUT 공통)

```ts
type SyntheticUpsert = {
  name?: string;               // 생성 시 필수
  hostId?: string;             // 🔴 생성 시 필수, 수정 시 **무시**
  delay?: string;              // "60"·"30s"·"1m" (1초~1일) 또는 **사용자 매크로** "{$INTERVAL}".
                               // 🔴 매크로는 그대로 통과한다 — delaySec이 null이어도 저장된다
                               //    (상세의 delay를 그대로 되돌려 보내면 된다). 생성 미지정 시 1m
  retries?: number;            // 1~10
  agent?: string;
  enabled?: boolean;
  authentication?: 'NONE' | 'BASIC' | 'NTLM' | 'KERBEROS' | 'DIGEST';
  httpUser?: string;
  httpPassword?: string;       // 🔴 비우면 유지, 값이 있으면 교체
  clearHttpPassword?: boolean; // 🔴 지우려면 이것을 true로
  httpProxy?: string;
  variables?: Record<string, string>;  // 생략=유지, 보내면 전체 교체
  headers?: Record<string, string>;    // 〃
  tags?: string[];                     // 〃
  steps?: {                            // 생성 시 필수. 생략=유지, 보내면 전체 교체
    httpStepId?: string;               // 🔴 기존 단계는 반드시 유지 — 없으면 400(아래 §3.3-1)
    isNew?: boolean;                   // 🔴 **신설(D9)**. 새로 추가하는 단계에 true.
                                       //    httpStepId가 없을 때만 본다. 생성(POST)에서는 무시된다
    name: string; url: string; no?: number;
    statusCodes?: string; required?: string; timeout?: string;
    queryFields?: Record<string, string>;
    headers?: Record<string, string>;
    variables?: Record<string, string>;
    // 🔴 상세 응답의 셋을 **그대로** 되돌려 보내면 된다. BE가 Zabbix가 받는 모양
    //    (RAW=문자열 · FORM=배열)으로 바꾼다. 셋 다 생략하면 기존 본문이 유지된다.
    postsRaw?: string; postFields?: Record<string, string>;
    postType?: 'FORM' | 'RAW';
    followRedirects?: boolean;
    retrieveMode?: 'BODY' | 'HEADERS' | 'BOTH';
  }[];
};
```

## 3.3 🔴 FE가 반드시 지켜야 할 열세 가지

1. **수정 폼은 상세 응답을 통째로 들고 있다가 통째로 보낸다.** 특히 `steps[].httpStepId`.
   빼면 Zabbix는 **오류 없이** 그 단계를 지우고 새로 만들고, 새 단계에는 새 아이템이 붙어
   **그 단계의 응답 시간 이력이 사라진다**. 이 레포가 액션에서 겪은 round-trip 사고
   (`ActionFilterNormalizer`)의 더 나쁜 판본이다 — 저쪽은 거절이라도 됐다.

   🔴 **2026-09-07(QA D9)부터 서버가 이것을 막는다.** QA가 반증 실험으로 실증했다: 같은 본문에서
   `httpStepId`만 빼자 stepId 35·36이 37·38로 갈리고 단계 아이템 6개의 itemid가 전부 교체됐는데
   Zabbix는 **200**을 줬다. 지금 수정(PUT)에서 `steps`를 보내면 서버가 셋으로 가른다:

   | 단계의 모양 | 서버 동작 |
   |---|---|
   | `httpStepId`가 있다 | 그대로 쓴다 |
   | 없는데 **이름이 같은** 기존 단계가 있다 | 🔴 **그 id를 되붙인다**(조용히 고쳐 준다). 규약을 모르는 클라이언트도 여기서 구제된다 |
   | 없고 짝도 없다 | `isNew: true`면 새 단계로 통과, 아니면 **400 `APM_SYNTHETIC_STEP_ID_REQUIRED`** |

   ⚠️ **FE 할 일**: 단계를 **새로 추가**할 때 `isNew: true`를 함께 보낼 것. 안 보내고 이름도
   기존과 다르면 400이다(서버는 "새 단계"와 "개명하면서 id를 빠뜨림"을 구분할 수 없고, 후자를
   통과시키면 그 단계의 이력이 조용히 사라진다). `isNew: true`는 **되붙이기보다 우선**하므로
   지운 단계의 이름을 재사용하는 경우에도 안전하다.
2. **단계 이름을 바꾸면 그 단계의 이력이 끊긴다.** 결과 아이템 키가
   `web.test.time[시나리오,단계,resp]`라 이름이 곧 축이다. 폼에서 이름을 고칠 때 그 사실을
   경고할 것.
3. **`hostId`는 수정으로 못 바꾼다**(Zabbix 제약). 수정 폼에서 읽기 전용으로 둘 것.
4. **프록시 칸을 만들지 말 것.** 웹 시나리오에는 프록시 설정이 없다 — 실행 위치는 **호스트 선택**으로만
   정해진다. ⚠️ 이 사실을 안내하지 않으면 사용자는 대신 **호스트의 프록시를 바꾸고**, 그 순간
   그 호스트의 **모든 감시**가 옮겨 간다. `GET /apm/synthetics/proxies`가 그 안내용이다.
5. **`availability24hPct`와 `p95Ms`는 창이 다르다**(24시간 vs `p95WindowMinutes`=60분).
   같은 줄에 나란히 두면 사용자는 같은 기간으로 읽는다 — 헤더나 툴팁에 표시할 것.
6. **`null`은 "모름"이지 0이 아니다.** 방금 만든 시나리오는 `lastStatus='UNKNOWN'`이고 가용성·p95가
   `null`이다. 0%로 그리면 **새 시나리오가 전부 완전 장애로 보인다**.
7. **캘린더의 빈 날은 행이 없다.** 0으로 채우지 말 것. `coveredDays < days`가 정상이다.
8. **삭제는 이력까지 지운다.** Zabbix가 결과 아이템을 함께 지운다 — 확인 대화상자에서
   **"중지(enabled=false)"** 선택지를 함께 제시할 것.
9. **`byProxy`는 휴리스틱이다.** "첫 단계 URL이 같은 시나리오"를 형제로 본 것이고, 창도
   캘린더의 `days`가 아니라 **24시간**이다. 화면은 "참고"로 제시하고 사용자가 무시할 수 있어야 한다.
10. **`postType`·`postsRaw`·`postFields`는 세트로 되돌려 보낸다.** Zabbix에는 쓰기 가능한
    `post_type` 필드가 **없고**, 형식은 `posts`가 문자열이냐 배열이냐로 정해진다 — 그 변환은 BE가 한다.
    셋 다 안 보내면 기존 본문이 유지되고, `postType='RAW'`만 보내고 `postsRaw`를 비우면
    **본문이 지워진다**(그것이 "RAW인데 본문 없음"의 표현이다).
11. **`proxyId === null`을 "서버가 실행"으로 읽지 말 것.** 프록시 **그룹** 감시도 `proxyId`가
    비어 있다. 판정은 **`monitoredBy`**로 하고, 화면 표시는 `locationName`을 그대로 쓴다.
    `PROXY_GROUP`은 "그룹 중 어느 프록시가 실행했는지 알 수 없다"는 뜻이므로 지역 비교에서
    서버 줄과 합치면 안 된다.
12. **`stale`·`coveragePct`를 가용성 옆에 함께 그린다.** 가용성의 분모는 **관측된** 실행 수라,
    23시간 전 성공 한 점만 있어도 `OK · 100%`가 나온다 — 그 자체는 정확하지만 "지금 정상"으로
    읽힌다. `stale=true`면 상태 배지를 회색으로 내리고 "마지막 관측 N분 전"을 함께 보일 것.
    `coveragePct`가 낮으면 초록 칸이어도 하루를 대표하지 못한다.
13. **`truncated`와 수집 공백을 구분해서 안내한다.** `truncated=true`는 **조회 한계**
    ("창/일수를 줄이세요")이고, `coveragePct`가 낮거나 `stale=true`인 것은 **수집 문제**
    ("Zabbix 시나리오·프록시를 점검하세요")다. 같은 문구로 묶으면 사용자가 엉뚱한 곳을 본다.

## 3.4 정의 — 숫자가 무엇을 세는가

| 값 | 계산 | 원천 |
|---|---|---|
| `checks24h` | 24시간 안의 실행 횟수 | `web.test.fail` history 점 수 |
| `availability24hPct` | (실행 − 실패) / 실행 × 100 | 🔴 **`web.test.fail`은 실패한 단계 번호이고 0이 성공**이다. 불리언으로 읽으면 가용성이 정확히 반대가 된다 |
| `p95Ms` | 최근 60분 **단계 응답 시간**의 nearest-rank p95 | 🔴 Zabbix `web.test.time`은 **초**다. BE가 ×1000 한다 |
| `lastStatus`·`lastCheckedAtMs`·`lastFailedStepNo` | 🔴 **이력이 아니라 아이템의 `lastvalue`/`lastclock`** | 이력은 상한에 걸려 **가장 최근**이 잘릴 수 있다. `lastvalue`는 그와 무관하다. ⚠️ Zabbix의 "Max history display period"(기본 24h)보다 오래되면 그 값도 비므로 그때만 이력의 마지막 점으로 떨어진다 |
| `expectedChecks24h` | 86400 / `delaySec` | 주기가 매크로면 `null`(서버는 매크로 값을 모른다) |
| `coveragePct` | `checks24h` / `expectedChecks24h` × 100 (상한 100) | **수집 공백**의 지표 |
| `staleSeconds`·`stale` | 지금 − 마지막 관측. 임계 = `max(주기×3, 300초)` | 한 번도 안 돈 시나리오는 `stale=false`("아직"과 "끊겼다"는 다르다) |
| `truncated` | 조회 상한에 걸려 이력을 끝까지 못 읽음 | 🔴 **수집 공백이 아니다** |
| `reason` | `web.test.error` 원문 → 정규식 분류 | 분류 실패 시 `UNKNOWN` + 원문 |

⚠️ **`web.test.error`와 `web.test.fail`은 서로 다른 아이템이라 시각이 정확히 같지 않다.**
BE가 실패 시각 **이전 30초 안**의 가장 가까운 오류 문자열을 붙인다. 없으면 `UNKNOWN`이다.

⚠️ `web.test.error`의 값 형식은 **Character**(Zabbix `value_type=1`)다. BE는 아이템의 실제
`value_type`으로 조회하고 없을 때만 이 기본값으로 떨어진다 — 타입이 어긋나면 Zabbix가 오류 없이
**빈 배열**을 주고, 그러면 실패 사유가 통째로 `UNKNOWN`이 된다.

⚠️ **결과 아이템의 축은 `(hostId, 시나리오 이름)`이다.** 같은 이름의 시나리오를 호스트마다 두는
구성(지역별 감시)이 정상 사용법이라, 이름만으로 묶으면 한 호스트의 장애가 다른 호스트의 정상값에
덮인다. 화면도 시나리오를 `httptestId`로 다룰 것(이름으로 키를 만들지 말 것).

## 3.5 오류 코드 (신설 10)

| 코드 | body `code` | 언제 |
|---|---|---|
| `APM_SYNTHETIC_NOT_FOUND` | 404 | 없는 `httptestId`(Zabbix에서 지워졌을 수 있다) |
| `APM_SYNTHETIC_NAME_REQUIRED` | 400 | 이름 없음 |
| `APM_SYNTHETIC_HOST_REQUIRED` | 400 | 생성인데 호스트 미선택. 🔴 **어디서 실행할지**를 정하는 값이다 |
| `APM_SYNTHETIC_STEPS_REQUIRED` | 400 | 단계 없음(생성) / 전부 지우려 함(수정) |
| `APM_SYNTHETIC_STEP_INVALID` | 400 | 단계에 이름·URL 없음 |
| `APM_SYNTHETIC_STEP_DUPLICATE` | 400 | 단계 이름 중복 — 🔴 겹치면 두 단계의 이력이 한 아이템에 섞인다 |
| `APM_SYNTHETIC_RETRIES_INVALID` | 400 | 재시도 1~10 밖 |
| `APM_SYNTHETIC_DELAY_INVALID` | 400 | 주기 표기를 못 읽음. 🔴 **사용자 매크로(`{$…}`)는 통과**한다 — 거절 기준은 "1초~1일로 읽히는가"이고, 매크로는 서버가 풀 수 없으므로 Zabbix에 맡긴다 |
| `APM_SYNTHETIC_CREATE_FAILED` | 500 | Zabbix가 생성 응답에 id를 안 줌 |
| `APM_SYNTHETIC_ALREADY_BOUND` | 409 | 이 시나리오가 **다른** 서비스에 이미 연결됨 |
| `APM_SYNTHETIC_BINDING_NOT_FOUND` | 404 | 이 서비스의 연결이 아님(해제 대상 없음) |
| `APM_SYNTHETIC_STEP_ID_REQUIRED` | 400 | **신설(D9)**. 수정 요청의 단계에 `httpStepId`가 없고, 이름이 같은 기존 단계도 없고, `isNew:true`도 안 붙었다 |

⚠️ 그 밖의 Zabbix 검증 실패는 우리가 못 가로챈 것이라 **원문 메시지**가 그대로 나간다
(`-32602`). 그런 문구가 자주 보이면 §3.5에 코드를 더할 신호다.

## 3.6 예시 JSON

```jsonc
// GET /apm/synthetics
{ "status": "success", "code": 200, "data": [
  { "httptestId": "42", "name": "결제 시나리오", "hostId": "10084", "hostName": "web-01",
    "delaySec": 60, "delayRaw": "1m",
    "proxyId": null, "proxyName": null,
    "monitoredBy": "SERVER", "proxyGroupId": null, "locationName": "Zabbix server",
    "enabled": true,
    "stepCount": 3, "firstUrl": "https://shop.example.com/login",
    "tags": ["team=pay", "critical"],
    "lastStatus": "FAILED", "lastCheckedAtMs": 1757200800000, "lastFailedStepNo": 2,
    "lastReason": { "code": "TLS_CERT_EXPIRED", "title": "TLS 인증서가 만료되었습니다",
                    "hint": "인증서를 갱신하세요. 브라우저에서는 경고를 넘길 수 있어도 합성 감시는 실패로 기록됩니다.",
                    "raw": "SSL certificate problem: certificate has expired" },
    "availability24hPct": 96.5, "checks24h": 1437,
    "expectedChecks24h": 1440, "coveragePct": 99.79,
    "staleSeconds": 41, "stale": false, "truncated": false,
    "p95Ms": 812.0, "p95WindowMinutes": 60,
    "boundServiceUid": "11111111-2222-3333-4444-555555555555",
    "boundServiceName": "shop-web", "boundLabel": "결제 흐름" },

  // 🔴 프록시 그룹이 감시하는 호스트 — proxyId가 null이지만 **서버가 아니다**.
  //    그리고 23시간 전 성공 한 점뿐이라 OK·100%인데 stale=true다.
  { "httptestId": "44", "name": "도쿄 결제 감시", "hostId": "10099", "hostName": "tokyo-web",
    "delaySec": 60, "delayRaw": "1m",
    "proxyId": null, "proxyName": null,
    "monitoredBy": "PROXY_GROUP", "proxyGroupId": "7", "locationName": "프록시 그룹",
    "enabled": true, "stepCount": 3, "firstUrl": "https://shop.example.com/login", "tags": [],
    "lastStatus": "OK", "lastCheckedAtMs": 1757118000000, "lastFailedStepNo": null,
    "lastReason": null,
    "availability24hPct": 100.0, "checks24h": 1,
    "expectedChecks24h": 1440, "coveragePct": 0.07,
    "staleSeconds": 82800, "stale": true, "truncated": false,
    "p95Ms": null, "p95WindowMinutes": 60,
    "boundServiceUid": null, "boundServiceName": null, "boundLabel": null } ] }

// GET /apm/services/{uid}/synthetics — Zabbix에서 지워진 연결
{ "status": "success", "code": 200, "data": [
  { "httptestId": "43", "label": "옛 로그인 감시", "orphaned": true,
    "name": null, "hostName": null, "firstUrl": null, "proxyName": null,
    "monitoredBy": null, "locationName": null, "enabled": null,
    "lastStatus": null, "lastCheckedAtMs": null, "lastReason": null,
    "availability24hPct": null, "checks24h": 0,
    "expectedChecks24h": null, "coveragePct": null,
    "staleSeconds": null, "stale": false, "truncated": false,
    "p95Ms": null, "p95WindowMinutes": 60 } ] }
```

---

# §4. 메시징 (메뉴 8 앞 절반 · WBS 4.2)

> 설계 `devdesign_apm.md` §8.1 "메시징·배치" 행 · 화면 §3.15.

## 4.1 EP 표

| 메서드 | 경로 | 권한 | 응답 `data` |
|---|---|---|---|
| GET | `/apm/messaging/destinations?from&to&service&system` | `apm.view` | `MessagingDestinations` |
| GET | `/apm/messaging/series?destination&from&to&service&system&operation` | `apm.view` | `MessagingSeries` |

🔴 **설계 표의 `GET .../{dest}/series`를 쿼리 파라미터로 바꿨다.** 토픽·큐 이름에는 `/`가 흔히
들어간다(SQS ARN·경로형 라우팅 키). path에 넣으면 세그먼트가 갈려 **이름이 잘린 채** 닿고,
인코딩해 넣어도 톰캣 기본 설정이 `%2F`를 거부한다.

🔴 **`destination`을 빼고 부르면 200 + `code:400` + `APM_MESSAGING_DESTINATION_REQUIRED`다**
(2026-09-07 QA D1 반영). 그 전에는 **HTTP 500**이었다 — Spring이 `MissingServletRequestParameter`를
던졌는데 전역 핸들러에 그 매핑이 없어 catch-all로 빠졌다. 응답 shape가 `{status,code,data}`가
아니라 `useDmoveQuery`가 읽지 못하고 `errorCode`도 없었다. **빈 문자열(`?destination=`)은 그때도
계약대로 400**이었으므로 "안 보냈다"와 "빈 값"이 이제 같은 답을 받는다.

⚠️ **`from >= to`(뒤집혔거나 같은 창)는 거절하지 않고 "최근 1시간"으로 접는다** (QA M-5).
화면이 자동으로 붙이는 값이라 사용자가 고칠 수 없고, 400을 주면 대시보드 전체가 에러 카드가 된다.
🔴 **조용하지만 감출 수는 없다** — 응답의 `fromMs`/`toMs`가 **실제로 쓴 창**을 반향한다.
축 라벨은 요청한 값이 아니라 **응답의 창**으로 그릴 것. (`/apm/jobs`·`/apm/jobs/timeline`도 같다.)

## 4.2 타입

```ts
type MessagingDestinations = {
  fromMs: number; toMs: number;
  rows: {
    serviceUid: string | null;    // 지워진 서비스면 null(집계는 남아 있다)
    serviceName: string;
    system: string;               // "kafka" | "rabbitmq" | ...
    destination: string;          // "__unnamed__" = 목적지를 안 붙인 계측
    operation: 'PUBLISH' | 'RECEIVE' | 'PROCESS' | 'SETTLE';
    count: number; errors: number;
    errorRatePct: number | null;  // count=0이면 null
    rps: number;                  // count / 창 길이(초)
    p50Ms: number | null; p95Ms: number | null; p99Ms: number | null;
    mixedBounds: boolean;         // 경계가 갈려 백분위를 내지 않았다

    lagCount: number;             // 🔴 지연을 **잴 수 있었던** 건수. count보다 작은 것이 정상
    lagUnmeasuredPct: number | null;  // (count-lagCount)/count ×100. count=0이면 null
                                      // 🔴 크면 아래 지연 통계는 **소수 표본**의 것이다
    lagAvgMs: number | null;
    lagP95Ms: number | null;      // 🔴 lagP95OverCap=true면 **하한**이다
    lagP95OverCap: boolean;       // 🔴 p95가 격자 상계(≈10초)에 걸렸다 = 실제는 더 크다.
                                  //    '10초+'처럼 그리고 크기는 lagMaxMs로 가늠할 것
    lagMaxMs: number | null;      // 상계와 무관한 실측 최댓값
  }[];                            // 처리량 내림차순, 최대 500줄
};

type MessagingSeries = {
  step: 300;                      // 5분 버킷이 바닥이라 고정
  destination: string;
  operation: string | null;       // null = 전부 합산
  points: { ts: number; count: number; errors: number;
            p50Ms: number | null; p95Ms: number | null; p99Ms: number | null;
            mixedBounds: boolean;
            lagCount: number; lagUnmeasuredPct: number | null; lagAvgMs: number | null;
            lagP95Ms: number | null; lagP95OverCap: boolean; lagMaxMs: number | null }[];
};
```

## 4.3 🔴 FE가 반드시 지켜야 할 일곱 가지

1. **같은 토픽이 여러 줄로 온다** — 축이 `(서비스, 시스템, 목적지, 오퍼레이션)`이다. `order-svc /
   PUBLISH`와 `billing-svc / RECEIVE`가 따로 선다. **의도된 것이다**(서버가 합치면 그 구분을
   되돌릴 수 없다). 합치고 싶으면 화면이 접는다.
2. **`lagCount`를 반드시 함께 보여 줄 것.** 소비 지연은 발행 스팬을 찾을 수 있었던 건에 대해서만
   잰다. `lagCount`를 감추고 `lagP95Ms`만 크게 띄우면 **"1000건 중 12건의 p95"를 전체 지연으로
   오독**하게 된다.
3. **`lagCount=0`이면 나머지 지연 필드는 `null`이다.** 0ms가 아니라 **못 쟀다**는 뜻이다.
4. **빈 구간은 점이 없다.** 0을 그리지 말 것 — 관측이 없던 것과 0건인 것은 다르다.
5. **발행·소비 두 선을 그리려면 `series`를 두 번 부른다.** `operation`을 비우면 한 선에 섞인다.
6. **`lagP95OverCap=true`인 값을 그냥 숫자로 그리지 말 것.** 지연 히스토그램은 지속시간용 격자
   (상계 ≈10초)를 쓴다. 상계를 넘는 지연이 많으면 p95가 10초에 붙어 멈추는데, **관측 min·max
   안이라 보정에도 안 걸려 평범한 숫자로 보인다**(실제가 60초여도 10초로 표시된다).
   `10초+`처럼 하한 표기로 그리고 `lagMaxMs`를 함께 보일 것.
7. **`lagUnmeasuredPct`가 크면 지연 통계 옆에 표본 경고를 붙인다.** 특히 `PUBLISH` 줄은
   지연 개념 자체가 없어 100%가 정상이다 — 그 줄에는 지연 칸을 아예 비우는 편이 낫다.

## 4.4 계측 규약 — `messaging.*`

BE가 읽는 속성(신·구 semconv 둘 다):

| 축 | 신 이름 | 구 이름(별칭) |
|---|---|---|
| 시스템 | `messaging.system` | — |
| 목적지 | `messaging.destination.name` | `messaging.destination` |
| 오퍼레이션 | `messaging.operation.type` | `messaging.operation` |

- **스팬 kind**는 `PRODUCER`·`CONSUMER`. 🔴 `messaging.system`이 **없으면 메시징 스팬이 아니다**
  (kind만으로 고르면 큐와 무관한 스팬이 섞인다).
- 오퍼레이션 값 정규화: `publish`·`create`·`send`→`PUBLISH`, `receive`·`deliver`·`poll`→`RECEIVE`,
  `process`→`PROCESS`, `settle`·`ack`→`SETTLE`. 속성이 없으면 kind로 떨어진다.
- **소비 지연**은 소비 스팬이 발행 스팬을 **스팬 링크**(정식) 또는 **부모**로 가리킬 때만 잰다.
  🔴 그 짝이 **같은 큐의 발행**인지까지 확인한다 — 링크·부모는 메시징 전용 관계가 아니라
  비동기 작업 인과에도 쓰인다. 셋을 모두 만족해야 표본이 된다:
  ① 발행 쪽에 `messaging.system`이 있을 것 ② 그 값이 소비 쪽과 같을 것
  ③ 정규화된 목적지가 같고 `__unnamed__`가 **아닐** 것.
  확인이 안 되면 **재지 않는다**(그 비율이 `lagUnmeasuredPct`로 드러난다).
  ⚠️ 배치 소비(링크 여러 개)는 **첫 링크**만 본다 — 근사다.
  ⚠️ 발행을 **개별 소비 시각 기준 1시간**까지만 거슬러 찾는다. 그보다 오래 큐에 머문 메시지는
  `lagCount`에 안 들어간다. 🔴 기준이 "처리 창 시작"이 아니라 **소비 시각**이라, 밀린 구간을
  따라잡느라 창이 커져도 같은 표본의 포함 여부가 달라지지 않는다.

## 4.5 예시 JSON

```jsonc
// GET /apm/messaging/destinations
{ "status": "success", "code": 200, "data": {
  "fromMs": 1757197200000, "toMs": 1757200800000,
  "rows": [
    { "serviceUid": "aaaa...", "serviceName": "order-svc", "system": "kafka",
      "destination": "orders", "operation": "PUBLISH",
      "count": 18420, "errors": 0, "errorRatePct": 0.0, "rps": 5.12,
      "p50Ms": 2.1, "p95Ms": 8.4, "p99Ms": 21.0, "mixedBounds": false,
      "lagCount": 0, "lagAvgMs": null, "lagP95Ms": null, "lagMaxMs": null },
    { "serviceUid": "bbbb...", "serviceName": "billing-svc", "system": "kafka",
      "destination": "orders", "operation": "PROCESS",
      "count": 18402, "errors": 37, "errorRatePct": 0.2, "rps": 5.11,
      "p50Ms": 41.0, "p95Ms": 320.0, "p99Ms": 890.0, "mixedBounds": false,
      "lagCount": 17980, "lagUnmeasuredPct": 2.29,
      "lagAvgMs": 412.0, "lagP95Ms": 2100.0, "lagP95OverCap": false, "lagMaxMs": 18400.0 },

    // 🔴 상계에 걸린 경우 — p95는 10초가 아니라 "10초 이상"으로 읽어야 한다.
    { "serviceUid": "…", "serviceName": "settle-svc", "system": "kafka",
      "destination": "settlements", "operation": "RECEIVE",
      "count": 100, "errors": 0, "errorRatePct": 0.0, "rps": 0.03,
      "p50Ms": 22.0, "p95Ms": 40.0, "p99Ms": 55.0, "mixedBounds": false,
      "lagCount": 100, "lagUnmeasuredPct": 0.0,
      "lagAvgMs": 59410.0, "lagP95Ms": 10000.0, "lagP95OverCap": true,
      "lagMaxMs": 60000.0 } ] } }
```

---

# §5. 배치 작업 (메뉴 8 뒤 절반 · WBS 4.3)

> 설계 `devdesign_apm.md` §8.1 "메시징·배치" 행 · 화면 §3.15.

## 5.0 🔴 이 화면은 **고객이 코드를 넣어야** 채워진다

OpenTelemetry에는 배치·잡 시그널이 **없다**. HTTP·DB·메시징은 자동 계측이 채우지만 "이 프로세스가
밤 2시에 돌아 12분 걸렸고 성공했다"를 말하는 표준이 없어, **우리가 규약을 정했다**(§5.3).

그 결과: **규약을 안 지키면 이 화면은 영원히 빈다.** 🔴 빈 상태에 "배치 작업이 없습니다"라고만
쓰면 사용자는 그것을 사실로 읽는다 — **§5.3의 규약과 코드 예시를 빈 상태에 그대로 실을 것.**

## 5.1 EP 표

| 메서드 | 경로 | 권한 | 응답 `data` |
|---|---|---|---|
| GET | `/apm/jobs?from&to&service` | `apm.view` | `Jobs` |
| GET | `/apm/jobs/runs?name&from&to&status&service` | `apm.view` | `JobRuns` |
| GET | `/apm/jobs/timeline?from&to&service&name` | `apm.view` | `JobTimeline` |

🔴 **`service`의 값 셋** (2026-09-07 3차 검수 #8) — 세 EP 모두 같다.

| `service` | 뜻 |
|---|---|
| 없음/빈 값 | 전 서비스 |
| 서비스 UUID | 그 서비스만. 없는 uid면 `APM_SERVICE_NOT_FOUND` |
| **`__none__`** | 🔴 **서비스가 지워진** 실행만(`service_id IS NULL`) |

`__none__`이 필요한 이유: V56이 `apm_job_run.service_id`를 `ON DELETE SET NULL`로 바꿔(M-4)
서비스를 지워도 이력이 남는다. 그래서 목록에 `serviceUid: null`인 줄이 생기는데, 그 줄을 눌러
`service`를 **안 주고** 상세를 열면 살아 있는 서비스의 같은 이름 실행까지 섞인다 —
지워진 서비스의 `nightly` 3건 + 살아 있는 서비스 2건이면 목록은 3건인데 상세는 **5건**이다
(M-2가 목록에서 고친 것과 정확히 같은 모양의 어긋남).

🔴 **설계 표의 `/apm/jobs/{name}/runs`를 쿼리 파라미터로 바꿨다.** 잡 이름은 사람이 짓는 자유
문자열이라 `/`·`.`·공백이 들어간다(`batch/nightly-settlement`). path에 넣으면 이름이 잘리고,
확장자처럼 보이는 꼬리는 콘텐츠 협상에 먹힌다(메시징의 목적지와 같은 판단).

## 5.2 타입

```ts
type Jobs = {
  fromMs: number; toMs: number;
  rows: {                         // 🔴 **한 줄 = (serviceUid, jobName)** — rowKey도 그 쌍이다 (M-2)
    jobName: string;              // 🔴 job.name 속성 값(스팬 이름이 아니다).
                                  //    🔴 서비스가 다르면 **같은 값이 여러 줄**에 나온다
    serviceUid: string | null;    // 🔴 **이 줄의** 서비스(마지막 실행자가 아니다).
                                  //    지워진 서비스면 null이고 실행 이력은 남는다(M-4)
    serviceName: string | null;   // 🔴 **지워진 서비스면 null**(2026-09-08 QA D12에서 `""` → `null`).
                                  //    serviceUid와 같은 축이다 — 둘 중 하나만 보면 된다
    runs: number; failures: number;
    successRatePct: number | null;   // (runs - ERROR)/runs. runs=0이면 null
    avgMs: number | null; maxMs: number | null;
    lastRunAtMs: number | null; lastDurationMs: number | null;
    lastStatus: 'OK' | 'ERROR' | 'UNSET' | null;
    lastTraceId: string | null;
  }[];                            // 🔴 **마지막 실행 시각** 내림차순(실행 횟수순이 아니다)
};

type JobRuns = {
  jobName: string; fromMs: number; toMs: number;
  truncated: boolean;             // 상한 2,000건
                                  // 🔴 runs가 **빈 배열일 수 있다**(status·service 필터가 0건일 때, M-1)
  runs: {
    startedAtMs: number; durationMs: number;
    status: 'OK' | 'ERROR' | 'UNSET';
    errorMessage: string | null;
    runRef: string | null;        // job.run.id
    triggerKind: string | null;   // job.trigger — ⚠️ 값을 강제하지 않는다
    traceId: string; spanId: string;
    traceLinkable: boolean;       // 🔴 false면 링크를 비활성으로 그릴 것
    serviceUid: string | null; serviceName: string | null;   // 🔴 목록과 같은 규약(D12)
  }[];                            // 최근순
};

type JobTimeline = {
  fromMs: number; toMs: number;
  truncated: boolean;             // 🔴 어느 레인이 잘렸는지는 runs > bars.length로 안다 (M-3)
  lanes: {                        // 🔴 행 = 잡, **이름순 고정**
    jobName: string;
    runs: number;                 // 🔴 창 안의 **전체** 실행 수 — bars.length가 아니다 (M-3)
    failures: number;             // 🔴 runs와 같은 모집단(창 전체). 잘린 구간의 실패도 센다
    bars: { startMs: number; endMs: number; durationMs: number;
            status: 'OK' | 'ERROR' | 'UNSET';
            traceId: string; traceLinkable: boolean }[];   // 시작순. 🔴 레인당 최근 200개까지
  }[];
};
```

### 🔴 `GET /apm/jobs`의 행 축이 바뀌었다 — `(서비스, 잡 이름)` (2026-09-07 QA M-2)

전에는 `job_name` 하나로 묶었다. 그래서 같은 이름의 잡을 두 서비스가 내면 **한 줄로 합산**되고
서비스명 칸에는 **마지막으로 실행한 서비스**가 찍혔다(실측: 4건 중 3건이 다른 서비스인데 화면은
그 3건까지 한 서비스의 것으로 보여 줬다 — 성공률·평균도 남의 실행이 섞인 값이다).
배치 이름(`nightly-settlement`)은 팀마다 겹치기 쉬워 드문 사고가 아니고, 메시징(§4.3-1)은
이미 서비스를 축에 넣고 있었다.

- 🔴 **FE 할 일**: 표의 `rowKey`를 `jobName` 하나로 잡고 있으면 **React 중복 키**가 난다 →
  `` `${serviceUid ?? '-'}:${jobName}` `` 로 바꿀 것.
- 🔴 **드릴다운도 그 쌍이어야 한다.** `GET /apm/jobs/runs`에 **`service` 파라미터가 신설**됐다
  (선택). 안 주면 종전대로 이름 전체를 훑어 다른 서비스의 실행이 섞이고, 목록의 `runs` 숫자와
  이력의 줄 수가 안 맞아 보인다.
- 🔴 **`serviceUid`가 `null`인 줄은 `service=__none__`으로 연다**(3차 검수 #8). 그 줄에 대해
  파라미터를 생략하면 위와 같은 어긋남이 그대로 재현된다 — 빈 값은 "전체"라는 다른 뜻이라
  `null`을 표현할 수 없어 예약어를 두었다(§5.1의 값 표).

### 🔴 간트 절단이 **레인마다** 걸린다 (2026-09-07 QA M-3)

전에는 전체 상한(2,000)만 있고 정렬이 `job_name, started_at`이라 **이름이 앞선 잡 하나가 예산을
다 먹으면 나머지 레인이 통째로 사라졌다**(실측: 2,001건짜리 잡 하나를 주입하자 다른 잡 4개가
`lanes`에서 전멸했고, 신호는 `truncated:true` 하나뿐이라 화면은 "그 잡들이 안 돌았다"와 구분할 수
없었다). 지금은:

1. 레인마다 **최근 200개**를 먼저 배분한다(오래된 것이 아니라 최근이다 — 간트에서 먼저 봐야 하는
   것은 어젯밤 실행이다).
2. 그 위에 전체 상한 2,000이 걸린다.
3. `lanes[].runs`·`failures`는 **절단 전 전체 수**다.

🔴 **FE 할 일**: `runs > bars.length`인 레인에 "50개 중 20개 표시" 같은 배지를 붙일 것.
`truncated`만 보면 어느 레인이 잘렸는지 알 수 없다.

## 5.3 🔴 계측 규약 — 고객 앱이 해야 할 일 (정본: `ApmJobConventions`)

**세 가지만 지키면 된다.**

1. **루트 스팬**(부모 없음). 잡이 만드는 DB·HTTP 호출은 이 스팬의 **자식**이 되어, 트레이스를
   열면 그 실행이 무엇을 했는지 전부 보인다.
2. **`kind = INTERNAL`.** 🔴 `SERVER`로 만들면 RED 지표(요청 수·오류율)에 섞여 **API 트래픽이
   부풀어 보인다**.
3. **`job.name` 속성**에 잡 이름. 🔴 **스팬 이름이 아니라 이 속성**이 집계의 축이다 — 스팬 이름은
   계측 라이브러리가 정해서 버전에 따라 바뀌고, 그러면 같은 잡의 이력이 두 줄로 갈린다.

선택 속성: `job.run.id`(스케줄러의 실행 id) · `job.trigger`(`SCHEDULE`·`MANUAL`·`EVENT`·`RETRY` —
⚠️ 값을 강제하지 않는다).

**성공/실패**는 스팬 `status`를 그대로 쓴다. 🔴 **`UNSET`은 실패가 아니다** — 대부분의 계측이
성공에 아무 상태도 안 찍는다(실측: 32스팬 중 31). 실패를 남기려면 `setStatus(ERROR)`를 **명시적으로**
부르거나 예외를 기록해야 한다. `successRatePct`는 `ERROR`만 세므로 정확히는 **"실패로 기록되지
않은 비율"**이다.

#### 🔴 FE 규약 — UNSET 각주는 **0이면 생략한다** (2026-09-08 QA D13)

응답에는 **UNSET 건수를 0이어도 그대로** 싣는다(`0`과 "필드 없음"을 구분하지 못하게 만들지
않는다 — 0은 *"셌고 없다"*는 주장이다). 대신 그 숫자를 문구로 바꾸는 것은 **화면의 몫**이다.

- **BE 무수정.** 위 규약은 응답 계약이 아니라 표기 규약이다.
- 🔴 **FE 할 일**: `상태가 기록되지 않은 실행 N건이 있습니다 …` 각주를 **`N > 0`일 때만** 렌더할 것
  (`ApmJobsSection.tsx`가 조건 없이 렌더해, 필터 결과가 0건인 화면에도 **`0건`** 각주가 떴다).
  `실패` 필터에서는 UNSET이 나올 수 없으므로 특히 어색하다.
- 같은 규칙을 **0으로 나가는 다른 각주**에도 적용한다(집계 숫자를 그대로 문장에 끼워 넣는 자리).

```java
Span span = tracer.spanBuilder("nightly-settlement")
        .setSpanKind(SpanKind.INTERNAL)
        .setNoParent()                      // 🔴 루트여야 한다
        .setAttribute("job.name", "nightly-settlement")
        .setAttribute("job.trigger", "SCHEDULE")
        .startSpan();
try (Scope scope = span.makeCurrent()) {
    runJob();
} catch (Exception e) {
    span.recordException(e);
    span.setStatus(StatusCode.ERROR);       // 🔴 안 찍으면 실패가 성공으로 보인다
    throw e;
} finally {
    span.end();
}
```

## 5.4 ⚠️ 두 가지 한계 (화면이 알려야 한다)

1. **7일보다 오래된 실행은 트레이스가 열리지 않는다.** 이 표는 90일이지만 원본 스팬은 7일이다.
   `traceLinkable=false`가 그 신호다 — 그대로 링크를 걸면 **빈 워터폴**이 뜨고 버그로 읽힌다.
2. **실행 중인 잡은 목록에 없다.** 스팬은 **끝나야** 전송된다. 간트의 오른쪽 끝이 비어 있는 것은
   정상이고, "지금 돌고 있는 것"을 보여 줄 신호가 우리에겐 없다.
   - ✅ **"오래 걸리는 잡은 누락될 수 있다"는 한계는 해소됐다**(2026-09-07). 실제 경계는 문서가
     적었던 "하루"가 아니라 **약 15분**이었다 — 잡이 끝나야 스팬이 도착하는데 재처리 창이
     워터마크 + 두 버킷이라, **30분짜리 배치도** 도착 시점엔 시작 버킷이 창 밖이었다. 지금은
     롤업이 **완료 시각이 창에 걸치는** 실행도 함께 줍고(스팬 보존 7일까지 거슬러 본다),
     `(trace_id, span_id)` 자연키 UPSERT라 두 경로에 겹쳐도 한 줄이다.
   - ⚠️ 남는 한계: **스팬 보존(7일)을 넘겨 끝나는 잡**은 여전히 못 줍는다. 그런 잡은 배치가
     아니라 상주 프로세스에 가깝다.

## 5.5 오류 코드 (신설 2)

| 코드 | body `code` | 언제 |
|---|---|---|
| `APM_MESSAGING_DESTINATION_REQUIRED` | 400 | `destination` 없이 시계열 호출 |
| `APM_JOB_NOT_FOUND` | 404 | 창 안에 그 잡의 실행이 하나도 없음 — 🔴 빈 배열이 아니다. **name을 아예 안 보낸 경우도 여기다** |

⚠️ `APM_JOB_NOT_FOUND`가 빈 배열이 아닌 이유: 이 EP는 **표에서 고른 이름**으로만 부르는 자리라,
그 이름이 창 안에 없다는 것은 **표와 이력의 창이 어긋났다**는 뜻이다. 빈 배열로 눙치면 그
불일치가 조용히 묻힌다.

### 🔴 그러나 **필터가 0건인 것은 404가 아니다** (2026-09-07 QA M-1)

`status`·`service`는 사용자가 화면에서 방금 고른 값이고, 그 결과가 비는 것은 **정상**이다.
전에는 그때도 404 `"이 기간에 'qa-hourly' 실행 기록이 없습니다."`가 나갔다 — 실행이 1건(성공)
있는데 `status=ERROR`로 거른 경우다. FE는 §R-10에 따라 그 404를 **"창을 넓혀 보라"**로 안내하는데,
**넓혀도 영원히 안 나온다**(실패한 적이 없으므로).

지금은 갈린다:

| 상황 | 응답 |
|---|---|
| 창 안에 **그 이름의** 실행이 없다 | 200 + `code:404` `APM_JOB_NOT_FOUND` (종전) |
| 이름은 있는데 `status`/`service` 필터에만 안 걸린다 | **200 + `runs: []`** (신설) |

🔴 **FE 할 일**: 빈 배열일 때는 "실행 없음"이 아니라 **"이 필터에 걸리는 실행이 없습니다 —
필터를 풀어 보세요"**로 안내할 것. 404 안내(창 넓히기)와 문구가 달라야 한다.

### ⚠️ 두 절이 반대로 동작하던 것 — `serviceUid: null` 경로 (2026-09-07 QA M-4)

§5.2가 `serviceUid: string | null`("지워진 서비스면 null")로 적혀 있었는데, `apm_job_run`의 FK가
**`ON DELETE CASCADE`** 라 서비스를 지우면 **90일치 실행 이력이 통째로 사라졌다** — 즉 그 null
경로가 실제로는 없었다. 같은 문장을 쓰는 §4.2(메시징)는 FK가 아예 없어 반대로 동작했다.
**V56이 FK를 `ON DELETE SET NULL`로 바꿔** 두 절을 통일했다: 이제 서비스를 지워도 **실행 이력은
남고** `serviceUid`가 `null`, `serviceName`도 `null`로 나간다.

### 🔴 지워진 서비스 줄의 `serviceName`이 `""` → **`null`** (2026-09-08 QA D12) — FE 표기 규약

`""`는 화면에서 **빈 칸**이라 "서비스명을 못 읽었다"와 "서비스가 지워졌다"가 구분되지 않았다.
`__none__` 예약어를 둔 목적이 *지워진 서비스 줄을 1급 시민으로 다루는 것*인데, 정작 그 줄에
아무 라벨도 없어 사용자는 왜 서비스명이 없는지 알 수 없었다.

- **BE**: `GET /apm/jobs`·`GET /apm/jobs/runs` 두 곳 모두 `serviceName`이 **`null`**이다.
  타입이 `string` → `string | null`로 **넓어졌다**(FE가 `string`으로 받고 있으면 타입 수정 필요).
- 🔴 **FE 할 일**: `serviceUid == null`인 줄은 **`(삭제된 서비스)`** 로 표기할 것
  (`serviceName ?? '(삭제된 서비스)'`가 아니라 **`serviceUid`를 축으로** 판정한다 — 둘은 항상
  함께 null이지만 의미를 지고 있는 것은 uid다). 그 줄의 드릴다운은 `service=__none__`으로 연다.
- ⚠️ **메시징(§4.3-1)의 `serviceName`은 그대로 `""`다.** 이번 변경은 **잡 2개 EP만**이다 —
  QA가 지적한 화면이 그것이고, 다른 EP의 응답까지 함께 바꾸면 그 FE가 조용히 깨진다.

## 5.6 예시 JSON

```jsonc
// GET /apm/jobs
{ "status": "success", "code": 200, "data": {
  "fromMs": 1757114400000, "toMs": 1757200800000,
  "rows": [
    // 🔴 지워진 서비스 줄이면 serviceUid·serviceName이 **둘 다 null**이다(D12)
    { "jobName": "nightly-settlement", "serviceUid": "cccc...", "serviceName": "batch-svc",
      "runs": 1, "failures": 1, "successRatePct": 0.0,
      "avgMs": 726400.0, "maxMs": 726400.0,
      "lastRunAtMs": 1757124000000, "lastDurationMs": 726400.0,
      "lastStatus": "ERROR", "lastTraceId": "aa11bb22cc33dd44ee55ff6677889900" } ] } }

// GET /apm/jobs/timeline
{ "status": "success", "code": 200, "data": {
  "fromMs": 1757114400000, "toMs": 1757200800000, "truncated": false,
  "lanes": [
    { "jobName": "hourly-sync", "runs": 24, "failures": 0,
      "bars": [ { "startMs": 1757116800000, "endMs": 1757116830000, "durationMs": 30000.0,
                  "status": "OK", "traceId": "bb11...", "traceLinkable": true } ] } ] } }
```

---

# §6. 권한

`features/apm/core/contract_apm-read-api.md` §10.5와 **완전히 같다**. 요약:

| 축 | 판정 | 이 문서의 대상 |
|---|---|---|
| 조회 | `ApmAccessChecker.requireRead` → **`apm.view`**(기본 열림) | SLO 조회 3 + 위젯 3 + **합성 감시 조회 7 + 메시징 2 + 배치 3** |
| 관리 | `ApmAccessChecker.requireEdit` → **`apm.edit`**(기본 닫힘, 관리자 우회) | SLO 쓰기 3 + **합성 감시 쓰기 5**(POST·PUT·DELETE·bind·unbind) |

⚠️ **`GET /apm/synthetics/proxies`·`error-catalog`는 조회 축이다** — 관리 폼의 선택지이지만
담고 있는 것은 목록에 이미 보이는 정보(프록시·호스트 이름)뿐이고 비밀값이 없다. 조회 사용자가
"이 시나리오는 어느 지역에서 도는가"를 이해하는 데도 필요하다.

🔴 **합성 감시 상세 응답에 비밀번호가 없다**(`httpPasswordSet: boolean`만). 권한과 별개의
마스킹 계약이다 — 폼은 비우면 유지, 지우려면 `clearHttpPassword: true`(ZM-100 규약).

거부는 **HTTP 200 + body `code:403`** + `errorCode: "FORBIDDEN"` + 한국어 메시지
(조회 `"APM 화면을 볼 권한이 없습니다."` / 관리 `"APM 설정을 변경할 권한이 없습니다."`).
🔴 FE는 숫자가 아니라 `errorCode`로 분기할 것.

---

# §7. 구현 상태 · 파일

## P3 1차 물결 (SLO · 홈 위젯)

| 영역 | 파일 |
|---|---|
| 마이그레이션 | `src/main/resources/db/migration/V51__apm_slo.sql` |
| 엔티티 | `core/domain/ApmSlo` · `ApmSloRepository` · `ApmSloSnapshot` · `ApmSloSnapshotRepository` (+ `ApmAlertRule.sloId`) |
| SLO 화면 | `premium/apm/slo/` — `ApmSloController` · `ApmSloService` · `ApmSloCalculator` · `ApmSloSliKind` + DTO 4 |
| 일 스냅샷 | `premium/apm/slo/snapshot/` — `ApmSloSnapshotService` · `ApmSloSnapshotJob` |
| 번 레이트 알람 | `alert/evaluate/ApmSloBurnEvaluator` + `ApmAlertKind`·`ApmAlertKinds`·`ApmAlertService`·`ApmAlertEvaluationService` 수정 |
| 홈 위젯 | `premium/apm/overview/widget/` — `ApmWidgetController` · `ApmWidgetService` + DTO 3, `home/HomeWidgetType` +3 |
| 보존 | `core/batch/retention/ApmRetentionService#deleteOldSloSnapshots` + `ApmRetentionJob` 단계 |
| 공용 승격 | `core/metric/ApmPercentiles#countAtOrBelow`·`countAtOrBelowMs`·`ratioAtOrBelowMs` (`ApmApdex`에서 올림) |

## P3 2차 물결 (합성 감시 · 메시징 · 배치)

| 영역 | 파일 |
|---|---|
| 마이그레이션 | `db/migration/V52__apm_synthetic_messaging_job.sql` — `apm_synthetic_binding` · `apm_messaging_5m`(일 파티션) · `apm_job_run`<br>**`V54__apm_job_late_arrival.sql`** — `apm_span` 루트 INTERNAL 부분 인덱스(늦게 도착한 장시간 배치 발견용, 코덱스 2차 #6) |
| **엔진 계약** | `engine-api/.../zabbix/httptest/ZabbixHttpTestService` (get/create/update/delete) |
| **엔진 구현** | `engine-zabbix/.../zabbix/httptest/ZabbixHttpTestServiceImpl` |
| 엔티티 | `core/domain/ApmSyntheticBinding` · `ApmSyntheticBindingRepository` |
| 합성 감시 | `premium/apm/synthetic/` — `ApmSyntheticController` · `ApmServiceSyntheticController` · `ApmSyntheticService` · `ApmSyntheticZabbixMapper` · `ApmSyntheticItemCatalog` · `ApmSyntheticErrorCatalog` + DTO 8 |
| 메시징 | `premium/apm/messaging/` — `ApmMessagingController` · `ApmMessagingQueryService` + DTO 2, `rollup/ApmMessagingRollupStep` |
| 배치 | `premium/apm/job/` — `ApmJobController` · `ApmJobQueryService` · `ApmJobConventions` + DTO 3, `rollup/ApmJobRollupStep` |
| 롤업 결선 | `trace/rollup/ApmTraceRollupService` — 5·6단계 추가(같은 트랜잭션·같은 워터마크), `bucketExpr`·`ApmSpanHistogramSql`의 두 메서드 `public` 승격 |
| 적재 | `trace/ingest/ApmSpanAttrAllowlist` — `job.name`·`job.run.id`·`job.trigger`·`messaging.operation.type` 허용 + `messaging.destination` 별칭 |
| 파티션·보존 | `core/batch/partition/ApmPartitionService#TABLE_MESSAGING_5M` · `retention/ApmRetentionService#dropExpiredMessagingPartitions`·`deleteOldJobRuns` + `ApmRetentionJob` 단계 2 |
| 오류 코드 | `engine-api/.../ErrorCode` +13 |
| 테스트 (**+88**) | 단위 — `ZabbixHttpTestServiceImplTest`(6, engine-zabbix) · `ApmSyntheticItemCatalogTest` · `ApmSyntheticErrorCatalogTest`(7) · `ApmSyntheticZabbixMapperTest` · `ApmSyntheticServiceTest` · `ApmP3AccessMvcTest`(4)<br>IT(실 PG) — `ApmSyntheticSchemaIT`(7) · `ApmMessagingRollupIT` · `ApmJobRollupIT` · `ApmMessagingJobQueryIT`(10) · **`ApmRollupTransactionRollbackIT`(4)** |

### 🔄 2차 검수 반영 (2026-09-07 — `_archive/features/apm/core/review_apm-p3-w2_codex.md` #1~#10 + 추가 2건)

| 지적 | 무엇이 바뀌었나 | 계약 영향 |
|---|---|---|
| #1 🔴 | 쓰기 payload에서 `post_type` 제거 — Zabbix 쓰기 스키마에 없는 필드라 생성·단계 수정이 `-32602`였다. 형식은 `posts`의 타입(RAW=문자열·FORM=배열)으로 전달 | 없음(요청 shape 동일, §3.3-10 규칙 추가) |
| #2 🔴 | 읽기 매핑 정정 — **RAW=0 · FORM=1**. 이제 `posts`의 **실제 타입**이 정본이고 `post_type`은 보조 | 없음(값이 옳아짐) |
| #3 🔴 | 결과 아이템 축을 `(hostId, 시나리오)`로 — 동명 시나리오가 서로 덮어쓰던 것 | 없음(값이 옳아짐) |
| #4 | `web.test.error`는 Character(`history=1`) — 아이템 `value_type` 우선, 카탈로그는 폴백 | 없음(실패 사유가 복구됨) |
| #5 🔴 | 이력을 **페이지로 끝까지** 읽고, 최신 상태는 `lastvalue`/`lastclock`으로 별도 조회. 절단은 모든 계열·캘린더에 전파 | **필드 추가** `truncated`(Row·Bound·Calendar) |
| #6 🔴 | 배치 롤업에 **완료 시각 발견 경로** + V54 인덱스 | §5.4 한계 2 개정 |
| #7 | 소비 지연 짝을 `messaging.system`·목적지까지 확인, 불명확하면 미측정 | **필드 추가** `lagUnmeasuredPct` |
| #8 | p95가 격자 상계에 걸리면 **하한**으로 표시 | **필드 추가** `lagP95OverCap` |
| #9 | `delay` 사용자 매크로 통과(표시 환산과 쓰기 검증 분리) | §3.5 문구 |
| #10 | `monitored_by`·`proxy_groupid`로 실행 위치 분기 | **필드 추가** `monitoredBy`·`proxyGroupId`·`locationName` |
| 추가 | 가용성 옆에 수집 공백·신선도 | **필드 추가** `expectedChecks24h`·`coveragePct`·`staleSeconds`·`stale` |
| 추가 | 새 롤업 단계 실패 주입 → 전체 롤백 IT | 없음 |

> 전체 green: `:test` **2830**(직전 2802) · `:engine-zabbix:test` 125.
> IT 5클래스 **skip 0**으로 실제 도커 PG에서 돌았다(V52·V54 적용 포함).

## 7.1 🔴 설계서와 다른 점 (전부 의도적)

### 2차 물결 (합성 감시 · 메시징 · 배치)

1. **웹 시나리오에 프록시 칸을 만들지 않았다.** 설계 §8.1이 `GET /apm/synthetics/proxies`를
   적었고 화면 §3.16이 "프록시별 비교"를 요구하지만, 착수해 보니 **Zabbix 7.0의 `httptest`에
   프록시 필드가 없다** — 시나리오를 실행하는 것은 그것이 붙은 **호스트를 감시하는 쪽**이다.
   그래서 그 EP는 "프록시 목록"이 아니라 **"프록시 + 그 프록시가 감시하는 호스트"**를 준다.
   ⚠️ 이 사실을 화면이 말해 주지 않으면 사용자는 대신 **호스트의 프록시를 바꾸고**, 그 순간
   그 호스트의 **모든 감시**가 옮겨 간다.
2. **"프록시별 비교"는 형제 시나리오 비교로 구현했다** — 같은 첫 URL을 재는 시나리오들을 모은다.
   🔴 **휴리스틱**이고 창도 24시간 고정이다(캘린더의 `days`가 아니다). 위 (1) 때문에 같은
   시나리오가 여러 지역에서 동시에 돌 수 없다.
3. **`GET /apm/synthetics/{id}` 단건 조회를 추가**했다(설계 표에 없다). 수정 폼의 round-trip에
   `httpStepId`가 필요한데 목록에 그것을 다 실으면 목록이 늘 헛되이 무거워진다.
4. **`{dest}`·`{name}`을 path가 아니라 쿼리 파라미터로 받는다.** 토픽 이름에는 `/`가, 잡 이름에는
   `/`·`.`·공백이 흔히 들어간다 — path에 넣으면 **이름이 잘린 채** 닿는다.
5. **30일 캘린더에 일별 응답 시간을 담지 않았다.** 30일 × 단계 수의 history가 필요한데
   (시나리오 하나·단계 3개만으로 13만 점 — Zabbix `history.get` 상한 10만 초과), 이 캘린더가
   답하는 질문은 "언제 안 됐나"이지 "언제 느렸나"가 아니다.
6. **목록의 p95는 창이 24시간이 아니라 60분이다**(`p95WindowMinutes`로 명시). 가용성은
   시나리오당 아이템 하나면 되지만 응답 시간은 **단계마다** 아이템이 있어, 24시간을 물으면
   목록 한 번에 수만 점이 실린다.
7. **`apm_messaging_5m`의 컬럼 이름이 `system`이 아니라 `messaging_system`이다.** `system`은
   PG 키워드와 겹쳐 나중에 따옴표가 필요해지는 문맥을 사람이 예측할 수 없다(이 레포의 기존
   따옴표 컬럼들이 매번 사고를 냈다).
8. **소비 지연 컬럼 다섯(`lag_*`)을 더했다.** 설계 §7 표는 "큐·토픽 집계"라고만 적었지만 화면
   §3.15가 요구하는 축은 처리량·오류·**소비 지연** 셋이다. 🔴 **잴 수 있을 때만** 잰다.
9. **`apm_job_run`은 파티션이 아니다**(`apm_slo_snapshot`·`apm_deployment` 선례) — 이벤트 로그라
   질의 축이 시간 범위보다 `job_name` 단건이 잦다. 대신 **`UNIQUE(trace_id, span_id)`**를 두어
   재실행 멱등성을 자연키로 얻는다(설계 표에 없던 제약).
10. **메시징·배치를 별도 배치 잡이 아니라 트레이스 롤업의 5·6단계로 넣었다.** 원본이 같은
    `apm_span`이고, 워터마크가 갈리면 **"서비스 맵에는 있는데 메시징 표에는 없는 5분"**이 생긴다
    (맵의 `QUEUE` 엣지가 바로 그 PRODUCER 스팬들이다).
11. **`job.*`는 OTel 표준이 아니라 우리 규약이다** — OTel에 배치 시그널이 없다. 그래서 스팬 속성
    허용목록(`ApmSpanAttrAllowlist`)에 세 키를 더했다. 🔴 그 목록에 없으면 적재가 조용히 버려
    `apm_job_run`이 **영원히 빈다**(착수 시점에 실제로 그 상태였다).

### 1차 물결 (SLO · 홈 위젯)

1. **`apm_slo`에 `zbx_itemid`/`zbx_triggerid`를 만들지 않았다.** 설계 §7 표는 SLO 행에 두라고
   적었지만, Zabbix 객체의 소유자는 이미 `apm_alert_rule` + `apm_alert_rule_binding`이다.
   여기 사본을 두면 같은 사실이 **세 곳**에 있게 되고 반드시 갈린다. 대신 링크를 반대로 걸었다 —
   `apm_alert_rule.slo_id`. SLO 화면이 필요로 하는 Zabbix 상태는 `burnAlert.zabbixSynced`·
   `zabbixError`로 조인해 내려 준다.
2. **kind 이름은 `SLO_BURN`을 유지했다**(설계·WBS 표기 `SLO_BURN_RATE`는 별칭으로 받는다).
   §1.5 참조.
3. **`apm_slo_snapshot.good`이 정수가 아니라 `double precision`이다.** LATENCY의 버킷 보간이
   소수를 낸다 — 반올림하면 요청이 적은 SLO에서 하루치 오차가 누적돼 월간 버짓이 눈에 띄게 어긋난다.
4. **`computed_at` 컬럼을 더했다.** 어제 확정분과 오늘 진행분이 같은 모양으로 들어오므로
   행 스스로 "언제 기준인가"를 말해야 한다.
5. **홈 위젯 ②를 "느린 엔드포인트"가 아니라 "느린 서비스"로 냈다.** 엔드포인트 축은 서비스마다
   route 표를 읽어야 해(서비스 수만큼 질의) 폴링 예산에 맞지 않고, 홈에서 필요한 판단은
   "어느 **서비스**로 들어가 볼까"까지다. 엔드포인트는 그 서비스 화면에 이미 있다.

## 7.2 🔴 불안한 지점 (검수용)

### 2차 물결 (합성 감시 · 메시징 · 배치)

1. 🔴 **실 Zabbix round-trip 미검증(여전히).** 2차 검수에서 드러난 쓰기 계약 결함(#1 `post_type`
   전송, #2 RAW/FORM 반전)은 **Zabbix 소스 정본**(`CHttpTest.php` 입력 규칙 · `defines.inc.php`
   상수)으로 확정해 고쳤고 읽기→쓰기 round-trip 테스트를 붙였지만, **실서버에서 시나리오를
   생성→수정→삭제해 보지는 않았다.** 특히 세 가지가 실측으로만 확정된다:
   (a) `httptest.update`에 `steps`를 `httpstepid`와 함께 되돌려 보냈을 때 **정말 이력이
   유지되는가**(이 계약 전체가 그 가정 위에 있다), (b) 한글 이름·단계 이름이 결과 아이템 키에
   실제로 어떻게 인용되는가(`ApmSyntheticItemCatalog`의 파서가 그 형태를 맞혀야 한다),
   (c) `httptest.create`가 `-32602`를 주는 조건들이 우리 사전 검증과 겹치는가.
2. 🔴 **결과 아이템 키 규칙이 문서 기반이다.** `web.test.in[s,,bps]`·`web.test.time[s,step,resp]`
   같은 형태는 Zabbix 문서와 통례를 따랐고 **이 설치본에서 실제로 그런지 확인하지 않았다.**
   틀리면 증상은 오류가 아니라 **빈 차트**다(어느 아이템도 매칭되지 않는다) — 정상 동작과
   구분되지 않으므로 QA에서 반드시 실 아이템 키를 눈으로 볼 것.
3. ⚠️ **목록 비용이 시나리오 수 × 단계 수에 비례한다.** Zabbix 호출은 6회로 고정이지만
   `history.get`이 실어 오는 **점의 수**는 그렇지 않다. p95 창을 60분으로 좁혀 두었어도
   시나리오 50개 × 단계 5개면 15,000점이다. 실측 전이다.
4. ⚠️ **소비 지연의 배치 근사.** 배치 소비(링크 여러 개)에서 **첫 링크만** 본다. 그 값은
   배치 크기에 따라 임의로 변하는데, 계약에 적었을 뿐 화면에서 그 사실이 보이지는 않는다.
5. ⚠️ **발행 lookback 1시간.** 그보다 오래 큐에 머문 메시지 — 즉 **가장 보고 싶은 지연** — 은
   `lagCount`에 안 들어간다. `lagUnmeasuredPct`가 커지는 것으로만 드러난다.
   ✅ 2026-09-07: 기준을 **처리 창 시작 → 개별 소비 시각**으로 바꿔, 창 크기에 따라 같은 표본이
   들어갔다 나갔다 하던 것은 없앴다. lookback 1시간 자체는 그대로다.
6. ⚠️ **지연 히스토그램의 격자 상한이 10초다**(지속시간과 같은 `duration_s` 14단을 공유).
   전용 격자를 만들지 않은 이유는 `CanonicalBounds`·`apm_hist_bounds`·`isCanonical` 세 곳이
   갈리면 **모든 히스토그램이 조용히 재버킷되기** 때문이다.
   ✅ 2026-09-07 정정: "`lag_max_ns`로 조인 근사"라는 설명은 **틀렸다**. 상계를 넘은 p95는
   마지막 유한 경계(10초)로 나오는데 그 값이 관측 min·max 사이에 있으면 클램프가 아무 일도
   하지 않는다(1초 1건·60초 99건 → p95가 10초로 6배 과소). 값을 지어내는 대신
   **`lagP95OverCap`으로 "이건 하한이다"를 내보낸다**. 근본 해결(전용 격자)은 여전히 미착수.
7. 🔴 **`ApmTraceRollupService`의 트랜잭션이 두 단계만큼 커졌다.** 메시징·배치가 실패하면
   엣지·에러·DB·의존까지 함께 롤백된다. 워터마크가 안 움직이므로 손실은 없지만, **한 도메인의
   결함이 나머지 넷을 멈출 수 있는 결합**이 새로 생겼다. 같은 창을 공유해야 한다는 요구와
   맞바꾼 것이고, 되돌리려면 워터마크를 갈라야 한다.
   ✅ 2026-09-07: 그 롤백이 **실제로 일어나는지**를 `ApmRollupTransactionRollbackIT`가 실행으로
   못 박는다(새 두 단계에 각각 예외를 주입 → 네 집계 0행 + 워터마크 미전진 + 다음 회차 복구).
8. ✅ **해소(2026-09-07)** — 예전 문구는 "하루보다 긴 배치"라고 적었지만 실제 경계는 **약 15분**
   이었다(재처리 창 = 워터마크 + 두 버킷). 지금은 **완료 시각이 창에 걸치는** 실행도 함께 줍고
   (V54 부분 인덱스가 그 스캔을 감당한다), `(trace_id, span_id)` UPSERT라 중복되지 않는다.
   ⚠️ 남는 한계는 **스팬 보존 7일을 넘겨 끝나는 잡**뿐이다.
9. ⚠️ **`traceLinkable`은 보존 일수 기준의 근사**다(파티션이 아직 안 지워졌으면 열릴 수도 있다).
   열리는데 비활성인 쪽이 눌렀는데 비는 쪽보다 낫다고 판단했다.
10. ⚠️ **`ApmSpanAttrAllowlist` 변경은 소급되지 않는다.** `job.*`·`messaging.destination`을 이제야
    허용했으므로 **그 전에 저장된 스팬에는 여전히 없다** — 배치 화면은 배포 이후의 실행부터
    채워진다. 빈 화면을 보고 규약 위반으로 오진하지 말 것.
11. ⚠️ **`apm_messaging_5m`의 목적지는 열린 축이다.** 임시 큐(`amq.gen-*`)나 파티션별 토픽명을
    쓰는 구성에서 행이 폭발할 수 있다. 상한 대신 30일 파티션 DROP만 두었다 — 실측 후 정규화가
    필요해지면 그때 넣는다(지금 넣으면 정상 이름까지 뭉갠다).
12. ✅ **해소(2026-09-07)** — 프록시 그룹 호스트를 "서버 직접 감시"로 접던 것은 **오표시**였다
    (지역 비교에서 다른 관측 위치가 서버 줄에 합쳐진다). 이제 `monitored_by`·`proxy_groupid`를
    함께 읽어 `SERVER`/`PROXY`/`PROXY_GROUP`/`UNKNOWN`으로 가른다. "없는 필드로 host.get이
    죽는다"는 옛 우려는 성립하지 않았다 — 같은 레포의 `HostManageService`·`HostSnapshotReader`가
    이미 `monitored_by`를 요청하고 있고 이 제품은 Zabbix 7.0 전용이다.
    ⚠️ **그룹 이름은 여전히 모른다**(`proxygroup.get`을 엔진 계약에 넣지 않았다) — 화면에는
    "프록시 그룹"이라고만 나온다.
13. 🔴 **V54 부분 인덱스의 쓰기 비용을 실측하지 않았다.** `apm_span`은 수신 경로에서 가장 자주
    INSERT되는 테이블이고, 부분 인덱스는 **모든 INSERT가 술어를 평가**한다(두 컬럼 비교라 무시할
    수준이라고 판단했지만 부하 실측은 없다). 또 파티션 부모에 만드는 인덱스라 **설치 시점에
    짧은 ACCESS EXCLUSIVE**가 걸린다 — 데이터가 이미 쌓인 설치본에 적용할 때의 소요는 미측정이다.
14. ⚠️ **배치 완료 경로의 스캔 범위가 7일이다.** 인덱스가 있어 계획상 싸지만, 루트 `INTERNAL`
    스팬이 유난히 많은 설치본(작업 큐 워커 등)에서는 5분마다 그 인덱스를 7일치 훑는다.
    필요하면 `ApmJobRollupStep.LATE_ARRIVAL_LOOKBACK_DAYS`를 줄이는 것이 첫 조정 지점이다.
15. ⚠️ **`lastvalue`는 Zabbix "Max history display period"(기본 24시간) 안에서만 채워진다.**
    그보다 오래된 마지막 값은 `lastclock='0'`으로 오고, 그때만 이력의 마지막 점으로 떨어진다.
    설치본이 그 설정을 아주 짧게 잡으면 상태 판정이 다시 이력(=절단 가능)에 의존한다.
16. ⚠️ **`stale` 임계(주기×3, 최소 5분)는 근거 없는 상수다.** 재시도 한 번을 흡수하는 폭으로
    골랐을 뿐 실측이 없다. 재시도를 많이 거는 시나리오에서 거짓 `stale`이 날 수 있다.
17. ⚠️ **소비 지연 짝 확인을 조인 술어로 넣었다.** `p.attrs->>'messaging.system'` 등은 GIN
    `jsonb_path_ops` 인덱스를 타지 못한다(`->>`는 포함 연산이 아니다). 표본이 큰 설치본에서
    이 조인의 비용이 늘 수 있다 — 실측 전이다.
18. ⚠️ **V52·V54는 이 세션에서 IT DB(매 실행 drop&create)에만 적용됐다.** 공유 dev DB에 이미
    적용한 뒤 이 파일을 고치면 checksum이 깨진다 — 지금은 그런 상태가 아니지만, 재검토로
    V52를 수정하려면 그 사실을 먼저 확인할 것.

### 1차 물결 (SLO · 홈 위젯)

1. **런타임 미검증.** 단위·IT는 전부 green(2682, 신규 +114)이지만 **실 서버에서 EP를 호출해
   보지 않았다.** 특히 (a) `GET /apm/slos`의 질의 3회 × SLO 수가 실제로 얼마나 걸리는지,
   (b) Zabbix에 `apm.slo_burn[...]` 아이템·트리거가 실제로 만들어지고 값이 도달하는지
   (`history.push` round-trip)는 **실측이 필요하다**.
2. **`slo` ↔ `alert` 패키지 순환.** `ApmSloService → ApmAlertService`(규칙 관리)와
   `ApmAlertEvaluationService → ApmSloCalculator`(평가)가 양방향이다. 기존
   `service ↔ alert`(서비스 삭제가 `releaseService`를 부른다)와 같은 모양이고 **빈 순환은 없지만**,
   세 번째 방향을 늘리면 정리하기 어려워진다.
3. **`burn_1h`/`burn_6h`의 스냅샷 정의가 "그날 끝 시점"이다.** 롤링 창 값이라 하루에 대응하는
   값이 없어 내린 결정인데, 화면이 이것을 "그날의 번 레이트"로 읽으면 미묘하게 틀린다.
   캘린더 툴팁 문구를 검수할 것.
4. **`target`·`windowDays`를 바꿔도 과거 스냅샷은 다시 계산되지 않는다.** `good`/`total`은
   목표와 무관해 캘린더의 SLI는 맞지만, 거기 굳은 `budget_remaining`·`burn_*`는 **옛 목표 기준**이다.
   되계산하지 않은 것은 "지난주에 우리가 본 값"을 사후에 바꾸는 일이라서인데, 화면에 그 사실을
   알리는 장치가 **없다**.
5. **위젯 EP가 폴링된다.** 권한 판정 1회당 `user`+`role` 조회 2건이 붙고(관리자는 0건) 카드
   셋이면 새로고침마다 3회다. 초 단위 폴링이 붙으면 요청 스코프 캐시가 필요하다.
6. **`sloRisks`의 비용이 SLO 수에 비례한다**(`ApmSloService.list`가 SLO마다 세 창을 잰다).
   SLO가 수십 개를 넘으면 창 전체 계산을 **일 스냅샷 합산**으로 바꿔야 한다.
7. **`GET /apm/alert-rules/preview`에서 `SLO_BURN`은 빈 선을 준다.** 거절하지 않고 빈 시계열을
   주는데, 그 화면에서 SLO를 고를 축이 없어서다(대상이 서비스 축이다). 미리보기가 필요하면
   SLO 화면의 번다운 곡선이 그 역할을 한다 — FE가 이 조합을 만들지 않게 할 것.

## 7.3 🔄 FE 반영 (WBS 7.18 SLO 화면 · 7.19 홈 위젯)

- **7.18 SLO 화면**: 표(§1.2 `SloRow`) → 상세(게이지 C4 + 캘린더 C11) → 시계열(C1 두 곡선 +
  목표 markLine). 생성/수정 폼은 §1.2 `SloUpsert`, 번 레이트 알람 토글은 `burnAlert*`.
  🔴 §1.3의 여덟 가지를 먼저 읽을 것.
- **7.19 홈 위젯 3 + 카탈로그**: §2.1의 코드 3개를 FE 카탈로그·타입·렌더러·i18n에 더한다.
  `homeWidgetRegistry.test.tsx`(BE enum ↔ FE 카탈로그 1:1)가 안 맞으면 빨개진다.
- **사이드바**: SLO는 상위 6개 노출 대상이 **아니다**(설계 §1 — 화면은 존재하되 개요 카드·
  서비스 상세 탭·설정 ⚙ `SettingsMenu.SETTINGS_ENTRIES`로 진입). 라우트·도움말·AI 가이드는 만든다.

## 7.4 🔄 FE 반영 — 2차 물결 (WBS 7.17 합성 감시 · 메시징/배치 화면 · §3.13 서비스 상세 탭)

- **7.17 합성 감시(메뉴 9)**: 표(§3.2 `SyntheticRow`) → 상세/폼(§3.2 `SyntheticDetail` +
  `SyntheticUpsert`) → 결과(단계별 C2 stacked + 응답 코드 C10) → 캘린더 C11 + 지역 비교 C2 +
  실패 사유 표. 🔴 **§3.3의 열세 가지를 먼저 읽을 것** — 특히 (1) `httpStepId` round-trip과
  (4) "프록시 칸을 만들지 말 것"은 어기면 데이터가 조용히 손상된다.
  - 🔴 **(2026-09-07 추가) 실행 위치는 `monitoredBy`로 판정하고 `locationName`을 그대로 그린다**
    (§3.3-11). `proxyId === null`을 "서버"로 읽으면 프록시 그룹이 서버 줄에 섞인다.
  - 🔴 **가용성 배지 옆에 `stale`·`coveragePct`를 함께 그린다**(§3.3-12). 이 둘이 없으면
    23시간 전 성공 한 점도 `OK · 100%`로 보인다.
  - 🔴 **`truncated`(조회 한계)와 수집 공백을 다른 문구로 안내한다**(§3.3-13).
  - **사이드바 노출 대상이다**(설계 §1의 상위 6 중 하나: `1 개요 · 2 서비스 · 3 서비스 맵 ·
    4 트레이스 탐색 · **9 합성 감시** · 13 수집기`).
- **서비스 상세 "합성" 탭(§3.13)**: `GET /apm/services/{uid}/synthetics` + bind/unbind.
  🔴 `orphaned: true` 줄을 **숨기지 말 것**(§3.2) — 그 줄은 `name`이 null이라 `label` 또는
  `httptestId`가 표시 이름이다.
- **메시징·배치(메뉴 8)**: 사이드바에 **노출하지 않는다**(설계 §1 — 개요 카드·서비스 상세 탭·
  글로벌 검색으로 진입). 한 화면 안에서 두 절로 나눈다: 위 = 큐/토픽(§4), 아래 = 배치(§5).
  - 큐/토픽 표는 §4.3-1 때문에 **같은 토픽이 여러 줄**이다. 기본 그룹핑을 넣더라도 원본 줄을
    펼칠 수 있게 할 것.
  - 🔴 **`lagCount`를 표에 상설 노출**할 것(§4.3-2). 툴팁에만 두면 편향이 감춰진다.
    `lagUnmeasuredPct`(2026-09-07 신설)를 함께 쓰면 나눗셈을 화면이 다시 하지 않아도 된다.
  - 🔴 **`lagP95OverCap=true`인 칸은 `10초+`처럼 하한 표기**로 그릴 것(§4.3-6). 그냥 숫자로
    그리면 60초 지연이 10초로 보이는데 **그 화면은 이상해 보이지 않는다**.
  - 배치 간트는 `lanes`를 그대로 행으로 쓴다(이름순 고정 — §5.2).
  - 🔴 **빈 상태에 §5.3 계측 규약과 코드 예시를 그대로 실을 것**(§5.0). "배치 작업이 없습니다"만
    쓰면 사용자는 그것을 사실로 읽는다.
- **차트 프리미티브 신규**: C10(상태 스트립 — `InstanceTimeline` 재사용 후보) · C11(캘린더) ·
  C14(간트). ECharts `custom` 시리즈가 필요한 첫 자리다(설계 동반 문서 §2).

## ✅ BE 회신 — FE 요청 R-1~R-5 (2026-09-07, 코덱스 1차 검수 반영과 함께)

> 🔴 **먼저 읽을 것: 이번 반영으로 SLO 응답이 넓어졌다.** 필드가 **추가**됐고 기존 필드는
> 이름·타입이 그대로지만, `requests`의 **뜻이 정확해졌다**(예전에도 "전체 요청 수"라고 적혀
> 있었지만 LATENCY에서는 실제로 *잴 수 있었던* 수가 들어가고 있었다). 지금은 그 값이
> `measured`로 분리됐다. FE가 `requests`를 SLI의 분모로 쓰고 있었다면 `measured`로 바꿔야 한다.

| # | 회신 |
|---|---|
| **R-1** | ✅ **여섯 표본 전부 떨궜다.** `slos.json` · `slo-detail.json` · `slo-series.json` · `widget-status-summary.json` · `widget-slow-services.json` · `widget-alerts.json` (경로 `moveseye-be-spring/src/test/resources/apm/contract/`). `ApmContractFixtureTest`가 **실제 DTO를 애플리케이션 ObjectMapper로 직렬화해** 대조하므로, 응답이 바뀌면 BE 테스트가 먼저 깨진다. FE는 파생 픽스처를 이쪽으로 갈아탈 것 |
| **R-2** | ✅ **세 질문 전부 "그렇다"** — 표본 `slo-series.json`이 그대로 답한다. ① 요청 0건 칸은 `sliPct: null`·`requests: 0`으로 **행이 나온다**(빼지 않는다) ② `budgetRemainingPct`는 창 시작부터 누적이라 **단조 감소**다 ③ 창 전체 요청이 0건이면 `errorBudgetTotal`이 `null`이고 그때 전 구간 `budgetRemainingPct`도 `null`이다. ⚠️ 추가된 `measured`·`mixedBounds`를 점 단위로도 실었다 |
| **R-3** | ✅ **`7 \| 30` 리터럴 유니온 유지해도 된다 — 늘릴 계획 없다.** 서버가 그 둘만 허용하고(`APM_SLO_INVALID_WINDOW`), 창을 늘리려면 **기본 임계 계산·캘린더 길이·스냅샷 백필 상한**이 함께 움직여야 해서 조용히 넓힐 수 있는 값이 아니다. 늘리게 되면 계약서 개정으로 먼저 알린다 |
| **R-4** | ✅ 그대로 두면 된다. 카탈로그 노출을 `apm.view`로 태우고 **붙어 있는 카드도 안 그리는** 처리가 의도와 같다(레이아웃은 지우지 않는다). 기본값이 열림인 것도 맞다 — 권한 맵을 못 읽은 첫 렌더에서 위젯이 깜빡 사라지지 않게 하는 쪽이 낫다 |
| **R-5** | 아래 세 항목 개별 회신 |

### R-5 상세

1. **`GET /apm/slos?service=`에 SLO가 없는 서비스 uid → 빈 배열.** ✅ 맞다. 404는 **서비스 uid
   자체가 없을 때**만이다(`APM_SERVICE_NOT_FOUND`).
2. **`PUT`에 `burnAlertThreshold`를 항상 실어도 무해한가.** ✅ **무해하다 — 그렇게 하는 편이 낫다.**
   부분 수정이라 생략하면 기존 값이 남고, 폼에 새 값이 떠 있으면 "바꿨는데 안 바뀌었다"가 된다.
   🔴 **단 상한이 생겼다**: `threshold >= burnAlert.maxThreshold`(= `1/(1-목표)`)면
   `APM_ALERT_RULE_INVALID_THRESHOLD`로 거절한다. 폼의 max를 그 값(배타)으로 걸고, **목표를
   낮추는 수정에서는 임계도 함께** 보내야 한다 — 목표만 낮춰 기존 임계가 도달 불가가 되면
   서버가 그 요청 전체를 거절한다(조용히 낮추지 않는다).
   🔴 **`burnAlertEnabled`는 반대다 — 안 보내는 것이 "그대로 두라"이므로 생략을 유지할 것.**
   (2026-09-07 이전에는 생략이 "켜라"로 읽혀 **꺼 둔 규칙이 이름만 고쳐도 되살아났다**.)
3. **`burnAlertEnabled: false`로 저장하면 규칙 행이 남는가.** ❌ **아니다 — 규칙 행이 삭제된다.**
   Zabbix 아이템·트리거도 함께 지운다. 화면 문구를 고쳐야 한다.
   - 근거: 비활성 규칙을 남기면 **알람 규칙 목록에 사용자가 만든 적 없는 행**이 계속 보이고,
     그 행을 알람 화면에서 다시 켜면 SLO 화면의 표시와 갈린다. 입구가 하나면 상태도 하나다.
   - 🔴 **"SLO를 끄면"(§1.5)과 다른 동작이다**: SLO `enabled:false`는 규칙 행을 **남기고**
     대상만 비워 5분 안에 조용해진다(다시 켜면 알람도 돌아온다). `burnAlertEnabled:false`는
     규칙 자체를 없앤다(다시 켜면 **새 규칙 uid**가 생기고 발화 이력의 연결이 끊긴다).
     확인 모달이 그 차이를 안내하는 편이 좋다.
   - ⚠️ Zabbix 삭제가 실패해도 **저장은 성공한다**(예전과 같다). 다만 이제 남은 객체 id가
     정리 큐에 들어가 5분마다 재시도된다 — "지운 알람이 계속 울리는" 상태가 스스로 풀린다.
4. **위젯 `alerts[].kind`가 계약 enum 밖일 때 원문을 그대로 적는다.** ✅ 맞다(BE도 모르는 종류에는
   `thresholdUnit`을 빈 문자열로 준다 — 틀린 단위는 없는 단위보다 나쁘다).

---

## 🔄 FE 요청사항

FE 1차 구현(2026-09-07, SLO 화면 + 홈 위젯 3종) 중 확인이 필요했던 것들. **구현을 막은 것은
없다** — 전부 계약서 본문으로 채웠고, 아래는 "추측으로 메운 자리"의 목록이다.

### R-1. 🔴 SLO·위젯 표본 JSON이 BE 테스트 리소스에 없다

`moveseye-be-spring/src/test/resources/apm/contract/` 에는 P1·P2 표본 22종만 있고 SLO·위젯은
없다. FE 계약 픽스처(`src/__tests__/fixtures/apmSloContractSample.ts`)는 **계약서 §1.7 예시를
글자 그대로** 옮겨 만들었고, 예시가 없는 것은 성질만 지켜 파생으로 채웠다(주석에 `⚠️ 파생` 표시).

요청: 아래 6개를 표본으로 떨궈 주면 FE가 그쪽으로 갈아탄다(P1·P2와 같은 방식).
`slos.json` · `slo-detail.json` · `slo-series.json` ·
`widget-status-summary.json` · `widget-slow-services.json` · `widget-alerts.json`

### R-2. `GET /apm/slos/{uid}/series`에 예시 JSON이 없다

타입(§1.2)만 있고 실제 응답 예시가 없어 FE 픽스처를 **파생**으로 만들었다. 특히 확인이 필요한 것:
- 요청이 0건인 칸이 `sliPct: null` · `requests: 0`으로 오는가(그렇게 가정했다).
- `budgetRemainingPct`가 **그 칸에서도** 누적 잔량인가(단조 감소, §1.3-6). FE 테스트가 이 성질을
  픽스처에 대해 검사하고 있으니, 실제 응답이 어기면 알려 달라.
- 창 전체에 요청이 0건이면 `errorBudgetTotal`이 `null`인가.

### R-3. `windowDays`를 FE가 `7 | 30` 리터럴 유니온으로 굳혔다

계약이 "7·30만"이라고 못 박아 타입을 좁혔다(`TApmSloWindowDays`). BE가 나중에 값을 늘리면
**컴파일은 통과하고 런타임에서만 어긋난다**(응답은 그냥 number다). 창 종류를 늘릴 계획이 있으면
미리 알려 달라 — FE는 그때 폼 선택지·타입을 함께 넓힌다.

### R-4. 홈 위젯 카탈로그 노출 축을 `apm.view`로 태웠다

계약 §2.1의 ⚠️대로 `isHomeWidgetTypeVisible`에 `apmView`를 넘겨 **권한 없으면 카탈로그에서
감춘다**. 여기에 더해 **이미 붙어 있는 카드도 그리지 않는다**(`HomeWidgetGrid`) — 안 그러면
권한을 잃은 사용자의 홈에 403 배너 카드가 남는다. 레이아웃 데이터는 지우지 않으므로 권한이
돌아오면 제자리에 다시 나타난다.
⚠️ 기본값은 **열림**이다(`apmView`를 안 넘기면 보인다) — 권한 맵을 아직 못 읽은 첫 렌더에서
위젯이 깜빡 사라지지 않게 한 것이다.

### R-5. 확인만 — 아래는 계약대로 구현했고 반대 동작이면 알려 달라

- `GET /apm/slos?service=`에 SLO가 없는 서비스 uid를 주면 **빈 배열**(404가 아니라).
- `PUT`에 `burnAlertThreshold`를 **항상 싣는다**. 부분 수정이라 안 보내면 기존 값이 남는데,
  폼에는 새 값이 떠 있어 "바꿨는데 안 바뀌었다"가 되기 때문이다. 매번 실어도 무해한 것이 맞나?
- `burnAlertEnabled: false`로 저장하면 규칙 행은 남고 Zabbix 트리거만 내려가는가
  (§1.5는 "SLO를 끄면"에 대해서만 적고 있다). 화면은 그렇게 가정하고 문구를 썼다.
- 위젯 `alerts[].kind`에 계약 enum 밖의 값이 오면 FE는 **원문을 그대로** 적는다(키를 지어내지
  않는다) — 알람 규칙 화면과 같은 규칙이다.

---

## 🔄 FE 요청사항 — 2차 물결 (합성 감시 · 메시징 · 배치)

FE 2차 구현(2026-09-07, WBS 7.17 + §3.13 서비스 상세 합성 탭) 중 확인이 필요했던 것들.
**구현을 막은 것은 없다** — 전부 계약서 본문(§3~§5)으로 채웠고, 아래는 "추측으로 메운 자리"와
"실서버 검증이 FE 쪽에서는 불가능한 자리"의 목록이다.

### R-6. 🔴 합성 감시·메시징·배치 표본 JSON이 BE 테스트 리소스에 없다

1차 물결의 R-1이 해소돼 `slos.json`·`slo-detail.json`·`slo-series.json`·`widget-*.json`이
`moveseye-be-spring/src/test/resources/apm/contract/` 에 생긴 것을 확인했다(감사하다).
2차 물결의 8개 응답에는 아직 표본이 없어 픽스처를 이렇게 만들었다:

| 픽스처 | 출처 |
|---|---|
| `SYNTHETIC_FAILED_ROW` · `SYNTHETIC_BOUND_ORPHANED` | ✅ §3.6 예시를 **글자 그대로** |
| `MESSAGING_DESTINATIONS_SAMPLE` · `JOBS_SAMPLE` · `JOB_TIMELINE_SAMPLE` | ✅ §4.5·§5.6 예시를 **글자 그대로** |
| `SYNTHETIC_DETAIL_SAMPLE` · `SYNTHETIC_RESULTS_SAMPLE` · `SYNTHETIC_CALENDAR_SAMPLE` · `SYNTHETIC_PROXIES_SAMPLE` | ⚠️ **파생**(§3.2 타입 + §3.3 규약에서) |
| `MESSAGING_SERIES_SAMPLE` · `JOB_RUNS_SAMPLE` | ⚠️ **파생**(§4.2·§5.2 타입에서) |

요청: 아래 6개를 떨궈 주면 FE가 그쪽으로 갈아탄다(P1·P2·SLO와 같은 방식).
`synthetic-detail.json` · `synthetic-results.json` · `synthetic-calendar.json` ·
`synthetic-proxies.json` · `messaging-series.json` · `job-runs.json`

파생 픽스처는 `src/__tests__/fixtures/apmSyntheticContractSample.ts` ·
`apmMessagingContractSample.ts` 에 있고, 파생인 자리마다 `⚠️` 주석을 달아 두었다.

### R-7. 🔴 `httpStepId` round-trip을 FE는 **증명할 수 없다**

이 화면 전체가 §3.3-1("기존 단계는 `httpStepId`를 그대로 되돌려 보낸다") 위에 서 있고,
어기면 증상이 오류가 아니라 **응답 시간 이력의 조용한 소멸**이다. FE는 여기까지 했다:

- 폼이 상세 응답을 통째로 들고 있다가 통째로 보낸다(편집 UI가 없는 `queryFields`·`postFields`
  까지 텍스트로 실어 둔다 — 안 실으면 `steps` 전체 교체에서 사라진다).
- 순수 함수(`apmSyntheticUpsertFromForm`)와 폼 렌더 양쪽에서 `httpStepId` 유지를 어서션한다.

**하지만 "그렇게 보냈을 때 Zabbix가 정말 이력을 유지하는가"는 FE가 확인할 수 없다.**
§7.2-1(a)가 미검증으로 남아 있는 그 항목이다 — 실서버 round-trip 검증에서 **수정 전후로 그 단계의
`web.test.time[...]` 아이템 id가 같은지**를 꼭 봐 달라. 다르면 이 화면의 수정 기능은 쓸 수 없다
(그때는 "수정은 이름·URL만, 단계 구조는 Zabbix에서"로 좁혀야 한다).

### R-8. ⚠️ 결과 아이템 키가 틀리면 증상이 **빈 차트**다 — QA 항목으로 남겨 둔다

§7.2-2가 적은 대로 `web.test.time[시나리오,단계,resp]` 형태는 문서 기반이다. 틀렸을 때 FE 화면은
오류를 띄우지 않고 **"측정이 없던 창"과 똑같이** 보인다(단계별 응답 시간 카드가 Empty, 응답 코드
띠가 빈 상태). 그래서 FE 쪽에는 이 결함을 드러낼 장치가 없다 — 실서버에서 **아이템 키를 눈으로**
확인해 달라. 한글 시나리오·단계 이름의 인용 형태(§7.2-1(b))도 같은 자리다.

### R-9. 프록시 칸을 만들지 않았고, 대신 "감시 위치" 카드를 세웠다

§3.3-4·§7.1-1을 그대로 따랐다. 화면에서 한 일:
- 폼에 프록시 입력이 **없다**. 대신 호스트 셀렉터의 옵션이 **프록시별 그룹**으로 묶여 있다.
- 목록·상세 아래에 `GET /apm/synthetics/proxies`를 쓰는 카드를 두고, "호스트의 프록시를 바꾸면
  그 호스트의 **모든 감시**가 옮겨 간다"를 경고로 상설 노출한다.
- 프록시 그룹 한계(§7.2-12)를 그 카드 각주에 적었다.

확인 요청: `proxies`의 `hosts`가 **웹 시나리오를 붙일 수 있는 호스트 전체**인가, 아니면 이미
시나리오가 있는 호스트만인가? 폼의 호스트 셀렉터가 이 목록**만** 쓰고 있어서, 후자라면
**첫 시나리오를 만들 호스트를 고를 수 없다**(빈 설치본에서 화면이 잠긴다). 계약 §3.2는
`hostCount`/`scenarioCount`를 따로 주므로 전자로 읽었다.

### R-10. `GET /apm/jobs/runs`의 404를 오류 배너로 띄우지 않는다

§5.5의 `APM_JOB_NOT_FOUND`는 "표와 이력의 창이 어긋났다"는 신호라, 화면은 붉은 오류 대신
**"창을 넓혀 보라"는 안내**로 옮겼다(잡 표는 90일, 실행 이력은 툴바 창이라 실제로 자주 어긋난다).
`useDmoveQuery`가 업무 오류를 에러로 올려 주므로 FE는 `error`의 존재만 보고 분기한다.

확인 요청: 이 EP가 404 말고 다른 사유로도 에러를 낼 수 있나? 낸다면 지금 화면은 그것도
"창을 넓혀 보라"로 안내한다 — `errorCode`로 갈라야 하면 알려 달라.

### R-11. 메시징 시계열을 **오퍼레이션마다 한 번씩, 넷 다** 부른다

§4.3-5("두 선을 그리려면 두 번 부른다")를 따랐는데, 어느 둘인지는 구성에 따라 다르다
(폴링 소비자는 `RECEIVE`만, 스트림 소비자는 `PROCESS`만 낸다). 그래서 목적지를 고르면
`PUBLISH`·`RECEIVE`·`PROCESS`·`SETTLE` **네 번**을 부르고 점이 있는 것만 선으로 그린다.

확인 요청: 목적지 하나당 4회가 부담스러운 비용인가? 부담이면 두 가지 중 하나를 부탁한다 —
(a) `operation`에 복수 값을 받아 한 응답에 계열을 나눠 주기, 또는 (b) `destinations` 응답에
"이 목적지에 실제로 있는 오퍼레이션 목록"을 한 필드로 얹어 주기(그러면 FE가 있는 것만 부른다).

### R-12. 확인만 — 아래는 계약대로 구현했고 반대 동작이면 알려 달라

- **활성 토글이 `PUT`에 `enabled` 하나만 싣는다.** `steps`를 생략하면 유지된다는 §3.2를 믿었다 —
  생략이 "전체 삭제"로 해석되는 일이 절대 없어야 한다(그러면 토글 한 번에 시나리오가 빈다).
- **`bind`에 이미 다른 서비스가 가진 시나리오를 보내면 409**(`APM_SYNTHETIC_ALREADY_BOUND`)다.
  FE는 후보 목록에서 `boundServiceUid != null`을 미리 걸러 두지만, 목록과 연결 사이의 경합은
  서버 거절에 기댄다.
- **`unbind`는 Zabbix 시나리오를 건드리지 않는다.** 확인 모달이 "시나리오는 계속 돕니다"라고
  적는다 — 반대면 문구가 거짓말이 된다.
- **`GET /apm/synthetics`에 창 파라미터를 안 보낸다.** 가용성 24h·p95 60분은 서버 고정이고
  툴바가 못 바꾼다고 읽었다(§7.1-6). 이 목록에 `from/to`를 받을 계획이 생기면 알려 달라 —
  FE는 지금 그 축을 쿼리 키에서 아예 뺐다.
- **캘린더는 `days`만 보낸다**(창과 무관한 축). `?synDays=`로 7·30만 고르게 했다 —
  다른 값도 받는다면 선택지를 넓히겠다.
- **`byProxy`의 `availabilityPct: null`을 막대에서는 0으로 그린다**(막대에 "없음"을 그릴 자리가
  없다). 표 토글과 각주가 그 사실을 말한다 — 더 나은 표현을 아는 쪽이 있으면 알려 달라.

---

## 🔄 FE 요청사항 — 3차 (계약 최신본 동기화 후, 2026-09-07)

BE 수정 라운드 2회(`dba4386` SLO · `b2c85dd` 합성/메시징/배치)를 FE에 전량 반영했다
(SLO 4창 OR 판정 · `measured`/`mixedBounds` · `measuredFrom/ToMs` · 캘린더 `finalized`·
`staleDefinition` · `maxThreshold` · 합성 `monitoredBy`/`locationName`/커버리지·신선도·`truncated` ·
메시징 `lagUnmeasuredPct`/`lagP95OverCap` · 배치 늦은 도착 문구). **구현을 막은 것은 없다.**

### 아직 회신이 없는 것 (2차 물결 요청)

| # | 상태 |
|---|---|
| **R-6** | ⏳ 표본 6종 미제공 — `synthetic-detail.json` · `synthetic-results.json` · `synthetic-calendar.json` · `synthetic-proxies.json` · `messaging-series.json` · `job-runs.json`. FE 픽스처의 그 자리는 여전히 `⚠️ 파생`이다 |
| **R-7 · R-8** | ⏳ FE가 증명할 수 없는 항목(실 Zabbix round-trip의 `httpStepId` 이력 유지 · 결과 아이템 키). QA에 그대로 남긴다 |
| **R-9** | ⏳ `proxies`의 `hosts`가 "웹 시나리오를 붙일 수 있는 호스트 **전체**"인가. 폼 셀렉터가 이 목록만 쓰므로 후자(이미 시나리오가 있는 호스트만)라면 **빈 설치본에서 첫 시나리오를 만들 수 없다**. 지금은 전자로 두고 목록이 비면 안내를 띄운다 |
| **R-10** | ⏳ `GET /apm/jobs/runs`가 404 말고 다른 사유로도 에러를 내는가(지금 화면은 전부 "창을 넓혀 보라"로 안내한다) |
| **R-11** | ⏳ 목적지당 시계열 4회 호출이 부담인가. 지금 그대로 넷을 부른다 |

### 새로 생긴 확인 요청

- **R-13. 🔴 번 알람을 *끄는* 요청에 `burnAlertThreshold`를 싣지 않는다.** R-5-2는 "항상 싣는 편이
  낫다"였지만, `burnAlertEnabled:false`는 **규칙을 삭제**하는 경로다 — 지워질 규칙의 임계가
  상한 검증(`APM_ALERT_RULE_INVALID_THRESHOLD`)에 걸려 **요청 전체가 거절되는** 쪽이 더 나쁘다고
  판단했다. 끄기 요청에도 임계 동반이 필요하면 알려 달라.
- **R-14. `burnCondition`이 `FAST`·`SLOW`인 표본이 없다.** `slos.json`의 두 줄이 `NONE`·`UNKNOWN`
  뿐이라, 발화 중인 두 상태의 렌더는 FE 인라인 파생으로만 검증했다 — 표본에 한 줄만 더해 주면
  그 자리도 표본 기반이 된다.
- **R-15. `lagUnmeasuredPct`가 §4.5 예시의 `PUBLISH` 줄에 없다.** 그 줄은 `count>0`·`lagCount:0`
  이므로 FE는 **`100.0`**으로 채우고 `lagP95OverCap:false`로 뒀다(§4.2의 "count=0이면 null"에서
  유추). 맞는지 확인해 달라 — 이 줄이 "발행은 지연 개념이 없다"를 화면에서 구분하는 근거다.
- **R-16. 한 번도 안 돈 시나리오의 `coveragePct`·`staleSeconds`.** §3.4가 `stale=false`만 못 박아
  두 값을 `0`/`null`로 가정했다. `coveragePct:0`이 "한 번도 안 돎"과 "완전히 끊김"을 같은 값으로
  만드는데, 그 둘은 `lastStatus`(`UNKNOWN` vs 값 있음)로만 갈린다 — 의도한 규약이 맞나?

---

# §8. APM 리포트 (WBS 4.4 · P3 3차 물결, 2026-09-07)

> 주간/월간 APM 리포트를 **기존 리포트 체계에 편입**했다. 설계 §7 `apm_report_snapshot` ·
> 화면 WBS 4.4 · §3.21 · 7.20.

## 8.0 🔴 이 절만 EP가 `/apm/*`이 아니다 — 먼저 읽을 것

APM 리포트는 **설정 &gt; 리포트 관리** 화면의 목록에 **호스트 그룹 리포트와 나란히** 나온다.
그래서 EP도 그 화면의 것(`/admin/reports*`)이고, 이 절이 다루는 것의 절반은 **새 EP가 아니라
기존 두 EP의 확장**이다. 다음 세 가지가 이 절 전체를 지배한다.

1. **목록에는 두 계열이 섞인다.** 행의 `type`(`HOST_GROUP` | `APM`)이 그 축이다.
2. 🔴 **`id`는 계열 안에서만 유일하다.** 두 계열이 서로 다른 테이블에 살아 **1번이 양쪽에 다
   있다**. 행을 식별하는 키는 반드시 **`(type, id)`** 이고, 삭제 요청 본문도 그래서 배열이
   둘(`ids` / `apmIds`)이다. **한 배열에 섞어 보내면 사용자가 고르지 않은 리포트가 지워진다.**
3. **상세 EP가 계열마다 다르다.** `HOST_GROUP` 행은
   `GET /host-groups/{groupId}/reports/detail`, `APM` 행은 `GET /admin/reports/apm/{id}`.

⚠️ **APM 리포트가 아직 없는 설치본에서는 목록 응답이 예전과 같다** — 새 필드(`type`·`title`)만
늘었을 뿐 행도 순서도 그대로다. 즉 FE는 `type`을 소비하도록 고치되, 데이터가 생기기 전에도
안전하게 배포할 수 있다.

## 8.1 EP 표

| 메서드 | 경로 | 상태 | 설명 |
|---|---|---|---|
| GET | `/admin/reports` | **확장** | 리포트 관리 목록. `type` 필터 신설 · 행에 `type`·`title` 신설 · **APM 행이 함께 나온다** |
| DELETE | `/admin/reports` | **확장** | 본문에 `apmIds` 신설(`ids`는 그대로 호스트 그룹) |
| GET | `/admin/reports/apm/{id}` | **신설** | APM 리포트 본문(굳은 값 그대로) |
| GET | `/admin/reports/apm/detail?periodType&periodStart` | **신설** | 기간 지정 조회. 🔴 저장본이 없고 **마감된** 기간이면 그 자리에서 만들어 저장한다(lazy 백필) |
| GET/PUT | `/admin/reports/retention` | 변경 없음 | 보존 설정. 🔴 이 한 벌이 **두 계열 모두**에 적용된다 |

🔴 **설계 §8.1의 `/reports?type=APM_WEEKLY`와 다르다.**
- 목록은 `GET /admin/reports?type=APM_WEEKLY`로 **그대로 된다**(`type` 값 4종을 다 받는다).
- 상세는 `/reports/{id}`가 **불가능**하다 — id 공간이 겹쳐 "1번 리포트"가 무엇인지 서버가
  결정할 수 없다. 목록 행이 `type`을 싣고 있으므로 FE는 어느 EP를 부를지 이미 안다.

## 8.2 기존 EP의 변경 — 목록과 삭제

### `GET /admin/reports` 쿼리

| 필드 | 타입 | 설명 |
|---|---|---|
| `type` | `string?` | **신설**. `HOST_GROUP` \| `APM` \| `APM_WEEKLY` \| `APM_MONTHLY`(대소문자 무관). 미지정이면 **두 계열 모두**. ⚠️ 오타·모르는 값은 **거절하지 않고 "필터 없음"** 으로 접는다(기존 `periodType`과 같은 관대함) |
| `periodType` | `string?` | 기존. `WEEK` \| `MONTH`. 🔴 `type=APM_MONTHLY`와 `periodType=WEEK`처럼 **모순**이면 결과가 0건이다(한쪽으로 접지 않는다) |
| `groupId` | `string?` | 기존. 🔴 이 값을 주면 **APM 행은 통째로 빠진다** — 그룹은 APM에 없는 축이다 |
| `limit` / `offset` | `int?` | 기존(기본 20, 1~100 클램프 / 0 이상) |

### `GET /admin/reports` 응답 행 — `ReportListItemDto`

```ts
type ReportKind = 'HOST_GROUP' | 'APM';

interface ReportListItem {
  id: number;               // 🔴 계열 안에서만 유일 — 키는 (type, id)
  type: ReportKind;         // 신설
  groupId: string | null;   // 🔴 APM 행은 null (기존에는 언제나 string이었다)
  groupName: string | null; // 🔴 APM 행은 null
  title: string;            // 신설. HOST_GROUP=해석된 그룹 이름 · APM=저장된 제목(한국어)
  periodType: 'WEEK' | 'MONTH';
  periodStart: string;      // ISO date
  periodEnd: string;        // ISO date
  hostCount: number;        // 🔴 이름은 그대로지만 APM 행에서는 **서비스 수**다
  createdAt: string;        // "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'" — 🔴 **진짜 UTC**다 (D2 반영)
}
```

🔴 **`createdAt`은 2026-09-07(QA D2)에 값이 고쳐졌다 — 형식은 그대로, 값이 9시간 움직였다.**
그 전에는 `LocalDateTime`에 `Z`를 **글자로** 붙여 나가서 서버 로컬(KST) 시각에 Z가 달린 문자열이었다.
FE가 그 Z를 믿고 +9를 해 목록에 **다음 날 새벽**을 그렸고, 같은 리포트의 상세 화면은 진짜 UTC인
`body.generatedAt`을 써서 두 화면이 다른 시각을 말했다. 지금은 두 계열(APM·HOST_GROUP) 모두
`ReportTimes.toUtcIso`가 만든 **실제 UTC**다. **FE 타입(`string`)은 그대로**이고 파싱 코드도
그대로면 된다 — 화면에 뜨는 값만 맞아진다. ⚠️ 표본 JSON 3개(`report-list`·`report-weekly`·
`report-monthly-empty`)의 기대값도 함께 바뀌었다.

🔴 **`groupId`·`groupName`이 nullable이 됐다.** 기존 FE 타입이 `string`이면 고쳐야 한다.
🔴 **`hostCount`의 뜻이 행마다 다르다.** 컬럼 헤더를 "호스트 수"로 고정해 두면 APM 행에서
거짓말이 된다 — `type`으로 라벨을 바꾸거나 중립적으로("대상 수") 쓸 것. 이름을 안 바꾼 이유는
기존 계약 보존이다(필드를 지우면 기존 화면이 깨진다).

⚠️ `title`은 **서버가 만든 한국어 문자열**이다(`APM 주간 리포트 (2026-08-31 ~ 2026-09-06)`).
이 레포에는 응답 문자열 번역 통로가 없다. 로케일별 라벨이 필요하면 FE가 `type`·`periodType`·
`periodStart`/`periodEnd`로 직접 만들면 된다 — 그 넷이면 충분하다.

### `DELETE /admin/reports` 본문

```ts
interface DeleteReportsReq {
  ids?: number[];     // HOST_GROUP 행의 id
  apmIds?: number[];  // APM 행의 id — 🔴 ids와 절대 섞지 말 것
}
```

- 응답은 그대로 `{ deletedCount: number }`(두 계열에서 **실제로 지워진** 행 수의 합).
- 🔴 **둘 다 비면 거절**한다 — 응답은 예전과 같다(**HTTP 200 + `code:400` + `errorCode:"INVALID_DATA"`**).
  ⚠️ 제약 메시지(`ids should not be empty`)는 전역 핸들러가 고정 문구로 덮어 **응답에 나오지
  않는다**(로그에만 남는다). 예전에도 그랬으므로 관찰 가능한 계약은 변하지 않았다.
- 멱등이다 — 존재하지 않는 id는 무시된다.

## 8.3 타입 — `GET /admin/reports/apm/{id}` · `/detail`

```ts
interface ApmReportDetail {
  id: number;
  type: 'APM';                 // 이 EP는 언제나 APM
  periodType: 'WEEK' | 'MONTH';
  title: string;
  periodStart: string;         // ISO date (포함)
  periodEnd: string;           // ISO date (포함)
  serviceCount: number;
  createdAt: string;           // "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'" — 🔴 진짜 UTC. body.generatedAt과 같은 축 (D2 반영)
  body: ApmReportBody;
}

interface ApmReportBody {
  generatedAt: string;         // ISO-8601. 🔴 기간의 끝이 아니라 "언제 계산했나"
  periodType: 'WEEK' | 'MONTH';
  periodStart: string;         // ISO date
  periodEnd: string;           // ISO date
  fromTs: number;              // ms 에폭, 포함
  toTs: number;                // ms 에폭, 🔴 미포함
  prevPeriodStart: string | null;  // 비교 기간(직전 같은 길이의 기간)
  prevPeriodEnd: string | null;

  totals: ApmReportTotals;
  previousTotals: ApmReportTotals | null;  // 🔴 null = 비교 대상 없음
  totalsDelta: ApmReportDelta | null;      // 🔴 null = 비교 대상 없음

  services: ApmReportService[];            // 🔴 요청 수 내림차순(동률이면 이름 오름차순)
  notes: ApmReportNotes;
}

interface ApmReportTotals {
  services: number;
  requests: number;                 // 건수는 언제나 숫자
  errors: number;                   // 5xx만. 🔴 4xx는 오류가 아니다
  errorRatePct: number | null;      // 요청 0건이면 null
  p95Ms: number | null;             // 🔴 요청 수 가중 평균(통합 백분위가 아니다)
  apdex: number | null;             // 🔴 요청 수 가중 평균
  availabilityPct: number | null;   // 🔴 **요청 수 가중 평균**(p95·apdex와 같은 축, D4 반영).
                                    //    요청 0건 서비스는 빠지고, 그 수는 notes.availabilityUnweightedServices.
                                    //    요청 있는 서비스가 하나도 없으면 null
  deployments: number;              // ⚠️ previousTotals에서도 **실제로 센 값**이다(3차 검수 #1)
  alerts: number;                   // ⚠️ 같음
  slos: number | null;              // 이 기간에 **잴 수 있었던** SLO 수.
                                    //    🔴 previousTotals에서는 **null** — 비교 기간의 SLO는
                                    //    집계하지 않는다(안 잰 것을 0으로 위장하지 않는다)
  slosMet: number | null;           // 그중 목표를 지킨 수. 🔴 previousTotals에서는 null
}

interface ApmReportDelta {          // 🔴 항목마다 단위가 다르다
  requestsPct: number | null;       // 변화율(%). 이전이 0이면 null
  requestsAbs: number;              // 건수 차
  errorRatePoint: number | null;    // 퍼센트포인트
  p95Pct: number | null;            // 변화율(%). 🔴 양수 = 느려졌다
  availabilityPoint: number | null; // 퍼센트포인트
  apdexDelta: number | null;        // 절대 차(0~1 스케일)
  deploymentsAbs: number;           // 건수 차
  alertsAbs: number;                // 건수 차
}

interface ApmReportService {
  serviceUid: string;               // UUID
  name: string;                     // displayName 없으면 serviceName
  env: string;

  requests: number;
  errors: number;
  errorRatePct: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  apdex: number | null;

  availabilityPct: number | null;          // 수신 연속성(SLA 아님)
  availabilityCoveragePct: number | null;  // 🔴 판정 가능했던 칸의 비율

  deployments: number;
  alerts: number;

  syntheticAvailabilityPct: number | null; // 🔴 null = 바인딩 없음 또는 이력 없음 (0%가 아니다)
  syntheticDays: number;                   // 실제로 잰 날 수

  slos: ApmReportSlo[];             // 정의가 없으면 []
  topErrors: ApmReportError[];      // 최대 5, 발생 수 내림차순
  delta: ApmReportDelta | null;     // 🔴 null = 비교 대상 없음
}

interface ApmReportSlo {
  sloUid: string;
  name: string;
  sliKind: 'AVAILABILITY' | 'LATENCY';
  target: number;                   // %
  sliPct: number | null;            // 잰 요청 0건이면 null
  met: boolean | null;              // sliPct가 null이면 null(모름)
  budgetBurnedPct: number | null;   // 100 초과 = 예산을 다 태우고 넘겼다
  days: number;                     // 굳은 일 스냅샷이 있던 날 수
  definitionChanged: boolean;       // 🔴 **신설(3차 검수 #5)**. true면 이 기간의 날들이 서로 다른
                                    //    SLO 정의(defVersion·target·latencyThresholdMs)로 계산됐다.
                                    //    sliPct는 그 혼재를 그대로 합친 값이라 **어느 한 기준의
                                    //    값이 아니다** — 화면이 그 칸에 각주를 달아야 한다.
                                    //    (되계산하지 않는다: 원자료 5m 롤업은 30일만 산다)
}

interface ApmReportError {
  groupId: number;                  // 🔴 90일 뒤 정리된다 — 상세를 못 열 수 있다
  exceptionType: string;
  messageNorm: string;              // 정규화된 메시지(숫자·id가 ?)
  count: number;                    // 이 기간의 발생 수
  lastSeenAt: string | null;
}

interface ApmReportNotes {          // 🔴 화면이 각주로 보여야 한다
  availabilityCellSeconds: number;  // WEEK=300, MONTH=3600
  mixedBounds: boolean;             // true면 일부 백분위를 내지 않았다
  rebucketed: boolean;              // true면 백분위에 보간 오차가 섞였다
  syntheticUnavailable: boolean;    // true면 합성 조회가 실패해 그 값이 전부 null
  skippedServices: number;          // 기간이 끝난 뒤 처음 등장해 제외된 서비스 수
  availabilityUnweightedServices: number; // 🔴 **신설(D4)**. 요청 0건이라 totals.availabilityPct
                                    //    가중 평균에서 빠진 서비스 수. 서비스별 표에는 그
                                    //    서비스가 가용성 0%로 그대로 남아 있다 — 합계와 표가
                                    //    어긋나 보이면 이 수가 이유다.
                                    //    ⚠️ 2026-09-07 이전 스냅샷 본문에는 이 키가 없어 0으로 읽힌다
  sloPeriodLocal: string;           // 🔴 **신설(3차 검수 #4)**. services[].slos가 실제로 덮은 기간.
                                    //    "YYYY-MM-DD~YYYY-MM-DD", **로컬 날짜**다
  syntheticPeriodLocal: string;     // 🔴 **신설**. syntheticAvailabilityPct가 덮은 기간(같은 축)
  dailyPeriodZone: string;          // 🔴 **신설**. 위 두 기간의 시간대(예: "Asia/Seoul")
}
```

### 🔴 한 리포트 안에 **기간이 두 개** 있다 (2026-09-07 3차 검수 #4)

본문의 `fromTs`·`toTs`는 **UTC 자정 경계**다. 그런데 **SLO와 합성 감시는 날짜로 굳은 일 집계의
합**이고, 그 "날짜"는 서버 **로컬** 시간대다. KST 설치본에서 `2026-08-31~2026-09-06`의 일 합은
실제로 **UTC 08-30 15:00 ~ 09-06 15:00**이다 — 본문 창보다 앞선 9시간을 포함하고 **끝의 9시간을
뺀다**. 기간 끝자락의 장애가 그 9시간에 있으면 **달성 여부까지 뒤집힌다**.

- **왜 안 맞추나**: 원재료가 이미 날짜로 굳어 있다. 일 스냅샷(`apm_slo_snapshot`)은 하루를 쪼갤 수
  없고 사후 되계산도 하지 않는다(V53의 감사 정책). 합성 캘린더는 Zabbix가 날짜로 답한다.
- **그래서 밝힌다**: `notes.sloPeriodLocal`·`syntheticPeriodLocal`·`dailyPeriodZone`.
- 🔴 **FE가 할 일**: SLO 카드와 합성 가용성 칸의 각주에 이 기간·시간대를 적는다. 헤더의 기간
  (`periodStart~periodEnd`)과 **같은 날짜라도 뜻이 다르다** — "이 두 값은 로컬 날짜 기준"이라고
  말하지 않으면 사용자는 본문 창과 같은 것으로 읽는다.

### `GET /admin/reports/apm/detail` 쿼리

| 필드 | 타입 | 설명 |
|---|---|---|
| `periodType` | `string` **필수** | `WEEK` \| `MONTH`(대소문자 무관). 🔴 **모르는 값은 거절**한다(기본값으로 접지 않는다 — 부작용이 있는 EP다) |
| `periodStart` | `string` **필수** | `YYYY-MM-DD`. ⚠️ 기간 시작일이 아니어도 된다 — **그 날짜가 속한 기간**으로 정규화한다 |

## 8.4 🔴 FE가 반드시 지켜야 할 <s>여덟</s> **열한** 가지

1. **행의 키는 `(type, id)`다.** 목록 선택 상태·삭제 배열·상세 링크 전부 이 쌍으로 잡는다.
   `id`만 쓰면 두 계열의 1번이 같은 행으로 취급돼 **엉뚱한 리포트가 지워진다**.
2. **삭제는 배열을 나눠 담는다.** `HOST_GROUP` → `ids`, `APM` → `apmIds`.
3. **`groupId`·`groupName`은 null일 수 있다.** APM 행에서 그 칸은 비워야 한다(빈 문자열도
   `-`도 아닌, "이 계열에는 없는 축"이다).
4. **`null`과 `0`을 같은 모양으로 그리지 않는다.** 요청 0건 서비스는 오류율·p95·Apdex가 전부
   `null`이다 — `0%`·`0ms`로 그리면 **조용한 서비스가 완벽한 서비스로 보인다**. 빈 칸이나
   `—`로 둘 것.
5. **`delta`·`previousTotals`가 `null`이면 증감을 그리지 않는다.** "0% 변화"가 아니라
   **"비교 대상 없음"** 이다.
6. **`Delta`의 단위는 항목마다 다르다.** `*Pct`는 변화율(%), `*Point`는 퍼센트포인트,
   `apdexDelta`는 절대 차, `*Abs`는 건수. 한 컴포넌트로 뭉뚱그리면 조용히 틀린다.
   그리고 🔴 **`p95Pct`는 양수가 나쁜 쪽**이다(느려졌다) — 색을 반대로 칠하지 말 것.
7. **`notes`를 각주로 보여 준다.** 특히 `availabilityCellSeconds: 3600`(월간)은 "한 시간 안에
   끝난 장애는 이 퍼센트에 안 나타난다"는 뜻이고, `syntheticUnavailable: true`는 "합성 값이
   비어 있는 이유는 조회 실패"라는 뜻이다(바인딩이 없는 것과 다르다).
8. **`generatedAt`을 헤더에 보여 준다.** 이 문서는 **그 시점에 굳힌 값**이라 열 때마다 다시
   계산하지 않는다. 90일보다 오래된 기간을 백필하면 `topErrors`가 비는데, 그건 "그때 오류가
   없었다"가 아니라 "원본이 이미 지워졌다"이다.
9. 🔴 **`previousTotals.slos`·`slosMet`은 `null`이다**(3차 검수 #1). 비교 기간의 SLO는 **집계하지
   않는다** — `0/0`으로 그리면 "지난주엔 SLO가 하나도 없었다"는 거짓이 된다. SLO 증감은 그리지
   말 것(`Delta`에도 그 칸이 없다). 반면 `deployments`·`alerts`는 **실제로 센 값**이라
   `totalsDelta.deploymentsAbs`·`alertsAbs`가 이제 서비스별 증감의 합과 정확히 같다.
10. 🔴 **SLO·합성 각주에 `notes.sloPeriodLocal`·`syntheticPeriodLocal`·`dailyPeriodZone`을 적는다**
    (3차 검수 #4). 그 두 지표만 **로컬 날짜** 기준이라 본문의 UTC 창과 최대 그 오프셋만큼
    어긋난다(바로 위 박스).
11. 🔴 **`slos[].definitionChanged`가 true면 그 SLO 칸에 "기간 중 정의 변경" 배지를 붙인다**
    (3차 검수 #5). 그 `sliPct`는 서로 다른 기준으로 센 날들을 합친 값이라, 목표 달성 여부를
    단정적으로 읽으면 안 된다.

## 8.5 정의 — 숫자가 무엇을 세는가

| 값 | 원천 | 정의 |
|---|---|---|
| `requests`·`errors`·`p50/p95/p99`·`apdex` | 서비스 화면과 **같은 함수**(`redWindow`) | 기간 창 전체의 히스토그램을 **한 번에 병합**해 낸 백분위. 🔴 1분 백분위의 평균이 아니다 |
| `availabilityPct` | 가용성 스트립과 **같은 판정** | 판정된 칸 중 `UP`+`DEGRADED`의 비율. `UNKNOWN`(수집기도 조용)과 "답할 수 없는 칸"(보존 밖)은 **분모에서 빠진다**. 🔴 서비스의 `firstSeenAt` **이전 칸은 아예 세지 않는다**(없던 시간이지 죽은 시간이 아니다) |
| `availabilityCoveragePct` | 위와 같은 시계열 | 판정된 칸 / (firstSeenAt 이후의) 전체 칸 |
| `deployments` | `apm_deployment` | 창 안에 감지된 배포 수(자동 + 웹훅) |
| `alerts` | `apm_alert_event` | 창 안에 **발화한** 수. ⚠️ 창 이전에 발화해 아직 열린 알람은 안 센다. 🔴 서비스 축이 없는 **수집기 알람은 빠진다** → 서비스별 합이 전체 알람 수보다 작을 수 있다 |
| `slos[].sliPct` | **`apm_slo_snapshot` 일 스냅샷의 합** | 🔴 **SLO 화면의 숫자와 다를 수 있고 그게 정상이다.** 저쪽은 정의된 롤링 창(7·30일)의 *현재* 값이고, 이쪽은 **리포트 기간** 창으로 다시 센 값이다 — 다른 질문의 답이다. 라벨을 같게 쓰면 사용자가 버그로 신고한다 |
| `slos[].budgetBurnedPct` | 위에서 파생 | `(100 - sliPct) / (100 - target) × 100`. 100 초과 = 예산 초과 |
| `syntheticAvailabilityPct` | Zabbix 합성 감시 캘린더 | 기간 안 날들의 **실행 횟수 가중** 가용성. 여러 시나리오가 바인딩돼 있으면 합쳐서 하나로 낸다 |
| `totals.p95Ms`·`apdex` | 서비스별 값 | 🔴 **요청 수 가중 평균**이다. 서비스 축을 넘어 히스토그램을 합칠 수 없어(경계가 다르면 접히지 않는다) "전 서비스 통합 p95"라는 숫자는 만들 수 없다 |
| `totals.availabilityPct` | 서비스별 값 | 🔴 **요청 수 가중 평균**이다 — 2026-09-07(QA D4)에 단순 평균에서 바뀌었다. 요청 0건 서비스는 분모에서 빠지고 그 수가 `notes.availabilityUnweightedServices`로 나간다. 요청 있는 서비스가 0이면 `null`(0%가 아니다) |
| `totals.errorRatePct` | 합계에서 직접 | `Σerrors / Σrequests`. 가중 평균과 같은 결과이고 더 정확하다 |

### 🔴 왜 `totals.availabilityPct`를 가중으로 바꿨나 (2026-09-07 QA D4)

단순 평균이던 시절의 실측이다:

| 서비스 | 요청 | 가용성 |
|---|---|---|
| moveseye-be | 204,591 | 100.0 |
| qa-node | 13,907 | 83.13 |
| qa-python | 2,851 | 100.0 |
| qa-direct | **0** | **0.0** |
| qa-oldsemconv | **0** | **0.0** |

`(100 + 83.13 + 100 + 0 + 0) / 5 = 56.63` — 실제 트래픽의 99.9%가 100% 가용이었던 주에
상세 화면 헤드라인이 **`가용성 56.63 %`** 였다. 며칠째 조용한 테스트 서비스 둘이 절반을 깎았다.

🔴 **"UNKNOWN은 분모에서 뺀다"는 안전장치가 못 막는다**: 요청 0건 서비스의 칸은 `UNKNOWN`이 아니라
**`STALE`** 로 판정된다(수집기 자체는 살아 있으므로). `UNKNOWN`은 수집기가 조용할 때만 나오므로,
다른 서비스가 살아 있는 설치본에서 죽은 서비스는 **언제나 0%로 계산된다**.

⚠️ **서비스별 칸(`services[].availabilityPct`)은 그대로 0%다** — 거기서 0%는 사실이고, 그 사실이
보여야 죽은 서비스를 발견한다. 바뀐 것은 **합계 한 칸**뿐이다.
⚠️ **2026-09-07 이전에 저장된 스냅샷은 단순 평균 값이 굳어 있다.** 옛 리포트의 가용성 합계를
새 것과 나란히 비교하지 말 것(그 본문에는 `availabilityUnweightedServices` 키도 없어 0으로 읽힌다).

### ⚠️ 기간 경계는 UTC, SLO·합성의 날짜는 로컬

기간(`fromTs`/`toTs`)은 **UTC 자정** 경계다(호스트 그룹 리포트와 같은 규약, `ReportPeriod`).
반면 `apm_slo_snapshot.day`와 합성 캘린더의 날짜는 **서버 로컬 날짜**다(적재·롤업의 축).
KST 설치본에서는 두 축이 **최대 9시간** 어긋난다 — 주/월의 첫날·마지막날 경계에서 SLO·합성이
하루치를 더 담거나 덜 담을 수 있다. 🔴 **RED·가용성에는 이 문제가 없다**(둘 다 epoch 창으로 잰다).

## 8.6 권한 — 🔴 `apm.view`가 아니라 **관리자**다

| EP | 판정 |
|---|---|
| `GET`/`DELETE /admin/reports`, `/retention` | `ReportAdminAccess.require`(**userRole** = ADMIN ∪ SUPER_ADMIN) — 판정은 기존 그대로, 거부 바디만 §8.7대로 바뀌었다 |
| `GET /admin/reports/apm/**` | 같은 관리자 규약 **+** `@RequiresFeature(Feature.APM)` |

🔴 **APM 조회 권한(`apm.view`)만 가진 일반 사용자는 APM 리포트를 볼 수 없다.** 리포트 관리는
설정 화면이고 그 화면의 규약이 관리자이기 때문이다 — 리포트 체계에 편입한 대가이고,
지시의 "충돌 시 계약에 기록"에 해당한다. 거부는 레포 전역 계약대로 **HTTP 200 + body `code:403`**.

⚠️ **목록 EP에는 `@RequiresFeature(Feature.APM)`를 붙이지 않았다** — 붙이면 APM 미보유
설치본에서 **호스트 그룹 리포트 목록까지** 막힌다. APM 행은 데이터가 있을 때만 나타난다.

## 8.7 오류 코드

| 코드 | 상태 | 언제 |
|---|---|---|
| `APM_REPORT_NOT_FOUND` | 200 + `code:404` | **신설**. 없는 APM 리포트 id. 🔴 **호스트 그룹 id로 이 EP를 부른 경우도 여기로 온다**(id 공간이 겹친다) |
| `APM_REPORT_PERIOD_INVALID` | 200 + `code:400` | **신설**. `periodType`·`periodStart` 형식 오류. 🔴 **2026-09-08(QA D11)부터 `message`가 한국어다** — 그 전에는 코드 이름(`"APM_REPORT_PERIOD_INVALID"`)이 그대로 `message`에 실려 한글 화면에 대문자 상수가 토스트로 떴다. 네 갈래로 사유를 가른다: 종류 누락 `"기간 종류(periodType)가 필요합니다. WEEK 또는 MONTH를 보내 주세요."` · 종류 오타 `"… WEEK 또는 MONTH만 됩니다. 받은 값: <입력>"` · 시작일 누락 `"기간 시작일(periodStart)이 필요합니다. YYYY-MM-DD 형식으로 보내 주세요."` · 시작일 형식 `"… YYYY-MM-DD 형식이어야 합니다. 받은 값: <입력>"`. 되싣는 입력값은 **40자에서 자른다**. ⚠️ `errorCode`는 그대로다 — FE가 분기하는 축은 그쪽이고 `message`는 사람이 읽는 칸이다(그대로 띄워도 된다) |
| `REPORT_PERIOD_NOT_CLOSED` | 200 + `code:400` | 재사용. 아직 안 끝난 기간을 조회 — 호스트 그룹 리포트와 **같은 코드**다 |
| `INVALID_DATA` | 200 + `code:400` | 재사용. 삭제 본문에 `ids`·`apmIds`가 둘 다 비었다 |
| `FORBIDDEN` | 200 + `code:403` | 재사용. 관리자가 아니다. 🔴 **2026-09-07(QA D7)부터 실제로 이 코드가 실린다** — 그 전에는 리포트 EP 4개의 403 바디에 `errorCode`가 아예 없고 메시지가 영어 `"Access Denied"`였다(계약만 이렇게 적혀 있었다). 지금은 `errorCode:"FORBIDDEN"` + `message:"리포트 관리 화면을 볼 권한이 없습니다."` — 목록·삭제·보존 설정·APM 단건/기간 **6개 EP 전부** 같은 모양이다 |

## 8.8 배치 · 보존 (FE가 알아야 할 것만)

- **주간** `apm_report_weekly` — 매주 월요일 **10:10**(서버 로컬). **월간** `apm_report_monthly` —
  매월 1일 **10:40**. 둘 다 `scheduler_setting`에서 주기 변경 가능.
  ⚠️ 03:00/03:30(호스트 그룹 리포트)보다 늦은 이유는 자원 경합 회피 + **기간 경계가 UTC**라서다
  (KST 04시에 돌면 UTC로는 아직 전날이라 "지난주"가 한 주 밀린다).
  🔴 그래도 시각에 기대지 않는다 — 배치가 **이미 닫힌 기간을 최대 3개까지** 함께 굳힌다
  (시간대 어긋남·며칠 멈춤을 스스로 흡수한다).
  🔴 **시작점은 "마지막으로 굳힌 기간의 다음"이다**(2026-09-07 3차 검수 #6). 전에는 오늘의 직전
  기간에서 **앞으로** 갔는데 그 다음 기간은 대개 열려 있어 루프가 즉시 끝났다 — **몇 주 멈췄다
  돌아와도 직전 한 주만** 만들어졌다. 이제 빠진 기간을 **오래된 것부터** 메우고, 상한(3)에 걸리면
  다음 회차가 이어받는다. 빠진 것이 없으면 **방금 닫힌 기간만** 다시 굳힌다(늦게 도착한 데이터).
- **lazy 백필**: 목록에 없는 기간도 `/admin/reports/apm/detail`로 열면 그 자리에서 만들어진다
  (마감된 기간만). ⚠️ 그때는 **지금 남아 있는 원재료**로 만들므로 5m 롤업(30일)·예외 그룹(90일)이
  지난 기간은 그만큼 얇다.
  🔴 **두 사람이 같은 기간을 동시에 열어도 500이 아니다**(3차 검수 #7). 둘 다 "없음"을 읽고 저장을
  시도하면 UNIQUE가 한쪽을 막는데, 진 쪽은 **먼저 저장된 본문을 다시 읽어** 그대로 응답한다.
  같은 기간·같은 원재료라 결과가 사실상 같고, 덮어쓰기는 경합을 한 번 더 만든다.
- **보존**: `GET/PUT /admin/reports/retention`의 **같은 설정**이 두 계열에 적용된다(기본 52주 /
  24개월). 정리는 기존 `report_cleanup` 배치(매일 04:00)가 함께 한다.
- **라이선스**: 리포트 배치는 만료돼도 돈다(`requiresActiveLicense=false`). 멈추면 원재료가
  보존을 넘겨 그 기간의 리포트를 **영원히 만들 수 없다**. 반면 본문 **조회**는
  `Feature.APM` 게이트가 걸려 있다.

## 8.9 예시 JSON (표본 파일)

BE 테스트 리소스에 고정돼 있고 `ApmContractFixtureTest`가 응답 모양과 대조한다 —
**모양이 바뀌면 BE 테스트가 먼저 깨진다.**

| 파일 | 담고 있는 것 |
|---|---|
| `src/test/resources/apm/contract/report-weekly.json` | 주간 리포트 본문. 🔴 두 번째 서비스(`batch-worker`)가 **요청 0건 줄** — 비율 전부 `null`, `delta`도 `null` |
| `src/test/resources/apm/contract/report-monthly-empty.json` | 서비스가 하나도 없던 기간 — `previousTotals`·`totalsDelta`가 통째로 `null` |
| `src/test/resources/apm/contract/report-list.json` | 리포트 관리 목록 — **두 계열이 섞이고 id가 겹친다**(APM 41 / HOST_GROUP 1) |

## 8.10 구현 · 파일

| 영역 | 파일 |
|---|---|
| 마이그레이션 | `db/migration/V55__apm_report_snapshot.sql`(표 + 배치 시드 2) |
| 엔티티 | `premium/apm/core/domain/ApmReportSnapshot` · `ApmReportSnapshotRepository` |
| 본문 조립 | `premium/apm/report/ApmReportBuilder` |
| 저장·백필·조회 | `premium/apm/report/ApmReportService` · `ApmReportController` · `ApmReportBodyDto` · `ApmReportDetailDto` |
| 배치 | `premium/apm/report/ApmReportJobs`(`apm_report_weekly`·`apm_report_monthly`) |
| 관리 화면 편입 | `report/ReportKind` · `ManagedReportRow` · `ManagedReportSource`(SPI) · `ReportListAssembler` + `premium/apm/report/ApmManagedReportSource` |
| 기존 EP 확장 | `report/ReportManagementController`·`ReportManagementService` · `dto/ReportListItemDto`·`SearchReportListDto`·`DeleteReportsReqDto` |
| 알람 집계 | `alert/query/ApmAlertQueryStore#countByServiceInWindow`(신설) |
| 오류 코드 | `engine-api .../ErrorCode` +2 |
| 테스트 | `report/ApmReportBuilderTest`(13) · `ApmReportServiceTest`(11) · `ApmReportSnapshotIT`(15, 도커 PG) · `report/ReportListAssemblerTest`(9) · `ReportManagementServiceTest`(갱신) · `ApmContractFixtureTest` +3 |

## 8.11 🔴 설계서와 다른 점 (전부 의도적)

1. **서비스 단위 리포트를 만들지 않았다.** 한 기간에 스냅샷은 **하나**고 서비스별 수치는 본문의
   `services[]`다. `host_group_report`가 그룹마다 한 행인 것과 다른데, 이유는 리포트 관리
   목록이 **사람이 훑는 표**이기 때문이다 — 서비스 40개 설치본에서 매주 40행이 쌓이면 그 화면을
   못 쓴다. 나중에 서비스 단위가 정말 필요해지면 nullable `service_id` + 부분 UNIQUE 둘로 늘린다.
2. **상세 EP가 `/reports/{id}`가 아니다**(§8.1의 🔴).
3. **`apm_report_snapshot`에 `created_at` DEFAULT가 없다.** 백필 경로가 있어 DB 시계에 맡기면
   400일 전 기간을 오늘 메운 행이 "오늘 만든 리포트"로만 보인다(V51과 같은 판단).
4. **관리 화면과 프리미엄의 의존을 뒤집었다.** `ReportManagementService`가
   `ApmReportSnapshotRepository`를 직접 주입받자 `LicenseArchitectureTest` A1이 **실제로 빨갛게
   떴다**("STANDARD 코드가 프리미엄에 얽히면 분리 배포도 모듈 승격도 불가능해진다"). 그래서
   `ManagedReportSource` SPI를 두고 프리미엄이 자기를 꽂는다 — 프리미엄을 들어낸 빌드에서는
   구현이 없고 목록·삭제·보존이 호스트 그룹만 다룬다(**STANDARD 코드는 한 줄도 안 고친다**).

## 8.12 🔴 불안한 지점 (검수용)

1. **월간 가용성의 해상도가 1시간이다.** 30일 창은 5m 보존(30일) 밖이라 1h 롤업으로 읽히고,
   칸을 그보다 좁게 잡으면 **전 칸이 "답할 수 없음"** 이 되어 퍼센트가 통째로 null이 된다.
   그래서 1시간 칸을 택했고, 대가는 **한 시간 안에 끝난 장애가 안 보이는 것**이다.
   `notes.availabilityCellSeconds`가 그 사실을 싣지만, 화면이 그걸 안 보여 주면 월간 가용성이
   주간보다 낙관적으로 보인다.
2. **합성 가용성은 과거를 못 메운다.** 캘린더 조회가 "오늘부터 N일 전"이고 상한이 90일이라,
   그보다 오래된 기간을 백필하면 창 자체가 닿지 않는다. Zabbix history 보존은 대개 그보다도
   짧다. → 대부분의 백필에서 `syntheticAvailabilityPct`는 `null`일 것이다.
3. **SLO 기간 SLI는 일 스냅샷의 합이다.** 그 배치가 안 돈 날은 통째로 빠진다(`days`가 그 사실을
   싣는다). 그리고 §8.5의 UTC/로컬 축 어긋남이 여기에 걸린다.
4. **`totals.p95Ms`의 가중 평균은 "통합 p95"가 아니다.** 그렇게 읽히기 쉬운 숫자를 내보내는
   것이 옳은가는 열려 있다 — 대안은 아예 안 주는 것이다.
5. **서비스 수 × 2창의 비용.** 서비스마다 RED를 두 번(이번·직전) 재고, 가용성도 두 번 잰다.
   배치라 감수했지만 서비스가 수백인 설치본에서의 실측이 없다.
6. **목록 병합의 깊은 offset.** 계열별로 `offset+limit`개를 미리 받아 합치므로, offset이 깊으면
   그만큼 많이 읽는다. `limit`이 100으로 클램프돼 있어 실사용에서는 문제가 없을 것으로 봤다.
7. **집계 경로에 트랜잭션을 두지 않았다.** 합성 감시가 있으면 집계 중 **Zabbix HTTP**가 나가는데,
   트랜잭션으로 감싸면 그 왕복 내내 DB 커넥션을 붙잡고 서비스 수만큼 곱해져 풀이 마른다.
   대가는 **스냅샷 격리가 아니라는 것**이다 — 지표별로 아주 조금 다른 시점을 볼 수 있다.
   마감된 과거 기간을 재는 일이라 실질 영향이 없다고 판단했지만, 이 판단이 검수 대상이다.
8. **런타임 미검증.** 실제 APM 데이터로 배치를 돌려 본 적이 없다(IT는 손으로 만든 스냅샷을 쓴다).
   특히 `ApmSeriesQueryService.redWindow`를 **7일/30일 창**으로 부른 실측이 없다.

---

# §9. 🔴 P3 종단 QA 반영 (2026-09-07) — BE 수정 완료분과 FE가 해야 할 일

> 근거: `features/apm/core/e2e_apm-p3-qa.md` §1 결함 D1~D9 · §2 메시징·배치 M-1~M-6 · §3 관찰.
> 위 각 절(§0·§1.2·§3.2·§3.3·§3.5·§4.1·§5.2·§5.5·§8.2·§8.3·§8.5·§8.6·§8.7)에 **그 자리에서**
> 반영해 두었고, 이 절은 **한 장으로 훑는 목록**이다.

## 9.1 BE에서 고친 것 — FE 변경이 **필요 없는** 것

| # | 무엇이 달라졌나 | 관찰되는 차이 |
|---|---|---|
| **D1** | 필수 쿼리 파라미터 누락이 500 → **200 + body `code`** | 세 EP가 계약대로의 `errorCode`를 준다(§0). 다른 EP는 전역 그물이 `INVALID_DATA`로 받는다 |
| **D2** | 리포트 `createdAt`이 KST 값에 `Z` → **진짜 UTC** | 목록 시각이 9시간 당겨진다(= 맞아진다). 타입은 그대로 `string` |
| **D3** | SLO·규칙을 끌 때 Zabbix에 **열린 문제가 영영 남던** 것 | 트리거를 내리기 전에 해소 값(`-1`)을 밀어 Problem이 닫힌다. 이벤트/알림 화면에서 유령 알람이 사라진다 |
| **D4** | 리포트 전체 가용성이 **단순 평균** → **요청 수 가중** | 헤드라인 숫자가 바뀐다(실측 56.63% → 100%). `notes.availabilityUnweightedServices` 신설 |
| **D6** | 거절 메시지에 `%s`가 그대로 노출되던 것 | SLO 목표·번 임계 오류 문구가 정상 렌더된다 |
| **D7** | 리포트 EP 403에 `errorCode`가 없고 영어였던 것 | `errorCode:"FORBIDDEN"` + 한국어 메시지. `errorCode` 분기가 리포트 화면에서도 걸린다 |
| **M-1** | `status` 필터 0건이 404 → **200 + 빈 배열** | 아래 9.2-③ 참조(문구 분기가 필요하다) |
| **M-4** | 서비스 삭제가 배치 이력을 **CASCADE로 지우던** 것 (V56) | 이력이 남고 `serviceUid`만 `null`이 된다(§5.2가 원래 약속한 동작) |
| **M-5·M-6** | 계약·주석 정정만 | 동작 변화 없음 |

## 9.2 🔴 FE가 해야 할 일 (이것을 안 하면 화면이 깨지거나 오해를 부른다)

1. **폐기 통계 표의 `rowKey`에 `signal`을 넣을 것** (D5 — 지금 **콘솔 에러가 난다**).
   `types/apm.ts`의 `TApmDropRow`에 `signal: string`을 더하고,
   `apmCollectorDisplay.ts`의 `apmDropRowKey`를 `` `${reason}:${signal}:${metricName ?? ''}` `` 로.
   🔴 **시그널 컬럼도 함께 보여 줄 것** — 키만 고치면 에러는 사라지지만 "글자까지 같은 두 줄"은
   그대로 남는다. 상세는 `features/apm/core/contract_apm.md` §7.7-5의 정정 박스.
2. **배치 작업 표의 `rowKey`를 `(serviceUid, jobName)`으로** (M-2 — 지금 **중복 키가 날 수 있다**).
   그리고 행을 눌러 이력을 열 때 `GET /apm/jobs/runs`에 **`service` 파라미터를 함께** 보낼 것
   (신설·선택). 안 보내면 같은 이름을 쓰는 다른 서비스의 실행이 섞여 목록의 `runs`와 이력의 줄 수가
   안 맞는다. 상세는 §5.2.
3. **`/apm/jobs/runs`의 빈 배열과 404를 다르게 안내할 것** (M-1).
   404 = "이 기간에 그 잡이 없다" → **창을 넓혀 보라**(§R-10 그대로) ·
   빈 배열 = "필터에 걸리는 실행이 없다" → **필터를 풀어 보라**. 지금 코드가 둘을 같게 다루면
   사용자는 영원히 안 나오는 안내를 따르게 된다.
4. **합성 감시에서 단계를 추가할 때 `isNew: true`를 보낼 것** (D9 — 🔴 **계약 변경이다**).
   안 보내고 이름도 기존과 다르면 **400 `APM_SYNTHETIC_STEP_ID_REQUIRED`** 다.
   기존 단계는 지금처럼 `httpStepId`를 그대로 되돌려 보내면 되고(이름이 같으면 서버가 되붙여
   주므로 실수해도 이력이 안 끊긴다), **수정 Drawer의 "단계 추가" 경로만** 손대면 된다. 상세는 §3.3-1.
5. **간트에서 잘린 레인을 표시할 것** (M-3). `lanes[].runs > lanes[].bars.length`인 레인에
   "50개 중 20개 표시" 배지를 붙인다. `truncated`만 보면 **어느** 레인이 잘렸는지 알 수 없다.
6. **SLO 폼에서 알람 스위치가 꺼지면 임계 입력을 비활성화할 것** (D8). 켜진 채로 두면 사용자가
   입력한 값이 저장되지 않고 응답에는 기본값이 온다(서버가 버린다 — §1.2).
7. **리포트 상세의 가용성 각주** (D4). `notes.availabilityUnweightedServices > 0`이면
   "요청이 없어 합계에서 제외된 서비스 n개"를 각주에 적을 것 — 합계(100%)와 서비스별 표(0%)가
   어긋나 보이는 이유가 그것이다.
8. **계약 표본 JSON 동기화** — `report-list.json` · `report-weekly.json` ·
   `report-monthly-empty.json` 세 개의 `createdAt`이 바뀌었고, 리포트 본문에
   `notes.availabilityUnweightedServices`가 늘었다. FE 쪽 사본이 있으면 함께 갱신하고
   `npm run typecheck:contract`를 돌릴 것.

## 9.3 ⚠️ 판단만 하고 **안 고친 것**

| # | 무엇 | 왜 |
|---|---|---|
| **D8** | 꺼진 알람에 임계를 보내면 조용히 버려짐 | 400도 저장도 택하지 않고 **계약 명시 + FE 비활성화**로 갔다. 값을 저장할 자리를 만들면 "꺼진 알람의 임계"라는 두 번째 진실이 생긴다(§1.2) |
| **D9** | `httpStepId` 없는 단계 | 서버가 **이름으로 되붙이는 구제 경로**를 먼저 두고, 되붙일 수 없을 때만 400이다. 무조건 400으로 하면 규약을 모르는 클라이언트가 전부 막히고, 무조건 통과시키면 QA가 실증한 이력 소실이 그대로 남는다 |
| **M-3** | 간트 절단 방식 | "최신순 + truncated 레인 목록" 대신 **레인당 상한(공정 분배)**을 택했다. 레인 목록을 따로 주는 것보다 `runs > bars.length`로 화면이 스스로 아는 편이 계약이 작다 |
| — | `AdminAccessChecker` 전역 | 403 바디를 바꾼 것은 **리포트 관리 6개 EP만**이다. 그 헬퍼는 컨트롤러 40여 곳이 부르고 응답 문자열이 원본 NestJS와 1:1로 맞춰 둔 계약이라, 한 화면 때문에 전 관리 화면의 403을 바꾸지 않는다 |

---

# §10. 🔴 3차 검수 반영 (2026-09-07) — `_archive/features/apm/core/review_apm-p3-w3_codex.md` #1~#9

> 위 각 절(§1.4 · §5.1 · §5.2 · §8.3 · §8.4 · §8.8)에 **그 자리에서** 반영했고, 이 절은
> **한 장으로 훑는 목록**이다. 계약이 바뀐 것은 굵게 표시했다.

## 10.1 계약이 바뀐 것 — FE가 손대야 하는 것

| # | 무엇 | FE가 할 일 |
|---|---|---|
| **#1** | **`previousTotals.slos`·`slosMet`이 `number` → `number \| null`** | 비교 기간의 SLO는 집계하지 않는다. `0/0`으로 그리지 말 것. 대신 `deployments`·`alerts`는 **실제 값**이 되어 `totalsDelta`가 서비스별 증감의 합과 맞는다(전에는 배포 `1→2`인데 합계가 `+2`였다) |
| **#4** | **`notes`에 3필드 신설** (`sloPeriodLocal`·`syntheticPeriodLocal`·`dailyPeriodZone`) | SLO·합성 칸의 각주에 **그 두 지표만 로컬 날짜 기준**임을 적을 것(§8.3의 박스) |
| **#5** | **`slos[].definitionChanged: boolean` 신설** | true면 "기간 중 정의 변경" 배지. 그 `sliPct`는 서로 다른 기준의 날을 합친 값이다 |
| **#8** | **`service=__none__` 예약어** (3 EP 공통) | 목록에서 `serviceUid`가 `null`인 줄을 열 때 이 값을 넘길 것. 안 넘기면 살아 있는 서비스의 같은 이름 실행이 섞인다 |

⚠️ 표본 JSON 3개(`report-weekly.json`·`report-monthly-empty.json`·`report-list.json`) 중 앞의 둘이
바뀌었다 — FE 사본이 있으면 갱신하고 `npm run typecheck:contract`를 돌릴 것.

## 10.2 FE 변경이 필요 없는 것 (동작만 고침)

| # | 무엇이 달라졌나 |
|---|---|
| **#2** | 규칙을 끄거나 고아를 정리할 때, **다른 활성 규칙이 같은 아이템을 읽고 있으면 해소 값(`-1`)을 밀지 않는다.** 아이템은 `(kind, 서비스)`의 것이라 그 값이 **남의 트리거에도 보여** 거짓 RECOVERY → 재발화(알림 두 통)를 낼 수 있었다. 그 경우엔 `event.acknowledge(close)`로 **이 트리거의 이벤트만** 닫는다 |
| **#3** | 해소를 **요청**한 것과 **완료**된 것을 가른다. push 실패(`false`)를 무시한 채 고아 표식을 찍어 열린 Problem이 영구히 남던 경로를 닫았다 — `apm_zbx_cleanup`에 `RESOLVE` 종류를 더해, 열린 Problem이 없어질 때까지 5분마다 확인·재요청한다. 대상으로 **돌아오면 그 대기를 취소**한다(복귀 후 새로 뜬 알람을 닫지 않게) |
| **#6** | 리포트 배치가 **마지막으로 굳힌 기간의 다음부터** 빠진 기간을 메운다(§8.8). 전에는 몇 주 멈춰도 직전 한 주만 만들었다 |
| **#7** | 같은 기간을 동시에 백필하면 진 쪽이 **먼저 저장된 본문을 다시 읽어** 응답한다(전에는 HTTP 500) |
| **#9** | 설치 가이드 문구 정정 — "4xx는 재시도 없음"에 **429 예외** 명시, Go는 "이 가이드의 지원 방식은 **수동 계측**"으로(에이전트형 자동계측이 아예 없다는 단정을 거뒀다) |

## 10.3 ⚠️ 이번에도 남긴 것

- **#4를 epoch로 통일하지 않았다.** 일 스냅샷은 하루를 쪼갤 수 없고 되계산도 정책상 안 한다.
  **밝히는 쪽**을 택했고, 그래서 화면이 각주를 안 달면 여전히 오해를 부른다.
- **#5는 분리 집계가 아니다.** 정의별로 나눠 세려면 원자료가 필요한데 5m 롤업은 30일만 산다.
  `definitionChanged` 한 칸이 할 수 있는 최대치다.
- **#2·#3은 실 Zabbix RECOVERY까지 확인하지 못했다.** 단위 테스트가 호출·큐 상태 전이를
  고정했을 뿐이고, `event.acknowledge(close)`가 실제로 Problem을 닫는 것은 **미검증**이다
  (우리 트리거는 `manual_close=1`로 만들어 두었다).
