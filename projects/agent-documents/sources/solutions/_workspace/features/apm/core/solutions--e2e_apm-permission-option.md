# APM 권한 옵션(DMOVE 권한 `applicationMonitoring / apm`) 런타임 QA

- 일시: 2026-09-03 10:38~11:25
- 대상: BE 사본 **`:3001`**(`moveseye-be-spring` HEAD **`4264f57`**, dev 프로필, DB `dmove_apm`@5433 도커) /
  FE Vite **`:5174`**(`moveseyee_fe` HEAD **`8ced9ed`**, 기존 프로세스 pid 45308 유지 — HMR로 새 코드 서빙 확인)
- 계정: `admin`(id 1). USER 판정은 `user.role`·`user.zabbix_role`을 일시 변경 후 **원복**
- 원칙: 판정은 **API 응답 + DB 실측 + DOM 어서션**. 🔴 **스크린샷 0장**(시각 판정이 불가피한 항목이 없었다)
- 🔴 사용자의 **`:3000`은 건드리지 않았다**(QA 종료 시점 살아 있음 확인). **`:5173`은 QA 시작 시점부터 내려가 있었다**(첫 포트 스캔 `000`). **제품 코드 수정 0**(양 레포 `git status --porcelain` 비어 있음)
- 재현 산출물(일회성): `%TEMP%\claude\C--solutions\73f0e76e-…\scratchpad\qa\perm\`
  (`run_be.py`·`q.sh`·`api.sh`·`relogin.sh`·`set_apm.sh`·`seed_roles.sql`·`sweep.py`·`otlp_raw.py`·
  `cdp.mjs`·`uilogin.mjs`·`b1~b18*.mjs`·`sweep_{A,B,C,admin_off}.txt`·`roles_before.txt`)

---

## 0. 요약표

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| **1. V48 백필** | | | |
| 1-1 | 마이그레이션 적용(V47·V48) | **PASS** | 기동 로그 81~83행 `Migrating … "47"` → `"48"` → `Successfully applied 2 migrations … now at version v48` |
| 1-2 | 배열 역할에 모듈 **덧붙이기**(분기 ②) | **PASS** | 9모듈 역할 → 10모듈. **APM 제외 9개가 백필 전과 집합·내용 동일**(JSON 정규화 비교 `True`) |
| 1-3 | 비배열 기본값 `'{}'`(분기 ①) | **PASS** | `jsonb_typeof='object'` 행 → 배열 1모듈로 세워짐. **V27을 복제했으면 여기서 마이그레이션이 실패했을 자리** |
| 1-4 | 빈 배열 `[]` | **PASS** | 분기 ②가 처리 — 1모듈 |
| 1-5 | 모듈만 있고 `apm` 기능 없음(분기 ③) | **PASS** | 기존 기능 `somethingElse` 보존 + `apm` 추가(2기능) |
| 1-6 | 이미 `apm`이 있는 행 | **PASS** | `view:false`가 **덮이지 않았고** 항목이 두 벌이 되지 않았다 |
| 1-7 | 값(모양) | **PASS** | 전 행 `{"name":"apm","view":true,"edit":false,"delete":false,"download":false}` |
| 1-8 | **문장 멱등**(SQL 재실행) | **PASS** | V48 원문 재실행 → `UPDATE 0` ×3, 테이블 md5 불변, `apm` 항목 수 행마다 1 |
| 1-9 | **재기동 멱등** | **PASS** | BE 재기동 → `Schema "public" is up to date. No migration necessary.` · md5 불변 · `flyway_schema_history` V48 **1행** |
| **2. API** | | | |
| 2-1 | `GET /users/role/permission`(템플릿) ×3 타입 | **PASS** | 10모듈, `applicationMonitoring` **index 3**. ADMIN·SUPER_ADMIN `view/edit=true`, USER `view=true·edit=false` |
| 2-2 | `GET /users/role/{id}` | **PASS** | 백필된 역할에 모듈 포함(맨 뒤), 기존 9모듈 그대로 |
| 2-3 | `GET /users/me/permissions`(ADMIN) | **PASS** | 템플릿 반환 — `apm view/edit true` |
| **3. 역할 편집 화면** | | | |
| 3-1 | 라벨·힌트 렌더 | **PASS** | `애플리케이션 모니터링` / `APM (서비스·트레이스·수집기)` / 힌트 `보기=APM 화면 조회, 편집=토큰·수집기 설정…`. **원문 키 `apm`·`applicationMonitoring`·`apm_permission` 노출 0** |
| 3-2 | 체크박스 4칸 | **PASS** | 보기·생성/편집·삭제·다운로드, 초기값 `true/false/false/false` |
| 3-3 | 토글 → 저장 → DB | **PASS** | `생성/편집` 클릭 → `POST /users/role/storage` **200**(실 POST 1건 + OPTIONS 1건, 이중 제출 없음) → DB `edit:true` |
| 3-4 | 재조회 반영 | **PASS** | 화면 재진입 시 `보기=true·생성/편집=true`. 이어서 `보기` 해제 저장 → DB `view:false` |
| **4. USER 흐름 A — `view=false, edit=false`** | | | |
| 4A-1 | 조회 EP 35개 | **PASS** | 전건 **HTTP 200 + `code:403` + `errorCode:"FORBIDDEN"`** |
| 4A-2 | 관리 EP 11개 | **PASS** | 전건 200+403+FORBIDDEN |
| 4A-3 | 🔴 `/apm/live/stream`(SSE) | **PASS** | 200 + `code:403` — **P2 D3 회귀 없음**(401로 새지 않는다) |
| 4A-4 | 거부 문구(한글·2종) | **PASS** | 조회 `APM 화면을 볼 권한이 없습니다.` / 관리 `APM 설정을 변경할 권한이 없습니다.` (UTF-8 바이트 확인) |
| 4A-5 | 사이드바 | **PASS** | `모니터링` 펼친 상태에서 APM 그룹 **없음**(자식 6개도 없음) |
| 4A-6 | 설정 ⚙ | **PASS** | `마이 페이지`·`연결된 앱`만 — 알람 규칙·SLO **없음** |
| 4A-7 | 전역 검색 | **PASS** | `APM`·`트레이스`·`수집기` 전부 **화면 0건**(`APM`은 Zabbix 호스트 `MovesEye APM`만) |
| 4A-8 | URL 직접 진입 | **PASS** | overview·services·traces·errors·service-map **5/5 → `/errors/404`** |
| **5. USER 흐름 B — `view=true, edit=false`** | | | |
| 5B-1 | 조회 EP | **PASS** | 35개 중 **34개 200**. `/apm/alert-events`만 403 — **설계대로**(알람 규칙 화면 소속 = edit 축) |
| 5B-2 | 관리 EP 11개 | **PASS** | 전건 403 (`receive-tokens`·`alert-rules` 포함 — 요구 항목 충족) |
| 5B-3 | `/apm/live/stream` | **PASS** | 200 `event:snapshot` |
| 5B-4 | 사이드바 | **PASS** | APM 그룹 + 자식 6(`APM 개요·서비스·서비스 맵·트레이스 탐색·합성 감시·수집기`), 자물쇠 없음 |
| 5B-5 | 조회 화면 5종 | **PASS** | overview·services·traces·service-map·errors + db-calls·dependencies 렌더(404 없음, 표 행 존재) |
| 5B-6 | 읽기 전용 배너 2종 | **PASS** | `apm-collectors-edit-required` · `apm-alerts-edit-required`, 문구가 **역할 편집 화면 위치를 안내** |
| 5B-7 | 서비스 설정 탭 | **PASS**(관찰) | `apm-settings-readonly` 배너 + 입력 disabled + 삭제 버튼 없음. 🔴 **저장 버튼은 "없음"이 아니라 `disabled`**(§3 관찰 1) |
| 5B-8 | 원문 마스킹 | **PASS** | `keep_raw_sql=true`로 **원문이 실제 저장된 상태**에서 `db.query.text` → `… email = ? AND age > ? AND note = ?` |
| **6. USER 흐름 C — `view=true, edit=true`** | | | |
| 6C-1 | 조회 35 + 관리 11 | **PASS** | **46개 전건 200** |
| 6C-2 | 토큰 목록·알람 규칙 조회 | **PASS** | `/apm/receive-tokens` 200(6건) · `/apm/alert-rules` 200 |
| 6C-3 | 알람 규칙 **생성** | **PASS** | `POST /apm/alert-rules` 200, `ruleUid dccfcce0-…` 생성(`enabled:false`라 Zabbix 객체 0건) |
| 6C-4 | 원문은 여전히 마스킹 | **PASS** | `edit=true`여도 `db.query.text`는 `?` — **원문은 ADMIN 축(`canViewRawText`) 유지** |
| **7. ADMIN 회귀** | | | |
| 7-1 | 역할에서 apm을 **꺼도** 전 EP 통과 | **PASS** | `view:false·edit:false`인 역할을 붙인 ADMIN → **46개 전건 200** |
| 7-2 | `/users/me/permissions` | **PASS** | 저장된 JSON을 읽지 않고 **템플릿**(`view/edit true`)을 준다 |
| 7-3 | 원문 열람 | **PASS** | 같은 조건에서 `db.query.text` = `… email = 'bob@example.com' AND age > 42 …` **원문** |
| 7-4 | 화면 9종 | **PASS** | 개요·서비스·트레이스·서비스맵·에러·DB·외부호출·수집기·알람규칙 전부 렌더, **배너 0** |
| **8. P2 스모크** | | | |
| 8-1 | 트레이스 목록 | **PASS** | 10행 + `apm-trace-sampled-{ERROR,SAMPLED}` 배지 10개 |
| 8-2 | 워터폴 | **PASS** | 행 클릭 → `/traces/{id}`, `data-critical` 4행(크리티컬 4), 탭 `워터폴`·`플레임` |
| 8-3 | 배포 탭 | **PASS** | 활성 탭 `배포`, 목록 **7행**(자동 감지·웹훅 혼재) — **P2 D14(화면 없음) 해소** |
| 8-4 | 콘솔 에러 | **PASS**(선재만) | APM 고유 에러 0. React `key` spread 경고만(P2 QA D-14가 이미 전역 선재로 판정) |
| 8-5 | 🔴 **exemplar `maxMs` ↔ 실제 트레이스 지연**(V47 D17) | **PASS** | 아래 표 — 4쌍 전부 **Δ ≤ 0.11 ms** |

**결함 5건**: MED 1 / LOW-MED 1 / LOW 1 / INFO 2. **관찰 3건.**

### 8-5 상세 — exemplar 라벨이 링크가 열어 줄 트레이스의 값과 같아졌다

`GET /apm/services/9c74ec1c…/exemplars?metric=http.server.request.duration&step=60`(최근 30분) 중 `stored:true` 전건:

| 버킷 | 응답 `maxMs` | `apm_trace_summary.duration_ns` 환산 | Δ | 루트 |
|---|---|---|---|---|
| 11:02 | 7,143.4162 | 7,143.5200 | 0.10 ms | `GET /apm/live/stream` |
| 11:03 | 4,875.5423 | 4,875.5755 | 0.03 ms | `GET /apm/live/stream` |
| 11:05 | 2,064.9909 | 2,065.0262 | 0.04 ms | `GET /home/summary` |
| 11:04 | 13,006.5184 | 13,006.5635 | 0.05 ms | `GET /apm/live/stream` |

- Δ는 **HTTP 서버 메트릭 계측 구간과 루트 스팬 구간의 차이**로 설명되는 크기다(P2 2회차가 잡은 D17은 **800배** 어긋남이었다).
- 화면 칩도 일치: `가장 느렸던 요청의 트레이스` 스트립에 `09-03 11:04 · 13.01 s`가 **링크(`apm-exemplar-link`)** 로 뜨고, 그 링크가 가리키는 트레이스의 실측 지연이 13,006.56 ms다.
- 🔴 **V47 이전 버킷은 `maxMs:null` → 칩이 `—`(`apm-exemplar-not-stored`)** 로 나온다. 실측: 10:11~10:18 버킷 8개 전부 `—`. V47 적용(10:42) 이전 행이라 **설계대로**다(V47 주석 "NULL이 정상이다"). 15분 프리셋으로 좁히면 전부 값이 있다.

---

## 1. 결함 목록

### 🔴 D1 [MED] 조회 권한만 있는 사용자에게 관리 화면이 **"없습니다"라고 사실이 아닌 말을 한다**

- **현상**(`view=true, edit=false` 계정, 화면 전문 실측):
  - `/application-monitoring/alert-rules` → 표가 **"등록된 알람 규칙이 없습니다"**. 실제 DB `apm_alert_rule` **3행**.
  - `/application-monitoring/collectors` → **"데이터가 없습니다"**(수집기 표) · **"이 구간에 표시할 데이터가 없습니다"**(파이프라인) · **"실제 손실 누적 0건"**(폐기 통계) · **"route 상한에 걸린 서비스가 없습니다"**.
    실제 `apm_ingest_drop_stat` 합계는 `NOT_ALLOWLISTED/METRIC 162,747` 등 **총 22만 건 이상**이다.
- **원인**: 쿼리를 **끄기** 때문이다 — `ApmAlertRulesTab.tsx:60` `useApmAlertRules({ enabled: canManage })`(수집기 탭들도 같은 방식). 요청을 보내지 않으니 훅은 **오류 상태가 아니라 "데이터 없음" 상태**가 되고, 표는 평소의 빈 상태 문구를 그대로 그린다.
  - 훅 주석(`useApmAlerts.ts:24`)이 *"부르면 매 렌더 403 응답이 쌓인다. 그래서 `enabled`로 막을 수 있고"* 라고 적어 둔 대로 **의도된 최적화**다. 막는 것 자체는 옳고, **빈 상태 문구만 갈리지 않았다.**
- **완화**: 화면 맨 위에 `apm-*-edit-required` 배너가 있다. 그러나 두 줄이 서로 모순된다 — 배너는 "권한이 없어 못 본다", 표는 "없다". 사용자가 뒤엣것을 믿으면 **"우리 회사는 알람 규칙을 안 쓰는구나"** 로 읽는다. `실제 손실 누적 0건`은 배너와 무관한 **숫자 단언**이라 더 나쁘다.
- **재현**
  ```sql
  -- 역할의 apm을 view=true, edit=false로 두고 그 역할의 USER로 로그인
  select count(*) from apm_alert_rule;                        -- 3
  select reason, signal, sum(count) from apm_ingest_drop_stat group by 1,2;  -- 22만+
  ```
  → `/application-monitoring/alert-rules`, `/application-monitoring/collectors`
- **참고 선택지**(고르지 않는다, 판단 재료만): ① `enabled:false`인 표의 `emptyText`를 "권한이 없어 표시하지 않습니다"로 갈아 끼운다 ② 배너가 있을 때 표·카드 본문을 아예 렌더하지 않는다(탭 껍데기만 남긴다) ③ 배너를 `Alert type="warning"`으로 올려 두 줄의 무게를 다르게 한다.

---

### D2 [LOW-MED] 메뉴는 `view` 축인데 그 화면은 `edit` 축이다 — **항상 벽으로만 이어지는 입구 2개**

- **현상**(`view=true, edit=false`):
  - 사이드바 `모니터링 > 어플리케이션 모니터링` 자식에 **`수집기`** 가 뜬다 → 누르면 `apm-collectors-edit-required` 벽.
  - 설정 ⚙ 에 **`알람 규칙`**(+ `SLO`)이 뜬다 → 누르면 `apm-alerts-edit-required` 벽.
- **의도된 설계임은 코드에 적혀 있다**: `SettingsMenu.tsx:141` *"항목 노출은 `view`이고, 그 화면 안의 쓰기(규칙 CRUD)는 `edit`이 다시 가른다"*.
  다만 실제 두 화면은 **쓰기만 막히는 것이 아니라 조회 EP까지 `edit`** 이라(`GET /apm/alert-rules`·`/apm/receive-tokens`·`/apm/collectors` 전부 403), "화면 안에서 다시 갈린다"는 전제가 이 두 화면에는 성립하지 않는다. `view`만 가진 사람에게 이 입구는 **100% 벽**이다.
- **영향**: 6개짜리 APM 사이드바 중 1개, 설정 ⚙ APM 2개 중 1개가 그 사람에게는 죽은 링크다. D1과 겹치면 "메뉴는 있는데 들어가면 빈 화면 + 권한 안내"가 된다.
- **재현**: 위와 같은 조합으로 로그인 → 사이드바 `모니터링` 펼치기 → `어플리케이션 모니터링` 펼치기 → `수집기`.
- **참고 선택지**: ① 이 두 항목만 `edit` 축으로 가린다(사이드바 `show`, `SETTINGS_ENTRIES.permission` 옆에 축 필드 하나) ② 지금대로 두고 배너를 "이 메뉴는 관리자용입니다"로 더 앞세운다 ③ 관리 화면의 **조회**를 `view`로 내린다(토큰 값은 이미 마스킹돼 나가므로 검토 가능 — 다만 설치 가이드·토큰 라벨이 함께 열린다).

---

### D3 [LOW] 사이드바는 **"어**플리케이션 모니터링", 권한 화면·배너는 **"애**플리케이션 모니터링" — 같은 것을 두 표기로 부른다

- **현상**: 로케일에 두 키가 **다른 값**으로 들어 있다.
  ```
  "application_monitoring": "어플리케이션 모니터링"   ← 사이드바 그룹·전역 검색 브레드크럼
  "applicationMonitoring":  "애플리케이션 모니터링"   ← 역할 편집 화면의 모듈 라벨
  ```
- **왜 문제인가**: 읽기 전용 배너가 사용자에게 **"권한은 역할 편집 화면의 '애플리케이션 모니터링 > APM'에서 켭니다"** 라고 안내한다. 그 문장을 읽고 사이드바를 보면 **"어플리케이션 모니터링"** 이 있다 — 같은 것인지 아닌지 화면만 보고는 알 수 없다.
- 표준 표기는 **"애플리케이션"** 이다(외래어 표기법). 사이드바 쪽이 틀린 표기이며 **이번 변경 이전부터 있던 값**이다(선재).
- **재현**: `grep -n "어플리케이션" src/locales/kr.json` → `1931:  "application_monitoring": "어플리케이션 모니터링"`
- 영향은 문구뿐이라 LOW지만, **이번에 새로 만든 안내 문구가 그것을 가리키게 됐다**는 점에서 지금이 고칠 시점이다.

---

### D4 [INFO] 필수 쿼리 파라미터 누락이 400이 아니라 **HTTP 500**

```
GET /apm/services/{uid}/endpoints/series?from&to&step   (route 누락)
→ HTTP 500  {"status":"error", ... "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."}
BE 로그: MissingServletRequestParameterException: Required request parameter 'route' ... is not present
        → GlobalExceptionHandler "Unhandled exception"
