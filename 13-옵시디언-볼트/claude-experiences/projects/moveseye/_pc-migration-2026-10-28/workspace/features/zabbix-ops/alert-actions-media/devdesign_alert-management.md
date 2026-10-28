# 개발 설계서 — 알림 관리 (Zabbix 액션 + 미디어 타입)

> **v1 (2026-08-18)** — Zabbix `Alerts` 메뉴(액션 5종 + 미디어 타입)를 **Zabbix 관리 > 알림 관리**로
> 감싼다. 사용자 결정: 액션 5종 전부 + 미디어 타입 + 에스컬레이션까지.
> 선례: `devdesign_discovery.md` · `features/zabbix-config/trigger-mgmt/contract_trigger-mgmt.md` (같은 층 구조·같은 대원칙)
>
> 🔴 **디스커버리 화면과 이어진다.** 디스커버리 목록의 "액션 없음" 경고가 이 화면으로 가는 링크가 되고,
> 디스커버리 액션 폼은 규칙 화면에서 규칙을 미리 채운 채 열 수 있어야 한다.

---

## 0. 왜 만드나

디스커버리 규칙은 **찾기만** 하고, 찾은 것을 호스트로 등록하는 것은 **액션**이다. 규칙 화면은
"액션이 없다"고 경고할 수 있게 됐지만 **고치려면 Zabbix로 가야 했다** — 반쪽이었다.
장애 알림도 마찬가지다. 트리거를 우리 화면에서 만들어도 "누구에게 어떻게 알릴지"는 Zabbix에서
설정해야 한다. 알림 관리는 이 두 끊긴 고리를 잇는다.

## 1. 범위

| 화면 | Zabbix API | 하는 일 |
|---|---|---|
| **액션 — 장애** (`eventsource=0`) | `action.*` | 트리거가 울리면 누구에게 어떤 미디어로, 몇 단계로 알릴지. **에스컬레이션 포함** |
| **액션 — 디스커버리** (`eventsource=1`) | `action.*` | 발견된 장비를 호스트로 등록·그룹·템플릿 |
| **액션 — 자동 등록** (`eventsource=2`) | `action.*` | 에이전트가 스스로 등록 요청할 때 |
| **액션 — 내부** (`eventsource=3`) | `action.*` | 아이템 수집 불가·LLD 실패 등 Zabbix 내부 이벤트 |
| **액션 — 서비스** (`eventsource=4`) | `action.*` | 서비스(SLA) 상태 변화 |
| **미디어 타입** | `mediatype.*` | 이메일 서버·웹훅·스크립트·SMS 설정 |

**범위 밖**: 사용자 미디어(사용자별 수신 주소·시간대 — `user.update`의 `medias`. 사용자 관리 화면
소관) · 스크립트 정의(`script.*`, 글로벌 스크립트 오퍼레이션이 참조만 함) · SLA/서비스 정의.

## 2. 배치

```
FE   /zabbix-management/alert-management?tab=actions&source=0|1|2|3|4   액션 (탭 안 세그먼트)
     /zabbix-management/alert-management?tab=media-types                미디어 타입
      ↓
app  zabbixadmin/ZabbixActionManageController + Service       /zabbix-manage/actions
     zabbixadmin/ZabbixMediaTypeManageController + Service    /zabbix-manage/media-types
      ↓
engine-api  zabbix/alertaction/ZabbixActionService     (action.get/create/update/delete)
            zabbix/mediatype/ZabbixMediaTypeService    (mediatype.get/create/update/delete)
      ↓
engine-zabbix  각 Impl (JSON-RPC)
```

**대원칙(디스커버리·트리거 관리 그대로)**: Zabbix가 정본 · 로컬 저장 0 · **Flyway 0건** ·
관리자 전용 · 에러는 HTTP 200 + body `code` · 감사는 `zabbix_change_log`에 `ENTITY_ACTION`·
`ENTITY_MEDIA_TYPE`.

