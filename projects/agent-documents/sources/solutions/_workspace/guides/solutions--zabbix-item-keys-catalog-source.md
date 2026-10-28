# Zabbix 아이템 키 카탈로그 원본 (사용자 제공, 2026-07-21) — **Zabbix 7.0 기준**

FE 키 선택기 카탈로그(`src/constants/zabbix-agent-keys.ts` → 확장) 소스. 아이템 타입(종류)별로 구조화한다.
설명(name)은 사용자 제공 원문(한국어/일부 영문 혼재) 그대로 보존한다.
**이 카탈로그는 Zabbix 7.0 기준이며, UI(키 선택 모달)에도 "Zabbix 7.0 기준"을 명시해야 한다.**

## 타입 매핑 (Zabbix 아이템 type 정수)
- Zabbix 에이전트 → type 0 (ZABBIX_AGENT)
- Zabbix 에이전트(액티브) → type 7 (AGENT_ACTIVE)
- 간단 검사(Simple check) → type 3 (SIMPLE) — VMware 키 포함
- SNMP 트랩 → type 17 (SNMP_TRAP)
- Zabbix 내장(internal) → type 5 (INTERNAL)
- 데이터베이스 모니터 → type 11 (DB_MONITOR)
- IPMI 에이전트 → type 12 (IPMI)
- JMX 에이전트 → type 16 (JMX)

---

## 종류: Zabbix 에이전트 (type 0)

