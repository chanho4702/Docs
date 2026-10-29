---
name: user-management-breadcrumb-and-pending
description: 2026-07-21 역할 편집 브레드크럼 로딩 버그 수정 완료(미커밋) + 나중에 할 잔여 2건(401 무한로딩·deprecated 경고)
metadata: 
  node_type: memory
  type: project
  originSessionId: 8215581b-b7e2-4874-8107-e1da9ef6dfef
  modified: 2026-07-21T06:14:41.881Z
---

2026-07-21 사용자 관리 화면 FE 검증 중 발견. 브레드크럼 버그는 수정 완료, 나머지 2건은 사용자가 "나중에 할게"로 보류.

## 수정 완료 (미커밋)
- **증상:** 역할 편집 화면 브레드크럼 `홈 / Zabbix 관리 / 사용자 관리 / [로딩중] / 편집` — `사용자 관리`와 `편집` 사이(`roles` 세그먼트)가 영구 로딩 스켈레톤.
- **원인:** `moveseyee_fe/src/hooks/useBreadcrumbs.tsx`가 경로 3번째 세그먼트(`index === 2`)를 무조건 `<Skeleton.Input active>`로 렌더. 이 스켈레톤은 상세 화면(`/monitoring/host-group/{id}` 등)에서 동적 ID를 `replacePathBreadcrumb`(기본 index=3, home 포함 배열의 4번째=pathSegments[2]와 일치)로 이름 치환하기 전까지의 임시 표시. `roles`는 정적 세그먼트라 치환 주체가 없어 영구 로딩.
- **수정:** index 2가 번역 키 없는 동적 세그먼트일 때만 스켈레톤, `i18n.exists(`${key}.title`) || i18n.exists(key)` 이면 정상 라벨. 회귀 안전(상세 화면 동적 ID는 스켈레톤 유지). tsc 통과.

## 나중에 할 잔여 (보류)
1. **세션 만료 시 401 무한 로딩 (전역, 심각):** 세션(HttpOnly 쿠키) 만료 시 자동 로그인 리다이렉트가 안 되고 상단 알림 벨(`components/Notification/index.tsx`, 1분 폴링)이 무한 로딩. `bells`·`users` 등 401 콘솔 누적. 재로그인하면 해소됨. 근본이 FE(`services/axiosInstance.ts`의 중복요청 취소 `return new Promise(()=>{})` 영구 pending) 문제인지 BE(refresh 200인데 access 쿠키 미갱신) 문제인지는 `/auth/refresh` 응답 상태로 갈림 — 미확정.
2. **deprecated 경고 정리:** `addonAfter is deprecated`(공용 검색창 `components/Input/KeywordSearchInput.tsx`, Space.Compact로 교체) + `useForm is not connected`(`UserRoleUtility.tsx` 부수 경고, 크래시 없음).

**Why:** 사용자가 브레드크럼만 먼저 고치고 나머지는 보류 지시.
**How to apply:** 재개 시 401은 `/auth/refresh` 실제 응답 상태부터 확인(브라우저 확장 필요). [[be-dual-maintenance]] 인증 흐름 참고.
