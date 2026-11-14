'use client';

// ─────────────────────────────────────────────────────────────────────────────
// /help — 繁體中文正文 (Traditional Chinese body)
//
// The Chinese-language version of the handbook sections (welcome → data), same ids and order as
// content-en.tsx. Rendered by page.tsx when the site language is Chinese. The <Term> links and
// glossary popups are localized via lib/glossary-zh.ts. Needs native review.
// The gate reason list is drawn from lib/desk/tone.ts, so it is in English, as on the desk.
// ─────────────────────────────────────────────────────────────────────────────

import { Term } from '@/components/GlossaryTerm';
import { FAMILY } from '@/lib/desk/tone';
import { A, Callout, ColourKey, DoorCard, GateReasons, Section, SubHeading } from './help-ui';
import { PipelineDiagram } from './WorkflowDiagram';

export function ChineseHelpBody() {
    return (
        <>
            {/* 歡迎 */}
            <Section id="welcome" title="歡迎 — 這個網站是什麼，以及不是什麼">
                <p>
                    Stockpeak 是一套以網站形式發布的研究系統。每天，一台電腦讀取大約 <b>7,000 檔美國上市股票</b>的財務
                    報告與股價歷史，並把它們縮小成一份簡短的名單。接著由本機 AI 模型 Qwen 逐家閱讀名單上公司的申報文件，
                    它的分析會顯示在每檔股票的頁面上。本手冊說明每個步驟如何運作、畫面上每個標籤的意義，
                    以及這個系統<i>尚未證明</i>的事。
                </p>
                <Callout kind="warn">
                    <b>這裡不會買賣任何東西，這裡也不是投資建議。</b>這是一套攤開證據的研究系統——一台把數千檔股票縮小
                    到值得 <i>你</i> 花研究時間的少數幾檔的機器。本站不下任何交易單。即使是紙上帳本，也是以真實價格與
                    假設的交易成本模擬。
                </Callout>
                <Callout kind="info">
                    <b>目前狀況</b>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5">
                        <li>
                            篩選器每月挑出大約 50 到 60 檔股票組成一個月度帳本。從 2026 年 11 月 6 日起，有兩個紙上帳本跟隨它：
                            代碼帳本（只有篩選器的選股）與 Qwen 帳本（同樣的選股，但當 Qwen 閱讀申報文件發現重大事件時，
                            該名額改以現金持有）。兩者都是模擬，不涉及真實資金。
                        </li>
                        <li>
                            Qwen 閱讀篩選器名單上股票的申報文件。它的分析在每檔股票的頁面上，只有在能算出價值時才附上價值。
                            許多股票沒有價值，許多價值也與市價相差甚遠，所以請先讀分析，再看數字。Qwen 尚未以報酬評分。
                            請見<A href="#analyst">AI 分析師</A>。
                        </li>
                        <li>
                            先前的判定分析師，連同它的閘門與它的 AI 紙上帳本，在被裁定無效後於 2026 年 10 月停止。它的紀錄仍
                            保留在 Track 頁面，標示為已停止的分析師所有。請見<A href="#relaunch">運作中、已停止與下一步</A>。
                        </li>
                        <li>
                            每天跟進持有股票、閱讀新申報文件與新聞的功能正在重建，尚未運作。真實資金的鏡像已停止；
                            本站絕不交易。
                        </li>
                        <li>
                            這裡的一切都尚未被證明。真正重要的比較——Qwen 帳本是否打敗代碼帳本——還沒有被衡量。請見
                            <A href="#validation">系統如何被驗證</A>。
                        </li>
                    </ul>
                </Callout>
                <p>
                    帶有 <span className="border-b border-dotted border-accent/50 font-semibold text-accent">點狀底線</span>的
                    字是技術詞彙。點擊即可不離開頁面看到解釋。所有詞彙的完整、可搜尋索引在
                    <A href="#glossary">詞彙表</A>區段。
                </p>
            </Section>

            {/* 流程 */}
            <Section id="pipeline" title="每天的流程 — 從經濟到已評分的紀錄">
                <p>
                    畫面背後是一條六步驟的鏈條。順序是強制的，每一步只把一個資料檔交給下一步，讓過時或殘缺的資料無法悄悄
                    污染名單。雲端部分依排程透過 <Term term="github-actions" /> 重新執行。用白話來說：
                </p>
                <ol className="list-decimal space-y-2 pl-5">
                    <li>
                        <b>總體 — 經濟天氣。</b>一個獨立的引擎讀取美國經濟資料（<Term term="fred" />），並發布經濟背景
                        與分析師用來折現的資金成本數字。這是背景資訊，不是對市場的判斷。請見
                        <A href="#macro">總體引擎</A>。
                    </li>
                    <li>
                        <b>篩選器 — 決定分析師讀什麼。</b>申報文件、股價與分析師預測進來。安全過濾器剔除沒人能合理買進
                        的股票，三道<Term term="door" />——複利成長、價值落差、趨勢領頭——為剩下的股票評分，最好的案例
                        進入名單，再由等級加以分類。它的工作是決定分析師有限的時間要花在哪裡。請見
                        <A href="#screen">量化篩選</A>與<A href="#bands">等級、否決與警告</A>。
                    </li>
                    <li>
                        <b>分析師 — 逐檔閱讀。</b>Qwen 是跑在一台配有一張 GPU 的本機電腦上的 AI 模型，一次閱讀一家名單上
                        公司的申報文件，並依主題寫出主張；程式碼會把每項主張對照申報文件檢查。在申報文件允許的情況下，
                        程式碼會根據 Qwen 的選擇算出價值。請見<A href="#analyst">AI 分析師</A>。
                    </li>
                    <li>
                        <b>閘門 — 先前分析師的檢查（已停止）。</b>程式碼會重新審視先前分析師的每個判定，並附上原因標示為
                        被擋下與否。它隨著該分析師一起停止；這一節保留作為紀錄。請見<A href="#gate">閘門</A>。
                    </li>
                    <li>
                        <b>跟進 — 每日關注。</b>每天拿新的申報文件與新聞檢查持有股票的功能正在重建。它只會要求重新看一次，
                        絕不賣出。<b>尚未運作。</b>請見<A href="#followup">每日跟進</A>。
                    </li>
                    <li>
                        <b>評分 — 為紀錄評分。</b>代碼與 Qwen 兩個月度紙上帳本每天對照基準標記，旁邊還有對照帳本與你自己的
                        持股。先前分析師的判定曾拿之後的股價來評分；Qwen 尚未以報酬評分。請見<A href="#track">績效紀錄</A>。
                    </li>
                </ol>
                <PipelineDiagram />
                <p>
                    一切皆 <Term term="point-in-time" />：每個記錄的訊號只用當下確實存在的資訊。這個紀律正是績效紀錄值得
                    一讀的原因。
                </p>
            </Section>

            {/* 研究台 */}
            <Section id="desk" title="如何閱讀研究台">
                <p>研究台是主頁面。由上到下是：</p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>新鮮度列</b>——價格、名單與最新判定最後一次更新的時間，一個狀態點，以及右側的總體判讀。請見
                        <A href="#health">系統狀態</A>。
                    </li>
                    <li>
                        <b>通知</b>——有事需要說明時才出現。
                    </li>
                    <li>
                        <b>狀態列</b>——一句話：Qwen 讀過名單上幾檔股票、其中幾檔有價值，以及最新一次閱讀的日期。
                    </li>
                    <li>
                        <b>漏斗</b>——五個數字：美國股票 → 通過安全篩選 → 進入名單 → Qwen 已讀 → 已有價值。點擊某一步只會
                        <i>選取</i>它：下方的摘要會改變，「show how」會展開細節。它不會過濾表格。剔除股票的步驟，其細節
                        面板會說明原因。
                    </li>
                    <li>
                        <b>名單用的一張表</b>——分入下列區段，並有門、類股與搜尋的篩選。凡是會隱藏列的
                        篩選，都會顯示「showing k of n」。
                    </li>
                </ul>

                <SubHeading>表格的區段</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>Research now</b>——篩選器名單上的頂端股票，大約前 50 到 60 檔，依篩選順序排列。這是一份值得你花
                        研究時間的名單，不是買進清單。
                    </li>
                    <li>
                        <b>Watchlist</b>——篩選器名單上接下來的股票，依篩選順序排列。這是篩選自己的等級名稱，不是判定。
                    </li>
                    <li>
                        <b>取消資格</b>——在名單上、但被安全過濾器剔除的股票。原因寫在旁邊。
                    </li>
                </ul>
                <p>
                    Qwen 的閱讀結果顯示在每檔股票旁邊。<Term term="rebuilt-analyst">先前分析師</Term>的判定不再決定股票的
                    位置；只用一行小字統計數量，每一個仍保留在各自個股頁面的判定歷史中。
                </p>

                <SubHeading>如何閱讀一列</SubHeading>
                <p>
                    每一列顯示公司、今天的股價與篩選器的排名。Qwen 的閱讀結果就在旁邊：它是何時讀的、能算出價值時的價值
                    與範圍（否則顯示原因）、該價值與股價之間的差距，以及 Qwen 的主張中有幾項已對照申報文件檢查過。差距
                    很大是該去讀分析的理由，不是訊號：許多價值都與股價相差甚遠。篩選器這一側顯示把它列入名單的那道門，以及
                    代表品質、動能、預測修正、價值與預期落差的 Q M R V G 五個小長條。股票高於同類股同業時，長條向上長；
                    低於時向下長。虛線的空長條代表該項<i>缺資料</i>，不是零。
                </p>
                <p>
                    點開一檔股票會前往它的個股頁面。
                </p>

                <SubHeading>Qwen 的價值與範圍</SubHeading>
                <p>
                    當程式碼能根據 Qwen 的選擇算出價值時，個股頁面會對照今天的股價顯示保守、基準與樂觀三個價值。與股價相差
                    很大的價值會被標註，因為輸入可能有誤：請先讀分析。有些公司目前還無法估值，這時會顯示原因而不是數字。
                    所顯示的股價是篩選器評分時用的那個，並註明它所屬的交易日。
                </p>

                <SubHeading>個股頁面</SubHeading>
                <p>
                    單一股票的頁面以 Qwen 的分析開頭：它是何時讀的、依主題列出的主張與其中幾項已在申報文件中獲得證實、
                    有價值時的價值，以及代碼帳本與 Qwen 帳本是否持有這檔股票。如果這檔股票有先前分析師的判定，它仍保留在
                    判定歷史之下。右欄顯示這檔股票如何進入名單、股價所預期的、400 天股價圖、主要財務數字，以及哪些紙上
                    帳本持有它。
                </p>
                <p>
                    <b>⋯ → On-demand</b> 之下是申請表單與 Qwen 的閱讀結果清單，每一筆都連到它的個股頁面。
                </p>

                <SubHeading>顏色說明 — 一種顏色只代表一種意思</SubHeading>
                <ColourKey
                    rows={[
                        { name: '藍色', text: '名單：股票在篩選中走了多遠。你選取的項目與連結也以藍色標示。' },
                        { name: '紫色', text: 'Quality：高品質的企業，以及支撐它的分數。' },
                        { name: '藍綠色', text: 'Value：相對已實現的成長而言便宜，以及支撐它的分數。' },
                        { name: '粉紅色', text: 'Trend：強勁而穩定的價格趨勢。' },
                        { name: '綠色', text: '好：低估、獲利、通過閘門的判定。' },
                        { name: '中性墨色', text: '合理：價格位於價值區間內。' },
                        { name: '珊瑚色', text: '不好：高估、虧損。' },
                        { name: '琥珀色', text: '警告，需要細看：過期的時間戳、通知、暫停買進、一半或四分之一部位。' },
                        { name: '灰色', text: '不算數：被擋下的判定、被否決的股票、沒有資料。' },
                    ]}
                />
                <p>
                    每個有顏色的狀態也都附有文字或符號，所以顏色絕不會是唯一的訊號。
                </p>
            </Section>

            {/* 總體 */}
            <Section id="macro" title="總體引擎 — 經濟背景">
                <p>
                    一個獨立的引擎讀取美國經濟的狀態，並把判讀發布在 <A href="/macro">Macro</A> 頁面。它的數字只來自{' '}
                    <Term term="fred" />；新聞只作為故事的脈絡，絕不轉成數字。
                </p>
                <SubHeading>Macro 頁面顯示什麼</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>景氣情境與它的機率</b>，以「情境，p % — 強度標籤」的形式作為標題。底下是五個經濟季節——
                        goldilocks、reflation、tightening、stagflation、recession——各自的機率（見{' '}
                        <Term term="probability-vector" />）。單一標籤只是摘要，不驅動任何數字。
                    </li>
                    <li>
                        <b>強度標籤。</b>來自引擎的信心程度：低於 0.10 是「訊號弱，僅供參考」；0.10 到 0.30 是「訊號
                        中等」；高於 0.30 是「訊號明確」。
                    </li>
                    <li>
                        <b>原因</b>——七個面向（成長、通膨、政策、信用與流動性、殖利率曲線、貨幣流動性、房市）中，哪些
                        支持或反對這個情境。
                    </li>
                    <li>
                        <b>衝擊警示</b>——針對恐慌、信用、利率、油價、美元、就業與通膨的七個警報（
                        <Term term="shock-register" />），啟動中的會標示出來，資料健康警告則完整列出。
                    </li>
                    <li>
                        <b>資金成本</b>——市場隱含的股權風險溢酬（連同它在自身歷史中的位置）與隱含的{' '}
                        <Term term="cost-of-equity" />，若已劣化會有標記。這就是分析師所採用的折現率基準。
                    </li>
                </ul>
                <SubHeading>什麼是開啟的，什麼是關閉的</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>關閉：類股傾斜。</b>總體判讀可以把更多名單名額給適合當前經濟的類股，但它的選類股能力沒有通過
                        事先登記的檢驗，所以這個判讀尚未證明自己能挑選類股。每個類股都得到相同的{' '}
                        <Term term="sector-quota" />。
                    </li>
                    <li>
                        <b>僅供參考：動盪旗標。</b>恐慌指數（VIX）達到 30 或更高時亮起。它僅供參考顯示；沒有任何真實資金的
                        帳本或部位大小會讀取它。
                    </li>
                    <li>
                        <b>僅供參考：以註明日期的事實呈現情境。</b>情境以註明日期的事實顯示，而不是預測。有一個僅限紙上的帳本，
                        即依風險撥盤月度決定運作的 Equal 帳本，依循這個撥盤；沒有任何真實資金的帳本依循它。
                    </li>
                </ul>
                <Callout kind="info">
                    總體判讀是背景，不是對市場的判斷。它使用的是事後修正過的經濟資料，不是當時可得的（point-in-time）
                    資料。總體時間戳若超過 45 天，會變成琥珀色並標示已過期。
                </Callout>
            </Section>

            {/* 篩選 */}
            <Section id="screen" title="量化篩選 — 三道門">
                <p>
                    篩選不會把一切混成單一分數。一家公司可以因為出色、因為被錯誤定價，或因為處於強勁而穩定的上升趨勢而
                    值得注意——把這些平均成一個數字，哪一種都描述不好。所以有三道<Term term="door" />。股票只需通過一道。
                    篩選的工作是決定分析師讀什麼，讓分析師的時間不會花在從來不值得的公司上。
                </p>
                <div className="space-y-3">
                    <DoorCard color={FAMILY.quality} title="第 1 道門 — Quality（品質・複利成長）">
                        真正賺錢、持續成長、股價上漲的公司。它混合<Term term="quality" />與
                        <Term term="momentum" />，其中品質的比重最大。
                    </DoorCard>
                    <DoorCard color={FAMILY.value} title="第 2 道門 — Value（價值・價值落差）">
                        相對於自己已證明的成長而顯得便宜的公司：價格要求的成長低於公司實際交出的成績（
                        <Term term="expectations-gap" />），而且這檔股票在<Term term="value" />上便宜。
                        <b>下殺刀鋒底線</b>會把急劇下跌的股票擋在外面，因為便宜卻還在下跌，還算不上便宜貨。
                    </DoorCard>
                    <DoorCard color={FAMILY.momentum} title="第 3 道門 — Trend（趨勢・趨勢領頭股）">
                        前兩道門會漏掉的強勁而穩定的上升趨勢——例如整個類股的榮景。最多 20 個額外名額，每個產業群組最多 5
                        個。候選股必須有獲利、規模合理，分析師預測不能在下滑，而且必須是穩定地攀升，而不是靠某一個幸運的月份。
                    </DoorCard>
                </div>
                <SubHeading>各道門如何競爭</SubHeading>
                <p>
                    前兩道門各自把分數換算成<Term term="percentile" />，股票以兩者中較好的那個來競爭。
                    <Term term="champion" />——在兩道門都位居前 10% 的股票——會得到 +2 的小加分，因為同時出色又便宜很罕見。
                    下殺中的刀鋒不能成為冠軍股。在研究台上，把一檔股票列入名單的那道門會以彩色方塊與名稱顯示。
                </p>
                <SubHeading>留在名單上的力量</SubHeading>
                <p>
                    已在名單上的名稱，要明顯掉出才會被移除。這稱為 <Term term="hysteresis" />：排名在 60 名以內時留在
                    Research now，排名在 150 名以內時留在名單上。沒有這個緩衝，卡在切線上的股票會隨著每次小幅價格波動進進出出。
                </p>
                <SubHeading>公平的比較</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        大多數評分是<Term term="sector-neutral" />——銀行與銀行競爭，不與軟體公司競爭——而且任何類股都不得
                        占名單的 18% 以上。
                    </li>
                    <li>
                        <Term term="momentum" />是例外，而且是有用的例外：它也會對照整個市場來解讀，因此帶動整個類股的榮景會
                        保持可見，而不是顯得平凡。
                    </li>
                    <li>
                        對於現金流隨景氣循環波動的週期性企業（石油、天然氣、採礦、航運等），篩選使用多年的現金流平均
                        （石油、天然氣與採礦為<b>8 年</b>，其他週期性企業為<b>3 年</b>），而不是單一一年的好壞。
                    </li>
                </ul>
                <SubHeading>類股傾斜已關閉</SubHeading>
                <p>
                    每個類股都得到相同的基本<Term term="sector-quota" />，也就是名單名額。總體引擎可以把額外名額給適合當前
                    經濟的類股，但它的選類股能力尚未證明自己，所以傾斜被關閉，直到它證明自己為止。
                </p>
            </Section>

            {/* 等級 */}
            <Section id="bands" title="等級、否決與警告">
                <p>
                    篩選的結果是四個<Term term="band" />。前兩個合起來就是名單：
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>RESEARCH NOW</b> — 名單的頂端，大約前 50 到 60 檔。今天值得你花研究時間。</li>
                    <li><b>WATCHLIST</b> — 名單的其餘部分，整份名單共約 150 檔。這是篩選自己的等級名稱，不是判定。</li>
                    <li><b>PASS</b> — 有評分，但不在名單上。</li>
                    <li><b>VETOED</b> — 被安全過濾器剔除。沒有等級，原因寫在旁邊；在研究台上它位於「取消資格」之下。</li>
                </ul>
                <SubHeading>什麼會剔除一檔股票</SubHeading>
                <p>
                    <Term term="veto" />是在各道門評分任何東西之前就套用的硬性取消資格。原因有：股票無法交易、規模太小或
                    成交太清淡、沒有可用的申報基本面、是空殼公司、有長期營運虧損並伴隨沉重債務，或同時出現兩個
                    <Term term="forensic" />紅旗。最後兩項只適用於市值低於 100 億美元的公司。
                </p>
                <SubHeading>什麼只會警告</SubHeading>
                <p>
                    對大型公司，鑑識檢驗是<b>警告</b>：<Term term="beneish" />（疑似操縱盈餘）、
                    <Term term="accruals" />（獲利沒有現金支撐）、Altman Z（財務困境分數）與因發行股票而造成的大量
                    <Term term="dilution" />。警告絕不會剔除市值 100 億美元以上的股票。對較小的公司，只有兩個紅旗同時
                    出現時才會被剔除。這可以避免快速成長的領頭股因為看起來不尋常而被踢出，同時仍把警告顯示給你，讓你可以
                    仔細看看。
                </p>
                <SubHeading>備註不是警告</SubHeading>
                <p>
                    資料備註——例如某檔股票的動能是用月股價算出來的，或它最新的年報已經很舊——描述的是一個數字是如何建立
                    的。它們對公司沒有任何負面的意思，也絕不會剔除股票。
                </p>
                <Callout kind="tip">
                    原則是 <i>annotate, never silently gate（加註，絕不悄悄設卡）</i>：只要可能，疑慮就以附帶原因的旗標
                    顯示，讓你看得到，而不是悄悄把股票刪掉。
                </Callout>
            </Section>

            {/* 分析師 */}
            <Section id="analyst" title="AI 分析師 — 今天是 Qwen，以及先前的判定分析師">
                <Callout kind="info">
                    <b>今天運作中的分析師是 Qwen。</b>Qwen 是跑在本機電腦上的 AI 模型，不是雲端服務。對篩選器名單上的每檔
                    股票，它閱讀該公司的 SEC 申報文件，並依主題寫出主張，例如商業模式、財務健全度、競爭地位、成長與風險。
                    程式碼會把每項主張對照申報文件的文字檢查，個股頁面會顯示有幾項主張已獲證實。在申報文件夠完整時，
                    程式碼會根據 Qwen 的選擇算出保守、基準與樂觀三個價值，但只有在 Qwen 的兩次執行一致時才會如此；否則不顯示
                    價值，並說明原因。與股價相差很大的價值會被標註：請先讀分析，再看數字。Qwen 的分析是研究材料，不是買進或
                    賣出的呼籲，而且 Qwen 尚未以報酬評分。也可以在 On-demand 頁面申請某檔股票。
                </Callout>
                <Callout kind="warn">
                    <b>本節其餘部分，以及關於關鍵分歧、閘門與每日跟進的各節，描述的是先前判定分析師的設計。</b>該分析師在
                    被裁定無效後，於 2026 年 10 月停止。這些文字保留下來，作為它的判定是如何產生的紀錄。
                </Callout>
                <p>
                    名單上的股票曾由先前的 AI 分析師深入估值——就像取得一份審慎的第二意見。工作被分開，讓每個部分做它擅長的事：
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>AI 負責研究</b>，閱讀公司自己的申報文件與附有出處的網路資料，並選定每一項估值輸入。它跑在本機
                        模型（<Term term="llm" />）上，而不是雲端服務。
                    </li>
                    <li>
                        <b>Python 負責每一項計算。</b>AI 是好分析師，卻是不可靠的計算機，所以沒有任何數字交給它的算術。
                    </li>
                    <li>
                        <b>程式碼檢查答案</b>，對照外部錨點：專業分析師的預測與他們的目標價範圍（
                        <Term term="street-fence" />）。
                    </li>
                </ul>
                <SubHeading>判定是相對於區間的方向</SubHeading>
                <p>
                    每檔股票以獨立的執行來估值，每次可用的執行都以一個對企業價值的估計作結。判定建立在幾次執行之上，會
                    印在每一列上（「n of m usable」），絕不假設。判定就是今天的股價相對於整個
                    <Term term="iv-band" />的位置：
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>低估</b> — 股價低於整個區間，且安全邊際至少 10%：每一次執行都說它更值錢。</li>
                    <li><b>高估</b> — 股價高於整個區間，且安全邊際至少 10%：每一次執行都說不要買。</li>
                    <li><b>FAIR</b> — 股價位於區間內，或安全邊際太薄。不確定性涵蓋了價格：沒有優勢。這是一個決定，不是拒絕。</li>
                    <li><b><Term term="not-usable" /></b> — 沒有完整的估值。這是故障，絕不會被顯示為判定。</li>
                </ul>
                <p>
                    只有一次執行時，會顯示為一個點而不是一段範圍，且部位大小受到上限。區間較寬代表各次執行意見分歧，這會讓
                    部位大小建議變小。部位大小建議取四個區間中最保守的一個——各次執行分歧、安全邊際、分析師自己的信心，以及
                    總體動盪旗標——個股頁面印出的上限是天花板，不是建議。請見 <Term term="position-sizing" />。
                </p>
                <SubHeading>時機，以及什麼會證明它是錯的</SubHeading>
                <p>
                    便宜不等於現在。<Term term="entry-timing" />是另一個獨立的判斷——現在買進、等待動能或避開——並附有會
                    翻轉這個判斷的條件。而且在任何部位存在之前，每個判定都會以可檢查的規則事先寫下什麼會證明它是錯的（見{' '}
                    <Term term="thesis-status" />）。
                </p>
                <Callout kind="warn">
                    <b>目前狀態。</b>先前的分析師已停止。它的判定被裁定無效，已被排除在研究台之外，這一切都不是績效紀錄。
                    目前沒有在產生這類新判定。請見 <Term term="rebuilt-analyst" />。
                </Callout>
            </Section>

            {/* 關鍵分歧 */}
            <Section id="crux" title="關鍵分歧 — 股價錯估了什麼">
                <Callout kind="warn">
                    本節描述的是已停止的先前判定分析師。Qwen 的分析不使用關鍵分歧。
                </Callout>
                <p>
                    買進或賣出的判斷必須指出今天股價所錯估的<b>那一個輸入</b>。那就是<Term term="crux" />。它把「分析師說
                    低估」變成一個你可以檢查的主張。
                </p>
                <SubHeading>同一個輸入的兩個數字</SubHeading>
                <p>
                    取估值的某一個輸入——第 3–5 年的成長率、股權成本、成長衰退的時間長度、新資本的報酬率。
                    <Term term="price-implied">價格所隱含的數值</Term>，就是模型要剛好落在今天股價上，該輸入所需要有的
                    值。分析師的值，則是它相信該輸入是多少。兩者之間的差距，就是與市場的分歧。
                </p>
                <SubHeading>由程式碼檢查的引文</SubHeading>
                <p>
                    分析師必須用公司申報文件的引文來支持自己的數字，程式碼會把每一則引文對照指定來源檢查。無法逐字找到的
                    引文不算數。
                </p>
                <SubHeading>沒有有效的關鍵分歧就是 FAIR</SubHeading>
                <p>
                    無法指出有效關鍵分歧的判斷不會得到方向：判定被維持在 FAIR，個股頁面會寫「No valid stated disagreement
                    → verdict held at FAIR」。閘門對同一件事也有自己的原因，
                    <code className="font-mono text-[12px]">directional_without_valid_crux</code>。
                </p>
                <SubHeading>在個股頁面上</SubHeading>
                <p>
                    「股價錯估了什麼」會把每個輸入畫在一條數線上，附有兩個標記——價格所隱含的值，與分析師的值——接著以引文
                    呈現分析師的理由，以及說明所述分歧是否經過驗證（「crux valid」）、輸入是否維持預設值的旗標。如果沒有任何
                    其他單一輸入能解釋股價，會有一行文字說明。關鍵分歧用來解釋判定，並不預測任何事。
                </p>
            </Section>

            {/* 閘門 */}
            <Section id="gate" title="閘門 — 哪些判定算數">
                <Callout kind="warn">
                    本節描述的是已停止的先前判定分析師。沒有新的判定通過閘門。
                </Callout>
                <p>
                    判定寫出之後，程式碼會在每次資料重建時重新檢查它。判定必須通過<Term term="gate">閘門</Term>才算數。
                    每個判定都會標示是否<Term term="actionable" />（是或否），當答案為否時，研究台會用白話列出
                    <Term term="gate-reason" />。沒通過的判定仍然連同原因被發布並顯示，但它絕不會成為建議，也絕不會進入 AI
                    紙上帳本。
                </p>
                <p>閘門可以給出的每一個原因，以及研究台使用的措辭：</p>
                <GateReasons />
                <p>
                    一個判定可以有不只一個原因。研究台在每種語言下都以英文顯示這些原因，所以措辭完全一致。研究台漏斗的
                    「通過閘門」步驟會統計帶有各個原因的列數。
                </p>
                <Callout kind="info">
                    被擋下的判定不會被刪除。它仍會顯示在<i>被閘門擋下</i>之下，作為說過什麼、以及為什麼不算數的紀錄。通過
                    閘門代表判定被允許算數，並不證明判定是對的。
                </Callout>
            </Section>

            {/* 跟進 */}
            <Section id="followup" title="每日跟進 — 監控絕不賣出">
                <Callout kind="warn">
                    <b>重建中；尚未運作。</b>以下的設計在 10 月建成，從未啟用。我們正根據它為持有股票建立新的每日跟進，
                    目前還沒有任何東西用真實資料跑過。以下步驟是 10 月的設計；重建後的版本在細節上會有所不同。
                </Callout>
                <p>
                    每個判定都以一份監看清單作結：一旦發生就重要的事。跟進上線之後，會每天檢查每檔持有股和每檔買進候選股（
                    <Term term="follow-up" />）：
                </p>
                <ol className="list-decimal space-y-2 pl-5">
                    <li>
                        <b>蒐集。</b>新的 SEC 申報文件與先前沒看過的公司新聞，以及最近的收盤價落在判定價值區間之內還是
                        之外。不需要 GPU。
                    </li>
                    <li>
                        <b>程式碼底線。</b>不論任何模型怎麼說，一律會排入重新分析的明確訊號：財報發布；破產、財報重編、
                        下市或控制權變更類型的申報；剛剛成立的論點規則；持有股票上出現安全否決；兩次收盤價落在價值區間的
                        另一側（<Term term="code-floor" />）。
                    </li>
                    <li>
                        <b>本機模型的判讀。</b>它拿當天的資料檢查每個觀察項目，只回答「現在重新分析」或「沒有新消息」。
                        它不會看到判定或任何估值數字，而它引用的每一段文字，都必須能逐字在指定來源中找到，由程式碼檢查。
                    </li>
                    <li>
                        <b>效果。</b>重新分析會插隊到佇列前面（<Term term="reanalysis-queued" />）。新的買進可能被暫停（
                        <Term term="buy-paused" />）。而且每檔股票至少每 14 天會重新分析一次。
                    </li>
                </ol>
                <SubHeading>監控絕不賣出</SubHeading>
                <p>
                    跟進只會要求重新看一次。持有的股票只會被新的判定移除。如果持有股票的重新分析失敗，上一個良好的判定會被
                    延續，最多兩次失敗或 21 天，研究台會把它標為
                    <Term term="held-carry">持有中——判定複查中</Term>。暫停買進絕不代表賣出。如果跟進資料超過 36 小時或缺失，
                    該股票會被視為暫停，而不是可買進。
                </p>
                <p>
                    在網站上，這會變成研究台的<Term term="waiting" />區段，以及每個個股頁面的「我們在關注什麼」：每個觀察
                    項目連同其狀態（已出現、未找到、不明確）、它會破壞還是印證論點、引文、來源與日期，以及引文是否經過驗證。
                </p>
            </Section>

            {/* 上線 */}
            <Section id="relaunch" title="運作中、已停止與下一步">
                <p>截至 2026 年 11 月 12 日，系統各部分的狀態：</p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>運作中。</b>篩選器與它的每日評分；個股頁面上 Qwen 的分析；以及從 2026 年 11 月 6 日起每天以紙上
                        方式標記的代碼帳本與 Qwen 帳本。
                    </li>
                    <li>
                        <b>已停止。</b>先前的判定分析師與它的閘門。它的 AI 紙上帳本只持有現金。它的紀錄保留在 Track 頁面，
                        標示為已停止的分析師所有。
                    </li>
                    <li>
                        <b>重建中。</b>持有股票的<A href="#followup">每日跟進</A>。尚未運作。
                    </li>
                    <li>
                        <b>關閉。</b>真實資金的鏡像已停止。本站絕不交易。
                    </li>
                    <li>
                        <b>下一步。</b>每個月會建立新的月度帳本；下一個預定在 2026 年 11 月 30 日。Qwen 帳本是否打敗代碼帳本
                        還沒有被衡量，要等帳本累積好幾個月的標記後才讀得出來。
                    </li>
                </ul>
                <SubHeading>先前的 AI 紀錄</SubHeading>
                <p>
                    先前分析師的紀錄沒有重置，因為該分析師並未再次上線。它保留在 Track 頁面，標示為已停止的分析師所有，
                    而且不容許任何結論（<Term term="record-reset" />）。
                </p>
            </Section>

            {/* 績效紀錄 */}
            <Section id="track" title="績效紀錄 — 誠實的量尺">
                <p>
                    系統不展示討好人的<Term term="backtest" />，而是每天對它每月的選股進行{' '}
                    <Term term="paper-trading" />，使用真實價格與假設的<Term term="transaction-costs" />。如果系統錯了，
                    這個頁面會說出來。這裡的每個數字都是紙上（模擬）的，而且涵蓋的期間很短。
                </p>
                <SubHeading>先前分析師的判定成績單</SubHeading>
                <p>
                    它排在任何報酬之前，而且它是已停止分析師的紀錄，不是 Qwen 的：這個頁面上沒有任何東西為 Qwen 評分。
                    它顯示三個數量——由有效分析師評分的判定、由舊分析師評分的判定（標示為舊版、無定論）、
                    以及仍待評分的判定（<Term term="graded-pending" />）——再加上四個期間方塊（30、91、182 與 365 天），
                    列出各期間可評分的數量。下方印出方法：進場是判定日當天或之後的第一個收盤價，基準使用相同日期，一個
                    期間只有在完全過去之後才會被評分，而且同一檔股票的重複判定彼此相關。資料檔自己的提醒（caveats）會逐字
                    顯示。只要來自有效分析師的數量為零，就不會顯示平均超額報酬或勝出比例這類標題數字。
                </p>
                <SubHeading>橫幅</SubHeading>
                <p>
                    頂端的橫幅說明：頁面上的每個帳本都是紙上帳本；代碼帳本與 Qwen 帳本從 2026 年 11 月 6 日開始，運行時間
                    太短，什麼都還顯示不出來；Qwen 尚未以報酬評分；而成績單與舊的 AI 帳本屬於已停止的分析師。
                </p>
                <SubHeading>紙上帳本</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>Qwen 帳本</b> — 代碼帳本的選股，但當 Qwen 閱讀申報文件發現重大事件時，該名額改以現金持有。
                        每月組成，每個名額等權重。
                    </li>
                    <li>
                        <b>代碼帳本</b> — 只有篩選器的月度選股，也就是 Qwen 檢查之前的同一批股票。
                    </li>
                    <li>
                        <b>舊 AI 帳本（已停止）</b> — 曾跟隨先前分析師通過閘門的判定（<Term term="rn-depth" />）。它只持有現金。
                    </li>
                    <li>
                        <b>Gemini 帳本（暫行）</b>與<b>代碼基準（引擎 v2.1）</b> — 10 月起的對照帳本，僅限紙上。它們的選股在
                        10 月中旬停止更新。
                    </li>
                    <li>
                        <b>對照帳本</b> — 不含 AI，持有每一檔 Research now 的股票（<Term term="control-book" />），
                        自 2026 年 6 月起。
                    </li>
                    <li>
                        <b>我的帳本</b> — 你自己儲存的持股，像基金一樣追蹤（<Term term="unitization" />），讓追加資金絕不會
                        造成績效假象。未登入時，它會請你登入。
                    </li>
                </ul>
                <p>
                    每個帳本顯示它的報酬、相對 QQQ 的表現、最大回撤、勝率、持有中的部位與平均持有期間。報酬與基準比較的下方
                    是背後的<Term term="observations" />。<Term term="sharpe-ratio" />與<Term term="cagr" />在觀測數過少時
                    會被隱藏——頁面會寫「n 筆觀測下沒有意義」——因為只有幾週資料的年化比率只是雜訊。
                </p>
                <SubHeading>Growth of 100 與帳本</SubHeading>
                <p>
                    Growth of 100 把各帳本與基準（<Term term="qqq" />、<Term term="spy" />、<Term term="iwm" />與其他幾個）從同一個起點
                    畫出，附有區間選擇器與會為每筆交易重新計算成本的成本假設欄。帳本列出
                    Qwen 帳本的交易與白話原因（例如「entered at the monthly formation」），沒有交易的日子則顯示為「no changes」。
                </p>
                <SubHeading>誠實的規則</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>交易發生在<b>訊號之後的第一個收盤價</b>，因為訊號只有在存在之後才能據以行動。</li>
                    <li>每筆交易都包含成本。</li>
                    <li>基準使用與交易相同的日期。</li>
                </ul>
                <SubHeading>如何解讀</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>對照帳本 vs QQQ</b> — 唯有選股打敗<Term term="benchmark" />QQQ，選股才算有效。</li>
                    <li><b>Qwen 帳本 vs 代碼帳本</b> — 只有當 Qwen 帳本打敗代碼帳本時，Qwen 的申報文件檢查才算物有所值。這還沒有被衡量：帳本從 2026 年 11 月 6 日才開始。</li>
                    <li><b>我的帳本 vs 其他</b> — 你自己的偏離會以<Term term="behavior-gap" />的形式顯現。</li>
                </ul>
                <Callout kind="info">
                    <Term term="not-yet-proven">尚未證明。</Term>這個頁面上沒有任何東西顯示系統能打敗市場。
                </Callout>
            </Section>

            {/* 投資組合 */}
            <Section id="portfolio" title="我的投資組合 — 檢查你自己的持股">
                <p>
                    Portfolio 頁面是為你的<b>實際</b>持股而設。加入股票代號與金額（美元），或貼上券商匯出的資料。除非你登入，
                    否則只會儲存在這個瀏覽器中。每一筆持股都會與系統對照，結果會以系統的立場（stance）顯示在它旁邊。
                </p>
                <p>立場用語及其意義：</p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>NO COVERAGE</b> — 該股票不在篩選的股票範圍內。</li>
                    <li><b>✕ VETOED · 原因</b> — 被安全過濾器剔除。</li>
                    <li><b>NO ANALYSIS YET</b> — 先前的分析師從未為它估值。</li>
                    <li><b>BLOCKED · 原因</b> — 有判定，但未通過閘門。絕不是訊號。</li>
                    <li><b>REDUCE (overvalued)</b>、<b>FAIR</b> 與 <b>BUY · 部位大小</b> — 判定通過閘門，並分別說高估、合理或低估。</li>
                    <li><b>NO PLAUSIBLE RUN</b> — 沒有任何可用的執行。</li>
                </ul>
                <p>
                    立場來自先前分析師的判定，而該分析師已停止；Qwen 的閱讀結果在各個股頁面上，不屬於立場的一部分。BUY 與
                    REDUCE 是系統對一份研究名單所貼的標籤，絕不是對你的建議。若有的話，
                    論點與跟進狀態會顯示在各持股旁邊。頁尾列出你的總額、現金比重、單一類股超過 25% 規則時的警告，以及今天
                    舊 AI 帳本持有什麼。你的持股也會餵給<A href="#track">績效紀錄</A>上的我的帳本。
                </p>
                <Callout kind="info">
                    這個頁面沒有配置計畫。本站不再替你建立投資組合——舊的凱利規模帳本與主題配置已經退役。至於目前還剩下哪些
                    部位大小指引，請見 <Term term="position-sizing" />。
                </Callout>
            </Section>

            {/* 封存區 */}
            <Section id="lenses" title="封存區 — 保留供參考的已退役頁面">
                <p>
                    <b>⋯ → Archive</b> 之下是本站舊版本留下的頁面，每個都標示為已退役（retired）：
                    <A href="/lenses">舊版鏡頭</A>（百倍股與 Reverse 篩選）、AI 封存區與 YouTube 策略。它們只是保留供參考。
                    它們<b>不是</b>現行系統，研究台上沒有任何東西是用它們建立的。研究台本身只有一種檢視；舊的 Quant 與
                    Compare 切換已經不存在。
                </p>
            </Section>

            {/* 驗證 */}
            <Section id="validation" title="系統如何被驗證">
                <p>四個習慣讓系統保持誠實：</p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>先有規則，再有結果。</b>通過／不通過的規則在看到結果之前就寫下，所以事後無法為了好看而調整
                        （那就會是 <Term term="overfitting" />）。
                    </li>
                    <li>
                        <b>為判定評分。</b>評分器會拿 30、91、182 與 365 天內的股價表現，對照 <Term term="iwm" />、
                        <Term term="spy" />與 QQQ，檢查每個判定。一個期間只有在完全過去之後才會被評分，基準使用與判定相同的
                        日期，而且同一檔股票的重複判定被視為彼此相關，而非獨立。
                    </li>
                    <li>
                        <b>一個對照組。</b>最尖銳的問題是：Qwen 的閱讀有沒有在篩選之上多帶來什麼。代碼帳本與 Qwen 帳本
                        就是為了回答這個問題而存在：如果 Qwen 帳本打不贏代碼帳本，Qwen 的申報文件檢查就沒有為選股多帶來
                        什麼。這個比較還沒有被衡量。
                    </li>
                    <li>
                        <b>紙上帳本。</b><A href="#track">績效紀錄</A>的帳本每天以真實價格與假設成本交易。
                    </li>
                </ul>
                <p>
                    負面的結果也會公布。總體的類股傾斜沒有通過檢驗而被關閉，總體頁面也如實說明。
                </p>
                <Callout kind="warn">
                    <b>尚無結論。</b><Term term="not-yet-proven" />：至今被評分的每個判定都來自先前的分析師，而它已被裁定無效，
                    Qwen 也尚未以報酬評分。要等月度帳本累積足夠月數的標記，才能對任何一方得出結論。
                </Callout>
            </Section>

            {/* 資料 */}
            <Section id="data" title="資料從哪裡來，以及系統狀態">
                <ul className="list-disc space-y-2 pl-5">
                    <li><Term term="sec-filings" /> — 透過 <Term term="company-facts" /> 取得的 10 年申報當下原貌基本面（品質、鑑識警告與已證明成長的基準事實），以 <Term term="point-in-time" /> 方式保存。</li>
                    <li><Term term="yahoo-finance" /> — 股價、分析師<Term term="estimates" />與覆蓋情況。</li>
                    <li><Term term="fred" /> — 總體引擎背後的美國經濟序列。</li>
                    <li>新聞 — 只作為敘事脈絡。絕不轉成數字。</li>
                </ul>
                <SubHeading>兩個時鐘</SubHeading>
                <p>
                    評分鏈在平日於雲端重新執行好幾次，收盤後也會更新。雲端排程可能延遲，所以每個檔案都帶有自己的時間戳。
                    Qwen 則另外在有一張 GPU 的本機電腦上執行，依自己的時鐘發布它的分析。
                </p>
                <SubHeading id="health">系統狀態</SubHeading>
                <p>
                    每個頁面頂端列下方的那一行，回答的是「有沒有什麼過期或壞掉了？」：
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>三個時間戳</b> — <i>prices as of</i>（價格所屬的交易日）、<i>book scored</i> 與
                        <i>Qwen analysis</i>（它最新的發布）。時間戳超過預期時效時，會變成帶有 ● 的琥珀色：收盤後更新超過 3 天時是
                        價格，超過 36 小時是名單，超過 14 天是 Qwen 分析。
                    </li>
                    <li>
                        <b>狀態點</b> — 一切正常時是綠色。時間戳過期、折現率不是來自總體基準，或總體判讀劣化時是琥珀色。
                        鏈條自己的完整性檢查失敗，或最近 7 天內有錯誤警示時是紅色。
                    </li>
                    <li>
                        <b>右側的總體標籤</b> — 顯示情境、它的機率、強度標籤與股權成本，連結到 <A href="/macro">Macro</A>。
                        超過 45 天的總體時間戳會變成琥珀色。
                    </li>
                </ul>
                <p>
                    點擊狀態點會開啟狀態抽屜。它是唯讀的：Freshness（每個時間戳與其預期週期）、Analyst（狀態、基線進度，
                    以及真實資金鏡像已停止）、Alerts（來自紙上帳本的警示）與 Checks（鏈條的完整性檢查、折現率來源、總體
                    警告與跟進狀態）。載入失敗的檔案會顯示為未載入，而不是失敗。抽屜裡沒有任何操作控制。
                </p>
            </Section>
        </>
    );
}
