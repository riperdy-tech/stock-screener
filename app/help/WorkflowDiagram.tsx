'use client';

// ─────────────────────────────────────────────────────────────────────────────
// WorkflowDiagram — the visual flow diagram for the /help handbook.
//
//   <PipelineDiagram />  — the daily pipeline drawn as a small DAG: data sources
//                          (plus the macro engine as a side input) → safety filters
//                          → the dual-door screen → bands → the AI analyst → the gate
//                          → publish → paper books → grading.
//
// Follows the site's language setting via useLanguage(). Stage
// descriptions embed <Term> glossary links (the same dotted-underline popups
// used everywhere else on the page). No external diagram library — pure
// Tailwind + lucide icons.
// ─────────────────────────────────────────────────────────────────────────────

import { type ReactNode } from 'react';
import {
    Activity, BadgeCheck, Briefcase, ChevronDown, Cpu, Database, Filter, Gauge, Landmark,
    Layers, LineChart, ShieldCheck, Sparkles, Upload,
} from 'lucide-react';
import { useLanguage } from '@/components/LanguageContext';
import { Term } from '@/components/GlossaryTerm';

type L = { en: string; ko: string; zh: string };
type NodeDesc = { en: ReactNode; ko: ReactNode; zh: ReactNode };

const T = (en: string, ko: string, zh: string): L => ({ en, ko, zh });
const D = (en: ReactNode, ko: ReactNode, zh: ReactNode): NodeDesc => ({ en, ko, zh });

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
        accent: 'text-accent',
        badge: 'bg-accent/10 border-accent/40',
        title: T('SEC filings', 'SEC 제출 서류', 'SEC 申報文件'),
        desc: D(
            <>Ten years of <Term term="as-filed" /> fundamentals from <Term term="sec-filings" /> — the ground truth behind <Term term="quality" />, <Term term="forensic" /> warnings and <Term term="demonstrated-growth" />.</>,
            <><Term term="sec-filings" />에서 가져온 10년치 <Term term="as-filed" /> 재무 데이터 — <Term term="quality" />, <Term term="forensic" />, <Term term="demonstrated-growth" />의 기준 사실입니다.</>,
            <>來自<Term term="sec-filings" />、十年份的<Term term="as-filed" />基本面——是<Term term="quality" />、<Term term="forensic" />與<Term term="demonstrated-growth" />背後的基準事實。</>,
        ),
    },
    {
        id: 'yf',
        icon: Database,
        accent: 'text-accent',
        badge: 'bg-accent/10 border-accent/40',
        title: T('Yahoo Finance', 'Yahoo Finance', 'Yahoo Finance'),
        desc: D(
            <>Prices, price history and analyst <Term term="estimates" /> for every ticker.</>,
            <>모든 티커의 주가, 주가 이력, <Term term="estimates" />입니다.</>,
            <>每檔股票代號的股價、價格歷史與<Term term="estimates" />。</>,
        ),
    },
    {
        id: 'fred',
        icon: Activity,
        accent: 'text-warn',
        badge: 'bg-warn/10 border-warn/40',
        title: T('FRED (Fed macro)', 'FRED (연준 매크로)', 'FRED（聯準會總體資料）'),
        desc: D(
            <>Federal Reserve economic series. They feed the macro engine and nothing else.</>,
            <>연방준비제도의 경제 시계열입니다. 매크로 엔진에만 쓰이고 다른 곳에는 쓰이지 않습니다.</>,
            <>聯準會的經濟序列。它們只供給總體引擎，不作他用。</>,
        ),
    },
];

