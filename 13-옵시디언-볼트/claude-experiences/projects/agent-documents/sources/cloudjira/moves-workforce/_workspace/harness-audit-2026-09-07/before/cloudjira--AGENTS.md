# AGENTS.md

이 리포지토리에서 작업하는 코딩 에이전트를 위한 지침입니다.
아키텍처·디렉토리 구조·도메인 규약은 `CLAUDE.md`가 단일 진실이며, 이 문서는 그 위에 얹히는 작업 규칙만 다룹니다.

> 현행화 기준: **2026-08-10 / 소스 `03857aa`(2026-08-10)**

## 이 앱이 무엇인지

Atlassian Jira Cloud용 Forge 앱 (Moves RMS). 프로젝트 인력·팀 관리, 워크로그 추적, MD/MM·가동률·진척도·비용 분석, 간트.
단일 고객 사이트 설치를 전제로 하며, 여기 있는 코드는 **프로덕션에 그대로 나갑니다.**

- Forge runtime `nodejs22.x`, arm64, 256MB
- **Custom UI** — `static/ui`의 React 18 + Atlaskit 앱을 빌드해 `static/ui/build`로 서빙
- Backend — `src/index.js` → Controller → Service → (Repository) → Forge SQL / Forge KVS / Jira REST

> ⚠ 이 앱은 **UI Kit(`@forge/react`) 앱이 아닙니다.** 일반 React 컴포넌트와 Atlaskit(`@atlaskit/*`)을 그대로 사용합니다.
> `@forge/react`에서 컴포넌트를 가져오거나 `<div>` 사용을 피하려 들지 마세요. 신규 화면도 Custom UI 규약을 따릅니다.
> 프론트↔백엔드 통신은 `@forge/bridge`의 `invoke()`, Jira 직접 호출은 `@forge/bridge`의 `requestJira()`입니다.

## 코드 스타일

- 바닐라·관용적 JavaScript. 기존 파일의 주석 밀도·네이밍·관용구를 따라갑니다.
- 주석은 **왜**를 적습니다. 무엇을 하는지 다시 쓰는 주석, 방어적 부연, 장식용 배너는 넣지 않습니다.
- 버그 수정에 테스트·주석·부가 UI를 함께 부풀리지 않습니다. 요청 범위를 지킵니다.
- 3단 중첩 루프가 나오면 대개 중간 단계가 헛도는 신호입니다. 구조를 다시 봅니다.
- 파일을 만들기 전에 기존 공용 지점(`static/ui/src/components/`)을 먼저 확인합니다.

## 반드시 지켜야 할 불변식

- resolver는 `src/index.js`의 **`CONTROLLER_REGISTRARS` 배열**에 등록하고 **`guardedDefine`**으로 정의합니다.
  `src/permission/PermissionMap.js`에 선언되지 않은 함수는 deny-by-default로 거부되어 런타임에서 `PERMISSION_UNMAPPED`로 죽습니다.
- `SELF` mutation은 `context.accountId`를 SQL row owner predicate까지 전달합니다.
- Forge SQL DML은 공통 계층의 `rowsAffected` alias를 사용하고, raw mock은 `{ rows: { affectedRows } }`를 재현합니다.
- 일반 resource DTO에 `salary`를 포함하지 않습니다. 비용 데이터는 `PROJECT_COST` 전용 경로로만 나갑니다.
- 신규·수정 TanStack Query key는 `static/ui/src/utils/queryKey/` 팩토리를 사용합니다.
- KVS 엔티티 속성을 추가하면 `manifest.yml` schema를 먼저 바꾸고 deploy 합니다. KVS는 **빈 문자열 저장을 거부**하므로 선택 필드는 속성 자체를 생략합니다.
- KVS `findAll()`은 **100건 하드캡**이고 커서를 버려 초과분이 조용히 잘립니다. 전량이 필요하면 `findAllPaged(indexName, pageLimit, maxItems)`를 쓰고, 목록 조회와 이름 중복 판정은 **같은 상한 상수**를 공유합니다(갈리면 "목록엔 없는데 저장은 거부"가 생깁니다).
- 번역은 `locales/kr/*.json`·`locales/en/*.json`에 넣고 `npm run merge`로 생성합니다. `ko-KR.json`/`en-US.json`은 직접 수정하지 않습니다.
- 라이선스 원문이나 사용자 민감정보를 frontend console에 출력하지 않습니다. 라이선스 차단은 **명시적 INACTIVE 하나뿐**입니다 — 판정 불가(UNAVAILABLE)는 통과시킵니다(이 가드가 모든 resolver를 감싸므로 상류 장애가 앱 전면 정지가 됩니다). 단, License API가 200으로 응답했는데 활성 라이선스가 없으면 "판정 불가"가 아니라 INACTIVE입니다. 프론트·백엔드가 같은 경계여야 합니다.

