# QA — 트리거 관리 BE↔FE 경계면 정합성 (정적 교차검증)

- **검증자**: integration-qa, 2026-07-21. **정적 대조만**(서버 미기동 — 런타임 행위는 functional-qa 담당).
- **대조 대상**: 계약 `contract_trigger-mgmt.md` ↔ BE `zabbix/manage/*`(컨트롤러/서비스/DTO 11종, ErrorCode, GlobalExceptionHandler) ↔ FE `types/zabbix-trigger.ts`·`services/zabbix-trigger.api.ts`·`hooks/useZabbixTrigger.ts`·`constants/zabbix-trigger.ts`·`pages/zabbix-management/trigger-management/*`(3파일).
- **결과 요약**: **PASS 대다수 / HIGH 0 / MEDIUM 1(의미·행위성) / LOW 1**. 타입·필드명·옵셔널·래퍼 깊이·케이싱 모두 정합. 유일한 실질 이슈는 빈문자열 clear 의미 불일치(정적 shape 아님, 행위성 — functional-qa/be 확인 권장).

---

## 1) EP 경로/메서드 (6개) — 전부 PASS

| # | 계약/BE | FE 호출 | 판정 |
|---|---|---|---|
| 1 | GET `/zabbix-manage/triggers` | `API.get("zabbix-manage/triggers", {params})` | ✅ |
| 2 | GET `/{triggerid}` | `API.get(.../${triggerid})` | ✅ |
| 3 | POST `` | `API.post("zabbix-manage/triggers", body)` | ✅ |
| 4 | PUT `/{triggerid}` | `API.put(.../${triggerid})` | ✅ |
| 5 | PATCH `/{triggerid}/status` | `API.patch(.../${triggerid}/status)` | ✅ |
| 6 | DELETE `` (body=config.data) | `API.delete("zabbix-manage/triggers", {data:body})` | ✅ |

클래스 베이스 `@RequestMapping("/zabbix-manage/triggers")` + 각 메서드 매핑 = FE URL 일치. `/api/v1` 접두는 axios baseURL이 처리(아이템 관리와 동일 규약).

## 2) 응답 shape·필드명·타입·옵셔널·중첩 — 전부 PASS

- **ManagedTriggerDto(목록)**: `triggerid, description, expression, priority, status, templateid, inherited(Boolean), hosts[]` — FE `TManagedTrigger` 8필드 1:1. priority/status/templateid=문자열, inherited=boolean 일치. ✅
- **ManagedTriggerDetailDto(상세=생성/수정 응답)**: `triggerid, description, expression, recoveryMode, recoveryExpression(nullable), priority, status, manualClose, comments(n), opdata(n), url(n), type, templateid, inherited, tags[], hosts[]` — FE `TManagedTriggerDetail` 16필드 1:1. recoveryMode/status/manualClose/type 모두 문자열 ↔ FE `string` 일치. ✅
- **TriggerHostRefDto** `{hostid,name,status}` ↔ `TTriggerHostRef` ✅ / **TriggerTagDto** `{tag,value(nullable)}` ↔ `TTriggerTag` ✅
- **TriggerStatusResDto** `{triggerid,status}` ↔ `TTriggerStatusRes` ✅
- **priority/status/recoveryMode/manualClose/type = 문자열** 확인: 서비스 `toDetailDto`/`toListDto`가 전부 `str(...)`로 문자열화. FE 타입도 전부 `string`. 상수(`TRIGGER_STATUS`, `TRIGGER_MANUAL_CLOSE`)도 `"0"/"1"` 문자열. ✅
- **inherited(boolean)**: BE `inherited(templateid)` = `templateid != "0"` → JSON boolean. FE `boolean`. 화면 Switch/체크박스/편집·삭제 disabled 로직 정합. ✅

## 3) 래퍼 깊이 (언랩) — PASS

