# APM 관측 시각과 파티션 준비 보완

상태: 순위 7 구현 중. 메트릭은 [지연 집계 계약](APM-%EC%A7%80%EC%97%B0-%EB%A9%94%ED%8A%B8%EB%A6%AD-%EC%9E%AC%EC%A7%91%EA%B3%84-%EC%8B%9C%EA%B0%84%EC%B0%BD-%EB%B3%B4%EC%A1%B4-%EB%B3%B4%ED%98%B8-%EA%B3%84%EC%95%BD.md)에 포함된다. 이 문서는 trace/RUM 후속 범위이며 아직 전체 완료가 아니다.

## RUM 구현

- 기존 시작 시각의 과거 30일·미래 300초 창은 유지한다.
- 브라우저 스팬 종료 시각도 수신 시각 +300초를 초과할 수 없다.
- 스팬 길이는 정확히 24시간까지 허용한다. 기존 `Duration.toDays()` 절삭으로 24~48시간 미만을 허용하던 오류를 수정한다.
- 페이지·세션·영수증·timing/error 집계의 기존 30일 수신 의미는 유지한다.
- `apm_rum_span` 파티션은 실제 원본 저장 조건(스팬이 있고 관측 시각이 수신 기준 7일 이내)을 만족하는 날짜만 준비한다. 다른 관측의 빈 원본 파티션을 생성하지 않는다.
- controller의 한 `receivedAt`을 parser·partition 준비·store가 함께 사용한다. 7일 경계는 포함하며 준비와 실제 INSERT가 같은 판정을 쓴다.
- 기존 OTLP RUM `partialSuccess`·폐기 계수·HTTP 응답 shape는 유지한다. 새 FE 필드는 없다.

## 서버 trace 후속

아직 미구현이다. reader 이후, 서비스 등록·partition 준비 전에 실제 span 보존 정책에 따른 시작/종료 시각을 검사해야 한다. 메트릭의 raw1mDays와 METRIC 사유를 그대로 재사용하지 않는다. 날짜 삭제 이후 재생성·retention 경합은 공통 partition 경계와 연결할 때 별도 검증한다.

## 검증

RUM 변경 7파일을 BE `22eeff8` detached worktree에 적용하여 parser/store/controller 및 실제 PG `RumSchemaIT`를 실행했다. 53개(14+11+18+10), 실패·오류·건너뜀 0. `RumSchemaIT`에서 20일 전 페이지 집계 저장·원본 span 미저장·span partition 미생성을 확인했다. 증빙은 `verification/apm-priority-20261006/rum-time/`다. 아직 메인 작업 트리의 5~6번 변경을 합친 최종 빌드 결과는 아니다. 공유 서버 재시작·운영 DB 변경은 하지 않았다.

## 🔄 FE 요청사항

현재 RUM 변경은 응답 shape·reason enum을 추가하지 않아 FE 수정이 없다. 서버 trace의 신규 reason이 확정되면 이 절을 갱신한다.
