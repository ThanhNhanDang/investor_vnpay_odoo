{
    # Tên module
    'name': 'Investor VNPay Odoo',
    'version': '1.0',

    # Loại module
    'category': 'Investor VNPay',
    "author": "Đặng Thành Nhân",
    
    # Độ ưu tiên module trong list module
    # Số càng nhỏ, độ ưu tiên càng cao
    #### Chấp nhận số âm
    'sequence': 0,

    # Mô tả module
    'summary': 'Module này để cho các nhà đầu tư nạp tiền vào với nhà cung cấp VNPay, và thanh toán bằng VNPay',
    'description': '',
    # 'depends': ["base","product", "investor", "payment"],
    'depends': ["base","product", "payment", "point_of_sale"],
    'installable': True,
    'auto_install': True,
    'application': True,
    'data': [
        "views/menu_item.xml",
        "views/payment_vnpay_view.xml",
        "views/payment_vnpay_template.xml",
        "data/payment_method_data.xml",
        "data/payment_provider_data.xml",
        "data/pos_payment_method.xml"
    ],

    'assets': {
        'web.assets_backend':
        [
            'investor_vnpay_odoo/static/src/js/*.js',
            'investor_vnpay_odoo/static/src/xml/*.xml',
        ],
        "point_of_sale.assets_prod": [
            'investor_vnpay_odoo/static/src/online_payment_popup/**/*',
        ],
    },
    'license': 'LGPL-3',
}