- BE: 조회 `ApiResult<PagedListDto<...>>` / `ApiResult<Detail>`, 변경 `ApiResult<T>`.
- axios 인터셉터 `return response.data`(HTTP body=envelope) → **조회**는 `useDmoveQuery`가 `envelope.data`(payload) 추출 → 소비자 payload 직접 수신.
  - 목록 page: `data?.items`/`data?.total` ↔ `PagedListDto{items,total,limit,offset}` ✅ (BE 레코드 필드순 items/total/limit/offset도 FE `TPagedList`와 동일)
  - 상세 hook: `detail.recoveryMode` 등 payload 직접 접근 ✅
- **변경**은 `.then(unwrapEnvelope)`로 `envelope.data` 추출 or throw → useMutation `data`=payload ✅. **과다 언랩(`data.data`) 없음**. ✅

## 4) 요청 body 필드 — 전부 PASS

- **TriggerCreateReqDto**: hostId, templateId, description(@NotBlank), expression(@NotBlank), priority(Integer), recoveryMode(Integer), recoveryExpression, manualClose(Boolean), comments, opdata, url, status(Integer) ↔ FE `TTriggerCreateReq` 및 폼 전송값 1:1. priority/recoveryMode/status=number, manualClose=boolean 전송 확인(`Number(TRIGGER_STATUS.*)`, `values.priority`). ✅
- **TriggerUpdateReqDto**: description, expression, priority, recoveryMode, recoveryExpression, manualClose, comments, opdata, url (status 없음 — PATCH status로 분리) ↔ FE `TTriggerUpdateReq` 1:1. ✅
- **TriggerStatusReqDto** `enabled(Boolean,@NotNull)` ↔ FE `{enabled:boolean}` ✅
- **TriggerDeleteReqDto** `triggerIds(List<String>,@NotEmpty)` ↔ FE `{triggerIds:string[]}` — **요청은 camelCase `triggerIds`** ✅

## 5) 케이싱 함정(삭제 응답) — PASS

- 요청 `triggerIds`(camelCase) vs 응답 `TriggerDeleteResDto.triggerids`(소문자) — BE 레코드 컴포넌트명이 `triggerids`. FE `TTriggerDeleteRes.triggerids`(소문자)로 정확히 반영. ✅ (FE는 삭제 응답 payload를 실제 소비하진 않고 성공 토스트만 — 타입은 정합)

## 6) 에러 계약 — 전부 PASS

- **TRIGGER_EXPRESSION_INVALID(create/update)**: 서비스 `expressionInvalid()` = `new ApiError("TRIGGER_EXPRESSION_INVALID: " + 원문)` → `ApiError(String)`=400 → `handleApiError` → HTTP200, `{status:"error", code:400, errorCode·message="TRIGGER_EXPRESSION_INVALID: <원문>"}`. FE: `unwrapEnvelope`가 status==="error"→throw → `ZabbixManageApiError.message`=envelope.message → `extractTriggerExpressionError`가 프리픽스 `"TRIGGER_EXPRESSION_INVALID: "` 매칭 후 `: ` 뒤 원문 추출 → Alert 노출. ✅ 프리픽스 문자열 상수(`TRIGGER_EXPRESSION_INVALID_PREFIX`)까지 정확히 일치.
- **status/delete의 -32602(상속 거부 등)**: BE 프리픽스 없이 자빅스 원문 그대로 ApiError(400). FE는 status/delete `onError`에서 `extractTriggerExpressionError` 없이 `error.message` 그대로 노출. ✅ 계약 §5·§6 정합.
- **403(권한)**: `AdminAccessChecker.requireAdmin`→`ForbiddenError`→`handleHttpError`→HTTP200+code:403. FE `error.code === HTTP_STATUS.FORBIDDEN(403)` 분기. ✅ (401만 실제 상태코드 — 계약 보존)
- **TRIGGER_TARGET_REQUIRED / TRIGGER_IDS_REQUIRED / TRIGGER_NOT_FOUND / TRIGGER_CREATE_FAILED**: ErrorCode 전부 실재(라인 92·137~141). FE는 일반 `error.message` 토스트로 수용. ✅