⚠️ 기존 `engine-api/zabbix/discovery/ZabbixDiscoveryService.getActionsRaw`(읽기 전용)는
**새 `ZabbixActionService`로 이관**하고 디스커버리 서비스는 그것을 주입받는다. 액션이 디스커버리
소속처럼 보이던 위치가 어긋났던 것이다.

## 3. Zabbix 액션 구조 — 알아야 폼을 짤 수 있는 것

### 3-1. eventsource별로 조건·오퍼레이션이 다르다

한 API(`action.*`)에 다섯 종류가 섞여 있고, **종류마다 허용되는 조건과 오퍼레이션이 다르다**.
잘못된 조합을 보내면 Zabbix가 거부한다. 폼은 `eventsource`를 먼저 정한 뒤 선택지를 좁혀야 한다.

| eventsource | 이름 | 조건(conditiontype) | 오퍼레이션(operationtype) | 복구/갱신 오퍼레이션 |
|---|---|---|---|---|
| **0** 트리거(장애) | 호스트그룹 0 · 호스트 1 · 트리거 2 · 트리거명 3 · 심각도 4 · 시간대 6 · 태그 25 · 태그값 26 · 억제 16 · 템플릿 13 | 메시지 0 · 글로벌 스크립트 1 | ✅ 둘 다 있음 |
| **1** 디스커버리 | 호스트IP 7 · 서비스종류 8 · 서비스포트 9 · 상태 10 · 업/다운타임 11 · 수신값 12 · 규칙 18 · 검사 19 · 프록시 20 · 오브젝트 21 | 메시지 0 · 스크립트 1 · 호스트추가 2 · 제거 3 · 그룹추가 4 · 그룹제거 5 · 템플릿연결 6 · 해제 7 · 활성 8 · 비활성 9 · 인벤토리모드 10 · 태그추가 13 · 태그제거 14 | ❌ |
| **2** 자동등록 | 프록시 20 · 호스트명 22 · 호스트메타 24 | 디스커버리와 동일(2~14) | ❌ |
| **3** 내부 | 호스트그룹 0 · 호스트 1 · 템플릿 13 · 이벤트타입 23 · 태그 25 · 태그값 26 | 메시지 0 | ✅ 복구만 |
| **4** 서비스 | 서비스 27 · 서비스명 28 · 태그 25 · 태그값 26 | 메시지 0 | ✅ 둘 다 |

🔴 **번호는 Zabbix 7.0 공식 표 기준이되, 디스커버리 쪽은 실물로 한 번 틀렸던 자리다**(8=서비스종류를
검사로 오독). 구현 전에 `action.get`으로 실서버 액션 원본을 다시 채집해 표와 대조한다 — 착수 순서 §7 ①.

### 3-2. 오퍼레이션 안에 에스컬레이션이 들어 있다

장애 액션의 오퍼레이션 하나하나가 **"몇 단계째에 누구에게"** 를 갖는다.

```
operation {
  operationtype: 0 (메시지)
  esc_step_from: 1        ← 이 단계부터
  esc_step_to:   1        ← 이 단계까지 (0 = 끝까지)
  esc_period:    "0"      ← 이 오퍼레이션만의 간격 (0 = 액션 기본값 사용)
  opmessage:     { default_msg, subject, message, mediatypeid }
  opmessage_usr: [{ userid }]
  opmessage_grp: [{ usrgrpid }]
  opconditions:  [{ conditiontype: 14 (확인여부), operator, value }]   ← 트리거 액션만
}
```

액션 레벨에는 `esc_period`(기본 단계 간격, 최소 60초)·`pause_suppressed`(유지보수 중 일시정지)·
`notify_if_canceled`(에스컬레이션 취소 시 알림)·`pause_symptoms`(7.0: 증상 이벤트 일시정지)가 있고,
오퍼레이션이 자기 간격을 안 정하면 액션의 `esc_period`를 쓴다. 화면은 이걸 **표로 보여준다** — Zabbix 폼과 같은 모양:

```
단계     간격     대상                미디어      조건
1        (기본)   담당자 그룹          Email
2-3      30m      팀장                 SMS         확인 안 됨
4-0      1h       운영 총괄            전체
```

