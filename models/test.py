import hashlib
import requests
import json

# VNPay secret key (replace with the actual key provided by VNPay)
secretKey = "vnpayRefund"  # Ensure this is the correct secret key

# Request data
data = {
    "merchantCode": "0317155027ABC",
    "amount": "24200",  # Ensure this is in the correct format (e.g., no decimals)
    "refundTxnId": "72718420260",  # Remove dots and non-numeric characters if required
    "typeRefund": "2",
    "qrTrace": "244555634",
    "refundContent": "",
    "payTxnId": "727075287524",  # Remove dots and non-numeric characters if required
    "payDate": "20250228111115",
}

# Generate checkSum (secretKey must come first, as per VNPay documentation)
checksum_string = (
    f"{secretKey}"  # Secret key first
    f"{data['merchantCode']}"
    f"{data['qrTrace']}"
    f"{data['payTxnId']}"
    f"{data['refundTxnId']}"
    f"{data['typeRefund']}"
    f"{data['amount']}"
    f"{data['payDate']}"
)
data.update({"checkSum": hashlib.md5(checksum_string.encode('utf-8')).hexdigest().upper()})

# Headers for the request
headers = {
    "Content-Type": "application/json",
    "Accept": "application/json"
}

# Make the POST request to VNPay API
try:
    response = requests.post("https://doitac-tran.vnpaytest.vn/mms/refund", headers=headers, data=json.dumps(data))

    # Parse and print the response
    response_data = response.json()
    print("Response:", response_data)

    # Check the response code
    code = response_data.get("code")
    message = response_data.get("message")

    if code == "00":
        print("VNPay refund successful:", response_data)
    else:
        print(f"VNPay refund failed. Code: {code}, Message: {message}")

except requests.exceptions.RequestException as e:
    print(f"An error occurred: {e}")