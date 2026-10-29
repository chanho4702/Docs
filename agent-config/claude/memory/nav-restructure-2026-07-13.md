---
name: nav-restructure-2026-07-13
description: "2026-07-13 내비게이션 개편 — 대시보드 메뉴/페이지 완전 삭제(랜딩=/asset/list), 자산 메뉴를 자산 관리(목록/비용/지도>네트워크·지리 맵)로 재편"
metadata: 
  node_type: memory
  type: project
  originSessionId: 8c2d203c-480c-4c2a-a87f-a4300c252bf7
---

2026-07-13 moveseyee_fe 내비게이션 구조 변경.

**변경 내용**:
- **대시보드 완전 삭제**: SideNav/MobileSideNav 메뉴 항목, `/dashboards` 라우트, `pages/dashboards/Default.tsx`+`index.ts` 파일 삭제(다른 소비처 없음 확인 후 삭제). `/`(루트) 진입과 로그인 후 리다이렉트를 **`/asset/list`**로 변경(`SignIn.tsx`).
- **자산 메뉴 → "자산 관리"로 재편**, 3단 서브메뉴:
  ```
  자산 관리
  ├─ 목록 → /asset/list
  ├─ 비용 → /asset/cost (플레이스홀더 — 독립 비용 화면 미구현, "준비 중" 안내만)
  └─ 지도
     ├─ 네트워크 맵 → /asset/network-map (신규, 같은 날 별도 구현)
     └─ 지리 맵 → /asset/serverlocation (기존 ServerLocationList)
  ```
- 레거시 `MapViewList`(`/asset/mapview`)는 메뉴에서 제거하되 **라우트는 존치**(URL 직접 접근 가능) — Geo Maps로 흡수하는 결정은 확정됐으나 실제 흡수(Mapbox→MapLibre 재작성) 작업은 별도.
- URL 경로는 기존 유지(북마크 호환), 3단 메뉴는 AntD 중첩 SubMenu(기존 "클라우드 인프라>AWS 리소스" 패턴과 동일 관례)로 구현. 모바일 사이드 메뉴에 원래 자산 메뉴 자체가 없었던 기존 불일치도 이번에 함께 맞춤.

**Why:** 대시보드가 실질 콘텐츠 없이 자리만 차지, 자산이 제품의 주 기능으로 부상 → 랜딩·메뉴 구조를 자산 중심으로 재편. **How to apply:** 비용 화면을 정식 구현하게 되면 `/asset/cost`의 플레이스홀더(`AssetCostPage.tsx`)를 교체. Geo Maps 흡수 작업 시 `/asset/mapview` 라우트를 최종 정리(존치 여부 재결정). 관련: [[assets-core-devdesign]], [[network-maps-design]](네트워크 맵 슬롯 신규 구현).
