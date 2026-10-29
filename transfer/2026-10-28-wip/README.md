---
type: transfer
tags: [transfer, moves-approval-jira, moves-workforce, wip, handoff]
created: 2026-10-29
updated: 2026-10-29
---

# 2026-10-28 미커밋 작업 이관 패키지 (Windows → 새 Mac)

승인 앱·워크포스 두 리포의 **커밋되지 않은 작업 트리**와 로컬 산출물(`_workspace/`·`tmp/`)을 담았다.
리포 쪽에는 커밋·브랜치·stash·reset·배포를 하지 않았다(읽기 전용 git 명령만). 작업 맥락은 [[2026-10-28-full-audit-fixes-and-workforce-app-read]] 의 "현재 상태"·"재개 절차".

## 파일 목록

| 파일 | 크기 | 내용 |
|---|---:|---|
| `approval/base.txt` | 4.7 KB | 브랜치 `master`, HEAD `d9e5351f43d1f02adfb1ae5f901a37202efe5c89`(= `origin/develop`), `git status` 전체 |
| `approval/tracked.patch` | 118 KB | `git diff HEAD --binary` — 추적 파일 28개(+919/−162): 전수 점검 R05~R12·D01~D03 + 엔진 R01~R04 수정, CLAUDE.md·AGENTS.md·locales·package-lock 2개 |
| `approval/untracked.zip` | 30 KB | 미추적 파일 12개 — 전부 새 테스트(`src/**/__test__/*.test.js`) |
| `approval/workspace.zip` | 22.2 MB | `_workspace/` 전체(아래 제외분 빼고 718개) + `tmp/full-audit-2026-10-28/`(재현 테스트 6개). 둘 다 gitignore 대상 |
| `approval/codex_engine3_prompt.md` | 48 KB | 메모리 부족으로 중지된 엔진 Codex 3차 검토 프롬프트(세션 scratchpad 에서 복사) |
| `workforce/base.txt` | 0.5 KB | 브랜치 `RFC-220`, HEAD `5a33e831da10701a584630bdd776f11e2a78fa9e`(= `origin/RFC-220`) |
| `workforce/tracked.patch` | 0 B | **비어 있음** — 추적 파일 변경이 없다(아래 "워크포스 상태") |
| `workforce/workspace.zip` | 25 KB | `_workspace/rfc220-review/` 6개(03_verify·04_fix_design·05_fix_report 등) |
| `workforce/codex_wf3_prompt.md` | 2.6 KB | 중지된 워크포스 Codex 3차 검토 프롬프트 |
| `SHA256SUMS.txt` | — | 위 파일들의 해시 |

## base 해시

| 리포 | 브랜치 | HEAD | 원격 |
|---|---|---|---|
| `moves-approval-jira` | master | `d9e5351f43d1f02adfb1ae5f901a37202efe5c89` | `origin/develop` 와 같음(ahead 0 / behind 0) |
| `moves-workforce` | RFC-220 | `5a33e831da10701a584630bdd776f11e2a78fa9e` | `origin/RFC-220` 와 같음. `origin/develop` 에는 이 커밋이 없고 대신 `58e45d0 [REVERT] RFC-220 변경을 develop에서 분리` 가 있다 |

### 워크포스 상태(중요)

인수인계 노트가 "미커밋"이라 적은 워크포스 asApp 읽기 전환은 **이미 `5a33e83` 로 커밋되고 `origin/RFC-220` 에 푸시돼 있다**(2026-10-28 16:40 이후 다른 세션 또는 사용자 작업). 그래서 patch 가 비어 있고 untracked.zip 은 만들지 않았다. 새 Mac 에서는 `git checkout RFC-220` 만 하면 코드가 전부 온다.
그 커밋에는 원래 커밋하지 말기로 했던 `제품소개_v2.pptx`·`_v2.1.pptx`(각 4.9 MB)·`docs/external-api/*`·`LeaderTeamBackfill.test.js` 도 들어가 있다 — 되돌릴지는 사용자 판단.

## 일부러 뺀 것

