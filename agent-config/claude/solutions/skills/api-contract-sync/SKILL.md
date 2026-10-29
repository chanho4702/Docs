---
name: api-contract-sync
description: moveseye BE(Spring Boot, moveseye-be-spring)와 FE(React) 사이의 기존 API 계약을 동기화·검증한다(새 엔드포인트/화면 구현은 포함하지 않음 — 그건 fullstack-feature). BE 컨트롤러/응답 DTO·Swagger(springdoc)와 FE의 services/*.api.ts·types/*.ts·hooks를 대조해 경로·필드·타입 불일치를 찾아내고 맞춘다. "타입 맞춰줘", "계약 동기화", "BE 바꿨는데 FE 타입", "Swagger와 FE 타입 비교", "응답 필드 안 맞아", "BE만/FE만 고쳤는데 반대편 영향 점검" 같은 정합성 요청에 사용. 단, 새 기능을 구현부터 화면까지 만드는 요청이면 fullstack-feature를 사용한다.
---

# api-contract-sync — BE↔FE API 계약 동기화

moveseye 모노레포에서 백엔드(`moveseye-be-spring`, Spring Boot — BE 정본)와 프론트엔드(`moveseyee_fe`)의 API 계약을 일치시키는 스킬.
구 NestJS(`moveseye-be`)는 원본 계약 quirk 확인이 필요할 때만 참조한다(읽기 전용).
**왜 필요한가:** 두 프로젝트는 별개 레포라 타입이 자동 공유되지 않는다. 필드명 오타·타입 불일치·옵셔널 누락·응답 래퍼 깊이 오해가 가장 흔한 통합 버그다. 이 스킬은 그 경계면을 결정적으로 대조한다.

## 두 레포의 대응 구조 (도메인별 1:1)

| 레이어 | BE (`moveseye-be-spring/src/main/java/com/dmove/moveseye`) | FE (`moveseyee_fe/src`) |
|---|---|---|
| 라우트 | `{domain}/*Controller.java` (`@RestController`, `@GetMapping/@PostMapping`) | `services/{domain}.api.ts` (axios URL) |
| 요청 형태 | 요청 DTO (jakarta validation 어노테이션) | api 함수 인자 / `types/{domain}.ts` |
| 응답 형태 | 응답 DTO (springdoc `@Schema`, Lombok) | `types/{domain}.ts` |
| 호출/상태 | 서비스 반환 → `ApiResult<T>` 래핑 | `hooks/*` (react-query, `useDmoveQuery`) |

도메인 매핑 예: BE `auth`↔FE `auth`, BE `host`↔FE `host-monitoring`, BE `event`↔FE `event`/`event-alert`, BE `aws`(cloud-infras)↔FE `cloud-infra`, BE `setting`↔FE `setting`.

## 핵심 규약 (대조 시 반드시 반영)
1. **응답 래퍼**: BE는 모든 응답을 `ApiResult<T>`로 감싼다. FE는 axios 인터셉터+`useDmoveQuery`가 2겹 벗겨 **소비자가 페이로드(T)를 직접 받는다** — FE 타입은 T 기준으로 정의하고, 소비처의 `data.data` 접근은 과다 언랩 버그로 기록한다.
2. **에러도 HTTP 200**: BE는 Unauthorized(401) 외 에러를 200 + body code로 내린다(**403도 200 + body code:403** — 원본 버그의 의도적 보존). 계약서에 에러 code를 명시한다.
3. **인증 헤더**: 보호 엔드포인트는 Bearer + `x-visitor-id` 필요.
4. **페이지네이션**: BE 페이지네이션 응답 DTO(items/total 등) ↔ FE 대응 타입.

## 워크플로우

### A. 계약 추출 (BE → 계약서)
BE(`moveseye-be-spring`)에서 대상 엔드포인트의 계약을 추출한다. 두 경로:
- **정적**: 컨트롤러의 `@GetMapping/@PostMapping` 경로·메서드(클래스 `@RequestMapping` 포함), 요청 DTO 필드(jakarta validation으로 필수/옵셔널 판별), 응답 DTO의 필드·타입·nullable(`@Schema` 포함)을 읽는다.
- **동적(권장, 가능 시)**: BE를 띄워 `http://localhost:<PORT>/v3/api-docs`(springdoc OpenAPI JSON)를 받아 정확한 스키마를 확보한다. Swagger UI는 `/api`에 마운트됨. 기동은 `gradlew bootRun` + `.env` export 필수(`moveseye-be-spring/CLAUDE.md` 참조).

추출 결과를 `_workspace/features/<영역>/<기능>/contract_{feature}.md`에 표로 정리: 메서드·경로 / 요청 필드(이름·타입·필수) / 응답 필드(이름·타입·nullable) / 에러코드 / 권한.

### B. 대조 (계약서 ↔ FE)
계약서를 기준으로 FE 3층을 점검한다:
1. `services/{domain}.api.ts` — URL·메서드가 계약과 일치? 베이스 path 포함 확인.
2. `types/{domain}.ts` — 응답/요청 타입이 계약 필드와 1:1? **필드명·타입·옵셔널 어긋남**을 표로 기록.
3. `hooks/*` — react-query 키·반환 타입이 맞는가.

### C. 동기화 (수정 적용)
불일치를 다음 우선순위로 맞춘다. **계약(BE)을 단일 진실원천(SSOT)으로 삼되**, FE 사용성 문제로 BE를 바꾸는 게 옳으면 be-engineer에 변경을 제안한 뒤 합의된 방향으로 양쪽을 수정한다.
- FE 타입을 계약에 맞춰 수정(가장 흔함).
- api 함수 URL/파라미터 교정.
- 누락된 도메인 파일 생성 시 기존 도메인 파일의 패턴을 그대로 따른다.

### D. 검증
- FE: `tsc`/`yarn build` 또는 lint로 타입 정합 확인.
- 가능하면 실제 호출(BE 기동 상태)로 런타임 shape까지 확인.
- 결과를 `_workspace/sync_{feature}.md`에 남긴다(무엇을 바꿨는지 + 잔여 이슈).

## 자주 나오는 함정
- FE에 도메인 파일이 있는데 BE엔 도메인 패키지가 없는 경우(예: `asset`) → BE 미구현 상태. 계약서에 "BE 미구현"으로 명시하고 be-engineer에 신호.
- BE 응답 필드명이 camelCase ↔ FE 기대와 다른 경우 → 변환 지점(인터셉터/매퍼) 확인.
- **Lombok `private boolean isXxx`는 JSON 키가 `xxx`로 바뀐다**(Jackson이 is-접두 제거) → FE 타입이 `isXxx`를 기대하면 불일치. BE는 `Boolean` 래퍼 선언으로 보존해야 한다.
- Swagger JSON에 안 나타나는 필드가 있을 수 있다(어노테이션 누락·제네릭 래퍼) → 정적 코드도 함께 확인.

## 출력
모든 중간 산출물은 `_workspace/`에, 최종 코드 수정은 각 레포에 직접 반영. 계약서(`contract_*.md`)는 보존하여 다음 동기화의 기준선으로 쓴다.
