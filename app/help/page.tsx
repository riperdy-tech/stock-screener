'use client';

// ─────────────────────────────────────────────────────────────────────────────
// /help — THE FACTOR LAB HANDBOOK
//
// A dedicated, extensive "bible" that explains everything this site does:
// how the pipeline works, how every number is computed, what every column
// means, and what the system is deliberately NOT doing.
//
// Every financial/technical word rendered with <Term> is a hyperlink: click it
// and a mini-popup explains that term. See components/GlossaryTerm.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
    ArrowLeft, ArrowUpRight, BookOpen, BookMarked, FlaskConical, HelpCircle, ListTree, Search, X,
} from 'lucide-react';
import {
    GlossaryProvider, Term, GLOSSARY, CATEGORY_ORDER, CATEGORY_LABELS, CATEGORY_STYLES,
} from '@/components/GlossaryTerm';
import type { TermDef } from '@/lib/glossary';
import { useLanguage } from '@/components/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { CATEGORY_LABELS_KO, GLOSSARY_KO } from '@/lib/glossary-ko';
import { CATEGORY_LABELS_ZH, GLOSSARY_ZH } from '@/lib/glossary-zh';
import { APP_VERSION } from '@/lib/changelog';
import { Section, SubHeading, Callout } from './help-ui';
import { KoreanHelpBody } from './content-ko';
import { ChineseHelpBody } from './content-zh';
import { PipelineDiagram, AiAnalysisFlow } from './WorkflowDiagram';

type Lang = 'en' | 'ko' | 'zh';

// ── Left navigation — grouped like a reference sidebar (Box-style) ────────────
type NavItem = { id: string; en: string; ko: string; zh: string };
interface NavGroup { id: string; en: string; ko: string; zh: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
    {
        id: 'start', en: 'Start here', ko: '시작하기', zh: '開始',
        items: [
            { id: 'welcome', en: 'Welcome', ko: '소개', zh: '歡迎' },
            { id: 'pipeline', en: 'What happens every day', ko: '매일 무슨 일이?', zh: '每天的流程' },
        ],
    },
    {
        id: 'engine', en: 'The engine', ko: '엔진', zh: '引擎',
        items: [
            { id: 'leaderboard', en: 'Reading the leaderboard', ko: '리더보드 읽는 법', zh: '閱讀排行榜' },
            { id: 'factors', en: 'The five factors', ko: '다섯 가지 팩터', zh: '五個因子' },
            { id: 'bands', en: 'Bands, vetoes & haircuts', ko: '등급·베토·할인', zh: '等級·否決·折價' },
            { id: 'dcf', en: 'The expectations gap', ko: '기대치 격차', zh: '預期落差' },
            { id: 'lens', en: 'The Lens: quant vs RS2', ko: '렌즈: 퀀트 vs RS2', zh: '鏡頭：量化 vs RS2' },
            { id: 'rs2', en: 'RS2: the AI second opinion', ko: 'RS2: AI 2차 소견', zh: 'RS2：AI 第二意見' },
        ],
    },
    {
        id: 'using', en: 'Using the tool', ko: '도구 사용법', zh: '使用工具',
        items: [
            { id: 'track', en: 'Track Record', ko: '트랙 레코드', zh: '績效紀錄' },
            { id: 'portfolio', en: 'Portfolio & sizing', ko: '포트폴리오·크기', zh: '投資組合·規模' },
            { id: 'overlays', en: 'Overlay chips & forensics', ko: '오버레이·포렌식', zh: '覆蓋·財報鑑識' },
            { id: 'themes', en: 'Themes: context, not factors', ko: '테마: 맥락뿐', zh: '主題：只是脈絡' },
        ],
    },
    {
        id: 'deep', en: 'Deep dive', ko: '심화', zh: '深入',
        items: [
            { id: 'methodology', en: 'Methodology', ko: '실무자용 방법론', zh: '方法論' },
            { id: 'validation', en: 'How it is validated', ko: '시스템 검증', zh: '如何驗證' },
            { id: 'data', en: 'Where the data comes from', ko: '데이터 출처', zh: '資料來源' },
        ],
    },
    {
        id: 'ref', en: 'Reference', ko: '참조', zh: '參考',
        items: [
            { id: 'faq', en: 'FAQ', ko: '자주 묻는 질문', zh: '常見問題' },
            { id: 'glossary', en: 'The glossary', ko: '용어 사전', zh: '詞彙表' },
            { id: 'disclaimer', en: 'Disclaimer', ko: '면책 조항', zh: '免責聲明' },
        ],
    },
];

const ALL_NAV_IDS = NAV_GROUPS.flatMap(g => g.items.map(i => i.id));

// Small UI string dictionary used by the shared page shell.
const UI = {
    handbookSubtitle: { en: 'The complete guide', ko: '완전한 안내서', zh: '完整指南' },
    searchPlaceholder: { en: 'Search the glossary…', ko: '용어 사전 검색…', zh: '搜尋詞彙表…' },
    glossaryBtn: { en: 'Glossary', ko: '용어 사전', zh: '詞彙表' },
    onThisPage: { en: 'On this page', ko: '이 페이지 목차', zh: '本頁目錄' },
    howToUse: { en: 'How to use this guide', ko: '이 안내서 사용법', zh: '如何使用本指南' },
    howToUseBody: { en: 'Words shown in green with a dotted underline are clickable — tap one for a quick definition.', ko: '점선 밑줄의 초록 단어는 클릭 가능합니다. 누르면 간단한 정의가 나옵니다.', zh: '帶點狀底線的綠色字可以點擊——按一下即可看到簡短定義。' },
    results: { en: 'results for', ko: '개의 결과 (검색어:', zh: '個結果（搜尋：' },
    tryAnother: { en: '— try another word.', ko: '— 다른 단어를 검색해 보세요.', zh: '——請換個詞試試。' },
    terms: { en: 'term(s)', ko: '개 용어', zh: '個詞彙' },
    backToCockpit: { en: 'Back to the Factor Lab Cockpit', ko: '팩터 랩 콕핏으로 돌아가기', zh: '返回 Factor Lab 駕駛艙' },
} as const;

type L3 = { en: string; ko: string; zh: string };
type FAQItem = { q: L3; a: { en: ReactNode; ko: ReactNode; zh: ReactNode } };

