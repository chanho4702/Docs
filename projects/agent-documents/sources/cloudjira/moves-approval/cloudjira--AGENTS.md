# 작업 규칙

> 아키텍처·디렉터리·도메인 규약의 단일 진실은 `CLAUDE.md` 다. 이 문서는 그 위에 얹히는 작업 규칙이다.
> 현행화 기준: 2026-10-04 · 소스 커밋 `fa07591`

## 코드 스타일

- 바닐라·관용적 JavaScript. 기존 파일의 주석 밀도·네이밍을 따라간다.
- **주석은 "왜"를 적는다.** 무엇을 하는지 다시 쓰는 주석, 방어적 부연, 장식 배너는 쓰지 않는다.
  이 저장소는 "왜 이 방어가 필요한가 + 언제 사고가 났는가"를 남기는 쪽이다.
- 버그 수정에 테스트·주석·부가 UI 를 부풀리지 않는다. 요청 범위를 지킨다.
- 파일을 만들기 전에 `static/ui/src/components/` 와 `src/rdb/query/` 의 공용 지점을 먼저 확인한다.

## 불변식 체크리스트 (변경 전 훑을 것)

- [ ] resolver 3종 세트 — `guardedDefine` + `PermissionMap` + `CONTROLLER_REGISTRARS`
- [ ] `SELF` mutation 은 `context.accountId` 를 SQL row owner predicate 까지 전달했는가
- [ ] CAS UPDATE 의 SET 절에 `rev = rev + 1` 이 있는가
- [ ] 조건부 UPDATE 로 남의 결정을 덮을 수 없는가 (`WHERE decision_type='PENDING'`)
- [ ] 도메인 함수에 `Date.now()`·in-place 변경이 섞이지 않았는가
- [ ] 목록 resolver 가 `filterVisiblePages` 로 건별 가시성을 좁히는가
- [ ] 신규 테이블 참조 전 `isTableReady()` 프로브를 했는가
- [ ] `whereIn` 에 빈 배열이 갈 수 있는 경로를 가드했는가 (fail-open 금지)
- [ ] 쿼리키는 `utils/queryKey/` 팩토리를 썼는가
- [ ] 마이그레이션 이름을 **배포 후 바꾸지 않았는가**
- [ ] 모듈 전역 캐시를 두지 않았는가 — 둬야 하면 `utils/runtimeScope` 의 `perInvocation`/`perInstallation` 으로 가둔다
- [ ] accountId 를 저장하는 새 테이블·컬럼은 `PrivacyReporter` 의 `ACCOUNT_SOURCES` 에 넣었는가

## 보안

- **가드 통과 ≠ 데이터 범위 확정.** 같은 데이터를 내주는 형제 resolver 를 전수 확인한다.
- Confluence REST 는 **`asUser()` 가 기본**. `asApp()` 은 아래 경로만이고, 늘릴 때는 사유를 여기 적는다:
  1. `onPageUpdated` 트리거의 본문 조회 — 트리거에 사용자 컨텍스트가 없다
  2. 리컨실·만료 스윕의 페이지 version 조회 — 같은 이유
  3. 라이선스 self-query — 앱 자신의 라이선스만 조회
  4. 개인정보 보고(`privacy.reportPersonalData`) — 저장한 accountId 의 폐쇄 여부만 받는다
  5. 보관 기간 정리(`filterRetainablePages`) — 사용자에게 안 보인 페이지가 Confluence 에서 사라졌는지만 판정한다
  이 경로로 읽은 내용은 **해시 계산·상태 판정 외에 어떤 형태로도 사용자에게 반환하지 않는다.**
- scope 는 최소로. 실제로 필요할 때만 추가하고 `forge install --upgrade` 를 함께 돌린다.
- Forge SQL/KVS 는 클라이언트 API 가 없으니 반드시 백엔드 resolver 를 경유한다.
- 로그에 사용자 텍스트(반려 사유·페이지 제목)를 남기지 않는다. `executeQuery` 는 쿼리 본문만 남기고 파라미터는 버린다.

## 트리거·스케줄

