'use client';

// ─────────────────────────────────────────────────────────────────────────────
// WorkflowDiagram — visual flow diagrams for the /help handbook.
//
//   <PipelineDiagram />  — the daily data pipeline drawn as a small DAG:
//                          parallel inputs → serial scoring spine → parallel
//                          stages → multiple output destinations.
//   <AiAnalysisFlow />   — the on-demand "Ask AI" analysis request flow.
//
// Both are tri-lingual (English / Korean / Traditional Chinese) and follow the
// site's language setting via useLanguage(). Stage descriptions embed <Term>
// glossary links (the same dotted-underline popups used everywhere else on the
// page). No external diagram library — pure Tailwind + lucide icons.
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, type ReactNode } from 'react';
import {
    Activity, Archive, BadgeCheck, Briefcase, Calculator, ChevronDown, ChevronRight,
    Cpu, Database, FileText, History, Landmark, LayoutDashboard, LineChart, ShieldCheck, Sparkles,
} from 'lucide-react';
import { useLanguage } from '@/components/LanguageContext';
import { Term } from '@/components/GlossaryTerm';

type L = { en: string; ko: string; zh: string };
type NodeDesc = { en: ReactNode; ko: ReactNode; zh: ReactNode };

interface FlowNode {
    id: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;   // icon + connector color (text)
    badge: string;    // icon badge background
    step?: string;    // optional step number
    title: L;
    desc: NodeDesc;
    output?: L;
}

// ── Block 1: parallel inputs (data sources) ─────────────────────────────────
const SOURCES: FlowNode[] = [
    {
        id: 'sec',
        icon: Landmark,
        accent: 'text-sky-400',
        badge: 'bg-sky-500/10 border-sky-500/30',
        title: { en: 'SEC Company Facts', ko: 'SEC Company Facts', zh: 'SEC Company Facts' },
        desc: {
            en: <>Ten years of <Term term="as-filed" /> fundamentals straight from <Term term="sec-filings" /> — the ground truth behind <Term term="quality" />, <Term term="forensic" /> checks, and <Term term="demonstrated-growth" />.</>,
            ko: <><Term term="sec-filings" />에서 바로 가져온 <Term term="as-filed" /> 재무 10년치 — <Term term="quality" />, <Term term="forensic" /> 검사, <Term term="demonstrated-growth" />의 기준 사실입니다.</>,
            zh: <>直接來自 <Term term="sec-filings" /> 的 <Term term="as-filed" /> 財務十年——<Term term="quality" />、<Term term="forensic" /> 檢查與 <Term term="demonstrated-growth" /> 背後的基準事實。</>,
        },
    },
    {
        id: 'yf',
        icon: Database,
        accent: 'text-sky-400',
        badge: 'bg-sky-500/10 border-sky-500/30',
        title: { en: 'Yahoo Finance', ko: '야후 파이낸스', zh: 'Yahoo Finance' },
        desc: {
            en: <>Live prices, price history, analyst <Term term="estimates" />, and <Term term="analyst-coverage" /> metadata for every ticker.</>,
            ko: <>모든 티커의 실시간 주가, 주가 이력, 애널리스트 <Term term="estimates" />, <Term term="analyst-coverage" /> 메타데이터.</>,
            zh: <>所有代號的即時股價、股價歷史、分析師 <Term term="estimates" /> 與 <Term term="analyst-coverage" /> 元資料。</>,
        },
    },
    {
        id: 'fred',
        icon: Activity,
        accent: 'text-amber-400',
        badge: 'bg-amber-500/10 border-amber-500/30',
        title: { en: 'FRED (Fed macro)', ko: 'FRED (연준 매크로)', zh: 'FRED（聯準會總體）' },
        desc: {
            en: <>Federal Reserve macro series that feed the <Term term="macro-flags" /> used to trigger <Term term="macro-derisk" />.</>,
            ko: <><Term term="macro-derisk" />를 촉발하는 데 쓰이는 <Term term="macro-flags" />에 공급되는 연준 매크로 시계열.</>,
            zh: <>供應觸發 <Term term="macro-derisk" /> 之 <Term term="macro-flags" /> 的聯準會總體序列。</>,
        },
    },
];

