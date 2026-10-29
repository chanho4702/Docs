---
name: apm-collectors-to-admin-console
description: "10-01 APM 수집기·알람 규칙을 관리 콘솔로 — 사이드바 제거(FE 5166f0b) 후 주소까지 /setting/apm/**로 이동(FE c4eaf55·AI 6eef23c), 미푸시"
metadata:
  node_type: memory
  type: project
  originSessionId: eee4683d-0280-4673-9a67-5cecb7771b95
  modified: 2026-10-01T08:19:26.792Z
---

2026-10-01 사용자 결정. ① 수집기를 사이드바에서 빼고 콘솔 APM 그룹에 추가(FE `5166f0b`). ② "콘솔에서 누르면 서비스 사이드바로 넘어간다"는 지적 → 알람 규칙·수집기 주소를 `/setting/apm/alert-rules`·`/setting/apm/collectors`로 이동(FE `c4eaf55`, AI `6eef23c` screens.json+ScreenToolReferenceTest). 모두 #ZM-122 master, 미푸시.

**Why:** 레이아웃은 주소가 정한다 — `/setting/**`만 콘솔 레이아웃(SettingsLayout)으로 열린다.
**How to apply:**
- 정본 상수 `PATH_SETTING.apmAlertRules/apmCollectors`. 옛 주소는 `PATH_APM_LEGACY` + `LegacyPathRedirect`(쿼리·해시 보존) — 새 링크에 쓰지 말 것.
- 콘솔 라우트는 APM 레이아웃 대신 `ApmRetentionProvider` + `div.apm-pages`를 직접 감싼다(빠지면 보존 상한·카드 정렬 어긋남).
- `/setting/apm`은 화면 없음 → 콘솔 홈 리다이렉트(브레드크럼 중간 링크용), 브레드크럼 override `admin_console.group.apm`.
- SLO는 사이드바+콘솔 양쪽, 주소는 APM 그대로.
- AI 서버는 재기동해야 카탈로그 반영. AI 레포의 .env.example·README·AiProperties·application*.yml 미커밋 변경은 타 세션 것.
- `apmHelpContent.test.ts` 3건은 master 기존 실패(en 누락 키 alert_stuck_table·queue_size·retry_max_elapsed), 미수정.
- 트레이스 탐색은 사이드바 유지 결정(10-01). 메뉴 진입점 규칙은 [[verify-all-nav-entry-points]].
