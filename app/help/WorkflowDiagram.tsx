'use client';

// ─────────────────────────────────────────────────────────────────────────────
// WorkflowDiagram — the chain diagram for the /help handbook.
//
//   <PipelineDiagram /> — the six steps of the chain (macro → screener → analyst → gate →
//                         follow-up → grading), each with what it hands on and, where it applies,
//                         its status today. Desk editorial style: rules, mono micro-labels and text
//                         glyphs; no icons, no coloured tiles.
//
// Follows the site's language setting via useLanguage(). Descriptions embed <Term> glossary links.
// ─────────────────────────────────────────────────────────────────────────────

import { type ReactNode } from 'react';
import { useLanguage } from '@/components/LanguageContext';
import { Term } from '@/components/GlossaryTerm';

type Lang = 'en' | 'ko' | 'zh';
type L = { en: string; ko: string; zh: string };
type D = { en: ReactNode; ko: ReactNode; zh: ReactNode };

interface Step {
    id: string;
    title: L;
    desc: D;
    output: L;
    /** Today's status, when it is worth stating; `warn` marks something not live. */
    status?: { text: L; warn?: boolean };
}

const STEPS: Step[] = [
    {
        id: 'macro',
        title: { en: 'Macro', ko: '매크로', zh: '總體' },
        desc: {
            en: <>Publishes a <Term term="probability-vector" /> for each economic season, <Term term="shock-register" /> alarms and the cost-of-capital anchor. Context only: the sector tilt is <b>off</b>.</>,
            ko: <>경제 계절별 확률(<Term term="probability-vector" />), 쇼크 경보(<Term term="shock-register" />), 자본비용 기준값을 게시합니다. 참고용일 뿐이며 섹터 틸트는 <b>꺼져</b> 있습니다.</>,
            zh: <>為每個經濟季節發布一個機率（<Term term="probability-vector" />）、衝擊警報（<Term term="shock-register" />）與資金成本基準。僅供參考：類股傾斜是<b>關閉</b>的。</>,
        },
        output: { en: 'probabilities · shock alarms · cost of equity', ko: '확률 · 쇼크 경보 · 자기자본비용', zh: '機率 · 衝擊警報 · 股權成本' },
    },
    {
        id: 'screen',
        title: { en: 'Screener', ko: '스크리너', zh: '篩選器' },
        desc: {
            en: <>Safety filters, then three <Term term="door">doors</Term> — compounder, value gap, trend leader — each <Term term="sector-neutral" />. The better door competes, a <Term term="champion" /> gets a small bonus, and <Term term="hysteresis" /> keeps the list steady. Bands sort the result.</>,
            ko: <>안전 필터를 거친 뒤 세 개의 <Term term="door" /> — 컴파운더, 밸류 갭, 추세 주도주 — 가 각각 <Term term="sector-neutral" />로 채점합니다. 더 좋은 도어로 경쟁하고, <Term term="champion" />은 작은 가산점을 받으며, <Term term="hysteresis" />가 명단을 안정시킵니다. 결과는 등급으로 나뉩니다.</>,
            zh: <>先經過安全過濾，再由三道<Term term="door" />——複利成長、價值落差、趨勢領頭——各自以<Term term="sector-neutral" />方式評分。以較好的門來競爭，<Term term="champion" />得到小加分，<Term term="hysteresis" />讓名單保持穩定。結果依等級分類。</>,
        },
        output: { en: 'the list · bands · ranks', ko: '명단 · 등급 · 순위', zh: '名單 · 等級 · 排名' },
    },
    {
        id: 'analyst',
        title: { en: 'Analyst', ko: '애널리스트', zh: '分析師' },
        desc: {
            en: <>The AI researches and chooses every input, Python does every calculation, and code checks the answer. The verdict is where the price sits against the <Term term="iv-band">value band</Term>; the <Term term="crux">crux</Term> is the one input the price gets wrong.</>,
            ko: <>AI가 리서치하고 모든 입력값을 고르며, 파이썬이 모든 계산을 하고, 코드가 답을 검증합니다. 판정은 주가가 <Term term="iv-band" />에 대해 어디에 있는가이고, <Term term="crux" />은 주가가 틀린 단 하나의 입력값입니다.</>,
            zh: <>AI 負責研究並選定每一項輸入，Python 做每一項計算，程式碼再檢查答案。判定就是股價相對於<Term term="iv-band" />的位置；<Term term="crux" />則是股價錯估的那一個輸入。</>,
        },
        output: { en: 'verdict · value band · crux', ko: '판정 · 가치 밴드 · 핵심 쟁점', zh: '判定 · 價值區間 · 關鍵分歧' },
        status: {
            text: { en: 'publishing first verdicts · none passes the gate', ko: '첫 판정 게시 중 · 게이트 통과 없음', zh: '正在發布第一批判定 · 無一通過閘門' },
            warn: true,
        },
    },
    {
        id: 'gate',
        title: { en: 'Gate', ko: '게이트', zh: '閘門' },
        desc: {
            en: <>Marks each verdict <Term term="actionable" /> or not, with the <Term term="gate-reason">gate reasons</Term>. <Term term="blocked">Blocked</Term> verdicts stay visible as a record and are never a recommendation.</>,
            ko: <>각 판정에 <Term term="actionable" /> 여부를 표시하고 사유(<Term term="gate-reason" />)를 붙입니다. <Term term="blocked" /> 판정은 기록으로 계속 보이며 추천이 아닙니다.</>,
            zh: <>為每個判定標示是否<Term term="actionable" />，並附上<Term term="gate-reason" />。<Term term="blocked" />的判定仍作為紀錄保持可見，絕非建議。</>,
        },
        output: { en: 'actionable · reasons', ko: '실행 가능 · 사유', zh: '可執行 · 原因' },
    },
    {
        id: 'followup',
        title: { en: 'Follow-up', ko: '후속 점검', zh: '跟進' },
        desc: {
            en: <>Each day it decides only: re-analyse now, or nothing new. It sets <Term term="buy-paused" /> and a 14-day refresh, and it never sells.</>,
            ko: <>매일 하나만 결정합니다. 지금 재분석할지, 새로운 것이 없는지. <Term term="buy-paused" />과 14일 갱신을 설정하며, 절대 매도하지 않습니다.</>,
            zh: <>每天只決定一件事：現在重新分析，或沒有新消息。它會設定<Term term="buy-paused" />與 14 天的更新，而且絕不賣出。</>,
        },
        output: { en: 'watch items · buy paused · re-analysis queue', ko: '관찰 항목 · 매수 중지 · 재분석 대기열', zh: '觀察項目 · 暫停買進 · 重新分析佇列' },
        status: { text: { en: 'built · not live yet', ko: '구축됨 · 아직 가동 전', zh: '已建好 · 尚未上線' }, warn: true },
    },
    {
        id: 'grading',
        title: { en: 'Grading', ko: '평가', zh: '評分' },
        desc: {
            en: <>Each verdict is graded at 30, 91, 182 and 365 days against <Term term="iwm" />, <Term term="spy" /> and QQQ. Three paper books — the AI book, the <Term term="control-book" /> and yours — trade daily with real prices and assumed costs.</>,
            ko: <>각 판정은 30일, 91일, 182일, 365일 뒤 <Term term="iwm" />, <Term term="spy" />, QQQ와 비교해 평가됩니다. 세 개의 페이퍼 북 — AI 북, <Term term="control-book" />, 내 북 — 이 실제 가격과 가정한 비용으로 매일 거래합니다.</>,
            zh: <>每個判定會在 30、91、182 與 365 天後對照<Term term="iwm" />、<Term term="spy" />與 QQQ 評分。三個紙上帳本——AI 帳本、<Term term="control-book" />與你自己的帳本——每天以真實價格與假設成本交易。</>,
        },
        output: { en: 'scoreboard · paper records', ko: '성적표 · 페이퍼 기록', zh: '成績單 · 紙上紀錄' },
    },
];

