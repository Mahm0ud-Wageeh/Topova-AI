# Reference lab validation

`fixtures/network-labs.json` defines three reproducible synthetic labs:

| Lab | Scope | Automated evidence |
| --- | --- | --- |
| small-office | 1 router, 1 switch, 2 PCs, static/flat LAN | Device count, valid graph, valid addressing and supported export profile |
| segmented-office | Router, firewall, switch, 3 PCs, server | VLAN planning, ACL generation and export readiness |
| cctv-branch | Router, switch, 4 cameras, NVR, PC | VLAN planning, nonzero PoE demand and export readiness |

`tests/reference-labs.test.ts` runs these through the actual engine. Existing branch fixture `fixtures/branch-01.json` additionally checks exact VLAN/CIDR/gateway mappings, physical trunk reservations, change diffs and rollback. Cisco export tests compare generated configurations, cabling and package checksums; configuration import is checked against supported syntax.

This is automated model/package validation, not physical-device certification. To record a simulator result, use an installed licensed simulator and the target images, import the acknowledged export, capture interface/VLAN/route outputs and verify intended allowed/denied packet paths. Record simulator version, image/model, fixture, date, commands and observed results. No simulator pass is claimed without that evidence.
