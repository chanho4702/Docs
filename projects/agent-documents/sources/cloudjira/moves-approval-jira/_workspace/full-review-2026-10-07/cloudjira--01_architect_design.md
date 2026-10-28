# 전체 검수: 백엔드 경계·정합성 설계 검토

검토일: 2026-10-07. `.claude/skills/feature-design/SKILL.md`, `CLAUDE.md`, 작업 규칙과 실제 resolver/trigger/repository를 대조했다. 기존 변경이 많아 소스 코드는 수정하지 않았다. 아래는 실행 결과로 확인한 결함과 구분되는 **코드 근거 기반 검토**다.

## 우선 수정할 문제

### P1 — 보관 내보내기에 결재자·감사 이벤트가 빠진다

- 근거: `src/resolver/retention/RetentionRepository.js:101`, `:119`의 `findApprovers`와 `findEvents`는 `WHERE request_id IN (?, …)`에 UUID 문자열을 그대로 바인딩한다. `approvalApprover.sql.js:7`, `approvalEvent.sql.js:6`의 실제 컬럼은 `BINARY(16)`이며 저장 시 `UUID_TO_BIN(?)`을 사용한다. 같은 retention 저장소의 삭제는 변환한다.
- 재현: 승인자·이벤트가 있는 보관 만료 요청을 내보내면 요청 본문은 있지만 두 부속 목록은 SQL에서 매칭되지 않아 빈 목록이 된다. 내보내기 완료 후 삭제하면 근거가 영구 소실된다.
- 권고: 두 IN 절을 `UUID_TO_BIN(?)` 목록으로 바꾸고 실제 binary 저장 규약을 확인하는 저장소 계약 테스트를 추가한다. `forExport` 형제 저장소도 함께 대조한다.

### P1 — 보관 정책을 늘리거나 무기한으로 바꿔도 예전 삭제 범위를 사용할 수 있다

- 근거: `RetentionService.js:170`의 `purgeExported`는 `state.lastExport.cutoff`만 사용한다. `setRetentionYears`는 예전 `lastExport`를 유지한다. `getRetention`의 `purgeableCount`도 예전 cutoff만 집계한다.
- 재현: 1년 정책에서 내보내기를 완료한 뒤 10년 또는 0(무기한)으로 변경하고 삭제하면 새 정책상 보관해야 할 요청까지 지울 수 있다.
- 권고: 삭제와 삭제 가능 건수에 `min(lastExport.cutoff, 현재 정책 cutoff)`를 적용한다. 무기한이면 삭제를 막는다. 정책 변경 후 재내보내기 필요 여부와 기존 파일의 유효 범위를 명시한다.

### P1 — 확장 대상의 내보내기 파일이 삭제되는 부속 데이터를 보존하지 않는다

- 근거: 서버 `RetentionService.exportExpired`는 `transition`, `fieldChange`, `worklogCreate`, `worklogCertification`을 요청에 붙이고 `RetentionRepository.CHILD_TABLES`는 해당 부속 테이블을 삭제한다. 메인 검토에서 `exportRetentionExcel`이 이 블록들을 Excel에 싣지 않는 것이 확인됐다.
- 재현: 필드 변경·전환·워크로그 생성·인증 요청을 파일 생성 후 삭제하면 대상의 이전/새 값, 적용 상태, 제출 스냅샷 등이 파일에 남지 않는다.
- 권고: 삭제 대상 부속 테이블과 파일의 시트/열 계약을 하나의 명세로 맞춘다. Excel 전체 파일 생성 검증에서 실제 셀 값까지 확인한다.

### P2 — 비활성 라이선스에서도 임박·독촉 알림이 생성된다

- 근거: `ExpiryService.js:238`, `:305`는 `notificationStore.insertIgnore(rows)`를 직접 부른다. 저장소에는 라이선스 검사가 없다. 일반 경로 `NotificationService.js:400`만 `shouldEmitNotifications()`를 확인한다. 스윕 전체를 막지 않는 규칙 자체는 올바르지만 알림 두 종류가 그 경계를 우회한다.
- 재현: production 라이선스 판정이 INACTIVE인 상태에서 스윕을 실행하면 만료 알림은 차단되지만 DUE_SOON/REMINDER는 저장된다.
- 권고: 스윕의 알림 생성 경계에서 공통 라이선스 판정을 주입하고, 만료·정리 작업은 계속 진행한다. 명시적 INACTIVE에서 직접 알림 INSERT가 0회인지 검증한다.