// ── Block 2: the serial scoring spine ────────────────────────────────────────
const SPINE: FlowNode[] = [
    {
        id: 'build-history',
        icon: History,
        accent: 'text-sky-400',
        badge: 'bg-sky-500/10 border-sky-500/30',
        step: '1',
        title: { en: 'Build fundamentals history', ko: '재무 이력 구축', zh: '建立財務歷史' },
        desc: {
            en: <>Turn raw filings into a clean 10-year <Term term="fundamentals-battery" /> — <Term term="piotroski" /> F-score, Sloan <Term term="accruals" />, a real <Term term="beneish" /> M-score, and net issuance. Missing values stay null; they are never silently treated as safe.</>,
            ko: <>원시 서류를 깨끗한 10년치 <Term term="fundamentals-battery" />로 변환합니다. <Term term="piotroski" /> F-점수, Sloan <Term term="accruals" />, 실제 <Term term="beneish" /> M-점수, 순발행량. 누락 값은 null로 남으며 조용히 안전하게 취급되지 않습니다.</>,
            zh: <>把原始申報文件變成乾淨的 10 年 <Term term="fundamentals-battery" />——<Term term="piotroski" /> F 分數、Sloan <Term term="accruals" />、真實 <Term term="beneish" /> M 分數與淨發行。缺失值保持 null，絕不會被悄悄當作安全。</>,
        },
        output: { en: 'fundamentals_battery.json', ko: 'fundamentals_battery.json', zh: 'fundamentals_battery.json' },
    },
    {
        id: 'reverse',
        icon: ShieldCheck,
        accent: 'text-emerald-400',
        badge: 'bg-emerald-500/10 border-emerald-500/30',
        step: '2',
        title: { en: 'Reverse engine', ko: '역설계 엔진', zh: '逆向引擎' },
        desc: {
            en: <>A first-pass safety &amp; quality screen: classify the <Term term="reverse-engine" /> archetype (A–F), score survivability and data quality, and compute <Term term="forensic" /> flags. It also writes candidates into an append-only nomination log.</>,
            ko: <>1차 안전·퀄리티 검사입니다. <Term term="reverse-engine" /> 아키타입(A–F)을 분류하고 생존 가능성·데이터 품질을 채점하며 <Term term="forensic" /> 플래그를 계산합니다. 후보를 추가 전용 지명 로그에도 기록합니다.</>,
            zh: <>第一道安全與品質檢查：分類 <Term term="reverse-engine" /> 原型（A–F）、評分存活度與資料品質、計算 <Term term="forensic" /> 旗標，並把候選股寫入只能附加的提名日誌。</>,
        },
        output: { en: 'safety inputs · nominations', ko: '안전 입력 · 지명', zh: '安全輸入 · 提名' },
    },
    {
        id: 'factorlab',
        icon: Cpu,
        accent: 'text-violet-400',
        badge: 'bg-violet-500/10 border-violet-500/30',
        step: '3',
        title: { en: 'Factor Lab', ko: '팩터 랩', zh: '因子實驗室' },
        desc: {
            en: <>The heart of the rankings. Every sub-metric is <Term term="winsorize" />d and <Term term="zscore" />d within the stock&apos;s own <Term term="sector-neutral" /> group, averaged into the five <Term term="factor" />s, <Term term="equal-weight" />ed, discounted by safety <Term term="haircut" />s, then cut into <Term term="band" />s — with hard <Term term="veto" />es for disqualifying flags.</>,
            ko: <>순위의 핵심입니다. 모든 하위 지표는 종목이 속한 <Term term="sector-neutral" /> 그룹 내에서 <Term term="winsorize" />·<Term term="zscore" /> 처리되고 다섯 <Term term="factor" />로 평균되며 <Term term="equal-weight" /> 적용, 안전 <Term term="haircut" /> 할인 후 <Term term="band" />로 잘립니다. 탈락 플래그는 하드 <Term term="veto" />입니다.</>,
            zh: <>排名的核心。每個子指標都在股票自己的 <Term term="sector-neutral" /> 組內 <Term term="winsorize" />、<Term term="zscore" />，平均成五個 <Term term="factor" />、<Term term="equal-weight" /> 等權、套用安全 <Term term="haircut" /> 折價，再切進 <Term term="band" />——對不合格旗標有硬性 <Term term="veto" />。</>,
        },
        output: { en: 'composite · band · rank', ko: '종합 점수 · 등급 · 순위', zh: '綜合評分 · 等級 · 排名' },
    },
];

