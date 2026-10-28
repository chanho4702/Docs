# 재승인 설계 — 버전 기록 모델 (배치 5)

사용자 확정 결정 (2026-08-11):
1. **버전 기록 모델** — 승인 완료(APPROVED)는 편집돼도 무효화하지 않는다. "v1은 승인된 버전"이라는
   사실은 영구 기록이고, 페이지의 현재 상태는 "최신 승인 버전 vs 현재 버전" 비교로 파생한다.
2. **수동 + 원클릭 CTA** — 재승인 요청은 자동 생성하지 않는다. 상세 모달의 CTA로 사람이 확정한다.
3. **그룹 재확장** — "같은 결재선으로 재요청" 시 그룹 단계는 재요청 시점의 활성 구성원으로 다시 펼친다.

## 1. 도메인 변경 (approval-domain)

### 1.1 편집 만료의 범위 축소
`ApprovalRequest.expireForContentVersion`: **PENDING만** 만료 대상. APPROVED는 편집이 발생해도
상태를 유지한다(터미널 상태화).

- 현재: `canExpire() = PENDING || APPROVED` → 변경: 편집 만료 경로는 `status == PENDING`일 때만.
- `EXPIRED_BY_EDIT_AFTER_APPROVAL` 상수와 `requiresReapproval()`은 **기존 데이터 복원·표시용으로 유지**
  (이미 그 사유로 만료된 행이 DB에 있다). 새로 생성되는 일은 없어진다.
- 마감 만료(`expireIfDue`)도 PENDING 전용으로 좁힌다 — 승인 완료된 기록이 마감 시각 때문에
  만료되는 것은 버전 기록 모델과 모순.
- 기존 테스트 중 "승인 후 편집 → EXPIRED_BY_EDIT_AFTER_APPROVAL" 시나리오는 새 모델에 맞게
  "승인 후 편집 → APPROVED 유지"로 재작성한다 (ExpiryReasonTest 일부).

### 1.2 후속 연결
재승인 요청은 이전 요청을 가리키는 새 `ApprovalRequest`다. 도메인 aggregate에는 필드를 추가하지
않고(순수성 유지), adapter 저장 계층에서 연결을 보관한다 (§2.1).

## 2. 저장·REST 변경 (approval-confluence9)

### 2.1 ApprovalEntity에 `PREV_REQUEST_ID` 컬럼 추가
- nullable 문자열. `saveFlowId`와 같은 패턴의 `savePrevRequestId(UUID, String)` + `findPrevRequestIds(ids)`.
- AO 스키마 추가는 컬럼 추가라 마이그레이션 불필요(AO 자동).

### 2.2 파생 상태 계산 (REST 응답 확장)
`requestObject`에 추가:
- `previousRequestId`: 후속 연결.
페이지 단위 파생 상태는 **페이지 컨텍스트 응답/패널에서 계산**:
- `latestApproved` = 그 대상의 APPROVED 요청 중 contentVersion 최대인 것.
- `currentVersionApproved` = latestApproved != null && latestApproved.contentVersion == page.version.
- `reapprovalNeeded` = latestApproved != null && page.version > latestApproved.contentVersion
  && 열린 PENDING 없음.
패널은 서버 렌더링이므로 repository에서 직접 계산한다. REST `GET /approvals/{id}`는 요청 단위
그대로 두고, 업무함 목록은 기존 필드 + `approvedContentVersion`으로 충분.

### 2.3 결재선 재사용 API
`POST /rest/approval/1.0/approvals?resourceType=...&pageId=...&fromRequestId={이전 요청 id}`
- `fromRequestId`가 오면 서버가 이전 요청에서 **단계 지정 문자열을 복원**해 `steps`로 사용한다
  (클라이언트가 steps를 함께 보내면 클라이언트 값 우선 — 프리필 후 수정한 경우).
- 복원 규칙: 이전 요청의 각 단계에서, 구성원의 `viaGroup`이 있으면 그 단계는 `group:{이름}`
  (한 단계는 생성 규칙상 단일 그룹 또는 단일 사용자), 없으면 `user:{key}`.
  그룹은 resolveStepSpec 경로로 **재확장**된다(결정 3). 그룹이 삭제·비활성화됐으면 400과
  명확한 메시지("결재선의 그룹 X를 더 이상 사용할 수 없습니다. 결재선을 다시 구성해 주세요.").
