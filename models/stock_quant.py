


from werkzeug import urls
from datetime import datetime, timedelta
import logging
from markupsafe import escape
from odoo import _, api, fields, models
_logger = logging.getLogger(__name__)
from odoo.exceptions import ValidationError
from odoo.tools.float_utils import float_compare, float_is_zero

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
        help="The product's counted quantity.")
    def action_apply_all_custom(self):
        quant_ids = self.env['stock.quant'].search(self.env.context['active_domain'])
        # Các quant đã có inventory_quantity_set
        all_quant_ids = quant_ids.ids
        # Tìm các quant thiếu inventory_quantity_set hoặc inventory_quantity chưa điền
        ctx = dict(self.env.context or {}, default_quant_ids=all_quant_ids)
        ctx['is_device']
        missing_quants = quant_ids.filtered(
            lambda q: ((not q.inventory_quantity_set) and (q.is_device == ctx['is_device']))
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
    def _quant_tasks(self):
        self._merge_quants()
        self._clean_reservations()

    
    @api.model
    def _clean_reservations(self):
        reserved_quants = self.env['stock.quant']._read_group(
            [('reserved_quantity', '!=', 0)],
            ['product_id', 'location_id', 'lot_id', 'package_id', 'owner_id'],
            ['reserved_quantity:sum', 'id:recordset'],
        )
        reserved_move_lines = self.env['stock.move.line']._read_group(
            [
                ('state', 'in', ['assigned', 'partially_available', 'waiting', 'confirmed']),
                ('quantity_product_uom', '!=', 0),
                ('product_id.is_storable', '=', True),
            ],
            ['product_id', 'location_id', 'lot_id', 'package_id', 'owner_id'],
            ['quantity_product_uom:sum'],
        )
        reserved_move_lines = {
            (product, location, lot, package, owner): reserved_quantity
            for product, location, lot, package, owner, reserved_quantity in reserved_move_lines
        }
        for product, location, lot, package, owner, reserved_quantity, quants in reserved_quants:
            ml_reserved_qty = reserved_move_lines.get((product, location, lot, package, owner), 0)
            if location.should_bypass_reservation():
                quants._update_reserved_quantity(product, location, -reserved_quantity, lot_id=lot, package_id=package, owner_id=owner)
            elif float_compare(reserved_quantity, ml_reserved_qty, precision_rounding=product.uom_id.rounding) != 0:
                quants._update_reserved_quantity(product, location, ml_reserved_qty - reserved_quantity, lot_id=lot, package_id=package, owner_id=owner)
            if ml_reserved_qty:
                del reserved_move_lines[(product, location, lot, package, owner)]

        for (product, location, lot, package, owner), reserved_quantity in reserved_move_lines.items():
            if location.should_bypass_reservation() or\
                self.env['stock.quant']._should_bypass_product(product, location, reserved_quantity, lot, package, owner):
                continue
            else:
                self.env['stock.quant']._update_reserved_quantity(product, location, reserved_quantity, lot_id=lot, package_id=package, owner_id=owner)
    @api.model
    def action_view_inventory_custom(self, pos_session_id, is_device, is_open=True):
        # Step 1: Get storable product templates
        product_templates = self.env['product.template'].search([('is_storable', '=', True)])

        # Step 2: Get corresponding product variants
        product_variants = self.env['product.product'].search([('product_tmpl_id', 'in', product_templates.ids)])

        # Step 3: Get existing stock quants for these products
        stock_quants = self.env['stock.quant'].search([('product_id', 'in', product_variants.ids)])

        # Step 4: Create stock quantities for products without quants
        products_with_quants = stock_quants.mapped('product_id')
        products_without_quants = product_variants - products_with_quants

        # Step 5: Create stock quants for products without quants
        if products_without_quants:
            default_location = self.env['stock.location'].search([('usage', '=', 'internal')], limit=1)
            if default_location:
                for product in products_without_quants:
                    change_product_qty = self.env['stock.change.product.qty'].create({
                        'product_id': product.id,
                        'product_tmpl_id': product.product_tmpl_id.id,  # Correctly reference product template
                        'new_quantity': 0.0,  # Initial quantity set to 0
                    })
                    change_product_qty.change_product_qty()

        # Step 6: Delete stock quants for products without valid storable product templates
        quants_to_delete = stock_quants.filtered(
            lambda q: q.product_id.product_tmpl_id not in product_templates
        )
        if quants_to_delete:
            quants_to_delete.unlink()
        
        # Step 7: Prepare and return the inventory action
        ctx = dict(self.env.context or {})
        ctx['no_at_date'] = True
        ctx['pos_session_id'] = pos_session_id
        ctx['is_device'] = is_device
        ctx['is_open'] = is_open
        ctx['inventory_mode'] = True
        if self.env.user.has_group('stock.group_stock_user') and not self.env.user.has_group('stock.group_stock_manager'):
            ctx['search_default_my_count'] = True

        view_id = self.env.ref('investor_vnpay_odoo.custom_view_stock_quant_tree_inventory_editable').id
        action = {
            'name': _("Kiểm kê thiết bị") if is_device else _('Kiểm kê tồn kho'),
            'view_mode': 'list',
            'res_model': 'stock.quant',
            'type': 'ir.actions.act_window',
            'context': ctx,
            'domain': [('location_id.usage', 'in', ['internal', 'transit']), ('is_device', '=', is_device)],
            'views': [(view_id, 'list')],
            'help': 'Kho của bạn trống.',
        }
        return action