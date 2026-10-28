# QA — 홈 위젯 대시보드 (home-widgets) · 정적 경계면 대조

> 일시: 2026-08-18 · 검증자: `integration-qa` · 방식: **정적 대조만**(BE 미기동, 런타임 검증 없음)
> 기준: `_workspace/contract_home-widgets.md` v1 · BE `moveseye-be-spring/.../home/**` · FE `moveseyee_fe/src/**`
> 보조 검증: `npx tsc --noEmit` **에러 0** · `npx jest homeWidgetRegistry|homeWidgetApi` **12 passed**

## 판정 요약

| 구분 | 건수 |
|---|---:|
| PASS | 7개 영역 전부 |
| HIGH | **0** |
| MEDIUM | **1** (F1 — 관리자 판정 축 불일치) |
| LOW | 3 (F2·F3·F4) |
| INFO | 4 (F5~F8) |

**계약 위반(필드명/타입/경로/래퍼 깊이/에러코드)은 0건이다.** 유일한 실사용 영향 항목은 F1(관리자 판정 축)이며,
BE가 최종 방어선이라 데이터 무결성 문제는 아니고 "카탈로그 사전 차단" 전제가 일부 계정에서 깨지는 UX 결함이다.

---

## 1. EP 경로·메서드·요청/응답 ↔ FE (PASS)

| # | 계약 | BE (`HomeController.java`) | FE (`services/home.api.ts`) | 판정 |
|---|---|---|---|---|
| 1 | `GET /home/widgets` | L60-63 `@GetMapping("/widgets")` (클래스 `@RequestMapping("/home")`) | L66 `API.get("/home/widgets")` | PASS |
| 2 | `POST /home/widgets` | L69-74 | L69-72 `API.post(widgetsUrl, body)` | PASS |
| 3 | `PATCH /home/widgets/layout` | L78-84, `{layouts:[...]}` | L85-90 `{ layouts }` 래핑 | PASS |
| 4 | `PATCH /home/widgets/{widgetId}` | L89-96 | L75-82 | PASS |
| 5 | `DELETE /home/widgets/{widgetId}` | L100-106 | L93-96 | PASS |
| 6 | `POST /home/widgets/reset` | L110-113 | L99-102 | PASS |
| 7 | `GET /home/system-status` | L119-122 | L61-63 | PASS |

### 응답 DTO 필드 대조 — `HomeWidgetDto` ↔ `THomeWidget`

| 필드 | BE (`HomeWidgetDtos.java:16-30`) | FE (`types/home.ts:91-103`) | 판정 |
|---|---|---|---|
| `id` | `Integer` | `number` | PASS |
| `widgetType` | `String` (snake_case) | `THomeWidgetType` 유니언 14값 | PASS |
| `title` | `String` nullable | `string \| null` | PASS |
| `config` | `Map<String,Object>` (빈 값 `{}`) | `THomeWidgetConfig` | PASS |
| `posX`/`posY`/`width`/`height` | `int` | `number` | PASS |
| `pinned` | `boolean`(필드명 `pinned`, `is` 접두 아님 → JSON 키 `pinned`) | `boolean` | PASS — Lombok `isXxx` 함정 해당 없음 |

### 요청 DTO 대조

| 요청 | BE | FE | 판정 |
|---|---|---|---|
| `CreateHomeWidgetReqDto` | `widgetType`(필수) + `title/config/posX/posY/width/height` 전부 nullable, **`pinned` 없음** | `TCreateHomeWidget`(types/home.ts:105-113) 동일, `pinned` 미포함 | PASS |
| `UpdateHomeWidgetReqDto` | `title`·`config` nullable(=변경 없음), `title:""`→null | `TUpdateHomeWidget`, `HomePage.tsx:64-72`가 trim 후 `""` 그대로 전송 | PASS |
| `UpdateHomeLayoutReqDto` | `layouts:[{id,x,y,w,h}]` | `HomeWidgetGrid.tsx:66-76`이 RGL `i`(string)→`Number(item.i)` 변환 | PASS (계약 §8-3 준수) |

