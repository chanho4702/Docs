# 번역 리소스

Forge Custom UI와 manifest가 함께 쓰는 번역 사전이다. 한국어 사용자는 `ko-KR`, 그 밖의 사용자는
`en-US`를 사용한다.

## 구조

- `kr/*.json`, `en/*.json`: 사람이 수정하는 원본. 파일명이 네임스페이스가 된다.
- `ko-KR.json`, `en-US.json`: `npm run merge`로 만드는 Forge translation resource.
- `script/merge.js`: 원본을 병합하고 두 언어의 leaf key 집합을 검사한다.

예를 들어 `kr/filter.json`의 `status.pending`은 병합 후 `filter.status.pending`이 되며,
프론트에서는 `t('filter.status.pending')`로 사용한다. DC의 `approval.ui.` 접두어와
`approval.js.*` 화이트리스트 계층은 사용하지 않는다.

## 수정 규칙

1. 같은 변경에서 `kr`와 `en`의 동일한 네임스페이스·키를 함께 수정한다.
2. 값은 비어 있지 않은 문자열이어야 한다. 변수는 `{name}` 형식으로 작성한다.
3. `error.json`의 키는 `src/utils/errors/ErrorCodes.js`의 값과 정확히 일치시킨다.
4. 상태 표시명은 관리자가 바꿀 수 있다. 사전에는 기본값만 두고 저장된 설정값이 있으면 그대로 표시한다.
5. 2단계 기능인 서명·위임·독촉·일괄승인·CC·Flow 문구는 해당 기능을 구현할 때 추가한다.

`locales/ko-KR.json`과 `locales/en-US.json`은 생성물이므로 직접 수정하거나 git에 추가하지 않는다.
manifest 검사와 배포 전에 다음 명령으로 다시 만든다.

```text
npm run merge
```

두 언어의 키 집합이 다르면 스크립트가 누락된 언어와 전체 키를 출력하고 0이 아닌 코드로 종료한다.