## 7) Lombok is-접두 함정 — PASS (해당 없음)

- 응답 DTO 전부 **record**(ManagedTrigger/Detail/HostRef/Tag/StatusRes/DeleteRes) → 컴포넌트명 그대로 JSON 키(`inherited`, `manualClose`, `triggerids`). `isXxx` 네이밍 없음 → "is" 절단 변형 없음.
- 요청 DTO의 `Boolean manualClose`·`Boolean enabled`도 필드명 그대로(`manual_close`가 아니라 camelCase `manualClose`) → JSON 키 `manualClose`/`enabled`. FE 전송 키 동일. ✅

---

## 발견 사항

### [MEDIUM · 행위성 · be 확인] 부분수정 시 빈문자열("")로 필드 clear 불가 — FE 의도 vs BE putIfPresent 불일치
- **위치**: FE `TriggerFormDrawer.tsx:222-228`(update body: `recoveryExpression`/`comments`/`opdata`/`url`를 값 없을 때 `""`로 전송, 주석 "빈 문자열로 비운다") ↔ BE `ZabbixTriggerManageService.java:179·183-185`(`putIfPresent`) + `:367-372·374-380`(`trimToNull`).
- **내용**: FE는 필드를 비울 의도로 `""`를 보내지만, BE `putIfPresent`는 `trimToNull("")→null`이라 **해당 키를 자빅스 params에 아예 넣지 않음**(=미변경). 결과적으로 comments/opdata/url/recoveryExpression을 UI로 **한 번 설정 후 되돌려 비울 수 없다**.
- **특히 recoveryExpression**: recoveryMode 1→0 전환 시 FE는 `recoveryMode=0`+`recoveryExpression=""`를 보내는데 BE가 recovery_expression을 안 보내 이전 값이 잔존 → 자빅스가 `recovery_mode=0`과 충돌로 -32602 거부 가능(사용자에겐 TRIGGER_EXPRESSION_INVALID 혼란).
- **성격**: 타입/shape 불일치는 아님(양쪽 string, 정상 수용). 순수 **의미·런타임 행위 갭**이라 정적 QA 범위 밖 — functional-qa 재현 및 be 판단 필요. `putIfPresent`는 아이템 관리와 공유 패턴이라 수정 시 파급 검토 필요.
- **제안(택1)**: (a) BE update에서 recovery_expression만 "존재하면 빈값도 전달"로 분리, 또는 (b) FE가 clear 의도가 아니면 `""` 대신 미포함(undefined)으로 보내고 recoveryMode 전환 clear는 별도 처리.

### [LOW · 정보] 403 응답 errorCode 필드 부재 (기존 계약 동작)
- `handleHttpError`(GlobalExceptionHandler:43-50)는 2-arg `.error(message, code)`라 403 envelope에 `errorCode`가 없다(message="Access Denied"만). FE는 `error.code===403`으로만 분기하므로 **문제 없음**. 계약 §공통(에러 예시엔 errorCode 포함)과 미세 차이지만 소비에 영향 없어 정보성으로만 기록.

---

## 정합 확정(참고)
- 목록 쿼리 파라미터 7종(hostid/templateid/search/severity/status/limit/offset) BE↔FE 일치. FE page가 `keyword`→`search` 매핑 정확.
- 상속(inherited) 읽기전용 가드: FE에서 편집/삭제/토글/체크박스 disabled + 방어적 재필터(`handleBatchDelete`) — 계약 §4·§6 1차 방어 충족.
- 인증 헤더: `@VisitorIdCheck`+`@SecurityRequirement(bearer)` ↔ FE axios 공통 인스턴스가 HttpOnly 쿠키·x-visitor-id 주입(withCredentials).