- **핫패스 트리거는 절대 throw 하지 않는다.** Forge 가 재시도하는데, 부분 적용된 만료 위에 재시도가 겹치면 알림이 중복된다. 실패는 리컨실 배치로 넘긴다.
- 라이선스로 트리거를 막지 않는다 — 상태 정합이 깨진 채 남는다. 대신 **알림 생성만** 막는다(`shouldEmitNotifications`).
- 배치는 예산(잔여 시간·요청 수)을 두고 못 끝내면 커서를 남겨 다음 주기가 이어받는다. **미완주 시 watermark 를 전진시키지 않는다.**

## 검증

변경 후 순서대로:
```
npm test -- --runInBand          # 백엔드 + 계약 테스트
npm run test:ui -- --runInBand   # 프론트
npm run build:ui                 # 번들 예산 확인
forge lint
```
진단은 백엔드 `console.log` 대신 **resolver 반환값에 담아** 확인하도록 설계한다.
서버 로그는 `forge logs -e development --since 15m -n 100`.

**iframe 안 버튼 클릭은 자동화에서 신뢰할 수 없다.** 검증 화면은 페이지 로드만으로 실행되게 만들고
결과를 `forge logs` 로도 남긴다(스파이크에서 확립).

## 병렬 작업 중 금지 사항

**Codex 에이전트가 도는 동안 빌드·배포하지 않는다.**
파일이 절반만 쓰인 상태로 번들에 들어가 화면이 통째로 뜨지 않는다(실제로 겪었다).
빌드는 **모든 에이전트가 완료 보고를 낸 뒤** 한 번에 한다.

같은 이유로, 에이전트가 도는 중에는  로 뭉뚱그려 커밋하지 않는다 —
남의 미완성 변경이 섞인다. 경로를 특정해 스테이징한다.

## 배포

```
forge deploy --non-interactive -e development
forge install --upgrade --site tom-chkim-dev.atlassian.net --product confluence -e development
```
- **scope·모듈이 바뀌면 `--upgrade` 필수.** 안 하면 배포는 되는데 사이트는 옛 권한으로 돈다.
- `sql` 모듈 추가·egress(`external.fetch`) 변경처럼 major version 이 올라가는 변경은 `--approve MAJOR_VERSION_RULE` 이 필요하다.
- Sentry 는 환경 변수로 켠다(코드에 DSN 없음). 환경별로 한 번: `forge variables set --encrypt -e <env> SENTRY_DSN <dsn>`.
  변수가 없으면 `getSentryDSN` 이 null 을 주고 프론트는 Sentry 를 로드하지 않는다. 변수 변경 뒤에는 재배포가 있어야 반영된다.
- 라이선스는 development/staging 에서 검증할 수 없다(context.license 가 없어 NOT_APPLICABLE). 미결제 안내·평가판 배너는
  production 리스팅 뒤 Marketplace 의 라이선스 토글로 확인한다. `displayConditions: appIsLicensed` 는 넣지 않는다(CLAUDE.md 함정 표).
- CI: `bitbucket-pipelines.yml` — 모든 push 테스트, develop→staging·master→production 수동 배포, 개발 사이트는
  `custom: deploy-development`. 인증은 저장소 변수 `FORGE_EMAIL`/`FORGE_API_TOKEN`(Secured). 빌드 단계만 `CI=false`
  (Atlaskit CSS 경고가 CI 모드에서 에러가 된다), 테스트·빌드 전에 `npm run merge`.
- 배포 직후 마이그레이션은 인스턴스별 첫 resolver 호출(`ensureMigratedOnce`)이 적용한다. 스파이크 페이지는 없다.
- 엔트리를 추가할 때는 **세 곳을 함께** 고친다: `craco.config.js` 의 `ENTRIES`,
  `static/ui/public/<key>.html`, `manifest.yml` 의 `resources[].entry`.

## 커밋

- 커밋 메시지에 `Co-Authored-By` 트레일러를 **넣지 않는다** (고객 배포 저장소라 도구 흔적을 남기지 않는다).
- 커밋·푸시는 사용자가 요청했을 때만 한다.
- 메시지는 한국어. **무엇을 바꿨는지보다 왜 그렇게 했는지**를 적는다.
- 빌드 산출물(`static/ui/build`)은 커밋하지 않는다.
