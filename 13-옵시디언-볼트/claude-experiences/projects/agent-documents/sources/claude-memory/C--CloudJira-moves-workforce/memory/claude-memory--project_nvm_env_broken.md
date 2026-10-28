---
name: nvm-env-broken
description: "forge/node \"node.exe 인식 안됨\" 오류는 NVM_HOME/NVM_SYMLINK 환경변수 소실이 원인"
metadata: 
  node_type: memory
  type: project
  originSessionId: d7817f33-2365-4e93-b58d-a7e896a8fb4f
---

`forge`/`node` 실행 시 `'node.exe' 용어가 ... 인식되지 않습니다` 오류가 나면, 본체가 아니라 **환경변수 소실**이 원인일 가능성이 높다.

이 PC는 nvm-windows 사용 (node v22.22.0 = forge 배포용, [[forge-node-premature-close]] 참고). 시스템 PATH가 실제 경로 대신 `%NVM_HOME%`·`%NVM_SYMLINK%` 변수 참조로 등록돼 있어서, 이 두 변수가 사라지면 PATH가 빈 문자열로 확장돼 node/nvm/forge를 전부 못 찾는다. node 바이너리·심볼릭 링크는 멀쩡한 채로.

**복구** (사용자 레벨, 관리자 권한 불필요):
- `NVM_HOME` = `C:\Users\DMOVE\AppData\Local\nvm`
- `NVM_SYMLINK` = `C:\nvm4w\nodejs`

```powershell
[Environment]::SetEnvironmentVariable('NVM_HOME','C:\Users\DMOVE\AppData\Local\nvm','User')
[Environment]::SetEnvironmentVariable('NVM_SYMLINK','C:\nvm4w\nodejs','User')
```

설정 후 새 터미널을 열어야 반영됨. 2026-06-22 1회 발생·복구.
