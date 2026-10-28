# 승인·마감 후 수정·삭제 차단 검증

기준일: 2026-10-14. 구현 구조, 사이트 설치 조건, 재현 절차와 증거 보관 방법을 정의한다. **실제 사이트의 통과 결과지는 아직 작성되지 않았다.** 단위 테스트 통과를 Jira 직접 REST 차단의 증거로 대신하지 않는다.

## 보장하려는 동작

작성자는 승인된 워크로그와 마감된 기간의 워크로그를 수정·삭제할 수 없어야 한다. 시간, 작업일, 설명 변경과 열린 기간으로 옮기기를 모두 포함한다. 소명·승인 결과 게시 지연으로 기존 잠금이 풀리지 않아야 한다. 화면에서는 기록과 승인자·결정 시각·사유를 조회할 수 있다.

대상은 Jira 프로젝트 권한 스킴을 우회할 관리 권한이 없는 일반 사용자다. 사이트 관리자의 권한 재부여, 다른 앱의 앱 권한 행사, 이슈 자체 삭제까지 앱이 절대 금지한다고 주장하지 않는다. 이 경우는 변경 감지·감사 보존·확정 집계 검증 대상으로 구분한다.

## 두 겹의 차단과 공식 근거

1. Approval 서버는 DB 승인 원장·인증 상태·기간 정책을 검사한 뒤 쓰기를 허용한다. 버튼 숨김이나 서명 없는 Jira property를 승인 근거로 사용하지 않는다.
2. Jira 직접 PUT·DELETE를 막으려면 프로젝트의 워크로그 수정·삭제 권한을 일반 사용자에게서 회수하고 앱의 통제된 쓰기 경로를 사용한다. `PERMISSION_SCHEME` 준비 상태와 진단을 확인한다. 미승인·미마감 기록의 편집은 서버가 검증한 앱 경로로 수행한다.

