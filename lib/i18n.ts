export type Language = 'en' | 'ko';

export const TRANSLATIONS = {
    en: {
        appTitle: "Quant Screener",
        // Controls
        start: "Start",
        pause: "Pause",
        resume: "Resume",
        stop: "Stop",
        status: "Status",
        viewLogs: "View System Logs",
        searchPlaceholder: "Search ticker...",

        // Progress
        scanning: "Scanning",
        saved: "saved",
        gems: "gems",
        skipped: "skipped",
        processing: "Processing",

        // Dashboard
        marketOpp: "Market Opportunities",
        showing: "Showing",
        assets: "assets",
        initEngine: "Initializing Quant Engine...",
        noStocks: "No stocks found matching criteria",
        resetFilters: "Reset Filters",
        previous: "Previous",
        next: "Next",

        // Sidebar
        filters: "Filters",
        apply: "Apply Filters",
        reset: "Reset",
        sizePrice: "Size & Price",
        growthEff: "Growth & Efficiency",
        valuation: "Valuation",
        ownership: "Ownership",

        // Filter Labels
        minMarketCap: "Min Market Cap ($M)",
        maxMarketCap: "Max Market Cap ($M)",
        maxPrice: "Max Share Price ($)",
        maxFloat: "Max Float (Millions)",
        minRevGrowth: "Min Revenue Growth (%)",
        minGrossMargin: "Min Gross Margin (%)",
        minROIC: "Min ROIC (%)",
        maxPS: "Max P/S Ratio",
        maxPEG: "Max PEG Ratio",
        minInsider: "Min Insider Ownership (%)",

        // Stock Card
        growth: "Growth",
        roic: "ROIC",
        mcap: "M-Cap",

        // Modal
        compounderCandidate: "COMPOUNDER CANDIDATE",
        gemCandidate: "GEM CANDIDATE",
        disqualified: "DISQUALIFIED",
        watchlist: "WATCHLIST",
        blueprintAnalysis: "Blueprint Analysis",
        verdictPass: "This asset meets all core quantitative thresholds for a potential 100-bagger.",
        verdictFail: "This asset missed the strict 'Gem' criteria (e.g. Sector-specific margins or P/S limits), but is still strong enough to appear in your filtered grid.",
        phase1: "Phase 1: The Engine Room",
        phase2: "Phase 2: The Kill List",
        noFatalFlaws: "No fatal flaws detected.",
        historicalBenchmarks: "Historical Benchmarks",
        verdict: "Verdict",
        strongCandidate: "Strong candidate for deep dive.",
        target: "Target",
        pass: "PASS",
        watch: "WATCH",
        fail: "FAIL",
        // Modal Labels
        askGemini: "Ask Gemini",
        industry: "Industry",
        noDesc: "No company description available.",
        openTV: "Open in TradingView",
        openYF: "Open in Yahoo Finance",

        // Metrics
        revGrowth: "Revenue Growth",
        grossMargin: "Gross Margin",
        insiderOwn: "Insider Ownership",
        pegRatio: "PEG Ratio",

        // Fail Codes
        "FAIL_MCAP": "Market Cap out of range ($50M-$2B)",
        "FAIL_PRICE": "Price >= $25",
        "FAIL_GROWTH": "Revenue Growth < 20%",
        "FAIL_GM": "Gross Margin below sector targets",
        "FAIL_GM_TREND": "Gross Margin declining vs 3yr Avg",
        "FAIL_ROIC": "ROIC < 15%",
        "FAIL_PS": "P/S Ratio too high",
        "FAIL_PEG": "PEG Ratio > 1.5",
        "FAIL_FLOAT": "Float > 50M shares",
        "FAIL_INSIDER": "Insider Ownership < 15%",
    },
    ko: {
        appTitle: "퀀트 스크리너",
        // Controls
        start: "시작",
        pause: "일시정지",
        resume: "재개",
        stop: "정지",
        status: "상태",
        viewLogs: "시스템 로그 보기",
        searchPlaceholder: "티커 검색...",

        // Progress
        scanning: "스캔 중",
        saved: "저장됨",
        gems: "보석",
        skipped: "건너뜀",
        processing: "처리 중",

        // Dashboard
        marketOpp: "시장 기회",
        showing: "표시 중",
        assets: "개",
        initEngine: "퀀트 엔진 초기화 중...",
        noStocks: "조건에 맞는 주식이 없습니다",
        resetFilters: "필터 초기화",
        previous: "이전",
        next: "다음",

        // Sidebar
        filters: "필터",
        apply: "필터 적용",
        reset: "초기화",
        sizePrice: "규모 및 가격",
        growthEff: "성장성 및 효율성",
        valuation: "가치평가",
        ownership: "지분 구조",

        // Filter Labels
        minMarketCap: "최소 시가총액 ($M)",
        maxMarketCap: "최대 시가총액 ($M)",
        maxPrice: "최대 주가 ($)",
        maxFloat: "최대 유동주식수 (백만)",
        minRevGrowth: "최소 매출성장률 (%)",
        minGrossMargin: "최소 매출총이익률 (%)",
        minROIC: "최소 투하자본이익률 (ROIC) (%)",
        maxPS: "최대 PSR (주가매출비율)",
        maxPEG: "최대 PEG (주가수익성장비율)",
        minInsider: "최소 내부자 지분율 (%)",

        // Stock Card
        growth: "성장률",
        roic: "ROIC",
        mcap: "시총",

        // Modal
        compounderCandidate: "100배 후보군",
        gemCandidate: "보석 발굴",
        disqualified: "탈락",
        watchlist: "관심종목",
        blueprintAnalysis: "블루프린트 분석",
        verdictPass: "이 자산은 잠재적 100배 주식이 되기 위한 모든 정량적 기준을 충족합니다.",
        verdictFail: "이 자산은 엄격한 '보석' 기준(섹터별 마진 또는 PSR 등)을 놓쳤지만, 여전히 강력한 후보입니다.",
        phase1: "1단계: 엔진 룸 (기초 체력)",
        phase2: "2단계: 킬 리스트 (리스크)",
        noFatalFlaws: "치명적인 결함이 발견되지 않았습니다.",
        historicalBenchmarks: "역사적 벤치마크",
        verdict: "최종 판정",
        strongCandidate: "심층 분석을 위한 강력한 후보입니다.",
        target: "목표",
        pass: "통과",
        watch: "관망",
        fail: "실패",
        // Modal Labels
        askGemini: "Gemini에 질문하기",
        industry: "산업",
        noDesc: "회사 설명이 없습니다.",
        openTV: "트레이딩뷰에서 보기",
        openYF: "야후 파이낸스에서 보기",

        // Metrics
        revGrowth: "매출 성장률",
        grossMargin: "매출총이익률",
        insiderOwn: "내부자 지분율",
        pegRatio: "PEG 비율",

        // Fail Codes
        "FAIL_MCAP": "시가총액 범위 초과 ($50M-$2B)",
        "FAIL_PRICE": "주가 $25 이상 (저가주 선호)",
        "FAIL_GROWTH": "매출 성장률 20% 미만",
        "FAIL_GM": "매출총이익률 목표 미달",
        "FAIL_GM_TREND": "3년 평균 대비 이익률 하락",
        "FAIL_ROIC": "투하자본이익률(ROIC) 15% 미만",
        "FAIL_PS": "주가매출비율(P/S) 너무 높음",
        "FAIL_PEG": "PEG 비율 1.5 초과 (고평가)",
        "FAIL_FLOAT": "유동주식수 5천만주 초과",
        "FAIL_INSIDER": "내부자 지분율 15% 미만",
    }
};