| 키 | 이름 |
|---|---|
| agent.hostmetadata | 에이전트 호스트 메타데이터. 문자열 반환 |
| agent.hostname | 에이전트 호스트 명. 문자열을 리턴 |
| agent.ping | 에이전트의 상태 체크. 사용 가능한 경우엔 1을 리턴. 불가능한 경우엔 아무 것도 리턴하지 않음 |
| agent.variant | 에이전트 변형 확인. 1을 반환합니다 - Zabbix 에이전트의 경우; 2 - Zabbix 에이전트 2용 |
| agent.version | Zabbix 에이전트의 버전. string을 리턴 |
| kernel.maxfiles | OS가 지원하고 있는 최대 파일 오픈 수. integer를 리턴. |
| kernel.maxproc | OS가 지원하고 있는 최대 프로세스 수. integer를 리턴 |
| kernel.openfiles | 현재 열려 있는 파일 설명자 수입니다. 정수를 반환 |
| modbus.get[endpoint,<slaveid>,<function>,<address>,<count>,<type>,<endianness>,<offset>] | 모드버스 데이터를 읽습니다. 다양한 유형을 반환합니다. |
| net.dns.record[<ip>,name,<type>,<timeout>,<count>,<protocol>] | DNS쿼리를 실행. 요구한 정보 타입의 string을 리턴. |
| net.dns.perf[<ip>,name,<type>,<timeout>,<count>,<protocol>] | Performs a DNS query. Returns 0 if DNS is down, query time in seconds (with fractions) otherwise |
| net.dns[<ip>,name,<type>,<timeout>,<count>,<protocol>] | DNS서비스 기동 체크. DNS가 다운(서버가 응답하지 않거나 DNS 해석에 실패)된 경우엔 0을 리턴. DNS가 기동되어 있는 경우엔 1을 리턴. |
| net.if.collisions[if] | 네트워크 충돌 수. integer를 리턴. |
| net.if.discovery | 네트워크 인터페이스 목록. 반환 JSON |
| net.if.in[if,<mode>] | 네트워크 인터페이스의 수신통계. integer를 리턴. |
| net.if.list | 네트워크 인터페이스의 리스트(인터페이스의 종류나 상태, IPv4의 주소나 개요를 포함). 텍스트 값을 리턴. |
| net.if.out[if,<mode>] | 네트워크 인터페이스의 송신 통계. integer를 리턴 |
| net.if.total[if,<mode>] | 네트워크 인터페이스의 송수신합계치. integer를 리턴. |
| net.tcp.listen[port] | 지정된 TCP 포트 번호가 대기상태(LISTEN)인지 체크. 대기상태가 아닌 경우엔 0을 리턴. 대기상태인 경우엔 1을 리턴. |
| net.tcp.port[<ip>,port] | 지정된 포트에 TCP접속성을 체크. 접속할 수 없는 경우엔 0을 리턴, 접속 가능한 경우엔 1을 리턴. |
| net.tcp.service.perf[service,<ip>,<port>] | TCP서비스의 퍼포먼스를 체크. 서비스가 다운된 경우엔 0을 리턴, 초(seconds)를 리턴한 경우엔 서비스에 접속에 걸린 시간을 리턴. |
| net.tcp.service[service,<ip>,<port>] | 서비스 기동과 TCP 접속성 체크. 서비스가 정지되어 있는 경우엔 0을 리턴, 서비스가 기동되어 있는 경우엔 1을 리턴. |
| net.tcp.socket.count[<laddr>,<lport>,<raddr>,<rport>,<state>] | 매개변수와 일치하는 TCP 소켓 수를 반환합니다. 정수를 반환 |
| net.udp.listen[port] | 지정된 UDP 포트 번호가 대기상태(LISTEN)인지 체크. 대기상태가 아닌 경우엔 0을 리턴. 대기상태인 경우엔 1을 리턴. |
| net.udp.service.perf[service,<ip>,<port>] | UDP서비스의 퍼포먼스를 체크. 서비스가 다운된 경우엔 0을 리턴. 초(seconds)를 리턴한 경우엔 서비스 응답이 돌아오기까지의 시간을 리턴. |
| net.udp.service[service,<ip>,<port>] | 서비스 기동과 UDP응답성 체크. 서비스가 정지되어 있는 경우엔 0을 리턴. 서비스가 기동되어 있는 경우엔 1을 리턴. |
| net.udp.socket.count[<laddr>,<lport>,<raddr>,<rport>,<state>] | 매개변수와 일치하는 UDP 소켓 수를 반환합니다. 정수를 반환 |
| perf_counter[counter,<interval>] | 임의 퍼포먼스 카운터 값. 리퀘스트에 따라 integer, float, string 혹은 text를 리턴. |
| perf_counter_en[counter,<interval>] | Value of any Windows performance counter in English. Returns integer, float, string or text (depending on the request) |
| perf_instance.discovery[object] | Windows 성능 카운터의 개체 인스턴스 목록입니다. 반환 JSON |
| perf_instance_en.discovery[object] | 영어로 된 개체 이름을 사용하여 검색된 Windows 성능 카운터의 개체 인스턴스 목록입니다. 반환 JSON |
| proc.cpu.util[<name>,<user>,<type>,<cmdline>,<mode>,<zone>] | 프로세스 CPU 사용률. float를 반환합니다. |
| proc.get[<name>,<user>,<cmdline>,<mode>] | 속성이 있는 OS 프로세스 목록입니다. JSON 배열 반환 |
| proc.mem[<name>,<user>,<mode>,<cmdline>,<memtype>] | 바이트 단위의 프로세스 사용 메모리. integer를 리턴. |
| proc.num[<name>,<user>,<state>,<cmdline>,<zone>] | 프로세스 수. integer를 리턴. |
| proc_info[process,<attribute>,<type>] | 특정 프로세스에 관한 여러가지 정보. 부동소수점 값을 리턴 |
| registry.data[key,<value name>] | Windows 레지스트리 키의 값 이름에 대한 값 데이터입니다. |
| registry.get[key,<mode>,<name regexp>] | 지정된 키에 있는 Windows 레지스트리 값 또는 키 목록입니다. JSON을 반환합니다. |
| sensor[device,sensor,<mode>] | 하드웨어 센서 읽기. float를 리턴. |
| service.info[service,<param>] | 서비스 정보의 습득. 파라미터가 state나 startup이라면 integer를 리턴. 파라미터가 displayname, path, user라면 string을 리턴. 파라미터가 description라면 text를 리턴. 구체적으로는 파라미터가 state라면 상태로 : 0 - running, 1 - paused, 2 - start pending, 3 - pause pending, 4 - continue pending, 5 - stop pending, 6 - stopped, 7 - unknown, 255 를 리턴. 혹은 파라미터가 startup라면 스타트업 종류로 : 0 - automatic, 1 - automatic delayed, 2 - manual, 3 - disabled, 4 - unknown를 리턴 |
| services[<type>,<state>,<exclude>] | 서비스 리스트. 비어있는 경우 0을 리턴하고, 존재하는 겨웅엔 서비스 리스트를 줄로 나눈 text 값을 리턴. |
| system.boottime | 시스템 부팅 시간. UNIX의 타임스탬프로 integer를 리턴. |
| system.cpu.discovery | 감지된 CPU/CPU 코어 목록입니다. 반환 JSON |
| system.cpu.intr | 디바이스의 인터럽트 횟수. integer를 리턴. |
| system.cpu.load[<cpu>,<mode>] | CPU의 부하량. float 값을 리턴 |
| system.cpu.num[<type>] | CPU 수. integer를 리턴. |
| system.cpu.switches | 컨텍스트 스위치의 횟수. integer를 리턴. |
| system.cpu.util[<cpu>,<type>,<mode>,<logical_or_physical>] | CPU 사용률. float를 반환합니다. |

## 종류: Zabbix 에이전트 (액티브) (type 7)

에이전트(type 0)의 모든 키 + 아래 추가/차이 키. 실제로는 사용자 제공 목록 전체가 액티브에도 다시 나열됨(agent.*/kernel.*/net.*/proc.*/system.* 등 공통 + eventlog·log·logrt·mqtt·system.hw.*·system.sw.*·system.swap.*·vfs.*·vm.*·web.*·wmi.*·zabbix.stats 등). 아래는 액티브 목록에서 에이전트 대비 **추가**로 나타난 키:

