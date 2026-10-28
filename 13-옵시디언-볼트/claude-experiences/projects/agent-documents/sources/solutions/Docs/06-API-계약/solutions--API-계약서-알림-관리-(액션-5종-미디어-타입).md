# API 계약서 — 알림 관리 (액션 5종 + 미디어 타입)

> **산출 기준**: BE 구현(2026-08-18) + 실서버(Zabbix 7.0.27) 채집. 설계서 `devdesign_alert-management.md`.
> Swagger(`/v3/api-docs`)와 어긋나면 **소스가 정본**이다.
>
> 선례 계약: `contract_discovery.md` · `contract_trigger-mgmt.md` (같은 규약)

---

## 0. 공통 규약

`contract_discovery.md` §0과 동일 — baseURL `/api/v1`, 쿠키+`x-visitor-id`, **전 EP 관리자 전용**,
권한 거부/업무 에러는 **HTTP 200 + body `code`**, 응답 봉투 2겹 언랩, `PagedListDto`, **로컬 저장 0·Flyway 0건**.

🔴 **원칙: Zabbix를 쓰기 쉽게 감싼다.** 조건·오퍼레이션은 **Zabbix 원본 구조 그대로** 왕복한다 —
우리 어휘로 번역하면 왕복마다 두 번 번역하고 sub-object가 종류마다 달라 번역표가 커진다.
우리가 얹는 것은 **Zabbix가 못 해주는 것뿐**: 종류별 허용표 검증, 요약 문장, 미디어 사용 액션 수,
비밀값 마스킹, 폼 선택지 합성.

🔴 **배열 필드 전체 교체 규칙**(디스커버리 LLD와 동일): `filter`·`operations`·`recoveryOperations`·
`updateOperations`(액션) / `messageTemplates`·`webhookParameters`(미디어)는 **수정 시 보내면 통째로
교체**된다. **생략(undefined)=유지, 빈 배열=삭제.** 폼은 다루는 필드는 전부 되돌려 보내고, 안 다루는
필드는 아예 보내지 않는다.

---

## 1. 액션 — `/zabbix-manage/actions`

### 1-0. 종류(`eventsource`)별 허용표 — 폼이 먼저 종류를 정하고 선택지를 좁힌다

| eventsource | 이름 | 허용 조건(`conditiontype`) | 허용 오퍼레이션(`operationtype`) | 복구 | 갱신 |
|---|---|---|---|---|---|
| **0** 장애 | 0 호스트그룹 · 1 호스트 · 2 트리거 · 3 트리거명 · 4 심각도 · 6 시간대 · 13 템플릿 · 16 억제 · 25 태그 · 26 태그값 | 0 메시지 · 1 스크립트 | ✅ | ✅ |
| **1** 디스커버리 | 7 IP · **8 서비스종류** · 9 포트 · 10 상태 · 11 업/다운타임 · 12 수신값 · 18 규칙 · **19 검사** · 20 프록시 · 21 오브젝트 | 0 · 1 · 2 호스트추가 · 3 제거 · 4 그룹추가 · 5 그룹제거 · 6 템플릿연결 · 7 해제 · 8 활성 · 9 비활성 · 10 인벤토리 · 13 태그추가 · 14 태그제거 | ❌ | ❌ |
| **2** 자동등록 | 20 프록시 · 22 호스트명 · 24 메타데이터 | 디스커버리와 동일 | ❌ | ❌ |
| **3** 내부 | 0 · 1 · 13 · 23 이벤트타입 · 25 · 26 | 0 메시지 | ✅ | ❌ |
| **4** 서비스 | 27 서비스 · 28 서비스명 · 25 · 26 | 0 · 1 | ✅ | ✅ |

**실측 대조(2026-08-18)**: 장애 11건·디스커버리 3건·내부 3건에서 나온 조건 번호(0·1·2·4·13·25·26·8·10·12·23)와
오퍼레이션(0·1·2·4·6·10)이 전부 표와 일치. 자동등록·서비스 액션은 실서버에 없어 미대조.
🔴 **8은 검사가 아니라 서비스 종류다**(검사는 19) — 디스커버리에서 한 번 틀렸던 자리.

어긋나면 `code: "ACTION_INVALID_FOR_EVENTSOURCE"` + `message: "…: conditiontype 4 (eventsource 1)"`.

### 1-1. GET `/zabbix-manage/actions` — 목록

