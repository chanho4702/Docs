# Confluence Data Center Active Objects 테이블명 제약

## 2026-08-08

- Confluence 9.2.22에서 `approval-ao-module`이 비활성화된 직접 원인은 OSGi가 아니라 Active Objects entity table-name 검증이었다.
- `@Table("DmoveApprovalApprover")`가 namespace prefix와 결합되어 `AO_C44802_DMOVE_APPROVAL_APPROVER`가 되었고, Oracle 호환 30자 제한을 초과했다.
- 두 adapter의 entity table을 `APR_REQ`, `APR_APV`로 축약해 생성 이름을 제한 이내로 만들었다.
- `UnrecognizedModuleDescriptorServiceTrackerCustomizer`가 먼저 보여도 뒤따르는 `ActiveObjectsException: generated table name ... too long`이 실제 원인이다.