| 키 | 이름 |
|---|---|
| eventlog[name,<regexp>,<severity>,<source>,<eventid>,<maxlines>,<mode>] | 이벤트 로그의 감시. 로그 값을 리턴. |
| eventlog.count[name,<regexp>,<severity>,<source>,<eventid>,<maxproclines>,<mode>] | Event log monitoring. Returns count of entries |
| log.count[file,<regexp>,<encoding>,<maxproclines>,<mode>,<maxdelay>,<options>,<persistent_dir>] | 로그의 일치하는 행의 개수. integer를 리턴 |
| log[file,<regexp>,<encoding>,<maxlines>,<mode>,<output>,<maxdelay>,<options>,<persistent_dir>] | 로그파일 감시. 로그 값을 리턴. |
| logrt.count[file_regexp,<regexp>,<encoding>,<maxproclines>,<mode>,<maxdelay>,<options>,<persistent_dir>] | 로그의 일치하는 행의 개수. (로그 로테이션 대응) integer를 리턴. |
| logrt[file_regexp,<regexp>,<encoding>,<maxlines>,<mode>,<output>,<maxdelay>,<options>,<persistent_dir>] | 로그 로테이션에 대응한 로그파일 감시. 로그 값을 리턴. |
| mqtt.get[<broker_url>,topic,<username>,<password>] | MQTT 주제의 값입니다. 반환된 데이터의 형식은 주제 콘텐츠에 따라 다릅니다. 와일드카드를 사용하는 경우 JSON 형식의 주제 값을 반환합니다. |
| system.hostname[<type>,<transform>] | 시스템 호스트 명. string을 리턴 |
| system.hw.chassis[<info>] | 섀시 정보. string 값을 리턴. |
| system.hw.cpu[<cpu>,<info>] | CPU정보. string 값 혹은 integer 값을 리턴 |
| system.hw.devices[<type>] | PCI 혹은 USB의 디바이스 리스트. 텍스트 값을 리턴. |
| system.hw.macaddr[<interface>,<format>] | MAC주소 리스트. string을 리턴 |
| system.localtime[<type>] | 시스템 시간. 유형이 UTC인 정수를 반환합니다. 문자열 - 유형을 로컬로 사용 |
| system.run[command,<mode>] | 호스트 상에서 지정한 커맨드를 실행. 커맨드의 실행결과의 text값을 리턴. 모드로 nowait를 지정한 경우엔 커맨드의 실행결과에 관계 없이 1을 리턴. |
| system.stat[resource,<type>] | 시스템 통계값. integer 혹은 float로 리턴 |
| system.sw.arch | 소프트웨어의 아키텍쳐 정보. string을 리턴. |
| system.sw.os[<info>] | OS정보. string값을 리턴 |
| system.sw.os.get | Operating system version information. Returns JSON |
| system.sw.packages[<regexp>,<manager>,<format>] | 설치된 패키지 리스트. text를 리턴 |
| system.sw.packages.get[<regexp>,<manager>] | Detailed listing of installed packages. Returns text in JSON format |
| system.swap.in[<device>,<type>] | 스와이프 인 (디바이스에서 메모리로) 의 통계. integer를 리턴 |
| system.swap.out[<device>,<type>] | 스와이프 아웃 (메모리에서 디바이스로) 의 통계. integer를 리턴 |
| system.swap.size[<device>,<type>] | 스왑 용량의 사이즈. 바이트 단위라면 integer를 리턴하고 퍼센트라면 float를 리턴. |
| system.uname | 시스템의 식별문자. string을 리턴. |
| system.uptime | 시스템 가동 시간(초). integer를 리턴. |
| system.users.num | 로그인 하고있는 유저 수. integer를 리턴. |
| vfs.dev.discovery | 블록 장치 및 유형 목록. 반환 JSON |
| vfs.dev.read[<device>,<type>,<mode>] | 디스크 읽기 통계. 타입이 sectors, operations, bytes의 경우에는 integer를 리턴. 타입이 sps, ops, bps의 경우엔 float를 리턴. |
| vfs.dev.write[<device>,<type>,<mode>] | 디스크 쓰기 통계. 타입이 sectors, operations, bytes의 경우에는 integer를 리턴. 타입이 sps, ops, bps의 경우엔 float를 리턴. |
| vfs.dir.count[dir,<regex_incl>,<regex_excl>,<types_incl>,<types_excl>,<max_depth>,<min_size>,<max_size>,<min_age>,<max_age>,<regex_excl_dir>] | 재귀적인 디렉토리 엔트리 수. integer를 리턴 |
| vfs.dir.get[dir,<regex_incl>,<regex_excl>,<types_incl>,<types_excl>,<max_depth>,<min_size>,<max_size>,<min_age>,<max_age>,<regex_excl_dir>] | 재귀적으로 디렉토리 항목의 목록입니다. 반환 JSON |
| vfs.dir.size[dir,<regex_incl>,<regex_excl>,<mode>,<max_depth>,<regex_excl_dir>] | 디렉토리 사이즈 (바이트). integer를 리턴 |
| vfs.file.cksum[file,<mode>] | UNIX cksum 알고리즘으로 계산된 파일 체크섬. crc32(기본값)의 경우 정수를 반환하고 md5, sha256의 경우 문자열을 반환합니다. |
| vfs.file.contents[file,<encoding>] | 파일 콘텐츠 습득. text값을 리턴 |
| vfs.file.exists[file,<types_incl>,<types_excl>] | 파일이 존재하는지 확인합니다. 0을 반환합니다 - 찾을 수 없습니다. 1 - 지정된 유형의 파일이 존재합니다. |
| vfs.file.get[file] | 파일에 대한 정보입니다. 반환 JSON |
| vfs.file.md5sum[file] | 파일의 MD5 체크섬. 파일의 MD5해시 값을 string값으로 리턴. |
| vfs.file.owner[file,<ownertype>,<resulttype>] | 파일 소유자 정보. 문자열 반환 |
| vfs.file.permissions[file] | Unix 권한이 있는 8진수를 포함하는 4자리 문자열을 반환합니다. |
| vfs.file.regexp[file,regexp,<encoding>,<start line>,<end line>,<output>] | 파일내의 문자열 검색. 일치하는 문자열을 포함한 행이나 output 파라미터로 지정한 것을 리턴. |
| vfs.file.regmatch[file,regexp,<encoding>,<start line>,<end line>] | 파일내의 문자열 검색. 존재하지 않는 경우엔 0을 리턴, 존재하는 경우에는 1을 리턴. |
| vfs.file.size[file,<mode>] | 바이트(기본값) 또는 줄 바꿈 단위의 파일 크기. 정수를 반환 |
| vfs.file.time[file,<mode>] | 파일의 시간 정보. UNIX의 타임스탬프로 integer를 리턴 |
| vfs.fs.discovery | 마운트된 파일 시스템 및 유형 목록. 반환 JSON |
| vfs.fs.get | 마운트된 파일 시스템, 해당 유형, 디스크 공간 및 inode 통계 목록입니다. 반환 JSON |
| vfs.fs.inode[fs,<mode>] | inode의 수 혹은 퍼센트. 수치라면 integer를 리턴하고 퍼센트라면 float를 리턴. |
| vfs.fs.size[fs,<mode>] | 디스크 용량. 바이트 단위라면 integer를 리턴하고, 퍼센트인 경우엔 float를 리턴. |
| vm.memory.size[<mode>] | 바이트 단위 혹은 전체 퍼센트의 메모리 사이즈. 바이트 단위라면 integer를 리턴, 퍼센트라면 float를 리턴 |
| vm.vmemory.size[<type>] | 가상 메모리 사이즈의 바이트 단위 혹은 전체에서 퍼센트값. 바이트 단위라면 integer를 리턴, 퍼센트라면 float를 리턴 |
| web.page.get[host,<path>,<port>] | Web페이지 콘텐츠 습득. text로 Web페이지 소스를 리턴. |
| web.page.perf[host,<path>,<port>] | Web페이지 전체의 초 단위 읽기 시간. float를 리턴 |
| web.page.regexp[host,<path>,<port>,regexp,<length>,<output>] | Web페이지 상의 문자열 검색. 일치하는 문자열이나 output 파라미터로 지정한 것을 리턴. |
| wmi.get[namespace,query] | WMI쿼리를 실행하여 처음의 검색결과를 리턴. 리퀘스트에 응답한 integer, float, string, 혹은 text를 리턴. |
| zabbix.stats[<ip>,<port>,queue,<from>,<to>] | Zabbix 서버 또는 프록시에서 "from"에서 "to"초까지 지연된 대기열의 항목 수입니다. |
| zabbix.stats[<ip>,<port>] | Zabbix 서버 또는 프록시 내부 메트릭을 포함하는 JSON 개체를 반환합니다. |

