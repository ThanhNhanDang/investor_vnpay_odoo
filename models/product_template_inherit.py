from odoo import api, fields, models, http, exceptions
import logging
_logger = logging.getLogger(__name__)

class ProductTemplate(models.Model):
    _inherit = 'product.template'
    color_background = fields.Char(string="Màu nền gói tiền")
    
    @api.onchange('list_price')
    def _onchange_list_price(self):
        if self.isPacketMoney:
            self.name = str(self.list_price) + " " + self.currency_id.name
            
    @api.onchange('currency_id')
    def _onchange_currency_id(self):
        if self.isPacketMoney:
            self.name = str(self.list_price) + " " + self.currency_id.name
            
    @api.model
    def create(self, vals):
        new_record = super(ProductTemplate, self).create(vals)
        if vals.get("isPacketMoney", False):
            list_price = vals['list_price']
            vals = {}
            vals['type'] = 'service'
            vals["detailed_type"] = "service"
            vals['name']= str(list_price) + " " + new_record.currency_id.name
            new_record.write(vals)
        return new_record
    
    @api.model
    def write(self, vals):
        new_record = super(ProductTemplate, self).write(vals)
        return new_record

    def _action_show(self):
        view_form_id = self.env.ref(
            'investor_vnpay_odoo.product_view_form_packet_money').id
        view_kanban_id = self.env.ref(
            'investor_vnpay_odoo.product_view_form_packet_money_kanban').id
        action = {
            'type': 'ir.actions.act_window',
            'res_model': 'product.template',
        }
        action.update({
            'name': "Thêm gói nạp tiền",
            'view_mode': 'kanban,form',
            'views': [[view_kanban_id, 'kanban'], [view_form_id, 'form']],
            'domain': [("isPacketMoney", "=", True)],
            'context': {'create': True, 'default_isPacketMoney': True, "default_currency_id": self.env.company.currency_id.id,'default_connect_coffee_company_id':self.env.company.id,'default_list_price': 10000},
            'target': 'current',
        })
        return action
