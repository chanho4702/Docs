# [DEMO] 시연용 데모 데이터 시더

dmove-staging 사이트에 Moves Workforce 시연용 데이터를 생성한다.

## 구성

| 구성요소 | 역할 |
|---|---|
| `seed.js` (외부 스크립트) | Jira 데모 프로젝트/이슈/상태전이 + **계정별 토큰으로 워크로그 작성자 분산** |
| 웹트리거 `demo-seed-trigger` (`src/trigger/demoSeed.js`) | 앱 DB(project/users/projectusers/user_schedule) + KVS role/level + readOnly 앱필드(`moves_RMS_projectId`) 태깅 |

생성 내용: `[DEMO]` 프로젝트 4개(진행 2·완료 1·예정 1), 인력 N명(역할/직급/연봉/투입급여 PROJECT·ANNUAL 혼합), 이슈 ~60개, 워크로그 수백 건(최근 6개월), 연차/반차/출장 일정.

## 실행 절차

1. **staging 배포** (웹트리거 포함): `forge deploy -e staging`
2. **웹트리거 URL 확보**: `forge webtrigger` → installation `dmove-staging`, trigger `demo-seed-trigger`
3. **config 작성**: `config.example.json` → `config.local.json` 복사 후 계정별 이메일+API 토큰 입력
   - 토큰 발급: https://id.atlassian.com/manage-profile/security/api-tokens (각 계정으로 로그인해 발급)
   - 첫 계정(또는 `"admin": true`)은 Jira 프로젝트 생성 권한 필요
4. **실행**:
   ```bash
   node scripts/demo-seed/seed.js check   # 토큰 검증
   node scripts/demo-seed/seed.js all     # 전체 생성 (jira → app → enrich)
   node scripts/demo-seed/seed.js enrich    # 이슈 보강만 재실행 (시작일·계획 공수·등록이력, 멱등)
   node scripts/demo-seed/seed.js beautify  # 간트(폴더/WBS/선후행) + 포털 착수 워크로그 (worklog 는 재실행 시 중복 주의)
   ```
   보조 스크립트: `verify.js`(시딩 검증), `probe.js`(필드 쓰기 가능 프로브), `fixlinks.js`(링크 방향 재생성 일회성)
5. **삭제(초기화)**: `node scripts/demo-seed/seed.js cleanup --yes`

## 주의

- `config.local.json`/`state.local.json` 은 gitignore 됨 — API 토큰 커밋 금지.
- Jira 데모 프로젝트는 **company-managed(기업 관리형)** 로 생성된다. 팀 관리형은 Forge 필드가 fields 응답에서 빠져 앱이 이슈를 못 읽는다.
- 워크로그 author 는 API 호출 계정으로 고정되므로(지정 불가) 계정 수 = 시연에 보이는 인력 수.
- 시연 종료 후 웹트리거(`manifest.yml` 의 `demo-seed-trigger`, `src/trigger/demoSeed.js`)는 제거 대상.