> 주의: 에이전트(0)와 액티브(7)는 공통 키가 대부분이다. FE 구현 시 두 타입에 모두 노출되도록 하되(공통 키는 [0,7] 둘 다 매핑), 액티브 전용(eventlog/log/logrt/mqtt 등 능동 수집 키)은 7만, VMware/simple 계열과 혼동 금지.

## 종류: 간단 검사 (Simple check, type 3) — VMware 포함

| 키 | 이름 |
|---|---|
| icmpping[<target>,<packets>,<interval>,<size>,<timeout>,<options>] | ICMP 핑으로 호스트에 액세스할 수 있는지 확인합니다. 0 - ICMP 핑이 실패합니다. 1 - ICMP 핑 성공. |
| icmppingloss[<target>,<packets>,<interval>,<size>,<timeout>,<options>] | ICMP ping 패킷의 실패율을 리턴. |
| icmppingsec[<target>,<packets>,<interval>,<size>,<timeout>,<mode>,<options>] | ICMP ping의 응답시간을 초로 리턴. 예： 0.02 |
| net.tcp.service.perf[service,<ip>,<port>] | TCP서비스의 퍼포먼스를 체크. 서비스가 다운된 경우엔 0을 리턴, 초(seconds)를 리턴한 경우엔 서비스에 접속에 걸린 시간을 리턴. |
| net.tcp.service[service,<ip>,<port>] | 서비스 기동과 TCP 접속성 체크. 서비스가 정지되어 있는 경우엔 0을 리턴, 서비스가 기동되어 있는 경우엔 1을 리턴. |
| net.udp.service.perf[service,<ip>,<port>] | UDP서비스의 퍼포먼스를 체크. 서비스가 다운된 경우엔 0을 리턴. 초(seconds)를 리턴한 경우엔 서비스 응답이 돌아오기까지의 시간을 리턴. |
| net.udp.service[service,<ip>,<port>] | 서비스 기동과 UDP응답성 체크. 서비스가 정지되어 있는 경우엔 0을 리턴. 서비스가 기동되어 있는 경우엔 1을 리턴. |
| vmware.alarms.get[url] | VMware virtual center alarms data, returns JSON, "url" - VMware service URL |
| vmware.cl.perfcounter[url,id,path,<instance>] | VMware cluster performance counter, "url" - VMware service URL, "id" - VMware cluster id, "path" - performance counter path, "instance" - performance counter instance |
| vmware.cluster.alarms.get[url,id] | VMware cluster alarms data, returns JSON, "url" - VMware service URL, "id" - VMware cluster id |
| vmware.cluster.discovery[url] | Discovery of VMware clusters, "url" - VMware service URL. Returns JSON |
| vmware.cluster.property[url,id,prop] | VMware cluster property, "url" - VMware service URL, "id" - VMware cluster id, "prop" - property path |
| vmware.cluster.status[url,name] | VMware cluster status, "url" - VMware service URL, "name" - VMware cluster name |
| vmware.cluster.tags.get[url,id] | VMware cluster tags array, "url" - VMware service URL, "id" - VMware cluster id |
| vmware.datastore.alarms.get[url,uuid] | VMware datastore alarms data, returns JSON, "url" - VMware service URL, "uuid" - VMware datastore global unique identifier |
| vmware.datastore.discovery[url] | Discovery of VMware datastores, "url" - VMware service URL. Returns JSON |
| vmware.datastore.hv.list[url,datastore] | VMware datastore hypervisors list, "url" - VMware service URL, "datastore" - datastore name |
| vmware.datastore.perfcounter[url,uuid,path,<instance>] | VMware datastore performance counter, "url" - VMware service URL, "uuid" - VMware datastore global unique identifier, "path" - performance counter path, "instance" - datastore perfcounter instance from vmware.hv.diskinfo.get |
| vmware.datastore.property[url,uuid,prop] | VMware datastore property, "url" - VMware service URL, "uuid" - VMware datastore global unique identifier, "prop" - property path |
| vmware.datastore.read[url,datastore,<mode>] | VMware datastore read statistics, "url" - VMware service URL, "datastore" - datastore name, "mode"- latency/maxlatency - average or maximum |
| vmware.datastore.size[url,datastore,<mode>] | VMware datastore의 바이트 단위 혹은 전체에서 퍼센트 용량에서의 통계치. 바이트 단위라면 integer, 퍼센트라면 float 로 리턴 |
| vmware.datastore.tags.get[url,uuid] | VMware datastore tags array, "url" - VMware service URL, "uuid" - VMware datastore global unique identifier. Returns JSON |
| vmware.datastore.write[url,datastore,<mode>] | VMware datastore write statistics, "url" - VMware service URL, "datastore" - datastore name, "mode"- latency/maxlatency - average or maximum |
| vmware.dc.alarms.get[url,id] | VMware datacenter alarms data, returns JSON, "url" - VMware service URL, "id" - VMware datacenter id |
| vmware.dc.discovery[url] | VMware datacenters and their IDs, "url" - VMware service URL. Returns JSON |
| vmware.dc.tags.get[url,id] | VMware datacenter tags array, "url" - VMware service URL, "id" - VMware datacenter id. Returns JSON |
| vmware.dvswitch.discovery[url] | VMware Distributed Virtual Switch, "url" - VMware service URL. Returns JSON |
| vmware.dvswitch.fetchports.get[url,uuid,<filter>,<mode>] | VMware FetchDVPorts wrapper, "url" - VMware service URL, "uuid" - VMware DVSwitch global unique identifier, "filter" - vmware data object DistributedVirtualSwitchPortCriteria, "mode"- state(default)/full. Returns JSON |
| vmware.eventlog[url,<mode>,<severity>] | VMware event log, "url" - VMware service URL, "mode"- all (default) or skip, "severity" - filtering disabled by default or "error,warning,info,user" |
| vmware.fullname[url] | VMware service full name, "url" - VMware service URL |
| vmware.hv.alarms.get[url,uuid] | VMware hypervisor alarms data, returns JSON |
| vmware.hv.cluster.name[url,uuid] | VMware hypervisor cluster name |
| vmware.hv.connectionstate[url,uuid] | VMware hypervisor connection state |
| vmware.hv.cpu.usage.perf[url,uuid] | CPU usage as a percentage during the interval |
| vmware.hv.cpu.usage[url,uuid] | VMware hypervisor processor usage in Hz |
| vmware.hv.cpu.utilization[url,uuid] | CPU usage as a percentage during the interval depends on power management or HT |
| vmware.hv.datacenter.name[url,uuid] | VMware hypervisor datacenter name. Returns string |
| vmware.hv.datastore.discovery[url,uuid] | Discovery of VMware hypervisor datastores. Returns JSON |
| vmware.hv.datastore.list[url,uuid] | VMware hypervisor datastores list |
| vmware.hv.datastore.multipath[url,uuid,<datastore>,<partitionid>] | Number of available DS paths |
| vmware.hv.datastore.read[url,uuid,datastore,<mode>] | VMware hypervisor datastore read statistics, "mode"- latency |
| vmware.hv.datastore.size[url,uuid,datastore,<mode>] | VMware datastore capacity statistics in bytes or percentage. "mode" - total(default)/free/pfree/uncommitted |
| vmware.hv.datastore.write[url,uuid,datastore,<mode>] | VMware hypervisor datastore write statistics, "mode"- latency |
| vmware.hv.discovery[url] | Discovery of VMware hypervisors. Returns JSON |
| vmware.hv.diskinfo.get[url,uuid] | Info about internal disks of hypervisor required for vmware.datastore.perfcounter. Returns JSON |
| vmware.hv.fullname[url,uuid] | VMware hypervisor name |
| vmware.hv.hw.cpu.freq[url,uuid] | VMware hypervisor processor frequency |
| vmware.hv.hw.cpu.model[url,uuid] | VMware hypervisor processor model |
| vmware.hv.hw.cpu.num[url,uuid] | Number of processor cores on VMware hypervisor |
| vmware.hv.hw.cpu.threads[url,uuid] | Number of processor threads on VMware hypervisor |
| vmware.hv.hw.memory[url,uuid] | VMware hypervisor total memory size |
| vmware.hv.hw.model[url,uuid] | VMware hypervisor model |
| vmware.hv.hw.sensors.get[url,uuid] | VMware hypervisor sensors value. Returns JSON |
| vmware.hv.hw.serialnumber[url,uuid] | VMware hypervisor serialnumber |
| vmware.hv.hw.uuid[url,uuid] | VMware hypervisor BIOS UUID |
| vmware.hv.hw.vendor[url,uuid] | VMware hypervisor vendor name |
| vmware.hv.maintenance[url,uuid] | VMware hypervisor maintenance status. 0 - not in maintenance; 1 - in maintenance |
| vmware.hv.memory.size.ballooned[url,uuid] | VMware hypervisor ballooned memory size |
| vmware.hv.memory.used[url,uuid] | VMware hypervisor used memory size |
| vmware.hv.net.if.discovery[url,uuid] | Discovery of VMware hypervisor network interfaces. Returns JSON |
| vmware.hv.network.in[url,uuid,<mode>] | VMware hypervisor network input statistics, "mode"- bps |
| vmware.hv.network.linkspeed[url,uuid,ifname] | VMware hypervisor network interface speed |
| vmware.hv.network.out[url,uuid,<mode>] | VMware hypervisor network output statistics, "mode"- bps |
| vmware.hv.perfcounter[url,uuid,path,<instance>] | VMware hypervisor performance counter |
| vmware.hv.power[url,uuid,<max>] | Power usage |
| vmware.hv.property[url,uuid,prop] | VMware hypervisor property |
| vmware.hv.sensor.health.state[url,uuid] | VMware hypervisor health state rollup sensor. 0 gray;1 green;2 yellow;3 red |
| vmware.hv.sensors.get[url,uuid] | VMware hypervisor HW vendor state sensors. Returns JSON |
| vmware.hv.status[url,uuid] | VMware hypervisor status |
| vmware.hv.tags.get[url,uuid] | VMware hypervisor tags array. Returns JSON |
| vmware.hv.uptime[url,uuid] | VMware hypervisor uptime |
| vmware.hv.version[url,uuid] | VMware hypervisor version |
| vmware.hv.vm.num[url,uuid] | Number of virtual machines on VMware hypervisor |
| vmware.rp.cpu.usage[url,rpid] | CPU usage in hertz during the interval on VMware Resource Pool |
| vmware.rp.memory[url,rpid,<mode>] | Memory metrics of VMware Resource Pool, "mode"- consumed(default)/ballooned/overhead |
| vmware.version[url] | VMware service version |
| vmware.vm.alarms.get[url,uuid] | VMware virtual machine alarms data. Returns JSON |
| vmware.vm.attribute[url,uuid,name] | VMware virtual machine custom attribute value |
| vmware.vm.cluster.name[url,uuid] | VMware virtual machine name |
| vmware.vm.consolidationneeded[url,uuid] | VMware virtual machine disk requires consolidation |
| vmware.vm.cpu.latency[url,uuid] | Percent of time the VM is unable to run because contending for physical CPU |
| vmware.vm.cpu.num[url,uuid] | Number of processors on VMware virtual machine |
| vmware.vm.cpu.readiness[url,uuid,<instance>] | Percentage of time the VM was ready but could not get scheduled |
| vmware.vm.cpu.ready[url,uuid] | VMware virtual machine processor ready time ms |
| vmware.vm.cpu.swapwait[url,uuid,<instance>] | CPU time spent waiting for swap-in |
| vmware.vm.cpu.usage.perf[url,uuid] | CPU usage as a percentage during the interval |
| vmware.vm.cpu.usage[url,uuid] | VMware virtual machine processor usage in Hz |
| vmware.vm.datacenter.name[url,uuid] | VMware virtual machine datacenter name. Returns string |
| vmware.vm.discovery[url] | Discovery of VMware virtual machines. Returns JSON |
| vmware.vm.guest.memory.size.swapped[url,uuid] | Amount of guest physical memory swapped out to swap space |
| vmware.vm.guest.osuptime[url,uuid] | Total time elapsed since last OS boot-up (seconds) |
| vmware.vm.hv.name[url,uuid] | VMware virtual machine hypervisor name |
| vmware.vm.memory.size.ballooned[url,uuid] | VMware virtual machine ballooned memory size |
| vmware.vm.memory.size.compressed[url,uuid] | VMware virtual machine compressed memory size |
| vmware.vm.memory.size.consumed[url,uuid] | Amount of host physical memory consumed for backing guest memory |
| vmware.vm.memory.size.private[url,uuid] | VMware virtual machine private memory size |
| vmware.vm.memory.size.shared[url,uuid] | VMware virtual machine shared memory size |
| vmware.vm.memory.size.swapped[url,uuid] | VMware virtual machine swapped memory size |
| vmware.vm.memory.size.usage.guest[url,uuid] | VMware virtual machine guest memory usage |
| vmware.vm.memory.size.usage.host[url,uuid] | VMware virtual machine host memory usage |
| vmware.vm.memory.size[url,uuid] | VMware virtual machine total memory size |
| vmware.vm.memory.usage[url,uuid] | Percentage of host physical memory consumed |
| vmware.vm.net.if.discovery[url,uuid] | Discovery of VMware virtual machine network interfaces. Returns JSON |
| vmware.vm.net.if.in[url,uuid,instance,<mode>] | VMware VM network interface input statistics, "mode"- bps/pps |
| vmware.vm.net.if.out[url,uuid,instance,<mode>] | VMware VM network interface output statistics, "mode"- bps/pps |
| vmware.vm.net.if.usage[url,uuid,<instance>] | Network utilization (combined tx/rx) during the interval |
| vmware.vm.perfcounter[url,uuid,path,<instance>] | VMware virtual machine performance counter |
| vmware.vm.powerstate[url,uuid] | VMware virtual machine power state |
| vmware.vm.property[url,uuid,prop] | VMware virtual machine property |
| vmware.vm.snapshot.get[url,uuid] | VMware virtual machine snapshot state. Returns JSON |
| vmware.vm.state[url,uuid] | VMware virtual machine state |
| vmware.vm.storage.committed[url,uuid] | VMware virtual machine committed storage space |
| vmware.vm.storage.readoio[url,uuid,instance] | Average number of outstanding read requests to the virtual disk |
| vmware.vm.storage.totalreadlatency[url,uuid,instance] | The average time a read from the virtual disk takes |
| vmware.vm.storage.totalwritelatency[url,uuid,instance] | The average time a write to the virtual disk takes |
| vmware.vm.storage.uncommitted[url,uuid] | VMware virtual machine uncommitted storage space |
| vmware.vm.storage.unshared[url,uuid] | VMware virtual machine unshared storage space |
| vmware.vm.storage.writeoio[url,uuid,instance] | Average number of outstanding write requests to the virtual disk |
| vmware.vm.tags.get[url,uuid] | VMware virtual machine tags array. Returns JSON |
| vmware.vm.tools[url,uuid,mode] | VMware virtual machine tools state, "mode"- version or status |
| vmware.vm.uptime[url,uuid] | VMware virtual machine uptime |
| vmware.vm.vfs.dev.discovery[url,uuid] | Discovery of VMware virtual machine disk devices. Returns JSON |
| vmware.vm.vfs.dev.read[url,uuid,instance,<mode>] | VMware VM disk device read statistics, "mode"- bps/ops |
| vmware.vm.vfs.dev.write[url,uuid,instance,<mode>] | VMware VM disk device write statistics, "mode"- bps/ops |
| vmware.vm.vfs.fs.discovery[url,uuid] | Discovery of VMware virtual machine file systems. Returns JSON |
| vmware.vm.vfs.fs.size[url,uuid,fsname,<mode>] | VMware VM file system statistics, "mode"- total/free/used/pfree/pused |

