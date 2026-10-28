# MovesEye Credential 보호 정책

| 항목 | 내용 |
|---|---|
| 대상 독자 | 보안 책임자, 운영자, 개발자 |
| 문서 상태 | draft |
| 관리 주체 | TBD |
| 기준일 | 2026-08-05 safety baseline |
| 최종 검토 | 2026-08-05 |
| 검토 주기 | monthly |
| 정본 위치 | secret store·application binding 결정 필요 |
| 적용 범위 | all environments |

# MovesEye Credential 보호 정책

> Production 차단 조건: 실제 secret store, application 주입 방식, DB 저장 여부, masking, 조회 권한, 회전 owner가 확정되지 않았다. 이 문서가 `current`가 되기 전 production credential을 MovesEye에 등록하지 않는다.

## 1. 적용 대상

- Zabbix service account
- JWT signing secret
- PostgreSQL·Redis credential
- AWS credential
- SMTP, notification provider credential
- refresh/session 보호에 사용하는 key
- TLS private key와 외부 연동 token

실제 값, 운영 URL, account ID는 이 문서에 기록하지 않는다.

## 2. 필수 원칙

1. 개인 계정 대신 목적별 전용 service account를 사용한다.
2. 조회 기능과 Zabbix write 관리 기능의 권한을 분리한다.
3. secret은 source, Markdown, screenshot, log, CI artifact에 평문으로 남기지 않는다.
4. runtime에 필요한 process에만 최소 기간 주입한다.
5. UI/API 응답은 secret을 반환하지 않고 설정 여부와 마지막 회전 시각만 제공한다.
6. 입력·오류·audit log에서 secret과 인증 header를 masking한다.
7. 사용 종료·사고·담당자 변경 시 폐기·회전한다.
8. secret 조회·변경은 감사 가능하고 Role/Data Scope와 별도 고권한으로 제한한다.

## 3. 확정해야 할 저장 모델

| 결정 | 선택 | owner/evidence |
|---|---|---|
| Secret store 제품·namespace | TBD | TBD |
| Spring 주입 방식 | TBD | TBD |
| FE가 설정 상태를 확인하는 비밀 없는 응답 | TBD | TBD |
| `setting` JSON의 credential 제거·암호화·reference 방식 | TBD | TBD |
| 암호화 key 보관·회전 | TBD | TBD |
| log masking library·filter | TBD | TBD |
| CI/CD secret binding | TBD | TBD |
| break-glass 접근·승인 | TBD | TBD |

## 4. Zabbix account 기준

- read-only monitoring account와 configuration write account를 분리한다.
- Host·Template·Item·Trigger 관리가 필요할 때만 write account를 사용한다.
- account scope는 대상 Host Group과 API method 최소 범위로 제한한다.
- 연결 실패를 이유로 권한을 무조건 확대하지 않는다.
- 저장·변경 후 실제 secret을 다시 표시하지 않는다.

정확한 최소권한 matrix는 Zabbix version과 site policy를 검증해 별도 표로 추가한다.

## 5. Rotation·사고 대응

| 사건 | 즉시 조치 | 후속 검증 |
|---|---|---|
| log·문서 노출 | 접근 차단, secret 폐기·회전 | history/artifact 제거, audit |
| 담당자 변경 | 개인 접근 회수, shared key 회전 판단 | 접근 목록 review |
| 인증 실패 급증 | account lock·expiry·endpoint 확인 | 무분별한 권한 확대 금지 |
| secret store 장애 | fail-closed 또는 승인된 break-glass | 복구 후 임시 secret 폐기 |

Rotation에는 새 값 발급, 병행 전환 가능 여부, application restart/reload, old 값 폐기, smoke test, audit evidence를 포함한다.

## 6. Current 승격 조건

- [ ] 저장 모델의 모든 TBD 확정
- [ ] DB/API/log에서 plaintext secret 미노출 test
- [ ] 최소권한 Zabbix read/write account 검증
- [ ] rotation rehearsal 성공
- [ ] owner·on-call·break-glass 승인
- [ ] production Runbook에서 이 정책을 참조

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-05 | 안전 baseline과 미결정 gate를 draft로 작성 |
