# 건별 승인 감사 보존·저장량 검토

2026-10-13 · 실제 코드 읽기와 모델 추정. 운영 SQL 용량을 측정한 결과가 아니며 Forge 물리 저장량·압축·통계 갱신 특성에 따라 달라진다. 한도는 현재 `StorageService.DEFAULT_LIMIT_BYTES`의 1GiB(1,024MiB)를 전제로 한다. 기존 이력만의 연 148/150MB 산정은 건별 승인 요청·업무함·인덱스를 포함하지 않으므로 재사용하지 않았다.

## 1. 이슈를 삭제하면 현재 어떤 일이 생기는가

Jira 이슈 삭제가 Approval SQL에 FK cascade를 실행하는 구조는 아니다. 이미 저장된 승인 요청·결정·cert·워크로그 이력은 각 보관 정리 경로가 지우기 전까지 남는다. 그러나 **저장되어 있다는 것과 현재 화면에서 볼 수 있다는 것은 다르다.** `getWorklogHistory`는 PermissionMap의 issue:view 가드, 목록은 `filterVisibleIssues`를 사용하므로 삭제된 이슈의 열람 권한을 확인할 수 없으면 기존 사용자 화면에서 제공하지 않는다. 관리자라는 이유로 삭제 이슈의 옛 내용을 자동 공개하지 않는다.

`trigger/onIssueChanged.js`는 이슈 일반/전환/필드 승인 처리를 부르며 삭제 이슈에 딸린 모든 워크로그의 삭제 이력을 직접 만드는 처리는 없다. 워크로그 deleted 이벤트와 보정 스윕이 실제 삭제를 관찰한 경우 이력에 기록한다. 이슈 삭제로 각 워크로그 이벤트가 모두 오거나 행위자를 알 수 있다고 가정하면 안 된다. 미러 없는 미관측 삭제는 전체 원문·이전 값을 복구할 수 없다.

### 안전한 최소 보존 설계

1. 삭제를 이유로 승인·시간·행위자·결정 시각·출처 근거를 제거하지 않는다. 삭제 관측은 append-only 이벤트로 남기고 원래 승인 기준과 구분한다.
2. 삭제 이슈 조회는 기존 일반 resolver의 issue:view를 우회하지 않는다. 관리자 데이터관리의 이미 허용된 감사 export 경로를 재사용하여 저장된 기록을 파일로 제공하고 범위·호출자·확정 세션을 감사 기록에 남긴다. UI 표시는 “이슈 접근 불가”이며 삭제와 권한 상실을 asUser 404만으로 구분하지 않는다.
3. 완전한 삭제 원문 감사가 필요하면 삭제 전에 수집한 snapshot과 별도 삭제 관측이 필요하다. 과거 제목만으로 현재 프로젝트 권한을 추정하거나 과거 팀장에게 공개하는 새 resolver는 만들지 않는다. 이슈 화면 권한과 독립된 감사 보관함을 만들 때는 명시적인 현재 감사 관리자 권한·export 정책으로 설계한다.

## 2. 실제 저장 내용과 행 증가

`certificationSnapshot`에는 worklogId·issueId·authorId·started·seconds·sourceUpdatedAt·fingerprint만 들어간다. 설명은 fingerprint 계산에 포함하지만 **원문은 snapshot에 저장하지 않는다.** 새 모델 메타데이터(approvalModel, purpose 등)는 request snapshot에 가산된다.

`worklog_history`는 설명 지문과 40코드포인트 앞부분을 저장한다. `worklogHistoryKeepComment=false`가 기본이다. true이면 before/after 원문을 각각 최대 4,000코드포인트로 남기며, 전체 ADF 원본이나 무제한 원문 보존은 아니다. 설명 수정이 없으면 양쪽 설명을 매번 중복 저장하지 않는 delta 구조다. 한국어 4,000자는 약12KB, 최대4바이트 코드포인트로는16KB이므로 설명 변경 하나의 before+after가 최대32KB 추가될 수 있다.

정상 경로 한 건을 한 승인자가 한 번 승인하는 모델:

| 저장소 | 새 행 수 | 데이터 KiB 범위 | PK·보조 인덱스 KiB 범위 |
|---|---:|---:|---:|
| approval_request | 1 | 0.30–0.65 | 0.35–0.70 |
| approval_approver + approval_event | 1 + 보통2(REQUESTED,APPROVED) | 0.30–0.50 | 0.15–0.30 |
| approval_inbox | 보통2(작성자·결재자) | 0.40–0.80 | 0.40–0.80 |
| worklog_certification + certification_request | 1 + 요청당1 | 0.60–1.00 | 0.10–0.20 |
| worklog_cert + cert_batch | 1 + 요청당1 | 0.35–0.65 | 0.12–0.25 |
| worklog_history + mirror | 평균1.2–2 + 1 | 0.35–0.70 | 0.20–0.40 |
| worklog_control + control_log + intent | 1 + 통제전이1–2 + 작성1 | 0.35–0.65 | 0.30–0.55 |
| 알림 등 단기 보조행 | 보통 요청/승인 각1, 보관 정리 후 누적 완화 | 0.10–0.20 | 0.08–0.15 |

합계는 대략 **건당4.5–9KiB** 계획 범위로 둔다. 물리 스토리지 실측값이나 DDL 최대 크기의 합은 아니다. 문자열은 일반 accountId 약40자·숫자 id·짧은 사유, 원문 설명 보관 OFF, 한 단계/한 결재자, 재요청 적음, 보조 인덱스의 키 복제를 고려한 가정이다. CREATE DDL 이후 추가 인덱스와 JSON 내부 표현, 긴 제목·사유·다중 승인·소명·재인증이 많으면 상한을 넘을 수 있다. cert_batch는 과거 월별 인증처럼 수십 건당1행이 아니라 현재 `projectApprovedWorklog`에서 **requestId당1행**이라는 점이 특히 중요하다.

반려 후 재요청은 certification/control/mirror 현재본을 재사용하지만 request·certification_request·approver·event·inbox·알림을 추가한다. 재인증은 cert_log도 추가한다. 따라서 “워크로그 수”뿐 아니라 “워크로그당 승인 시도 수”가 용량의 독립 변수다. intent는90일 정리, 알림은 기존 보관 정리 대상이라 정상 운영의 장기 성장률은 이 첫해 단순 누적보다 다소 낮을 수 있다.

## 3. 200명·연240근무일 시나리오

| 1인 하루 작성 | 연 워크로그 | 연 증가 예상 | 빈1GiB에서 이론상 가득 찰 때 | 기존50MiB에서85% 안내 도달 |
|---|---:|---:|---:|---:|
| 1건 | 48,000 | 211–422MiB | 약2.4–4.9년 | 약1.9–3.9년 |
| 3건 | 144,000 | 633–1,266MiB | 약0.8–1.6년 | 약0.65–1.30년 |
| 5건 | 240,000 | 1,055–2,109MiB | 약0.49–0.97년 | 약0.39–0.78년 |

같은 데이터가 계속 늘고 내보내기 후 정리가 없다는 단순 계산이다. 초기50MiB는 예시일 뿐 현재 사용량이 아니다. 기존 일반 history12개월/연동36개월·승인3년·cert/통제 이력 무기한 정책은 **자동삭제 예약이 아니다**. 사용자 파일 확인과 확정 범위 정리가 수행되지 않으면 기간이 지나도 공간이 저절로 비지 않는다. 승인 핵심 근거를 삭제에서 보호하면 그 부분은 계속 늘므로 3년 설정만으로1GiB에 들어간다고 보장할 수 없다.

예를 들어 설명 전체 보관을 켠 상태에서 건당 평균1KiB를 한 번 저장하면 연48,000/144,000/240,000건당 약47/141/234MiB가 추가된다. 설명 수정의 before+after는 더 늘어난다. 원문 감사 보존을 강화하는 결정을 용량 절감과 별개로 다뤄야 한다.

## 4. 보관 정리와 활성 승인 근거 위험

초기 점검에서 다음 실제 위험을 찾아 root/backend에 즉시 전달했다.

- `RetentionRepository`의 cutoff 조건은 열린 요청과 적용 대기만 보호했다. 완료 WORKLOG_CERTIFICATION의 approval_request·approver·event·certification_request도 지울 수 있어 현재 승인자/출처 증명과 새 Publisher의 승인 적격 판단이 사라질 수 있었다.
- `CertRetentionRepository.purgeBatch`는 기간 경과·export 확인 후 **현재 worklog_cert**도 지우고 게시 문서는 유지했다. 서버 잠금 근거와 Workforce 게시값이 서로 어긋날 수 있었다.
- 설명 전체 보관 OFF와 이력 cutoff 후 mirror 정리는 원본 설명/편집 상세를 복원할 수 없게 한다. 확정 시간 보존과 감사 원문 보존은 다른 기능이다.

