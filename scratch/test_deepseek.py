import requests
import json

url = "http://localhost:3000/api/deepseek"
payload = {
    "password": "RSYS",
    "ticker": "ELVA",
    "prompt": "Test prompt for ELVA."
}

try:
    response = requests.post(url, json=payload)
    print("Status:", response.status_code)
    print("Response JSON:", json.dumps(response.json(), indent=2))
except Exception as e:
    print("Error:", e)