Jira REST의 수정·삭제 권한은 [Issue worklogs REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-worklogs/)와 [시간 추적 권한](https://support.atlassian.com/jira-cloud-administration/docs/time-tracking-permissions/)에 명시되어 있다. 개별 승인·기간 조건은 앱 서버에서 검사하고 직접 경로는 Jira 권한으로 제한한다.

[Time tracking provider](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-time-tracking-provider/)는 기본 입력 UI와 Work log 탭을 대체한다. 선택 자체가 REST 쓰기 권한을 회수하지는 않는다. visibility 제한 방식도 사이트 실측 없이 강제 잠금으로 인정하지 않는다.

## 실행 전 조건

| 항목 | 기록할 내용 / 통과 조건 |
|---|---|
| 설치 | 사이트·cloudId·두 앱 appId·환경·배포 버전·설치 major 버전 |
| 대상 | 운영 자료와 분리된 시험 이슈·워크로그 ID |
| 사용자 | 작성자 A, 팀장 B, 다른 팀 사용자 C. 각 호출의 실제 계정 구분 |
| 입력 UI | Moves Approval 시간 추적 제공자 선택, 연동 이슈 입력 탭 한 개 |
| 마감 | 1~90일 자동 마감 또는 명시적 수동 CLOSED. 0은 자동 마감 없음 |
| 시간 | 정책 시간대·기간 시작/종료·closeAt·관찰 시각(UTC와 현지 시각) |
| Jira 권한 | A/B/C에 Edit own/all 및 Delete own/all worklogs가 다른 역할로 재부여되지 않음 |
| 앱 권한 | 이슈 열람과 워크로그 읽기·편집·삭제 권한 확인 |
| 통제 | `getWorklogControlReadiness` READY, 필요한 자동·수동 관문 통과 |
| 연동 | 양 앱 연결과 서명 신뢰 키 검증. 키 없는 연동 ON은 통과 아님 |

자동 마감 5일의 예: 10월 기간 종료는 11월 1일 00:00, 마감은 11월 6일 00:00이다. 경계 직전과 정확히 경계 시각을 검사한다. 관리자 재개방은 명시적 정책 변경으로 기록한다.

## 시험 과정

### 1. 정상 편집

A가 앱 모달에서 2시간을 작성한다. 미승인·미마감 상태에서 수정과 삭제를 각각 시험한다. 이후 시험과 동일 계정·이슈·본문 형식을 사용하여 잘못된 인증·본문·이슈 열람 불가를 먼저 배제한다. 차단 시험용 기록은 다시 생성하여 ID를 기록한다.

### 2. 승인 잠금

B가 승인한다. A의 상세에 승인자·시각·수정 불가가 표시되는지 확인한다. 화면 수정/삭제, 직접 resolver, Jira REST PUT/DELETE를 각각 시도한다. 승인 상태, Jira 원본, 인증 시간·지문을 전후 대조한다. 게시 큐 반영 전에도 앱 변경은 거부되어야 한다.

### 3. 기간 잠금

다른 미승인 기록을 두고 해당 기간을 수동 마감한다. 수정·삭제·열린 기간으로 옮기기를 시험한다. 자동 마감은 경계 직전 허용·경계 이후 거부를 확인한다. 마감 전 접수된 승인 대기 기록을 승인해도 작성자 편집은 차단되어야 한다. 마감 뒤 신규 요청으로 우회할 수 없어야 한다.

### 4. 소명과 동시 처리

소명에는 사유가 필요하다. 접수·반려·재검토 승인 중 기존 확정 시간과 잠금이 유지되어야 한다. 같은 요청을 동시에 두 번 결정해도 결정은 한 번만 반영되어야 한다. 생성 이벤트 재배달과 투영 실패 재시도에서 요청·결정이 중복되지 않아야 한다.

### 5. 직접 Jira 경로

아래 요청은 시험 기록에서만 실행한다. 토큰은 비밀 저장소에서 읽고 로그·파일에 남기지 않는다. PUT 작업일과 형식은 정상 편집에서 확인한 값을 사용한다.

```http
PUT /rest/api/3/issue/{issueId}/worklog/{worklogId}
Content-Type: application/json

{"started":"2026-10-01T09:00:00.000+0900","timeSpentSeconds":10800}

PUT /rest/api/3/issue/{issueId}/worklog/{worklogId}
Content-Type: application/json

{"started":"2026-10-01T09:00:00.000+0900","timeSpentSeconds":7200,"visibility":null}

DELETE /rest/api/3/issue/{issueId}/worklog/{worklogId}?adjustEstimate=leave
```

각 변경 요청이 거부되고 원본이 남아 있어야 한다. 400, 401, 429, 5xx, 통신 실패는 차단 성공이 아니다. 404는 사전 앱 조회로 존재가 확인된 기록에서만 접근 제한 증거로 인정한다. 한 번 수정된 뒤 원상복구되어도 통과가 아니다.

`WorklogControlDiagnostics.G_BLOCK`은 조회·수정·visibility 해제·삭제 HTTP 상태를 개별 step으로 반환하고 앱 권한으로 시간과 제한 상태를 재확인한다. 관리자 시험 계정의 결과이므로 A/B/C 수동 시험을 대체하지 않는다. 진단은 시험 기록을 생성·삭제하며 정리 실패 시 `leftovers`를 반환한다.

## 수용 매트릭스

| ID | 상태·행동 | 통과 기준 |
|---|---|---|
| L01 | 미승인·미마감 본인 기록 앱 수정 | 정상 성공, 감사 이력 |
| L02 | 승인 기록 앱 수정·삭제 | 서버 거부, 원본·확정 값 불변 |
| L03 | 마감 미승인 기록 앱 수정·삭제 | 기간 잠금 거부 |
| L04 | 마감 기록을 열린 기간으로 이동 | 이전 기간 검사로 거부 |
| L05 | 승인/마감 기록 직접 Jira PUT·DELETE | 권한 거부 및 원본 존재 |
| L06 | visibility 해제로 우회 | 거부, 제한 유지 |
| L07 | 소명 접수·반려·승인 | 기존 확정 baseline과 잠금 유지 |
| L08 | 동시 결정·재배달 | 결정·열린 요청 중복 없음 |
| L09 | 게시 지연·재시도 | DB 잠금 유지, 뒤 정상 건 재처리 |
| L10 | 외부 권한으로 2h→3h 변경 | 변경 표시, 마감 확정 집계 2h |
| L11 | 외부 권한으로 승인 워크로그 삭제 | 감사 보존, 권한 있는 확정 집계 유지 |
| L12 | 이슈 자체 삭제 | SQL 보존과 조회/내보내기 제한 별도 기록 |
| L13 | 첫 Workforce 작성, Approval 미접속 | 검증된 팀장 확인 또는 승인자 선택 필요 표시 |
| L14 | 0일 설정 | 자동 마감 없음 안내. 기간 잠금 완료로 판정하지 않음 |

## 증거 보관과 판정

각 시험에 `시험 ID / 실행자 역할 / 사이트·버전 / 이슈·워크로그 ID / 시작·종료 시각 / 정책·readiness / 요청 경로 / HTTP 또는 resolver code / 변경 전후 값 / 결과`를 기록한다. Authorization, 비밀 키, 불필요한 설명 원문을 제외한다. 승인 ID·인증 revision·결정 이벤트 ID는 추적 가능하게 보관한다.

설정 화면, 승인 상세, 직접 호출 상태 코드, 진단 반환값, 원본·확정 시간 전후 대조를 묶어 파일별 SHA-256 목록과 검토자·보관 위치를 기록한다. SQL 증거는 허가된 관리자 조회 경로에서 얻는다.

L02~L09 중 하나라도 실패하면 **강제 잠금 검증 미완료**다. 확인할 수 없으면 미검증으로 남긴다. 테스트 통과, 버튼 비활성화, 시간 추적 제공자 선택만으로 수용 판정을 내리지 않는다.

## 구현 위치

- `src/resolver/worklog/WorklogService.js`: 쓰기 직전 검사와 통제된 실행.
- `src/resolver/worklogControl/WorklogControlContext.js`, `src/domain/worklogControl/rules.js`: 인증·승인·기간 잠금.
- `src/domain/timesheet/lock.js`: 시간대별 마감과 이전 기간 확인.
- `src/resolver/worklogControl/WorklogControlReadiness.js`: 권한 스킴 준비 상태.
- `src/resolver/worklogControl/WorklogControlDiagnostics.js`: 단계별 사이트 진단.
- `src/resolver/worklogCertification/`: 승인·소명·인증 투영·재처리.

자동 테스트와 실제 사이트 실행 여부는 [검증 기록](cloudjira--VALIDATION.md)에 구분한다.