현재 병행 구현에서 backend가 APPROVED WORKLOG_CERTIFICATION 및 approvalModel:1 cert 삭제 보호를 추가하는 중이다. 이 보고서는 구현 완료/전체 검증을 대신하지 않는다. 공용 EXPIRED_WHERE를 export에도 쓰므로 **삭제 보호가 승인 감사 파일 다운로드까지 막지 않게** export 선택과 purge 선택을 분리해야 한다는 후속 위험도 전달했다. 내보내기에는 승인 근거를 포함하고, 삭제는 안전한 대상만 허용해야 한다.

권장 최소안은 활성·확정 승인 근거를 보존하고 파일로 내보내되, 일반 알림·만료 비활성 이력 등 실제 정리 가능한 범위만 관리자 확인 후 삭제하는 것이다. 승인 원장 자체를 저용량 영구 요약으로 치환하려면 “누가·언제·무엇을·어떤 사유로 결정했는가”, snapshot hash, 출처, 원 요청 id, export manifest 참조를 유지하는 별도 아카이브 모델과 검증이 필요하다. 이번 작업에서 임의로 적용하거나 보관 기간을 단축하지 않는다.

## 5. 사용량 측정·관리자 알림 구현

`StorageService`는 이미 information_schema의 data_length+index_length·table_rows를 조회한다. 실제 사용량에 가까운 테이블 통계 추정이며 청구·한도 판정의 실시간 확정 수치라고 표시하지 않는다.

이번 변경은 같은 SELECT에 데이터/인덱스 분리 칼럼만 가산하고 응답에 `measurement:'ESTIMATED_TABLE_STATISTICS'`와 `management`를 추가했다. 임계치는 **70% NOTICE,85% WARNING,95% CRITICAL**이다. 반올림 전 비율로 판정한다. 안내 동작은 파일 내보내기→파일 확인→확정 범위 정리이며 자동삭제는 하지 않는다.

기존 `getStorageUsage`는 `{admin:true}` 가드다. frontend와 합의한 관리자 앱 진입/업무함 안내는 서버 isAdmin 확인 후 같은 API를 세션/하루 캐시로 재사용한다. 일반 사용자나 관리자 여부 미확인 상태에서는 호출하지 않는다. 데이터관리 화면에도 동일 배너를 제공한다. 시스템 알림은 `notificationKey:'storage:LEVEL'`의 단일 인라인 상태라 반복 행이 생성되지 않는다. 저장소가 꽉 차도 안내를 만들기 위한 SQL INSERT가 필요 없다. 추가 스케줄·일일 유휴 SQL·외부 메시지 전송은 없다. 관리자가 접속하지 않는 동안 별도 push/email을 발송하는 기능은 이번 구현 범위가 아니다.

기존 NotificationService는 requestId·이슈 가시성 필터를 전제로 하므로 가짜 승인 요청으로 관리자 저장 알림을 만들지 않았다. 테스트는 임계치 경계·95%/100% 초과·동일 수준 알림키·SELECT1회·데이터/인덱스 분리 총9건 통과했다.

후속 정밀 예측은 관리자 조회 시점의 통계 표본을 소량 KVS로 저장하고 충분한 기간(예:7–30일)의 성장량으로 남은 일수를 계산하는 방식이 적절하다. 저장량이 줄거나 표본이 부족하면 예측 없음으로 표시한다. 이 단계에서는 근거 없는 남은 일수를 UI에 만들지 않았다. 건당 용량 모델은 실제 건별 승인 수천 건의 테이블별 증가량과 비교해 보정해야 한다.

## 변경 범위

- 구현: `src/resolver/storage/StorageService.js`, `src/resolver/storage/__test__/StorageService.test.js`.
- read-only 검토: retention·history·control·approval·cert·트리거. 해당 프로덕션 코드는 다른 담당자가 소유한다.
- 검증: `npm test -- --runInBand src/resolver/storage/__test__/StorageService.test.js` — 1suite/9tests 통과. 빌드·배포·커밋 없음.