### 래퍼 깊이 (PASS)

- 조회: axios 인터셉터(`axiosInstance.ts:111` body 반환) + `useDmoveQuery`(`useDmoveQuery.ts:52-57` `.data` 추출) = 2겹.
  소비처 전부 payload 직접 수신 — `pages/home/**`·`hooks/useHome*`에서 `data.data` 패턴 **0건**(grep 확인).
- 변경성: `home.api.ts:43-54 unwrapEnvelope`가 1겹 언랩 + 실패 envelope을 `HomeApiError`로 throw. 계약 §8-1 준수.

---

## 2. `HomeWidgetType` 14종 ↔ FE 상수 ↔ 렌더러 ↔ i18n (PASS, 14/14)

| # | code | BE pinned/unique/adminOnly, w×h (`HomeWidgetType.java:34-64`) | FE meta (`constants/homeWidgets.ts:70-110`) | registry | i18n(en/kr) | 판정 |
|---|---|---|---|:---:|:---:|:---:|
| 1 | `system_license` | T/T/F, 4×5 | T/T/F, 4×5 | ✅ | ✅/✅ | PASS |
| 2 | `system_users` | T/T/F, 4×5 | 동일 | ✅ | ✅/✅ | PASS |
| 3 | `system_datasources` | T/T/F, 4×5 | 동일 | ✅ | ✅/✅ | PASS |
| 4 | `system_scheduler` | F/T/**T**, 6×6 | 동일 | ✅ | ✅/✅ | PASS (pinned 아님 → 삭제 버튼 노출, 계약 §4 의도대로) |
| 5 | `alarm_kpi` | F/T/F, 6×4 | 동일 | ✅ | ✅/✅ | PASS |
| 6 | `infra_kpi` | F/T/F, 6×4 | 동일 | ✅ | ✅/✅ | PASS |
| 7 | `alarm_list` | F/**F**/F, 6×8 | 동일 | ✅ | ✅/✅ | PASS |
| 8 | `alarm_severity_pie` | F/**F**/F, 4×8 | 동일 | ✅ | ✅/✅ | PASS |
| 9 | `hostgroup_status` | F/**F**/F, 6×8 | 동일 | ✅ | ✅/✅ | PASS |
| 10 | `asset_kpi` | F/T/F, 4×4 | 동일 | ✅ | ✅/✅ | PASS |
| 11 | `map_summary` | F/T/F, 4×5 | 동일 | ✅ | ✅/✅ | PASS |
| 12 | `main_network_map` | F/T/F, 6×11 | 동일 (+minH 6) | ✅ | ✅/✅ | PASS |
| 13 | `main_geo_map` | F/T/F, 6×11 | 동일 (+minH 6) | ✅ | ✅/✅ | PASS |
| 14 | `recent_reports` | F/T/**T**, 6×8 | 동일 | ✅ | ✅/✅ | PASS |

- `HOME_WIDGET_TYPES`(14) = `HOME_WIDGET_META` 키(14) = `HOME_WIDGET_COMPONENTS` 키(14) — `homeWidgetRegistry.test.tsx`가 강제, **통과**.
- i18n `home.widget.catalog.{type}.{title,description}` 28키 × 2언어 **전부 존재**, 누락 0.
- 미지 타입 방어: BE `HomeWidgetType.fromCode`는 Optional(예외 없음), FE `HomeWidgetGrid.tsx:113-117`이 `Result` 안내 카드로 대체. PASS.

---

## 3. 기본 세트 시드 좌표 ↔ FE 렌더 규격 (PASS)

- **겹침 검사**(12컬럼): 비관리자 10개 · 관리자 12개 모두 **겹침 0**. 검증 포인트: 관리자 세트에서
  `map_summary`(x0-3,y17-21) ↔ `recent_reports`(x4-11,y17-24) x축 분리, `recent_reports` 하단 y=25 = `system_scheduler` 시작 y, 그 하단 y=31 = 맵 2종 시작 y — 접점 정확.
- **FE 최소 크기 호환**: 시드 w는 전부 ≥4, FE `minWidth` 기본 3 / 맵 2종 `minHeight` 6 vs 시드 h=11 → **전 항목 minW·minH 충족**. RGL이 로드 직후 크기를 강제 축소·확대할 여지 없음.
- BE `defaultWidth/Height`(폴백) ↔ FE `defaultWidth/Height`(전송값) **14종 전부 동일** → 위젯 추가 시 서버 폴백이 개입해도 크기가 달라지지 않는다.
- 관리자 세트의 `recent_reports`만 8×8(카탈로그 기본 6×8과 다름) — 시드 전용 배치라 계약 §5와 일치, 문제 없음.

---

## 4. 에러코드 6종 ↔ FE 처리 (PASS)

| errorCode | BE 발생 지점 / HTTP body code | FE 처리 | 판정 |
|---|---|---|---|
| `WIDGET_TYPE_INVALID` | `HomeWidgetService.java:68`, `ApiError(ErrorCode)` → **400** | `HomeApiError` throw → `HomePage.tsx:127` 토스트 | PASS |
| `WIDGET_DUPLICATE` | L75, 400 | 사전 차단: `AddHomeWidgetModal.tsx:58-59` unique+보유 시 disabled + "이미 추가됨" 태그 | PASS |
| `WIDGET_ADMIN_ONLY` | L71, 400 | 사전 차단: 카탈로그 필터 `AddHomeWidgetModal.tsx:50` — 단 판정 축 이슈 **F1** 참조 | PASS(코드) / F1(판정축) |
| `WIDGET_PINNED` | L134, 400 | 사전 차단: `HomeWidgetShell.tsx:101` `!widget.pinned`일 때만 삭제 버튼 + 실패 시 `home.widget.delete_failed` 토스트 | PASS |
| `WIDGET_NOT_FOUND` | L191, `HttpStatus.NOT_FOUND` → **404** | `useHomeWidgets.ts:41,47` `onError: invalidate`(목록 재조회) | PASS (계약 §7 준수) |
| `USER_NOT_FOUND` | L214, 404 | 일반 실패 토스트 | PASS |
| — | 403 없음(관리자 판정은 생략/전용코드로 갈림) | FE도 403 분기 없음 | PASS |

- 200+body code 오인 방지: `unwrapEnvelope`(`home.api.ts:43-54`)가 `status==="ERROR"` 또는 `code!==200`을 throw. 조회 경로는 `isFailureEnvelope`가 동일 역할. **성공으로 오인하는 경로 없음.**
- 인증 헤더: `/home/**` 전체가 `@VisitorIdCheck` — FE는 공용 `axiosInstance`가 `x-visitor-id`/쿠키를 실으므로 별도 처리 불필요(다른 전 화면과 동일 경로). PASS.

---

## 5. `HomeSystemStatusDto` ↔ `THomeSystemStatus` (PASS)

| 필드 | BE (`HomeSystemStatusDto.java`) | FE (`types/home.ts:128-199`) | 판정 |
|---|---|---|---|
| `users` | `UsersStatus \| null`, `total/active/inactive/admins`=`long`, `online`=`Long` nullable | `THomeUsersStatus \| null`, `online: number \| null` | PASS |
| `dataSources[]` | `id/type/displayName/status/detail?/latencyMs?/checkedAt/endpoint?` | 동일 8필드 | PASS |
| `infrastructure[]` | `key/status/latencyMs?/detail?`, 항상 `database→redis→aws` 순(L193) | 동일 4필드, `SystemDataSourcesWidget.tsx:44`가 key별 i18n(3키 존재) | PASS |
| `schedulers` | `List<SchedulerStatus> \| null`(관리자만, L88-89) | `THomeSchedulerStatus[] \| null` | PASS |
| `schedulers[].lastRun` | `{status,startedAt,durationMs,message}` (`finishedAt` 없음) | `THomeSchedulerRun` 동일 4필드 | PASS — 계약 R3 확인 요청 대상, 필드 일치 확인 |
| `checkedAt` | `LocalDateTime` + `@JsonFormat` | `string` | PASS |
| `ConnectionStatus` | `UP \| DOWN \| CONFIGURED \| NOT_CONFIGURED` | `THomeStatusLevel` 동일 4값 | PASS |

- `status` 문자열 값: BE `"success"|"failed"`(`SchedulerRunLog.java:25-26`) ↔ FE `"success" | "failed"` **일치**.
- `jobKey` 7종(`asset_sync/event_sync/user_sync/report_weekly/report_monthly/event_cleanup/report_cleanup`) ↔ FE `SCHEDULER_JOB_CATALOG` **7종 전부 일치**(미지 키는 원값 폴백).
- **null 분기 구현 확인**: `schedulers === null|undefined` → "관리자 전용" 안내 / `[]` → "데이터 없음"(`SystemSchedulerWidget.tsx:37-42`). `online === null` → "-" + 세션 저장소 장애 툴팁, `0`과 구분(`SystemUsersWidget.tsx:44-52`). **계약 §8-7·§8-8 준수.**
- **`CONFIGURED` 별도 배지**: `StatusLevelTag.tsx:18-25`가 UP=good / DOWN=critical / CONFIGURED=**warning** / NOT_CONFIGURED=unknown으로 분리하고 라벨을 항상 병기. **계약 §6 🔴 준수.**
- `detail`은 `<Text>` 텍스트 노드로만 출력(링크·HTML 해석 없음). PASS.
- 폴링 30초: `HOME_SYSTEM_STATUS_INTERVAL = 30000`(`constants/home.ts:7`), 시스템 위젯 3~4개가 단일 쿼리키 공유(`HOME_QUERY_KEY.SYSTEM_STATUS`). PASS.

---

## 6. config 스키마 ↔ 설정 모달 · 쿼리키 (PASS)

| type | 계약 config | FE `configFields` | 쿼리키 포함 여부 | 판정 |
|---|---|---|---|---|
| `alarm_list` | `{limit?:5\|10\|20, minSeverity?:"0".."5"}` | `["limit","minSeverity"]` | `useHome.ts:40-48` params(=limit 포함)를 쿼리키에 넣음 → **위젯 2개가 서로 캐시 안 덮음** | PASS (계약 §4 ⚠️ 준수) |
| `hostgroup_status` | `{limit?}` | `["limit"]` | `useHome.ts:60-67` 동일 | PASS |
| `recent_reports` | `{limit?:5}` | `[]` (의도적 제외, 계약 R2) | — | PASS(합의된 이탈) |
| 그 외 11종 | `{}` | `[]` | — | PASS |

- **교체 시맨틱 준수**: `WidgetConfigModal.tsx:65-72`가 새 객체를 만들어 `configFields` 항목만 채워 통째로 전송(머지 아님) → BE `HomeWidget.update`의 통째 교체와 일치. `minSeverity` 미선택 시 키 자체를 뺀다. PASS (계약 §8-2).
- `limit` 선택지 `[5,10,20]`(`homeWidgets.ts:140`) = 계약 §4 값. `minSeverity` 6값 = `THomeSeverityCode`.
- BE 미검증(A2) 방어: 소비처가 `widget.config?.limit ?? 5`로 항상 폴백(`AlarmListWidget.tsx:28`, `HostGroupStatusWidget.tsx:29`). PASS.

---

## 7. i18n JSON 유효성 · 루트 키 충돌 (PASS)

| 항목 | 결과 |
|---|---|
| `en.json`/`kr.json` JSON 파싱 | **정상**(파싱 에러 0) |
| 루트 키 중복 | **0건** — `"home"` 루트 키는 각 파일에 정확히 1회(en.json:3125, kr.json:3114) |
| `home.widget.*` 키 수 | en **75** / kr **75** — 한쪽만 있는 키 **0** |
| `home.*` 전체 | EN-only 0 · KR-only 0 |
| 코드에서 쓰는 정적 `t("...")` 키 | 홈 관련 전건 존재(누락 0). 동적 키 12곳도 실제 값 도메인 전수 확인 — `home.widget.status.{up,down,configured,not_configured}` · `home.widget.infrastructure.{database,redis,aws}` · `home.widget.users.{total,active,inactive,admins,online}` · `home.widget.scheduler.last_{success,failed}` · `home.widget.group.*` · `alert_severity.*` · `license_settings.state.*` · `home.report.period_type.{WEEK,MONTH}` **전부 존재** |

> 참고(이 기능과 무관, 선재): 루트 키가 en 854 / kr 843으로 EN-only 11개(`bps_io`, `performance`, `unit_bps` 등)가 있다. 홈 위젯과 무관한 기존 drift다.

---

## 발견 사항 (수정 주체 지정 대기 — 이 QA는 코드 수정하지 않음)

| # | 심각도 | 항목 | 기대(BE/계약) | 실제(FE) | 출처 | 수정 제안 |
|---|:---:|---|---|---|---|---|
| **F1** | **MEDIUM** | 관리자 판정 축 불일치 | 계약 §4: 판정 축은 **`userRole` ∈ {ADMIN, SUPER_ADMIN}**. BE `AdminAccessChecker.isAdmin`이 그대로 구현 | `useIsSuperRole` = `userRole === EUserRole.ADMIN \|\| role?.type === EZabbixType.SUPER_ADMIN`. **`EUserRole`에 `SUPER_ADMIN`이 없다** | FE `hooks/useIsSuperRole.ts:12`, `enums/common.ts:154-157` / BE `auth/security/AdminAccessChecker.java:46-47` | 홈 위젯 전용 판정(`userRole === "ADMIN" \|\| userRole === "SUPER_ADMIN"`)을 별도 헬퍼로 두고 `HomePage.tsx:33`에서 사용. `useIsSuperRole`은 SideNav·routes 전역 규칙이라 **전역 변경은 회귀 위험** |
| | | ↳ 증상 (a) | userRole=`SUPER_ADMIN` + Zabbix role type≠Super admin(또는 zabbix 미연동) → BE=관리자 | FE=비관리자 → 추가 모달에 `system_scheduler`·`recent_reports` **미노출**. 화면엔 시드로 떠 있는데 지우면 다시 못 넣는다 | | |
| | | ↳ 증상 (b) | userRole=`USER` + Zabbix role type=Super admin → BE=비관리자 | FE=관리자 → 카탈로그에 adminOnly 노출 → POST가 `WIDGET_ADMIN_ONLY`(400)로 거부, "추가 실패" 토스트. 계약 §7의 "사전 차단" 전제가 깨짐(데이터 무결성은 BE가 방어) | | |
| **F2** | LOW | 주석의 상태코드 오기 | `WIDGET_ADMIN_ONLY`는 HTTP **200 + body code 400**. 이 기능에 403은 없다(계약 §7) | 주석 "비관리자가 골라도 BE가 **403**으로 거부한다" | FE `pages/home/widgets/AddHomeWidgetModal.tsx:29` | 주석만 `400 WIDGET_ADMIN_ONLY`로 정정(`HomeWidgetShell.tsx:100`은 400으로 올바르게 적혀 있음) |
| **F3** | LOW | API 함수 반환 타입 표기 불일치 | 인터셉터 통과 값은 envelope(`TResponse<T>`) | `getWidgets(): Promise<THomeWidget[]>`로 선언 — 같은 파일 `getSummary`/`getSystemStatus`는 `TResponse<T>`. `useDmoveQuery` 경유라 런타임은 정상이나, 훅 밖에서 직접 부르면 envelope이 payload 타입으로 보인다 | FE `services/home.api.ts:66` | `Promise<TResponse<THomeWidget[]>>`로 통일(런타임 영향 없음) |
| **F4** | LOW | 계약서 ↔ BE 미세 drift | 계약 §6 표: `aws`는 `CONFIGURED \| NOT_CONFIGURED` | BE `checkAws()` 예외 경로가 `DOWN`을 낼 수 있다 | BE `home/HomeSystemStatusService.java:241` | 계약서 §6 표에 aws의 `DOWN`(설정 조회 실패) 추가. FE는 이미 DOWN을 그리므로 코드 수정 불필요 |
| F5 | INFO | `checkedAt` 이론상 null | 계약 §6: `checkedAt` non-null | BE `toLocalDateTime(null)` 경로 존재(L283) / FE 타입은 `string`이나 사용처가 `row.checkedAt ? ...`로 방어 | BE L160·L283, FE `SystemDataSourcesWidget.tsx:80` | 실해 없음. 조치 불필요 |
| F6 | INFO | 시각 표기 관례 | `LocalDateTime` + `@JsonFormat(...'Z')` = 서버 로컬시각을 UTC로 표기 | FE가 `dayjs(value).format(...)`로 파싱 → 로컬 변환이 한 번 더 걸린다 | FE `SystemSchedulerWidget.tsx:77`, `SystemDataSourcesWidget.tsx:81` | **기존 `/settings/schedulers` 화면(`SchedulerManagement.tsx:129`)과 동일 관례** — 이 기능이 만든 문제 아님. 런타임 QA에서 `nextRunAt`·`checkedAt` 표시 시각만 육안 확인 권장 |
| F7 | INFO | `recent_reports.config.limit` | 계약 §4에 스키마 존재 | FE `configFields=[]`로 UI 미노출(계약 R2 합의). `RecentReportsWidget.tsx:24`는 값을 읽되 항상 기본 5 | — | 합의된 이탈. 조치 불필요 |
| F8 | INFO | 추가/초기화 후 중복 갱신 | — | mutation `onSuccess: invalidate` + 호출부 `await refetch()` 중복 | FE `HomePage.tsx:125,133` | react-query 중복 제거로 실요청 1회. 시드 경합(A1)과 무관(위젯 존재 상태). 정리하면 코드가 단순해지는 정도 |

---

## 계약서 §8 FE 주의사항 준수 확인

| # | 항목 | 결과 |
|:--:|---|:--:|
| 1 | 언랩 2겹 / `data.data` 금지 | ✅ |
| 2 | config 교체(머지 아님) | ✅ |
| 3 | 레이아웃 `id`는 number(`Number(i)`) | ✅ |
| 4 | POST 응답으로 캐시 갱신 | ✅ (invalidate 방식, 임의 id 생성 없음) |
| 5 | pinned 위젯 삭제 버튼 숨김 | ✅ |
| 6 | system-status 폴링 30초 | ✅ |
| 7 | `schedulers: null` ≠ `[]` | ✅ |
| 8 | `online: null` ≠ `0` | ✅ |
| 9 | rAF 함정(QA 오진 금지) | 해당 없음(정적 QA) |
| 10 | `GET /home/widgets` 홈 진입 1회 | ✅ (`useHomeWidgets` 단일 마운트, 프리페치 없음) |

## 미검증 영역 (다음 단계)

- **런타임 전무** — BE 미기동(계약 A6). V23 적용 후 실제 응답 shape·시드 결과·에러 envelope은 `functional-qa`가 확인해야 한다.
- 특히 확인 필요: ① 첫 진입 시드 개수(관리자 12 / 비관리자 10), ② `/home/system-status`의 `aws=CONFIGURED` 배지 문구, ③ F1 시나리오(userRole↔Zabbix role type이 어긋난 계정)의 카탈로그 노출, ④ F6 시각 표기.