```
- 권한과 무관한 **전역 선재 이슈**(APM 전용도 아니다). APM 조회 EP의 다른 검증 실패는 전부 `200 + code 400 + errorCode`로 잘 나온다 — 이 한 종류만 예외 해석기를 못 만나 500이 된다.
- 발견 경위: 스윕 작성 중 파라미터 이름을 틀렸다(`endpoint` → 실제 `route`). 실사용에서도 FE가 파라미터를 빠뜨리면 같은 500이 난다.

---

### D5 [INFO] 역할 삭제가 **Zabbix 삭제를 트랜잭션 안에서** 해, 커밋이 실패하면 DB에는 남고 Zabbix에서만 사라진다 — 그 뒤로는 제품으로 지울 수 없다

- **실측 경로**(QA 정리 중 우연히 밟았다):
  1. `POST /users/roles/delete` → `UserService.deleteRole`이 **DB 삭제 → `zabbixRoleService.deleteRole`** 순으로 실행.
  2. Zabbix 삭제는 성공. 그런데 커밋 시점에 **낙관적 락 충돌**로 트랜잭션이 롤백 → **DB에 역할 행이 남고 Zabbix에는 없다.**
  3. 이후 같은 삭제 요청은 Zabbix가 `{"code":-32500,…,"data":"No permissions to referred object or it does not exist!"}`를 주고, BE는 그것을 **`401 INVALID_TOKEN`** 으로 내보낸다 → 화면상 "세션이 끊겼다"로 보이고, **그 역할은 제품 UI로 영영 삭제되지 않는다**(DB 직접 삭제로만 정리 가능).
- **부수 1** — 낙관적 락 충돌의 `errorCode`가 **`ASSET_CONFLICT`** 다(역할 삭제인데 자산 코드). `GlobalExceptionHandler:315`가 `ObjectOptimisticLockingFailureException`을 그 코드 하나로 접는다.
- **부수 2** — Zabbix의 "객체 없음"이 **401**로 둔갑한다. 세션 문제와 대상 없음이 같은 응답이 되면 FE 인터셉터가 리프레시·로그아웃 경로로 간다.
- **정직한 한계**: 이번 낙관적 락 충돌은 **QA가 `role` 행을 SQL로 직접 고쳐서** 유발했다(엔티티 버전과 어긋남). 하지만 "Zabbix 호출이 커밋보다 앞선다"는 순서 자체는 코드에 그대로 있으므로, **커밋이 실패하는 어떤 이유에서든** 같은 드리프트가 난다.
- 이번 QA 주제(APM 권한) **밖**이라 기록만 남긴다.

---

## 2. 관찰(결함 아님)

1. **서비스 설정 탭의 저장 버튼은 "없어지는" 것이 아니라 `disabled`다.** 요구 문구는 "저장 버튼 없음"이었으나 실제는 `<Form disabled={!canEdit}>` 안의 `data-testid="apm-settings-save"`가 **남아 있고 비활성**이다. 입력도 전부 disabled, 삭제 버튼은 **정말로 없다**(`canDelete = canEdit && isHidden`). 효력은 같고, "버튼이 사라져 무엇을 잃었는지 모르는" 것보다 낫다고 볼 수도 있어 결함으로 세지 않았다 — **기대와 다른 구현**이라는 사실만 남긴다.
2. **`GET /apm/alert-events`는 조회 EP가 아니라 관리 EP다.** 스윕에서 유일하게 `view=true`에 403이 났다. 확인해 보니 컨트롤러가 `requireEdit`이고(`ApmAlertRuleController.java:310`), FE도 이 EP를 **알람 규칙 화면의 `발화 이력` 탭에서만** 부른다(`grep` 결과 소비처 1곳). **BE·FE 축이 일치**하므로 정상이다.
3. **모듈 순서가 템플릿과 백필된 행에서 다르다.** 코드 템플릿(`DmovePermissions.of`)은 `cloudInfraMonitoring` **다음**(index 3), V48 백필은 **맨 뒤**(index 9)에 넣는다. V48 주석이 *"순서는 화면의 아코디언 나열 순서일 뿐 판정에 쓰이지 않는다"* 라고 밝혀 둔 대로 기능 영향은 없다. 다만 **같은 설치본 안에서 역할마다 아코디언 위치가 달라 보인다**(새로 만든 역할은 중간, 기존 역할은 맨 아래).
4. **V48 ①번 분기의 `dmove_permission IS NULL` 조건은 도달 불가다.** `role.dmove_permission`은 `NOT NULL DEFAULT '{}'`라 NULL 행을 넣으려 하면 제약 위반으로 거절된다(실측). 방어로서는 무해하다.

---

## 3. 상세 — 1. V48 백필

**마이그레이션 전에 5가지 모양을 심어 두고** BE를 기동했다(`seed_roles.sql`). 이 QA DB의 `role` 테이블은 원래 **0행**이라, 심지 않으면 백필이 아무 일도 하지 않아 검증이 성립하지 않는다.

| id | 이름 | 심은 모양 | V48 후 | 판정 |
|---|---|---|---|---|
| 1 | `QA-normal` | 배열 9모듈(APM 없음) | **10모듈**, 맨 뒤 `applicationMonitoring` | 분기 ② ✅ |
| 2 | `QA-default-obj` | `'{}'`(컬럼 기본값, `jsonb_typeof='object'`) | 배열 1모듈 | 분기 ① ✅ |
| 3 | `QA-empty-array` | `[]` | 배열 1모듈 | 분기 ② ✅ |
| 4 | `QA-module-no-feature` | `applicationMonitoring` 모듈만(기능 `somethingElse`) | 기능 2개(`somethingElse` 보존 + `apm`) | 분기 ③ ✅ |
| 5 | `QA-already` | `apm view:false` 이미 있음 | **그대로**(값·개수 불변) | 멱등 ✅ |

- **기존 권한 보존 확인**: id 1의 백필 전 9모듈과 백필 후 `applicationMonitoring` 제외분을 JSON 정규화 비교 → **동일**.
- **멱등 2단**
  ```bash
  # ① 문장 멱등 — V48 원문을 그대로 재실행
  docker exec -i -e PGPASSWORD=qwe123 dmove-postgres-test psql -U postgres -d dmove_apm \
    < moveseye-be-spring/src/main/resources/db/migration/V48__add_application_monitoring_permission.sql
  #   UPDATE 0 / UPDATE 0 / UPDATE 0,  md5(role) 불변
  # ② 재기동 멱등 — BE 재기동
  #   "Current version of schema \"public\": 48"
  #   "Schema \"public\" is up to date. No migration necessary."
  #   md5(role) 불변, flyway_schema_history where version='48' → 1행
  ```

---

## 4. 상세 — 4·5·6. 권한 조합별 스윕 (46 EP)

조회 35개(개요·서비스 14·배포 3·트레이스 5·맵 1·에러 3·DB 4·의존 2·Live 2·서비스별 알람 1) +
관리 11개(토큰·알람 규칙·Zabbix 상태·설정·수집기 2·설치 가이드·등록 2·수신 상태 2).
매 조합은 **역할 JSON만 바꾸고 재로그인**해 잰다(`set_apm.sh` → `relogin.sh` → `sweep.py`).

| 조합 | 계정 | 조회 35 | 관리 11 |
|---|---|---|---|
| A | USER · `view:false edit:false` | **35 × 200+403 FORBIDDEN** | **11 × 200+403 FORBIDDEN** |
| B | USER · `view:true edit:false` | **34 × 200** + `alert-events` 403(설계대로) | **11 × 200+403** |
| C | USER · `view:true edit:true` | **35 × 200** | **11 × 200** |
| 회귀 | **ADMIN** · 역할은 `view:false edit:false` | **35 × 200** | **11 × 200** |

- 조합 A의 거부 바디(실 바이트 확인, UTF-8):
  ```json
  {"status":"error","code":403,"errorCode":"FORBIDDEN","message":"APM 화면을 볼 권한이 없습니다."}
  {"status":"error","code":403,"errorCode":"FORBIDDEN","message":"APM 설정을 변경할 권한이 없습니다."}
  ```
  🔴 **`/apm/live/stream`(SSE)도 같은 모양**이다 — P2 D3(401 INVALID_TOKEN + `AccessDeniedException` 스택 오염)이 재발하지 않았다.
- **재현**
  ```bash
  cd scratchpad/qa/perm
  bash set_apm.sh 7 false false     # 역할 7의 apm 칸을 바꾼다
  bash relogin.sh && python sweep.py cookies.txt qa-e2e
  ```

### 원문 마스킹 — 축이 갈려 있는지 실증

`keep_raw_sql`을 **켜고**(그래야 DB에 원문이 들어간다) 원문 SQL·예외를 실은 트레이스 `e1e1…`를 직접 주입한 뒤 같은 트레이스를 세 조건으로 열었다.

| 조건 | `db.query.text` |
|---|---|
| USER · `view=true, edit=false` | `SELECT id, name FROM users WHERE email = ? AND age > ? AND note = ?` |
| USER · `view=true, **edit=true**` | 위와 **동일**(마스킹) |
| **ADMIN**(역할의 apm은 꺼 둔 채) | `SELECT id, name FROM users WHERE email = 'bob@example.com' AND age > 42 AND note = 'don''t'` |

→ **`edit`은 원문을 열지 않는다**. 원문은 `ApmAccessChecker.canViewRawText`(역할 축)만 연다 — 설계 의도대로다.
⚠️ 같은 응답의 `exception.message`(`no row for email = 'bob@example.com' id 42`)는 **세 조건 모두 원문**이다. SQL 키워드 쌍이 없어 마스커가 잡지 않는다 — **P2 D12로 이미 결정된 스펙**(`features/apm/core/contract_apm.md` §7.9 "마스킹의 한계")이고 이번 변경과 무관하다.
설정은 QA 종료 시 `keep_raw_sql=false`로 **원복 확인**, 주입 트레이스도 삭제했다.

---

## 5. 상세 — 3. 역할 편집 화면

- 화면 하단 실제 렌더 텍스트:
  ```
  … 사용자 관리 … 사용자 | 보기 | 생성/편집 | 삭제 | 다운로드
  애플리케이션 모니터링
  APM (서비스·트레이스·수집기)
  보기=APM 화면 조회, 편집=토큰·수집기 설정·알람 규칙·서비스 편집(원문 SQL/스택 열람은 관리자만)
  보기 | 생성/편집 | 삭제 | 다운로드
  ```
  힌트 줄은 `data-testid="dmove-permission-hint-apm"`으로 **`apm`에만** 붙는다(다른 기능엔 없음 — 설계대로).
- 🔴 **`t("apm")` 충돌 회피가 실제로 동작한다**: 화면 어디에도 `apm`·`applicationMonitoring`·`apm_permission` 원문 키가 노출되지 않았다(전문 문자열 검사). `permissionLabels.ts` 예외표가 있어야 하는 이유가 실물로 확인된다.
- ⚠️ **APM과 무관한 선재 장애물 1건**: 이 화면의 저장은 `zabbixPermission.ui`에 `status:"1"`이 하나라도 있어야 통과한다(`UserRoleUtility.tsx:103` `if (!isValidUIaccess) return setIsNoUIChecked(true)`). 조건이 안 맞으면 **아무 요청도 나가지 않고 토스트도 없이** Zabbix 탭에 점 배지만 붙는다. QA는 역할의 `zabbix_permission`을 채워 넘어갔다. (이 QA DB는 `permission_schema` 테이블이 비어 있어 `GET /users/role/permission?platform=ZABBIX`가 `PERMISSION_NOT_FOUND`를 준다 — dev DB 사정이지 제품 결함은 아니다.)
- ⚠️ 화면에 `hostGroupUR`가 **번역되지 않은 원문 키**로 뜬다(사용자 관리 모듈). 선재이고 이번 범위 밖.

---

## 6. 검증하지 못한 것

| 항목 | 이유 |
|---|---|
| **SUPER_ADMIN 계정**의 실제 거동 | 이 DB에 계정이 없다(설치본에 0명인 사례가 있다는 기록도 있다). 템플릿 응답(`type=SUPER_ADMIN`)만 확인 |
| `delete`·`download` 체크박스를 켰을 때 | 대응 EP가 **없다**(설계대로). 켜도 아무 EP도 보지 않으므로 관측할 거동이 없다 |
| 모바일 사이드바(`MobileSideNav`) | 헤드리스 창 1600×1000 고정, 요구 항목에 없음. 코드상 같은 `useApmPermissions`를 쓴다 |
| 라이선스 만료·미보유 상태 × 권한 조합 | 이번 라이선스는 PREMIUM 유효. 라이선스 게이트는 권한 **뒤**가 아니라 별도 축(`FeatureGate`)이라 조합 폭발 |
| 여러 역할·여러 사용자 동시 | 계정이 `admin` 1개뿐인 DB |
| V27(`cloudInfraMonitoring/awsResources`)의 같은 잠재 결함 | HEAD 커밋 메시지가 **"별건"** 으로 명시했고, 이번 주제 밖 |
| `POST /users/role/storage`로 **새 역할 생성** 시 APM 칸 | 생성 자체는 했으나(role 7), 화면 폼이 아니라 API 페이로드로 했다. **편집→저장 왕복은 화면으로** 검증했다 |

---

## 7. 환경 정리 상태

**QA가 이번 회차에 띄운 것 — 정리 완료**
- 헤드리스 Chrome(CDP 9224, 프로필 `qa/perm/chromeprofile`) → 종료 확인(`9224 = 000`)
- 스윕·OTLP 주입 스크립트 → 일회성, 잔여 프로세스 없음

**유지(다음 회차가 그대로 쓴다)**

| 대상 | 상태 | 이번 회차 변경 |
|---|---|---|
| BE `:3001` (pid **26508**) | 200 | 🔴 **새 jar `4264f57`**(`qa/perm/be.jar`, `bootJar -x test`). `dmove_apm`에 **V47·V48 적용 확인**. 로그 `qa/perm/be3001.log` |
| FE `:5174` (pid 45308) | `/sign-in` 200 | **변경 없음**(재기동하지 않았다 — HMR로 `8ced9ed` 코드 서빙 확인) |
| Collector · `qa-node` · `qa-python` | — | 건드리지 않음 |
| **사용자 BE `:3000`** | 살아 있음 | **건드리지 않음** |
| **사용자 FE `:5173`** | `000` | **건드리지 않음** — QA **시작 시점부터** 내려가 있었다 |

**원복 확인 (전건 실측)**

| 항목 | 원래 | 지금 |
|---|---|---|
| `role` 테이블 | 0행 | **0행** ✅ (QA가 심은 5행 + 생성한 1행 전부 제거) |
| Zabbix 역할 | 6개(`Dmove_Guest`까지) | **6개** ✅ (`QA-APM-PERM` roleid 6 제거 확인, `role.get` 실측) |
| `user` id 1 | `admin / ADMIN / zabbix_role NULL` | **동일** ✅ |
| `apm_setting` | `mask_sql=true, keep_raw_sql=false` | **동일** ✅ |
| `apm_alert_rule` | 2행 | **2행** ✅ (생성한 `dccfcce0…` 삭제 확인) |
| 주입 트레이스 `e1e1…` | 없음 | **없음** ✅ (`apm_span` 3행·`apm_trace_summary` 1행 삭제) |
| `moveseye-be-spring` 작업 트리 | clean | **clean** ✅ (`4264f57`) |
| `moveseyee_fe` 작업 트리 | clean | **clean** ✅ (`8ced9ed`) |
| 제품 코드 수정 | — | **0** ✅ |

⚠️ **정리하지 않은 것**: `dmove_apm`의 `flyway_schema_history`에 V47·V48이 적용된 상태로 남는다(되돌릴 성질이 아니다).