### P2 — 업무함 스캔 한도 뒤에 있는 가시 요청을 더 볼 수 없다

- 근거: `InboxService.listInbox`는 `MAX_PASSES=4`의 스캔 한도로 끝나더라도 `hasMore = !reachedEnd && survivors.length >= limit`으로 판단한다. `survivors < limit`이면 아직 읽지 않은 원본 행이 있어도 다음 커서를 버린다. 알림의 형제 목록은 원본 페이지 길이를 반영해 커서를 유지한다(`NotificationService.js:336`).
- 재현: 업무함 앞부분에 열람 권한을 잃은 이슈가 충분히 많아 네 번의 스캔에서 살아남은 행이 limit보다 적고 뒤쪽에 가시 행이 있으면 이후 요청을 조회할 방법이 사라진다.
- 권고: 반환 limit 달성과 원본 데이터 소진을 구분한다. 예산 종료 시 마지막 스캔 커서와 `hasMore=true`를 제공하고, 원본 마지막 페이지 확인 때만 false로 닫는다. 가시 행 0개여도 다음 커서를 허용한다.

### P2 — 독촉·임박 알림 후보 상한이 특정 요청을 계속 굶길 수 있다

- 근거: `ApprovalRepository.findReminderCandidates:760`, `findDueSoon:779`는 첫 100건만 읽는다. 이미 발송한 후보의 제거와 정책 판정은 SQL LIMIT 뒤 `ExpiryService.withoutSentEvents`에서 한다. 페이지 반복·커서가 없다.
- 재현: 오래 열린 요청 100건이 계속 PENDING이면 매일 같은 후보가 먼저 읽혀 이후 요청의 독촉은 발송되지 않는다. 임박 후보 100건이 정책상 알림 비활성이면 그 뒤 활성 요청도 빠진다.
- 권고: 후보 조회를 키셋 페이지로 진행하고 공통 시간/요청 예산을 적용한다. 이미 발송한 후보를 SQL에서 제외할 경우 단계·회차 키 계약도 유지한다.

## 설계 판단이 필요한 부분

### 실패 페이지를 버리는 스윕 정책은 마지막 정합성 방어선과 충돌한다

`TimesheetDriftService.js:35`, `WorklogHistoryRecorder.js:23`은 동일 페이지 실패가 24회면 페이지를 건너뛰고 `watermark: since`를 올린다. 이는 의도된 기존 정책이며 단순 코드 실수가 아니다. 다만 트리거도 실패를 삼키므로 실패한 변경의 ID를 보존하지 않으면 변경 이력·인증 무효화·마감 이후 변경 감지가 복구되지 않을 수 있다. 실패 ID 전용 재처리 큐나 운영자가 재실행할 수 있는 영속 범위를 남기고, 실패 없는 완주와 실패를 버린 완주를 상태에서 구분해야 한다. 현재 last_error 로그 문자열만으로는 데이터 복구 계약이 충분하지 않다.

### 권한 집계와 목록의 경계가 다르다

`InboxService.getInboxCounts`와 `NotificationRepository.unreadCount`는 건별 대상 가시성을 적용하지 않는다. 업무함 코드 주석에 명시된 기존 설계이므로 즉시 정보 유출로 단정하지 않는다. 그러나 작업 규칙의 목록 권한 불변식과 화면의 보이는 항목/숫자 일치는 충족하지 않는다. 권한을 잃은 이슈가 unread/내 차례 숫자에 계속 남는 UX와 조회 비용의 균형을 제품 결정으로 기록해야 한다.

### 보관 대상 집합은 cutoff만으로 불변이라고 볼 수 없다

`RetentionRepository.EXPIRED_WHERE`는 worklog/transition의 APPLYING/UNKNOWN을 제외한다. 해당 부속 행이 해결되면 부모 `updated_at`이 그대로인 요청이 예전 cutoff의 삭제 대상에 새로 들어올 수 있다. `confirmExport`는 서버의 완료 세션·요청 ID 집합을 저장하지 않고 클라이언트 cutoff/count만 기록한다. 따라서 코드 주석의 “같은 cutoff 대상 집합이 변하지 않는다”는 전제가 부속 행 상태를 포함하면 성립하지 않을 수 있다. 내보낸 request ID 목록 또는 완료 토큰의 서버 스냅샷을 삭제 허가 범위로 삼는 것이 가장 분명하다. 최소 개선은 완료 시점의 대상 상태와 삭제 시점을 다시 검증하는 것이다.

