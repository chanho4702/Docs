---
name: fe-dmovetable-maxpagesize
description: 서버 페이지네이션 DmoveTable은 maxPageSize(서버 limit 상한)를 넘기고 요청은 capPage로 — 안 그러면 500개 보기에서 중간 행 누락
metadata:
  type: project
---

2026-10-26 FE `8d49dd9`(푸시). 공통 표 보기 옵션은 10/30/50/100/500 고정인데 BE 목록 상한이 100·200인 곳이 많아, 500을 고르면 서버는 상한만 주고 다음 offset은 500 단위라 중간 행이 조용히 빠졌다(전수 조사: 서버 페이지네이션 37곳 중 18곳).

- `DmoveTable maxPageSize` — 옵션 거르기 + 페이지 크기 상한 + URL limit·offset을 상한·경계로 고쳐 씀.
- 화면 요청은 `capPage(limit, offset, 기본, 상한)`(hooks/useAlignedPagination.ts) — 첫 요청부터 표와 같은 값. 상한값은 `constants/table.ts SERVER_PAGE_CAP`(BE DTO와 짝, BE 바꾸면 같이).
- 🔴 새 서버 페이지네이션 표를 만들면 둘 다 적용. offset은 이제 페이지 경계로 내림 정렬된다(경계 아닌 offset을 그대로 넘기는지 보던 테스트 5건을 경계값으로 바꿈).
- 2026-10-26 후속(BE eff6500·FE c71f710, 푸시): 🔴 서버 페이지네이션 화면의 캐시 키는 `stringParams`가 아니라 `JSON.stringify(요청 객체)` — 표가 첫 진입에 limit·offset을 URL에 채우면 문자열 키가 바뀌어 같은 요청이 두 번 나갔다. 표 defaultPageSize = 요청 기본값. 호스트 기기 유형 필터는 BE(`ManagedHostListReqDto.deviceType`)가 페이지 전에 거름. LLD 발견 트리거·그래프·호스트 탭은 받은 행 수로 페이지·잘림 안내.

**Why:** 그래프 관리 코덱스 검수에서 처음 드러나 전 표로 확장(2026-10-26 사용자 "진행 계속").
**How to apply:** 목록 화면 작업 시 확인. 관련 [[zabbix-graph-mgmt]].
