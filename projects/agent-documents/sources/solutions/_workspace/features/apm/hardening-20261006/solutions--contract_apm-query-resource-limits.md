# APM 시계열 조회 자원 상한 계약 — 2026-10-06

## 적용 범위

기존 인증·APM 조회 권한과 URL·HTTP 메서드·쿼리 shape은 유지한다.

| 조회 | 제한 |
|---|---|
| `GET /apm/services/{uid}/availability` | 요청된 간격으로 생성하는 가용성 점 최대 120,000개. step 생략·0 이하 시 기존 기본 300초 |
| `GET /apm/services/{uid}/red-series` | 실제 해상도의 시간축 격자 최대 20,000칸 |
| `GET /apm/services/{uid}/endpoints/series` | 동일 |
| `GET /apm/services/{uid}/instances/{instanceId}/series` | 1m 축으로 제공 가능한 경우 동일. 기존 제공 불가 해상도의 빈 응답은 유지 |
| `GET /apm/services/{uid}/status-codes` | 동일 |
| `GET /apm/services/{uid}/latency-heatmap` | 동일 |
| `GET /apm/services/{uid}/runtime` | 동일 |

일반 시계열 해상도는 기존 `ApmResolution.choose`가 선택한 60·300·3600초다. 시작을 해당 단위로 내린 격자부터 끝(배타)까지 센다. 최대 기간을 일괄 제한하지 않으며, 400일의 1시간 집계 9,600칸을 허용한다. 가용성은 요청 간격을 보존하므로 400일·기본 300초의 115,200점을 허용한다.

20,000은 시간축 격자 상한이며 여러 runtime 계열·heatmap 열의 합계나 JSON 바이트 수 상한은 아니다.

## 초과 응답

HTTP **200**, 기존 `ApiResult`의 오류 envelope:

```json
{
  "code": 400,
  "errorCode": "APM_QUERY_TOO_MANY_POINTS",
  "message": "조회할 시간 구간이 너무 많습니다. 기간을 줄이거나 조회 간격을 늘려 주세요.",
  "data": {
    "maxPoints": 20000,
    "requestedPoints": 20001
  }
}
```

위 예시는 관련 필드만 표시한 것이다. `maxPoints`는 일반 격자 20,000, 가용성 120,000이며 `requestedPoints`는 실제 계산한 long 값이다. 성공 payload 필드·nullable·단위는 변경하지 않는다. 요청이 상한을 넘으면 메트릭 집계 SQL과 격자 배열 생성 전에 거절한다. UID 존재/권한 등 기존 선행 검사는 유지한다.

FE의 기본 가용성은 고정 24시간·300초, 288칸이므로 영향 없다(`ApmServiceOverviewTab.tsx:79`). FE 에러 인터셉터가 기존 body code 오류로 처리한다. 자동으로 기간을 줄이거나 빈 성공으로 치환하지 않는다.

## 검증

`ApmQueryResourceLimitTest`가 MockMvc로 HTTP200/body400/errorCode와 maxPoints를 검사한다. 상세 테스트 실행 결과는 최종 QA 보고서를 따른다.

## 🔄 FE 요청사항

성공 payload 변경 없음. 별도 필수 수정 없음. 향후 조회 상한 전용 안내를 추가할 때는 `APM_QUERY_TOO_MANY_POINTS`와 `data.maxPoints`를 사용할 수 있다.