// ── Side input: the macro engine ─────────────────────────────────────────────
const MACRO: FlowNode = {
    id: 'macro',
    icon: Gauge,
    accent: 'text-warn',
    badge: 'bg-warn/10 border-warn/40',
    title: T('Macro engine', '매크로 엔진', '總體引擎'),
    desc: D(
        <>Publishes a <Term term="probability-vector" /> for each economic season and <Term term="shock-register" /> alarms. Sector tilt is <b>off</b>: its sector picking has not proved itself, so the screen does not use it.</>,
        <>경제 계절별 확률(<Term term="probability-vector" />)과 쇼크 경보(<Term term="shock-register" />)를 게시합니다. 섹터 틸트는 <b>꺼져</b> 있습니다. 섹터 선택이 아직 검증되지 않아 스크린이 사용하지 않습니다.</>,
        <>為每個經濟季節發布一個機率（<Term term="probability-vector" />），並發布衝擊警報（<Term term="shock-register" />）。類股傾斜是<b>關閉</b>的：它的選類股能力尚未證明自己，所以篩選不使用它。</>,
    ),
    output: T('probabilities · shock alarms', '확률 · 쇼크 경보', '機率 · 衝擊警報'),
};

// ── Block 2: the screen and the shortlist ────────────────────────────────────
const SCREEN: FlowNode[] = [
    {
        id: 'tier1',
        icon: Filter,
        accent: 'text-accent',
        badge: 'bg-accent/10 border-accent/40',
        step: '1',
        title: T('Tier-1 hygiene', 'Tier-1 위생 필터', 'Tier-1 衛生篩選'),
        desc: D(
            <>Removes untradable names, names with no filed fundamentals, chronic losses with heavy debt, and — for smaller companies — forensic manipulation risk. Large companies get a warning instead.</>,
            <>거래할 수 없는 종목, 제출된 재무 데이터가 없는 종목, 만성 적자와 과도한 부채, 그리고 — 더 작은 기업에 한해 — 재무 포렌식상의 조작 위험을 제거합니다. 대기업은 대신 경고를 받습니다.</>,
            <>剔除無法交易的股票、沒有申報基本面的股票、長期虧損加上沉重債務，以及——針對較小的公司——財報鑑識上的操縱風險。大型公司則只會得到警告。</>,
        ),
        output: T('survivors · vetoes', '통과 종목 · 베토', '倖存股 · 否決'),
    },
    {
        id: 'doors',
        icon: Cpu,
        accent: 'text-pos',
        badge: 'bg-pos/10 border-pos/40',
        step: '2',
        title: T('Dual-door screen (3 doors)', '듀얼 도어 스크린(도어 3개)', '雙門篩選（3 道門）'),
        desc: D(
            <>Compounder, value gap and trend leaders. Each is <Term term="sector-neutral" />, and the better <Term term="door" /> score competes. A <Term term="champion" /> gets a small bonus; a <Term term="hysteresis" /> buffer keeps the shortlist steady.</>,
            <>컴파운더, 밸류 갭, 추세 주도주. 각각 <Term term="sector-neutral" />이며, 더 좋은 <Term term="door" /> 점수로 경쟁합니다. <Term term="champion" />에게는 작은 가산점이 붙고, <Term term="hysteresis" /> 완충 장치가 후보 명단을 안정시킵니다.</>,
            <>複利成長、價值落差與趨勢領頭。每一道都是<Term term="sector-neutral" />，並以較好的<Term term="door" />分數來競爭。<Term term="champion" />會得到小加分；<Term term="hysteresis" />緩衝讓候選名單保持穩定。</>,
        ),
        output: T('door scores · shortlist', '도어 점수 · 후보 명단', '門分數 · 候選名單'),
    },
    {
        id: 'bands',
        icon: Layers,
        accent: 'text-pos',
        badge: 'bg-pos/10 border-pos/40',
        step: '3',
        title: T('Bands', '등급', '等級'),
        desc: D(
            <><Term term="research-now" />, <Term term="watchlist" />, <Term term="pass" /> and vetoed — the four <Term term="band" />s, set from rank.</>,
            <><Term term="research-now" />, <Term term="watchlist" />, <Term term="pass" />, 베토 — 순위로 정해지는 네 개의 <Term term="band" />입니다.</>,
            <><Term term="research-now" />、<Term term="watchlist" />、<Term term="pass" />與被否決——依排名決定的四個<Term term="band" />。</>,
        ),
        output: T('band · rank', '등급 · 순위', '等級 · 排名'),
    },
];

