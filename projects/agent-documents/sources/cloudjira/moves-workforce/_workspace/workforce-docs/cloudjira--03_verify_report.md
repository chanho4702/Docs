# 검증 보고서 — Moves Workforce Docs 연동 (2026-09-29)

검증 방식: 리더가 두 저장소의 코드를 **양쪽 동시에 읽고** 대조, 테스트·빌드는 직접 재실행.
(이 기능은 resolver 가 없어 resolver↔프론트 축이 아니라 **Workforce Docs 쓰기 ↔ Workforce 읽기** 축이 경계면이다.)

## 통과

| 경계면 | Workforce Docs (쓰는 쪽) | Workforce (읽는 쪽) | 결과 |
|---|---|---|---|
| 프로퍼티 키 | `domain/linkProperty.js` `PROPERTY_KEY = 'movesDocs'` | `utils/jiraApi/movesDocsProperty.js` `MOVES_DOCS_PROPERTY_KEY = 'movesDocs'` | 일치 |
| 페이지 필드 | `id, title, url, spaceName, category, linkedAt, linkedBy` (없는 값은 생략) | `id, title, url, spaceName, category, linkedAt` 읽음, 없는 값은 null | 일치 (`linkedBy` 는 읽지 않음) |
| `url` 조건 | `/` 로 시작, `//` 아님 | 같은 조건 | 일치 |
| 중복 id | 나중 값이 이김 | 나중 값이 이김 | 일치 |
| 색인 별칭 | manifest `movesDocsCount` (path `count`, number) | `MOVES_DOCS_COUNT_ALIAS = 'movesDocsCount'` | 일치 |
| 프로젝트 이슈 술어 | `moves_RMS_projectId = "<id>"` | 같은 술어 + `AND movesDocsCount > 0` | 일치 |
| 이동 경로 | 라우트 `/project/:id`, `?name=` 읽음 | `/jira/apps/{appId}/{envId}/project/{id}?name=` | 일치 |
| 검색 상한 | 2,000건, 넘으면 잘림 표시 | 2,000건, 넘으면 경고 | 일치 |
| 빈 값 | 페이지 0건이면 프로퍼티 삭제 | 프로퍼티 없으면 `[]` | 일치 |

| 실행 | 결과 |
|---|---|
| Workforce `static/ui` jest 전체 | 127 스위트, 2,055건 통과 |
| Workforce `CI=true npm run build` | 성공, 번들 예산 안(main gzip 481KB / 950KB, panel 329KB / 350KB) |
| Workforce Docs 루트 `npm test` | 3 스위트, 59건 통과 |
| Workforce Docs `static/ui` jest | 14 스위트, 201건 통과 (외부 검토 반영 후) |
| Workforce Docs `CI=true npm run build` | 성공 |

Workforce 기존 파일 변경은 3개(`tabs.js`, `ProjectDetailTabs.jsx`, `requestJira.js`)이고 전부 추가다. 백엔드·manifest·`PermissionMap` 변경 없음.

## 실패

없음.

## 미검증 (배포해야 확인되는 것)

설계서 `moves-workforce-docs/docs/DESIGN.md` §10 의 P1~P8 전부. 테스트는 우리 로직만 증명하고 플랫폼 동작은 증명하지 못한다.
특히 P1(설치 감지)이 다르면 문서 탭이 항상 보이거나 항상 숨는다.

- Workforce Docs `forge lint`·`forge deploy` — `forge register` 전이라 실행 불가
- 두 앱 모두 실제 Jira 화면에서 띄워 본 적 없음
- Workforce 「문서 관리 열기」 버튼 — Workforce Docs 앱 id·환경 id 가 비어 있어 숨겨진 상태

## 알려진 동작

- 문서 탭에서 새로고침하면 설치 감지가 끝나기 전까지 첫 탭이 잠깐 보인다(주소의 탭 값은 유지되므로 결과는 맞다).
- Workforce panel 번들이 예산의 94%다(329KB / 350KB). 이번 변경과 무관하지만 여유가 적다.

## 갱신 (2026-09-30)

애드온 이름 변경(Moves Workforce Docs)·구조 재편·검색 기능·라이선스·보안 감사 반영에 따라 Workforce 쪽도 함께 바뀌었다.

| 변경 | 내용 |
|---|---|
| 이름 | `docLink*` → `movesDocs*`(파일·식별자·번역 키), 프로퍼티 키 `movesDocs`, 별칭 `movesDocsCount` |
| 계약 | `url` 필드 제거. 링크는 `buildDocumentUrl(siteUrl, id)` = `/wiki/pages/viewpage.action?pageId=<id>` |
| 읽기 상한 | 이슈당 30건, id 숫자 1~19자리, 제목·스페이스 255자, 분류 30자 — 쓰는 쪽과 동일 |
| 권한 | 문서 탭 `canRender: canReadProject`, 이슈 조회는 `findProjectById` 성공 뒤에만(`enabled`), 로딩은 `isPending` |

교차 검증(양쪽 `movesDocsProperty.js` 대조): 프로퍼티 키·별칭·필드 집합(`id,title,spaceName,category,linkedAt[,linkedBy]`)·읽기 상한·링크 형식 일치.

| 실행 | 결과 |
|---|---|
| Workforce `static/ui` jest | 127 스위트 2,058건 통과 |
| Workforce `CI=true npm run build` | 성공(아래 별도 확인) |
| Workforce Docs 루트 jest | 285건 통과 · 프론트 446건 통과 · CI 빌드 성공(소스맵 0건) |

Workforce 의존성: 이번 변경에서 `package.json` 은 건드리지 않았다. 다만 보안 감사에서 **기존 운영 의존성에 높음 등급 취약점(루트 7·프론트 17)** 이 있음이 확인됐다(`@forge/bridge` 5.x 경유 `linkify-it`, `undici`, `react-router` 등). 별도 정리 필요.
