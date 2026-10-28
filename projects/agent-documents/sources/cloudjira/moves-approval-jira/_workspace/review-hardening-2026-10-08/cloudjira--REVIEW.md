# 전체 검수 후속 개선

작성: 2026-10-10. 작업 시작: 2026-10-08. 현재 상태: 구현·최종 검증·기능 단위 커밋 완료.

## 반영 범위

1. PIN 실패 횟수·잠금·변경·삭제를 같은 사용자, PIN 세대와 rev를 조건으로 갱신한다. 최초 등록 경합은 기존 PIN을 덮어쓰지 않는다.
2. 내보내기 삭제 허가를 서버 세션으로 관리한다. 클라이언트가 보낸 cutoff/count 대신 서버가 실제 내보낸 ID와 자료 지문을 사용한다. 세션 소유자·완주·7일 유효기간·현재 보관 정책을 확인한다.
3. 승인 내보내기와 삭제 전에 현재 대상 열람 권한을 확인한다. TIMESHEET와 WORKLOG_CREATE에는 기존 상세 접근 규약을 적용한다. 워크로그 이력은 기존 Q73의 가린 자료 포함 정책을 유지한다.
4. 필드 PUT 직전에 UNKNOWN을 저장한다. 타임아웃·결과 불명확·전송 후 중단·오래된 APPLYING을 자동 재전송하지 않는다. 적용 중이거나 미적용인 필드 변경 승인도 보관 삭제에서 보호한다.
5. 워크로그 스윕이 같은 페이지에서 24회 실패했다는 이유로 페이지와 watermark를 건너뛰지 않는다.
6. 만료·마감 임박·독촉 후보를 키셋으로 이어 읽는다. 이미 발송한 행과 정책상 제외한 행도 원본 스캔 진행에 반영하여 뒤 후보가 막히지 않게 한다.
7. 업무함·미읽음 집계에 현재 열람 권한을 적용한다. 예산이나 권한 조회 실패로 완주하지 못하면 incomplete를 반환하고 UI에서 정확한 전체 건수로 표시하지 않는다.
8. 승인 Excel과 워크로그 이력 Excel은 같은 서버 세션의 페이지를 끝까지 받은 뒤 파일 생성 성공 시에만 완료를 확인한다.

## 남는 설계 한계

- Jira 필드 읽기와 PUT 사이의 외부 편집 경쟁은 원자적으로 막을 수 없다. UNKNOWN을 확정적으로 해소하는 이력 대조·수동 복구 절차는 이번 변경에 포함하지 않는다.
- 삭제 직전 지문 재검사 이후 다른 생산자가 자식 자료를 변경하는 경쟁까지 원자적으로 차단하지 않는다. 부분 자식 삭제 후 재개는 같은 부모 세대·현재 권한에 한정한다. 전체 생산자의 SQL 경계를 함께 묶는 fencing은 별도 설계가 필요하다.
- 워크로그 수집의 영구 장애 페이지는 계속 재시도하므로 뒤 페이지가 정체될 수 있다. 실패 ID별 영속 재처리 큐는 아직 없다.
- 내보내기는 이번에 명시적으로 조회하는 요청·결정·이벤트·도메인 메타데이터의 보관 자료다. 모든 DB 컬럼을 복원하는 백업 형식이라고 보장하지 않는다.
- Forge SQL의 실제 경합·응답 시간과 개발 사이트의 Jira 권한·전송 결과는 이번 로컬 검증으로 입증되지 않는다. 배포·설치·운영 자료 삭제는 수행하지 않는다.

## 검증

백엔드 → UI → UI build → Forge lint 순서로 최종 검증했다.

- 백엔드: 108 suites / 1,479 tests PASS, 23.661초.
- UI: 50 suites / 419 tests PASS, 18.269초. 알림 패널의 불완전 0건에서 전체 읽음 버튼을 막지 않는 회귀 3개 포함.
- UI build: exit 0. 업무함 gzip 45.73 kB, 직전 빌드 대비 187 B 증가. 의존성의 source map 누락 및 Atlaskit CSS 계산 경고가 있으며 앱 소스 컴파일 실패는 없다. 저장소에 별도 수치 예산 실패 조건은 없어 출력 크기를 직접 확인했다.
- Forge lint: exit 0, `No issues found.`
- 번역 merge 및 diff whitespace 검사 통과. 한국어 원문 인코딩을 직접 확인했다.
- 빌드 산출물·생성 번역은 커밋하지 않았다. 최종 작업 트리는 깨끗하다.

원본 로그·JSON: `backend-final.*`, `frontend-final.*`, `build-final.log`, `lint-final.log`.

## 커밋

사용자 승인에 따라 기능 단위로 커밋한다. 경로를 지정해 스테이징하며 빌드 산출물·생성 번역은 제외한다. 푸시는 수행하지 않는다.

| 커밋 | 단위 |
|---|---|
| d51cc2d | SQL 스키마 준비 |
| d1e487f | PIN 동시 검증·변경·삭제 보호 |
| dff4aac | 필드 UNKNOWN과 중복 전송 차단 |
| 5f402f7 | 서버 내보내기·현재 권한·삭제 허가 |
| 9a49838 | 배치 이어받기·현재 가시성 집계 |
| 075e6cd | 화면·Excel·한영 안내·알림 버튼 연동 |

## 관련 산출물

- [설계](cloudjira--01_architect_design.md)
- [검증 체크리스트](cloudjira--verification-checklist.md)
- [요구사항](00_input/cloudjira--requirement.md)
- [백엔드 보고](cloudjira--02_backend_report.md)
- [프론트 보고](cloudjira--02_frontend_report.md)
- [통합 검증](cloudjira--03_verify_report.md)
- [실환경 확인 과제](cloudjira--04_spike_todo.md)

## 플랫폼 근거

스케줄 함수는 기본 실행 제한과 잔여 시간을 고려해 작업을 나눈다. 근거: [Forge invocation limits](https://developer.atlassian.com/platform/forge/limits-invocation/), [scheduled trigger](https://developer.atlassian.com/platform/forge/manifest-reference/modules/scheduled-trigger/).
