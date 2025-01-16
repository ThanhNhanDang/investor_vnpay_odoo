{
    # Tên module
    'name': 'Investor VNPay Odoo 17.0',
    'version': '1.0',

    # Loại module
    'category': 'Investor VNPay',
    
    # Độ ưu tiên module trong list module
    # Số càng nhỏ, độ ưu tiên càng cao
    #### Chấp nhận số âm
    'sequence': 0,

    # Mô tả module
    'summary': 'Module này để cho các nhà đầu tư nạp tiền vào với nhà cung cấp VNPay',
    'description': '',
    'depends': ["base","product", "investor", "payment"],
    'installable': True,
    'auto_install': True,
    'application': True,
    'data': [
        "views/menu_item.xml",
        "views/payment_vnpay_view.xml",
        "views/payment_vnpay_template.xml",
        "data/payment_method_data.xml",
        "data/payment_provider_data.xml",
    ],


    'assets': {
        'web.assets_backend':
        [
            'investor_vnpay_odoo/static/src/js/*.js',
            'investor_vnpay_odoo/static/src/xml/*.xml',
        ]
    },
    'license': 'LGPL-3',
}
