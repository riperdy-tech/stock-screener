'use client';

// ─────────────────────────────────────────────────────────────────────────────
// /help — the Stockpeak handbook ("How it works")
//
// Explains the whole chain (macro → screener → analyst → gate → follow-up → grading), what every
// label on the desk means, and what the system has and has not proven. Rendered inside the desk
// Shell so it carries the v3 light theme. Every financial or technical word rendered with <Term>
// is a link: click it and a mini-popup explains that term (components/GlossaryTerm.tsx).
//
// The body of each language lives in content-en / content-ko / content-zh (same sections, same
// ids). The nav, the six-step band, the FAQ, the glossary index and the disclaimer are here.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    GlossaryProvider, Term, GLOSSARY, CATEGORY_ORDER, CATEGORY_LABELS, CATEGORY_STYLES,
} from '@/components/GlossaryTerm';
import type { TermDef } from '@/lib/glossary';
import { useLanguage } from '@/components/LanguageContext';
import { Shell } from '@/components/desk/Shell';
import { CATEGORY_LABELS_KO, GLOSSARY_KO } from '@/lib/glossary-ko';
import { CATEGORY_LABELS_ZH, GLOSSARY_ZH } from '@/lib/glossary-zh';
import { A, Section } from './help-ui';
import { EnglishHelpBody } from './content-en';
import { KoreanHelpBody } from './content-ko';
import { ChineseHelpBody } from './content-zh';

type Lang = 'en' | 'ko' | 'zh';
type L3 = { en: string; ko: string; zh: string };