| 쿼리 | 필수 | 비고 |
|---|---|---|
| `eventsource` | **✅** | 0~4. 없으면 `ACTION_EVENTSOURCE_REQUIRED` — 다섯 종류를 섞는 화면이 없다 |
| `search` | | 이름 부분검색 |
| `status` | | 0=활성, 1=비활성 |
| `limit` / `offset` | | 기본 20 / 0, 1~200 클램프 |

**응답** `PagedListDto<ManagedAction>` — 🔴 **행에 `filter`·`operations`가 통째로 실린다**(별도 상세 없이
행에서 바로 폼을 열 수 있게. 액션은 많아야 수십 개).

```ts
{
  actionid: string; name: string;
  eventsource: number;          // 0~4
  status: number | null;        // 0=활성, 1=비활성
  escPeriod: string;            // "1h" — 기본 단계 간격(장애·내부·서비스만 의미)
  pauseSuppressed: number | null;   // 장애만
  notifyIfCanceled: number | null;  // 장애만
  pauseSymptoms: number | null;     // 장애만 (7.0)
  filter: {                     // Zabbix 원본
    evaltype: string;           // "0" And/Or · "1" And · "2" Or · "3" 커스텀
    formula: string;            // evaltype=3일 때
    eval_formula: string;       // Zabbix가 계산한 읽기용 ("A and B")
    conditions: { conditiontype, operator, value, value2, formulaid }[];   // 전부 문자열
  };
  operations: Operation[];          // 정상 오퍼레이션 원본
  recoveryOperations: Operation[];  // 없는 종류는 []
  updateOperations: Operation[];    // 없는 종류는 []
  conditionSummary: string;     // BE 요약(한국어 고정) "심각도≥높음 · 호스트그룹=Linux servers"
  operationSummary: string;     // BE 요약 "1단계~ Email→운영팀 · 스크립트 실행"
  hostCreating: boolean;        // 디스커버리·자동등록에서 호스트를 만드는 오퍼레이션이 있는지
}
```

`Operation`(Zabbix 원본, 값은 전부 문자열):
```ts
{
  operationid?: string; operationtype: string;
  esc_step_from: string; esc_step_to: string;   // "1"/"1"=단계 없음, to "0"=끝까지
  esc_period: string;                            // "0"=액션 기본값 사용
  evaltype?: string; opconditions?: [{conditiontype:"14", operator, value}];   // 장애만
  opmessage?: { default_msg: string; subject: string; message: string; mediatypeid: string };  // "0"=전체 미디어
  opmessage_usr?: [{ userid }]; opmessage_grp?: [{ usrgrpid }];
  opcommand?: {...}; opcommand_hst?: []; opcommand_grp?: [];
  opgroup?: [{ groupid }]; optemplate?: [{ templateid }];
  opinventory?: { inventory_mode: "0"|"1" };
  optag?: [{ tag, value }];
}
```

⚠️ **요약은 훑어보기용이다.** 조건 4개·오퍼레이션 4개 넘으면 "외 N건"으로 자르고, 이름 못 찾은 ID는
그대로 쓴다. 정확한 값은 폼에서. **한국어 고정** — 영어 UI에서도 한국어로 나온다(다국어가 필요해지면
코드만 내려주고 FE가 조립하는 방식으로 바꾼다).

### 1-2. GET `/zabbix-manage/actions/options?eventsource=` — 폼 선택지

**응답** `ActionFormOptions` — 전부 `{id, name}[]`. **종류에 필요한 것만 채워지고 나머지는 `[]`**.

| 필드 | 채워지는 종류 | 쓰이는 곳 |
|---|---|---|
| `users` · `userGroups` · `mediaTypes` | 메시지 오퍼레이션이 있는 종류(전부) | `opmessage_usr`·`opmessage_grp`·`opmessage.mediatypeid` |
| `hostGroups` · `templates` | 장애·내부(조건 0·13) / 디스커버리·자동등록(오퍼레이션 4·5·6·7) | |
| `discoveryRules` · `discoveryChecks` | 디스커버리 | 조건 18·19. 검사 name = `"규칙명 / type 9 (system.uname)"` |
| `proxies` | 디스커버리·자동등록 | 조건 20 |

`users[].name`은 `"username (이름 성)"` 형태. `mediaTypes`는 **활성(status=0)만**.
⚠️ 조회 하나가 실패해도 나머지는 온다(프록시 API가 없어도 폼이 열려야 한다).

**실측**: 장애 옵션 — 사용자 10·그룹 10·미디어 11·호스트그룹 30·템플릿 347.

### 1-3. GET `/{actionid}` — 상세
1-1 행과 동일 shape. **에러** `ACTION_NOT_FOUND`.

