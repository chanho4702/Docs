---
name: confluence-page-property
description: "프로젝트 문서(컨플 페이지) 연결 — 2026-09-29 별도 애드온 Moves Workforce Docs로 재확정(본 앱 통합안 폐기). 저장은 Jira 이슈 프로퍼티 movesDocs 단일 출처, Workforce는 읽기 전용 탭+애드온 이동 버튼"
metadata:
  node_type: memory
  type: project
  originSessionId: 763fafb3-a3a8-4745-af73-17823f74bf3b
  modified: 2026-09-30T02:16:35.619Z
---

컨플루언스 페이지를 Workforce 프로젝트의 이슈에 연결·분류·관리하는 기능.
방향 이력: 2026-09-22 확장 팩 보류 → 09-23 본 앱 문서 탭 → **2026-09-29 별도 애드온 "Moves Workforce Docs"로 사용자 재확정**. 더 뒤집지 말고 이 결정을 출발점으로.

**이름 변경(2026-09-30, 사용자 지시): Moves DocLink → Moves Workforce Docs.** 배포 전이라 폴더·프로퍼티 키·검색 별칭·코드 식별자까지 전부 바꿨다(옛 이름 `DocLink`/`movesDocLink`/`docLinkCount`는 어디에도 없다). 같은 날 "코드 구조는 Workforce를 많이 차용하라"는 지시로 애드온 구조를 Workforce 관례(guardedDefine·PermissionMap·queryKey 팩토리·locales merge·공용 컴포넌트)로 재편.

**연결 저장 실패 원인(2026-10-01, 39692e6):** 애드온에서 가져온 buildLinkProperty가 프로젝트 id를 Confluence 페이지 id 규칙(숫자 1~19)으로 검사 → Workforce 프로젝트 id는 UUID라 연결·분류 변경·스냅샷 갱신이 전부 LINK_PROJECT_ID로 조용히 거부. 테스트·계약 예시가 '42'라 못 잡음(애드온 설계서 예시가 숫자였던 탓). 같은 커밋: 탭명 「문서 관리」, 현황→문서 뷰 상단 카드, 스페이스 아이콘·스페이스만으로 목록·모두 선택. 연결도(React Flow) 뷰는 사용자 보류.

**배포 실측(2026-10-01, moves-rms v6):** `RFC-208`을 develop에 맞춰 갱신(3a19026) 후 배포. ① 호환 선언 **전에** 만든 Confluence 단독 설치가 환경에 있으면 deploy가 "existing installation in an Atlassian app that is not the required Atlassian app"로 거부 → `forge uninstall`로 **Confluence 설치만** 제거(Jira 설치 제거 금지 — SQL/KVS 소실) ② `deploy --approve MAJOR_VERSION_RULE` ③ `install --upgrade`(search:confluence 승인) ④ `forge install -p Confluence -s <site> -e <env>` → 목록에 `Jira (Required), Confluence` 한 줄. 같은 환경이 아니면(다른 env의 Confluence 설치) 문서 탭이 "Confluence에 연결된 뒤" 안내를 띄운다. development env의 tom-chkim-dev Confluence 단독 설치(v4)는 그 env 배포 때 같은 거부가 난다.

**🔴 최종 방향(2026-09-30 오후, 사용자 확정): 별도 앱 폐기 → Workforce 본체로 흡수. 하네스 4단계 완료(설계→백엔드→프론트→검증)+Codex, 지적 반영, 프론트 2,335·백엔드 1,842 통과, `forge lint` 0오류(메이저 승인 항목 1). 커밋·배포·E2E 전.** 정본 `static/ui/src/pages/projectDetail/documents/DOCUMENTS.md`, 보고서 `_workspace/workforce-docs-absorb/`. 결정 대기: 운영 빌드 소스맵(S14, Sentry 맞물림), 설정 캐시 모양 통일은 별도 과제. 애드온 저장소는 삭제 여부 미결. 독자 가치가 약해서(Jira 기본 연결 + 분류·현황판뿐) 흡수를 권했고 사용자가 수락. 작업 디렉토리 `_workspace/workforce-docs-absorb/`(요구사항 `00_input/requirement.md`). Workforce에 `app.compatibility`(Jira 필수+Confluence 선택)·`search:confluence`·`movesDocs` 색인이 들어가 **메이저 버전+재승인**. 설정은 백오피스 `settings` 엔티티(manifest attributes 필요), 권한은 PROJECT read/write 재사용, 번역은 `movesDocs.json` 한 파일. 애드온 저장소 `C:\CloudJira\moves-workforce-docs`는 참고용으로 남김(삭제는 사용자 결정). 아래 애드온 관련 기록은 이력.

**화면은 Jira에만 둔다(2026-09-30 사용자 확정, "일단 지라만").** Confluence 기준 설치(B)·Confluence 화면 추가(C)를 논의했으나 보류. Confluence는 문서 검색용으로 연결만 한다. C(문서 제목 아래 「연결된 작업」 등)는 출시 후 2차 후보. 다중 제품 설정은 운영 배포 후 비가역이라 기준 제품은 첫 배포 전에 확정돼야 하고, 다중 제품 앱의 가격 기준(어느 제품 사용자 수)은 미확인.
같은 날 추가 지시: 문서 검색에 본문 검색·스페이스 선택 추가, 라이선스 검사 추가(유료 전용이라 필수), 보안 검사 강화, 패키지 버전 관리(프론트 배포 대상에 높음 5건 — undici, @forge/bridge 5.x 경유 linkify-it), Codex 전체 검수, 마켓 심사 점검, 끝나면 알림.

