# 검수 요청 — ZM-159 C4 Zabbix 메서드 이넘·안전망 조이기

- 요청: Claude · 2026-09-17 · 워크트리 `C:/worktrees/zm-159-be`(브랜치 `ZM-159`, HEAD `6f638e1` = C3까지 커밋) · **미커밋 33파일 전부가 C4**
- 사용자 지시(09-17): "`host.get` 같은 것 이넘화 + 공식 문서 출처 링크 — API 버전이 바뀌어도 바꿔 끼우기 쉽게" / "한 번에 다 가져올 일이 없으니 과하게 하지 말 것, OOM은 막을 것"
- 설계: `_workspace/features/infra/scale-call-guard/devdesign_zm-159-scale-call-guard.md` §0.7(C4 행) · 조사표 `_workspace/features/platform/zabbix-api-reference/zabbix-api-7.0-methods.md`

## 범위
| 구분 | 내용 |
|---|---|
| 신규 | `client/ZabbixMethod.java` — 사용하는 JSON-RPC 메서드 **111개**(rpcName·Access READ/WRITE/AUTH/INFO·`docUrl()`). 버전은 `DOCS_VERSION="7.0"` 한 곳, 주소는 `DOCS_URL_FORMAT` 틀로 조립. `of(String)`은 LLD 프로토타입처럼 이름을 조립하는 곳용 |
| 신규 | `src/test/resources/zabbix/api-reference-7.0.json` — 공식 7.0 문서 111쪽+공통 get 파라미터 원문에서 뽑은 조사표(전부 verified) · `ZabbixMethodTest` — 이넘 ↔ 조사표(존재·성격·링크·버전) 대조 |
| 변경 | `ZabbixApiTemplate` — 메서드 인자를 **`ZabbixMethod`로만** 받음(문자열 인자 제거). 24개 서비스 구현의 `api.xxx("a.b"` → `api.xxx(ZabbixMethod.A_B`, LLD는 `ZabbixMethod.of(kind + "prototype.…")` |
| 변경 | `ZabbixQueryExecutor` — 요청 사양의 `method`를 `ZabbixMethod`로, **READ가 아니면 거부**. `listByIds`는 받은 행 예산을 `max-held-rows`로 좁힘 |
| 변경 | `ZabbixCallLimits` — `max-response-bytes` 기본 **64MiB→16MiB**, `max-held-rows`(기본 1만) 신설, `policy(ZabbixMethod)` 오버로드 |
| 테스트 | 템플릿·실행기 테스트의 메서드 문자열 → 이넘, 신규 2건(쓰기 메서드 거부·보유 행 상한) |

## 의도·버린 대안
- 이넘 상수마다 링크를 직접 적으면 버전을 올릴 때 111곳을 고쳐야 한다 → 규칙으로 조립.
- 파라미터 목록은 코드에 넣지 않고 조사표(JSON/MD)로만 둔다(사용자: "출처 링크만").
- `ZabbixClient.callRaw(String…)`은 전송 계층이라 문자열 유지(템플릿만 이넘으로 받는다).
- 16MiB 근거: JSON을 트리로 펼치면 수 배로 늘어나고, Dockerfile에 힙 설정이 없어 컨테이너 메모리의 25%가 기본 힙이다(추정 — 실측 전).

## 중점 확인 요청
1. **이넘 전환의 동작 불변** — 24개 서비스에서 보내는 메서드 이름이 전과 같은가(특히 LLD 동적 이름·`apiinfo.version`·`script.getscriptsbyhosts`·`usermacro.*global`). 오타 한 글자라도 다르면 런타임에서만 드러난다.
2. `ZabbixMethod.Access` 분류가 공식 문서와 맞는가(`script.getscriptsbyhosts`=READ, `event.acknowledge`·`script.execute`·`task.create`·`token.generate`·`history.push`=WRITE, `user.login/logout`=AUTH, `apiinfo.version`=INFO).
3. `ZabbixMethodTest`가 "버전을 올릴 때 알려 준다"는 목적을 실제로 달성하는가(조사표 파일 이름 규칙·검증 누락).
4. `listByIds`의 보유 행 상한 적용 방식(받은 행 예산을 좁힘 — 재조회 행도 세므로 보수적)이 맞는가, 호출자가 넘긴 `maxTotalRows`와의 관계.
5. 16MiB 기본값이 기존 정상 화면을 깨뜨릴 위험(현재 단일 응답이 16MiB를 넘는 정상 경로가 있는가 — 예: 호스트 5천 대 `host.get`+`selectInterfaces`+`selectTags`, 인벤토리 `selectInventory=extend`).
6. 조사표 JSON(약 100KB)을 테스트 리소스로 두는 것이 적절한가.

## 검증 현황
- ✅ `:engine-zabbix:test` **218 통과** · ✅ 앱 `compileJava`·`compileTestJava`
- ✅ 이넘 111개 ↔ 공식 문서 조사표 111개: 이름·성격 전부 일치(조사 에이전트가 112쪽 원문 수집·파싱)
- ✅ `AuthorizationContractIT` 11 통과(C4 상태, 스프링 구성 확인)
- ❌ 미실시: 실 자빅스 호출 · 16MiB에서의 실제 힙 사용량 측정

## 검수 결과
(Codex gpt-5.6-sol 기록 — `review_zm-159-c4_codex.md`. 판정 **커밋 보류**: 메서드 이름 126곳·111개 불일치 0, 성격 분류 일치, 결함 🔴1·🟡2·🟢1)

## 반영 기록 (Claude, 2026-09-17)
- [x] **R1** `listByIds` 유효 예산 = `min(호출자 값 또는 전역 max-total-rows, max-held-rows)` — 전역 예산을 넓히지 않는다. 반례(`max-total-rows=2`·`max-held-rows=3`) 테스트 고정.
- [x] **R2** `ZabbixMethodTest` 링크 기대값을 `DOCS_VERSION`으로 조립 — 버전을 올릴 때 테스트 수정 불필요.
- [x] **R3** 응답 상한 기본값을 **64MiB로 되돌림**. 16MiB는 전체 조회 경로(자산 동기화 `host.get`+`selectInventory=extend`)를 나눠 받게 고치고 힙을 실측한 뒤(C5)에 낮춘다. 설계서 §0.7 C5에 추가.
- [x] **R4** 조사표 `methods` 배열 여부·중복 메서드 거부 검증 추가.
- [x] (검수 밖, Claude 자체 발견) 기간 분할이 없는 id 순회가 **전체 페이지를 창 확정까지 쌓아 두던 것**을 청크마다 즉시 전달로 변경(재조회가 없는 경우라 안전) — "흘려보내며 집계"가 실제로 메모리를 아끼게. 테스트 고정.
- 검증: `:engine-zabbix:test` **220 통과** · 앱 `compileJava`·`compileTestJava` 통과.
