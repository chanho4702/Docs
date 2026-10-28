# T3 — i18n 골격 (locales + merge + manifest translations)

## 배경

Confluence DC 승인 앱의 Forge(Cloud) 이식 프로젝트다.

DC는 `approval.properties`(영어 598줄)와 `approval_ko.properties`(한국어 597줄) 2벌을 쓰고,
서버가 마크업을 `{{i18n:key}}` 자리표시자로 조립한 뒤 마지막에 정규식으로 한 번에 치환했다.

Cloud에서는 **서버가 사람이 읽을 문구를 만들지 않는다**(`CLAUDE.md` 참조).
에러는 코드로, 알림·감사는 `{templateKey, vars}`로 내려보내고 **프론트가 번역**한다.
따라서 문구는 전부 프론트 번역 파일에 있고, DC의 `approval.js.*` 화이트리스트 계층은 사라진다.

**반드시 먼저 읽을 것**: 저장소 루트의 `CLAUDE.md`, `AGENTS.md`.
원본 문구: `C:\Onpremise\confluence-approval-dc\approval-confluence9\src\main\resources\approval.properties`
및 `approval_ko.properties` (읽기 전용).

## 건드릴 파일 (이 목록 밖의 파일은 수정하지 말 것)

```
locales/kr/*.json              (신규 — 네임스페이스별)
locales/en/*.json              (신규 — 같은 키 집합)
locales/script/merge.js        (신규)
locales/README.md              (신규 — 규칙 설명)
static/ui/src/utils/i18n.js    (신규 — t / tFormat)
static/ui/src/stores/useI18nStore.js  (신규)
package.json                   (scripts 에 merge 추가만)
manifest.yml                   (translations 블록 추가만)
.gitignore                     (생성물 무시 규칙 확인 — 이미 `locales/*.json` 있음)
```

## 네임스페이스 분할 (파일명 = 네임스페이스)

MVP 범위만 만든다. 2단계 기능(서명·위임·독촉·일괄승인·CC·Flow)의 문구는 **지금 넣지 않는다.**

```
common.json        action, label, unit, time, pager, column, picker, search
banner.json        pill, panel, badge, progress, region 경고
macro.json         매크로 전용
inbox.json         tab, inbox, notice, empty
filter.json        filter, status, scope
request.json       request, form, reason, cancel
detail.json        detail, history, event, actor
decision.json      decision, reject
space.json         space
policy.json        policy, settings
manager.json       manager
notification.json  notifications
error.json         에러 코드 → 문구 (src/utils/errors/ErrorCodes.js 의 값과 1:1)
```

DC의 접두 2단(`approval.ui.`)은 제거한다. `approval.ui.filter.status.pending` → `filter.json`의
`status.pending`. 사용은 `t('filter.status.pending')`.

**`error.json`은 `src/utils/errors/ErrorCodes.js`의 모든 코드를 빠짐없이 덮어야 한다.**
코드가 있는데 문구가 없으면 사용자에게 `PERMISSION_PAGE_VIEW_DENIED` 같은 날것이 노출된다.

## merge 스크립트 (`locales/script/merge.js`)

- `locales/kr/*.json` → `locales/ko-KR.json`, `locales/en/*.json` → `locales/en-US.json`
- 파일명이 최상위 키가 된다: `filter.json`의 `{status:{pending:"..."}}` → `{filter:{status:{pending:"..."}}}`
- **kr과 en의 키 집합이 다르면 실패하고 어느 키가 어디에 없는지 출력한다.**
  한쪽에만 있는 키는 배포 후 그 언어에서 빈 문구로 나타나는데, 이는 조용한 실패다.
- 생성물은 gitignore 대상이다(`locales/*.json`). **직접 수정 금지**를 README에 명시한다.

## manifest

```yaml
translations:
  resources:
    - key: ko-KR
      path: locales/ko-KR.json
    - key: en-US
      path: locales/en-US.json
  fallback:
    default: en-US
```
(정확한 스키마는 `forge lint`로 검증할 것. 통과하지 않으면 배포가 막힌다.)

## 프론트 (`static/ui/src/utils/i18n.js`, `stores/useI18nStore.js`)

- Forge는 사용자 로캘을 `view.getContext()`의 `locale`로 준다(실측 확인: `ko-KR`).
- `t(key)` — 점 표기로 중첩 객체를 탐색. 없으면 **키 자체를 반환**한다(빈 문자열 금지 — 빠진 키가 화면에서 드러나야 고친다).
- `tFormat(t, key, vars)` — `{name}` 형태 치환.
- zustand 스토어(`useI18nStore`)에 사전과 로캘을 담고, 앱 부팅 시 1회 로드한다.
- 한국어면 한국어, **그 밖의 모든 언어는 영어**다(DC와 같은 정책). 사전은 2벌뿐이다.

## 언어 정책 (문구 작성 규칙)

- 한국어 문구는 존댓말·간결체. "~합니다" 대신 명사형·평서형을 섞어 화면 밀도를 낮춘다.
- 상태 표시명(승인 대기 등)은 관리자가 바꿀 수 있는 값이라 **번역 대상이 아니다**.
  기본값만 사전에 두고, 설정값이 있으면 그걸 그대로 쓴다.
- 오류 문구는 사용자가 **다음에 무엇을 할지** 알 수 있게 쓴다. "권한이 없습니다"보다
  "이 문서를 볼 권한이 없습니다. 스페이스 관리자에게 문의하세요".

## 완료 기준

- `npm run merge`(또는 `node locales/script/merge.js`)가 두 생성물을 만든다
- kr/en 키 집합 불일치 시 **0이 아닌 종료 코드**로 실패한다
- `npx forge lint` 통과
- `npx jest --runInBand` 통과 (기존 31건 유지)
- `locales/*.json` 생성물이 git에 추가되지 않았을 것
