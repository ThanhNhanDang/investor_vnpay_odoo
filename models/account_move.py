from odoo import models, _, api, tools
import psycopg2
from odoo.exceptions import ValidationError

import logging  # Nhập thư viện logging để ghi lại thông tin và lỗi
_logger = logging.getLogger(__name__)  # Tạo logger để ghi lại thông tin


class AccountMove(models.Model):
    _inherit = 'account.move'
    def create(self, vals_list):
        res = super().create(vals_list)
        return res

class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'
    def create(self, vals_list):
        res = super().create(vals_list)
        return res

class AccountPayment(models.Model):
    _inherit = 'account.payment'
    @api.constrains('payment_method_line_id')
    def _check_payment_method_line_id(self):
        ''' Ensure the 'payment_method_line_id' field is not null.
        Can't be done using the regular 'required=True' because the field is a computed editable stored one.
        '''
        for pay in self:
            if not pay.payment_method_line_id:
                return
            elif pay.payment_method_line_id.journal_id and pay.payment_method_line_id.journal_id != pay.journal_id:
                raise ValidationError(_("The selected payment method is not available for this payment, please select the payment method again."))
