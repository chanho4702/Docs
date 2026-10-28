# 요구사항 v3 — 프로젝트 배정 탭 3단 구조 개편 (2026-07-23)

사용자 요청 원문:
> 자원 관리 페이지 3단 구조로 가야할거같아. 카드 안에 넣어주고, 프로젝트 선택했을 때 중간에 프로젝트 정보 나오고 오른쪽에 전사 인력 나오고, 이때 이미 배정되어 있는 인력은 전사 인력에 배정 버튼 비활성화.

## 해석 (리더 확정)

1. **3단 레이아웃**: `ProjectAssignmentBoard.jsx` 를 [좌: 프로젝트 카드 목록 | 중: 선택 프로젝트 정보(ProjectDetailPanel) | 우: 전사 인력 테이블] 3열로 재편.
   - 현재는 좌측 칼럼 안에 카드 목록(위) + 상세 패널(아래) 세로 스택 → 상세 패널을 **독립된 중간 칼럼**으로 승격.
   - 프로젝트 **미선택 시 중간 칼럼 숨김(2단)**, 선택 시 3단으로 확장.
2. **각 칼럼을 카드(패널) 컨테이너로 감싼다**: border + radius + elevation.surface 배경 등 Atlaskit 토큰 기반 카드 스타일. 세 칼럼 모두 동일한 카드 프레임.
3. **이미 배정된 인력은 [배정] 버튼 비활성화**: `CompanyResourceTable.jsx` 의 배정 버튼 `isDisabled` 조건에 `match?.isMember === true` 추가. 비활성 사유 툴팁(i18n) 제공 — 기존 assignReason 툴팁 패턴 확장.

## 제약

- board/pool/overview 훅·mergeMatch 순수함수·백엔드는 **무수정** (프론트 레이아웃 + 버튼 조건만).
- isMember 는 이미 `row.match.isMember` 로 hydrate 되어 있음 (mergeMatch.js MatchInfo) — 새 데이터 소스 불필요.
- i18n 키 추가 시 locales/kr/resource.json + locales/en/resource.json → npm run merge.
