


from werkzeug import urls
from datetime import datetime, timedelta
import logging
from markupsafe import escape
from odoo import _, api, fields, models
_logger = logging.getLogger(__name__)
from odoo.exceptions import ValidationError

class StockInventoryAdjustmentName(models.TransientModel):
    _inherit = 'stock.inventory.adjustment.name'

    def action_apply(self):
        ctx = dict(self.env.context or {})
        quants = self.quant_ids.filtered('inventory_quantity_set')
        if ctx.get('pos_session_id',False):
            pos_session = self.env['pos.session'].browse(ctx.get('pos_session_id'))
            if ctx['is_device']:
                if ctx['is_open']:
                    pos_session.write({'isCheckDeviceOpen':True})
                else: 
                    pos_session.write({'isCheckDeviceClose':True})
            else:
                if ctx['is_open']:
                    pos_session.write({'isCheckInventoryOpen':True})
                else: 
                    pos_session.write({'isCheckInventoryClose':True})
                    
        return quants.with_context(inventory_name=self.inventory_adjustment_name).action_apply_inventory()


class StockQuant(models.Model):
    _inherit = "stock.quant"
    is_device = fields.Boolean(
        string="Thiết bị", store=True
    )
    is_device_work = fields.Boolean(
        string="Hoạt động", default=True
    )
    note_device = fields.Char(
        string="Ghi Chú"
    )
    inventory_quantity = fields.Float(
        'Counted Quantity', digits='Product Unit of Measure',
        help="The product's counted quantity.", required=True)
    def action_apply_all_custom(self):
        quant_ids = self.env['stock.quant'].search(self.env.context['active_domain'])
        # Các quant đã có inventory_quantity_set
        all_quant_ids = quant_ids.ids
        # Tìm các quant thiếu inventory_quantity_set hoặc inventory_quantity chưa điền
        ctx = dict(self.env.context or {}, default_quant_ids=all_quant_ids)
        ctx['is_device']
        missing_quants = quant_ids.filtered(
            lambda q: ((not q.inventory_quantity_set or not q.inventory_quantity) and (q.is_device == ctx['is_device']))
        )
        
        # Lấy danh sách tên sản phẩm còn thiếu
        missing_product_names = missing_quants.mapped('product_id.name')
        # Log danh sách tên sản phẩm còn thiếu
        if missing_product_names:
            # Tạo thông báo lỗi với mỗi tên sản phẩm trên một dòng mới và có dấu chấm
            error_message = "Các sản phẩm sau chưa kiểm kê:\n" + "\n".join(
                f"- {name}." for name in missing_product_names
            )
            raise ValidationError(error_message)
        view = self.env.ref('stock.stock_inventory_adjustment_name_form_view', False)
        return {
            'name': _('Inventory Adjustment Reference / Reason'),
            'type': 'ir.actions.act_window',
            'views': [(view.id, 'form')],
            'res_model': 'stock.inventory.adjustment.name',
            'target': 'new',
            'context': ctx,
        }
    
    def write(self, vals):
        record = super(StockQuant, self).write(vals)
        return record
    def create(self, vals):
        _logger.info(f"vals: {vals}")
        record = super(StockQuant, self).create(vals)
        if record.product_id.is_device:
            record.write({'is_device':True})  
        return record
    
              
    
    @api.model
    def _get_inventory_fields_write(self):
        """ Returns a list of fields user can edit when he want to edit a quant in `inventory_mode`.
        """
        fields = ['inventory_quantity', 'inventory_quantity_auto_apply', 'inventory_diff_quantity',
                  'inventory_date', 'user_id', 'inventory_quantity_set', 'is_outdated', 'lot_id',
                  'location_id', 'package_id', "is_device", "is_device_work", "note_device"]
        return fields
    
    
    @api.model
    def action_view_inventory_custom(self, pos_session_id, is_device, is_open = True):
        """ Similar to _get_quants_action except specific for inventory adjustments (i.e. inventory counts). """
        self = self._set_view_context()
        if not self.env['ir.config_parameter'].sudo().get_param('stock.skip_quant_tasks'):
            self._quant_tasks()

        ctx = dict(self.env.context or {})
        ctx['no_at_date'] = True
        ctx['pos_session_id'] = pos_session_id
        ctx['is_device'] = is_device
        ctx['is_open'] = is_open
        if self.env.user.has_group('stock.group_stock_user') and not self.env.user.has_group('stock.group_stock_manager'):
            ctx['search_default_my_count'] = True
        view_id = self.env.ref('investor_vnpay_odoo.custom_view_stock_quant_tree_inventory_editable').id
        action = {
            'name': _("Kiểm kê thiết bị") if is_device else _('Kiểm kê tồn kho'),
            'view_mode': 'list',
            'res_model': 'stock.quant',
            'type': 'ir.actions.act_window',
            'context': ctx,
            'domain': [('location_id.usage', 'in', ['internal', 'transit']),('is_device','=', is_device)],
            'views': [(view_id, 'list')],
            'help':'Kho của bạn trống. Nhấn nút "Mới" để xác định số lượng sản phẩm trong kho của bạn hoặc nhập số lượng từ bảng tính thông qua menu Hành động',
        }
        return action
    