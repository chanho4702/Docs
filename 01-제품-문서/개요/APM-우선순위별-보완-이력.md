---
title: APM 우선순위별 보완 이력
doc_type: reference
audience: [개발, 운영, QA]
status: current
owner: MovesEye 팀
baseline: 2026-10-06
reviewed_at: 2026-10-06
review_cycle: event-driven
source_of_truth: "BE 22eeff8·FE 59186c0·후속 stage5~8 소스 및 단계별 검증 기록"
be_commit: 2f84b554b33eea573f9128d8b69a561f02902a01
fe_commit: b8081cc61190e9db2123163ade46384c1dcf7450
deployment_scope: source
---

# APM 우선순위별 보완 이력

[전체 평가의 23개 우선순위](APM-%EC%A0%84%EB%B0%98-%EC%99%84%EC%84%B1%EB%8F%84-%ED%8F%89%EA%B0%80%EC%99%80-%EA%B0%9C%EC%84%A0-%EC%9A%B0%EC%84%A0%EC%88%9C%EC%9C%84.md)를 순서대로 처리하는 기록입니다. 아래에서 완료한 항목과 남은 과제를 구분합니다. 소스 검증과 운영 배포는 별도이며, 이 문서가 전체 APM의 규모·HA 지원을 보증하지는 않습니다.

## 1. 과거 원문 열람 권한

**문제:** `keepRawSql=true`일 때 저장한 원문은 설정을 `false`로 바꿔도 DB에 남습니다. 기존 조회 정책은 현재 설정이 꺼져 있으면 과거 행도 마스킹됐다고 판단해 비관리자에게 원문을 반환할 수 있었습니다.

**변경:** `ApmRawTextPolicy`에서 저장 설정에 따른 열람 분기를 제거했습니다. 기존 조회 권한을 통과한 요청 가운데 `ADMIN`·`SUPER_ADMIN`만 저장된 값을 그대로 받고, 비관리자는 현재 저장 설정과 관계없이 기존 SQL 마스킹을 적용받습니다. principal 또는 역할이 없을 때도 마스킹합니다. 권한 판단 중 설정 조회를 하지 않습니다.

| 경로 | 보호 대상 | 계약 변화 |
|---|---|---|
| `GET /apm/traces/{traceId}` | 스팬 속성·이벤트 속성·링크 속성의 기존 마스킹 대상 텍스트 | 경로·필드·자료형 동일 |
| `GET /apm/errors/{groupId}` | `sampleStack` | 경로·필드·자료형 동일 |
| 내보내기 | 기존 기본 마스킹, 관리자 명시적 원문 요청 | 실행 로직 유지, 설명 정정 |

관련 controller·DTO·권한·export 설명을 함께 정정했습니다. 스키마·Flyway·FE 자료형 변경은 없습니다.

**검증:** 권한 행렬·이미 마스킹된 값의 재처리·MVC 전달 테스트를 보강했습니다. 새 `ApmRawTextPolicyIT`는 실제 PostgreSQL에 저장 정책을 적용한 fixture를 넣고, 실제 JWT 인증의 설정 PUT과 상세 GET을 통해 ON→OFF 전후의 응답과 DB 원문 유지 여부를 확인합니다. **6개 클래스 79개 테스트가 실패·오류·skip 없이 통과**했고 독립 코드·API 검토에서 추가 차단 결함은 발견하지 못했습니다. 직접 DB fixture를 쓰므로 OTLP 수신 전체 E2E로 세지는 않습니다.

실행 범위는 `ApmRawTextPolicyTest` 8개, `ApmRawTextPolicyIT` 3개, `ApmReadAccessMvcTest` 8개, `ApmTraceAggQueryIT` 24개, `ApmExportServiceTest` 21개, `ApmExportIT` 15개입니다. 기존 다른 검증 횟수를 합산하지 않았습니다. 재현 결과는 [단계 1 검증 기록](../../_workspace/verification/apm-priority-20261006/stage1/summary.json), 독립 검토는 [단계 1 QA](../../04-%EB%B6%84%EC%84%9D-%EA%B0%90%EC%82%AC/APM-%EC%88%9C%EC%B0%A8-%EA%B0%9C%EC%84%A0-%EB%8B%A8%EA%B3%84-1-%EC%9B%90%EB%AC%B8-%EC%97%B4%EB%9E%8C-%EA%B6%8C%ED%95%9C-%EB%8F%85%EB%A6%BD-QA.md)에 있습니다. 구현 커밋은 `aab73fc`입니다.

**운영 의미와 한계:** 새 BE를 적용하면 과거 행에도 새 열람 정책이 적용됩니다. 설정 OFF는 과거 원문의 소급 삭제·변경이 아닙니다. 관리자의 RAW도 이미 마스킹된 데이터를 복원한다는 뜻은 아닙니다. 이번 변경은 기존 SQL 휴리스틱의 적용 권한을 고친 것으로, 임의 개인정보·span/event 이름·속성 키 전체의 제거를 보장하지 않습니다.