// ── Block 3: parallel stages (valuation + AI overlay) ────────────────────────
const PARALLEL: FlowNode[] = [
    {
        id: 'valuation',
        icon: Calculator,
        accent: 'text-teal-400',
        badge: 'bg-teal-500/10 border-teal-500/30',
        step: '4',
        title: { en: 'Valuation models (reverse DCF)', ko: '밸류에이션 모델(역산 DCF)', zh: '估值模型（反向 DCF）' },
        desc: {
            en: <>Solve a <Term term="reverse-dcf" /> by <Term term="bisection" /> for the growth the current price already assumes, then compare it with what the company has actually delivered. The result is the <Term term="expectations-gap" /> (DCF gap).</>,
            ko: <>현재 가격이 이미 가정하는 성장률을 <Term term="bisection" />으로 <Term term="reverse-dcf" />를 풀어 구하고, 기업이 실제로 달성한 것과 비교합니다. 그 결과가 <Term term="expectations-gap" />(DCF gap)입니다.</>,
            zh: <>用 <Term term="bisection" /> 解 <Term term="reverse-dcf" />，求出目前價格已假設的成長率，再與公司實際達成的比較。結果就是 <Term term="expectations-gap" />（DCF gap）。</>,
        },
        output: { en: 'expectations gap', ko: '기대치 격차', zh: '預期落差' },
    },
    {
        id: 'rs2',
        icon: Sparkles,
        accent: 'text-cyan-400',
        badge: 'bg-cyan-500/10 border-cyan-500/30',
        step: '5',
        title: { en: 'RS2 LLM overlay', ko: 'RS2 LLM 오버레이', zh: 'RS2 LLM 覆蓋' },
        desc: {
            en: <>A local <Term term="llm" /> reads each company&apos;s actual filings and writes an independent verdict — <Term term="stance" />, <Term term="conviction" />, <Term term="action" /> — which can promote, demote, or <Term term="veto" /> a name after the quant bands are set.</>,
            ko: <>로컬 <Term term="llm" />이 각 기업의 실제 서류를 읽고 독립 판단(<Term term="stance" />, <Term term="conviction" />, <Term term="action" />)을 씁니다. 퀀트 등급이 설정된 뒤 종목을 승격·강등·<Term term="veto" />할 수 있습니다.</>,
            zh: <>本機 <Term term="llm" /> 閱讀每家公司的實際申報文件並撰寫獨立判斷——<Term term="stance" />、<Term term="conviction" />、<Term term="action" />——可在量化等級設定後升級、降級或 <Term term="veto" /> 該股。</>,
        },
        output: { en: 'LLM rank · verdict', ko: 'LLM 순위 · 판단', zh: 'LLM 排名 · 判斷' },
    },
];

// ── Block 4: the plan node ───────────────────────────────────────────────────
const PLAN_NODE: FlowNode = {
    id: 'portfolio',
    icon: Briefcase,
    accent: 'text-pink-400',
    badge: 'bg-pink-500/10 border-pink-500/30',
    step: '6',
    title: { en: 'Portfolio plan', ko: '포트폴리오 계획', zh: '投資組合計畫' },
    desc: {
        en: <>Turn the Research Now list into a sized, capped allocation. <Term term="kelly" />-based <Term term="position-sizing" />, <Term term="sector-cap" /> and <Term term="theme-cap" />, <Term term="macro-derisk" />, and exit rules. Decision support only — nothing here executes trades.</>,
        ko: <>Research Now 명단을 크기가 정해지고 상한이 있는 배분으로 바꿉니다. <Term term="kelly" /> 기반 <Term term="position-sizing" />, <Term term="sector-cap" />·<Term term="theme-cap" />, <Term term="macro-derisk" />, 엑시트 규칙. 결정 지원일 뿐 매매는 일어나지 않습니다.</>,
        zh: <>把 Research Now 名單變成有規模、有上限的配置。<Term term="kelly" /> 基礎的 <Term term="position-sizing" />、<Term term="sector-cap" /> 與 <Term term="theme-cap" />、<Term term="macro-derisk" /> 與出場規則。只是決策支援——這裡不執行交易。</>,
    },
    output: { en: 'suggested plan (plan / plan2)', ko: '추천 계획 (plan / plan2)', zh: '建議計畫（plan / plan2）' },
};

