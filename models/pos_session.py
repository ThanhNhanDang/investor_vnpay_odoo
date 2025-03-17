
from werkzeug import urls
from datetime import datetime, timedelta
import logging

from odoo import _, api, fields, models
_logger = logging.getLogger(__name__)
from odoo.exceptions import ValidationError

class PosSession(models.Model):
    _inherit = "pos.session"
    
    isCheckInventoryClose = fields.Boolean(
        string="Kiểm tồn kho"
    )
    isCheckDeviceClose = fields.Boolean(
        string="Kiểm tra thiết bị"
    )
    isCheckInventoryOpen = fields.Boolean(
        string="Kiểm tồn kho"
    )
    isCheckDeviceOpen = fields.Boolean(
        string="Kiểm tra thiết bị"
    )
    def write(self, vals):
        _logger.info(vals)
                
        record = super(PosSession, self).write(vals)
        return record
