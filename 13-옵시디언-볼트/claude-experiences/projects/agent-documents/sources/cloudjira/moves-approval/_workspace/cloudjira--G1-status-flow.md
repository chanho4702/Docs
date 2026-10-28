# G1 — 상태를 워크플로 형태로 (워크포스 차용)

> **먼저 `_workspace/_SHARED.md` 를 읽을 것.**

## 지금 무엇이 문제인가

설정의 전역 정책 탭에서 상태 표시명을 **입력칸 5개를 세로로 나열**해 받고 있다.
그래서 관리자가 "이 결재가 어떤 흐름으로 도는지"를 전혀 알 수 없고, 표시명만 바꾸는 화면이 됐다.

moves-workforce 는 프로젝트 상태를 **React Flow 다이어그램**으로 보여 준다
(`C:\CloudJira\moves-workforce\static\ui\src\backoffice\page\projectStatus\modal\flow\ProjectStatusFlow.jsx`
— 읽기 전용으로 참고할 것. 노드=상태, 엣지=전이, 순환 방지까지 들어 있다).
같은 방식으로 승인 상태 흐름을 보여 준다.

## ⚠ 승인 앱과 워크포스의 결정적 차이

워크포스는 사용자가 상태와 전이를 **만든다.** 승인 앱은 **도메인이 고정**한다:

```
                 ┌─ 승인 ──→ APPROVED
PENDING ─────────┼─ 반려 ──→ REJECTED
                 ├─ 편집·마감 → EXPIRED
                 └─ 회수 ──→ CANCELLED
종료 상태에서 나가는 전이는 없다(재승인은 새 요청 + prevRequestId 링크).
```

이 규칙은 `src/domain/approval/transitions.js` 에 있고 **화면에서 바꿀 수 없다.**
따라서 다이어그램은 **읽기 전용 구조**이고, 편집할 수 있는 것은 각 상태의 **표시명과 색**뿐이다.
그 사실을 화면에 분명히 적어 관리자가 전이를 바꾸려 시도하지 않게 한다.

## 건드릴 파일

```
static/ui/src/features/settings/StatusFlow.jsx        (신규)
static/ui/src/features/settings/statusFlowModel.js    (신규 — 노드/엣지 정의)
static/ui/src/features/settings/PolicySettings.jsx    (상태 표시명 부분 교체)
static/ui/src/features/settings/__test__/statusFlowModel.test.js (신규)
locales/{kr,en}/policy.json                           (키 추가)
static/ui/package.json                                (@xyflow/react 추가)
```

## 요구사항

1. `@xyflow/react` 로 상태 5개를 노드로, 전이를 엣지로 그린다. 노드는 드래그로 위치만 바꿀 수 있고
   **엣지는 추가·삭제할 수 없다**(`nodesConnectable={false}`, `edgesFocusable={false}` 등).
2. 노드를 클릭하면 그 상태의 **표시명**을 편집한다(현재 `saveApprovalSettings` 의 statusLabels 계약 유지).
   색은 상태별로 고정한다 — PENDING 파랑, APPROVED 초록, REJECTED 빨강, EXPIRED/CANCELLED 회색.
   Lozenge 의 appearance 와 **같은 색 체계**를 써서 업무함·배너와 어긋나지 않게 한다.
3. 표시명을 비우면 기본값(i18n)으로 되돌아간다. 저장 버튼은 변경이 있을 때만 활성.
4. 전이 위 라벨에 **무엇이 그 전이를 일으키는지** 적는다(승인/반려/편집·마감/회수).
   관리자가 "만료는 왜 생기나"를 화면에서 알 수 있어야 한다.
5. 다이어그램 높이는 320px 안팎으로 고정하고 `fitView` 로 맞춘다 — 설정 탭 안에 들어가야 한다.
6. 상태 표시명은 **관리자가 정한 조직 용어라 번역하지 않는다.** 정한 적이 없을 때의 기본값만
   사용자 언어를 따른다(DC 와 같은 정책).

## 테스트 (`statusFlowModel.test.js`)

노드/엣지 정의는 순수 데이터이므로 그 부분만 검증한다(React Flow 렌더는 테스트하지 않는다):
1. 노드가 5개고 상태 enum 과 정확히 일치한다
2. 종료 상태에서 나가는 엣지가 없다
3. 모든 엣지의 source 가 PENDING 이다
4. 각 엣지에 트리거 라벨 키가 있다

## 완료 기준
- `npm run test:ui -- --runInBand` 통과, `npm run build:ui` 성공
- 번들: 설정은 이미 lazy 로드되므로 React Flow 가 첫 화면에 들어가지 않는지 확인할 것