const FAQ_ITEMS: FAQItem[] = [
    {
        q: { en: 'Is this financial advice?', ko: '이것은 재정적 조언인가요?', zh: '這是投資建議嗎？' },
        a: {
            en: 'No. It is a research shortlist with the evidence laid out. Nothing here buys or sells anything, and nothing here is financial advice.',
            ko: '아니요. 근거를 보여주는 리서치 후보 명단입니다. 여기서는 아무것도 사고팔지 않으며, 어떤 것도 재정적 조언이 아닙니다.',
            zh: '不是。這是一份攤開證據的研究候選名單。這裡不會買賣任何東西，這裡也不是投資建議。',
        },
    },
    {
        q: { en: 'Does the site execute trades?', ko: '이 사이트는 실제 매매를 하나요?', zh: '這個網站會實際交易嗎？' },
        a: {
            en: 'Never. Even the paper portfolios are simulated — but honestly, with real prices and real transaction costs.',
            ko: '절대 아닙니다. 페이퍼 포트폴리오조차 시뮬레이션일 뿐입니다. 다만 정직하게, 실제 가격과 실제 거래비용으로 시뮬레이션됩니다.',
            zh: '絕對不會。即使是紙上投資組合也只是模擬——但誠實地，以真實價格與真實交易成本模擬。',
        },
    },
    {
        q: { en: 'Why is the composite ranked by five factors, not more?', ko: '왜 팩터가 다섯 개뿐인가요?', zh: '為什麼綜合評分只用五個因子，不多不少？' },
        a: {
            en: <>Five robust, historically documented factors, equal-weighted on purpose. Adding more tuned factors invites <Term term="overfitting" />, which loses to simple 1/N out of sample.</>,
            ko: <>견고하고 역사적으로 입증된 다섯 팩터를 의도적으로 동일 가중합니다. 손을 더 많이 댄 팩터는 <Term term="overfitting" />을 불러오며, 이는 표본 외에서 단순 1/N에 집니다.</>,
            zh: <>五個穩健、有歷史文獻佐證的因子，刻意等權重。加入更多調校過的因子只會招來 <Term term="overfitting" />，在樣本外輸給簡單的 1/N。</>,
        },
    },
    {
        q: { en: 'Why is the suggested plan often ~50% cash?', ko: '왜 추천 계획이 자주 약 50% 현금인가요?', zh: '為什麼建議計畫常保持約 50% 現金？' },
        a: {
            en: <>The value core only buys names with measurable <Term term="edge" /> — priced below demonstrated growth — and refuses to overpay. Cash is a feature: protection and dry powder.</>,
            ko: <>밸류 코어는 측정 가능한 <Term term="edge" />이 있는 종목(입증된 성장보다 싼 종목)만 사고 과대평가를 거부합니다. 현금은 보호와 탄약이라는 특징입니다.</>,
            zh: <>價值核心只買有可測量 <Term term="edge" /> 的股票——定價低於已證明成長——並拒絕為昂貴買單。現金是特色：保護與子彈。</>,
        },
    },
    {
        q: { en: 'What do the red chips mean?', ko: '레드칩은 무엇을 뜻하나요?', zh: '紅牌是什麼意思？' },
        a: {
            en: <>A <Term term="veto" />: automatic disqualification regardless of score. The reason is written on the chip.</>,
            ko: <><Term term="veto" />입니다. 점수와 무관한 자동 탈락이며 이유가 칩에 적혀 있습니다.</>,
            zh: <><Term term="veto" />：無論分數都自動取消資格。原因寫在牌上。</>,
        },
    },
    {
        q: { en: 'Why do quant and RS2 disagree?', ko: '왜 퀀트와 RS2가 다른가요?', zh: '為什麼量化引擎和 RS2 會意見不同？' },
        a: {
            en: 'One is pure math over financial statements; the other reads filings with judgment. When they strongly disagree, one of them is wrong — those are the interesting rows. Use the Compare lens.',
            ko: '하나는 재무제표에 대한 순수 수학이고, 다른 하나는 판단으로 서류를 읽습니다. 강하게 다를 때는 둘 중 하나가 틀린 것입니다. 그런 행이 흥미로운 행입니다. 비교(Compare) 렌즈를 쓰세요.',
            zh: '一個是對財務報表的純數學，另一個是以判斷閱讀申報文件。當它們強烈分歧時，其中一方是錯的——那些列最有趣。請用比較（Compare）鏡頭。',
        },
    },
    {
        q: { en: 'How can I trust the track record?', ko: '트랙 레코드를 어떻게 신뢰하나요?', zh: '績效紀錄為何可信？' },
        a: {
            en: <>It is forward-logged (<Term term="point-in-time" />), append-only, cannot be edited, includes <Term term="transaction-costs" />, and measures against real benchmarks including delisted names.</>,
            ko: <>전방 기록(<Term term="point-in-time" />), 추가 전용이며 편집할 수 없고, <Term term="transaction-costs" />을 포함하며, 상장폐지 종목을 포함한 실제 벤치마크와 비교합니다.</>,
            zh: <>它是前瞻記錄（<Term term="point-in-time" />）、只能附加、無法編輯、包含 <Term term="transaction-costs" />，並與包含已下市股票的實際基準比較。</>,
        },
    },
];

const FACTOR_ITEMS = [
    {
        key: 'value',
        color: 'text-emerald-300',
        dot: 'bg-emerald-400',
        name: 'Value',
        body: (
            <>
                Are you paying $1 for $2 of yearly cash earnings, or $2 for $1? Cheap beats expensive on
                average over time. Measured as the average of four yields — <Term term="fcf-yield" />,
                {' '}<Term term="owner-earnings" />, <Term term="ebit" />, and <Term term="earnings-yield" /> —
                each against the stock&apos;s current price. See{' '}
                <Link href="#methodology" className="font-bold text-emerald-300 hover:underline">the methodology</Link>.
            </>
        ),
    },
    {
        key: 'quality',
        color: 'text-sky-300',
        dot: 'bg-sky-400',
        name: 'Quality',
        body: (
            <>
                Does the company make real money, consistently, with clean accounting? Combines{' '}
                <Term term="revenue-quality" />, <Term term="gross-margin" /> stability across several years,
                {' '}<Term term="accruals" /> (preferring cash-backed earnings), the <Term term="piotroski" />,
                and <Term term="roic" />. A profitable business with honest books beats a story.
            </>
        ),
    },
    {
        key: 'momentum',
        color: 'text-amber-300',
        dot: 'bg-amber-400',
        name: 'Momentum',
        body: (
            <>
                Has the stock been winning over the past year? Winners tend to keep winning for a while. Built
                from the <Term term="skip-month" /> (the academic 12-month return skipping the last month) and{' '}
                <Term term="high-proximity" />. See <Term term="reversal" /> for why the last month is skipped.
            </>
        ),
    },
    {
        key: 'lowvol',
        color: 'text-violet-300',
        dot: 'bg-violet-400',
        name: 'Low volatility',
        body: (
            <>
                Does the price move calmly or wildly? Calm stocks have historically delivered more return per
                unit of pain. Measured as the negative of the standard deviation of monthly returns (at least 12
                observations). The <Term term="annualized-volatility" /> is also exported for{' '}
                <Term term="kelly" /> sizing.
            </>
        ),
    },
    {
        key: 'revisions',
        color: 'text-rose-300',
        dot: 'bg-rose-400',
        name: 'Revisions',
        body: (
            <>
                Are the professional analysts who follow the company raising or cutting their forecasts? Direction
                of change matters. Built from the normalized <Term term="eps-trajectory" /> slope and a structured
                {' '}<Term term="estimates" /> score.
            </>
        ),
    },
];