⚠️ `default_msg=1`이면 미디어 타입의 메시지 템플릿을 쓴다. `0`이면 오퍼레이션 자체의 subject/message다.
폼은 "기본 메시지 사용" 체크박스 하나로 가른다.

### 3-3. 필터 조건은 수식으로 묶인다

```
filter {
  evaltype: 0 (And/Or) | 1 (And) | 2 (Or) | 3 (커스텀 수식)
  formula:  "A and (B or C)"     ← evaltype=3일 때만
  conditions: [{ conditiontype, operator, value, value2, formulaid: "A" }]
}
```

- `And/Or`(기본): 같은 종류끼리는 Or, 다른 종류끼리는 And — Zabbix가 알아서 한다
- 커스텀 수식은 `formulaid`(A·B·C…)를 사용자가 조합한다 — 폼에서 라벨을 자동 부여하고 수식 입력란을 연다

`operator`는 조건 종류마다 허용값이 다르다(같음 0 · 다름 1 · 포함 2 · 미포함 3 · 크거나같음 5 ·
작거나같음 6 · 예/아니오 …). 종류별 허용 연산자 표를 FE 상수로 둔다.

### 3-4. 미디어 타입

```
mediatype {
  type: 0 Email | 1 Script | 2 SMS | 4 Webhook
  status, name, description, maxsessions, maxattempts, attempt_interval
  -- Email: smtp_server, smtp_port, smtp_helo, smtp_email, smtp_security(0/1/2),
            smtp_verify_peer, smtp_verify_host, smtp_authentication(0/1), username, passwd,
            content_type(0 텍스트/1 HTML)
  -- Webhook: script(JS), timeout, process_tags, show_event_menu, event_menu_url, event_menu_name,
              parameters[{name, value}]
  -- Script: exec_path, parameters[{sortorder, value}]
  -- SMS: gsm_modem
  message_templates[{ eventsource, recovery(0/1/2), subject, message }]
}
```

🔴 **비밀값**: `passwd`(SMTP 인증 암호)는 **조회 응답에 싣지 않는다**(디스커버리 SNMPv3 암호와 같은
원칙). 수정 시 비우면 유지, 채우면 교체 — `SettingService`의 "비어 오면 저장값 유지" 패턴 그대로.
웹훅 `parameters`에 토큰이 들어가는 경우도 흔한데, 이건 **사용자가 파라미터 이름을 자유롭게 짓는
구조라 무엇이 비밀인지 우리가 판단할 수 없다** — 원문 그대로 왕복하되 감사로그에는 이름만 남긴다.

### 3-5. 실측 (2026-08-18, Zabbix 7.0.27, BE 재기동 후 `/rules/{id}/actions`로 채집)

디스커버리 액션 **3건** — 사용자가 만든 `Gabe_s VMs Linux discovery`(7)·`Gabe_s VMs Windows discovery`(8)
+ 기본 샘플 `[DISABLED] Auto discovery. Linux servers.`(2, 비활성).

```
action 필드   actionid · name · eventsource · status · esc_period · pause_suppressed ·
              notify_if_canceled · pause_symptoms(7.0 신규) · filter · operations
filter        evaltype "0" · formula "" · eval_formula "A and B and C" ·
              conditions[{conditiontype, operator, value, value2, formulaid}]
조건(3건 공통) 10=0(상태 Up) · 12~"Linux"|"Windows"(수신값 포함, operator 2) · 8=9(서비스 종류=Zabbix agent)
오퍼레이션     2(호스트 추가) · 4(그룹 추가, opgroup[{groupid}]) · 6(템플릿 연결, optemplate[{templateid}]) ·
              10(인벤토리 모드, opinventory{inventory_mode:"1"})
              esc_step_from/to "1"/"1" · esc_period "0" (디스커버리는 단계 없음)
```

🔴 **8=서비스 종류가 실물로 재확정됐다.** Linux/Windows 액션이 조건 12(수신값)만 다르고 8=9는 같다 —
8이 검사였다면 두 액션이 OS를 가를 방법이 없다. §3-1 표의 디스커버리 행은 이 채집과 일치.

