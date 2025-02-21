import logging

import hmac
import hashlib
import urllib.parse

from odoo import _, api, fields, models

_logger = logging.getLogger(__name__)


class POSVNPayPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    code = fields.Char(
        string="Code", help="The technical code of this payment method.", readonly=True
    )
