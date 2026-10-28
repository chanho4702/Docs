# 코덱스 검수 결과 — APM P2 트레이스 2차 (2026-09-02, codex exec read-only, 대상 6eb287c)

요약: 🔴 재실행 시 예외 롤업이 이중 계상될 수 있고, 일반 USER도 스택·속성·정규화 SQL을 읽을 수 있습니다.  
🔴 산점도 20만 건 상한은 비결정적 표본이라 대표성 계약을 깨며, mixedBounds에서 `null` bounds를 혼재로 감지하지 않습니다.  
🟡 설계의 90일 그룹 보존 정리는 여전히 없습니다. 테스트는 실행하지 않았습니다.

| # | 심각도(🔴/🟡/🟢) | 파일:라인 | 문제 | 왜 문제인가 | 권고 |
|---|---|---|---|---|---|
| 1 | 🔴 | `ApmTraceRollupService.java:363-392` | `count_total`·1h count가 덧셈 UPSERT다. | DB 커밋 성공 뒤 응답/연결 오류 등 commit outcome이 불명확해 잡이 재실행되면, 같은 창을 다시 더한다. 단일 트랜잭션은 부분 실패만 막고 at-least-once 재실행의 이중 계상은 막지 못한다. | 예외 롤업도 버킷별 대입 UPSERT로 바꾸거나, 처리 창 식별자를 영속해 한 번만 가산되게 하라. |
| 2 | 🔴 | `ApmTraceController.java:46-47`, `ApmErrorQueryService.java:138-165`, `ApmSqlPolicy.java:128-132` | 17개 읽기 EP가 `VisitorIdCheck`+Feature만 검사한다. | `UserRole`에는 `USER`가 존재하지만 운영자 이상 판정이 없다. 일반 USER가 `sampleStack`, attrs/events/links 및 `queryNorm`을 읽는다. `keep_raw_sql=true`면 stacktrace도 원문 보존된다. | 읽기 권한을 명시적으로 운영자 이상으로 강제하고, 원문 SQL/스택은 관리자 또는 별도 열람 정책으로 분리하라. |
| 3 | 🔴 | `ApmTraceQueryService.java:255-274` | 산점도에 정렬 없는 `limit 200000`을 먼저 적용한다. | 상한 초과 시 어떤 20만 건을 고를지 실행계획·물리 배치에 좌우된다. 이후 셀별 “느린 것 우선”은 그 임의 부분집합에만 적용되어 시간대·이상치 대표성이 보장되지 않는다. | 시간 버킷별 bounded sampling을 SQL에서 수행하거나, 안정 순서/키 기반 표본화를 먼저 적용하라. |
| 4 | 🟡 | `ApmServiceMapQueryService.java:96-109`, `ApmDbQueryService.java:98-103`, `ApmDependencyQueryService.java:68-83` | `count(distinct bounds_id)`가 NULL을 무시한다. | 일부 롤업 행이 `bounds_id=NULL`, 일부가 값이면 `mixed=false`와 임의의 `min(bounds_id)`로 백분위를 계산한다. 계약의 mixedBounds 시 백분위 `null` 규약을 위반할 수 있다. | NULL도 별도 경계 종류로 세거나 `bool_or(bounds_id is null)`을 결합해 혼재 시 `mixedBounds=true`로 처리하라. |
| 5 | 🟡 | `ApmTraceRollupService.java:143-185` | 워터마크가 전진한 버킷은 재계산하지 않는다. | LAG 3분 이후 도착한 스팬은 4종 집계에 영구 누락된다. 특히 SERVICE 부모-자식 결합은 두 서비스 수신 지연 차이에 민감하다. | 명시된 허용 지연을 넘는 데이터를 재처리할 lookback 창 또는 dirty-bucket 재집계 전략을 두고, 손실 한계를 API/운영 지표에 노출하라. |
| 6 | 🟡 | `ApmRetentionJob.java` (그룹 정리 단계 부재) | `apm_error_group`·`apm_db_query_group` 90일 보존 정리가 없다. | 살아 있는 서비스의 그룹 본체가 무기한 증가해 설계 §7의 보존 정책과 다르다. | `last_seen_at < now()-90d` 삭제 단계를 retention job에 추가하라. |
| 7 | 🟡 | `V45__apm_trace_rollup.sql:97-122` | `apm_sql_norm`이 PostgreSQL dollar-quoted literal 등을 마스킹하지 않는다. | `$$secret$$`/`$tag$secret$tag$` 값은 `query_norm`에 그대로 남는다. 이는 `ApmSqlPolicy`를 통과한 뒤의 마지막 방어선이라는 주석과 맞지 않는다. | dollar-quoted 문자열·dialect literal을 정규화하거나, 원문 허용 여부와 무관하게 표시용 `query_norm`은 강제 마스킹하라. |
| 8 | 🟢 | `ApmTraceRollupJob.java:59-62` | `requiresActiveLicense=false` | 외부 수집·알림이 아니라 보존 전 원본을 파생 저장하는 내부 작업이며, 만료 중 중지하면 원본 삭제 뒤 영구 공백이 생긴다. | 현 판단이 타당하다. 단, 라이선스 만료 중 실행 사실을 운영 로그/문서에 유지하라. |

### 요청서 불안 5건 판정

1. 실 트래픽/SERVICE 조인·BRIN: **미해소**. 코드·픽스처 테스트만으로 실제 수신 순서와 BRIN 상관관계는 검증되지 않았습니다.  
2. 그룹 본체 90일 정리: **미해소**. 실제 retention 단계가 없습니다.  
3. 최대 288버킷 단일 트랜잭션: **미해소**. WAL·잠금 시간 실측 근거가 없습니다.  
4. 휴리스틱·route·산점도: **부분 해소**. 휴리스틱/route 제한은 계약에 명시됐으나 산점도는 비결정적 표본 문제로 여전히 부정확합니다.  
5. 미구현 4개: **타당**. layout은 저장 모델 부재, treemap·slow-series·sankey는 기존 조회 조합으로 대체 가능하며 별도 EP가 필터 불일치 위험을 만듭니다.

### 다음 커밋 전 반드시 고칠 것

- [ ] 예외 그룹의 덧셈 UPSERT를 재실행 안전하게 변경
- [ ] APM 읽기 EP에 운영자 이상 권한을 실제로 적용
- [ ] `sampleStack`·attrs·원문성 SQL의 열람 정책을 분리
- [ ] 산점도 상한 표본을 안정적·시간 대표적인 방식으로 변경
- [ ] NULL을 포함해 mixedBounds를 판정
- [ ] error/db 그룹 90일 retention 추가
