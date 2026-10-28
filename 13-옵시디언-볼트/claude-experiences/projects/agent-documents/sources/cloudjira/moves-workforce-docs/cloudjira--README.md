# Moves Workforce Docs

Jira Cloud용 Forge 앱. Moves Workforce 프로젝트에 속한 Jira 이슈에 Confluence 문서를 연결·분류·관리한다.

- 설계 정본: [docs/DESIGN.md](docs/cloudjira--DESIGN.md) — 두 저장소(`moves-workforce-docs`, `moves-workforce`)가 공유하는 계약
- 구현 보고: [docs/BUILD_REPORT.md](docs/cloudjira--BUILD_REPORT.md)
- 작업 규칙: [CLAUDE.md](cloudjira--CLAUDE.md)

## 구조 한눈에

두 Forge 앱은 서로 직접 통신할 수 없다. 연결 정보는 **Jira 이슈 프로퍼티 `movesDocs`** 에 기록하고
Moves Workforce 가 그 값을 읽는다.

코드 구조는 Moves Workforce 를 따른다 — 폴더·파일 이름이 같은 것은 같은 역할이다.
계약의 양 끝은 두 저장소에서 **같은 경로**에 있다: `static/ui/src/utils/jiraApi/movesDocsProperty.js`
(이 저장소가 쓰는 쪽, Workforce 가 읽는 쪽).

```
moves-workforce-docs/
  manifest.yml              전역 페이지 1개 + 이슈 프로퍼티 색인 선언 + 번역(translations)
  locales/                  화면 문구
    kr/*.json, en/*.json    원본(기능 단위 파일) — 여기를 고친다
    script/merge.js         원본을 합쳐 아래 두 파일을 만든다
    ko-KR.json, en-US.json  생성물 — 직접 고치지 않는다
  src/                      백엔드 resolver (KVS 만 사용 — 설정·프로젝트 기억·관리자 확인)
    index.js                CONTROLLER_REGISTRARS
    resolver/{도메인}/      Controller → Service → Repository
    permission/             guardedDefine, PermissionMap, PrincipalResolver
    error/, utils/errors/   에러 클래스, 오류 코드
    api/jira/               Jira 호출(사용자 자격)
    nosql/query/            KVS 접근
  test/permission/          권한 계약 테스트
  static/ui/                프론트 (React 18, CRA + craco, 엔트리 1개)
    src/layout/             앱 틀(머리글·메뉴)
    src/pages/              홈 / 프로젝트(문서·이슈·현황) / 설정 — 화면별 순수 로직 포함
    src/components/         공용 UI — table, skeleton, lozenge, layout, chart, error
    src/hooks/              resolver 조회 훅
    src/stores/             번역, 앱 컨텍스트
    src/utils/jiraApi/      Jira 호출 · 이슈 프로퍼티 계약(movesDocsProperty.js)
    src/utils/confluenceApi/ Confluence 검색
    src/utils/queryKey/     쿼리 키 팩토리
```

## 준비물

- Node.js 22.x (Forge 런타임과 같은 메이저). `forge deploy` 가 "Premature close" 로 실패하면 22.22.0 으로 맞춘다.
- Forge CLI (`npm install -g @forge/cli@latest`), `forge login` 완료
- 다중 제품 호환(`app.compatibility`)은 Preview 기능이고 **한 번 배포하면 되돌릴 수 없다**(DESIGN §2).

## 설치 · 테스트 · 빌드

```bash
# 백엔드
npm install
npm test

# 프론트
cd static/ui
npm install
npm run merge                # 화면 문구 합치기(locales/kr·en → ko-KR.json·en-US.json)
npm test
CI=true npm run build        # CI 와 같은 조건(경고를 오류로 취급). Git Bash 기준. merge 를 먼저 실행한다
```

루트에서 한 번에 돌리려면 `npm run verify` (백엔드 테스트 → 프론트 테스트 → 프론트 빌드).

화면 문구를 고칠 때는 `locales/kr/`·`locales/en/` 의 파일을 고친 뒤 `npm run merge` 를 실행한다.
`locales/ko-KR.json`·`en-US.json` 은 생성물이라 직접 고치지 않는다.
`npm run merge` 가 내는 `MODULE_TYPELESS_PACKAGE_JSON` 경고는 동작에 영향이 없다(스크립트는 Workforce 의 것과 같다).

## 배포 — 사용자가 직접 하는 단계

`manifest.yml` 의 `app.id` 는 자리표시자(`REPLACE_WITH_FORGE_REGISTER`)다. 이 상태로는 `forge lint`·`forge deploy` 가 되지 않는다.

1. **앱 등록** — 저장소 루트에서 실행. `manifest.yml` 의 `app.id` 가 실제 값으로 바뀐다.
   ```bash
   forge register
   ```
2. **프론트 빌드** — `resources.path` 가 `static/ui/build` 를 가리키므로 배포 전에 반드시 빌드한다.
   빌드가 화면 문구도 함께 합친다(`translations` 가 가리키는 `locales/ko-KR.json`·`en-US.json`).
   ```bash
   cd static/ui && npm install && CI=true npm run build && cd ../..
   ```
3. **점검·배포**
   ```bash
   forge lint
   forge deploy                 # 기본은 development 환경
   ```
