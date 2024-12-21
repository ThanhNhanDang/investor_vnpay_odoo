
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import hashlib
import hmac
import logging
import pprint
import urllib.parse
import uuid
import pytz
import requests as pyreq
import json

from werkzeug.exceptions import Forbidden # type: ignore
from odoo import _, http, tools
from odoo.http import request
from odoo.exceptions import AccessError, MissingError, ValidationError


from datetime import datetime, timedelta
from odoo.fields import Command
from odoo.addons.payment.controllers import portal as payment_portal

_logger = logging.getLogger(__name__)
# The currencies supported by VNPay, in ISO 4217 format.
SUPPORTED_CURRENCIES = [
    "VND",
]

DEFAULT_PAYMENT_METHODS_CODES = [
    # Primary payment methods.
    "vnpay",
]

EXPRY_TIME = 10  # minutes


_logger = logging.getLogger(__name__)


class ParkingPaymentr(payment_portal.PaymentPortal):

    @http.route('/parking/shop/payment/date', type='json', auth='user')
    def parking_paynow_date(self, **kwargs):
        params = {
            "vnp_CreateDate": datetime.now(pytz.timezone("Etc/GMT-7")).strftime(
                "%Y%m%d%H%M%S"
            ),
            "vnp_ExpireDate": (
                datetime.now(pytz.timezone("Etc/GMT-7"))
                + timedelta(minutes=EXPRY_TIME)
            ).strftime("%Y%m%d%H%M%S"),
        }
        return json.dumps(params)