> VMware 키(vmware.*)는 위 표에 전량 포함(하이퍼바이저·VM·데이터스토어·클러스터·리소스풀). 실무에서 대부분 안 쓰는 특수 타입이므로, fe-engineer는 카탈로그에는 전부 담되 UI 기본 노출은 아이템 타입(간단 검사=type 3) 필터로 걸러지게 한다.

## 종류: SNMP 트랩 (type 17)

| 키 | 이름 |
|---|---|
| snmptrap.fallback | snmptrap[]아이템으로 캐치되어 있지 않은 모든 SNMP 트랩을 캐치한다. |
| snmptrap[<regex>] | 정규표현식에 일치하는 모든 SNMP트랩을 캐치한다. 정규표현식이 지정되어 있지 않은 경우, 모든 트랩을 캐치한다. |

## 종류: Zabbix 내장 (internal, type 5)

| 키 | 이름 |
|---|---|
| zabbix[boottime] | Zabbix서버의 기동시각, UNIX 타임스탬프. |
| zabbix[connector_queue] | Count of values enqueued in the connector queue. |
| zabbix[discovery_queue] | Count of network checks enqueued in the discovery queue. |
| zabbix[host,,items] | 호스트상의 유효 아이템 수. |
| zabbix[host,,items_unsupported] | 호스트 상의 습득불가 아이템 수. |
| zabbix[host,,maintenance] | 호스트의 현재 메인터넌스 상태를 리턴. |
| zabbix[host,<type>,available] | 호스트에서 특정 유형의 검사 가용성을 반환합니다. 유효한 유형은 agent, active_agent, snmp, ipmi, jmx입니다. |
| zabbix[host,discovery,interfaces] | Zabbix에서 구성된 호스트 네트워크 인터페이스를 설명하는 JSON 배열을 반환합니다. LLD에 사용할 수 있습니다. |
| zabbix[hosts] | 감시호스트수 |
| zabbix[items] | Zabbix데이터베이스 안의 아이템수. |
| zabbix[items_unsupported] | Zabbix데이터베이스 내의 습득불가 아이템 수. |
| zabbix[java,,<param>] | 관련되지 않은 Zabbix Java Gateway의 정보를 리턴. 유효한 옵션：ping, version. |
| zabbix[lld_queue] | 하위 수준 검색 처리 대기열에 포함된 값의 수입니다. |
| zabbix[preprocessing_queue] | 전처리 대기열에 포함된 값의 수입니다. |
| zabbix[process,<type>,<mode>,<state>] | 특정 Zabbix프록시 혹은 프록시 그룹이 <state>로 소비되고 있는 시간의 퍼센테이지. |
| zabbix[proxy,<name>,<param>] | Time of proxy last access. Valid params: lastaccess, delay. |
| zabbix[proxy,discovery] | List of Zabbix proxies ... Returns JSON. |
| zabbix[proxy_history] | 서버에 송신되지 않은 프록시의 히스토리 아이템 수 |
| zabbix[proxy group,<name>,available] | Number of online proxies. Returns integer. |
| zabbix[proxy group,<name>,pavailable] | Percentage of online proxies. Returns float. |
| zabbix[proxy group,<name>,proxies] | List of Zabbix proxies ... Returns JSON. |
| zabbix[proxy group,<name>,state] | State of proxy group. 0 unknown;1 offline;2 recovering;3 online;4 degrading. |
| zabbix[proxy group,discovery] | List of Zabbix proxy groups config + real-time data. Returns JSON. |
| zabbix[queue,<from>,<to>] | Number of items in the queue delayed by from-to seconds. |
| zabbix[rcache,<cache>,<mode>] | 설정한 캐쉬의 통계. cache - buffer (mode: pfree, total, used, free). |
| zabbix[requiredperformance] | Zabbix서버의 요구 퍼포먼스를 1초간격으로 기대되는 값을 취득 |
| zabbix[stats,<ip>,<port>,queue,<from>,<to>] | Zabbix 서버/프록시에서 from-to초까지 지연된 대기열의 항목 수. |
| zabbix[stats,<ip>,<port>] | Zabbix 서버/프록시 내부 메트릭 JSON. |
| zabbix[tcache, cache, <parameter>] | Trend function cache statistics. Params: all, hits, phits, misses, pmisses, items, pitems, requests. |
| zabbix[triggers] | Zabbix데이터베이스 안의 트리거 수. |
| zabbix[uptime] | Zabbix서버 프로세스의 가동시간(초). |
| zabbix[vcache,buffer,<mode>] | 값의 캐쉬 통계. total, free, pfree, used, pused. |
| zabbix[vcache,cache,<parameter>] | 값의 캐쉬 효과. requests, hits, misses. |
| zabbix[version] | Version of Zabbix server or proxy |
| zabbix[vmware,buffer,<mode>] | VMware 캐쉬통계. total, free, pfree, used, pused. |
| zabbix[wcache,<cache>,<mode>] | Zabbix 쓰기 캐시의 통계 및 가용성. |
| zabbix[proxy_buffer,buffer,<mode>] | Statistics and availability of proxy memory buffer. |
| zabbix[proxy_buffer,state,current] | State of proxy memory buffer. |
| zabbix[proxy_buffer,state,changes] | Number of state changes from disk/memory mode since start. |
| zabbix[vps,written] | Returns total number of history values written to database. |