4. **설치** — Jira 가 필수, Confluence 는 선택이다. 같은 사이트에 Jira 부터 설치한다.
   ```bash
   forge install --product jira
   forge install --product confluence     # 문서 검색·상태 확인에 필요
   ```
   Confluence 에 설치하지 않으면 화면은 열리지만 문서 검색과 상태 확인이 되지 않는다(안내가 뜬다).
   다중 제품 앱의 설치 절차는 Preview 단계라 CLI 버전에 따라 다를 수 있으니 실행 전 Forge 문서를 확인한다.
5. **라이선스 동작 확인** — 이 앱은 유료 앱이다(`app.licensing.enabled: true`). 개발·스테이징 환경에는 라이선스 정보가 오지 않아 항상 통과하므로,
   라이선스 상태를 지정해 설치해서 확인한다. Forge CLI 13.4.0 의 `forge install --help` 에 다음 옵션이 있다(실행해 보지는 않았다).
   ```bash
   forge install --upgrade --license inactive   # 안내 페이지만 보여야 한다
   forge install --upgrade --license trial      # 평가판
   forge install --upgrade --license active
   ```
6. **Moves Workforce 에 값 전달** — 배포 뒤 정해지는 두 값을 Workforce 담당자에게 넘긴다(DESIGN §5).
   - `MOVES_DOCS_APP_ID` : `manifest.yml` 의 `app.id` 마지막 부분(UUID)
   - `MOVES_DOCS_ENV_ID` : 배포한 환경의 id. 설치한 뒤 Jira 에서 앱 화면을 열면 주소가
     `/jira/apps/<앱 id>/<환경 id>` 형태이므로 거기서 읽는다.

   Workforce 는 이 값이 비어 있으면 「문서 관리 열기」 버튼을 숨긴다.
7. **운영 배포**
   ```bash
   forge deploy -e production
   forge install --upgrade -e production
   ```

8. **마켓 주소 채우기** — 마켓에 등록해 주소가 정해지면 `static/ui/src/pages/license/licenseConstants.js` 의 `MARKETPLACE_URL` 에 넣고 다시 빌드·배포한다.
   비어 있는 동안 라이선스 안내 페이지와 평가판 만료 안내에 구매 버튼이 보이지 않는다.

> 한 사이트에 development 와 production 앱을 함께 설치하지 않는다. 같은 별칭(`movesDocsCount` 등)이
> 두 벌 생겨 검색이 모호해진다.

## 배포 뒤 확인해야 하는 것

테스트로는 확인할 수 없는 플랫폼 동작이다(DESIGN §10). 하나라도 다르면 설계서의 해당 절을 고친다.

| # | 확인할 것 | 확인 방법 |
|---|---|---|
| P1 | 선언하지 않은 별칭을 검사 API 가 오류로 돌려주는가 | Workforce Docs 미설치 사이트에서 Workforce 문서 탭이 숨겨지는지 |
| P2 | `pageIds`(문자열 배열)·`count`(숫자)가 별칭으로 색인되는가 | 문서를 연결한 뒤 Jira 검색에서 `movesDocsCount > 0`, `movesDocsPageId = "<id>"` |
| P3 | Jira 페이지 안에서 Confluence 호출이 되는가 | 「문서 연결」에서 문서 검색 |
| P4 | 다른 앱의 전역 페이지로 하위 경로·쿼리를 실어 이동할 수 있는가 | Workforce 의 「문서 관리 열기」로 들어와 프로젝트 이름이 보이는지 |
| P5 | `search:confluence` 하나로 검색이 열리는가 | P3 과 같은 화면에서 권한 오류 여부 |
| P6 | 팀 관리형 프로젝트에서도 검색 응답에 연결 정보가 함께 오는가 | 팀 관리형 프로젝트 이슈에 연결한 뒤 새로 고침 |
| P9 | 화면 문구가 한국어·영어로 나오는가(문구 파일이 화면까지 전달되는가) | Jira 언어를 한국어·영어로 바꿔 가며 화면 확인. 문구 대신 `common.save` 같은 키가 보이면 전달되지 않은 것 |
| P10 | 스페이스 목록을 문서 검색과 같은 방식으로 가져올 수 있는가 | 「문서 연결」에서 스페이스 선택 창을 열어 목록이 나오는지, 골랐을 때 그 스페이스의 문서만 나오는지 |
| P11 | 본문 검색이 한글에서 되는가 | 「본문 포함」을 켜고 제목에는 없고 본문에만 있는 한글 낱말로 검색. 제목 아래에 본문 일부가 보이는지 |
| P12 | 결제하지 않았거나 만료된 설치가 막히는가 | 운영 환경에서 라이선스가 없는 사이트에 설치해 안내 페이지가 나오는지, 설정 저장이 거부되는지 |
| P13 | 평가판이 끝나기 7일 전부터 안내가 뜨는가 | 평가판 사이트에서 만료일이 가까워졌을 때 화면 위 안내 |

## 알려진 한계

DESIGN §9 참조. 요약하면:

- 문서 **제목**은 이슈를 볼 수 있는 모든 사람에게 보인다(본문은 Confluence 권한을 따른다).
- Workforce 탭의 제목은 Workforce Docs 화면을 열 때만 최신으로 고쳐진다.
- 삭제된 문서와 볼 권한이 없는 문서를 구분하지 못한다.
- 앱을 지워도 연결 정보는 이슈에 남는다(다시 설치하면 그대로 보인다).
- 라이선스가 없을 때 서버가 막는 것은 설정·프로젝트 기억·관리자 확인뿐이다. 문서 연결·검색은 화면에서만 막힌다.