// ── Block 5: multiple output destinations ────────────────────────────────────
const OUTPUTS: FlowNode[] = [
    {
        id: 'rankings',
        icon: LayoutDashboard,
        accent: 'text-emerald-400',
        badge: 'bg-emerald-500/10 border-emerald-500/30',
        title: { en: 'Rankings / leaderboard', ko: '순위 / 리더보드', zh: '排名 / 排行榜' },
        desc: {
            en: <>The <Term term="composite" />, <Term term="band" />, rank, and DCF gap you see on the dashboard, refreshed every run.</>,
            ko: <>대시보드에서 보는 <Term term="composite" />, <Term term="band" />, 순위, DCF gap. 실행 때마다 갱신됩니다.</>,
            zh: <>你在儀表板上看到的 <Term term="composite" />、<Term term="band" />、排名與 DCF gap，每次執行都會更新。</>,
        },
    },
    {
        id: 'plan-out',
        icon: Briefcase,
        accent: 'text-pink-400',
        badge: 'bg-pink-500/10 border-pink-500/30',
        title: { en: 'Portfolio plan', ko: '포트폴리오 계획', zh: '投資組合計畫' },
        desc: {
            en: <>The <Term term="plan" /> (value core) and <Term term="plan2" /> (hybrid) allocations with sizing, flags, and macro de-risk.</>,
            ko: <><Term term="plan" />(밸류 코어)과 <Term term="plan2" />(하이브리드) 배분, 크기·플래그·매크로 디리스킹.</>,
            zh: <><Term term="plan" />（價值核心）與 <Term term="plan2" />（混合）配置，含規模、旗標與總體去風險。</>,
        },
    },
    {
        id: 'track-out',
        icon: LineChart,
        accent: 'text-orange-400',
        badge: 'bg-orange-500/10 border-orange-500/30',
        title: { en: 'Track Record', ko: '트랙 레코드', zh: '績效紀錄' },
        desc: {
            en: <>Four portfolios <Term term="paper-trading" /> daily with real <Term term="transaction-costs" />, benchmarked against <Term term="iwm" /> and <Term term="spy" /> — the honest meter.</>,
            ko: <>네 포트폴리오를 실제 <Term term="transaction-costs" />로 매일 <Term term="paper-trading" />하고 <Term term="iwm" />·<Term term="spy" />와 비교하는 정직한 측정기.</>,
            zh: <>四個投資組合以真實 <Term term="transaction-costs" /> 每日 <Term term="paper-trading" />，並與 <Term term="iwm" />、<Term term="spy" /> 比較——誠實的量尺。</>,
        },
    },
    {
        id: 'reports-out',
        icon: FileText,
        accent: 'text-cyan-400',
        badge: 'bg-cyan-500/10 border-cyan-500/30',
        title: { en: 'AI Reports', ko: 'AI 리포츠', zh: 'AI 報告' },
        desc: {
            en: <>On-demand <Term term="llm" /> analysis stored in Supabase and shown under <b>/reports</b>.</>,
            ko: <>요청 시 <Term term="llm" /> 분석을 Supabase에 저장하고 <b>/reports</b>에서 표시합니다.</>,
            zh: <>按需的 <Term term="llm" /> 分析儲存於 Supabase，並在 <b>/reports</b> 顯示。</>,
        },
    },
    {
        id: 'logs-out',
        icon: Archive,
        accent: 'text-amber-400',
        badge: 'bg-amber-500/10 border-amber-500/30',
        title: { en: 'Forward logs → outcomes', ko: '전방 로그 → 성과', zh: '前瞻日誌 → 結果' },
        desc: {
            en: <>Every signal and nomination is logged <Term term="point-in-time" /> and later measured against real forward returns — no hindsight, no editing.</>,
            ko: <>모든 신호와 지명은 <Term term="point-in-time" />으로 기록되고 나중에 실제 전방 수익률과 비교됩니다. 사후 판단도 편집도 없습니다.</>,
            zh: <>每個訊號與提名都 <Term term="point-in-time" /> 記錄，日後與真實前瞻報酬比較——沒有事後諸葛，沒有編輯。</>,
        },
    },
];