const TEXT = {
    head: { en: 'The chain, every day', ko: '매일의 체인', zh: '每日流程' },
    inputs: { en: 'inputs', ko: '입력', zh: '輸入' },
    output: { en: 'hands on', ko: '넘기는 것', zh: '交給下一步' },
    footer: {
        en: 'Each step hands the next only a data file. The cloud part re-runs on a schedule via GitHub Actions; the AI analyst runs on a local computer.',
        ko: '각 단계는 다음 단계에 데이터 파일만 넘깁니다. 클라우드 부분은 GitHub Actions로 일정에 따라 재실행되고, AI 애널리스트는 로컬 컴퓨터에서 실행됩니다.',
        zh: '每一步只把一個資料檔交給下一步。雲端部分透過 GitHub Actions 依排程重新執行；AI 分析師則在本機電腦上執行。',
    },
} as const;

export function PipelineDiagram() {
    const { language } = useLanguage();
    const lang: Lang = language === 'zh' ? 'zh' : language === 'ko' ? 'ko' : 'en';

    return (
        <figure className="border-t border-rule-14 pt-2.5">
            <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[.05em] text-off">{TEXT.head[lang]}</span>
                <span className="text-[12px] text-ink-2">
                    <span className="font-mono text-[11px] uppercase tracking-[.05em] text-off">{TEXT.inputs[lang]}: </span>
                    <Term term="sec-filings" /> · <Term term="yahoo-finance" /> · <Term term="fred" />
                </span>
            </figcaption>
            <ol className="mt-2">
                {STEPS.map((s, i) => (
                    <li key={s.id} className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-2 border-t border-rule-10 py-2.5 md:grid-cols-[22px_120px_minmax(0,1fr)_200px]">
                        <span className="font-mono text-[11px] leading-[1.9] text-off">{i + 1}</span>
                        <div className="min-w-0 md:contents">
                            <div>
                                <p className="text-[13px] font-semibold text-ink">{s.title[lang]}</p>
                                {s.status && (
                                    <p className={`mt-0.5 font-mono text-[11px] leading-snug ${s.status.warn ? 'text-warn' : 'text-ink-2'}`}>
                                        {s.status.warn ? '● ' : ''}{s.status.text[lang]}
                                    </p>
                                )}
                            </div>
                            <p className="mt-1 text-[12.5px] leading-[1.5] text-ink-2 md:mt-0">{s.desc[lang]}</p>
                            <p className="mt-1 font-mono text-[11px] leading-snug text-off md:mt-0 md:text-right">
                                <span aria-hidden>→ </span>
                                <span className="sr-only">{TEXT.output[lang]}: </span>
                                {s.output[lang]}
                            </p>
                        </div>
                    </li>
                ))}
            </ol>
            <p className="border-t border-rule-10 pt-2 text-[12px] text-ink-2">{TEXT.footer[lang]}</p>
        </figure>
    );
}
