# المراجع والحدود

- [RFC 1918](https://www.rfc-editor.org/info/rfc1918/) — مساحات عناوين IPv4 خاصة لحالات المختبر.
- [RFC 4632](https://www.rfc-editor.org/info/rfc4632/) — مرجع CIDR وأحجام prefixes؛ قواعد المشروع لتخصيص العناوين داخل LAN مفصلة في [المحرك](05-network-engine.md).
- [OpenConfig Data Models](https://www.openconfig.net/projects/models/) — مرجع لتصميم نموذج محايد للموردين. قرار استخدام YANG أو adapter فعلي يحتاج تجربة وتغطية لكل منصة.
- [NetBox Docs](https://netboxlabs.com/docs/netbox/) — نموذج IPAM/DCIM ومرشح تكامل inventory؛ لا يوجد تكامل منجز في المشروع.
- [Batfish Differential Questions](https://batfish.readthedocs.io/en/stable/notebooks/differentialQuestions.html) — مقارنة سلوك لقطتين ضمن قدرة التحليل. يسبق اعتماد المحلل قياس تغطيته على fixtures.
- [Cisco Networking Academy Packet Tracer Assessment](https://community.cisco.com/kxiwq67737/attachments/kxiwq67737/6016-discussions-lan-switching-routing/450902/1/Skills%20Assessment.pdf) و[GNS3 Docs](https://docs.gns3.com/docs) — أدوات تحقق مخبري خارج التطبيق؛ وجودها ليس دليلًا على صحة CLI الحالي.

لمراجعة الكود الحالي استخدم [التدقيق](02-current-audit.md). أضف عند اعتماد كل adapter رابط مصدَر المورد للمنصة والنسخة، ونتيجة اختبار محددة لا رابطًا عامًا فحسب.
