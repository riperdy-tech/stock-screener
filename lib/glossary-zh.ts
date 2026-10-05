// ---------------------------------------------------------------------------
// GLOSSARY (繁體中文) — Traditional Chinese translations for lib/glossary.ts.
//
// Keyed by the SAME kebab-case keys as the English glossary. When the site is
// in Chinese (useLanguage().language === 'zh'), the <Term> popups render these
// translations. `term` is the Traditional Chinese display name.
// Missing keys fall back to the English entry automatically.
// ---------------------------------------------------------------------------

import type { GlossaryCategory } from './glossary';

export interface TermZh {
    term: string;
    plain: string;
    definition: string;
    /** Optional — the popup's "See also" chips come from the English def.related keys. */
    related?: string[];
}

export const CATEGORY_LABELS_ZH: Record<GlossaryCategory, string> = {
    core: '核心概念',
    value: '價值因子',
    quality: '品質因子',
    momentum: '動能因子',
    risk: '風險·波動',
    revisions: '財測修正因子',
    valuation: '估值·DCF',
    ai: 'AI 分析師',
    portfolio: '投資組合·部位',
    track: '績效紀錄',
    data: '資料·流程',
    overlay: '覆蓋標記·財報鑑識',
    bands: '門·等級·否決',
};

export const GLOSSARY_ZH: Record<string, TermZh> = {
    // ── 核心概念 ──────────────────────────────────────────────────────
    composite: {
        term: '門百分位 (Door percentile / composite)',
        plain: '用來為股票排名的 0–100 數字：它較強那道門的分數。',
        definition:
            '每檔股票在前兩道門各得一個分數，每個分數都會換算成百分位（0–100）。股票以兩者中較好的那個來競爭，冠軍股在排定順序時還會得到一點小加分。數字越高 = 至少在一道門上的論據越強。它是替候選名單排序的方式，不是目標價。',
        related: ['door', 'champion', 'percentile'],
    },
    factor: {
        term: '因子 (Factor)',
        plain: '股票可衡量的特質，各道門就是用它們組成的。',
        definition:
            '像獲利佳、便宜、分析師預測上調、近期表現強勢這類可量化的特質，研究顯示它們平均而言與未來報酬相關。本篩選衡量品質、價值、預期落差、動能與財測修正。這些因子不是平均加權：每道門以自己的權重，混合它所重視的因子。',
        related: ['door', 'value', 'quality', 'momentum'],
    },
    'sector-neutral': {
        term: '類股中性 (Sector-neutral)',
        plain: '評分是相對於該股票所屬產業群組來衡量。',
        definition:
            '每檔股票主要與同一類股的公司比較——超市與超市競爭，不與軟體公司比較。若無此機制，「便宜」就只是「是銀行股」的意思，「動能高」就只是「是科技股」的意思。品質、價值與財測修正都以這種方式衡量。動能是例外：它也會對照整個市場來解讀，因此帶動整個類股的榮景不會顯得平凡。',
        related: ['zscore', 'composite'],
    },
    zscore: {
        term: 'Z 分數 (Z-score)',
        plain: '該數值偏離類股平均幾個標準差的衡量。',
        definition:
            '把原始數值（例如 14% 的自由現金流收益率）轉成「在類股內有多不尋常」的統計量尺。Z 分數 +1.5 表示該股高於其類股平均 1.5 個標準差。Z 分數讓單位完全不同的指標（比率、成長率、波動）能在同一尺度上比較。',
        related: ['sector-neutral', 'winsorize', 'composite'],
    },
    winsorize: {
        term: '溫莎化 (Winsorize)',
        plain: '裁切極端離群值，避免它們扭曲所有人的排名。',
        definition:
            '評分前，任何落在類股第 1～99 百分位以外的數值都會被拉回該界線。單一荒謬的資料點——打錯的數字、一次性異常、幾近倒閉的股票——就不能悄悄主宰其他所有股票的排名。',
        related: ['zscore', 'sector-neutral'],
    },
    percentile: {
        term: '百分位 (Percentile)',
        plain: '在全部受評股票中的位置（0–100）。',
        definition:
            '把排名轉成 0–100 尺度：第 98 百分位代表該股分數高於 98% 的受評股票。每道門的分數都會換算成百分位，股票以前兩道門中較好的那個來競爭。',
        related: ['composite', 'door'],
    },
    overfitting: {
        term: '過擬合 (Overfitting)',
        plain: '把規則調到太貼合過去資料，導致在新資料上失效。',
        definition:
            '典型的量化陷阱：把參數調到回測看起來漂亮，你就越是在背誦過去，而不是學到持久的規律。一條靠同一批資料反推出來的規則，即使「本來會」賺錢也毫無價值。這就是本站在看到結果之前，就先寫下通過／不通過規則的原因。',
        related: ['out-of-sample', 'backtest'],
    },
    'out-of-sample': {
        term: '樣本外 (Out-of-sample)',
        plain: '用模型建立時從未見過的資料來驗證。',
        definition:
            '唯一誠實的檢驗：一條規則在未被用來建立它的資料上表現如何。日後以真實未來價格衡量的前瞻記錄（forward-logged）訊號就是純粹的樣本外檢驗——沒有事後諸葛，沒有編輯。',
        related: ['overfitting', 'point-in-time', 'paper-trading'],
    },
    backtest: {
        term: '回測 (Backtest)',
        plain: '重播歷史，看看某條規則「本來會」表現如何。',
        definition:
            '把策略套在歷史資料上以估算表現。回測有用但愛討好——它受事後偏誤、倖存者偏誤與過擬合之苦。本站只把回測當診斷，並偏好以事後實盤模擬的前瞻訊號作為誠實的量尺。',
        related: ['survivorship-bias', 'paper-trading', 'overfitting'],
    },
    'point-in-time': {
        term: '時點一致 (Point-in-time)',
        plain: '只用當下確實已知的資訊。',
        definition:
            '禁止偷看未來的原則：某日記錄的訊號只能使用當日存在的資料，不可使用未來的重述或價格。這裡每一個前瞻記錄的訊號都是時點一致的，這正是績效紀錄可信的原因。',
        related: ['out-of-sample', 'hindsight-bias'],
    },
    'survivorship-bias': {
        term: '倖存者偏誤 (Survivorship bias)',
        plain: '衡量贏家時忘了已下市消失的輸家。',
        definition:
            '若只衡量至今仍存在的股票，就漏掉了所有失敗與消失的股票——這會讓每份回測都更好看。要避免它，必須把已下市、破產、跌落的名字一併納入衡量，本流程正是如此。',
        related: ['backtest', 'point-in-time'],
    },
    'hindsight-bias': {
        term: '事後諸葛偏誤 (Hindsight bias)',
        plain: '明明事後才知道結果，卻假裝當時就知道。',
        definition:
            '把一個決策重建成彷彿結果可以預測。紙上帳本就是防範這一點：每一筆買進與賣出都在當天、未來發生之前就被記錄下來。',
        related: ['point-in-time', 'paper-trading'],
    },
    'market-cap': {
        term: '市值 (Market cap)',
        plain: '整家公司的價格——股價 × 股數。',
        definition:
            '市值 = 股價 × 流通在外股數。以 $T（兆）、$B（十億）、$M（百萬）顯示。它告訴你這家公司大概有多大，這對風險、流動性以及一個部位佔投資組合的比例都很重要。',
        related: ['float', 'enterprise-value'],
    },

    // ── 價值因子 ───────────────────────────────────────────────────────
    value: {
        term: '價值因子',
        plain: '是用 $1 買 $2 的現金盈餘，還是用 $2 買 $1？',
        definition:
            '衡量股價相對於企業實際產生之現金是否便宜，且一律在該股票所屬類股內判斷。由以現金為基礎的收益率構成：自由現金流、業主盈餘與 EBIT（銀行與保險業用盈餘），分別除以股價。它是價值落差門的原料之一。',
        related: ['fcf-yield', 'owner-earnings', 'enterprise-value'],
    },
    'fcf-yield': {
        term: '自由現金流 (FCF) 收益率',
        plain: '企業保留的現金，佔其價格的百分比。',
        definition:
            'FCF = 營運現金流 − 資本支出——在維持廠房設備運作之後真正能用的現金。FCF 收益率把它除以市值。越高代表相對你付出的價格，企業吐出的現金越多。是價值因子的四種收益率之一。',
        related: ['value', 'owner-earnings', 'market-cap'],
    },
    'owner-earnings': {
        term: '業主盈餘收益率 (Owner earnings yield)',
        plain: '巴菲特式的盈餘能力，佔價格的百分比。',
        definition:
            '淨利 + 折舊攤銷 − 資本支出，除以市值。近似於真正的所有者在保持業務完整的前提下能提領的現金，比會計淨利更誠實。是價值因子的四種收益率之一。',
        related: ['value', 'fcf-yield', 'ebit'],
    },
    ebit: {
        term: 'EBIT（息稅前利潤）',
        plain: '計息與課稅前的盈餘——營業利益。',
        definition:
            'Earnings Before Interest and Taxes。它在融資選擇（舉債 vs 股權）與稅務介入之前，分離出核心業務到底賺多少。EBIT 收益率 = EBIT ÷ 企業價值，是價值因子的四種收益率之一。',
        related: ['enterprise-value', 'value', 'roic'],
    },
    'enterprise-value': {
        term: '企業價值 (EV)',
        plain: '連同負債，買下整家公司要付的價格。',
        definition:
            'EV = 市值 + 長期負債 − 現金。買公司意味著承接其負債、取得其現金，因此 EV 比市值更接近真實的「價格」。用於 EBIT 收益率與多種估值倍數。',
        related: ['market-cap', 'ebit'],
    },
    'earnings-yield': {
        term: '盈餘收益率 (Earnings yield)',
        plain: '淨利佔價格的百分比——本益比的倒數。',
        definition:
            '淨利 ÷ 市值。是價格盈餘比（P/E）的倒數：與其問「幾年回本」，它回答「每年拿回價格的幾%」。是四種收益率中資料覆蓋最廣的，能挽救缺少部分現金流資料的企業。',
        related: ['value', 'fcf-yield'],
    },

    // ── 品質因子 ───────────────────────────────────────────────────────
    quality: {
        term: '品質因子',
        plain: '公司是否持續真正賺錢，而且帳目乾淨？',
        definition:
            '衡量企業獲利有多穩定、會計有多誠實。結合營收品質、數年來毛利率的穩定性、負應計項目（偏好有現金支撐的盈餘，而非會計手法）與 Piotroski F 分數。帳目誠實、真正獲利的生意勝過故事。',
        related: ['roic', 'accruals', 'piotroski'],
    },
    'gross-margin': {
        term: '毛利率 (Gross margin)',
        plain: '每 1 美元銷售在扣除銷貨成本後剩下的比例。',
        definition:
            '（營收 − 銷貨成本）÷ 營收。顯示公司有多少定價能力。品質因子偏好毛利率在數個會計年度內維持穩定——波動劇烈的毛利率是業務脆弱的一面黃旗。',
        related: ['quality', 'revenue-quality'],
    },
    'revenue-quality': {
        term: '營收品質 (Revenue quality)',
        plain: '逆向工程引擎對營收可信度的評分。',
        definition:
            '逆向引擎對「企業申報的營收有多真實、多可持續」所做的評分，檢查激進認列、客戶集中等使營收脆弱的模式。是品質的輸入，本身從不直接加進分數。',
        related: ['quality', 'forensic'],
    },
    accruals: {
        term: '應計項目 (Accruals)',
        plain: '尚未有實際現金支撐的會計盈餘。',
        definition:
            '申報盈餘與實際收到的現金之間的差距。應計項目高代表盈餘是透過（發票、估計）在帳上先認列、現金還未流入——典型的盈餘膨脹訊號。品質因子偏好低或負的應計項目，而高應計項目標誌是財報鑑識旗標。',
        related: ['quality', 'forensic', 'beneish'],
    },
    piotroski: {
        term: 'Piotroski F 分數',
        plain: '由 9 項財務健康訊號組成的檢查清單。',
        definition:
            'Joseph Piotroski 的著名分數：檢查獲利、槓桿、營運效率等 9 項二元訊號，每項健康加 1 分（0–9）。越高越強。它來自 SEC 申報的財務資料庫，供品質因子使用。',
        related: ['quality', 'fundamentals-battery'],
    },
    beneish: {
        term: 'Beneish M 分數',
        plain: '以統計偵測盈餘操縱可能性的模型。',
        definition:
            '用應收帳款天數、資產品質等 8 項比率，衡量企業操縱盈餘可能性的模型。M 分數偏高是財報鑑識警告。單獨出現時絕不會讓股票被剔除；較小的公司只有在它與高應計項目同時出現時才會被剔除。',
        related: ['forensic', 'accruals', 'veto'],
    },
    forensic: {
        term: '財報鑑識警告 (Forensic warnings)',
        plain: '針對可疑會計或脆弱財務的黃牌與紅牌。',
        definition:
            '來自會計檢驗的警示燈：Beneish M 分數（疑似操縱盈餘）、應計項目（獲利沒有現金支撐）、Altman Z（財務困境）與大量發行股票。對市值 100 億美元以上的公司，這些只是警告——絕不會剔除股票。對較小的公司，只有兩個紅旗同時出現時才會被剔除。就像照片很美、但結構檢驗沒過的房子。',
        related: ['beneish', 'accruals', 'veto'],
    },
    roic: {
        term: 'ROIC（投入資本報酬率）',
        plain: '錢再投入後複利成長的效率。',
        definition:
            'NOPAT（稅後營業利益）÷ 投入資本（股東權益 + 負債 − 現金）。回答：公司留在業務中的每 1 美元，能產生多少利潤？能在資本上賺 20% 的公司，等於對再投資的盈餘每年複利 20%。這是長期財富的引擎。',
        related: ['quality', 'ebit', 'cagr'],
    },
    'fundamentals-battery': {
        term: '財務資料庫 (Fundamentals battery)',
        plain: '財報鑑識與品質檢查背後的 10 年 SEC 申報比率。',
        definition:
            '以 SEC Company Facts（10 年申報當下原貌）建立的每檔個股資料集，內含 Piotroski F、Sloan 應計項目、真實 Beneish M 與淨發行的原料，取代了舊的佔位分數。',
        related: ['piotroski', 'beneish', 'sec-filings'],
    },

    // ── 動能因子 ───────────────────────────────────────────────────────
    momentum: {
        term: '動能因子',
        plain: '過去一年這檔股票是否一直贏？',
        definition:
            '贏家往往會再贏一陣子。動能結合 12-1 跳月報酬（學術標準的 12 個月報酬、略過最近一個月）與 52 週高點接近度。複利成長門使用它；價值落差門把它當作避免接落刀的底線；趨勢領頭門則以整個市場為範圍，單獨使用它。',
        related: ['skip-month', 'high-proximity', 'door'],
    },
    'skip-month': {
        term: '12-1 跳月報酬',
        plain: '排除最近一個月的 12 個月報酬。',
        definition:
            '衡量動能的學術標準：計算過去 12 個月報酬，但排除最近一個月。排除最近一個月是為了避開短期反轉——上個月漲最多的股票會短暫回吐——以免污染訊號。使用月收盤價。',
        related: ['momentum', 'reversal'],
    },
    'high-proximity': {
        term: '52 週高點接近度',
        plain: '股價離過去一年最高點多近。',
        definition:
            '目前股價 ÷ 其 52 週高點。接近高點的股票歷史上有較高機率續強，離高點很遠的股票則常續跌。與 12-1 報酬一起構成動能因子。',
        related: ['momentum'],
    },
    reversal: {
        term: '短期反轉 (Short-term reversal)',
        plain: '上個月漲最多的股票會短暫回吐再繼續。',
        definition:
            '一種短週期特性：最近一個月漲最多的股票往往會稍微回吐。這就是為何動能要用排除最近一個月的 12 個月來衡量——捕捉可持續的趨勢，避開嘈雜的一個月反彈。',
        related: ['skip-month', 'momentum'],
    },

    // ── 風險·低波動 ────────────────────────────────────────────────────
    volatility: {
        term: '波動率 (σ)',
        plain: '價格波動的程度——股票的「狂野度」。',
        definition:
            '報酬的標準差。波動度高代表價格在短時間內大幅擺盪；波動度低代表走勢平穩。希臘字母 sigma（σ）是它的符號。',
        related: ['annualized-volatility'],
    },
    'annualized-volatility': {
        term: '年度化波動率',
        plain: '月波動幅度換算成一年。',
        definition:
            '把月報酬波動度乘以 √12，換算成以年為單位的數字（月 σ × 12 個月的平方根）。',
        related: ['volatility'],
    },

    // ── 財測修正因子 ───────────────────────────────────────────────────
    revisions: {
        term: '財測修正因子',
        plain: '追蹤公司的分析師是在上調還是下修預測？',
        definition:
            '衡量分析師預期變化的方向。分析師上調盈餘預估時，股價往往續漲；下修時往往續跌。它是複利成長門中最小的原料，而趨勢領頭股的預測不能在下滑。',
        related: ['eps', 'estimates', 'eps-trajectory'],
    },
    eps: {
        term: 'EPS（每股盈餘）',
        plain: '每股盈餘——分配給每一股的利潤。',
        definition:
            '淨利 ÷ 流通在外股數。投資人最常看的一個數字。財測修正因子看的不只是水準，還有 EPS 預估隨時間的走向。',
        related: ['revisions', 'eps-trajectory'],
    },
    estimates: {
        term: '分析師預估',
        plain: '追蹤該公司的專業分析師對未來盈餘的預測。',
        definition:
            '追蹤公司的賣方分析師發布的共識預測。他們的上修與下修帶有資訊，正是財測修正因子所收割的。',
        related: ['revisions', 'eps'],
    },
    'eps-trajectory': {
        term: 'EPS 軌跡',
        plain: '盈餘預估路徑的方向與陡峭度。',
        definition:
            '分析師對未來盈餘預測隨時間的斜率——是在上揚、持平還是下滑？它讓「改善中」與「惡化中」變成可比較的數字。',
        related: ['revisions', 'eps'],
    },

    // ── 估值·DCF ───────────────────────────────────────────────────────
    dcf: {
        term: '現金流折現 (DCF)',
        plain: '企業的價值 = 未來現金折現到今天的總和。',
        definition:
            '經典的估值框架：估計企業未來將產生的所有現金，折現回今天的錢（因為明年的一塊錢比現在的一塊錢不值錢），再加總。得到的數字就是「內在價值」。',
        related: ['intrinsic-value', 'present-value', 'cost-of-equity'],
    },
    'reverse-dcf': {
        term: '反向 DCF (Reverse DCF)',
        plain: '把 DCF 反過來：目前價格假設了什麼成長率？',
        definition:
            '與其猜成長率去得價值，反向 DCF 把數學反過來解：給定目前價格，市場已經假設的成長率是多少？用二分法（bisection）收斂到讓 DCF 等於目前價格的成長率。結果就是市場向你要價的成長率。',
        related: ['dcf', 'implied-growth', 'bisection'],
    },
    'implied-growth': {
        term: '隱含成長率 (Implied growth)',
        plain: '目前價格悄悄承諾的成長率。',
        definition:
            '每一檔股票的價格都內含對未來成長的承諾。反向 DCF 把那個承諾抽成數字：讓折現現金流等於目前價格的成長率。本站再把它與公司實際達成的成長比較。',
        related: ['reverse-dcf', 'expectations-gap'],
    },
    'expectations-gap': {
        term: '預期落差 (Expectations gap)',
        plain: '價格要求的成長率減去公司已證明的成長率。',
        definition:
            '隱含成長率（來自反向 DCF）減去已證明成長率（來自 SEC 申報、公司現金盈餘最近 5 年的實際成長），以百分點計。負值 = 價格要求的成長低於公司已證明——潛在便宜貨。正值 = 價格需要無人證明過的加速——你必須相信一個故事。它是價值落差門的原料之一。',
        related: ['implied-growth', 'reverse-dcf', 'demonstrated-growth'],
    },
    'demonstrated-growth': {
        term: '已證明成長率 (Demonstrated growth)',
        plain: '公司根據申報文件實際達成的成長。',
        definition:
            '來自 SEC 申報、公司現金盈餘最近五年的實際成長（只有在取不到時才改用營收成長）。這是預期落差中用來與價格承諾比較的基準事實。',
        related: ['expectations-gap', 'sec-filings'],
    },
    'intrinsic-value': {
        term: '內在價值 (Intrinsic value)',
        plain: '獨立於股價、企業真正的價值。',
        definition:
            '以未來現金創造能力為基礎的企業真實價值估計——DCF 產出的數字。AI 分析師每次執行都會產出一個；判定是把今天的股價與這些數值的範圍（價值區間）比較，而不是與單一數字比較。',
        related: ['dcf', 'margin-of-safety', 'iv-band'],
    },
    'margin-of-safety': {
        term: '安全邊際 (Margin of safety)',
        plain: '你得到的折價：比估計價值低多少買進。',
        definition:
            '價格比估計價值便宜多少，以百分比表示。30% 的安全邊際表示用 70 分錢買 1 元估計價值。看起來大得不合理的安全邊際本身就是警訊：閘門會擋下價值高出股價到不合理程度的判定。',
        related: ['intrinsic-value', 'gate-reason'],
    },
    'cost-of-equity': {
        term: '股權成本 (Cost of equity)',
        plain: '股東要求的報酬——股權現金流的折現率。',
        definition:
            '投資人為持有股票而非較安全資產所要求的最低年報酬。是 DCF 中折現未來股權現金流所用的比率。本篩選從總體引擎的資金成本錨取得（公用事業約 6.6%，晶片製造商高達 12.6%）；若該錨點缺漏或過期，會明確地改用 10%，並記錄這件事。',
        related: ['dcf', 'present-value'],
    },
    'present-value': {
        term: '現值·折現 (Present value)',
        plain: '未來的錢較不值錢；折現把它換算成今天的價值。',
        definition:
            '明年的一塊錢比今天的一塊錢不值錢（今天的錢可投資生息）。折現就是把未來現金流逐年除以（1 + 折現率），換算成今天的錢再加總。',
        related: ['dcf', 'cost-of-equity'],
    },
    bisection: {
        term: '二分法 (Bisection)',
        plain: '電腦收斂到精確答案的方法。',
        definition:
            '一種反覆把範圍折半、直到收斂的數值方法。反向 DCF 用二分法解出讓 DCF 等於目前價格的成長率——太低就調高、太高就調低，一直折半到找到答案。',
        related: ['reverse-dcf', 'implied-growth'],
    },

    // ── AI 分析師 ───────────────────────────────────────────────────────
    llm: {
        term: 'LLM（大型語言模型）',
        plain: '替分析師做研究的那類 AI。',
        definition:
            '大型語言模型是會閱讀與撰寫文字的 AI。分析師在本機電腦上執行一個，而不是雲端服務。它閱讀申報文件、做研究，並選定每一項估值輸入。它不做算術——所有計算都由 Python 程式碼完成——之後程式碼再拿外部錨點來檢查答案。',
        related: ['iv-band', 'street-fence', 'actionable'],
    },

    // ── 門·等級·否決 ──────────────────────────────────────────────────────
    band: {
        term: '等級 (Band)',
        plain: '把排名轉成實際行動的區間。',
        definition:
            '本篩選把每檔股票放進四個等級之一：RESEARCH NOW（候選名單的頂端）、WATCHLIST（候選名單的其餘部分）、PASS（有評分但不在候選名單）與 VETOED（被安全過濾器剔除）。等級來自股票的排名，而不是固定的百分比切線；已在候選名單上的股票，要明顯掉出才會被移除。',
        related: ['research-now', 'watchlist', 'hysteresis'],
    },
    'research-now': {
        term: 'Research Now',
        plain: '候選名單的頂端——今天值得你花研究時間。',
        definition:
            '最高等級：依優先度大約前 50 到 60 檔，包含少數趨勢領頭股。它是研究候選名單，絕不是買進指令。同名的研究台區段範圍更窄：只有分析師的判定為低估、通過閘門且未被暫緩的股票，才會出現在 Research now 之下。',
        related: ['band', 'watchlist', 'actionable'],
    },
    watchlist: {
        term: 'Watchlist（觀察清單）',
        plain: '候選名單的其餘部分——證據強、值得關注。',
        definition:
            '第二個等級：候選名單中 Research now 以下的部分（整份候選名單約 150 檔）。這裡的股票值得關注，常常會往上移。這是篩選自己的等級名稱，不是判定，也不是研究台的區段：在研究台上，判定為合理或高估且通過閘門的股票，位於「今日無優勢」之下。',
        related: ['band', 'research-now', 'no-edge'],
    },
    pass: {
        term: 'Pass（略過）',
        plain: '有評分，但不在候選名單上。',
        definition:
            '有評分、但沒有拿到候選名單名額的股票的預設等級。不是「壞公司」的判定——只是證據不足以在今天贏得你的注意。',
        related: ['band'],
    },
    veto: {
        term: '否決 (Veto)',
        plain: '無論看起來多好，都被安全過濾器剔除的股票。',
        definition:
            '硬性取消資格。被否決的股票沒有等級，也不會被分析。原因包括：股票無法交易（已下市或暫停交易）、規模太小或成交太清淡、沒有可用的申報基本面、是空殼公司，或——僅針對市值低於 100 億美元的公司——有長期營運虧損並伴隨沉重債務，或兩個財報鑑識紅旗同時出現。較大的公司則只會得到警告。在研究台上，被否決的股票位於「取消資格」之下，旁邊寫明原因。',
        related: ['forensic', 'beneish', 'dilution'],
    },

    // ── 投資組合·部位 ──────────────────────────────────────────────────
    'position-sizing': {
        term: '部位大小 (Position sizing)',
        plain: '決定每檔股票投入多少資金。',
        definition:
            '本站不提供投資組合計畫。它提供的是判定上的部位大小建議——四分之一、一半或全額——取四個區間中最保守的一個：各次執行分歧多大、安全邊際、分析師自己的信心，以及總體動盪旗標。只有一次執行時，上限為四分之一。個股頁面也會印出上限（四分之一凱利上限），那是天花板，不是建議。舊的凱利規模計畫帳本已經退役。',
        related: ['iv-band', 'entry-timing'],
    },
    'paper-trading': {
        term: '紙上交易 (Paper trading)',
        plain: '沒有真錢、但有真規則的交易——記錄卻是真實的。',
        definition:
            '系統每天以真實價格與真實交易成本，模擬買賣自己的選股並保存紀錄。這是誠實的量尺：若系統錯了，績效紀錄頁會說出來。',
        related: ['transaction-costs', 'out-of-sample', 'track-record'],
    },
    unitization: {
        term: '單位化 (Unitization)',
        plain: '把投資組合當基金處理，讓入金不會造假報酬。',
        definition:
            '「mine」帳本像共同基金一樣單位化：加錢或取錢改變的是單位數，而非單位價格。這防止入金灌水報酬，是公平衡量你真實持股與模型組合的方式。',
        related: ['track-record', 'behavior-gap'],
    },
    'behavior-gap': {
        term: '行為落差 (Behavior gap)',
        plain: '因偏離系統而損失的報酬。',
        definition:
            '紀律嚴明的系統所賺到的，與你實際賺到的之間的差距，來自你自己的決定——賣得太早、追高、無視出場規則。在績效紀錄頁面上，我的帳本落後對照帳本的部分就是行為落差，公開衡量。',
        related: ['track-record', 'unitization'],
    },
    'transaction-costs': {
        term: '交易成本 (bps)',
        plain: '交易的實際摩擦，以基點衡量。',
        definition:
            '套用到每一筆紙上交易的佣金與滑價。一個基點（bp）是 1% 的百分之一。帳本以真實成本交易（顯示為「每筆交易 Xbps」），讓紀錄誠實反映交易的拖累。另有假設式覆蓋可依你自己的費率重新計價。',
        related: ['paper-trading', 'track-record'],
    },
    'sharpe-ratio': {
        term: '夏普比率 (Sharpe ratio)',
        plain: '每單位風險的報酬——每個單位的漲幅花了多少痛苦。',
        definition:
            '超額報酬除以波動度。它衡量報酬相對於風險：夏普越高，代表策略以較不劇烈的起伏賺到報酬。在觀測數足夠之前，績效紀錄頁面會把它隱藏，因為只有幾週的資料時它只是雜訊。',
        related: ['volatility', 'observations'],
    },
    cagr: {
        term: 'CAGR（年複合成長率）',
        plain: '投資組合平滑的年成長率。',
        definition:
            '年複合成長率（Compound Annual Growth Rate）——假設成長完全平滑，把起始價值在整個期間內變成結束價值的那個單一年百分比。它讓你能以年為單位比較投資組合。當紀錄太短、年化數字沒有意義時，績效紀錄頁面會把它隱藏。',
        related: ['observations', 'roic'],
    },
    drawdown: {
        term: '回檔 (Drawdown)',
        plain: '投資組合從高點回落多少。',
        definition:
            '投資組合從歷史高點到其後最低點的跌幅，以百分比表示。30% 的回撤代表投資組合在最糟的時點損失了高點價值的 30%。這是風險方程式中「痛苦」的那一面。',
        related: ['volatility', 'sharpe-ratio'],
    },
    alpha: {
        term: 'Alpha／超額報酬',
        plain: '高於市場或基準的報酬。',
        definition:
            '扣除成本後，投資組合超越其基準（如 QQQ 或 SPY）的表現。正 Alpha 代表選股或部位規模有加分；負代表機器（或你的偏離）比直接持有指數更糟。',
        related: ['benchmark', 'qqq', 'spy'],
    },
    benchmark: {
        term: '基準 (Benchmark)',
        plain: '用來比較投資組合的指數。',
        definition:
            '用來判斷機器是否加值的參考組合，通常是寬基指數。模擬帳本以 QQQ（那斯達克 100）為基準；SPY（標普 500）與 IWM（羅素 2000 小型股）也在 NAV 圖表上，判定評分仍會回報 IWM、SPY 與 QQQ。可從 NAV 圖表開關。',
        related: ['qqq', 'spy', 'iwm', 'alpha'],
    },
    qqq: {
        term: 'QQQ',
        plain: 'Invesco QQQ ETF——那斯達克 100。',
        definition:
            '那斯達克 100（科技權重高的大型股指數）的 ETF 代理。它是評判模擬帳本的基準，所以落後 QQQ 的帳本，並沒有勝過單純持有指數。',
        related: ['benchmark', 'spy', 'iwm'],
    },
    iwm: {
        term: 'IWM',
        plain: 'iShares 羅素 2000 ETF——美國小型股。',
        definition:
            '羅素 2000 小型股指數最常見的 ETF 代理。因為本系統篩選小型與中型股，它保留在圖表上作為第二參考線；模擬帳本則以 QQQ 評判。',
        related: ['benchmark', 'spy'],
    },
    spy: {
        term: 'SPY',
        plain: 'SPDR 標普 500 ETF——整體美國大型股市場。',
        definition:
            '追蹤標普 500 的 ETF，是整體美股市場的標準氣壓計。作為績效紀錄 NAV 圖表上的第二個基準。',
        related: ['benchmark', 'iwm'],
    },
    'track-record': {
        term: '績效紀錄 (Track Record)',
        plain: '系統自身紙上帳本的成績單。',
        definition:
            '一個頁面，每天以真實價格與假設的交易成本對三個帳本進行紙上交易——AI 帳本、對照帳本與我的帳本——並以成績單為每個判定評分。它不是討好人的回測，而是系統實際做了什麼的紀錄，包括它的錯誤。這是短期的紙上紀錄，目前還不足以證明任何事。',
        related: ['paper-trading', 'control-book', 'behavior-gap', 'not-yet-proven'],
    },

    // ── 資料·流程 ──────────────────────────────────────────────────────
    'sec-filings': {
        term: 'SEC 申報文件',
        plain: '上市公司依法申報的官方財務報告。',
        definition:
            '美國上市公司必須向 SEC 申報的監管文件（10-K、10-Q 以及結構化的 Company Facts 資料源）。它們是財務資料的基準事實——10 年的申報當下原貌資料餵養品質、鑑識與已證明成長的輸入。',
        related: ['company-facts', 'as-filed', 'demonstrated-growth'],
    },
    'company-facts': {
        term: 'SEC Company Facts',
        plain: 'SEC 對每項申報財務資料的機器可讀資料源。',
        definition:
            'SEC 對所有美國申報公司「申報當下原貌」財務事實的結構化、機器可讀資料集。流程用它建立 10 年財務資料庫（Piotroski F、Sloan 應計項目、真實 Beneish M、淨發行），取代舊的佔位分數。',
        related: ['sec-filings', 'fundamentals-battery', 'as-filed'],
    },
    'as-filed': {
        term: '申報當下原貌 (As-filed)',
        plain: '公司當時申報的原樣——重述之前。',
        definition:
            '公司最初申報的原樣資料，帶有申報當日的日期。這讓時點一致的分析成為可能：你可以知道任何一天的數字長什麼樣，而非之後被修正成什麼。',
        related: ['point-in-time', 'sec-filings', 'company-facts'],
    },
    ttm: {
        term: 'TTM（最近十二個月）',
        plain: '最近四個季度合計——永遠最新的完整一年。',
        definition:
            '最近四個季度的總和，提供一個滾動的一年窗口，永遠貼近現況（相較於數月前結束的會計年度）。用於流程各處的營收、毛利與成長。',
        related: ['sec-filings'],
    },
    'yahoo-finance': {
        term: 'Yahoo Finance',
        plain: '股價、預估與分析師覆蓋的來源。',
        definition:
            '流程所使用的金融資料供應商之一，提供即時股價、股價歷史、分析師預估與覆蓋元資料，與 SEC 財務資料結合形成全貌。',
        related: ['fred', 'sec-filings'],
    },
    fred: {
        term: 'FRED',
        plain: '聯準會的公開經濟資料服務。',
        definition:
            '聖路易斯聯準銀行的免費美國經濟序列資料庫。它是總體引擎之機率與衝擊警報所用數字的唯一來源。新聞只作為脈絡，絕不轉成數字。',
        related: ['probability-vector', 'shock-register'],
    },
    'github-actions': {
        term: 'GitHub Actions',
        plain: '依排程重新執行資料流程的雲端自動化。',
        definition:
            '依排程自動執行資料擷取、評分鏈與紙上帳本的 CI/CD 服務。AI 分析師則另外在本機電腦上執行。',
        related: ['pipeline'],
    },
    pipeline: {
        term: '流程 (Pipeline)',
        plain: '從原始資料到已評分紀錄的有序步驟鏈。',
        definition:
            '端到端的鏈條：總體背景 → 篩選器（安全過濾、三道門、等級）→ AI 分析師 → 閘門 → 每日跟進（已建好、尚未上線）→ 評分與紙上帳本。每一步只把一個資料檔交給下一步。評分部分以固定順序並搭配完整性檢查執行，所以過時或殘缺的資料無法悄悄污染名單。',
        related: ['github-actions', 'reverse-engine'],
    },
    'reverse-engine': {
        term: '逆向引擎 (Reverse engine)',
        plain: '較早期的安全與品質篩選，其分數會供給各道門。',
        definition:
            '分類每家企業的類型（原型）、評分公司撐過衰退的能力與資料的可靠度，並產生反向 DCF 數字的評分階段。它的品質與存活度分數是作為輸入進入篩選，而不是作為閘門。',
        related: ['pipeline', 'reverse-dcf', 'forensic'],
    },

    // ── 覆蓋標記·財報鑑識 ──────────────────────────────────────────────
    gpr: {
        term: 'GPR（地緣政治曝險）',
        plain: '0–3 的地緣政治曝險標記。',
        definition:
            '依公司實際業務輪廓（營收地域、供應鏈、監管、制裁）標記的地緣政治風險。顯示為脈絡標籤。絕不是買賣訊號，也絕不屬於候選名單排名的一部分。',
        related: ['overlay'],
    },
    insiders: {
        term: '內部人買賣',
        plain: '經營公司的人在用自己的股票做什麼。',
        definition:
            '高階主管與董事買賣自家公司股票的合法交易。▲ INSIDERS = 空頭退場期間內部人淨買進（確認訊號）；▼ INSIDERS = 空單餘額偏高或上升之際內部人賣出（質疑論點的理由）。只是確認或警告，從不加進分數。',
        related: ['short-interest', 'informed-demand'],
    },
    'short-interest': {
        term: '空單餘額 (Short interest)',
        plain: '有多少比例的股票被借來放空。',
        definition:
            '流通在外股票中被放空（借券賣出、押注下跌）的數量。內部人賣出之際偏高的空單餘額就是 ▼ 警告型態。',
        related: ['insiders', 'float'],
    },
    'informed-demand': {
        term: '知情需求 (Informed demand)',
        plain: '把內部人與空頭綜合讀出的訊號——本站覆蓋之一。',
        definition:
            '綜合訊號：內部人淨買進且空單餘額未升為正；內部人在偏高/上升的空單中賣出為負。以 ▲/▼ INSIDERS 旗標顯示。是論點的脈絡，絕非加分項目。',
        related: ['insiders', 'short-interest', 'overlay'],
    },
    dilution: {
        term: '股本稀釋·發行',
        plain: '公司印新股票，稀釋你持有的每一股。',
        definition:
            '公司發行新股時，每一股代表的餅就更小。大量發行會顯示為財報鑑識警告。',
        related: ['forensic', 'veto'],
    },
    float: {
        term: '流通股數 (Float)',
        plain: '市場上實際可交易的股票數量。',
        definition:
            '流通在外股數減去內部人與機構鎖定的股數。流通量小會放大價格波動與軋空壓力，是經典 100 倍股篩選的輸入之一。',
        related: ['market-cap', 'short-interest'],
    },
    overlay: {
        term: '覆蓋標記 (Overlay)',
        plain: '疊在排名之上的額外脈絡標籤。',
        definition:
            '以標籤顯示的非計分訊號：GPR（地緣政治曝險）與 ▲/▼ INSIDERS（知情需求）。它們絕不改變排名——只是供你自己思考的脈絡。',
        related: ['gpr', 'informed-demand'],
    },

    // ── 常見用語 ────────────────────────────────────────────────────────
    ticker: {
        term: '股票代號 (Ticker)',
        plain: '股票的交易代號——例如 AAPL。',
        definition:
            '用來識別與交易股票的簡短交易所代號（例如 Apple 的 AAPL、台積電的 TSM）。它是研究台每一列的鍵值。',
        related: ['market-cap'],
    },
    'analyst-coverage': {
        term: '分析師覆蓋',
        plain: '追蹤該公司的專業分析師人數。',
        definition:
            '對一檔股票發布預估的賣方分析師數量。覆蓋越多，財測修正因子可讀的上修下修就越多；覆蓋稀少則訊號較少。覆蓋資料來自 Yahoo Finance。',
        related: ['estimates', 'revisions', 'yahoo-finance'],
    },
    // ── 新系統詞彙 ──────────────────────────────────────────────────
    'iv-band': {
        term: '價值區間 (IV band)',
        plain: '分析師各次獨立執行所得出的價值範圍。',
        definition:
            '分析師以獨立的執行來評估每檔股票，每次可用的執行都以一個對企業價值的估計作結。價值區間（也稱合理價值範圍）是這些估計中從最低到最高的範圍，中位數是中間那個值。判定就是今天的股價相對於整個區間的位置：在區間之下且有足夠的餘裕 = 低估；在區間之內 = 合理；在區間之上且有足夠的餘裕 = 高估。區間建立在幾次執行之上，會印在每一列上（「n／m 次可用」），絕不假設；只有一次執行時，區間就是一個點。在研究台上，有色帶是範圍，深色刻度是今天的股價。區間較寬代表各次執行意見分歧，這會讓部位大小建議變小。',
        related: ['intrinsic-value', 'actionable', 'position-sizing'],
    },
    'not-usable': {
        term: '不可用 (Not usable)',
        plain: '分析師沒有產出可用判定的列。',
        definition:
            '當判定步驟出現故障、沒有完整且可解析的估值時，該列會被標示為不可用，而不是被塞一個猜測。它沒有方向，絕不會被顯示為選股。在研究台上它位於「被閘門擋下」之下，所以仍作為紀錄保持可見。',
        related: ['actionable', 'iv-band'],
    },
    actionable: {
        term: '可執行 (Actionable)',
        plain: '通過閘門所有規則的判定。',
        definition:
            '每個判定都帶有一個稱為 actionable（可執行）的是／否旗標，答案為否時還附上原因清單。只有可執行的判定才能出現在研究台的 Research now、等待或今日無優勢之下，或被 AI 紙上帳本跟隨。不可執行的判定不會被刪除，而是留在「被閘門擋下」之下保持可見。可執行代表這個判定被允許算數，並不代表它是對的。',
        related: ['gate', 'blocked', 'gate-reason', 'rn-depth'],
    },
    'gate-reason': {
        term: '閘門原因 (Gate reason)',
        plain: '用白話寫出判定被擋下的原因。',
        definition:
            '當判定被擋下，研究台會說明原因——例如「由舊分析師做出」或「各次執行分歧太大」。一個判定可以有不只一個原因。完整清單在本手冊的閘門區段，用的是研究台相同的措辭。',
        related: ['gate', 'actionable', 'street-fence'],
    },
    'street-fence': {
        term: '華爾街範圍 (Street range / street fence)',
        plain: '分析師的目標價範圍，用作外部檢查。',
        definition:
            '華爾街（the Street）指追蹤一家公司的專業分析師。華爾街範圍（資料中稱為 street fence）就是他們目標價的範圍。它是合理性檢查，不是估值的輸入。程式碼會拿 AI 分析師的答案去對照它：落在範圍之外的價值會被擋下，沒有範圍可核對的判定會被擋下，價值高出股價到不合理程度的判定也會被擋下。在個股頁面上，它畫成價值區間上方的一條橫條。',
        related: ['actionable', 'gate-reason', 'estimates'],
    },
    'thesis-status': {
        term: '論點狀態 (intact / breached / unknown)',
        plain: '寫下的「什麼會證明我錯了」條件是否仍然成立。',
        definition:
            '重建後的分析師所做的每個判定，都事先寫明自己的失效規則：可以檢查的條件，一旦發生就代表論點破裂。個股頁面會列出每條規則的門檻、期間與目前的值。完好（intact）= 規則已檢查且沒有一條觸發；破裂（breached）= 至少一條觸發；未知（unknown）= 沒有任何一條能檢查。每日跟進會重新檢查這些規則；它已建好但尚未上線，所以在上線之前，論點可能顯示為未知。',
        related: ['follow-up', 'actionable'],
    },
    door: {
        term: '門 (Door)',
        plain: '股票進入候選名單的三條途徑之一。',
        definition:
            '本篩選不會把一切混成單一分數。一家公司可以因為出色、因為被錯誤定價，或因為處於強勁而穩定的上升趨勢而贏得注意——所以有三道門。第 1 道門（複利成長門）獎勵品質、動能與上調的分析師預測。第 2 道門（價值落差門）獎勵便宜，以及價格要求的成長低於公司已交出成績的情況。第 3 道門（趨勢領頭門）為強勁而穩定的上升趨勢增加最多 20 個額外名額。股票只需通過一道門。',
        related: ['champion', 'sector-quota', 'hysteresis'],
    },
    champion: {
        term: '冠軍股 (Champion)',
        plain: '在前兩道門都名列前茅的股票。',
        definition:
            '在複利成長門與價值落差門都位居前 10% 的股票。既出色又便宜很罕見，所以冠軍股在排定候選名單順序時會得到小加分（+2）。急劇下跌中的股票不能成為冠軍股。',
        related: ['door', 'composite'],
    },
    hysteresis: {
        term: '遲滯效應（黏性名單）(Hysteresis)',
        plain: '已在候選名單上的股票，要明顯掉出才會被移除。',
        definition:
            '沒有緩衝的話，剛好卡在切線上的股票會隨著每次小幅價格波動進進出出候選名單。所以已在 Research now 的股票，只要排名在 60 名以內就會留在那裡；已在候選名單上的股票，只要排名在 150 名以內就會留在名單上。只有明顯下滑才會被移除。候選名單變動較少，因此更容易追蹤。',
        related: ['band', 'research-now', 'watchlist'],
    },
    'sector-quota': {
        term: '類股配額 (Sector quota)',
        plain: '每個類股能分到幾個候選名單名額。',
        definition:
            '候選名單分散在各類股之間，避免單一產業排擠其他產業。每個類股都得到相同的基本配額。總體引擎原則上可以把更多名額給適合當前經濟的類股——也就是「傾斜」——但它的選類股能力尚未證明自己，所以傾斜被關閉，每個類股都得到相同配額，直到它證明自己為止。',
        related: ['door', 'probability-vector'],
    },
    'rn-depth': {
        term: 'AI 帳本 (rn_depth)',
        plain: '跟隨 AI 分析師通過判定的紙上帳本。',
        definition:
            '三個紙上帳本之一。它等額持有名單上每一檔判定為低估且通過閘門的股票——每日跟進上線後，還要求暫停買進未啟動、且進場時機為現在買進。沒有任何判定通過時，它只持有現金。它至今的歷史來自被裁定無效的舊分析師，所以重建後的分析師上線時，AI 紀錄會從零重新開始，舊歷史則歸檔（見紀錄重置）。',
        related: ['actionable', 'track-record', 'record-reset', 'control-book'],
    },
    'probability-vector': {
        term: '機率向量 (Probability vector)',
        plain: '每個經濟「季節」各一個機率，加總為 100%。',
        definition:
            '總體引擎不只是說出當前的經濟季節。它為五個季節各發布一個機率：金髮女孩、再通膨、緊縮、停滯性通膨與衰退。這些機率是主要產出。單一的季節標籤只是摘要，不驅動任何數字。',
        related: ['shock-register', 'fred', 'sector-quota'],
    },
    'shock-register': {
        term: '衝擊警報表 (Shock register)',
        plain: '監看突發經濟壓力的七個警報。',
        definition:
            '七個警報：恐慌（市場波動）、信用、利率、油價、美元、就業與通膨。每一個都只從 FRED 資料讀取。它們旁邊還有一個動盪風險旗標，當恐慌指數（VIX）達到 30 或更高時就會亮起。',
        related: ['probability-vector', 'fred'],
    },

    // ── Stockpeak v3 handbook (step 4b) ─────────────────────────────────
    crux: {
        term: '關鍵分歧 (The crux)',
        plain: '依分析師之見，股價所錯估的那一個輸入。',
        definition:
            '買進或賣出的判斷必須指出今天股價所錯估的那一個估值輸入——例如第 3–5 年的成長率——並附上股價所隱含的值、分析師自己的值，以及支持它的公司申報文件引文。程式碼會把每一則引文對照指定來源檢查。無法指出有效關鍵分歧的判斷會被維持在 FAIR。關鍵分歧用來解釋判定，並不預測任何事。',
        related: ['price-implied', 'gate', 'iv-band'],
    },
    'price-implied': {
        term: '價格所隱含的數值 (What the price implies)',
        plain: '單靠它就足以支撐今天股價的某個輸入值。',
        definition:
            '取估值的某一個輸入——例如第 3–5 年的成長率——問它需要是多少，模型才會剛好落在今天的股價上。那就是股價對該輸入所隱含的值。關鍵分歧會把它擺在分析師自己的值旁邊。如果任何單一輸入都無法單獨解釋股價，個股頁面會直接說明。',
        related: ['crux', 'reverse-dcf', 'implied-growth'],
    },
    gate: {
        term: '閘門 (The gate)',
        plain: '決定一個判定是否可以算數的自動檢查。',
        definition:
            '判定寫出之後，程式碼會在每次資料重建時重新審視它，並標示是否可執行（是或否）及原因。沒通過的判定仍然被發布並顯示——標為被擋下並附上原因——但它絕不會成為建議，也絕不會進入 AI 紙上帳本。通過閘門代表判定被允許算數，並不證明判定是對的。',
        related: ['actionable', 'blocked', 'gate-reason'],
    },
    blocked: {
        term: '被擋下 (Blocked)',
        plain: '沒通過閘門的判定：僅供紀錄，絕非建議。',
        definition:
            '被擋下與可執行相反。被擋下的判定會在「被閘門擋下」之下以灰色顯示，並用白話寫出原因。它絕不會被裝扮成選股、絕不會被當作選股計算，也絕不會被 AI 帳本買進。被擋下不代表錯了，而是代表系統不為它背書。',
        related: ['actionable', 'gate', 'gate-reason'],
    },
    waiting: {
        term: '等待 (Waiting)',
        plain: '以價值看很便宜，但目前被暫緩。',
        definition:
            '研究台的一個區段，收納通過閘門且低估、卻被暫緩的股票：因為時機（分析師說等待動能，或避開）、因為有事項待處理而暫停買進，或因為跟進資料過時。原因會顯示在該列上。等待不是賣出。每日跟進上線後，這個區段才會有內容。',
        related: ['buy-paused', 'entry-timing', 'follow-up'],
    },
    'no-edge': {
        term: '今日無優勢 (No edge today)',
        plain: '通過閘門，但在價格與價值之間看不出差距的判定。',
        definition:
            '研究台中收納判定通過閘門且為 FAIR（價格位於價值區間內，或安全邊際太薄）或高估之股票的區段。FAIR 是真正的答案——不確定性涵蓋了價格——不是拒絕，也不是賣出訊號。它和篩選的觀察清單等級是分開的。',
        related: ['iv-band', 'watchlist', 'actionable'],
    },
    'buy-paused': {
        term: '暫停買進 (Buy paused)',
        plain: '有事項待處理時，暫緩新的買進。絕不是賣出。',
        definition:
            '當判定面臨突破條件、底線事件、重新分析或「避開」的時機判斷待處理時，由每日跟進設定。如果跟進資料超過 36 小時或缺失，該股票會被視為暫停，而不是可買進。暫停買進絕不代表賣出：持有的股票只會被新的判定移除。跟進已建好，但尚未上線。',
        related: ['follow-up', 'waiting', 'reanalysis-queued'],
    },
    'follow-up': {
        term: '每日跟進／我們在關注什麼 (Follow-up)',
        plain: '每天依各自的監看清單檢查每檔持有或候選股票。',
        definition:
            '每個判定都以一份要留意條件的監看清單作結。每天，跟進會拿新的申報文件、新聞與價值區間，檢查每一檔持有股和每一檔買進候選股。它只決定一件事：現在重新分析，或沒有新消息。它絕不賣出，也不自行更改判定。個股頁面上的「我們在關注什麼」會列出觀察項目與其證據。跟進已建好並在驗收測試中，但尚未上線。',
        related: ['code-floor', 'reanalysis-queued', 'buy-paused', 'thesis-status'],
    },
    'code-floor': {
        term: '程式碼底線 (Code floor)',
        plain: '不論任何模型怎麼說，一律會排入重新分析的明確訊號。',
        definition:
            '跟進在程式碼中、獨立於本機模型所套用的固定清單：財報發布；破產、財報重編、下市或控制權變更類型的申報；剛剛成立的論點失效規則；持有股票上出現安全過濾器否決；以及兩次收盤價落在價值區間的另一側。其中任何一項都會把重新分析排入佇列。',
        related: ['follow-up', 'reanalysis-queued'],
    },
    'reanalysis-queued': {
        term: '已排入重新分析 (Re-analysis queued)',
        plain: '有事情讓這檔股票被移到分析師佇列的最前面。',
        definition:
            '財報發布、申報文件、價格離開價值區間、論點規則被觸發等事件，把這檔股票推到分析師佇列的最前面。在新的判定取代它之前，原有判定維持不變。此外，每檔股票至少每 14 天會重新分析一次。已排入重新分析絕不是賣出訊號。',
        related: ['follow-up', 'code-floor', 'buy-paused'],
    },
    'held-carry': {
        term: '持有中——判定複查中 (Held)',
        plain: '最新判定處理失敗、暫以上一個良好判定維持的持有股票。',
        definition:
            '如果 AI 帳本所持有股票的重新分析沒有產出可用判定，上一個良好的判定會被延續，最多兩次失敗或 21 天。研究台會把這樣的股票標為「持有中——判定複查中」。之後延續就會結束。',
        related: ['follow-up', 'rn-depth'],
    },
    'entry-timing': {
        term: '進場時機 (Entry timing)',
        plain: '分析師的時機判斷，與價值判斷分開。',
        definition:
            '判定說明一檔股票是否便宜；進場時機說明現在是不是時候：現在買進、等待動能，或避開。等待中的股票附有翻轉條件（什麼會改變這個判斷）與失效規則。動能檢視（確認、中性、牴觸）擺在它旁邊。時機可以暫緩一檔低估的股票，但絕不會更改價值判定。',
        related: ['waiting', 'iv-band'],
    },
    'rebuilt-analyst': {
        term: '舊分析師／重建後的分析師',
        plain: '判定是由哪一代分析師寫的。',
        definition:
            '第一代分析師被裁定無效而遭到替換。它的判定帶有閘門原因「由舊分析師做出」，不顯示在研究台上，仍保留在各個股頁面的判定歷史中。重建後分析師的判定會蓋上 pack 版本與閘門版本。目前重建後的分析師已開始發布第一批判定，但其中還沒有任何一個通過閘門。',
        related: ['record-reset', 'gate-reason', 'actionable'],
    },
    'record-reset': {
        term: '紀錄重置 (Record reset)',
        plain: 'AI 紙上紀錄從零重新開始的時刻。',
        definition:
            '因為分析師被替換，重建後的分析師上線時，AI 帳本的紀錄會從零重新開始。由舊分析師產生的先前紀錄會歸檔，仍可在「封存紀錄 · 舊分析師」下查看；新的紀錄則從「上線以來」開始。這件事尚未發生。',
        related: ['rn-depth', 'rebuilt-analyst', 'track-record'],
    },
    'graded-pending': {
        term: '已評分／待評分 (Graded / pending)',
        plain: '評分期間是否已完全過去。',
        definition:
            '每個判定會在 30、91、182 與 365 天後對照基準評分。一個期間只有在完全過去之後才會被評分；在此之前是待評分。成績單同時顯示兩種數量，避免單薄的樣本被誤認為證據。舊分析師的判定也會被評分，但標示為舊版、無定論。',
        related: ['not-yet-proven', 'track-record', 'benchmark'],
    },
    'control-book': {
        term: '對照帳本 (Control book)',
        plain: '每一檔 Research now 的股票，不含 AI——檢驗 AI 是否有附加價值。',
        definition:
            '等額持有每一檔 Research now 股票、完全沒有 AI 參與的紙上帳本。它是科學上的對照組：如果 AI 帳本打不贏它，昂貴的 AI 這一層就沒有比單純的算術多帶來什麼。（在資料中稱為「equal」。）',
        related: ['rn-depth', 'track-record', 'paper-trading'],
    },
    observations: {
        term: '觀測數 (Observations)',
        plain: '一個績效數字背後有多少個每日資料點。',
        definition:
            '績效紀錄頁面上的每個報酬數字，都會連同背後的每日觀測數一起印出。只有幾週資料時，像 CAGR 與夏普這類年化比率只是雜訊，所以在數量有意義之前會一直隱藏。',
        related: ['cagr', 'sharpe-ratio', 'not-yet-proven'],
    },
    'not-yet-proven': {
        term: '尚未證明 (Not yet proven)',
        plain: '系統對自身績效的狀態說明。',
        definition:
            '這個系統的任何部分都還沒有被證明能打敗市場。紙上紀錄很短，至今被評分的判定來自舊分析師，而重建後分析師的判定還沒有任何一個通過閘門。本站顯示的是數量——已評分與待評分——而不是一個標題數字，這裡的任何內容都不應被當作證明。',
        related: ['graded-pending', 'observations', 'track-record'],
    },
};
