---
name: zabbix-wrapper-principle
description: "moveseye Zabbix 관리 화면의 목표는 \"Zabbix 기능을 쓰기 쉽게 감싸는 것\" — 우리 로직을 얹지 말고 Zabbix가 못 해주는 것만 메꾼다 (2026-08-18 사용자 재확인)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3562659e-89d6-4e69-8d26-295d509aeecb
  modified: 2026-08-18T07:37:50.919Z
---

**목표는 Zabbix의 기능을 사용하기 쉽게 래핑하는 것이다.** 우리만의 개념·저장·판정 로직을 얹는 게 아니다.

**Why:** 2026-08-18 알림 관리 개발 중 사용자가 "기억해야 해, 우리의 목표는 자빅스의 기능을 사용하기 쉽게 래핑하는 거임"이라고 재확인. 디스커버리·아이템·트리거·액션·미디어타입 관리 전부 이 원칙 위에 있다 — Zabbix가 정본, 로컬 저장 0, Flyway 0건.

**How to apply:**
- 화면·API 모양은 **Zabbix UI/API를 그대로 따른다**(조건·오퍼레이션 구조, 필드명, 어휘). 우리 어휘로 번역하는 건 최소한으로 — 왕복마다 두 번 번역해야 하고 sub-object가 종류마다 달라 번역표가 커진다(액션에서 실제로 원본 구조 통과 선택).
- **Zabbix가 못 해주는 것만 우리가 메꾼다**: 계산값(ipCount·createdItemCount·액션 연결 판정·미디어 사용 액션 수), 불친절한 에러를 우리 코드로(DISCOVERY_CHECKS_REQUIRED·MEDIA_TYPE_IN_USE·ACTION_INVALID_FOR_EVENTSOURCE), 비밀값 마스킹, 이름순 정렬(mediatype.get이 못 함).
- **"쓰기 쉽게"가 핵심** — 문의로 돌아올 자리에 미리 문구(발견≠등록, 규칙만으론 호스트 안 생김, 삭제하면 뭐가 사라지나), 종류별 허용표로 잘못된 조합을 Zabbix에 가기 전에 잡기, 폼 선택지 합성(/options).
- 새 기능 검토 시 첫 질문: "Zabbix에 이 기능이 있나 → 있으면 감싼다 / 없으면 우리가 만드는 게 맞나 다시 묻는다."

관련: [[commit-requires-approval]]
