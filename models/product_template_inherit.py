from odoo import api, fields, models, http, exceptions
import logging
_logger = logging.getLogger(__name__)


class ProductTemplate(models.Model):
    _inherit = 'product.template'
    color_background = fields.Char(string="Màu nền gói tiền")
    is_device = fields.Boolean(string="Thiết bị POS")

    def create(self, vals_list):
        res = super(ProductTemplate, self).create(vals_list)
        if res.is_storable:
            default_product_id = self.env.context.get('default_product_id', len(
                res.product_variant_ids) == 1 and res.product_variant_id.id)
            change_product_qty = self.env['stock.change.product.qty'].create({
                'product_id': default_product_id,
                'product_tmpl_id': res.id,
                'new_quantity': 1
            })
            change_product_qty.change_product_qty()
        return res
        
