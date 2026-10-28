# APM 과거 원문 열람 정책 보완 — 2026-10-06

## 변경 이유와 동작

`keepRawSql=true`로 원문을 저장한 뒤 `false`로 바꾸어도 과거 DB 행은 원문으로 남는다. 기존 `ApmRawTextPolicy`는 현재 설정이 `false`이면 비관리자에게도 `RAW`를 반환하여 과거 원문의 열람 권한이 넓어졌다.

변경 후에는 **저장 설정과 열람 역할을 분리**한다. `ApmAccessChecker.canViewRawText`가 허용한 `ADMIN`·`SUPER_ADMIN`만 `RAW`, 그 외 역할·역할 누락·null principal은 `MASKED`다. 설정 조회는 하지 않는다. 기존 `ApmRawTextPolicy(ApmSettingService)` 생성자와 Spring 주입 계약은 유지하되 인자를 판정에 사용하지 않는다.

## API 계약

경로·HTTP 메서드·요청 필드·응답 필드·자료형·오류 코드는 변경하지 않는다. 아래 표는 `ApiResult`의 `data` payload 기준이다.

| 메서드·경로 | 요청 | 영향받는 응답 필드 | 조회 권한 |
|---|---|---|---|
| `GET /apm/traces/{traceId}` | `traceId: string` | `spans[].attrs: Map<string,string>`, `spans[].events[].attributes: Map<string,string>`, `spans[].links[].attributes: Map<string,string>` 내부 텍스트 | 기존 `apm.view`; 원문은 별도 관리자 역할 |
| `GET /apm/errors/{groupId}` | `groupId: long`, 선택 `from/to: long`(epoch ms) | `sampleStack: string \| null` | 기존 `apm.view`; 원문은 별도 관리자 역할 |

- 성공은 기존 `ApiResult` 응답 형식을 유지한다.
- `apm.view` 거부는 기존 HTTP 200 + body `code:403`, `errorCode:FORBIDDEN`이다.
- 미인증 요청은 기존 인증 필터에서 HTTP 401로 거부된다.
- 존재하지 않는 trace/error group의 오류 계약은 그대로다.
- `PUT /apm/settings`의 `keepRawSql` 저장 동작·요청 형태는 변경하지 않는다. ON→OFF는 과거 데이터 소급 마스킹·삭제를 뜻하지 않는다.
- 내보내기는 기존 기본 `MASKED`, 관리자 `rawText=true` 명시 시 `RAW` 계약을 유지한다. `ApmExportService`는 설명만 현재 화면 정책과 일치시켰다.

## 권한 행렬

다음 표는 먼저 `apm.view` 검사를 통과한 요청에 적용한다.

| 열람자 | `keepRawSql=true` | `keepRawSql=false` | 설정 조회 누락·장애 |
|---|---|---|---|
| `ADMIN`·`SUPER_ADMIN` | `RAW` | `RAW` | `RAW` — 설정 조회 없음 |
| `USER` 등 비관리자 | `MASKED` | `MASKED` | `MASKED` — 설정 조회 없음 |
| null principal·역할 누락 | `MASKED` | `MASKED` | `MASKED` |

관리자 `RAW`는 **저장된 값 그대로**라는 뜻이다. 이미 마스킹된 행을 원문으로 복원하지 않는다. 비관리자는 기존 SQL 마스킹을 조회 시 적용하며 스택 프레임의 파일·줄 번호는 보존한다.

## 구현 파일

- `ApmRawTextPolicy`: 현재 저장 설정에 따라 `RAW`를 반환하던 분기를 제거한다.
- `ApmRawTextView`: 상수 설명을 관리자 원문 열람·비관리자 마스킹으로 정정한다. 마스킹 알고리즘 자체는 유지한다.
- `ApmTraceController`, `ApmErrorController`, `ApmErrorGroupDetailDto`: 현재 동작에 맞춰 Javadoc·Swagger 설명을 갱신한다.
- `ApmAccessChecker`, `ApmExportService`: 저장 설정이 꺼지면 과거 행도 이미 마스킹돼 있다는 오래된 설명을 제거한다. 해당 클래스의 실행 로직은 변경하지 않는다.

## 실제 검증 대상과 상태

소스·테스트·독립 QA 완료, BE 커밋 `aab73fc`. 루트가 JDK17에서 직렬 실행해 **6개 클래스 79개, 실패·오류·skip0**을 확인했다. 실제 실행 필터는 아래 표 중 `ApmTraceQueryIT`를 제외하고 `ApmExportIT`를 포함했다. XML·집계는 `verification/apm-priority-20261006/stage1/`에 보존했다.

| 테스트 | 검증 범위 |
|---|---|
| `ApmRawTextPolicyTest` | true/false 설정별 역할 행렬, ON→OFF 동일 원문, null 설정·설정 조회 예외·null principal·null 역할, 이미 마스킹된 SQL·스택·빈 값, 설정 조회 없음 |
| `ApmReadAccessMvcTest` | 실제 USER+`apm.view`로 trace/error 상세 호출, ON→OFF 모두 정확히 `MASKED` 전달, 관리자 `RAW` 전달, 기존 조회 권한 회귀 |
| `ApmRawTextPolicyIT` | 격리된 실제 PostgreSQL에 원문 attrs/events/links·sampleStack 저장 → 실제 관리자 JWT의 `PUT /apm/settings` ON→OFF → 실제 USER·ADMIN·SUPER_ADMIN JWT의 두 GET 상세 JSON 검증. DB 원문이 유지되는데 비관리자 응답만 보호되는지 확인. 이미 마스킹된 행과 미인증 401도 검증 |
| 기존 `ApmTraceQueryIT`, `ApmTraceAggQueryIT`, `ApmExportServiceTest` | 트레이스 조회·오류 집계·파일 내보내기 기존 계약 회귀 |

권장 루트 필터:

```text
:test --tests '*ApmRawTextPolicyTest' --tests '*ApmRawTextPolicyIT' --tests '*ApmReadAccessMvcTest' --tests '*ApmTraceQueryIT' --tests '*ApmTraceAggQueryIT' --tests '*ApmExportServiceTest' --max-workers=1
```

IT는 기존 `IntegrationTestSupport`의 테스트 DB를 사용하고 `testDatabaseAvailable` 조건으로 실행한다. **skip이면 실제 DB 검증 완료로 간주하지 않는다.** OTLP 수신 전체가 아니라 적재 SQL 정책을 적용한 직접 DB fixture와 실제 조회 HTTP 계층을 검증한다. 공유 개발 서버는 재기동하지 않는다.

## 남는 범위

- 마스킹은 기존 SQL 휴리스틱이다. 일반 자유 텍스트·키·span/root/event 이름 전체의 개인정보 제거를 보장하지 않는다.
- SQL 리터럴·메시지 마스킹 알고리즘 확장, 과거 행 소급 마스킹·삭제, 별도 원문 열람 권한 도입은 이 변경의 범위 밖이다.
- 스키마/Flyway·FE 자료형 변경은 없다.

## 🔄 FE 요청사항

필수 수정 없음. 같은 응답 필드에 현재 사용자 역할에 맞는 문자열이 반환된다. 원문 보관 설정을 꺼도 과거 원문이 모두 지워지거나 마스킹된 것으로 안내해서는 안 된다.
