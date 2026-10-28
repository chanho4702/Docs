# Confluence Approval DC 그룹 승인자 snapshot

- Confluence 그룹은 domain aggregate에 넣지 않고 C9 adapter에서 요청 생성 시점에만 user key snapshot으로 펼친다. 이후 그룹 membership 변화는 기존 `APR_APV` 승인자 목록에 영향을 주지 않는다.
- `APR_APV`는 요청 저장 때 삭제·재생성되므로 그룹 출처 `VIA_GROUP`은 삭제 전에 `ACTOR_KEY`별로 읽어 새 행에 복사해야 승인·반려 이후에도 보존된다.
- Flow에 그룹이 있으면 저장 시점에는 구성원을 확정할 수 없다. Flow 저장 검증과 요청 생성 검증을 분리하고, 후자에서 snapshot 인원 대비 `minimumApprovals`를 검증한다.
