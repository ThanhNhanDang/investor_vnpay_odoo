
import logging
from odoo import _, api, fields, models
from odoo.addons.payment import utils as payment_utils
from odoo.addons.investor_vnpay_odoo import const
from io import BytesIO
from odoo.addons.investor_vnpay_odoo.controllers.payment import VNPayController

_logger = logging.getLogger(__name__)

class PaymentTransactionVNPay(models.Model):
    _inherit = "payment.transaction"
    qrTrace = fields.Char(
        string="VNPay Website Code (TmnCode)", required_if_provider="vnpay"
    )