'use client';

// ─────────────────────────────────────────────────────────────────────────────
// /help — 한국어 본문 (Korean body)
//
// The Korean-language version of the handbook sections (welcome → data).
// Rendered by page.tsx when the site language is Korean. The <Term> links and
// glossary popups are fully localized via lib/glossary-ko.ts.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { BookMarked, FlaskConical } from 'lucide-react';
import { Term } from '@/components/GlossaryTerm';
import { Section, SubHeading, Callout } from './help-ui';
import { PipelineDiagram, AiAnalysisFlow } from './WorkflowDiagram';

export function KoreanHelpBody() {
    return (
        <>
            {/* 소개 */}
            <Section id="welcome" title="소개 — 이 사이트가 무엇이고(아닌 것)" icon={<FlaskConical className="h-5 w-5" />}>
                <p>
                    매일 컴퓨터 한 대가 <b>약 6,600개 미국 주식</b>의 재무 보고서와 주가 이력을 읽고 하나의
                    리더보드에 순위를 매깁니다. 리더보드 상단 = 그 종목에 유리한 근거가 가장 많다는 뜻입니다.
                    그게 전부입니다. 이 핸드북은 그 근거가 정확히 어떻게 만들어지는지, 화면의 모든 숫자와 칩이
                    무엇을 뜻하는지, 그리고 이 시스템이 의도적으로 <i>하지 않는</i> 일을 설명합니다.
                </p>
                <Callout kind="warn">
                    <b>여기서는 아무것도 사고팔지 않으며, 어떤 것도 재정적 조언이 아닙니다.</b> 근거를 보여주는
                    리서치 후보 명단입니다. 즉 6,600개 종목을 <i>당신의</i> 리서치 시간을 쓸 가치가 있는
                    후보로 좁히는 기계입니다. 페이퍼 포트폴리오에서조차 실제 매매는 일어나지 않습니다(정직하게,
                    실제 가격과 실제 비용으로 시뮬레이션됩니다).
                </Callout>
                <p>
                    <span className="border-b border-dotted border-emerald-400/60 font-semibold text-emerald-300">점선 밑줄</span>이
                    있는 단어는 기술 용어입니다. 클릭하면 페이지를 떠나지 않고 뜻을 볼 수 있습니다. 모든 용어의
                    검색 가능한 색인은 <Link href="#glossary" className="font-bold text-emerald-300 hover:underline">용어 사전 섹션</Link>에
                    있습니다.
                </p>
            </Section>

            {/* 파이프라인 */}
            <Section id="pipeline" title="매일 무슨 일이 일어나는가 — 파이프라인" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    화면 뒤에는 일련의 명령 체인이 있으며 <Term term="github-actions" />으로 매일 자동 재실행됩니다.
                    오케스트레이터가 순서를 강제하고 데이터 무결성을 검사해 낡거나 부분적인 데이터가 조용히
                    순위를 망치지 못하게 합니다.
                </p>
                <PipelineDiagram />
                <AiAnalysisFlow />
                <p>
                    모든 것은 <Term term="point-in-time" />입니다. 각 기록 신호는 그 시점에 존재했던 정보만
                    사용합니다. 이 원칙이 트랙 레코드를 신뢰할 수 있게 만듭니다.
                </p>
            </Section>

            {/* 리더보드 */}
            <Section id="leaderboard" title="리더보드 읽는 법 — Rankings 탭" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    Rankings 탭은 전체 유니버스를 하나의 숫자, 즉 <Term term="composite" />로 순위를 매긴 표입니다.
                    각 열의 의미는 다음과 같습니다.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>Rank(순위)</b> — 채점된 약 6,600개 미국 종목 리더보드에서의 오늘 위치. #1이 지금 가장 강한 종합 근거를 가집니다.</li>
                    <li>
                        <b>Composite(종합 점수)</b> — 모든 것을 순위 매기는 숫자(0–100). 다섯 팩터 점수를 각각{' '}
                        <Term term="sector-neutral" /> 비교군 내에서 합친 뒤 안전 <Term term="haircut" />을 적용합니다.
                        높을수록 유리한 근거가 많습니다.
                    </li>
                    <li><b>Factor mix(팩터 구성)</b> — 이 종목의 점수를 무엇이 만들었는지. 초록=밸류, 파랑=퀄리티, 주황=모멘텀, 보라=저변동성, 분홍=리비전. 길수록 기여가 큽니다.</li>
                    <li>
                        <b>Band(등급)</b> — 순위의 실질적 의미(<Term term="research-now" />, <Term term="watchlist" />,{' '}
                        <Term term="monitor" />, <Term term="pass" />). 레드칩은 <Term term="veto" />된 종목입니다. 이유가 칩에 적혀 있습니다.
                    </li>
                    <li><b>Market cap(시가총액)</b> — <Term term="market-cap" />. 기업 전체의 가격(주가 × 주식 수).</li>
                    <li><b>RS2 순위 / 스탠스 / 컨빅션 / 액션</b> — 독립적인 AI 판단. <Link href="#rs2" className="font-bold text-emerald-300 hover:underline">RS2 섹션</Link> 참조.</li>
                    <li><b>Δ pctl</b> — 퀀트 엔진과 AI가 백분위 몇 포인트만큼 다른지. 큰 격차가 흥미로운 행입니다. 둘 중 하나는 틀렸다는 뜻입니다.</li>
                    <li><b>DCF gap</b> — <Term term="expectations-gap" />. 가격이 요구하는 성장률 대비 기업이 실제로 달성한 성장률. <Link href="#dcf" className="font-bold text-emerald-300 hover:underline">DCF 섹션</Link> 참조.</li>
                </ul>
                <Callout kind="info">
                    아무 행이나 클릭하면 종목 상세를 볼 수 있습니다. 전체 팩터 프로필, 역산 DCF 판단(가격이 암시하는
                    성장 vs 기업이 입증한 성장), 그리고 RS2 로컬-LLM 리서치와 판단.
                </Callout>
            </Section>

            {/* 팩터 */}
            <Section id="factors" title="다섯 가지 팩터 — 점수의 재료" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    각 종목은 역사적으로 수익률을 예측해 온 다섯 가지 특성으로 채점됩니다. 핵심적으로, 모든 평가는{' '}
                    <Term term="sector-neutral" />입니다. 슈퍼마켓은 슈퍼마켓끼리 경쟁하며 소프트웨어 기업과 비교하지
                    않습니다. 그렇지 않으면 “모멘텀이 높다”가 그냥 “기술주다”가 되어 버립니다.
                </p>
                <div className="space-y-3">
                    <div className="rounded-lg border border-border/60 bg-secondary/10 p-3">
                        <p className="flex items-center gap-2 text-sm font-black"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /><span className="text-emerald-300">밸류(Value)</span></p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/90">
                            연간 현금이익 1달러당 2달러를 사는가, 2달러당 1달러를 사는가? 장기 평균적으로 저렴한 것이
                            비싼 것보다 낫습니다. <Term term="fcf-yield" />, <Term term="owner-earnings" />,{' '}
                            <Term term="ebit" />, <Term term="earnings-yield" /> 네 가지 수익률의 평균으로 측정합니다.
                            자세한 것은 <Link href="#methodology" className="font-bold text-emerald-300 hover:underline">방법론</Link> 참조.
                        </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-secondary/10 p-3">
                        <p className="flex items-center gap-2 text-sm font-black"><span className="h-2.5 w-2.5 rounded-full bg-sky-400" /><span className="text-sky-300">퀄리티(Quality)</span></p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/90">
                            기업이 꾸준히 진짜 돈을 벌고, 회계가 깨끗한가? <Term term="revenue-quality" />, 수년간의{' '}
                            <Term term="gross-margin" /> 안정성, <Term term="accruals" />(현금이 뒷받침된 이익 선호),{' '}
                            <Term term="piotroski" />, <Term term="roic" />를 결합합니다. 스토리가 아닌, 이익을 내고
                            회계가 정직한 사업이 이깁니다.
                        </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-secondary/10 p-3">
                        <p className="flex items-center gap-2 text-sm font-black"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="text-amber-300">모멘텀(Momentum)</span></p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/90">
                            지난 1년간 주가가 이기고 있었나? 이긴 주식은 한동안 계속 이기는 경향이 있습니다.{' '}
                            <Term term="skip-month" />(학계 표준 12개월 수익률, 최근 달 제외)과 <Term term="high-proximity" />로
                            구성됩니다. 최근 달을 빼는 이유는 <Term term="reversal" /> 참조.
                        </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-secondary/10 p-3">
                        <p className="flex items-center gap-2 text-sm font-black"><span className="h-2.5 w-2.5 rounded-full bg-violet-400" /><span className="text-violet-300">저변동성(Low volatility)</span></p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/90">
                            주가가 잔잔하게 움직이는가, 격렬하게 움직이는가? 잔잔한 주식이 역사적으로 고통 대비 더 많은
                            수익을 냈습니다. 월간 수익률의 표준편차(최소 12개 관측치)의 마이너스로 측정합니다.{' '}
                            <Term term="annualized-volatility" />는 <Term term="kelly" /> 포지션 크기에도 내보내집니다.
                        </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-secondary/10 p-3">
                        <p className="flex items-center gap-2 text-sm font-black"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /><span className="text-rose-300">리비전(Revisions)</span></p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/90">
                            애널리스트들이 전망을 올리고 있는가 내리고 있는가? 방향이 중요합니다. 정규화된{' '}
                            <Term term="eps-trajectory" /> 기울기와 구조화된 <Term term="estimates" /> 점수로 구성됩니다.
                        </p>
                    </div>
                </div>
                <SubHeading>왜 모든 재료가 똑같이 중요할까</SubHeading>
                <p>
                    <Term term="factor" /> 10종 경기를 심사한다고 생각해 보세요. 어느 종목이 가장 중요한지 추측할 수도
                    있지만, 수십 년 연구는 그런 추측이 역효과를 낸다고 보여줍니다. 과거 데이터에서 찾은 “완벽한”
                    가중치는 미래 데이터에서 거의 작동하지 않습니다. 그래서 다섯 재료는 정확히 동일하게 반영됩니다
                    (<Term term="equal-weight" />). 지루하고 겸손하지만 더 잘 작동합니다. 이 사이트는 여전히 각
                    팩터의 예측력을 <Term term="rank-ic" />로 매달 진단합니다. 다만 짧은 표본이 엔진을 조종하게
                    두지는 않습니다.
                </p>
                <Callout kind="tip">
                    누락된 팩터가 조용히 종목을 망치지는 않습니다. 밸류·퀄리티·모멘텀 중 하나가 없으면 해당 종목은
                    부분 데이터로 채점하는 대신 <i>팩터 불충분(insufficient factors)</i>으로 표시됩니다. 필수 아닌
                    팩터가 없으면 나머지 가중치가 재정규화되어 종합 점수가 비교 가능하게 유지됩니다.
                </Callout>
            </Section>

            {/* 등급·베토·할인 */}
            <Section id="bands" title="등급, 베토 & 안전 할인" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    종합 백분위는 네 개의 실용적인 <Term term="band" />로 잘립니다.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><span className="font-black text-emerald-300">RESEARCH NOW</span> — 상위 3%. 오늘 리서치할 가치가 있습니다.</li>
                    <li><span className="font-black text-sky-300">WATCHLIST</span> — 상위 10%.</li>
                    <li><span className="font-black text-amber-300">MONITOR</span> — 상위 30%.</li>
                    <li><span className="text-muted-foreground">PASS</span> — 나머지.</li>
                </ul>
                <SubHeading>베토 — 하드 디스퀄리파이어</SubHeading>
                <p>
                    점수가 아무리 좋아도 탈락하는 종목이 있습니다. 사진은 아름다운데 구조검사에서 탈락한 집과
                    같습니다. <Term term="veto" />는 채점 전에 적용되므로 베토된 종목은 종합 점수가 아예 없습니다.
                    이유는 역설계 엔진의 안전 검사 탈락(<i>reverse_engine_reject</i>), 재무 포렌식 알람 두 개 동시
                    발생(<Term term="beneish" /> + 높은 <Term term="accruals" />), <Term term="dilution" />으로 인한
                    과잉 주식 발행, 또는 (AI 렌즈에서) 강한 회피/매도 판단입니다. 이유가 레드칩에 적혀 있습니다.
                </p>
                <SubHeading>안전 할인</SubHeading>
                <p>
                    원시 점수와 최종 순위 사이에 세 가지 곱셈 <Term term="haircut" />이 적용됩니다. <b>생존 가능성</b> =
                    0.7 + 0.3 × (생존가능성/100), <b>데이터 품질</b> = min(1, 0.8 + 0.04 × dq), <b>포렌식</b> =
                    Beneish 또는 발생액 알람이 하나만 울렸을 때 0.85(둘 다 울리면 할인이 아니라 베토). 결과는 다시
                    순위가 매겨져, 취약하거나 수상한 종목이 퇴출되지 않고 순위만 내려갑니다.
                </p>
            </Section>

            {/* DCF */}
            <Section id="dcf" title="기대치 격차 — 가격이 조용히 약속하는 것" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    모든 주가는 미래 성장에 대한 약속을 내포합니다. <Term term="reverse-dcf" />가 그 약속을 숫자로
                    꺼냅니다. 즉 시장이 당신에게 청구하는 <Term term="implied-growth" />를, 표준 <Term term="dcf" />가
                    현재 가격과 같아지는 성장률을 <Term term="bisection" />으로 풀어서 구합니다.
                </p>
                <p>
                    <b>DCF gap</b> 열은 그 약속을 현실과 비교합니다. <Term term="implied-growth" /> −{' '}
                    <Term term="demonstrated-growth" />(SEC 제출 기준 최근 5년 매출/FCF 성장), 퍼센트 포인트 단위.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><span className="font-black text-emerald-300">초록 / 마이너스</span> — 가격이 기업이 입증한 것보다
                    적은 성장을 약속합니다. 잠재적 저가 매수입니다. 성장 스토리를 믿지 않아도 보상받습니다.</li>
                    <li><span className="font-black text-amber-300">주황 / 플러스</span> — 가격이 아무도 입증하지 못한
                    가속을 요구합니다. 스토리를 믿어야 합니다.</li>
                </ul>
                <Callout kind="tip">
                    격차는 추천 계획이 쓰는 <Term term="edge" />이기도 합니다. 입증된 성장보다 싸게 매겨진 종목만 측정
                    가능한 엣지를 가지므로, 순위는 높지만 비싼 종목은 “켈리 엣지 없음”으로 건너뜁니다.
                </Callout>
            </Section>

            {/* 렌즈 */}
            <Section id="lens" title="렌즈 — 어떤 눈으로 보는가" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    Rankings 탭 상단의 하나의 스위치가 누구의 순위를 보는지 결정합니다.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>Quant(퀀트)</b> — 결정론적 팩터 엔진. 재무제표와 주가에 대한 순수 수학. AI 없음. 원래의 변하지 않은 화면입니다.</li>
                    <li><b>RS2 LLM</b> — 로컬 AI 애널리스트의 명단. 각 기업의 실제 서류를 읽고 독립 판단을 씁니다.</li>
                    <li><b>Compare(비교)</b> — 둘을 나란히, 가장 큰 불일치부터. 종목별 불일치 백분위(Δ pctl)를 계산하며, 큰 격차는 한 엔진이 틀린 곳입니다.</li>
                </ul>
                <p>
                    AI는 퀀트 등급이 설정된 <i>뒤에</i> 적용됩니다. 승격, 강등, 또는 베토를 할 수 있어 별도의 순위가
                    만들어집니다. 퀀트 기준선은 덮어쓰지 않으므로 두 명단을 모두 볼 수 있습니다.
                </p>
            </Section>

            {/* RS2 */}
            <Section id="rs2" title="RS2 — AI의 두 번째 소견" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    RS2는 <Term term="llm" />으로 각 기업의 실제 SEC 서류를 읽고 독립적인 판단을 씁니다. 두 번째
                    의사의 소견을 받는 것과 같습니다. 각 종목에 대해 다음을 만듭니다.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><Term term="stance" /> — 저평가 / 공정 / 과대평가(색깔 알약).</li>
                    <li><Term term="conviction" /> — 자신의 판단에 대한 확신도, 0–15.</li>
                    <li><Term term="action" /> — 매수 / 보유 / 축소 / 회피… 리서치용 의견이지 주문이 아닙니다.</li>
                    <li>
                        자체 DCF 판단. 그 <Term term="intrinsic-value" />는 애널리스트 컨센서스 밴드에 고정되고{' '}
                        <Term term="present-value" />로 되돌려집니다. 그래서 <Term term="margin-of-safety" />가 12개월
                        목표가가 아니라 <i>오늘</i>의 저렴함을 측정합니다.
                    </li>
                </ul>
                <SubHeading>AI Research Now 관문</SubHeading>
                <p>
                    AI의 Research Now 명단은 RS2의 구조화된 신호 — 안전마진과 진입 타이밍 — 를 기준으로 두 단계로
                    걸러집니다. <b>딥밸류</b>(MoS ≥ 30%)는 어떤 컨빅션이든 Research Now가 되고, <b>중간 밸류</b>
                    (MoS ≥ 15%, 또는 진짜 새 매수)는 추가로 컨빅션 ≥ 9.5가 필요합니다. 약세 판단은 Research Now에서
                    강등되고, 강한 회피/매도는 베토됩니다.
                </p>
                <p>
                    종목이 퀀트 Research Now 명단을 떠나면 RS2가 <Term term="exit-review" />를 씁니다. 기존 보유자를
                    위한 보유/축소/매도 판단이며 주황색 “LLM EXIT” 칩으로 표시됩니다.
                </p>
            </Section>

            {/* 트랙 레코드 */}
            <Section id="track" title="트랙 레코드 — 정직한 측정기" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    아첨하는 <Term term="backtest" /> 대신, 시스템은 매일 자기 추천을 실제 가격과 실제{' '}
                    <Term term="transaction-costs" />로 <Term term="paper-trading" />하며 기록은 추가 전용이라 편집할
                    수 없습니다. 기계가 틀렸다면 이 페이지가 공개적으로, 영구적으로 그렇게 말합니다. 그게 핵심입니다.
                </p>
                <SubHeading>포트폴리오</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b className="text-emerald-300">plan</b> — 밸류 코어. <Term term="kelly" /> 크기, 약 50% 현금.</li>
                    <li><b className="text-pink-400">plan2</b> — 하이브리드. 밸류 코어 + <Term term="sleeve" />, 약 78% 투자, 비싼 리더 보유.</li>
                    <li><b className="text-sky-300">equal</b> — 모든 Research Now 종목을 동일 가중(순수 종목 선정 테스트).</li>
                    <li><b className="text-violet-300">mine</b> — 당신의 저장된 My Portfolio 보유 종목. <Term term="unitization" />으로 펀드처럼 측정.</li>
                </ul>
                <SubHeading>읽는 법</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>plan vs plan2</b> — plan2가 이기면 이 기간 퀄리티 리더에 돈을 지불하는 것이 밸류 원칙을 이긴 것. plan이 이기면 원칙(과 현금)이 효과가 있었던 것.</li>
                    <li><b>plan vs equal</b> — plan이 이기면 포지션 크기 기계가 가치를 더한 것.</li>
                    <li><b>equal vs IWM</b> — 픽이 소형주 <Term term="benchmark" />를 이기면 종목 선정 자체가 작동하는 것.</li>
                    <li><b>mine vs plan</b> — 당신의 이탈이 돈을 잃게 합니다. 그것이 <Term term="behavior-gap" />입니다.</li>
                    <li><b>“너무 일찍 판매” 플래그</b> — 팔았는데 계속 오른 종목. 이런 패턴이 반복되면 엑시트 규칙을 고쳐야 합니다.</li>
                </ul>
                <p>
                    <Term term="sharpe-ratio" />와 <Term term="cagr" />은 충분한 실측 일수가 쌓인 뒤에만 나타납니다.
                    초기에는 이 페이지가 의도적으로 밋밋합니다. 왓-이프 오버레이로 모든 거래를 당신의 수수료율로
                    재계산해 수수료의 마찰을 볼 수 있습니다.
                </p>
            </Section>

            {/* 포트폴리오 */}
            <Section id="portfolio" title="포트폴리오 — 크기 조절과 추천 계획" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    포트폴리오 탭에는 서로 다른 두 부분이 있습니다. 라벨을 주의 깊게 읽으세요.
                </p>
                <SubHeading>My Portfolio(상단) — 당신의 실제 보유</SubHeading>
                <p>
                    실제 보유 종목을 입력하세요(이 브라우저에만 저장). 각각을 모델과 대조해 쿼터-<Term term="kelly" />
                    추천 크기, 과대/과소 비중 판단, 그리고 보유 종목이 <Term term="veto" />되거나 커버리지 밖이면 큰
                    플래그를 표시합니다. 트랙 레코드의 “mine” 원장은 이것을 펀드처럼 유니타이즈해 사용합니다.
                </p>
                <SubHeading>추천 계획(하단) — 당신의 포트폴리오가 아닙니다</SubHeading>
                <p>
                    Research Now 명단에서 기계가 만든 배분이며 <b>밸류 코어 / 하이브리드</b> 토글이 있습니다.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>밸류 코어(plan)</b> — 쿼터-켈리 크기. <Term term="edge" /> = 약 3년에 걸쳐 기대치 격차가
                        좁혀지는 것, 리스크 = <Term term="volatility" />, f = 0.25 × 엣지/리스크², 상한 5%.{' '}
                        <Term term="forensic" /> 플래그가 있으면 반값, GPR 2–3과 내부자 매도가 있으면 축소, 섹터 25% /
                        테마 30% 상한, 나머지는 <Term term="cash" />(종종 약 50%).
                    </li>
                    <li>
                        <b>하이브리드(plan2)</b> — 같은 밸류 코어에 밸류에이션 격차와 무관하게 최상위 종목을 사는{' '}
                        <Term term="sleeve" />(<Term term="book-value" />의 약 35% 상한)를 더해 코어가 거부한 비싼
                        리더를 보유하고 유휴 현금을 굴립니다(약 78% 투자). 슬리브 행은 핑크색입니다.
                    </li>
                </ul>
                <Callout kind="warn">
                    왜 둘일까? 밸류 코어는 침체에서 당신을 보호하고(과대평가를 사지 않음) 급등장에서는 뒤처집니다.
                    하이브리드는 리더를 잡지만 더 크게 내려앉습니다(더 큰 <Term term="drawdown" />). 트랙 레코드가 둘의
                    실제 성과를 보여줍니다.
                </Callout>
                <SubHeading>매크로 디리스킹</SubHeading>
                <p>
                    <Term term="macro-flags" />는 <Term term="fred" /> 데이터에서 나온 경고등입니다. 2개 이상 켜지면
                    모든 추천 크기가 자동으로 절반이 됩니다(<Term term="macro-derisk" />). 탭에 큰 주황 배너로 표시됩니다.
                </p>
            </Section>

            {/* 오버레이 */}
            <Section id="overlays" title="오버레이 칩과 재무 포렌식" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    오버레이는 점수에 더해지지 않는 맥락 <i>칩</i>입니다. 포지션을 줄이거나, 더 큰 안전마진을 요구하거나,
                    논제를 의심하게 합니다.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>GPR 0–3</b> — <Term term="gpr" />. 기업의 실제 사업 프로필(매출 지역, 공급망, 규제, 제재)에서
                        태깅합니다. 매수/매도 신호가 절대 아니며, 레벨 3에서는 포지션을 줄이고 더 큰 안전마진을 요구합니다.
                    </li>
                    <li>
                        <b>▲/▼ INSIDERS</b> — <Term term="informed-demand" />. 공매도 세력이 물러나는 동안 내부자가
                        순매수(▲, 확인) 또는 높은 <Term term="short-interest" /> 속에서 내부자가 매도(▼, 논제 의심).
                        확인 또는 경고일 뿐입니다.
                    </li>
                </ul>
                <SubHeading>재무 포렌식 플래그</SubHeading>
                <p>
                    재무 포렌식 배터리 — <Term term="beneish" /> M-점수, Sloan <Term term="accruals" />, 순발행, 재무
                    배터리 — 가 계획 행에 표시되는 <Term term="forensic" /> 플래그를 만듭니다. 단일 알람은 0.85 할인,
                    둘이 동시에 울리면 <Term term="veto" />입니다.
                </p>
            </Section>

            {/* 테마 */}
            <Section id="themes" title="테마 — 팩터가 아닌 맥락" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    <Term term="theme" />는 종목이 속한 시장 서사입니다(AI, 반도체, 바이오 등). 테마 소속과 점수는{' '}
                    <b>방향 잡기</b>와 <b>크라우딩(과열) 경고</b>를 위해 함께 보여주지만 <b>종합 점수에 절대 더해지지
                    않습니다</b>.
                </p>
                <Callout kind="warn">
                    이는 의도적입니다. 순진한 테마 노출은 역사적으로 가치를 파괴했습니다. 전문 테마 ETF는 평균 연 −3.1%
                    (Ben-David et al. 2023). 이 사이트는 과열 서사가 조용히 점수를 부풀리게 두지 않습니다. 계획에서
                    테마는 30% 테마 상한으로 제한되어 하나의 과열 스토리가 전체를 차지하지 못하게 합니다.
                </Callout>
            </Section>

            {/* 방법론 */}
            <Section id="methodology" title="방법론 — 실무자용" icon={<BookMarked className="h-5 w-5" />}>
                <SubHeading>채점 파이프라인 — 정확한 메커니즘</SubHeading>
                <p>
                    유니버스: 역설계 엔진이 채점하는 모든 종목(약 6,600 미국 상장). 각 하위 지표는 <i>섹터 내</i>에서{' '}
                    <Term term="winsorize" />(1/99백분위) 후 섹터 내 <Term term="zscore" />. 팩터 z = 해당 팩터의
                    이용 가능한 하위 지표 평균. 종합 z = 이용 가능한 팩터의 가중치 재정규화 합(누락 팩터는 빠지고 남은
                    가중치가 재조정됩니다. 밸류·퀄리티·모멘텀은 <i>필수</i> — 하나라도 없으면 부분 데이터로 채점하지 않고{' '}
                    <i>insufficient_factors</i>로 표시).
                </p>
                <p>
                    종합 z → 횡단면 <Term term="percentile" />(0–100) → 세 가지 곱셈 <Term term="haircut" />(생존
                    가능성, 데이터 품질, 포렌식) → 재순위 → 최종 백분위가 <Term term="band" />를 정합니다. ≥97
                    research_now, ≥90 watchlist, ≥70 monitor, 그 외 pass.
                </p>
                <SubHeading>팩터 구성 — 하위 지표와 출처</SubHeading>
                <p>
                    <span className="font-black text-emerald-300">밸류</span> = 네 가지 수익률의 평균 z. 모두 최근
                    회계연도 SEC 제출 재무 대비 현재 시가총액으로 계산합니다. <Term term="fcf-yield" />(FCF/시총),{' '}
                    <Term term="owner-earnings" />((순이익 + 감가상각 − 설비투자)/시총), <Term term="ebit" /> 수익률
                    (영업이익/<Term term="enterprise-value" />), <Term term="earnings-yield" />(순이익/시총 — 커버리지가
                    가장 넓어 CAPEX·D&amp;A·영업이익 태그가 없는 기업을 구제).
                </p>
                <p>
                    <span className="font-black text-sky-300">퀄리티</span> = <Term term="revenue-quality" />(역설계
                    점수), <Term term="gross-margin" /> 안정성(≥4 회계연도 GM의 −표준편차), 마이너스{' '}
                    <Term term="accruals" />(−발생액 비율), <Term term="piotroski" />(둘 다 포렌식 배터리 출처).
                </p>
                <p>
                    <span className="font-black text-amber-300">모멘텀</span> = <Term term="skip-month" />과{' '}
                    <Term term="high-proximity" />의 평균 z. 월간 종가.
                </p>
                <p>
                    <span className="font-black text-violet-300">저변동성</span> = 월간 수익률의 −σ z, 최소 12개
                    관측치. <Term term="annualized-volatility" />는 종목별로 내보내 <Term term="kelly" /> 크기에
                    사용됩니다.
                </p>
                <p>
                    <span className="font-black text-rose-300">리비전</span> = 두 0–1 부분의 평균. 정규화된{' '}
                    <Term term="eps-trajectory" /> 기울기 (clamp(기울기, −1, 1)+1)/2, 그리고 애널리스트 구조 점수/100
                    — 0–100으로 스케일 후 (점수−50)/25로 z 유사 척도로 재중심화.
                </p>
                <SubHeading>가중치</SubHeading>
                <p>
                    동일 0.20 × 5(스킴 <code>equal_weight_robust5</code>). <Term term="rank-ic" />는 매달 측정되지만
                    드리프트 <i>진단</i>만 기록합니다. 측정 IC는 가중치를 조종하지 않습니다(DeMiguel, Garlappi &amp;
                    Uppal 2009: 추정 가중치는 표본 외에서 1/N을 거의 이기지 못함).
                </p>
                <SubHeading>역산 DCF — 정확한 방법</SubHeading>
                <p>
                    밸류에이션 모델은 표준 DCF가 현재 가격과 같아지는 성장률을 <Term term="bisection" />으로 풉니다.
                    그것이 시장이 청구하는 성장률입니다. <Term term="expectations-gap" />(“DCF gap”으로 표시) = 암묵
                    성장 − 입증된 성장. 입증 = SEC 제출 기준 최근 5년 매출/FCF 성장, 퍼센트 포인트. 역설계 엔진은 그
                    위에 아키타입(A–F) 분류와 생존 가능성/데이터 품질 채점을 얹어 팩터 랩이 소비하는 안전 입력을 만듭니다.
                </p>
                <SubHeading>베토 규칙(정확)</SubHeading>
                <p>
                    <b>reverse_engine_reject</b> = 역설계 등급 ∈ {'{'}Excluded, Reject, Reject-tier{'}'} ·{' '}
                    <b>forensic_pair</b> = Beneish M-점수 상승 AND 발생액 높음(단일 알람은 0.85 할인) ·{' '}
                    <b>heavy_issuance</b> = HEAVY_ISSUANCE 플래그, 발행이 예상 자금조달 방식인 아키타입 E/F는 예외.
                    AI 렌즈에서는 강한 회피/매도 판단도 베토(<code>llm_reject</code>).
                </p>
                <SubHeading>누락 데이터는 null — 조용히 안전하지 않음</SubHeading>
                <p>
                    옛 플레이스홀더 Z/M 점수는 사라졌습니다. 지표가 없으면 null이며, 채점 파이프라인은 그 종목을
                    불충분으로 표시하거나 데이터 품질 할인을 적용합니다. 공백이 조용히 합격으로 취급되지 않습니다.
                </p>
            </Section>

            {/* 검증 */}
            <Section id="validation" title="시스템은 어떻게 검증되는가" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    두 개의 독립적인 정직성 루프가 기계를 정직하게 유지합니다.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>전방 기록 신호</b> — 모든 팩터 신호는 만들어지는 순간 기록되고(<Term term="point-in-time" />,
                        추가 전용) 나중에 실제로 일어난 일과 측정됩니다. 상장폐지 종목도 포함됩니다(생존자 편향 없음).
                    </li>
                    <li>
                        <b>페이퍼트레이딩 포트폴리오</b> — 트랙 레코드 페이지가 plan / plan2 / equal / mine을 매일 실제
                        가격과 비용으로 거래하고 <Term term="iwm" />·<Term term="spy" />와 비교합니다. 수익과{' '}
                        <Term term="alpha" />는 공개적이고 영구적입니다.
                    </li>
                </ul>
                <p>
                    매달 IC 드리프트 보고서가 <Term term="rank-ic" /> 진단을 재계산합니다. 요점은 이 사이트가 자기
                    숙제를 스스로 채점하지 못하게 하는 것입니다. 성적표는 전방 지향적이고 실제이며 편집 불가능합니다.
                </p>
            </Section>

            {/* 데이터 */}
            <Section id="data" title="데이터는 어디서 오는가" icon={<BookMarked className="h-5 w-5" />}>
                <ul className="list-disc space-y-2 pl-5">
                    <li><Term term="sec-filings" /> — <Term term="company-facts" />를 통한 제출 당시 그대로의 10년 재무(퀄리티, 포렌식, 입증된 성장의 기준 사실).</li>
                    <li><Term term="yahoo-finance" /> — 주가, 애널리스트 <Term term="estimates" />, 커버리지.</li>
                    <li><Term term="fred" /> — <Term term="macro-flags" /> 뒤의 연준 매크로 시계열.</li>
                </ul>
                <p>
                    전체 파이프라인은 <Term term="github-actions" />로 매일 다시 돌고, IC 드리프트 보고서는 매월
                    재계산됩니다. 페이퍼 원장은 거래비용(bps)과 함께 추가 전용으로 유지됩니다.
                </p>
            </Section>
        </>
    );
}
