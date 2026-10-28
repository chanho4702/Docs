# 스펙 7a-2 — 배치 7a 속행 (서버 페이징 REST·pageSnapshot 원상 복귀·테스트)

## 복구 컨텍스트 (먼저 읽어라)
작업 트리에는 **7a 1부가 이미 적용**되어 있다 (되돌리지 말 것):
- `ActiveObjectsApprovalRequestRepository`: hydrate(500 청크)·`findMeta`·`findApproverViaGroupsBatch` — 완료
- `ApprovalRestResource`: findMeta/viaGroups 배치 직렬화, Flow IN 조회, spaceKey/spaceName 파생, `shouldRestore` 규칙 — 완료
- `ApprovalNotificationEntity` 길이/인덱스, store 정렬·limit·mark-read WHERE — 완료
- `ApprovalWorkflowService.pageSnapshot` 신설 — 존재하나 아래 결함 수정 필요
- README fromRequestId 규칙 문구 — 완료

1부에서 "C9가 도메인 새 메서드를 해석하지 못한다"던 문제는 **stale `approval-confluence9/target/classes/kr/.../domain/*.class` 그림자** 때문이었고 방금 삭제됐다. 이제 `mvn -pl approval-confluence9 -am test`가 도메인을 먼저 빌드하므로 `pageSnapshot`이 정상 해석된다.

## 반복 실수 금지 (위반 = 즉시 FAIL)
1. 파일 재포매팅 금지 — 손대는 줄만 수정.
2. 검증 게이트 우회 금지 — 테스트 의미 바꿔치기 금지.
3. 원시 제어 문자 금지.
4. text block 이스케이프: `\d` → `\\d`.
5. null 마커 맵에 `putIfAbsent` 금지 — `containsKey` 가드.
6. C10 파일 수정 금지, 단 컴파일 유지.
7. 빌드는 테스트만 — `clean`/`package`/`install` 금지 (dev 인스턴스 실행 중).
8. git 커밋 금지.

