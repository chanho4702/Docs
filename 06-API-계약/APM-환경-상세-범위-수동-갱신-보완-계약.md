# APM 환경·상세 범위·수동 갱신 보완 계약

상태: 구현 전 계약. 순위 9~10의 구현 기준이며, 아직 배포된 API가 아니다. 근거는 [FE 조사](../03-%EA%B8%B0%ED%9A%8D-%EB%B0%B1%EB%A1%9C%EA%B7%B8/APM-%EC%88%9C%EC%9C%84-9-10-%EC%A4%80%EB%B9%84-%ED%99%98%EA%B2%BD-%EC%84%A0%ED%83%9D-%EB%B2%94%EC%9C%84-%EC%88%98%EB%8F%99-%EA%B0%B1%EC%8B%A0.md)와 현재 Spring 조회·내보내기 코드다. 순위 5~8 검증 후 제품에 순차 반영한다.

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

이번 환경 확장은 `error-groups`에 적용한다. `red-series`·`endpoints`에 비어 있지 않은 env를 보내면 지원하지 않는 필터를 조용히 무시하지 않고 `APM_EXPORT_INVALID`로 거절한다. 기존 개요 RED 내보내기의 전체 환경 안내와 동작은 유지한다. FE는 오류 내보내기에서만 env를 전송한다.

## FE 선택·갱신

- 환경 변경은 env·offset·화면의 서비스/그룹/target 선택 해제를 하나의 URL 갱신으로 처리한다.
- 외부 호출 행의 식별자는 `(serviceUid, target)`다. 목록 필터와 행 선택 서비스는 별도로 저장하고 series는 선택한 서비스 하나만 조회한다. null UID 행과 서비스 없는 옛 target 링크는 전체 서비스 합산으로 대체하지 않는다.
- 환경·서비스는 API 인자뿐 아니라 해당 query key와 그룹 상세·series에도 포함한다.
- 수동 갱신은 기존 `useApmRefresh`를 재사용한다. 상대 시간창은 현재 시각으로 전진하고 custom 시간창은 유지한다. 해당 화면 목록·차트·옵션·열린 상세의 활성 query를 갱신한다.
- 서비스 상세의 갱신 목록에 오류/DB 상세·series와 외부 호출 series를 보충한다. export 계획은 클릭 당시 scope를 유지하므로 일반 갱신 대상에 넣지 않는다.

## 검증과 남는 범위

검증 전이다. 다른 환경의 같은 이름 서비스·같은 target·다른 그룹, 참여 trace, scoped 상세 거절, 토큰 변조, 실제 QueryClient와 URL 전환·시간 전진·열린 상세 요청을 확인한다. DB와 브라우저 결과는 구현 후 별도로 기록한다. env는 조회 범위이며 사용자별 서비스 접근권한 체계를 신설하는 기능은 아니다.

## 🔄 FE 요청사항

BE 구현·정적 계약 대조 후 types → API → query key → URL/화면 → 행위 검증 순서로 반영한다. 구현 전 계약을 현재 API가 지원한다고 간주하지 않는다.