## 종류: 데이터베이스 모니터 (Database monitor, type 11)

| 키 | 이름 |
|---|---|
| db.odbc.discovery[<unique short description>,<dsn>,<connection string>] | 낮은 수준의 검색을 위해 SQL 쿼리 결과를 JSON 배열로 변환합니다. |
| db.odbc.get[<unique short description>,<dsn>,<connection string>] | SQL 쿼리 결과를 JSON 배열로 변환합니다. |
| db.odbc.select[<unique short description>,<dsn>,<connection string>] | SQL쿼리 실행결과의 첫 행의 첫 열을 리턴. |

## 종류: IPMI 에이전트 (type 12)

| 키 | 이름 |
|---|---|
| ipmi.get | IPMI sensor IDs and other sensor-related parameters. Returns JSON. |

## 종류: JMX 에이전트 (type 16)

| 키 | 이름 |
|---|---|
| jmx.discovery[<discovery mode>,<object name>,<unique short description>] | MBean 객체 또는 그 속성을 설명하는 LLD 매크로와 함께 JSON 배열을 반환합니다. LLD에 사용할 수 있습니다. |
| jmx.get[<discovery mode>,<object name>,<unique short description>] | MBean 객체 또는 해당 속성이 있는 JSON 배열을 반환합니다. jmx.discovery와 비교하여 LLD 매크로를 정의하지 않습니다. LLD에 사용할 수 있습니다. |
| jmx[object_name,attribute_name,<unique short description>] | MBean오브젝트의 속성값을 리턴. |

---

## 원문 전량 (VMware 등 raw — 누락 방지용, 위 표가 요약한 항목은 여기 raw가 정본)

> fe-engineer는 이 파일 아래에 사용자가 채팅으로 붙여넣은 원문 전체(특히 vmware.hv.* / vmware.vm.* 전량)를 근거로 카탈로그를 채운다. 요약 표에 "다수/전체 포함"으로 접힌 VMware 항목은 채팅 원문의 개별 줄을 1:1로 옮길 것. 아래 참조 파일 안내:
> - 채팅 원문(사용자 메시지)에 vmware.* 개별 키가 전부 나열돼 있으니 그것을 정본으로 파싱.