## 검증 게이트
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -pl approval-confluence9 -am test
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -pl approval-confluence10 compile
```

## 작업 1 — `pageSnapshot` 만료 sweep 확장 + 패널/매크로 원상 복귀

### 1-1. `ApprovalWorkflowService.pageSnapshot` (approval-domain)
현재 구현은 **최신 PAGE 요청 1건만** 만료 sweep 한다. 이러면 매크로(CONTENT_REGION)가 snapshot을 쓸 때 영역 요청의 lazy expiration이 소실된다. 수정:
- snapshot의 **모든 요청**에 대해 `isDueForExpiry(now)`면 `expireDue(id)` 후 목록 내 교체. (기존 주석 취지대로 만료할 것이 있을 때만 lock 진입 — due가 아닌 요청은 손대지 않는다.)
- `findLatestPageRequest`는 pageSnapshot 위임 유지. **latest 선택 규칙이 리팩터링 전(HEAD 커밋의 원래 루프)과 동일한지 확인**하고 다르면 원래 규칙으로 맞춰라 — `git show HEAD:approval-domain/src/main/java/kr/dmove/confluence/approval/domain/ApprovalWorkflowService.java`로 원본을 확인할 것. 동률 처리(같은 createdAt)까지 포함해 의미 변화 0이어야 한다.
- 서비스에 `findLatestContentRegionRequest`(또는 동등 경로)가 있으면 같은 방식으로 snapshot 재사용이 가능한지 확인하되, **공개 시그니처와 의미는 유지**.

### 1-2. `ApprovalPagePanel` / `ApprovalRegionMacro` (c9)
1부가 `repository.findByPageId` 직접 호출로 우회해 둔 것을 **`workflowService.pageSnapshot(pageId)` 1회 호출**로 교체:
- 패널: snapshot에서 latest(PAGE, 기존 findLatestPageRequest와 같은 규칙)와 approvedHistory 파생. 렌더 HTML은 기존과 동일해야 한다.
- 매크로: snapshot에서 해당 regionKey의 latest(기존 findLatestContentRegionRequest의 최신 선택 규칙 — revision·updatedAt — 재현)와 history 파생.
- lazy expiration 의미(마감 지난 PENDING이 렌더 시점에 EXPIRED로 보임)가 1부 이전과 동일하게 복원되는지 확인.

## 작업 2 — 서버 페이징·필터 REST (원 스펙 7a "변경 4" 전체)

`GET /approvals/mine`·`/mine/requested` 공통 계약. `_workspace/spec-7a-backend.md`의 "변경 4" 절을 그대로 구현하라. 요약:
- 파라미터: `limit`(기본 50, 1~200 클램프), `offset`(기본 0, 음수 400), `status`(CSV 화이트리스트 외 400), `q`(제목 부분일치·대소문자 무시·100자 절단), `spaceKey`, `requesterKey`, `flowId`, `createdFrom`/`createdTo`(ISO-8601 Instant, 파싱 실패 400, `from ≤ t < to`), `due`(soon|over|none 외 400, PENDING 외에는 false), `myTurn=1`, `myDecided=1`.
- 처리: 후보 로드(merge+canView) → 후보 집합에서 `statusCounts`(상태별 + myTurn·dueSoon·dueOver 건수)와 `facets`(requesters/flows/spaces — key+표시명, 이름 오름차순, 최대 100) 계산 → 필터 → `updatedAt` desc 정렬 → `total` → `[offset, offset+limit)` 슬라이스만 직렬화.
- 응답: `{"items":[...], "total": N, "statusCounts": {...}, "facets": {...}}` — 기존 배열 형태 폐기.
- due/myTurn/myDecided 판정은 직렬화 로직과 **한 곳의 술어**를 공유하도록 추출(이중화 금지). 필터·집계에서 페이지 조회는 기존 `pages` 캐시 재사용(페이지당 1회).
- `/mine/requested`도 동일 파라미터·응답 계약 (actorKey는 기존 관례 유지).

## 작업 3 — 알림 REST 배치화 (미완이면)

`notifications` 엔드포인트: 알림 1건당 `repository.find`(3쿼리)+getPage 2회 → 알림들의 requestId를 모아 c9 저장소의 배치 메서드(`findAllByIds(Collection<UUID>)` — 없으면 hydrate를 노출하는 이 이름으로 신설) 1회로 대체. pageTitle은 페이지 캐시, 이벤트 탐색은 하이드레이션된 aggregate에서. 같은 requestId 중복 알림은 맵 재사용. (이미 반영돼 있으면 확인만 하고 넘어가라.)

## 작업 4 — 신규 테스트 (원 스펙 7a "테스트" 절)

기존 테스트 파일 패턴(JUnit5, Proxy/수제 fake — Mockito 없음)을 따라 approval-confluence9 테스트로:
1. `shouldRestore` 4조합: fromRequestId+approverKeys → 복원 안 함, +approverGroups → 안 함, +steps → 안 함, fromRequestId 단독 → 복원. (`StepRestorationTest`에 추가 또는 인접 신규 파일.)
2. 페이징 파라미터 정규화: limit 클램프(0 이하/비숫자→50, 1~200 유지, 201→200), offset 음수 거절, status CSV 화이트리스트 판정. (정적 헬퍼로 추출해 테스트.)
3. 필터 술어: due(soon/over/none)·myTurn·myDecided — `ApprovalRequest.restore`로 조립한 aggregate로 검증.
4. IN 청크 분할: 499/500/501 경계에서 청크 수·원소 보존 (분할 헬퍼를 정적으로 추출).
5. `pageSnapshot`: due인 PENDING이 여러 건일 때 전부 EXPIRED로 sweep 되는지 (approval-domain 테스트 — 기존 ApprovalWorkflowService 테스트 파일 패턴 재사용).

## 완료 보고 형식
- 변경 파일 목록 + 각 1줄 요약
- 검증 게이트 2개 명령 실제 출력 요약 (모듈별 테스트 수)
- 스펙 이탈이 있으면 사유
