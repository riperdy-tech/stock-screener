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
    ai: 'RS2 / AI',
    portfolio: '포트폴리오·포지션',
    track: '트랙 레코드',
    data: '데이터·파이프라인',
    overlay: '오버레이·재무 포렌식',
    bands: '등급(Band)·베토',
};

export const GLOSSARY_KO: Record<string, TermKo> = {
    // ── 핵심 개념 ──────────────────────────────────────────────────────
    composite: {
        term: '종합 점수(Composite score)',
        plain: '모든 종목의 순위를 매기는 0–100 단일 점수입니다.',
        definition:
            '모든 종목을 하나의 리더보드에 올려놓는 최종 점수입니다. 다섯 가지 팩터(밸류, 퀄리티, 모멘텀, 저변동성, 리비전) 점수를 각각 같은 섹터 내에서 측정해 합친 뒤, 백분위(0–100)로 변환하고 취약한 재무구조나 데이터 누락에 대한 세 가지 안전 “할인(haircut)”을 적용합니다. 높을수록 해당 종목에 유리한 근거가 많다는 뜻입니다.',
        related: ['factor', 'sector-neutral', 'percentile', 'haircut'],
    },
    factor: {
        term: '팩터(Factor)',
        plain: '역사적으로 수익률을 예측해 온, 측정 가능한 종목의 특성입니다.',
        definition:
            '싸다, 수익성이 좋다, 최근에 오르고 있다 같은, 학술 연구에서 미래 수익률을 평균적으로 예측한다고 입증된 정량적 특성입니다. 이 사이트는 밸류·퀄리티·모멘텀·저변동성·리비전이라는 다섯 가지 팩터를 채점합니다. 마치 10종 경기의 각 종목처럼, 각각은 별개의 능력이고 종합 점수는 그 합산 결과입니다.',
        related: ['composite', 'value', 'quality', 'momentum'],
    },
    'sector-neutral': {
        term: '섹터 중립(Sector-neutral)',
        plain: '모든 평가를 종목이 속한 업종 내에서 상대적으로 매깁니다.',
        definition:
            '각 종목은 같은 섹터에 속한 다른 기업들하고만 비교됩니다. 예를 들어 슈퍼마켓은 슈퍼마켓끼리 경쟁하며 소프트웨어 기업과 비교하지 않습니다. 이렇게 하지 않으면 “모멘텀이 높다”는 게 그냥 “기술주다”라는 뜻이 되고, “싸다”는 그냥 “은행주다”가 되어 버립니다. 섹터 내 비교가 공정성을 유지하며, 다섯 팩터가 섹터별로 계산되는 이유입니다.',
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
            '순위를 0–100 척도로 바꾼 값입니다. 98백분위는 약 6,600개 종목 가운데 98%보다 높은 점수를 받았다는 뜻입니다. 등급(Band)은 바로 이 백분위로 잘라집니다(97+ = Research Now, 90+ = Watchlist, 70+ = Monitor).',
        related: ['composite', 'band'],
    },
    'rank-ic': {
        term: 'Rank IC(순위 정보계수)',
        plain: '각 팩터가 실제로 수익률을 예측했는지 매달 측정하는 지표입니다.',
        definition:
            '팩터 점수와 이후 주가 수익률 간의 순위 상관관계(Information Coefficient)입니다. 각 팩터에 대해 매달 진단용으로 측정됩니다. 엔진은 이 측정치로 가중치를 바꾸지 않습니다(equal-weight 참조). 다만 팩터가 제 역할을 하고 있는지 확인하고 드리프트(성과 이탈)를 보고하는 데 사용합니다.',
        related: ['equal-weight', 'backtest', 'out-of-sample'],
    },
    'equal-weight': {
        term: '동일 가중(1/N)',
        plain: '다섯 개 팩터가 의도적으로 똑같이 20%씩 반영됩니다.',
        definition:
            '각 팩터가 종합 점수에 동일하게 20%씩 기여합니다. 수십 년간의 연구(DeMiguel, Garlappi & Uppal 2009)는 과거 데이터로 추정한 가중치가 거의 항상 과적합된다는 것을 보여줍니다. 백테스트에서 찾아낸 “완벽한” 가중치는 미래 데이터에서 거의 살아남지 못합니다. 단순하고 겸손한 1/N 방식은 표본 외(Out-of-sample)에서 이기기 가장 어려운 대상 중 하나입니다.',
        related: ['rank-ic', 'overfitting', 'out-of-sample'],
    },
    overfitting: {
        term: '과적합(Overfitting)',
        plain: '과거 데이터에 너무 정밀하게 맞춰 신규 데이터에서는 깨지는 현상입니다.',
        definition:
            '퀀트의 전형적인 함정입니다. 백테스트가 멋지게 보일 때까지 손잡이를 너무 많이 돌리면, 과거를 암기하고 있는 것이지 지속 가능한 패턴을 학습한 것이 아닙니다. 이 사이트는 바로 이 때문에 팩터 가중치 최적화를 의도적으로 거부합니다. 테스트한 것과 같은 데이터에서 역설계한 “수익이 났을” 규칙은 무가치합니다.',
        related: ['out-of-sample', 'equal-weight', 'backtest'],
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
            '결과를 안 뒤에 그 결정이 예측 가능했던 것처럼 재구성하는 것입니다. 페이퍼트레이딩 시스템은 이를 제거합니다. 모든 매수·매도가 미래가 일어나기 전에 실시간으로 기록되고, 기록은 추가 전용(append-only)입니다.',
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
            '주가가 기업이 실제로 창출하는 현금 대비 저렴한지 측정합니다. 네 가지 수익률(잉여현금흐름, 오너 이어닝, EBIT, 단순 이익)을 현재 주가 대비로 구성합니다. 장기 평균적으로 저렴한 것이 비싼 것보다 낫습니다. 다만 “저렴함”은 항상 같은 섹터 내에서 판단됩니다.',
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
            '매출채권 회전일수, 자산 품질 등 8개 비율을 이용해 기업이 이익을 조작했을 가능성을 점수화합니다. M-점수가 높으면 재무 포렌식 알람이 울리며, 높은 발생액과 동시에 발생하면 해당 종목은 무조건 베토(탈락)됩니다.',
        related: ['forensic', 'accruals', 'veto'],
    },
    forensic: {
        term: '재무 포렌식 플래그',
        plain: '수상한 회계에 대한 옐로카드와 레드카드입니다.',
        definition:
            '재무 포렌식 배터리(Beneish M-점수, Sloan 발생액, 과잉 발행 등)에서 나온 경고등입니다. 단일 플래그는 점수에 0.85 할인을 적용하고, 특정 플래그들이 동시에 발생하면 무조건 베토입니다. 사진은 아름다운데 구조검사에서 탈락한 집과 같습니다.',
        related: ['beneish', 'accruals', 'haircut', 'veto'],
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
            '이긴 주식은 한동안 계속 이기는 경향이 있습니다. 모멘텀 팩터는 12-1 스킵월 수익률(학계 표준인, 가장 최근 달을 제외한 12개월 수익률)과 52주 최고가 근접도를 결합합니다. 고전적이고 견고한 “추세” 팩터입니다.',
        related: ['skip-month', 'high-proximity'],
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
    lowvol: {
        term: '저변동성 팩터',
        plain: '잔잔한 주식이 역사적으로 고통 대비 더 많은 수익을 냈습니다.',
        definition:
            '월간 수익률의 표준편차(최소 12개 관측치)로 주가가 얼마나 잔잔하게 또는 격렬하게 움직이는지 측정합니다. 반직관적이게도 잔잔한 주식이 변동성이 큰 주식보다 역사적으로 위험조정 수익률이 더 좋았습니다. 그래서 이 사이트는 종목별 연환산 변동성을 내보내 포지션 크기를 정하는 데 사용합니다.',
        related: ['volatility', 'annualized-volatility'],
    },
    volatility: {
        term: '변동성(σ)',
        plain: '주가가 얼마나 출렁이는지 — 주식의 “난폭함”입니다.',
        definition:
            '수익률의 표준편차입니다. 높으면 단기간에 크게 출렁이고, 낮으면 잔잔하게 움직입니다. 시그마(σ)는 그 기호입니다. 변동성은 포지션 크기 계산의 “리스크” 입력값입니다.',
        related: ['lowvol', 'annualized-volatility', 'kelly'],
    },
    'annualized-volatility': {
        term: '연환산 변동성',
        plain: '월간 변동폭을 1년 단위로 환산한 값입니다.',
        definition:
            '월간 수익률 변동성에 √12(12개월의 제곱근)를 곱해 1년 단위로 나타냅니다. 종목별로 내보내지며, 추천 포트폴리오의 켈리 포지션 크기 계산에 사용됩니다.',
        related: ['volatility', 'kelly'],
    },

    // ── 리비전 팩터 ─────────────────────────────────────────────────────
    revisions: {
        term: '리비전(어닝 수정) 팩터',
        plain: '전문 애널리스트들이 전망을 올리고 있는지 내리고 있는지입니다.',
        definition:
            '애널리스트 기대치의 방향성을 측정합니다. 애널리스트가 이익 추정치를 올리면 주가가 계속 오르는 경향이 있고, 내리면 계속 내리는 경향이 있습니다. EPS 궤적의 정규화된 기울기와 구조화된 애널리스트 점수로 구성됩니다.',
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
            '시간에 따른 EPS 전망의 기울기입니다. 상승 중인지, 평평한지, 하락 중인지. 리비전 팩터는 이 기울기를 −1~+1로 정규화해 구조화된 애널리스트 점수와 섞어, “개선 중”과 “악화 중”을 비교 가능한 숫자로 만듭니다.',
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
        term: '기대치 격차(DCF gap)',
        plain: '가격이 요구하는 성장률에서 기업이 입증한 성장률을 뺀 값입니다.',
        definition:
            '암묵 성장률(역산 DCF) − 입증된 성장률(최근 5년간 SEC 제출 기준 실제 매출/FCF 성장), 퍼센트 포인트 단위입니다. 초록/마이너스 = 가격이 기업이 입증한 것보다 적은 성장을 요구합니다. 잠재적 저평가입니다. 주황/플러스 = 가격이 아무도 입증하지 못한 가속을 요구합니다. 스토리를 믿어야 합니다.',
        related: ['implied-growth', 'reverse-dcf', 'demonstrated-growth'],
    },
    'demonstrated-growth': {
        term: '입증된 성장률(Demonstrated growth)',
        plain: '기업이 제출 서류 기준으로 실제 달성한 성장입니다.',
        definition:
            'SEC 제출 데이터에서 얻은 최근 5년간의 실제 매출 및 잉여현금흐름 성장입니다. 기대치 격차에서 가격의 약속과 비교되는 기준 사실(ground truth)입니다.',
        related: ['expectations-gap', 'sec-filings'],
    },
    'intrinsic-value': {
        term: '내재가치(Intrinsic value)',
        plain: '주가와 무관한, 기업의 진정한 가치입니다.',
        definition:
            '미래 현금 창출 능력에 기반한 기업의 진정한 가치 추정치입니다. DCF가 산출하는 숫자입니다. RS2 AI의 내재가치는 애널리스트 컨센서스 밴드에 고정하고 현재 가치로 되돌려, 안전마진이 12개월 목표가가 아닌 오늘의 저렴함을 측정하도록 합니다.',
        related: ['dcf', 'margin-of-safety', 'present-value'],
    },
    'margin-of-safety': {
        term: '안전마진(Margin of safety)',
        plain: '내재가치 대비 얼마나 싸게 사는지 — 할인 폭입니다.',
        definition:
            '추정 내재가치보다 가격이 얼마나 저렴한지(% ). 안전마진 30%는 1달러 가치의 주식을 70센트에 산다는 뜻입니다. RS2는 이를(컨빅션과 함께) Research Now 명단의 관문으로 사용합니다. 딥밸류(MoS ≥ 30%)는 어떤 컨빅션이든 Research Now가 되고, 중간 밸류는 컨빅션 ≥ 9.5가 필요합니다.',
        related: ['intrinsic-value', 'conviction'],
    },
    'cost-of-equity': {
        term: '자기자본비용(Cost of equity)',
        plain: '주주가 요구하는 수익률 — 주식 현금흐름의 할인율입니다.',
        definition:
            '안전자산 대신 주식을 보유하기 위해 투자자가 요구하는 최소 연 수익률입니다. DCF에서 미래 주식 현금흐름을 할인하는 데 쓰는 비율입니다. RS2는 내재가치를 현재로 되돌릴 때 자기자본비용 1년 치를 할인합니다.',
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

    // ── RS2 / AI ────────────────────────────────────────────────────────
    llm: {
        term: 'LLM(대규모 언어모델)',
        plain: '제출 서류를 읽고 독립적인 판단을 쓰는 AI입니다.',
        definition:
            'RS2 시스템은 로컬 AI(대규모 언어모델)로 각 기업의 실제 SEC 제출 서류를 읽고 독립적인 분석을 만듭니다. 마치 두 번째 의사의 소견을 받는 것과 같습니다. 그 판단으로 RS2 LLM 렌즈에서 볼 수 있는 별도의 순위가 만들어집니다.',
        related: ['stance', 'conviction', 'action'],
    },
    stance: {
        term: '스탠스(Stance)',
        plain: 'AI의 밸류에이션 판단: 저평가, 공정, 과대평가.',
        definition:
            'RS2의 핵심 판단입니다. UNDERVALUED(가격이 근거에 비해 너무 낮음), FAIR(공정), OVERVALUED(가격이 이미 많은 것을 가정함). 순위표에서 색깔 알약으로 표시됩니다.',
        related: ['llm', 'margin-of-safety'],
    },
    conviction: {
        term: '컨빅션(Conviction)',
        plain: 'AI가 자신의 판단에 얼마나 확신하는지(0–15)입니다.',
        definition:
            'RS2가 자신의 판단에 매기는 확신도로, 0(추측)부터 15(매우 확신)까지입니다. AI Research Now 관문에서 중요합니다. 중간 밸류는 컨빅션이 충분히 높아야만 Research Now가 됩니다.',
        related: ['llm', 'margin-of-safety'],
    },
    action: {
        term: '액션(Action)',
        plain: 'AI 애널리스트가 그 주식에 대해 취할 행동 — 의견이지 주문이 아닙니다.',
        definition:
            'AI가 제안하는 행동(매수/누적/보유/축소/회피…). 리서치용 의견이며 주문이 아닙니다. 이 사이트에서 실제 매매는 일어나지 않습니다. 강한 회피·매도는 AI 렌즈에서 베토입니다.',
        related: ['llm', 'exit-review'],
    },
    'exit-review': {
        term: '엑시트 리뷰(Exit review)',
        plain: '명단에서 빠진 종목을 이미 보유한 사람들을 위한 AI의 보유/축소/매도 판단입니다.',
        definition:
            '종목이 퀀트 Research Now 명단에서 빠지면 RS2가 이미 보유한 사람들을 위해 리뷰합니다. 보유, 축소, 매도. 주황색 “LLM EXIT” 칩으로 표시됩니다. 새 매수 사례가 아니라 기존 보유자를 위한 판단입니다.',
        related: ['llm', 'action', 'band'],
    },

    // ── 등급·베토 ───────────────────────────────────────────────────────
    band: {
        term: '등급(Band)',
        plain: '순위를 실질적 행동으로 바꿔 주는 구간입니다.',
        definition:
            '백분위를 네 개의 실용적 구간으로 자릅니다. RESEARCH NOW(상위 3%), WATCHLIST(상위 10%), MONITOR(상위 30%), PASS(나머지). 등급은 오늘 그 종목에 시간을 얼마나 쓸 가치가 있는지 알려줍니다.',
        related: ['research-now', 'watchlist', 'percentile'],
    },
    'research-now': {
        term: 'Research Now(리서치 나우)',
        plain: '상위 3% — 오늘 리서치할 가치가 있는 후보 명단입니다.',
        definition:
            '최고 등급입니다. 채점된 종목의 상위 3%. AI 렌즈에서는 RS2 Research Now 관문이 안전마진과 컨빅션 같은 추가 요건을 걸기 때문에 두 명단은 달라질 수 있습니다. 매수 주문이 아니라 리서치 후보 명단입니다.',
        related: ['band', 'watchlist', 'margin-of-safety'],
    },
    watchlist: {
        term: 'Watchlist(워치리스트)',
        plain: '상위 10% — 강한 근거가 있고 주시할 가치가 있습니다.',
        definition:
            '두 번째 등급(90~97백분위). 강한 근거가 있으며 Research Now 컷에 조금 못 미칩니다. 여기 있는 종목은 주시할 가치가 있고 종종 승격됩니다.',
        related: ['band', 'research-now'],
    },
    monitor: {
        term: 'Monitor(모니터)',
        plain: '상위 30% — 합리적이지만 특별하지는 않은 근거입니다.',
        definition:
            '세 번째 등급(70~90백분위). 나쁘지 않지만 눈에 띄지 않는 점수입니다. 리서치 시간의 우선순위는 낮습니다.',
        related: ['band'],
    },
    pass: {
        term: 'Pass(패스)',
        plain: '상위 30%에 들지 못한 나머지입니다.',
        definition:
            '약 70%의 종목이 상위 30%에 들지 못해 받는 기본 등급입니다. “나쁜 회사”라는 뜻이 아니라 오늘 당신의 관심을 받을 만한 근거가 충분하지 않다는 뜻입니다.',
        related: ['band'],
    },
    veto: {
        term: '베토(Veto)',
        plain: '점수가 아무리 좋아도 자동 탈락입니다.',
        definition:
            '채점 전에 적용되는 하드 디스퀄리파이어입니다. 종합 점수와 무관한 레드칩입니다. 역설계 엔진의 안전 검사를 통과하지 못하거나, 재무 포렌식 알람 두 개(Beneish + 발생액)가 동시에 울리거나, 과잉 주식 발행, 또는 AI의 강한 회피/매도가 이유입니다. 이유가 칩에 적혀 있습니다.',
        related: ['forensic', 'beneish', 'dilution'],
    },
    haircut: {
        term: '안전 할인(Safety haircut)',
        plain: '취약함이나 데이터 누락에 대해 점수에 매기는 곱셈 할인입니다.',
        definition:
            '순위 결정 후 종합 점수에 적용되는 페널티입니다. 생존 가능성 = 0.7 + 0.3×(생존가능성/100), 데이터 품질 = min(1, 0.8 + 0.04×데이터품질), 포렌식 = Beneish 또는 발생액 알람 하나만 울렸을 때 0.85. 결과는 다시 순위가 매겨집니다. 할인은 점수를 줄이지만 베토는 아닙니다.',
        related: ['composite', 'veto', 'forensic'],
    },

    // ── 포트폴리오·포지션 ───────────────────────────────────────────────
    kelly: {
        term: '켈리 기준(Kelly criterion)',
        plain: '엣지가 주어졌을 때 수학적으로 “올바른” 베팅 크기를 구하는 공식입니다.',
        definition:
            '고전적 자금관리 공식입니다. 엣지를 분산으로 나눈 비율만큼 자본의 일부를 베팅합니다(f = edge / variance). 이 사이트는 쿼터-켈리(그 값의 0.25배), 상한 5%를 사용합니다. 실제 불확실성에서는 풀 켈리가 너무 공격적이므로 의도적으로 보수적으로 갑니다.',
        related: ['edge', 'position-sizing', 'annualized-volatility'],
    },
    edge: {
        term: '엣지(Edge)',
        plain: '예상 우위 — 여기서는 기대치 격차가 좁혀지는 것입니다.',
        definition:
            '이 시스템에서 엣지는 약 3년에 걸쳐 기대치 격차가 좁혀지는 것(시장이 입증된 성장보다 싸게 매겨진 종목을 재평가하는 것)으로 추정됩니다. 입증된 성장보다 싸게 매겨진 종목만 측정 가능한 엣지를 가지므로, 순위는 높지만 비싼 종목은 “켈리 엣지 없음”으로 건너뜁니다.',
        related: ['expectations-gap', 'kelly'],
    },
    'position-sizing': {
        term: '포지션 크기(Position sizing)',
        plain: '각 종목에 자본을 얼마나 넣을지 결정하는 것입니다.',
        definition:
            '후보 명단을 포트폴리오로 바꾸는 수학입니다. 쿼터-켈리 크기, 종목당 상한 5%, 포렌식 플래그가 있으면 반값, 지정학적 리스크와 내부자 매도가 있으면 축소, 섹터(25%)·테마(30%) 상한. 나머지는 현금으로 남습니다.',
        related: ['kelly', 'sector-cap', 'theme-cap'],
    },
    'sector-cap': {
        term: '섹터 상한(Sector cap)',
        plain: '한 섹터가 포트폴리오에서 차지할 수 있는 비중의 상한입니다.',
        definition:
            '단일 섹터를 포트폴리오의 25%로 제한하는 리스크 규칙으로, 계획이 위장된 단일 업종 베팅이 되지 않게 합니다. 테마 집중도는 마찬가지로 30%로 제한됩니다.',
        related: ['position-sizing', 'theme-cap'],
    },
    'theme-cap': {
        term: '테마 상한(Theme cap)',
        plain: '한 과열 테마가 포트폴리오에서 차지할 수 있는 비중의 상한입니다.',
        definition:
            '단일 테마를 포트폴리오의 30%로 제한하는 리스크 규칙입니다. 점수가 좋은 종목이 얼마나 많든 하나의 서사(AI, 바이오 등)에 계획이 몰리는 것을 막습니다.',
        related: ['position-sizing', 'sector-cap', 'theme'],
    },
    cash: {
        term: '현금(계획 내)',
        plain: '투자되지 않은 자본 — 버그가 아니라 특징입니다.',
        definition:
            '추천 계획에서 배치되지 않은 부분입니다. 밸류 코어는 측정 가능한 엣지가 있는 종목만 사고 과대평가를 거부하므로 의도적으로 약 50% 현금을 유지합니다. 현금은 보호입니다. 모든 것을 맞힐 필요가 없고, 저가 매수 기회가 왔을 때 쓸 탄약이 있다는 뜻입니다.',
        related: ['edge', 'kelly'],
    },
    'book-value': {
        term: '장부가(Book value)',
        plain: '포트폴리오에 투자된 자본의 회계적 가치입니다.',
        definition:
            '계획의 원가 기준/자본 기반입니다. 상한과 슬리브 비중은 장부가 대비 %로 표현됩니다(예: 퀄리티 슬리브는 장부가의 약 35%로 제한).',
        related: ['sleeve'],
    },
    sleeve: {
        term: '퀄리티 슬리브(Quality sleeve)',
        plain: '하이브리드 계획의 추가 버킷 — 가격과 무관하게 최상위 종목을 매수합니다.',
        definition:
            '하이브리드(plan2) 포트폴리오의 일부입니다. 켈리 밸류 코어 위에, 밸류에이션 격차와 무관하게 최상위 순위 종목을 장부가의 약 35% 상한까지 매수합니다. 이렇게 해서 밸류 코어가 거부한 비싼 리더(TSM, GOOGL, MU)를 보유하고 유휴 현금을 굴립니다. 슬리브 행은 핑크색으로 표시됩니다.',
        related: ['book-value', 'cash', 'plan'],
    },
    'macro-derisk': {
        term: '매크로 디리스킹(Macro de-risk)',
        plain: '연준 경고등이 켜지면 모든 포지션 크기가 절반이 됩니다.',
        definition:
            '연준 데이터로 만든 매크로 플래그를 감시하는 규칙입니다. 플래그가 2개 이상 동시에 켜지면 모든 추천 포지션 크기를 자동으로 절반으로 줄여 악화되는 매크로 환경에 대한 노출을 낮춥니다.',
        related: ['macro-flags', 'position-sizing'],
    },
    'macro-flags': {
        term: '매크로 플래그',
        plain: '미 연준(Fed) 데이터에서 나온 경고등입니다.',
        definition:
            'FRED(연준) 데이터에서 파생된 신호입니다(수익률곡선, 성장 지표 등). 포트폴리오 탭에 “Macro flags: …”로 표시되며, 2개 이상 켜지면 매크로 디리스킹이 모든 크기를 절반으로 줄입니다.',
        related: ['macro-derisk', 'fred'],
    },
    plan: {
        term: 'Plan(밸류 코어)',
        plain: 'Research Now 명단에서 만든 추천 배분입니다.',
        definition:
            'Research Now 명단에서 기계가 만든 배분입니다(당신의 포트폴리오가 아닙니다). 밸류 코어는 쿼터-켈리 크기, 입증된 성장보다 싸게 매겨진 종목만 매수, 섹터/테마 상한을 지키고 약 50% 현금을 유지합니다. 결정 지원이지 매매가 아닙니다.',
        related: ['kelly', 'sleeve', 'cash'],
    },
    plan2: {
        term: 'Plan2(하이브리드)',
        plain: '밸류 코어 + 리더를 보유하는 퀄리티 슬리브입니다.',
        definition:
            '하이브리드 변형입니다. 같은 켈리 밸류 코어에, 밸류에이션 격차와 무관하게 최상위 종목을 사는 퀄리티 슬리브(장부가 약 35% 상한)를 더해 비싼 리더를 잡고 현금을 더 굴립니다(약 78% 투자). 트레이드오프: 리더 노출이 늘고 밸류 원칙은 약해지며, 침체에서 더 크게 내려앉습니다.',
        related: ['sleeve', 'plan', 'drawdown'],
    },
    'paper-trading': {
        term: '페이퍼트레이딩',
        plain: '실제 돈 없이 규칙대로 거래하되, 기록은 진짜로 남깁니다.',
        definition:
            '시스템이 매일 자기 추천 종목을 실제 가격과 실제 거래비용으로 사고팔았다고 가정하며, 기록은 추가 전용이라 편집할 수 없습니다. 정직한 척도입니다. 기계가 틀렸다면 트랙 레코드 페이지가 공개적으로, 영구적으로 그렇게 말합니다.',
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
        plain: '계획에서 이탈해 잃는 수익입니다.',
        definition:
            '규율 있는 모델이 버는 수익과 당신이 실제로 버는 수익의 차이로, 당신 자신의 결정(너무 일찍 매도, 추격, 엑시트 무시) 때문에 생깁니다. 트랙 레코드에서 “mine이 plan을 하회”하는 것이 행동 격차이며, 실제 돈으로 공개 측정됩니다.',
        related: ['track-record', 'mine', 'plan'],
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
            '포트폴리오의 역대 최고점에서 이후 최저점까지의 하락률(%)입니다. 30% 드로다운은 최악의 시점에 고점 대비 30%를 잃었다는 뜻입니다. 리스크의 “고통” 측면이며, 하이브리드(plan2)는 침체에서 더 크게 내려앉는 경향이 있습니다.',
        related: ['plan2', 'volatility', 'sharpe-ratio'],
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
        plain: '시스템 자체 페이퍼 트레이드의 정직하고 편집 불가능한 성적표입니다.',
        definition:
            '네 개 포트폴리오(plan, plan2, equal, mine)를 실제 가격과 거래비용으로 매일 페이퍼트레이딩하고 추가 전용으로 기록하는 탭입니다. 아첨하는 백테스트 대신, 기계가 실제로 한 일(실수 포함)의 영구적 공개 기록입니다.',
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
            '세인트루이스 연방준비은행의 미국 경제 시계열 무료 데이터베이스입니다. 디리스킹을 촉발하는 매크로 플래그 뒤의 매크로 시계열을 공급합니다.',
        related: ['macro-flags', 'macro-derisk'],
    },
    'github-actions': {
        term: 'GitHub Actions',
        plain: '전체 파이프라인을 매일 다시 실행하는 클라우드 자동화입니다.',
        definition:
            '데이터 수집, 채점 체인, 페이퍼트레이딩 원장을 일정에 따라 자동 실행하는 CI/CD 서비스입니다. AI 분석 작업 요청 시 트리거하기도 합니다. 전체 파이프라인은 매일 다시 돌고, IC 드리프트 보고서는 매월 재계산됩니다.',
        related: ['pipeline'],
    },
    pipeline: {
        term: '파이프라인(Pipeline)',
        plain: '원시 데이터를 순위표로 바꾸는 일련의 명령 체인입니다.',
        definition:
            '엔드투엔드 과정입니다. 재무·주가 수집 → 재무 이력 구축 → 역설계 엔진 → 팩터 채점 → 포트폴리오 계획 → 전방 성과 측정. 오케스트레이터가 순서와 데이터 무결성 검사를 강제해 낡거나 부분적인 데이터가 조용히 순위를 망치지 못하게 합니다.',
        related: ['github-actions', 'reverse-engine'],
    },
    'reverse-engine': {
        term: '역설계 엔진(Reverse engine)',
        plain: '팩터 랩이 그 위에 세워지는 1차 안전·퀄리티 엔진입니다.',
        definition:
            '각 종목의 아키타입(A–F)을 분류하고 생존 가능성과 데이터 품질을 채점하며 재무 포렌식 플래그를 계산하는 채점 단계입니다. 후보를 지명하고, 역산 DCF 모델과 함께 팩터 랩이 소비하는 안전 입력과 입증된 성장률을 만듭니다.',
        related: ['pipeline', 'reverse-dcf', 'forensic'],
    },

    // ── 오버레이·포렌식 ─────────────────────────────────────────────────
    gpr: {
        term: 'GPR(지정학적 노출)',
        plain: '기업의 지정학적 노출도를 나타내는 0–3 태그입니다.',
        definition:
            '기업의 실제 사업 프로필(매출 지역, 공급망, 규제, 제재)에서 태깅한 지정학적 리스크입니다. 매수/매도 신호가 절대 아닙니다. 대신 레벨 3에서는 추천 포지션 크기를 줄이고 더 큰 안전마진을 요구합니다.',
        related: ['overlay', 'position-sizing'],
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
            '회사가 신주를 발행하면 기존 주식 한 주가 파이에서 차지하는 조각이 줄어듭니다. 과잉 발행은 재무 포렌식 플래그이며 하드 베토가 될 수 있습니다(발행이 예상되는 자금조달 방식인 아키타입, 예: 은행과 일부 금융사는 예외).',
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
        plain: '점수 위에 얹히는 추가 맥락 태그입니다.',
        definition:
            'GPR(지정학적 노출)과 ▲/▼ INSIDERS(정보 수요) 같은 비채점 신호입니다. 종합 점수에 절대 더해지지 않습니다. 포지션을 줄이거나, 더 큰 안전마진을 요구하거나, 논제를 의심하게 합니다.',
        related: ['gpr', 'informed-demand'],
    },
    theme: {
        term: '테마(Theme)',
        plain: '과열 카테고리(AI, 바이오…) — 맥락일 뿐, 채점 팩터가 아닙니다.',
        definition:
            '종목이 속한 시장 서사입니다(예: AI, 반도체, 바이오). 테마 소속은 방향 잡기와 크라우딩(과열) 경고용으로 함께 보여주지만 점수에 절대 더해지지 않습니다. 순진한 테마 노출은 역사적으로 가치를 파괴했기 때문입니다(전문 테마 ETF 평균 연 −3.1%).',
        related: ['theme-cap', 'composite'],
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
};
