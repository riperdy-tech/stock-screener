// ---------------------------------------------------------------------------
// GLOSSARY (한국어) — Korean translations for every term in lib/glossary.ts.
//
// Keyed by the SAME kebab-case keys as the English glossary. When the site is
// in Korean (useLanguage().language === 'ko'), the <Term> popups render these
// translations instead of the English text. `term` is the Korean display name.
// Missing keys fall back to the English entry automatically.
// ---------------------------------------------------------------------------

import type { GlossaryCategory } from './glossary';

export interface TermKo {
    term: string;
    plain: string;
    definition: string;
    /** Optional — included for parity with the English entries; the popup's
     *  "See also" chips actually come from the English def.related keys. */
    related?: string[];
}

export const CATEGORY_LABELS_KO: Record<GlossaryCategory, string> = {
    core: '핵심 개념',
    value: '밸류(저평가) 팩터',
    quality: '퀄리티 팩터',
    momentum: '모멘텀 팩터',
    risk: '리스크·변동성',
    revisions: '어닝 리비전 팩터',
    valuation: '밸류에이션·DCF',
    ai: 'AI 애널리스트',
    portfolio: '포트폴리오·포지션',
    track: '트랙 레코드',
    data: '데이터·파이프라인',
    overlay: '오버레이·재무 포렌식',
    bands: '도어·등급·베토',
};