class VNPayController(http.Controller):
    _return_url = "/payment/vnpay/return"
    _query_url = "/payment/vnpay/query"
    # Get the IPN URL from the payment provider configuration.
    _ipn_url = "/payment/vnpay/webhook"

    @http.route(
        "/payment/vnpay/create_invoice",
        type='json', auth='user',
    )
    def process_successful_payment(self, **params):
        # Tạo hóa đơn
        product = request.env['product.template'].search(
            [("id", "=", params['product_id'])], limit=1)

        # invoice = self._create_invoice(
        #     params['amount'], params['partner_id'], product.id, params['reference'])

        # # Tạo giao dịch thanh toán
        transaction = self._create_transaction(
            params['amount'], params['partner_id'], params['reference'])

        # # Xác nhận hóa đơn
        # invoice.action_post()

        # Đánh dấu hóa đơn là đã thanh toán
        # self._mark_invoice_as_paid(invoice, transaction)
        _logger.info({
            # 'invoice_id': invoice.id,
            'transaction_id': transaction.id
        }
        )
        return {
            # 'invoice_id': invoice.id,
            'transaction_id': transaction.id
        }

    def _create_invoice(self, amount, partner_id, reference, product_id):
        invoice_obj = request.env['account.move']
        invoice_vals = {
            'partner_id': partner_id,
            'move_type': 'out_invoice',
            'payment_reference': reference,
            'invoice_line_ids': [(0, 0, {
                'name': 'Payment for ' + reference,
                'quantity': 1,
                'price_unit': amount,
                'product_id': product_id,
            })],
        }
        invoice = invoice_obj.create(invoice_vals)
        return invoice

    def _create_transaction(self, amount, partner_id, reference):
        transaction_obj = request.env['payment.transaction']
        payment_method_obj = request.env['payment.method']
        payment_provider_obj = request.env['payment.provider']
        currency_obj = request.env['res.currency']
        payment_method = payment_method_obj.search([("code","=","vnpay")])
        payment_provider =  payment_provider_obj.search([("code","=","vnpay")])
        currency =  currency_obj.search([("name","=","VND")])
        _logger.info(payment_provider)
        transaction_vals = {
            'amount': amount,
            'partner_id': partner_id,
            'reference': reference,
            'payment_method_id': payment_method.id,
            'provider_id': payment_provider.id,
            'currency_id': currency.id,
            'state': 'done',
        }
        transaction = transaction_obj.create(transaction_vals)
        return transaction

    def _mark_invoice_as_paid(self, invoice, transaction):
        journal = request.env['account.journal'].search(
            [('type', '=', 'bank')], limit=1)
        payment_method = request.env['account.payment.method'].search(
            [('code', '=', 'electronic')], limit=1)

        payment = request.env['account.payment'].create({
            'payment_type': 'inbound',
            'partner_type': 'customer',
            'partner_id': invoice.partner_id.id,
            'amount': invoice.amount_total,
            'journal_id': journal.id,
            'payment_method_id': payment_method.id,
            'ref': transaction.reference,
        })
        payment.action_post()

        # Đối chiếu thanh toán với hóa đơn
        lines_to_reconcile = (payment.line_ids + invoice.line_ids).filtered(
            lambda line: line.account_id.internal_type in ('receivable', 'payable'))
        lines_to_reconcile.reconcile()

    @staticmethod
    def __hmacsha512(key, data):
        """Generate a HMAC SHA512 hash"""
        byteKey = key.encode("utf-8")
        byteData = data.encode("utf-8")
        return hmac.new(byteKey, byteData, hashlib.sha512).hexdigest()

    def validate_response(self, params, secret_key, vnp_SecureHash):
        # Remove hash params
        if 'vnp_SecureHash' in params.keys():
            params.pop('vnp_SecureHash')

        if 'vnp_SecureHashType' in params.keys():
            params.pop('vnp_SecureHashType')

        inputData = sorted(params.items())
        hasData = ''
        seq = 0
        for key, val in inputData:
            if str(key).startswith('vnp_'):
                if seq == 1:
                    hasData = hasData + "&" + \
                        str(key) + '=' + urllib.parse.quote_plus(str(val))
                else:
                    seq = 1
                    hasData = str(key) + '=' + \
                        urllib.parse.quote_plus(str(val))
        hashValue = self.__hmacsha512(secret_key, hasData)

        return vnp_SecureHash == hashValue

    def get_response_message(self, response_code):
        error_messages = {
            "07": "Trừ tiền thành công. Giao dịch bị nghi ngờ (liên quan tới lừa đảo, giao dịch bất thường).",
            "09": "Giao dịch không thành công do: Thẻ/Tài khoản của khách hàng chưa đăng ký dịch vụ InternetBanking tại ngân hàng.",
            "10": "Giao dịch không thành công do: Khách hàng xác thực thông tin thẻ/tài khoản không đúng quá 3 lần",
            "11": "Giao dịch không thành công do: Đã hết hạn chờ thanh toán. Xin quý khách vui lòng thực hiện lại giao dịch.",
            "12": "Giao dịch không thành công do: Thẻ/Tài khoản của khách hàng bị khóa.",
            "13": "Giao dịch không thành công do Quý khách nhập sai mật khẩu xác thực giao dịch (OTP). Xin quý khách vui lòng thực hiện lại giao dịch.",
            "24": "Giao dịch không thành công do: Khách hàng hủy giao dịch",
            "51": "Giao dịch không thành công do: Tài khoản của quý khách không đủ số dư để thực hiện giao dịch.",
            "65": "Giao dịch không thành công do: Tài khoản của Quý khách đã vượt quá hạn mức giao dịch trong ngày.",
            "75": "Ngân hàng thanh toán đang bảo trì.",
            "79": "Giao dịch không thành công do: KH nhập sai mật khẩu thanh toán quá số lần quy định. Xin quý khách vui lòng thực hiện lại giao dịch"
        }
        return error_messages.get(response_code, "Giao dịch không thành công. Vui lòng liên hệ với ngân hàng để biết thêm chi tiết.")

    def _generate_payment_return_html(self, data):
        response_code = data.get('vnp_ResponseCode', '')
        result = "Không thành công"
        if response_code == "00":
            result_class = "success"
            result = "Giao dịch thành công"
        else:
            result_class = "error"
            result = self.get_response_message(response_code)

        bank_code = f"<li><strong>Ngân hàng:</strong> {data.get('vnp_BankCode', '')}</li>" if data.get(
            'vnp_BankCode') else ''
        card_type = f"<li><strong>Loại thẻ:</strong> {data.get('vnp_CardType', '')}</li>" if data.get(
            'vnp_CardType') else ''

        html_content = f"""
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Kết quả thanh toán</title>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    background-color: #f0f2f5;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                }}
                .container {{
                    background-color: white;
                    padding: 30px;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                    text-align: center;
                    max-width: 80%;
                }}
                h2 {{
                    color: #4267B2;
                    margin-bottom: 20px;
                }}
                .result {{
                    font-size: 1.2em;
                    font-weight: bold;
                    margin-bottom: 20px;
                }}
                .success {{
                    color: #28a745;
                }}
                .error {{
                    color: #dc3545;
                }}
                ul {{
                    list-style-type: none;
                    padding: 0;
                    text-align: left;
                }}
                li {{
                    margin-bottom: 10px;
                }}
                .close-button {{
                    background-color: #4267B2;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    font-size: 16px;
                    cursor: pointer;
                    transition: background-color 0.3s;
                    margin-top: 20px;
                }}
                .close-button:hover {{
                    background-color: #365899;
                }}
                .close-button:focus {{
                    outline: none;
                    box-shadow: 0 0 0 2px rgba(66, 103, 178, 0.5);
                }}
            </style>
            <script>
               window.onload = function() {{
                    window.opener.postMessage({json.dumps(data)},'*');
                    document.getElementById('closeButton').focus();
                }}
                function closeWindow() {{
                    window.close();
                }}
            </script>
        </head>
        <body>
            <div class="container">
                <h2>KẾT QUẢ THANH TOÁN</h2>
                <div class="result {result_class}">{result}</div>
                <ul>
                    <li><strong>Mã đơn hàng:</strong> {data.get('order_id', '')}</li>
                    <li><strong>Số tiền:</strong> {data.get('vnp_Amount', '0'):,.0f} VND</li>
                    <li><strong>Nội dung thanh toán:</strong> {data.get('order_desc', '')}</li>
                    {bank_code}
                    {card_type}
                </ul>
                <button id="closeButton" class="close-button" onclick="closeWindow()">Đóng</button>
            </div>
        </body>
        </html>
        """
        return html_content

    @http.route(
        _return_url,
        type="http",
        methods=["GET"],
        auth="public",
        csrf=False,
        saveSession=False,  # No need to save the session
    )
    def vnpay_return_from_checkout(self, **inputData):
        data = {"type": "PAYMENT"}
        if inputData:
            """No need to handle the data from the return URL because the IPN already handled it."""
            order_id = inputData['vnp_TxnRef']
            vnp_ResponseCode = inputData['vnp_ResponseCode']
            order_desc = inputData['vnp_OrderInfo']
            vnp_TransactionNo = inputData['vnp_TransactionNo']
            vnp_TmnCode = inputData['vnp_TmnCode']
            vnp_PayDate = inputData['vnp_PayDate']
            vnp_BankCode = inputData['vnp_BankCode']
            vnp_CardType = inputData['vnp_CardType']
            if self.validate_response(inputData, "P2HEYQZRPQYPTHLZ1S8T9VBW74AD4ICL", inputData['vnp_SecureHash']):
                if vnp_ResponseCode == "00":
                    vnp_Amount = int(inputData['vnp_Amount'])/100
                    data.update({"title": "Kết quả thanh toán",
                                 "result": "Thành công", "order_id": order_id,
                                 "vnp_Amount": vnp_Amount,
                                 "order_desc": order_desc,
                                 "vnp_CardType": vnp_CardType,
                                 "vnp_BankCode": vnp_BankCode,
                                 "vnp_TransactionNo": vnp_TransactionNo,
                                 "vnp_ResponseCode": vnp_ResponseCode})
                else:
                    vnp_Amount = 0
                    data.update({"title": "Kết quả thanh toán",
                                 "result": "Lỗi", "order_id": order_id,
                                 "vnp_Amount": vnp_Amount,
                                 "vnp_CardType": vnp_CardType,
                                 "vnp_BankCode": vnp_BankCode,
                                 "order_desc": order_desc,
                                 "vnp_TransactionNo": vnp_TransactionNo,
                                 "vnp_ResponseCode": vnp_ResponseCode})
            else:
                vnp_Amount = 0
                data = data.update({"title": "Kết quả thanh toán", "result": "Lỗi", "order_id": order_id, "vnp_Amount": vnp_Amount,
                                   "order_desc": order_desc, "vnp_TransactionNo": vnp_TransactionNo,
                                    "vnp_ResponseCode": vnp_ResponseCode, "msg": "Sai checksum"})

        else:
            data = {"title": "Kết quả thanh toán", "result": ""}

        return self._generate_payment_return_html(data)

    @http.route(
        _ipn_url,
        type="http",
        auth="public",
        methods=["GET"],
        csrf=False,
        saveSession=False,  # No need to save the session
    )
    def vnpay_webhook(self, **data):
        """Process the notification data (IPN) sent by VNPay to the webhook.

        The "Instant Payment Notification" is a classical webhook notification.

        :param dict data: The notification data
        :return: The response to give to VNPay and acknowledge the notification
        """
        ip_address = request.httprequest.environ.get("REMOTE_ADDR")
        _logger.info(
            "notification received from VNPay with data:\n%s\nFrom IP: %s",
            pprint.pformat(data),
            ip_address,
        )

        # white_list_ip = (
        #     request.env["payment.provider"]
        #     .sudo()
        #     .search([("code", "=", "vnpay")], limit=1)
        #     .vnpay_white_list_ip
        # )

        # # Convert the white list IP to a list of IPs.
        # white_list_ip = white_list_ip = white_list_ip.replace(
        #     " ", "").split(";")

        # if ip_address not in white_list_ip:
        #     _logger.warning(
        #         "Received notification from an unauthorized IP address: %s", ip_address
        #     )
        #     # Not handling the unauthorized notification data.
        #     return

        # try:
        #     tx_sudo = (
        #         request.env["payment.transaction"]
        #         .sudo()
        #         ._get_tx_from_notification_data("vnpay", data)
        #     )
        #     # Verify the signature of the notification data.
        #     self._verify_notification_signature(data, tx_sudo)

        #     # Handle the notification data
        #     tx_sudo._handle_notification_data("vnpay", data)

        #     # Check if the transaction has already been processed.
        #     if tx_sudo.state in ["done", "cancel", "error"]:
        #         _logger.warning(
        #             "Received notification for already processed transaction. Aborting."
        #         )
        #         # Return VNPAY: Already update
        #         return request.make_json_response(
        #             {"RspCode": "02", "Message": "Order already confirmed"}
        #         )

        #     responseCode = data.get("vnp_ResponseCode")

        #     if responseCode == "00":
        #         # Confirm the transaction if the payment was successful.
        #         _logger.info(
        #             "Received successful payment notification from VNPay, saving."
        #         )
        #         tx_sudo._set_done()
        #         _logger.info("Payment transaction completed.")
        #     elif responseCode == "24":
        #         # Cancel the transaction if the payment was canceled by the user.
        #         _logger.warning(
        #             "Received canceled payment notification from VNPay, canceling."
        #         )
        #         tx_sudo._set_canceled(
        #             state_message=_("The customer canceled the payment.")
        #         )
        #         _logger.info("Payment transaction canceled.")
        #     else:
        #         # Notify the user that the payment failed.
        #         _logger.warning(
        #             "Received payment notification from VNPay with invalid response code: %s",
        #             responseCode,
        #         )
        #         tx_sudo._set_error(
        #             "VNPay: "
        #             + _("Received data with invalid response code: %s", responseCode)
        #         )
        #         _logger.info("Payment transaction failed.")
        #     # Return VNPAY: Merchant update success
        #     return request.make_json_response(
        #         {"RspCode": "00", "Message": "Confirm Success"}
        #     )

        # except Forbidden:
        #     _logger.warning(
        #         "Forbidden error during signature verification. Aborting.",
        #         exc_info=True,
        #     )
        #     retry_count = tx_sudo.vnpay_retry_count

        #     if retry_count < 10:
        #         tx_sudo._set_pending(
        #             state_message=_("Invalid checksum in VNPay response.")
        #         )
        #         # Increment the retry count.
        #         tx_sudo.vnpay_retry_count = retry_count + 1
        #     else:
        #         tx_sudo._set_error(
        #             state_message=_("Invalid checksum in VNPay response.")
        #         )

        #     # Return VNPAY: Invalid Signature
        #     return request.make_json_response(
        #         {"RspCode": "97", "Message": "Invalid Checksum"}
        #     )

        # except AssertionError:
        #     _logger.warning(
        #         "Assertion error during notification handling. Aborting.",
        #         exc_info=True,
        #     )

        #     if retry_count < 10:
        #         tx_sudo._set_pending(
        #             state_message=_("Invalid amount in VNPay response.")
        #         )
        #         # Increment the retry count.
        #         tx_sudo.vnpay_retry_count = retry_count + 1
        #     else:
        #         tx_sudo._set_error(state_message=_(
        #             "Invalid amount in VNPay response."))

        #     # Return VNPAY: Invalid amount
        #     return request.make_json_response(
        #         {"RspCode": "04", "Message": "invalid amount"}
        #     )

        # except ValidationError:
        #     _logger.warning(
        #         "Validation error during notification handling. Aborting.",
        #         exc_info=True,
        #     )

        #     # Return VNPAY: Order Not Found
        #     return request.make_json_response(
        #         {"RspCode": "01", "Message": "Order Not Found"}
        #     )

        # except Exception as e:
        #     _logger.error(
        #         "Internal server error. Aborting.",
        #         exc_info=True,
        #     )

        #     # Return VNPAY: Internal server error
        #     return request.make_json_response(
        #         {"RspCode": "99", "Message": f"Internal server error: {e}"}
        #     )

    @staticmethod
    def _verify_notification_signature(data, tx_sudo):
        """Check that the received signature matches the expected one.
        * The signature in the payment link and the signature in the notification data are different.

        :param dict received_signature: The signature received with the notification data.
        :param recordset tx_sudo: The sudoed transaction referenced by the notification data, as a
                                    `payment.transaction` record.

        :return: None
        :raise Forbidden: If the signatures don't match.
        """
        # Check if data is empty.
        if not data:
            _logger.warning("Received notification with missing data.")
            raise Forbidden()

        receive_signature = data.get("vnp_SecureHash")

        # Remove the signature from the data to verify.
        if data.get("vnp_SecureHash"):
            data.pop("vnp_SecureHash")
        if data.get("vnp_SecureHashType"):
            data.pop("vnp_SecureHashType")

        # Sort the data by key to generate the expected signature.
        inputData = sorted(data.items())
        hasData = ""
        seq = 0
        for key, val in inputData:
            if str(key).startswith("vnp_"):
                if seq == 1:
                    hasData = (
                        hasData
                        + "&"
                        + str(key)
                        + "="
                        + urllib.parse.quote_plus(str(val))
                    )
                else:
                    seq = 1
                    hasData = str(key) + "=" + \
                        urllib.parse.quote_plus(str(val))

        # Generate the expected signature.
        expected_signature = VNPayController.__hmacsha512(
            tx_sudo.provider_id.vnpay_hash_secret, hasData
        )

        # Compare the received signature with the expected signature.
        if not hmac.compare_digest(receive_signature, expected_signature):
            _logger.warning("Received notification with invalid signature.")
            raise Forbidden()
