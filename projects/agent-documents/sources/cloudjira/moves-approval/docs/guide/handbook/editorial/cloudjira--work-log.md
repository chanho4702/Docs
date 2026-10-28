# 게시 완료 및 구조 단순화 — 2026-10-06

## staging 실화면·심사 정책 최신화 — 2026-10-23

- 변경된 한·영 가이드 38페이지와 Privacy & Security Policy, Product Support SLA를 실제 MA 공간에 갱신했다.
- staging 실화면 17장을 36개 본문 위치의 Confluence 첨부로 게시했다. 게시 후 공개 REST view에서 각 이미지 렌더를 확인했다.
- 최종 검증: 가이드 48/48, 홈 1/1, 한영 24쌍, 본문 1,974항목, 원고 링크 288개, 렌더된 내부 링크 300개, 첨부 36개. 누락 첨부·깨진 링크·미해결 링크 0.
- 게시 직전 40페이지의 storage·ADF·view·version·ancestor와 첨부 목록을 _workspace/handbook-publication/before-2026-10-23/에 보존했다.
- 브라우저 편집기의 file chooser 권한과 연결이 불안정해, 저장소에 이미 구성된 관리자 자격 증명으로 인증된 Confluence REST를 사용했다. 자격 증명 값은 출력하거나 새 파일에 복사하지 않았다.
- 영역 승인 매크로의 host spinner 문제는 해결되지 않아 MA-04 캡처를 게시하지 않았고 Marketplace 제출 중단 조건으로 유지했다.

- 실제 반영: 한·영 24쌍 48페이지 + 공간 홈 1페이지. 기존 가이드 20개 ID 재사용, 신규 기능 28페이지 게시. 실제 ID·부모·버전은 publication-queue.json에 기록했다.
- 사용자 지적에 따라 언어 폴더 중복을 제거했다. 한국어 가이드 203720241와 English Guide 204570643을 공간 홈 203818508 바로 아래로 올렸다. 기존 소개 204505109는 본문 v2를 유지한 채 한국어 가이드 아래로 이동했다. (KR)203818583·(EN)204570641 폴더는 비어 있음을 확인하고 복구 가능한 휴지통으로 옮겼다.
- 게시 전 기존 22페이지의 storage·ADF·view·버전·부모 및 첨부 목록을 _workspace/handbook-publication/before/에 보존했다. 기존 첨부와 본문 이미지 모두 0개였으며 신규 제품 이미지도 올리지 않았다. 이미지 삽입 위치 44곳을 게시했다.
- 최종 검증: 가이드 48/48 본문 전체 일치·제목·부모·한영 대응 통과, 본문 1,942항목, 원고 링크 284개, 렌더된 내부 링크 299개, 이미지 위치 44곳. 깨진 대상·미해결 링크·유실 첨부 0. 홈 1/1 통과.
- 홈의 기존 텍스트 18구간과 panel·recently-updated·info·contributors 4개 설정을 보존했다. native panel의 storage macro-id는 재생성되어 ADF localId·타입·설정으로 보존을 검증한다.
- 접근 불가 한국어 재상신 초안 204472464를 205258757로, 영어 증명서 초안 205160455를 205357104로 대체했고 참조 9페이지를 교정했다. 영어 목차에 남았던 예전 안내도 제거했다. 편집기 fill 성공만 믿지 않고 비어 있음을 검사하고, 최종 본문 전체 일치를 확인한다.
- Workforce와 동일하게 공식 Browser의 로그인된 Confluence 편집 UI로 게시·이동했다. 공개 REST는 읽기·백업·검증에만 사용했다. 인증 토큰이나 쿠키를 추출하지 않았다.
- 검증 명령: node docs/guide/handbook/editorial/verify-publication.cjs. 증빙: _workspace/handbook-publication/summary.json, verification.json, home-verification.json, final-home-structure.png.
- 앱 코드·빌드·배포·커밋·푸시는 수행하지 않았다. 실제 제품 화면 촬영과 이미지 첨부는 미실행이며 이미지 위치 표시와 구분한다.

아래는 게시 전 작성 당시의 기록이다. 현재 상태는 위 완료 기록이 우선한다.

﻿# 문서 재작성 경험 — 2026-10-06

이전 역할별 원고에 링크와 이미지 자리만 붙이는 것은 사용자가 요청한 Workforce 방식의 재작성이 아니었다. 실제 Workforce 로컬 정본을 읽고 목적 중심 목차, 독립 기능 페이지, 실제 입력·버튼 결과, 완료 확인으로 다시 작성했다.

locale에는 실제 UI에서 사용하지 않는 키가 남아 있으므로 버튼 이름만 근거로 절차를 쓰면 안 된다. SpaceSettings는 저장 버튼 없이 토글 즉시 저장이다. SpacePolicyModal의 PIN·위임·서명 옵션은 서버의 전역 정책 동작과 차이가 있고, 과거 이력 확장은 PDF 대상을 전환하지 않는다. 이 차이를 고객 안내에 반영했다.

새 원고는 24쌍·48문서와 홈 미리보기이다. 이미지 위치 44개는 실제 캡처 44개가 아니다. 브라우저 실행 도구 시간 초과로 이번 개편을 게시하지 못했다. 로컬 렌더의 GPU 프로세스도 권한 오류로 실패했다. 검사한 본문·링크와 미완료 시각 검수·서버 게시를 구분한다.

경험 Vault는 현재 쓰기 허용 범위 밖이라 이 노트를 워크스페이스에 남긴다. 관련 경험: moves-workforce-control-reference-2026-10-05, moves-approval-workforce-style-confluence-publishing-2026-10-06.

## Workforce 게시 방식 재확인
사용자가 지정한 C:\CloudJira\moves-workforce의 publication.md, CONTINUE.md, browser-publisher.mjs를 확인했다. 실제 게시 경로는 공식 Browser runtime으로 로그인된 Chrome의 Confluence 편집기에 HTML을 입력하고 게시 화면과 공개 본문을 검증하는 방식이다. 최신 CONTINUE.md는 사용자가 첨부한 이미지가 있으므로 이전 원고 전체 덮어쓰기를 금지한다. Approval도 게시 직전 현행 본문·첨부를 읽고 보존해야 한다. 이번 연결 확인에서도 node_repl의 단순 출력이 시간 초과되어 브라우저 초기화 이전 단계에서 막혔다. Atlassian 검색 결과도 installed=false이며 서버 게시 0건이다.