// ── Left navigation, grouped ─────────────────────────────────────────────────
type NavItem = { id: string } & L3;
interface NavGroup extends L3 { id: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
    {
        id: 'start', en: 'Start here', ko: '시작하기', zh: '開始',
        items: [
            { id: 'welcome', en: 'Welcome', ko: '소개', zh: '歡迎' },
            { id: 'pipeline', en: 'The chain, every day', ko: '매일의 체인', zh: '每天的流程' },
            { id: 'desk', en: 'Reading the desk', ko: '데스크 읽는 법', zh: '如何閱讀研究台' },
        ],
    },
    {
        id: 'chain', en: 'The system', ko: '시스템', zh: '系統',
        items: [
            { id: 'macro', en: 'The macro engine', ko: '매크로 엔진', zh: '總體引擎' },
            { id: 'screen', en: 'The quant screen', ko: '퀀트 스크린', zh: '量化篩選' },
            { id: 'bands', en: 'Bands, vetoes & warnings', ko: '등급, 베토, 경고', zh: '等級、否決與警告' },
            { id: 'analyst', en: 'The AI analyst', ko: 'AI 애널리스트', zh: 'AI 分析師' },
            { id: 'crux', en: 'The crux', ko: '핵심 쟁점', zh: '關鍵分歧' },
            { id: 'gate', en: 'The gate', ko: '게이트', zh: '閘門' },
            { id: 'followup', en: 'The daily follow-up', ko: '일일 후속 점검', zh: '每日跟進' },
            { id: 'relaunch', en: 'What changes at go-live', ko: '가동 때 달라지는 것', zh: '上線後的變化' },
        ],
    },
    {
        id: 'using', en: 'Using the tool', ko: '도구 사용법', zh: '使用工具',
        items: [
            { id: 'track', en: 'Track record', ko: '트랙 레코드', zh: '績效紀錄' },
            { id: 'portfolio', en: 'My portfolio', ko: '내 포트폴리오', zh: '我的投資組合' },
            { id: 'lenses', en: 'The archive', ko: '보관소', zh: '封存區' },
        ],
    },
    {
        id: 'deep', en: 'Deep dive', ko: '심화', zh: '深入',
        items: [
            { id: 'validation', en: 'How it is validated', ko: '시스템 검증', zh: '如何驗證' },
            { id: 'data', en: 'Data and system health', ko: '데이터와 시스템 상태', zh: '資料與系統狀態' },
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

// ── The six-step band under the title (handoff README 5.7) ───────────────────
const STEPS: { id: string; name: L3; sub: L3 }[] = [
    { id: 'macro', name: { en: 'Macro', ko: '매크로', zh: '總體' }, sub: { en: 'the weather', ko: '경제 날씨', zh: '經濟天氣' } },
    { id: 'screen', name: { en: 'Screener', ko: '스크리너', zh: '篩選器' }, sub: { en: 'narrows the market to a list', ko: '시장을 후보 명단으로 좁힘', zh: '把市場縮小成名單' } },
    { id: 'analyst', name: { en: 'Analyst', ko: '애널리스트', zh: '分析師' }, sub: { en: 'values each name', ko: '종목마다 가치를 평가', zh: '為每檔股票估值' } },
    { id: 'gate', name: { en: 'Gate', ko: '게이트', zh: '閘門' }, sub: { en: 'checks every verdict', ko: '모든 판정을 점검', zh: '檢查每個判定' } },
    { id: 'followup', name: { en: 'Follow-up', ko: '후속 점검', zh: '跟進' }, sub: { en: 'watches daily · not live yet', ko: '매일 감시 · 아직 가동 전', zh: '每日關注 · 尚未上線' } },
    { id: 'track', name: { en: 'Grading', ko: '평가', zh: '評分' }, sub: { en: 'scores every call', ko: '모든 판정을 채점', zh: '為每個判定評分' } },
];

const UI = {
    title: { en: 'How it works', ko: '작동 방식', zh: '運作方式' },
    subtitle: {
        en: 'The whole chain, what each step claims, and what it hasn’t proven.',
        ko: '전체 체인, 각 단계가 주장하는 것, 그리고 아직 입증하지 못한 것.',
        zh: '整條流程、每一步宣稱什麼，以及它尚未證明什麼。',
    },
    searchPlaceholder: { en: 'Search the glossary…', ko: '용어 사전 검색…', zh: '搜尋詞彙表…' },
    onThisPage: { en: 'On this page', ko: '이 페이지 목차', zh: '本頁目錄' },
    contents: { en: 'Contents', ko: '목차', zh: '目錄' },
    openContents: { en: 'Open contents', ko: '목차 열기', zh: '開啟目錄' },
    closeContents: { en: 'Close contents', ko: '목차 닫기', zh: '關閉目錄' },
    howToUse: { en: 'How to use this guide', ko: '이 안내서 사용법', zh: '如何使用本指南' },
    howToUseBody: {
        en: 'Words in blue with a dotted underline are clickable — tap one for a quick definition.',
        ko: '점선 밑줄이 있는 파란 단어는 클릭할 수 있습니다. 누르면 간단한 정의가 나옵니다.',
        zh: '帶點狀底線的藍色字可以點擊——按一下即可看到簡短定義。',
    },
    clearSearch: { en: 'Clear search', ko: '검색 지우기', zh: '清除搜尋' },
    backToDesk: { en: 'Back to the desk', ko: '데스크로 돌아가기', zh: '返回研究台' },
} as const;

type FAQItem = { q: L3; a: { en: ReactNode; ko: ReactNode; zh: ReactNode } };

const FAQ_ITEMS: FAQItem[] = [
    {
        q: { en: 'Is this financial advice?', ko: '이것은 재정적 조언인가요?', zh: '這是投資建議嗎？' },
        a: {
            en: 'No. It is a research system with the evidence laid out. Nothing here buys or sells anything, and nothing here is financial advice.',
            ko: '아닙니다. 근거를 펼쳐 놓은 리서치 시스템입니다. 여기서는 아무것도 사고팔지 않으며, 어떤 것도 재정적 조언이 아닙니다.',
            zh: '不是。這是一套攤開證據的研究系統。這裡不會買賣任何東西，這裡的任何內容也都不是投資建議。',
        },
    },
    {
        q: { en: 'Does the site execute trades?', ko: '사이트가 거래를 실행하나요?', zh: '這個網站會執行交易嗎？' },
        a: {
            en: 'Never. The site places no trades and has no order button. The paper books are simulated — with real prices and assumed transaction costs. A separate real-money mirror exists in the system’s code; it is halted, and this site does not control it.',
            ko: '절대 하지 않습니다. 이 사이트는 거래를 하지 않으며 주문 버튼도 없습니다. 페이퍼 북은 시뮬레이션이지만 실제 가격과 가정한 거래비용을 씁니다. 시스템 코드에는 별도의 실제 자금 미러가 있지만 중지되어 있으며, 이 사이트가 제어하지 않습니다.',
            zh: '絕不會。本站不下任何交易單，也沒有下單按鈕。紙上帳本是模擬的——使用真實價格與假設的交易成本。系統的程式碼中另有一個真實資金的鏡像，目前已停止，本站也無法控制它。',
        },
    },
    {
        q: { en: 'Why is Research now empty?', ko: 'Research now가 비어 있는 이유는 무엇인가요?', zh: 'Research now 為什麼是空的？' },
        a: {
            en: <>Only a verdict that passes <A href="#gate">the gate</A> and says undervalued can sit there. The rebuilt analyst has begun publishing its first verdicts, and none passes the gate yet, so each one is under Blocked by the gate. The names queued for the analyst wait under Awaiting underwriting. See <A href="#relaunch">What changes at go-live</A>.</>,
            ko: <>게이트를 통과하고 저평가라고 말하는 판정만 그곳에 놓일 수 있습니다. 재구축된 애널리스트가 첫 판정을 게시하기 시작했지만 아직 게이트를 통과한 것이 없어서, 모두 게이트에 차단됨 아래에 있습니다. 애널리스트를 기다리는 종목은 심사 대기 아래에 있습니다. <A href="#relaunch">가동 때 달라지는 것</A>을 참조하세요.</>,
            zh: <>只有通過<A href="#gate">閘門</A>且判定為低估的判定才能放在那裡。重建後的分析師已開始發布第一批判定，但還沒有任何一個通過閘門，所以每一個都在「被閘門擋下」之下。排隊等候分析師的股票則在「等待承銷評估」之下。請見<A href="#relaunch">上線後的變化</A>。</>,
        },
    },
    {
        q: { en: 'Why are verdicts marked blocked?', ko: '판정이 차단됨으로 표시되는 이유는 무엇인가요?', zh: '為什麼有些判定被標為被擋下？' },
        a: {
            en: <>A verdict counts only if it passes the gate. Each blocked verdict carries its reasons in plain words, for example &ldquo;only one usable run&rdquo; or &ldquo;runs disagree too much&rdquo;. Blocked does not mean wrong; it means the system will not stand behind it. A blocked verdict stays visible as a record. See <A href="#gate">The gate</A>.</>,
            ko: <>판정은 게이트를 통과해야만 유효합니다. 차단된 판정에는 각각 쉬운 말로 된 이유가 붙습니다. 예를 들어 &ldquo;쓸 만한 실행이 하나뿐&rdquo;이나 &ldquo;실행 간 격차가 너무 큼&rdquo;입니다. 차단됨은 틀렸다는 뜻이 아니라 시스템이 보증하지 않는다는 뜻입니다. 차단된 판정은 기록으로 계속 보입니다. <A href="#gate">게이트</A>를 참조하세요.</>,
            zh: <>判定必須通過閘門才算數。每個被擋下的判定都附有白話寫出的原因，例如&ldquo;只有一次可用的執行&rdquo;或&ldquo;各次執行分歧太大&rdquo;。被擋下不代表錯了，而是代表系統不為它背書。被擋下的判定仍會作為紀錄保持可見。請見<A href="#gate">閘門</A>。</>,
        },
    },
    {
        q: { en: 'What does “No edge today” mean? Is it a sell?', ko: '“오늘은 우위 없음”은 무슨 뜻인가요? 매도인가요?', zh: '「今日無優勢」是什麼意思？是賣出嗎？' },
        a: {
            en: <>No. It means the verdict passed the gate and found no gap: the price sits inside the <Term term="iv-band" />, or the margin is too thin to call. FAIR is a real answer, not a refusal and not a sell signal. An overvalued verdict also sits there, and it means &ldquo;do not buy&rdquo;, not &ldquo;sell&rdquo;. See <Term term="no-edge" />.</>,
            ko: <>아닙니다. 판정이 게이트를 통과했고 격차를 찾지 못했다는 뜻입니다. 주가가 <Term term="iv-band" /> 안에 있거나, 안전마진이 너무 얇아 판단할 수 없습니다. FAIR는 거절도 매도 신호도 아닌 실제 답입니다. 고평가 판정도 그곳에 놓이며, 이는 &ldquo;매도&rdquo;가 아니라 &ldquo;사지 말라&rdquo;는 뜻입니다. <Term term="no-edge" />를 참조하세요.</>,
            zh: <>不是。它表示判定通過了閘門，但看不出差距：價格位於<Term term="iv-band" />之內，或安全邊際太薄無法下判斷。FAIR 是真正的答案，不是拒絕，也不是賣出訊號。高估的判定也放在那裡，意思是「不要買進」，而不是「賣出」。請見<Term term="no-edge" />。</>,
        },
    },
    {
        q: { en: 'Why are some sectors not tilted?', ko: '일부 섹터에 틸트가 없는 이유는 무엇인가요?', zh: '為什麼有些類股沒有被傾斜？' },
        a: {
            en: <>The macro engine could give extra list places to sectors that suit the economy, but its sector picking failed a pre-registered test. So the tilt is off, and every sector gets the same <Term term="sector-quota" />, until the engine earns the right.</>,
            ko: <>매크로 엔진이 경제에 맞는 섹터에 명단 자리를 더 줄 수 있지만, 그 섹터 선택은 사전 등록한 검증을 통과하지 못했습니다. 그래서 틸트는 꺼져 있고, 엔진이 자격을 증명할 때까지 모든 섹터가 같은 <Term term="sector-quota" />을 받습니다.</>,
            zh: <>總體引擎可以把更多名單名額給適合當前經濟的類股，但它的選類股能力沒有通過事先登記的檢驗。所以傾斜被關閉，每個類股都得到相同的<Term term="sector-quota" />，直到引擎證明自己為止。</>,
        },
    },
    {
        q: { en: 'Why does a stock stay on the list after its rank slips?', ko: '순위가 밀린 뒤에도 종목이 명단에 남는 이유는 무엇인가요?', zh: '為什麼股票排名下滑後仍留在名單上？' },
        a: {
            en: <>That is <Term term="hysteresis" />. A name already on the list stays until it falls clearly out — rank 60 for the Research now band, rank 150 for the list as a whole — so stocks on the cut line do not flicker in and out.</>,
            ko: <>그것이 <Term term="hysteresis" />입니다. 이미 명단에 있는 종목은 뚜렷하게 밀려날 때까지 남습니다. Research now 등급은 60위, 명단 전체는 150위입니다. 그래서 컷 경계에 있는 종목이 들락날락하지 않습니다.</>,
            zh: <>這就是<Term term="hysteresis" />。已在名單上的名稱，要明顯掉出才會被移除——Research now 等級是第 60 名，整份名單是第 150 名——所以卡在切線上的股票不會進進出出。</>,
        },
    },
    {
        q: { en: 'What does “vetoed” mean?', ko: '“베토”는 무슨 뜻인가요?', zh: '「被否決」是什麼意思？' },
        a: {
            en: <>A <Term term="veto" />: a safety filter removed the stock, whatever else looks good about it. On the desk it sits under Disqualified with the reason written beside it, and the analyst cannot override it.</>,
            ko: <><Term term="veto" />입니다. 다른 점이 아무리 좋아 보여도 안전 필터가 그 종목을 제거했다는 뜻입니다. 데스크에서는 자격 박탈 아래에 이유와 함께 표시되며, 애널리스트도 이를 뒤집을 수 없습니다.</>,
            zh: <><Term term="veto" />：不論這檔股票其他方面看起來多好，安全過濾器都把它剔除了。在研究台上它位於「取消資格」之下，旁邊寫明原因，分析師也無法推翻它。</>,
        },
    },
    {
        q: { en: 'What if the screen and the analyst disagree?', ko: '스크린과 애널리스트의 판정이 엇갈리면 어떻게 되나요?', zh: '如果篩選和分析師意見不同怎麼辦？' },
        a: {
            en: 'They are two independent opinions. One is pure math over financial statements and prices; the other is a researcher that reads filings with judgement. A row on the desk opens to show both side by side. When they strongly disagree, one of them may be wrong — those are the interesting rows. The one rule the analyst cannot break: a safety veto is never overridden.',
            ko: '둘은 독립된 두 개의 의견입니다. 하나는 재무제표와 주가에 대한 순수한 수학이고, 다른 하나는 공시를 판단력으로 읽는 리서처입니다. 데스크의 행을 열면 둘을 나란히 볼 수 있습니다. 둘이 크게 엇갈리면 한쪽이 틀렸을 수 있으며, 그런 행이 흥미로운 행입니다. 애널리스트가 깰 수 없는 규칙이 하나 있습니다. 안전 베토는 절대 뒤집히지 않습니다.',
            zh: '兩者是兩個獨立的意見。一個是對財務報表與價格的純數學；另一個是帶著判斷閱讀申報文件的研究員。研究台上展開一列就能並排看到兩者。兩者強烈分歧時，其中一個可能是錯的——這些就是有趣的列。分析師有一條不能打破的規則：安全否決絕不會被推翻。',
        },
    },
    {
        q: { en: 'Where are the old analyst’s verdicts?', ko: '옛 애널리스트의 판정은 어디에 있나요?', zh: '舊分析師的判定在哪裡？' },
        a: {
            en: 'The old analyst was ruled invalid. Its verdicts are not shown on the desk; one quiet line counts them. Each one stays on its own stock page under verdict history, labelled as old, so nothing is erased.',
            ko: '옛 애널리스트는 무효 판정을 받았습니다. 그 판정은 데스크에 표시되지 않고, 한 줄로 개수만 알려 줍니다. 각 판정은 해당 종목 페이지의 판정 이력에 옛 것으로 표시된 채 남아 있어서, 아무것도 지워지지 않습니다.',
            zh: '舊分析師已被裁定無效。它的判定不顯示在研究台上，只用一行小字統計數量。每一個仍保留在各自的個股頁面「判定歷史」中，標示為舊的，所以沒有任何東西被抹除。',
        },
    },
    {
        q: { en: 'How can I trust the track record?', ko: '트랙 레코드를 어떻게 믿을 수 있나요?', zh: '我怎麼能相信績效紀錄？' },
        a: {
            en: <>You should not treat it as proof yet. It is built forward, day by day (<Term term="point-in-time" />), with <Term term="transaction-costs" /> included and benchmarks measured on the same dates, but it is a short paper record. The AI record restarts from zero when the rebuilt analyst goes live. Read it as an early scoreboard; see <Term term="not-yet-proven" />.</>,
            ko: <>아직은 증거로 여기지 마세요. 날마다 앞으로 쌓아 가고(<Term term="point-in-time" />), <Term term="transaction-costs" />를 포함하며, 벤치마크는 같은 날짜로 측정하지만, 짧은 페이퍼 기록입니다. 재구축된 애널리스트가 가동되면 AI 기록은 0에서 다시 시작합니다. 초기 점수판으로 읽으세요. <Term term="not-yet-proven" />을 참조하세요.</>,
            zh: <>目前不應把它當作證明。它是逐日往前建立的（<Term term="point-in-time" />），包含<Term term="transaction-costs" />，且基準以相同日期衡量，但它是一份短期的紙上紀錄。重建後的分析師上線時，AI 紀錄會從零重新開始。請把它當作早期的計分板；請見<Term term="not-yet-proven" />。</>,
        },
    },
];

function SidebarNav({ activeId, lang, onNavigate }: { activeId: string; lang: Lang; onNavigate?: () => void }) {
    return (
        <nav aria-label={UI.onThisPage[lang]} className="space-y-4">
            {NAV_GROUPS.map(group => (
                <div key={group.id}>
                    <p className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-[.05em] text-off">
                        {group[lang]}
                    </p>
                    <ul>
                        {group.items.map(item => {
                            const active = activeId === item.id;
                            return (
                                <li key={item.id}>
                                    <a
                                        href={`#${item.id}`}
                                        onClick={onNavigate}
                                        aria-current={active ? 'true' : undefined}
                                        className={`block py-[3px] text-[13px] ${active ? 'font-semibold text-ink' : 'text-ink-2 hover:text-ink'}`}
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

/** The glossary search box with its live results dropdown. */
function SearchBox({ lang, query, setQuery, entries, className }: {
    lang: Lang;
    query: string;
    setQuery: (q: string) => void;
    entries: [string, TermDef][];
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, []);

    const matchCount = lang === 'ko' ? `${entries.length}개 결과` : lang === 'zh' ? `${entries.length} 個結果` : `${entries.length} match${entries.length === 1 ? '' : 'es'}`;
    const none = lang === 'ko' ? '결과 없음' : lang === 'zh' ? '沒有結果' : 'No matches';
    const seeAll = lang === 'ko' ? `전체 ${entries.length}개 보기` : lang === 'zh' ? `查看全部 ${entries.length} 個` : `See all ${entries.length} in the glossary`;

    return (
        <div ref={boxRef} className={`relative ${className ?? ''}`}>
            <input
                value={query}
                onChange={e => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                placeholder={UI.searchPlaceholder[lang]}
                aria-label={UI.searchPlaceholder[lang]}
                className="w-full border border-rule-24 bg-surface py-1.5 pl-2.5 pr-8 font-mono text-[12px] text-ink placeholder:text-off focus:border-ink focus:outline-none"
            />
            {query.trim() !== '' && (
                <button
                    type="button"
                    onClick={() => { setQuery(''); setOpen(false); }}
                    aria-label={UI.clearSearch[lang]}
                    className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[11px] text-off hover:text-ink"
                >
                    ✕
                </button>
            )}
            {open && query.trim() !== '' && (
                <div className="absolute left-0 top-full z-40 mt-1 max-h-[60vh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto border border-rule-22 bg-surface p-2 scroll-dark">
                    <p className="px-1 pb-1.5 font-mono text-[11px] font-semibold uppercase tracking-[.05em] text-off">
                        {entries.length === 0 ? none : matchCount}
                    </p>
                    {entries.slice(0, 10).map(([key, term]) => {
                        const loc = lang === 'ko' ? GLOSSARY_KO[key] : lang === 'zh' ? GLOSSARY_ZH[key] : undefined;
                        return (
                            <div key={key} className="border-t border-rule-10 px-1 py-1.5 first:border-t-0">
                                <Term term={key} label={loc?.term ?? term.term} />
                                <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-ink-2">
                                    {loc?.plain ?? term.plain}
                                </p>
                            </div>
                        );
                    })}
                    {entries.length > 10 && (
                        <a
                            href="#glossary"
                            onClick={() => setOpen(false)}
                            className="mt-1 block border-t border-rule-14 px-1 pt-2 font-mono text-[11px] font-semibold uppercase tracking-[.05em] text-accent hover:text-ink"
                        >
                            {seeAll} →
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}

export default function HelpPage() {
    const { language } = useLanguage();
    const lang: Lang = language === 'zh' ? 'zh' : language === 'ko' ? 'ko' : 'en';
    const [glossaryQuery, setGlossaryQuery] = useState('');
    const [activeId, setActiveId] = useState<string>('welcome');
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    // Scrollspy: highlight the section currently in view in the left nav.
    useEffect(() => {
        const onScroll = () => {
            const offset = 100;
            let current = ALL_NAV_IDS[0];
            for (const id of ALL_NAV_IDS) {
                const el = document.getElementById(id);
                if (el && el.getBoundingClientRect().top <= offset) current = id;
            }
            if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
                current = ALL_NAV_IDS[ALL_NAV_IDS.length - 1];
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
            <Shell tab="help">
                <div className="pb-8 pt-6">
                    <h1 className="text-[22px] font-bold leading-tight tracking-head text-ink sm:text-[24px]">{UI.title[lang]}</h1>
                    <p className="mt-1.5 text-[13.5px] text-ink-2">{UI.subtitle[lang]}</p>

                    {/* The six steps of the chain, one line each; each links to its section. */}
                    <ol className="mt-5 grid grid-cols-2 gap-px border-b border-t border-b-rule-10 border-t-ink bg-rule-14 sm:grid-cols-3 lg:grid-cols-6">
                        {STEPS.map((s, i) => (
                            <li key={s.id} className="bg-surface">
                                <a href={`#${s.id}`} className="block h-full px-3 py-2.5 hover:bg-hover">
                                    <span className="block font-mono text-[11px] text-off">{i + 1}</span>
                                    <span className="block text-[14px] font-semibold text-ink">{s.name[lang]}</span>
                                    <span className="mt-0.5 block text-[12px] text-ink-2">{s.sub[lang]}</span>
                                </a>
                            </li>
                        ))}
                    </ol>

                    {/* Phone and tablet: contents button and search sit above the text. */}
                    <div className="mt-4 flex items-center gap-2 lg:hidden">
                        <button
                            type="button"
                            onClick={() => setMobileNavOpen(true)}
                            aria-label={UI.openContents[lang]}
                            className="shrink-0 border border-rule-24 px-3 py-1.5 text-[12px] text-ink-2 hover:text-ink"
                        >
                            ☰ {UI.contents[lang]}
                        </button>
                        <SearchBox lang={lang} query={glossaryQuery} setQuery={setGlossaryQuery} entries={entries} className="min-w-0 flex-1" />
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-x-10 lg:grid-cols-[220px_minmax(0,700px)]">
                        {/* Left nav (desktop) */}
                        <div className="sticky top-4 hidden h-fit lg:block">
                            <SearchBox lang={lang} query={glossaryQuery} setQuery={setGlossaryQuery} entries={entries} className="mb-4" />
                            <div className="max-h-[calc(100vh-9rem)] overflow-y-auto pr-1">
                                <SidebarNav activeId={activeId} lang={lang} />
                            </div>
                            <p className="mt-4 border-t border-rule-10 pt-3 text-[12px] leading-relaxed text-ink-2">
                                {UI.howToUseBody[lang]}
                            </p>
                        </div>

                        {/* Main column */}
                        <div className="min-w-0 space-y-10">
                            {lang === 'en' && <EnglishHelpBody />}
                            {lang === 'ko' && <KoreanHelpBody />}
                            {lang === 'zh' && <ChineseHelpBody />}

                            <Section id="faq" title={lang === 'ko' ? '자주 묻는 질문' : lang === 'zh' ? '常見問題' : 'Frequently asked questions'}>
                                <div className="space-y-4">
                                    {FAQ_ITEMS.map((item, i) => (
                                        <div key={i}>
                                            <p className="font-semibold text-ink">{item.q[lang]}</p>
                                            <p className="mt-1">{item.a[lang]}</p>
                                        </div>
                                    ))}
                                </div>
                            </Section>

                            <Section id="glossary" title={lang === 'ko' ? '용어 사전 — 이 핸드북의 모든 용어' : lang === 'zh' ? '詞彙表 — 本手冊的所有詞彙' : 'The glossary — every term in this handbook'}>
                                <p>
                                    {lang === 'ko' && `정의된 ${Object.keys(GLOSSARY).length}개 용어의 검색 가능한 색인입니다. 용어 칩을 클릭하면 정의가 열립니다. 위 본문에서도 아무 용어나 클릭할 수 있습니다.`}
                                    {lang === 'zh' && `共 ${Object.keys(GLOSSARY).length} 個已定義詞彙的可搜尋索引。點擊任何詞彙標籤即可開啟定義——或點擊上方任何章節中的詞彙。`}
                                    {lang === 'en' && `A searchable index of all ${Object.keys(GLOSSARY).length} defined terms. Click any term chip to open its definition — or click a term inline in any section above.`}
                                </p>
                                {glossaryQuery && (
                                    <p className="text-[12px] text-ink-2">
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
                                <div className="space-y-4">
                                    {CATEGORY_ORDER.map(cat => {
                                        const items = entries.filter(([, t]) => t.category === cat);
                                        if (items.length === 0) return null;
                                        const catLabel = lang === 'ko' ? CATEGORY_LABELS_KO : lang === 'zh' ? CATEGORY_LABELS_ZH : CATEGORY_LABELS;
                                        return (
                                            <div key={cat}>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className={`border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${CATEGORY_STYLES[cat]}`}>
                                                        {catLabel[cat]}
                                                    </span>
                                                    <span className="font-mono text-[11px] text-off">
                                                        {lang === 'ko' ? `${counts[cat]}개 용어` : lang === 'zh' ? `${counts[cat]} 個詞彙` : `${counts[cat]} term${counts[cat] === 1 ? '' : 's'}`}
                                                    </span>
                                                </div>
                                                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                                                    {items.map(([key, t]) => (
                                                        <Term key={key} term={key} label={lang === 'ko' ? (GLOSSARY_KO[key]?.term ?? t.term) : lang === 'zh' ? (GLOSSARY_ZH[key]?.term ?? t.term) : t.term} />
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </Section>

                            <Section id="disclaimer" title={lang === 'ko' ? '면책 조항' : lang === 'zh' ? '免責聲明' : 'Disclaimer'}>
                                {lang === 'ko' && (
                                    <p>
                                        스톡피크는 리서치 시스템의 산출물을 게시합니다. 투자 조언이 아니며, 특정 증권의 매수나 매도를
                                        권유하는 것도 아니고, 당신의 개별 상황에 맞춘 것도 아닙니다. 판정은 가격이 추정 가치 범위의
                                        위에 있는지 아래에 있는지에 대한 모델의 산출물이며, 틀릴 수 있습니다. 여기 보이는 트랙 레코드는{' '}
                                        <b>페이퍼(시뮬레이션) 포트폴리오</b>이고, 가정한 비용을 포함하며, 짧은 기간을 다루고, 미래
                                        수익률을 예측한다는 것이 입증되지 않았습니다. 과거의 매크로 데이터는 사후 수정된 데이터이지
                                        시점 기준(point-in-time) 데이터가 아닙니다. 이 사이트는 거래 봇도 수정 구슬도 아닙니다.
                                        스크린은 수년에 걸쳐 평균적으로 작동하지 매달 모든 종목에 작동하는 것이 아니며, 재구축된
                                        애널리스트의 판정은 아직 게이트를 통과한 것이 없습니다. 직접 리서치하세요. 돈을 잃을 수
                                        있습니다.
                                    </p>
                                )}
                                {lang === 'zh' && (
                                    <p>
                                        Stockpeak 發布的是一套研究系統的產出。它不是投資建議，不是買賣任何證券的推薦，也不是針對你個人
                                        情況量身訂做的。判定是模型對於價格位於一段估計價值範圍之上或之下的輸出，可能出錯。本站顯示的績效
                                        紀錄是<b>紙上（模擬）投資組合</b>，包含假設的成本，涵蓋的期間很短，且尚未被證明能預測未來報酬。
                                        歷史總體資料是事後修正過的資料，不是當時可得的（point-in-time）資料。本站不是交易機器人，也不是
                                        水晶球。篩選是以數年為尺度平均運作，而不是每個月對每檔股票都有效；重建後分析師的判定目前還沒有
                                        任何一個通過閘門。請自行研究；你可能會虧錢。
                                    </p>
                                )}
                                {lang === 'en' && (
                                    <p>
                                        StockPeak publishes the output of a research system. It is not investment advice, not a
                                        recommendation to buy or sell any security, and not personalised to your circumstances.
                                        Verdicts are model outputs about whether a price sits above or below a range of estimated
                                        values; they can be wrong. Track records shown are <b>paper (simulated) portfolios</b>, include
                                        assumed costs, cover a short period, and have not been shown to predict future returns.
                                        Historical macro data are revised data, not point-in-time. The site is not a trading bot and
                                        not a crystal ball: the screen works on average over years, not on every stock every month,
                                        and none of the rebuilt analyst&apos;s verdicts passes the gate yet. Do your own research; you
                                        can lose money.
                                    </p>
                                )}
                                <p className="pt-1 text-[12px]">
                                    <A href="/">← {UI.backToDesk[lang]}</A>
                                </p>
                            </Section>
                        </div>
                    </div>
                </div>

                {/* Mobile contents drawer: slides in from the left. */}
                {mobileNavOpen && (
                    <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label={UI.contents[lang]}>
                        <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileNavOpen(false)} />
                        <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-rule-22 bg-surface">
                            <div className="flex items-center justify-between border-b border-rule-10 px-4 py-3">
                                <p className="font-mono text-[11px] font-semibold uppercase tracking-[.05em] text-off">{UI.contents[lang]}</p>
                                <button
                                    type="button"
                                    onClick={() => setMobileNavOpen(false)}
                                    aria-label={UI.closeContents[lang]}
                                    className="font-mono text-[11px] text-ink-2 hover:text-ink"
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4">
                                <SidebarNav activeId={activeId} lang={lang} onNavigate={() => setMobileNavOpen(false)} />
                            </div>
                            <div className="border-t border-rule-10 p-3 text-[12px] leading-relaxed text-ink-2">
                                {UI.howToUseBody[lang]}
                            </div>
                        </div>
                    </div>
                )}
            </Shell>
        </GlossaryProvider>
    );
}
