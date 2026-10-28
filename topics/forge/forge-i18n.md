---
type: topic
tags: [topic, forge, i18n, gotcha]
created: 2026-05-30
updated: 2026-05-30
---

# Forge i18n — `t()` 치환 미지원 & merge 파이프라인

> Atlassian Forge 앱의 번역 처리에서 반복적으로 발목 잡는 두 가지. 새 Forge 프로젝트에서 그대로 적용.

## 요약
1. **Forge `t()`는 변수 치환을 지원하지 않는다.** → 직접 토큰 치환 헬퍼 필요.
2. **번역 소스는 `locales/kr·en/*.json`이고, `ko-KR.json`/`en-US.json`은 생성물이다.** → 생성물 직접 수정 금지.

## 패턴 / 노하우

### ① `t()` 치환 — `tFormat` 헬퍼로 해결
- 시그니처는 `t(i18nKey, defaultValue?)`. **두 번째 인자는 기본값이지 치환 객체가 아니다.**
- `t(key, { md })` 처럼 넘기면 화면에 `{md}` 리터럴이 그대로 노출되는 버그.
- 해결: `t(key)`로 문자열을 받은 뒤 `{var}` 토큰을 수동 치환하는 헬퍼.

```js
// utils/i18n.js
export function tFormat(t, key, vars = {}) {
  let s = t(key);
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}
```
- 기존 코드에 `.replace('{count}', v)` 같은 1회성 치환이 흩어져 있으면 이 헬퍼로 일반화.

### ② merge 파이프라인 — 소스/생성물 구분
- 실제 번역 소스: **`locales/kr/*.json`, `locales/en/*.json`** (기능 단위 파일).
- ⚠️ `locales/script/*` 는 (적어도 moves-workforce에선) **빈 스텁**이었음 — merge.js가 읽는 실소스를 코드로 직접 확인할 것. 문서와 실제가 다를 수 있다.
- `npm run merge` (실제 스크립트 `locales/script/merge.js`) → `ko-KR.json` / `en-US.json` **생성**.
- **`ko-KR.json` / `en-US.json` 직접 수정 금지** (다음 merge에 덮어써짐). prebuild에서 자동 merge 실행됨.

## 사례
- [[2026-05-29-progress-page]] — 진척도 4개 컴포넌트 10개 호출 `tFormat` 교체 + 기존 `IssueAnalysisTable.jsx` 동일 버그 동반 수정. merge 소스 경로를 코드로 실확인해 정정.
- [[2026-05-27-mm-redesign]] — `workdayUnit`, `publicHoliday.mm.*` 키 추가 후 merge.

## 관련 노트
- 프로젝트: [[moves-workforce]]
- [[forge-worklog-performance]]

### ③ 누락 감사는 스크립트로 — 테스트는 키 존재를 못 본다 (2026-10-08)
- `t` 모킹이 `key => 'translated:' + key` 라 **없는 키를 써도 테스트는 통과**한다. `t('gantt.saveFailed')`(실제 `gantt.error.saveFailed`)·`common.retry`·`common.clear` 3건이 그렇게 숨어 있었다.
- 한 번에 잡는 법: `locales/kr`·`en` 을 평탄화해 (a) kr↔en 키 차집합, (b) 소스↔merge 산출물 차이, (c) 코드의 `t('...')` 리터럴 키가 kr 에 있는지, (d) 주석 제거 후 JSX/코드에 남은 한글 리터럴 — 네 가지를 같이 본다. 템플릿 키(`gantt.status.${k}`)와 `…` 같은 가짜 양성은 눈으로 거른다.
- 실제로 나온 유형: en 파일만 빠진 블록(portfolio.topology 17키), 기능 추가 때 통째로 하드코딩된 영역(워크로그 **기간 입력** 모드 12문구), 상수 파일의 `label`(일정 유형 — `schedule.type.*` 키는 이미 있었는데 모달만 쓰고 캘린더·범례는 raw label 사용), 공용 컴포넌트 기본값(`Card submitText="저장"`, `CommonModal 'Create'`), 로케일 고정(`toLocaleDateString('ko-KR')`, `${n}주`).
- 로케일이 필요한 포맷은 `utils/useForgeLocale.js`(view.getContext().locale 모듈 캐시) — `'ko-KR'` 고정 금지.
- 사례: [[moves-workforce]] 2026-10-08 다국어 누락 일괄 정리(파일 15개, 키 37개).