확정(2026-09-29, 사용자 선택):
- 제품명 **Moves Workforce Docs**, 저장소 `C:\CloudJira\moves-workforce-docs`. 설계서 `docs/DESIGN.md`.
- 구조 A+C: Workforce 프로젝트 상세 「문서」 탭은 **읽기 전용**(이슈 연결 문서 목록) + 「문서 관리 열기」 버튼으로 애드온 Jira 페이지 이동. 연결·분류·관리는 전부 애드온.
- 범위: 문서↔이슈 연결, 분류, 현황 관리(문서 없는 이슈·오래된 문서·끊긴 링크·필수 분류 누락). **프로젝트 단위(이슈 없는) 문서·폴더 관리·문서 세트 생성은 범위 밖.**

**진행 상태(2026-09-30 갱신): 구조 재편·본문 검색·스페이스 선택·라이선스·패키지 정리·Codex 전체 검수·독립 보안 감사·심사 점검표까지 완료, 커밋·배포 전.** Docs 백엔드 285·프론트 446 통과, CI 빌드 성공(소스맵 0). Workforce 프론트 2,058 통과. 계약 변경: **`url` 필드 제거(링크는 `viewpage.action?pageId=` id 조립), 읽기 상한(30건·id 숫자·글자 수) 양쪽 강제**, 프로젝트 기억은 `projects:<accountId>` 단일 키. 점검표 `docs/MARKETPLACE_CHECKLIST.md`, 감사 `docs/SECURITY_AUDIT.md`. 등록명 "Moves Workforce Docs for Jira", 요금은 Jira 사용자 수 기준(공식). **Workforce 본체 운영 의존성에 높음 취약점 있음(감사에서 발견, 미조치)**.

(이전) 진행 상태(2026-09-29): **두 저장소 구현·교차 검증 완료, 커밋·배포 전.** Workforce Docs 테스트 59+196 통과·CI 빌드 성공, Workforce 프론트 2,055 통과·CI 빌드 성공. Workforce 변경은 워킹 트리(develop)에 미커밋. `forge register/deploy/install`은 사용자 몫이라 미수행 → 이후 앱 id·환경 id를 Workforce `static/ui/src/constants/movesDocs.js`에 채워야 「문서 관리 열기」 버튼이 보인다. 설계서 §10 실측 P1~P8 전부 남음. 검증 보고 `_workspace/workforce-docs/03_verify_report.md`.
- 애드온의 프로젝트 기억(KVS)은 **사용자별 키**(`project:<accountId>:<projectId>`) — 공용이면 Workforce 소속 프로젝트 제한을 우회해 이름이 샌다(검수에서 수정).

- **접근 범위는 Jira 권한이 정한다**(Codex 지적, 설계서 §9 명시): Workforce 소속 프로젝트 제한이 걸린 사용자도 Jira에서 이슈가 보이면 Workforce Docs 주소 직접 진입으로 이슈·연결 문서를 본다. 두 앱이 서로의 권한 판정을 못 부르기 때문. 사용자 결정 대기.
- Codex 검토 9건 중 2건 수정(저장 크기 UTF-8 바이트 기준, 검색어 문법 문자 제거), 나머지는 §9 한계 명시 또는 보류(`docs/BUILD_REPORT.md` 표). 수정 후 Workforce Docs 프론트 201건 통과.

저장 설계:
- 단일 출처 = Jira 이슈 프로퍼티 `movesDocs` `{v, projectId, pages:[{id,title,url,spaceName,category,linkedAt,linkedBy}], pageIds, categories, count}`. Confluence 콘텐츠 프로퍼티는 안 쓴다(이중 기록 정합성 회피, Confluence 쓰기 스코프 0).
- Workforce는 Confluence 스코프가 없어 제목을 못 읽음 → 제목·URL은 프로퍼티에 **스냅샷**, 애드온 화면이 열릴 때 CQL `id in (...)`로 갱신.
- 애드온은 프로젝트 이슈를 `moves_RMS_projectId = "<id>"` JQL로 찾는다. 프로젝트 **이름**은 알 수 없어 Workforce가 이동 URL에 넘기고 애드온 KVS에 기억.

플랫폼 사실(2026-09-29 문서 확인):
- Forge 앱 간 통신·저장소 공유·설치 여부 조회 API 없음(Atlassian 직원 "로드맵 미확정"). 만나는 곳은 엔티티/콘텐츠 프로퍼티뿐. 다른 앱 화면에 탭 주입 불가 → 탭 코드는 Workforce 본체에 있어야 함.
- 다중 제품 호환(`app.compatibility`, required 1개+optional)은 **Preview**, 유료 등록만, 켜면 되돌릴 수 없음. 스코프 추가 없으면 마이너, 있으면 메이저. 그래서 본 제품(Workforce)에는 적용하지 않고 신제품에만 쓴다.

**Why:** 사용자가 별도 제품(별도 과금 단위)을 원했고, Workforce에 Confluence 스코프를 넣으면 전 고객 메이저 재승인+Preview 비가역 적용이 따라온다.
**How to apply:** 프로젝트 단위 문서·폴더 요구가 나오면 "Jira에 실을 엔티티가 없어 범위 밖으로 확정" 상기. 관련 [[api-exposure]] [[jira-search-index-lag]] [[team-managed-field-gap]]
