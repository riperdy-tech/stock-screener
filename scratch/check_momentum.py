import json, base64

with open('public/data/stocks.json') as f:
    data = json.load(f)

for s in data:
    fd_str = s.get('financialData', '')
    if not fd_str: continue
    fd = json.loads(base64.b64decode(fd_str))
    
    q_eps = fd.get('Quarterly_EPS', [])
    if not q_eps:
        qis = fd.get('Quarterly_Income_Statement', [])
        shares = fd.get('Shares_Outstanding') or s.get('sharesOutstanding') or fd.get('sharesOutstanding') or 0
        if shares and len(qis) >= 4:
            qis = sorted(qis, key=lambda x: x.get('Date', ''))
            q_eps = []
            for q in qis:
                ni = q.get('NetIncome')
                if ni is not None:
                    q_eps.append(ni/shares)
    
    if len(q_eps) >= 4:
        recent = q_eps[-4:]
        increasing = all(recent[i] > recent[i-1] for i in range(1, 4))
        if increasing:
            print(f"{s['symbol']}: {recent}")