export const GLOSSARY_KO: Record<string, TermKo> = {
    // ── 핵심 개념 ──────────────────────────────────────────────────────
    composite: {
        term: '도어 백분위(Door percentile / composite)',
        plain: '종목의 순위를 매기는 0–100 숫자로, 더 좋은 쪽 도어의 점수입니다.',
        definition:
            '모든 종목은 첫 두 도어에서 각각 점수를 받고, 각 점수는 백분위(0–100)로 바뀝니다. 종목은 두 점수 중 더 좋은 쪽으로 경쟁하며, 챔피언은 종목 순서를 정할 때 작은 가산점을 받습니다. 높을수록 적어도 한 도어에서 근거가 강하다는 뜻입니다. 후보 명단의 순서를 정하는 방법이며 목표주가가 아닙니다.',
        related: ['door', 'champion', 'percentile'],
    },
    factor: {
        term: '팩터(Factor)',
        plain: '도어를 이루는, 종목의 측정 가능한 특성입니다.',
        definition:
            '수익성이 좋다, 싸다, 애널리스트 전망이 오르고 있다, 최근에 이기고 있다 같은, 연구에서 평균적으로 미래 수익률과 연결된 것으로 나타난 정량적 특성입니다. 이 스크린은 퀄리티, 밸류, 기대치 격차, 모멘텀, 리비전을 측정합니다. 팩터를 똑같은 비중으로 평균 내지 않습니다. 각 도어가 자기가 중시하는 팩터를 자기만의 가중치로 섞습니다.',
        related: ['door', 'value', 'quality', 'momentum'],
    },
    'sector-neutral': {
        term: '섹터 중립(Sector-neutral)',
        plain: '평가는 종목이 속한 업종 내에서 상대적으로 매깁니다.',
        definition:
            '각 종목은 주로 같은 섹터의 기업들과 비교됩니다. 슈퍼마켓은 슈퍼마켓끼리 경쟁하며 소프트웨어 기업과 비교하지 않습니다. 이렇게 하지 않으면 “싸다”가 그냥 “은행주다”라는 뜻이 되고 “모멘텀이 높다”가 그냥 “기술주다”라는 뜻이 되어 버립니다. 퀄리티, 밸류, 리비전은 이렇게 측정합니다. 모멘텀은 예외입니다. 시장 전체와 비교해서도 읽으므로, 섹터 전체를 끌어올리는 붐이 평범해 보이지 않습니다.',
        related: ['zscore', 'composite'],
    },
    zscore: {
        term: 'Z-점수(Z-score)',
        plain: '해당 값이 섹터 평균에서 표준편차 몇 배만큼 떨어져 있는지 나타냅니다.',
        definition:
            '원시 값(예: 14%의 잉여현금흐름 수익률)을 섹터 내에서 얼마나 특이한 값인지로 바꿔 주는 통계적 자입니다. z-점수 +1.5는 그 종목이 섹터 평균보다 표준편차 1.5배 위에 있다는 뜻입니다. z-점수는 단위가 전혀 다른 지표(비율, 성장률, 변동성)를 하나의 기준으로 비교 가능하게 만듭니다.',
        related: ['sector-neutral', 'winsorize', 'composite'],
    },
    winsorize: {
        term: '윈저라이즈(Winsorize)',
        plain: '극단적인 이상치를 잘라내 다른 종목들의 순위를 왜곡하지 못하게 합니다.',
        definition:
            '채점 전에 섹터 내 1~99 백분위를 벗어난 값은 그 경계로 끌어당깁니다. 오타, 일회성 이상 현상, 기괴한 비율을 가진 사실상 죽은 종목 같은 단 하나의 터무니없는 값이 다른 모든 종목의 순위를 조용히 지배하는 것을 막습니다.',
        related: ['zscore', 'sector-neutral'],
    },
    percentile: {
        term: '백분위(Percentile)',
        plain: '채점된 전체 종목 중에서의 위치(0–100)입니다.',
        definition:
            '순위를 0–100 척도로 바꾼 값입니다. 98백분위는 그 종목이 채점된 종목의 98%보다 점수가 높다는 뜻입니다. 각 도어 점수가 백분위로 바뀌고, 종목은 첫 두 도어 중 더 좋은 쪽으로 경쟁합니다.',
        related: ['composite', 'door'],
    },
    overfitting: {
        term: '과적합(Overfitting)',
        plain: '과거 데이터에 너무 정밀하게 맞춰 신규 데이터에서는 깨지는 현상입니다.',
        definition:
            '퀀트의 고전적인 함정입니다. 백테스트가 멋져 보일 때까지 손잡이를 많이 돌릴수록, 지속되는 패턴을 배우는 것이 아니라 과거를 외우는 것이 됩니다. 시험하는 데이터와 같은 데이터에서 역설계한 규칙은 “했더라면” 돈을 벌었다 해도 쓸모가 없습니다. 이 사이트가 결과를 보기 전에 합격/불합격 규칙을 먼저 적어 두는 이유입니다.',
        related: ['out-of-sample', 'backtest'],
    },
    'out-of-sample': {
        term: '표본 외(Out-of-sample)',
        plain: '모델을 만들 때 한 번도 보지 못한 데이터로 검증합니다.',
        definition:
            '규칙을 만들 때 사용하지 않은 데이터에서 그 규칙이 어떻게 성과를 내는지 보는, 가장 정직한 검증 방법입니다. 이후 실제 미래 가격으로 측정되는 전방 기록(forward-logged) 신호는 완전한 표본 외 검증입니다. 사후 판단이나 편집이 없습니다.',
        related: ['overfitting', 'point-in-time', 'paper-trading'],
    },
    backtest: {
        term: '백테스트(Backtest)',
        plain: '역사 데이터를 재생해 규칙이 “그랬다면” 어땠을지 확인합니다.',
        definition:
            '전략을 과거 데이터에 돌려 예상 성과를 추정하는 것입니다. 백테스트는 유용하지만 아첨합니다. 사후 판단 편향, 생존자 편향, 과적합에 취약하기 때문입니다. 이 사이트는 백테스트를 진단용으로만 취급하고, 정직한 척도로는 전방 기록·페이퍼트레이딩 신호를 선호합니다.',
        related: ['survivorship-bias', 'paper-trading', 'overfitting'],
    },
    'point-in-time': {
        term: '시점 일치(Point-in-time)',
        plain: '그 시점에 실제로 알려진 정보만 사용합니다.',
        definition:
            '엿보기를 금지하는 원칙입니다. 특정일에 기록된 신호는 그날 존재했던 데이터만 사용할 수 있습니다. 미래의 재무 재작성, 미래 가격은 금지됩니다. 여기의 모든 전방 기록 신호는 시점 일치이며, 이것이 트랙 레코드를 신뢰할 수 있게 만듭니다.',
        related: ['out-of-sample', 'hindsight-bias'],
    },
    'survivorship-bias': {
        term: '생존자 편향(Survivorship bias)',
        plain: '상장폐지되어 사라진 실패 기업을 잊고 승자만 측정하는 것입니다.',
        definition:
            '지금도 남아 있는 종목만 측정하면 파산하거나 사라진 종목들을 놓치게 되고, 이는 모든 백테스트를 아첨하게 만듭니다. 이를 피하려면 상장폐지·파산·몰락 종목까지 측정에 포함해야 하며, 이 파이프라인은 그렇게 합니다.',
        related: ['backtest', 'point-in-time'],
    },
    'hindsight-bias': {
        term: '사후 판단 편향(Hindsight bias)',
        plain: '결과를 안 뒤에 마치 그때 알았던 것처럼 행동하는 것입니다.',
        definition:
            '결과를 예측할 수 있었던 것처럼 의사결정을 다시 구성하는 일입니다. 페이퍼 북은 이를 막습니다. 모든 매수와 매도는 미래가 오기 전, 그날에 바로 기록됩니다.',
        related: ['point-in-time', 'paper-trading'],
    },
    'market-cap': {
        term: '시가총액(Market cap)',
        plain: '기업 전체의 가격 — 주가 × 주식 수.',
        definition:
            '시가총액 = 주가 × 발행주식 수. $T(조), $B(십억), $M(백만)으로 표시됩니다. 회사가 대략 얼마나 큰지 알려주며, 리스크, 유동성, 포트폴리오에서 한 포지션이 차지하는 비중을 판단하는 데 중요합니다.',
        related: ['float', 'enterprise-value'],
    },

    // ── 밸류 팩터 ───────────────────────────────────────────────────────
    value: {
        term: '밸류(저평가) 팩터',
        plain: '현금흐름 대비 1달러에 2달러를 사는지, 2달러에 1달러를 사는지의 문제입니다.',
        definition:
            '주가가 기업이 실제로 만들어 내는 현금 대비 저렴한지를 측정하며, 항상 종목이 속한 섹터 안에서 판단합니다. 현금 기반 수익률로 구성됩니다. 잉여현금흐름, 오너 이어닝, EBIT(은행과 보험사는 이익)를 각각 주가 대비로 본 값입니다. 밸류 갭 도어의 재료 중 하나입니다.',
        related: ['fcf-yield', 'owner-earnings', 'enterprise-value'],
    },
    'fcf-yield': {
        term: '잉여현금흐름(FCF) 수익률',
        plain: '기업이 남기는 현금을 주가 대비 비율로 나타낸 값입니다.',
        definition:
            'FCF = 영업현금흐름 − 설비투자(CAPEX), 즉 설비와 장비를 유지한 뒤 실제로 쓸 수 있는 현금입니다. FCF 수익률은 이를 시가총액으로 나눕니다. 높으면 지불하는 가격 대비 현금을 많이 쏟아내는 기업입니다. 밸류 팩터의 네 가지 수익률 중 하나입니다.',
        related: ['value', 'owner-earnings', 'market-cap'],
    },
    'owner-earnings': {
        term: '오너 이어닝 수익률(Owner earnings yield)',
        plain: '버핏식 수익 창출력을 주가 대비 비율로 나타낸 값입니다.',
        definition:
            '순이익 + 감가상각비 − 설비투자, 이를 시가총액으로 나눕니다. 사업을 그대로 유지하면서 진정한 주인이 인출할 수 있는 현금을 근사합니다. 회계상 순이익보다 더 정직한 “이익”입니다. 밸류 팩터의 네 가지 수익률 중 하나입니다.',
        related: ['value', 'fcf-yield', 'ebit'],
    },
    ebit: {
        term: 'EBIT(이자·세전이익)',
        plain: '이자와 세금 차감 전 이익 — 영업이익입니다.',
        definition:
            'Earnings Before Interest and Taxes. 부채(타인자본) vs 자기자본 같은 자금조달 선택과 세금이 개입하기 전에 핵심 사업이 얼마나 버는지 분리해 보여줍니다. EBIT 수익률 = EBIT ÷ 기업가치(EV)로, 밸류 팩터의 네 가지 수익률 중 하나입니다.',
        related: ['enterprise-value', 'value', 'roic'],
    },
    'enterprise-value': {
        term: '기업가치(EV)',
        plain: '부채를 포함해 회사 전체를 사는 데 드는 가격입니다.',
        definition:
            'EV = 시가총액 + 장기부채 − 현금. 회사를 산다는 것은 부채를 떠안고 현금을 얻는 것이므로, EV는 시가총액보다 더 진실된 “가격”입니다. EBIT 수익률과 여러 밸류에이션 배수에 사용됩니다.',
        related: ['market-cap', 'ebit'],
    },
    'earnings-yield': {
        term: '이익수익률(Earnings yield)',
        plain: '순이익을 주가 대비 비율로 — PER의 역수입니다.',
        definition:
            '순이익 ÷ 시가총액. PER(주가수익비율)의 역수입니다. “몇 년이면 회수되는가” 대신 “매년 주가의 몇 %를 이익으로 돌려받는가”에 답합니다. 네 가지 수익률 중 데이터 커버리지가 가장 넓어, 일부 현금흐름 데이터가 없는 기업을 구제합니다.',
        related: ['value', 'fcf-yield'],
    },

    // ── 퀄리티 팩터 ─────────────────────────────────────────────────────
    quality: {
        term: '퀄리티 팩터',
        plain: '기업이 꾸준히 진짜 돈을 벌고, 회계가 깨끗한가의 문제입니다.',
        definition:
            '기업이 이익을 얼마나 안정적으로 내고 회계가 얼마나 정직한지 측정합니다. 매출 품질, 수년간의 매출총이익률 안정성, 마이너스 발생액(현금이 아닌 회계상 책략으로 만든 이익을 싫어함), Piotroski F-점수를 결합합니다. 스토리가 아닌, 이익을 내고 회계가 정직한 사업이 이깁니다.',
        related: ['roic', 'accruals', 'piotroski'],
    },
    'gross-margin': {
        term: '매출총이익률(Gross margin)',
        plain: '판매 1달러당 원가를 뺀 뒤 남는 비율입니다.',
        definition:
            '(매출 − 매출원가) ÷ 매출. 기업이 얼마나 가격 결정력을 가졌는지 보여줍니다. 퀄리티 팩터는 수년간 매출총이익률이 안정적으로 유지되는 것을 좋아합니다. 변동이 심한 이익률은 사업이 취약하다는 경고 신호입니다.',
        related: ['quality', 'revenue-quality'],
    },
    'revenue-quality': {
        term: '매출 품질(Revenue quality)',
        plain: '역설계 엔진이 만든, 매출의 신뢰성 등급입니다.',
        definition:
            '역설계 엔진이 보고된 매출이 얼마나 진짜이고 지속 가능한지 채점한 값입니다. 공격적인 인식, 고객 집중도 등 매출을 취약하게 만드는 패턴을 확인합니다. 퀄리티의 입력값이며, 그 자체로 점수에 더해지지는 않습니다.',
        related: ['quality', 'forensic'],
    },
    accruals: {
        term: '발생액(Accruals)',
        plain: '아직 실제 현금으로 뒷받침되지 않은 회계상 이익입니다.',
        definition:
            '보고된 이익과 실제로 거둔 현금 사이의 차이입니다. 발생액이 높다는 것은 이익이 현금 유입보다 빠르게 장부에(청구서, 추정치로) 찍히고 있다는 뜻으로, 이익 부풀리기의 전형적 신호입니다. 퀄리티 팩터는 낮거나 마이너스 발생액을 선호하며, 높은 발생액 알람은 재무 포렌식 플래그입니다.',
        related: ['quality', 'forensic', 'beneish'],
    },
    piotroski: {
        term: 'Piotroski F-점수',
        plain: '재무건전성 신호 9가지를 점검하는 체크리스트입니다.',
        definition:
            'Joseph Piotroski가 만든 유명한 점수로, 수익성·레버리지·영업효율성 등 9개의 이진 신호를 확인해 건강한 항목마다 1점을 더합니다(0–9). 높을수록 강합니다. SEC 제출 재무 데이터 배터리에서 나와 퀄리티 팩터에 공급됩니다.',
        related: ['quality', 'fundamentals-battery'],
    },
    beneish: {
        term: 'Beneish M-점수',
        plain: '이익조작 가능성을 통계적으로 탐지하는 모델입니다.',
        definition:
            '매출채권 회전일수, 자산 품질 같은 8개 비율로 기업이 이익을 조작했을 가능성을 점수화하는 모델입니다. M-점수가 높으면 재무 포렌식 경고입니다. 그것만으로는 종목을 탈락시키지 않습니다. 작은 기업은 높은 발생액과 동시에 발생할 때만 탈락합니다.',
        related: ['forensic', 'accruals', 'veto'],
    },
    forensic: {
        term: '재무 포렌식 경고(Forensic warnings)',
        plain: '수상한 회계나 취약한 재무에 대한 옐로카드와 레드카드입니다.',
        definition:
            '회계 검사에서 나오는 경고등입니다. Beneish M-점수(이익조작 가능성), 발생액(현금이 뒷받침되지 않는 이익), Altman Z(부실 위험), 과도한 주식 발행입니다. 시가총액 100억 달러 이상 기업에서는 경고일 뿐이며 종목을 탈락시키지 않습니다. 더 작은 기업에서는 두 개의 레드 플래그가 일치할 때만 탈락합니다. 사진은 아름다운데 구조검사에서 탈락한 집을 떠올려 보세요.',
        related: ['beneish', 'accruals', 'veto'],
    },
    roic: {
        term: 'ROIC(투하자본이익률)',
        plain: '돈을 재투자해 얼마나 효율적으로 복리로 불리는지의 척도입니다.',
        definition:
            'NOPAT(세후 영업이익) ÷ 투하자본(자기자본 + 부채 − 현금). 기업이 사업에 남겨 둔 1달러당 이익을 얼마나 내는지에 답합니다. 자본의 20%를 버는 기업은 재투자 이익에 대해 연 20%로 복리 성장합니다. 장기 부의 엔진입니다.',
        related: ['quality', 'ebit', 'cagr'],
    },
    'fundamentals-battery': {
        term: '재무 배터리(Fundamentals battery)',
        plain: '재무 포렌식과 퀄리티 검사 뒤에 있는 10년치 SEC 제출 비율 데이터입니다.',
        definition:
            'SEC Company Facts(제출 당시 그대로의 10년 재무)로 만든 종목별 데이터셋으로, Piotroski F, Sloan 발생액, 실제 Beneish M, 순발행량의 원재료를 담고 있습니다. 옛 플레이스홀더 점수를 대체한 입력값입니다.',
        related: ['piotroski', 'beneish', 'sec-filings'],
    },

    // ── 모멘텀 팩터 ─────────────────────────────────────────────────────
    momentum: {
        term: '모멘텀 팩터',
        plain: '지난 1년간 주가가 이기고 있었는가의 문제입니다.',
        definition:
            '이긴 주식은 한동안 계속 이기는 경향이 있습니다. 모멘텀은 12-1 스킵월 수익률(가장 최근 달을 건너뛴 학계 표준 12개월 수익률)과 52주 최고가 근접도를 결합합니다. 컴파운더 도어가 사용하고, 밸류 갭 도어에서는 떨어지는 칼날 하한선으로 쓰이며, 추세 주도주 도어는 시장 전체를 기준으로 이것만 따로 사용합니다.',
        related: ['skip-month', 'high-proximity', 'door'],
    },
    'skip-month': {
        term: '12-1 스킵월 수익률',
        plain: '가장 최근 달을 제외한 12개월 수익률입니다.',
        definition:
            '모멘텀 측정의 학계 표준입니다. 지난 12개월 수익률을 계산하되 가장 최근 달을 뺍니다. 최근 달을 빼는 것은 지난달 상승 종목이 잠깐 반락하는 단기 역전 현상을 피해 신호를 오염시키지 않기 위해서입니다. 월간 종가를 사용합니다.',
        related: ['momentum', 'reversal'],
    },
    'high-proximity': {
        term: '52주 최고가 근접도',
        plain: '주가가 지난 1년 최고가에 얼마나 가까운지입니다.',
        definition:
            '현재 주가 ÷ 52주 최고가. 최고가에 가까운 주가는 역사적으로 상승세가 이어지는 경향이 있고, 최고가에서 멀리 떨어진 주가는 계속 하락하는 경우가 많습니다. 12-1 수익률과 함께 모멘텀 팩터를 구성합니다.',
        related: ['momentum'],
    },
    reversal: {
        term: '단기 역전(Short-term reversal)',
        plain: '지난달 상승 종목이 방향을 되돌리기 전 잠깐 반락하는 현상입니다.',
        definition:
            '가장 최근 달에 가장 많이 오른 종목이 잠시 되돌림을 주는 단기 특성입니다. 그래서 모멘텀은 최근 달을 제외한 12개월로 측정합니다. 잡음이 많은 한 달 반등 대신 지속 가능한 추세를 포착하기 위해서입니다.',
        related: ['skip-month', 'momentum'],
    },

    // ── 리스크·저변동성 ────────────────────────────────────────────────
    volatility: {
        term: '변동성(σ)',
        plain: '주가가 얼마나 출렁이는지 — 주식의 “난폭함”입니다.',
        definition:
            '수익률의 표준편차입니다. 변동성이 높으면 가격이 짧은 시간에 크게 출렁이고, 낮으면 차분하게 움직입니다. 시그마(σ)는 그 기호로 쓰는 그리스 문자입니다.',
        related: ['annualized-volatility'],
    },
    'annualized-volatility': {
        term: '연환산 변동성',
        plain: '월간 변동폭을 1년 단위로 환산한 값입니다.',
        definition:
            '월간 수익률 변동성에 √12를 곱해 연 단위로 나타낸 값입니다(월간 σ × 12개월의 제곱근).',
        related: ['volatility'],
    },

    // ── 리비전 팩터 ─────────────────────────────────────────────────────
    revisions: {
        term: '리비전(어닝 수정) 팩터',
        plain: '전문 애널리스트들이 전망을 올리고 있는지 내리고 있는지입니다.',
        definition:
            '애널리스트 기대치가 바뀌는 방향을 측정합니다. 애널리스트가 이익 추정치를 올리면 주가는 계속 오르는 경향이 있고, 내리면 계속 내리는 경향이 있습니다. 컴파운더 도어에서 가장 작은 재료이며, 추세 주도주는 전망이 내려가고 있으면 안 됩니다.',
        related: ['eps', 'estimates', 'eps-trajectory'],
    },
    eps: {
        term: 'EPS(주당순이익)',
        plain: '주당 순이익 — 주식 한 주에 배분되는 이익입니다.',
        definition:
            '순이익 ÷ 발행주식 수. 투자에서 가장 많이 보는 단일 숫자입니다. 리비전 팩터는 그 수준뿐 아니라 EPS 전망이 시간에 따라 어떻게 움직이는지를 봅니다.',
        related: ['revisions', 'eps-trajectory'],
    },
    estimates: {
        term: '애널리스트 추정치',
        plain: '종목을 커버하는 전문 애널리스트들의 미래 이익 전망입니다.',
        definition:
            '기업을 커버하는 매도측 애널리스트들이 발표하는 컨센서스 전망입니다. 이들의 리비전(상향·하향 조정)은 정보를 담고 있으며, 리비전 팩터가 정확히 이 정보를 수확합니다.',
        related: ['revisions', 'eps'],
    },
    'eps-trajectory': {
        term: 'EPS 궤적',
        plain: '이익 전망 경로의 방향과 가파름입니다.',
        definition:
            '애널리스트의 향후 이익 전망이 시간에 따라 이루는 기울기입니다. 오르고 있는지, 평평한지, 내리고 있는지를 봅니다. “개선 중”과 “악화 중”을 비교 가능한 숫자로 만들어 줍니다.',
        related: ['revisions', 'eps'],
    },

    // ── 밸류에이션·DCF ─────────────────────────────────────────────────
    dcf: {
        term: '현금흐름할인(DCF)',
        plain: '기업의 가치 = 미래 현금을 현재 가치로 할인한 값입니다.',
        definition:
            '고전적 밸류에이션 틀입니다. 기업이 미래에 만들 모든 현금을 추정하고(내년의 1달러는 지금의 1달러보다 덜 가치 있으므로) 오늘의 돈으로 할인해 더합니다. 그 결과가 “내재가치”입니다.',
        related: ['intrinsic-value', 'present-value', 'cost-of-equity'],
    },
    'reverse-dcf': {
        term: '역산 DCF(Reverse DCF)',
        plain: 'DCF를 뒤집어서: 현재 가격은 어떤 성장률을 가정하나?',
        definition:
            '성장률을 가정해 가치를 구하는 대신, 역산 DCF는 수학을 거꾸로 풉니다. 현재 가격이 주어졌을 때 시장이 이미 가정하고 있는 성장률은 얼마인가? 이분법(bisection)으로 DCF가 현재 가격과 같아지는 성장률을 좁혀 찾습니다. 그 결과가 시장이 당신에게 청구하는 성장률입니다.',
        related: ['dcf', 'implied-growth', 'bisection'],
    },
    'implied-growth': {
        term: '암묵 성장률(Implied growth)',
        plain: '현재 가격이 조용히 약속하고 있는 성장률입니다.',
        definition:
            '모든 주가는 미래 성장에 대한 약속을 내포합니다. 역산 DCF가 그 약속을 숫자로 꺼냅니다. 즉 할인된 현금흐름이 현재 가격과 같아지게 하는 성장률입니다. 이 사이트는 이를 기업이 실제로 달성한 성장과 비교합니다.',
        related: ['reverse-dcf', 'expectations-gap'],
    },
    'expectations-gap': {
        term: '기대치 격차(Expectations gap)',
        plain: '가격이 요구하는 성장률에서 기업이 입증한 성장률을 뺀 값입니다.',
        definition:
            '암묵 성장률(역산 DCF)에서 입증된 성장률(SEC 제출 서류 기준, 기업 현금이익의 최근 5년 실제 성장)을 뺀 값이며 퍼센트 포인트 단위입니다. 마이너스 = 가격이 기업이 입증한 것보다 적은 성장을 요구합니다. 잠재적 저평가입니다. 플러스 = 가격이 아무도 입증하지 못한 가속을 요구합니다. 스토리를 믿어야 합니다. 밸류 갭 도어의 재료 중 하나입니다.',
        related: ['implied-growth', 'reverse-dcf', 'demonstrated-growth'],
    },
    'demonstrated-growth': {
        term: '입증된 성장률(Demonstrated growth)',
        plain: '기업이 제출 서류 기준으로 실제 달성한 성장입니다.',
        definition:
            '기업 현금이익의 최근 5년 실제 성장으로, SEC 제출 서류에서 가져옵니다(그것을 쓸 수 없을 때에만 매출 성장을 씁니다). 기대치 격차에서 가격의 약속과 비교하는 기준 사실입니다.',
        related: ['expectations-gap', 'sec-filings'],
    },
    'intrinsic-value': {
        term: '내재가치(Intrinsic value)',
        plain: '주가와 무관한, 기업의 진정한 가치입니다.',
        definition:
            '미래 현금 창출 능력에 기반한 기업의 진정한 가치 추정치로, DCF가 산출하는 숫자입니다. AI 애널리스트는 매 실행마다 하나씩 산출하며, 판단은 오늘의 주가를 단일 숫자가 아니라 그 값들의 범위(가치 밴드)와 비교합니다.',
        related: ['dcf', 'margin-of-safety', 'iv-band'],
    },
    'margin-of-safety': {
        term: '안전마진(Margin of safety)',
        plain: '얻는 할인으로, 추정 가치보다 얼마나 싸게 사는지입니다.',
        definition:
            '가격이 추정 가치보다 얼마나 저렴한지를 퍼센트로 나타낸 값입니다. 안전마진 30%는 추정 가치 1달러어치를 70센트에 산다는 뜻입니다. 너무 크게 나온 안전마진은 그 자체로 경고 신호입니다. 게이트는 가치가 주가보다 비현실적으로 높게 나온 판단을 막습니다.',
        related: ['intrinsic-value', 'gate-reason'],
    },
    'cost-of-equity': {
        term: '자기자본비용(Cost of equity)',
        plain: '주주가 요구하는 수익률 — 주식 현금흐름의 할인율입니다.',
        definition:
            '안전자산 대신 주식을 보유하기 위해 투자자가 요구하는 최소 연 수익률입니다. DCF에서 미래 주식 현금흐름을 할인하는 데 쓰는 비율입니다. 스크린은 이를 매크로 엔진의 자본비용 앵커(유틸리티 약 6.6%에서 반도체 기업 12.6%까지)에서 가져오고, 앵커가 없거나 오래되었으면 경고를 남기며 10%로 대체하고 그 사실을 기록합니다.',
        related: ['dcf', 'present-value'],
    },
    'present-value': {
        term: '현재가치·할인(Present value)',
        plain: '미래의 돈은 덜 가치 있습니다. 할인은 오늘의 기준으로 환산하는 것입니다.',
        definition:
            '내년의 1달러는 오늘의 1달러보다 덜 가치 있습니다(오늘의 1달러를 투자해 수익을 낼 수 있으므로). 할인은 그 논리를 적용합니다. 미래 현금흐름을 연도별로 (1 + 할인율)로 나눠 오늘의 돈으로 환산한 뒤 합산합니다.',
        related: ['dcf', 'cost-of-equity'],
    },
    bisection: {
        term: '이분법(Bisection)',
        plain: '컴퓨터가 정답을 좁혀 찾는 방법입니다.',
        definition:
            '범위를 계속 절반으로 줄여 수렴하는 수치해석 방법입니다. 역산 DCF는 DCF가 현재 가격과 같아지는 정확한 성장률을 찾기 위해 이분법을 사용합니다. 너무 낮으면 추정치를 올리고, 너무 높으면 내리고, 정답이 나올 때까지 반으로 좁혀 갑니다.',
        related: ['reverse-dcf', 'implied-growth'],
    },

    // ── AI 애널리스트 ────────────────────────────────────────────────────────
    llm: {
        term: 'LLM(대규모 언어모델)',
        plain: '애널리스트를 위해 리서치를 하는 종류의 AI입니다.',
        definition:
            '대규모 언어모델은 글을 읽고 쓰는 AI입니다. 애널리스트는 클라우드 서비스가 아니라 로컬 컴퓨터에서 하나를 돌립니다. 제출 서류를 읽고, 리서치를 하고, 모든 밸류에이션 입력값을 고릅니다. 산술은 하지 않습니다. 모든 계산은 파이썬 코드가 하고, 그다음 코드가 외부 앵커에 대조해 답을 검증합니다.',
        related: ['iv-band', 'street-fence', 'actionable'],
    },

    // ── 도어·등급·베토 ───────────────────────────────────────────────────────
    band: {
        term: '등급(Band)',
        plain: '순위를 실질적 행동으로 바꿔 주는 구간입니다.',
        definition:
            '스크린은 모든 종목을 네 개의 등급 중 하나에 넣습니다. RESEARCH NOW(후보 명단의 상위), WATCHLIST(후보 명단의 나머지), PASS(채점은 됐지만 후보 명단에는 없음), VETOED(안전 필터가 제거). 등급은 고정된 퍼센트 기준이 아니라 종목의 순위에서 나오며, 이미 후보 명단에 있는 종목은 뚜렷하게 밀려날 때까지 남아 있습니다.',
        related: ['research-now', 'watchlist', 'hysteresis'],
    },
    'research-now': {
        term: 'Research Now(리서치 나우)',
        plain: '후보 명단의 상위로, 오늘 리서치할 가치가 있습니다.',
        definition:
            '최고 등급입니다. 우선순위 기준 대략 상위 50~60개 종목이며 추세 주도주 몇 개를 포함합니다. 리서치 후보 명단이지 매수 주문이 아닙니다. 데스크의 AI 쪽에서는 AI 판단이 저평가이고 게이트를 통과할 때에만 Research now에 나타납니다.',
        related: ['band', 'watchlist', 'actionable'],
    },
    watchlist: {
        term: 'Watchlist(워치리스트)',
        plain: '후보 명단의 나머지로, 강한 근거가 있고 주시할 가치가 있습니다.',
        definition:
            '두 번째 등급입니다. 후보 명단 중 Research now 아래 부분입니다(후보 명단 전체는 대략 150개 종목). 여기 있는 종목은 주시할 가치가 있고 종종 승격됩니다. 데스크의 AI 쪽에서는 AI 판단이 적정 또는 고평가이고 게이트를 통과할 때 Watchlist에 나타납니다.',
        related: ['band', 'research-now'],
    },
    pass: {
        term: 'Pass(패스)',
        plain: '채점은 됐지만 후보 명단에는 없습니다.',
        definition:
            '채점은 됐지만 후보 명단 자리를 얻지 못한 종목의 기본 등급입니다. “나쁜 회사”라는 판정이 아니라, 오늘 당신의 관심을 받을 만한 근거가 충분하지 않다는 뜻일 뿐입니다.',
        related: ['band'],
    },
    veto: {
        term: '베토(Veto)',
        plain: '아무리 좋아 보여도 안전 필터가 제거한 종목입니다.',
        definition:
            '하드 디스퀄리파이어입니다. 베토된 종목은 등급이 없고 분석도 받지 않습니다. 이유는 다음과 같습니다. 거래할 수 없음(상장폐지 또는 거래정지), 너무 작거나 거래가 너무 얇음, 제출된 재무 데이터가 쓸 만하지 않음, 껍데기 회사, 또는 — 시가총액 100억 달러 미만 기업에 한해 — 만성적인 영업 손실과 과도한 부채, 혹은 두 개의 재무 포렌식 레드 플래그가 일치함. 더 큰 기업은 대신 경고를 받습니다. 이유가 레드칩에 적혀 있습니다.',
        related: ['forensic', 'beneish', 'dilution'],
    },

    // ── 포트폴리오·포지션 ───────────────────────────────────────────────
    'position-sizing': {
        term: '포지션 크기(Position sizing)',
        plain: '각 종목에 자본을 얼마나 넣을지 결정하는 것입니다.',
        definition:
            '후보 명단을 포트폴리오로 바꾸는 수학입니다. 이 사이트는 포트폴리오 계획을 주지 않습니다. 대신 AI 판단에 크기 힌트(4분의 1, 절반 또는 전체)를 붙이며, 가치 밴드가 얼마나 넓은지에서 읽어 냅니다. 실행들이 더 크게 엇갈릴수록 제안 크기는 더 작아집니다.',
        related: ['iv-band', 'position-basis'],
    },
    'paper-trading': {
        term: '페이퍼트레이딩',
        plain: '실제 돈 없이 규칙대로 거래하되, 기록은 진짜로 남깁니다.',
        definition:
            '시스템이 매일 자기 추천 종목을 실제 가격과 실제 거래비용으로 사고파는 것으로 가정하고 그 기록을 남깁니다. 정직한 척도입니다. 시스템이 틀렸다면 트랙 레코드 페이지가 그렇게 말해 줍니다.',
        related: ['transaction-costs', 'out-of-sample', 'track-record'],
    },
    unitization: {
        term: '유니타이제이션(Unitization)',
        plain: '포트폴리오를 펀드처럼 취급해 입금이 수익률을 속이지 못하게 합니다.',
        definition:
            '“mine” 원장은 뮤추얼펀드처럼 유니타이즈됩니다. 돈을 넣거나 빼면 유닛 수가 변하지 유닛 가격이 변하지 않습니다. 입금이 수익률을 부풀리지 못하게 합니다. 실제 보유 종목을 모델 포트폴리오와 공정하게 비교하는 방법입니다.',
        related: ['track-record', 'mine'],
    },
    'behavior-gap': {
        term: '행동 격차(Behavior gap)',
        plain: '시스템에서 이탈해 잃는 수익입니다.',
        definition:
            '규율 있는 시스템이 버는 수익과 당신이 실제로 버는 수익의 차이로, 당신 자신의 결정(너무 일찍 매도, 추격 매수, 청산 무시) 때문에 생깁니다. 트랙 레코드에서 Mine 북이 Equal-weight 북에 뒤처지는 것이 행동 격차이며, 공개적으로 측정됩니다.',
        related: ['track-record', 'unitization'],
    },
    'transaction-costs': {
        term: '거래비용(bps)',
        plain: '실제 거래의 마찰 — 베이시스 포인트로 측정됩니다.',
        definition:
            '모든 페이퍼 트레이드에 적용되는 수수료와 슬리피지입니다. 베이시스 포인트(bp)는 1%의 1/100입니다. 원장은 실제 비용으로 거래되므로(“거래당 Xbps”로 표시) 기록이 거래의 마찰을 정직하게 반영합니다. 왓-이프 오버레이로 자신의 수수료율로 재계산해 볼 수 있습니다.',
        related: ['paper-trading', 'track-record'],
    },
    'sharpe-ratio': {
        term: '샤프 비율(Sharpe ratio)',
        plain: '리스크 단위당 수익 — 각 이익이 얼마나 많은 고통을 요구했는지입니다.',
        definition:
            '초과수익 ÷ 변동성. 보상 대비 리스크를 측정합니다. 높을수록 전략이 덜 격렬한 등락으로 수익을 냈다는 뜻입니다. 트랙 레코드 페이지에서 충분한 일수만큼 실측 데이터가 쌓인 뒤에만 나타납니다.',
        related: ['volatility', 'track-record'],
    },
    cagr: {
        term: 'CAGR(연평균 복합성장률)',
        plain: '포트폴리오의 매끄러운 연간 성장률입니다.',
        definition:
            'Compound Annual Growth Rate. 전체 기간 동안 시작값을 끝값으로 만들었을 연간 단일 비율로, 성장이 완벽하게 매끄러웠던 것처럼 표현합니다. 포트폴리오를 동일한 연 단위 기준으로 비교하게 해 줍니다.',
        related: ['track-record', 'roic'],
    },
    drawdown: {
        term: '드로다운(Drawdown)',
        plain: '포트폴리오가 고점에서 얼마나 내려앉는지입니다.',
        definition:
            '포트폴리오의 사상 최고점에서 그 이후 가장 낮은 지점까지의 하락률(%)입니다. 30% 낙폭은 최악의 시점에 포트폴리오가 고점 가치의 30%를 잃었다는 뜻입니다. 리스크 방정식에서 “고통” 쪽입니다.',
        related: ['volatility', 'sharpe-ratio'],
    },
    alpha: {
        term: '알파·초과수익(Alpha)',
        plain: '시장이나 벤치마크 대비 초과 수익입니다.',
        definition:
            '비용 반영 후 포트폴리오가 벤치마크(IWM, SPY 등)보다 내는 성과입니다. 플러스 알파는 종목 선정이나 포지션 크기가 가치를 더했다는 뜻이고, 마이너스는 기계(또는 당신의 이탈)가 지수 보유보다 손해였다는 뜻입니다.',
        related: ['benchmark', 'iwm', 'spy'],
    },
    benchmark: {
        term: '벤치마크(Benchmark)',
        plain: '포트폴리오를 비교하는 기준 지수입니다.',
        definition:
            '기계가 가치를 더하고 있는지 판단하는 기준 포트폴리오, 보통 광범위 지수입니다. 이 시스템은 IWM(러셀 2000 소형주, 가장 가까운 유니버스)과 SPY(S&P 500)를 벤치마크로 사용합니다. NAV 차트에서 켜고 끌 수 있습니다.',
        related: ['iwm', 'spy', 'alpha'],
    },
    iwm: {
        term: 'IWM',
        plain: 'iShares Russell 2000 ETF — 미국 소형주입니다.',
        definition:
            '러셀 2000 소형주 지수의 가장 흔한 상장지수펀드(ETF) 프록시입니다. 이 시스템은 소형·중형주를 스크리닝하므로 IWM이 이겨야 할 가장 관련 높은 벤치마크입니다.',
        related: ['benchmark', 'spy'],
    },
    spy: {
        term: 'SPY',
        plain: 'SPDR S&P 500 ETF — 미국 대형주 전체 시장입니다.',
        definition:
            'S&P 500을 추적하는 상장지수펀드로, 미국 주식 시장 전체의 표준 기압계입니다. 트랙 레코드 NAV 차트의 두 번째 벤치마크로 사용됩니다.',
        related: ['benchmark', 'iwm'],
    },
    'track-record': {
        term: '트랙 레코드(Track Record)',
        plain: '시스템 자체 페이퍼 북의 성적표입니다.',
        definition:
            '실제 가격과 거래비용으로 세 개의 북을 매일 페이퍼트레이딩하는 탭입니다. Equal-weight, AI 북, Mine. 아첨하는 백테스트 대신, 실수를 포함해 시스템이 실제로 한 일의 기록입니다.',
        related: ['paper-trading', 'behavior-gap', 'alpha'],
    },

    // ── 데이터·파이프라인 ───────────────────────────────────────────────
    'sec-filings': {
        term: 'SEC 제출 서류(SEC filings)',
        plain: '상장사가 의무적으로 제출하는 공식 재무보고서입니다.',
        definition:
            '미국 상장사가 SEC에 제출해야 하는 규제 서류(10-K, 10-Q, 구조화된 Company Facts 피드)입니다. 재무의 기준 사실(ground truth)입니다. 제출 당시 그대로의 10년 데이터가 퀄리티, 포렌식, 입증된 성장률 입력에 공급됩니다.',
        related: ['company-facts', 'as-filed', 'demonstrated-growth'],
    },
    'company-facts': {
        term: 'SEC Company Facts',
        plain: '제출된 모든 재무 항목의 SEC 기계가독형 피드입니다.',
        definition:
            '모든 미국 제출 기업의 제출 당시 그대로 재무 사실을 담은 SEC의 구조화·기계가독형 데이터셋입니다. 파이프라인은 이를 이용해 10년 재무 배터리(Piotroski F, Sloan 발생액, 실제 Beneish M, 순발행)를 만들며, 이는 플레이스홀더 점수를 대체했습니다.',
        related: ['sec-filings', 'fundamentals-battery', 'as-filed'],
    },
    'as-filed': {
        term: '제출 당시 그대로(As-filed)',
        plain: '재작성 전, 기업이 그 시점에 보고한 그대로의 값입니다.',
        definition:
            '기업이 당초 보고한 그대로, 제출 시점의 날짜로 기록된 데이터입니다. 이것이 시점 일치 분석을 가능하게 합니다. 어떤 날짜의 숫자가 어땠는지(이후 수정본이 아니라) 알 수 있습니다.',
        related: ['point-in-time', 'sec-filings', 'company-facts'],
    },
    ttm: {
        term: 'TTM(직전 12개월)',
        plain: '직전 4분기를 합친, 항상 최신인 1년 윈도우입니다.',
        definition:
            '직전 4개 분기의 합으로, 수개월 전에 끝난 회계연도와 달리 항상 현재에 가까운 1년 윈도우를 줍니다. 데이터 파이프라인 전반에서 매출, 마진, 성장에 사용됩니다.',
        related: ['sec-filings'],
    },
    'yahoo-finance': {
        term: 'Yahoo Finance(야후 파이낸스)',
        plain: '주가, 추정치, 애널리스트 커버리지의 출처입니다.',
        definition:
            '파이프라인이 실시간 주가, 주가 이력, 애널리스트 추정치, 커버리지 메타데이터에 사용하는 주요 금융 데이터 제공자입니다. SEC 재무 데이터와 결합해 전체 그림을 만듭니다.',
        related: ['fred', 'sec-filings'],
    },
    fred: {
        term: 'FRED',
        plain: '미 연방준비은행의 공개 경제 데이터 서비스입니다.',
        definition:
            '세인트루이스 연방준비은행의 미국 경제 시계열 무료 데이터베이스입니다. 매크로 엔진의 확률과 쇼크 경보에 쓰이는 숫자의 유일한 출처입니다. 뉴스는 맥락으로만 쓰이며 숫자로는 절대 쓰이지 않습니다.',
        related: ['probability-vector', 'shock-register'],
    },
    'github-actions': {
        term: 'GitHub Actions',
        plain: '데이터 파이프라인을 일정에 따라 다시 실행하는 클라우드 자동화입니다.',
        definition:
            '데이터 수집, 채점 체인, 페이퍼 북을 일정에 따라 자동으로 실행하는 CI/CD 서비스입니다. AI 애널리스트는 따로, 로컬 컴퓨터에서 실행됩니다.',
        related: ['pipeline'],
    },
    pipeline: {
        term: '파이프라인(Pipeline)',
        plain: '원시 데이터에서 성과 평가를 받은 기록까지 이어지는 순서 있는 단계입니다.',
        definition:
            '엔드투엔드 과정입니다. 제출 서류·주가·매크로 데이터 수집 → 안전 필터 → 3도어 스크린 → 등급 → AI 애널리스트(가동 중일 때) → 게이트 → 사이트에 게시 → 페이퍼 북 → 성과 평가. 채점 부분은 무결성 검사와 함께 정해진 순서로 실행되므로, 낡거나 부분적인 데이터가 조용히 후보 명단을 망가뜨릴 수 없습니다.',
        related: ['github-actions', 'reverse-engine'],
    },
    'reverse-engine': {
        term: '역설계 엔진(Reverse engine)',
        plain: '도어에 점수를 공급하는, 앞 단계의 안전·퀄리티 스크린입니다.',
        definition:
            '각 사업 유형(아키타입)을 분류하고, 기업이 침체를 얼마나 견딜지와 데이터가 얼마나 믿을 만한지를 채점하며, 역산 DCF 수치를 만드는 채점 단계입니다. 퀄리티와 생존 가능성 점수는 관문이 아니라 입력으로 스크린에 전달됩니다.',
        related: ['pipeline', 'reverse-dcf', 'forensic'],
    },

    // ── 오버레이·포렌식 ─────────────────────────────────────────────────
    gpr: {
        term: 'GPR(지정학적 노출)',
        plain: '기업의 지정학적 노출도를 나타내는 0–3 태그입니다.',
        definition:
            '기업의 실제 사업 구조(매출 지역, 공급망, 규제, 제재)를 바탕으로 태그한 지정학적 리스크입니다. 맥락 칩으로 표시됩니다. 매수/매도 신호가 아니며 후보 명단 순위에도 포함되지 않습니다.',
        related: ['overlay'],
    },
    insiders: {
        term: '내부자 매수·매도',
        plain: '회사를 운영하는 사람들이 자기 주식으로 무엇을 하는지입니다.',
        definition:
            '임원과 이사가 자기 회사 주식을 사고파는 합법적 거래입니다. ▲ INSIDERS = 공매도 세력이 물러나는 동안 내부자가 순매수(확인 신호). ▼ INSIDERS = 높거나 상승하는 공매도 잔고 속에서 내부자가 매도(논제를 의심하라는 신호). 확인 또는 경고일 뿐, 점수에 더해지지 않습니다.',
        related: ['short-interest', 'informed-demand'],
    },
    'short-interest': {
        term: '공매도 잔고(Short interest)',
        plain: '주식의 몇 %가 하락을 베팅하는 공매도 세력에게 빌려졌는지입니다.',
        definition:
            '유통주식 대비 공매도(빌려서 주가 하락에 베팅하며 판 주식)의 수량입니다. 내부자 매도와 함께 높거나 상승 중인 공매도 잔고는 ▼ 경고 패턴입니다.',
        related: ['insiders', 'float'],
    },
    'informed-demand': {
        term: '정보 수요(Informed demand)',
        plain: '내부자와 공매도를 합쳐 읽은 신호 — 이 사이트의 오버레이 중 하나입니다.',
        definition:
            '합성 신호입니다. 내부자가 순매수하고 공매도 잔고가 오르지 않으면 플러스, 내부자가 높은/상승하는 공매도 속에서 매도하면 마이너스입니다. ▲/▼ INSIDERS 칩으로 표시됩니다. 논제의 맥락일 뿐, 가산 점수는 절대 아닙니다.',
        related: ['insiders', 'short-interest', 'overlay'],
    },
    dilution: {
        term: '주식 희석·발행',
        plain: '회사가 신주를 찍어내 기존 주주 지분이 줄어드는 것입니다.',
        definition:
            '회사가 신주를 발행하면 기존 주식 한 주가 파이에서 차지하는 조각이 줄어듭니다. 과도한 발행은 재무 포렌식 경고로 표시됩니다.',
        related: ['forensic', 'veto'],
    },
    float: {
        term: '유통주식(Float)',
        plain: '시장에서 실제로 거래 가능한 주식 수입니다.',
        definition:
            '발행주식 수에서 내부자와 기관이 묶어둔 주식을 뺀 것입니다. 유통주식이 적으면 주가 변동과 공매도 압박이 커질 수 있습니다. 고전적인 100배 종목 스크리닝 입력 중 하나입니다.',
        related: ['market-cap', 'short-interest'],
    },
    overlay: {
        term: '오버레이(Overlay)',
        plain: '순위 위에 얹히는 추가 맥락 태그입니다.',
        definition:
            'GPR(지정학적 노출)과 ▲/▼ INSIDERS(정보 수요) 같은 비채점 신호를 칩으로 보여줍니다. 순위를 바꾸지 않으며, 당신 자신의 생각을 위한 맥락입니다.',
        related: ['gpr', 'informed-demand'],
    },
    theme: {
        term: '테마(Theme)',
        plain: '과열 카테고리(AI, 바이오…) — 맥락일 뿐, 채점 팩터가 아닙니다.',
        definition:
            '종목이 속한 시장 서사입니다(예: AI, 반도체, 바이오). 테마 소속은 방향 잡기를 위해 함께 보여주지만 점수에 절대 더해지지 않습니다. 순진한 테마 노출은 역사적으로 가치를 파괴했기 때문입니다(전문 테마 ETF 평균 연 −3.1%).',
        related: ['overlay'],
    },

    // ── 자주 보이는 용어 ────────────────────────────────────────────────
    ticker: {
        term: '티커(Ticker)',
        plain: '주식의 거래 기호 — 예: AAPL.',
        definition:
            '주식을 식별하고 거래하는 데 쓰는 짧은 거래소 기호입니다(애플의 AAPL, TSMC의 TSM처럼). 리더보드 모든 행의 기본 키입니다.',
        related: ['market-cap'],
    },
    'analyst-coverage': {
        term: '애널리스트 커버리지',
        plain: '그 회사를 커버하는 전문 애널리스트 수입니다.',
        definition:
            '한 종목에 추정치를 내는 매도측 애널리스트의 수입니다. 커버리지가 많을수록 리비전 팩터가 읽을 전망 수정이 많아집니다. 커버리지가 얇으면 신호가 적습니다. 커버리지 데이터는 야후 파이낸스에서 옵니다.',
        related: ['estimates', 'revisions', 'yahoo-finance'],
    },
    // ── 새 시스템 용어 ──────────────────────────────────────────────────
    'iv-band': {
        term: '가치 밴드(IV band)',
        plain: '애널리스트의 실행들에서 나온 가치의 범위입니다.',
        definition:
            '각 종목은 독립적인 2~3회 실행으로 분석되며, 각 실행은 사업이 얼마의 가치가 있는지에 대한 추정치로 끝납니다. 가치 밴드는 그 추정치 중 가장 낮은 값부터 가장 높은 값까지의 범위이고, 중앙값은 가운데 값입니다. 판단은 오늘의 주가가 밴드에 대해 어디에 있는가입니다. 밴드 아래 = 저평가, 안 = 적정, 위 = 고평가. 데스크에서는 음영 띠가 범위, 눈금이 중앙값, 흰 선이 주가입니다. 밴드가 넓다는 것은 실행들의 의견이 엇갈렸다는 뜻이며, 그러면 제안 크기가 작아집니다.',
        related: ['intrinsic-value', 'actionable', 'position-sizing'],
    },
    'not-usable': {
        term: '사용 불가(Not usable)',
        plain: '애널리스트가 쓸 만한 판단을 내지 못한 행입니다.',
        definition:
            '판단 단계가 오작동하면 그 행은 추측을 얹지 않고 사용 불가로 표시됩니다. 방향이 없고, 추천 종목으로는 절대 표시되지 않으며, 데스크 AI 쪽의 베토(Vetoed) 아래에 놓입니다.',
        related: ['actionable', 'iv-band'],
    },
    actionable: {
        term: '실행 가능(Actionable)',
        plain: '게이트의 모든 규칙을 통과한 판단입니다.',
        definition:
            '모든 AI 판단에는 actionable(실행 가능)이라는 예/아니오 플래그가 붙고, 답이 아니오일 때는 이유 목록이 함께 붙습니다. 실행 가능한 판단만 AI 쪽의 Research now나 Watchlist에 나타나거나 AI 페이퍼 북이 따라갈 수 있습니다. 실행 불가능한 판단은 삭제되지 않습니다. 막힘(blocked) 표시가 붙은 채 계속 보입니다.',
        related: ['gate-reason', 'street-fence', 'rn-depth'],
    },
    'gate-reason': {
        term: '게이트 사유(Gate reason)',
        plain: '판단이 막힌 이유를 쉬운 말로 적은 것입니다.',
        definition:
            '판단이 막히면 데스크가 이유를 말해 줍니다. 예를 들어 “옛 애널리스트가 만듦”이나 “실행 간 격차가 너무 큼”입니다. 판단 하나에 이유가 여럿일 수 있습니다. 전체 목록은 이 핸드북의 게이트 섹션에 있습니다.',
        related: ['actionable', 'street-fence'],
    },
    'street-fence': {
        term: '스트리트 펜스(Street fence)',
        plain: '애널리스트 목표주가 범위로, 외부 검증에 쓰입니다.',
        definition:
            '스트리트(Street)는 한 기업을 추적하는 전문 애널리스트들을 뜻합니다. 스트리트 펜스는 그들의 목표주가 범위입니다. 코드는 AI 애널리스트의 답을 이 범위에 대조합니다. 펜스 밖의 가치는 막히고, 대조할 펜스가 없는 판단도 막히며, 가치가 주가보다 비현실적으로 높게 나온 판단도 막힙니다. 애널리스트 자신의 작업에 대한 외부 검증입니다.',
        related: ['actionable', 'gate-reason', 'estimates'],
    },
    'thesis-status': {
        term: '논제 상태(Thesis status)',
        plain: '판단의 근거가 아직 유효한가입니다.',
        definition:
            '새 애널리스트의 판단은 각각 자기만의 무효화 규칙, 즉 일어나면 논제가 깨졌다는 뜻이 되는 일들을 명시합니다. 모니터가 그 규칙을 현재 데이터에 대해 다시 점검합니다. 유지(intact) = 규칙을 점검했고 발동한 것이 없음, 훼손(breached) = 하나 이상 발동, 알 수 없음(unknown) = 점검할 수 있는 것이 없음. 논제가 훼손되면 표시됩니다. 애널리스트 재가동과 함께 도입됩니다.',
        related: ['actionable', 'position-basis'],
    },
    'position-basis': {
        term: '포지션 근거(Position basis)',
        plain: '종목을 가치 때문에 보유하는지, 모멘텀 때문에 보유하는지입니다.',
        definition:
            '판단에는 근거(basis)가 붙을 수 있습니다. 가치 기준(Value basis): 주가가 가치 밴드 아래에 있다는 것이 근거입니다. 모멘텀 기준(Momentum basis): 애널리스트의 가치는 주가보다 낮지만, 종목이 펀더멘털의 뒷받침을 받는 강한 상승 추세에 있어서 팔지 않고 — 절반 또는 4분의 1 크기로 — 보유할 수 있습니다. 없음(None): 제안하는 포지션이 없습니다. 애널리스트 재가동과 함께 도입됩니다.',
        related: ['position-sizing', 'thesis-status'],
    },
    door: {
        term: '도어(Door)',
        plain: '종목이 후보 명단에 오르는 세 가지 경로 중 하나입니다.',
        definition:
            '스크린은 모든 것을 하나의 점수로 섞지 않습니다. 기업은 뛰어나서, 잘못 가격이 매겨져서, 또는 강하고 꾸준한 상승 추세에 있어서 관심을 받을 수 있습니다. 그래서 도어(문)가 세 개 있습니다. Door 1, 컴파운더 도어는 퀄리티, 모멘텀, 오르는 애널리스트 전망에 점수를 줍니다. Door 2, 밸류 갭 도어는 싼 가격과, 기업이 달성한 것보다 적은 성장을 요구하는 가격에 점수를 줍니다. Door 3, 추세 주도주 도어는 강하고 꾸준한 상승 추세에 최대 20개의 추가 자리를 줍니다. 종목은 도어 하나만 통과하면 됩니다.',
        related: ['champion', 'sector-quota', 'hysteresis'],
    },
    champion: {
        term: '챔피언(Champion)',
        plain: '앞의 두 도어 모두에서 최상위인 종목입니다.',
        definition:
            '컴파운더 도어와 밸류 갭 도어 모두에서 상위 10%에 드는 종목입니다. 뛰어나면서 싼 경우는 드물기 때문에, 후보 명단의 순서를 정할 때 챔피언은 작은 가산점(+2)을 받습니다. 가파르게 하락 중인 종목은 챔피언이 될 수 없습니다.',
        related: ['door', 'composite'],
    },
    hysteresis: {
        term: '히스테리시스(끈끈한 후보 명단)',
        plain: '이미 후보 명단에 있는 종목은 뚜렷하게 밀려날 때까지 남습니다.',
        definition:
            '완충 장치가 없으면 컷 경계에 걸린 종목이 작은 가격 변동마다 후보 명단을 들락날락합니다. 그래서 이미 Research now에 있는 종목은 순위가 60위 이내인 동안 거기 남고, 이미 후보 명단에 있는 종목은 순위가 150위 이내인 동안 후보 명단에 남습니다. 뚜렷하게 밀려날 때만 빠집니다. 후보 명단이 덜 바뀌므로 따라가기 쉽습니다.',
        related: ['band', 'research-now', 'watchlist'],
    },
    'sector-quota': {
        term: '섹터 할당(Sector quota)',
        plain: '각 섹터가 후보 명단에서 몇 자리를 갖는가입니다.',
        definition:
            '후보 명단은 한 업종이 나머지를 밀어내지 않도록 섹터에 걸쳐 나뉩니다. 모든 섹터가 같은 기본 할당을 받습니다. 매크로 엔진이 원칙적으로는 경제에 맞는 섹터에 더 많은 자리를 줄 수 있지만(“틸트”), 그 섹터 선택은 아직 검증되지 않았습니다. 그래서 틸트는 꺼져 있고, 검증될 때까지 모든 섹터가 같은 할당을 받습니다.',
        related: ['door', 'probability-vector'],
    },
    'rn-depth': {
        term: 'AI 북(rn_depth)',
        plain: '애널리스트의 통과 판단을 따르는 페이퍼 북입니다.',
        definition:
            '세 개의 페이퍼 북 중 하나입니다. AI 판단이 저평가이고 게이트를 통과한 후보 명단 종목 전부를 같은 금액씩 보유합니다. 통과하는 판단이 없으면 현금만 들고 있으며, 2026-09-24 이후 줄곧 그랬습니다. 지금까지의 기록은 무효 판정을 받은 옛 애널리스트의 것이므로, 새 애널리스트가 가동되면 AI 기록은 0에서 다시 시작하고 옛 기록은 보관됩니다.',
        related: ['actionable', 'track-record', 'paper-trading'],
    },
    'probability-vector': {
        term: '확률 벡터(Probability vector)',
        plain: '경제 “계절”별 확률로, 합이 100%입니다.',
        definition:
            '매크로 엔진은 현재 경제 계절의 이름만 대지 않습니다. 다섯 계절 각각의 확률을 게시합니다. 골디락스, 리플레이션, 긴축, 스태그플레이션, 경기침체입니다. 이 확률이 주된 산출물입니다. 단일 계절 라벨은 요약일 뿐이며 어떤 숫자도 움직이지 않습니다.',
        related: ['shock-register', 'fred', 'sector-quota'],
    },
    'shock-register': {
        term: '쇼크 레지스터(Shock register)',
        plain: '갑작스러운 경제적 스트레스를 감시하는 일곱 개의 경보입니다.',
        definition:
            '일곱 개의 경보입니다. 공포(시장 변동성), 신용, 금리, 유가, 달러, 고용, 인플레이션. 각각 FRED 데이터만으로 읽습니다. 그 옆에는 공포 지수(VIX)가 30 이상일 때 켜지는 난기류 리스크 플래그가 있습니다.',
        related: ['probability-vector', 'fred'],
    },
};
