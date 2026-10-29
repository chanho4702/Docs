---
name: feedback-locales-structure
description: "locales 다국어 파일 구조 — 소스는 kr/en 폴더, 빌드 산출물은 ko-KR.json/en-US.json"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4d22ed5e-edfa-4547-99d9-2249912e4e00
---

번역 파일은 직접 `ko-KR.json`/`en-US.json`에 추가하지 말 것.

**Why:** 이 파일들은 merge 스크립트(`locales/script/merge.js`)가 빌드 시 자동으로 생성하는 산출물이다. 직접 수정하면 다음 빌드 때 덮어씌워진다.

**How to apply:**
1. 새 페이지/기능에 번역 추가할 때 → `locales/kr/<namespace>.json`, `locales/en/<namespace>.json` 각각 생성
2. 파일명(확장자 제외)이 번역 namespace key가 됨 (예: `resourceReport.json` → `t('resourceReport.tabs.label')`)
3. 파일 생성 후 반드시 `node locales/script/merge.js` 실행해서 병합 파일 재생성
