# Holiday·Role·Level·Skill 카탈로그 입력 검증

## 배경

RFC-192 점검에서 Holiday, Role, Level, Skill 관리 mutation은 화면의 입력 제약만으로는 방어되지 않거나, 직접 resolver 호출 시 잘못된 이름·날짜·중복·범위 값이 저장될 가능성이 남아 있다.

## 목표

- 각 카탈로그 create/update mutation의 서버 입력 검증을 단일 정책으로 정리한다.
- 빈 값, 형식 오류, 길이·수치 범위 오류, 동일 도메인 내 중복을 서버에서 거부한다.
- update 시 자기 자신을 중복으로 오인하지 않는다.
- 기존 저장 데이터·resolver 응답 계약·권한 정책을 깨지 않는다.
- 필요한 경우 프론트 오류 안내와 client-side 검증도 서버 규칙에 맞춘다.

## 제외 범위

- 카탈로그 데이터 모델 개편·일괄 정제 migration·권한 정책 변경은 제외한다.
- 사용자 변경 중인 README 및 root generated locale 파일은 수정하지 않는다.
