import logging
from odoo import fields, models,api
_logger = logging.getLogger(__name__)

class ContactInherit(models.Model):
    _inherit = 'res.partner'
    
    
    def write(self, vals):
        _logger.info(vals)

        # Code before write: 'self' has the old values
        if vals.get("crypto_wallet", 0) != 0:
            vals["crypto_wallet"] = self.crypto_wallet + \
                int(vals.get("crypto_wallet"))
        record = super(ContactInherit, self).write(vals)
        # Code after write: can use 'self' with the updated
        # values
        return record
