# 워크로그 승인 설계·운영 자료

작성 기준은 2026-10-14 작업 트리다. 이 자료는 **워크로그를 먼저 저장하고, 건별 승인을 받아, 승인되거나 마감된 기록을 보호하는 흐름**을 설명한다. 일반 이슈·상태 전환·필드 변경 승인 코드는 보존하지만 현재 기본 제공 기능에서 제외한다.

## 읽는 순서

| 목적 | 자료 |
| --- | --- |
| 승인·마감 잠금을 어떻게 증명하는가 | [차단 검증 절차](cloudjira--LOCK_VERIFICATION.md) |
| 두 앱이 어디에 무엇을 교환하는가 | [entity property 연동 설계](cloudjira--ENTITY_PROPERTY_INTEGRATION.md) |
| Approval DB의 테이블과 관계는 어떻게 구성되는가 | [데이터베이스 ERD](cloudjira--APPROVAL_DATABASE_ERD.md) |
| 왜 이렇게 설계했고 실제로 어디에서 처리하는가 | [설계와 구현](cloudjira--DESIGN_AND_IMPLEMENTATION.md) |
| 사용자 요구를 빠짐없이 반영했는가 | [요구사항 대응표](cloudjira--REQUIREMENTS_TRACEABILITY.md) |
| 작성·승인·설정·장애 대응을 어떻게 하는가 | [사용자·관리자 가이드](cloudjira--USER_AND_ADMIN_GUIDE.md) |
| 200명 사용 시 비용과 보관 용량은 어느 정도인가 | [비용·용량 계산](cloudjira--COST_AND_CAPACITY.md) |
| 데이터·권한·비동기 경계를 한눈에 보기 | [아키텍처 HTML](diagrams/architecture.v2.html) · [원본 JSON](diagrams/architecture.v2.json) |
| 저장→요청→승인→잠금→게시 흐름 보기 | [처리 흐름 HTML](diagrams/workflow.v3.html) · [원본 JSON](diagrams/workflow.v3.json) |

HTML은 브라우저에서 독립 실행한다. 설명은 한국어이며 다이어그램 도구의 고정 Viewer UI와 HTML 언어 속성은 지원 언어 제약으로 English fallback을 사용한다. 앱 화면의 언어 설정과 관계없다.

## 구현과 검증을 구분해서 읽기

로컬 검증(2026-10-14): Approval 백엔드 190 suites/2,855 tests, UI 92 suites/816 tests; Workforce 백엔드 175 suites/2,405 tests, UI 171 suites/2,711 tests와 snapshot 1건이 통과했다. Approval `check:bundle`의 실제 webpack 번들 로드도 통과했다. 최종 실행과 브라우저 결과는 [검증 기록](cloudjira--VALIDATION.md)에 기록한다.

이 수치는 실제 Jira 사이트 설치·권한 스킴·큐를 실행한 결과가 아니다. 개발 사이트 배포·설치 업그레이드는 완료했다. 내부 연동은 서명된 entity property를 사용하며 Approval apiRoute는 제거했다. 직접 REST 차단 실측은 미완료다.

실사이트에서 확인해야 하는 항목은 Jira 권한 스킴과 통제 visibility의 실제 차단, 큐 처리 지연, 승인 후 Workforce 통계 갱신, 320/480px 이슈 iframe의 실제 표시다. 코드와 단위 테스트만으로 플랫폼의 모든 우회 REST 경로를 차단했다고 주장하지 않는다.

## 먼저 알아둘 제한

- 자동 요청은 자동 승인이 아니다. 승인자가 없으면 작성자가 선택해야 한다.
- 소명 접수만으로 승인·마감 잠금이 풀리지 않는다.
- 이슈 삭제 후에도 SQL 기록은 보관되지만, 현재 이슈 열람 권한을 확인할 수 없는 일반 화면에서 과거 내용을 공개하지 않는다. 승인 export에서도 현재 권한 필터로 제외될 수 있다. 변경 이력의 가린 기본 metadata export와 삭제 전 보관 파일을 별도로 취급한다.
- 승인 snapshot은 설명 원문 백업이 아니다. 수집하지 않은 과거 내용은 복구할 수 없다.
- 용량 알림은 관리자 접속 시 표시하는 인라인 안내다. 자동 파일 저장, 자동삭제, 외부 push/email은 구현하지 않았다.
- 요금은 공식 단가에 가정을 대입한 계획 값이다. 사이트별 청구서나 월 고정비 보장이 아니다.

## 유지보수

API·정책을 바꾸면 설계 문서와 대응표를 함께 고친다. 보안 범위는 저장소 [AGENTS.md](../../cloudjira--AGENTS.md)와 [CLAUDE.md](../../cloudjira--CLAUDE.md)가 우선한다. 과거 가이드의 사전 승인·직접 인증·상태 승인 절차는 현재 신규 사용자 흐름으로 적용하지 않는다.