| 대상 | 이유 |
|---|---|
| `_workspace/sidebar-layout/chrome-qa-*/` (4개 폴더, 83 MB) | QA 용 headless Chrome 프로필·캐시(`Cache_Data`·`.bdic`). 재생성 가능, 개인 브라우저 상태 |
| `_workspace/worklog-approval-simplification/ui-preview/dist/` (11 MB) | 미리보기 번들, 빌드로 재생성 |
| 워크포스 미추적 `custom-scopes.yaml`, `캡처.png` | 지시대로 제외(원래 커밋 금지 목록) |
| `node_modules/`·`build/` | 어느 쪽 untracked 목록에도 없었음(gitignore) |

## 비밀값 검사

patch·zip 전체를 `.env`/`*.pem`/`*.key`/`secret`/`credential` 파일명과 `qwe123`·`Admin@123`·`sk-ant-`·`ghp_`·`AKIA`·PEM 헤더·Sentry DSN·`token=`/`password=` 본문 패턴으로 검사했다.
- 실값 **없음**. 적중 3건은 `_workspace/app-channel/ED25519_SELF_AUTH_CUSTOMER-0{1,2,3}*.drawio.svg` 안에 포함된 base64 이미지 데이터가 우연히 `AKIA…` 꼴을 만든 것(확인 완료).
- `_workspace/workforce-channel-rest/evidence/apiroute/18-settings-client-id-secret-masked.jpg` 는 이름대로 마스킹된 캡처라 그대로 둠.
- Sentry DSN 은 Forge 환경 변수에만 있고 코드·문서에 없다.

## 검증(2026-10-29)

- 임시 폴더에 두 리포를 로컬 clone → `git checkout --detach <base>`:
  - approval: `git apply --check --binary tracked.patch` **통과**(28 files). untracked.zip 의 12개 경로는 base 트리와 충돌 없음.
  - workforce: `5a33e83` checkout 성공, patch 는 0 byte 라 apply 생략.
- 세 zip 모두 `zipfile.testzip()` 손상 0.

## 복원 방법 (새 Mac)

```bash
# 승인 앱
git clone <moves-approval-jira 원격> && cd moves-approval-jira
git checkout develop            # d9e5351 이어야 한다. 아니면: git checkout d9e5351f43d1f02adfb1ae5f901a37202efe5c89
git apply --check --binary ~/transfer/approval/tracked.patch && git apply --binary ~/transfer/approval/tracked.patch
unzip -o ~/transfer/approval/untracked.zip -d .     # 새 테스트 12개
unzip -o ~/transfer/approval/workspace.zip -d .     # _workspace/, tmp/full-audit-2026-10-28/ (gitignore 라 status 에 안 뜸)
git status --short | wc -l                          # 40 이어야 한다(수정 28 + 미추적 12)
npm install && npx jest                             # BE 213 suites / 3,150
(cd static/ui && npm install && npx jest --watchAll=false)   # UI 105 / 1,001 — craco test 아님
npm run merge                                       # locales/ko-KR.json·en-US.json 재생성(gitignore)

# 워크포스
git clone <moves-workforce 원격> && cd moves-workforce
git checkout RFC-220                                # 5a33e83
unzip -o ~/transfer/workforce/workspace.zip -d .    # _workspace/rfc220-review/
npm install && (cd static/ui && npm install)

# 중지된 Codex 3차 검토 재실행(리포 디렉터리에서, stdin 리다이렉트 필수, 한 번에 하나)
node <codex 경로>/codex.js exec --skip-git-repo-check -m gpt-6-astra -c model_reasoning_effort="xhigh" -s read-only -c approval_policy=never - < codex_engine3_prompt.md
```

`sha256sum -c SHA256SUMS.txt` 로 파일 무결성을 먼저 확인한다. 이후 절차(커밋 → develop 푸시 → dev 배포, 스테이징 제외)는 인수인계 노트 "재개 절차" 2~4.

## 관련

- [[2026-10-28-full-audit-fixes-and-workforce-app-read]] · [[agent-config/README]](Claude·Codex 설정 사본, 새 PC 복원) · [[vault-git-sync-docs-repo]](이 Vault 를 Docs 리포에 올리는 방법)
