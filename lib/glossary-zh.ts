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
            '以未來現金創造能力為基礎的企業真實價值估計——DCF 產出的數字。AI 分析師每次執行都會產出一個；判決是把今天的股價與這些數值的範圍（價值區間）比較，而不是與單一數字比較。',
        related: ['dcf', 'margin-of-safety', 'iv-band'],
    },
    'margin-of-safety': {
        term: '安全邊際 (Margin of safety)',
        plain: '你得到的折價：比估計價值低多少買進。',
        definition:
            '價格比估計價值便宜多少，以百分比表示。30% 的安全邊際表示用 70 分錢買 1 元估計價值。看起來大得不合理的安全邊際本身就是警訊：閘門會擋下價值高出股價到不合理程度的判決。',
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
            '最高等級：依優先順序大約前 50 到 60 檔，包含少數趨勢領頭股。這是研究候選名單，絕不是買單。在研究台的 AI 一側，只有 AI 判決為低估且通過閘門時，名稱才會出現在 Research now 之下。',
        related: ['band', 'watchlist', 'actionable'],
    },
    watchlist: {
        term: 'Watchlist（觀察清單）',
        plain: '候選名單的其餘部分——證據強、值得關注。',
        definition:
            '第二級：候選名單中位於 Research now 以下的部分（整份候選名單約 150 檔）。這裡的股票值得留意，且常會被升級。在研究台的 AI 一側，當 AI 判決為合理或高估且通過閘門時，名稱會出現在 Watchlist 之下。',
        related: ['band', 'research-now'],
    },
    pass: {
        term: 'Pass（略過）',
        plain: '有評分，但不在候選名單上。',
        definition:
            '有評分、但沒有拿到候選名單名額的股票的預設等級。不是「壞公司」的判決——只是證據不足以在今天贏得你的注意。',
        related: ['band'],
    },
    veto: {
        term: '否決 (Veto)',
        plain: '無論看起來多好，都被安全過濾器剔除的股票。',
        definition:
            '硬性取消資格。被否決的股票沒有等級，也不會被分析。原因包括：股票無法交易（下市或停牌）、規模太小或成交太清淡、沒有可用的申報基本面、是空殼公司，或——僅限市值低於 100 億美元的公司——有長期營運虧損加上沉重債務，或兩個財報鑑識紅旗同時出現。較大的公司只會得到警告。原因會寫在紅色標籤上。',
        related: ['forensic', 'beneish', 'dilution'],
    },

    // ── 投資組合·部位 ──────────────────────────────────────────────────
    'position-sizing': {
        term: '部位規模 (Position sizing)',
        plain: '決定每檔股票投入多少資本。',
        definition:
            '把候選名單變成投資組合的數學。本站不提供投資組合計畫。它提供的是 AI 判決上的部位大小提示——四分之一、一半或全額——依價值區間的寬窄決定：各次執行的分歧越大，建議的部位就越小。',
        related: ['iv-band', 'position-basis'],
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
        related: ['track-record', 'mine'],
    },
    'behavior-gap': {
        term: '行為落差 (Behavior gap)',
        plain: '因偏離系統而損失的報酬。',
        definition:
            '紀律化系統的所得與你實際所得之間的差距，由你自己的決策造成——太早賣出、追高、無視出場。在績效紀錄中，Mine 帳本落後 Equal-weight 帳本的部分就是行為落差，公開地被衡量。',
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
            '超額報酬 ÷ 波動率。衡量報酬相對於風險：夏普越高，代表策略以較不劇烈的起伏賺到報酬。要等績效紀錄頁累積夠多天的實測資料後才會出現。',
        related: ['volatility', 'track-record'],
    },
    cagr: {
        term: 'CAGR（年複合成長率）',
        plain: '投資組合平滑的年成長率。',
        definition:
            'Compound Annual Growth Rate：能在整個期間把起始值變成終值的單一年化百分比，彷彿成長完全平滑。讓你能以同一年化基準比較投資組合。',
        related: ['track-record', 'roic'],
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
            '扣除成本後，投資組合超越其基準（如 IWM 或 SPY）的表現。正 Alpha 代表選股或部位規模有加分；負代表機器（或你的偏離）比直接持有指數更糟。',
        related: ['benchmark', 'iwm', 'spy'],
    },
    benchmark: {
        term: '基準 (Benchmark)',
        plain: '用來比較投資組合的指數。',
        definition:
            '用來判斷機器是否加值的參考組合，通常是寬基指數。本系統以 IWM（羅素 2000 小型股，最接近其宇宙）與 SPY（標普 500）為基準，可從 NAV 圖表開關。',
        related: ['iwm', 'spy', 'alpha'],
    },
    iwm: {
        term: 'IWM',
        plain: 'iShares 羅素 2000 ETF——美國小型股。',
        definition:
            '羅素 2000 小型股指數最常見的 ETF 代理。因為本系統篩選小型與中型股，IWM 是最該被擊敗的基準。',
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
            '以真實價格與交易成本，每天紙上交易三個帳本的頁籤：Equal-weight、AI 帳本與 Mine。與其討好人的回測，它是系統實際所做之事的紀錄——包括它的錯誤。',
        related: ['paper-trading', 'behavior-gap', 'alpha'],
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
            '端到端過程：擷取申報文件、股價與總體資料 → 安全過濾器 → 三道門篩選 → 等級 → AI 分析師（執行時）→ 閘門 → 發布到網站 → 紙上帳本 → 評分。評分部分依固定順序並附帶完整性檢查執行，讓過時或殘缺的資料無法悄悄污染候選名單。',
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
    theme: {
        term: '主題 (Theme)',
        plain: '熱門類別（AI、生技…）——是脈絡，不是計分因子。',
        definition:
            '股票所屬的市場敘事（如 AI、半導體、生技）。主題歸屬僅供定向之用，絕不加入分數——因為單純追逐主題在歷史上摧毀價值（專業主題 ETF 平均每年 −3.1%）。',
        related: ['overlay'],
    },

    // ── 常見用語 ────────────────────────────────────────────────────────
    ticker: {
        term: '股票代號 (Ticker)',
        plain: '股票的交易所代號——例如 AAPL。',
        definition:
            '用於識別與交易股票的短交易所代號（如蘋果的 AAPL、台積電的 TSM）。是排行榜每一列的索引鍵。',
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
        plain: '分析師各次執行所得出的價值範圍。',
        definition:
            '每檔股票都經過 2–3 次獨立執行，每次執行都以一個對企業價值的估計作結。價值區間是這些估計從最低到最高的範圍；中位數是中間那一個。判決就是今天的股價相對於區間的位置：低於區間 = 低估，在區間內 = 合理，高於區間 = 高估。在研究台上，有色帶是範圍，刻度是中位數，白線是股價。區間較寬代表各次執行意見分歧，這會讓建議部位變小。',
        related: ['intrinsic-value', 'actionable', 'position-sizing'],
    },
    'not-usable': {
        term: '無法使用 (Not usable)',
        plain: '分析師沒有產出可用判決的一列。',
        definition:
            '當判決步驟發生故障，該列會被標為無法使用，而不是被硬塞一個猜測。它沒有方向、絕不會被當作選股顯示，並位於研究台 AI 一側的「被否決」之下。',
        related: ['actionable', 'iv-band'],
    },
    actionable: {
        term: '可執行 (Actionable)',
        plain: '通過閘門所有規則的判決。',
        definition:
            '每個 AI 判決都帶有一個稱為 actionable（可執行）的是／否旗標，答案為否時還會附上原因清單。只有可執行的判決才能出現在 AI 一側的 Research now 或 Watchlist 之下，或被 AI 紙上帳本跟隨。不可執行的判決不會被刪除：它仍然可見，並標示為被擋下。',
        related: ['gate-reason', 'street-fence', 'rn-depth'],
    },
    'gate-reason': {
        term: '閘門原因 (Gate reason)',
        plain: '用白話寫出判決被擋下的原因。',
        definition:
            '當判決被擋下，研究台會說明原因——例如「由舊分析師做出」或「各次執行分歧太大」。一個判決可以有不只一個原因。完整清單在本手冊的閘門章節。',
        related: ['actionable', 'street-fence'],
    },
    'street-fence': {
        term: '華爾街圍欄 (Street fence)',
        plain: '分析師的目標價區間，用作外部檢查。',
        definition:
            '華爾街（the Street）指追蹤一家公司的專業分析師。華爾街圍欄就是他們目標價的範圍。程式碼拿 AI 分析師的答案來對照：落在圍欄外的價值會被擋下；沒有圍欄可供核對的判決會被擋下；價值高出股價到不合理程度的判決也會被擋下。這是對分析師自身工作的外部檢查。',
        related: ['actionable', 'gate-reason', 'estimates'],
    },
    'thesis-status': {
        term: '論點狀態 (Thesis status)',
        plain: '判決背後的理由是否仍然成立。',
        definition:
            '新分析師的每個判決都會寫明自己的失效規則——一旦發生就代表論點已破裂的事。監控程式會拿目前資料重新檢查這些規則。完好（intact）= 規則已檢查且沒有任何一條觸發；破裂（breached）= 至少一條觸發；未知（unknown）= 沒有任何一條能被檢查。論點破裂時會被標記。這隨分析師重新上線而到來。',
        related: ['actionable', 'position-basis'],
    },
    'position-basis': {
        term: '部位依據 (Position basis)',
        plain: '持有一檔股票是為了它的價值，還是它的動能。',
        definition:
            '判決可以帶有一個依據。價值依據（Value basis）：論據建立在價格低於價值區間。動能依據（Momentum basis）：分析師的價值低於股價，但該股處於有基本面支持的強勁上升趨勢，因此可以——以一半或四分之一的部位——持有而不是賣出。無（None）：不建議任何部位。這隨分析師重新上線而到來。',
        related: ['position-sizing', 'thesis-status'],
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
        plain: '跟隨 AI 分析師通過閘門之判決的紙上帳本。',
        definition:
            '三個紙上帳本之一。它等額持有每一檔 AI 判決為低估且通過閘門的候選名單股票。當沒有任何判決通過時，它只持有現金——自 2026-09-24 以來就是這樣。它至今的歷史來自被裁定無效的舊分析師，所以新分析師上線時，AI 紀錄會從零重新開始，舊歷史則歸檔。',
        related: ['actionable', 'track-record', 'paper-trading'],
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
};