## 2~4. 누적계열·관측 순서·histogram 경계

원시 누적값 tracker의 identity를 속성 차원까지 분리하고, 정규화·epoch·단조 증가/리셋을 확인해 역순 자료가 기준점을 되돌리지 못하게 했습니다. histogram 경계가 바뀌면 이전 벡터와 차분하지 않으며 계열 수·배열 메모리 예산과 상태 안내를 보강했습니다. BE `22eeff8`, FE `59186c0`에 반영했습니다.

**검증:** BE 203개와 `bootJar`, FE Jest 117개와 전체 TypeScript 검사가 통과했습니다. 이 실행들은 10월 6일 이전 단계별 기록에 근거하며 이번 stage5~8 통합 실행 수에 중복 합산하지 않습니다.

## 5. 지연 데이터 재집계와 원본 보존

1m 원본 반영과 durable dirty marker를 같은 트랜잭션에 묶고, generation ACK, 상위 단계 전파, bootstrap, 복구/정방향 예산, advisory/date lock 및 source retention gate를 추가했습니다. 늦게 온 자료는 5m·1h 집계에 재전파하고, 원본의 DROP은 집계 frontier·보류 상태를 확인합니다. `V70__apm_metric_dirty_rollup.sql`은 도입 경계를 instant로 저장하고, legacy 전체를 자동 검증 완료로 취급하지 않습니다.

**검증:** stage5 격리 실행은 실제 PostgreSQL을 포함해 148개 통과였습니다. 현 트리 통합 회귀에서는 stage5 관련 선택 클래스의 일부를 다른 변경과 함께 실행해 전체 188개 중 실패·오류·skip 0을 확인했습니다. [stage5 증빙](../../_workspace/verification/apm-priority-20261006/late-rollup-be/stage5-summary.json)과 [계약](../../06-API-%EA%B3%84%EC%95%BD/APM-%EC%A7%80%EC%97%B0-%EB%A9%94%ED%8A%B8%EB%A6%AD-%EC%9E%AC%EC%A7%91%EA%B3%84-%EC%8B%9C%EA%B0%84%EC%B0%BD-%EB%B3%B4%EC%A1%B4-%EB%B3%B4%ED%98%B8-%EA%B3%84%EC%95%BD.md)을 참고하십시오.

**남은 정확성 결함:** Availability, SLO/burn/snapshot, RED·endpoint export는 dirty/blocked/legacy marker를 아직 최종 completeness 판정에 연결하지 않았습니다. 이 소비자는 watermark만으로 오래된 구간을 완전하다고 취급할 수 있습니다. 따라서 stage5의 수집·rollup·retention 보호는 구현됐지만, **소비자 표시까지 end-to-end 완결된 상태는 아닙니다.** 이 결함은 거짓 OK/DATA를 만들 수 있으므로 다음 구현 게이트입니다. 분석안은 [완전성 조회 설계](../../03-%EA%B8%B0%ED%9A%8D-%EB%B0%B1%EB%A1%9C%EA%B7%B8/APM-%EB%A1%A4%EC%97%85-%EC%99%84%EC%A0%84%EC%84%B1-%EC%A1%B0%ED%9A%8C-%EC%97%B0%EB%8F%99-%EC%B5%9C%EC%86%8C%EC%95%88.md)에 있습니다.

## 6. trace 재분류의 이전 집계 제거

재집계 시 해당 시간 구간의 과거 edge/dependency 집계를 지운 뒤 동일 트랜잭션에서 다시 계산합니다. source snapshot, stage lock, watermark 경쟁 검사와 빈 forward 시 과거 lookback 정정 저장을 보강했습니다.

**검증:** PostgreSQL 기반 `ApmTraceReclassificationIT` 15개와 기존 trace rollup/rollback 24개를 통과했습니다. 통합 실행 증빙은 [stage6 요약](../../_workspace/verification/apm-priority-20261006/late-rollup-be/stage6-summary.json), 구현 계약은 [재분류 계약](../../06-API-%EA%B3%84%EC%95%BD/APM-trace-%EC%9E%AC%EB%B6%84%EB%A5%98-%EC%A7%91%EA%B3%84-%EA%B5%90%EC%A0%95-%EA%B3%84%EC%95%BD.md)입니다.

## 7. RUM 관측 시각과 partition 생성

RUM span의 과거/미래 허용 창을 고정하고 24시간 경계를 정확히 비교합니다. 화면용 오래된 page aggregate는 유지하면서 보존이 끝난 span의 partition을 다시 만들지 않도록 준비와 저장의 범위를 일치시켰습니다.

