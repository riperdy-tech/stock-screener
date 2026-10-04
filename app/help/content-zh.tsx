'use client';

// ─────────────────────────────────────────────────────────────────────────────
// /help — 繁體中文正文 (Traditional Chinese body)
//
// The Chinese-language version of the handbook sections (welcome → data).
// Rendered by page.tsx when the site language is Chinese. The <Term> links and
// glossary popups are fully localized via lib/glossary-zh.ts.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { BookMarked, BookOpen, FlaskConical } from 'lucide-react';
import { Term } from '@/components/GlossaryTerm';
import { Section, SubHeading, Callout } from './help-ui';
import { PipelineDiagram } from './WorkflowDiagram';

export function ChineseHelpBody() {
    return (
        <>
            {/* 歡迎 */}
            <Section id="welcome" title="歡迎 — 這個網站是什麼（以及不是什麼）" icon={<FlaskConical className="h-5 w-5" />}>
                <p>
                    每天，一台電腦讀取大約 <b>7,000 檔美國上市股票</b>的財務報告與股價歷史，並把它們縮小到約{' '}
                    <b>150</b> 檔的候選名單。另有一位 AI 分析師可以深入研究候選名單上的股票，並說出每檔股票的價格
                    看起來太低、差不多，還是太高。本手冊說明每個步驟如何運作、畫面上每個標籤的意義，以及這個系統刻意{' '}
                    <i>不做</i> 的事。
                </p>
                <Callout kind="warn">
                    <b>這裡不會買賣任何東西，這裡也不是投資建議。</b>這是一份攤開證據的研究候選名單——一台把數千檔
                    股票縮小到值得 <i>你</i> 花研究時間的少數幾檔的機器。本站不下任何交易單。即使是紙上帳本也是誠實地
                    以真實價格與真實成本模擬。
                </Callout>
                <Callout kind="info">
                    <b>目前狀況：</b>AI 分析師正在重建與測試。在新分析師通過測試並上線之前，研究台的 AI 一側不會顯示
                    新的選股。舊分析師的判決仍保留在紀錄中，並顯示為被擋下，而不是選股。請見{' '}
                    <Link href="#analyst" className="font-bold text-pos hover:underline">AI 分析師</Link>。
                </Callout>
                <p>
                    帶有 <span className="border-b border-dotted border-pos/40 font-semibold text-pos">點狀底線</span>的
                    字是技術詞彙。點擊即可不離開頁面看到解釋。所有詞彙的完整、可搜尋索引在{' '}
                    <Link href="#glossary" className="font-bold text-pos hover:underline">詞彙表</Link>區段。
                </p>
            </Section>

            {/* 流程 */}
            <Section id="pipeline" title="每天發生什麼事 — 流程" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    畫面背後是一連串有順序的作業鏈，依排程透過 <Term term="github-actions" /> 自動重新執行。順序是
                    強制的，每一步都會檢查資料，讓過時或殘缺的資料無法悄悄污染候選名單。用白話來說：
                </p>
                <ol className="list-decimal space-y-2 pl-5">
                    <li>
                        <b>資料進來。</b>來自 SEC 的公司申報文件、來自 Yahoo Finance 的股價與分析師預測，以及來自{' '}
                        <Term term="fred" />（聯準會的資料服務）的經濟序列。
                    </li>
                    <li>
                        <b>安全過濾器（「Tier-1 hygiene」）。</b>沒人能合理買進的股票會被剔除：無法交易的股票、規模
                        很小（低於 3 億美元）或股價低於 3 美元的公司、成交清淡的股票、空殼公司、沒有可用申報基本面的
                        公司、長期虧損又負債沉重的公司，以及有強烈會計操縱跡象的較小公司。剩下約 3,000 檔股票等待評分。
                    </li>
                    <li>
                        <b>雙門篩選。</b>每檔剩下的股票都以三道<Term term="door" />——複利成長、價值落差與趨勢領頭——
                        評分，最好的案例進入候選名單。
                    </li>
                    <li>
                        <b>等級。</b>候選名單被分成 Research now 與 Watchlist。其餘是 Pass；若被安全過濾器剔除，則是
                        Vetoed。
                    </li>
                    <li>
                        <b>AI 分析師（執行時）。</b>它深入研究候選名單上的股票，並給每一檔一個判決。它在本機電腦上
                        執行，不在雲端。
                    </li>
                    <li>
                        <b>閘門。</b>判決必須通過閘門的規則才算數。沒通過的判決仍然可見，標示為被擋下並附上原因。
                    </li>
                    <li><b>發布。</b>判決與報告發布到本站。</li>
                    <li>
                        <b>紙上帳本。</b>三個模擬投資組合每天跟隨候選名單、AI 判決與你自己的持股。
                    </li>
                    <li>
                        <b>評分。</b>每個判決之後都會拿股價實際的表現來檢查。
                    </li>
                </ol>
                <PipelineDiagram />
                <p>
                    一切皆 <Term term="point-in-time" />：每個記錄的訊號只用當下確實存在的資訊。這個紀律正是績效紀錄
                    可信的原因。
                </p>
            </Section>

            {/* 研究台 */}
            <Section id="desk" title="如何閱讀研究台 — 兩種檢視" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    研究台是主頁面。最上方有一個開關，決定你看到誰的觀點：
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>AI</b> — AI 分析師的判決，分入下列區段。
                    </li>
                    <li>
                        <b>Quant</b> — 篩選本身的排名：對財務報表與價格的純數學，不涉及 AI。
                    </li>
                </ul>
                <SubHeading>顏色說明 — 一種顏色只代表一種意思</SubHeading>
                <ul className="space-y-1.5 pl-1">
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: 'oklch(0.77 0.13 240)' }}>●</span><span>藍色 — 名單：股票在篩選中走了多遠（Research now 最深）。你選取的項目也以藍色標示。</span></li>
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#a774d6' }}>●</span><span>紫色 — Quality：高品質的企業，以及支撐它的分數。</span></li>
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#149c82' }}>●</span><span>藍綠色 — Value：相對已實現的成長而言便宜，以及支撐它的分數。</span></li>
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#fb9dbb' }}>●</span><span>粉紅色 — Momentum / trend：強勁而穩定的價格趨勢。</span></li>
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: 'oklch(0.82 0.14 162)' }}>●</span><span>綠色 — 好：低估、獲利、通過閘門的判斷。</span></li>
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#e8e4da' }}>●</span><span>米白色 — 合理：價格位於價值區間內。</span></li>
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#db6750' }}>●</span><span>珊瑚色 — 不好：高估、虧損。</span></li>
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#e2b850' }}>●</span><span>琥珀色 — 警告：需要細看（財報鑑識警告、判斷被擋下的提示、研究台通知）。</span></li>
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#8a877f' }}>●</span><span>灰色 — 不算數：被擋下判斷的數字、被否決的股票、沒有資料。</span></li>
                </ul>
                <SubHeading>AI 鏡頭的區段</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>Research now</b> — 判決為<i>低估</i>且未被擋下的股票（見{' '}
                        <Link href="#gate" className="font-bold text-pos hover:underline">閘門</Link>）。
                    </li>
                    <li>
                        <b>Watchlist</b> — 判決為<i>合理</i>或<i>高估</i>且未被擋下的股票。
                    </li>
                    <li>
                        <b>被閘門擋下（Blocked by the gate）</b> — 紀錄中未通過規則的判決。它們連同原因一起作為紀錄
                        顯示，絕不會被顯示為選股。
                    </li>
                    <li>
                        <b>等待中（Awaiting）</b> — 分析師尚未研究的候選名單股票。
                    </li>
                    <li>
                        <b>被否決（Vetoed）</b> — 被安全過濾器剔除的股票，以及分析師沒有產出可用判決的列（
                        <Term term="not-usable" />）。
                    </li>
                </ul>
                <SubHeading>價值區間條</SubHeading>
                <p>
                    在判決旁邊你會看到一條細條。<b>有色帶</b>是分析師各次執行所得出的價值範圍，<b>刻度</b>是中位數
                    （中間那個值），<b>白線</b>是今天的股價。如果白線在色帶左邊，股價低於每一次執行的價值；在色帶
                    內，就在範圍之內；在右邊，則高於每一次執行。這就是判決的全部。請見 <Term term="iv-band" />。
                </p>
            </Section>

            {/* 篩選 */}
            <Section id="screen" title="量化篩選 — 三道門" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    篩選不會把一切混成單一分數。一家公司可以因為出色、因為被錯誤定價，或因為處於強勁而穩定的上升
                    趨勢而值得注意——把這些平均成一個數字，哪一種都描述不好。所以有三道<Term term="door" />。
                    股票只需通過一道。
                </p>
                <div className="space-y-3">
                    <div className="border border-rule-10 bg-white/5 p-3">
                        <p className="text-sm font-extrabold text-pos">第 1 道門 — Quality（品質・複利成長）</p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-q">
                            真正賺錢、持續成長、股價上漲、預測被上調的公司。它混合<Term term="quality" />、
                            <Term term="momentum" />與<Term term="revisions" />，其中品質的比重最大。
                        </p>
                    </div>
                    <div className="border border-rule-10 bg-white/5 p-3">
                        <p className="text-sm font-extrabold text-accent">第 2 道門 — Value（價值・價值落差）</p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-q">
                            相對於自己已證明的成長而顯得便宜的公司：價格要求的成長低於公司實際交出的成績（
                            <Term term="expectations-gap" />），而且這檔股票在<Term term="value" />上便宜。
                            <b>下殺刀鋒底線</b>會把急劇下跌的股票擋在外面，因為便宜卻還在下跌，還算不上便宜貨。
                        </p>
                    </div>
                    <div className="border border-rule-10 bg-white/5 p-3">
                        <p className="text-sm font-extrabold text-warn">第 3 道門 — Trend（趨勢・趨勢領頭股）</p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-q">
                            前兩道門會漏掉的強勁而穩定的上升趨勢——例如整個類股的榮景。最多 20 個額外名額，每個產業
                            群組最多 5 個。候選股必須有獲利、規模合理，分析師預測不能在下滑，而且必須是穩定地攀升，
                            而不是靠某一個幸運的月份。
                        </p>
                    </div>
                </div>
                <SubHeading>各道門如何競爭</SubHeading>
                <p>
                    前兩道門各自把分數換算成<Term term="percentile" />，股票以兩者中較好的那個來競爭。
                    <Term term="champion" />——在兩道門都位居前 10% 的股票——會得到 +2 的小加分，因為同時出色又便宜
                    很罕見。下殺中的刀鋒不能成為冠軍股。
                </p>
                <SubHeading>留在名單上的力量</SubHeading>
                <p>
                    已在候選名單上的名稱，要明顯掉出才會被移除。這稱為 <Term term="hysteresis" />：排名在 60 名以內時
                    留在 Research now，排名在 150 名以內時留在候選名單上。沒有這個緩衝，卡在切線上的股票會隨著每次
                    小幅價格波動進進出出。
                </p>
                <SubHeading>公平的比較</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        大多數評分是<Term term="sector-neutral" />——銀行與銀行競爭，不與軟體公司競爭。
                    </li>
                    <li>
                        <Term term="momentum" />是例外，而且是有用的例外：它也會對照整個市場來解讀，因此帶動整個
                        類股的榮景會保持可見，而不是顯得平凡。
                    </li>
                    <li>
                        對於現金流隨景氣循環波動的週期性企業（石油、天然氣、採礦、航運等），篩選使用多年的現金流平均
                        （石油、天然氣與採礦為<b>8 年</b>，其他週期性企業為<b>3 年</b>），而不是單一一年的好壞。
                    </li>
                </ul>
                <SubHeading>類股傾斜已關閉</SubHeading>
                <p>
                    每個類股都得到相同的基本<Term term="sector-quota" />，也就是候選名單名額。總體引擎可以把額外
                    名額給適合當前經濟的類股，但它的選類股能力尚未證明自己，所以傾斜被關閉，直到它證明自己為止。
                </p>
            </Section>

            {/* 等級 */}
            <Section id="bands" title="等級、否決與警告" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    篩選的結果是四個<Term term="band" />：
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><span className="font-extrabold text-pos">RESEARCH NOW</span> — 候選名單的頂端，大約前 50 到 60 檔。今天值得你花研究時間。</li>
                    <li><span className="font-extrabold text-accent">WATCHLIST</span> — 候選名單的其餘部分，整份名單共約 150 檔。</li>
                    <li><span className="text-ink-2">PASS</span> — 有評分，但不在候選名單上。</li>
                    <li><span className="font-extrabold text-neg">VETOED</span> — 被安全過濾器剔除。沒有等級，原因寫在紅色標籤上。</li>
                </ul>
                <SubHeading>什麼會剔除一檔股票</SubHeading>
                <p>
                    <Term term="veto" />是在各道門評分任何東西之前就套用的硬性取消資格。原因有：股票無法交易、規模太小
                    或成交太清淡、沒有可用的申報基本面、是空殼公司、有長期營運虧損並伴隨沉重債務，或同時出現兩個
                    <Term term="forensic" />紅旗。最後兩項只適用於市值低於 100 億美元的公司。
                </p>
                <SubHeading>什麼只會警告</SubHeading>
                <p>
                    對大型公司，鑑識檢驗是<b>警告</b>：<Term term="beneish" />（疑似操縱盈餘）、
                    <Term term="accruals" />（獲利沒有現金支撐）、Altman Z（財務困境分數）與因發行股票而造成的大量
                    <Term term="dilution" />。警告絕不會剔除市值 100 億美元以上的股票。對較小的公司，只有兩個紅旗
                    同時出現時才會被剔除。這可以避免快速成長的領頭股因為看起來不尋常而被踢出，同時仍把警告顯示給你，
                    讓你可以仔細看看。
                </p>
                <SubHeading>備註不是警告</SubHeading>
                <p>
                    資料備註——例如某檔股票的動能是用月股價算出來的，或它最新的年報已經很舊——描述的是一個數字是如何
                    建立的。它們對公司沒有任何負面的意思，也絕不會剔除股票。
                </p>
                <Callout kind="tip">
                    原則是 <i>annotate, never silently gate（加註，絕不悄悄設卡）</i>：只要可能，疑慮就以附帶原因的旗標
                    顯示，讓你看得到，而不是悄悄把股票刪掉。
                </Callout>
            </Section>

            {/* 分析師 */}
            <Section id="analyst" title="AI 分析師 — 判決如何產生" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    候選名單上的股票可以由 AI 分析師深入研究——就像取得一份審慎的第二意見。工作被分開，讓每個部分
                    做它擅長的事：
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>AI 負責研究</b>並選定每一項估值輸入。它跑在本機模型（<Term term="llm" />）上，而不是雲端
                        服務。
                    </li>
                    <li>
                        <b>Python 負責每一項計算。</b>AI 是好分析師，卻是不可靠的計算機，所以沒有任何數字交給它的
                        算術。
                    </li>
                    <li>
                        <b>程式碼檢查答案</b>，對照外部錨點：專業分析師的預測與他們的目標價範圍（
                        <Term term="street-fence" />）。
                    </li>
                </ul>
                <p>
                    每檔股票會獨立執行 2 或 3 次，每次執行都以一個對企業價值的估計作結。<b>判決</b>就是今天的股價
                    相對於這些價值所構成的區間的位置：低於區間代表<b>低估</b>，在區間內代表<b>合理</b>，高於區間代表
                    <b>高估</b>。區間較寬代表各次執行意見分歧，這會讓建議部位變小。請見 <Term term="iv-band" />。
                </p>
                <Callout kind="warn">
                    <b>目前狀態：</b>分析師正在重建與測試。在它通過測試並上線之前，沒有新的判決。今天紀錄中的每個判決
                    都是由舊分析師做出的。
                </Callout>
            </Section>

            {/* 閘門 */}
            <Section id="gate" title="閘門 — 哪些判決算數" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    判決必須通過閘門才算數。每個判決都會標示是否<Term term="actionable" />（是或否），當答案為否時，
                    研究台會用白話列出<Term term="gate-reason" />：
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>由舊分析師做出</b> — 它是在現行規則之前、由一位被裁定無效的分析師產生的。</li>
                    <li><b>各次執行分歧太大</b> — 各次執行的價值分散得太廣，無法信任。</li>
                    <li><b>只有一次可用的執行</b> — 單一一次執行無法顯示分析師與自己有多一致。</li>
                    <li><b>超出分析師目標價範圍</b> — 價值落在華爾街圍欄之外。</li>
                    <li><b>高出股價到不合理的程度</b> — 價值比股價高太多，因此被視為可疑。</li>
                    <li><b>沒有分析師目標價範圍</b> — 沒有圍欄可以用來核對答案。</li>
                    <li><b>無法取得分析師資料</b> — 查詢失敗，所以無法進行檢查。</li>
                    <li><b>採礦／油氣生產商尚未支援</b> — 分析師目前還無法正確評估這些公司，所以它們被擋下，不能成為買進。</li>
                    <li><b>未使用計算器</b> — 分析師在得出答案時從未使用估值計算器。</li>
                    <li><b>測試執行</b> — 該列來自測試，而不是正式執行。</li>
                </ul>
                <p>
                    另外還有少數其他技術性原因；研究台會用文字說明每一個。一個判決可以有不只一個原因。
                </p>
                <Callout kind="info">
                    被擋下的判決不會被刪除。它仍會顯示在<i>被閘門擋下</i>之下，作為說過什麼、以及為什麼不算數的紀錄
                    ——絕不會被顯示為選股。
                </Callout>
            </Section>

            {/* 重新上線 */}
            <Section id="relaunch" title="新分析師上線後有什麼改變" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    這四件事隨著重新上線而到來。它們今天尚未生效。
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>進場時機。</b>每個判決都會說明它是「現在買進」還是「等待動能」，並寫明會翻轉這個判斷的條件。
                    </li>
                    <li>
                        <b>價值依據 vs 動能依據。</b>即使分析師的價值低於股價，有基本面支持的強勁上升趨勢仍可以用一半或
                        四分之一的部位持有。請見 <Term term="position-basis" />。
                    </li>
                    <li>
                        <b>論點監控。</b>每個判決都寫明自己的失效規則。這些規則會拿目前資料重新檢查，論點破裂時會被
                        標記。請見 <Term term="thesis-status" />。
                    </li>
                    <li>
                        <b>對無人覆蓋股票的謹慎。</b>沒有任何專業分析師覆蓋的股票，會得到較小的建議部位與更嚴格的
                        安全邊際，而不是被當作有分析師覆蓋的股票看待。
                    </li>
                </ul>
            </Section>

            {/* 總體 */}
            <Section id="macro" title="總體引擎 — 經濟背景" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    另一個獨立的引擎讀取美國經濟的狀態，並發布三樣東西：
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>每個經濟季節的機率。</b>這些機率是主要產出（見 <Term term="probability-vector" />）。單一的
                        季節標籤只是摘要，不驅動任何數字。
                    </li>
                    <li>
                        針對恐慌、信用、利率、油價、美元、就業與通膨的<b>衝擊警報</b>（見{' '}
                        <Term term="shock-register" />）。
                    </li>
                    <li>
                        <b>動盪風險旗標</b>，當恐慌指數達到 30 或更高時就會亮起。
                    </li>
                </ul>
                <p>
                    它的數字只來自 <Term term="fred" />。新聞只作為故事的脈絡，絕不轉成數字。它的選類股能力尚未證明
                    自己，所以篩選不使用它。
                </p>
            </Section>

            {/* 績效紀錄 */}
            <Section id="track" title="績效紀錄 — 誠實的量尺" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    系統不展示討好人的<Term term="backtest" />，而是每天以真實價格與真實的{' '}
                    <Term term="transaction-costs" />進行<Term term="paper-trading" />。如果系統錯了，這個頁面會說出來。
                </p>
                <SubHeading>三個帳本</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b className="text-accent">Equal-weight</b> — 等額持有每一檔 Research now 的股票。這是純粹的選股
                        測試，沒有 AI，也沒有部位大小調整。
                    </li>
                    <li>
                        <b className="text-pos">AI 帳本</b> — 跟隨通過閘門的分析師判決（
                        <Term term="rn-depth" />）。它至今的歷史來自被裁定無效的<b>舊</b>分析師。由於沒有任何判決通過，
                        自 2026-09-24 以來它只持有現金。新分析師上線時，AI 紀錄會從零重新開始，舊歷史則歸檔。
                    </li>
                    <li>
                        <b className="text-ink-2">Mine</b> — 你自己儲存的持股，像基金一樣追蹤（
                        <Term term="unitization" />），讓追加資金絕不會造成績效假象。
                    </li>
                </ul>
                <SubHeading>誠實的規則</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>交易發生在<b>訊號之後的第一個收盤價</b>，因為訊號只有在存在之後才能據以行動。</li>
                    <li>每筆交易都包含成本。</li>
                    <li>基準（<Term term="iwm" />、<Term term="spy" />）使用與交易相同的日期。</li>
                </ul>
                <SubHeading>如何解讀</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>Equal-weight vs IWM</b> — 如果選股打敗小型股<Term term="benchmark" />，選股就有效。</li>
                    <li><b>AI 帳本 vs Equal-weight</b> — 只有當 AI 分析師的帳本打敗單純的候選名單時，它才算物有所值。</li>
                    <li><b>Mine vs 其他</b> — 你自己的偏離會以<Term term="behavior-gap" />的形式顯現。</li>
                </ul>
                <p>
                    <Term term="sharpe-ratio" />、<Term term="cagr" />等指標，要累積足夠天數的實盤資料之後才會出現；
                    早期這個頁面刻意保持無聊。
                </p>
            </Section>

            {/* 投資組合 */}
            <Section id="portfolio" title="我的投資組合 — 檢查你自己的持股" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    Portfolio 分頁是為你的<b>實際</b>持股而設。每一筆持股都會對照篩選的<Term term="band" />與 AI 判決，
                    結果顯示在它旁邊。AI 判決被擋下的持股會顯示為被擋下——絕不會顯示為訊號。你的持股也會餵給績效紀錄上的{' '}
                    <b>Mine</b> 帳本。
                </p>
                <Callout kind="info">
                    不再有建議計畫。本站不再替你建立配置——舊的凱利規模計畫帳本已經退役。至於目前還剩下哪些部位大小
                    指引，請見 <Term term="position-sizing" />。
                </Callout>
            </Section>

            {/* 舊版鏡頭 */}
            <Section id="lenses" title="舊版鏡頭 — 保留供參考的舊篩選" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    <b>Lenses</b> 按鈕會開啟舊篩選：百倍股（100-bagger）篩選、Reverse 與 YouTube。它們只是
                    保留供參考。它們<b>不是</b>現行系統，研究台上沒有任何東西是用它們建立的。
                </p>
            </Section>

            {/* 驗證 */}
            <Section id="validation" title="系統如何被驗證" icon={<BookOpen className="h-5 w-5" />}>
                <p>三個習慣讓系統保持誠實：</p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>先有規則，再有結果。</b>通過／不通過的規則在看到結果之前就寫下，所以事後無法為了好看而調整
                        （那就會是 <Term term="overfitting" />）。
                    </li>
                    <li>
                        <b>為判決評分。</b>評分器會拿 30、91、182 與 365 天內的股價表現，對照 <Term term="iwm" />、
                        <Term term="spy" />與 QQQ，檢查每個 AI 判決。一個期間只有在完全過去之後才會被評分，而且基準使用
                        與判決相同的日期。
                    </li>
                    <li>
                        <b>紙上帳本。</b>
                        <Link href="#track" className="font-bold text-pos hover:underline">績效紀錄</Link>的帳本每天以真實
                        價格與成本交易。
                    </li>
                </ul>
                <Callout kind="warn">
                    <b>尚無結論。</b>今天紀錄中的每個判決都來自舊分析師，所以無法從評分中得出任何結論。只有當新分析師的
                    有效判決存在、且它們的期間已經過去之後，這才會有意義。
                </Callout>
            </Section>

            {/* 資料 */}
            <Section id="data" title="資料從哪裡來" icon={<BookOpen className="h-5 w-5" />}>
                <ul className="list-disc space-y-2 pl-5">
                    <li><Term term="sec-filings" /> — 透過 <Term term="company-facts" /> 取得的 10 年申報當下原貌基本面（品質、鑑識警告與已證明成長的基準事實），以 <Term term="point-in-time" /> 方式保存。</li>
                    <li><Term term="yahoo-finance" /> — 股價、分析師<Term term="estimates" />與覆蓋情況。</li>
                    <li><Term term="fred" /> — 總體引擎背後的美國經濟序列。</li>
                    <li>新聞 — 只作為敘事脈絡。絕不轉成數字。</li>
                </ul>
                <p>
                    評分鏈依排程透過 <Term term="github-actions" /> 重新執行。AI 分析師則另外在本機電腦上執行。
                </p>
            </Section>
        </>
    );
}
