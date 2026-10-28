# E2E 행위 검증 — 홈 위젯 대시보드 (home-widgets)

> 실행: 2026-08-18 · `functional-qa` · 런타임 실측(BE :3000 dev / FE :5173 Vite dev / dev DB 5433)
> 계약서: `_workspace/contract_home-widgets.md` v1 · 설계서: `_workspace/designs/devdesign_home-widgets.md`
> 계정: `admin`(ADMIN, userId=110) · 위젯 상태는 검증 종료 후 `POST /home/widgets/reset`으로 시드 12개 원복 완료(DB 확인: 12행, title 0건)

## 0. 총평

| 구분 | 결과 |
|---|---|
| A. API 계층 (7항목) | **6 PASS / 0 FAIL / 1 SKIP**(비관리자 계정 자격증명 없음) |
| B. 화면 계층 (8항목) | **5 PASS / 2 FAIL / 1 부분**(rAF 제약으로 드래그 실측 불가 → 서버 왕복으로 대체 검증) |
| C. 회귀 (브레드크럼) | **PASS** |

**계약(EP·DTO·에러코드·시드 좌표·캐시) 위반은 0건이다.** BE는 계약서대로 정확히 동작한다.
실패 2건은 전부 **FE 표시/조회 파라미터** 문제이고, 그중 F-1은 홈 화면 위젯 2개가 **항상 빈 값**으로 보이는 실사용 차단급이다.

### 결함 요약

| # | 심각도 | 제목 | 책임 |
|---|---|---|---|
| **F-1** | 🔴 HIGH | `현재 발생 알람`·`호스트그룹 상태` 위젯이 **항상 비어 있음**(from/to 미전송 → BE가 epoch 0 창으로 조회) | FE |
| **F-2** | 🟠 MEDIUM | 브레드크럼 "홈" 아래에 **큰 "홈" 제목이 그대로 남음**(중복 제거 미완) | FE |
| **F-3** | 🟠 MEDIUM | 기본 세트 위젯 12개 중 **6개가 첫 진입부터 카드 내부 스크롤**(기본 높이 부족) | FE(+BE 카탈로그 기본 크기) |
| **F-4** | 🟡 LOW | 편집 모드에 **들어가기만 해도** RGL 수직 압축이 저장된 배치를 덮어씀(`main_geo_map` y31→y25) | FE |
| **F-5** | 🟡 LOW | `/event/problems`의 `sortDirection`이 **반대로 동작**(DESC=오래된 순) — 기존 화면에도 해당 | BE(기존) |
| **F-6** | ℹ️ INFO | 홈 진입 시 React Flow 경고 1,000건+ 콘솔 누적(대표 네트워크 맵 위젯) | FE(기존) |

---

## A. API 계층 (curl / python urllib, admin)

재현 스크립트: `<scratchpad>/api_a.py` (전 시나리오 일괄 실행)

### A-1. `GET /home/widgets` 목록·시드 멱등 — ✅ PASS
```
call1 count=12  call2 count=12
ids call1: [1..12]   ids call2: [1..12]      # 재호출해도 새로 깔리지 않음
sorted by (posY,posX,id)? True               # 계약 §2 정렬
seed matches contract admin table? True      # 계약 §5 관리자 12개 좌표 전량 일치
pinned set: ['system_license','system_users','system_datasources']   # 시스템 3종만
all config == {}? True   all title is None? True
```

### A-2. `POST /home/widgets` — ✅ PASS
| 케이스 | 기대 | 실제 |
|---|---|---|
| `alarm_severity_pie` 정상 추가 | 200 success | `{"id":13,...,"pinned":false}` ✅ |
| `alarm_kpi` 재추가(unique 중복) | `WIDGET_DUPLICATE` | `{"status":"error","code":400,"errorCode":"WIDGET_DUPLICATE"}` ✅ |
| `no_such_widget` | `WIDGET_TYPE_INVALID` | `{"status":"error","code":400,"errorCode":"WIDGET_TYPE_INVALID"}` ✅ |
| 좌표 생략(`alarm_list` 2번째) | `posY = max(posY+height)` | 요청 없이 `posY:53`, 계산값 53 일치 ✅ |

