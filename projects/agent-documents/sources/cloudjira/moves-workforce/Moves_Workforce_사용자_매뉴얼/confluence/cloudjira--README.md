# Moves Workforce 한영 고객 가이드 편집본

고객 사용자와 고객 관리자를 위한 한국어·영어 가이드입니다. 기존 매뉴얼을 사용 목적 중심으로 재구성하고 두 언어를 같은 페이지 단위로 관리합니다.

- [한국어 가이드](ko/cloudjira--index.md)
- [English Guide](en/cloudjira--index.md)
- [캡처 요청 목록](cloudjira--image-requests.md)
- [검증 및 게시 준비](cloudjira--publication.md)

## 기준과 현재 상태

| 항목 | 내용 |
|---|---|
| 요청 확정일 | 2026-10-04 |
| 독자 | 고객 사용자·프로젝트 담당자·팀장·고객 관리자 |
| 화면 기준 | [dmove-staging의 Moves Workforce](https://dmove-staging.atlassian.net/jira/apps/f8962f17-9f12-43d0-91f5-7f3a626c1bbf/d4db76d2-78e2-47b6-a931-bcbd33ac8f7d) |
| 게시 대상 | [dmove-addons의 MW 공간](https://dmove-addons.atlassian.net/wiki/spaces/MW/overview?homepageId=114327890) |
| 본문 근거 | 기존 사용자·관리자 매뉴얼, 빠른 시작, 앱 번역 파일, 일부 권한 소스 |
| staging 검증 | Chrome 연결 확보. 우선 8종과 프로젝트 대시보드의 영어 화면 확인·캡처 완료. 역할별 접근·저장 동작은 미검증 |
| 배포 버전 | 미확인. staging이라는 사이트 이름만으로 Forge 환경을 추정하지 않음 |
| Confluence 게시 | 핵심 21쌍 + 부속 23쌍 = 한·영 44쌍, 88페이지 게시. 공개 본문·목차·실제 링크·상호 언어 전환 검증 통과. 공간 홈·기존 진입 안내 2페이지와 심사 안내 2페이지 별도 갱신 |
| 이미지 | 고객 가이드용 20장과 진단용 1장 확보. 한·영 공통 사용, 각 언어의 캡션·대체 텍스트 연결. 추가 후보 일부는 미확보 |

현재 로컬 소스는 **staging 부분 검증 편집본**이며 Confluence에는 이미지 없이 따라갈 수 있는 본문을 게시했습니다. My Work·프로젝트 목록·인력·간트·대시보드·문서 관리·구독·일반 설정·권한 편집 화면을 확인했습니다. 역할별 접근·저장 동작과 배포 버전 검증은 남아 있습니다. Jira 이슈 패널은 설치 버전에 따른 조건과 My Work 대체 경로를 안내합니다.

실제 핵심 게시 상태는 `_workspace/bilingual-guide-preview/browser-publication.json`, 부속은 `supplemental-publication.json`, 공간 홈·기존 진입 안내는 `auxiliary-publication.json`입니다. `bilingual-verification.json`은 88페이지·44쌍의 상호 링크와 번역 상태를 검증합니다. 용어집의 한국어 대조 열은 의도적으로 유지합니다. `page-map.json`은 로컬 핵심 42페이지의 빌드 계획이며 실제 게시 상태를 대신하지 않습니다.

이미지 업로드는 Chrome ChatGPT 확장의 **파일 URL에 대한 액세스 허용**이 필요해 미실행입니다. 사용자 지시에 따라 공개 본문 **75곳**에 삽입 위치와 설명을 표시했습니다. 확보된 이미지는 실제 파일명, 미확보 이미지는 ‘추가 캡처 필요’로 구분합니다. 로컬 파일을 OS에서 편집기로 드래그하는 기능은 현재 제공된 도구에 없습니다.

기존 부속 상세 문서는 `supplemental/ko`·`supplemental/en`에 대응 소스를 관리합니다. 핵심 로컬 미리보기 빌드와 부속 Confluence 게시 검증은 별도 실행합니다.

- [한국어 게시 가이드](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/172326913)
- [English published guide](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204046349)
- [Jira·Confluence 심사 안내](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/203751433) · [English reviewer walkthrough](https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/203718677)

## 편집 원칙

1. 한국어·영어 페이지는 같은 파일 이름과 내용을 사용하고 상단에서 서로 이동합니다. 내용 변경은 두 언어에 함께 반영합니다.
2. 메뉴·버튼은 `locales/kr`·`locales/en`을 참고하되 최종 판단은 staging 화면으로 합니다.
3. 고객에게 필요한 목적·사전 조건·단계·결과·문제 해결을 우선합니다. 소스 경로·DB 마이그레이션·개발용 명령은 고객 본문에서 제외합니다.
4. 개인 연봉, 비용, 조회 범위는 권한별로 설명합니다. 권한 세트의 이름만으로 접근 범위를 단정하지 않습니다.
5. 이미지가 없는 곳은 깨진 이미지 링크 대신 구체적인 요청을 둡니다. 공개 전에 캡처를 넣거나 이미지 없이도 따라갈 수 있도록 문장을 확정합니다.
6. 기존 세부 매뉴얼은 근거 자료로 보존합니다. 이 편집본이 staging 검증을 통과한 뒤 고객용 정본으로 전환합니다.

## 기존 문서에서 개선한 점

- 빠른 시작의 고정 소요 시간과 환경 미확인 설치 절차를 줄이고 완료 확인 항목을 추가했습니다.
- My Work의 워크로그 작성·수정·삭제에 필요한 Jira 권한을 분리했습니다.
- 담당 팀 지정, 프로젝트 인력 등록, Jira 담당자 지정의 차이를 절차에 반영했습니다.
- 예산, 계획 인건비, 워크로그 기반 비용 추정을 구분했습니다.
- 팀 범위를 PM·PMO 같은 이름으로 단정하던 설명을 실제 권한·프로젝트 범위·팀장 관계를 확인하도록 바꿨습니다.
- 지표의 시간 범위·집계 시각·근사치·부분 결과를 함께 설명했습니다.
- 사용자 동작과 관계없는 서버 구현 설명을 편집용 근거로 분리했습니다.

릴리스 노트는 staging 배포 이력을 확인한 뒤 작성합니다. 문서 편집일을 제품 출시일로 사용하지 않습니다.