## 보안

- **가드 통과는 데이터 범위 확정이 아닙니다.** 가드(`guardedDefine`)는 "이 함수를 부를 수 있나"만 봅니다. 재무·인사 데이터를 내주는 resolver는 `principal`을 서비스까지 전달해 **응답 내용을 따로 좁혀야** 합니다.
  - 급여·원가는 급여 정책(`SalaryVisibility`)과 **별개로** `CostAccess.canReadCost(principal)`를 함께 요구합니다.
  - 인력 명부는 `TeamAnalyticsScope.resolveTeamAnalyticsScope(principal)` 단일 출처를 따릅니다.
  - **한 화면만 막으면 형제 resolver로 우회됩니다.** 같은 데이터를 내주는 경로를 전부 찾아 같은 판정을 통과시킵니다.
  - 읽기에만 있고 쓰기에 없는 검증을 조심하고, 검증은 **공용 함수로 뽑아** 두 경로가 같은 것을 보게 합니다.
  - `principal` 누락은 **fail-close** 입니다 — 컨트롤러가 전달을 빠뜨려도 조용히 열리지 않아야 합니다.
- Jira product REST 호출은 **`asUser()`가 기본**입니다. `asUser()`는 자체 인가 검사를 수행합니다.
- `asApp()`은 아키텍처 문서에 열거된 플랫폼 예외에만 사용합니다 (마켓플레이스 심사 부담). 부득이 사용할 때는 해당 product permission API로 인가를 직접 확인합니다.
- scope는 최소로 유지하고, 실제로 필요한 API가 생겼을 때만 추가합니다.
- Forge SQL / KVS / Custom Entity는 클라이언트 API가 없습니다. 반드시 백엔드 resolver에서 접근합니다.
- Entity property CRUD는 전용 클라이언트 API가 없으므로 해당 REST API(예: Jira Issue Properties)를 사용합니다.

## 검증

변경 후 아래를 실행합니다. Forge CLI 명령은 **app root**에서 실행하며, 직전에 `pwd`로 경로를 확인합니다.

```powershell
# backend
npm test -- --runInBand

# frontend
Set-Location static/ui
npm test -- --runInBand
npm run build          # CI 조건 재현: CI=true npm run build
Set-Location ../..

# Forge
pwd
forge lint
```

프론트 빌드는 CI에서 `CI=true`로 돌아갑니다. 로컬에서 통과했는데 CI가 깨지면 이 조건 차이부터 확인하세요.

## 배포·설치

```powershell
pwd
forge lint
forge deploy --non-interactive --e development
forge install --non-interactive --site <site-url> --product jira --environment development
```

- 지정이 없으면 `development` 환경을 사용합니다.
- scope 또는 permission을 바꿨다면 deploy 후 `--upgrade`로 기존 설치를 갱신합니다.
- `--no-verify`는 사용자가 명시적으로 요청하지 않는 한 쓰지 않습니다.
- **운영 사이트에는 단일 환경 앱만 설치합니다.** dev/prod 앱이 한 사이트에 공존하면 같은 이름의 커스텀 필드가 2벌 생겨 JQL 이름 매칭이 모호해집니다.

## 터널링

- `manifest.yml`을 바꿨으면 redeploy 후 터널을 재시작합니다.
- 코드 파일만 바꿨으면 redeploy 없이 hot reload로 반영됩니다.

## 진단

```powershell
pwd
forge logs -e development --since 15m -n 100
```

진단 로그를 백엔드 `console.log`로 심지 말고, **resolver 반환값에 담아 브라우저 콘솔에서 확인**할 수 있게 설계합니다.

## 커밋

- 커밋 메시지에 `Co-Authored-By: Claude` 트레일러를 넣지 않습니다.
- 커밋·푸시는 사용자가 요청했을 때만 수행합니다.
