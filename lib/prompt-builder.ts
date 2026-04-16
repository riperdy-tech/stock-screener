import { type ScreeningResult } from './blueprint';

/**
 * Client-side prompt builder for the AI Prompt Exporter.
 * Loads per-ticker financial detail JSON (pre-computed during the scan phase)
 * and combines it with the valuation engine template.
 * 
 * Data flow:
 *   fetch_data.py → public/data/financials/{TICKER}.json (quarterly/annual statements, EV, FCF, etc.)
 *   prompt-builder.ts → loads that JSON + screener data → builds the full prompt
 */

// ─── Financial Detail Types ───────────────────────────────

interface IncomeRow {
    Date: string;
    TotalRevenue: number | null;
    GrossProfit: number | null;
    OperatingIncome: number | null;
    NetIncome: number | null;
}

interface FinancialDetail {
    Ticker: string;
    Data_Fetched_Date: string | null;
    Next_Earnings_Date: string | null;
    Price: number;
    Shares_Outstanding: number;
    Market_Cap: number;
    Enterprise_Value_EV: number;
    Total_Cash: number | null;
    Total_Debt: number | null;
    SBC_Stock_Based_Comp: number | null;
    Free_Cash_Flow_TTM: number | null;
    Annual_Income_Statement: IncomeRow[];
    Quarterly_Income_Statement: IncomeRow[];
    Calculated_Metrics: {
        TTM_Revenue: number | null;
        'TTM_Gross_Margin_%': number | null;
        'YoY_Revenue_Growth_%': number | null;
        'FCF_Margin_%': number | null;
        Rule_of_40: number | null;
        EV_to_Sales: number | null;
        EV_to_Gross_Profit: number | null;
        EV_to_EBIT: number | null;
        'Core_Anchor_Multiple_0.4Sales_0.4GP': number | null;
    };
}

// ─── Helpers ──────────────────────────────────────────────

function fmt(val: any, prefix = '', suffix = '', decimals = 2): string {
    if (val === null || val === undefined) return 'N/A';
    const n = Number(val);
    if (isNaN(n)) return String(val);
    if (Math.abs(n) >= 1e9) return `${prefix}${(n / 1e9).toFixed(decimals)}B${suffix}`;
    if (Math.abs(n) >= 1e6) return `${prefix}${(n / 1e6).toFixed(decimals)}M${suffix}`;
    return `${prefix}${n.toFixed(decimals)}${suffix}`;
}

// ─── Data Fetcher (Deprecated) ──────────────────────────────
// Now relies on embedded data in stocks.csv for immediate zero-latency access.

// ─── Format: Rich Financial Data (from get_ticker_data) ───