- legacy(단계 없는 최소 인원) 요청이면 같은 승인자 집합 + minimumApprovals를 그대로 재사용.
- 생성된 요청에 `PREV_REQUEST_ID = fromRequestId` 저장.
- 권한·중복 PENDING 검사·revision 계산은 기존 create 경로와 동일 (inTargetLock 내부).

### 2.4 리스너·스케줄러
변경 불필요 — 도메인이 PENDING만 만료하도록 바뀌므로 리스너는 그대로 두면 새 의미로 동작.
알림도 기존 흐름 유지: PENDING 중 편집 만료(CONTENT_VERSION) 알림은 그대로, AFTER_APPROVAL
알림은 더 이상 발생하지 않는다 (기존 행 표시는 유지).

## 3. UI/UX

### 3.1 pill 상태 체계 (버전 관계를 항상 명시)
| 상황 | pill 표기 | 모디파이어 |
|------|-----------|-----------|
| 최신 승인 == 현재 버전 | `✓ 승인 완료 · v3` | `--approved` |
| 승인 있음 + 현재 버전이 더 새로움 | `✓ v1 승인 · 현재 v3 미승인` | `--stale` (신규: 호박색 계열, `!` 뱃지 대체) |
| PENDING | 기존 그대로 (`n/m단계`) | `--pending` |
| REJECTED / 요청 없음 | 기존 그대로 | `--rejected` / `--none` |
`--stale`은 기존 `!` 뱃지+sr-only보다 상태 자체를 pill 텍스트로 말한다. 기존 EXPIRED(과거 데이터,
AFTER_APPROVAL 사유)는 기존 재승인 안내문 표시를 유지.

### 3.2 상세 모달
- 헤더 lead: 상태 스탬프 + `v1 기준 승인` + (stale이면) `현재 v3은 승인되지 않았습니다`.
- **버전별 승인 이력 섹션 (신규)**: 그 대상의 APPROVED 요청들을 최신순으로
  `v3 승인 — 2026-08-12 · 결재선 A→B` 형태 목록. 각 항목에 해당 버전 보기 링크
  (`/pages/viewpage.action?pageId=..&pageVersion=n`).
- **변경 내용 보기 링크 (신규)**: stale이면
  `/pages/diffpagesbyversion.action?pageId={id}&selectedPageVersions={승인버전}&selectedPageVersions={현재버전}`
  링크를 안내문 옆에 노출 ("v1 승인분과 현재 v3의 차이 보기").
- **재승인 CTA (신규)**: stale + 편집 권한이면 footer에
  `같은 결재선으로 재승인 요청` 기본 버튼. 클릭 → 요청 모달이 **이전 결재선이 프리필된 상태**로 열림
  (서버가 요청 모달 렌더링 시 이전 단계 목록을 selected-steps에 미리 채우고 steps hidden input 설정,
  fromRequestId hidden input 추가). 사용자는 순서를 수정하고 제출할 수 있다.
  제출 JS는 fromRequestId가 있으면 쿼리에 `&fromRequestId=`를 붙인다.
- 재승인으로 만들어진 요청의 모달·타임라인에는 `이전 승인: v1 (2026-08-10)` 연결 표시 (previousRequestId).

### 3.3 업무함
- statusCell: APPROVED인데 stale이면 `v1 기준 · 현재 vN 미승인` 보조 문구 (REST에 stale 판단
  재료가 필요 — 목록 응답에 `currentPageVersion` 추가하거나 `stale` boolean을 서버에서 계산해 내려줌.
  **서버 계산 `stale` boolean 권장** — 클라이언트에 페이지 버전을 또 내리지 않는다).
- 알림 문구: 기존 "승인 후 수정됨 · 재승인 필요"(과거 데이터)는 유지.

### 3.4 매크로 (approval-region)
배치 4에서 pill+모달로 개편되면 같은 파생 상태 규칙을 적용 (CONTENT_REGION도 페이지 버전 기준
동일 비교).

## 4. 문서·호환성
- `docs/approval-edit-policy.md`를 버전 기록 모델로 개정 (편집 시 처리 표).
- README "편집하면 승인이 무효" 서술 갱신.
- 기존 EXPIRED(AFTER_APPROVAL) 데이터: 그대로 표시, 새로 생기지 않음. 마이그레이션 불필요.
- C10 백로그에 추가.

## 5. 구현 순서 (배치 5, 배치 4 완료 후)
1. 도메인: 만료 범위 축소 + 테스트 재작성
2. 저장/REST: PREV_REQUEST_ID, fromRequestId, stale 계산
3. 패널/매크로/업무함 UI + 프리필 요청 모달
4. 문서 개정
