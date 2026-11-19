import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Brain,
  CheckCircle2,
  Download,
  LogIn,
  MessageSquare,
  Network,
  Play,
  Send,
  ShieldAlert,
  Sparkles,
  User,
} from "lucide-react";
import { TopovaMark } from "@/components/brand/topova-logo";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";

const STARTERS = [
  {
    ar: "صمّم شبكة شركة كاملة مع OSPF و VLANs",
    en: "Design an Enterprise Campus with OSPF & VLANs",
    promptAr:
      "صمّم لي شبكة مقر شركة متكامل: 2 راوتر، جدار حماية، 2 سويتش، 2 سيرفر، 8 أجهزة كمبيوتر، 2 أكسس بوينت، و 4 كاميرات مع عزل VLANs و OSPF ثم افحص الأمان.",
    promptEn:
      "Design an enterprise campus with 2 routers, 1 firewall, 2 switches, 2 servers, 8 PCs, 2 APs, and 4 cameras using VLAN segmentation and OSPF, then run a security audit.",
  },
  {
    ar: "خطّط معي مشروع تخرج شبكات بأسئلة ذكية",
    en: "Plan a Network Architecture via Guided Questions",
    promptAr:
      "أريد تصميم شبكة احترافية لمشروع تخرج. اسألني أولاً أسئلة توضيحية سريعة لتحديد الحجم والأقسام والأمان والميزانية قبل التصميم.",
    promptEn:
      "I want to architect a flagship network for my project. Ask me clarifying questions on scale, departments, security & budget before designing it.",
  },
  {
    ar: "شبكة كاميرات مراقبة + ميزانية PoE",
    en: "Smart CCTV + PoE+ Wattage Budget",
    promptAr: "صمّم شبكة مراقبة بـ راوتر، فايروول، سويتش، NVR، و 6 كاميرات مراقبة و 4 أجهزة كمبيوتر مع VLANs واحسب طاقة PoE.",
    promptEn: "Design a CCTV surveillance branch with 1 router, 1 firewall, 1 switch, 1 NVR, 6 IP cameras & 4 PCs with VLANs and calculate the PoE budget.",
  },
  {
    ar: "اشرح الفرق بين OSPF و EIGRP و BGP",
    en: "Compare OSPF vs EIGRP vs BGP",
    promptAr: "اشرح لي الفرق الهندسي العملي بين OSPF و EIGRP و BGP ومتى أختار كل بروتوكول في الشبكات الحقيقية.",
    promptEn: "Explain the practical engineering differences between OSPF, EIGRP, and BGP and when to choose each in production networks.",
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const { lang, t } = useLanguage();
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("");

  function launchChat(textOverride?: string) {
    const q = (textOverride ?? prompt).trim();
    if (q.length >= 2) {
      try {
        sessionStorage.setItem("nettopo:chat:seed", q);
      } catch {
        // ignore storage restrictions
      }
    }
    navigate("/chat");
  }

  const pillars = [
    {
      icon: Brain,
      title: t("ذكاء اصطناعي يفكّر ويخطّط معك", "Visible Thinking & Guided Questions"),
      desc: t(
        "يعرض خطوات التفكير والتحليل بوضوح، ويقترح أسئلة تفاعلية ذكية بعد كل رد لتوجيه تصميمك نحو أفضل نتيجة هندسية.",
        "Transparent step-by-step reasoning accordion, interactive clarifying questions, and contextual follow-up suggestions on every turn.",
      ),
    },
    {
      icon: Network,
      title: t("لوحة مخطط حية بجانب المحادثة", "Live Interactive Blueprint Canvas"),
      desc: t(
        "بمجرد وصف الشبكة في الشات، يُفتح المخطط المعماري التفاعلي فوراً بمنافذ سيسكو الحقيقية والعناوين والشبكات الافتراضية.",
        "Your network diagram materializes automatically beside the chat with Cisco port labels, IPv4/VLAN badges, and 3 auto-layouts.",
      ),
    },
    {
      icon: Download,
      title: t("تصدير احترافي لـ Cisco Packet Tracer", "Cisco Packet Tracer 8.x Export Center"),
      desc: t(
        "حزمة جاهزة بملفات تشغيل startup .cfg لكل جهاز، ونصوص لصق سريعة للـ CLI، وجدول كابلات، ودليل تفاعلي خطوة بخطوة.",
        "One-click Packet Tracer 8.x bundle with per-device startup .cfg files, instant CLI paste scripts, cabling CSV & interactive HTML guide.",
      ),
    },
    {
      icon: ShieldAlert,
      title: t("اختبار اختراق وتدقيق أمان من ١٠٠", "Red-Team & Zero-Trust Security Auditor"),
      desc: t(
        "حاكي الانتشار الجانبي للهجمات، اكتشف نقاط الفشل الوحيدة، وطبّق التأمين التلقائي وقواعد الحماية بضغطة زر.",
        "Simulate lateral movement attacks, uncover Tarjan single points of failure, and auto-harden topologies with Zero-Trust ACLs.",
      ),
    },
    {
      icon: Play,
      title: t("محاكي حزم حي وطرفية أوامر سيسكو", "Live Packet Flow & Interactive CLI"),
      desc: t(
        "تتبّع الحزم قفزة بقفزة مع فحص ACL، واقطع الكابلات في وضع الفوضى، ونفّذ أوامر Cisco IOS حقيقية على كل جهاز.",
        "Animate L2/L3 packets hop-by-hop, cut cables live in Chaos mode, and double-click any device for an interactive IOS terminal.",
      ),
    },
    {
      icon: User,
      title: t("مساحة عمل شخصية بمحادثات وذاكرة", "Multi-Chat Workspace, Profile & Memory"),
      desc: t(
        "إدارة كل محادثاتك مع البحث والتثبيت، وملف شخصي وإعدادات مخصصة تحفظ أسلوبك الهندسي وتفضيلاتك في كل جلسة.",
        "Organize pinned chats, search history, customize AI memory & engineering defaults, and switch accent themes seamlessly.",
      ),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* Hero Welcome & Gateway Section */}
        <section className="relative overflow-hidden border-b">
          <div className="pointer-events-none absolute inset-0 cyber-grid" aria-hidden />
          <div className="pointer-events-none absolute inset-0 brand-glow" aria-hidden />

          <div className="container relative py-14 sm:py-20 lg:py-24">
            <div className="grid items-center gap-10 lg:grid-cols-12">
              {/* Left / Primary Editorial Column */}
              <div className="space-y-6 text-center lg:col-span-7 lg:text-start">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Badge variant="ai" className="gap-1.5 px-3 py-1 text-xs">
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("منصة الذكاء الاصطناعي الأولى لهندسة الشبكات", "NEXT-GENERATION AI NETWORK ENGINEERING PLATFORM")}
                  </Badge>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="font-display text-4xl font-bold tracking-tight sm:text-5xl xl:text-6xl"
                >
                  {t("تحدّث مع أقوى مهندس شبكات ذكي", "Meet Your Autonomous AI")}
                  <br />
                  <span className="bg-gradient-to-r from-primary via-cyan to-emerald-400 bg-clip-text text-transparent">
                    {t("يصمّم، يحاكي، ويصدّر لـ Packet Tracer", "Network Architect & Studio")}
                  </span>
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground lg:mx-0 sm:text-lg"
                >
                  {t(
                    "منصة محادثة احترافية متكاملة لمهندسي الشبكات والطلاب: اكتب أي سؤال أو وصف شبكة، شاهد خطوات التفكير والمخطط التفاعلي لحظياً، اختبر الأمان والاختراق، وصدّر حزمة Cisco Packet Tracer الجاهزة بضغطة زر.",
                    "A full conversational AI engineering platform: ask anything, watch structured reasoning unfold, inspect live interactive topologies beside your chat, run Red-Team & packet simulations, and export directly to Cisco Packet Tracer.",
                  )}
                </motion.p>

                {/* Primary Entry Gateway: Guest vs Account */}
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.14 }}
                  className="flex flex-wrap items-center justify-center gap-3 lg:justify-start"
                >
                  <Button
                    size="lg"
                    className="h-12 gap-2 rounded-xl px-6 text-sm font-bold shadow-glow"
                    onClick={() => launchChat()}
                  >
                    <MessageSquare className="h-4 w-4" />
                    {user
                      ? t("افتح مساحة المحادثة الآن", "Open AI Workspace")
                      : t("المتابعة كضيف — ابدأ الشات فوراً", "Continue as Guest — Start Chatting")}
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </Button>

                  {user ? (
                    <Button asChild size="lg" variant="outline" className="h-12 gap-2 rounded-xl px-5">
                      <Link to="/profile">
                        <User className="h-4 w-4 text-cyan" />
                        {t("ملفي الشخصي وإعداداتي", "Profile & Settings")}
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild size="lg" variant="outline" className="h-12 gap-2 rounded-xl px-5">
                      <Link to="/auth">
                        <LogIn className="h-4 w-4 text-cyan" />
                        {t("تسجيل الدخول / إنشاء حساب لحفظ محادثاتك", "Sign In / Create Account to Sync")}
                      </Link>
                    </Button>
                  )}
                </motion.div>

                {/* Trust Highlights */}
                <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-1 text-xs text-muted-foreground lg:justify-start">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    {t("يعمل فوراً بدون تسجيل إجباري", "Instant Guest Mode")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    {t("حفظ تلقائي للمحادثات والمخططات", "Auto-Saved Threads & Blueprints")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    {t("تصدير جاهز لـ Cisco Packet Tracer 8.x", "Cisco Packet Tracer 8.x Ready")}
                  </span>
                </div>
              </div>

              {/* Right Interactive Preview Card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.16 }}
                className="lg:col-span-5"
              >
                <Card className="overflow-hidden border-primary/30 bg-card/90 shadow-2xl backdrop-blur-xl">
                  <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5 text-xs">
                    <span className="flex items-center gap-2 font-display font-bold">
                      <TopovaMark size={20} />
                      Topova AI Workspace
                    </span>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      Packet Tracer Ready
                    </Badge>
                  </div>

                  <CardContent className="space-y-3 p-4">
                    {/* Simulated Live Thinking Preview */}
                    <div className="rounded-xl border border-cyan/30 bg-cyan/5 p-3 text-xs space-y-1.5">
                      <div className="flex items-center gap-1.5 font-semibold text-cyan">
                        <Brain className="h-3.5 w-3.5" />
                        <span>{t("خطوات التفكير والتحليل الذكي", "Autonomous Reasoning Trace")}</span>
                      </div>
                      <div className="space-y-1 text-[11px] text-muted-foreground">
                        <p className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          {t("تصميم 13 جهازاً بـ 4 شبكات VLAN وبروتوكول OSPF", "Architected 13 nodes · 4 VLANs · OSPF")}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          {t("تقييم الأمان 96/100 + قواعد Zero-Trust ACL", "Security Score 96/100 · Zero-Trust ACLs")}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          {t("تجهيز حزمة Cisco Packet Tracer مع دليل التوصيل", "Packaged Cisco Packet Tracer startup configs")}
                        </p>
                      </div>
                    </div>

                    {/* Instant Prompt Composer right on Welcome */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        launchChat();
                      }}
                      className="space-y-2.5"
                    >
                      <textarea
                        rows={3}
                        dir="auto"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            launchChat();
                          }
                        }}
                        placeholder={t(
                          "جرّب الآن: صمّم لي شبكة مستشفى أو شركة، أو اسأل أي سؤال في الشبكات...",
                          "Try now: Design a hospital or enterprise network, or ask any networking question...",
                        )}
                        className="w-full resize-none rounded-xl border bg-background px-3 py-2.5 text-sm leading-relaxed focus:border-primary focus:outline-none"
                      />
                      <Button type="submit" className="w-full gap-2 rounded-xl">
                        <Send className="h-4 w-4" />
                        {t("أرسل وابدأ المحادثة الذكية", "Send & Launch AI Chat")}
                      </Button>
                    </form>

                    {/* Clickable Starters */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {STARTERS.map((s) => (
                        <button
                          key={s.en}
                          type="button"
                          onClick={() => launchChat(lang === "ar" ? s.promptAr : s.promptEn)}
                          className="inline-flex items-center gap-1 rounded-full border bg-background/80 px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
                        >
                          <Sparkles className="h-2.5 w-2.5 text-cyan" />
                          {t(s.ar, s.en)}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Flagship Capabilities Bento */}
        <section className="container py-16">
          <div className="mb-10 text-center">
            <Badge variant="secondary" className="mb-3">
              {t("كل أدوات مهندس الشبكات في منصة واحدة", "COMPLETE AI ENGINEERING ECOSYSTEM")}
            </Badge>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              {t("قوة منصات المحادثة العالمية مع محرك شبكات حقيقي", "World-Class AI Chat Powered by Real Network Engines")}
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pillars.map((item) => (
              <Card key={item.title} className="h-full transition-all hover:border-primary/50 hover:shadow-md">
                <CardHeader className="pb-2.5">
                  <span className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="border-t bg-muted/20 py-12">
          <div className="container flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-start">
            <div className="space-y-1">
              <h3 className="font-display text-xl font-bold flex items-center justify-center gap-2 sm:justify-start">
                <Activity className="h-5 w-5 text-cyan" />
                {t("جاهز تبدأ أول مشروع شبكة مع المساعد الذكي؟", "Ready to launch your first AI network workspace?")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("افتح المحادثة الآن كضيف أو سجّل حسابك المجاني لحفظ كل محادثاتك وإعداداتك.", "Start immediately in Guest Mode or sign in to sync your threads, profile, and topologies.")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="lg" className="gap-2 rounded-xl" onClick={() => launchChat()}>
                <Sparkles className="h-4 w-4" />
                {t("ابدأ الشات الآن", "Launch AI Chat")}
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
