# 배치 6a 독립 교차 검토

검토 기준: `git diff 2b894ed..1d79ffb`, `_workspace/design-batch6.md` §D, `_workspace/qa-6a3.md`.

## 발견 사항

### 1. 치명 / `approval-confluence10/src/main/java/kr/dmove/confluence/approval/c10/panel/ApprovalPagePanel.java:230`

**근거**: 공유 `approval-domain`의 `ApprovalStatus`에 `CANCELLED`가 추가되었지만, C10의 `statusLabel(ApprovalStatus)` switch는 `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`만 처리한다. Java의 enum switch expression은 exhaustive해야 하므로 C10은 현재 domain 소스와 함께 컴파일되지 않는다. C10 repository의 `ApprovalStatus.valueOf(...)`는 새 값 자체는 읽을 수 있으므로, 특히 저장된 `CANCELLED` 요청을 C10이 렌더링해야 할 때가 아니라 빌드 단계에서 먼저 차단된다. 로컬에 Maven 실행 파일이 없어 전체 컴파일 명령은 실행하지 못했으나, switch expression의 컴파일 규칙상 정적으로 확정되는 오류다.

**권장 수정**: C10 `statusLabel`에 `case CANCELLED`를 추가하고, C10의 상태 CSS/표시 정책도 함께 정한다. 공유 domain enum을 확장할 때 두 플랫폼 모듈의 exhaustive switch를 컴파일하는 CI 검사를 추가한다.

### 2. 중대 / `approval-confluence9/src/main/resources/js/approval.js:615-628`

**근거**: C9 요청 폼 submit 경로가 생성 URL에 `resourceType`, `pageId`, `contentVersion`, `steps`, `regionKey`, `flowId`, `fromRequestId`만 붙인다. 새 REST 파라미터인 `requestMessage`와 `regionHash`는 읽지도 전송하지 않는다. 또한 같은 파일과 `ApprovalMarkup.java`에는 `requestMessage` textarea를 생성하거나 처리하는 변경이 없다.

따라서 REST의 메모 저장 코드(`ApprovalRestResource.java:155, 164-166, 286-291`)는 외부 API 호출에서만 도달하며, 기존 매크로 UI의 요청 메모 기능은 사용할 수 없다. 더불어 영역 요청은 렌더 시점의 본문 해시를 보내지 않으므로 `ApprovalRestResource.java:186-190`의 optimistic conflict 검사가 사실상 비활성화된다. 사용자가 모달을 연 뒤 다른 사용자가 영역을 수정해도, 서버는 새 본문 해시로 요청을 만들어 저장한다.

**권장 수정**: 요청 폼에 최대 500자 `requestMessage` 입력을 추가하고, submit 시 trim/길이 검증 뒤 `encodeURIComponent`로 전송한다. 영역 렌더링 시 계산한 hash를 container dataset 등에 넣고 `regionHash`도 전송한다. 해당 두 파라미터의 전달 및 409 동작을 browser/JS 테스트로 검증한다.

### 3. 중대 / `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/macro/ApprovalRegionSupport.java:266-267`

**근거**: `normalizeEmptyElements`의 정규식은 중첩 반복(`((?:...)*?)`와 뒤의 `\\s*`) 및 backreference를 사용한다. storage format은 페이지 편집자가 제어할 수 있고, 이 코드는 REST 생성·페이지 업데이트 리스너·목록 직렬화에서 실행된다. Java 17에서 다음 입력으로 실제 재현했다.

```text
<a[공백 5,000개]></b>
```

`replaceAll`이 `StackOverflowError`를 발생시킨다(공백 1,000개도 약 19ms였고, 더 큰 입력에서 재귀적 regex matcher가 stack을 소진). `StackOverflowError`는 `RuntimeException`이 아니므로 리스너의 `catch (RuntimeException)`에도 잡히지 않는다. 수백 KB storage format 또는 악의적으로 구성된 approval-region 본문 하나로 페이지 저장/리스너 처리 및 요청 API를 실패시킬 수 있다.

**권장 수정**: 이 정규식을 제거하고 token scanner 결과를 사용해 빈 요소를 정규화하거나, 최소한 단일 패스의 명시적 parser로 `<name ...></name>`만 변환한다. 입력 크기 상한 및 공격성 공백/태그 케이스를 포함한 회귀 테스트를 추가한다. 오류 격리는 `Error`를 잡는 방식이 아니라 정규식 자체를 없애는 것으로 해결해야 한다.

## 리뷰 범위에서 문제없음을 확인한 항목

- `cancel`, `approve`, `reject`, `expireForContentVersion`, `expireDue`는 모두 `ApprovalWorkflowService.withRequestLock`을 거쳐 동일한 target lock 안에서 최신 요청을 다시 읽고 저장한다. 취소/만료와 REST 결정이 동시에 도달해도 한 상태 전이만 먼저 확정되고, 뒤 경로는 closed 상태로 거절 또는 no-op 된다.
- 리스너는 각 요청을 순차 처리하며, 영역 자동 취소는 `scan 성공 + 저장 해시의 현 규칙 버전 + 현재 영역 부재`에서만 수행한다. 저장 해시 부재·규칙 버전 불일치·파싱 실패는 `EXPIRE` fallback으로 처리되어 자동 취소 안전장치를 우회하지 않는다.
- `CANCELLED`는 domain의 `ensureOpen`, content-version 만료, deadline 만료 필터에 의해 terminal 상태로 유지되며, 취소 이벤트도 append-only로 남는다.
- C9 REST의 새 `requestMessage`/`regionHash` query parameter는 optional이므로 기존 C9 호출자의 요청 형식 자체와는 wire-level 충돌하지 않는다. domain의 기존 `request`/`requestSequential` overload도 보존되어 C10 REST의 기존 호출 signature는 유지된다.
- `regionHashes`는 storage format을 한 번 token화하고 요청 키별로 그룹화해 해시한다. 위 정규식 결함을 제외하면, 일반적인 수백 KB 문서에서 영역 수에 비례해 반복 스캔하지 않는 구조다.