// ── Block 3: the analyst and the gate ────────────────────────────────────────
const ANALYST: FlowNode[] = [
    {
        id: 'analyst',
        icon: Sparkles,
        accent: 'text-accent',
        badge: 'bg-accent/10 border-accent/40',
        step: '4',
        title: T('AI analyst (local model)', 'AI 애널리스트(로컬 모델)', 'AI 分析師（本機模型）'),
        desc: D(
            <>The AI researches and chooses every input, Python does every calculation, and code checks the answer against outside anchors. 2–3 runs per stock; the verdict is where the price sits against the <Term term="iv-band" />. <b>Paused for rebuild.</b></>,
            <>AI가 리서치하고 모든 입력값을 고르며, 파이썬이 모든 계산을 하고, 코드가 외부 앵커에 대조해 답을 검증합니다. 종목당 2~3회 실행하며, 판단은 주가가 <Term term="iv-band" />에 대해 어디에 있는가입니다. <b>재구축을 위해 일시 중지됨.</b></>,
            <>AI 負責研究並選定每一項輸入，Python 做每一項計算，程式碼再拿外部錨點檢查答案。每檔股票執行 2–3 次；判決就是股價相對於<Term term="iv-band" />的位置。<b>因重建而暫停。</b></>,
        ),
        output: T('verdict · value band', '판단 · 가치 밴드', '判決 · 價值區間'),
    },
    {
        id: 'gate',
        icon: ShieldCheck,
        accent: 'text-warn',
        badge: 'bg-warn/10 border-warn/40',
        step: '5',
        title: T('Gate', '게이트', '閘門'),
        desc: D(
            <>Marks each verdict <Term term="actionable" /> or not, with the <Term term="gate-reason" />s. Blocked verdicts stay visible as a record.</>,
            <>각 판단에 <Term term="actionable" /> 여부를 표시하고, 이유(<Term term="gate-reason" />)를 붙입니다. 막힌 판단은 기록으로 계속 보입니다.</>,
            <>為每個判決標示是否<Term term="actionable" />，並附上<Term term="gate-reason" />。被擋下的判決仍會作為紀錄保持可見。</>,
        ),
        output: T('actionable · reasons', '실행 가능 · 사유', '可執行 · 原因'),
    },
    {
        id: 'publish',
        icon: Upload,
        accent: 'text-accent',
        badge: 'bg-accent/10 border-accent/40',
        step: '6',
        title: T('Publish to the site', '사이트에 게시', '發布到網站'),
        desc: D(
            <>Shortlist, verdicts and reports are written to the site&apos;s data and shown on the desk.</>,
            <>후보 명단, 판단, 리포트가 사이트 데이터에 기록되어 데스크에 표시됩니다.</>,
            <>候選名單、判決與報告會寫入網站資料，並顯示在研究台上。</>,
        ),
    },
];

// ── Block 4: books and grading ───────────────────────────────────────────────
const OUTPUTS: FlowNode[] = [
    {
        id: 'books',
        icon: Briefcase,
        accent: 'text-warn',
        badge: 'bg-warn/10 border-warn/40',
        step: '7',
        title: T('Paper books', '페이퍼 북', '紙上帳本'),
        desc: D(
            <>Three books <Term term="paper-trading" /> daily with real <Term term="transaction-costs" />: Equal-weight, the AI book and Mine. The AI book holds only cash until a verdict passes the gate.</>,
            <>세 개의 북이 매일 <Term term="paper-trading" />을 하며, 실제 <Term term="transaction-costs" />을 반영합니다. Equal-weight, AI 북, Mine. AI 북은 판단이 게이트를 통과할 때까지 현금만 보유합니다.</>,
            <>三個帳本每天以真實的<Term term="transaction-costs" />進行<Term term="paper-trading" />：Equal-weight、AI 帳本與 Mine。在有判決通過閘門之前，AI 帳本只持有現金。</>,
        ),
    },
    {
        id: 'grading',
        icon: LineChart,
        accent: 'text-warn',
        badge: 'bg-warn/10 border-warn/40',
        step: '8',
        title: T('Grading', '성과 평가', '評分'),
        desc: D(
            <>Each verdict is checked against what the price did over 30, 91, 182 and 365 days versus <Term term="iwm" />, <Term term="spy" /> and QQQ.</>,
            <>각 판단을 30일, 91일, 182일, 365일 동안 주가가 실제로 한 움직임과 <Term term="iwm" />, <Term term="spy" />, QQQ에 견주어 점검합니다.</>,
            <>每個判決都會拿 30、91、182 與 365 天內的實際股價表現，對照<Term term="iwm" />、<Term term="spy" />與 QQQ 來檢查。</>,
        ),
    },
];

