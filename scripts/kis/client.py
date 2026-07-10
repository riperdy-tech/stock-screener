"""KIS Open API client for overseas (US) stock trading.

Wraps the handful of endpoints the portfolio sync needs: OAuth token,
quotes, balance, USD cash, limit orders, unfilled orders. Supports both
모의투자 (paper) and real accounts via KIS_ENV=paper|real.

Env vars:
    KIS_APP_KEY, KIS_APP_SECRET   app credentials for the selected env
    KIS_CANO                      8-digit account number
    KIS_ACNT_PRDT_CD              2-digit account product code (usually "01")

Rate limits: paper allows ~2 req/s, real ~20 req/s — enforced client-side.
Tokens live 24h; cached to scripts/kis/.token_<env>.json so repeated local
runs don't hit the token-issuance rate limit (GH Actions runners are
ephemeral, so they issue one fresh token per run, which is fine).
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import requests

BASES = {
    "paper": "https://openapivts.koreainvestment.com:29443",
    "real": "https://openapi.koreainvestment.com:9443",
}

# tr_id per environment. Paper (V...) and real (T...) are distinct IDs.
TR = {
    "balance":  {"real": "TTTS3012R", "paper": "VTTS3012R"},
    "present":  {"real": "CTRP6504R", "paper": "VTRP6504R"},
    "buy":      {"real": "TTTT1002U", "paper": "VTTT1002U"},
    "sell":     {"real": "TTTT1006U", "paper": "VTTT1001U"},
    "unfilled": {"real": "TTTS3018R", "paper": "VTTS3018R"},
    "psamount": {"real": "TTTS3007R", "paper": "VTTS3007R"},
    "krw_bal":  {"real": "TTTC8434R", "paper": "VTTC8434R"},
}

# Quote API exchange codes (EXCD) -> order API exchange codes (OVRS_EXCG_CD)
EXCD_TO_ORDER = {"NAS": "NASD", "NYS": "NYSE", "AMS": "AMEX"}
US_EXCDS = ["NAS", "NYS", "AMS"]

# 모의투자 enforces ~1 call/sec per account (EGW00201); real is far looser.
# The limit is per-account, not per-process, so throttling alone can't
# guarantee compliance — see _retry_rate_limited.
MIN_INTERVAL = {"paper": 1.1, "real": 0.06}
RATE_LIMIT_RETRIES = 5
RATE_LIMIT_CODE = "EGW00201"


class KISError(RuntimeError):
    pass


def _is_rate_limited(status: int, body: dict | None, text: str) -> bool:
    if body and (body.get("msg_cd") == RATE_LIMIT_CODE or "초당 거래건수" in (body.get("msg1") or "")):
        return True
    return status == 500 and (RATE_LIMIT_CODE in text or "초당 거래건수" in text)


class KISClient:
    def __init__(self, env: str, appkey: str, appsecret: str, cano: str, acnt_prdt_cd: str):
        if env not in BASES:
            raise ValueError(f"env must be paper|real, got {env!r}")
        self.env = env
        self.base = BASES[env]
        self.appkey = appkey
        self.appsecret = appsecret
        self.cano = cano
        self.acnt_prdt_cd = acnt_prdt_cd
        self._token_cache = Path(__file__).resolve().parent / f".token_{env}.json"
        self._token = None
        self._last_req = 0.0
        self.session = requests.Session()

    # ---------- plumbing ----------

    def _throttle(self):
        wait = MIN_INTERVAL[self.env] - (time.monotonic() - self._last_req)
        if wait > 0:
            time.sleep(wait)
        self._last_req = time.monotonic()

    def _retry_rate_limited(self, send, what: str):
        """Run send() -> requests.Response, backing off on EGW00201.

        The per-second cap is enforced per *account*, so a sibling run (or a
        retried job step) can trip it even when this process is throttled
        correctly. Rate-limit rejections happen before the request is acted
        on (rt_cd=1, nothing placed), so retrying is safe for orders too.
        """
        delay = 1.0
        for attempt in range(RATE_LIMIT_RETRIES):
            self._throttle()
            r = send()
            try:
                body = r.json()
            except Exception:
                body = None
            if not _is_rate_limited(r.status_code, body, r.text):
                return r, body
            if attempt < RATE_LIMIT_RETRIES - 1:
                print(f"  rate limited on {what}; retry {attempt + 1}"
                      f"/{RATE_LIMIT_RETRIES - 1} in {delay:.0f}s")
                time.sleep(delay)
                delay *= 2
        raise KISError(f"{what}: rate limited after {RATE_LIMIT_RETRIES} attempts")

    def token(self) -> str:
        if self._token:
            return self._token
        # reuse cached token if it has >30min left
        try:
            c = json.loads(self._token_cache.read_text())
            if c.get("expires_at", 0) - time.time() > 1800:
                self._token = c["access_token"]
                return self._token
        except Exception:
            pass
        self._throttle()  # the token call counts against the per-second cap
        r = self.session.post(
            f"{self.base}/oauth2/tokenP",
            json={"grant_type": "client_credentials",
                  "appkey": self.appkey, "appsecret": self.appsecret},
            timeout=30)
        if r.status_code != 200:
            raise KISError(f"token issuance failed {r.status_code}: {r.text[:300]}")
        d = r.json()
        self._token = d["access_token"]
        try:
            self._token_cache.write_text(json.dumps(
                {"access_token": self._token,
                 "expires_at": time.time() + int(d.get("expires_in", 86400))}))
        except Exception:
            pass
        return self._token

    def _headers(self, tr_id: str, hashkey: str | None = None, tr_cont: str = "") -> dict:
        h = {
            "content-type": "application/json; charset=utf-8",
            "authorization": f"Bearer {self.token()}",
            "appkey": self.appkey,
            "appsecret": self.appsecret,
            "tr_id": tr_id,
            "custtype": "P",
        }
        if hashkey:
            h["hashkey"] = hashkey
        if tr_cont:
            h["tr_cont"] = tr_cont
        return h

    def _get(self, path: str, tr_id: str, params: dict, tr_cont: str = "") -> tuple[dict, str]:
        """One GET, retried on rate limit. Returns (body, response tr_cont header)."""
        r, body = self._retry_rate_limited(
            lambda: self.session.get(f"{self.base}{path}", params=params,
                                     headers=self._headers(tr_id, tr_cont=tr_cont), timeout=30),
            f"GET {path} [{tr_id}]")
        if r.status_code != 200:
            raise KISError(f"GET {path} [{tr_id}] {r.status_code}: {r.text[:300]}")
        if body is None:
            raise KISError(f"GET {path} [{tr_id}]: non-JSON response {r.text[:200]}")
        if body.get("rt_cd") not in ("0", None):
            raise KISError(f"GET {path} [{tr_id}] rt_cd={body.get('rt_cd')} "
                           f"msg={body.get('msg1', '')[:200]}")
        return body, r.headers.get("tr_cont", "")

    def _hashkey(self, body: dict) -> str | None:
        try:
            self._throttle()
            r = self.session.post(f"{self.base}/uapi/hashkey", json=body, timeout=30,
                                  headers={"content-type": "application/json; charset=utf-8",
                                           "appkey": self.appkey, "appsecret": self.appsecret})
            if r.status_code == 200:
                return r.json().get("HASH")
        except Exception:
            pass
        return None  # hashkey is defense-in-depth; orders work without it

    # ---------- quotes ----------

    def quote(self, excd: str, ticker: str) -> float | None:
        """Last price from the overseas price API. None if not found / no data."""
        try:
            body, _ = self._get("/uapi/overseas-price/v1/quotations/price",
                                "HHDFS00000300",
                                {"AUTH": "", "EXCD": excd, "SYMB": ticker})
            last = float(body.get("output", {}).get("last") or 0)
            return last if last > 0 else None
        except (KISError, ValueError):
            return None

    def resolve_exchange(self, ticker: str) -> tuple[str, float] | None:
        """Probe NAS/NYS/AMS; return (excd, last_price) for the first hit."""
        for excd in US_EXCDS:
            last = self.quote(excd, ticker)
            if last:
                return excd, last
        return None

    # ---------- account ----------

    def balance(self) -> list[dict]:
        """Held US positions: [{ticker, shares, sellable, exch_order_cd, name}].

        Real accounts accept OVRS_EXCG_CD=NASD as "entire US"; paper accounts
        need per-exchange queries, so we query all three and merge either way
        (harmless duplication guard on real).
        """
        rows: dict[str, dict] = {}
        for excg in ("NASD", "NYSE", "AMEX"):
            fk, nk, tr_cont = "", "", ""
            for _ in range(20):  # pagination safety cap
                body, cont = self._get(
                    "/uapi/overseas-stock/v1/trading/inquire-balance",
                    TR["balance"][self.env],
                    {"CANO": self.cano, "ACNT_PRDT_CD": self.acnt_prdt_cd,
                     "OVRS_EXCG_CD": excg, "TR_CRCY_CD": "USD",
                     "CTX_AREA_FK200": fk, "CTX_AREA_NK200": nk},
                    tr_cont=tr_cont)
                for it in body.get("output1", []) or []:
                    qty = float(it.get("ovrs_cblc_qty") or 0)
                    if qty <= 0:
                        continue
                    t = (it.get("ovrs_pdno") or "").strip()
                    rows[t] = {
                        "ticker": t,
                        "shares": qty,
                        "sellable": float(it.get("ord_psbl_qty") or qty),
                        "exch_order_cd": (it.get("ovrs_excg_cd") or excg).strip(),
                        "name": (it.get("ovrs_item_name") or "").strip(),
                    }
                if cont in ("F", "M"):
                    fk = body.get("ctx_area_fk200", "")
                    nk = body.get("ctx_area_nk200", "")
                    tr_cont = "N"
                    continue
                break
            if self.env == "real":
                break  # NASD already covered the whole US market
        return list(rows.values())

    def usd_cash(self) -> tuple[float, dict]:
        """USD cash available. Returns (amount, raw_usd_row) — raw row logged
        by the caller so field-name surprises are visible in dry runs."""
        body, _ = self._get(
            "/uapi/overseas-stock/v1/trading/inquire-present-balance",
            TR["present"][self.env],
            {"CANO": self.cano, "ACNT_PRDT_CD": self.acnt_prdt_cd,
             "WCRC_FRCR_DVSN_CD": "02", "NATN_CD": "840",
             "TR_MKET_CD": "00", "INQR_DVSN_CD": "00"})
        for row in body.get("output2", []) or []:
            if (row.get("crcy_cd") or "").upper() == "USD":
                for field in ("frcr_drwg_psbl_amt_1", "frcr_dncl_amt_2", "frcr_dncl_amt2"):
                    v = row.get(field)
                    if v not in (None, ""):
                        return float(v), row
                return 0.0, row
        return 0.0, {}

    def buying_power(self, ticker: str, exch_order_cd: str, price: float) -> dict:
        """해외주식 매수가능금액조회 — orderable USD, which (unlike the raw USD
        deposit row) reflects 통합증거금 / KRW collateral. Returns raw output."""
        body, _ = self._get(
            "/uapi/overseas-stock/v1/trading/inquire-psamount",
            TR["psamount"][self.env],
            {"CANO": self.cano, "ACNT_PRDT_CD": self.acnt_prdt_cd,
             "OVRS_EXCG_CD": exch_order_cd, "OVRS_ORD_UNPR": f"{price:.2f}",
             "ITEM_CD": ticker})
        return body.get("output") or {}

    def krw_balance(self) -> dict:
        """국내주식 잔고조회 output2 — used only to see whether the account
        holds a KRW seed (mock accounts are often KRW-funded)."""
        body, _ = self._get(
            "/uapi/domestic-stock/v1/trading/inquire-balance",
            TR["krw_bal"][self.env],
            {"CANO": self.cano, "ACNT_PRDT_CD": self.acnt_prdt_cd,
             "AFHR_FLPR_YN": "N", "OFL_YN": "", "INQR_DVSN": "02",
             "UNPR_DVSN": "01", "FUND_STTL_ICLD_YN": "N",
             "FNCG_AMT_AUTO_RDPT_YN": "N", "PRCS_DVSN": "00",
             "CTX_AREA_FK100": "", "CTX_AREA_NK100": ""})
        out2 = body.get("output2") or []
        return out2[0] if out2 else {}

    def present_balance_raw(self) -> dict:
        """Full inquire-present-balance body (all currency rows) for diagnostics."""
        body, _ = self._get(
            "/uapi/overseas-stock/v1/trading/inquire-present-balance",
            TR["present"][self.env],
            {"CANO": self.cano, "ACNT_PRDT_CD": self.acnt_prdt_cd,
             "WCRC_FRCR_DVSN_CD": "02", "NATN_CD": "840",
             "TR_MKET_CD": "00", "INQR_DVSN_CD": "00"})
        return body

    def unfilled(self) -> list[dict]:
        """Open (unfilled) US orders: [{ticker, side, qty_remaining, order_no}].

        Same NASD-means-whole-US-on-real / per-exchange-on-paper split as
        balance(), deduped by order number.
        """
        out: dict[str, dict] = {}
        for excg in ("NASD", "NYSE", "AMEX"):
            fk, nk, tr_cont = "", "", ""
            for _ in range(10):
                body, cont = self._get(
                    "/uapi/overseas-stock/v1/trading/inquire-nccs",
                    TR["unfilled"][self.env],
                    {"CANO": self.cano, "ACNT_PRDT_CD": self.acnt_prdt_cd,
                     "OVRS_EXCG_CD": excg, "SORT_SQN": "DS",
                     "CTX_AREA_FK200": fk, "CTX_AREA_NK200": nk},
                    tr_cont=tr_cont)
                for it in body.get("output", []) or []:
                    key = it.get("odno") or f"{excg}:{it.get('pdno')}"
                    out[key] = {
                        "ticker": (it.get("pdno") or "").strip(),
                        "side": "sell" if it.get("sll_buy_dvsn_cd") == "01" else "buy",
                        "qty_remaining": float(it.get("nccs_qty") or 0),
                        "order_no": it.get("odno"),
                    }
                if cont in ("F", "M"):
                    fk, nk, tr_cont = body.get("ctx_area_fk200", ""), body.get("ctx_area_nk200", ""), "N"
                    continue
                break
            if self.env == "real":
                break
        return list(out.values())

    # ---------- orders ----------

    def place_order(self, side: str, exch_order_cd: str, ticker: str,
                    qty: int, limit_price: float) -> dict:
        """Limit order (ORD_DVSN 00). Returns {ok, order_no, msg}."""
        assert side in ("buy", "sell")
        decimals = 4 if limit_price < 1 else 2
        body = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "OVRS_EXCG_CD": exch_order_cd,
            "PDNO": ticker,
            "ORD_QTY": str(int(qty)),
            "OVRS_ORD_UNPR": f"{limit_price:.{decimals}f}",
            "ORD_SVR_DVSN_CD": "0",
            "ORD_DVSN": "00",
        }
        if side == "sell":
            body["SLL_TYPE"] = "00"
        hashkey = self._hashkey(body)
        try:
            r, d = self._retry_rate_limited(
                lambda: self.session.post(
                    f"{self.base}/uapi/overseas-stock/v1/trading/order",
                    json=body,
                    headers=self._headers(TR[side][self.env], hashkey=hashkey),
                    timeout=30),
                f"order {side} {ticker}")
        except KISError as e:
            return {"ok": False, "order_no": None, "msg": str(e)}
        if d is None:
            return {"ok": False, "order_no": None,
                    "msg": f"HTTP {r.status_code}: {r.text[:200]}"}
        ok = r.status_code == 200 and d.get("rt_cd") == "0"
        return {"ok": ok,
                "order_no": (d.get("output") or {}).get("ODNO"),
                "msg": (d.get("msg1") or "").strip()}