⚠️ 장애(0)·자동등록(2)·내부(3)·서비스(4) 액션과 미디어 타입은 **원본 조회 EP가 아직 없어 미채집** —
엔진 계약(§7 ②)을 만든 직후 같은 방식으로 채집해 표를 대조한다. 실서버에 장애 액션이 있는지도 그때 안다.

## 4. 엔드포인트

### 액션 — `/zabbix-manage/actions`

| 메서드 | 경로 | Zabbix | 비고 |
|---|---|---|---|
| GET | `?eventsource=&search=&status=&limit=&offset=` | `action.get` + selectFilter·selectOperations·selectRecoveryOperations·selectUpdateOperations | 🔴 `eventsource` **필수** — 다섯 종류가 한 테이블이라 전체 조회는 화면이 없다 |
| GET | `/{actionid}` | `action.get` 단건 + 전부 select | 폼 초기값 |
| POST | | `action.create` | 응답 = 재조회 상세 |
| PUT | `/{actionid}` | `action.update` | 🔴 `filter`·`operations`·`recovery_operations`·`update_operations`는 **보내면 전체 교체**(LLD overrides와 같은 함정). 폼이 항상 전부 왕복 |
| PATCH | `/{actionid}/status` | `action.update` status만 | |
| DELETE | | `action.delete` | body `{ actionIds }` |
| GET | `/options?eventsource=` | (여러 조회 합성) | 폼 선택지 — 사용자·사용자그룹·미디어타입·호스트그룹·템플릿·**디스커버리 규칙·검사** 를 eventsource에 맞게 한 번에. FE가 5~6번 부르지 않게 |

### 미디어 타입 — `/zabbix-manage/media-types`

| 메서드 | 경로 | Zabbix |
|---|---|---|
| GET | `?type=&status=&search=&limit=&offset=` | `mediatype.get` (+ 사용 액션 수는 `selectActions` count) |
| GET | `/{mediatypeid}` | `mediatype.get` + selectMessageTemplates (`passwd` 제외) |
| POST · PUT · DELETE · PATCH status | | `mediatype.*` |
| POST | `/{mediatypeid}/test` | `mediatype.test`? — ⚠️ **7.0에 이 API 없음**. Zabbix UI의 "Test"는 프론트 내부 호출이다. **1차 범위 밖**으로 두고 화면에 "테스트는 Zabbix에서" 안내 |

### BE가 얹는 값

| 필드 | 계산 |
|---|---|
| 액션 `operationSummary` | 오퍼레이션을 사람이 읽는 한 줄로: "Email→운영팀, 2단계 SMS→팀장" — 목록에서 폼을 안 열고도 뭘 하는지 보이게 |
| 액션 `conditionSummary` | 조건을 한 줄로: "심각도≥높음 · 그룹=운영서버" |
| 액션 `mediaTypeNames` | 오퍼레이션이 참조하는 미디어 타입 이름들 — 목록 필터 겸 |
| 미디어타입 `usedByActionCount` | 이 미디어를 쓰는 액션 수 — **삭제 확인에 필수**(쓰는 액션이 있으면 Zabbix가 거부하는데 원문이 불친절) |

## 5. 화면

### Zabbix 관리 > 알림 관리

```
[액션] [미디어 타입]                                            ← 탭

액션 탭:
  ( 장애 ) ( 디스커버리 ) ( 자동 등록 ) ( 내부 ) ( 서비스 )     ← 세그먼트(eventsource)

  이름                    조건 요약               오퍼레이션 요약              상태  작업
  Report problems to      심각도≥경고            1: Email→Zabbix admins       ON    수정 삭제
  Zabbix administrators
  Auto discovery.         상태=Up·수신값~Linux·   그룹추가·템플릿연결          OFF   수정 삭제
  Linux servers.          서비스=Zabbix agent
```

**액션 폼(드로어)** — Zabbix 폼과 같은 3탭: `액션`(이름·조건·활성) / `오퍼레이션`(단계표 + 추가/편집
서브폼) / `복구·갱신 오퍼레이션`(eventsource 0·3·4만). 오퍼레이션 서브폼은 operationtype을 고르면
그에 맞는 필드만 편다(메시지→대상+미디어+템플릿, 그룹추가→그룹 select, 템플릿연결→템플릿 select …).

