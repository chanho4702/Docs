# 게시 완료 및 구조 단순화 — 2026-10-06

- 실제 반영: 한·영 24쌍 48페이지 + 공간 홈 1페이지. 기존 가이드 20개 ID 재사용, 신규 기능 28페이지 게시. 실제 ID·부모·버전은 publication-queue.json에 기록했다.
- 사용자 지적에 따라 언어 폴더 중복을 제거했다. 한국어 가이드 203720241와 English Guide 204570643을 공간 홈 203818508 바로 아래로 올렸다. 기존 소개 204505109는 본문 v2를 유지한 채 한국어 가이드 아래로 이동했다. (KR)203818583·(EN)204570641 폴더는 비어 있음을 확인하고 복구 가능한 휴지통으로 옮겼다.
- 게시 전 기존 22페이지의 storage·ADF·view·버전·부모 및 첨부 목록을 _workspace/handbook-publication/before/에 보존했다. 기존 첨부와 본문 이미지 모두 0개였으며 신규 제품 이미지도 올리지 않았다. 이미지 삽입 위치 44곳을 게시했다.
- 최종 검증: 가이드 48/48 본문 전체 일치·제목·부모·한영 대응 통과, 본문 1,942항목, 원고 링크 284개, 렌더된 내부 링크 299개, 이미지 위치 44곳. 깨진 대상·미해결 링크·유실 첨부 0. 홈 1/1 통과.
- 홈의 기존 텍스트 18구간과 panel·recently-updated·info·contributors 4개 설정을 보존했다. native panel의 storage macro-id는 재생성되어 ADF localId·타입·설정으로 보존을 검증한다.
- 접근 불가 한국어 재상신 초안 204472464를 205258757로, 영어 증명서 초안 205160455를 205357104로 대체했고 참조 9페이지를 교정했다. 영어 목차에 남았던 예전 안내도 제거했다. 편집기 fill 성공만 믿지 않고 비어 있음을 검사하고, 최종 본문 전체 일치를 확인한다.
- Workforce와 동일하게 공식 Browser의 로그인된 Confluence 편집 UI로 게시·이동했다. 공개 REST는 읽기·백업·검증에만 사용했다. 인증 토큰이나 쿠키를 추출하지 않았다.
- 검증 명령: node docs/guide/handbook/editorial/verify-publication.cjs. 증빙: _workspace/handbook-publication/summary.json, verification.json, home-verification.json, final-home-structure.png.
- 앱 코드·빌드·배포·커밋·푸시는 수행하지 않았다. 실제 제품 화면 촬영과 이미지 첨부는 미실행이며 이미지 위치 표시와 구분한다.

재사용 절차: [[../topics/confluence-cloud-documentation-publishing]]. 다음 Confluence 게시 작업은 이 절차와 해당 프로젝트의 최신 게시 큐를 먼저 읽는다.


관련: [[moves-approval-workforce-style-confluence-publishing-2026-10-06]], [[moves-workforce-control-reference-2026-10-05]]
