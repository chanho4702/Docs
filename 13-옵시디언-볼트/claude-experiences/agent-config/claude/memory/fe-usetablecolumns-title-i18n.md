---
name: fe-usetablecolumns-title-i18n
description: useTableColumns의 컬럼 title은 ...item 스프레드 뒤에 t()로 적용됨 — 과거엔 앞이라 title 명시 시 번역이 원본 키로 덮였던 버그(2026-06-23 수정)
metadata: 
  node_type: memory
  type: reference
  originSessionId: 7561f7d2-f01f-4e06-8835-22f5a0cc17f2
---

`moveseyee_fe/src/hooks/useTableColumns.ts`(공용 테이블 컬럼 훅) 동작/함정.

- 컬럼 헤더 번역에 쓰는 `t`는 **`globalThis.t`(전역)** 다 — `lib/i18n/index.ts:25` `globalThis.t = i18n.t`로 등록되어, 이 훅은 `useTranslation` import 없이 `t()`를 호출한다. keySeparator는 기본값(`.`)이라 `"report_management.group_name"` 같은 **중첩 키**도 정상 조회된다.
- ⚠️ **잠복 버그였던 점**: 훅이 컬럼 객체를 `{ title: t(item.title||item.key), ...일부필드, ...item }` 순으로 만들었는데 `...item`이 **맨 뒤**라, 컬럼에 `title`(번역키)을 **명시하면** 그 원본 키 문자열이 번역 결과를 덮어써 화면에 키가 그대로 노출됐다. 기존 테이블들은 `title`을 안 주고 `key`만 줘서(예: `key:"device_type"`) 안 드러났고, [[report-management-feature]]의 리포트 목록 테이블이 처음 `title:"report_management.group_name"`을 주며 표면화.
- **2026-06-23 수정**: `title: t(...)`을 `...item` **뒤로** 이동해 항상 번역이 최종 적용되게 함. 기존 테이블(title 미지정)은 `t(key)` 그대로라 영향 없음(jest 164 그린).
- **결론(이후 사용법)**: 이 훅에 컬럼 i18n은 (a) 최상위 평면 키를 `key`로 쓰거나 (b) `title`에 번역 키(중첩 가능) 명시 — **둘 다 동작**한다. `title`에는 **번역 키**를 넣어라(이미 번역된 문자열 말고). 언어 토글 즉시반영은 이 훅이 useTranslation 구독을 안 해 리렌더 의존이 있으니 헤더 즉시변경이 필요하면 주의.
