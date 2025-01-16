from odoo import api, fields, models, http, exceptions
import logging
_logger = logging.getLogger(__name__)

class ProductTemplate(models.Model):
    _inherit = 'product.template'
    color_background = fields.Char(string="Màu nền gói tiền")