HTTP는 전부 200, 바디 code로 분기 — 계약 §7 준수.

### A-3. `PATCH /home/widgets/layout` — ✅ PASS
```
요청: [{id:1,x:8,y:2,w:3,h:6}, {id:2,x:0,y:2,w:5,h:6}, {id:999999,x:0,y:0,w:1,h:1}]
응답: {"status":"success","code":200}        # data 없음(null)
재조회: id1 → x=8 y=2 w=3 h=6 ✅ / id2 → x=0 y=2 w=5 h=6 ✅ / 총 개수 불변(14) ✅
```
남의 id(999999)는 **그 항목만 무시**되고 나머지는 반영됐다(계약 §3 #3). `layouts: []` / `layouts: null` 도 success no-op.
※ BE WARN 로그는 다른 세션이 띄운 프로세스라 확인 불가(동작으로 대체 검증).

### A-4. `PATCH /home/widgets/{id}` — ✅ PASS
| 요청 | 결과 |
|---|---|
| `{title:"긴급 알람", config:{limit:20,minSeverity:"4"}}` | 둘 다 반영, 한글 정상 저장 ✅ |
| `{config:{limit:5}}` | config만 교체(머지 아님), title 유지 ✅ |
| `{title:""}` | `title: null` 로 저장 = 기본 제목 복원 ✅ (계약 §3 #4) |
| `{title:null, config:null}` | 무변경 ✅ |
| 없는 id | `{"code":404,"errorCode":"WIDGET_NOT_FOUND"}` ✅ (홈 위젯만 404) |

### A-5. `DELETE /home/widgets/{id}` — ✅ PASS
| 대상 | 결과 |
|---|---|
| 일반 위젯(`alarm_severity_pie`) | success ✅ |
| pinned(`system_license`) | `{"code":400,"errorCode":"WIDGET_PINNED"}` ✅ |
| 없는 id | `{"code":404,"errorCode":"WIDGET_NOT_FOUND"}` ✅ |
| `system_scheduler`(pinned 아님) | success — 관리자는 삭제 가능 ✅ (계약 §4) |

### A-6. `POST /home/widgets/reset` — ✅ PASS
```
reset HTTP 200 status success count 12
reset matches contract admin table? True     # 좌표까지 시드 원본
GET after reset == reset 응답 (id 배열 동일)  # 재조회 불필요, 계약 §3 #6
```

### A-7. `GET /home/system-status` — ✅ PASS
```jsonc
{"users":{"total":4,"active":4,"inactive":0,"admins":1,"online":2},
 "dataSources":[{"id":"zabbix-default","type":"zabbix","displayName":"Zabbix","status":"UP",
                 "detail":"7.0.6","latencyMs":47,"checkedAt":"2026-08-18T18:16:44.967Z",
                 "endpoint":"https://dmove.co.kr"}],
 "infrastructure":[{"key":"database","status":"UP","latencyMs":5,"detail":null},
                   {"key":"redis","status":"UP","latencyMs":35,"detail":null},
                   {"key":"aws","status":"NOT_CONFIGURED","latencyMs":null,"detail":null}],
 "schedulers":[7건 — asset_sync/event_cleanup/event_sync/report_cleanup/report_monthly/report_weekly/user_sync],
 "checkedAt":"2026-08-18T18:16:45.015Z"}
```
- 키 5개·`infrastructure` 순서(database→redis→aws)·상태 4값 유니언 전부 계약 §6 일치.
- **캐시**: 3초 간격 재호출에서 `checkedAt`·`dataSources` 완전 동일 ✅ (TTL 30초).
- `schedulers`는 관리자에게 배열로 내려옴. `lastRun`은 `{status,startedAt,durationMs,message}` 4필드(계약 R3 확인 요청건 — **계약대로 맞다**). `event_sync`는 `{"status":"failed","message":"ApiError: ZABBIX_API_ERROR"}`로 실패 이력이 정상 노출.

### A-8. 비관리자 검증 — ⏭️ SKIP
dev DB의 비관리자 계정은 `Admin`/`guest`(ZABBIX 플랫폼, password NULL — 로그인 불가), `chanho`(DMOVE, 비밀번호 미상)뿐이다.
```
select id,username,role,platform,(password is not null) from "user";
110 admin  ADMIN ACTIVE DMOVE  t
111 Admin  USER  ACTIVE ZABBIX f
112 guest  USER  ACTIVE ZABBIX f
114 chanho USER  ACTIVE DMOVE  t   ← 비밀번호 미상
```
비밀번호를 임시 변경하지 않는다는 지시에 따라 **시드 10개 / `schedulers: null` / `WIDGET_ADMIN_ONLY` 3건은 미검증**으로 남긴다(BE 단위 테스트 `HomeWidgetServiceTest`가 커버 중).

---

## B. 화면 계층 (Chrome MCP, `/home`)

> ⚠️ **환경 제약(오진 방지)**: MCP 탭은 `document.hidden === true`라 `requestAnimationFrame`이 멈춘다. 그 결과
> (1) ECharts 도넛이 조각 없이 보이고, (2) antd 모달/팝오버가 `ant-zoom-leave-active` 상태로 굳어 DOM에 남으며,
> (3) 합성 마우스 드래그가 렌더러를 멈춰 세운다. **전부 툴 제약이며 제품 결함이 아니다.**
> 따라서 판정은 DOM 어서션 + ECharts 인스턴스 `getOption()` + 서버 왕복으로 했고, 스크린샷은 다크모드 1장만 썼다.

### B-1. 브레드크럼 "홈" 1회 / 본문 큰 "홈" 제목 없음 — ❌ **FAIL (F-2)**
```js
// 브레드크럼: OK
document.querySelectorAll('.ant-breadcrumb .ant-breadcrumb-link') → ["홈"]      // 1개 ✅

// 본문: 20px H4 "홈" 이 여전히 존재 ❌
{tag:"SPAN", fontSize:"20px",
 path:"DIV.bg-none > ... > H4.ant-typography.p-0 > SPAN"}   // 텍스트 "홈"
```
- `HomePage.tsx:147` 주석은 *"페이지 제목은 그리지 않는다 — 상단 헤더 브레드크럼이 이미 '홈'을 표시한다(중복 제거)"* 라고 적혀 있지만, 제목을 그리는 주체는 홈 페이지가 아니라 **공용 레이아웃**이다:
  - `src/layouts/app/App.tsx:256` → `<PageHeader />` 를 모든 라우트에 무조건 렌더
  - `src/components/PageHeader/PageHeader.tsx` → `useBreadcrumbs().currentPage` 를 `Typography.Title level={4}` 로 출력
- 결과: 화면 상단에 "홈"(브레드크럼) + "홈"(20px 제목)이 **세로로 두 번** 뜬다(다크모드 스크린샷에서 육안 확인).
- **책임: FE.** 홈만 `PageHeader`를 건너뛰거나(라우트 예외), `useBreadcrumbs`가 루트 경로에서 빈 제목을 주도록 처리 필요.

### B-2. 위젯 그리드 렌더(시드 12개, 시스템 3종 상단) — ✅ PASS
`.react-grid-item` 12개. 그리드 좌표 환산 결과가 서버 값과 정확히 일치.

| 카드 제목 | gx | gw | 행 |
|---|---:|---:|---|
| 라이선스 / 사용자 / 데이터소스 연결 | 0 / 4 / 8 | 4 / 4 / 4 | 1행(최상단) ✅ |
| 현재 알람 / 인프라 가용성 | 0 / 6 | 6 / 6 | 2행 |
| 현재 발생 알람 / 호스트그룹 상태 | 0 / 6 | 6 / 6 | 3행 |
| 맵 요약 / 최근 리포트 | 0 / 4 | 4 / 8 | 4행 |
| 배치·동기화 상태 / 대표 지리 맵 | 0 / 6 | 6 / 6 | 5행 |
| 대표 네트워크 맵 | 0 | 6 | 6행 |

편집 모드 조작부도 계약대로다.
```
pinned 3종(라이선스·사용자·데이터소스 연결) → 삭제 아이콘 없음(버튼 1개=이름변경) ✅
system_scheduler(배치·동기화 상태) → 삭제 아이콘 있음 ✅  (pinned 아님)
설정(setting) 아이콘 → alarm_list·hostgroup_status 2종에만 ✅ (recent_reports 는 R2대로 미노출)
편집 모드 아닐 때 [위젯 추가]·[기본값으로 초기화] disabled ✅
```

### B-3. 시스템 위젯 값 ↔ API 일치 — ✅ PASS
| 위젯 | 화면(DOM) | API `/home/system-status` |
|---|---|---|
| 사용자 | 전체 4 · 활성 4 · 비활성 0 · 관리자 1 · 현재 접속 2 | `{"total":4,"active":4,"inactive":0,"admins":1,"online":2}` ✅ |
| 데이터소스 연결 | Zabbix **정상** 7.0.6 / 데이터베이스 **정상** / Redis **정상** / AWS **미설정** | `UP`/`UP`/`UP`/`NOT_CONFIGURED` ✅ |
| 라이선스 | 정상 · STANDARD · 디무브 · 영구 · 만료 없음 | `GET /features`(useLicense) — 렌더 정상 ✅ |
| 배치·동기화 상태 | 이벤트 동기화 **마지막 실행 실패**, 자산 목록 동기화 성공, 다음 실행 시각 | `schedulers[]` 7건과 일치 ✅ |

`NOT_CONFIGURED`가 "미설정"으로, `UP`이 "정상"으로 **배지 문구가 분리**되어 계약 §6의 🔴 경고를 지켰다.

### B-4. 편집 모드 → 추가 / 삭제 / 이름변경 / 설정 — ✅ PASS
1. **카탈로그 모달**: 14종 전량 노출, unique 보유분 10종이 `disabled` + "이미 추가됨" 배지. 비-unique 3종(`alarm_list`·`alarm_severity_pie`·`hostgroup_status`)과 미보유 `asset_kpi`만 선택 가능 ✅ (계약 §4 unique 표와 일치)
2. **추가**: `알람 심각도 분포` 체크 → [추가] → 그리드 13개. 서버에도 `{"id":27,"widgetType":"alarm_severity_pie","posX":0,"posY":42,"width":4,"height":8}` 저장 ✅ (FE가 좌표를 직접 계산해 보냄 — 계약 §3 #2의 원칙대로)
3. **차트 데이터 검증**(rAF 정지로 그림 판정 불가 → 인스턴스 옵션으로 대체):
```js
getEchartsInstance().getOption().series[0].data
→ [재해 39, 높음 3, 보통 761, 경고 32, 정보 107, 미분류 2]
/home/summary.alarm.severityCounts = {"5":39,"4":3,"3":761,"2":32,"1":107,"0":2}   // 완전 일치 ✅
```
4. **이름 변경**: 인라인 편집으로 `심각도 도넛(QA)` 입력 → DB 확인 `title='심각도 도넛(QA)'` (한글 깨짐 없음) ✅
5. **설정 모달**: `현재 발생 알람` → 표시 건수 5/10/20 선택지 → 20건 저장 → 서버 `config={"limit":20}` ✅ (통째 교체)
6. **삭제**: `심각도 도넛(QA)` 삭제 확인 팝오버("이 위젯을 삭제할까요?") → 12개로 복귀 ✅. pinned 3종은 삭제 버튼 자체가 없다 ✅

### B-5. 새로고침 후 배치 유지 — ⚠️ 부분 PASS
- 합성 마우스 드래그는 hidden 탭에서 렌더러를 멈춰(CDP 45초 타임아웃) **드래그 자체는 실측 불가**.
- 대신 서버 저장값 ↔ 새로고침 후 렌더 좌표를 대조: 12개 전부 일치(특히 압축으로 옮겨진 `main_geo_map` y=25가 재로드 후에도 스케줄러 옆에 그대로) → **영속성은 확인** ✅
- 다만 그 과정에서 **F-4**를 발견했다(아래).

#### F-4 (LOW) — 편집 모드 진입만으로 저장된 배치가 바뀐다
```
reset 직후 서버:  main_network_map (0,31)  /  main_geo_map (6,31)   # 계약 §5 시드
[편집] 클릭(아무것도 옮기지 않음) 후 서버:
                  main_network_map (0,31)  /  main_geo_map (6,25)   ← 덮어써짐
```
react-grid-layout의 수직 압축(`verticalCompact`)이 마운트 시 레이아웃을 재계산하고, `HomePage.handleLayoutChange`가 편집 모드에서는 그것을 그대로 저장한다. 데이터 손실은 없지만
(1) 계약 §5의 시드 좌표가 첫 편집 이후 유지되지 않고,
(2) 나란히 놓으려던 맵 2종이 **엇갈려 배치**된다(지리 맵은 스케줄러 옆, 네트워크 맵만 아래 단독).
→ 시드 좌표를 압축 결과와 일치시키거나(`main_geo_map` y=25), 사용자 조작이 없는 첫 압축은 저장하지 않도록 거르는 편이 낫다.

### B-6. 기본값으로 초기화 — ✅ PASS
[편집] → [기본값으로 초기화] → 팝오버("홈을 기본값으로 초기화할까요? / 현재 위젯 구성과 배치가 기본 세트로 바뀝니다.") → [확인]
→ 12개 복원, `title` 전부 null, `config` 전부 `{}` ✅ (직후 F-4로 geo_map만 y=25로 압축 저장됨)

### B-7. 다크모드 — ✅ PASS
```
토글 전 카드: bg rgb(255,255,255) / color rgba(0,0,0,.88)
토글 후 카드: bg rgb(31,31,31)    / color rgba(255,255,255,.85)   # 12개 전부 동일 적용
저대비(배경-글자 휘도차 < 80) 요소: 0건
```
밝은 배경으로 남는 요소는 (a) 심각도/상태 `ant-tag`(연한 배경 + 진한 글자, 가독성 정상), (b) MapLibre 지도 타일·컨트롤, (c) 네트워크 맵 노드 박스 — 모두 해당 컴포넌트의 원래 설계이며 홈 위젯이 만든 회귀가 아니다. 스크린샷 육안 확인에서도 색 깨짐 없음.

### B-8. 콘솔 에러 — ✅ PASS(요건 기준) / ℹ️ F-6
- **에러 2건**: `Warning: [antd: message] Static function can not consume context like dynamic theme. Please use 'App' component instead.` — 초기화 성공 토스트(`message.success`) 시점에 발생. 앱 전역 관례다(정적 `message` 사용 46개 파일 / `App.useApp()` 0개) → 홈 위젯 고유 결함 아님. 다만 다크모드에서 토스트만 라이트 테마로 뜬다.
- **경고 1,170건+**: `[React Flow]: Couldn't create edge for target handle id: "top"...` — `대표 네트워크 맵` 위젯이 뷰 모드에서 핸들을 숨기는데 엣지가 그 핸들 id를 참조해서 매 렌더마다 엣지 수만큼 쌓인다. 랜딩 페이지라 진입할 때마다 누적되므로 콘솔이 사실상 못 쓰게 된다(F-6, 기존 이슈).

---

## C. 회귀 — 다른 화면 브레드크럼 — ✅ PASS
`/asset/list` → 브레드크럼 `홈 / 자산 / 자산 목록`, 테이블 10행 정상 렌더. 홈 라우트 변경이 다른 경로의 브레드크럼을 깨뜨리지 않았다.
(참고: 좌측 메뉴는 "자산 관리", 브레드크럼 중간은 "자산" — 기존 라벨 불일치이며 이번 변경과 무관.)

---

## 🔴 F-1 (HIGH) — 상세: 알람 목록·호스트그룹 위젯이 항상 비어 있다

### 증상
같은 화면에서 서로 모순되는 값이 동시에 보인다.

| 위젯 | 화면 표시 |
|---|---|
| `현재 알람`(alarm_kpi) | **945** · 재해 39 · 높음 3 · 보통 759 · 경고 35 · 정보 107 · 미분류 2 |
| `현재 발생 알람`(alarm_list) | **"발생 중인 알람이 없습니다"** (`.ant-empty`) |
| `호스트그룹 상태`(hostgroup_status) | Linux servers **전체 0** · Zabbix servers **전체 0** · Discovered hosts **전체 0** · … (5개 그룹 전부 0) |

### 원인
두 위젯의 조회 훅이 **`from`/`to`(조회 기간)를 보내지 않는다.** BE는 `DateRangeFilterDto`의 `from`/`to`가 원시 `long`이라 미전송 시 **0(=epoch 1970)** 이 되고, 조회 창이 사실상 비어 결과가 0건이 된다.

- `src/hooks/useHome.ts:39-53` `useHomeProblems` — params에 `limit/offset/sortBy/sortDirection`만
- `src/hooks/useHome.ts:59-71` `useHomeHostGroupProblems` — params에 `limit/offset/sortDirection`만
- 비교: 기존 화면 `src/pages/event-alert/problem/ProblemList.tsx:57` 은 `const { from, to, offset, limit, ... } = params;` 로 **기간을 넘긴다** → 같은 EP인데 기존 페이지만 정상.
- BE 수신부: `src/main/java/com/dmove/moveseye/common/response/DateRangeFilterDto.java:15-16` (`private long from; private long to;`)

### 실증 (재현 명령)
```bash
# 로그인
curl -s -c cj.txt -H "Content-Type: application/json" -H "x-visitor-id: qa1" \
  -d '{"username":"admin","password":"<마스킹>"}' http://localhost:3000/auth/login

# (1) FE가 지금 보내는 그대로 — 0건
curl -s -b cj.txt -H "x-visitor-id: qa1" \
  "http://localhost:3000/event/problems?limit=20&offset=0&sortBy=occurrenceTime&sortDirection=DESC"
# → "items": [], "total": 0

# (2) 기간만 붙이면 — 73건
NOW=$(date +%s); FROM=$((NOW-2592000))
curl -s -b cj.txt -H "x-visitor-id: qa1" \
  "http://localhost:3000/event/problems?limit=20&offset=0&sortBy=occurrenceTime&sortDirection=DESC&from=$FROM&to=$NOW"
# → items 20건, total 73

# 호스트그룹도 동일
curl -s -b cj.txt -H "x-visitor-id: qa1" "http://localhost:3000/hosts/hostgroup-problems?limit=3&offset=0&sortDirection=DESC"
# → Linux servers total 0 / Zabbix servers total 0 / Discovered hosts total 0
curl -s -b cj.txt -H "x-visitor-id: qa1" "http://localhost:3000/hosts/hostgroup-problems?limit=3&offset=0&sortDirection=DESC&from=$FROM&to=$NOW"
# → Linux servers total 67(warning 54, disaster 8, ...) / Zabbix servers 2 / Discovered hosts 67
```
DB에도 데이터는 있다: `select count(*) from event_problems;` → **256행**(최신 행 생성 시각 오늘 18:22).

### 책임 / 조치 제안
**FE.** `useHomeProblems`·`useHomeHostGroupProblems`에 조회 기간을 추가한다(홈 요약과 결이 맞으려면 "현재 발생 중" 기준 기간 — 예: 최근 30일 또는 기존 화면과 동일 기본 창). 쿼리 키에 기간이 들어가면 폴링마다 키가 바뀌지 않도록 창 시작점을 고정 단위로 내림(round)하는 편이 좋다.

---

## 🟠 F-3 (MEDIUM) — 기본 배치에서 위젯 절반이 카드 내부 스크롤

뷰포트 1512px, 시드 기본 좌표·기본 크기(계약 §4·§5) 상태에서 측정한 `.ant-card-body` 오버플로:

| 위젯 | clientH | scrollH | 넘침 |
|---|---:|---:|---:|
| 배치·동기화 상태 (6×6) | 180 | 416 | **+236** |
| 사용자 (4×5) | 142 | 239 | +97 |
| 데이터소스 연결 (4×5) | 142 | 237 | +95 |
| 최근 리포트 (8×8) | 256 | 317 | +61 |
| 라이선스 (4×5) | 142 | 168 | +26 |
| 인프라 가용성 (6×4) | 104 | 110 | +6 |

첫 진입 화면에서 `라이선스`의 "GPU 모니터링" 태그, `데이터소스 연결`의 Redis·AWS 행, `사용자`의 "현재 접속"이 잘려 스크롤해야 보인다(다크모드 스크린샷 육안 확인). 기본값이 곧 대다수 사용자가 보는 화면이므로 기본 높이 상향(특히 `system_scheduler` 6→10 수준, 시스템 3종 5→7 수준)을 권한다. 계약 §4 주석대로 **렌더 규격 정본은 FE**이나, BE `HomeWidgetDefaults` 시드 좌표와 함께 맞춰야 y가 겹치지 않는다.

---

## 🟡 F-5 (LOW, 기존 BE) — `sortDirection`이 반대로 동작

```
sortDirection=DESC → 2026-07-20T23:51, 2026-07-21T01:08, 2026-07-21T01:08   (오래된 순)
sortDirection=ASC  → 2026-08-18T09:25, 2026-08-18T09:25, 2026-08-18T09:11   (최신 순)
```
`moveseye-be-spring/src/main/java/com/dmove/moveseye/event/EventService.java:779-785`
```java
int direction = sortDirection == SortDirection.ASC ? 1 : -1;
...
return (int) Math.signum((double) (bt - at) * direction);   // bt-at 자체가 이미 내림차순
```
`bt - at`가 이미 내림차순이라 `direction`을 곱하면 의미가 뒤집힌다. 기존 이벤트 화면에도 해당하는 선재 결함이지만, 홈 위젯은 "최신 N건"이 용도라 **F-1을 고쳐도 DESC를 보내는 한 가장 오래된 알람이 뜬다**. F-1과 함께 처리해야 위젯이 의도대로 동작한다.

---

## 부록 — 검증 환경 메모

- BE/FE는 기존 세션이 띄운 프로세스를 그대로 사용했고, 재기동·종료하지 않았다.
- dev DB(5433) `home_widget` 테이블은 검증 종료 시점에 `user_id=110` 12행 / `title` 0건(순수 시드)으로 원복 완료.
- MCP 브라우저 탭은 검증 종료 후 정리.
- `event_sync` 배치는 마지막 실행이 실패(`ApiError: ZABBIX_API_ERROR`, 2026-08-14)로 남아 있으나 `event_problems` 테이블은 당일 갱신되고 있다 — F-1과는 무관(원인은 조회 파라미터).

---

## 재검증 (2026-08-18 18:5x, 수정 후 — 오케스트레이터 직접)

| 결함 | 조치 | 재검증 |
|---|---|---|
| F-1 | `useHome.ts`: 알람 `from=0`~now(분 올림)·`sortDirection=ASC`, 호스트그룹 최근 30일 창 + 위젯 머리에 "최근 30일" 태그 | 알람 5건 최신순(18:54…) · 호스트그룹 5그룹 total 67/2/67/0/3444 ✅ |
| F-2 | `PageHeader`가 `/home`이면 null, `useBreadcrumbs`가 home 세그먼트 제거, HomePage `<Title>` 제거 | 헤더에 "홈" 1회, `h4.ant-typography` 0개 ✅ |
| F-3 | 기본 크기 상향(시스템 4×8·KPI 6×5·목록 6×11·리포트/스케줄러 6×10·맵 6×12·맵요약 12×5 띠), 알람 아이템 2줄, 스케줄러 2열 격자 — FE 상수·BE enum·시드·계약서 동기화 | 12개 전부 `clientH === scrollH`(overflow 0) ✅ |
| F-4 | 시드를 "이미 압축된 배치"(행별 동일 높이·오른쪽 빈칸 없음)로 재설계 | 편집 진입 후 transform 12개 동일, DB `updated_at` 불변 ✅ |
| F-5 | BE 미수정(원본 1:1 보존) — 홈은 ASC 전송으로 우회, 계약서 §8 명시 | 위 F-1 결과로 확인 ✅ |
| QA F1(정적) | `useIsUserRoleAdmin` 신설(userRole ADMIN∪SUPER_ADMIN, BE와 동일 축)로 HomePage 판정 교체 | tsc/jest ✅ (계정 부재로 런타임 SKIP) |
