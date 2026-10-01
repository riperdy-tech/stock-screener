'use client';

// ─────────────────────────────────────────────────────────────────────────────
// /help — the Stockpeak handbook
//
// A dedicated guide that explains what this site does: how the daily pipeline
// works, how the screen and the AI analyst reach a verdict, what every label
// means, and what the system is deliberately NOT doing.
//
// Every financial/technical word rendered with <Term> is a hyperlink: click it
// and a mini-popup explains that term. See components/GlossaryTerm.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, type ReactNode, useRef } from 'react';
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
import { PipelineDiagram } from './WorkflowDiagram';

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
        id: 'engine', en: 'The system', ko: '시스템', zh: '系統',
        items: [
            { id: 'desk', en: 'Reading the desk', ko: '데스크 읽는 법', zh: '如何閱讀研究台' },
            { id: 'screen', en: 'The quant screen', ko: '퀀트 스크린', zh: '量化篩選' },
            { id: 'bands', en: 'Bands, vetoes & warnings', ko: '등급, 베토, 경고', zh: '等級、否決與警告' },
            { id: 'analyst', en: 'The AI analyst', ko: 'AI 애널리스트', zh: 'AI 分析師' },
            { id: 'gate', en: 'The gate', ko: '게이트', zh: '閘門' },
            { id: 'relaunch', en: 'What changes at relaunch', ko: '재가동 때 달라지는 것', zh: '重新上線後的變化' },
            { id: 'macro', en: 'The macro engine', ko: '매크로 엔진', zh: '總體引擎' },
        ],
    },
    {
        id: 'using', en: 'Using the tool', ko: '도구 사용법', zh: '使用工具',
        items: [
            { id: 'track', en: 'Track Record', ko: '트랙 레코드', zh: '績效紀錄' },
            { id: 'portfolio', en: 'My Portfolio', ko: '내 포트폴리오', zh: '我的投資組合' },
            { id: 'lenses', en: 'Legacy lenses', ko: '레거시 렌즈', zh: '舊版鏡頭' },
        ],
    },
    {
        id: 'deep', en: 'Deep dive', ko: '심화', zh: '深入',
        items: [
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
    backToCockpit: { en: 'Back to the Stockpeak desk', ko: '스톡피크 데스크로 돌아가기', zh: '返回 Stockpeak 研究台' },
} as const;

type L3 = { en: string; ko: string; zh: string };
type FAQItem = { q: L3; a: { en: ReactNode; ko: ReactNode; zh: ReactNode } };

const FAQ_ITEMS: FAQItem[] = [
    {
        q: { en: 'Is this financial advice?', ko: '이것은 재정적 조언인가요?', zh: '這是投資建議嗎？' },
        a: {
            en: 'No. It is a research shortlist with the evidence laid out. Nothing here buys or sells anything, and nothing here is financial advice.',
            ko: '아닙니다. 근거를 펼쳐 놓은 리서치 후보 명단입니다. 여기서는 아무것도 사고팔지 않으며, 어떤 것도 재정적 조언이 아닙니다.',
            zh: '不是。這是攤開證據的研究候選名單。這裡不會買賣任何東西，這裡的任何內容也都不是投資建議。',
        },
    },
    {
        q: { en: 'Does the site execute trades?', ko: '사이트가 거래를 실행하나요?', zh: '這個網站會執行交易嗎？' },
        a: {
            en: 'Never. The site places no trades. Even the paper books are simulated — but honestly, with real prices and real transaction costs.',
            ko: '절대 하지 않습니다. 이 사이트는 거래를 하지 않습니다. 페이퍼 북조차 시뮬레이션이지만, 정직하게 실제 가격과 실제 거래비용으로 합니다.',
            zh: '絕不會。本站不下任何交易單。即使是紙上帳本也是模擬——但誠實地以真實價格與真實交易成本進行。',
        },
    },
    {
        q: { en: 'Why does the AI section show no picks?', ko: 'AI 섹션에 추천 종목이 없는 이유는 무엇인가요?', zh: 'AI 區段為什麼沒有選股？' },
        a: {
            en: <>The AI analyst is being rebuilt and tested, so there are no new verdicts yet. The verdicts still on record were made by the old analyst, which was ruled invalid, so they are shown as blocked — not as picks. See <Link href="#analyst" className="font-bold text-pos hover:underline">The AI analyst</Link>.</>,
            ko: <>AI 애널리스트를 재구축하고 테스트하는 중이라 아직 새로운 판단이 없습니다. 기록에 남아 있는 판단은 무효 판정을 받은 옛 애널리스트가 만든 것이어서, 추천 종목이 아니라 막힘으로 표시됩니다. <Link href="#analyst" className="font-bold text-pos hover:underline">AI 애널리스트</Link>를 참조하세요.</>,
            zh: <>AI 分析師正在重建與測試，所以目前還沒有新的判決。紀錄中仍保留的判決是由已被裁定無效的舊分析師做出的，因此顯示為被擋下——而不是選股。請見<Link href="#analyst" className="font-bold text-pos hover:underline">AI 分析師</Link>。</>,
        },
    },
    {
        q: { en: 'Why are verdicts marked blocked?', ko: '판단이 막힘으로 표시되는 이유는 무엇인가요?', zh: '為什麼有些判決被標為被擋下？' },
        a: {
            en: <>A verdict counts only if it passes the gate. Each blocked verdict carries its reasons in plain words, for example &ldquo;made by the old analyst&rdquo; or &ldquo;runs disagree too much&rdquo;. A blocked verdict stays visible as a record. See <Link href="#gate" className="font-bold text-pos hover:underline">The gate</Link>.</>,
            ko: <>판단은 게이트를 통과해야만 유효합니다. 막힌 판단에는 각각 쉬운 말로 된 이유가 붙습니다. 예를 들어 &ldquo;옛 애널리스트가 만듦&rdquo;이나 &ldquo;실행 간 격차가 너무 큼&rdquo;입니다. 막힌 판단은 기록으로 계속 보입니다. <Link href="#gate" className="font-bold text-pos hover:underline">게이트</Link>를 참조하세요.</>,
            zh: <>判決必須通過閘門才算數。每個被擋下的判決都附有白話寫出的原因，例如&ldquo;由舊分析師做出&rdquo;或&ldquo;各次執行分歧太大&rdquo;。被擋下的判決仍會作為紀錄保持可見。請見<Link href="#gate" className="font-bold text-pos hover:underline">閘門</Link>。</>,
        },
    },
    {
        q: { en: 'Why are some sectors not tilted?', ko: '일부 섹터에 틸트가 없는 이유는 무엇인가요?', zh: '為什麼有些類股沒有被傾斜？' },
        a: {
            en: <>The macro engine could give extra shortlist places to sectors that suit the economy, but its sector picking has not proved itself. So the tilt is off, and every sector gets the same <Term term="sector-quota" />, until the engine earns the right.</>,
            ko: <>매크로 엔진이 경제에 맞는 섹터에 후보 명단 자리를 더 줄 수 있지만, 그 섹터 선택은 아직 검증되지 않았습니다. 그래서 틸트는 꺼져 있고, 엔진이 자격을 증명할 때까지 모든 섹터가 같은 <Term term="sector-quota" />을 받습니다.</>,
            zh: <>總體引擎可以把更多候選名單名額給適合當前經濟的類股，但它的選類股能力尚未證明自己。所以傾斜被關閉，每個類股都得到相同的<Term term="sector-quota" />，直到引擎證明自己為止。</>,
        },
    },
    {
        q: { en: 'Why does a stock stay on the shortlist after its rank slips?', ko: '순위가 밀린 뒤에도 종목이 후보 명단에 남는 이유는 무엇인가요?', zh: '為什麼股票排名下滑後仍留在候選名單上？' },
        a: {
            en: <>That is <Term term="hysteresis" />. A name already on the shortlist stays until it falls clearly out — rank 60 for Research now, rank 150 for the watchlist — so stocks on the cut line do not flicker in and out.</>,
            ko: <>그것이 <Term term="hysteresis" />입니다. 이미 후보 명단에 있는 종목은 뚜렷하게 밀려날 때까지 남습니다. 지금은 Research Now는 60위, 워치리스트는 150위입니다. 그래서 컷 경계에 있는 종목이 들락날락하지 않습니다.</>,
            zh: <>這就是<Term term="hysteresis" />。已在候選名單上的名稱，要明顯掉出才會被移除——Research now 現在是第 60 名，觀察清單是第 150 名——所以卡在切線上的股票不會進進出出。</>,
        },
    },
    {
        q: { en: 'What do the red chips mean?', ko: '빨간 칩은 무슨 뜻인가요?', zh: '紅色標籤是什麼意思？' },
        a: {
            en: <>A <Term term="veto" />: a safety filter removed the stock, whatever else looks good about it. The reason is written on the chip.</>,
            ko: <><Term term="veto" />입니다. 다른 점이 아무리 좋아 보여도 안전 필터가 그 종목을 제거했다는 뜻입니다. 이유가 칩에 적혀 있습니다.</>,
            zh: <><Term term="veto" />：不論這檔股票其他方面看起來多好，安全過濾器都把它剔除了。原因寫在標籤上。</>,
        },
    },
    {
        q: { en: 'Why do the quant screen and the AI disagree?', ko: '퀀트 스크린과 AI의 판단이 엇갈리는 이유는 무엇인가요?', zh: '為什麼量化篩選和 AI 會意見不同？' },
        a: {
            en: 'One is pure math over financial statements and prices; the other is a researcher that reads filings with judgment. When they strongly disagree, one of them may be wrong — those are the interesting rows. The AI view shows each stock’s screen rank next to its verdict.',
            ko: '하나는 재무제표와 주가에 대한 순수한 수학이고, 다른 하나는 제출 서류를 판단력으로 읽는 리서처입니다. 둘이 크게 엇갈리면 한쪽이 틀렸을 수 있으며, 그런 행이 흥미로운 행입니다. AI 화면은 각 종목의 판단 옆에 스크린 순위를 함께 보여 줍니다.',
            zh: '一個是對財務報表與價格的純數學；另一個是帶著判斷閱讀申報文件的研究員。兩者強烈分歧時，其中一個可能是錯的——這些就是有趣的列。AI 檢視會在每檔股票的判斷旁顯示它的篩選排名。',
        },
    },
    {
        q: { en: 'How can I trust the track record?', ko: '트랙 레코드를 어떻게 믿을 수 있나요?', zh: '我怎麼能相信績效紀錄？' },
        a: {
            en: <>It is built forward, day by day (<Term term="point-in-time" />), with <Term term="transaction-costs" /> included and benchmarks measured on the same dates. It is still young, and the AI record restarts from zero when the new analyst goes live, so read it as an early scoreboard.</>,
            ko: <>날마다 앞으로 쌓아 갑니다(<Term term="point-in-time" />). <Term term="transaction-costs" />를 포함하고, 벤치마크는 같은 날짜로 측정합니다. 아직 기록이 짧고, 새 애널리스트가 가동되면 AI 기록은 0에서 다시 시작하므로 초기 점수판으로 읽으세요.</>,
            zh: <>它是逐日往前建立的（<Term term="point-in-time" />），包含<Term term="transaction-costs" />，且基準以相同日期衡量。它還很年輕，而且新分析師上線時 AI 紀錄會從零重新開始，所以請把它當作早期的計分板。</>,
        },
    },
];

function SidebarNav({ activeId, lang }: { activeId: string; lang: Lang }) {
    return (
        <nav className="space-y-4">
            {NAV_GROUPS.map(group => (
                <div key={group.id}>
                    <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-ink-3">
                        {group[lang]}
                    </p>
                    <ul className="space-y-0.5 border-l border-rule-14">
                        {group.items.map(item => {
                            const active = activeId === item.id;
                            return (
                                <li key={item.id}>
                                    <a
                                        href={`#${item.id}`}
                                        aria-current={active ? 'true' : undefined}
                                        className={`-ml-px block border-l-2 py-1 pl-3 text-xs font-semibold transition-colors ${
                                            active
                                                ? 'border-pos/40 text-pos'
                                                : 'border-transparent text-ink-2 hover:border-pos/40 hover:text-ink'
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
    // The glossary index sits ~10,000px below the header, so a search box that
    // only filtered it read as broken. Matches now appear directly under the
    // input as you type; the section below stays filtered for browsing.
    const [searchOpen, setSearchOpen] = useState(false);
    const searchBoxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setSearchOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSearchOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, []);
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
            <div className="min-h-screen bg-page text-ink">
                {/* ── Header ─────────────────────────────────────────────── */}
                <header className="sticky top-0 z-30 border-b border-rule-14 bg-page">
                    <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3">
                        <Link href="/" className="flex items-center gap-1.5 border border-rule-14 px-2.5 py-1.5 text-xs font-bold text-ink-2 hover:text-ink">
                            <ArrowLeft className="h-3.5 w-3.5" /> Rankings
                        </Link>
                        <button
                            onClick={() => setMobileNavOpen(true)}
                            aria-label={openContentsLabel}
                            className="flex items-center gap-1.5 border border-rule-14 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-ink-2 hover:text-ink lg:hidden"
                        >
                            <ListTree className="h-3.5 w-3.5" />
                            {contentsLabel}
                        </button>
                        <div className="flex items-center gap-2">
                            <BookOpen className="h-5 w-5 text-accent" />
                            <div>
                                <h1 className="text-base font-extrabold tracking-brand">
                                    STOCKPEAK <span className="text-accent">HANDBOOK</span>
                                </h1>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">
                                    {UI.handbookSubtitle[lang]} · v{APP_VERSION}
                                </p>
                            </div>
                        </div>
                        <div className="ml-auto flex flex-wrap items-center gap-2">
                            <LanguageToggle />
                            <div ref={searchBoxRef} className="relative hidden sm:block">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
                                <input
                                    value={glossaryQuery}
                                    onChange={e => { setGlossaryQuery(e.target.value); setSearchOpen(true); }}
                                    onFocus={() => setSearchOpen(true)}
                                    placeholder={UI.searchPlaceholder[lang]}
                                    aria-label={UI.searchPlaceholder[lang]}
                                    className="w-56 border border-rule-14 bg-white/5 py-1.5 pl-8 pr-2 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                                />
                                {glossaryQuery.trim() !== '' && (
                                    <button
                                        onClick={() => { setGlossaryQuery(''); setSearchOpen(false); }}
                                        aria-label="Clear search"
                                        className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[11px] text-ink-3 hover:text-ink"
                                    >
                                        &#10005;
                                    </button>
                                )}

                                {searchOpen && glossaryQuery.trim() !== '' && (
                                    <div className="absolute right-0 top-full z-40 mt-1 max-h-[60vh] w-80 overflow-y-auto border border-rule-22 bg-page p-2 scroll-dark">
                                        <p className="px-1 pb-1.5 font-mono font-semibold text-[11px] uppercase tracking-[.05em] text-ink-3">
                                            {entries.length === 0
                                                ? (lang === 'ko' ? '\uacb0\uacfc \uc5c6\uc74c' : lang === 'zh' ? '\u6c92\u6709\u7d50\u679c' : 'No matches')
                                                : (lang === 'ko' ? `${entries.length}\uac1c \uacb0\uacfc` : lang === 'zh' ? `${entries.length} \u500b\u7d50\u679c` : `${entries.length} match${entries.length === 1 ? '' : 'es'}`)}
                                        </p>
                                        {entries.slice(0, 10).map(([key, term]) => {
                                            const loc = lang === 'ko' ? GLOSSARY_KO[key] : lang === 'zh' ? GLOSSARY_ZH[key] : undefined;
                                            return (
                                                <div key={key} className="border-t border-rule-10 px-1 py-1.5 first:border-t-0">
                                                    <Term term={key} label={loc?.term ?? term.term} />
                                                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-3">
                                                        {loc?.plain ?? term.plain}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                        {entries.length > 10 && (
                                            <Link
                                                href="#glossary"
                                                onClick={() => setSearchOpen(false)}
                                                className="mt-1 block border-t border-rule-14 px-1 pt-2 font-mono font-semibold text-[11px] uppercase tracking-[.05em] text-accent"
                                            >
                                                {lang === 'ko' ? `\uc804\uccb4 ${entries.length}\uac1c \ubcf4\uae30` : lang === 'zh' ? `\u67e5\u770b\u5168\u90e8 ${entries.length} \u500b` : `See all ${entries.length} in the glossary`} \u2192
                                            </Link>
                                        )}
                                    </div>
                                )}
                            </div>
                            <Link href="#glossary" className="flex items-center gap-1.5 border border-accent/60 px-2.5 py-1.5 text-xs font-bold text-accent hover:bg-accent/[0.12]">
                                <BookMarked className="h-3.5 w-3.5" /> {UI.glossaryBtn[lang]}
                            </Link>
                        </div>
                    </div>
                </header>

                {/* ── Body: sticky TOC + content ─────────────────────────── */}
                <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-6">
                    {/* Left TOC (desktop) */}
                    <nav className="sticky top-20 hidden h-fit w-56 shrink-0 lg:block">
                        <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-ink-3">
                            {UI.onThisPage[lang]}
                        </p>
                        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
                            <SidebarNav activeId={activeId} lang={lang} />
                        </div>
                        <div className="mt-4 border border-rule-10 bg-white/5 p-3 text-[11px] leading-relaxed text-ink-2">
                            <p className="font-extrabold uppercase tracking-wider text-pos">{UI.howToUse[lang]}</p>
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
                                <b>7,000 US-listed stocks</b> and narrows them to a shortlist of about <b>150</b>. A
                                separate AI analyst can then study the shortlisted names in depth and say whether each price
                                looks too low, about right, or too high. This handbook explains how each step works, what
                                every label on the screen means, and what the system is deliberately <i>not</i> doing.
                            </p>
                            <Callout kind="warn">
                                <b>Nothing here buys or sells anything, and nothing here is financial advice.</b> It is a
                                research shortlist with the evidence laid out — a machine for narrowing thousands of stocks
                                down to a few worth <i>your</i> research time. The site places no trades. Even the paper books
                                are simulated, honestly, with real prices and real costs.
                            </Callout>
                            <Callout kind="info">
                                <b>Where things stand today:</b> the AI analyst is being rebuilt and tested. Until the new one
                                passes its tests and goes live, the AI side of the desk shows no new picks. Verdicts from the
                                old analyst are still on record, and they are shown as blocked, not as picks. See{' '}
                                <Link href="#analyst" className="font-bold text-pos hover:underline">The AI analyst</Link>.
                            </Callout>
                            <p>
                                If a word has a <span className="border-b border-dotted border-pos/40 font-semibold text-pos">dotted underline</span>,
                                it is a technical term — click it to see what it means without leaving the page. A complete,
                                searchable index of every term lives in the{' '}
                                <Link href="#glossary" className="font-bold text-pos hover:underline">glossary section</Link>.
                            </p>
                        </Section>

                        {/* Pipeline */}
                        <Section id="pipeline" title="What happens every day — the pipeline" icon={<BookMarked className="h-5 w-5" />}>
                            <p>
                                Behind the page is an ordered chain of jobs that re-runs automatically on a schedule via{' '}
                                <Term term="github-actions" />. The order is enforced and the data is checked at each step, so
                                stale or partial data cannot quietly corrupt the shortlist. In plain words:
                            </p>
                            <ol className="list-decimal space-y-2 pl-5">
                                <li>
                                    <b>Data comes in.</b> Company filings from the SEC, prices and analyst forecasts from
                                    Yahoo Finance, and economic series from <Term term="fred" /> (the Federal Reserve&apos;s
                                    data service).
                                </li>
                                <li>
                                    <b>Safety filters (&ldquo;Tier-1 hygiene&rdquo;).</b> Stocks nobody could sensibly buy are
                                    removed: names that cannot be traded, companies that are tiny (under $300 million) or
                                    priced under $3 a share, thinly traded stocks, shell companies, companies with no usable
                                    filed fundamentals, companies with chronic losses and heavy debt, and smaller companies
                                    with strong signs of accounting manipulation. About 3,000 stocks are left to be scored.
                                </li>
                                <li>
                                    <b>The dual-door screen.</b> Each remaining stock is scored through three{' '}
                                    <Term term="door" />s — compounder, value gap and trend leader — and the best cases go on
                                    the shortlist.
                                </li>
                                <li>
                                    <b>Bands.</b> The shortlist is split into Research now and Watchlist. Everything else is
                                    Pass, or Vetoed if a safety filter removed it.
                                </li>
                                <li>
                                    <b>The AI analyst (when it is running).</b> It studies shortlisted names in depth and gives
                                    each a verdict. It runs on a local computer, not in the cloud.
                                </li>
                                <li>
                                    <b>The gate.</b> A verdict counts only if it passes the gate&apos;s rules. The ones that
                                    fail stay visible, marked as blocked, with the reasons.
                                </li>
                                <li><b>Publish.</b> Verdicts and reports are published to this site.</li>
                                <li>
                                    <b>Paper books.</b> Three simulated portfolios follow the shortlist, the AI verdicts and your
                                    own holdings, every day.
                                </li>
                                <li>
                                    <b>Grading.</b> Each verdict is later checked against what the price actually did.
                                </li>
                            </ol>
                            <PipelineDiagram />
                            <p>
                                Everything is <Term term="point-in-time" />: each logged signal uses only information that
                                existed at that moment. That discipline is what makes the track record trustworthy.
                            </p>
                        </Section>

                        {/* Desk */}
                        <Section id="desk" title="Reading the desk — two views" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                The desk is the main page. At the top is one switch that decides whose view you see:
                            </p>
                            <ul className="list-disc space-y-2 pl-5">
                                <li>
                                    <b>AI</b> — the AI analyst&apos;s verdicts, sorted into the sections below.
                                </li>
                                <li>
                                    <b>Quant</b> — the screen&apos;s own ranking: pure math over financial statements and prices,
                                    with no AI involved.
                                </li>
                            </ul>
                            <SubHeading>Colour key — one meaning per colour</SubHeading>
                            <ul className="space-y-1.5 pl-1">
                                <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: 'oklch(0.77 0.13 240)' }}>●</span><span>Blue — the list: how far a stock has come through the screen (strongest for Research now). Also marks what you have selected.</span></li>
                                <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#a774d6' }}>●</span><span>Violet — Quality: a high-quality business, and the scores behind it.</span></li>
                                <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#149c82' }}>●</span><span>Teal — Value: cheap against the growth it has delivered, and the scores behind it.</span></li>
                                <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#fb9dbb' }}>●</span><span>Pink — Momentum / trend: a strong, steady price trend.</span></li>
                                <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: 'oklch(0.82 0.14 162)' }}>●</span><span>Green — good: undervalued, a gain, a verdict that passes the gate.</span></li>
                                <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#e8e4da' }}>●</span><span>Off-white — fair: the price sits inside the value band.</span></li>
                                <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#db6750' }}>●</span><span>Coral — bad: overvalued, a loss.</span></li>
                                <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#e2b850' }}>●</span><span>Amber — a warning: look closer (forensic warnings, the notice that a verdict is blocked, desk notices).</span></li>
                                <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#8a877f' }}>●</span><span>Grey — does not count: the numbers of a blocked verdict, vetoed stocks, no data.</span></li>
                            </ul>
                            <SubHeading>The sections of the AI lens</SubHeading>
                            <ul className="list-disc space-y-2 pl-5">
                                <li>
                                    <b>Research now</b> — names whose verdict is <i>undervalued</i> and that are not blocked
                                    (see <Link href="#gate" className="font-bold text-pos hover:underline">the gate</Link>).
                                </li>
                                <li>
                                    <b>Watchlist</b> — names whose verdict is <i>fair</i> or <i>overvalued</i> and that are not
                                    blocked.
                                </li>
                                <li>
                                    <b>Blocked by the gate</b> — verdicts on record that fail the rules. They are shown as a
                                    record, with the reasons, and are never shown as picks.
                                </li>
                                <li>
                                    <b>Awaiting</b> — shortlisted names the analyst has not studied yet.
                                </li>
                                <li>
                                    <b>Vetoed</b> — names removed by a safety filter, and rows where the analyst produced no
                                    usable verdict (<Term term="not-usable" />).
                                </li>
                            </ul>
                            <SubHeading>The value band strip</SubHeading>
                            <p>
                                Next to a verdict you will see a thin strip. The <b>shaded band</b> is the range of values from
                                the analyst&apos;s runs, the <b>tick</b> is the median (the middle value), and the{' '}
                                <b>white line</b> is today&apos;s price. If the line sits left of the band, the price is below
                                every run&apos;s value; inside the band, it is within the range; right of it, above every run.
                                That is the whole verdict. See <Term term="iv-band" />.
                            </p>
                        </Section>

                        {/* Screen */}
                        <Section id="screen" title="The quant screen — three doors" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                The screen does not blend everything into one score. A company can deserve attention by being
                                excellent, by being mispriced, or by being in a strong, steady uptrend — and averaging those into
                                one number describes none of them well. So there are three <Term term="door" />s. A stock needs
                                to clear only one.
                            </p>
                            <div className="space-y-3">
                                <div className="border border-rule-10 bg-white/5 p-3">
                                    <p className="text-sm font-extrabold text-pos">Door 1 — Quality (compounder)</p>
                                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-q">
                                        Companies that earn real money, keep growing, are rising in price and are having their
                                        forecasts raised. It blends <Term term="quality" />, <Term term="momentum" /> and{' '}
                                        <Term term="revisions" />, with quality counting most.
                                    </p>
                                </div>
                                <div className="border border-rule-10 bg-white/5 p-3">
                                    <p className="text-sm font-extrabold text-accent">Door 2 — Value (value gap)</p>
                                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-q">
                                        Companies that look cheap against their own demonstrated growth: the price asks for less
                                        growth than the company has actually delivered (the <Term term="expectations-gap" />),
                                        and the stock is cheap on its <Term term="value" />. A <b>falling-knife floor</b> keeps
                                        out names in steep decline, because cheap and still falling is not a bargain yet.
                                    </p>
                                </div>
                                <div className="border border-rule-10 bg-white/5 p-3">
                                    <p className="text-sm font-extrabold text-warn">Door 3 — Trend (trend leaders)</p>
                                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink-q">
                                        Strong, steady uptrends that the other two doors would miss — for example a sector-wide
                                        boom. Up to 20 extra places, with at most 5 per industry group. A candidate must be
                                        profitable and reasonably large, must not have falling analyst forecasts, and must have
                                        climbed steadily rather than in one lucky month.
                                    </p>
                                </div>
                            </div>
                            <SubHeading>How the doors compete</SubHeading>
                            <p>
                                Each of the first two doors turns its score into a <Term term="percentile" />, and the better of
                                the two is what a stock competes on. A <Term term="champion" /> — a stock in the top 10% on both
                                doors — gets a small bonus of +2, because being excellent and cheap at once is rare. A falling
                                knife cannot be a champion.
                            </p>
                            <SubHeading>Staying power</SubHeading>
                            <p>
                                A name already on the shortlist stays until it falls clearly out. This is called{' '}
                                <Term term="hysteresis" />: it stays in Research now while its rank is 60 or better, and on the
                                shortlist while its rank is 150 or better. Without that buffer, stocks sitting on the cut line
                                would hop in and out with every small price move.
                            </p>
                            <SubHeading>Fair comparisons</SubHeading>
                            <ul className="list-disc space-y-2 pl-5">
                                <li>
                                    Most grades are <Term term="sector-neutral" /> — a bank competes with banks, not with
                                    software companies.
                                </li>
                                <li>
                                    <Term term="momentum" /> is the exception, in a useful way: it is also read across the whole
                                    market, so a boom that lifts an entire sector stays visible instead of looking ordinary.
                                </li>
                                <li>
                                    For cyclical businesses — oil, gas, mining, shipping and similar — whose cash flow swings with
                                    the cycle, the screen averages cash flow over several years (<b>8 years</b> for oil, gas and
                                    mining; <b>3 years</b> for other cyclicals) instead of using one good or bad year.
                                </li>
                            </ul>
                            <SubHeading>Sector tilt is off</SubHeading>
                            <p>
                                Every sector gets the same base <Term term="sector-quota" /> of shortlist places. The macro engine
                                could give extra places to sectors that suit the economy, but its sector picking has not proved
                                itself, so the tilt is switched off until it does.
                            </p>
                        </Section>

                        {/* Bands */}
                        <Section id="bands" title="Bands, vetoes & warnings" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                The result of the screen is four <Term term="band" />s:
                            </p>
                            <ul className="list-disc space-y-2 pl-5">
                                <li><span className="font-extrabold text-pos">RESEARCH NOW</span> — the top of the shortlist, roughly the first 50 to 60 names. Worth your research time today.</li>
                                <li><span className="font-extrabold text-accent">WATCHLIST</span> — the rest of the shortlist, which holds about 150 names in all.</li>
                                <li><span className="text-ink-2">PASS</span> — scored, but not shortlisted.</li>
                                <li><span className="font-extrabold text-neg">VETOED</span> — removed by a safety filter. No band, and the reason is written on the red chip.</li>
                            </ul>
                            <SubHeading>What removes a stock</SubHeading>
                            <p>
                                A <Term term="veto" /> is a hard disqualifier, applied before the doors score anything. The
                                reasons are: the stock cannot be traded, it is too small or too thinly traded, it has no
                                usable filed fundamentals, it is a shell company, it has chronic operating losses together
                                with heavy debt, or it shows two <Term term="forensic" /> red flags at once. The last two apply
                                only to companies worth under $10 billion.
                            </p>
                            <SubHeading>What only warns</SubHeading>
                            <p>
                                On large companies the forensic tests are <b>warnings</b>: <Term term="beneish" /> (likely
                                earnings manipulation), <Term term="accruals" /> (profits not backed by cash), Altman Z (a
                                distress score) and heavy <Term term="dilution" /> from issuing shares. A warning never removes a
                                stock worth $10 billion or more. On smaller companies a stock is removed only when two red
                                flags agree. This keeps fast-growing leaders from being thrown out for looking unusual, while
                                still showing you the warning so you can look closer.
                            </p>
                            <SubHeading>Notes are not warnings</SubHeading>
                            <p>
                                Data notes — for example that a stock&apos;s momentum was worked out from monthly prices, or
                                that its latest annual report is old — describe how a number was built. They say nothing bad
                                about the company and never remove a stock.
                            </p>
                            <Callout kind="tip">
                                The principle is <i>annotate, never silently gate</i>: wherever possible a concern is shown as a
                                flag with its reason, so you can see it, instead of quietly deleting the stock.
                            </Callout>
                        </Section>

                        {/* Analyst */}
                        <Section id="analyst" title="The AI analyst — how a verdict is made" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                A shortlisted name can be studied in depth by an AI analyst — like getting a careful second
                                opinion. The work is divided so that each part does what it is good at:
                            </p>
                            <ul className="list-disc space-y-2 pl-5">
                                <li>
                                    <b>The AI does the research</b> and chooses every valuation input. It runs on a local model
                                    (<Term term="llm" />), not a cloud service.
                                </li>
                                <li>
                                    <b>Python does every calculation.</b> An AI is a good analyst but an unreliable calculator,
                                    so no number is left to its arithmetic.
                                </li>
                                <li>
                                    <b>Code checks the answer</b> against outside anchors: the professional analysts&apos;
                                    forecasts and their price-target range (the <Term term="street-fence" />).
                                </li>
                            </ul>
                            <p>
                                Each stock gets 2 or 3 independent runs, and each run ends in an estimate of what the business
                                is worth. The <b>verdict</b> is where today&apos;s price sits against the band of those values:
                                below it means <b>undervalued</b>, inside it means <b>fair</b>, above it means{' '}
                                <b>overvalued</b>. A wider band means the runs disagreed, and that lowers the suggested size.
                                See <Term term="iv-band" />.
                            </p>
                            <Callout kind="warn">
                                <b>Current state:</b> the analyst is being rebuilt and tested. There are no new verdicts until
                                it passes its tests and goes live. Every verdict on record today was made by the old analyst.
                            </Callout>
                        </Section>

                        {/* Gate */}
                        <Section id="gate" title="The gate — which verdicts count" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                A verdict counts only if it passes the gate. Every verdict is marked{' '}
                                <Term term="actionable" /> (yes or no), and when the answer is no, the desk gives the{' '}
                                <Term term="gate-reason" />s in plain words:
                            </p>
                            <ul className="list-disc space-y-2 pl-5">
                                <li><b>Made by the old analyst</b> — it was produced before the current rules, by an analyst that was ruled invalid.</li>
                                <li><b>Runs disagree too much</b> — the runs&apos; values are spread too widely to trust.</li>
                                <li><b>Only one usable run</b> — a single run cannot show how much the analyst agrees with itself.</li>
                                <li><b>Outside the analysts&apos; price-target range</b> — the value falls outside the street fence.</li>
                                <li><b>Implausibly far above the price</b> — the value is so much higher than the price that it is treated as suspect.</li>
                                <li><b>No analyst price-target range</b> — there is no fence to check the answer against.</li>
                                <li><b>Analyst data could not be fetched</b> — the lookup failed, so the check could not be made.</li>
                                <li><b>Mine / oil &amp; gas producer not yet supported</b> — the analyst cannot yet value these properly, so they are blocked from being a buy.</li>
                                <li><b>Calculator not used</b> — the analyst never used the valuation calculator for its answer.</li>
                                <li><b>Test run</b> — the row came from a test, not a production run.</li>
                            </ul>
                            <p>
                                A few other technical reasons exist; the desk spells out each one in words. A verdict can have
                                more than one reason.
                            </p>
                            <Callout kind="info">
                                A blocked verdict is not deleted. It stays visible under <i>Blocked by the gate</i> as a record
                                of what was said and why it does not count — it is never shown as a pick.
                            </Callout>
                        </Section>

                        {/* Relaunch */}
                        <Section id="relaunch" title="What changes when the new analyst goes live" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                These four things arrive with the relaunch. They are not live today.
                            </p>
                            <ul className="list-disc space-y-2 pl-5">
                                <li>
                                    <b>Entry timing.</b> Each verdict says whether it is a &ldquo;buy now&rdquo; or &ldquo;wait for
                                    momentum&rdquo;, with a stated condition that would flip the call.
                                </li>
                                <li>
                                    <b>Value basis vs momentum basis.</b> A strong, fundamentally backed uptrend can be held at
                                    half or quarter size even when the analyst&apos;s value is below the price. See{' '}
                                    <Term term="position-basis" />.
                                </li>
                                <li>
                                    <b>Thesis monitor.</b> Each verdict states its own invalidation rules. They are re-checked
                                    against current data, and a broken thesis is flagged. See{' '}
                                    <Term term="thesis-status" />.
                                </li>
                                <li>
                                    <b>Caution for uncovered stocks.</b> A stock that no professional analyst covers gets a
                                    smaller suggested size and a stricter margin of safety, instead of being treated like a
                                    covered one.
                                </li>
                            </ul>
                        </Section>

                        {/* Macro */}
                        <Section id="macro" title="The macro engine — the economic backdrop" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                A separate engine reads the state of the US economy and publishes three things:
                            </p>
                            <ul className="list-disc space-y-2 pl-5">
                                <li>
                                    <b>A probability for each economic season.</b> These probabilities are the main output (see{' '}
                                    <Term term="probability-vector" />). The single season label is only a summary and drives no
                                    number.
                                </li>
                                <li>
                                    <b>Shock alarms</b> for fear, credit, interest rates, oil, the dollar, jobs and inflation (see{' '}
                                    <Term term="shock-register" />).
                                </li>
                                <li>
                                    <b>A turbulence-risk flag</b>, which turns on when the fear index is 30 or higher.
                                </li>
                            </ul>
                            <p>
                                Its numbers come only from <Term term="fred" />. News is used as context for the story, never as
                                a number. Its sector picking has not proved itself, so the screen does not use it.
                            </p>
                        </Section>

                        {/* Track */}
                        <Section id="track" title="Track Record — the honest meter" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                Instead of showing a flattering <Term term="backtest" />, the system{' '}
                                <Term term="paper-trading" />s every day with real prices and real{' '}
                                <Term term="transaction-costs" />. If the system is wrong, this page will say so.
                            </p>
                            <SubHeading>The three books</SubHeading>
                            <ul className="list-disc space-y-2 pl-5">
                                <li>
                                    <b className="text-accent">Equal-weight</b> — holds every Research now name in equal parts.
                                    It is the pure stock-picking test, with no AI and no sizing.
                                </li>
                                <li>
                                    <b className="text-pos">AI book</b> — follows the analyst&apos;s verdicts that pass the gate
                                    (<Term term="rn-depth" />). Its history so far comes from the <b>old</b> analyst, which was
                                    ruled invalid. It has held only cash since 2026-09-24 because no verdict passes. When the new
                                    analyst goes live, the AI record restarts from zero and the old history is archived.
                                </li>
                                <li>
                                    <b className="text-ink-2">Mine</b> — your own saved holdings, tracked like a fund (
                                    <Term term="unitization" />) so that adding money never fakes performance.
                                </li>
                            </ul>
                            <SubHeading>Honest rules</SubHeading>
                            <ul className="list-disc space-y-2 pl-5">
                                <li>A trade happens at the <b>first close after the signal</b>, because a signal can only be acted on after it exists.</li>
                                <li>Costs are included on every trade.</li>
                                <li>Benchmarks (<Term term="iwm" /> and <Term term="spy" />) use the same dates as the trades.</li>
                            </ul>
                            <SubHeading>How to read it</SubHeading>
                            <ul className="list-disc space-y-2 pl-5">
                                <li><b>Equal-weight vs IWM</b> — the stock selection works if the picks beat the small-cap <Term term="benchmark" />.</li>
                                <li><b>AI book vs Equal-weight</b> — the AI analyst earns its keep only if its book beats the plain shortlist.</li>
                                <li><b>Mine vs the others</b> — your own deviations show up as the <Term term="behavior-gap" />.</li>
                            </ul>
                            <p>
                                <Term term="sharpe-ratio" /> and <Term term="cagr" /> appear only after enough days of live
                                data; early on this page is deliberately boring.
                            </p>
                        </Section>

                        {/* Portfolio */}
                        <Section id="portfolio" title="My Portfolio — checking your own holdings" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                The Portfolio tab is for your <b>actual</b> holdings. Each one is checked against the screen&apos;s{' '}
                                <Term term="band" /> and against the AI verdict, and the result is shown next to it. A holding
                                whose AI verdict is blocked is shown as blocked — never as a signal. Your holdings also feed the{' '}
                                <b>Mine</b> book on Track Record.
                            </p>
                            <Callout kind="info">
                                There is no suggested plan any more. The site no longer builds an allocation for you — the older
                                Kelly-sized plan books were retired. See <Term term="position-sizing" /> for what size guidance
                                still exists.
                            </Callout>
                        </Section>

                        {/* Legacy lenses */}
                        <Section id="lenses" title="Legacy lenses — older screens kept for reference" icon={<BookOpen className="h-5 w-5" />}>
                            <p>
                                The <b>Lenses</b> button opens the older screens: the 100-bagger screen, Reverse, Paradigm and
                                YouTube. They are kept for reference. They are <b>not</b> the current system, and nothing on the
                                desk is built from them.
                            </p>
                        </Section>

                        {/* Validation */}
                        <Section id="validation" title="How the system is validated" icon={<BookOpen className="h-5 w-5" />}>
                            <p>Three habits keep the system honest:</p>
                            <ul className="list-disc space-y-2 pl-5">
                                <li>
                                    <b>Rules before results.</b> Pass/fail rules are written down before the results are seen,
                                    so they cannot be tuned afterwards to look good (that would be{' '}
                                    <Term term="overfitting" />).
                                </li>
                                <li>
                                    <b>Grading verdicts.</b> A grader checks each AI verdict against what the price did over
                                    30, 91, 182 and 365 days, compared with <Term term="iwm" />, <Term term="spy" /> and QQQ. A
                                    horizon is graded only once it has fully elapsed, and the benchmarks use the same dates as
                                    the verdict.
                                </li>
                                <li>
                                    <b>Paper books.</b> The{' '}
                                    <Link href="#track" className="font-bold text-pos hover:underline">Track Record</Link> books
                                    trade daily with real prices and costs.
                                </li>
                            </ul>
                            <Callout kind="warn">
                                <b>No conclusion yet.</b> Every verdict on record today is from the old analyst, so no
                                conclusion can be drawn from the grading. It will mean something only once valid verdicts from
                                the new analyst exist and their horizons have elapsed.
                            </Callout>
                        </Section>

                        {/* Data */}
                        <Section id="data" title="Where the data comes from" icon={<BookOpen className="h-5 w-5" />}>
                            <ul className="list-disc space-y-2 pl-5">
                                <li><Term term="sec-filings" /> — 10 years of as-filed fundamentals via <Term term="company-facts" /> (the ground truth for quality, forensic warnings and demonstrated growth), kept <Term term="point-in-time" />.</li>
                                <li><Term term="yahoo-finance" /> — prices, analyst <Term term="estimates" />, and coverage.</li>
                                <li><Term term="fred" /> — US economic series behind the macro engine.</li>
                                <li>News — narrative context only. It is never turned into a number.</li>
                            </ul>
                            <p>
                                The scoring chain re-runs on a schedule via <Term term="github-actions" />. The AI analyst runs
                                separately on a local computer.
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
                                        <p className="font-extrabold">{item.q[lang]}</p>
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
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
                                <input
                                    value={glossaryQuery}
                                    onChange={e => setGlossaryQuery(e.target.value)}
                                    placeholder={UI.searchPlaceholder[lang]}
                                    className="w-full border border-rule-14 bg-white/5 py-2 pl-8 pr-2 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                                />
                            </div>
                            {glossaryQuery && (
                                <p className="mt-2 text-xs text-ink-2">
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
                                                <span className={` border px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider ${CATEGORY_STYLES[cat]}`}>
                                                    {catLabel[cat]}
                                                </span>
                                                <span className="text-[11px] font-bold text-ink-3">
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
                                    아닙니다. 스크린은 수년에 걸쳐 평균적으로 작동하지, 매달 모든 종목에 작동하는 것이 아니며,
                                    AI 애널리스트는 아직 재구축 중입니다. 시스템 자신의 트랙 레코드는 설계상 정직하고 종종
                                    겸손해지게 만듭니다. 과거 성과 — 페이퍼트레이딩 성과를 포함해 — 는 미래 결과를 보장하지
                                    않습니다. 직접 리서치하세요.
                                </p>
                            )}
                            {lang === 'zh' && (
                                <p>
                                    這個網站是研究工具。它<b>不是</b>投資建議，<b>不是</b>交易機器人，也<b>不是</b>水晶球。篩選是以
                                    數年為尺度平均運作，而不是每個月對每檔股票都有效，而且 AI 分析師仍在重建中。系統自身的績效紀錄
                                    是設計上誠實、且常令人謙卑的。過往表現——包括紙上交易表現——不保證未來結果。請自行研究。
                                </p>
                            )}
                            {lang === 'en' && (
                                <p>
                                    This site is a research tool. It is <b>not</b> financial advice, <b>not</b> a trading bot, and{' '}
                                    <b>not</b> a crystal ball. The screen works on average over years, not on every stock every month,
                                    and the AI analyst is still being rebuilt. The system&apos;s own track record is honest and often
                                    humbling by design. Past performance — including paper-traded performance — does not guarantee
                                    future results. Do your own research.
                                </p>
                            )}
                            <p className="pt-2 text-xs text-ink-2">
                                <Link href="/" className="inline-flex items-center gap-1 font-bold text-pos hover:underline">
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
                        <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-rule-14 bg-page">
                            <div className="flex items-center justify-between border-b border-rule-10 px-4 py-3">
                                <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink-3">
                                    {contentsLabel}
                                </p>
                                <button onClick={() => setMobileNavOpen(false)} aria-label="Close contents" className="border border-rule-10 p-1.5 text-ink-2 hover:text-ink">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4">
                                <SidebarNav activeId={activeId} lang={lang} />
                            </div>
                            <div className="border-t border-rule-10 p-3 text-[11px] leading-relaxed text-ink-3">
                                {UI.howToUseBody[lang]}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </GlossaryProvider>
    );
}
