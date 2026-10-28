# APM 환경·상세 범위·수동 갱신 보완 계약

상태: **BE 구현 완료(2026-10-07, 브랜치 `apm-query-controls`, 코덱스 검수 대기) · FE 미착수**. 근거는 [FE 조사](apm-query-controls-20261006.md)와 현재 Spring 조회·내보내기 코드다.

## 2026-10-07 구현 결정 (코덱스 사전 의견 `_archive/features/apm/hardening-20261006/review_apm-remaining-plan-20261007_codex.md` §3 채택)

- trace `env`: 서비스 미선택이면 루트 서비스 환경, 선택하면 그 서비스가 환경 안일 때만. `involved=true` 의미 유지.
- **개요 RED·엔드포인트 내보내기도 env를 받는다**(초안의 "거절"을 변경). 서비스 미선택 red-series는 관측된 서비스 중 환경 안의 것만, 서비스를 골랐는데 환경 밖이면 `APM_EXPORT_INVALID`(조용히 0행 파일 금지). error-groups도 같은 규칙.
- 계획 응답 `env: string | null`(적용한 정규화 값). FE는 요청에 env를 보냈는데 응답 env가 없거나 다르면 다운로드 차단.
- planToken **v2**(지문에 env). v1은 읽기만 — 요청 env가 null일 때만 유효, env를 건 요청에 v1이 오면 `APM_EXPORT_INVALID`. 키 파생 라벨은 그대로(옛 토큰 판독 유지).
- 정규화 정본: `ApmServiceRefLookup.envNorm`(= `ApmNaming.normalize`, env_norm 저장 규칙). 비교는 `env_norm` 컬럼으로만(`Ref.env`는 원문).
- 범위 판정 정본: `ApmServiceRefLookup.select(uid, env)` → `Selection(serviceId, envNorm, mismatch)`. mismatch는 404가 아니라 빈 모집단(`and 1 = 0`). 없는 uid는 종전대로 `APM_SERVICE_NOT_FOUND`.
- 그룹 상세·시계열(`/apm/errors/{id}`, `/{id}/series`, `/apm/db/queries/{id}`, `/{id}/series`)은 `service?`·`env?`를 받고, 범위 조건이 있을 때만 `groupInScope`로 사전 확인 → 범위 밖이면 기존 not-found 코드. 범위 조건이 없으면 종전 동작(시계열은 존재 확인 없음).
- 기존 시그니처는 전부 오버로드로 보존(env 없는 호출 = 종전).
- (코덱스 1차 반영) 내보내기 대상의 환경 판정은 `ApmExportTarget.envNorm`(DB `env_norm`)으로만 — 원문 `env`는 파일 표시용. 서비스 미선택 RED는 관측 조회 전에 환경 안 서비스만. 오류·DB 목록은 버킷 집계 **안쪽**(`group_id in (…)`)에서 범위를 먼저 좁힌다.
- **배포 전제**: planToken v2 발급은 즉시다. 설치형 BE 1벌 전체 교체 배포가 전제이며, 다중 노드(순위 15)를 도입할 때 issuer 버전 플래그(v1 유지 → v2 전환 2단계)를 함께 넣는다.

## 공통 범위

`env`는 선택 파라미터다. 생략·빈 문자열·공백은 전체 환경이다. 유효 값은 기존 서비스 개요와 동일하게 trim 후 `Locale.ROOT` 소문자로 정규화한다. SQL의 서비스 환경에 적용하고 집계·total·LIMIT·산점도 표본 추출보다 먼저 제한한다. 기존 응답 envelope와 권한 판정은 유지한다.

서비스가 지정되면 서비스와 환경의 교집합이다. 없는 service UID는 기존 `APM_SERVICE_NOT_FOUND`; 존재하지만 환경이 다르면 목록·시계열은 빈 모집단이다. 그룹 상세는 아래 범위 불일치 규칙을 따른다. 고정 서비스 상세 탭은 고정 service를 정본으로 사용하고 전역 URL의 env를 상속하지 않는다.

## 변경할 요청

