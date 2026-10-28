---
name: scheduler-table-layout
description: "설정 > 스케줄러 표 뭉개짐 수정과 작업 카탈로그 등록 규칙 (ZM-122, 2026-09-16)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2ff0d0f4-3d9a-4217-ad4d-e7f0de3cf957
  modified: 2026-09-16T04:56:17.168Z
---

설정 > 스케줄러 표(`pages/setting/scheduler/SchedulerManagement.tsx`)가 뭉개진 것을 고쳤다 — FE `406f861` #ZM-122(미푸시).

- 원인: antd `Table`에 `tableLayout`·`scroll`이 없어 내용 길이로 폭이 나뉘었다. 요약 문자열(`added=1 updated=76 …`)이 한 줄로 서려는 '마지막 실행'이 1,085px를 가져가고, 유일하게 `width`가 없던 '작업' 열이 55px로 눌려 이름이 한 글자씩 세로로 쪼개졌다(행 높이 578px, 옵션·버튼은 화면 밖).
- 수정: `tableLayout="fixed"` + `scroll={{x:"100%"}}` + 열 폭 재배분(작업 300·마지막 실행 280·나머지 축소, 조작 `fixed:"right"`). 작업 설명 2줄 클램프, 요약은 `minWidth:0`을 줘야 ellipsis가 실제로 먹는다. 결과 1,340px 정렬·행 높이 77~94.
- 함께: 21개 작업 중 12개(APM 9·클라우드 3)가 라벨 없이 job_key로 떠 있었다 → `constants/scheduler.ts`의 `SCHEDULER_JOB_CATALOG`에 등록 + i18n 24키.

**Why:** 사용자가 "테이블 뭉개진 거"로 지적. 원인이 폭 지정 누락 하나라 같은 처방(fixed+x:100%)이 APM 표들에서도 반복해 통했다.

**How to apply:**
- 🔴 **스케줄러 화면의 이름은 i18n 키만 넣으면 안 뜬다** — `SCHEDULER_JOB_CATALOG`에 항목이 있어야 `labelOf`가 찾는다(없으면 job_key 원문 표시). 새 배치가 BE에 생기면 카탈로그·i18n 양쪽을 채운다.
- 🔴 `SCHEDULER_SUCCESS_LOGGED_JOBS`는 BE `SchedulerRunLogPolicy.DEFAULTS`와 같은 집합이어야 한다 — APM·클라우드 배치는 거기 없어(실패만 기록) 추가하면 화면 안내가 거짓이 된다(2026-09-16 실측 확인).
- 🔴 헤드리스로 관리자 전용 화면(`adminOnly`)을 캡처할 때 URL 직접 진입은 404다 — redux `userRole`이 채워지기 전에 가드가 튕긴다. 홈을 먼저 띄우고 `history.pushState`+`popstate`로 들어간다.
- ⚠️ 미해결로 남긴 것: 위와 같은 이유로 **실제 사용자도 저장된 세션 없이 관리자 URL을 직접 열면 404**가 될 수 있다(시크릿 창·링크 공유). 요청 범위 밖이라 손대지 않았다.
