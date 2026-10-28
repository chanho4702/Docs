# Moves Workforce (Moves RMS)

Jira Cloud 프로젝트의 인력·팀·워크로그·MD/MM·가동률·진척도·비용·간트를 관리하고 분석하는 Atlassian Forge 앱입니다. UI는 React 18 + Atlaskit 기반 Custom UI이며 backend는 Forge resolver, Forge SQL, Forge KVS, Jira REST API를 사용합니다.

## 현재 구조

- Forge runtime: `nodejs22.x`, arm64, 256MB
- UI: `static/ui` → production build `static/ui/build`
- Backend: `src/index.js` → Controller → Service → Repository
- Storage: Forge SQL 12 table + KVS Custom Entity 12개
- Jira data: issue/worklog은 Jira를 원본으로 사용하며 필요한 결과만 단기 cache
- Security: 중앙 `PermissionMap`, `guardedDefine`, `ALL | MEMBER_ONLY | TEAM_ONLY`, `PROJECT_COST` 분리

상세 설계는 다음 문서를 기준으로 합니다.

- `Moves_Workforce_아키텍처_설계서.md`
- `Moves_Workforce_데이터모델_ERD.md`
- `Moves_Workforce_핵심로직_정의서.md`
- `Moves_Workforce_개발자_온보딩.md`
- `_workspace/logical-design-audit/01_architect_design.md` — 2026-08-03 감사 보완 경계면 계약

## 요구 사항

- Node.js와 프로젝트 package manager(npm)
- Forge CLI 및 Atlassian 계정 로그인
- 설치 대상 Jira Cloud site 접근 권한

## 설치

```powershell
npm install
Set-Location static/ui
npm install
Set-Location ../..
```

dependency를 추가하거나 version을 변경한 경우 해당 package가 속한 root에서 `npm install`을 다시 실행하고 lockfile을 함께 반영합니다.

## 로컬 개발

```powershell
Set-Location static/ui
npm start
```

Forge tunnel을 사용할 때는 app root에서 실행합니다. `manifest.yml`을 변경하면 먼저 redeploy한 뒤 tunnel을 다시 시작해야 합니다. code file만 변경했다면 tunnel hot reload를 사용합니다.

## 검증

```powershell
# backend
npm test -- --runInBand

# frontend
Set-Location static/ui
npm test -- --runInBand
npm run build
Set-Location ../..

# Forge — 명령 직전 pwd로 app root 확인
pwd
forge lint
```

번역 source는 `static/ui/src/locales`가 아니라 프로젝트의 `locales/kr`, `locales/en` 기능별 JSON입니다. 생성물 `locales/ko-KR.json`, `locales/en-US.json`은 직접 수정하지 말고 아래 merge를 사용합니다.

```powershell
Set-Location static/ui
npm run merge
```

## 배포·설치

Forge CLI 명령은 app root에서 실행합니다.

```powershell
pwd
forge lint
forge deploy --non-interactive --e development
forge install --non-interactive --site <site-url> --product jira --environment development
```

scope 또는 permission을 변경했다면 deploy 후 기존 installation을 upgrade합니다.

```powershell
forge install --non-interactive --upgrade --site <site-url> --product jira --environment development
```

## 개발 불변식

- resolver는 `CONTROLLER_REGISTRARS`와 `PermissionMap`에 등록하고 `guardedDefine`을 사용합니다.
- `SELF` mutation은 `context.accountId`를 SQL row owner predicate까지 전달합니다.
- Forge SQL DML은 공통 계층의 `rowsAffected` alias를 사용하고 raw mock은 `{ rows:{ affectedRows } }`를 재현합니다.
- 일반 resource DTO에는 `salary`를 포함하지 않습니다. 비용 데이터는 `PROJECT_COST` 전용입니다.
- **가드 통과는 데이터 범위 확정이 아닙니다.** 재무·인사 데이터를 내주는 resolver는 `principal`을 서비스까지 전달해 응답 내용을 따로 좁힙니다. 같은 데이터를 내주는 형제 resolver를 전부 찾아 같은 판정을 통과시키고(한 화면만 막으면 우회됩니다), 읽기·쓰기가 검증을 복제하지 않도록 공용 함수로 뽑습니다. `principal` 누락은 fail-close입니다.
- 신규·수정 TanStack Query key는 `static/ui/src/utils/queryKey/` factory를 사용합니다.
- KVS entity attribute 추가 시 `manifest.yml` schema를 먼저 변경하고 deploy합니다.
- KVS `findAll()`은 **100건 하드캡**이라 초과분이 조용히 잘립니다. 전량이 필요하면 `findAllPaged`를 쓰고, 목록 조회와 중복 판정은 상한을 공유합니다.
- `asUser()`가 기본이며 `asApp()`은 architecture 문서에 열거된 플랫폼 예외에만 사용합니다.

## 운영 진단

최근 development 로그 예시:

```powershell
pwd
forge logs -e development --since 15m -n 100
```

라이선스 원문이나 사용자 민감정보를 frontend console에 출력하지 않습니다. 라이선스 차단은 **명시적 INACTIVE 하나뿐**입니다 — 판정 불가(UNAVAILABLE)는 통과시킵니다. 이 가드가 모든 resolver를 감싸므로, 판정 불가를 차단으로 다루면 상류 장애 한 번이 앱 전면 정지가 됩니다. 대신 License API가 200으로 응답했는데 활성 라이선스가 없으면 그것은 "판정 불가"가 아니라 INACTIVE로 다룹니다.

