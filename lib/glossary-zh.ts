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
    ai: 'RS2 / AI',
    portfolio: '投資組合·部位',
    track: '績效紀錄',
    data: '資料·流程',
    overlay: '覆蓋標記·財報鑑識',
    bands: '等級·否決',
};

export const GLOSSARY_ZH: Record<string, TermZh> = {
    // ── 核心概念 ──────────────────────────────────────────────────────
    composite: {
        term: '綜合評分 (Composite score)',
        plain: '為所有股票排名所用的單一 0–100 數字。',
        definition:
            '把所有股票放上同一張排行榜的最終分數。它由五個因子（價值、品質、動能、低波動、財測修正）的評分合併而成，每個因子都在該股票所屬的類股內衡量，再換算為百分位（0–100），並對脆弱的財務結構或資料缺失套用三項「安全折價」。越高代表支持該股票的證據越多。',
        related: ['factor', 'sector-neutral', 'percentile', 'haircut'],
    },
    factor: {
        term: '因子 (Factor)',
        plain: '一種可衡量、歷史上有助於預測報酬的股票特質。',
        definition:
            '像「便宜」「獲利佳」「近期上漲」這類可量化的特質，學術研究顯示它們平均而言能預測未來報酬。本站評分五個因子：價值、品質、動能、低波動、財測修正。可以想成十項全能的各單項：每個都是獨立技能，綜合評分是它們的總和。',
        related: ['composite', 'value', 'quality', 'momentum'],
    },
    'sector-neutral': {
        term: '類股中性 (Sector-neutral)',
        plain: '每項評分都與該股票所屬產業的內部比較。',
        definition:
            '每檔股票只和同一類股中的其他公司比較——超市與超市競爭，不與軟體公司比較。若無此機制，「動能高」就只是「是科技股」的意思。在類股內衡量能確保公平，這正是五個因子按類股分別計算的原因。',
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
            '把排名轉成 0–100 尺度：第 98 百分位代表該股分數高於約 6,600 檔股票中的 98%。等級（Band）直接由百分位切出（97+ = Research Now，90+ = Watchlist，70+ = Monitor）。',
        related: ['composite', 'band'],
    },
    'rank-ic': {
        term: 'Rank IC（排序資訊係數）',
        plain: '每月衡量每個因子是否真的預測了報酬。',
        definition:
            '因子分數與之後股價報酬之間的排序相關（Information Coefficient）。每個因子每月測量一次作為診斷。引擎不會讓這些測量值主導權重（見「等權重」），只用來確認因子仍在正常運作並回報漂移。',
        related: ['equal-weight', 'backtest', 'out-of-sample'],
    },
    'equal-weight': {
        term: '等權重 (1/N)',
        plain: '五個因子刻意各佔 20%。',
        definition:
            '每個因子對綜合評分貢獻相同的 20%。數十年的研究（DeMiguel、Garlappi & Uppal 2009）顯示，用歷史資料估算出的權重幾乎都會過擬合——在回測中找到的「完美」權重極少能在未來資料中存活。樸素謙遜的 1/N 是樣本外最難被打敗的方法之一。',
        related: ['rank-ic', 'overfitting', 'out-of-sample'],
    },
    overfitting: {
        term: '過擬合 (Overfitting)',
        plain: '把規則調到太貼合過去資料，導致在新資料上失效。',
        definition:
            '量化交易最典型的陷阱：把旋鈕一路調到回測看起來很棒，其實是在背誦過去，而非學習可持續的模式。本站正是因此刻意拒絕優化因子權重。「事後看起來會賺錢」的規則，若是在測試用的同一份資料上逆向工程出來的，就一文不值。',
        related: ['out-of-sample', 'equal-weight', 'backtest'],
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
            '把決策重新描述成「好像當時就可預測」。紙上模擬系統消除了它：每一筆買賣都在未來發生前即時記錄，且記錄只能附加、無法編輯。',
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
            '衡量股價相對於企業實際產生之現金是否便宜。由四種收益率（自由現金流、業主盈餘、EBIT、單純盈餘）構成，都以目前市價為分母。長期平均而言，便宜優於昂貴——但「便宜」總是在同一類股內判斷。',
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
            '用應收帳款天數、資產品質等 8 項比率，衡量企業操縱盈餘的可能性。M 分數偏高是財報鑑識警報；若與高應計項目同時出現，該股會被直接否決。',
        related: ['forensic', 'accruals', 'veto'],
    },
    forensic: {
        term: '財報鑑識旗標 (Forensic flags)',
        plain: '針對可疑會計的黃牌與紅牌。',
        definition:
            '來自財報鑑識資料庫（Beneish M、Sloan 應計項目、過度發行等）的警示燈。單一旗標會對分數套用 0.85 折價；特定旗標同時出現則為硬性否決。就像照片很美、但結構檢驗沒過的房子。',
        related: ['beneish', 'accruals', 'haircut', 'veto'],
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
            '贏家往往會再贏一陣子。動能因子結合 12-1 跳月報酬（學術標準的 12 個月報酬、排除最近一個月）與 52 週高點接近度。是最經典、穩健的「趨勢」因子。',
        related: ['skip-month', 'high-proximity'],
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
    lowvol: {
        term: '低波動因子',
        plain: '波動平穩的股票，歷史上一單位痛苦換來更多報酬。',
        definition:
            '以月報酬的標準差（至少 12 個觀察值）衡量股價是平穩還是劇烈波動。反直覺的是，平穩股票歷史上的風險調整後報酬優於劇烈波動者。本站也因此輸出每檔的年度化波動供部位規模使用。',
        related: ['volatility', 'annualized-volatility'],
    },
    volatility: {
        term: '波動率 (σ)',
        plain: '價格波動的程度——股票的「狂野度」。',
        definition:
            '報酬的標準差。高代表短期內大幅擺動，低代表平穩。希臘字母 σ 是它的符號。波動率是部位規模計算中的「風險」輸入。',
        related: ['lowvol', 'annualized-volatility', 'kelly'],
    },
    'annualized-volatility': {
        term: '年度化波動率',
        plain: '月波動幅度換算成一年。',
        definition:
            '月報酬波動率乘以 √12（12 個月的平方根），以一年為尺度表達。本站輸出每檔的這個數字，供建議投資組合中的凱利部位規模使用。',
        related: ['volatility', 'kelly'],
    },

    // ── 財測修正因子 ───────────────────────────────────────────────────
    revisions: {
        term: '財測修正因子',
        plain: '追蹤公司的分析師是在上調還是下修預測？',
        definition:
            '衡量分析師預期的方向性。分析師上調盈餘預估時，股價往往續漲；下修時往往續跌。由標準化的 EPS 軌跡斜率與結構化的分析師評分構成。',
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
            'EPS 預估隨時間的斜率——在上揚、持穩還是下墜。財測修正因子把這個斜率標準化到 −1～+1，再與結構化分析師評分混合，讓「改善中」與「惡化中」變成可比較的數字。',
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
        term: '預期落差 (Expectations gap / DCF gap)',
        plain: '價格要求的成長率減去公司已證明的成長率。',
        definition:
            '隱含成長率（來自反向 DCF）− 已證明成長率（最近 5 年 SEC 申報的實際營收/FCF 成長），以百分點計。綠色/負值 = 價格要求的成長低於公司已證明——潛在便宜貨。琥珀/正值 = 價格需要無人證明的加速——你必須相信一個故事。',
        related: ['implied-growth', 'reverse-dcf', 'demonstrated-growth'],
    },
    'demonstrated-growth': {
        term: '已證明成長率 (Demonstrated growth)',
        plain: '公司根據申報文件實際達成的成長。',
        definition:
            '從 SEC 申報取得的最近 5 年實際營收與自由現金流成長。這是預期落差中用來與價格承諾比較的基準事實。',
        related: ['expectations-gap', 'sec-filings'],
    },
    'intrinsic-value': {
        term: '內在價值 (Intrinsic value)',
        plain: '獨立於股價、企業真正的價值。',
        definition:
            '以未來現金創造能力為基礎的企業真實價值估計，DCF 產出的數字。RS2 AI 的內在價值錨定於分析師共識區間，並折現回目前價值，讓安全邊際衡量「今天」的便宜程度，而非 12 個月目標價。',
        related: ['dcf', 'margin-of-safety', 'present-value'],
    },
    'margin-of-safety': {
        term: '安全邊際 (Margin of safety)',
        plain: '你得到的折價：比內在價值低多少買進。',
        definition:
            '價格低於估計內在價值的百分比。30% 的安全邊際表示用 70 分錢買 1 元價值的股票。RS2 用它（搭配信念度）作為 Research Now 名單的門檻：深度價值（MoS ≥ 30%）無論信念度皆入選；中度價值則需要信念度 ≥ 9.5。',
        related: ['intrinsic-value', 'conviction'],
    },
    'cost-of-equity': {
        term: '股權成本 (Cost of equity)',
        plain: '股東要求的報酬——股權現金流的折現率。',
        definition:
            '投資人為持有股票而非較安全資產所要求的最低年報酬。是 DCF 中折現未來股權現金流所用的比率。RS2 折現一年的股權成本，把內在價值拉回今天。',
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

    // ── RS2 / AI ───────────────────────────────────────────────────────
    llm: {
        term: 'LLM（大型語言模型）',
        plain: '閱讀申報文件並撰寫獨立判斷的 AI。',
        definition:
            'RS2 系統以本機 AI（大型語言模型）閱讀每家公司的實際 SEC 申報文件，產出獨立的分析——就像取得第二位醫師的意見。其判斷建立了可透過 RS2 LLM 鏡頭檢視的平行排名。',
        related: ['stance', 'conviction', 'action'],
    },
    stance: {
        term: '立場 (Stance)',
        plain: 'AI 的估值判斷：低估、合理、高估。',
        definition:
            'RS2 的總結性判斷：UNDERVALUED（價格相對於證據太低）、FAIR（合理）、OVERVALUED（價格已假設很多）。在排名中以彩色藥丸顯示。',
        related: ['llm', 'margin-of-safety'],
    },
    conviction: {
        term: '信念度 (Conviction)',
        plain: 'AI 對自己判斷的信心，0–15。',
        definition:
            'RS2 對自身判斷的自評信心，從 0（猜測）到 15（非常有信心）。它在 AI Research Now 門檻中很重要：中度價值需要夠高的信念度才入選。',
        related: ['llm', 'margin-of-safety'],
    },
    action: {
        term: '動作 (Action)',
        plain: 'AI 分析師會對該股採取的行動——意見，不是委託。',
        definition:
            'AI 建議的動作（買進/累積/持有/減碼/迴避…）。是研究用的意見、不是委託單——本站從不執行交易。強烈迴避或賣出在 AI 鏡頭下是否決。',
        related: ['llm', 'exit-review'],
    },
    'exit-review': {
        term: '出場檢視 (Exit review)',
        plain: '對已跌出名單股票、給現有持有人的 AI 持有/減碼/賣出判斷。',
        definition:
            '當一檔股票跌出量化 Research Now 名單，RS2 會為已持有的人檢視：持有、減碼或賣出。以琥珀色「LLM EXIT」旗標顯示。是給現有持有人的決定，而非新的買進理由。',
        related: ['llm', 'action', 'band'],
    },

    // ── 等級·否決 ──────────────────────────────────────────────────────
    band: {
        term: '等級 (Band)',
        plain: '把排名轉成實際行動的區間。',
        definition:
            '把百分位切成四個實用區間：RESEARCH NOW（前 3%）、WATCHLIST（前 10%）、MONITOR（前 30%）、PASS（其餘）。等級告訴你今天這檔股票值不值得花時間研究。',
        related: ['research-now', 'watchlist', 'percentile'],
    },
    'research-now': {
        term: 'Research Now',
        plain: '前 3%——今天值得你研究時間的候選名單。',
        definition:
            '最高等級：受評股票的前 3%。在 AI 鏡頭中，RS2 Research Now 門檻還會加上安全邊際與信念度等額外條件，所以兩份名單可能不同。這是研究候選名單，絕不是買單。',
        related: ['band', 'watchlist', 'margin-of-safety'],
    },
    watchlist: {
        term: 'Watchlist（觀察清單）',
        plain: '前 10%——證據強、值得關注。',
        definition:
            '第二級（90–97 百分位）。證據強，略低於 Research Now 的門檻。這裡的股票值得留意，且常會被升級。',
        related: ['band', 'research-now'],
    },
    monitor: {
        term: 'Monitor（觀察）',
        plain: '前 30%——合理但不突出的證據。',
        definition:
            '第三級（70–90 百分位）。分數合理但無特別之處。研究時間的優先度低。',
        related: ['band'],
    },
    pass: {
        term: 'Pass（略過）',
        plain: '未達前 30% 的其餘股票。',
        definition:
            '約 70% 未進前 30% 的股票獲得的預設等級。不是「爛公司」的意思，只是今天證據不足以爭取你的注意力。',
        related: ['band'],
    },
    veto: {
        term: '否決 (Veto)',
        plain: '無論分數多好都自動淘汰。',
        definition:
            '在評分前套用的硬性取消資格：不管綜合分數為何的紅牌。原因包括未通過逆向引擎的安全檢查、兩個財報鑑識警報同時響起（Beneish + 高應計）、過度發行股票稀釋股東，或（在 AI 鏡頭中）強烈迴避/賣出。原因寫在紅牌上。',
        related: ['forensic', 'beneish', 'dilution'],
    },
    haircut: {
        term: '安全折價 (Safety haircut)',
        plain: '因脆弱或資料缺失，對分數套用的乘法折扣。',
        definition:
            '排名後套用到綜合分數的懲罰：存活度 = 0.7 + 0.3×(存活度/100)；資料品質 = min(1, 0.8 + 0.04×資料品質)；財報鑑識 = 若 Beneish 或應計警報僅單獨響起則 0.85。結果重新排名。折價降低分數，但不是否決。',
        related: ['composite', 'veto', 'forensic'],
    },

    // ── 投資組合·部位 ──────────────────────────────────────────────────
    kelly: {
        term: '凱利準則 (Kelly criterion)',
        plain: '在有優勢時，算出數學上「正確」的下注大小的公式。',
        definition:
            '經典的資金管理公式：下注比例與你的優勢除以變異數成正比（f = edge / variance）。本站使用四分之一凱利（其值 × 0.25）、上限 5%——刻意保守，因為在真實不確定性下，全額凱利太激進。',
        related: ['edge', 'position-sizing', 'annualized-volatility'],
    },
    edge: {
        term: '優勢 (Edge)',
        plain: '你預期的優勢——在此指預期落差收斂。',
        definition:
            '在本系統中，優勢估計為預期落差約 3 年內收斂（市場重新評價被低估的股票）。只有定價低於已證明成長的股票才具可測量的優勢，這就是為何排名高但昂貴的股票會被以「無凱利優勢」略過。',
        related: ['expectations-gap', 'kelly'],
    },
    'position-sizing': {
        term: '部位規模 (Position sizing)',
        plain: '決定每檔股票投入多少資本。',
        definition:
            '把候選名單變成投資組合的數學：四分之一凱利規模、單一部位上限 5%、財報鑑識旗標減半、地緣政治風險與內部人賣出時縮小，並受類股（25%）與主題（30%）上限約束。其餘留在現金。',
        related: ['kelly', 'sector-cap', 'theme-cap'],
    },
    'sector-cap': {
        term: '類股上限 (Sector cap)',
        plain: '單一類股在投資組合中可佔比重的上限。',
        definition:
            '把單一類股限制在投資組合 25% 的風險規則，避免計畫變成變相的單一行業賭注。主題集中度同樣限制在 30%。',
        related: ['position-sizing', 'theme-cap'],
    },
    'theme-cap': {
        term: '主題上限 (Theme cap)',
        plain: '單一熱門主題在投資組合中可佔比重的上限。',
        definition:
            '把單一主題限制在投資組合 30% 的風險規則。無論有多少股票評分很高，都避免計畫把籌碼全押在單一敘事（AI、生技等）上。',
        related: ['position-sizing', 'sector-cap', 'theme'],
    },
    cash: {
        term: '現金（計畫內）',
        plain: '未投入的資本——是特色，不是缺陷。',
        definition:
            '建議計畫中未配置的部分。價值核心刻意維持約 50% 現金，因為它只買有可測量優勢的股票、拒絕為昂貴的股票買單。現金是保護：你不必事事都對，而且有子彈等待便宜貨出現。',
        related: ['edge', 'kelly'],
    },
    'book-value': {
        term: '帳面價值 (Book value)',
        plain: '投資組合投入資本的會計價值。',
        definition:
            '計畫的成本基礎／資本基礎。上限與「資金外衣」（sleeve）的比重都以帳面價值的百分比表達（例如品質資金外衣上限約為帳面價值的 35%）。',
        related: ['sleeve'],
    },
    sleeve: {
        term: '品質資金外衣 (Quality sleeve)',
        plain: '混合計畫中的額外區塊——無論估值一律買進頂尖名單。',
        definition:
            '混合（plan2）投資組合的一部分：在凱利價值核心之上，無論估值落差，買進排名最高的股票，上限約為帳面價值的 35%。這就是混合計畫持有價值核心拒絕的昂貴領頭股（TSM、GOOGL、MU）並動用閒置現金的方式。外衣列以粉紅色顯示。',
        related: ['book-value', 'cash', 'plan'],
    },
    'macro-derisk': {
        term: '總體去風險 (Macro de-risk)',
        plain: '聯準會警示燈亮起時，所有部位規模自動減半。',
        definition:
            '監看以聯準會資料建構之總體旗標的規則。兩個以上旗標同時亮起時，所有建議部位規模自動減半，以降低對惡化總體環境的曝險。',
        related: ['macro-flags', 'position-sizing'],
    },
    'macro-flags': {
        term: '總體旗標 (Macro flags)',
        plain: '來自聯準會資料的警示燈。',
        definition:
            '由 FRED（聯準會）資料衍生的訊號（如殖利率曲線、成長指標）。在投資組合頁顯示為「Macro flags: …」；2 個以上亮起時，總體去風險會讓所有規模減半。',
        related: ['macro-derisk', 'fred'],
    },
    plan: {
        term: 'Plan（價值核心）',
        plain: '由 Research Now 名單建構的建議配置。',
        definition:
            '由 Research Now 名單機器建構的配置（不是你的投資組合）。價值核心使用四分之一凱利規模，只買定價低於已證明成長的股票，遵守類股/主題上限，並維持約 50% 現金。是決策支援，不執行交易。',
        related: ['kelly', 'sleeve', 'cash'],
    },
    plan2: {
        term: 'Plan2（混合）',
        plain: '價值核心加上持有領頭股的品質資金外衣。',
        definition:
            '混合變體：同一個凱利價值核心，再加上無論估值落差都買進頂尖股票的品質資金外衣（上限約帳面價值 35%），因此能持有價值核心拒絕的昂貴領頭股，並動用更多閒置現金（約 78% 投入）。取捨：領頭股曝險更多、價值紀律較弱，在衰退中回檔更深。',
        related: ['sleeve', 'plan', 'drawdown'],
    },
    'paper-trading': {
        term: '紙上交易 (Paper trading)',
        plain: '沒有真錢、但有真規則的交易——記錄卻是真實的。',
        definition:
            '系統每天以真實價格與真實交易成本模擬買賣自己的選股，且記錄只能附加、無法編輯。這是誠實的量尺：若機器錯了，績效紀錄頁會公開地、永久地承認。',
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
        plain: '因為偏離計畫而損失的報酬。',
        definition:
            '紀律良好的模型賺的報酬與你實際賺的報酬之間的差距，源自你自己的決定——太早賣、追高、忽略出場。在績效紀錄中，「mine 落後 plan」就是行為落差，以真金白銀公開衡量。',
        related: ['track-record', 'mine', 'plan'],
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
            '從投資組合歷史高點到其後最低點的下滑百分比。30% 回檔代表最差時點從高點跌了 30%。這是風險的「痛苦」面；混合計畫（plan2）在衰退中往往回檔更深。',
        related: ['plan2', 'volatility', 'sharpe-ratio'],
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
        plain: '系統自身紙上交易誠實且不可編輯的成績單。',
        definition:
            '以真實價格與交易成本每日紙上交易四個投資組合（plan、plan2、equal、mine）並以附加式記錄的頁籤。與其討好人的回測，它是機器實際所做（包括錯誤）的永久公開紀錄。',
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
            '聖路易斯聯準銀行的免費美國經濟序列資料庫，供應觸發去風險之總體旗標背後的總體序列。',
        related: ['macro-flags', 'macro-derisk'],
    },
    'github-actions': {
        term: 'GitHub Actions',
        plain: '每天重新執行整個流程的雲端自動化。',
        definition:
            '依排程自動執行資料擷取、評分鏈與紙上交易帳本的 CI/CD 服務，也會在你請求時觸發 AI 分析作業。整個流程每天重跑，IC 漂移報告每月重算。',
        related: ['pipeline'],
    },
    pipeline: {
        term: '流程 (Pipeline)',
        plain: '把原始資料變成排名表的命令鏈。',
        definition:
            '端到端過程：擷取財務與股價 → 建立財務歷史 → 逆向引擎 → 因子評分 → 投資組合計畫 → 前瞻結果衡量。編排器強制執行順序與資料完整性檢查，讓過時或殘缺資料永遠無法悄悄污染排名。',
        related: ['github-actions', 'reverse-engine'],
    },
    'reverse-engine': {
        term: '逆向引擎 (Reverse engine)',
        plain: '因子實驗室所立足的第一道安全與品質引擎。',
        definition:
            '對每檔股票分類其原型（A–F）、評分存活度與資料品質、計算財報鑑識旗標的評分階段，也會提名候選股，並與反向 DCF 模型共同產出因子實驗室所需的安全輸入與已證明成長率。',
        related: ['pipeline', 'reverse-dcf', 'forensic'],
    },

    // ── 覆蓋標記·財報鑑識 ──────────────────────────────────────────────
    gpr: {
        term: 'GPR（地緣政治曝險）',
        plain: '0–3 的地緣政治曝險標記。',
        definition:
            '依公司實際業務輪廓（營收地域、供應鏈、監管、制裁）標記的地緣政治風險。絕不是買賣訊號：而是第 3 級時縮小建議部位、要求更大的安全邊際。',
        related: ['overlay', 'position-sizing'],
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
            '公司發行新股時，每一股佔的餅就越小。過度發行是財報鑑識旗標，也可能是硬性否決（除非該原型以發行為預期的融資方式，如銀行與部分金融股）。',
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
        plain: '疊在分數之上的額外脈絡標籤。',
        definition:
            'GPR（地緣政治曝險）與 ▲/▼ INSIDERS（知情需求）等非計分訊號。它們絕不加入綜合分數——只會縮小部位、要求更大安全邊際，或質疑你的論點。',
        related: ['gpr', 'informed-demand'],
    },
    theme: {
        term: '主題 (Theme)',
        plain: '熱門類別（AI、生技…）——是脈絡，不是計分因子。',
        definition:
            '股票所屬的市場敘事（如 AI、半導體、生技）。主題歸屬僅供定向與過熱（crowding）警告之用，絕不加入分數——因為單純追逐主題在歷史上摧毀價值（專業主題 ETF 平均每年 −3.1%）。',
        related: ['theme-cap', 'composite'],
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
};