export const FILTER_DEFS_EN: Record<string, string> = {
    minMarketCap: "Minimum value of the company ($M). Small caps (>50M) often have more room to grow.",
    maxMarketCap: "Maximum value. 100-baggers usually start small (<2B).",
    maxPrice: "Stock price per share. Lower price psychology sometimes helps runs.",
    minRevenueGrowth: "Year-over-Year revenue growth. High growth (>20%) is essential.",
    minGrossMargin: "Percentage of revenue kept after COGS. High margins (>50%) allow scalability.",
    minROIC: "Return on Invested Capital. Measures how efficiently management uses cash.",
    maxPEG: "Price/Earnings to Growth. < 1.0 is undervalued relative to growth.",
    maxPS: "Price-to-Sales. < 3.0 is generally safer for unprofitables.",
    minInsiderOwnership: "Percentage of shares held by management. High skin-in-the-game is good.",
    maxFloat: "Number of shares available to trade. Low float (<20M) allows explosive moves."
};

export const FILTER_DEFS_KO: Record<string, string> = {
    minMarketCap: "회사의 최소 가치 ($M). 소형주(>50M)가 성장 여력이 큽니다.",
    maxMarketCap: "최대 가치. 100배 주식은 보통 작게 시작합니다 (<2B).",
    maxPrice: "주당 가격. 낮은 가격이 심리적으로 상승에 도움이 될 때가 있습니다.",
    minRevenueGrowth: "전년 대비 매출 성장률. 고성장(>20%)은 필수입니다.",
    minGrossMargin: "매출총이익률. 높은 마진(>50%)은 확장성을 의미합니다.",
    minROIC: "투하자본이익률. 경영진이 자본을 얼마나 효율적으로 쓰는지 측정합니다.",
    maxPEG: "PEG 비율. 1.0 미만은 성장성 대비 저평가 상태입니다.",
    maxPS: "주가매출비율(PSR). 적자 기업의 경우 3.0 미만이 안전합니다.",
    minInsiderOwnership: "경영진 보유 지분율. 주주와 이해관계가 일치하는지 봅니다.",
    maxFloat: "유동주식수. 품절주(<20M)가 폭발적인 시세 분출에 유리합니다."
};