### 1-4. POST — 생성

```ts
{
  name: string; eventsource: number;    // 필수 (수정에서는 eventsource 무시 — 바꿀 수 없다)
  status?: number; escPeriod?: string;
  pauseSuppressed?: number; notifyIfCanceled?: number; pauseSymptoms?: number;
  filter?: { evaltype, formula?, conditions: [{conditiontype, operator, value, value2?, formulaid?}] };
  operations: Operation[];              // 🔴 1개 이상 필수 (ACTION_OPERATIONS_REQUIRED)
  recoveryOperations?: Operation[];     // 장애·내부·서비스만
  updateOperations?: Operation[];       // 장애·서비스만
}
```
값은 숫자로 보내도 되고 문자열로 보내도 된다(Zabbix가 둘 다 받는다). 응답 = 생성 직후 재조회 상세.
**에러** `ACTION_CREATE_FAILED` · `ACTION_OPERATIONS_REQUIRED` · `ACTION_INVALID_FOR_EVENTSOURCE`

### 1-5. PUT `/{actionid}` — 수정(부분)
필드는 1-4와 같고 전부 선택. 🔴 **배열 넷은 보내면 전체 교체.** 검증은 **현재 저장된 eventsource 기준**.
빈 `operations`는 거부. **에러** `ACTION_NOT_FOUND` · `ACTION_OPERATIONS_REQUIRED` · `ACTION_INVALID_FOR_EVENTSOURCE`

### 1-6. PATCH `/{actionid}/status` · DELETE
`{ enabled }` → `{ id, status }` / `{ actionIds }` → `{ ids, count }`. **에러** `ACTION_IDS_REQUIRED`

---

## 2. 미디어 타입 — `/zabbix-manage/media-types`

### 2-1. GET — 목록

| 쿼리 | 비고 |
|---|---|
| `type` | 0=Email, 1=Script, 2=SMS, 4=Webhook |
| `status` · `search` · `limit` · `offset` | |

**응답** `PagedListDto<ManagedMediaType>` — 목록·상세 같은 shape:

```ts
{
  mediatypeid: string; name: string;
  type: number | null;          // 0 Email · 1 Script · 2 SMS · 4 Webhook
  status: number | null; description: string;
  maxsessions: number|null; maxattempts: number|null; attemptInterval: string;
  smtpServer, smtpPort, smtpEmail: string; smtpSecurity, smtpAuthentication: number|null; username: string;
  execPath: string; gsmModem: string; webhookTimeout: string;
  webhookParameters: {name, value}[];
  messageTemplates: {eventsource, recovery, subject, message}[];   // 상세에서만 채워짐
  usedByActionCount: number;    // 이 미디어를 참조하는 액션 수 (BE 계산, 아래 🔴)
  raw: Record<string, unknown>; // Zabbix 원본 — passwd 없음
}
```

🔴 **`passwd`(SMTP 암호)는 응답 어디에도 없다** — 이름 붙인 필드에도, `raw`에도. 수정 시 비우면 유지.

🔴 **`usedByActionCount`는 `action.get`에서 BE가 직접 센다.** 7.0.27 실기동에서 `mediatype.get selectActions`가
(1) `count`를 거부하고 (2) `extend`로 받으면 **미디어별로 좁혀지지 않은 엉뚱한 액션 4~5개가 46개 미디어
전부에 똑같이 붙어 왔다** → 그대로 썼으면 삭제가 전부 거부됐다. 실제 참조 액션은 8개. `opmessage.mediatypeid`
"0"(전체 미디어)은 세지 않는다.

⚠️ `mediatype.get`은 `sortfield=name`도 거부한다 — 이름순 정렬은 BE가 한다(대소문자 무시).

⚠️ 웹훅 `parameters`는 **원문 그대로** 온다. 사용자가 이름을 자유롭게 지어 무엇이 비밀인지 우리가 판단할 수 없다 —
화면이 "파라미터에 토큰을 넣었다면 여기 노출된다"고 알려야 한다.

**실측**: 46개(Email 7·Script 2·SMS 1·Webhook 36). Zabbix 기본 탑재 웹훅 30여 개가 비활성으로 깔려 있다.

### 2-2. GET `/{mediatypeid}` — 상세
2-1과 동일 shape + `messageTemplates` 채워짐. **에러** `MEDIA_TYPE_NOT_FOUND`

### 2-3. POST · PUT — 생성·수정