// Colored block band + tinted container for each stage group. The color coding
// now lives at the BLOCK level (a full-width band), so the parallel/serial/
// output distinction is obvious without a tiny legend.
function FlowBlock({ kind, header, lang, children }: {
    kind: 'parallel' | 'serial' | 'output';
    header: L;
    lang: 'en' | 'ko' | 'zh';
    children: ReactNode;
}) {
    const cfg = {
        parallel: {
            box: 'border-warn/40 bg-warn/10]',
            band: 'bg-warn/10',
            text: 'text-warn',
            dot: 'bg-factor-momentum',
            pill: 'border-warn/40 bg-warn/10 text-warn',
            en: 'Parallel', ko: '병렬', zh: '平行',
        },
        serial: {
            box: 'border-pos/40 bg-pos/10',
            band: 'bg-pos/10',
            text: 'text-pos',
            dot: 'bg-factor-value',
            pill: 'border-pos/40 bg-pos/10 text-pos',
            en: 'Serial', ko: '직렬', zh: '序列',
        },
        output: {
            box: 'border-rule-24 bg-white/5]',
            band: 'bg-white/5',
            text: 'text-ink-2',
            dot: 'bg-factor-lowvol',
            pill: 'border-rule-24 bg-white/5 text-ink-2',
            en: 'Outputs', ko: '출력', zh: '輸出',
        },
    }[kind];
    return (
        <div className={`overflow-hidden  border ${cfg.box}`}>
            <div className={`flex items-center gap-2 border-b border-rule-10 px-3 py-2 ${cfg.band} ${cfg.text}`}>
                <span className={`h-2 w-2  ${cfg.dot}`} />
                <span className="text-[11px] font-extrabold uppercase tracking-wider">{header[lang]}</span>
                <span className={`ml-auto  border px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider ${cfg.pill}`}>
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
            <span className="relative z-10 flex h-6 w-6 items-center justify-center border border-pos/40 bg-page">
                <ChevronDown className="h-4 w-4 text-pos" />
            </span>
        </div>
    );
}