| endpoint | 추가 입력·의미 |
|---|---|
| `GET /apm/traces`, `/apm/traces/scatter` | `env?`. 서비스 미선택이면 루트 서비스 환경. 서비스를 선택하면 그 서비스 환경과 교집합이며 `involved=true`의 참여 트레이스 의미를 유지한다. 목록·total·scatter에 동일 적용 |
| `GET /apm/errors` | `env?` |
| `GET /apm/errors/{groupId}`, `/{groupId}/series` | `service?`, `env?`. 그룹 소속이 범위와 다르면 기존 그룹 not-found 오류. 기간 안 발생이 없는 정상 그룹과 구분 |
| `GET /apm/db/queries`, `/apm/db/systems` | `env?` |
| `GET /apm/db/queries/{groupId}`, `/{groupId}/series` | 오류 그룹과 같은 `service?`, `env?` 범위 확인 |
| `GET /apm/dependencies`, `/apm/dependencies/series` | `env?`. 외부 target이 아닌 호출 서비스 환경 |
| `GET /apm/exports/error-groups/plan`, `/apm/exports/error-groups` | `env?`. 계획·다운로드·planToken 지문에 같은 정규화된 환경을 적용 |

트레이스 ID 단건·flame·compare는 한 트레이스 전체를 보여 주는 기존 계약을 유지한다. 환경별로 내부 span을 잘라내지 않는다.

## 오류 내보내기

계획 응답에 적용한 `env: string | null`을 추가한다. 기존 CSV 열은 유지하며 이미 있는 행별 서비스 환경이 제한 범위와 일치해야 한다. 클릭 시 고정하는 export scope에 env를 넣고 계획 토큰을 다운로드까지 전달한다. 다른 환경으로 바꾼 요청에 기존 토큰을 재사용하면 기존 `APM_EXPORT_INVALID`로 거절한다.

~~이번 환경 확장은 `error-groups`에 적용한다. `red-series`·`endpoints`에 비어 있지 않은 env를 보내면 … 거절한다.~~ **(2026-10-07 변경)** 세 데이터셋 모두 env를 적용한다 — 화면이 환경으로 걸러 보고 있을 때 전 환경 파일이 나가는 쪽이 더 위험하다. FE는 화면의 env를 그대로 보내고 응답 `env`로 적용 여부를 확인한다.

## FE 선택·갱신

- 환경 변경은 env·offset·화면의 서비스/그룹/target 선택 해제를 하나의 URL 갱신으로 처리한다.
- 외부 호출 행의 식별자는 `(serviceUid, target)`다. 목록 필터와 행 선택 서비스는 별도로 저장하고 series는 선택한 서비스 하나만 조회한다. null UID 행과 서비스 없는 옛 target 링크는 전체 서비스 합산으로 대체하지 않는다.
- 환경·서비스는 API 인자뿐 아니라 해당 query key와 그룹 상세·series에도 포함한다.
- 수동 갱신은 기존 `useApmRefresh`를 재사용한다. 상대 시간창은 현재 시각으로 전진하고 custom 시간창은 유지한다. 해당 화면 목록·차트·옵션·열린 상세의 활성 query를 갱신한다.
- 서비스 상세의 갱신 목록에 오류/DB 상세·series와 외부 호출 series를 보충한다. export 계획은 클릭 당시 scope를 유지하므로 일반 갱신 대상에 넣지 않는다.

## 검증과 남는 범위

검증 전이다. 다른 환경의 같은 이름 서비스·같은 target·다른 그룹, 참여 trace, scoped 상세 거절, 토큰 변조, 실제 QueryClient와 URL 전환·시간 전진·열린 상세 요청을 확인한다. DB와 브라우저 결과는 구현 후 별도로 기록한다. env는 조회 범위이며 사용자별 서비스 접근권한 체계를 신설하는 기능은 아니다.

## 🔄 FE 요청사항

~~BE 구현·정적 계약 대조 후 types → API → query key → URL/화면 → 행위 검증 순서로 반영한다.~~ **2026-10-07 FE 반영 완료**(코덱스 검수 대기, `features/apm/hardening-20261006/review_apm-query-controls-fe-20261007.md`): 전역 화면만 env 전송(고정 서비스 탭 제외), 쿼리 키 env 정규화(`normalizeApmEnv`), `setEnv(next, resetKeys)` 원자적 초기화, 외부 호출 `(serviceUid,target)` 선택 키 `depSelService`(null UID 행은 series 없이 안내), `useApmRefresh` 통일, 내보내기 응답 `env` 검증(`apmExportEnvUnsupported`). 브라우저 런타임 미검증.