const AI_STEPS: { id: string; title: L; desc: NodeDesc }[] = [
    { id: 'ask', title: { en: 'Ask AI', ko: 'Ask AI', zh: 'Ask AI' }, desc: { en: <>You click &ldquo;Ask AI&rdquo; on any stock card or detail view.</>, ko: <>종목 카드나 상세 보기에서 &ldquo;Ask AI&rdquo;를 클릭합니다.</>, zh: <>你在任何股票卡片或詳情視圖按 &ldquo;Ask AI&rdquo;。</> } },
    { id: 'api', title: { en: '/api/analysis', ko: '/api/analysis', zh: '/api/analysis' }, desc: { en: <>queues a pending job in Supabase.</>, ko: <>Supabase에 대기 작업을 등록합니다.</>, zh: <>在 Supabase 排入待處理工作。</> } },
    { id: 'ci', title: { en: 'GitHub Actions', ko: 'GitHub Actions', zh: 'GitHub Actions' }, desc: { en: <>triggers the AI worker on a runner.</>, ko: <>러너에서 AI 워커를 트리거합니다.</>, zh: <>在執行器上觸發 AI 工作者。</> } },
    { id: 'llm', title: { en: 'DeepSeek', ko: 'DeepSeek', zh: 'DeepSeek' }, desc: { en: <>reads the full RS2 prompt + the stock&apos;s financials.</>, ko: <>전체 RS2 프롬프트와 종목 재무를 읽습니다.</>, zh: <>讀取完整 RS2 提示詞與股票財務。</> } },
    { id: 'db', title: { en: 'Supabase', ko: 'Supabase', zh: 'Supabase' }, desc: { en: <>stores the verdict for polling.</>, ko: <>판단을 저장해 조회할 수 있게 합니다.</>, zh: <>儲存判斷供輪詢。</> } },
    { id: 'reports', title: { en: '/reports', ko: '/reports', zh: '/reports' }, desc: { en: <>shows the finished analysis.</>, ko: <>완성된 분석을 표시합니다.</>, zh: <>顯示完成的分析。</> } },
];

// Colored block band + tinted container for each stage group. The color coding
// now lives at the BLOCK level (a full-width band), so the parallel/serial/
// output distinction is obvious without a tiny legend.
function FlowBlock({ kind, header, lang, children }: {
    kind: 'parallel' | 'serial' | 'output';
    header: string;
    lang: 'en' | 'ko' | 'zh';
    children: ReactNode;
}) {
    const cfg = {
        parallel: {
            box: 'border-amber-500/25 bg-amber-500/[0.05]',
            band: 'bg-amber-500/15',
            text: 'text-amber-300',
            dot: 'bg-amber-400',
            pill: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
            en: 'Parallel', ko: '병렬', zh: '平行',
        },
        serial: {
            box: 'border-emerald-500/25 bg-emerald-500/[0.05]',
            band: 'bg-emerald-500/15',
            text: 'text-emerald-300',
            dot: 'bg-emerald-400',
            pill: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
            en: 'Serial', ko: '직렬', zh: '序列',
        },
        output: {
            box: 'border-violet-500/25 bg-violet-500/[0.05]',
            band: 'bg-violet-500/15',
            text: 'text-violet-300',
            dot: 'bg-violet-400',
            pill: 'border-violet-500/40 bg-violet-500/15 text-violet-300',
            en: 'Outputs', ko: '출력', zh: '輸出',
        },
    }[kind];
    return (
        <div className={`overflow-hidden rounded-xl border ${cfg.box}`}>
            <div className={`flex items-center gap-2 border-b border-border/40 px-3 py-2 ${cfg.band} ${cfg.text}`}>
                <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                <span className="text-[10px] font-black uppercase tracking-wider">{header}</span>
                <span className={`ml-auto rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${cfg.pill}`}>
                    {cfg[lang]}
                </span>
            </div>
            <div className="p-2.5">{children}</div>
        </div>
    );
}

