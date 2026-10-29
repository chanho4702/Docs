---
name: kvs-entity-manifest-schema
description: "KVS custom entity에 새 최상위 필드 저장 시 manifest.yml entities attributes 선언 필수 — 없으면 422 UNPROCESSABLE_ENTITY \"semantic errors\""
metadata: 
  node_type: memory
  type: project
  originSessionId: 92c32245-71d7-4023-9ef5-105d68fe70ee
---

Forge KVS custom entity(`kvs.entity(name).set`)는 manifest.yml `app.storage.entities`에 선언된 attributes만 저장 허용. 선언에 없는 최상위 필드를 넣으면 `ForgeKvsAPIError: Request cannot be processed due to one or more semantic errors` (422 UNPROCESSABLE_ENTITY, POST /api/v1/entity/set)로 실패한다.

**Why:** 권한관리 고도화(2026-07-03)에서 permission 엔티티에 `projectScope` 필드를 추가했을 때 manifest 미갱신으로 시드 저장이 전부 실패. 스택은 CustomEntityManager.save → addPermissionSeed로 나옴.

**How to apply:** KVS 엔티티에 새 필드를 추가하는 백엔드 작업은 반드시 manifest.yml의 해당 entity attributes에 타입 선언을 함께 추가한다(attribute 추가는 하위호환). manifest 스키마 변경은 tunnel만으로 반영 안 되고 `forge deploy` 필요. 시드는 seed_version bump 전에 실패하면 다음 호출에서 자동 재시도되므로 멱등 안전. 관련: [[forge-storage-limits]]

**추가(2026-07-08, 자원관리 skill 엔티티):** 선언된 attribute에 **빈 문자열('')을 저장하면 "Value for attribute X cannot be empty"로 거부**된다. → 값 없는 optional 속성은 payload에서 아예 제외하고 save(빈 문자열 넣지 말 것). 또한 **indexed attribute는 필수**라 빈 값/누락 불가 → 값이 비어도 되는 속성은 인덱스에서 빼야 한다(skill의 category 인덱스 제거 사례, 그룹핑은 클라이언트에서). name처럼 항상 존재하는 필수값만 인덱싱. 관련: [[project-resource-management]]