**검증:** parser·store·MVC·실제 PostgreSQL schema 시험 53개가 별도 worktree에서 통과했고, 현 트리 통합 실행에도 네 클래스가 포함됐습니다. 상세는 [RUM 요약](../../_workspace/verification/apm-priority-20261006/rum-time/summary.json)과 [계약](../../06-API-%EA%B3%84%EC%95%BD/APM-%EA%B4%80%EC%B8%A1-%EC%8B%9C%EA%B0%81%EA%B3%BC-%ED%8C%8C%ED%8B%B0%EC%85%98-%EC%A4%80%EB%B9%84-%EB%B3%B4%EC%99%84.md)입니다. 서버 trace timestamp/partition guard는 미완료라 7번 전체 완료로 표시하지 않습니다.

## 8. archive 무결성과 원본 삭제 차단

파일 hash/size 변경 또는 파일 부재를 `CORRUPT` 증거로 기록하고, CAS fingerprint가 현재 원장 파일과 같은지 확인한 경우에만 격리합니다. integrity 실패는 archive hold를 강제하며 파일을 삭제해도 실패 증거는 유지합니다. 유효한 재생성 후에만 hold를 해제하고, `CORRUPT` 파일 다운로드·재검증은 거절합니다. FE에서는 손상 파일의 삭제·용량 관리는 허용하고 다운로드·재검증은 분리하며, query 갱신 실패가 이전 `OK` 화면을 되살리지 않게 했습니다.

**검증:** 현 트리 통합 Gradle 실행에서 archive BE 55개(서비스 11, drop gate 21, 실제 PostgreSQL cold archive 23)가 통과했습니다. FE는 archive 관련 Jest 84개와 전체 `tsc --noEmit`이 통과했습니다. [FE QA 기록](../../08-%EA%B2%80%EC%A6%9D-QA/APM-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C-%EB%AC%B4%EA%B2%B0%EC%84%B1-FE-%EB%B0%98%EC%98%81-%EA%B2%80%EC%A6%9D.md)과 [archive 계약](../../06-API-%EA%B3%84%EC%95%BD/APM-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C-%EB%AC%B4%EA%B2%B0%EC%84%B1-%EA%B3%84%EC%95%BD.md)을 확인하십시오. source freshness 판정은 별도 범위로 남습니다.

## 다음 우선 작업과 종합 한계

우선순위 5의 소비자 completeness를 닫고, 7의 서버 trace 시간창을 보완한 뒤 9~10 환경 범위·선택 행·수동 갱신을 계약대로 적용합니다. 이어서 알람 원자성, 실제 목표 부하, 목록/저장 예산, HA fencing 등을 평가 순서대로 처리해야 합니다. 지금 검증은 특정 회귀에 대한 소스 증거이며 전체 E2E·복합 부하·다중 노드·운영 복구 훈련은 아닙니다. 규모 지원이나 HA 완료를 보증하지 않습니다.

상세 감사의 기준 상태와 이후 수정 결과를 혼동하지 않도록 [초기 구현 보완](APM-%EA%B5%AC%ED%98%84-%EB%B3%B4%EC%99%84%EA%B3%BC-%EB%8C%80%EA%B7%9C%EB%AA%A8-%EC%9A%B4%EC%98%81-%EC%A4%80%EB%B9%84-%EC%83%81%ED%83%9C.md)·[전체 평가](APM-%EC%A0%84%EB%B0%98-%EC%99%84%EC%84%B1%EB%8F%84-%ED%8F%89%EA%B0%80%EC%99%80-%EA%B0%9C%EC%84%A0-%EC%9A%B0%EC%84%A0%EC%88%9C%EC%9C%84.md)·이 이력을 함께 유지합니다.

## 5번 후속: 소비자 완전성 차단

2026-10-06 후속 구현에서 `ApmMetricCoverageReader`를 추가해 rollup stage 상태, legacy cutover/hold, dirty queue를 같은 PostgreSQL `REPEATABLE_READ` 스냅샷에서 판정하도록 연결했습니다. 불완전 구간의 SLO는 `UNKNOWN`/`NOT_MEASURABLE`, SLO snapshot은 저장 거부, availability는 캐시를 무효화하고 값 미응답으로 처리합니다. RED export는 영향 버킷을 `PARTIAL` 처리하고 숫자를 비우며, endpoint export는 요청 범위 집계 특성상 영향 범위와 겹치는 행의 숫자 전체를 비웁니다.

**검증:** `ApmEndpointExporterTest`, `ApmRedSeriesExporterTest`, `ApmAvailabilityServiceTest`, SLO 계산·서비스·snapshot 테스트 및 `ApmMetricCoverageReaderIT` 등 111개 테스트가 통과했습니다. 이 검증은 선택 회귀군이며 전체 부하/HA 증명은 아닙니다. M1 원본 메트릭은 이 rollup 완전성 판정 대상이 아니며, 서버 trace timestamp/partition guard 등 7번의 나머지 작업도 미완료입니다.
