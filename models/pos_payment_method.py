import logging

import hmac
import hashlib
import urllib.parse

from odoo import _, api, fields, models

_logger = logging.getLogger(__name__)

class POSVNPayPaymentMethod(models.Model):
    _inherit = "pos.payment.method"
    is_online_payment = fields.Boolean(
        string="Online Payment", help="Use this payment method for online payments (payments made on a web page with online payment providers)", default=False)
    online_payment_provider_ids = fields.Many2many(
        'payment.provider', string="Allowed Providers", domain="[('is_published', '=', True), ('state', 'in', ['enabled', 'test'])]")
    has_an_online_payment_provider = fields.Boolean(
        compute='_compute_has_an_online_payment_provider', readonly=True)
    type = fields.Selection(selection_add=[('online', 'Online')])

    is_online_payment = fields.Boolean(string="Online Payment", help="Use this payment method for online payments (payments made on a web page with online payment providers)", default=False)
    online_payment_provider_ids = fields.Many2many('payment.provider', string="Allowed Providers", domain="[('is_published', '=', True), ('state', 'in', ['enabled', 'test'])]")
    has_an_online_payment_provider = fields.Boolean(compute='_compute_has_an_online_payment_provider', readonly=True)
    type = fields.Selection(selection_add=[('online', 'Online')])
    code = fields.Char(
        string="Code", help="The technical code of this payment method.", readonly=True
    )
