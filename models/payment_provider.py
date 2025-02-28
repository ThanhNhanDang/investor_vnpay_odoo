import time
import uuid
import pytz
from werkzeug import urls
from datetime import datetime, timedelta
import logging
import requests
import hmac
import hashlib
import urllib.parse
import base64
import qrcode

from odoo import _, api, fields, models
from odoo.addons.payment import utils as payment_utils
from odoo.addons.investor_vnpay_odoo import const
from io import BytesIO
from odoo.addons.investor_vnpay_odoo.controllers.payment import VNPayController
from odoo.addons.investor_vnpay_odoo.controllers import payment
_logger = logging.getLogger(__name__)

class PaymentProviderVNPay(models.Model):
    _inherit = "payment.provider"
    
    @api.model
    def _get_default_vnpay_ipn_url(self):
        base_url = self.env["ir.config_parameter"].sudo().get_param("web.base.url")
        return base_url + VNPayController._ipn_url

    # Add 'VNPay' as a new payment provider
    code = fields.Selection(
        selection_add=[("vnpay", "VNPay")], ondelete={"vnpay": "set default"}
    )

    # Define fields for VNPay's Tmn Code and Hash Secret
    vnpay_tmn_code = fields.Char(
        string="VNPay Website Code (TmnCode)", required_if_provider="vnpay"
    )
    vnpay_hash_secret = fields.Char(
        string="VNPay Hash Secret (vnp_HashSecret)", required_if_provider="vnpay"
    )

    vnpay_payment_link = fields.Char(
        string="VNPay Payment URL (vnp_Url)", required_if_provider="vnpay"
    )

    vnpay_query_link = fields.Char(
        string="VNPay Query URL",
        required_if_provider="vnpay",
        default="https://sandbox.vnpayment.vn/merchant_webapi/api/transaction",
    )

    vnpay_white_list_ip = fields.Char(
        string="VNPay White List IPs",
        required_if_provider="vnpay",
        default="113.160.92.202; 113.52.45.78; 116.97.245.130; 42.118.107.252; 113.20.97.250; 203.171.19.146; 103.220.87.4; 103.220.86.4",
    )

    # get the base url and pass it into defaut value of vnpay_ipn_url
    vnpay_ipn_url = fields.Char(
        string="VNPay IPN URL",
        required_if_provider="vnpay",
        default=_get_default_vnpay_ipn_url,
    )
    
    vnpay_merchant_code = fields.Char("Merchant Code")
    vnpay_merchant_name = fields.Char("Merchant Name")
    vnpay_merchant_type = fields.Char("Merchant Type")
    vnpay_secret_key_qr = fields.Char("Secret Key QR")
    vnpay_api_url_qr = fields.Char(
        "API URL QR",
        default="https://doitac-tran.vnpaytest.vn/QRCreateAPIRestV2/rest/CreateQrcodeApi/createQrcode"
    )
    vnpay_appID_qr = fields.Char("App ID QR")
     # Define fields for VNPay's Tmn Code and Hash Secret
    vnpay_terminal_id  = fields.Char(
        string="vnpay_terminal_id", required_if_provider="vnpay"
    )
    vnpay_api_url_refund = fields.Char(
        "API URL Refund",
        default="https://doitac-tran.vnpaytest.vn/mms/refund"
    )
    vnpay_secret_key_refund = fields.Char("Secret Key Refund")
    
    @api.model
    def _get_compatible_providers(
        self, *args, currency_id=None, is_validation=False, **kwargs
    ):
        """Override of payment to filter out VNPay providers for unsupported currencies or
        for validation operations."""
        providers = super()._get_compatible_providers(
            *args, currency_id=currency_id, is_validation=is_validation, **kwargs
        )

        currency = self.env["res.currency"].browse(currency_id).exists()
        # Filter out VNPay if the currency is not supported or if it's a validation operation
        if (
            currency and currency.name not in const.SUPPORTED_CURRENCIES
        ) or is_validation:
            providers = providers.filtered(lambda p: p.code != "vnpay")

        return providers

    def _get_supported_currencies(self):
        """Override of `payment` to return the supported currencies."""

        supported_currencies = super()._get_supported_currencies()
        if self.code == "vnpay":
            supported_currencies = supported_currencies.filtered(
                lambda c: c.name in const.SUPPORTED_CURRENCIES
            )
        return supported_currencies

    
    def _get_default_payment_method_codes(self):
        """Override of `payment` to return the default payment method codes."""
        default_codes = super()._get_default_payment_method_codes()
        if self.code != "vnpay":
            return default_codes
        return const.DEFAULT_PAYMENT_METHODS_CODES

    def generate_transaction_id(self, prefix="TXN"):
        """
        Tạo mã giao dịch duy nhất.

        :param prefix: Tiền tố cho mã giao dịch (mặc định là "TXN")
        :return: Chuỗi mã giao dịch duy nhất
        """
        # Lấy thời gian hiện tại dưới dạng timestamp
        timestamp = int(time.time())

        # Tạo UUID ngẫu nhiên
        random_uuid = uuid.uuid4().hex[:6]

        # Kết hợp các thành phần để tạo mã giao dịch
        transaction_id = f"{prefix}/{timestamp}/{random_uuid}"

        return transaction_id

    @api.model
    def create_vnpay_payment_url(self, amount):
        provider = self.sudo().search([('code', '=', 'vnpay')], limit=1)
        if not provider:
            return False
        order_reference = self.generate_transaction_id(prefix="PAY")
        base_url = self.env["ir.config_parameter"].sudo().get_param("web.base.url")
        language = "vn" if self.env.context.get(
            'lang', self.env.user.lang) == 'vi_VN' else "en"
        float_amount = round(float(amount), 2)

        params = {
            "vnp_Version": "2.1.1",
            "vnp_Command": "pay",
            "vnp_TmnCode": "FT1Q2HC4",
            "vnp_Amount": int(float_amount * 100),
            "vnp_CreateDate": datetime.now(pytz.timezone("Etc/GMT-7")).strftime("%Y%m%d%H%M%S"),
            "vnp_CurrCode": "VND",
            "vnp_IpAddr": payment_utils.get_customer_ip_address(),
            "vnp_Locale": language,
            "vnp_OrderInfo": f"Nạp tiền cho tài khoản {self.env.user.name}.",
            "vnp_OrderType": "billpayment",
            "vnp_ReturnUrl": urls.url_join(base_url, '/payment/vnpay/return'),
            "vnp_ExpireDate": (datetime.now(pytz.timezone("Etc/GMT-7")) + timedelta(minutes=15)).strftime("%Y%m%d%H%M%S"),
            "vnp_TxnRef": order_reference,
        }

        payment_url = provider._get_payment_url(
            params=params,
            secret_key="P2HEYQZRPQYPTHLZ1S8T9VBW74AD4ICL"
        )

        return payment_url

    def _get_payment_url(self, params, secret_key):
        """Generate the payment URL for VNPay"""

        # Determine the base URL based on the state
        inputData = sorted(params.items())
        queryString = ""
        seq = 0
        for key, val in inputData:
            if seq == 1:
                queryString = (
                    queryString + "&" + key + "=" +
                    urllib.parse.quote_plus(str(val))
                )
            else:
                seq = 1
                queryString = key + "=" + urllib.parse.quote_plus(str(val))

        hashValue = self.__hmacsha512(secret_key, queryString)
        # The final URL will be like this:
        # base_url?param1=value1&param2=value2...&vnp_SecureHash=hashValue
        return (
            "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html" +
            "?" + queryString + "&vnp_SecureHash=" + hashValue
        )

    @staticmethod
    def __hmacsha512(key, data):
        """Generate a HMAC SHA512 hash"""

        byteKey = key.encode("utf-8")
        byteData = data.encode("utf-8")
        return hmac.new(byteKey, byteData, hashlib.sha512).hexdigest()
    
    
    def _vnpay_calculate_checksum(self, data, vnpay_secret_key_qr):
        checksum_string = (
            f"{data['appId']}|"
            f"{data['merchantName']}|"
            f"{data['serviceCode']}|"
            f"{data['countryCode']}|"
            f"{data['masterMerCode']}|"
            f"{data['merchantType']}|"
            f"{data['merchantCode']}|"
            f"{data['terminalId']}|"
            f"{data['payType']}|"
            f"{data['productId']}|"
            f"{data['txnId']}|"
            f"{data['amount']}|"
            f"{data['tipAndFee']}|"
            f"{data['ccy']}|"
            f"{data['expDate']}|"
            f"{vnpay_secret_key_qr}"
        )
        return hashlib.md5(checksum_string.encode('utf-8')).hexdigest().upper()

    def refund_calculate_md5_hash(self,secret_key, merchant_code, qr_trace, pay_txn_id, refund_txn_id, type_refund, amount, pay_date):
        """
        Tính toán mã băm MD5 cho chuỗi đầu vào.
        
        :param secret_key: Chuỗi khóa bí mật
        :param merchant_code: Mã merchant
        :param qr_trace: Mã QR Trace
        :param pay_txn_id: ID giao dịch thanh toán
        :param refund_txn_id: ID giao dịch hoàn tiền
        :param type_refund: Loại hoàn tiền
        :param amount: Số tiền
        :param pay_date: Ngày thanh toán
        :return: Chuỗi mã băm MD5 dạng chữ in hoa
        """
        # Tạo chuỗi cần mã hóa
        input_string = (
            f"{secret_key}|"
            f"{merchant_code}|"
            f"{qr_trace}|"
            f"{pay_txn_id}|"
            f"{refund_txn_id}|"
            f"{type_refund}|"
            f"{amount}|"
            f"{pay_date}"
        )
        _logger.info(input_string)
        md5_hash = hashlib.md5(input_string.encode()).hexdigest().upper()
        _logger.info(md5_hash)
        input_string = (
            f"{secret_key}"
            f"{merchant_code}"
            f"{qr_trace}"
            f"{pay_txn_id}"
            f"{refund_txn_id}"
            f"{1}"
            f"{98800}"
            f"{pay_date}"
        )
        _logger.info(input_string)
        # Mã hóa chuỗi bằng thuật toán MD5 và chuyển thành chữ in hoa
        _logger.info(hashlib.md5(input_string.encode('utf-8')).hexdigest().upper())
        
        return md5_hash
    
    def _get_error_message(self, code, message):
        """
        Trả về thông báo lỗi dựa trên mã trạng thái từ VNPay.
        """
        error_messages = {
            "01": _("Checksum is wrong."),
            "02": _("Money is invalid - a part."),
            "03": _("Money is invalid - totality."),
            "04": _("Not allow refund totality after refund a part."),
            "11": _("Format data is wrong."),
            "12": _("Transaction not found."),
            "14": _("IP is denied."),
            "96": _("System is maintaining."),
            "99": _("Internal error."),
        }
        return error_messages.get(code, message or _("Unknown error."))
    
    
    
    def vnpay_generate_qr(self, amount, reference,expDate, expDateFull, pos_order_id):
        provider = self.sudo().search([('code', '=', 'vnpay')], limit=1)
        
        if int(amount)<0:
            _logger.info(pos_order_id)
            
            pos_order = self.env["pos.order"].search([("id","=", pos_order_id)], limit=1)
            _logger.info(pos_order.refunded_order_id.id)
            #Sudo sẽ bỏ qua điều kiện check company và check login
            payment_transaction=self.env["payment.transaction"].sudo().search([("pos_order_id", "=", pos_order.refunded_order_id.id)], limit=1)
            if payment_transaction.provider_id.code != "vnpay":
                return {
                'success': False,
                'type':"Refund",
                'error': "Phương thức thanh toán của đơn hoàn tiền phải là VNpay!"
            }
            request_data = {
                "merchantCode": provider.vnpay_merchant_code,
                "qrTrace": payment_transaction.qrTrace,
                "payTxnId":payment_transaction.reference,
                "refundTxnId":reference,
                "typeRefund":"2",
                "amount": (int(amount)*-1),
                "refundContent":"Hoàn tiền",
                "payDate":expDateFull,
                "checkSum":self.refund_calculate_md5_hash(
                    provider.vnpay_secret_key_refund,
                    provider.vnpay_merchant_code,
                    payment_transaction.qrTrace,
                    payment_transaction.reference,
                    reference,
                    "2",
                    (int(amount)*-1),
                    expDateFull
                )
            }
            try:
                _logger.info(request_data)
                
                response = requests.post(
                    provider.vnpay_api_url_refund,
                    json=request_data,
                    headers={"Content-Type": "text/plain"}
                )
                response_data = response.json()
                _logger.info(response_data)
                # Kiểm tra mã trạng thái từ VNPay
                code = response_data.get("code")
                message = response_data.get("message")
                referenceSplit = reference.split('.')

                if code == "00":
                    # Giao dịch hoàn tiền thành công
                    _logger.info(f"VNPay hoàn tiền thành công: {response_data}")
                    transaction = payment._create_transaction(amount, referenceSplit[0], reference, referenceSplit[1], referenceSplit[2],response_data.get("qrTraceRefund"))
                    transaction._process_pos_online_payment()
                    return {
                        'success': True,
                        'type':"Refund",
                        'message': message,
                        'data': response_data
                    }
                else:
                    # Xử lý lỗi dựa trên mã trạng thái
                    error_message = self._get_error_message(code, message)
                    _logger.error(f"VNPay hoàn tiền thất bại: {error_message}")
                    return {
                        'success': False,
                        'type':"Refund",
                        'error': error_message
                    }
            except Exception as e:
                _logger.error(f"VNPay hoàn tiền thất bại, lỗi server!!: {str(e)}")
                return {
                    'success': False,
                    'type':"Refund",
                    'error':"VNPay hoàn tiền thất bại, lỗi server!!"
                }
        request_data = {
            "appId": provider.vnpay_appID_qr,
            "merchantName": provider.vnpay_merchant_name,
            "serviceCode": "03",
            "countryCode": "VN",
            "masterMerCode": "A000000775",
            "merchantType": "9999",
            "merchantCode": provider.vnpay_merchant_code,
            "terminalId": provider.vnpay_terminal_id,
            "payType": "03",
            "productId": "",
            "txnId": reference,
            "amount": str(amount),
            "tipAndFee": "",
            "ccy": "704",
            "expDate": expDate,
            "desc": f"Payment for order {reference}",
            "billNumber": reference,
            "consumerId": "",
            "purpose": ""
        }
        
        request_data["checksum"] = self._vnpay_calculate_checksum(request_data, provider.vnpay_secret_key_qr)
        try:
            response = requests.post(
                provider.vnpay_api_url_qr,
                json=request_data,
                headers={"Content-Type": "text/plain"}
            )
            response_data = response.json()
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=3,
                border=4,
            )
            qr = qrcode.QRCode(
                border=0  # Loại bỏ viền trắng
            )
            # Tạo ảnh QR không có viền trắng
            qr.add_data(response_data.get('data'))
            qr.make(fit=True)
            
            img = qr.make_image(fill="black", back_color="white").convert("RGB")
            img = img.resize((250,250))
            temp = BytesIO()
            img.save(temp, format="PNG")
            qr_image = base64.b64encode(temp.getvalue())
            if response_data.get('code') == '00':
                return {
                    'success': True,
                    'type':"QR",
                    'qr_data': qr_image,
                    'qr_id': response_data.get('idQrcode')
                }
            else:
                _logger.error(f"VNPAY QR Generation Error: {response_data.get('message')}")
                return {
                    'success': False,
                    'type':"QR",
                    'error': response_data.get('message')
                }
                
        except Exception as e:
            _logger.error(f"VNPAY API Error: {str(e)}")
            return {
                'success': False,
                'type':"QR",
                'error': str(e)
            }
