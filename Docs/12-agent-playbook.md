# دليل التنفيذ لمطور أو وكيل كتابة كود

1. ابدأ بفهرس Docs وحالة المستودع وراجع متطلبات التذكرة وعقد المجال قبل التعديل. حدّد ما هو اعتماد موجود وما هو قرار جديد.
2. صغ حالة القبول باسم fixture أو test. ابْنِ أصغر تغيير يكملها في domain أولًا؛ اربط API والواجهة بعد استقرار العقد. التزم بمصدر واحد للبيانات، واعرض missing/unsupported للمستخدم.
3. لا تغيّر stack أو schema أو semantics للمراجعة بصمت. قرار قابل للعكس ومحدود يُوثق في PR؛ قرار يؤثر على تخزين البيانات أو عزلها أو حالة الدعم يُضاف لسجل القرارات.
4. شغّل فحوصًا ذات معنى: unit/contract للمنطق، integration للدخول أو data، E2E للمسار الذي تغير. اعرض النتيجة التي نجحت والشيء الذي لم يُتحقق منه. لا تستعمل بيانات شركة أو أسرارًا في أمثلة أو prompts أو logs.
5. إنهاء التذكرة: acceptance متحقق، fixtures محدثة، doc links تعمل، migration/rollback عند الحاجة، واختبارات تقيس السلوك. لا تضع mock في مسار حقيقي دون تسمية.

## برومبت بداية جاهز

```text
اعمل على NT-001 فقط من Docs/11-roadmap.md.
اقرأ Docs/03-requirements.md و04-architecture.md و05-network-engine.md،
ثم الحالة Docs/fixtures/branch-01.json.
سلّم نموذج مجال v1 مستقل عن React وPrisma وAI، مع parser وحدود واضحة
لـIDs ومراجع الأجهزة/الواجهات والوصلات وCIDR. استخدم معرّفات مستقرة.
اختبر قبول fixture ورفض duplicate/dangling والقيم الخاطئة.
لا تنقل منطق lib/network-engine لمجرد التشابه؛ استخدمه كمرجع للمقارنة.
نفّذ الكود والفحوص، ثم اذكر ما تغير، والاختبارات، والقرارات المؤجلة.
```

قالب كل مهمة: `ID / Problem / Expected behavior / Constraints / Fixtures / Acceptance / Verification / Files touched / Follow-ups`. قالب قرار معماري: `ID / Status / Context / Alternatives / Decision / Trade-offs / Revisit trigger`.

على Windows في النسخة الحالية: `npm ci`، `npm test`، `npm run lint`، `npm run typecheck`. البناء الحالي يستخدم قيم بيئة محلية صحيحة، ووضع self-hosted المستهدف يتطلب README تشغيل محدث بعد التنفيذ. لا تعتمد على خدمات خارجية في CI؛ استبدلها بعقود واختبارات مستقلة.