function DownConnector() {
    return (
        <div className="relative my-1.5 flex h-8 items-center justify-center">
            <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-gradient-to-b from-emerald-400/50 to-emerald-400/10" />
            <span className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500/40 bg-background shadow-[0_0_14px_-4px_rgba(16,185,129,0.6)]">
                <ChevronDown className="h-4 w-4 text-emerald-400" />
            </span>
        </div>
    );
}

function FanOutConnector() {
    return (
        <div className="relative my-1.5 flex h-9 items-center justify-center">
            <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-gradient-to-b from-emerald-400/50 to-emerald-400/10" />
            <span className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-gradient-to-r from-transparent via-violet-400/40 to-transparent" />
            <span className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border border-violet-500/40 bg-background shadow-[0_0_14px_-4px_rgba(139,92,246,0.6)]">
                <ChevronDown className="h-4 w-4 text-violet-400" />
            </span>
        </div>
    );
}

function NodeCard({ n, lang, l }: { n: FlowNode; lang: 'en' | 'ko' | 'zh'; l: (x: L) => string }) {
    return (
        <div className="group flex h-full items-start gap-3 rounded-xl border border-border/70 bg-secondary/10 p-3.5 transition-all hover:border-border hover:bg-secondary/20">
            <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border shadow-lg shadow-black/30 ${n.badge} ${n.accent}`}>
                <n.icon className="h-5 w-5" />
                {n.step && (
                    <span className={`absolute -right-1.5 -top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 border-background bg-[#0b1220] text-[9px] font-black ${n.accent}`}
                        style={{ height: 18, width: 18 }}>
                        {n.step}
                    </span>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-black leading-tight text-foreground">{l(n.title)}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{n.desc[lang]}</p>
                {n.output && (
                    <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/[0.07] px-1.5 py-0.5">
                        <span className="text-[8px] font-black uppercase tracking-wider text-emerald-400/80">{lang === 'ko' ? '산출물' : lang === 'zh' ? '產出' : 'output'}</span>
                        <span className="font-mono text-[10px] font-bold text-emerald-300">{l(n.output)}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

export function PipelineDiagram() {
    const { language } = useLanguage();
    const lang: 'en' | 'ko' | 'zh' = language === 'zh' ? 'zh' : language === 'ko' ? 'ko' : 'en';
    const l = (x: L) => x[lang];

    return (
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.07] via-transparent to-violet-500/[0.07] p-4 shadow-[0_0_40px_-12px_rgba(16,185,129,0.3)]">
            {/* Header */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-black tracking-tight text-foreground">
                    <span className="mr-2">⚙️</span>
                    {lang === 'ko' ? '매일의 데이터 파이프라인' : lang === 'zh' ? '每日資料流程' : 'The daily data pipeline'}
                </p>
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black tracking-wider text-emerald-300">
                    {lang === 'ko' ? '매일 자동 재실행' : lang === 'zh' ? '每日執行' : 'RUNS DAILY'}
                </span>
            </div>

            {/* 1. Parallel inputs — data sources */}
            <FlowBlock kind="parallel" header={lang === 'ko' ? '① 병렬 입력 — 데이터 출처' : lang === 'zh' ? '① 平行輸入 — 資料來源' : '① Parallel inputs — data sources'} lang={lang}>
                <div className="grid gap-2.5 sm:grid-cols-3">
                    {SOURCES.map(s => <NodeCard key={s.id} n={s} lang={lang} l={l} />)}
                </div>
            </FlowBlock>

            <DownConnector />

            {/* 2. Serial spine — the scoring chain */}
            <FlowBlock kind="serial" header={lang === 'ko' ? '② 직렬 — 채점 체인' : lang === 'zh' ? '② 序列 — 評分鏈' : '② Serial — the scoring chain'} lang={lang}>
                <div className="space-y-2.5">
                    {SPINE.map(s => <NodeCard key={s.id} n={s} lang={lang} l={l} />)}
                </div>
            </FlowBlock>

            <DownConnector />

            {/* 3. Parallel stages */}
            <FlowBlock kind="parallel" header={lang === 'ko' ? '③ 병렬 — 같은 명단의 두 가지 판독' : lang === 'zh' ? '③ 平行 — 同一名單的兩種判讀' : '③ Parallel — two reads of the same list'} lang={lang}>
                <div className="grid gap-2.5 sm:grid-cols-2">
                    {PARALLEL.map(s => <NodeCard key={s.id} n={s} lang={lang} l={l} />)}
                </div>
            </FlowBlock>

            <DownConnector />

            {/* 4. Portfolio plan — hero card */}
            <div className="overflow-hidden rounded-xl border border-pink-500/40 bg-gradient-to-br from-pink-500/[0.14] to-secondary/10 p-3.5 shadow-[0_0_28px_-8px_rgba(236,72,153,0.4)]">
                <NodeCard n={PLAN_NODE} lang={lang} l={l} />
            </div>

            <FanOutConnector />

            {/* 5. Multiple output destinations */}
            <FlowBlock kind="output" header={lang === 'ko' ? '④ 여러 출력 목적지' : lang === 'zh' ? '④ 多個輸出目標' : '④ Multiple output destinations'} lang={lang}>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {OUTPUTS.map(s => <NodeCard key={s.id} n={s} lang={lang} l={l} />)}
                </div>
            </FlowBlock>

            {/* Footer notes */}
            <div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                    <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" />
                    {lang === 'ko' ? '전체 체인은 GitHub Actions로 매일 재실행됩니다.' : lang === 'zh' ? '整個流程透過 GitHub Actions 每天重新執行。' : 'The whole chain re-runs daily via GitHub Actions.'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-amber-400" />
                    {lang === 'ko' ? 'IC 드리프트 보고서는 매월 재계산됩니다.' : lang === 'zh' ? 'IC 漂移報告每月重算。' : 'The IC drift report recalculates monthly.'}
                </span>
            </div>
        </div>
    );
}

export function AiAnalysisFlow() {
    const { language } = useLanguage();
    const lang: 'en' | 'ko' | 'zh' = language === 'zh' ? 'zh' : language === 'ko' ? 'ko' : 'en';
    const l = (x: L) => x[lang];

    return (
        <div className="rounded-xl border border-border/70 bg-secondary/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-cyan-300/90">
                    {lang === 'ko' ? '요청 시 AI 분석 (Ask AI)' : lang === 'zh' ? '按需 AI 分析（Ask AI）' : 'On-demand AI analysis (Ask AI)'}
                </p>
                <span className="rounded-full border border-cyan-500/40 bg-cyan-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-cyan-300">
                    {lang === 'ko' ? '요청 시' : lang === 'zh' ? '按需' : 'on-demand'}
                </span>
            </div>
            <div className="mt-2.5 flex items-stretch gap-1 overflow-x-auto pb-1">
                {AI_STEPS.map((s, i) => (
                    <Fragment key={s.id}>
                        <div className="flex min-w-[136px] flex-col justify-center rounded-lg border border-border/60 bg-secondary/10 p-2">
                            <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/50">{i + 1}</span>
                            <span className="mt-0.5 text-[11px] font-black leading-tight text-foreground">{l(s.title)}</span>
                            <span className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{s.desc[lang]}</span>
                        </div>
                        {i < AI_STEPS.length - 1 && (
                            <span className="flex shrink-0 items-center text-emerald-400/70">
                                <ChevronRight className="h-4 w-4" />
                            </span>
                        )}
                    </Fragment>
                ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground/70">
                {lang === 'ko'
                    ? '딥시크가 전체 RS2 프롬프트와 재무 데이터로 분석을 쓰고, 결과는 AI Reports(/reports)에 표시됩니다.'
                    : lang === 'zh'
                        ? 'DeepSeek 依完整 RS2 提示詞與財務資料撰寫分析，結果顯示於 AI Reports（/reports）。'
                        : 'DeepSeek writes the analysis from the full RS2 prompt + financials; results appear under AI Reports (/reports).'}
            </p>
        </div>
    );
}
