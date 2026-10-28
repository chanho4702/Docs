# IDC Proxmox IaC 설계

2026-10-27. 사용자는 구현 없이 Markdown 설계·가이드와 PNG 그림을 요청했다.
산출물: C:\solutions\_workspace\idc-iac-design\README.md, 01-detailed-design.md, 02-roadmap-runbook.md, images/.
설계: 공인 IP 1개, VPN·내부·외부 VM 분리. OpenTofu는 VM 자원·cloud-init, Ansible은 호스트 네트워크와 게스트 설정을 소유한다. VPN 이전 bootstrap과 운영 경로를 분리하고 state·키·백업은 서버 외부에 둔다.
미확정: 서버 사양, Proxmox/provider 버전, VPN 라이선스, state backend, IDC 콘솔. 실제 인프라 배포·검증은 미수행.
교훈: 네트워크 INPUT/FORWARD와 NAT를 구분하고, 일반 VPN 사용자에게 관리망 전체를 허용하지 않는다. 이미지 요구는 Mermaid 없이 PNG로 전달한다.
