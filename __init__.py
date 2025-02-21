# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models
from . import controllers
import logging

from odoo.addons.payment import setup_provider, reset_payment_provider

_logger = logging.getLogger(__name__)


# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import os

from . import controllers
from . import models

from odoo.addons.payment import setup_provider, reset_payment_provider

# Define a function to be called when the module is uninstalled
def uninstall_hook(env):
    reset_payment_provider(env, "vnpay")
    
