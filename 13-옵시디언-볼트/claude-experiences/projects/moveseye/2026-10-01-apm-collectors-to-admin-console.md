---
type: project
tags: [moveseye, apm, fe, navigation, admin-console]
created: 2026-10-01
updated: 2026-10-01
status: done
---

# 2026-10-01 — APM 수집기·알람 규칙을 관리 콘솔로 이동 (주소가 레이아웃을 정한다)

- 프로젝트: [[moveseye]] · 선행 [[2026-09-22-zm161-admin-console]] · 기능 지도 [[홈과-공통-화면-틀]]
- 커밋: FE `5166f0b`(수집기를 사이드바에서 빼고 콘솔 APM 그룹에) → `c4eaf55`(알람 규칙·수집기 주소를 `/setting/apm/alert-rules`·`/setting/apm/collectors`로) · AI `6eef23c`(screens.json + `ScreenToolReferenceTest`). 전부 #ZM-122 master, 미푸시.

## 무엇이 문제였나
콘솔 메뉴에서 수집기를 누르면 **서비스 사이드바 레이아웃**으로 넘어갔다. 레이아웃은 메뉴 위치가 아니라 **주소**가 정한다 — `/setting/**`만 `SettingsLayout`으로 열린다. 그래서 메뉴 이동만으로는 안 되고 주소를 옮겨야 했다.

## 규칙
- 정본 상수 `PATH_SETTING.apmAlertRules/apmCollectors`. 옛 주소는 `PATH_APM_LEGACY` + `LegacyPathRedirect`(쿼리·해시 보존) — 새 링크에 쓰지 말 것.
- 콘솔 라우트는 APM 레이아웃 대신 `ApmRetentionProvider` + `div.apm-pages`를 직접 감싼다(빠지면 보존 상한·카드 정렬이 어긋난다).
- `/setting/apm`은 화면 없음 → 콘솔 홈 리다이렉트(브레드크럼 중간 링크용).
- SLO는 사이드바 + 콘솔 양쪽, 트레이스 탐색은 사이드바 유지(사용자 결정).
- AI 서버는 재기동해야 화면 카탈로그가 반영된다.

## 교훈
메뉴 진입점은 5곳(사이드바·모바일·콘솔·전역 검색·라우트)을 전부 확인한 뒤 "없다/있다"를 말한다([[2026-09-15-apm-install-guide-and-fe-polish]]의 SLO 오판 재발 방지). `apmHelpContent.test.ts` 3건은 master 기존 실패(en 누락 키).

## 관련
[[2026-09-22-zm161-admin-console]] · [[2026-10-01-apm-ux-isolated-fix]] · [[2026-10-10-apm-incidents-menu]](같은 규칙으로 옛 `?tab=` 리다이렉트)
