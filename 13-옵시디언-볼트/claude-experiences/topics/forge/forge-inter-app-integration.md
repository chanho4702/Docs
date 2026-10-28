---
tags: [forge, inter-app, entity-property, compatibility]
updated: 2026-09-29
---

# Forge 앱 두 개를 연동하는 방법

출처 사례: [[2026-09-29-workforce-docs-kickoff]] ([[moves-workforce-docs]] ↔ [[moves-workforce]])

## 되는 것과 안 되는 것 (2026-09-29 확인)

| 하고 싶은 것 | 가능 여부 |
|---|---|
| 앱 A가 앱 B의 함수 호출 | 불가. Atlassian 직원 답변 "1급 지원 없음, 로드맵 미확정" |
| 저장소(KVS·SQL) 공유 | 불가. 설치본 단위로 격리 |
| 다른 앱 설치 여부 조회 | API 없음 |
| 앱 A가 앱 B 화면에 탭·패널 추가 | 불가. 각자 iframe |
| 엔티티 프로퍼티로 데이터 공유 | **가능.** 유일한 공용 지점 |
| 다른 앱 전역 페이지로 이동 | `router.navigate('/jira/apps/<appId>/<envId>/...')` (하위 경로·쿼리 전달은 미실측) |
| remotes·웹트리거로 통신 | 가능하지만 remotes는 Runs on Atlassian 배지 상실 |

## 패턴

- **읽는 쪽 권한에 맞춰 쓸 곳을 고른다.** 읽는 앱이 Jira 스코프만 있으면 Jira 이슈 프로퍼티에 쓴다. 읽는 앱에 스코프를 추가하면 메이저 버전 + 관리자 재승인이다
- **설치 감지 우회:** 쓰는 앱이 `jira:entityProperty`로 searchAlias를 선언하고, 읽는 앱은 `POST /rest/api/3/jql/parse?validation=strict`로 그 별칭이 유효한지 본다
- **"설치하면 탭이 생긴다":** 탭 코드는 본체에 넣고 감지 결과로 노출한다. 권한 게이트(`canRender`)가 아니라 목록에서 빼야 "권한 없음" 화면이 안 뜬다
- **앱이 모르는 데이터는 이동할 때 넘긴다.** 상대 앱의 SQL에 있는 이름 등은 URL 쿼리로 넘기고 받는 쪽이 기억한다. 기억은 사용자별로 — 공용이면 상대 앱의 데이터 범위 제한을 우회한다

## 다중 제품 호환 (`app.compatibility`)

- 필수 제품 1개 + 선택 제품. 필수는 Jira 또는 Confluence만
- **Preview**, 마켓 유료 등록만 가능, 설치본이 있는 동안 되돌릴 수 없음
- 선택 제품 추가는 마이너, 단 **스코프나 egress가 늘면 메이저**
- 선택 제품이 연결됐는지 런타임에 확인하는 방법은 문서에 없다 → 호출 실패를 안내 화면으로 처리
