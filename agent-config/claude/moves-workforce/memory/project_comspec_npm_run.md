---
name: comspec-npm-run-broken
description: "npm run이 exit 1로 전부 실패하면 ComSpec 환경변수 소실 의심, cmd.exe 경로로 복구"
metadata: 
  node_type: memory
  type: project
  originSessionId: 8f7e4cfb-ca9e-4fb8-bdd8-52910f30c5a2
---

`npm run <script>`가 스크립트 성공에도 무조건 **exit 1**(`prebuild` 실패로 `npm run build`가 react-scripts 단계 전에 중단)이면, **`ComSpec` 환경변수 소실**이 원인이다.

npm 디버그 로그 증상: `TypeError [ERR_INVALID_ARG_TYPE]: The "file" argument must be of type string. Received undefined` at `spawnWithShell` (@npmcli/promise-spawn). Windows에서 npm은 `script-shell`(=null) → `ComSpec`으로 셸을 찾는데, ComSpec이 비면 셸 spawn이 크래시한다. `node script.js` 직접 실행이나 `cmd /c node ...`는 멀쩡(0)하고 **`npm run`만 1**인 게 특징.

진단: PowerShell에서 `[Environment]::GetEnvironmentVariable('ComSpec','Machine'/'User'/'Process')` 셋 다 빈값.

복구: `[Environment]::SetEnvironmentVariable('ComSpec','C:\Windows\System32\cmd.exe','User')` (User 영구) — 사용자가 **새 터미널**을 열면 적용됨. 현재 세션엔 `$env:ComSpec='C:\Windows\System32\cmd.exe'`도 같이.

2026-06-24 라이선스 기능 빌드 중 발생. node 버전과 무관(노드 다운그레이드 시 환경변수 정리되며 같이 날아간 듯). node 24로 올려도 안 고쳐지고 오히려 [[project_forge_node_premature_close]] 재발하니, 22.22.0 유지 + ComSpec 복구가 정답. 같은 계열: [[project_nvm_env_broken]](NVM_HOME/SYMLINK 소실).
