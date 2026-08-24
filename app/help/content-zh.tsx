'use client';

// ─────────────────────────────────────────────────────────────────────────────
// /help — 繁體中文正文 (Traditional Chinese body)
//
// The Chinese-language version of the handbook sections (welcome → data).
// Rendered by page.tsx when the site language is Chinese. The <Term> links and
// glossary popups are fully localized via lib/glossary-zh.ts.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { BookMarked, FlaskConical } from 'lucide-react';
import { Term } from '@/components/GlossaryTerm';
import { Section, SubHeading, Callout } from './help-ui';
import { PipelineDiagram, AiAnalysisFlow } from './WorkflowDiagram';

export function ChineseHelpBody() {
    return (
        <>
            {/* 歡迎 */}
            <Section id="welcome" title="歡迎 — 這個網站是什麼（以及不是什麼）" icon={<FlaskConical className="h-5 w-5" />}>
                <p>
                    每天，一台電腦讀取大約 <b>6,600 檔美國股票</b>的財務報告與股價歷史，並在單一排行榜上為它們排名。
                    排行榜頂端 = 支持該股票的證據最多。就是這樣。本手冊說明這些證據是如何組成的、畫面上每個數字與
                    旗標的意義，以及這個系統刻意 <i>不做</i> 的事。
                </p>
                <Callout kind="warn">
                    <b>這裡不會買賣任何東西，這裡也不是投資建議。</b>這是一份攤開證據的研究候選名單——一台把 6,600 檔
                    股票縮小到值得你花 <i>研究時間</i> 的名單的機器。即使是紙上投資組合也不會真的執行交易（它們誠實地，
                    以真實價格與真實成本模擬）。
                </Callout>
                <p>
                    帶有 <span className="border-b border-dotted border-pos/40 font-semibold text-pos">點狀底線</span>的
                    字是技術詞彙。點擊即可不離開頁面看到解釋。所有詞彙的可搜尋索引在{' '}
                    <Link href="#glossary" className="font-bold text-pos hover:underline">詞彙表</Link>區段。
                </p>
            </Section>

            {/* 流程 */}
            <Section id="pipeline" title="每天發生什麼事 — 流程" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    畫面背後是一連串的作業鏈，透過 <Term term="github-actions" /> 每天自動重新執行。編排器強制執行
                    順序並檢查資料完整性，讓過時或殘缺的資料永遠無法悄悄污染你的排名。
                </p>
                <PipelineDiagram />
                <AiAnalysisFlow />
                <p>
                    一切皆 <Term term="point-in-time" />：每個記錄的訊號只用當下確實存在的資訊。這個紀律正是績效紀錄
                    可信的原因。
                </p>
            </Section>

            {/* 排行榜 */}
            <Section id="leaderboard" title="如何閱讀排行榜 — Rankings 分頁" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    Rankings 分頁是一張以單一數字——<Term term="composite" />——為整個宇宙排名的表格。各欄的意義如下。
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>Rank（排名）</b> — 今天在約 6,600 檔受評美股排行榜上的位置。#1 現在擁有最強的整體證據。</li>
                    <li>
                        <b>Composite（綜合評分）</b> — 用來為一切排名的數字（0–100）。它合併五個因子評分，每個都在
                        股票自己的 <Term term="sector-neutral" /> 比較組內衡量，再套用安全 <Term term="haircut" />。越高
                        代表支持該股的證據越多。
                    </li>
                    <li><b>Factor mix（因子構成）</b> — 是什麼在推動這檔股票的分數。貢獻長條顯示各因子佔比：綠=價值、藍=品質、琥珀=動能、紫=低波動、粉=財測修正。越長代表貢獻越大。</li>
                    <li>
                        <b>Band（等級）</b> — 排名在實務上的意義（<Term term="research-now" />、<Term term="watchlist" />、
                        <Term term="monitor" />、<Term term="pass" />）。紅牌代表股票被 <Term term="veto" />——原因寫在牌上。
                    </li>
                    <li><b>Market cap（市值）</b> — <Term term="market-cap" />。整家公司的價格（股價 × 股數）。</li>
                    <li><b>RS2 排名 / 立場 / 信念度 / 動作</b> — 獨立的 AI 判斷。見 <Link href="#rs2" className="font-bold text-pos hover:underline">RS2 區段</Link>。</li>
                    <li><b>Δ pctl</b> — 量化引擎與 AI 相差多少個百分位點。落差大的列最有趣：其中一方錯了。</li>
                    <li><b>DCF gap</b> — <Term term="expectations-gap" />。價格要求的成長 vs 公司實際達成的成長。見 <Link href="#dcf" className="font-bold text-pos hover:underline">DCF 區段</Link>。</li>
                </ul>
                <Callout kind="info">
                    點擊任何一列可看個股詳情：完整因子輪廓、反向 DCF 解讀（價格隱含的成長 vs 公司已證明的成長），以及
                    RS2 本機 LLM 的研究與判斷。
                </Callout>
            </Section>

            {/* 因子 */}
            <Section id="factors" title="五個因子 — 分數的原料" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    每檔股票以五種在歷史上預測過報酬的特質評分。關鍵是，每項評分都是 <Term term="sector-neutral" /> 的——
                    超市與超市競爭，不與軟體公司比較。否則「動能高」就只是「是科技股」。
                </p>
                <div className="space-y-3">
                    <div className="border border-rule-10 bg-white/5 p-3">
                        <p className="flex items-center gap-2 text-sm font-extrabold"><span className="h-2.5 w-2.5 bg-factor-value" /><span className="text-pos">價值 (Value)</span></p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-q">
                            是用 $1 買 $2 的年度現金盈餘，還是用 $2 買 $1？長期平均而言，便宜勝過昂貴。以四種收益率——
                            <Term term="fcf-yield" />、<Term term="owner-earnings" />、<Term term="ebit" />、<Term term="earnings-yield" />——的
                            平均衡量。見 <Link href="#methodology" className="font-bold text-pos hover:underline">方法論</Link>。
                        </p>
                    </div>
                    <div className="border border-rule-10 bg-white/5 p-3">
                        <p className="flex items-center gap-2 text-sm font-extrabold"><span className="h-2.5 w-2.5 bg-factor-quality" /><span className="text-accent">品質 (Quality)</span></p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-q">
                            公司是否持續真正賺錢、帳目乾淨？結合 <Term term="revenue-quality" />、數年來 <Term term="gross-margin" />
                            的穩定性、<Term term="accruals" />（偏好有現金支撐的盈餘）、<Term term="piotroski" /> 與 <Term term="roic" />。
                            帳目乾淨、真正獲利的生意勝過故事。
                        </p>
                    </div>
                    <div className="border border-rule-10 bg-white/5 p-3">
                        <p className="flex items-center gap-2 text-sm font-extrabold"><span className="h-2.5 w-2.5 bg-factor-momentum" /><span className="text-warn">動能 (Momentum)</span></p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-q">
                            過去一年這檔股票是否一直在贏？贏家往往再贏一陣子。由 <Term term="skip-month" />（學術標準的
                            12 個月報酬、排除最近一個月）與 <Term term="high-proximity" /> 構成。為何排除最近一個月見{' '}
                            <Term term="reversal" />。
                        </p>
                    </div>
                    <div className="border border-rule-10 bg-white/5 p-3">
                        <p className="flex items-center gap-2 text-sm font-extrabold"><span className="h-2.5 w-2.5 bg-factor-lowvol" /><span className="text-ink-2">低波動 (Low volatility)</span></p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-q">
                            價格平穩還是劇烈波動？平穩股票歷史上一單位痛苦換來更多報酬。以月報酬標準差（至少 12 個觀察值）
                            的負值衡量。<Term term="annualized-volatility" /> 也會輸出供 <Term term="kelly" /> 部位規模使用。
                        </p>
                    </div>
                    <div className="border border-rule-10 bg-white/5 p-3">
                        <p className="flex items-center gap-2 text-sm font-extrabold"><span className="h-2.5 w-2.5 bg-factor-revisions" /><span className="text-neg">財測修正 (Revisions)</span></p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-q">
                            追蹤公司的分析師是在上調還是下修預測？方向很重要。由標準化的 <Term term="eps-trajectory" /> 斜率
                            與結構化 <Term term="estimates" /> 評分構成。
                        </p>
                    </div>
                </div>
                <SubHeading>為什麼每個原料都同等重要</SubHeading>
                <p>
                    想像在評判 <Term term="factor" /> 十項全能：你可以試著猜哪個單項最重要，但數十年的研究顯示這種猜測會
                    反噬——在過去資料中找到的「完美」權重極少能在未來資料中存活。所以五個原料完全等權重（<Term term="equal-weight" />）。
                    無聊、謙遜，但更有效。本站仍以 <Term term="rank-ic" /> 每月衡量每個因子的預測力作為診斷——只是絕不讓
                    短樣本主導引擎。
                </p>
                <Callout kind="tip">
                    缺少的因子不會悄悄毀掉一檔股票：價值、品質或動能任一缺失，該股會被標記為 <i>因子不足</i>，而非用殘缺
                    資料評分。當非必要因子缺失時，其餘權重會重新正規化，讓綜合分數保持可比。
                </Callout>
            </Section>

            {/* 等級·否決·折價 */}
            <Section id="bands" title="等級、否決與安全折價" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    綜合百分位切成四個實用區間，即 <Term term="band" />。
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><span className="font-extrabold text-pos">RESEARCH NOW</span> — 前 3%。今天值得你的研究時間。</li>
                    <li><span className="font-extrabold text-accent">WATCHLIST</span> — 前 10%。</li>
                    <li><span className="font-extrabold text-warn">MONITOR</span> — 前 30%。</li>
                    <li><span className="text-ink-2">PASS</span> — 其餘。</li>
                </ul>
                <SubHeading>否決 — 硬性取消資格</SubHeading>
                <p>
                    有些股票無論分數多好都無法入選——就像照片很美、但結構檢驗沒過的房子。<Term term="veto" /> 在評分前套用，
                    所以被否決的股票完全沒有綜合分數。原因包括：逆向引擎安全檢查未過（<i>reverse_engine_reject</i>）、兩個
                    財報鑑識警報同時響起（<Term term="beneish" /> + 高 <Term term="accruals" />）、因 <Term term="dilution" /> 而
                    過度發行，或（在 AI 鏡頭中）強烈迴避/賣出。原因寫在紅牌上。
                </p>
                <SubHeading>安全折價</SubHeading>
                <p>
                    原始分數與最終排名之間套用三個乘法 <Term term="haircut" />。<b>存活度</b> = 0.7 + 0.3×(存活度/100)、
                    <b>資料品質</b> = min(1, 0.8 + 0.04×資料品質)、<b>財報鑑識</b> = 若 Beneish 或應計警報僅單獨響起則 0.85
                    （兩者同時是否決而非折價）。結果重新排名，讓脆弱或可疑的股票被降名而非剔除。
                </p>
            </Section>

            {/* DCF */}
            <Section id="dcf" title="預期落差 — 價格悄悄承諾的事" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    每一檔股票的價格都內含對未來成長的承諾。<Term term="reverse-dcf" /> 把那個承諾抽成數字——市場向你要價的{' '}
                    <Term term="implied-growth" />——方法是以 <Term term="bisection" /> 解出讓標準 <Term term="dcf" /> 等於目前
                    價格的成長率。
                </p>
                <p>
                    <b>DCF gap</b> 欄把這個承諾與現實比較：<Term term="implied-growth" /> − <Term term="demonstrated-growth" />
                    （最近 5 年 SEC 申報的營收/FCF 成長），以百分點計。
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><span className="font-extrabold text-pos">綠 / 負值</span> — 價格要求的成長低於公司已證明。潛在便宜貨：
                    你不必相信成長故事就得到補償。</li>
                    <li><span className="font-extrabold text-warn">琥珀 / 正值</span> — 價格需要無人證明的加速。你必須相信一個故事。</li>
                </ul>
                <Callout kind="tip">
                    這個落差也是建議計畫所用的 <Term term="edge" />：只有定價低於已證明成長的股票才具可測量的優勢，所以排名
                    高但昂貴的股票會被以「無凱利優勢」略過。
                </Callout>
            </Section>

            {/* 鏡頭 */}
            <Section id="lens" title="鏡頭 — 你用誰的眼睛看" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    Rankings 頁頂端的單一切換決定你看誰的排名。
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>Quant（量化）</b> — 決定論的因子引擎。對財務報表與股價的純數學，沒有 AI。這是最原始、不變的視圖。</li>
                    <li><b>RS2 LLM</b> — 本機 AI 分析師自己的名單，透過閱讀每家公司的實際申報文件撰寫獨立判斷而建立。</li>
                    <li><b>Compare（比較）</b> — 兩者並排，落差最大者在前。為每個名字計算差異百分位（Δ pctl）；落差大正是
                    某一方錯的地方。</li>
                </ul>
                <p>
                    AI 在量化等級設定 <i>之後</i>套用：它可以升級、降級或否決，建立平行排名。量化基準不會被覆寫，因此兩份
                    名單都看得到，讓你看清它們在哪裡分歧。
                </p>
            </Section>

            {/* RS2 */}
            <Section id="rs2" title="RS2 — AI 的第二意見" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    RS2 是 <Term term="llm" />，閱讀每家公司的實際 SEC 申報文件並撰寫獨立判斷——就像取得第二位醫師的意見。
                    它為每個名字產出：
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><Term term="stance" /> — 低估 / 合理 / 高估（彩色藥丸）。</li>
                    <li><Term term="conviction" /> — 它對自己判斷的信心，0–15。</li>
                    <li><Term term="action" /> — 買進 / 持有 / 減碼 / 迴避…是研究用的意見，不是委託單。</li>
                    <li>
                        它自己的 DCF 解讀。其 <Term term="intrinsic-value" /> 錨定於分析師共識區間並折現回 <Term term="present-value" />——
                        因此 <Term term="margin-of-safety" /> 衡量的是「今天」的便宜程度，而非 12 個月目標價。
                    </li>
                </ul>
                <SubHeading>AI Research Now 門檻</SubHeading>
                <p>
                    AI 的 Research Now 名單以 RS2 的結構化訊號——安全邊際與進場時機——為門檻，分兩級：<b>深度價值</b>
                    （MoS ≥ 30%）無論信念度皆入選；<b>中度價值</b>（MoS ≥ 15%，或真正的新買進）還需要信念度 ≥ 9.5。
                    偏空判斷會被降出 Research Now；強烈迴避/賣出是否決。
                </p>
                <p>
                    當股票跌出量化 Research Now 名單，RS2 會寫 <Term term="exit-review" />：給現有持有人的持有/減碼/賣出判斷，
                    以琥珀色「LLM EXIT」旗標顯示。
                </p>
            </Section>

            {/* 績效紀錄 */}
            <Section id="track" title="績效紀錄 — 誠實的量尺" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    與其展示討好人的 <Term term="backtest" />，系統每天以真實價格與真實 <Term term="transaction-costs" />{' '}
                    <Term term="paper-trading" />自己的選股，且記錄只能附加、無法編輯。若機器錯了，這個頁面會公開地、永久地
                    承認。這就是重點。
                </p>
                <SubHeading>投資組合</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b className="text-pos">plan</b> — 價值核心。<Term term="kelly" /> 規模，約 50% 現金。</li>
                    <li><b className="text-series-plan2">plan2</b> — 混合。價值核心 + <Term term="sleeve" />，約 78% 投入，持有昂貴的領頭股。</li>
                    <li><b className="text-accent">equal</b> — 對所有 Research Now 股票等權重（純選股測試）。</li>
                    <li><b className="text-ink-2">mine</b> — 你儲存的 My Portfolio 持股，以 <Term term="unitization" /> 如基金般衡量。</li>
                </ul>
                <SubHeading>如何解讀</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>plan vs plan2</b> — plan2 贏代表這期間為品質領頭股付錢勝過價值紀律；plan 贏代表紀律（與現金）有回報。</li>
                    <li><b>plan vs equal</b> — plan 贏代表部位規模機制有加分。</li>
                    <li><b>equal vs IWM</b> — 選股本身有效，如果選股贏過小型股 <Term term="benchmark" />。</li>
                    <li><b>mine vs plan</b> — 你自己的偏離在花錢：那就是 <Term term="behavior-gap" />。</li>
                    <li><b>「賣太早」旗標</b> — 賣出後繼續上漲的股票。此型態若重複出現，代表出場規則需要修改。</li>
                </ul>
                <p>
                    <Term term="sharpe-ratio" /> 與 <Term term="cagr" /> 要等累積夠多天實測資料後才出現；初期此頁刻意平淡。
                    另有假設式覆蓋可依你自己的費率重新計價，看看手續費的拖累。
                </p>
            </Section>

            {/* 投資組合 */}
            <Section id="portfolio" title="投資組合 — 部位規模與建議計畫" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    投資組合頁有兩個非常不同的部分。請仔細看標籤。
                </p>
                <SubHeading>My Portfolio（上）— 你的實際持股</SubHeading>
                <p>
                    輸入你的實際持股（只存在這個瀏覽器）。每一檔都與模型對照：四分之一 <Term term="kelly" /> 建議規模、
                    超配/低配判斷，若持股被 <Term term="veto" /> 或在覆蓋之外則有大旗標。績效紀錄中的「mine」帳本即使用這些，
                    如基金般單位化。
                </p>
                <SubHeading>建議計畫（下）— 不是你的投資組合</SubHeading>
                <p>
                    由 Research Now 名單機器建構的配置，有 <b>價值核心 / 混合</b> 切換：
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>價值核心（plan）</b> — 四分之一凱利規模。<Term term="edge" /> = 預期落差約 3 年內收斂，風險 ={' '}
                        <Term term="volatility" />，f = 0.25 × 優勢/風險²，上限 5%。<Term term="forensic" /> 旗標減半、
                        GPR 2–3 與內部人賣出時縮小、類股 25% / 主題 30% 上限，其餘留在 <Term term="cash" />（常約 50%）。
                    </li>
                    <li>
                        <b>混合（plan2）</b> — 同一個價值核心，再加上無論估值落差都買進頂尖股票的 <Term term="sleeve" />（上限約
                        <Term term="book-value" /> 35%），因此能持有核心拒絕的昂貴領頭股並動用閒置現金（約 78% 投入）。
                        外衣列以粉紅色顯示。
                    </li>
                </ul>
                <Callout kind="warn">
                    為什麼兩個？價值核心在衰退中保護你（不會為昂貴買單），但在暴漲中落後；混合捕捉領頭股，但回檔更深（更大的{' '}
                    <Term term="drawdown" />）。績效紀錄顯示兩者實際表現。
                </Callout>
                <SubHeading>總體去風險</SubHeading>
                <p>
                    <Term term="macro-flags" /> 是來自 <Term term="fred" /> 資料的警示燈。2 個以上亮起時，所有建議規模自動
                    減半（<Term term="macro-derisk" />）。頁上以醒目的琥珀色橫幅顯示。
                </p>
            </Section>

            {/* 覆蓋標記 */}
            <Section id="overlays" title="覆蓋標記與財報鑑識旗標" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    覆蓋是脈絡 <i>旗標</i>，絕不加進分數。它們縮小部位、要求更大的安全邊際，或質疑你的論點。
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>GPR 0–3</b> — <Term term="gpr" />。依公司實際業務輪廓（營收地域、供應鏈、監管、制裁）標記。
                        絕不是買賣訊號；第 3 級時縮小部位、要求更大安全邊際。
                    </li>
                    <li>
                        <b>▲/▼ INSIDERS</b> — <Term term="informed-demand" />。空頭退場期間內部人淨買進（▲，確認），或內部人在
                        偏高 <Term term="short-interest" /> 中賣出（▼，質疑論點）。只是確認或警告。
                    </li>
                </ul>
                <SubHeading>財報鑑識旗標</SubHeading>
                <p>
                    財報鑑識資料庫——<Term term="beneish" /> M 分數、Sloan <Term term="accruals" />、淨發行、財務資料庫——產生
                    計畫列上顯示的 <Term term="forensic" /> 旗標。單一警報是 0.85 折價；兩者同時是 <Term term="veto" />。
                </p>
            </Section>

            {/* 主題 */}
            <Section id="themes" title="主題 — 是脈絡，不是因子" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    <Term term="theme" /> 是股票所屬的市場敘事（AI、半導體、生技等）。主題歸屬與評分僅供 <b>定向</b> 與{' '}
                    <b>過熱（crowding）警告</b>，<b>絕不加入綜合分數</b>。
                </p>
                <Callout kind="warn">
                    這是刻意的：單純追逐主題在歷史上摧毀價值——專業主題 ETF 平均每年 −3.1%（Ben-David et al. 2023）。本站不會讓
                    熱門敘事悄悄灌水分數。在計畫中，主題受 30% 主題上限約束，避免單一過熱故事接管整個組合。
                </Callout>
            </Section>

            {/* 方法論 */}
            <Section id="methodology" title="方法論 — 專業人士用" icon={<BookMarked className="h-5 w-5" />}>
                <SubHeading>評分流程 — 確切機制</SubHeading>
                <p>
                    宇宙：逆向引擎評分的所有名字（約 6,600 檔美股）。每個子指標在 <i>類股內</i> <Term term="winsorize" />（第
                    1/99 百分位）後，再在類股內 <Term term="zscore" />。因子 z = 該因子可用子指標的平均。綜合 z = 可用因子
                    的權重重新正規化總和（缺少的因子退出，其餘權重重新縮放；價值、品質、動能為 <i>必要</i>——缺少任一者
                    標記為 <i>insufficient_factors</i>，而非用殘缺資料評分）。
                </p>
                <p>
                    綜合 z → 橫截面 <Term term="percentile" />（0–100）→ 三個乘法 <Term term="haircut" />（存活度、資料品質、
                    財報鑑識）→ 重新排名 → 最終百分位決定 <Term term="band" />：≥97 research_now、≥90 watchlist、≥70 monitor、
                    其餘 pass。
                </p>
                <SubHeading>因子構成 — 子指標與來源</SubHeading>
                <p>
                    <span className="font-extrabold text-pos">價值</span> = 四種收益率的平均 z。皆以最近會計年度 SEC 申報
                    財務除以目前市值計算。<Term term="fcf-yield" />（FCF/市值）、<Term term="owner-earnings" />（(淨利 + 折舊攤銷 −
                    資本支出)/市值）、<Term term="ebit" /> 收益率（營業利益/<Term term="enterprise-value" />）、<Term term="earnings-yield" />
                    （淨利/市值——覆蓋最廣，拯救缺少 CAPEX/D&amp;A/營業利益標籤的申報者）。
                </p>
                <p>
                    <span className="font-extrabold text-accent">品質</span> = <Term term="revenue-quality" />（逆向引擎評分）、
                    <Term term="gross-margin" /> 穩定性（≥4 會計年度 GM 的 −標準差）、負 <Term term="accruals" />（−應計比率）、
                    <Term term="piotroski" />（兩者皆出自財報鑑識資料庫）。
                </p>
                <p>
                    <span className="font-extrabold text-warn">動能</span> = <Term term="skip-month" /> 與 <Term term="high-proximity" />{' '}
                    的平均 z。使用月收盤。
                </p>
                <p>
                    <span className="font-extrabold text-ink-2">低波動</span> = 月報酬的 −σ z，至少 12 個觀察值；<Term term="annualized-volatility" />{' '}
                    輸出供 <Term term="kelly" /> 規模使用。
                </p>
                <p>
                    <span className="font-extrabold text-neg">財測修正</span> = 兩個 0–1 部分的平均：標準化 <Term term="eps-trajectory" />{' '}
                    斜率（clamp(斜率, −1, 1)+1)/2，與分析師結構評分/100——縮放到 0–100 後以 (分數−50)/25 重新置中為 z 類尺度。
                </p>
                <SubHeading>權重</SubHeading>
                <p>
                    等權 0.20 × 5（方案 <code>equal_weight_robust5</code>）。<Term term="rank-ic" /> 每月測量但僅記錄漂移{' '}
                    <i>診斷</i>——測量到的 IC 絕不主導權重（DeMiguel、Garlappi &amp; Uppal 2009：估算權重樣本外極少打敗 1/N）。
                </p>
                <SubHeading>反向 DCF — 確切方法</SubHeading>
                <p>
                    估值模型以 <Term term="bisection" /> 解出讓標準 DCF 等於目前價格的成長率——市場向你要價的成長。<Term term="expectations-gap" />
                    （顯示為「DCF gap」）= 隱含成長 − 已證明成長；已證明 = 最近 5 年 SEC 申報的營收/FCF 成長，以百分點計。
                    逆向引擎在其上疊加原型（A–F）分類與存活度/資料品質評分，產出因子實驗室所需的安全輸入。
                </p>
                <SubHeading>否決規則（確切）</SubHeading>
                <p>
                    <b>reverse_engine_reject</b> = 逆向引擎等級 ∈ {'{'}Excluded, Reject, Reject-tier{'}'} ·{' '}
                    <b>forensic_pair</b> = Beneish M 偏高且應計項目偏高（單一警報改為 0.85 折價）· <b>heavy_issuance</b> = HEAVY_ISSUANCE
                    旗標，原型 E/F 以發行為預期融資方式者豁免。在 AI 鏡頭中，強烈迴避/賣出也是否決（<code>llm_reject</code>）。
                </p>
                <SubHeading>缺失資料是 null — 絕不悄悄安全</SubHeading>
                <p>
                    舊的佔位 Z/M 分數已移除。指標缺失就是 null，評分流程會把該股標記為不足或套用資料品質折價。空缺永遠不會被
                    當作合格。
                </p>
            </Section>

            {/* 驗證 */}
            <Section id="validation" title="系統如何被驗證" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    兩個獨立的誠實迴路讓機器保持誠實。
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>前瞻記錄訊號</b> — 每個因子訊號在產生的當下記錄（<Term term="point-in-time" />、只能附加），日後再與
                        實際發生的事衡量，包括已下市股票（無 <Term term="survivorship-bias" />）。
                    </li>
                    <li>
                        <b>紙上交易投資組合</b> — 績效紀錄頁每日以真實價格與成本交易 plan / plan2 / equal / mine，與{' '}
                        <Term term="iwm" />、<Term term="spy" /> 比較。報酬與 <Term term="alpha" /> 公開且永久。
                    </li>
                </ul>
                <p>
                    每月，IC 漂移報告重新計算 <Term term="rank-ic" /> 診斷。重點是這網站永遠不能自己批改作業：成績單是前瞻的、
                    真實的、不可編輯的。
                </p>
            </Section>

            {/* 資料 */}
            <Section id="data" title="資料從哪裡來" icon={<BookMarked className="h-5 w-5" />}>
                <ul className="list-disc space-y-2 pl-5">
                    <li><Term term="sec-filings" /> — 透過 <Term term="company-facts" /> 的 10 年申報當下原貌財務（品質、鑑識與已證明成長的基準事實）。</li>
                    <li><Term term="yahoo-finance" /> — 股價、分析師 <Term term="estimates" /> 與覆蓋。</li>
                    <li><Term term="fred" /> — <Term term="macro-flags" /> 背後的聯準會總體序列。</li>
                </ul>
                <p>
                    整個流程透過 <Term term="github-actions" /> 每天重跑，IC 漂移報告每月重算。紙上帳本以交易成本（bps）且只能
                    附加地保存。
                </p>
            </Section>
        </>
    );
}