```ts
{
  name?: string; type?: number;         // 생성 시 둘 다 필수(MEDIA_TYPE_CREATE_FAILED)
  status?, description?, maxsessions?, maxattempts?, attemptInterval?
  // Email
  smtpServer?, smtpPort?, smtpHelo?, smtpEmail?, smtpSecurity?, smtpVerifyPeer?, smtpVerifyHost?,
  smtpAuthentication?, username?, passwd?, contentType?
  // Script: execPath?   // SMS: gsmModem?   // Webhook: script?, timeout?, webhookParameters?
  messageTemplates?: [{eventsource, recovery, subject, message}];   // 보내면 전체 교체
  extra?: Record<string, unknown>;      // 그 외 Zabbix 필드 원본 이름 그대로 (이름 붙인 필드가 이긴다)
}
```
🔴 `passwd`: **비우면 유지, 채우면 교체.** `messageTemplates`·`webhookParameters`: 보내면 전체 교체.

### 2-4. PATCH `/{id}/status` · DELETE
`{ enabled }` → `{ id, status }` / `{ mediaTypeIds }` → `{ ids, count }`.

🔴 **DELETE는 사용 중이면 전체 거부** — `code: "MEDIA_TYPE_IN_USE"`, `message: "MEDIA_TYPE_IN_USE: Email ← 액션A, 액션B / SMS ← 액션C"`.
화면은 message를 그대로 보여주면 된다. **에러** `MEDIA_TYPE_IDS_REQUIRED` · `MEDIA_TYPE_IN_USE`

⚠️ **테스트 발송 EP는 없다** — 7.0에 `mediatype.test` API가 없다(Zabbix UI의 Test는 프론트 내부 호출). 화면은
"테스트는 Zabbix에서" 안내.

---

## 3. 에러 코드

| code | 발생 |
|---|---|
| `403` | 관리자 아님 (전 EP) |
| `ACTION_EVENTSOURCE_REQUIRED` | 1-1·1-2 eventsource 없음/미지 |
| `ACTION_NOT_FOUND` | 1-3·1-5·1-6 |
| `ACTION_CREATE_FAILED` | 1-4 name/eventsource 없음 또는 ID 못 받음 |
| `ACTION_OPERATIONS_REQUIRED` | 1-4 operations 비어 있음 · 1-5 빈 배열 |
| `ACTION_INVALID_FOR_EVENTSOURCE` | 1-4·1-5 종류에 안 맞는 조건/오퍼레이션/복구·갱신 — message에 어느 값 |
| `ACTION_IDS_REQUIRED` | 1-6 |
| `MEDIA_TYPE_NOT_FOUND` | 2-2·2-3(PUT)·2-4 |
| `MEDIA_TYPE_CREATE_FAILED` | 2-3(POST) name/type 없음 |
| `MEDIA_TYPE_IDS_REQUIRED` | 2-4 |
| `MEDIA_TYPE_IN_USE` | 2-4 삭제 대상 중 하나라도 액션이 참조 — message에 "미디어 ← 액션들" |

---

## 4. FE 구현 노트

- **쿼리 키** `ALERT_QUERY_KEY` 신설(ACTION_LIST/DETAIL/OPTIONS · MEDIA_TYPE_LIST/DETAIL). 페이지 간 키 공유 금지.
- **URL 상태**: `?tab=actions|media-types&source=0..4` + 목록 필터·페이지. CSSTransition 리마운트 대비.
- **액션 폼의 왕복**: 목록 행의 `filter`·`operations`·`recoveryOperations`·`updateOperations`를 폼 상태로
  올리고, 저장 시 **넷을 전부** 되돌려 보낸다. 사용자가 손대지 않은 sub-object 필드(예: `opcommand` 내부)도
  원본 그대로 실어 보낸다 — 이게 "생략=유지"보다 안전하다(폼이 그 배열을 다루므로).
- **미디어 폼의 왕복**: `messageTemplates`는 폼이 다루면 전부, 안 다루면 생략. `passwd`는 항상 빈 값으로
  시작(응답에 없음) — 사용자가 채웠을 때만 보낸다.
- **에러 판정**: `unwrapEnvelope` 재사용. `MEDIA_TYPE_IN_USE`·`ACTION_INVALID_FOR_EVENTSOURCE`는 message를
  그대로 노출(사용자가 고칠 수 있는 정보가 거기 있다).
- **디스커버리 접점**: 규칙 목록 "액션 없음" → `alert-management?tab=actions&source=1&create=1&druleid=N`.
  액션 폼은 `druleid`가 있으면 조건에 `{conditiontype:18, operator:0, value:N}`을 미리 채운다.