function SidebarNav({ activeId, lang }: { activeId: string; lang: Lang }) {
    return (
        <nav className="space-y-4">
            {NAV_GROUPS.map(group => (
                <div key={group.id}>
                    <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">
                        {group[lang]}
                    </p>
                    <ul className="space-y-0.5 border-l border-border">
                        {group.items.map(item => {
                            const active = activeId === item.id;
                            return (
                                <li key={item.id}>
                                    <a
                                        href={`#${item.id}`}
                                        aria-current={active ? 'true' : undefined}
                                        className={`-ml-px block border-l-2 py-1 pl-3 text-xs font-semibold transition-colors ${
                                            active
                                                ? 'border-emerald-400/70 text-emerald-300'
                                                : 'border-transparent text-muted-foreground hover:border-emerald-400/40 hover:text-foreground'
                                        }`}
                                    >
                                        {item[lang]}
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
        </nav>
    );
}

export default function HelpPage() {
    const { language } = useLanguage();
    const lang: Lang = language === 'zh' ? 'zh' : language === 'ko' ? 'ko' : 'en';
    const contentsLabel = lang === 'ko' ? '목차' : lang === 'zh' ? '目錄' : 'Contents';
    const openContentsLabel = lang === 'ko' ? '목차 열기' : lang === 'zh' ? '開啟目錄' : 'Open contents';
    const [glossaryQuery, setGlossaryQuery] = useState('');
    const [activeId, setActiveId] = useState<string>('welcome');
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    // Scrollspy — highlight the section currently in view in the left nav.
    useEffect(() => {
        const onScroll = () => {
            const offset = 160;
            let current = ALL_NAV_IDS[0];
            for (const id of ALL_NAV_IDS) {
                const el = document.getElementById(id);
                if (el && el.getBoundingClientRect().top <= offset) current = id;
            }
            setActiveId(current);
        };
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const entries = useMemo(() => {
        const q = glossaryQuery.trim().toLowerCase();
        const ordered = CATEGORY_ORDER.flatMap(cat =>
            Object.keys(GLOSSARY)
                .filter(key => GLOSSARY[key].category === cat)
                .map(key => [key, GLOSSARY[key]] as [string, TermDef]),
        );
        if (!q) return ordered;
        return ordered.filter(pair => {
            const t = pair[1];
            const loc = lang === 'ko' ? GLOSSARY_KO[pair[0]] : lang === 'zh' ? GLOSSARY_ZH[pair[0]] : undefined;
            const catLabel = lang === 'ko' ? CATEGORY_LABELS_KO : lang === 'zh' ? CATEGORY_LABELS_ZH : CATEGORY_LABELS;
            return t.term.toLowerCase().includes(q) ||
                t.plain.toLowerCase().includes(q) ||
                t.definition.toLowerCase().includes(q) ||
                (loc?.term.toLowerCase().includes(q) ?? false) ||
                (loc?.plain.toLowerCase().includes(q) ?? false) ||
                (loc?.definition.toLowerCase().includes(q) ?? false) ||
                catLabel[t.category].toLowerCase().includes(q);
        });
    }, [glossaryQuery, lang]);

    const counts = useMemo(() => {
        const c: Record<string, number> = {};
        Object.values(GLOSSARY).forEach(t => { c[t.category] = (c[t.category] || 0) + 1; });
        return c;
    }, []);

    return (
        <GlossaryProvider>
            <div className="min-h-screen bg-background text-foreground">
                {/* ── Header ─────────────────────────────────────────────── */}
                <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
                    <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3">
                        <Link href="/" className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/20 px-2.5 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="h-3.5 w-3.5" /> Cockpit
                        </Link>
                        <button
                            onClick={() => setMobileNavOpen(true)}
                            aria-label={openContentsLabel}
                            className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/20 px-2.5 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground lg:hidden"
                        >
                            <ListTree className="h-3.5 w-3.5" />
                            {contentsLabel}
                        </button>
                        <div className="flex items-center gap-2">
                            <BookOpen className="h-5 w-5 text-emerald-400" />
                            <div>
                                <h1 className="text-base font-black tracking-tight">
                                    THE FACTOR LAB <span className="text-emerald-400">HANDBOOK</span>
                                </h1>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {UI.handbookSubtitle[lang]} · v{APP_VERSION}
                                </p>
                            </div>
                        </div>
                        <div className="ml-auto flex flex-wrap items-center gap-2">
                            <LanguageToggle />
                            <div className="relative hidden sm:block">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                                <input
                                    value={glossaryQuery}
                                    onChange={e => setGlossaryQuery(e.target.value)}
                                    placeholder={UI.searchPlaceholder[lang]}
                                    className="w-56 rounded-md border border-border bg-secondary/20 py-1.5 pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-emerald-400/50 focus:outline-none"
                                />
                            </div>
                            <Link href="#glossary" className="flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25">
                                <BookMarked className="h-3.5 w-3.5" /> {UI.glossaryBtn[lang]}
                            </Link>
                        </div>
                    </div>
                </header>

                {/* ── Body: sticky TOC + content ─────────────────────────── */}
                <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-6">
                    {/* Left TOC (desktop) */}
                    <nav className="sticky top-20 hidden h-fit w-56 shrink-0 lg:block">
                        <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
                            {UI.onThisPage[lang]}
                        </p>
                        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
                            <SidebarNav activeId={activeId} lang={lang} />
                        </div>
                        <div className="mt-4 rounded-lg border border-border/60 bg-secondary/10 p-3 text-[11px] leading-relaxed text-muted-foreground">
                            <p className="font-black uppercase tracking-wider text-emerald-300/80">{UI.howToUse[lang]}</p>
                            <p className="mt-1">
                                {UI.howToUseBody[lang]}
                            </p>
                        </div>
                    </nav>

                    {/* Main column */}
                    <main className="min-w-0 flex-1 space-y-10">
                        {lang === 'en' && (<>
                        {/* Welcome */}
                        <Section id="welcome" title="Welcome — what this site is (and is not)" icon={<FlaskConical className="h-5 w-5" />}>
                            <p>
                                Every day, a computer reads the financial reports and price history of roughly{' '}
                                <b>6,600 US stocks</b> and ranks them on one leaderboard. Top of the leaderboard = the most
                                evidence in the stock&apos;s favor. That&apos;s it. This handbook walks through exactly how
                                that evidence is assembled, what every number and chip on screen means, and what the system
                                is deliberately <i>not</i> doing.
                            </p>
                            <Callout kind="warn">
                                <b>Nothing here buys or sells anything, and nothing here is financial advice.</b> It is a
                                research shortlist with the evidence laid out — a machine for narrowing 6,600 stocks down
                                to a shortlist worth <i>your</i> research time. Trades are never executed, not even in the
                                paper portfolios (they are simulated, honestly, with real prices and real costs).
                            </Callout>
                            <p>
                                If a word has a <span className="border-b border-dotted border-emerald-400/60 font-semibold text-emerald-300">dotted underline</span>,
                                it is a <Term term="ticker" />-level technical term — click it to see what it means without
                                leaving the page. A complete, searchable index of every term lives in the{' '}
                                <Link href="#glossary" className="font-bold text-emerald-300 hover:underline">glossary section</Link>.
                            </p>
                        </Section>

                        {/* Pipeline */}
                        <Section id="pipeline" title="What happens every day — the pipeline" icon={<BookMarked className="h-5 w-5" />}>
                            <p>
                                Behind the page is an ordered chain of jobs, re-run automatically every day via{' '}
                                <Term term="github-actions" />. An orchestrator enforces the order and checks data
                                integrity so stale or partial data can never silently corrupt your rankings.
                            </p>
                            <PipelineDiagram />
                            <AiAnalysisFlow />
                            <p>
                                Everything is <Term term="point-in-time" />: each logged signal uses only information that
                                existed at that moment. That discipline is what makes the track record trustworthy.
                            </p>
                        </Section>

                        {/* Leaderboard */}
                        <Section id="leaderboard" title="Reading the leaderboard — the Rankings tab" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                The Rankings tab is a table of the whole universe, ranked by one number: the{' '}
                                <Term term="composite" />. Here is what every column means.
                            </p>
                            <ul className="list-disc space-y-2 pl-5">
                                <li>
                                    <b>Rank</b> — today&apos;s position on the leaderboard of ~6,600 scored US stocks. #1 has
                                    the strongest overall evidence right now.
                                </li>
                                <li>
                                    <b>Composite</b> — the one number everything is ranked by (0–100). It blends the five
                                    factor scores, each measured against the stock&apos;s own <Term term="sector-neutral" />{' '}
                                    comparison group, then applies safety <Term term="haircut" />s. Higher = more evidence in
                                    the stock&apos;s favor.
                                </li>
                                <li>
                                    <b>Factor mix</b> — what is driving the score. A contribution bar shows the share of each
                                    factor: green = value, blue = quality, amber = momentum, violet = low volatility, pink =
                                    revisions. Longer segment = bigger contribution.
                                </li>
                                <li>
                                    <b>Band</b> — what the rank means in practice (<Term term="research-now" />,{' '}
                                    <Term term="watchlist" />, <Term term="monitor" />, <Term term="pass" />). A red chip means
                                    the stock is <Term term="veto" />ed outright — the reason is written on the chip.
                                </li>
                                <li>
                                    <b>Market cap</b> — <Term term="market-cap" />, the price of the whole company
                                    (share price × shares).
                                </li>
                                <li>
                                    <b>RS2 rank / stance / conviction / action</b> — the independent AI read. See the{' '}
                                    <Link href="#rs2" className="font-bold text-emerald-300 hover:underline">RS2 section</Link>.
                                </li>
                                <li>
                                    <b>Δ pctl</b> — how much the quant engine and the AI disagree, in percentile points.
                                    Big gaps are the interesting rows: one of them is wrong.
                                </li>
                                <li>
                                    <b>DCF gap</b> — the <Term term="expectations-gap" />: the growth the price requires vs
                                    the growth the company has actually delivered. See the{' '}
                                    <Link href="#dcf" className="font-bold text-emerald-300 hover:underline">DCF section</Link>.
                                </li>
                            </ul>
                            <Callout kind="info">
                                Click any row for the per-stock detail: the full factor profile, the reverse-DCF read (the
                                growth the price implies vs what the company has demonstrated), and the RS2 local-LLM
                                research and verdict.
                            </Callout>
                        </Section>

                        {/* Factors */}
                        <Section id="factors" title="The five factors — the ingredients of a score" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                Each stock is graded on five traits that have historically predicted returns. Crucially,
                                every grade is <Term term="sector-neutral" /> — a supermarket competes with supermarkets, not
                                with software companies. Otherwise &ldquo;high momentum&rdquo; would just mean &ldquo;is a
                                tech stock.&rdquo;
                            </p>
                            <div className="space-y-3">
                                {FACTOR_ITEMS.map(f => (
                                    <div key={f.key} className="rounded-lg border border-border/60 bg-secondary/10 p-3">
                                        <p className="flex items-center gap-2 text-sm font-black">
                                            <span className={`h-2.5 w-2.5 rounded-full ${f.dot}`} />
                                            <span className={f.color}>{f.name}</span>
                                        </p>
                                        <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/90">{f.body}</p>
                                    </div>
                                ))}
                            </div>
                            <SubHeading>Why every ingredient counts equally</SubHeading>
                            <p>
                                Think of judging a <Term term="factor" /> decathlon: you could try to guess which event
                                matters most, but decades of research show those guesses backfire — the &ldquo;perfect&rdquo;
                                weights found in past data almost never work on future data. So each of the five ingredients
                                counts exactly the same (<Term term="equal-weight" />). Boring, humble, and it works better.
                                The site still <Term term="rank-ic" />-measures each factor&apos;s predictive power every
                                month as a diagnostic — it just never lets a short sample steer the engine.
                            </p>
                            <Callout kind="tip">
                                A missing factor does not silently wreck a stock: if value, quality, or momentum is missing,
                                the name is marked <i>insufficient factors</i> rather than scored on partial data. When a
                                non-essential factor is missing, the remaining weights renormalize so the composite stays
                                comparable.
                            </Callout>
                        </Section>

                        {/* Bands */}
                        <Section id="bands" title="Bands, vetoes & safety haircuts" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                The composite percentile is cut into four practical buckets, or <Term term="band" />s:
                            </p>
                            <ul className="list-disc space-y-2 pl-5">
                                <li><span className="font-black text-emerald-300">RESEARCH NOW</span> — top 3%. Worth your research time today.</li>
                                <li><span className="font-black text-sky-300">WATCHLIST</span> — top 10%.</li>
                                <li><span className="font-black text-amber-300">MONITOR</span> — top 30%.</li>
                                <li><span className="text-muted-foreground">PASS</span> — the rest.</li>
                            </ul>
                            <SubHeading>Vetoes — hard disqualifiers</SubHeading>
                            <p>
                                Some stocks are disqualified no matter how good the score looks — think of a house with
                                beautiful photos that failed the structural inspection. A <Term term="veto" /> is applied
                                before scoring, so a vetoed name gets no composite at all. Reasons include: the reverse
                                engine&apos;s safety checks (<i>reverse_engine_reject</i>), both forensic alarms firing
                                together (<Term term="beneish" /> + high <Term term="accruals" />),{' '}
                                <Term term="dilution" /> from heavy share issuance, or (in the AI lens) a hard avoid/sell
                                verdict. The reason is written on the red chip.
                            </p>
                            <SubHeading>Safety haircuts</SubHeading>
                            <p>
                                Between the raw score and the final rank, three multiplicative <Term term="haircut" />s are
                                applied: <b>survivability</b> = 0.7 + 0.3 × (survivability/100); <b>data quality</b> =
                                min(1, 0.8 + 0.04 × dq); and <b>forensic</b> = 0.85 if a single Beneish or accruals alarm
                                fired (both firing is a veto, not a haircut). The result is re-ranked, so fragile or
                                suspicious names drop without being thrown out.
                            </p>
                        </Section>

                        {/* DCF */}
                        <Section id="dcf" title="The expectations gap — what the price silently promises" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                Every stock price silently makes a promise about future growth. The{' '}
                                <Term term="reverse-dcf" /> extracts that promise as a number — the <Term term="implied-growth" />{' '}
                                the market is charging you for — by solving (via <Term term="bisection" />) for the growth
                                rate that makes a standard <Term term="dcf" /> equal the current price.
                            </p>
                            <p>
                                The <b>DCF gap</b> column compares that promise with reality: <Term term="implied-growth" />{' '}
                                minus <Term term="demonstrated-growth" /> (the last 5 years of revenue/FCF growth from SEC
                                filings), in percentage points.
                            </p>
                            <ul className="list-disc space-y-2 pl-5">
                                <li>
                                    <span className="font-black text-emerald-300">Green / negative</span> — the price promises
                                    LESS than the company has proven. A potential bargain: you are being paid not to believe
                                    the growth story.
                                </li>
                                <li>
                                    <span className="font-black text-amber-300">Amber / positive</span> — the price needs an
                                    acceleration nobody has demonstrated yet. You have to believe a story.
                                </li>
                            </ul>
                            <Callout kind="tip">
                                The gap is also the <Term term="edge" /> used by the suggested plan: only names priced below
                                their demonstrated growth have measurable edge, so high-ranked-but-expensive names are
                                skipped with &ldquo;no Kelly edge.&rdquo;
                            </Callout>
                        </Section>

                        {/* Lens */}
                        <Section id="lens" title="The Lens — whose eyes you look through" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                At the top of the Rankings tab is one switch that decides whose ranking you see:
                            </p>
                            <ul className="list-disc space-y-2 pl-5">
                                <li>
                                    <b>Quant</b> — the deterministic factor engine. Pure math over financial statements and
                                    prices. No AI involved. This is the original, unchanged view.
                                </li>
                                <li>
                                    <b>RS2 LLM</b> — the local AI analyst&apos;s own list, built by reading each company&apos;s
                                    actual filings and writing an independent verdict.
                                </li>
                                <li>
                                    <b>Compare</b> — both side by side, biggest disagreements first. A disagreement percentile
                                    (Δ pctl) is computed per name; big gaps are where one engine is wrong.
                                </li>
                            </ul>
                            <p>
                                The AI applies <i>after</i> the quant bands are set: it can promote, demote, or veto names,
                                producing a parallel ranking. The quant baseline is never overwritten — the two lists are
                                both shown so you can see where they disagree.
                            </p>
                        </Section>

                        {/* RS2 */}
                        <Section id="rs2" title="RS2 — the AI second opinion" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                RS2 is a <Term term="llm" /> that reads each company&apos;s actual SEC filings and writes an
                                independent verdict — like getting a second doctor&apos;s opinion. For every name it produces:
                            </p>
                            <ul className="list-disc space-y-2 pl-5">
                                <li><Term term="stance" /> — undervalued / fair / overvalued (a colored pill).</li>
                                <li><Term term="conviction" /> — how confident it is, 0–15.</li>
                                <li><Term term="action" /> — buy / hold / reduce / avoid… an opinion for research, never an order.</li>
                                <li>
                                    Its own DCF read, whose <Term term="intrinsic-value" /> is anchored to the analyst
                                    consensus band and de-forwarded to <Term term="present-value" /> — so the{' '}
                                    <Term term="margin-of-safety" /> measures cheapness <i>today</i>, not a 12-month price target.
                                </li>
                            </ul>
                            <SubHeading>The AI Research Now gate</SubHeading>
                            <p>
                                The AI&apos;s Research Now list keys off RS2&apos;s structured signals — margin of safety and
                                entry timing — in two tiers: <b>deep value</b> (MoS ≥ 30%) earns Research Now at any
                                conviction; <b>moderate value</b> (MoS ≥ 15%, or a genuine fresh buy) additionally needs
                                conviction ≥ 9.5. Bearish calls are demoted out of Research Now; a hard avoid/sell is vetoed.
                            </p>
                            <p>
                                When a name leaves the quant Research Now list, RS2 writes an <Term term="exit-review" /> —
                                a hold/trim/sell call for current holders, shown as an amber &ldquo;LLM EXIT&rdquo; chip.
                            </p>
                        </Section>

                        {/* Track */}
                        <Section id="track" title="Track Record — the honest meter" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                Instead of showing a flattering <Term term="backtest" />, the system{' '}
                                <Term term="paper-trading" />s its own picks every single day with real prices and real{' '}
                                <Term term="transaction-costs" />, and the record is append-only — it can never be edited.
                                If the machine is wrong, this page will say so, publicly and permanently. That&apos;s the point.
                            </p>
                            <SubHeading>The portfolios</SubHeading>
                            <ul className="list-disc space-y-2 pl-5">
                                <li><b className="text-emerald-300">plan</b> — the value core: <Term term="kelly" />-sized, ~50% cash.</li>
                                <li><b className="text-pink-400">plan2</b> — the hybrid: value core + <Term term="sleeve" />, ~78% invested, holds the expensive leaders.</li>
                                <li><b className="text-sky-300">equal</b> — equal-weighting every Research Now name (pure stock-picking test).</li>
                                <li><b className="text-violet-300">mine</b> — your saved My Portfolio holdings, <Term term="unitization" />-measured like a fund.</li>
                            </ul>
                            <SubHeading>How to read it</SubHeading>
                            <ul className="list-disc space-y-2 pl-5">
                                <li><b>plan vs plan2</b> — if plan2 wins, paying up for quality leaders beat the value discipline this period; if plan wins, the discipline (and cash) paid off.</li>
                                <li><b>plan vs equal</b> — the sizing machinery adds value if plan beats equal weighting.</li>
                                <li><b>equal vs IWM</b> — the stock selection itself works if the picks beat the small-cap <Term term="benchmark" />.</li>
                                <li><b>mine vs plan</b> — your own deviations cost money: that&apos;s the <Term term="behavior-gap" />.</li>
                                <li><b>&ldquo;Sold too early&rdquo; flags</b> — exits that kept rising. A recurring pattern there means the exit rule needs work.</li>
                            </ul>
                            <p>
                                <Term term="sharpe-ratio" /> and <Term term="cagr" /> appear only after enough days of live
                                data; early on this page is deliberately boring. A what-if overlay lets you re-cost every
                                trade at your own commission rate to see the drag of fees.
                            </p>
                        </Section>

                        {/* Portfolio */}
                        <Section id="portfolio" title="Portfolio — sizing & the suggested plan" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                The Portfolio tab has two very different halves. Read the labels carefully:
                            </p>
                            <SubHeading>My Portfolio (top) — your actual holdings</SubHeading>
                            <p>
                                Enter your ACTUAL holdings (saved only in this browser). Each is checked against the model: a
                                quarter-<Term term="kelly" /> suggested size, an over/under-weight verdict, and loud flags if a
                                holding is <Term term="veto" />ed or outside coverage. The &ldquo;mine&rdquo; ledger on Track
                                Record uses these, unitized like a fund.
                            </p>
                            <SubHeading>Suggested plan (below) — NOT your portfolio</SubHeading>
                            <p>
                                A machine-built allocation from the Research Now list, with a <b>Value core / Hybrid</b> toggle:
                            </p>
                            <ul className="list-disc space-y-2 pl-5">
                                <li>
                                    <b>Value core (plan)</b> — quarter-Kelly sizing: <Term term="edge" /> = the expectations
                                    gap closing over ~3 years; risk = <Term term="volatility" />; f = 0.25 × edge/risk²,
                                    capped 5%. <Term term="forensic" /> flags halve size; GPR 2–3 and insider selling shrink
                                    it; sector 25% / theme 30% caps; the rest stays <Term term="cash" /> (often ~50%).
                                </li>
                                <li>
                                    <b>Hybrid (plan2)</b> — the same value core PLUS a <Term term="sleeve" /> that buys the
                                    top-ranked names REGARDLESS of valuation gap (capped ~35% of <Term term="book-value" />),
                                    so it holds the expensive leaders the core refuses and deploys the idle cash (~78%
                                    invested). Sleeve rows are tinted pink.
                                </li>
                            </ul>
                            <Callout kind="warn">
                                Why two? The value core protects you in a bust (it won&apos;t overpay) but lags in a melt-up;
                                the hybrid captures the leaders but rides them down harder (bigger <Term term="drawdown" />s).
                                Track Record shows how both actually perform.
                            </Callout>
                            <SubHeading>Macro de-risk</SubHeading>
                            <p>
                                <Term term="macro-flags" /> are warning lights from <Term term="fred" /> data. If 2+ fire,
                                every suggested size halves automatically (<Term term="macro-derisk" />) — shown as a loud
                                amber banner on the tab.
                            </p>
                        </Section>

                        {/* Overlays */}
                        <Section id="overlays" title="Overlay chips & forensic flags" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                Overlays are context <i>chips</i>, never additive score. They exist to shrink positions, demand
                                bigger margins of safety, or question your thesis:
                            </p>
                            <ul className="list-disc space-y-2 pl-5">
                                <li>
                                    <b>GPR 0–3</b> — <Term term="gpr" /> tagged from the company&apos;s actual business profile
                                    (revenue geography, supply chains, regulation, sanctions). Never a buy/sell signal; at
                                    level 3 it shrinks position sizes and demands a bigger margin of safety.
                                </li>
                                <li>
                                    <b>▲/▼ INSIDERS</b> — <Term term="informed-demand" />: insiders net-buying while short
                                    sellers retreat (▲, confirming) or insiders selling into elevated <Term term="short-interest" />{' '}
                                    (▼, interrogate the thesis). Confirmation or warning only.
                                </li>
                            </ul>
                            <SubHeading>Forensic flags</SubHeading>
                            <p>
                                The forensic battery — <Term term="beneish" /> M-score, Sloan <Term term="accruals" />, net
                                issuance, and the fundamentals battery — produces the <Term term="forensic" /> flags shown on
                                the plan rows. A single alarm is a 0.85 haircut; the pair firing together is a{' '}
                                <Term term="veto" />.
                            </p>
                        </Section>

                        {/* Themes */}
                        <Section id="themes" title="Themes — context, never a scoring factor" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                A <Term term="theme" /> is a market narrative a stock belongs to — AI, semiconductors,
                                biotech, and so on. Theme membership and scores ride along for <b>orientation</b> and for
                                <b> crowding warnings</b> (late-cycle theme crowding is a risk signal), but they{' '}
                                <b>never add to the composite</b>.
                            </p>
                            <Callout kind="warn">
                                This is deliberate: naive theme exposure has historically destroyed value — specialized theme
                                ETFs average −3.1%/yr (Ben-David et al. 2023). The site won&apos;t let a hot narrative quietly
                                inflate scores. In the plan, themes are bounded by a 30% theme cap so one hype story can&apos;t
                                take over the book.
                            </Callout>
                        </Section>

                        {/* Methodology */}
                        <Section id="methodology" title="Methodology — for practitioners" icon={<BookOpen className="h-5 w-5" />}>
                            <SubHeading>Scoring pipeline — exact mechanics</SubHeading>
                            <p>
                                Universe: every name scored by the reverse engine (~6,600 US listings). Per sub-metric:
                                <Term term="winsorize" /> at the 1st/99th percentile <i>within sector</i>, then{' '}
                                <Term term="zscore" /> within sector. Factor z = mean of that factor&apos;s available
                                sub-metrics. Composite z = weight-renormalized sum over available factors (missing factors
                                drop out and remaining weights rescale; value, quality, and momentum are <i>required</i> —
                                a name missing any of them is marked <i>insufficient_factors</i> rather than scored on
                                partial data).
                            </p>
                            <p>
                                Composite z → cross-sectional <Term term="percentile" /> (0–100) → three multiplicative{' '}
                                <Term term="haircut" />s (survivability, data quality, forensic) → re-ranked → final
                                percentile sets the <Term term="band" />: ≥97 research_now, ≥90 watchlist, ≥70 monitor, else pass.
                            </p>
                            <SubHeading>Factor construction — sub-metrics and sources</SubHeading>
                            <p>
                                <span className="font-black text-emerald-300">Value</span> = mean z of four yields, all
                                computed from the latest fiscal year of SEC-filed fundamentals against current market cap:
                                <Term term="fcf-yield" /> (FCF/mcap), <Term term="owner-earnings" /> ((NI + D&amp;A − capex)/mcap),
                                <Term term="ebit" /> yield (operating income/<Term term="enterprise-value" />), and{' '}
                                <Term term="earnings-yield" /> (NI/mcap — broadest coverage, rescues filers with missing
                                capex/D&amp;A/op-income tags).
                            </p>
                            <p>
                                <span className="font-black text-sky-300">Quality</span> = mean z of: <Term term="revenue-quality" />{' '}
                                (reverse-engine score), <Term term="gross-margin" /> stability (−stdev across ≥4 fiscal
                                years), negative <Term term="accruals" /> (−accruals ratio), and <Term term="piotroski" />{' '}
                                (both from the forensic battery).
                            </p>
                            <p>
                                <span className="font-black text-amber-300">Momentum</span> = mean z of the{' '}
                                <Term term="skip-month" /> and <Term term="high-proximity" />. Monthly closes.
                            </p>
                            <p>
                                <span className="font-black text-violet-300">Low volatility</span> = z of −σ(monthly
                                returns), minimum 12 observations; the <Term term="annualized-volatility" /> is exported per
                                name and feeds <Term term="kelly" /> sizing.
                            </p>
                            <p>
                                <span className="font-black text-rose-300">Revisions</span> = mean of two 0–1 parts:
                                normalized <Term term="eps-trajectory" /> slope (clamp(slope, −1, 1)+1)/2, and analyst
                                structured score/100 — scaled to 0–100 then re-centred to a z-like scale via (score−50)/25.
                            </p>
                            <SubHeading>Weights</SubHeading>
                            <p>
                                Equal 0.20 × 5 (scheme <code>equal_weight_robust5</code>). <Term term="rank-ic" /> per factor
                                is measured monthly but writes a drift <i>diagnostic</i> only — measured IC never steers the
                                weights (DeMiguel, Garlappi &amp; Uppal 2009: estimated weights rarely beat 1/N out of sample).
                            </p>
                            <SubHeading>Reverse DCF — exact method</SubHeading>
                            <p>
                                The valuation models solve by <Term term="bisection" /> for the growth rate that makes a
                                standard DCF equal the CURRENT price — the growth the market is charging you for. The{' '}
                                <Term term="expectations-gap" /> (shown as &ldquo;DCF gap&rdquo;) = implied growth −
                                demonstrated growth, where demonstrated = the last 5 years of revenue/FCF growth from SEC
                                filings, in percentage points. The reverse engine layers archetype classification (A–F) and
                                survivability/data-quality scoring on top, producing the safety inputs the Factor Lab consumes.
                            </p>
                            <SubHeading>Veto rules (exact)</SubHeading>
                            <p>
                                <b>reverse_engine_reject</b> = reverse-engine band ∈ {'{'}Excluded, Reject, Reject-tier{'}'}
                                · <b>forensic_pair</b> = Beneish M-score elevated AND accruals high (single alarm = 0.85
                                haircut instead) · <b>heavy_issuance</b> = HEAVY_ISSUANCE flag, waived for archetypes E/F
                                where issuance is the expected financing mode. In the AI lens, a hard avoid/sell verdict is
                                also a veto (<code>llm_reject</code>).
                            </p>
                            <SubHeading>Missing data is null, never silently safe</SubHeading>
                            <p>
                                The old placeholder Z/M-scores are gone. If a metric is missing, it is null — and the
                                scoring pipeline either marks the name insufficient or applies the data-quality haircut.
                                A gap is never quietly treated as a pass.
                            </p>
                        </Section>

                        {/* Validation */}
                        <Section id="validation" title="How the system is validated" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                Two independent honesty loops keep the machine honest:
                            </p>
                            <ul className="list-disc space-y-2 pl-5">
                                <li>
                                    <b>Forward-logged signals</b> — every factor signal is logged at the moment it is made (
                                    <Term term="point-in-time" />, append-only) and later measured against what actually
                                    happened, including delisted names (no <Term term="survivorship-bias" />).
                                </li>
                                <li>
                                    <b>Paper-traded portfolios</b> — the Track Record page trades plan / plan2 / equal /
                                    mine daily with real prices and costs, benchmarked against <Term term="iwm" /> and{' '}
                                    <Term term="spy" />. Returns and <Term term="alpha" /> are public and permanent.
                                </li>
                            </ul>
                            <p>
                                Monthly, an IC drift report recalibrates the <Term term="rank-ic" /> diagnostics. The point
                                of all of this is that the site never gets to grade its own homework: the scoreboard is
                                forward-looking, real, and uneditable.
                            </p>
                        </Section>

                        {/* Data */}
                        <Section id="data" title="Where the data comes from" icon={<BookOpen className="h-5 w-5" />}>
                            <ul className="list-disc space-y-2 pl-5">
                                <li><Term term="sec-filings" /> — 10 years of as-filed fundamentals via <Term term="company-facts" /> (the ground truth for quality, forensics, and demonstrated growth).</li>
                                <li><Term term="yahoo-finance" /> — prices, analyst <Term term="estimates" />, and coverage.</li>
                                <li><Term term="fred" /> — Fed macro series behind the <Term term="macro-flags" />.</li>
                            </ul>
                            <p>
                                The whole pipeline re-runs daily via <Term term="github-actions" />; the IC drift report
                                recalculates monthly. Paper ledgers persist append-only with transaction costs in bps.
                            </p>
                        </Section>
                        </>)}
                        {lang === 'ko' && <KoreanHelpBody />}
                        {lang === 'zh' && <ChineseHelpBody />}

                        {/* FAQ */}
                        <Section id="faq" title={lang === 'ko' ? '자주 묻는 질문' : lang === 'zh' ? '常見問題' : 'Frequently asked questions'} icon={<HelpCircle className="h-5 w-5" />}>
                            <div className="space-y-4">
                                {FAQ_ITEMS.map((item, i) => (
                                    <div key={i}>
                                        <p className="font-black">{item.q[lang]}</p>
                                        <p className="mt-1">{item.a[lang]}</p>
                                    </div>
                                ))}
                            </div>
                        </Section>

                        {/* Glossary */}
                        <Section id="glossary" title={lang === 'ko' ? '용어 사전 — 이 핸드북의 모든 용어' : lang === 'zh' ? '詞彙表 — 本手冊的所有詞彙' : 'The glossary — every term in this handbook'} icon={<BookMarked className="h-5 w-5" />}>
                            <p>
                                {lang === 'ko' && `정의된 ${Object.keys(GLOSSARY).length}개 용어의 검색 가능한 색인입니다. 용어 칩을 클릭하면 정의가 열립니다. 위 본문에서도 아무 용어나 클릭할 수 있습니다.`}
                                {lang === 'zh' && `共 ${Object.keys(GLOSSARY).length} 個已定義詞彙的可搜尋索引。點擊任何詞彙標籤即可開啟定義——或點擊上方任何章節中的詞彙。`}
                                {lang === 'en' && `A searchable index of all ${Object.keys(GLOSSARY).length} defined terms. Click any term chip to open its definition — or click a term inline in any section above.`}
                            </p>
                            <div className="relative mt-2 sm:hidden">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
                                <input
                                    value={glossaryQuery}
                                    onChange={e => setGlossaryQuery(e.target.value)}
                                    placeholder={UI.searchPlaceholder[lang]}
                                    className="w-full rounded-md border border-border bg-secondary/20 py-2 pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-emerald-400/50 focus:outline-none"
                                />
                            </div>
                            {glossaryQuery && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                    {lang === 'ko' && (
                                        entries.length === 0
                                            ? `“${glossaryQuery}”에 대한 결과가 없습니다. — 다른 단어를 검색해 보세요.`
                                            : `“${glossaryQuery}”에 대한 결과 ${entries.length}개`
                                    )}
                                    {lang === 'zh' && (
                                        entries.length === 0
                                            ? `「${glossaryQuery}」沒有結果——請換個詞試試。`
                                            : `「${glossaryQuery}」共有 ${entries.length} 個結果`
                                    )}
                                    {lang === 'en' && (
                                        <>
                                            {entries.length} result{entries.length === 1 ? '' : 's'} for &ldquo;{glossaryQuery}&rdquo;
                                            {entries.length === 0 && ' — try another word.'}
                                        </>
                                    )}
                                </p>
                            )}
                            <div className="mt-3 space-y-4">
                                {CATEGORY_ORDER.map(cat => {
                                    const items = entries.filter(([, t]) => t.category === cat);
                                    if (items.length === 0) return null;
                                    const catLabel = lang === 'ko' ? CATEGORY_LABELS_KO : lang === 'zh' ? CATEGORY_LABELS_ZH : CATEGORY_LABELS;
                                    return (
                                        <div key={cat}>
                                            <div className="flex items-center gap-2">
                                                <span className={`rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${CATEGORY_STYLES[cat]}`}>
                                                    {catLabel[cat]}
                                                </span>
                                                <span className="text-[10px] font-bold text-muted-foreground/60">
                                                    {lang === 'ko' ? `${counts[cat]}개 용어` : lang === 'zh' ? `${counts[cat]} 個詞彙` : `${counts[cat]} term${counts[cat] === 1 ? '' : 's'}`}
                                                </span>
                                            </div>
                                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                {items.map(([key, t]) => (
                                                    <Term key={key} term={key} label={lang === 'ko' ? (GLOSSARY_KO[key]?.term ?? t.term) : lang === 'zh' ? (GLOSSARY_ZH[key]?.term ?? t.term) : t.term} />
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Section>

                        {/* Disclaimer */}
                        <Section id="disclaimer" title={lang === 'ko' ? '면책 조항' : lang === 'zh' ? '免責聲明' : 'Disclaimer'} icon={<BookOpen className="h-5 w-5" />}>
                            {lang === 'ko' && (
                                <p>
                                    이 사이트는 리서치 도구입니다. <b>재정적 조언</b>도, <b>거래 봇</b>도, <b>수정 구슬</b>도
                                    아닙니다. 팩터는 매달 모든 종목이 아니라 수년에 걸쳐 평균적으로 작동합니다. 시스템 자신의
                                    트랙 레코드는 설계상 정직하고 종종 겸손합니다. 과거 성과 — 페이퍼트레이딩 성과를 포함해 — 는
                                    미래 결과를 보장하지 않습니다. 직접 리서치하세요.
                                </p>
                            )}
                            {lang === 'zh' && (
                                <p>
                                    這個網站是研究工具。<b>不是</b>投資建議，<b>不是</b>交易機器人，也<b>不是</b>水晶球。因子是
                                    以數年為尺度平均運作，而非每個月對每檔股票都有效。系統自身的績效紀錄是設計上誠實、且常令人
                                    謙卑的。過往表現——包括紙上交易表現——不保證未來結果。請自行研究。
                                </p>
                            )}
                            {lang === 'en' && (
                                <p>
                                    This site is a research tool. It is <b>not</b> financial advice, <b>not</b> a trading bot, and{' '}
                                    <b>not</b> a crystal ball. Factors work on average over years, not on every stock every month.
                                    The system&apos;s own track record is honest and often humbling by design. Past performance —
                                    including paper-traded performance — does not guarantee future results. Do your own research.
                                </p>
                            )}
                            <p className="pt-2 text-xs text-muted-foreground">
                                <Link href="/" className="inline-flex items-center gap-1 font-bold text-emerald-300 hover:underline">
                                    <ArrowUpRight className="h-3 w-3" /> {UI.backToCockpit[lang]}
                                </Link>
                            </p>
                        </Section>
                    </main>
                </div>

                {/* Mobile contents drawer — slides in from the LEFT */}
                {mobileNavOpen && (
                    <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true">
                        <div className="absolute inset-0 bg-black/60" onClick={() => setMobileNavOpen(false)} />
                        <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-background shadow-2xl">
                            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
                                    {contentsLabel}
                                </p>
                                <button onClick={() => setMobileNavOpen(false)} aria-label="Close contents" className="rounded-md border border-border/60 p-1.5 text-muted-foreground hover:text-foreground">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4">
                                <SidebarNav activeId={activeId} lang={lang} />
                            </div>
                            <div className="border-t border-border/60 p-3 text-[10px] leading-relaxed text-muted-foreground/70">
                                {UI.howToUseBody[lang]}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </GlossaryProvider>
    );
}
