# ADR-0001 문서 정본과 Obsidian 경험 Vault 분리

| 항목 | 내용 |
|---|---|
| 대상 독자 | 기획, 개발, 운영, 문서 관리자 |
| 문서 상태 | current |
| 관리 주체 | MovesEye 팀 |
| 기준일 | 2026-08-05 |
| 최종 검토 | 2026-08-05 |
| 검토 주기 | event-driven |
| 정본 위치 | C:/solutions/moveseye-docs |

# ADR-0001 문서 정본과 Obsidian 경험 Vault 분리

## 상태

`accepted`

## 맥락

MovesEye는 Spring BE, React FE, 구 NestJS 참조본, `_workspace`, 공유 Obsidian Vault로 정보가 나뉘어 있다. 기존 온보딩 문서는 있었지만 제품·사용자·운영·기술 문서의 탐색 허브와 갱신 규칙이 없었다. `C:\solutions` 루트는 Git 저장소도 아니어서 루트 Markdown만으로는 version 이력을 안정적으로 보존하기 어렵다.

Moves Workforce는 제품 산출물과 개발 기준선, Obsidian의 경험·결정 노트를 분리하고 서로 연결해 이 문제를 해결했다.

## 결정

MovesEye의 current 제품 문서는 독립된 `C:\solutions\moveseye-docs` 저장소를 정본으로 삼는다. `_workspace`는 기능 개발 중 설계·계약·QA 증거를 보존하고, 기능 완료 후 안정된 지식만 문서 정본으로 승격한다. 공유 Obsidian Vault는 최종 문서 복사본을 저장하지 않고 프로젝트 MOC, 결정 이유, 타임라인, 재사용할 교훈을 위키링크로 관리한다.

API·schema·화면 사실은 각각 Spring Controller/OpenAPI, Flyway migration, FE route/SideNav를 기계적 정본으로 유지한다.

## 고려한 대안

| 대안 | 장점 | 비용·위험 | 판단 |
|---|---|---|---|
| 모든 문서를 Obsidian에 저장 | 탐색·위키링크가 편함 | 코드 review/version 기준과 분리, 최종 문서 중복 | 기각 |
| Spring repo에 전체 문서 저장 | Git versioning 쉬움 | FE·제품·운영 문서가 BE 소유권에 종속 | 기각 |
| `C:\solutions` 루트 Markdown 유지 | 기존 방식과 연속성 | root가 Git repo가 아니고 문서 수 증가 시 탐색 어려움 | 보조 entrypoint로만 유지 |
| 독립 docs repo + Obsidian MOC | 역할·version·탐색을 분리 | 별도 저장소 동기화 비용 | 채택 |

## 결과

- 문서 상태와 정본이 명시돼 오래된 설명을 current로 오인할 가능성이 줄어든다.
- 코드 변경자는 문서 변경 trigger를 함께 확인해야 한다.
- Obsidian과 docs repo의 내용을 복제하지 않고 link 유지 비용만 감수한다.
- 조직이 별도 문서 platform을 채택하면 `moveseye-docs`를 source로 publish하되 정본 정책은 유지한다.

## 재검토 조건

- `C:\solutions` 자체가 version 관리되는 진짜 monorepo로 전환될 때
- Confluence·GitBook 등 공식 publish platform이 정본 편집 기능까지 맡을 때
- 문서 접근 권한을 코드 저장소와 별도로 분리해야 할 때

## 근거

- `C:\CloudJira\moves-workforce\Moves_Workforce_*.md`
- Obsidian `[[2026-07-08-deliverables-map]]`
- Obsidian `[[moveseye-documentation-system]]`

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-05 | 최초 채택 |
