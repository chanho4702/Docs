# 스트라드비전 두 앱 프로퍼티 제안서

사용자는 Workforce + Approval 두 앱과 Jira entity property 방식을 채택한 상세 문서·PPT를 요청했다. 정책 결정 설문보다 요구사항별 구현 방식, 검증 절차, 증거를 중심으로 설명하도록 명시했다.

- 산출물: `C:/CloudJira/moves-approval-jira/output/stradvision-proposal-20261015/`의 Word 23쪽 및 PPT 21장.
- 근거: 기존 스트라드비전 요구 요약, 최신 CUSTOMER_REQUIREMENTS_BRIEF·PROPERTY_INTEGRATION_FULL_REVIEW·검증 가이드. 과거 월 타임시트 중심 설명 대신 건별 승인과 기간 마감으로 정리했다.
- 증거 등급: 현재 코드, 과거 개발 확인, 이번 로컬 확인, 미실행 실사이트 수용 시험을 분리했다. 프로퍼티 삭제 재게시 문제·최신성·승인과 visibility 간격을 이미 해결한 것으로 쓰지 않았다.
- 이번 실행: 요청·통제·이력·쓰기 규칙·인증 문서 6 suites / 151 tests 통과, check:bundle 통과. 제품 코드 변경·배포 없음.
- 산출물 검증: artifact-tool PPT 구조·레이아웃·글꼴·재import 통과. Word는 LibreOffice 부재로 전용 Word COM 인스턴스로 PDF를 내보내 렌더를 확인했다. 표 뒤 page-break 전용 문단이 빈 페이지를 만들 수 있어 다음 제목의 pageBreakBefore로 변경했다.

관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-entity-property-integration-2026-10-14|moves-approval-entity-property-integration-2026-10-14]]

## 후속 변경 — API 상호 호출 제안으로 전환

사용자가 같은 날 프로퍼티 방식 대신 두 앱이 각각 외부 API를 제공하고 서로 호출하는 방식으로 제안 전제를 변경했다. 이어 기존 검증 결과를 첨부하고 본인이 수행할 시험 결과 칸을 비워 달라고 요청했다.

- v2 산출물: `output/stradvision-api-20261015/` Word 31쪽, PPT 22장, 검증 원본 ZIP. v1은 이전 전제의 기록으로 보존.
- apiRoute·3LO·설치별 연결·token 갱신·사용자 위임과 시스템 호출을 구분. 사용자 accountId 전달만으로 권한을 인정하지 않고 현재 원장·팀 범위·실제 사용자 Jira 컨텍스트를 확인하는 설계.
- 상태 조회 후 저장의 경쟁 상태를 쓰기 예약·opId·완료 대조·UNKNOWN 보류로 처리하는 신규 프로토콜을 제안. 기존 구현 완료로 표시하지 않음.
- 기존 6 suites / 151 tests와 check:bundle 원본 로그·JSON·SHA256 첨부. 프로퍼티 계약 테스트가 신규 API 통합을 입증하지 않는다는 범위를 명시.
- 사용자 D01~D07과 개발 A01~A07 총 14개 기록표의 실제 결과·판정·증거/실행일은 모두 공란임을 OOXML로 확인. API 왕복·3LO 무인 갱신은 미실행.
- 제품 코드·manifest 수정과 배포는 하지 않았다. 사용자 결정은 제안 전제 변경이며 현재 구현은 여전히 기존 경로다.


## 2026-10-16 고객 제안 문서 분리

사용자 요청에 따라 개발·기능 제공 제안서와 기능 검증 결과서의 Markdown 2종으로 분리했다. 구체적인 API 계약·인증·내부 모듈은 별도 기술 문서 범위로 두고, 고객 제공 기능과 업무 흐름을 중심으로 작성했다. native draw.io 6페이지(구성 2, 업무 흐름 4), PNG 미리보기와 기존 검증 원본을 묶어 제공했다. 기존 151개 테스트·번들 결과는 10월 15일 원본을 보존했으며 신규 API 실측으로 주장하지 않았다. 사용자 7개·개발 7개 후속 시험 결과란은 공란이다.


### v3.1 Forge 플랫폼 구성 보완

사용자 요청으로 제안서에 Atlassian 관리 인프라, Custom UI·Forge Functions, 앱별 SQL/KVS/Custom Entity, app REST API 및 Jira REST API 경계를 추가했다. 공식 문서에서 apiRoute Preview·3LO·관리자 활성화 모델을 확인했고 현재 manifest의 SQL 및 Workforce apiRoute 선언을 근거로 기록했다. 실제 양방향 API 시험은 미실행 상태를 유지했다. draw.io와 PNG 및 전체 ZIP을 갱신했다.


### v3.2 데이터 소유권과 제공 정보

사용자가 요구한 아키텍처 세부 수준은 플랫폼 명칭뿐 아니라 DB별 정보·앱별 책임·실제 교환 정보였다. 저장 구조를 확인해 Workforce의 사용자/프로젝트 SQL과 팀 Custom Entity, Approval의 요청/결정/통제/이력 원장을 구분하고 데이터별 제공 시점·수신 후 사용·화면 노출을 명시했다. draw.io DB 원통 도형과 정보 흐름 2페이지를 추가해 총 8페이지가 되었다. 신규 API 응답 항목은 제안 예시로 표시하고 실제 시험으로 과장하지 않았다.


### 문서 도식 편집 원본과 이미지 통일

사용자 수정본의 블루·청록·보라 스타일을 제안서 8개 도식에 적용했다. 각 이미지 아래에 한 페이지 draw.io 편집 링크를 추가하고 통합 8페이지 원본도 유지했다. mxGraph에서 실제 native 객체를 렌더링해 PNG/SVG를 갱신했다. 첫 페이지 비어 있음과 음수 좌표 문제를 피하고, 수정 파일 저장만으로 Markdown PNG가 자동 갱신되지는 않음을 안내했다.


### 고객 PDF 스타일의 제안 PPT

사용자 제공 [디무브] 협업공간 유지방안 PDF의 다크 표지·청록 포인트·밝은 본문·설명/증거 분할 레이아웃을 참고해 12장 PPT를 작성했다. 이용 흐름은 1장으로 줄이고 외부 API 제공 및 승인·마감 후 수정 통제를 강조했다. API, 앱 차단, 직접 REST 차단 3장에 증거 화면·실제 결과·판정·실행일 공란을 마련했다. 기존 151개 테스트는 별도 범위로 설명했다. native 도형/표, 렌더 전체 확인 및 최종 패키지 검사 후 바탕 화면 참고 자료 폴더에 복사했다.


### 이력 보관 및 정기 파일 제공 보강

사용자 요청에 따라 PPT를 14장으로 확장하고 개발 제안서 v3.3에 승인·반려/워크로그 변경 이력의 Forge Storage 보관, Description 부분 지원, 정기 파일 내보내기를 추가했다. 저장공간 관리는 파일 생성만으로 회수되지 않으므로 파일 대사·보관 확인 후 정리 가능한 이력만 관리하고 승인·잠금 핵심 근거는 보존하는 제안으로 기술했다. 주기·형식·보관 위치는 미확정이며 기존 검증 증거 공란은 유지했다.


### PPT 디자인 정돈

Noto Sans KR로 글꼴을 통일하고 행 형태의 제안 요약, 네이비 표 헤더, 제목·행간·여백을 적용했다. 14장 렌더와 패키지 검사를 완료하고 검증 증거 입력란의 공란을 유지했다.
