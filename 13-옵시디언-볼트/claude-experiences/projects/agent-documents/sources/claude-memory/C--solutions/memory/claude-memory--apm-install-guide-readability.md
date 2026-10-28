---
name: apm-install-guide-readability
description: "APM 수집기 설치 가이드 탭 가독성 개선(09-15 FE master e0560cb·토큰 테이블 8e845b1 #ZM-149, 미푸시) — ApmGuideText 문장 줄바꿈·인라인 마크다운, 목차, 탭 링크, CommandBlock 복사버튼 겹침 수정"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2ff0d0f4-3d9a-4217-ad4d-e7f0de3cf957
  modified: 2026-09-14T09:03:38.781Z
---

2026-09-14 수집기 > 설치 가이드 탭(`ApmCollectorInstallTab.tsx`) 표시 개선 — 커밋 `e0560cb`, 토큰 테이블 균등 폭·공용 테이블 마지막 열 핸들 넘침 수정 `8e845b1`(모두 #ZM-149, 미푸시). BE 원문(계약 §8.2-5)은 그대로 두고 표시만 손봄.

**Why:** 사용자가 "구리다"·"한글 줄바꿈 잘 해서 문맥이 읽히게" 요청. 실측 화면: Alert 7개가 위에 쌓이고 한 행 150자, BE 원문의 `**굵게**`·백틱이 그대로 찍히고, 긴 한 줄 명령이 복사 버튼 밑으로 파고들고, 환경변수 표의 설명 열이 ellipsis로 잘림.

**How to apply:**
- 긴 한국어 안내는 `components/ApmGuideText.tsx`로 그린다 — 문장 경계(한글·`)` 뒤 `.` + 공백, 숫자 뒤 마침표 제외)에서 줄바꿈, `**`·백틱 → strong/code, `stripMarker`로 앞 🔴/ℹ️ 제거. 규칙 함수 `splitGuideSentences` 내보냄.
- `CommandBlock`은 flex 열로 바뀜(복사 버튼 흐름 안), `wrap` prop이면 긴 한 줄 접기. 클립보드는 `utils/clipboard.ts` 공용.
- 단계 코드별 이동 링크 `STEP_TAB_LINKS`(collector.config→토큰 탭, verify.ingest-recent→상태 탭)·`STEP_ROUTE_LINKS`(verify.service-list→서비스 목록).
- 목차는 해시 링크 금지(location 변경 시 페이지 리마운트) → `scrollIntoView`.
- 🔴 헤드리스 캡처 플랜의 쿠키는 accessToken이 짧아 금방 만료 — 캡처 직전에 재로그인해 플랜을 다시 생성할 것. 관련 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--resizable-drawer-common|resizable-drawer-common]].
