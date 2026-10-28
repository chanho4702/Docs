---
title: MovesEye 빠른 시작 가이드
doc_type: guide
audience: [운영자, 관리자]
status: current
owner: MovesEye 팀
baseline: 2026-08-05
source_of_truth: FE SideNav/routes + Spring settings/host/event APIs
reviewed_at: 2026-08-05
review_cycle: monthly
deployment_scope: source flow; target environment must be verified
---

# MovesEye 빠른 시작 가이드

## 1. 시작 전 확인

- 접근 가능한 MovesEye URL과 사용자 계정이 있어야 한다.
- 관리자는 연결할 Zabbix API URL과 수행할 작업에 맞는 전용 계정을 준비한다. 조회만 할 계정과 Host·Template·Item·Trigger를 변경할 계정의 권한을 분리한다.
- 브라우저가 MovesEye와 같은 운영 환경의 cookie 정책을 허용해야 한다.
- 실제 비밀번호와 token을 문서·메신저·스크린샷에 남기지 않는다.

> 변경 안전장치: 아래의 Host 생성, 자산 동기화, acknowledge는 외부 구성이나 운영 상태를 바꾼다. sandbox 또는 사전 지정된 test Host/Problem에서만 수행한다. 운영 대상에서는 변경 승인, 영향 범위, rollback 계획이 없으면 실행하지 않는다.

## 2. 관리자 — 첫 데이터 확인까지

### 1단계. 로그인과 권한 확인

로그인 후 홈이 열리는지 확인한다. 메뉴가 보이지 않으면 사용자 Role과 User Group–Host Group 할당을 먼저 점검한다.

### 2단계. Zabbix 연결 정보 확인

`Zabbix 관리 > 연동 정보`에서 API URL과 관리 계정을 등록·검증한다. 연결 검증이 실패하면 새 설정을 활성화하지 않고 기존 정상 설정을 유지해야 한다. Zabbix version과 site 정책에 따라 필요한 최소 권한이 달라질 수 있으므로, 실제 변경 작업 전에 전용 계정의 read/write 범위를 별도 권한표로 승인받는다.

현재 [Credential 보호 정책](../operations/solutions--%EC%8B%9C%ED%81%AC%EB%A6%BF-%EB%B3%B4%ED%98%B8-%EC%A0%95%EC%B1%85.md)은 `draft`다. 암호화·masking·회전 방식이 확정되고 정책이 `current`가 되기 전에는 production credential을 등록하지 않는다.

### 3단계. 호스트 확인 또는 등록

`Zabbix 관리 > 호스트 관리`에서 기존 호스트가 보이는지 확인한다. 새 호스트를 등록할 때는 다음을 최소 확인한다.

- Host name과 표시명
- Host Group
- Interface(IP 또는 DNS, port)
- Template
- monitored by: Server, Proxy 또는 Proxy Group

등록 직후 live check 결과와 자산 자동 연결 여부를 확인한다.

### 4단계. 사용자와 조회 범위 확인

사용자·Role·User Group을 확인하고, User Group에 허용할 Host Group을 연결한다. 관리자가 아닌 계정으로 다시 접속해 허용된 그룹만 보이는지 검증한다.

### 5단계. 모니터링 화면 확인

`모니터링 > 호스트 그룹`에서 그룹을 열고 다음을 확인한다.

- KPI와 상태 집계
- CPU·메모리·디스크·트래픽 추이
- 상위 호스트와 호스트 목록
- 데이터가 없을 때 0으로 오인시키지 않는 빈 상태

### 6단계. 장애 흐름 확인

`이벤트·알림 > 문제`에서 활성 Problem을 열어 severity, 발생 시각, host, acknowledge 상태를 확인한다. 권한이 있다면 acknowledge 후 목록과 상세가 함께 갱신되는지 확인한다.

## 3. 일반 사용자 — 5분 탐색

1. 홈에서 전체 상태와 주요 요약을 본다.
2. `모니터링 > 호스트 그룹`에서 담당 그룹을 선택한다.
3. 문제가 있는 호스트를 열어 CPU·메모리·디스크·네트워크 상세를 본다.
4. `이벤트·알림`에서 같은 host의 Problem과 이력을 확인한다.
5. 장비 맥락이 필요하면 `자산 관리`에서 자산 상세·비용·맵을 확인한다.

## 4. 첫 점검 체크리스트

- [ ] 로그인과 refresh가 정상이다.
- [ ] Zabbix 연결 정보가 유효하다.
- [ ] 최소 1개 Host Group과 Host가 보인다.
- [ ] 사용자별 조회 범위가 기대와 같다.
- [ ] 모니터링 상세에서 최근 데이터와 `syncTime`을 확인했다.
- [ ] Problem 목록과 상세가 연결된다.
- [ ] 자산 동기화 후 Zabbix host와 자산이 중복되지 않는다.
- [ ] 운영 로그나 화면에 credential이 노출되지 않는다.

## 5. 자주 막히는 지점

| 증상 | 먼저 확인할 것 |
|---|---|
| 로그인이 반복해서 풀림 | FE/BE origin, cookie `Secure`/`SameSite`, refresh 응답 |
| 메뉴가 보이지 않음 | Role permission, User Group–Host Group 범위 |
| 모든 모니터링 데이터가 비어 있음 | Zabbix URL·계정, host/template 연결, 조회 기간 |
| 특정 metric만 비어 있음 | 해당 host의 item key, history type, trend 보존 기간 |
| 자산 지도 후보가 없음 | 자산–host 연결과 Zabbix inventory 좌표 |
| 관리 작업이 성공처럼 보이나 반영 안 됨 | HTTP status만 보지 말고 `ApiResult.status`, `code`, `errorCode` 확인 |

로컬 기동과 검증 환경 진단은 [로컬·검증 Runbook](../operations/solutions--%EC%9A%B4%EC%98%81%EC%9E%90-%EB%9F%B0%EB%B6%81.md)을 따른다. [Production Runbook](../operations/solutions--%ED%94%84%EB%A1%9C%EB%8D%95%EC%85%98-%EB%9F%B0%EB%B6%81.md)은 아직 실행 불가 `draft`이므로 current로 승격되기 전에는 이 문서로 production 절차를 대체하지 않는다.

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-05 | 현재 SideNav와 Spring 관리 흐름을 기준으로 최초 작성 |