function NodeCard({ n, lang, l }: { n: FlowNode; lang: 'en' | 'ko' | 'zh'; l: (x: L) => string }) {
    return (
        <div className="group flex h-full items-start gap-3 border border-rule-10 bg-white/5 p-3.5 transition-all hover:border-rule-14 hover:bg-white/5">
            <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center border border-rule-24 ${n.badge} ${n.accent}`}>
                <n.icon className="h-5 w-5" />
                {n.step && (
                    <span className={`absolute -right-1.5 -top-1.5 flex h-4.5 w-4.5 items-center justify-center  border-2 border-background bg-[#0b1220] text-[11px] font-extrabold ${n.accent}`}
                        style={{ height: 18, width: 18 }}>
                        {n.step}
                    </span>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-extrabold leading-tight text-ink">{l(n.title)}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-2">{n.desc[lang]}</p>
                {n.output && (
                    <div className="mt-1.5 inline-flex items-center gap-1.5 border border-pos/40 bg-pos/10 px-1.5 py-0.5">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-pos">{lang === 'ko' ? '산출물' : lang === 'zh' ? '產出' : 'output'}</span>
                        <span className="font-mono text-[11px] font-bold text-pos">{l(n.output)}</span>
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
        <div className="border border-pos/40 bg-gradient-to-b from-emerald-500/[0.07] via-transparent to-violet-500/[0.07] p-4">
            {/* Header */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-extrabold tracking-tight text-ink">
                    <span className="mr-2">⚙️</span>
                    {lang === 'ko' ? '매일의 데이터 파이프라인' : lang === 'zh' ? '每日資料流程' : 'The daily data pipeline'}
                </p>
                <span className="border border-pos/40 bg-pos/10 px-2.5 py-1 text-[11px] font-extrabold tracking-wider text-pos">
                    {lang === 'ko' ? '매일 자동 재실행' : lang === 'zh' ? '每日執行' : 'RUNS DAILY'}
                </span>
            </div>

            {/* 1. Parallel inputs — data sources */}
            <FlowBlock kind="parallel" header={T('① Parallel inputs — data sources', '① 병렬 입력 — 데이터 출처', '① 平行輸入 — 資料來源')} lang={lang}>
                <div className="grid gap-2.5 sm:grid-cols-3">
                    {SOURCES.map(s => <NodeCard key={s.id} n={s} lang={lang} l={l} />)}
                </div>
            </FlowBlock>

            <DownConnector />

            {/* Side input — the macro engine, read alongside the screen */}
            <FlowBlock kind="parallel" header={T('Side input — the economic backdrop', '보조 입력 — 경제 배경', '旁路輸入 — 經濟背景')} lang={lang}>
                <NodeCard n={MACRO} lang={lang} l={l} />
            </FlowBlock>

            <DownConnector />

            {/* 2. Serial — the screen and the shortlist */}
            <FlowBlock kind="serial" header={T('② Serial — the screen and the shortlist', '② 직렬 — 스크린과 후보 명단', '② 序列 — 篩選與候選名單')} lang={lang}>
                <div className="space-y-2.5">
                    {SCREEN.map(s => <NodeCard key={s.id} n={s} lang={lang} l={l} />)}
                </div>
            </FlowBlock>

            <DownConnector />

            {/* 3. Serial — the analyst, the gate, publishing */}
            <FlowBlock kind="serial" header={T('③ Serial — the analyst, the gate, publishing', '③ 직렬 — 애널리스트, 게이트, 게시', '③ 序列 — 分析師、閘門、發布')} lang={lang}>
                <div className="space-y-2.5">
                    {ANALYST.map(s => <NodeCard key={s.id} n={s} lang={lang} l={l} />)}
                </div>
            </FlowBlock>

            <DownConnector />

            {/* 4. Outputs */}
            <FlowBlock kind="output" header={T('④ Books and grading', '④ 북과 성과 평가', '④ 帳本與評分')} lang={lang}>
                <div className="grid gap-2.5 sm:grid-cols-2">
                    {OUTPUTS.map(s => <NodeCard key={s.id} n={s} lang={lang} l={l} />)}
                </div>
            </FlowBlock>

            {/* Footer notes */}
            <div className="mt-3 flex flex-wrap gap-2 border-t border-rule-10 pt-3 text-[11px] text-ink-2">
                <span className="inline-flex items-center gap-1.5">
                    <BadgeCheck className="h-3.5 w-3.5 text-pos" />
                    {lang === 'ko' ? '전체 체인은 GitHub Actions로 매일 재실행됩니다.' : lang === 'zh' ? '整個流程透過 GitHub Actions 每天重新執行。' : 'The scoring chain re-runs on a schedule via GitHub Actions.'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-warn" />
                    {lang === 'ko' ? 'AI 애널리스트는 로컬 컴퓨터에서 실행되며 재구축을 위해 일시 중지되어 있습니다.' : lang === 'zh' ? 'AI 分析師在本機電腦上執行，目前因重建而暫停。' : 'The AI analyst runs on a local computer and is paused for rebuild.'}
                </span>
            </div>
        </div>
    );
}