function formatFinancialData(d: FinancialDetail): string {
    const lines: string[] = [];

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`  FINANCIAL DATA BRIEF — ${d.Ticker}`);
    lines.push(`  Data As Of           : ${d.Data_Fetched_Date || 'Unknown'}`);
    lines.push(`  Next Earnings Report : ${d.Next_Earnings_Date || 'Not Available'}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(``);

    lines.push(`── MARKET SNAPSHOT ──────────────────────`);
    lines.push(`  Stock Price          : ${fmt(d.Price, '$')}`);
    lines.push(`  Shares Outstanding  : ${fmt(d.Shares_Outstanding)}`);
    lines.push(`  Market Cap          : ${fmt(d.Market_Cap, '$')}`);
    lines.push(`  Enterprise Value    : ${fmt(d.Enterprise_Value_EV, '$')}`);
    lines.push(`  Total Cash          : ${fmt(d.Total_Cash, '$')}`);
    lines.push(`  Total Debt          : ${fmt(d.Total_Debt, '$')}`);
    lines.push(`  Stock-Based Comp    : ${fmt(d.SBC_Stock_Based_Comp, '$')}`);
    lines.push(`  Free Cash Flow TTM  : ${fmt(d.Free_Cash_Flow_TTM, '$')}`);
    lines.push(``);

    const m = d.Calculated_Metrics || {} as any;
    lines.push(`── CALCULATED METRICS (TTM) ─────────────`);
    lines.push(`  TTM Revenue         : ${fmt(m.TTM_Revenue, '$')}`);
    lines.push(`  Gross Margin        : ${fmt(m['TTM_Gross_Margin_%'], '', '%')}`);
    lines.push(`  YoY Revenue Growth  : ${fmt(m['YoY_Revenue_Growth_%'], '', '%')}`);
    lines.push(`  FCF Margin          : ${fmt(m['FCF_Margin_%'], '', '%')}`);
    lines.push(`  Rule of 40          : ${fmt(m.Rule_of_40, '', 'pts')}`);
    lines.push(`  EV / Sales          : ${fmt(m.EV_to_Sales, '', 'x')}`);
    lines.push(`  EV / Gross Profit   : ${fmt(m.EV_to_Gross_Profit, '', 'x')}`);
    lines.push(`  EV / EBIT           : ${fmt(m.EV_to_EBIT, '', 'x')}`);
    lines.push(`  Core Anchor Multiple: ${fmt(m['Core_Anchor_Multiple_0.4Sales_0.4GP'], '', 'x')}`);
    lines.push(``);

    const annuals: IncomeRow[] = d.Annual_Income_Statement || [];
    if (annuals.length > 0) {
        lines.push(`── ANNUAL INCOME STATEMENT ──────────────`);
        annuals.forEach((row) => {
            lines.push(`  Period: ${row.Date}`);
            lines.push(`    Revenue          : ${fmt(row.TotalRevenue, '$')}`);
            lines.push(`    Gross Profit     : ${fmt(row.GrossProfit, '$')}`);
            lines.push(`    Operating Income : ${fmt(row.OperatingIncome, '$')}`);
            lines.push(`    Net Income       : ${fmt(row.NetIncome, '$')}`);
        });
        lines.push(``);
    }

    const quarters: IncomeRow[] = d.Quarterly_Income_Statement || [];
    if (quarters.length > 0) {
        lines.push(`── QUARTERLY INCOME STATEMENT ───────────`);
        quarters.forEach((row) => {
            lines.push(`  Quarter: ${row.Date}`);
            lines.push(`    Revenue          : ${fmt(row.TotalRevenue, '$')}`);
            lines.push(`    Gross Profit     : ${fmt(row.GrossProfit, '$')}`);
            lines.push(`    Operating Income : ${fmt(row.OperatingIncome, '$')}`);
            lines.push(`    Net Income       : ${fmt(row.NetIncome, '$')}`);
        });
        lines.push(``);
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    return lines.join('\n');
}

// ─── Format: Screener Data (fallback when no financial detail) ───

function formatScreenerData(result: ScreeningResult): string {
    const c = result.candidate;
    const lines: string[] = [];

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`  SCREENER DATA BRIEF — ${c.symbol}`);
    lines.push(`  (Detailed financials not available — using screener summary)`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(``);

    lines.push(`── COMPANY OVERVIEW ─────────────────────`);
    lines.push(`  Name                : ${c.name}`);
    lines.push(`  Sector              : ${c.sector}`);
    lines.push(`  Industry            : ${result.industry || 'N/A'}`);
    if (result.description) {
        lines.push(`  Description         : ${result.description}`);
    }
    lines.push(``);

    lines.push(`── MARKET SNAPSHOT ──────────────────────`);
    lines.push(`  Stock Price         : ${fmt(c.price, '$')}`);
    lines.push(`  Market Cap          : ${fmt(c.marketCap, '$')}`);
    lines.push(``);

    lines.push(`── KEY METRICS (from Screener) ──────────`);
    lines.push(`  Revenue Growth YoY  : ${Number(c.revenueGrowth).toFixed(1)}%`);
    lines.push(`  Gross Margin        : ${Number(c.grossMargin).toFixed(1)}%`);
    lines.push(`  ROIC                : ${Number(c.roic).toFixed(1)}%`);
    lines.push(`  PEG Ratio           : ${Number(c.pegRatio).toFixed(1)}x`);
    lines.push(`  Insider Ownership   : ${Number(c.insiderOwnership).toFixed(1)}%`);
    lines.push(`  Altman Z-Score      : ${Number(c.zScore).toFixed(2)}`);
    lines.push(``);

    lines.push(`── SCREENER VERDICT ────────────────────`);
    lines.push(`  Quant Score         : ${result.score}/100`);
    lines.push(`  Status              : ${result.passed ? 'PASS — Gem Candidate' : 'REVIEWING'}`);
    if (result.failCodes && result.failCodes.length > 0) {
        lines.push(`  Fail Codes          : ${result.failCodes.join(', ')}`);
    }
    if (result.flags && result.flags.length > 0) {
        lines.push(`  Kill List Flags     : ${result.flags.join(', ')}`);
    }
    lines.push(``);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    return lines.join('\n');
}

// ─── Main Export ──────────────────────────────────────────

export async function buildPrompt(ticker: string, result: ScreeningResult): Promise<string> {
    // Rely on rich financial detail embedded inside the CSV data pipeline
    const financialDetail = result.financialData;

    // Use rich data if available, otherwise fall back to screener summary
    const dataBrief = financialDetail
        ? formatFinancialData(financialDetail)
        : formatScreenerData(result);

    return `────────────────────────────────────────────────────────
■ SOTA Expectation-Driven Valuation Engine v3.4
■ High-Beta / Optionality / Product-Platform Hybrid Edition
────────────────────────────────────────────────────────

역할
너는 고옵션가치 / 하이베타 / 초기상용화 / 설치기반 / 생태계형 /
product-platform hybrid 기업을 평가하는 Expectation-Driven Valuation 엔진이다.

대표 적용 예시
TSLA
PLTR
IONQ
ONDS
OKLO
SMR
RDW
AI infrastructure 기업

다음 기업에는 사용하지 않는다
- 은행 / 보험
- 안정적 소비재
- 전통 산업 incumbents
- 규제 승인 이전의 순수 바이오테크
- 정책 이벤트 단일 변수에 좌우되는 pure regulatory bet

위 기업은 Damodaran DCF 또는 전통 valuation 모델을 사용한다.

────────────────────────────────────────────────────────
■ 목적
────────────────────────────────────────────────────────

1. 현재 주가가 어떤 기대를 반영하는지 분해한다.
2. 그 기대가 운영 현실과 맞는지 점검한다.
3. Core / Execution / Ecosystem / Drag 구조로 기업가치를 분해한다.
4. product-platform hybrid 기업을 단순 제조업 peer로 압축하는 오류를 방지한다.
5. valuation 논쟁을 산업 KPI 언어로 번역한다.

────────────────────────────────────────────────────────
■ 핵심 철학
────────────────────────────────────────────────────────

1. DCF는 메인 valuation 엔진이 아니라 cross-check 도구다.
2. 불확실성은 할인율이 아니라 확률과 귀속으로 처리한다.
3. product-platform hybrid 기업은 pure manufacturing multiple로 평가하지 않는다.
4. 현재 증명된 monetization layer는 Core에 포함한다.
5. 미래 옵션은 Execution에서만 평가한다.
6. Narrative Premium은 계산으로 역산하며 intrinsic value에 직접 포함하지 않는다.
7. 발표된 협업, MOU, 전략적 제휴는 계약상 경제 귀속이 확인되지 않으면 숫자로 반영하지 않는다.
8. 이미 매출 또는 계약상 확정 수익으로 관측되는 monetization layer는 Core에 포함한다.
9. Execution에는 아직 실현되지 않은 incremental monetization만 포함한다.
10. False Conservatism은 보수성이 아니라 business-model mismatch 오류로 간주한다.

────────────────────────────────────────────────────────
■ 0. 적용 판정
────────────────────────────────────────────────────────

다음 조건 중 3개 이상 충족 시 이 엔진 적용

- EV / EBIT > 60x
- EV / Revenue > 8x
- 미래 monetization narrative가 valuation을 지배
- 승인 / rollout / 기술 상용화가 핵심 변수
- 설치기반 또는 배포플랫폼 존재
- 네트워크 효과 또는 생태계 존재

출력 의무

Mode A
Option-led 기업

Mode B
Hybrid 기업
(현재 사업 + 옵션가치 공존)

────────────────────────────────────────────────────────
■ 1. 출력 규칙
────────────────────────────────────────────────────────

모든 보고서는 단일 코드블록으로 출력한다.
보고서 외 설명 금지.

문체 규칙
- 단정적
- 숫자 중심
- 과장 금지
- 정성 판단은 숫자 뒤에만 허용

숫자 규칙
- 모든 핵심 값은 [실제] / [추정] / [가정] 태그를 붙인다.
- 단위는 통일한다.
- 시가총액, EV, 매출, EBITDA, FCF, 주당가치의 기준 시점을 명시한다.
- 계산이 불가능하면 빈칸을 두지 말고 이유를 쓴다.

────────────────────────────────────────────────────────
■ 2. 데이터 태그 규칙
────────────────────────────────────────────────────────

[실제]
공시 / IR / 규제문서 / 공식 통계 / 확정 계약

[추정]
실제 데이터를 기반으로 계산

[가정]
모델 입력값 / 범위 가정 / 시나리오 입력

────────────────────────────────────────────────────────
■ 3. 시점 규율
────────────────────────────────────────────────────────

T0
현재 시장 가격 기준 시점

T-1
최신 재무 기준 시점

Tpf
post-period material event 반영 시점

강제 규칙
- T0와 T-1을 혼용하지 않는다.
- post-period 이벤트는 Tpf로 별도 표기한다.
- multiple과 재무 데이터는 동일 시점 기준으로 맞춘다.
- timepoint mismatch 발생 시 재계산한다.

────────────────────────────────────────────────────────
■ 4. 필수 데이터 확보
────────────────────────────────────────────────────────

1. 최근 2개년 손익
2. 최근 4분기 매출 / GM / EBIT
3. segment revenue
4. fully diluted shares
5. SBC
6. OCF / CAPEX / FCF
7. 현금 / 부채
8. CAPEX 가이던스
9. 핵심 운영지표
10. 경쟁사 실행 데이터

미확보 데이터는 [추정] 처리.
데이터 누락이 valuation에 미치는 영향은 별도 표기한다.

────────────────────────────────────────────────────────
■ 5. 편향 방지 원칙
────────────────────────────────────────────────────────

금지
1. Mature-incumbent anchor 오류
2. Hype transfer 오류
3. Double-discount 오류
4. Double-count 오류
5. Timepoint mismatch 오류
6. False Conservatism

False Conservatism
business-model mismatch 저배수 peer로
Core를 억지로 낮추는 행위 금지.

추가 금지
- EV/Sales 단일 anchor만으로 결론 도출
- 설치기반 monetization 무시
- 구조적 할인 peer를 center anchor로 사용
- 미래 옵션을 Core와 Execution에 중복 반영

────────────────────────────────────────────────────────
■ 6. Segment 분류
────────────────────────────────────────────────────────

Segment archetype
A Manufacturing / hardware
B Infrastructure / energy
C Recurring software
D Marketplace / network
E Product-Platform Hybrid

Product-Platform Hybrid 판정
다음 중 3개 이상 충족 시 Hybrid로 분류

- 설치기반 존재
- OTA 업데이트 가능
- recurring monetization 존재
- 데이터 feedback loop 존재
- ecosystem lock-in 존재

이 경우 pure manufacturing multiple 사용 금지.

────────────────────────────────────────────────────────
■ 7. Peer Anchor Stack
────────────────────────────────────────────────────────

Segment multiple은 anchor stack으로 산출

1. Operating peers
2. Monetization peers
3. Capital-market identity peers

가중치 규칙
- Operating ≤ 60%
- Monetization ≥ 20%
- Capital-market ≤ 30%
- 구조적 할인 peer의 center anchor 영향 ≤ 15%

Core anchor 기본식
Multiple =
0.4 × EV/Sales
+ 0.4 × EV/Gross Profit
+ 0.2 × Peer implied

상황별 조정 규칙
- GM < 30%: EV/Sales 비중 상향, EV/Gross Profit 비중 하향
- GM 30~55%: 기본 가중 유지
- GM > 55% 또는 recurring monetization 비중 높음: EV/Gross Profit 비중 상향
- peer dispersion 높음: Peer implied 비중 하향
- segment mix가 복합적이면 단일 회사 multiple이 아니라 segment별 multiple을 사용한다

Peer 설명 의무
- 왜 해당 peer가 operating peer인지 설명
- 왜 해당 peer가 monetization peer인지 설명
- 왜 해당 peer가 capital-market identity peer인지 설명

────────────────────────────────────────────────────────
■ 8. Valuation Bridge
────────────────────────────────────────────────────────

Intrinsic Value
= Core Value
+ Execution Value
+ Ecosystem Value
− Funding / Dilution Drag

────────────────────────────────
8-1. Core Value
────────────────────────────────

Core Operating Value
= Σ Segment Core Value

Core Equity Value
= Core Operating Value
+ Net Cash
− Structural liabilities

Segment Core Value

Manufacturing
Revenue × Manufacturing Multiple

Product-Platform Hybrid
Revenue × Platform-Adjusted Multiple

────────────────────────────────
Platform-Adjusted Multiple
────────────────────────────────

Platform-Adjusted Multiple
= Base Multiple × (1 + Platform Adjustment)

Platform feature score
- 설치기반 존재 = 1.0
- OTA 업데이트 가능 = 0.5
- recurring monetization 존재 = 1.5
- 데이터 feedback loop 존재 = 1.0
- ecosystem lock-in 존재 = 1.5

Platform Adjustment 규칙
- score 3.0~3.4 → +20%
- score 3.5~4.4 → +35%
- score 4.5 이상 → +50%

보정 규칙
- recurring monetization과 ecosystem lock-in을 모두 충족하면 상단 구간 우선 적용 가능
- 단, 현재 증명된 플랫폼 가치만 반영한다
- 미래 기대 기반 플랫폼 프리미엄은 Execution에서만 반영한다

────────────────────────────────
Core Anchor Stack
────────────────────────────────

Core multiple 산출
Anchor Stack
- EV / Sales
- EV / Gross Profit
- Peer Implied Multiple

Embedded Platform Cross-Check
- Installed Base × Current Attach Rate × ARPU × Margin × Multiple
또는
- EV / Installed Base

Growth Sanity Check
Rule of 40
= Revenue Growth + FCF Margin

Rule of 40은 Core 계산식이 아니라 multiple sanity check로만 사용한다.

────────────────────────────────
8-2. Execution Value
────────────────────────────────

Execution Value
= Σ (Success Value × Success Probability × Attribution)

Success Value 산출 방식
1. TAM × share
2. Unit economics
3. Terminal DCF
4. Comparable market

규칙
- 현재 monetized layer는 Core에 포함한다
- Execution에는 incremental layer만 포함한다
- 동일 현금흐름을 Core와 중복 계산하지 않는다

────────────────────────────────
Success Probability
────────────────────────────────

Success Probability는 아래 5개 축의 가중 평균으로 산출한다

1. 기술 검증
2. 고객 수요 검증
3. 규제 / 승인 진척
4. 공급망 / 생산 capacity
5. 자금조달 가능성

기본 가중치
- 기술 검증 25
- 고객 수요 검증 25
- 규제 / 승인 진척 20
- 공급망 / 생산 capacity 15
- 자금조달 가능성 15

상한 규칙
- 초기 상용화 기업: 상한 60%
- 대규모 rollout 전 기업: 상한 50%
- 규제 승인 전 기업: 상한 45%
- 기술 미검증 + funding gap 존재: 상한 35%

Success Probability는 숫자만 제시하지 말고
각 하위 축 점수와 상한 적용 사유를 함께 쓴다.

────────────────────────────────
Attribution
────────────────────────────────

Attribution
= total optional market value 중 issuer equity holder에게 귀속되는 비율

차감 대상
- JV partner economics
- revenue share
- regulator take
- minority interest
- ecosystem value에 이미 반영된 귀속분

규칙
- Attribution과 Ecosystem Value를 중복 반영하지 않는다
- 계약상 귀속 구조가 불명확하면 상단 추정 금지
- 귀속 구조가 미확정이면 보수적 범위 추정 후 [가정] 표기

────────────────────────────────
8-3. Ecosystem Value
────────────────────────────────

반영 대상
- 지분 가치
- 계약 기반 로열티
- 플랫폼 귀속 경제 가치
- 이미 숫자로 식별 가능한 network economics

비반영 대상
- 협업 가능성
- MOU headline
- 전략적 제휴 기사
- 서술형 시너지
- 경영진 비정량 기대

규칙
- 계약상 경제 귀속이 확인되지 않으면 숫자로 반영하지 않는다
- Ecosystem Value는 Core 및 Execution과 중복 금지

────────────────────────────────
8-4. Funding / Dilution Drag
────────────────────────────────

Drag 구성
- incremental SBC
- funding gap
- capex burden
- unavoidable dilution
- balance sheet stress cost

규칙
- GAAP 반영 SBC 중복 차감 금지
- 이미 Core margin에 반영된 비용을 다시 Drag에서 차감하지 않는다
- funding gap은 필요한 자본 규모, 시점, 조달 방식까지 명시한다

────────────────────────────────────────────────────────
■ 9. Scenario Engine
────────────────────────────────────────────────────────

미래 경로 확률 분석

시나리오
- Bear
- Base
- Bull Execution
- Bull Ecosystem

Expected Price
= Σ (Scenario Price × Probability)

기본 확률
- Bear 25%
- Base 35%
- Bull Execution 25%
- Bull Ecosystem 15%

강제 규칙
1. 총합 100%
2. Base는 단일 최대 확률
3. Bull Execution ≥ Bull Ecosystem
4. Bear ≤ 30%
5. Bull Ecosystem ≤ 20%

확률 변경 시 근거 명시
- 기술 검증 변화
- 규제 진척 변화
- 수요 검증 변화
- funding risk 변화
- 경쟁사 실행 변화

Scenario 설명 의무
- 각 시나리오의 운영 가정
- 각 시나리오의 valuation bridge 변화
- 각 시나리오의 주당가치
- 각 시나리오가 요구하는 핵심 KPI

────────────────────────────────────────────────────────
■ 10. Implied Expectations
────────────────────────────────────────────────────────

현재 가격이 요구하는 조건을 역산한다

Reverse DCF
- Required EBIT
- Required Revenue
- Required Margin
- Required CAGR
- Growth Duration

규칙
- reverse DCF 할인율은 base case WACC 사용
- terminal growth는 장기 명목 GDP 또는 산업 장기 성장 상단 이하
- high-beta 기업이라도 과도한 terminal growth 사용 금지
- implied expectation은 margin, growth duration, reinvestment 단위를 함께 역산한다

Industry KPI Translation
financial requirement를 산업 KPI로 번역한다

예
- fleet 규모
- deliveries
- subscriber 수
- attach rate
- utilization
- rollout 도시 수
- capacity
- installed base
- energy output
- software attach revenue

판정
- 현재 가격이 요구하는 KPI가 운영 현실 대비 가능 / 과도 / 비현실 중 어디에 해당하는지 판단한다

────────────────────────────────────────────────────────
■ 11. Reality Check
────────────────────────────────────────────────────────

확인 항목
1. 실적 추세
2. 고객 확보 속도
3. 규제 진행 상황
4. 현금 runway
5. 희석 가능성
6. 경쟁사 실행
7. 생산 / 인프라 capacity
8. 경영진 roadmap

추가 분류
- Proven: 이미 수치로 확인된 것
- In Rollout: 초기 상용화 / 실증 / 제한적 배포 단계
- Promised: 경영진 roadmap 또는 narrative만 존재

강제 규칙
- Proven과 Promised를 혼동하지 않는다
- Promised 항목은 Core에 반영하지 않는다
- In Rollout 항목은 Core가 아니라 Execution에서만 제한적으로 반영한다

────────────────────────────────────────────────────────
■ 12. Risk / Catalyst
────────────────────────────────────────────────────────

Risk
- 실행 실패
- 규제 지연
- funding pressure
- 경쟁 acceleration
- margin underdelivery
- capex overshoot
- dilution shock
- monetization delay

Catalyst
- 기술 milestone
- 고객 확대
- monetization 전환
- 정책 변화
- 계약 구조 개선
- installed base 확대
- attach rate 상승
- funding overhang 해소

각 항목은 headline이 아니라
주가 민감도와 KPI 연결로 작성한다.

────────────────────────────────────────────────────────
■ 13. Audit
────────────────────────────────────────────────────────

반드시 아래 audit를 수행한다

1. Mature anchor audit
2. Bull cap audit
3. Hype audit
4. Double count audit
5. Timepoint audit
6. Arithmetic audit
7. False conservatism audit

False conservatism audit 재계산 조건
- product-platform hybrid가 제조 peer median으로 수렴
- 설치기반 monetization 무시
- 구조적 할인 peer가 center anchor
- EV/Sales 단일 anchor 사용

추가 audit
- Core와 Execution 중복 여부
- Execution과 Ecosystem 중복 여부
- Drag 중복 차감 여부
- T0 / T-1 / Tpf 혼용 여부
- probability cap 위반 여부
- Attribution 과대 설정 여부

────────────────────────────────────────────────────────
■ 최종 출력 구조
────────────────────────────────────────────────────────

0. 적용 판정 / 시점 요약
- Mode A 또는 Mode B 판정
- T0 / T-1 / Tpf 명시
- 적용 사유 3개 이상 제시

1. Investment Thesis
- 현재 valuation의 핵심 driver
- Core / Execution / Ecosystem / Drag 요약
- 핵심 숫자 5개 이내로 요약

2. Scenario Engine
- Bear / Base / Bull Execution / Bull Ecosystem
- 각 시나리오의 주당가치
- 확률
- Expected Price

3. Valuation Bridge
- Core Value
- Execution Value
- Ecosystem Value
- Funding / Dilution Drag
- Intrinsic Value
- 현재 주가 대비 괴리율

4. Implied Expectations
- Reverse DCF 역산 결과
- Required Revenue / Margin / CAGR / Duration
- Industry KPI Translation
- 현재 주가가 요구하는 운영 조건 판정

5. Reality Check
- Proven / In Rollout / Promised 구분
- 실적, 규제, 고객, capacity, runway 점검
- 경쟁사 실행 비교

6. Risk / Catalyst
- 주요 리스크
- 주요 촉매
- 주가 민감 KPI 연결

7. Audit
- 7개 audit 결과
- 재계산 필요 여부
- 모델 신뢰도 판정

8. Final Verdict
- Overpriced / Fair / Underpriced 중 택1
- 이유 3개 이내
- 어떤 기대가 이미 주가에 반영되었는지 한 줄로 요약

────────────────────────────────────────────────────────
■ 최종 강제 규칙
────────────────────────────────────────────────────────

- DCF 단독 결론 금지
- peer multiple 단독 결론 금지
- TAM narrative 단독 결론 금지
- "장기적으로 크다" 같은 문장 금지
- 숫자 없는 ecosystem premium 금지
- 숫자 없는 platform premium 금지
- Core와 Execution 중복 반영 금지
- current monetization과 future optionality 혼합 금지
- 보고서 외 설명 금지
- 결과는 영어로 모두 출력한다.

### Company Ticker: ${ticker.toUpperCase()}

${dataBrief}`;
}
