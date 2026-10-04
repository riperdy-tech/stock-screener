'use client';

// ─────────────────────────────────────────────────────────────────────────────
// /help — 한국어 본문 (Korean body)
//
// The Korean-language version of the handbook sections (welcome → data).
// Rendered by page.tsx when the site language is Korean. The <Term> links and
// glossary popups are fully localized via lib/glossary-ko.ts.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link';
import { BookMarked, BookOpen, FlaskConical } from 'lucide-react';
import { Term } from '@/components/GlossaryTerm';
import { Section, SubHeading, Callout } from './help-ui';
import { PipelineDiagram } from './WorkflowDiagram';

export function KoreanHelpBody() {
    return (
        <>
            {/* 소개 */}
            <Section id="welcome" title="소개 — 이 사이트가 무엇이고 무엇이 아닌가" icon={<FlaskConical className="h-5 w-5" />}>
                <p>
                    매일 컴퓨터 한 대가 <b>미국 상장 주식 약 7,000개</b>의 재무 보고서와 주가 이력을 읽고, 약{' '}
                    <b>150개</b>의 후보 명단으로 좁힙니다. 별도의 AI 애널리스트가 후보 명단의 종목을 깊이 분석해,
                    각 종목의 가격이 너무 낮은지, 적당한지, 너무 높은지 말해 줄 수 있습니다. 이 핸드북은 각 단계가
                    어떻게 작동하는지, 화면의 모든 라벨이 무엇을 뜻하는지, 그리고 이 시스템이 의도적으로{' '}
                    <i>하지 않는</i> 일이 무엇인지 설명합니다.
                </p>
                <Callout kind="warn">
                    <b>여기서는 아무것도 사고팔지 않으며, 어떤 것도 재정적 조언이 아닙니다.</b> 근거를 펼쳐 놓은
                    리서치 후보 명단입니다. 수천 개 종목을 <i>당신의</i> 리서치 시간을 쓸 가치가 있는 소수로 좁히는
                    기계입니다. 이 사이트는 거래를 하지 않습니다. 페이퍼 북조차 실제 가격과 실제 비용으로 정직하게
                    시뮬레이션됩니다.
                </Callout>
                <Callout kind="info">
                    <b>현재 상황:</b> AI 애널리스트는 재구축과 테스트가 진행 중입니다. 새 애널리스트가 테스트를 통과해
                    가동되기 전까지, 데스크의 AI 쪽에는 새로운 추천 종목이 나오지 않습니다. 옛 애널리스트의 판단은
                    기록에 남아 있으며, 추천 종목이 아니라 막힘으로 표시됩니다.{' '}
                    <Link href="#analyst" className="font-bold text-pos hover:underline">AI 애널리스트</Link>를 참조하세요.
                </Callout>
                <p>
                    <span className="border-b border-dotted border-pos/40 font-semibold text-pos">점선 밑줄</span>이
                    있는 단어는 기술 용어입니다. 클릭하면 페이지를 떠나지 않고 뜻을 볼 수 있습니다. 모든 용어의
                    검색 가능한 완전한 색인은{' '}
                    <Link href="#glossary" className="font-bold text-pos hover:underline">용어 사전 섹션</Link>에 있습니다.
                </p>
            </Section>

            {/* 파이프라인 */}
            <Section id="pipeline" title="매일 무슨 일이 일어나는가 — 파이프라인" icon={<BookMarked className="h-5 w-5" />}>
                <p>
                    화면 뒤에는 <Term term="github-actions" />로 일정에 따라 자동 재실행되는, 순서가 정해진 작업
                    체인이 있습니다. 순서가 강제되고 각 단계에서 데이터가 검사되므로, 낡거나 부분적인 데이터가
                    후보 명단을 조용히 망가뜨릴 수 없습니다. 쉽게 말하면 다음과 같습니다.
                </p>
                <ol className="list-decimal space-y-2 pl-5">
                    <li>
                        <b>데이터 유입.</b> SEC의 기업 제출 서류, Yahoo Finance의 주가와 애널리스트 전망,
                        그리고 <Term term="fred" />(연준의 데이터 서비스)의 경제 시계열입니다.
                    </li>
                    <li>
                        <b>안전 필터(“Tier-1 hygiene”).</b> 아무도 합리적으로 살 수 없는 종목이 제거됩니다. 거래할 수
                        없는 종목, 작은 기업(3억 달러 미만)이거나 주가가 3달러 미만인 종목, 거래가 얇은 종목, 껍데기
                        회사, 쓸 만한 제출 재무 데이터가 없는 기업, 만성 적자에 부채가 많은 기업, 그리고 회계 조작
                        징후가 강한 소형 기업입니다. 채점할 종목이 약 3,000개 남습니다.
                    </li>
                    <li>
                        <b>듀얼 도어 스크린.</b> 남은 각 종목을 세 개의 <Term term="door" /> — 컴파운더, 밸류 갭,
                        추세 주도주 — 로 채점하고, 가장 좋은 사례가 후보 명단에 오릅니다.
                    </li>
                    <li>
                        <b>등급.</b> 후보 명단을 Research now와 Watchlist로 나눕니다. 나머지는 Pass이고, 안전 필터가
                        제거했다면 Vetoed입니다.
                    </li>
                    <li>
                        <b>AI 애널리스트(가동 중일 때).</b> 후보 명단 종목을 깊이 분석해 각각에 판단을 내립니다.
                        클라우드가 아니라 로컬 컴퓨터에서 실행됩니다.
                    </li>
                    <li>
                        <b>게이트.</b> 판단은 게이트의 규칙을 통과해야만 유효합니다. 통과하지 못한 판단은 막힘으로
                        표시되어, 이유와 함께 계속 보입니다.
                    </li>
                    <li><b>게시.</b> 판단과 리포트가 이 사이트에 게시됩니다.</li>
                    <li>
                        <b>페이퍼 북.</b> 세 개의 시뮬레이션 포트폴리오가 후보 명단, AI 판단, 그리고 당신의 보유
                        종목을 매일 따라갑니다.
                    </li>
                    <li>
                        <b>성과 평가.</b> 각 판단은 나중에 실제 주가가 어떻게 움직였는지와 대조해 점검됩니다.
                    </li>
                </ol>
                <PipelineDiagram />
                <p>
                    모든 것은 <Term term="point-in-time" />입니다. 기록되는 각 신호는 그 시점에 존재했던 정보만
                    사용합니다. 이 원칙이 트랙 레코드를 신뢰할 수 있게 만듭니다.
                </p>
            </Section>

            {/* 데스크 */}
            <Section id="desk" title="데스크 읽는 법 — 두 가지 화면" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    데스크는 메인 페이지입니다. 맨 위에는 누구의 관점을 볼지 정하는 스위치가 하나 있습니다.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>AI</b> — AI 애널리스트의 판단을 아래 섹션으로 나눠 보여 줍니다.
                    </li>
                    <li>
                        <b>Quant</b> — 스크린 자체의 순위입니다. 재무제표와 주가에 대한 순수한 수학이며 AI는
                        개입하지 않습니다.
                    </li>
                </ul>
                <SubHeading>색상 안내 — 색 하나에 의미 하나</SubHeading>
                <ul className="space-y-1.5 pl-1">
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: 'oklch(0.77 0.13 240)' }}>●</span><span>파란색 — 후보 명단: 종목이 스크린을 얼마나 통과했는지(Research now가 가장 진함). 선택한 항목도 파란색으로 표시됩니다.</span></li>
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#a774d6' }}>●</span><span>보라색 — Quality: 우량한 사업과 그 근거가 되는 점수.</span></li>
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#149c82' }}>●</span><span>청록색 — Value: 이미 달성한 성장에 비해 싼 종목과 그 근거가 되는 점수.</span></li>
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#fb9dbb' }}>●</span><span>분홍색 — Momentum / trend: 강하고 꾸준한 주가 추세.</span></li>
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: 'oklch(0.82 0.14 162)' }}>●</span><span>초록색 — 좋음: 저평가, 수익, 게이트를 통과한 판단.</span></li>
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#e8e4da' }}>●</span><span>흰색 계열 — 적정: 주가가 가치 밴드 안에 있음.</span></li>
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#db6750' }}>●</span><span>산호색 — 나쁨: 고평가, 손실.</span></li>
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#e2b850' }}>●</span><span>호박색 — 경고: 자세히 볼 것(포렌식 경고, 판단이 막혔다는 안내, 데스크 알림).</span></li>
                    <li className="flex items-baseline gap-2"><span aria-hidden style={{ color: '#8a877f' }}>●</span><span>회색 — 유효하지 않음: 막힌 판단의 숫자, 베토된 종목, 데이터 없음.</span></li>
                </ul>
                <SubHeading>AI 렌즈의 섹션</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>Research now</b> — 판단이 <i>저평가</i>이고 막히지 않은 종목입니다(
                        <Link href="#gate" className="font-bold text-pos hover:underline">게이트</Link> 참조).
                    </li>
                    <li>
                        <b>Watchlist</b> — 판단이 <i>적정</i> 또는 <i>고평가</i>이고 막히지 않은 종목입니다.
                    </li>
                    <li>
                        <b>게이트에 막힘(Blocked by the gate)</b> — 규칙을 통과하지 못한 기록상의 판단입니다.
                        이유와 함께 기록으로 표시되며, 추천 종목으로는 절대 표시되지 않습니다.
                    </li>
                    <li>
                        <b>대기 중(Awaiting)</b> — 애널리스트가 아직 분석하지 않은 후보 명단 종목입니다.
                    </li>
                    <li>
                        <b>베토(Vetoed)</b> — 안전 필터가 제거한 종목, 그리고 애널리스트가 쓸 만한 판단을 내지 못한
                        행입니다(<Term term="not-usable" />).
                    </li>
                </ul>
                <SubHeading>가치 밴드 막대</SubHeading>
                <p>
                    판단 옆에 가느다란 막대가 보입니다. <b>음영 띠</b>는 애널리스트의 실행들에서 나온 가치의 범위,{' '}
                    <b>눈금</b>은 중앙값(가운데 값), <b>흰 선</b>은 오늘의 주가입니다. 선이 띠의 왼쪽에 있으면
                    주가가 모든 실행의 가치보다 낮은 것이고, 띠 안에 있으면 범위 안, 오른쪽에 있으면 모든 실행보다
                    높은 것입니다. 이것이 판단의 전부입니다. <Term term="iv-band" /> 참조.
                </p>
            </Section>

            {/* 스크린 */}
            <Section id="screen" title="퀀트 스크린 — 세 개의 도어" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    스크린은 모든 것을 하나의 점수로 섞지 않습니다. 기업은 뛰어나서, 잘못 가격이 매겨져서, 또는
                    강하고 꾸준한 상승 추세에 있어서 관심을 받을 수 있는데, 이를 하나의 숫자로 평균 내면 어느
                    쪽도 잘 설명하지 못합니다. 그래서 <Term term="door" />가 세 개 있습니다. 종목은 하나만
                    통과하면 됩니다.
                </p>
                <div className="space-y-3">
                    <div className="border border-rule-10 bg-white/5 p-3">
                        <p className="text-sm font-extrabold text-pos">Door 1 — Quality(퀄리티 · 컴파운더)</p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-q">
                            실제로 돈을 벌고, 계속 성장하고, 주가가 오르고, 전망이 상향되고 있는 기업입니다.{' '}
                            <Term term="quality" />, <Term term="momentum" />, <Term term="revisions" />를 섞으며,
                            퀄리티의 비중이 가장 큽니다.
                        </p>
                    </div>
                    <div className="border border-rule-10 bg-white/5 p-3">
                        <p className="text-sm font-extrabold text-accent">Door 2 — Value(밸류 · 밸류 갭)</p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-q">
                            자신이 입증한 성장에 비해 싸 보이는 기업입니다. 가격이 기업이 실제로 달성한 것보다
                            적은 성장을 요구하고(<Term term="expectations-gap" />), 그 종목이{' '}
                            <Term term="value" /> 기준으로 저렴합니다. <b>떨어지는 칼날 하한선</b>이 가파르게 하락
                            중인 종목을 걸러 냅니다. 싸지만 계속 떨어지는 것은 아직 헐값이 아니기 때문입니다.
                        </p>
                    </div>
                    <div className="border border-rule-10 bg-white/5 p-3">
                        <p className="text-sm font-extrabold text-warn">Door 3 — Trend(추세 · 추세 주도주)</p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-q">
                            다른 두 도어가 놓칠 강하고 꾸준한 상승 추세입니다. 예를 들어 섹터 전체의 붐이 그렇습니다.
                            추가로 최대 20자리, 업종 그룹당 최대 5자리입니다. 후보는 흑자여야 하고 어느 정도 규모가
                            있어야 하며, 애널리스트 전망이 하향되고 있으면 안 되고, 운 좋은 한 달이 아니라 꾸준히
                            올라 왔어야 합니다.
                        </p>
                    </div>
                </div>
                <SubHeading>도어들이 경쟁하는 방식</SubHeading>
                <p>
                    첫 두 도어는 각각 점수를 <Term term="percentile" />로 바꾸고, 둘 중 더 좋은 쪽이 종목이
                    경쟁하는 기준이 됩니다. <Term term="champion" /> — 두 도어 모두에서 상위 10%에 드는 종목 — 은
                    +2의 작은 가산점을 받습니다. 뛰어나면서 동시에 싼 경우는 드물기 때문입니다. 떨어지는 칼날은
                    챔피언이 될 수 없습니다.
                </p>
                <SubHeading>버티는 힘</SubHeading>
                <p>
                    이미 후보 명단에 있는 종목은 뚜렷하게 밀려날 때까지 남습니다. 이를{' '}
                    <Term term="hysteresis" />라고 합니다. 순위가 60위 이내이면 Research now에, 150위 이내이면
                    후보 명단에 남습니다. 이런 완충이 없으면 컷 경계에 걸린 종목이 작은 가격 변동마다 들락날락할
                    것입니다.
                </p>
                <SubHeading>공정한 비교</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        대부분의 평가는 <Term term="sector-neutral" />입니다. 은행은 소프트웨어 기업이 아니라
                        은행과 경쟁합니다.
                    </li>
                    <li>
                        <Term term="momentum" />는 유용한 방식의 예외입니다. 시장 전체를 기준으로도 읽기 때문에,
                        섹터 전체를 끌어올리는 붐이 평범해 보이지 않고 그대로 드러납니다.
                    </li>
                    <li>
                        석유·가스·광업·해운처럼 현금흐름이 경기 사이클에 따라 출렁이는 경기순환 기업에는 한 해의 좋거나
                        나쁜 실적 대신 여러 해의 현금흐름 평균을 씁니다(석유·가스·광업은 <b>8년</b>, 그 밖의 경기순환
                        기업은 <b>3년</b>).
                    </li>
                </ul>
                <SubHeading>섹터 틸트는 꺼져 있음</SubHeading>
                <p>
                    모든 섹터가 같은 기본 <Term term="sector-quota" />, 즉 후보 명단 자리를 받습니다. 매크로
                    엔진이 경제에 맞는 섹터에 추가 자리를 줄 수 있지만, 섹터 선택이 아직 검증되지 않았으므로
                    검증될 때까지 틸트는 꺼져 있습니다.
                </p>
            </Section>

            {/* 등급 */}
            <Section id="bands" title="등급, 베토, 경고" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    스크린의 결과는 네 개의 <Term term="band" />입니다.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><span className="font-extrabold text-pos">RESEARCH NOW</span> — 후보 명단의 상위, 대략 처음 50~60개 종목입니다. 오늘 리서치할 가치가 있습니다.</li>
                    <li><span className="font-extrabold text-accent">WATCHLIST</span> — 후보 명단의 나머지로, 전체 약 150개 종목입니다.</li>
                    <li><span className="text-ink-2">PASS</span> — 채점은 됐지만 후보 명단에는 없습니다.</li>
                    <li><span className="font-extrabold text-neg">VETOED</span> — 안전 필터가 제거했습니다. 등급이 없으며, 이유가 레드칩에 적혀 있습니다.</li>
                </ul>
                <SubHeading>무엇이 종목을 제거하는가</SubHeading>
                <p>
                    <Term term="veto" />는 도어가 무엇이든 채점하기 전에 적용되는 하드 디스퀄리파이어입니다.
                    이유는 다음과 같습니다. 거래할 수 없음, 너무 작거나 거래가 너무 얇음, 쓸 만한 제출 재무 데이터가
                    없음, 껍데기 회사, 만성 영업 손실에 과도한 부채가 겹침, 또는{' '}
                    <Term term="forensic" /> 레드 플래그 두 개가 동시에 나타남. 마지막 두 가지는 시가총액 100억
                    달러 미만 기업에만 적용됩니다.
                </p>
                <SubHeading>경고만 하는 것</SubHeading>
                <p>
                    대기업에서는 포렌식 검사가 <b>경고</b>입니다. <Term term="beneish" />(이익조작 가능성),{' '}
                    <Term term="accruals" />(현금이 뒷받침되지 않는 이익), Altman Z(부실 위험 점수), 그리고 주식
                    발행으로 인한 심한 <Term term="dilution" />입니다. 경고는 시가총액 100억 달러 이상 종목을
                    절대 제거하지 않습니다. 더 작은 기업에서는 두 개의 레드 플래그가 일치할 때만 제거됩니다. 이렇게
                    하면 빠르게 성장하는 선두 기업이 특이해 보인다는 이유로 쫓겨나는 일을 막으면서도, 더 자세히
                    들여다볼 수 있도록 경고는 계속 보여 줍니다.
                </p>
                <SubHeading>메모는 경고가 아님</SubHeading>
                <p>
                    데이터 메모 — 예를 들어 종목의 모멘텀이 월간 주가로 계산되었다거나 최신 연간 보고서가 오래되었다는
                    것 — 는 숫자가 어떻게 만들어졌는지를 설명합니다. 기업에 대해 나쁜 이야기를 하는 것이 아니며,
                    종목을 제거하지 않습니다.
                </p>
                <Callout kind="tip">
                    원칙은 <i>annotate, never silently gate(주석을 달되, 조용히 걸러 내지 말 것)</i>입니다. 가능한 한
                    우려 사항은 종목을 조용히 지우는 대신 이유가 달린 플래그로 보여 주어 직접 볼 수 있게 합니다.
                </Callout>
            </Section>

            {/* 애널리스트 */}
            <Section id="analyst" title="AI 애널리스트 — 판단이 만들어지는 방식" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    후보 명단의 종목은 AI 애널리스트가 깊이 분석할 수 있습니다. 신중한 두 번째 소견을 받는 것과
                    같습니다. 각 부분이 잘하는 일을 하도록 작업이 나뉩니다.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>AI가 리서치를 하고</b> 모든 밸류에이션 입력값을 고릅니다. 클라우드 서비스가 아니라 로컬
                        모델(<Term term="llm" />)로 실행됩니다.
                    </li>
                    <li>
                        <b>파이썬이 모든 계산을 합니다.</b> AI는 좋은 애널리스트지만 믿을 만한 계산기는 아니므로,
                        어떤 숫자도 AI의 산술에 맡기지 않습니다.
                    </li>
                    <li>
                        <b>코드가 답을 검증합니다.</b> 외부 앵커, 즉 전문 애널리스트들의 전망과 목표주가 범위(
                        <Term term="street-fence" />)에 대조합니다.
                    </li>
                </ul>
                <p>
                    각 종목은 2~3회의 독립적인 실행을 거치고, 각 실행은 사업이 얼마의 가치가 있는지에 대한 추정치로
                    끝납니다. <b>판단</b>은 오늘의 주가가 그 가치들의 밴드에 대해 어디에 있는가입니다. 밴드 아래이면{' '}
                    <b>저평가</b>, 안이면 <b>적정</b>, 위이면 <b>고평가</b>입니다. 밴드가 넓다는 것은 실행들의
                    의견이 엇갈렸다는 뜻이며, 그러면 제안 크기가 작아집니다. <Term term="iv-band" /> 참조.
                </p>
                <Callout kind="warn">
                    <b>현재 상태:</b> 애널리스트는 재구축과 테스트가 진행 중입니다. 테스트를 통과해 가동되기 전까지는
                    새로운 판단이 없습니다. 오늘 기록에 있는 모든 판단은 옛 애널리스트가 만든 것입니다.
                </Callout>
            </Section>

            {/* 게이트 */}
            <Section id="gate" title="게이트 — 어떤 판단이 유효한가" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    판단은 게이트를 통과해야만 유효합니다. 모든 판단에는 <Term term="actionable" />(예 또는
                    아니오)이 표시되고, 답이 아니오이면 데스크가 <Term term="gate-reason" />를 쉬운 말로 알려
                    줍니다.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>옛 애널리스트가 만듦</b> — 현재 규칙 이전에, 무효 판정을 받은 애널리스트가 만든 판단입니다.</li>
                    <li><b>실행 간 격차가 너무 큼</b> — 실행들의 가치가 너무 넓게 퍼져 있어 믿을 수 없습니다.</li>
                    <li><b>쓸 만한 실행이 하나뿐</b> — 실행 하나로는 애널리스트가 자기 자신과 얼마나 일치하는지 알 수 없습니다.</li>
                    <li><b>애널리스트 목표주가 범위 밖</b> — 가치가 스트리트 펜스 밖에 있습니다.</li>
                    <li><b>주가보다 비현실적으로 높음</b> — 가치가 주가보다 너무 높아 의심스러운 것으로 취급됩니다.</li>
                    <li><b>애널리스트 목표주가 범위 없음</b> — 답을 대조할 펜스가 없습니다.</li>
                    <li><b>애널리스트 데이터를 가져오지 못함</b> — 조회가 실패해 검증을 할 수 없었습니다.</li>
                    <li><b>광업 / 석유·가스 생산업체는 아직 미지원</b> — 애널리스트가 아직 이들을 제대로 평가하지 못하므로, 매수로 이어지지 않도록 막습니다.</li>
                    <li><b>계산기 미사용</b> — 애널리스트가 답을 내면서 밸류에이션 계산기를 쓰지 않았습니다.</li>
                    <li><b>테스트 실행</b> — 운영 실행이 아니라 테스트에서 나온 행입니다.</li>
                </ul>
                <p>
                    그 밖에도 몇 가지 기술적 이유가 있으며, 데스크는 각각을 말로 풀어 보여 줍니다. 판단 하나에 이유가
                    둘 이상일 수 있습니다.
                </p>
                <Callout kind="info">
                    막힌 판단은 삭제되지 않습니다. <i>게이트에 막힘</i> 아래에 무엇이 말해졌고 왜 유효하지 않은지의
                    기록으로 계속 보이며, 추천 종목으로는 절대 표시되지 않습니다.
                </Callout>
            </Section>

            {/* 재가동 */}
            <Section id="relaunch" title="새 애널리스트가 가동되면 달라지는 것" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    이 네 가지는 재가동과 함께 도입됩니다. 오늘은 아직 작동하지 않습니다.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>진입 타이밍.</b> 각 판단은 “지금 매수”인지 “모멘텀을 기다림”인지 말하고, 그 결정을 뒤집을
                        조건을 명시합니다.
                    </li>
                    <li>
                        <b>가치 기준 vs 모멘텀 기준.</b> 펀더멘털의 뒷받침을 받는 강한 상승 추세는, 애널리스트의
                        가치가 주가보다 낮더라도 절반 또는 4분의 1 크기로 보유할 수 있습니다.{' '}
                        <Term term="position-basis" /> 참조.
                    </li>
                    <li>
                        <b>논제 모니터.</b> 각 판단은 자기만의 무효화 규칙을 명시합니다. 이 규칙은 현재 데이터에 대해
                        다시 점검되고, 논제가 깨지면 표시됩니다. <Term term="thesis-status" /> 참조.
                    </li>
                    <li>
                        <b>미커버 종목에 대한 신중함.</b> 전문 애널리스트가 한 명도 커버하지 않는 종목은 커버되는
                        종목처럼 다뤄지는 대신, 제안 크기가 더 작고 안전마진 요건이 더 엄격합니다.
                    </li>
                </ul>
            </Section>

            {/* 매크로 */}
            <Section id="macro" title="매크로 엔진 — 경제 배경" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    별도의 엔진이 미국 경제의 상태를 읽고 세 가지를 게시합니다.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>경제 계절별 확률.</b> 이 확률이 주된 산출물입니다(<Term term="probability-vector" /> 참조).
                        단일 계절 라벨은 요약일 뿐이며 어떤 숫자도 움직이지 않습니다.
                    </li>
                    <li>
                        <b>쇼크 경보</b>: 공포, 신용, 금리, 유가, 달러, 고용, 인플레이션(
                        <Term term="shock-register" /> 참조).
                    </li>
                    <li>
                        <b>난기류 리스크 플래그</b>: 공포 지수가 30 이상일 때 켜집니다.
                    </li>
                </ul>
                <p>
                    이 엔진의 숫자는 오직 <Term term="fred" />에서만 나옵니다. 뉴스는 이야기의 맥락으로만 쓰이고
                    숫자로는 절대 쓰이지 않습니다. 섹터 선택이 아직 검증되지 않았으므로 스크린은 이를 사용하지
                    않습니다.
                </p>
            </Section>

            {/* 트랙 레코드 */}
            <Section id="track" title="트랙 레코드 — 정직한 측정기" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    보기 좋은 <Term term="backtest" />를 보여 주는 대신, 시스템은 실제 가격과 실제{' '}
                    <Term term="transaction-costs" />으로 매일 <Term term="paper-trading" />을 합니다. 시스템이
                    틀렸다면 이 페이지가 그렇게 말할 것입니다.
                </p>
                <SubHeading>세 개의 북</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b className="text-accent">Equal-weight</b> — Research now 종목 전부를 같은 비중으로
                        보유합니다. AI도 크기 조절도 없는 순수한 종목 선정 테스트입니다.
                    </li>
                    <li>
                        <b className="text-pos">AI 북</b> — 게이트를 통과한 애널리스트 판단을 따릅니다(
                        <Term term="rn-depth" />). 지금까지의 기록은 무효 판정을 받은 <b>옛</b> 애널리스트의
                        것입니다. 통과하는 판단이 없어서 2026-09-24 이후 현금만 보유해 왔습니다. 새 애널리스트가
                        가동되면 AI 기록은 0에서 다시 시작하고 옛 기록은 보관됩니다.
                    </li>
                    <li>
                        <b className="text-ink-2">Mine</b> — 당신이 저장한 보유 종목을 펀드처럼(
                        <Term term="unitization" />) 추적해, 돈을 더 넣어도 성과가 가짜로 부풀지 않게 합니다.
                    </li>
                </ul>
                <SubHeading>정직한 규칙</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li>거래는 <b>신호 이후 첫 종가</b>에 일어납니다. 신호는 존재한 뒤에야 실행할 수 있기 때문입니다.</li>
                    <li>모든 거래에 비용이 포함됩니다.</li>
                    <li>벤치마크(<Term term="iwm" />, <Term term="spy" />)는 거래와 같은 날짜를 사용합니다.</li>
                </ul>
                <SubHeading>읽는 법</SubHeading>
                <ul className="list-disc space-y-2 pl-5">
                    <li><b>Equal-weight vs IWM</b> — 종목들이 소형주 <Term term="benchmark" />를 이기면 종목 선정이 작동하는 것입니다.</li>
                    <li><b>AI 북 vs Equal-weight</b> — AI 애널리스트는 자신의 북이 단순 후보 명단을 이길 때에만 밥값을 합니다.</li>
                    <li><b>Mine vs 나머지</b> — 당신 자신의 이탈은 <Term term="behavior-gap" />로 드러납니다.</li>
                </ul>
                <p>
                    <Term term="sharpe-ratio" />, <Term term="cagr" /> 같은 지표는 실시간 데이터가 충분한 일수만큼
                    쌓인 뒤에야 나타납니다. 초기에는 이 페이지가 일부러 따분합니다.
                </p>
            </Section>

            {/* 포트폴리오 */}
            <Section id="portfolio" title="내 포트폴리오 — 내 보유 종목 점검" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    Portfolio 탭은 당신의 <b>실제</b> 보유 종목을 위한 곳입니다. 각 보유 종목은 스크린의{' '}
                    <Term term="band" />와 AI 판단에 대조되고, 결과가 그 옆에 표시됩니다. AI 판단이 막힌 보유
                    종목은 막힘으로 표시되며, 신호로는 절대 표시되지 않습니다. 보유 종목은 트랙 레코드의{' '}
                    <b>Mine</b> 북에도 반영됩니다.
                </p>
                <Callout kind="info">
                    이제 제안 계획은 없습니다. 사이트는 더 이상 당신을 위한 배분안을 만들지 않으며, 예전의 켈리 방식
                    크기 조절 계획 북은 폐기되었습니다. 지금도 남아 있는 크기 가이드가 무엇인지는{' '}
                    <Term term="position-sizing" />를 참조하세요.
                </Callout>
            </Section>

            {/* 레거시 렌즈 */}
            <Section id="lenses" title="레거시 렌즈 — 참고용으로 남겨 둔 옛 스크린" icon={<BookOpen className="h-5 w-5" />}>
                <p>
                    <b>Lenses</b> 버튼은 옛 스크린을 엽니다. 100배 종목(100-bagger) 스크린, Reverse,
                    YouTube입니다. 참고용으로 남겨 둔 것입니다. 이것들은 현재 시스템이 <b>아니며</b>, 데스크의
                    어떤 것도 이것으로 만들어지지 않습니다.
                </p>
            </Section>

            {/* 검증 */}
            <Section id="validation" title="시스템은 어떻게 검증되는가" icon={<BookOpen className="h-5 w-5" />}>
                <p>세 가지 습관이 시스템을 정직하게 유지합니다.</p>
                <ul className="list-disc space-y-2 pl-5">
                    <li>
                        <b>결과보다 규칙 먼저.</b> 합격/불합격 규칙은 결과를 보기 전에 적어 두므로, 나중에 보기
                        좋게 조정할 수 없습니다(그것은 <Term term="overfitting" />이 됩니다).
                    </li>
                    <li>
                        <b>판단 채점.</b> 평가기가 각 AI 판단을 30일, 91일, 182일, 365일 동안 주가가 한 움직임과{' '}
                        <Term term="iwm" />, <Term term="spy" />, QQQ에 견주어 점검합니다. 한 기간은 완전히 지나간
                        뒤에만 평가되고, 벤치마크는 판단과 같은 날짜를 사용합니다.
                    </li>
                    <li>
                        <b>페이퍼 북.</b>{' '}
                        <Link href="#track" className="font-bold text-pos hover:underline">트랙 레코드</Link>의 북은
                        실제 가격과 비용으로 매일 거래합니다.
                    </li>
                </ul>
                <Callout kind="warn">
                    <b>아직 결론 없음.</b> 오늘 기록에 있는 모든 판단은 옛 애널리스트의 것이므로, 평가에서 어떤
                    결론도 끌어낼 수 없습니다. 새 애널리스트의 유효한 판단이 생기고 그 기간이 지나간 뒤에야 의미를
                    갖게 됩니다.
                </Callout>
            </Section>

            {/* 데이터 */}
            <Section id="data" title="데이터는 어디서 오는가" icon={<BookOpen className="h-5 w-5" />}>
                <ul className="list-disc space-y-2 pl-5">
                    <li><Term term="sec-filings" /> — <Term term="company-facts" />를 통한 제출 당시 그대로의 10년 재무(퀄리티, 포렌식 경고, 입증된 성장의 기준 사실). <Term term="point-in-time" />으로 보관됩니다.</li>
                    <li><Term term="yahoo-finance" /> — 주가, 애널리스트 <Term term="estimates" />, 커버리지.</li>
                    <li><Term term="fred" /> — 매크로 엔진의 바탕이 되는 미국 경제 시계열.</li>
                    <li>뉴스 — 서사적 맥락일 뿐입니다. 숫자로는 절대 바뀌지 않습니다.</li>
                </ul>
                <p>
                    채점 체인은 <Term term="github-actions" />로 일정에 따라 다시 실행됩니다. AI 애널리스트는
                    별도로 로컬 컴퓨터에서 실행됩니다.
                </p>
            </Section>
        </>
    );
}