### 미적용 필드 변경 요청의 보관 경계가 전환·워크로그와 다르다

`EXPIRED_WHERE`는 worklog와 transition의 적용 대기를 제외하지만 field_change_request에는 대응 조건이 없다. 필드 변경 승인은 APPROVED와 실제 적용 상태가 별도이며 WAITING/FAILED/APPLYING일 수 있다. 3년이 지나 미적용 승인을 삭제할지, 적용 작업이 끝날 때까지 보호할지 명시되지 않았다. 보관 정책을 모든 대상 종류의 적용 생명주기와 일관되게 정의해야 한다.

### 필드 변경의 timeout 재시도는 상태 전환의 UNKNOWN 원칙보다 약하다

`domain/fieldChange/applyPlan.js`는 PUT 5xx/timeout을 FAILED TIMEOUT으로 만들고 FAILED를 재claim한다. 현재 값이 from이면 다시 PUT하고 to이면 ALREADY로 끝낸다. 이는 일반 재시도에는 실용적이지만, 첫 PUT은 성공했고 사용자가 이후 from으로 되돌린 경우 “첫 PUT이 실패했다”와 구분할 수 없어 다시 to로 덮는다. 현재 값 확인과 PUT 사이의 타 사용자 편집도 Jira 측 원자적 조건 없이 덮을 수 있다. 이는 SQL fencing token으로 해결되지 않는 외부 효과의 경계다. POST 이후 UNKNOWN을 유지하는 transition의 설계와 차이를 명시하고, field에도 changelog 증거 대조·명시적 재승인 또는 UNKNOWN 상태를 도입할지 결정해야 한다.

### 워크로그 이력의 삭제 가능 숫자도 현 정책과 다르다

`WorklogHistoryRetentionService.js:59`의 표시용 purgeableCount는 예전 export cutoff를 그대로 사용한다. 이 서비스의 실제 삭제는 `:149`에서 무기한을 차단하고 `min(lastExport.cutoff, policyCutoff)`으로 좁히므로 위 approval 삭제 버그와 심각도는 다르다. 두 보관 화면의 삭제 가능 숫자를 실제 삭제 조건과 일치시키는 공통 수정이 필요하다.

## 확인한 긍정적 경계와 검증 범위

### PIN 실패 횟수가 동시 요청에서 유실된다

`PinService.verify`가 저장된 failCount를 읽어 +1한 값을 `PinRepository.recordFailure`로 보내고, repository는 `SET fail_count = ?`로 덮는다. 같은 failCount를 읽은 동시 실패가 모두 같은 값만 기록하므로 5회 잠금 기준이 실제 시도 수와 달라진다. 성공 reset과 실패의 경쟁도 잠금 해제/재실패 결과를 왜곡할 수 있다. 실패 증가와 잠금 시각 결정은 SQL의 원자적 업데이트/CAS로 묶고, 성공 초기화와 PIN 변경을 동일 세대의 기록에만 적용해야 한다. 이번 작은 수정에서는 정책 조회 장애의 PIN 우회만 막고 동시성 변경은 별도 설계로 남겼다.

- `TransitionExecutor`는 POST 시작을 먼저 영속화하고 UNKNOWN을 재POST하지 않는다. 신청자 소유권을 SQL 업데이트의 ownerKey까지 전달하며 증거 기반 소비 대조를 수행한다. 이번 정적 검토에서는 이 경계의 확정 결함을 찾지 못했다.
- 대상 가시성 공통 필터는 등록되지 않은 종류와 조회 실패를 숨긴다. 증명서도 요청 로드 후 어댑터 canView를 다시 확인한다.
- 트리거는 오류를 격리하고 상태 정합성 작업 자체를 라이선스로 막지 않는다.
- 이 보고 단계는 읽기 전용 검토다. 소스 변경, 테스트·빌드·배포는 수행하지 않았다. 부모 작업에서 구현과 전체 필수 검증을 이어간다.
