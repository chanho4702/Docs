# 논리 설계 감사 후속 최신화·수정 요구사항

## 목적

2026-08-03 논리 설계 전수 감사(`../03_verify_report.md`)에서 확인한 결함을 권장 순서대로 수정하고, 프로젝트 설계 문서를 현재 구현과 다시 일치시킨다.

## 실행 순서

1. 설계 문서 최신화
2. F-01 일정 `SELF` row ownership
3. F-02 Forge SQL DML 반환 shape 정규화
4. F-03 license 정책·diagnostics 우회 제거/보호
5. F-04 salary DTO 분리
6. F-06 polling response 계약 통일
7. F-05 calendar context/drag 계약 수정
8. F-07 미래 가동률 분모와 0 denominator 계약 수정
9. F-08 일정 overlap, F-09 `progressThreshold`, 직접 확인된 i18n 오류 정리
10. 전체 contract/test/build/Forge lint 재검증

## 필수 경계면 계약

- 일정 update/delete: `context.accountId`를 owner predicate에 포함하고 0행을 명시적 논리 오류로 반환한다.
- SQL DML: 공통 query 계층이 공식 raw shape `result.rows.affectedRows`를 안정적인 `rowsAffected` alias로 정규화한다. SELECT의 `rows` 배열은 보존한다.
- license: production paid 환경은 missing/failure를 조용히 허용하지 않는다. 임시 resolver가 중앙 registrar/PermissionMap/responseWrapper 밖에 남지 않는다.
- resource overview: 비용 권한 없는 응답에서 `salary`가 제거된다.
- polling: resolver는 `{ content: { job } }`, frontend는 `success`와 `content.job`을 순서대로 검사한다. transient 오류 시 server job을 삭제하지 않는다.
- calendar: context를 명시적으로 공급하고 drag 시 기존 시간·timezone을 유효한 event shape에서 가져온다.
- utilization: backend가 effective end를 오늘로 clamp한다. 분모 0은 `null`로 표현하며 UI는 `N/A`로 표시한다.
- progress threshold: manifest schema, seed, service, 설정 UI, validation이 하나의 설정 계약을 공유한다.

## 문서 최신화 범위

- `Moves_Workforce_아키텍처_설계서.md`
- `Moves_Workforce_데이터모델_ERD.md`
- `Moves_Workforce_핵심로직_정의서.md`
- `Moves_Workforce_개발자_온보딩.md`
- `README.md`
- `_workspace/logical-design-audit/01_architect_design.md`

문서는 현재의 Custom UI architecture를 사실로 기술한다. 프로젝트 지침의 UI Kit 전용 문구와 충돌한다는 governance 결정도 명시한다.

## 작업 트리 보존

검증 시작 시 사용자 미커밋 변경이 존재한다. 특히 `ResourceAnalysisPage.jsx`, locale, team UI 파일은 다른 작업과 겹친다. 기존 변경을 되돌리거나 덮어쓰지 말고 현재 diff 위에 최소 변경으로 합친다.

## 검증 기준

- backend 전체 Jest
- frontend 전체 Jest
- frontend production build
- i18n ko/en parity 및 정적 key 검사
- backend resolver ↔ frontend invoke response shape 교차 검증
- `pwd` 후 app root에서 `forge lint`

