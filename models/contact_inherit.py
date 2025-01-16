import logging
from odoo import fields, models,api
_logger = logging.getLogger(__name__)

class ContactInherit(models.Model):
    _inherit = 'res.partner'

