---
name: project-api-exposure
description: "Workforce API 외부 노출 조사(2026-09-16) — core:apiRoute 실측 결과, 권한 체계 전면 우회가 핵심 리스크, 호출자 신원은 미검증"
metadata: 
  node_type: memory
  type: project
  originSessionId: bd1ec007-7238-4695-84b6-28fc6ee6b16a
  modified: 2026-09-16T02:59:33.886Z
---

Workforce API를 외부에 노출하는 방법으로 Forge `core:apiRoute`를 조사했다(2026-09-16).
전체 문서: `_workspace/api-exposure/API_EXPOSURE.md`. 교훈 노트: 옵시디언 `topics/forge/forge-app-rest-api.md`.

**실측 확인:**
- 마켓플레이스 수동 재심사 없음. 다만 `core:apiRoute` **모듈 사용 자체가 메이저 버전을 강제**(`MAJOR_VERSION_RULE`)하고 고객사 관리자 승인이 필요하다. 앱 4 → 5.0.0.
- **Runs on Atlassian 배지 유지**(`forge eligibility` 및 관리 콘솔 배지로 확인). 실격 사유는 `remotes`·`dynamic` 웹트리거 쪽이다.
- 커스텀 스코프는 `custom-scopes.yaml` + `forge custom-scopes create -e <env>`로 **배포 전 환경별 등록 필수**. **삭제·개명 불가, 환경당 20개 상한.**
- 관리자가 설치본 단위로 「앱 REST API」를 켜야 열림(기본 꺼짐). 단 **연동 생성은 관리자 전용이 아니라 조직 구성원 누구나** 가능.
- 게이트웨이가 토큰 없음·오토큰·미선언 경로를 전부 401로 차단. 우리 함수는 실행되지 않는다.

**핵심 리스크:** `apiRoute`는 resolver와 별개 진입점이라 `guardedDefine`·`PermissionMap` deny-by-default·`resolvePrincipal`·라이선스 검사가 **하나도 실행되지 않는다.** 요청 body의 accountId를 principal로 신뢰하면 사칭이 된다. 판정 로직을 공용 함수로 뽑아 resolver와 REST가 같은 것을 보게 해야 한다. [[project-permission-audit-2026-09]] [[feedback-no-asapp]]

**미검증(설계가 갈리는 지점):** 핸들러가 호출자 accountId를 받는지, `asUser()`가 호출자 자격으로 도는지. 공식 문서에 핸들러 계약이 없다. 프로브는 `moves-rms` v5.1.0에 배포·활성화까지 끝났고 **3LO 연동 생성 한 단계만 남았다**(계정 영구 자격증명이라 자동 진행하지 않음).

**남겨 둔 상태:** `src/apiProbe/`·`custom-scopes.yaml`·manifest `apiRoute` 블록 미커밋. `moves-rms`에 `PROBE_ENABLED=true`(이 변수 없으면 핸들러가 404라 운영 유입 차단). 등록된 `read:probe:custom`은 되돌릴 수 없다.
