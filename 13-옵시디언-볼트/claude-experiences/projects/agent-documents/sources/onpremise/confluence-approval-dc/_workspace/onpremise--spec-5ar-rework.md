# 배치 5a 재작업: QA FAIL 12건

워킹트리(커밋 82e5ce8 이후)에 배치 5a가 적용되어 있다. 그 위에서 결함만 고친다.

**시작 전에 반드시 읽어라:**
1. `_workspace/qa-5a.md` — 결함 12건 위치·근거·재작업 지시
2. `_workspace/design-reapproval.md` §2.3

## 필수 수정 (우선순위)

### 1. C-1: 옛 의미 테스트 잔존 → 빌드 red
`ApprovalRequestTest`의 `승인된_요청도_페이지가_편집되면_만료된다`(:146 부근)를 새 모델로 재작성:
"승인된_요청은_페이지가_편집되어도_유지된다" — expireForContentVersion이 false를 반환하고
상태가 APPROVED로 남는 것을 단언. 전 테스트 green이 완료 조건이다.

### 2. F-2 + F-3: fromRequestId 복원 전략 교체
단계 지정 문자열(`group:X;user:Y`) 재구성 방식을 **폐기**하고, 단계 단위 스냅샷 복원으로 바꾼다:

- 이전 요청의 `steps()`를 순회하며 `List<Collection<String>> stepApprovers`와
  `List<Integer> stepRequired`를 직접 구성한다.
- 각 단계의 판정 (viaGroups는 findApproverViaGroups 결과를 **단계 구성원에 한정해** 조회):
  (a) **명확한 그룹 단계** — 구성원 전원의 viaGroup이 동일한 non-null 값 G:
      G를 재확장(resolveDirectRequest(List.of(), List.of(G)) 경로) 후 그 구성원으로 단계 구성,
      required는 등록 그룹의 requireAll이면 확장 인원수, 아니면 1.
      단, G가 Confluence에 없거나 **등록 그룹이 아니거나 비활성(enabled=false)이면 400**
      ("결재선의 그룹 {G}을 더 이상 사용할 수 없습니다. 결재선을 다시 구성해 주세요.") — F-4 해소.
  (b) **그 외 전부**(단일 사용자, viaGroup 혼합, 전원 null, 다인) — 이전 단계의 구성원과
      requiredApprovals를 **스냅샷 그대로** 사용. 재확장하지 않는다.
- 구성한 리스트로 `workflowService.requestSequential(target, revision, stepApprovers, stepRequired, ...)`
  를 호출한다 (resolveStepSpec/문자열 경로를 타지 않음).
- viaGroups 저장: 그룹 재확장 단계의 새 구성원은 viaGroup=G, 스냅샷 단계는 이전 viaGroup 값 유지 —
  `saveApproverViaGroups`에 넘길 맵을 단계 복원 중에 함께 구성한다.
- legacy(단계 정보 없는) 요청 폴백: 기존 승인자 집합 + minimumApprovals 재사용 (기존 구현 유지).
- 이 전략이면 "3명 중 1명" 단일 단계는 그대로 3명/required=1로 복원되고(F-2), 그룹+개인 혼합·순서
  의존 문제(F-3)도 사라진다. 재확장은 (a)의 명확한 그룹 단계에서만 일어난다.

### 3. 나머지 (qa-5a.md 지시대로)
- 경미: 새 도메인 테스트 이름을 한국어 명명 규칙으로 통일, REJECTED/EXPIRED 편집·마감 불변
  테스트 2건 추가, `findPrevRequestIds`와 `findFlowIds`의 중복을 공용 private 헬퍼로 추출,
  import 정렬 원복, stale 페이지 조회의 null도 캐시(삭제된 페이지 반복 조회 방지).

## 완료 기준 (자가 검증·보고 — 이전 시도는 자가 검증을 건너뛰었다)
- 도메인 + c9 전체 테스트 실행이 불가한 환경이면, 최소한 수정한 테스트 파일과
  ApprovalRestResource의 복원 로직을 정독해 시나리오 3개(단일 다인 단계 / 그룹+개인 2단계 /
  비활성 그룹)를 손으로 추적한 결과를 보고에 포함하라.
- `git diff --check` 통과.

## 코드 스타일
개별 import, statement 한 줄, 중괄호, 압축 금지, 지시 외 변경 금지, 주석 한국어.