**미디어 타입 폼** — type 라디오(Email/Webhook/Script/SMS)로 필드군 전환. 메시지 템플릿은
eventsource×recovery 조합표(최대 5×3)에서 필요한 칸만 채운다.

### 디스커버리 화면과의 접점

- 규칙 목록의 **"액션 없음"/"호스트 생성 없음" 경고 → 클릭하면** `alert-management?tab=actions&source=1&create=1&druleid=N` 으로 이동, 폼이 **조건에 규칙 N을 미리 채운 채** 열린다
- 규칙 드로어 "연결된 액션" 탭의 각 액션 → 수정 폼 딥링크

## 6. 결정 사항 (미결 → 확정)

| # | 쟁점 | 결정 |
|---|---|---|
| A1 | 액션 5종을 한 화면에 vs 종류별 메뉴 | **한 화면 + 세그먼트**. 종류가 달라도 "이벤트→조건→오퍼레이션" 모양은 같고, 메뉴 5개는 과하다 |
| A2 | 에스컬레이션 UI 수준 | **표 + 서브폼**. Zabbix와 동형. 단계 없이 "1단계만"인 오퍼레이션이 대다수라 기본값(1~1)은 감춘다 |
| A3 | 사용자 미디어(수신 주소) | **범위 밖**. 사용자 관리 소관 — 여기서 "이 사용자는 이메일이 없다"까지 경고하면 좋지만 2차 |
| A4 | 미디어 타입 테스트 발송 | **1차 범위 밖**(API 없음). 안내 문구만 |
| A5 | 미디어 타입 삭제 시 사용 액션 존재 | **BE가 먼저 막는다** `MEDIA_TYPE_IN_USE` + 사용 액션 목록 반환 → 확인 창에 "이 액션 N개가 쓰고 있다" |
| A6 | 액션 조회 코드 위치 | 디스커버리 서비스의 `getActionsRaw`를 **`ZabbixActionService`로 이관**. 디스커버리는 그것을 주입받는다 |
| A7 | 조건 번호 정본 | **실서버 채집을 정본**으로 한다(§7 ①). 문서 표는 참고. 디스커버리에서 한 번 틀렸다 |

## 7. 착수 순서

1. **실측** — `action.get`(5종 전부, select 전부) + `mediatype.get` + 사용자·그룹 조회로 실물 응답 채집.
   🔴 조건·오퍼레이션 번호를 §3-1 표와 대조. 어긋나면 표를 고친다.
2. **BE 계약** — `engine-api/zabbix/{alertaction,mediatype}` + `engine-zabbix` 구현. 디스커버리의 `getActionsRaw` 이관.
3. **BE 관리** — 두 컨트롤러·서비스·DTO + `/options` 합성 + 요약 계산 + 테스트. `features/zabbix-ops/alert-actions-media/contract_alert-management.md` 산출.
4. **FE 미디어 타입** — 목록·폼·삭제(사용 액션 표시). 액션 폼이 미디어 타입 select를 쓰므로 먼저.
5. **FE 액션 목록·삭제·토글** — 세그먼트·요약 열.
6. **FE 액션 폼** — 조건 편집기(종류별 연산자·값 입력기) → 오퍼레이션 서브폼 → 에스컬레이션 표 → 복구/갱신 탭. **가장 큰 덩어리**라 마지막.
7. **디스커버리 접점** — 경고→링크, 규칙 미리 채우기.
8. QA — 정적 + 실서버 왕복(액션 만들고 Zabbix UI에서 같은 모양인지).

## 8. 예상 규모

BE ~14 EP · DTO ~20 · FE 화면 2 + 폼 2 + 서브폼 3 · i18n ~150키. **디스커버리 전체의 1.5~2배.**
단계별로 커밋한다 — 미디어 타입까지(1~4)가 첫 커밋 단위, 액션 목록(5)이 둘째, 액션 폼(6~7)이 셋째.
